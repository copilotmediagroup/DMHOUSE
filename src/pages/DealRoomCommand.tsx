import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Building2,CheckCircle2,Clock3,FileSignature,Mail,MessageSquareText,RefreshCw,Search,ShieldCheck,WalletCards} from 'lucide-react';
import {Card,Pill,PrimaryButton,SecondaryButton,inputClass} from '../components/Primitives';
import {supabase} from '../lib/supabase';
import {usePortfolioStore} from '../store/PortfolioStore';

type Deal={
  transaction_id:string;buyer_id:string;portfolio_id:string|null;document_id:string|null;
  cycle_status:string;started_at:string;cycle_expires_at:string;invite_count:number;
  buyer_company:string;buyer_name:string;buyer_email:string;buyer_phone:string|null;
  portfolio_name:string|null;portfolio_category:string|null;account_count:number|null;asking_price:number|null;
  document_type:string|null;document_title:string|null;document_status:string|null;seller_signed_at:string|null;buyer_signed_at:string|null;sent_at:string|null;
  latest_invitation_id:string|null;delivery_status:string|null;invitation_sent_at:string|null;opened_at:string|null;redeemed_at:string|null;invitation_expires_at:string|null;failure_reason:string|null;
  room_id:string|null;room_status:string|null;agreement_approved_at:string|null;payment_confirmed_at:string|null;final_file_released_at:string|null;closed_at:string|null;offer_amount:number|null;
  message_count:number;last_activity_at:string;
};

const money=(v:number|null)=>v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
const when=(v:string|null)=>v?new Date(v).toLocaleString():'Not completed';
const label=(v:string|null)=>v?.replaceAll('_',' ')||'Pending';

function stage(d:Deal){
  if(d.closed_at||d.room_status==='closed')return {name:'Completed',tone:'success' as const,waiting:'Transaction complete'};
  if(d.final_file_released_at)return {name:'File Released',tone:'success' as const,waiting:'Ready for final close'};
  if(d.payment_confirmed_at)return {name:'Payment Confirmed',tone:'success' as const,waiting:'Final file release required'};
  if(d.agreement_approved_at)return {name:'Payment Pending',tone:'warning' as const,waiting:'Waiting on payment confirmation'};
  if(d.document_type==='purchase_agreement'&&d.buyer_signed_at)return {name:'Agreement Signed',tone:'success' as const,waiting:'Owner approval required'};
  if(d.room_id)return {name:label(d.room_status),tone:'blue' as const,waiting:'Deal is active'};
  if(d.buyer_signed_at)return {name:'NDA Signed',tone:'success' as const,waiting:'Buyer can review protected details'};
  if(d.redeemed_at||d.opened_at)return {name:'Buyer Opened',tone:'blue' as const,waiting:'Waiting on buyer signature'};
  if(d.delivery_status==='failed'||d.delivery_status==='bounced')return {name:'Delivery Failed',tone:'danger' as const,waiting:d.failure_reason||'Send a new invitation'};
  if(d.invitation_expires_at&&new Date(d.invitation_expires_at)<new Date())return {name:'Invitation Expired',tone:'warning' as const,waiting:'Send a new invitation'};
  return {name:'Invitation Sent',tone:'blue' as const,waiting:'Waiting on your buyer'};
}

export default function DealRoomCommand(){
  const {profile}=usePortfolioStore();
  const nav=useNavigate();
  const [deals,setDeals]=useState<Deal[]>([]);
  const [selected,setSelected]=useState<string>('');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const load=async()=>{setLoading(true);setError('');try{const {data,error}=await supabase.rpc('dmh_staff_deal_room_command');if(error)throw error;const rows=(data||[]) as Deal[];setDeals(rows);setSelected(x=>x&&rows.some(r=>r.transaction_id===x)?x:(rows[0]?.transaction_id||''));}catch(e){setError(e instanceof Error?e.message:'Unable to load deal rooms.');}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return deals;return deals.filter(d=>[d.buyer_company,d.buyer_name,d.buyer_email,d.portfolio_name||''].some(v=>v.toLowerCase().includes(q)))},[deals,query]);
  const current=deals.find(d=>d.transaction_id===selected)||filtered[0];
  const totals=useMemo(()=>({active:deals.filter(d=>!d.closed_at).length,signed:deals.filter(d=>!!d.buyer_signed_at).length,payment:deals.filter(d=>!!d.agreement_approved_at&&!d.payment_confirmed_at).length,closed:deals.filter(d=>!!d.closed_at).length}),[deals]);
  const steps=current?[['Invitation sent',current.invitation_sent_at],['Buyer opened',current.opened_at||current.redeemed_at],['NDA signed',current.document_type==='nda'?current.buyer_signed_at:null],['Purchase agreement',current.document_type==='purchase_agreement'?current.buyer_signed_at:current.agreement_approved_at],['Payment confirmed',current.payment_confirmed_at],['File released',current.final_file_released_at],['Completed',current.closed_at]] as [string,string|null][]:[];
  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[.2em] text-blue-600">TRANSACTION COMMAND CENTER</p><h1 className="mt-2 text-3xl font-semibold">Deal Rooms</h1><p className="mt-2 text-sm text-slate-500">One place to see every buyer, document, invitation and closing stage.</p></div><PrimaryButton onClick={()=>void load()} disabled={loading}><RefreshCw size={16} className={loading?'animate-spin':''}/>Refresh</PrimaryButton></div>
    {error&&<div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="mt-6 grid gap-3 sm:grid-cols-4">{[['Active',totals.active,Clock3],['NDA Signed',totals.signed,ShieldCheck],['Payment Pending',totals.payment,WalletCards],['Completed',totals.closed,CheckCircle2]].map(([name,value,Icon]:any)=><Card key={name} className="p-4"><Icon size={18} className="text-blue-600"/><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-xs text-slate-500">{name}</p></Card>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Card className="overflow-hidden"><div className="border-b border-slate-100 p-4"><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={17}/><input className={inputClass+' pl-10'} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search buyer, email or portfolio"/></div></div><div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">{loading?<p className="p-6 text-sm text-slate-500">Loading deal rooms…</p>:filtered.length===0?<p className="p-8 text-center text-sm text-slate-500">No buyer transactions yet.</p>:filtered.map(d=>{const s=stage(d);return <button key={d.transaction_id} onClick={()=>setSelected(d.transaction_id)} className={`block w-full p-5 text-left hover:bg-slate-50 ${current?.transaction_id===d.transaction_id?'bg-blue-50':''}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{d.buyer_company||d.buyer_name}</p><p className="mt-1 text-sm text-slate-500">{d.portfolio_name||'Unlinked portfolio'}</p><p className="mt-2 text-xs text-slate-400">{d.buyer_email}</p></div><Pill tone={s.tone}>{s.name}</Pill></div><p className="mt-3 text-xs font-medium text-blue-700">{s.waiting}</p></button>})}</div></Card>
      {!current?<Card className="grid min-h-[480px] place-items-center p-8 text-center text-slate-500">Select a deal room.</Card>:<div className="space-y-6"><Card className="p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-wider text-blue-600">CURRENT TRANSACTION</p><h2 className="mt-2 text-2xl font-semibold">{current.portfolio_name||'Buyer transaction'}</h2><p className="mt-2 text-sm text-slate-500">Last activity {new Date(current.last_activity_at).toLocaleString()}</p></div><Pill tone={stage(current).tone}>{stage(current).name}</Pill></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><Building2 className="text-blue-600" size={18}/><p className="mt-3 font-semibold">{current.buyer_company}</p><p className="text-sm text-slate-500">{current.buyer_name}</p><p className="mt-2 text-xs text-slate-500">{current.buyer_email}{current.buyer_phone?` · ${current.buyer_phone}`:''}</p></div><div className="rounded-2xl bg-slate-50 p-4"><FileSignature className="text-blue-600" size={18}/><p className="mt-3 font-semibold">{current.document_title||'Transaction document'}</p><p className="text-sm capitalize text-slate-500">{label(current.document_status)}</p><p className="mt-2 text-xs text-slate-500">{current.account_count?.toLocaleString()||'—'} accounts · {money(current.asking_price)}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><PrimaryButton onClick={()=>nav(profile?.role==='owner'?'/buyers':`/employee/documents`)}><FileSignature size={16}/>Open Documents</PrimaryButton>{profile?.role==='owner'&&current.portfolio_id&&current.room_id&&<SecondaryButton onClick={()=>nav(`/buyers/portfolio/${current.portfolio_id}`)}>Open Closing Controls</SecondaryButton>}<SecondaryButton onClick={()=>nav(profile?.role==='owner'?'/conversations':'/employee/conversations')}><MessageSquareText size={16}/>Messages ({current.message_count||0})</SecondaryButton><SecondaryButton onClick={()=>window.location.href=`mailto:${current.buyer_email}`}><Mail size={16}/>Email Buyer</SecondaryButton></div></Card>
      <Card className="p-6"><h3 className="font-semibold">Transaction timeline</h3><p className="mt-1 text-sm text-slate-500">The highlighted path shows exactly what has happened and what comes next.</p><div className="mt-6 space-y-0">{steps.map(([name,date],i)=>{const done=!!date;const active=!done&&steps.slice(0,i).every(([,v])=>!!v);return <div key={name} className="flex gap-4"><div className="flex flex-col items-center"><span className={`grid h-8 w-8 place-items-center rounded-full ${done?'bg-emerald-100 text-emerald-700':active?'bg-blue-600 text-white':'bg-slate-100 text-slate-400'}`}>{done?<CheckCircle2 size={17}/>:i+1}</span>{i<steps.length-1&&<span className={`h-12 w-px ${done?'bg-emerald-200':'bg-slate-200'}`}/>}</div><div className="pt-1"><p className={`text-sm font-semibold ${active?'text-blue-700':''}`}>{name}</p><p className="mt-1 text-xs text-slate-500">{done?when(date):active?'Current step':'Not started'}</p></div></div>})}</div></Card>
      <Card className="p-6"><h3 className="font-semibold">Invitation control</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Delivery</p><p className="mt-1 font-semibold capitalize">{label(current.delivery_status)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Invitations used</p><p className="mt-1 font-semibold">{current.invite_count} of 3</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Link expires</p><p className="mt-1 text-sm font-semibold">{when(current.invitation_expires_at)}</p></div></div>{current.failure_reason&&<p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{current.failure_reason}</p>}</Card></div>}
    </div>
  </div></div>;
}
