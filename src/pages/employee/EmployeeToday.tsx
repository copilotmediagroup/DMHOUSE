import { AlertTriangle, ArrowRight, BriefcaseBusiness, Clock3, Mail, Phone, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { usePortfolioStore } from '../../store/PortfolioStore';
import { useAgencyStore } from '../../store/AgencyStore';
import { useExecutionStore } from '../../store/ExecutionStore';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
function startOfDay(){const d=new Date();d.setHours(0,0,0,0);return d.getTime()}
function endOfDay(){const d=new Date();d.setHours(23,59,59,999);return d.getTime()}
export default function EmployeeToday(){
  const {active}=usePortfolioStore();const {profile}=usePortfolioStore();const {agencies,currentEmployee}=useAgencyStore();const {items:interventions}=useExecutionStore();
  const mine=agencies.filter(a=>a.ownerEmployeeId===currentEmployee.id);
  const open=mine.flatMap(a=>a.activities.filter(x=>x.followUpAt&&!x.completedAt).map(x=>({agency:a,activity:x,due:new Date(x.followUpAt as string).getTime()}))).sort((a,b)=>a.due-b.due);
  const today=open.filter(x=>x.due>=startOfDay()&&x.due<=endOfDay());
  const overdue=open.filter(x=>x.due<startOfDay());
  const untouched=mine.filter(a=>a.activities.length===0);
  const awaiting=mine.filter(a=>a.status==='contacted'&&!a.activities.some(x=>x.followUpAt&&!x.completedAt));
  const offers=mine.filter(a=>a.status==='offer_submitted'||a.status==='negotiating');
  const myInterventions=interventions.filter(x=>x.assignedTo===profile?.id&&!['completed','cancelled'].includes(x.status));
  const overdueInterventions=myInterventions.filter(x=>x.dueAt&&new Date(x.dueAt).getTime()<Date.now());
  const priority=overdue[0]||today[0]||open[0];
  return <div className="mx-auto max-w-7xl p-5 md:p-8 lg:p-10">
    <header className="mb-8"><p className="text-sm font-semibold text-blue-600">Employee mission</p><h2 className="mt-1 text-3xl font-semibold">Today</h2><p className="mt-2 text-slate-500">Calls, emails, and follow-ups are ordered by what needs action now.</p></header>
    {priority&&<Card className={`mb-6 flex flex-col gap-4 p-6 md:flex-row md:items-center ${overdue.includes(priority)?'border-red-200':'border-blue-200'}`}><div className={`grid h-12 w-12 place-items-center rounded-2xl ${overdue.includes(priority)?'bg-red-50 text-red-600':'bg-blue-50 text-blue-600'}`}>{overdue.includes(priority)?<AlertTriangle/>:<Clock3/>}</div><div className="flex-1"><p className={`text-xs font-semibold uppercase tracking-wider ${overdue.includes(priority)?'text-red-600':'text-blue-600'}`}>{overdue.includes(priority)?'Overdue priority':'Priority action'}</p><p className="mt-1 text-lg font-semibold">Follow up with {priority.agency.name}</p><p className="mt-1 text-sm text-slate-500">{priority.activity.disposition} · Due {new Date(priority.activity.followUpAt as string).toLocaleString()}</p></div><Link to={`/employee/agencies/${priority.agency.id}`}><PrimaryButton>Open agency<ArrowRight className="ml-2" size={17}/></PrimaryButton></Link></Card>}
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Queue label="Calls due today" value={today.filter(x=>x.activity.type==='call').length} icon={<Phone size={18}/>} tone="blue"/>
      <Queue label="Emails due today" value={today.filter(x=>x.activity.type==='email').length} icon={<Mail size={18}/>} tone="blue"/>
      <Queue label="Overdue" value={overdue.length} icon={<AlertTriangle size={18}/>} tone="red"/>
      <Queue label="Never contacted" value={untouched.length} icon={<Search size={18}/>} tone="slate"/>
      <Queue label="Awaiting response" value={awaiting.length} icon={<Clock3 size={18}/>} tone="slate"/>
      <Queue label="Assigned interventions" value={myInterventions.length} icon={<BriefcaseBusiness size={18}/>} tone={overdueInterventions.length?'red':'slate'}/>
      <Queue label="Offer action" value={offers.length} icon={<BriefcaseBusiness size={18}/>} tone="slate"/>
    </div>
    {active?<Card className="overflow-hidden"><div className="bg-[#091221] p-7 text-white md:p-10"><Pill tone="success">Active portfolio</Pill><h3 className="mt-5 text-3xl font-semibold">{active.name}</h3><p className="mt-2 max-w-2xl text-slate-300">{active.description}</p><div className="mt-8 flex flex-wrap gap-8"><div><p className="text-xs uppercase tracking-wider text-slate-400">Accounts</p><p className="mt-1 text-2xl font-semibold">{active.accountCount.toLocaleString()}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Asking price</p><p className="mt-1 text-2xl font-semibold">{money(active.askingPrice)}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Owned agencies</p><p className="mt-1 text-2xl font-semibold">{mine.length}</p></div></div></div><div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8"><div><p className="font-semibold">{mine.length?'Continue buyer outreach':'Build your buyer pipeline'}</p><p className="mt-1 text-sm text-slate-500">{mine.length?'Work the highest-priority relationship and record the next action.':'Find a qualified collection agency for this portfolio.'}</p></div><div className="flex gap-3">{mine.length&&<Link to="/employee/follow-ups"><SecondaryButton><Clock3 className="mr-2" size={18}/>Open queue</SecondaryButton></Link>}<Link to="/employee/prospect"><PrimaryButton><Search className="mr-2" size={18}/>Start prospecting</PrimaryButton></Link></div></div></Card>:<Card className="grid min-h-96 place-items-center p-8 text-center"><div><BriefcaseBusiness className="mx-auto text-slate-300" size={48}/><h3 className="mt-5 text-2xl font-semibold">No campaign is active</h3><p className="mt-2 text-slate-500">The owner is preparing the next portfolio.</p></div></Card>}
  </div>
}
function Queue({label,value,icon,tone}:{label:string;value:number;icon:ReactNode;tone:'blue'|'red'|'slate'}){const style=tone==='red'?'bg-red-50 text-red-600':tone==='blue'?'bg-blue-50 text-blue-600':'bg-slate-100 text-slate-600';return <Card className="p-5"><div className={`grid h-9 w-9 place-items-center rounded-xl ${style}`}>{icon}</div><p className="mt-4 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></Card>}
