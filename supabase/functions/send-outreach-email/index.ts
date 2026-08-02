import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function decodeBase64Url(value: string) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return new Uint8Array(
    atob(normalized)
      .split('')
      .map((character) => character.charCodeAt(0)),
  );
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function decryptToken(value: string, secret: string) {
  const [ivPart, dataPart] = value.split('.');
  if (!ivPart || !dataPart) throw new Error('Encrypted token is invalid.');

  const keyBytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(secret),
    ),
  );

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64Url(ivPart),
    },
    key,
    decodeBase64Url(dataPart),
  );

  return new TextDecoder().decode(decrypted);
}

async function encryptToken(value: string, secret: string) {
  const keyBytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(secret),
    ),
  );

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(value),
    ),
  );

  const encodeBytes = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  return `${encodeBytes(iv)}.${encodeBytes(encrypted)}`;
}

function sanitizeHeader(value: unknown) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function htmlFromText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\r?\n/g, '<br>');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  let admin: ReturnType<typeof createClient> | null = null;
  let outreachMessageId = '';

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const encryptionSecret = Deno.env.get('EMAIL_TOKEN_ENCRYPTION_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Supabase environment is not configured.');
    }
    if (!clientId || !clientSecret || !encryptionSecret) {
      throw new Error('Google Workspace secrets are incomplete.');
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    admin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized.');

    const payload = await request.json().catch(() => ({}));
    outreachMessageId = sanitizeHeader(payload?.messageId);
    if (!outreachMessageId) throw new Error('messageId is required.');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, company_id, full_name, role, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.is_active) {
      throw new Error('Active company membership required.');
    }

    const { data: message, error: messageError } = await admin
      .from('outreach_messages')
      .select('*')
      .eq('id', outreachMessageId)
      .eq('company_id', profile.company_id)
      .single();

    if (messageError || !message) throw new Error('Outreach message not found.');
    if (message.employee_id !== user.id && profile.role !== 'owner') {
      throw new Error('You cannot send another employee’s message.');
    }
    if (!['queued', 'failed'].includes(message.status)) {
      throw new Error('Message is not available for sending.');
    }

    const { data: connection, error: connectionError } = await admin
      .from('company_email_connections')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('provider', 'google_workspace')
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (
      !connection ||
      connection.status !== 'connected' ||
      !connection.mailbox_email ||
      !connection.encrypted_access_token
    ) {
      throw new Error('Google Workspace is not connected for this company.');
    }

    await admin
      .from('outreach_messages')
      .update({
        status: 'sending',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', message.id);

    let accessToken = await decryptToken(
      connection.encrypted_access_token,
      encryptionSecret,
    );

    const expiresAt = connection.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : 0;

    if (expiresAt <= Date.now() + 60_000) {
      if (!connection.encrypted_refresh_token) {
        throw new Error('Google refresh token is missing. Reconnect the mailbox.');
      }

      const refreshToken = await decryptToken(
        connection.encrypted_refresh_token,
        encryptionSecret,
      );

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const refreshed = await tokenResponse.json();
      if (!tokenResponse.ok || !refreshed.access_token) {
        throw new Error(
          refreshed.error_description ||
            refreshed.error ||
            'Google token refresh failed.',
        );
      }

      accessToken = refreshed.access_token;
      await admin
        .from('company_email_connections')
        .update({
          encrypted_access_token: await encryptToken(
            accessToken,
            encryptionSecret,
          ),
          access_token_expires_at: new Date(
            Date.now() + Number(refreshed.expires_in || 3600) * 1000,
          ).toISOString(),
          last_verified_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', connection.id);
    }

    const { data: conversation } = await admin
      .from('conversations')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('agency_id', message.agency_id)
      .maybeSingle();

    let existingThreadId: string | null = null;
    let previousRfcMessageId: string | null = null;

    if (conversation?.id) {
      const { data: previousMessage } = await admin
        .from('conversation_messages')
        .select('provider_thread_id, rfc_message_id')
        .eq('conversation_id', conversation.id)
        .eq('provider', 'gmail')
        .not('provider_thread_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingThreadId = previousMessage?.provider_thread_id || null;
      previousRfcMessageId = previousMessage?.rfc_message_id || null;
    }

    const mailbox = sanitizeHeader(connection.mailbox_email);
    const senderName = sanitizeHeader(
      profile.full_name || Deno.env.get('OUTREACH_FROM_NAME') || 'Data Market House',
    );
    const recipient = sanitizeHeader(message.recipient);
    const subject = sanitizeHeader(message.subject || 'Data Market House');
    const rfcMessageId = `<dmh-${message.id}@debtpaper.com>`;

    if (!recipient) throw new Error('Recipient email is missing.');

    const mimeHeaders = [
      `From: ${senderName} | Data Market House <${mailbox}>`,
      `To: ${recipient}`,
      `Reply-To: ${mailbox}`,
      `Subject: ${subject}`,
      `Message-ID: ${rfcMessageId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      `X-DMH-Outreach-ID: ${message.id}`,
      `X-DMH-Employee-ID: ${message.employee_id}`,
      `X-DMH-Agency-ID: ${message.agency_id}`,
    ];

    if (previousRfcMessageId) {
      mimeHeaders.push(`In-Reply-To: ${previousRfcMessageId}`);
      mimeHeaders.push(`References: ${previousRfcMessageId}`);
    }

    const mime = [
      ...mimeHeaders,
      '',
      htmlFromText(String(message.body || '')),
    ].join('\r\n');

    const gmailBody: Record<string, string> = {
      raw: encodeBase64Url(mime),
    };
    if (existingThreadId) gmailBody.threadId = existingThreadId;

    const sendResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gmailBody),
      },
    );

    const sendResult = await sendResponse.json();
    if (!sendResponse.ok || !sendResult.id || !sendResult.threadId) {
      throw new Error(
        sendResult.error?.message || 'Gmail rejected the outreach email.',
      );
    }

    const sentAt = new Date().toISOString();

    const { error: updateMessageError } = await admin
      .from('outreach_messages')
      .update({
        status: 'sent',
        provider: 'gmail',
        provider_message_id: sendResult.id,
        provider_thread_id: sendResult.threadId,
        rfc_message_id: rfcMessageId,
        sent_at: sentAt,
        error_message: null,
        updated_at: sentAt,
      })
      .eq('id', message.id);
    if (updateMessageError) throw updateMessageError;

    await admin
      .from('conversation_messages')
      .update({
        from_email: mailbox,
        provider: 'gmail',
        provider_message_id: sendResult.id,
        provider_thread_id: sendResult.threadId,
        rfc_message_id: rfcMessageId,
        raw_payload: {
          gmail_message_id: sendResult.id,
          gmail_thread_id: sendResult.threadId,
          employee_id: message.employee_id,
          agency_id: message.agency_id,
          contact_id: message.contact_id,
          portfolio_id: message.portfolio_id,
        },
      })
      .eq('outreach_message_id', message.id);

    if (conversation?.id) {
      await admin
        .from('conversations')
        .update({
          subject,
          last_message_at: sentAt,
          last_outbound_at: sentAt,
          updated_at: sentAt,
        })
        .eq('id', conversation.id);
    }

    await admin
      .from('company_email_connections')
      .update({ last_verified_at: sentAt, last_error: null })
      .eq('id', connection.id);

    return jsonResponse({
      ok: true,
      provider: 'gmail',
      messageId: sendResult.id,
      threadId: sendResult.threadId,
      mailbox,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Google Workspace send failed.';

    if (admin && outreachMessageId) {
      try {
        await admin
          .from('outreach_messages')
          .update({
            status: 'failed',
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', outreachMessageId);
      } catch {
        // Preserve the original send error even if failure logging also fails.
      }
    }

    return jsonResponse({ ok: false, error: message }, 400);
  }
});
