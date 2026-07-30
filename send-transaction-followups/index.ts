import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Missing authorization.');

    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('OUTREACH_FROM_EMAIL');
    if (!url || !anon || !serviceKey) throw new Error('Supabase function environment is incomplete.');
    if (!resendKey || !fromEmail) throw new Error('Email provider is not configured.');

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Unauthorized.');

    const { data: profile, error: profileError } = await userClient
      .from('profiles').select('company_id,role').eq('id', user.id).single();
    if (profileError) throw profileError;
    if (!['owner', 'employee'].includes(profile.role)) throw new Error('Staff access required.');

    const admin = createClient(url, serviceKey);
    const { data: rows, error: queueError } = await admin
      .from('transaction_follow_up_queue')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('status', 'queued')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(25);
    if (queueError) throw queueError;

    let sent = 0;
    let failed = 0;
    for (const item of rows ?? []) {
      await admin.from('transaction_follow_up_queue').update({
        status: 'sending', attempt_count: Number(item.attempt_count || 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', item.id).eq('status', 'queued');

      try {
        const action = item.action_url
          ? `<p style="margin:24px 0"><a href="${item.action_url}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open Buyer Portal</a></p>`
          : '';
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `${Deno.env.get('OUTREACH_FROM_NAME') || 'Data Market House'} <${fromEmail}>`,
            to: [item.recipient],
            reply_to: 'info@debtpaper.com',
            subject: item.subject,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">${String(item.body || '').replace(/\n/g, '<br>')}${action}</div>`,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.message || 'Email provider rejected the request.');
        await admin.from('transaction_follow_up_queue').update({
          status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.id,
          last_error: null, updated_at: new Date().toISOString(),
        }).eq('id', item.id);
        sent += 1;
      } catch (error) {
        await admin.from('transaction_follow_up_queue').update({
          status: 'failed', last_error: error instanceof Error ? error.message : 'Unknown delivery error',
          updated_at: new Date().toISOString(),
        }).eq('id', item.id);
        failed += 1;
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: (rows ?? []).length, sent, failed }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
