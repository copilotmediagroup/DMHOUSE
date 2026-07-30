import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization.');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const productionEnabled = Deno.env.get('DMH_EMAIL_PRODUCTION_ENABLED') === 'true';
    const testRecipient = Deno.env.get('DMH_EMAIL_TEST_RECIPIENT');
    const sender = Deno.env.get('DMH_EMAIL_FROM') || 'Data Market House <info@debtpaper.com>';

    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Unauthorized.');

    const { distributionId, subject, testMode = true } = await req.json();
    if (!distributionId || !subject?.trim()) throw new Error('Distribution and subject are required.');

    const { data: prepared, error: prepareError } = await client.rpc('dmh_prepare_email_delivery', {
      p_distribution_id: distributionId,
      p_subject: subject.trim(),
      p_test_mode: Boolean(testMode),
    });
    if (prepareError) throw prepareError;

    const row = prepared;
    const actualTestMode = Boolean(row.test_mode) || !productionEnabled;
    const recipient = actualTestMode ? testRecipient : row.recipient_email;
    if (!recipient) throw new Error(actualTestMode ? 'DMH_EMAIL_TEST_RECIPIENT is not configured.' : 'Recipient email is missing.');
    if (!resendKey) throw new Error('RESEND_API_KEY is not configured.');

    const displayRecipient = row.recipient_name || row.agency_name || 'Portfolio Buyer';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a">
        <p style="font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase">Data Market House</p>
        <h1 style="font-size:26px;margin:12px 0">${escapeHtml(subject.trim())}</h1>
        <p>Hello ${escapeHtml(displayRecipient)},</p>
        <p>A masked debt portfolio sample has been prepared for your review.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin:20px 0">
          <strong>${escapeHtml(row.portfolio_name || 'Available Portfolio')}</strong><br/>
          <span style="color:#64748b">Reference: ${escapeHtml(row.id)}</span>
        </div>
        <p>Please reply to this email with any questions or to discuss pricing and availability.</p>
        <p>Data Market House<br/>info@debtpaper.com</p>
        ${actualTestMode ? '<p style="color:#b45309;font-weight:700">TEST MODE — the intended recipient did not receive this message.</p>' : ''}
      </div>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': row.idempotency_key,
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: 'info@debtpaper.com',
        subject: actualTestMode ? `[TEST] ${subject.trim()}` : subject.trim(),
        html,
        headers: {
          'X-DMH-Distribution-ID': row.id,
          'X-DMH-Intended-Recipient': row.recipient_email,
        },
      }),
    });
    const providerPayload = await response.json();
    if (!response.ok) throw new Error(providerPayload?.message || 'Email provider rejected the request.');

    const { error: updateError } = await admin.from('portfolio_distributions').update({
      status: 'sent', provider: 'resend', provider_status: 'accepted',
      provider_message_id: providerPayload.id, delivered_at: null,
      failure_reason: null, failed_at: null,
    }).eq('id', row.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, status: 'sent', testMode: actualTestMode, providerMessageId: providerPayload.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error) {
    let distributionId: string | undefined;
    try { distributionId = (await req.clone().json()).distributionId; } catch (_) {}
    if (distributionId) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await admin.from('portfolio_distributions').update({
        status: 'failed', provider_status: 'failed', failed_at: new Date().toISOString(),
        failure_reason: error instanceof Error ? error.message : 'Unknown delivery failure',
      }).eq('id', distributionId);
    }
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unable to send email.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});

function escapeHtml(value: string) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]!));
}
