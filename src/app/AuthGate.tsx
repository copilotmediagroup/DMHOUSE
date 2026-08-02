import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { PrimaryButton, Card, Field, inputClass } from '../components/Primitives';

function hasAuthCallback(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;
  return /access_token=|refresh_token=|error_description=|type=(magiclink|invite|recovery)/.test(`${hash}&${search}`);
}

function GatewayLoading({ buyer = false }: { buyer?: boolean }) {
  return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-blue-300">{buyer?<ShieldCheck size={28}/>:<LockKeyhole size={27}/>}</div><h1 className="mt-5 text-xl font-semibold">{buyer?'Securing Buyer Portal…':'Loading Sales OS…'}</h1><p className="mt-2 text-sm text-slate-400">Verifying the authenticated workspace before anything is displayed.</p></div></div>;
}

export default function AuthGate({children}:{children:ReactNode}){
  if(!isSupabaseConfigured)return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8"><p className="text-xs font-semibold tracking-[.24em] text-blue-400">DMH SALES OS · V5.5</p><h1 className="mt-3 text-2xl font-semibold">Supabase connection required</h1><p className="mt-3 text-sm leading-6 text-slate-300">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Netlify, then redeploy.</p></div></div>;

  const location=useLocation();
  const buyerPath=location.pathname==='/buyer'||location.pathname.startsWith('/buyer/');
  const callbackAtBoot=useMemo(()=>hasAuthCallback(),[]);
  const [ready,setReady]=useState(false);
  const [session,setSession]=useState<any>(null);
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [accountType,setAccountType]=useState<'owner'|'employee'|'buyer'>(buyerPath?'buyer':'owner');

  useEffect(()=>{
    let active=true;
    let callbackResolved=!callbackAtBoot;
    const finish=(nextSession:any)=>{if(!active)return;setSession(nextSession);setReady(true)};
    const {data}=supabase.auth.onAuthStateChange((event,nextSession)=>{
      if(!active)return;
      setSession(nextSession);
      if(!callbackAtBoot||event==='SIGNED_IN'||event==='PASSWORD_RECOVERY'||event==='USER_UPDATED'){
        callbackResolved=true;
        setReady(true);
      }
    });

    void supabase.auth.getSession().then(({data:result})=>{
      if(!active)return;
      setSession(result.session);
      if(!callbackAtBoot){setReady(true);return;}
      window.setTimeout(async()=>{
        if(!active||callbackResolved)return;
        const latest=await supabase.auth.getSession();
        finish(latest.data.session);
      },1800);
    });

    return()=>{active=false;data.subscription.unsubscribe()};
  },[callbackAtBoot]);

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    const f=new FormData(e.currentTarget);
    const email=String(f.get('email'));
    const password=String(f.get('password'));
    const fullName=String(f.get('fullName')||(accountType==='owner'?'Owner':accountType==='buyer'?'Buyer':'Employee'));
    const companyName=String(f.get('companyName')||'');
    const phone=String(f.get('phone')||'');
    const joinCode=String(f.get('joinCode')||'').trim().toUpperCase();
    const result=mode==='signin'
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password,options:{data:{full_name:fullName,account_type:accountType,join_code:joinCode,company_name:companyName,phone}}});
    if(result.error)setError(result.error.message);
    else if(mode==='signup'&&!result.data.session)setError('Account created. Confirm the email, then sign in.');
    setBusy(false);
  }

  if(!ready)return <GatewayLoading buyer={buyerPath||callbackAtBoot}/>;
  if(session)return <>{children}</>;

  const params=new URLSearchParams(location.search);
  const inviteError=params.get('inviteError');
  if(inviteError)return <div className="grid min-h-screen place-items-center bg-[#08101f] p-5 text-white"><div className="w-full max-w-lg rounded-[28px] border border-red-400/20 bg-white/5 p-8"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-300"><AlertTriangle size={28}/></div><p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-red-300">Buyer invitation unavailable</p><h1 className="mt-2 text-3xl font-semibold">This secure invitation cannot be opened.</h1><p className="mt-4 leading-7 text-slate-300">{inviteError}</p><p className="mt-4 text-sm text-slate-400">Contact your Data Market House representative for a new invitation.</p></div></div>;

  return <div className="grid min-h-screen place-items-center bg-[#08101f] p-5"><Card className="w-full max-w-md p-8"><p className="text-xs font-semibold tracking-[.24em] text-blue-600">DATA MARKET HOUSE</p><h1 className="mt-3 text-3xl font-semibold">{buyerPath?'Buyer Portal':'Sales OS'}</h1><p className="mt-2 text-sm text-slate-500">{buyerPath?'Secure buyer authentication':'Live Supabase workspace'}</p><div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button className={`rounded-lg py-2 text-sm font-semibold ${mode==='signin'?'bg-white shadow-sm':''}`} onClick={()=>setMode('signin')}>Sign in</button><button className={`rounded-lg py-2 text-sm font-semibold ${mode==='signup'?'bg-white shadow-sm':''}`} onClick={()=>setMode('signup')}>Create account</button></div><form className="mt-6 space-y-4" onSubmit={submit}>{mode==='signup'&&<><div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1"><button type="button" className={`rounded-lg py-2 text-xs font-semibold ${accountType==='owner'?'bg-white shadow-sm':''}`} onClick={()=>setAccountType('owner')}>Owner</button><button type="button" className={`rounded-lg py-2 text-xs font-semibold ${accountType==='employee'?'bg-white shadow-sm':''}`} onClick={()=>setAccountType('employee')}>Employee</button><button type="button" className={`rounded-lg py-2 text-xs font-semibold ${accountType==='buyer'?'bg-white shadow-sm':''}`} onClick={()=>setAccountType('buyer')}>Buyer</button></div><Field label="Full name"><input className={inputClass} name="fullName" required/></Field>{accountType==='employee'&&<Field label="Company join code" hint="Get this code from the Data Market House owner."><input className={inputClass} name="joinCode" required autoCapitalize="characters"/></Field>}{accountType==='buyer'&&<><Field label="Company name"><input className={inputClass} name="companyName" required/></Field><Field label="Phone"><input className={inputClass} name="phone"/></Field></>}</>}<Field label="Email"><input className={inputClass} name="email" type="email" required/></Field><Field label="Password"><input className={inputClass} name="password" type="password" minLength={6} required/></Field>{error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<PrimaryButton className="w-full" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':accountType==='owner'?'Create owner account':accountType==='buyer'?'Create buyer account':'Join company'}</PrimaryButton></form></Card></div>;
}
