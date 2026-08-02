import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-dmh-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function decodeBase64Url(value: string) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  const binary = atob(normalized);
  return new Uint8Array([...binary].map((character) => character.charCodeAt(0)));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function decryptToken(value: string, secret: string) {
  const [ivPart, dataPart] = value.split('.');
  if (!ivPart || !dataPart) throw new Error('Encrypted token is invalid.');
  const keyBytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  );
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(ivPart) },
    key,
    decodeBase64Url(dataPart),
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptToken(value: string, secret: string) {
  const keyBytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  );
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)),
  );
  return `${encodeBase64Url(iv)}.${encodeBase64Url(encrypted)}`;
}

function header(headers: Array<{ name?: string; value?: string }> = [], name: string) {
  return headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function emailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

function decodeText(data?: string) {
  if (!data) return '';
  try {
    return new TextDecoder().decode(decodeBase64Url(data));
  } catch {
    return '';
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function messageBody(payload: any): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (part: any) => {
    const mime = String(part?.mimeType || '').toLowerCase();
    const value = decodeText(part?.body?.data);
    if (value && mime === 'text/plain') plain.push(value);
    if (value && mime === 'text/html') html.push(value);
    for (const child of part?.parts || []) walk(child);
  };
  walk(payload);
  return (plain.join('\n').trim() || stripHtml(html.join('\n')) || '').trim();
}

async function gmailJson(accessToken: string, url: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Gmail request failed.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const encryptionSecret = Deno.env.get('EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey || !clientId || !clientSecret || !encryptionSecret) {
      throw new Error('Gmail sync environment is incomplete.');
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const authorization = request.headers.get('Authorization');
    const suppliedSecret = request.headers.get('x-dmh-sync-secret');
    const expectedSecret = Deno.env.get('GMAIL_SYNC_SECRET');
    const body = await request.json().catch(() => ({}));
    let companyId = typeof body?.companyId === 'string' ? body.companyId : '';

    if (expectedSecret && suppliedSecret === expectedSecret) {
      if (!companyId) throw new Error('companyId is required for scheduled synchronization.');
    } else {
      if (!authorization) throw new Error('Missing authorization.');
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) throw new Error('Unauthorized.');
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('company_id,is_active')
        .eq('id', user.id)
        .single();
      if (profileError || !profile?.is_active) throw new Error('Active company membership required.');
      companyId = profile.company_id;
    }

    const { data: connection, error: connectionError } = await admin
      .from('company_email_connections')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', 'google_workspace')
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== 'connected' || !connection.mailbox_email || !connection.encrypted_access_token) {
      throw new Error('Google Workspace is not connected for this company.');
    }

    let accessToken = await decryptToken(connection.encrypted_access_token, encryptionSecret);
    const expiresAt = connection.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : 0;
    if (expiresAt <= Date.now() + 60_000) {
      if (!connection.encrypted_refresh_token) throw new Error('Google refresh token is missing. Reconnect the mailbox.');
      const refreshToken = await decryptToken(connection.encrypted_refresh_token, encryptionSecret);
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
        throw new Error(refreshed.error_description || refreshed.error || 'Google token refresh failed.');
      }
      accessToken = refreshed.access_token;
      await admin.from('company_email_connections').update({
        encrypted_access_token: await encryptToken(accessToken, encryptionSecret),
        access_token_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
        last_verified_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', connection.id);
    }

    const profile = await gmailJson(accessToken, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
    let startHistoryId = connection.google_history_id || profile.historyId;
    let latestHistoryId = profile.historyId || startHistoryId;
    const messageIds = new Set<string>();

    const collectRecent = async () => {
      const list = await gmailJson(
        accessToken,
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=newer_than%3A7d',
      );
      for (const item of list.messages || []) if (item.id) messageIds.add(item.id);
    };

    if (connection.google_history_id) {
      let pageToken = '';
      try {
        do {
          const params = new URLSearchParams({
            startHistoryId,
            historyTypes: 'messageAdded',
            maxResults: '500',
          });
          if (pageToken) params.set('pageToken', pageToken);
          const history = await gmailJson(
            accessToken,
            `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`,
          );
          latestHistoryId = history.historyId || latestHistoryId;
          for (const event of history.history || []) {
            for (const added of event.messagesAdded || []) {
              if (added.message?.id) messageIds.add(added.message.id);
            }
          }
          pageToken = history.nextPageToken || '';
        } while (pageToken);
      } catch (error) {
        if ((error as Error & { status?: number }).status !== 404) throw error;
        await collectRecent();
      }
    } else {
      await collectRecent();
    }

    let imported = 0;
    let duplicates = 0;
    let unassigned = 0;
    const mailbox = String(connection.mailbox_email).toLowerCase();

    for (const messageId of messageIds) {
      const gmailMessage = await gmailJson(
        accessToken,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
      );
      const labels: string[] = gmailMessage.labelIds || [];
      const headers = gmailMessage.payload?.headers || [];
      const fromRaw = header(headers, 'From');
      const fromEmail = emailAddress(fromRaw);
      if (!fromEmail || fromEmail === mailbox || labels.includes('SENT') || labels.includes('DRAFT')) continue;

      const { data: existing } = await admin
        .from('conversation_messages')
        .select('id')
        .eq('company_id', companyId)
        .eq('provider_message_id', gmailMessage.id)
        .maybeSingle();
      if (existing) { duplicates += 1; continue; }

      const threadId = gmailMessage.threadId || null;
      const rfcMessageId = header(headers, 'Message-ID') || null;
      const inReplyTo = header(headers, 'In-Reply-To') || null;
      const references = header(headers, 'References') || '';
      const subject = header(headers, 'Subject') || '(No subject)';
      const toEmail = emailAddress(header(headers, 'To')) || mailbox;
      const receivedAt = gmailMessage.internalDate
        ? new Date(Number(gmailMessage.internalDate)).toISOString()
        : new Date().toISOString();
      const bodyText = messageBody(gmailMessage.payload) || gmailMessage.snippet || '';

      let conversation: any = null;
      if (threadId) {
        const { data } = await admin
          .from('conversation_messages')
          .select('conversation_id,agency_id')
          .eq('company_id', companyId)
          .eq('provider_thread_id', threadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) conversation = data;
      }

      if (!conversation && (inReplyTo || references)) {
        const candidates = [inReplyTo, ...references.split(/\s+/)].filter(Boolean);
        if (candidates.length) {
          const { data } = await admin
            .from('conversation_messages')
            .select('conversation_id,agency_id')
            .eq('company_id', companyId)
            .in('rfc_message_id', candidates)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) conversation = data;
        }
      }

      if (!conversation) {
        const { data: contacts } = await admin
          .from('agency_contacts')
          .select('agency_id')
          .eq('company_id', companyId)
          .ilike('email', fromEmail)
          .limit(2);
        let agencyId = contacts?.length === 1 ? contacts[0].agency_id : null;
        if (!agencyId) {
          const { data: agencies } = await admin
            .from('agencies')
            .select('id')
            .eq('company_id', companyId)
            .ilike('general_email', fromEmail)
            .limit(2);
          agencyId = agencies?.length === 1 ? agencies[0].id : null;
        }
        if (agencyId) {
          const { data: agency } = await admin.from('agencies').select('assigned_to').eq('id', agencyId).single();
          const { data: created, error: createError } = await admin
            .from('conversations')
            .upsert({
              company_id: companyId,
              agency_id: agencyId,
              assigned_employee_id: agency?.assigned_to || null,
              subject,
              last_message_at: receivedAt,
              last_inbound_at: receivedAt,
              status: 'open',
              updated_at: receivedAt,
            }, { onConflict: 'company_id,agency_id' })
            .select('id,agency_id')
            .single();
          if (createError) throw createError;
          conversation = { conversation_id: created.id, agency_id: created.agency_id };
        }
      }

      if (!conversation) {
        await admin.from('unassigned_inbound_emails').upsert({
          company_id: companyId,
          provider: 'gmail',
          provider_message_id: gmailMessage.id,
          provider_thread_id: threadId,
          rfc_message_id: rfcMessageId,
          from_email: fromEmail,
          to_email: toEmail,
          subject,
          body: bodyText,
          received_at: receivedAt,
          raw_payload: { gmail_message_id: gmailMessage.id, gmail_thread_id: threadId, labels },
        }, { onConflict: 'company_id,provider_message_id' });
        const { data: owners } = await admin
          .from('profiles')
          .select('id')
          .eq('company_id', companyId)
          .eq('role', 'owner')
          .eq('is_active', true);
        if (owners?.length) {
          await admin.from('notifications').insert(owners.map((owner: any) => ({
            company_id: companyId,
            user_id: owner.id,
            type: 'unassigned_email',
            title: 'Unassigned buyer email',
            body: `${fromEmail}: ${subject}`,
            action_path: '/conversations',
          })));
        }
        unassigned += 1;
        continue;
      }

      const { error: insertError } = await admin.from('conversation_messages').insert({
        company_id: companyId,
        conversation_id: conversation.conversation_id,
        agency_id: conversation.agency_id,
        sender_profile_id: null,
        direction: 'inbound',
        from_email: fromEmail,
        to_email: toEmail,
        subject,
        body: bodyText,
        provider: 'gmail',
        provider_message_id: gmailMessage.id,
        provider_thread_id: threadId,
        rfc_message_id: rfcMessageId,
        in_reply_to: inReplyTo,
        gmail_label_ids: labels,
        is_read: false,
        received_at: receivedAt,
        raw_payload: { gmail_message_id: gmailMessage.id, gmail_thread_id: threadId, labels },
        created_at: receivedAt,
      });
      if (insertError) {
        if (insertError.code === '23505') { duplicates += 1; continue; }
        throw insertError;
      }

      const { data: updatedConversation, error: updateError } = await admin
        .from('conversations')
        .update({
          subject,
          status: 'open',
          last_message_at: receivedAt,
          last_inbound_at: receivedAt,
          updated_at: receivedAt,
        })
        .eq('id', conversation.conversation_id)
        .select('assigned_employee_id')
        .single();
      if (updateError) throw updateError;

      if (updatedConversation?.assigned_employee_id) {
        await admin.from('notifications').insert({
          company_id: companyId,
          user_id: updatedConversation.assigned_employee_id,
          type: 'buyer_reply',
          title: 'Buyer replied',
          body: `${fromEmail}: ${subject}`,
          action_path: `/conversations?conversation=${conversation.conversation_id}`,
        });
      } else {
        const { data: owners } = await admin
          .from('profiles')
          .select('id')
          .eq('company_id', companyId)
          .eq('role', 'owner')
          .eq('is_active', true);
        if (owners?.length) {
          await admin.from('notifications').insert(owners.map((owner: any) => ({
            company_id: companyId,
            user_id: owner.id,
            type: 'buyer_reply_unassigned',
            title: 'Buyer reply needs assignment',
            body: `${fromEmail}: ${subject}`,
            action_path: `/conversations?conversation=${conversation.conversation_id}`,
          })));
        }
      }
      imported += 1;
    }

    const syncedAt = new Date().toISOString();
    await admin.from('company_email_connections').update({
      google_history_id: latestHistoryId || profile.historyId,
      last_sync_at: syncedAt,
      last_verified_at: syncedAt,
      last_error: null,
    }).eq('id', connection.id);

    return jsonResponse({ ok: true, imported, duplicates, unassigned, checked: messageIds.size, lastSyncAt: syncedAt });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Gmail synchronization failed.',
    }, 400);
  }
});
