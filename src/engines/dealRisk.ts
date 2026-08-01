import type {Opportunity} from '../store/PipelineStore';
import type {Offer} from '../store/NegotiationStore';
import type {Reservation} from '../store/ClosingStore';
import type {ApprovalRequest} from '../store/ApprovalStore';
import type {Conversation} from '../store/ConversationStore';
import type {Agency} from '../store/AgencyStore';
import type {TransactionAlert} from '../store/TransactionAutomationStore';

export type DealRiskLevel='healthy'|'watch'|'at_risk'|'critical';
export type DealRiskSignal={id:string;label:string;detail:string;points:number;action:string};
export type DealRiskAssessment={opportunityId:string;score:number;level:DealRiskLevel;revenueAtRisk:number;recommendedAction:string;signals:DealRiskSignal[];updatedAt:string};
export type DealRiskContext={opportunity:Opportunity;offer?:Offer;reservation?:Reservation;approvals:ApprovalRequest[];conversation?:Conversation;agency?:Agency;alerts:TransactionAlert[]};

const day=86400000;
const ageDays=(value?:string)=>value?Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/day)):0;
const untilDays=(value?:string)=>value?Math.ceil((new Date(value).getTime()-Date.now())/day):999;
const add=(signals:DealRiskSignal[],id:string,label:string,detail:string,points:number,action:string)=>signals.push({id,label,detail,points,action});

export function assessDealRisk(context:DealRiskContext):DealRiskAssessment{
 const {opportunity,offer,reservation,approvals,conversation,agency,alerts}=context;
 const signals:DealRiskSignal[]=[];
 const inactiveDays=ageDays(opportunity.updatedAt);
 if(inactiveDays>=14)add(signals,'inactive-critical','No deal movement',`${inactiveDays} days since the opportunity changed.`,28,'Contact the buyer and set a firm next step today.');
 else if(inactiveDays>=7)add(signals,'inactive','Deal is slowing',`${inactiveDays} days since the opportunity changed.`,16,'Schedule a buyer follow-up within 24 hours.');

 const lastActivity=agency?.activities[0]?.occurredAt||conversation?.lastMessageAt||opportunity.updatedAt;
 const communicationGap=ageDays(lastActivity);
 if(communicationGap>=10)add(signals,'communication-gap','Buyer communication gap',`${communicationGap} days since recorded buyer activity.`,18,'Contact the buyer and document the outcome.');

 if(conversation?.nextFollowUpAt&&new Date(conversation.nextFollowUpAt).getTime()<Date.now())add(signals,'overdue-follow-up','Follow-up overdue',`Due ${new Date(conversation.nextFollowUpAt).toLocaleString()}.`,18,'Complete or reschedule the overdue follow-up.');

 if(offer&&!['accepted','rejected','expired','closed'].includes(offer.status)){
  const offerAge=ageDays(offer.updatedAt);
  if(offerAge>=7)add(signals,'stalled-negotiation','Negotiation stalled',`${offerAge} days since the last offer movement.`,18,'Restart the negotiation or request a final decision.');
  if(offer.rounds.length>=5)add(signals,'counter-cycle','Extended counteroffer cycle',`${offer.rounds.length} negotiation rounds without closure.`,12,'Escalate terms to the owner and define a walk-away point.');
 }

 const pending=approvals.filter(item=>item.status==='pending');
 if(pending.length)add(signals,'approval-blocker','Owner approval blocking progress',`${pending.length} approval request${pending.length===1?' is':'s are'} pending.`,15,'Resolve the pending owner approval.');

 if(reservation?.status==='active'){
  const expires=untilDays(reservation.reservationExpiresAt);
  if(expires<=1)add(signals,'reservation-critical','Reservation expires imminently',`${Math.max(0,expires)} day remaining.`,28,'Extend or release the reservation immediately.');
  else if(expires<=3)add(signals,'reservation-warning','Reservation nearing expiration',`${expires} days remaining.`,18,'Confirm funding status and decide whether to extend.');
  const paymentDue=untilDays(reservation.paymentDeadline);
  const totalReceived=reservation.depositReceived+reservation.balanceReceived;
  if(paymentDue<0&&totalReceived<reservation.amount)add(signals,'payment-overdue','Funding overdue',`Payment deadline passed ${Math.abs(paymentDue)} day${Math.abs(paymentDue)===1?'':'s'} ago.`,30,'Escalate funding confirmation to the owner.');
  else if(paymentDue<=2&&totalReceived<reservation.amount)add(signals,'payment-due','Funding deadline approaching',`${Math.max(0,paymentDue)} days until payment deadline.`,17,'Confirm wire timing and proof of funds.');
 }

 if(opportunity.expectedCloseDate){
  const closeDays=untilDays(opportunity.expectedCloseDate);
  if(closeDays<0)add(signals,'close-overdue','Expected close date missed',`${Math.abs(closeDays)} day${Math.abs(closeDays)===1?'':'s'} overdue.`,20,'Reset the closing plan or mark the deal lost.');
  else if(closeDays<=3)add(signals,'close-near','Expected close date approaching',`${closeDays} days remaining.`,10,'Confirm every closing dependency.');
 }

 const relatedAlerts=alerts.filter(alert=>!alert.resolved_at&&(alert.action_path?.includes(opportunity.id)||alert.body?.includes(opportunity.title)));
 const criticalAlerts=relatedAlerts.filter(alert=>alert.severity==='critical').length;
 if(criticalAlerts)add(signals,'critical-alerts','Critical transaction alert',`${criticalAlerts} unresolved critical alert${criticalAlerts===1?'':'s'}.`,25,'Open the alert and resolve the underlying exception.');

 let score=Math.min(100,signals.reduce((sum,signal)=>sum+signal.points,0));
 if(opportunity.stage==='closed_won'||opportunity.stage==='closed_lost')score=0;
 const level:DealRiskLevel=score>=70?'critical':score>=45?'at_risk':score>=20?'watch':'healthy';
 const top=[...signals].sort((a,b)=>b.points-a.points)[0];
 return {opportunityId:opportunity.id,score,level,revenueAtRisk:level==='healthy'?0:opportunity.askingPrice,recommendedAction:top?.action||'Continue the current deal plan and monitor activity.',signals:signals.sort((a,b)=>b.points-a.points),updatedAt:new Date().toISOString()};
}

export const riskLabel=(level:DealRiskLevel)=>level==='at_risk'?'At Risk':level.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
