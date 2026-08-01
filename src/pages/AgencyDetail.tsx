import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  ExternalLink,
  Globe2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../components/Primitives';
import { useAgencyStore, type AgencyActivity, type AgencyStatus } from '../store/AgencyStore';
import { usePortfolioStore } from '../store/PortfolioStore';

const input='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

function externalUrl(value:string){const trimmed=value.trim();if(!trimmed)return '';return /^https?:\/\//i.test(trimmed)?trimmed:`https://${trimmed}`;}
function mailUrl(value:string){return value?`mailto:${value}`:'';}
function phoneUrl(value:string){return value?`tel:${value.replace(/[^+\d]/g,'')}`:'';}
function formatDate(value:string){if(!value)return 'Not available';const d=new Date(value);return Number.isNaN(d.getTime())?'Not available':d.toLocaleDateString();}
function formatDateTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString();}

export default function AgencyDetail(){
  const {id}=useParams();
  const {get,addContact,addActivity,reassign,release,updateChannel}=useAgencyStore();
  const {role}=usePortfolioStore();
  const agency=get(id||'');
  const [panel,setPanel]=useState<'contact'|'activity'|null>(null);
  const [activityKind,setActivityKind]=useState<'call'|'email'|'note'>('call');

  const timeline=useMemo(()=>{
    if(!agency)return [];
    const imported:AgencyActivity={id:`imported-${agency.id}`,type:'note',disposition:'Agency imported',notes:'Added to My Agencies from prospect discovery.',occurredAt:agency.createdAt,employeeName:agency.ownerEmployeeName};
    return [imported,...agency.activities].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
  },[agency]);


  const back=role==='owner'?'/agencies':'/employee/agencies';
  if(!agency)return <div className="p-10">Agency not found.</div>;

  const websiteHref=externalUrl(agency.website);
  const fullLocation=agency.address||[agency.city,agency.state].filter(Boolean).join(', ');
  const mapsHref=agency.sourceUrl?externalUrl(agency.sourceUrl):(fullLocation?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullLocation)}`:'');
  const namedDecisionMaker=agency.contacts.some(c=>c.decisionMaker||((c.firstName||'').toLowerCase()!=='general'&&Boolean(c.lastName)));
  const hasFollowUp=agency.activities.some(a=>Boolean(a.followUpAt)&&!a.completedAt&&new Date(a.followUpAt as string).getTime()>=Date.now()-86400000);
  const scoreItems=[
    {label:'Main phone',complete:Boolean(agency.phone)},
    {label:'General email',complete:Boolean(agency.generalEmail)},
    {label:'Website',complete:Boolean(agency.website)},
    {label:'Full address',complete:Boolean(agency.address)},
    {label:'Named decision-maker',complete:namedDecisionMaker},
    {label:'Activity logged',complete:agency.activities.length>0},
    {label:'Follow-up scheduled',complete:hasFollowUp},
  ];
  const weights=[15,15,15,15,20,10,10];
  const relationshipScore=scoreItems.reduce((total,item,index)=>total+(item.complete?weights[index]:0),0);
  const scoreLabel=relationshipScore>=80?'Strong':relationshipScore>=55?'Developing':'Building';


  return <div className="mx-auto max-w-[1380px] p-5 md:p-8 lg:p-10">
    <Link to={back} className="mb-6 inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="mr-2" size={17}/>Agency directory</Link>

    <header className="mb-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone="blue">{agency.status.replace(/_/g,' ')}</Pill>
            {(agency.category||agency.city||agency.state)&&<span className="text-sm text-slate-500">{agency.category||[agency.city,agency.state].filter(Boolean).join(', ')}</span>}
            {agency.rating!=null&&<span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600"><Star size={15} fill="currentColor"/>{agency.rating.toFixed(1)}{agency.reviewCount!=null&&<span className="font-normal text-slate-400">({agency.reviewCount.toLocaleString()} reviews)</span>}</span>}
          </div>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{agency.name}</h1>
          {fullLocation&&<p className="mt-3 flex items-start gap-2 text-sm text-slate-500"><MapPin className="mt-0.5 shrink-0" size={16}/><span>{fullLocation}</span></p>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap xl:max-w-[660px] xl:justify-end">
          {websiteHref&&<ActionLink href={websiteHref} icon={<Globe2 size={17}/>} label="Visit website" external primary/>}
          {mapsHref&&<ActionLink href={mapsHref} icon={<MapPin size={17}/>} label="Google Maps" external/>}
          {agency.phone&&<button onClick={()=>{setActivityKind('call');setPanel('activity')}} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-600"><Phone size={17}/><span className="ml-2">Call & log</span></button>}
          {agency.generalEmail&&<button onClick={()=>{setActivityKind('email');setPanel('activity')}} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-600"><Mail size={17}/><span className="ml-2">Email & log</span></button>}
          <SecondaryButton onClick={()=>setPanel('contact')}><Plus className="mr-2" size={17}/>Add contact</SecondaryButton>
          <PrimaryButton onClick={()=>setPanel('activity')}><MessageSquareText className="mr-2" size={17}/>Log activity</PrimaryButton>
        </div>
      </div>
    </header>

    {panel==='contact'&&<div className="mb-6"><ContactForm agencyId={agency.id} done={()=>setPanel(null)} add={addContact}/></div>}
    {panel==='activity'&&<div className="mb-6"><ActivityForm agency={agency} initialType={activityKind} done={()=>setPanel(null)} add={addActivity}/></div>}

    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <div className="space-y-6">
        <Card className="overflow-hidden border-blue-200">
          <div className="bg-[#091221] p-6 text-white md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-300">Agency action center</p><h2 className="mt-2 text-2xl font-semibold">Move this relationship forward</h2><p className="mt-2 text-sm text-slate-300">Every outreach action must create a next step or close the relationship.</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4"><p className="text-xs uppercase tracking-wide text-slate-400">Current stage</p><p className="mt-1 text-lg font-semibold capitalize">{agency.status.replace(/_/g,' ')}</p></div>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-3 md:p-6">
            <button disabled={!agency.phone||agency.phoneStatus!=='active'} onClick={()=>{setActivityKind('call');setPanel('activity')}} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><Phone className="text-blue-600" size={20}/><p className="mt-3 font-semibold">Call agency</p><p className="mt-1 truncate text-sm text-slate-500">{agency.phoneStatus!=='active'?`Phone ${agency.phoneStatus.replace(/_/g,' ')}`:(agency.phone||'No phone available')}</p></button>
            <button disabled={!agency.generalEmail||agency.generalEmailStatus!=='active'} onClick={()=>{setActivityKind('email');setPanel('activity')}} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><Mail className="text-blue-600" size={20}/><p className="mt-3 font-semibold">Email agency</p><p className="mt-1 truncate text-sm text-slate-500">{agency.generalEmailStatus!=='active'?`Email ${agency.generalEmailStatus.replace(/_/g,' ')}`:(agency.generalEmail||'No email available')}</p></button>
            <button onClick={()=>{setActivityKind('note');setPanel('activity')}} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"><CalendarClock className="text-blue-600" size={20}/><p className="mt-3 font-semibold">Schedule next action</p><p className="mt-1 text-sm text-slate-500">Create a dated follow-up</p></button>
          </div>
        </Card>

        <Card className="p-6 md:p-8">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Building2 size={22}/></div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Company profile</p><h2 className="mt-1 text-xl font-semibold">Business information</h2></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InfoRow icon={<Globe2 size={19}/>} label="Website" value={agency.website} href={websiteHref} external/>
            <InfoRow icon={<Mail size={19}/>} label="General email" value={agency.generalEmail} href={mailUrl(agency.generalEmail)}/>
            <InfoRow icon={<Phone size={19}/>} label="Main phone" value={agency.phone} href={phoneUrl(agency.phone)}/>
            <InfoRow icon={<MapPin size={19}/>} label="Business address" value={fullLocation} href={mapsHref} external/>
            <InfoRow icon={<Building2 size={19}/>} label="Category" value={agency.category}/>
            <InfoRow icon={<Star size={19}/>} label="Google reputation" value={agency.rating!=null?`${agency.rating.toFixed(1)} stars${agency.reviewCount!=null?` · ${agency.reviewCount.toLocaleString()} reviews`:''}`:''}/>
            {agency.sourceUrl&&<InfoRow icon={<ExternalLink size={19}/>} label="Source record" value="Open original Google Maps listing" href={externalUrl(agency.sourceUrl)} external/>}
            <InfoRow icon={<CalendarClock size={19}/>} label="Added to pipeline" value={formatDate(agency.createdAt)}/>
          </div>
          {role==='owner'&&<div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <SecondaryButton onClick={async()=>{const value=prompt('Edit main phone',agency.phone);if(value!==null)await updateChannel(agency.id,undefined,'phone',value,value?'active':'archived','Owner edited agency phone')}}>Edit main phone</SecondaryButton>
            <SecondaryButton onClick={async()=>{const value=prompt('Edit general email',agency.generalEmail);if(value!==null)await updateChannel(agency.id,undefined,'email',value,value?'active':'archived','Owner edited agency email')}}>Edit general email</SecondaryButton>
          </div>}
        </Card>

        <Card className="p-6 md:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">People</p><h2 className="mt-1 text-xl font-semibold">Contacts and decision-makers</h2></div><span className="text-sm text-slate-400">{agency.contacts.length} contact{agency.contacts.length===1?'':'s'}</span></div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">{agency.contacts.length?agency.contacts.map(c=><div key={c.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-5"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm"><UserRound size={21}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{[c.firstName,c.lastName].filter(Boolean).join(' ')||'General contact'}</p>{c.decisionMaker&&<Pill tone="success">Decision-maker</Pill>}</div><p className="mt-1 text-sm text-slate-500">{c.title||'Contact'}</p></div></div><div className="mt-5 space-y-2">{c.email&&<div className="flex items-center gap-2"><div className="min-w-0 flex-1"><MiniLink href={c.emailStatus==='active'?mailUrl(c.email):'#'} icon={<Mail size={15}/>} label={c.email}/></div><Pill tone={c.emailStatus==='active'?'success':'warning'}>{c.emailStatus.replace(/_/g,' ')}</Pill></div>}{c.phone&&<div className="flex items-center gap-2"><div className="min-w-0 flex-1"><MiniLink href={c.phoneStatus==='active'?phoneUrl(c.phone):'#'} icon={<Phone size={15}/>} label={c.phone}/></div><Pill tone={c.phoneStatus==='active'?'success':'warning'}>{c.phoneStatus.replace(/_/g,' ')}</Pill></div>}</div>{c.emailBounceCount>0&&<p className="mt-3 text-xs font-medium text-amber-700">{c.emailBounceCount} email bounce{c.emailBounceCount===1?'':'s'} recorded</p>}{role==='owner'&&<div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4"><button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm" onClick={async()=>{const value=prompt('Edit contact email',c.email);if(value!==null)await updateChannel(agency.id,c.id,'email',value,value?'active':'archived','Owner edited contact email')}}>Edit email</button><button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm" onClick={async()=>{const value=prompt('Edit contact phone',c.phone);if(value!==null)await updateChannel(agency.id,c.id,'phone',value,value?'active':'archived','Owner edited contact phone')}}>Edit phone</button><button className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" onClick={async()=>{if(confirm('Remove this email from future sending?'))await updateChannel(agency.id,c.id,'email',c.email,'archived','Owner archived email')}}>Remove email</button><button className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" onClick={async()=>{if(confirm('Remove this phone from future calling?'))await updateChannel(agency.id,c.id,'phone',c.phone,'archived','Owner archived phone')}}>Remove phone</button></div>}</div>):<Empty text="No contacts yet. Add the first decision-maker or general contact."/>}</div>
        </Card>

        <Card className="p-6 md:p-8">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">History</p><h2 className="mt-1 text-xl font-semibold">Relationship timeline</h2></div>
          <div className="mt-6 space-y-0">{timeline.map((a,index)=><div key={a.id} className="relative flex gap-4 pb-7 last:pb-0"><div className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-4 border-white bg-blue-100 text-blue-700">{a.type==='call'?<Phone size={14}/>:a.type==='email'?<Mail size={14}/>:<MessageSquareText size={14}/>}</div>{index<timeline.length-1&&<div className="absolute left-[17px] top-8 h-full w-px bg-slate-200"/>}<div className="min-w-0 flex-1 pt-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{a.disposition}</p><span className="text-xs text-slate-400">{formatDateTime(a.occurredAt)}</span></div>{a.notes&&<p className="mt-1 text-sm leading-6 text-slate-500">{a.notes}</p>}<div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">{a.employeeName&&<span>Employee: {a.employeeName}</span>}{a.followUpAt&&<span className="font-semibold text-blue-600">Follow up {formatDateTime(a.followUpAt)}</span>}</div></div></div>)}</div>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card className="p-6">
          <div className="flex gap-3"><ShieldCheck className="text-blue-600"/><div><p className="font-semibold">Working ownership</p><p className="mt-1 text-sm text-slate-500">{agency.ownerEmployeeName}</p></div></div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Protected until</p><p className="mt-1 text-lg font-semibold">{formatDate(agency.ownershipExpiresAt)}</p></div>
          {role==='owner'&&<div className="mt-4 grid gap-3"><SecondaryButton onClick={()=>{const name=prompt('Reassign to employee name');if(name)reassign(agency.id,name)}}>Reassign agency</SecondaryButton><SecondaryButton onClick={()=>release(agency.id)}>Release ownership</SecondaryButton></div>}
        </Card>

        <Card className="p-6">
          <p className="text-sm font-medium text-slate-500">Relationship score</p>
          <div className="mt-3 flex items-end justify-between"><div><p className="text-4xl font-semibold tracking-tight">{relationshipScore}<span className="text-xl text-slate-400">/100</span></p><p className="mt-1 font-semibold text-blue-600">{scoreLabel}</p></div><div className="grid h-16 w-16 place-items-center rounded-full bg-blue-50 text-lg font-semibold text-blue-700">{relationshipScore}%</div></div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${relationshipScore}%`}}/></div>
          <div className="mt-5 space-y-3">{scoreItems.map(item=><div key={item.label} className="flex items-center justify-between gap-3 text-sm"><span className={item.complete?'text-slate-700':'text-slate-400'}>{item.label}</span><span className={`grid h-5 w-5 place-items-center rounded-full ${item.complete?'bg-emerald-100 text-emerald-700':'border border-slate-200 text-transparent'}`}>{item.complete&&<Check size={13}/>}</span></div>)}</div>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Next best action</p>
          <h3 className="mt-2 text-xl font-semibold">{!namedDecisionMaker?'Find a decision-maker':agency.activities.length===0?'Start outreach':!hasFollowUp?'Schedule a follow-up':'Continue the relationship'}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{!namedDecisionMaker?'The general contact is saved. Add the owner, president, recovery manager, or portfolio buyer next.':agency.activities.length===0?'Use the phone or email above, then log the result so the relationship stays visible.':!hasFollowUp?'Add a dated follow-up so this agency does not fall out of the pipeline.':'Your next follow-up is already in the system.'}</p>
          <PrimaryButton className="mt-5 w-full" onClick={()=>setPanel(!namedDecisionMaker?'contact':'activity')}>{!namedDecisionMaker?'Add decision-maker':'Log next action'}</PrimaryButton>
        </Card>
      </aside>
    </div>
  </div>;
}

function ActionLink({href,icon,label,external=false,primary=false}:{href:string;icon:ReactNode;label:string;external?:boolean;primary?:boolean}){return <a href={href} target={external?'_blank':undefined} rel={external?'noreferrer':undefined} className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${primary?'bg-blue-600 text-white hover:bg-blue-700':'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-600'}`}>{icon}<span className="ml-2">{label}</span>{external&&<ExternalLink className="ml-2" size={13}/>}</a>;}
function MiniLink({href,icon,label}:{href:string;icon:ReactNode;label:string}){return <a href={href} className="flex min-w-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-blue-600"><span className="shrink-0">{icon}</span><span className="truncate">{label}</span></a>;}
function InfoRow({icon,label,value,href,external=false}:{icon:ReactNode;label:string;value:string;href?:string;external?:boolean}){return <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="mt-0.5 text-blue-600">{icon}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>{value?(href?<a href={href} target={external?'_blank':undefined} rel={external?'noreferrer':undefined} className="mt-1 inline-flex max-w-full items-center gap-1 break-words font-medium text-slate-800 hover:text-blue-600 hover:underline">{value}{external&&<ExternalLink className="shrink-0" size={13}/>}</a>:<p className="mt-1 break-words font-medium text-slate-800">{value}</p>):<p className="mt-1 text-sm text-slate-400">Not available</p>}</div></div>;}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">{text}</div>;}

function ContactForm({agencyId,done,add}:{agencyId:string;done:()=>void;add:ReturnType<typeof useAgencyStore>['addContact']}){async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await add(agencyId,{firstName:String(f.get('first')),lastName:String(f.get('last')),title:String(f.get('title')),email:String(f.get('email')),phone:String(f.get('phone')),decisionMaker:f.get('decision')==='on'});done();}return <Card className="p-6"><h3 className="text-xl font-semibold">Add contact</h3><form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2"><input className={input} name="first" required placeholder="First name"/><input className={input} name="last" placeholder="Last name"/><input className={input} name="title" required placeholder="Job title"/><input className={input} name="email" type="email" placeholder="Email"/><input className={input} name="phone" placeholder="Direct phone"/><label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4"><input name="decision" type="checkbox"/> Decision-maker</label><div className="flex gap-3 md:col-span-2 md:justify-end"><SecondaryButton type="button" onClick={done}>Cancel</SecondaryButton><PrimaryButton>Save contact</PrimaryButton></div></form></Card>;}
function ActivityForm({agency,initialType,done,add}:{agency:ReturnType<typeof useAgencyStore>['agencies'][number];initialType:'call'|'email'|'note';done:()=>void;add:ReturnType<typeof useAgencyStore>['addActivity']}){
  const [type,setType]=useState<'call'|'email'|'note'>(initialType);
  const [disposition,setDisposition]=useState(initialType==='email'?'Email sent':initialType==='note'?'Follow-up required':'No answer');
  const [error,setError]=useState('');
  const closing=['Closed','Not interested','Do not contact'].includes(disposition);
  const options=type==='call'
    ?['No answer','Left voicemail','Reached receptionist','Reached decision-maker','Requested information','Call back later','Wrong number','Qualified','Negotiating','Not interested','Do not contact']
    :type==='email'
      ?['Email drafted','Email sent','Email replied','Hard bounce','Soft bounce','Follow-up required','Requested information','Portfolio sent','Qualified','Negotiating','Offer submitted','Not interested','Do not contact']
      :['Follow-up required','Requested information','Portfolio sent','Qualified','Negotiating','Offer submitted','Closed','Not interested','Do not contact'];
  const stages:{value:AgencyStatus;label:string}[]=[
    {value:'new',label:'New'},{value:'researching',label:'Researching'},{value:'contacted',label:'Contacted'},{value:'qualified',label:'Qualified'},{value:'portfolio_sent',label:'Portfolio sent'},{value:'negotiating',label:'Negotiating'},{value:'offer_submitted',label:'Offer submitted'},{value:'closed',label:'Closed'},{value:'not_interested',label:'Not interested'},{value:'do_not_contact',label:'Do not contact'},
  ];
  function changeType(next:'call'|'email'|'note'){setType(next);const first=next==='call'?'No answer':next==='email'?'Email sent':'Follow-up required';setDisposition(first);}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');const f=new FormData(e.currentTarget);const followUp=String(f.get('followUp')||'');
    if(!closing&&!followUp){setError('Schedule the next action or choose a closing outcome.');return;}
    try{await add(agency.id,{type,disposition,notes:String(f.get('notes')),subject:String(f.get('subject')||''),contactId:String(f.get('contact')||'')||undefined,followUpAt:followUp?new Date(followUp).toISOString():undefined,stage:String(f.get('stage')) as AgencyStatus});done();}catch(reason){setError(reason instanceof Error?reason.message:'Unable to save activity.');}
  }
  return <Card className="border-blue-200 p-6 md:p-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Action center</p><h3 className="mt-1 text-2xl font-semibold">Record the outcome</h3><p className="mt-1 text-sm text-slate-500">Contact the agency, capture what happened, and lock in the next move.</p></div>{type==='call'&&agency.phone&&<a href={phoneUrl(agency.phone)} className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"><Phone className="mr-2" size={17}/>Call {agency.phone}</a>}{type==='email'&&agency.generalEmail&&<a href={mailUrl(agency.generalEmail)} className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"><Mail className="mr-2" size={17}/>Open email</a>}</div>
    <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium text-slate-600">Activity type<select className={`${input} mt-2`} value={type} onChange={e=>changeType(e.target.value as 'call'|'email'|'note')}><option value="call">Call</option><option value="email">Email</option><option value="note">Note / follow-up</option></select></label>
      <label className="text-sm font-medium text-slate-600">Outcome<select className={`${input} mt-2`} value={disposition} onChange={e=>setDisposition(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-600">Contact<select className={`${input} mt-2`} name="contact"><option value="">General agency contact</option>{agency.contacts.map(c=><option key={c.id} value={c.id}>{[c.firstName,c.lastName].filter(Boolean).join(' ')}{c.title?` — ${c.title}`:''}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-600">Relationship stage<select className={`${input} mt-2`} name="stage" defaultValue={agency.status}>{stages.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-600 md:col-span-2">Subject<input className={`${input} mt-2`} name="subject" placeholder={type==='email'?'Email subject':'Purpose of this contact'}/></label>
      <label className="text-sm font-medium text-slate-600 md:col-span-2">Outcome notes<textarea className={`${input} mt-2 min-h-28`} name="notes" required placeholder="What happened, what did they say, and what matters for the next contact?"/></label>
      <label className="text-sm font-medium text-slate-600 md:col-span-2">Next action date{!closing&&<span className="ml-2 text-xs font-semibold text-red-500">Required unless relationship is closed</span>}<input className={`${input} mt-2`} name="followUp" type="datetime-local" disabled={closing}/></label>
      {error&&<p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2">{error}</p>}
      <div className="flex gap-3 md:col-span-2 md:justify-end"><SecondaryButton type="button" onClick={done}>Cancel</SecondaryButton><PrimaryButton>Save outcome and next action</PrimaryButton></div>
    </form>
  </Card>;
}
