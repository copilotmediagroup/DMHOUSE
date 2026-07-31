import {AlarmClock, AlertTriangle, ArrowRight, CalendarCheck2, CalendarClock, CheckCircle2, Clock3, MessageSquareText, RefreshCw, RotateCcw, UserRound} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Card, Pill, PrimaryButton, SecondaryButton, inputClass} from '../components/Primitives';
import {useConversationStore, type Conversation} from '../store/ConversationStore';
import {useAgencyStore} from '../store/AgencyStore';
import {usePortfolioStore} from '../store/PortfolioStore';

const DAY=86400000;
const label=(value?:string)=>value?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Not scheduled';
const statusLabel=(value:string)=>value.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

type Bucket='overdue'|'today'|'upcoming'|'noReply';

export default function FollowUpIntelligence(){
 const {conversations,employees,setWorkflow,refresh,loading}=useConversationStore();
 const {agencies}=useAgencyStore();
 const {profile}=usePortfolioStore();
 const navigate=useNavigate();
 const [bucket,setBucket]=useState<Bucket>('overdue');
 const [busy,setBusy]=useState<string>('');
 const [notice,setNotice]=useState('');
 const now=new Date();
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
 const end=start+DAY;
 const active=conversations.filter(c=>c.status!=='closed');
 const groups=useMemo(()=>({
  overdue:active.filter(c=>c.nextFollowUpAt&&new Date(c.nextFollowUpAt).getTime()<start),
  today:active.filter(c=>c.nextFollowUpAt&&new Date(c.nextFollowUpAt).getTime()>=start&&new Date(c.nextFollowUpAt).getTime()<end),
  upcoming:active.filter(c=>c.nextFollowUpAt&&new Date(c.nextFollowUpAt).getTime()>=end),
  noReply:active.filter(c=>c.lastOutboundAt&&(!c.lastInboundAt||new Date(c.lastOutboundAt)>new Date(c.lastInboundAt))&&Date.now()-new Date(c.lastOutboundAt).getTime()>=5*DAY)
 }),[conversations,start,end]);
 const selected=groups[bucket];
 const employeeLoad=employees.map(e=>({employee:e,items:active.filter(c=>c.assignedEmployeeId===e.id&&c.nextFollowUpAt),overdue:groups.overdue.filter(c=>c.assignedEmployeeId===e.id).length})).sort((a,b)=>b.overdue-a.overdue||b.items.length-a.items.length);
 async function complete(c:Conversation){setBusy(c.id);setNotice('');try{await setWorkflow(c.id,{clearFollowUp:true,status:c.status==='waiting_on_buyer'?'open':c.status});setNotice('Follow-up completed. The conversation is ready for its next action.')}catch(e){setNotice(e instanceof Error?e.message:'Unable to complete follow-up.')}finally{setBusy('')}}
 async function reschedule(c:Conversation,days:number){setBusy(c.id);setNotice('');const d=new Date();d.setDate(d.getDate()+days);d.setHours(10,0,0,0);try{await setWorkflow(c.id,{nextFollowUpAt:d.toISOString(),status:'waiting_on_buyer'});setNotice(`Follow-up rescheduled for ${label(d.toISOString())}.`)}catch(e){setNotice(e instanceof Error?e.message:'Unable to reschedule follow-up.')}finally{setBusy('')}}
 const counts={overdue:groups.overdue.length,today:groups.today.length,upcoming:groups.upcoming.length,noReply:groups.noReply.length};
 return <div className="mx-auto max-w-[1600px] p-5 md:p-8 lg:p-10">
  <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold text-blue-600">Follow-Up Intelligence Engine · v1.6.3</p><h2 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Never let a buyer go cold.</h2><p className="mt-2 text-slate-500">Every active conversation should have a clear next action, owner and due date.</p></div><PrimaryButton onClick={()=>refresh()} disabled={loading}><RefreshCw size={17} className={`mr-2 ${loading?'animate-spin':''}`}/>Refresh follow-ups</PrimaryButton></header>
  {notice&&<div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">{notice}</div>}
  <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <Metric active={bucket==='overdue'} onClick={()=>setBucket('overdue')} icon={AlertTriangle} title="Overdue" value={counts.overdue} subtitle="Past the promised follow-up" tone="danger"/>
   <Metric active={bucket==='today'} onClick={()=>setBucket('today')} icon={CalendarCheck2} title="Due today" value={counts.today} subtitle="Requires action before day end" tone="blue"/>
   <Metric active={bucket==='upcoming'} onClick={()=>setBucket('upcoming')} icon={CalendarClock} title="Upcoming" value={counts.upcoming} subtitle="Scheduled future actions" tone="neutral"/>
   <Metric active={bucket==='noReply'} onClick={()=>setBucket('noReply')} icon={Clock3} title="No reply in 5+ days" value={counts.noReply} subtitle="Buyer has not answered" tone="warning"/>
  </div>
  <div className="mt-7 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
   <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-6"><div><p className="text-sm text-slate-500">Current action queue</p><h3 className="mt-1 text-xl font-semibold">{bucket==='overdue'?'Overdue follow-ups':bucket==='today'?'Today’s follow-ups':bucket==='upcoming'?'Upcoming follow-ups':'No reply in 5+ days'}</h3></div><Pill tone={bucket==='overdue'?'danger':bucket==='today'?'blue':bucket==='noReply'?'warning':'neutral'}>{selected.length}</Pill></div>
    {selected.length===0?<div className="grid min-h-72 place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto text-emerald-600" size={34}/><p className="mt-3 font-semibold">Queue clear</p><p className="mt-1 text-sm text-slate-500">No conversations currently match this rule.</p></div></div>:<div className="divide-y divide-slate-100">{selected.map(c=>{const agency=agencies.find(a=>a.id===c.agencyId);const employee=employees.find(e=>e.id===c.assignedEmployeeId);return <div key={c.id} className="p-5 md:p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{agency?.name||'Agency'}</h4><Pill tone={c.priority==='urgent'?'danger':c.priority==='high'?'warning':'neutral'}>{c.priority} priority</Pill><Pill tone="neutral">{statusLabel(c.status)}</Pill></div><p className="mt-2 line-clamp-1 text-sm text-slate-500">{c.subject||'Company conversation'}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><UserRound size={14}/>{employee?.name||'Unassigned'}</span><span className="flex items-center gap-1.5"><AlarmClock size={14}/>{c.nextFollowUpAt?label(c.nextFollowUpAt):'No follow-up scheduled'}</span></div></div><button onClick={()=>navigate(`${profile?.role==='owner'?'/conversations':'/employee/conversations'}?conversation=${c.id}`)} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">Open conversation <ArrowRight size={16}/></button></div>
      <div className="mt-4 flex flex-wrap gap-2"><SecondaryButton disabled={busy===c.id} onClick={()=>complete(c)}><CheckCircle2 className="mr-2" size={16}/>Mark complete</SecondaryButton><SecondaryButton disabled={busy===c.id} onClick={()=>reschedule(c,1)}><RotateCcw className="mr-2" size={16}/>Tomorrow</SecondaryButton><SecondaryButton disabled={busy===c.id} onClick={()=>reschedule(c,3)}>In 3 days</SecondaryButton><SecondaryButton disabled={busy===c.id} onClick={()=>reschedule(c,7)}>In 7 days</SecondaryButton></div></div>})}</div>}
   </Card>
   <div className="space-y-6"><Card className="p-6"><p className="text-sm text-slate-500">Follow-up standard</p><h3 className="mt-1 text-xl font-semibold">One next action</h3><div className="mt-5 space-y-4 text-sm text-slate-600"><Rule icon={MessageSquareText} title="After every buyer contact" text="Set the next follow-up before leaving the conversation."/><Rule icon={CalendarClock} title="Waiting on buyer" text="Use a due date so the relationship never disappears from view."/><Rule icon={AlertTriangle} title="Overdue work" text="Complete it, reschedule it, or hand it to the owner."/></div></Card>
    {profile?.role==='owner'&&<Card className="overflow-hidden"><div className="border-b border-slate-100 p-6"><p className="text-sm text-slate-500">Team workload</p><h3 className="mt-1 text-xl font-semibold">Employee follow-up pressure</h3></div>{employeeLoad.length===0?<p className="p-6 text-sm text-slate-500">No employees available.</p>:<div className="divide-y divide-slate-100">{employeeLoad.map(x=><div key={x.employee.id} className="flex items-center justify-between p-5"><div><p className="font-semibold">{x.employee.name}</p><p className="mt-1 text-xs text-slate-500">{x.items.length} scheduled follow-up{x.items.length===1?'':'s'}</p></div><Pill tone={x.overdue>0?'danger':'success'}>{x.overdue} overdue</Pill></div>)}</div>}</Card>}
   </div>
  </div>
 </div>
}

function Metric({active,onClick,icon:Icon,title,value,subtitle,tone}:{active:boolean;onClick:()=>void;icon:any;title:string;value:number;subtitle:string;tone:'danger'|'blue'|'warning'|'neutral'}){return <button onClick={onClick} className="text-left"><Card className={`h-full p-5 transition ${active?'border-blue-300 ring-4 ring-blue-500/10':'hover:-translate-y-0.5 hover:border-blue-200'}`}><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-slate-600">{title}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div><Pill tone={tone}>{<Icon size={16}/>}</Pill></div><p className="mt-3 text-xs text-slate-500">{subtitle}</p></Card></button>}
function Rule({icon:Icon,title,text}:{icon:any;title:string;text:string}){return <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100"><Icon size={18}/></div><div><p className="font-semibold text-slate-800">{title}</p><p className="mt-1 leading-5">{text}</p></div></div>}
