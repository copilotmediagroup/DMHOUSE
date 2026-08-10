import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
};

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/json',
      },
    },
  );
}

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function sha256Hex(
  value: string,
) {
  const bytes =
    new TextEncoder().encode(
      value,
    );

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      bytes,
    );

  return Array.from(
    new Uint8Array(digest),
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, '0'),
    )
    .join('');
}

Deno.serve(
  async req => {

    if (
      req.method === 'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          headers:
            corsHeaders,
        },
      );
    }

    try {

      if (
        req.method !== 'POST'
      ) {
        return json(
          {
            ok: false,
            error:
              'Method not allowed.',
          },
          405,
        );
      }


      const supabaseUrl =
        Deno.env.get(
          'SUPABASE_URL',
        );

      const supabaseAnonKey =
        Deno.env.get(
          'SUPABASE_ANON_KEY',
        );

      const serviceRoleKey =
        Deno.env.get(
          'SUPABASE_SERVICE_ROLE_KEY',
        );

      const resendKey =
        Deno.env.get(
          'RESEND_API_KEY',
        );

      const appUrl =
        Deno.env.get(
          'APP_URL',
        ) ||
        Deno.env.get(
          'DMH_APP_URL',
        ) ||
        '';

      const emailFrom =
        Deno.env.get(
          'DMH_EMAIL_FROM',
        ) ||
        'Data Market House <sales@debtpaper.com>';


      if (
        !supabaseUrl ||
        !supabaseAnonKey ||
        !serviceRoleKey
      ) {
        throw new Error(
          'Supabase Edge Function environment is incomplete.',
        );
      }

      if (!resendKey) {
        throw new Error(
          'RESEND_API_KEY is not configured.',
        );
      }


      const authHeader =
        req.headers.get(
          'Authorization',
        ) || '';

      if (
        !authHeader.startsWith(
          'Bearer ',
        )
      ) {
        return json(
          {
            ok: false,
            error:
              'Owner authentication is required.',
          },
          401,
        );
      }


      const userClient =
        createClient(
          supabaseUrl,
          supabaseAnonKey,
          {
            global: {
              headers: {
                Authorization:
                  authHeader,
              },
            },
          },
        );

      const {
        data: {
          user,
        },
        error: userError,
      } =
        await userClient
          .auth
          .getUser();

      if (
        userError ||
        !user
      ) {
        return json(
          {
            ok: false,
            error:
              'Owner session is invalid or expired.',
          },
          401,
        );
      }


      const admin =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        );


      const {
        data: owner,
        error: ownerError,
      } =
        await admin
          .from('profiles')
          .select(
            'id,company_id,role,full_name,is_active',
          )
          .eq(
            'id',
            user.id,
          )
          .maybeSingle();

      if (
        ownerError ||
        !owner ||
        owner.role !== 'owner' ||
        owner.is_active !== true
      ) {
        return json(
          {
            ok: false,
            error:
              'Owner access is required.',
          },
          403,
        );
      }


      const body =
        await req.json()
          .catch(
            () => ({}),
          );

      const inviteId =
        String(
          body?.inviteId ||
          '',
        ).trim();

      const inviteToken =
        String(
          body?.inviteToken ||
          '',
        ).trim();

      const suppliedUrl =
        String(
          body?.inviteUrl ||
          '',
        ).trim();


      if (
        !inviteId ||
        !inviteToken
      ) {
        return json(
          {
            ok: false,
            error:
              'inviteId and inviteToken are required.',
          },
          400,
        );
      }


      const {
        data: invite,
        error: inviteError,
      } =
        await admin
          .from(
            'employee_invites',
          )
          .select(
            'id,company_id,email,normalized_email,intended_full_name,token_hash,status,expires_at',
          )
          .eq(
            'id',
            inviteId,
          )
          .eq(
            'company_id',
            owner.company_id,
          )
          .maybeSingle();

      if (
        inviteError ||
        !invite
      ) {
        return json(
          {
            ok: false,
            error:
              'Employee invitation was not found.',
          },
          404,
        );
      }


      if (
        invite.status !==
        'pending'
      ) {
        return json(
          {
            ok: false,
            error:
              'Only pending employee invitations can be emailed.',
          },
          409,
        );
      }


      if (
        new Date(
          invite.expires_at,
        ).getTime() <=
        Date.now()
      ) {
        return json(
          {
            ok: false,
            error:
              'This employee invitation has expired.',
          },
          409,
        );
      }


      const digest =
        await sha256Hex(
          inviteToken,
        );

      const storedHash =
        String(
          invite.token_hash ||
          '',
        )
          .replace(
            /^\\x/i,
            '',
          )
          .toLowerCase();

      if (
        !storedHash ||
        storedHash !== digest
      ) {
        return json(
          {
            ok: false,
            error:
              'Employee invitation token verification failed.',
          },
          403,
        );
      }


      let inviteUrl =
        suppliedUrl;

      if (!inviteUrl) {

        if (!appUrl) {
          throw new Error(
            'APP_URL is not configured and no invitation URL was supplied.',
          );
        }

        inviteUrl =
          `${appUrl.replace(/\/$/, '')}/academy/invite?token=${encodeURIComponent(
            inviteToken,
          )}`;
      }


      const recipient =
        invite.email;

      const fullName =
        String(
          invite.intended_full_name ||
          '',
        ).trim();

      const greeting =
        fullName
          ? `Hello ${escapeHtml(
              fullName,
            )},`
          : 'Hello,';

      const expiration =
        new Date(
          invite.expires_at,
        ).toLocaleString(
          'en-US',
          {
            dateStyle:
              'medium',
            timeStyle:
              'short',
          },
        );


      const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f7fb;padding:36px 16px;">
      <tr>
        <td align="center">

          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e5eaf2;">

            <tr>
              <td style="background:#08101f;padding:30px 34px;">
                <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#60a5fa;font-weight:700;">
                  DATA MARKET HOUSE
                </div>

                <div style="margin-top:8px;font-size:25px;color:#ffffff;font-weight:700;">
                  You're invited to DMHOUSE Academy
                </div>

                <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#94a3b8;">
                  Employee onboarding · Certification · Sales OS access
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:34px;">

                <p style="margin:0 0 18px;font-size:16px;">
                  ${greeting}
                </p>

                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475569;">
                  You have been invited to join Data Market House as an employee candidate.
                  Your first step is to create your secure account and complete DMHOUSE Academy.
                </p>

                <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#475569;">
                  Once your account is established, your Academy enrollment will be connected automatically to this invitation.
                </p>

                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="border-radius:12px;background:#2563eb;">
                      <a
                        href="${escapeHtml(inviteUrl)}"
                        style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;"
                      >
                        Accept Employee Invitation
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:28px;padding:18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
                  <div style="font-size:12px;font-weight:700;color:#475569;">
                    Invitation details
                  </div>

                  <div style="margin-top:8px;font-size:13px;line-height:1.7;color:#64748b;">
                    Email: ${escapeHtml(recipient)}<br>
                    Expires: ${escapeHtml(expiration)}
                  </div>
                </div>

                <p style="margin:26px 0 0;font-size:12px;line-height:1.7;color:#94a3b8;">
                  This invitation is unique to your email address. Do not forward the secure invitation link.
                </p>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
`;


      const text = `
${fullName ? `Hello ${fullName},` : 'Hello,'}

You have been invited to join Data Market House as an employee candidate.

Create your secure account and begin DMHOUSE Academy here:

${inviteUrl}

Invitation email: ${recipient}
Expires: ${expiration}

Do not forward this secure invitation link.
`.trim();


      const resendResponse =
        await fetch(
          'https://api.resend.com/emails',
          {
            method:
              'POST',
            headers: {
              Authorization:
                `Bearer ${resendKey}`,
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                from:
                  emailFrom,
                to: [
                  recipient,
                ],
                subject:
                  'You’re invited to Data Market House',
                html,
                text,
              }),
          },
        );


      const resendResult =
        await resendResponse
          .json()
          .catch(
            () => ({}),
          );


      if (
        !resendResponse.ok
      ) {
        throw new Error(
          resendResult?.message ||
          resendResult?.error?.message ||
          'Resend rejected the employee invitation email.',
        );
      }


      await admin
        .from(
          'academy_events',
        )
        .insert({
          company_id:
            invite.company_id,
          invite_id:
            invite.id,
          actor_id:
            owner.id,
          event_type:
            'employee_invite_emailed',
          metadata: {
            email:
              recipient,
            provider:
              'resend',
            provider_message_id:
              resendResult?.id ||
              null,
            expires_at:
              invite.expires_at,
          },
        });


      return json({
        ok: true,
        inviteId:
          invite.id,
        email:
          recipient,
        provider:
          'resend',
        providerMessageId:
          resendResult?.id ||
          null,
      });

    } catch (error) {

      console.error(
        'send-employee-invite failed:',
        error,
      );

      return json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unable to send employee invitation.',
        },
        500,
      );
    }
  },
);
