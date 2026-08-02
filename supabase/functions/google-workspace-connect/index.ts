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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        error: 'Method not allowed.',
      },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const workspaceEmail =
      Deno.env.get('GOOGLE_WORKSPACE_EMAIL') || 'sales@debtpaper.com';

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Supabase environment is not configured.');
    }

    if (!googleClientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured.');
    }

    const authorization = request.headers.get('Authorization');

    if (!authorization) {
      throw new Error('Missing authorization.');
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized.');
    }

    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('company_id, role, is_active')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.role !== 'owner' ||
      !profile.is_active
    ) {
      throw new Error('Owner access required.');
    }

    const body = await request.json().catch(() => ({}));

    const returnUrl =
      typeof body?.returnUrl === 'string' && body.returnUrl.trim()
        ? body.returnUrl.trim()
        : null;

    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const stateHash = await sha256Hex(state);

    await adminClient
      .from('company_email_oauth_states')
      .delete()
      .eq('company_id', profile.company_id)
      .lt('expires_at', new Date().toISOString());

    const { error: stateError } = await adminClient
      .from('company_email_oauth_states')
      .insert({
        company_id: profile.company_id,
        owner_id: user.id,
        state_hash: stateHash,
        return_url: returnUrl,
      });

    if (stateError) {
      throw stateError;
    }

    const { error: connectionError } = await adminClient
      .from('company_email_connections')
      .upsert(
        {
          company_id: profile.company_id,
          provider: 'google_workspace',
          desired_email: workspaceEmail,
          status: 'connecting',
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'company_id,provider',
        },
      );

    if (connectionError) {
      throw connectionError;
    }

    const redirectUri =
      `${supabaseUrl}/functions/v1/google-workspace-callback`;

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      scope: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
      ].join(' '),
    });

    return jsonResponse({
      ok: true,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to start Google Workspace connection.',
      },
      400,
    );
  }
});
