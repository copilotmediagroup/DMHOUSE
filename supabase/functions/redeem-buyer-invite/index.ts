import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      ...noStoreHeaders,
      Location: location,
    },
  });
}

function appErrorUrl(baseUrl: string, message: string): string {
  const safeBase = baseUrl ? `${baseUrl}/buyer` : '/buyer';
  const separator = safeBase.includes('?') ? '&' : '?';
  return `${safeBase}${separator}inviteError=${encodeURIComponent(message)}`;
}

Deno.serve(async (req) => {
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');

  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          ...noStoreHeaders,
          'Content-Type': 'application/json',
          Allow: 'GET',
        },
      });
    }

    const token = new URL(req.url).searchParams.get('token')?.trim();
    if (!token) throw new Error('Invitation token is missing.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Buyer invitation service is not configured.');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    );
    const tokenHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const { data: invitation, error: invitationError } = await admin
      .from('buyer_invitations')
      .select(
        'id,buyer_id,expires_at,invalidated_at,redeemed_at,buyer_profiles!inner(user_id,email)',
      )
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (invitationError) {
      console.error('Invitation lookup failed', invitationError);
      throw new Error(invitationError.message || 'Invitation lookup failed.');
    }

    if (!invitation) throw new Error('This invitation is invalid.');
    if (invitation.invalidated_at) {
      throw new Error('This invitation was replaced by a newer invitation.');
    }
    if (invitation.redeemed_at) {
      throw new Error('This invitation has already been used.');
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw new Error('This invitation has expired.');
    }

    const buyerProfile = Array.isArray(invitation.buyer_profiles)
      ? invitation.buyer_profiles[0]
      : invitation.buyer_profiles;
    const buyerEmail = buyerProfile?.email?.trim().toLowerCase();

    if (!buyerEmail) throw new Error('The buyer account has no email address.');
    if (!appUrl) throw new Error('APP_URL is not configured.');

    const buyerPortalUrl = `${appUrl}/buyer?source=buyer-invite`;
    const { data: magicLink, error: magicLinkError } =
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: buyerEmail,
        options: {
          redirectTo: buyerPortalUrl,
        },
      });

    if (magicLinkError || !magicLink?.properties?.action_link) {
      console.error('Magic-link generation failed', magicLinkError);
      throw new Error(
        magicLinkError?.message || 'Unable to create secure Buyer Portal access.',
      );
    }

    // Opening the invitation is not the same as completing authentication.
    // Keep the token valid until the buyer successfully reaches the portal,
    // expires, or is invalidated by a newer invitation.
    const { error: openedError } = await admin
      .from('buyer_invitations')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', invitation.id);

    if (openedError) {
      console.error('Unable to record invitation open', openedError);
      // Do not block portal access only because analytics could not be updated.
    }

    return redirect(magicLink.properties.action_link);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('redeem-buyer-invite failed', { message, error });
    return redirect(appErrorUrl(appUrl, message));
  }
});
