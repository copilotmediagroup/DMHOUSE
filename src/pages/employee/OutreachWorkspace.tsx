import { ArrowRight, Building2, CheckCircle2, Mail, Paperclip, Phone, Search, Send, ShieldCheck } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton, inputClass } from '../../components/Primitives';
import { useAgencyStore } from '../../store/AgencyStore';
import { useOutreachStore } from '../../store/OutreachStore';
import { usePortfolioStore } from '../../store/PortfolioStore';

function merge(text: string, values: Record<string, string>) {
  return text.replace(/{{\s*([a-z_]+)\s*}}/gi, (_, key) => values[key] || '');
}

export default function OutreachWorkspace() {
  const { agencies, currentEmployee, addActivity, checkEligibility } = useAgencyStore();
  const { templates, queueAndSendEmail } = useOutreachStore();
  const { active } = usePortfolioStore();
  const [searchParams] = useSearchParams();
  const mine = agencies.filter((agency) => agency.ownerEmployeeId === currentEmployee.id && agency.status !== 'do_not_contact');
  const requestedAgency = searchParams.get('agency') || '';
  const [agencyId, setAgencyId] = useState(requestedAgency || mine[0]?.id || '');
  const [kind, setKind] = useState<'call' | 'email'>('email');
  const [contactId, setContactId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [eligibility, setEligibility] = useState<{ allowed: boolean; reason: string; suppressedUntil?: string } | null>(null);

  const agency = mine.find((item) => item.id === agencyId);
  const contact = agency?.contacts.find((item) => item.id === contactId);
  const recipient = kind === 'email' ? (contact?.email || agency?.generalEmail || '') : (contact?.phone || agency?.phone || '');
  const template = templates.find((item) => item.id === templateId);
  const activeTemplates = templates.filter((item) => item.active);

  const values = {
    agency_name: agency?.name || '',
    contact_name: contact ? `${contact.firstName} ${contact.lastName}`.trim() : '',
    portfolio_name: active?.name || '',
    account_count: active ? active.accountCount.toLocaleString() : '',
    asking_price: active ? `$${active.askingPrice.toLocaleString()}` : '',
    employee_name: currentEmployee.name,
  };

  useEffect(() => {
    if (requestedAgency && mine.some((item) => item.id === requestedAgency)) setAgencyId(requestedAgency);
  }, [requestedAgency, mine]);

  useEffect(() => {
    if (!templateId && activeTemplates[0]) setTemplateId(activeTemplates[0].id);
  }, [activeTemplates, templateId]);

  useEffect(() => {
    if (template && kind === 'email') {
      setSubject(merge(template.subject, values));
      setBody(merge(template.body, values));
    }
  }, [templateId, agencyId, contactId, kind, active?.id]);

  useEffect(() => {
    setEligibility(null);
    if (!agency || !recipient) return;
    void checkEligibility(agency.id, kind === 'call' ? 'phone' : 'email', recipient)
      .then(setEligibility)
      .catch((error) => setEligibility({ allowed: false, reason: error instanceof Error ? error.message : 'Unable to verify contact.' }));
  }, [agency?.id, recipient, kind]);

  const step = useMemo(() => {
    if (!agency) return 1;
    if (!recipient) return 2;
    if (kind === 'email' && (!templateId || !subject || !body)) return 3;
    return 4;
  }, [agency, body, kind, recipient, subject, templateId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agency) return;
    setSaving(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      if (kind === 'email') {
        if (!recipient) throw new Error('No active email is available.');
        await queueAndSendEmail({
          agencyId: agency.id,
          contactId: contactId || undefined,
          portfolioId: active?.id,
          templateId: templateId || undefined,
          recipient,
          subject,
          body,
          followUpAt: String(form.get('followUp')) || undefined,
        });
        setMessage('Email sent and logged to the agency timeline.');
      } else {
        await addActivity(agency.id, {
          type: 'call',
          disposition: String(form.get('disposition')),
          notes: String(form.get('notes')),
          contactId: contactId || '',
          followUpAt: String(form.get('followUp')) || undefined,
        });
        setMessage('Call recorded and the relationship timeline was updated.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Outreach failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8 lg:p-10">
      <header className="mb-7">
        <p className="text-sm font-semibold text-blue-600">Guided outreach</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Contact an agency</h1>
        <p className="mt-2 text-slate-500">Choose the relationship, select the contact, prepare the message, and log the next step.</p>
      </header>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <Step number={1} label="Agency" active={step === 1} complete={step > 1} />
        <Step number={2} label="Contact" active={step === 2} complete={step > 2} />
        <Step number={3} label="Message" active={step === 3} complete={step > 3} />
        <Step number={4} label="Send & follow up" active={step === 4} complete={Boolean(message && !message.toLowerCase().includes('failed'))} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
        <div className="space-y-5">
          <Card className="p-5 md:p-6">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Building2 size={19} /></div><div><p className="font-semibold">1. Select agency</p><p className="text-xs text-slate-500">Your assigned relationships only</p></div></div>
            <div className="relative mt-5"><Search className="absolute left-4 top-3.5 text-slate-400" size={17} /><select className={`${inputClass} pl-11`} value={agencyId} onChange={(event) => { setAgencyId(event.target.value); setContactId(''); }}><option value="">Choose an agency</option>{mine.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
            {agency && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{agency.name}</p><p className="mt-1 text-sm text-slate-500">{[agency.city, agency.state].filter(Boolean).join(', ') || 'Location not listed'}</p></div><Pill tone="blue">{agency.status.replace(/_/g, ' ')}</Pill></div><p className="mt-3 text-sm text-slate-500">{agency.contacts.length} saved contacts</p><Link className="mt-4 inline-flex items-center text-sm font-semibold text-blue-600" to={`/employee/agencies/${agency.id}`}>Open relationship <ArrowRight className="ml-1" size={15} /></Link></div>}
          </Card>

          <Card className="p-5 md:p-6">
            <p className="font-semibold">2. Select contact</p>
            <select className={`${inputClass} mt-4`} value={contactId} onChange={(event) => setContactId(event.target.value)} disabled={!agency}><option value="">General company contact</option>{agency?.contacts.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} — {item.title || 'Contact'}</option>)}</select>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recipient</p><p className="mt-1 break-all text-sm font-semibold text-slate-700">{recipient || 'No active phone or email available'}</p></div>
            {eligibility && <div className={`mt-4 rounded-2xl border p-4 text-sm ${eligibility.allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex gap-2"><ShieldCheck size={17} /><div><p className="font-semibold">{eligibility.allowed ? 'Contact available' : 'Contact protected'}</p><p className="mt-1">{eligibility.reason}</p>{eligibility.suppressedUntil && <p className="mt-1">Eligible {new Date(eligibility.suppressedUntil).toLocaleString()}</p>}</div></div></div>}
          </Card>
        </div>

        <Card className="p-5 md:p-8">
          <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setKind('call')} className={`rounded-xl py-3 text-sm font-semibold ${kind === 'call' ? 'bg-white shadow-sm' : 'text-slate-500'}`}><Phone className="mr-2 inline" size={17} />Call</button><button type="button" onClick={() => setKind('email')} className={`rounded-xl py-3 text-sm font-semibold ${kind === 'email' ? 'bg-white shadow-sm' : 'text-slate-500'}`}><Mail className="mr-2 inline" size={17} />Email</button></div>

          {!agency ? <div className="grid min-h-[430px] place-items-center text-center"><div><Building2 className="mx-auto text-slate-300" size={40} /><p className="mt-3 font-semibold">Choose an agency first</p><p className="mt-1 text-sm text-slate-500">The outreach workspace will prepare the correct contact and portfolio details.</p></div></div> : (
            <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
              {kind === 'email' ? <>
                <label><span className="mb-2 block text-sm font-semibold">3. Template</span><select className={inputClass} value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label><span className="mb-2 block text-sm font-semibold">Portfolio linked</span><div className="flex min-h-[46px] items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">{active?.name || 'No active portfolio'}</div></label>
                <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">Subject</span><input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} required /></label>
                <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">Message preview</span><textarea className={`${inputClass} min-h-64`} value={body} onChange={(event) => setBody(event.target.value)} required /></label>
                <div className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><Paperclip size={17} />{active ? `${active.name} is linked to the outreach record. File delivery remains permission-controlled.` : 'Select an active portfolio before pitching.'}</div>
              </> : <>
                <label><span className="mb-2 block text-sm font-semibold">Call outcome</span><select name="disposition" className={inputClass}><option>No answer</option><option>Left voicemail</option><option>Reached receptionist</option><option>Reached decision-maker</option><option>Requested information</option><option>Qualified</option><option>Not interested</option><option>Do not contact</option></select></label>
                <div />
                <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold">Call notes</span><textarea name="notes" required className={`${inputClass} min-h-40`} placeholder="What happened and what should happen next?" /></label>
              </>}
              <label><span className="mb-2 block text-sm font-semibold">4. Next follow-up</span><input name="followUp" type="datetime-local" className={inputClass} /></label>
              <div className="flex items-end justify-end"><PrimaryButton disabled={saving || eligibility?.allowed === false || !recipient}>{kind === 'call' ? <Phone className="mr-2" size={17} /> : <Send className="mr-2" size={17} />}{saving ? 'Working…' : kind === 'email' ? 'Send email' : 'Record call'}</PrimaryButton></div>
              {message && <div className={`md:col-span-2 rounded-2xl border p-4 text-sm font-semibold ${message.toLowerCase().includes('failed') || message.toLowerCase().includes('error') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{message}</div>}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

function Step({ number, label, active, complete }: { number: number; label: string; active: boolean; complete: boolean }) {
  return <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${active ? 'border-blue-300 bg-blue-50' : complete ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><div className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${complete ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{complete ? <CheckCircle2 size={17} /> : number}</div><p className={`text-sm font-semibold ${active ? 'text-blue-800' : complete ? 'text-emerald-800' : 'text-slate-600'}`}>{label}</p></div>;
}
