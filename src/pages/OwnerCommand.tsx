import {RefreshCw} from 'lucide-react';
import {useMemo} from 'react';
import {PrimaryButton} from '../components/Primitives';
import ExecutiveActivityFeed from '../components/executive/ExecutiveActivityFeed';
import ExecutiveForecastPanel from '../components/executive/ExecutiveForecastPanel';
import ExecutiveMetricGrid from '../components/executive/ExecutiveMetricGrid';
import ExecutiveQueuePanel from '../components/executive/ExecutiveQueuePanel';
import type {ExecutiveActivity,ExecutiveMetric,ExecutiveQueueItem,ForecastStage} from '../components/executive/types';
import {useAgencyStore} from '../store/AgencyStore';
import {useApprovalStore} from '../store/ApprovalStore';
import {useClosingStore} from '../store/ClosingStore';
import {useConversationStore} from '../store/ConversationStore';
import {useNegotiationStore} from '../store/NegotiationStore';
import {PIPELINE_STAGES,usePipelineStore} from '../store/PipelineStore';
import {usePerformanceStore} from '../store/PerformanceStore';
import {useRevenueStore} from '../store/RevenueStore';
import {useTransactionAutomation} from '../store/TransactionAutomationStore';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const title=(v:string)=>v.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const dayMs=86400000;
const startOfDay=(d=new Date())=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
const isSince=(value:string|undefined,time:number)=>Boolean(value&&new Date(value).getTime()>=time);
const daysUntil=(value?:string)=>value?Math.ceil((new Date(value).getTime()-Date.now())/dayMs):999;

export default function OwnerCommand(){
 const pipeline=usePipelineStore();const negotiation=useNegotiationStore();const approval=useApprovalStore();const closing=useClosingStore();const revenue=useRevenueStore();const performance=usePerformanceStore();const automation=useTransactionAutomation();const agency=useAgencyStore();const conversation=useConversationStore();
 const loading=pipeline.loading||negotiation.loading||approval.loading||closing.loading||revenue.loading||performance.loading||automation.loading||agency.loading||conversation.loading;
 const refresh=async()=>{await Promise.all([pipeline.refresh(),negotiation.refresh(),approval.refresh(),closing.refresh(),revenue.refresh(),performance.refresh(),automation.refresh(),agency.refresh(),conversation.refresh()])};
 const vm=useMemo(()=>{
  const today=startOfDay();const week=today-6*dayMs;const month=new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime();
  const openStages=new Set(PIPELINE_STAGES.filter(s=>!['closed_won','closed_lost'].includes(s)));
  const activeDeals=pipeline.opportunities.filter(o=>openStages.has(o.stage));
  const stalled=activeDeals.filter(o=>Date.now()-new Date(o.updatedAt).getTime()>7*dayMs);
  const revenueToday=revenue.sales.filter(s=>isSince(s.closed_at,today)).reduce((sum,s)=>sum+s.sale_price,0);
  const revenueWeek=revenue.sales.filter(s=>isSince(s.closed_at,week)).reduce((sum,s)=>sum+s.sale_price,0);
  const revenueMonth=revenue.sales.filter(s=>isSince(s.closed_at,month)).reduce((sum,s)=>sum+s.sale_price,0);
  const openOffers=negotiation.offers.filter(o=>!['accepted','rejected','expired','closed'].includes(o.status));
  const closingQueue=closing.reservations.filter(r=>r.status==='active');
  const pendingApprovals=approval.requests.filter(r=>r.status==='pending');
  const expiring=closingQueue.filter(r=>daysUntil(r.reservationExpiresAt)<=3);
  const followUps=agency.agencies.flatMap(a=>a.activities.filter(x=>x.followUpAt&&!x.completedAt&&new Date(x.followUpAt).getTime()>=today&&new Date(x.followUpAt).getTime()<today+dayMs).map(x=>({agency:a,activity:x})));
  const critical=automation.alerts.filter(a=>a.severity==='critical'&&!a.resolved_at);
  const buyerHealth=agency.agencies.length?Math.round(agency.agencies.reduce((sum,a)=>{const relationship=['qualified','portfolio_sent','negotiating','offer_submitted','closed'].includes(a.status)?85:['contacted','researching'].includes(a.status)?60:a.status==='new'?45:20;const engagement=Math.min(15,a.activities.length*2);return sum+Math.min(100,relationship+engagement)},0)/agency.agencies.length):0;
  const totalPipeline=activeDeals.reduce((s,o)=>s+o.askingPrice,0);const weighted=activeDeals.reduce((s,o)=>s+o.askingPrice*(o.probability/100),0);
  const metrics:ExecutiveMetric[]=[
   {label:'Revenue today',value:money(revenueToday),detail:'Closed sales since midnight',path:'/revenue',tone:'success'},
   {label:'Revenue this week',value:money(revenueWeek),detail:'Last seven calendar days',path:'/revenue'},
   {label:'Revenue this month',value:money(revenueMonth),detail:`${revenue.sales.filter(s=>isSince(s.closed_at,month)).length} closed transactions`,path:'/revenue'},
   {label:'Active deals',value:String(activeDeals.length),detail:`${money(totalPipeline)} open pipeline`,path:'/pipeline'},
   {label:'Stalled deals',value:String(stalled.length),detail:'No movement for seven days',path:'/pipeline',tone:stalled.length?'warning':'success'},
   {label:'Buyer health average',value:`${buyerHealth}%`,detail:`Across ${agency.agencies.length} buyer relationships`,path:'/agencies',tone:buyerHealth<50?'warning':'default'},
   {label:'Open negotiations',value:String(openOffers.length),detail:`${money(openOffers.reduce((s,o)=>s+o.currentAmount,0))} currently offered`,path:'/negotiations'},
   {label:'Closing queue',value:String(closingQueue.length),detail:`${money(closingQueue.reduce((s,r)=>s+r.amount,0))} reserved`,path:'/closings'},
   {label:'Pending approvals',value:String(pendingApprovals.length),detail:'Owner decisions required',path:'/approvals',tone:pendingApprovals.length?'warning':'success'},
   {label:'Reservations expiring',value:String(expiring.length),detail:'Within the next 72 hours',path:'/closings',tone:expiring.length?'danger':'success'},
   {label:'Follow-ups due today',value:String(followUps.length),detail:'Buyer actions scheduled today',path:'/follow-ups',tone:followUps.length?'warning':'success'},
   {label:'Critical alerts',value:String(critical.length),detail:'Unresolved executive exceptions',path:'/automation',tone:critical.length?'danger':'success'}
  ];
  const stages:ForecastStage[]=PIPELINE_STAGES.filter(s=>openStages.has(s)).map(stage=>{const deals=activeDeals.filter(o=>o.stage===stage);return{label:title(stage),count:deals.length,value:deals.reduce((n,o)=>n+o.askingPrice,0),weightedValue:deals.reduce((n,o)=>n+o.askingPrice*(o.probability/100),0)}}).filter(s=>s.count);
  const approvals:ExecutiveQueueItem[]=pendingApprovals.map(r=>({id:r.id,title:r.title,detail:r.reason||r.recommendation,meta:r.requestType.replace(/_/g,' '),path:'/approvals',tone:'warning'}));
  const risk:ExecutiveQueueItem[]=[...critical.map(a=>({id:a.id,title:a.title,detail:a.body||'Critical transaction alert',meta:'critical',path:a.action_path||'/automation',tone:'danger' as const})),...expiring.map(r=>({id:r.id,title:`${r.portfolioName} reservation`,detail:`${r.agencyName} · ${money(r.amount)}`,meta:`${Math.max(0,daysUntil(r.reservationExpiresAt))}d left`,path:'/closings',tone:'warning' as const})),...stalled.map(o=>({id:o.id,title:o.title,detail:`${money(o.askingPrice)} · ${title(o.stage)}`,meta:'stalled',path:`/pipeline/${o.id}`,tone:'warning' as const}))];
  const leaderboard:ExecutiveQueueItem[]=performance.employees.slice(0,6).map(e=>({id:e.id,title:`#${e.rank} ${e.full_name}`,detail:`${e.sales_month} sales · ${money(e.pipeline_value)} pipeline`,meta:money(e.revenue_month),path:'/analytics',tone:e.rank===1?'success':'default'}));
  const activity:ExecutiveActivity[]=[
   ...automation.alerts.map(a=>({id:`alert-${a.id}`,title:a.title,detail:a.body||title(a.type),occurredAt:a.created_at,path:a.action_path||'/automation'})),
   ...negotiation.offers.map(o=>({id:`offer-${o.id}`,title:`Negotiation with ${o.agencyName}`,detail:`${o.portfolioName} · ${money(o.currentAmount)} · ${title(o.status)}`,occurredAt:o.updatedAt,path:'/negotiations'})),
   ...pipeline.opportunities.map(o=>({id:`deal-${o.id}`,title:o.title,detail:`Moved through ${title(o.stage)} · ${money(o.askingPrice)}`,occurredAt:o.updatedAt,path:`/pipeline/${o.id}`})),
   ...agency.agencies.flatMap(a=>a.activities.map(x=>({id:`activity-${x.id}`,title:`${a.name}: ${x.disposition}`,detail:x.notes||x.subject||title(x.type),occurredAt:x.occurredAt,path:`/agencies/${a.id}`}))),
   ...conversation.messages.map(m=>({id:`message-${m.id}`,title:m.direction==='inbound'?'Buyer reply received':'Company message sent',detail:m.subject||m.body.slice(0,100),occurredAt:m.createdAt,path:'/conversations'}))
  ].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
  return{metrics,stages,totalPipeline,weighted,approvals,risk,leaderboard,activity};
 },[pipeline.opportunities,negotiation.offers,approval.requests,closing.reservations,revenue.sales,performance.employees,automation.alerts,agency.agencies,conversation.messages]);
 return <div className="mx-auto max-w-[1800px] p-5 md:p-8 lg:p-10"><header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold text-blue-600">Executive Command Center · v2.5.0</p><h2 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">The entire company, one screen.</h2><p className="mt-2 max-w-3xl text-slate-500">Revenue, pipeline, buyer health, employee performance, transaction risk and today’s operating queues—derived from the existing Sales OS engines.</p></div><PrimaryButton onClick={()=>void refresh()} disabled={loading}><RefreshCw size={17} className={`mr-2 ${loading?'animate-spin':''}`}/>Refresh command</PrimaryButton></header><div className="mt-7"><ExecutiveMetricGrid metrics={vm.metrics}/></div><section className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><ExecutiveForecastPanel stages={vm.stages} total={vm.totalPipeline} weighted={vm.weighted}/><ExecutiveQueuePanel title="Employee leaderboard" eyebrow="Sales performance" items={vm.leaderboard} emptyText="No employee performance has been recorded yet."/></section><section className="mt-7 grid gap-6 xl:grid-cols-3"><ExecutiveQueuePanel title="Approval queue" eyebrow="Owner decisions" items={vm.approvals} emptyText="No approvals are waiting."/><ExecutiveQueuePanel title="Critical operating queue" eyebrow="Risk and deadlines" items={vm.risk} emptyText="No critical risks or stalled transactions."/><ExecutiveActivityFeed items={vm.activity}/></section></div>
}
