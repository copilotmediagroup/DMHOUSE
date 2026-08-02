import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const toHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
async function encrypt(value: string, secret: string) {
  const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)));
  return `${base64url(iv)}.${base64url(encrypted)}`;
}
const redirect = (url: string, params: Record<string,string>) => {
  const target = new URL(url);
  Object.entries(params).forEach(([key,value]) => target.searchParams.set(key, value));
  return Response.redirect(target.toString(), 302);
};

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
  let returnUrl = `${appUrl}/settings/email`;
  try {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const oauthError = requestUrl.searchParams.get('error');
    if (oauthError) throw new Error(`Google authorization was not completed: ${oauthError}`);
    if (!code || !state) throw new Error('Missing Google authorization response.');

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const stateHash = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state))));
    const { data: stateRow, error: stateError } = await admin.from('company_email_oauth_states').select('*').eq('state_hash', stateHash).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (stateError || !stateRow) throw new Error('The Google connection request expired or is invalid.');
    if (stateRow.return_url) returnUrl = stateRow.return_url;
    await admin.from('company_email_oauth_states').update({ used_at: new Date().toISOString() }).eq('id', stateRow.id);

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const encryptionKey = Deno.env.get('EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!clientId || !clientSecret || !encryptionKey) throw new Error('Google Workspace secrets are incomplete.');
    const redirectUri = `${supabaseUrl}/functions/v1/google-workspace-callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || 'Google token exchange failed.');

    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const gmailProfile = await profileResponse.json();
    if (!profileResponse.ok || !gmailProfile.emailAddress) throw new Error(gmailProfile.error?.message || 'Unable to verify Gmail mailbox.');
    const expected = (Deno.env.get('GOOGLE_WORKSPACE_EMAIL') || 'sales@debtpaper.com').toLowerCase();
    if (String(gmailProfile.emailAddress).toLowerCase() !== expected) throw new Error(`Connect ${expected}, not ${gmailProfile.emailAddress}.`);

    const encryptedAccess = await encrypt(tokens.access_token, encryptionKey);
    const encryptedRefresh = tokens.refresh_token ? await encrypt(tokens.refresh_token, encryptionKey) : null;
    const { data: existing } = await admin.from('company_email_connections').select('encrypted_refresh_token').eq('company_id', stateRow.company_id).eq('provider', 'google_workspace').maybeSingle();
    const { error: upsertError } = await admin.from('company_email_connections').upsert({
      company_id: stateRow.company_id,
      provider: 'google_workspace',
      desired_email: expected,
      mailbox_email: gmailProfile.emailAddress,
      status: 'connected',
      scopes: String(tokens.scope || '').split(' ').filter(Boolean),
      encrypted_access_token: encryptedAccess,
      encrypted_refresh_token: encryptedRefresh || existing?.encrypted_refresh_token || null,
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
      google_history_id: gmailProfile.historyId || null,
      last_verified_at: new Date().toISOString(),
      last_error: null,
      connected_by: stateRow.owner_id,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'company_id,provider' });
    if (upsertError) throw upsertError;
    return redirect(returnUrl, { email_connected: '1' });
  } catch (error) {
    return redirect(returnUrl, { email_error: error instanceof Error ? error.message : 'Google connection failed.' });
  }
});
