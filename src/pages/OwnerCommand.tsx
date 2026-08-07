import {RefreshCw} from 'lucide-react';
import {useMemo,useState} from 'react';
import {PrimaryButton} from '../components/Primitives';
import ExecutiveActivityFeed from '../components/executive/ExecutiveActivityFeed';
import ExecutiveForecastPanel from '../components/executive/ExecutiveForecastPanel';
import ExecutiveDrillDownDrawer from '../components/executive/ExecutiveDrillDownDrawer';
import ExecutiveMetricGrid from '../components/executive/ExecutiveMetricGrid';
import ExecutiveQueuePanel from '../components/executive/ExecutiveQueuePanel';
import type {ExecutiveActivity,ExecutiveDrillDown,ExecutiveMetric,ExecutiveQueueItem,ForecastStage} from '../components/executive/types';
import {useAgencyStore} from '../store/AgencyStore';
import {useApprovalStore} from '../store/ApprovalStore';
import {useClosingStore} from '../store/ClosingStore';
import {useConversationStore} from '../store/ConversationStore';
import {useNegotiationStore} from '../store/NegotiationStore';
import {PIPELINE_STAGES,usePipelineStore} from '../store/PipelineStore';
import {usePerformanceStore} from '../store/PerformanceStore';
import {useRevenueStore} from '../store/RevenueStore';
import {useTransactionAutomation} from '../store/TransactionAutomationStore';
import {assessDealRisk} from '../engines/dealRisk';
import {useTransactionIntelligence} from '../hooks/useTransactionIntelligence';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const title=(v:string)=>v.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const dayMs=86400000;
const startOfDay=(d=new Date())=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
const isSince=(value:string|undefined,time:number)=>Boolean(value&&new Date(value).getTime()>=time);
const daysUntil=(value?:string)=>value?Math.ceil((new Date(value).getTime()-Date.now())/dayMs):999;

export default function OwnerCommand(){
 const {
   items:transactionItems,
   loading:transactionLoading,
   refresh:refreshTransactions
 }=useTransactionIntelligence();
 const pipeline=usePipelineStore();const negotiation=useNegotiationStore();const approval=useApprovalStore();const closing=useClosingStore();const revenue=useRevenueStore();const performance=usePerformanceStore();const automation=useTransactionAutomation();const agency=useAgencyStore();const conversation=useConversationStore();
 const [drillDown,setDrillDown]=useState<ExecutiveDrillDown|null>(null);
 const loading=pipeline.loading||negotiation.loading||approval.loading||closing.loading||revenue.loading||performance.loading||automation.loading||agency.loading||conversation.loading||transactionLoading;
 const refresh=async()=>{await Promise.all([pipeline.refresh(),negotiation.refresh(),approval.refresh(),closing.refresh(),revenue.refresh(),performance.refresh(),automation.refresh(),agency.refresh(),conversation.refresh(),refreshTransactions()])};
 const transactionPriorities=useMemo<ExecutiveQueueItem[]>(()=>{
  return transactionItems
   .filter(item=>!item.complete)
   .sort((a,b)=>{
     const aOwner=a.actionOwner==='owner'?1:0;
     const bOwner=b.actionOwner==='owner'?1:0;

     if(aOwner!==bOwner)return bOwner-aOwner;

     return b.priority-a.priority;
   })
   .slice(0,8)
   .map(item=>{
     const t=item.transaction;

     const ownerAction=item.actionOwner==='owner';

     const meta=
       item.actionOwner==='owner'
         ?'OWNER ACTION'
         :item.actionOwner==='employee'
           ?'WAITING ON EMPLOYEE'
           :item.actionOwner==='buyer'
             ?'WAITING ON BUYER'
             :item.actionOwner==='system'
               ?'SYSTEM PROCESSING'
               :'ACTIVE';

     return {
       id:`transaction-${t.room_id}`,
       title:item.headline,
       detail:`${t.buyer_company} · ${t.portfolio_name} · ${money(t.asking_price)} · ${item.detail}`,
       meta,
       path:'/transactions',
       tone:
         ownerAction&&item.action==='confirm_payment'
           ?'danger'
           :ownerAction
             ?'warning'
             :'default'
     };
   });
 },[transactionItems]);

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
  const dealRisks=activeDeals.map(opportunity=>{const offer=negotiation.offers.find(x=>x.agencyId===opportunity.agencyId&&(!opportunity.portfolioId||x.portfolioId===opportunity.portfolioId));const reservation=closing.reservations.find(x=>x.agencyId===opportunity.agencyId&&(!opportunity.portfolioId||x.portfolioId===opportunity.portfolioId));return{opportunity,assessment:assessDealRisk({opportunity,offer,reservation,approvals:approval.requests.filter(x=>x.agencyId===opportunity.agencyId||x.dealId===opportunity.id),conversation:conversation.conversations.find(x=>x.opportunityId===opportunity.id||x.agencyId===opportunity.agencyId),agency:agency.agencies.find(x=>x.id===opportunity.agencyId),alerts:automation.alerts})}});
  const exposedDeals=dealRisks.filter(x=>['at_risk','critical'].includes(x.assessment.level));const criticalDeals=dealRisks.filter(x=>x.assessment.level==='critical');const atRiskRevenue=exposedDeals.reduce((sum,x)=>sum+x.assessment.revenueAtRisk,0);
  const totalPipeline=activeDeals.reduce((s,o)=>s+o.askingPrice,0);const weighted=activeDeals.reduce((s,o)=>s+o.askingPrice*(o.probability/100),0);
  const metric=(id:string,label:string,value:string,detail:string,path:string,rows:ExecutiveDrillDown['rows'],tone?:ExecutiveMetric['tone']):ExecutiveMetric=>({id,label,value,detail,path,tone,drillDown:{id,title:label,eyebrow:'Executive drill-down',summary:detail,emptyText:`No records currently contribute to ${label.toLowerCase()}.`,rows}});
  const metrics:ExecutiveMetric[]=[
   metric('revenue-today','Revenue today',money(revenueToday),'Closed sales since midnight','/revenue',revenue.sales.filter(s=>isSince(s.closed_at,today)).map(s=>({id:s.id,title:'Closed transaction',detail:`Portfolio ${s.portfolio_id.slice(0,8)} · buyer ${s.buyer_agency_id.slice(0,8)} · closed ${new Date(s.closed_at).toLocaleDateString()}`,value:money(s.sale_price),path:'/revenue',tone:'success'})),'success'),
   metric('revenue-week','Revenue this week',money(revenueWeek),'Last seven calendar days','/revenue',revenue.sales.filter(s=>isSince(s.closed_at,week)).map(s=>({id:s.id,title:'Closed transaction',detail:`Portfolio ${s.portfolio_id.slice(0,8)} · ${new Date(s.closed_at).toLocaleDateString()}`,value:money(s.sale_price),path:'/revenue'}))),
   metric('revenue-month','Revenue this month',money(revenueMonth),`${revenue.sales.filter(s=>isSince(s.closed_at,month)).length} closed transactions`,'/revenue',revenue.sales.filter(s=>isSince(s.closed_at,month)).map(s=>({id:s.id,title:'Closed transaction',detail:`Portfolio ${s.portfolio_id.slice(0,8)} · buyer ${s.buyer_agency_id.slice(0,8)}`,value:money(s.sale_price),path:'/revenue'}))),
   metric('active-deals','Active deals',String(activeDeals.length),`${money(totalPipeline)} open pipeline`,'/pipeline',activeDeals.map(o=>({id:o.id,title:o.title,detail:`${title(o.stage)} · ${o.probability}% probability`,value:money(o.askingPrice),path:`/pipeline/${o.id}`}))),
   metric('stalled-deals','Stalled deals',String(stalled.length),'No movement for seven days','/pipeline',stalled.map(o=>({id:o.id,title:o.title,detail:`Last movement ${Math.floor((Date.now()-new Date(o.updatedAt).getTime())/dayMs)} days ago · ${title(o.stage)}`,value:money(o.askingPrice),path:`/pipeline/${o.id}`,tone:'warning'})),stalled.length?'warning':'success'),
   metric('buyer-health','Buyer health average',`${buyerHealth}%`,`Across ${agency.agencies.length} buyer relationships`,'/agencies',agency.agencies.map(a=>({id:a.id,title:a.name,detail:`${title(a.status)} · ${a.activities.length} recorded activities`,meta:a.status.replace(/_/g,' '),path:`/agencies/${a.id}`,tone:['qualified','negotiating','closed'].includes(a.status)?'success':'default'})),buyerHealth<50?'warning':'default'),
   metric('negotiations','Open negotiations',String(openOffers.length),`${money(openOffers.reduce((s,o)=>s+o.currentAmount,0))} currently offered`,'/negotiations',openOffers.map(o=>({id:o.id,title:o.portfolioName,detail:`${o.agencyName} · ${title(o.status)}`,value:money(o.currentAmount),path:'/negotiations'}))),
   metric('closing','Closing queue',String(closingQueue.length),`${money(closingQueue.reduce((s,r)=>s+r.amount,0))} reserved`,'/closings',closingQueue.map(r=>({id:r.id,title:r.portfolioName,detail:`${r.agencyName} · expires ${r.reservationExpiresAt ? new Date(r.reservationExpiresAt).toLocaleDateString() : 'Not set'}`,value:money(r.amount),path:'/closings'}))),
   metric('approvals','Pending approvals',String(pendingApprovals.length),'Owner decisions required','/approvals',pendingApprovals.map(r=>({id:r.id,title:r.title,detail:r.reason||r.recommendation,meta:r.requestType.replace(/_/g,' '),path:'/approvals',tone:'warning'})),pendingApprovals.length?'warning':'success'),
   metric('expiring','Reservations expiring',String(expiring.length),'Within the next 72 hours','/closings',expiring.map(r=>({id:r.id,title:r.portfolioName,detail:`${r.agencyName} · ${Math.max(0,daysUntil(r.reservationExpiresAt))} days remaining`,value:money(r.amount),path:'/closings',tone:'danger'})),expiring.length?'danger':'success'),
   metric('followups','Follow-ups due today',String(followUps.length),'Buyer actions scheduled today','/follow-ups',followUps.map(({agency:a,activity:x})=>({id:x.id,title:a.name,detail:x.notes||x.subject||title(x.type),meta:new Date(x.followUpAt!).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),path:`/agencies/${a.id}`,tone:'warning'})),followUps.length?'warning':'success'),
   metric('alerts','Critical alerts',String(critical.length),'Unresolved executive exceptions','/automation',critical.map(a=>({id:a.id,title:a.title,detail:a.body||title(a.type),meta:'critical',path:a.action_path||'/automation',tone:'danger'})),critical.length?'danger':'success'),
   metric('at-risk-revenue','At-risk revenue',money(atRiskRevenue),`${exposedDeals.length} deals require intervention`,'/risk',exposedDeals.map(({opportunity,assessment})=>({id:opportunity.id,title:opportunity.title,detail:`Risk ${assessment.score}/100 · ${assessment.recommendedAction}`,value:money(opportunity.askingPrice),path:`/pipeline/${opportunity.id}`,tone:assessment.level==='critical'?'danger':'warning'})),exposedDeals.length?'danger':'success'),
   metric('critical-deals','Critical deals',String(criticalDeals.length),'Highest-priority intervention queue','/risk',criticalDeals.map(({opportunity,assessment})=>({id:opportunity.id,title:opportunity.title,detail:assessment.signals[0]?.detail||assessment.recommendedAction,value:money(opportunity.askingPrice),path:`/pipeline/${opportunity.id}`,tone:'danger'})),criticalDeals.length?'danger':'success')
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
 return <div className="mx-auto max-w-[1800px] p-5 md:p-8 lg:p-10"><header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold text-blue-600">Executive Command Center · v2.9.0</p><h2 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">The entire company, one screen.</h2><p className="mt-2 max-w-3xl text-slate-500">Revenue, pipeline, buyer health, employee performance, transaction risk and today’s operating queues—derived from the existing Sales OS engines.</p></div><PrimaryButton onClick={()=>void refresh()} disabled={loading}><RefreshCw size={17} className={`mr-2 ${loading?'animate-spin':''}`}/>Refresh command</PrimaryButton></header>

<section className="mt-7">
  <ExecutiveQueuePanel
    title="Owner transaction priorities"
    eyebrow="What needs your attention now"
    items={transactionPriorities}
    emptyText="No active transaction requires attention."
  />
</section>

<div className="mt-7">
  <ExecutiveMetricGrid
    metrics={vm.metrics}
    onDrillDown={setDrillDown}
  />
</div><section className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><ExecutiveForecastPanel stages={vm.stages} total={vm.totalPipeline} weighted={vm.weighted}/><ExecutiveQueuePanel title="Employee leaderboard" eyebrow="Sales performance" items={vm.leaderboard} emptyText="No employee performance has been recorded yet."/></section><section className="mt-7 grid gap-6 xl:grid-cols-3"><ExecutiveQueuePanel title="Approval queue" eyebrow="Owner decisions" items={vm.approvals} emptyText="No approvals are waiting."/><ExecutiveQueuePanel title="Critical operating queue" eyebrow="Risk and deadlines" items={vm.risk} emptyText="No critical risks or stalled transactions."/><ExecutiveActivityFeed items={vm.activity}/></section><ExecutiveDrillDownDrawer drillDown={drillDown} onClose={()=>setDrillDown(null)}/></div>
}
