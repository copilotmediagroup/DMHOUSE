import {useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AlertTriangle,BellRing,Check,CheckCheck,ChevronRight,Clock3,FileSignature,Play,RefreshCw,Send,ShieldCheck} from 'lucide-react';
import {Card,Pill,PrimaryButton,SecondaryButton} from '../components/Primitives';
import {supabase} from '../lib/supabase';
import {usePortfolioStore} from '../store/PortfolioStore';
import {useTransactionAutomation} from '../store/TransactionAutomationStore';

type ProgressStep={key:string;label:string;complete:boolean;at:string|null};
type TransactionProgress={
  id:string;buyerId:string;portfolioId:string|null;documentId:string|null;purchaseAgreementId:string|null;roomId:string|null;
  buyerCompany:string;buyerName:string;buyerEmail:string;portfolioName:string;inviteCount:number;cycleStatus:string;
  cycleExpiresAt:string;deliveryStatus:string|null;failureReason:string|null;roomStatus:string|null;lastActivityAt:string;
  currentStage:'invitation_sent'|'delivery_failed'|'invitation_expired'|'nda_pending'|'purchase_agreement_pending'|'payment_pending'|'paid'|'file_released'|'completed';
  steps:ProgressStep[];
};

const stageCopy:Record<TransactionProgress['currentStage'],{label:string;message:string;tone:'neutral'|'success'|'warning'|'danger'|'blue'}>={
  invitation_sent:{label:'Waiting on buyer',message:'The secure invitation was sent. The buyer has not opened it yet.',tone:'blue'},
  delivery_failed:{label:'Delivery failed',message:'The invitation could not be delivered. Review the buyer email before sending again.',tone:'danger'},
  invitation_expired:{label:'Invitation expired',message:'The buyer did not use the link before it expired.',tone:'warning'},
  nda_pending:{label:'NDA pending',message:'The buyer opened the portal and still needs to sign the NDA.',tone:'warning'},
  purchase_agreement_pending:{label:'Purchase Agreement pending',message:'The NDA is complete and protected details are unlocked.',tone:'blue'},
  payment_pending:{label:'Payment pending',message:'The Purchase Agreement is signed. Payment is the next gate.',tone:'warning'},
  paid:{label:'Payment confirmed',message:'Payment is confirmed. The final file can now be released.',tone:'success'},
  file_released:{label:'File released',message:'The final portfolio file has been released to the buyer.',tone:'success'},
  completed:{label:'Completed',message:'Every transaction gate is complete.',tone:'success'}
};

function formatDate(value?:string|null){return value?new Date(value).toLocaleString():'—'}

export default function TransactionAlerts(){
  const {profile}=usePortfolioStore();
  const {alerts,loading:alertsLoading,error:alertsError,run,markRead,markAllRead}=useTransactionAutomation();
  const nav=useNavigate();
  const [tab,setTab]=useState<'progress'|'alerts'>('progress');
  const [progress,setProgress]=useState<TransactionProgress[]>([]);
  const [progressLoading,setProgressLoading]=useState(true);
  const [progressError,setProgressError]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);

  const loadProgress=useCallback(async()=>{
    setProgressLoading(true);setProgressError('');
    try{
      const {data,error}=await supabase.rpc('dmh_buyer_transaction_progress');
      if(error)throw error;
      setProgress((data||[]) as TransactionProgress[]);
    }catch(e){setProgressError(e instanceof Error?e.message:'Unable to load buyer progress.')}finally{setProgressLoading(false)}
  },[]);

  useEffect(()=>{void loadProgress()},[loadProgress]);

  const waitingCount=useMemo(()=>progress.filter(x=>!['completed','file_released'].includes(x.currentStage)).length,[progress]);
  const attentionCount=useMemo(()=>progress.filter(x=>['delivery_failed','invitation_expired'].includes(x.currentStage)).length,[progress]);

  const openTransaction=(item:TransactionProgress)=>{
    if(profile?.role==='buyer'&&item.portfolioId)nav(`/buyer/portfolio/${item.portfolioId}`);
    else if(profile?.role==='owner'&&item.portfolioId)nav(`/buyers/portfolio/${item.portfolioId}`);
    else nav('/employee/documents');
  };

  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[.2em] text-blue-600">TRANSACTION CONTROL</p><h1 className="mt-2 text-3xl font-semibold">Buyer Progress</h1><p className="mt-2 text-sm text-slate-500">See exactly where each buyer is without checking email or guessing.</p></div>
      <div className="flex gap-2"><SecondaryButton onClick={()=>void loadProgress()} disabled={progressLoading}><RefreshCw size={16} className={`mr-2 ${progressLoading?'animate-spin':''}`}/>Refresh progress</SecondaryButton>{tab==='alerts'&&<PrimaryButton onClick={()=>void run()}><Play size={16} className="mr-2"/>Refresh actions</PrimaryButton>}</div>
    </div>

    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Card className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active transactions</p><p className="mt-2 text-3xl font-semibold">{progress.length}</p></Card>
      <Card className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Waiting on next step</p><p className="mt-2 text-3xl font-semibold">{waitingCount}</p></Card>
      <Card className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Needs attention</p><p className="mt-2 text-3xl font-semibold text-red-600">{attentionCount}</p></Card>
    </div>

    <div className="mt-6 inline-flex rounded-2xl bg-slate-100 p-1">
      <button onClick={()=>setTab('progress')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab==='progress'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>Buyer progress</button>
      <button onClick={()=>setTab('alerts')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab==='alerts'?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>Action alerts {alerts.filter(a=>!a.read_at).length>0&&<span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{alerts.filter(a=>!a.read_at).length}</span>}</button>
    </div>

    {tab==='progress'?<>
      {progressError&&<div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{progressError}</div>}
      <div className="mt-5 space-y-4">
        {progressLoading?<Card className="p-6 text-sm text-slate-500">Loading transaction progress…</Card>:progress.length===0?<Card className="p-10 text-center"><ShieldCheck className="mx-auto text-slate-300"/><p className="mt-3 font-semibold">No buyer transactions yet</p><p className="mt-1 text-sm text-slate-500">Transactions appear here as soon as an NDA invitation is sent.</p></Card>:progress.map(item=>{
          const stage=stageCopy[item.currentStage];const isOpen=expanded===item.id;const nextIndex=item.steps.findIndex(s=>!s.complete);
          return <Card key={item.id} className="overflow-hidden">
            <button onClick={()=>setExpanded(isOpen?null:item.id)} className="block w-full p-5 text-left hover:bg-slate-50">
              <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{item.buyerCompany||item.buyerName}</p><Pill tone={stage.tone}>{stage.label}</Pill>{item.inviteCount>1&&<Pill>Invite {item.inviteCount} of 3</Pill>}</div><p className="mt-1 truncate text-sm text-slate-500">{item.portfolioName} · {item.buyerEmail}</p><p className="mt-2 text-sm text-slate-600">{stage.message}</p></div><div className="flex items-center gap-3 text-right"><div><p className="text-xs font-semibold text-slate-400">LAST ACTIVITY</p><p className="mt-1 text-xs text-slate-600">{formatDate(item.lastActivityAt)}</p></div><ChevronRight size={18} className={`text-slate-400 transition ${isOpen?'rotate-90':''}`}/></div></div>
            </button>
            {isOpen&&<div className="border-t border-slate-100 bg-slate-50/60 p-5">
              {(item.currentStage==='delivery_failed'||item.currentStage==='invitation_expired')&&<div className="mb-5 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle size={19} className="mt-0.5 shrink-0"/><div><b>{stage.label}</b><p className="mt-1">{item.failureReason||stage.message} Open Document Studio to review the address or send a new invitation.</p></div></div>}
              <div className="relative ml-2 border-l-2 border-slate-200 pl-6">{item.steps.map((step,index)=>{const active=!step.complete&&index===nextIndex;return <div key={step.key} className="relative pb-6 last:pb-0"><span className={`absolute -left-[33px] grid h-5 w-5 place-items-center rounded-full border-2 ${step.complete?'border-emerald-500 bg-emerald-500 text-white':active?'border-blue-600 bg-white text-blue-600':'border-slate-300 bg-white text-slate-300'}`}>{step.complete?<Check size={12}/>:active?<Clock3 size={11}/>:null}</span><div className="flex flex-wrap items-start justify-between gap-2"><div><p className={`text-sm font-semibold ${active?'text-blue-700':step.complete?'text-slate-800':'text-slate-400'}`}>{step.label}</p>{active&&<p className="mt-1 text-xs text-slate-500">Current step</p>}</div><p className="text-xs text-slate-400">{step.complete?formatDate(step.at):'Pending'}</p></div></div>})}</div>
              <div className="mt-6 flex flex-wrap gap-2"><PrimaryButton onClick={()=>openTransaction(item)}>{profile?.role==='buyer'?<FileSignature size={16} className="mr-2"/>:<Send size={16} className="mr-2"/>}{profile?.role==='buyer'?'Continue transaction':profile?.role==='employee'?'Open Document Studio':'Open Deal Room'}</PrimaryButton><SecondaryButton onClick={()=>setExpanded(null)}>Close timeline</SecondaryButton></div>
            </div>}
          </Card>
        })}
      </div>
    </>:<>
      {alertsError&&<div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{alertsError}</div>}
      <div className="mt-5 flex justify-end"><SecondaryButton onClick={()=>void markAllRead()}><CheckCheck size={16} className="mr-2"/>Mark all read</SecondaryButton></div>
      <Card className="mt-3 overflow-hidden"><div className="divide-y divide-slate-100">{alertsLoading?<p className="p-6 text-sm text-slate-500">Loading alerts…</p>:alerts.length===0?<div className="p-10 text-center"><BellRing className="mx-auto text-slate-300"/><p className="mt-3 font-semibold">No active alerts</p><p className="mt-1 text-sm text-slate-500">Your transaction queue is clear.</p></div>:alerts.map(a=><button key={a.id} onClick={()=>{void markRead(a.id);if(a.action_path)nav(a.action_path)}} className={`block w-full p-5 text-left hover:bg-slate-50 ${a.read_at?'opacity-60':''}`}><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{a.title}</p><Pill tone={a.severity==='critical'?'danger':a.severity==='warning'?'warning':a.severity==='success'?'success':'blue'}>{a.severity}</Pill></div><p className="mt-1 text-sm text-slate-500">{a.body}</p><p className="mt-2 text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</p></div>{!a.read_at&&<span className="mt-2 h-2.5 w-2.5 rounded-full bg-blue-600"/>}</div></button>)}</div></Card>
    </>}
  </div></div>
}
