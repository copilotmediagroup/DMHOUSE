import { CheckCircle2, ExternalLink, Mail, RefreshCw, Send, ShieldCheck, Unplug } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Field, Pill, PrimaryButton, SecondaryButton, inputClass } from '../../components/Primitives';
import { supabase } from '../../lib/supabase';
import type { CompanyEmailConnection } from '../../services/email/types';
import { usePortfolioStore } from '../../store/PortfolioStore';

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet';

export default function CompanyEmailSettings() {
  const { profile } = usePortfolioStore();
  const [connection, setConnection] = useState<CompanyEmailConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect'|'test'|'disconnect'|''>('');
  const [recipient, setRecipient] = useState('sales@debtpaper.com');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    setError('');
    const result = await supabase
      .from('company_email_connections')
      .select('id,company_id,provider,desired_email,mailbox_email,status,scopes,access_token_expires_at,google_history_id,last_verified_at,last_sync_at,last_error,connected_by,connected_at,created_at,updated_at')
      .eq('company_id', profile.company_id)
      .eq('provider', 'google_workspace')
      .maybeSingle();
    if (result.error) setError(result.error.message);
    setConnection((result.data as CompanyEmailConnection | null) || null);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('email_connected');
    const failure = params.get('email_error');
    if (connected === '1') setMessage('Google Workspace connected successfully.');
    if (failure) setError(decodeURIComponent(failure));
    if (connected || failure) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const connected = connection?.status === 'connected';
  const statusTone = connected ? 'success' : connection?.status === 'error' ? 'danger' : connection?.status === 'connecting' ? 'warning' : 'neutral';
  const statusLabel = connected ? 'Connected' : connection?.status === 'connecting' ? 'Connecting' : connection?.status === 'error' ? 'Needs attention' : 'Not connected';
  const scopes = useMemo(() => connection?.scopes || [], [connection?.scopes]);

  async function connect() {
    setBusy('connect'); setError(''); setMessage('');
    const returnUrl = `${window.location.origin}/settings/email`;
    const { data, error: invokeError } = await supabase.functions.invoke('google-workspace-connect', { body: { returnUrl } });
    if (invokeError || !data?.url) {
      setError(data?.error || invokeError?.message || 'Unable to start Google connection.');
      setBusy(''); return;
    }
    window.location.assign(data.url);
  }

  async function sendTest() {
    if (!recipient.trim()) return;
    setBusy('test'); setError(''); setMessage('');
    const { data, error: invokeError } = await supabase.functions.invoke('google-workspace-test', { body: { recipient: recipient.trim() } });
    if (invokeError || !data?.ok) setError(data?.error || invokeError?.message || 'Test email failed.');
    else { setMessage(`Test email sent through ${data.mailbox}.`); await load(); }
    setBusy('');
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Google Workspace from DMHOUSE? Existing email history will remain.')) return;
    setBusy('disconnect'); setError(''); setMessage('');
    const { data, error: invokeError } = await supabase.functions.invoke('google-workspace-disconnect');
    if (invokeError || !data?.ok) setError(data?.error || invokeError?.message || 'Disconnect failed.');
    else { setMessage('Google Workspace disconnected.'); await load(); }
    setBusy('');
  }

  return (
    <div className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><Mail size={15}/> Company email</div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Google Workspace connection</h2>
          <p className="mt-3 max-w-3xl text-slate-500">Connect the company-owned sales mailbox once. Employees send from DMHOUSE without receiving Gmail credentials.</p>
        </div>
        <Pill tone={statusTone}>{statusLabel}</Pill>
      </div>

      {(error || message) && <div className={`mb-6 rounded-2xl border p-4 text-sm font-medium ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600"><Mail size={26}/></div>
              <div><p className="text-sm text-slate-500">Provider</p><h3 className="text-xl font-semibold">Google Workspace</h3></div>
            </div>
            {connected && <CheckCircle2 className="text-emerald-600" size={26}/>} 
          </div>

          <dl className="mt-7 divide-y divide-slate-100 rounded-2xl border border-slate-200">
            <Row label="Primary mailbox" value={connection?.mailbox_email || connection?.desired_email || 'sales@debtpaper.com'} />
            <Row label="Connected" value={formatTime(connection?.connected_at || null)} />
            <Row label="Last verified" value={formatTime(connection?.last_verified_at || null)} />
            <Row label="Last sync" value={formatTime(connection?.last_sync_at || null)} />
          </dl>

          {connection?.last_error && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{connection.last_error}</div>}

          <div className="mt-7 flex flex-wrap gap-3">
            <PrimaryButton onClick={connect} disabled={Boolean(busy)}>{busy === 'connect' ? <RefreshCw className="mr-2 animate-spin" size={17}/> : <ExternalLink className="mr-2" size={17}/>} {connected ? 'Reconnect Google' : 'Connect sales@debtpaper.com'}</PrimaryButton>
            {connected && <SecondaryButton onClick={disconnect} disabled={Boolean(busy)}><Unplug className="mr-2" size={17}/>Disconnect</SecondaryButton>}
          </div>
        </Card>

        <Card className="p-6 md:p-8">
          <div className="flex items-center gap-3"><ShieldCheck className="text-blue-600"/><div><h3 className="font-semibold">Connection permissions</h3><p className="text-sm text-slate-500">DMHOUSE requests only the Gmail access needed for company messaging.</p></div></div>
          <div className="mt-5 space-y-3 text-sm">
            <Permission text="Send mail as sales@debtpaper.com" active={connected}/>
            <Permission text="Read and organize buyer replies" active={scopes.some(s=>s.includes('gmail.modify'))}/>
            <Permission text="Keep access while the owner is offline" active={connected}/>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6 md:p-8">
        <div className="flex items-center gap-3"><Send className="text-blue-600"/><div><h3 className="font-semibold">Verify outbound sending</h3><p className="text-sm text-slate-500">Send a real test through the connected Google Workspace mailbox.</p></div></div>
        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <Field label="Test recipient"><input className={inputClass} type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="you@example.com"/></Field>
          <div className="md:pt-7"><PrimaryButton onClick={sendTest} disabled={!connected || !recipient.trim() || Boolean(busy)}>{busy === 'test' ? <RefreshCw className="mr-2 animate-spin" size={17}/> : <Send className="mr-2" size={17}/>}Send test email</PrimaryButton></div>
        </div>
        {!connected && <p className="mt-3 text-xs text-slate-400">Connect Google Workspace before testing.</p>}
      </Card>
    </div>
  );
}

function Row({label,value}:{label:string;value:string}) { return <div className="grid grid-cols-[150px_1fr] gap-4 px-4 py-3"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-sm font-semibold text-slate-800">{value}</dd></div>; }
function Permission({text,active}:{text:string;active:boolean}) { return <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3"><CheckCircle2 size={17} className={active?'text-emerald-600':'text-slate-300'}/><span>{text}</span></div>; }
