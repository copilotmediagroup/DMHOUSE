import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {BadgeCheck,Clock3,ShieldX,Store,UserRoundCheck} from 'lucide-react';
import {Card,Field,Pill,PrimaryButton,SecondaryButton,inputClass} from '../../components/Primitives';
import {useBuyerPortalStore,type BuyerProfile} from '../../store/BuyerPortalStore';
import {usePortfolioStore} from '../../store/PortfolioStore';

const money=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v||0);

export default function BuyerPortalCommand(){
  const {buyers,access,loading,error,setBuyerStatus,grantAccess}=useBuyerPortalStore();
  const {portfolios}=usePortfolioStore();
  const [selected,setSelected]=useState<BuyerProfile|null>(null);
  const [portfolioId,setPortfolioId]=useState('');
  const [download,setDownload]=useState(false);
  const [expires,setExpires]=useState('');
  const [message,setMessage]=useState('');
  const counts=useMemo(()=>({
    pending:buyers.filter(b=>b.status==='pending').length,
    approved:buyers.filter(b=>b.status==='approved').length,
    suspended:buyers.filter(b=>b.status==='suspended').length,
    grants:access.filter(a=>!a.revoked_at).length,
  }),[buyers,access]);

  async function status(id:string,s:BuyerProfile['status']){
    try{await setBuyerStatus(id,s);setMessage(`Buyer marked ${s}.`)}
    catch(e){setMessage(e instanceof Error?e.message:'Update failed')}
  }
  async function grant(){
    if(!selected||!portfolioId)return;
    try{
      await grantAccess(selected.id,portfolioId,download,expires?new Date(expires).toISOString():undefined);
      setMessage('Portfolio access granted.');setPortfolioId('');setExpires('');
    }catch(e){setMessage(e instanceof Error?e.message:'Access grant failed')}
  }

  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[.2em] text-blue-600">BUYER EXPERIENCE</p><h1 className="mt-2 text-3xl font-semibold">Buyer Portal Command</h1><p className="mt-2 text-sm text-slate-500">Approve buyers, control portfolio visibility and protect every file.</p></div>
      <Pill tone="blue">Closing Deal Room · v2.5.1</Pill>
    </div>

    <div className="mt-6 grid gap-4 md:grid-cols-4">
      {[[Clock3,'Pending',counts.pending],[UserRoundCheck,'Approved',counts.approved],[ShieldX,'Suspended',counts.suspended],[Store,'Active grants',counts.grants]].map(([Icon,label,value]:any)=><Card key={label} className="p-5"><Icon size={20} className="text-blue-600"/><p className="mt-4 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></Card>)}
    </div>

    {(error||message)&&<div className={`mt-5 rounded-2xl p-4 text-sm ${error?'bg-red-50 text-red-700':'bg-blue-50 text-blue-700'}`}>{error||message}</div>}

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-semibold">Buyer applications</h2></div>
        <div className="divide-y divide-slate-100">
          {loading?<p className="p-6 text-sm text-slate-500">Loading buyers…</p>:buyers.length===0?<p className="p-6 text-sm text-slate-500">No buyer applications yet.</p>:buyers.map(b=><div key={b.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><button className="text-left" onClick={()=>setSelected(b)}><p className="font-semibold">{b.company_name}</p><p className="mt-1 text-sm text-slate-500">{b.contact_name} · {b.email}</p></button><Pill tone={b.status==='approved'?'success':b.status==='pending'?'warning':b.status==='denied'?'danger':'neutral'}>{b.status}</Pill></div>
            <div className="mt-4 flex flex-wrap gap-2"><PrimaryButton onClick={()=>status(b.id,'approved')} disabled={b.status==='approved'}><BadgeCheck size={16} className="mr-2"/>Approve</PrimaryButton><SecondaryButton onClick={()=>status(b.id,'suspended')}>Suspend</SecondaryButton><SecondaryButton onClick={()=>status(b.id,'denied')}>Deny</SecondaryButton><SecondaryButton onClick={()=>setSelected(b)}>Manage access</SecondaryButton></div>
          </div>)}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">Portfolio access</h2><p className="mt-1 text-sm text-slate-500">{selected?`Granting access for ${selected.company_name}`:'Select a buyer to manage access.'}</p>
        <div className="mt-5 space-y-4">
          <Field label="Authorized portfolio"><select className={inputClass} value={portfolioId} onChange={e=>setPortfolioId(e.target.value)} disabled={!selected}><option value="">Select portfolio</option>{portfolios.filter(p=>['active','negotiating','reserved','payment_pending'].includes(p.status)).map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.askingPrice)}</option>)}</select></Field>
          <Field label="Access expiration"><input className={inputClass} type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)} disabled={!selected}/></Field>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-medium"><input type="checkbox" checked={download} onChange={e=>setDownload(e.target.checked)} disabled={!selected}/>Allow authorized sample download</label>
          <PrimaryButton className="w-full" onClick={grant} disabled={!selected||!portfolioId}>Grant secure access</PrimaryButton>
        </div>
        {selected&&<div className="mt-6 border-t border-slate-100 pt-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current access</p><div className="mt-3 space-y-2">{access.filter(a=>a.buyer_id===selected.id&&!a.revoked_at).map(a=><div key={a.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-semibold">{a.portfolio?.name||'Portfolio'}</p><p className="mt-1 text-xs text-slate-500">{a.can_download_sample?'Sample enabled':'View only'}{a.expires_at?` · Expires ${new Date(a.expires_at).toLocaleDateString()}`:''}</p></div>)}</div></div>}
      </Card>
    </div>

    <Card className="mt-6 p-6"><h2 className="font-semibold">Active deal rooms</h2><p className="mt-1 text-sm text-slate-500">Open a portfolio to control negotiation, documents, payment, release and closing.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{portfolios.filter(p=>['negotiating','reserved','payment_pending'].includes(p.status)).map(p=><Link key={p.id} to={`/buyers/portfolio/${p.id}`} className="rounded-2xl border border-slate-200 p-4 hover:border-blue-300"><p className="font-semibold">{p.name}</p><p className="mt-1 text-sm text-slate-500">{money(p.askingPrice)} · Open deal room</p></Link>)}</div></Card>
  </div></div>
}
