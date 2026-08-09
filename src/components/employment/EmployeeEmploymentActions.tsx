import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShieldOff,
  UserMinus,
  X,
} from 'lucide-react';
import {
  useState,
} from 'react';
import {
  Pill,
  SecondaryButton,
} from '../Primitives';
import { supabase } from '../../lib/supabase';

export type EmploymentRecord = {
  employee_id: string;

  employment_status:
    | 'active'
    | 'suspended'
    | 'terminated';

  suspended_at?: string | null;
  suspension_reason?: string | null;

  terminated_at?: string | null;
  termination_reason?: string | null;

  rehired_at?: string | null;
  rehire_reason?: string | null;

  updated_at?: string | null;
};

type Member = {
  id: string;
  full_name: string;
  is_active: boolean;
};

type Action =
  | 'suspend'
  | 'terminate'
  | 'reinstate'
  | 'rehire';

type Props = {
  member: Member;

  employment?: EmploymentRecord;

  onChanged: () => Promise<void>;

  onMessage: (
    message: string,
  ) => void;

  onError: (
    message: string,
  ) => void;
};

function labelFor(
  status: EmploymentRecord['employment_status'],
) {
  switch (status) {
    case 'terminated':
      return 'Terminated';

    case 'suspended':
      return 'Suspended';

    default:
      return 'Active';
  }
}

function actionTitle(
  action: Action,
) {
  switch (action) {
    case 'terminate':
      return 'Terminate Employee';

    case 'suspend':
      return 'Suspend Employee';

    case 'reinstate':
      return 'Reinstate Employee';

    case 'rehire':
      return 'Rehire Employee';
  }
}

export default function EmployeeEmploymentActions({
  member,
  employment,
  onChanged,
  onMessage,
  onError,
}: Props) {
  const status =
    employment?.employment_status ||
    (
      member.is_active
        ? 'active'
        : 'suspended'
    );

  const [
    action,
    setAction,
  ] =
    useState<Action | null>(
      null,
    );

  const [
    reason,
    setReason,
  ] =
    useState('');

  const [
    confirmation,
    setConfirmation,
  ] =
    useState('');

  const [
    busy,
    setBusy,
  ] =
    useState(false);


  function close() {
    if (busy) return;

    setAction(null);
    setReason('');
    setConfirmation('');
  }


  function open(
    next: Action,
  ) {
    setReason('');
    setConfirmation('');
    setAction(next);
  }


  async function submit() {
    if (!action || busy) {
      return;
    }

    const cleanReason =
      reason.trim();

    if (!cleanReason) {
      onError(
        'A reason is required.',
      );

      return;
    }


    if (
      action === 'terminate' &&
      confirmation.trim().toUpperCase() !==
        'TERMINATE'
    ) {
      onError(
        'Type TERMINATE to confirm this employment termination.',
      );

      return;
    }


    const rpc =
      action === 'terminate'
        ? 'dmh_owner_terminate_employee'
        : action === 'suspend'
          ? 'dmh_owner_suspend_employee'
          : action === 'rehire'
            ? 'dmh_owner_rehire_employee'
            : 'dmh_owner_reinstate_employee';


    setBusy(true);

    onError('');


    const {
      error,
    } = await supabase.rpc(
      rpc,
      {
        p_employee_id:
          member.id,

        p_reason:
          cleanReason,
      },
    );


    if (error) {
      onError(
        error.message,
      );

      setBusy(false);
      return;
    }


    /*
      SECURITY FOLLOW-UP

      Suspension / termination has already
      succeeded in PostgreSQL at this point.

      Now notify the privileged Edge Function
      so the server can verify the Owner and
      record the session-security event.

      We deliberately do NOT roll back the
      employment action if this secondary
      request fails.
    */
    let securityWarning = '';

    if (
      action === 'suspend' ||
      action === 'terminate'
    ) {
      const {
        data: securityData,
        error: securityError,
      } =
        await supabase.functions.invoke(
          'revoke-employee-sessions',
          {
            body: {
              employeeId:
                member.id,

              action,
            },
          },
        );


      if (securityError) {
        console.error(
          'Employment security follow-up failed:',
          securityError,
        );

        securityWarning =
          ' Employment access was changed successfully, but the server security follow-up could not be confirmed.';
      }

      else if (
        !securityData ||
        securityData.ok !== true
      ) {
        console.error(
          'Employment security follow-up returned an unexpected response:',
          securityData,
        );

        securityWarning =
          ' Employment access was changed successfully, but the server security follow-up returned an unexpected response.';
      }

      else {
        console.log(
          'Employment security follow-up confirmed:',
          securityData,
        );
      }
    }


    const past =
      action === 'terminate'
        ? 'terminated'
        : action === 'suspend'
          ? 'suspended'
          : action === 'rehire'
            ? 'rehired'
            : 'reinstated';


    onMessage(
      `${member.full_name} has been ${past}.${securityWarning}`,
    );


    await onChanged();

    setBusy(false);

    close();
  }


  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Pill
          tone={
            status === 'active'
              ? 'success'
              : 'danger'
          }
        >
          {status ===
          'active' ? (
            <CheckCircle2
              className="mr-1"
              size={13}
            />
          ) : status ===
            'terminated' ? (
            <UserMinus
              className="mr-1"
              size={13}
            />
          ) : (
            <ShieldOff
              className="mr-1"
              size={13}
            />
          )}

          {labelFor(status)}
        </Pill>


        {status ===
          'active' && (
          <>
            <SecondaryButton
              onClick={() =>
                open(
                  'suspend',
                )
              }
            >
              <ShieldOff
                className="mr-2"
                size={16}
              />

              Suspend
            </SecondaryButton>

            <button
              type="button"
              onClick={() =>
                open(
                  'terminate',
                )
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              <UserMinus
                size={16}
              />

              Terminate
            </button>
          </>
        )}


        {status ===
          'suspended' && (
          <>
            <SecondaryButton
              onClick={() =>
                open(
                  'reinstate',
                )
              }
            >
              <RotateCcw
                className="mr-2"
                size={16}
              />

              Reinstate
            </SecondaryButton>

            <button
              type="button"
              onClick={() =>
                open(
                  'terminate',
                )
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              <UserMinus
                size={16}
              />

              Terminate
            </button>
          </>
        )}


        {status ===
          'terminated' && (
          <SecondaryButton
            onClick={() =>
              open(
                'rehire',
              )
            }
          >
            <RotateCcw
              className="mr-2"
              size={16}
            />

            Rehire
          </SecondaryButton>
        )}
      </div>


      {action && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/60 p-5 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div
              className={
                action ===
                'terminate'
                  ? 'bg-red-600 p-6 text-white'
                  : 'bg-slate-950 p-6 text-white'
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    {action ===
                    'terminate' ? (
                      <AlertTriangle
                        size={19}
                      />
                    ) : (
                      <ShieldOff
                        size={19}
                      />
                    )}

                    <p className="text-xs font-bold uppercase tracking-[.17em] opacity-80">
                      Owner Employment Control
                    </p>
                  </div>

                  <h3 className="mt-3 text-2xl font-semibold">
                    {actionTitle(
                      action,
                    )}
                  </h3>

                  <p className="mt-2 text-sm opacity-80">
                    {
                      member.full_name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
                >
                  <X
                    size={18}
                  />
                </button>
              </div>
            </div>


            <div className="p-6">
              {action ===
                'terminate' && (
                <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-900">
                    Permanent employment action
                  </p>

                  <p className="mt-2 text-sm leading-6 text-red-700">
                    Sales OS access will be revoked.
                    The employee's historical deals,
                    Academy record, activity, and
                    audit history will remain intact.
                    They cannot be normally activated
                    after termination.
                  </p>
                </div>
              )}


              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Reason
                </span>

                <textarea
                  value={reason}
                  onChange={(
                    event,
                  ) =>
                    setReason(
                      event.target
                        .value,
                    )
                  }
                  rows={4}
                  placeholder={
                    action ===
                    'terminate'
                      ? 'Document the reason for termination…'
                      : 'Document the reason for this employment action…'
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>


              {action ===
                'terminate' && (
                <label className="mt-5 block">
                  <span className="text-sm font-semibold text-slate-700">
                    Type TERMINATE to confirm
                  </span>

                  <input
                    value={
                      confirmation
                    }
                    onChange={(
                      event,
                    ) =>
                      setConfirmation(
                        event.target
                          .value,
                      )
                    }
                    className="mt-2 w-full rounded-2xl border border-red-200 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
                    placeholder="TERMINATE"
                  />
                </label>
              )}


              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <SecondaryButton
                  onClick={close}
                  disabled={busy}
                >
                  Cancel
                </SecondaryButton>

                <button
                  type="button"
                  onClick={() =>
                    void submit()
                  }
                  disabled={
                    busy ||
                    !reason.trim() ||
                    (
                      action ===
                        'terminate' &&
                      confirmation
                        .trim()
                        .toUpperCase() !==
                        'TERMINATE'
                    )
                  }
                  className={
                    action ===
                    'terminate'
                      ? 'inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40'
                      : 'inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40'
                  }
                >
                  {busy
                    ? 'Processing…'
                    : actionTitle(
                        action,
                      )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
