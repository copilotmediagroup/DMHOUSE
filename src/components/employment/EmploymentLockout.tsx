import {
  AlertTriangle,
  LockKeyhole,
  LogOut,
  ShieldOff,
} from 'lucide-react';
import {
  useEffect,
  useState,
} from 'react';
import { supabase } from '../../lib/supabase';

type EmploymentStatus =
  | 'active'
  | 'suspended'
  | 'terminated'
  | 'inactive'
  | 'loading';

type Props = {
  userId?: string | null;
  role?: string | null;
};

export default function EmploymentLockout({
  userId,
  role,
}: Props) {
  const [
    status,
    setStatus,
  ] =
    useState<EmploymentStatus>(
      role === 'employee'
        ? 'loading'
        : 'inactive',
    );

  const [
    reason,
    setReason,
  ] =
    useState<string | null>(
      null,
    );

  const [
    busy,
    setBusy,
  ] =
    useState(false);


  useEffect(() => {
    if (
      role !== 'employee' ||
      !userId
    ) {
      setStatus('inactive');
      return;
    }

    let alive = true;

    void (
      async () => {
        const {
          data,
          error,
        } = await supabase
          .from(
            'employee_employment_state',
          )
          .select(
            'status,suspension_reason,termination_reason',
          )
          .eq(
            'employee_id',
            userId,
          )
          .maybeSingle();


        if (!alive) {
          return;
        }


        if (
          error ||
          !data
        ) {
          /*
            Fail closed.

            The profile is already inactive,
            so absence of employment metadata
            must never restore access.
          */
          setStatus(
            'inactive',
          );

          return;
        }


        if (
          data.status ===
          'terminated'
        ) {
          setStatus(
            'terminated',
          );

          setReason(
            data.termination_reason ||
              null,
          );

          return;
        }


        if (
          data.status ===
          'suspended'
        ) {
          setStatus(
            'suspended',
          );

          setReason(
            data.suspension_reason ||
              null,
          );

          return;
        }


        /*
          Profile is inactive even though
          employment state says otherwise.

          Remain locked.
        */
        setStatus(
          'inactive',
        );
      }
    )();


    return () => {
      alive = false;
    };
  }, [
    userId,
    role,
  ]);


  async function returnToLogin() {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      /*
        Clear the authenticated session
        from THIS browser.

        Employment state remains unchanged.
        Historical data remains unchanged.
      */
      await supabase.auth.signOut({
        scope: 'local',
      });
    } finally {
      window.location.replace(
        '/',
      );
    }
  }


  const terminated =
    status ===
    'terminated';

  const suspended =
    status ===
    'suspended';

  const loading =
    status ===
    'loading';


  return (
    <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white">
      <div className="w-full max-w-xl overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30">
        <div className="p-8 md:p-10">
          <div
            className={
              terminated
                ? 'grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-300'
                : suspended
                  ? 'grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-300'
                  : 'grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-blue-300'
            }
          >
            {terminated ? (
              <AlertTriangle
                size={29}
              />
            ) : suspended ? (
              <ShieldOff
                size={28}
              />
            ) : (
              <LockKeyhole
                size={28}
              />
            )}
          </div>


          <p
            className={
              terminated
                ? 'mt-7 text-xs font-bold uppercase tracking-[.22em] text-red-300'
                : suspended
                  ? 'mt-7 text-xs font-bold uppercase tracking-[.22em] text-amber-300'
                  : 'mt-7 text-xs font-bold uppercase tracking-[.22em] text-blue-300'
            }
          >
            {terminated
              ? 'Employment Status'
              : suspended
                ? 'Access Suspended'
                : 'Account Access'}
          </p>


          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {loading
              ? 'Checking account status…'
              : terminated
                ? 'Employment terminated'
                : suspended
                  ? 'Employee access suspended'
                  : 'Account inactive'}
          </h1>


          <p className="mt-4 max-w-lg leading-7 text-slate-300">
            {loading
              ? 'DMHOUSE is verifying the current employment status for this account.'
              : terminated
                ? 'Your employment with Data Market House has ended and access to the Sales OS has been revoked.'
                : suspended
                  ? 'The owner has temporarily suspended access to this employee account.'
                  : 'This account is currently inactive and cannot access the DMHOUSE workspace.'}
          </p>


          {!loading &&
            reason && (
            <div
              className={
                terminated
                  ? 'mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4'
                  : 'mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4'
              }
            >
              <p className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">
                Owner record
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-200">
                {reason}
              </p>
            </div>
          )}


          {!loading && (
            <>
              <div className="mt-7 rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex gap-3">
                  <LockKeyhole
                    className="mt-0.5 shrink-0 text-slate-400"
                    size={18}
                  />

                  <p className="text-sm leading-6 text-slate-400">
                    Signing out does not change your employment status or remove any historical records. It only ends the current browser session.
                  </p>
                </div>
              </div>


              <button
                type="button"
                onClick={() =>
                  void returnToLogin()
                }
                disabled={busy}
                className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <LogOut
                  size={17}
                />

                {busy
                  ? 'Signing out…'
                  : 'Return to Login'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
