import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { useAgencyStore } from '../../store/AgencyStore';
import { useDistributionStore, type DeliveryMethod, type DistributionRecord, type RecipientType } from '../../store/DistributionStore';
import { usePortfolioStore } from '../../store/PortfolioStore';

const input='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

export default function DistributePortfolio(){
  const {active,getDownloadUrl}=usePortfolioStore();
  const maskedFile=active?.maskedFile;
  const {agencies,currentEmployee}=useAgencyStore();
  const {createDistribution,sendEmail,markDelivered,alreadySent,activeFileLocked}=useDistributionStore();
  const owned=agencies.filter(a=>a.ownerEmployeeId===currentEmployee.id);
  const [agencyId,setAgencyId]=useState(owned[0]?.id||'');
  const agency=owned.find(a=>a.id===agencyId);
  const namedContacts=agency?.contacts.filter(c=>Boolean(c.email))||[];
  const defaultRecipientType:RecipientType=agency?.generalEmail?'general_agency':'named_contact';
  const [recipientType,setRecipientType]=useState<RecipientType>(defaultRecipientType);
  const [contactId,setContactId]=useState(namedContacts[0]?.id||'');
  const selectedContact=namedContacts.find(c=>c.id===contactId);
  const recipientEmail=recipientType==='general_agency'?(agency?.generalEmail||''):(selectedContact?.email||'');
  const recipientName=recipientType==='general_agency'?'':selectedContact?`${selectedContact.firstName} ${selectedContact.lastName}`.trim():'';
  const [method,setMethod]=useState<DeliveryMethod>('email');
  const [notice,setNotice]=useState('');
  const [prepared,setPrepared]=useState<DistributionRecord|null>(null);
  const [testMode,setTestMode]=useState(true);
  const [sending,setSending]=useState(false);
  const prior=useMemo(()=>active&&agencyId&&recipientEmail?alreadySent(active.id,agencyId,recipientEmail):[],[active,agencyId,recipientEmail,alreadySent]);

  function changeAgency(id:string){
    const next=owned.find(a=>a.id===id);
    const contacts=next?.contacts.filter(c=>Boolean(c.email))||[];
    setAgencyId(id);
    setRecipientType(next?.generalEmail?'general_agency':'named_contact');
    setContactId(contacts[0]?.id||'');
  }

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const r=await createDistribution({
      agencyId,
      contactId:recipientType==='named_contact'?contactId:undefined,
      recipientEmail,
      recipientName,
      recipientType,
      method,
      reason:String(f.get('reason')),
      followUpAt:String(f.get('followUp')),
    });
    setNotice(r.message);
    if(r.record)setPrepared(r.record);
  }

  async function deliver(){
    if(!prepared||!active||!maskedFile)return;

    setSending(true);

    try{
      if(prepared.method==='email'){
        const subject=`${prepared.portfolioName} — Masked Portfolio Review`;
        const result=await sendEmail(prepared.id,subject,testMode);
        setNotice(result.message);

        if(result.ok){
          setPrepared({...prepared,status:'sent',testMode:result.testMode});
        }

        return;
      }

      const signedUrl=await getDownloadUrl(active.id,'masked');

      if(!signedUrl){
        throw new Error('The approved masked file is unavailable.');
      }

      const anchor=document.createElement('a');
      anchor.href=signedUrl;
      anchor.download=maskedFile.name;
      anchor.rel='noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      await markDelivered(prepared.id);

      setPrepared({
        ...prepared,
        status:'downloaded',
        deliveredAt:new Date().toISOString(),
      });

      setNotice('The approved masked file was released and recorded.');
    }catch(error){
      setNotice(
        error instanceof Error
          ? error.message
          : 'Unable to deliver the masked file.',
      );
    }finally{
      setSending(false);
    }
  }

  if(!active)return <Empty title="No active portfolio" body="The owner must activate a portfolio before samples can be distributed."/>;

  return <div className="mx-auto max-w-[1180px] p-5 md:p-8 lg:p-10">
    <header className="mb-8">
      <p className="text-sm font-semibold text-blue-600">Distribution record</p>
      <h2 className="mt-1 text-3xl font-semibold">Prepare and record the right file for the right buyer.</h2>
      <p className="mt-2 max-w-3xl text-slate-500">A named contact is preferred, but a valid agency email is enough. Email delivery now runs through a protected Supabase Edge Function. Test mode is required by default, and “sent” means the provider accepted the message—not that the buyer opened or received it.</p>
    </header>
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><FileSpreadsheet/></div>
          <div><Pill tone="success">Active portfolio</Pill><h3 className="mt-2 text-xl font-semibold">{active.name}</h3><p className="mt-1 text-sm text-slate-500">{active.maskedFile?.name||'No approved masked file'}</p></div>
        </div>
        {activeFileLocked&&<div className="mt-6 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800"><LockKeyhole size={19}/>Distribution is locked while the portfolio is {active.status.replace('_',' ')}.</div>}
        {!prepared?<form onSubmit={submit} className="mt-8 space-y-5">
          <label><span className="mb-2 block text-sm font-semibold">Agency</span><select className={input} value={agencyId} onChange={e=>changeAgency(e.target.value)} required><option value="">Select an owned agency</option>{owned.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          {agency&&<div>
            <span className="mb-2 block text-sm font-semibold">Send to</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={!agency.generalEmail} onClick={()=>setRecipientType('general_agency')} className={`rounded-2xl border p-4 text-left ${recipientType==='general_agency'?'border-blue-500 bg-blue-50':'border-slate-200'} disabled:cursor-not-allowed disabled:opacity-45`}>
                <Mail size={19}/><p className="mt-3 font-semibold">Agency general email</p><p className="mt-1 break-all text-xs text-slate-500">{agency.generalEmail||'No general email saved'}</p>
              </button>
              <button type="button" disabled={!namedContacts.length} onClick={()=>setRecipientType('named_contact')} className={`rounded-2xl border p-4 text-left ${recipientType==='named_contact'?'border-blue-500 bg-blue-50':'border-slate-200'} disabled:cursor-not-allowed disabled:opacity-45`}>
                <ShieldCheck size={19}/><p className="mt-3 font-semibold">Named contact</p><p className="mt-1 text-xs text-slate-500">{namedContacts.length?`${namedContacts.length} contact${namedContacts.length===1?'':'s'} available`:'No contact email saved'}</p>
              </button>
            </div>
          </div>}
          {recipientType==='named_contact'&&<label><span className="mb-2 block text-sm font-semibold">Contact</span><select className={input} value={contactId} onChange={e=>setContactId(e.target.value)} required><option value="">Select contact</option>{namedContacts.map(c=><option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim()||c.email} · {c.title||c.email}</option>)}</select></label>}
          {recipientType==='general_agency'&&agency?.generalEmail&&<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-semibold text-blue-950">No name required</p><p className="mt-1 text-sm text-blue-800">This distribution will be attributed to {agency.name} at {agency.generalEmail}.</p></div>}
          {prior.length>0&&<div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><AlertTriangle className="shrink-0 text-amber-700"/><div><p className="font-semibold text-amber-900">Repeat distribution warning</p><p className="mt-1 text-sm text-amber-800">This email already received this portfolio {prior.length} time{prior.length===1?'':'s'}.</p></div></div>}
          <div><span className="mb-2 block text-sm font-semibold">Delivery method</span><div className="grid grid-cols-2 gap-3"><button type="button" onClick={()=>setMethod('email')} className={`rounded-2xl border p-4 text-left ${method==='email'?'border-blue-500 bg-blue-50':'border-slate-200'}`}><Mail size={19}/><p className="mt-3 font-semibold">Send through DMH</p><p className="mt-1 text-xs text-slate-500">Provider-backed server-side delivery.</p></button><button type="button" onClick={()=>setMethod('download')} className={`rounded-2xl border p-4 text-left ${method==='download'?'border-blue-500 bg-blue-50':'border-slate-200'}`}><Download size={19}/><p className="mt-3 font-semibold">Controlled download</p><p className="mt-1 text-xs text-slate-500">Download after attribution.</p></button></div></div>
          <label><span className="mb-2 block text-sm font-semibold">Business reason</span><textarea className={`${input} min-h-24`} name="reason" required placeholder="Buyer requested masked sample after qualification call."/></label>
          <label><span className="mb-2 block text-sm font-semibold">Required follow-up</span><input className={input} name="followUp" type="datetime-local" required min={new Date().toISOString().slice(0,16)}/></label>
          <PrimaryButton className="w-full" disabled={!active.maskedFile||activeFileLocked||!owned.length||!recipientEmail}>Prepare distribution <ArrowRight className="ml-2" size={18}/></PrimaryButton>
          {!owned.length&&<p className="text-center text-sm text-amber-700">Add or claim an agency first. A named decision-maker is not required.</p>}
          {agency&&!agency.generalEmail&&!namedContacts.length&&<p className="text-center text-sm text-amber-700">Add a valid general agency email or a contact email before distributing.</p>}
        </form>:<div className="mt-8">
          <div className="rounded-3xl bg-slate-950 p-6 text-white"><div className="flex items-center gap-3"><ShieldCheck className="text-blue-400"/><p className="font-semibold">Distribution attributed</p></div><div className="mt-6 space-y-4 text-sm"><Row label="Portfolio" value={prepared.portfolioName}/><Row label="Agency" value={prepared.agencyName}/><Row label="Recipient" value={`${prepared.contactName?`${prepared.contactName} · `:''}${prepared.contactEmail}`}/><Row label="Recipient type" value={prepared.recipientType.replace('_',' ')}/><Row label="File" value={`${prepared.fileName} · version ${prepared.fileVersion}`}/><Row label="Method" value={prepared.method}/><Row label="Follow-up" value={new Date(prepared.followUpAt).toLocaleString()}/></div></div>
          {prepared.status==='prepared'?<>
            {prepared.method==='email'&&<label className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" className="mt-1" checked={testMode} onChange={e=>setTestMode(e.target.checked)}/><span><span className="block text-sm font-semibold text-amber-900">Test mode</span><span className="mt-1 block text-xs text-amber-800">Routes the email to the configured DMH test inbox instead of the buyer. Keep this enabled until production sending is approved.</span></span></label>}
            <PrimaryButton className="mt-5 w-full" onClick={deliver} disabled={sending}>{prepared.method==='email'?<Mail className="mr-2" size={18}/>:<Download className="mr-2" size={18}/>} {sending?'Processing…':prepared.method==='email'?(testMode?'Send test email':'Send production email'):'Download attributed file'}</PrimaryButton>
          </>:<div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-700"><CheckCircle2/> Distribution recorded as {prepared.status}{prepared.testMode?' in test mode':''}.</div>}
          <SecondaryButton className="mt-3 w-full" onClick={()=>{setPrepared(null);setNotice('')}}>Prepare another</SecondaryButton>
        </div>}
        {notice&&<div className={`mt-5 rounded-2xl p-4 text-sm font-semibold ${notice.includes('Warning')?'bg-amber-50 text-amber-800':'bg-emerald-50 text-emerald-700'}`}>{notice}</div>}
      </Card>
      <div className="space-y-6"><Card className="p-6"><h3 className="font-semibold">Distribution controls</h3><div className="mt-5 space-y-4"><Rule text="A real agency and valid recipient email are required."/><Rule text="A decision-maker name is preferred, not required."/><Rule text="The active approved file version is captured."/><Rule text="Repeat sends trigger a visible warning."/><Rule text="Provider acceptance is recorded separately from delivery confirmation."/><Rule text="Test mode prevents accidental buyer contact."/><Rule text="A follow-up is created with every distribution."/><Rule text="Reserved and sold portfolios automatically lock."/></div></Card><Link to="/employee/distributions"><Card className="flex items-center justify-between p-6 transition hover:-translate-y-0.5 hover:shadow-lg"><div><p className="font-semibold">Distribution history</p><p className="mt-1 text-sm text-slate-500">Review every sample you released.</p></div><ArrowRight className="text-blue-600"/></Card></Link></div>
    </div>
  </div>;
}
function Rule({text}:{text:string}){return <div className="flex gap-3 text-sm text-slate-600"><CheckCircle2 className="shrink-0 text-emerald-600" size={18}/>{text}</div>}
function Row({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-6 border-b border-white/10 pb-3"><span className="text-slate-400">{label}</span><span className="text-right font-medium capitalize">{value}</span></div>}
function Empty({title,body}:{title:string;body:string}){return <div className="mx-auto max-w-3xl p-10"><Card className="p-10 text-center"><LockKeyhole className="mx-auto text-slate-300" size={40}/><h2 className="mt-5 text-2xl font-semibold">{title}</h2><p className="mt-2 text-slate-500">{body}</p></Card></div>}
