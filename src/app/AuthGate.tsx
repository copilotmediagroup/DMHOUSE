import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useEmploymentAccessGuard } from '../hooks/useEmploymentAccessGuard';
import { PrimaryButton, Card, Field, inputClass } from '../components/Primitives';
import AcademyInviteRegistration from '../pages/academy/AcademyInviteRegistration';

function hasAuthCallback(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;
  return /access_token=|refresh_token=|error_description=|type=(magiclink|invite|recovery)/.test(`${hash}&${search}`);
}

function GatewayLoading({ buyer = false }: { buyer?: boolean }) {
  return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-blue-300">{buyer?<ShieldCheck size={28}/>:<LockKeyhole size={27}/>}</div><h1 className="mt-5 text-xl font-semibold">{buyer?'Securing Buyer Portal…':'Loading Sales OS…'}</h1><p className="mt-2 text-sm text-slate-400">Verifying the authenticated workspace before anything is displayed.</p></div></div>;
}

export default function AuthGate({children}:{children:ReactNode}){

  if (window.location.pathname === '/academy/invite') {
    return <AcademyInviteRegistration />;
  }
  if(!isSupabaseConfigured)return <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white"><div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8"><p className="text-xs font-semibold tracking-[.24em] text-blue-400">DMH SALES OS · V5.5</p><h1 className="mt-3 text-2xl font-semibold">Supabase connection required</h1><p className="mt-3 text-sm leading-6 text-slate-300">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Netlify, then redeploy.</p></div></div>;

  const location=useLocation();
  const buyerPath=location.pathname==='/buyer'||location.pathname.startsWith('/buyer/');
  const buyerInviteEntry=location.pathname==='/buyer/invite';
  const inviteToken=useMemo(()=>new URLSearchParams(location.search).get('token')?.trim()||'',[location.search]);
  const callbackAtBoot=useMemo(()=>hasAuthCallback(),[]);
  const [ready,setReady]=useState(false);
  const [session,setSession]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [forgotMode,setForgotMode]=useState(false);
  const [forgotSent,setForgotSent]=useState(false);
  const [recoveryMode,setRecoveryMode]=useState(
    ()=>/type=recovery/.test(`${window.location.hash}&${window.location.search}`)
  );
  const [recoverySuccess,setRecoverySuccess]=useState(false);
  const accountType =
    session?.user?.user_metadata?.account_type ||
    (buyerPath ? 'buyer' : 'owner');

useEmploymentAccessGuard(
  session?.user?.id || null,
  accountType,
);

  useEffect(()=>{
    if(!buyerInviteEntry)return;

    let cancelled=false;

    void (async()=>{
      if(!inviteToken){
        window.location.replace('/buyer?inviteError='+encodeURIComponent('Invitation token is missing.'));
        return;
      }

      const {error:signOutError}=await supabase.auth.signOut({scope:'local'});

      if(cancelled)return;

      if(signOutError){
        window.location.replace('/buyer?inviteError='+encodeURIComponent(signOutError.message));
        return;
      }

      const base=(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
      window.location.replace(`${base}/functions/v1/redeem-buyer-invite?token=${encodeURIComponent(inviteToken)}`);
    })();

    return()=>{cancelled=true};
  },[buyerInviteEntry,inviteToken]);

  useEffect(()=>{
    if(buyerInviteEntry)return;
    let active=true;
    let callbackResolved=!callbackAtBoot;
    const finish=(nextSession:any)=>{if(!active)return;setSession(nextSession);setReady(true)};
    const {data}=supabase.auth.onAuthStateChange((event,nextSession)=>{
      if(!active)return;
      setSession(nextSession);
      if(event==='PASSWORD_RECOVERY'){
        setRecoveryMode(true);
      }
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
  },[callbackAtBoot,buyerInviteEntry]);

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setError('');

    const f=new FormData(e.currentTarget);
    const email=String(f.get('email'));
    const password=String(f.get('password'));

    const result=await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if(result.error){
      setError(result.error.message);
    }

    setBusy(false);
  }


  async function requestPasswordReset(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    setBusy(true);
    setError('');
    setForgotSent(false);

    const form=new FormData(e.currentTarget);
    const email=String(form.get('email')||'').trim();

    if(!email){
      setError('Enter your email address.');
      setBusy(false);
      return;
    }

    const redirectTo=`${window.location.origin}/?type=recovery`;

    const {error:resetError}=await supabase.auth.resetPasswordForEmail(
      email,
      {redirectTo},
    );

    if(resetError){
      setError(resetError.message);
      setBusy(false);
      return;
    }

    setForgotSent(true);
    setBusy(false);
  }

  async function changeRecoveredPassword(e:FormEvent<HTMLFormElement>){
    e.preventDefault();

    setBusy(true);
    setError('');

    const form=new FormData(e.currentTarget);
    const password=String(form.get('password')||'');
    const confirmPassword=String(form.get('confirmPassword')||'');

    if(password.length<8){
      setError('Password must be at least 8 characters.');
      setBusy(false);
      return;
    }

    if(password!==confirmPassword){
      setError('The passwords do not match.');
      setBusy(false);
      return;
    }

    const {error:updateError}=await supabase.auth.updateUser({
      password,
    });

    if(updateError){
      setError(updateError.message);
      setBusy(false);
      return;
    }

    await supabase.auth.signOut({scope:'local'});

    window.history.replaceState({},'', '/');

    setSession(null);
    setRecoveryMode(false);
    setRecoverySuccess(true);
    setForgotMode(false);
    setForgotSent(false);
    setBusy(false);
  }

  if(buyerInviteEntry)return <GatewayLoading buyer/>;
  if(!ready)return <GatewayLoading buyer={buyerPath||callbackAtBoot}/>;

  if(recoveryMode && session){
    return (
      <div className="grid min-h-screen place-items-center bg-[#08101f] p-5">
        <Card className="w-full max-w-md p-8">
          <p className="text-xs font-semibold tracking-[.24em] text-blue-600">
            DATA MARKET HOUSE
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Reset password
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter a new password for your Data Market House account.
          </p>

          <form
            className="mt-7 space-y-4"
            onSubmit={changeRecoveredPassword}
          >
            <Field label="New password">
              <input
                className={inputClass}
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            <Field label="Confirm new password">
              <input
                className={inputClass}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <PrimaryButton className="w-full" disabled={busy}>
              {busy ? 'Updating password…' : 'Set new password'}
            </PrimaryButton>
          </form>
        </Card>
      </div>
    );
  }

  if(session)return <>{children}</>;

  const params=new URLSearchParams(location.search);
  const inviteError=params.get('inviteError');
  if(inviteError)return <div className="grid min-h-screen place-items-center bg-[#08101f] p-5 text-white"><div className="w-full max-w-lg rounded-[28px] border border-red-400/20 bg-white/5 p-8"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-300"><AlertTriangle size={28}/></div><p className="mt-6 text-xs font-bold uppercase tracking-[.22em] text-red-300">Buyer invitation unavailable</p><h1 className="mt-2 text-3xl font-semibold">This secure invitation cannot be opened.</h1><p className="mt-4 leading-7 text-slate-300">{inviteError}</p><p className="mt-4 text-sm text-slate-400">Contact your Data Market House representative for a new invitation.</p></div></div>;

  return (
    <div className="grid min-h-screen place-items-center bg-[#08101f] p-5">
      <Card className="w-full max-w-md p-8">
        <p className="text-xs font-semibold tracking-[.24em] text-blue-600">
          DATA MARKET HOUSE
        </p>

        <h1 className="mt-3 text-3xl font-semibold">
          {forgotMode
            ? 'Reset your password'
            : buyerPath
              ? 'Buyer Portal'
              : 'Sales OS'}
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          {forgotMode
            ? 'Enter your account email and we will send you a secure password reset link.'
            : buyerPath
              ? 'Secure buyer authentication'
              : 'Authorized access only'}
        </p>

        {recoverySuccess && !forgotMode && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            Password changed successfully. Sign in with your new password.
          </div>
        )}

        {forgotMode ? (
          <>
            <form
              className="mt-7 space-y-4"
              onSubmit={requestPasswordReset}
            >
              <Field label="Email">
                <input
                  className={inputClass}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>

              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              {forgotSent && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700">
                  If that email belongs to a Data Market House account,
                  a password reset email has been sent. Check your inbox
                  and spam folder.
                </div>
              )}

              <PrimaryButton className="w-full" disabled={busy}>
                {busy ? 'Sending reset link…' : 'Send reset link'}
              </PrimaryButton>
            </form>

            <button
              type="button"
              className="mt-5 w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-700"
              onClick={()=>{
                setForgotMode(false);
                setForgotSent(false);
                setError('');
              }}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <form className="mt-7 space-y-4" onSubmit={submit}>
              <Field label="Email">
                <input
                  className={inputClass}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>

              <Field label="Password">
                <input
                  className={inputClass}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={6}
                  required
                />
              </Field>

              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <PrimaryButton className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </PrimaryButton>
            </form>

            <button
              type="button"
              className="mt-5 w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-700"
              onClick={()=>{
                setForgotMode(true);
                setRecoverySuccess(false);
                setError('');
              }}
            >
              Forgot password?
            </button>
          </>
        )}
      </Card>
    </div>
  );

}
