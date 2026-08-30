import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  GraduationCap,
  Link2,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Card,
  Field,
  Pill,
  PrimaryButton,
  SecondaryButton,
  inputClass,
} from '../../components/Primitives';
import { supabase } from '../../lib/supabase';
import EmployeeEmploymentActions, {
  type EmploymentRecord,
} from '../../components/employment/EmployeeEmploymentActions';
import HiringCommandCenter from '../../components/hiring/HiringCommandCenter';

type ExistingMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: 'owner' | 'employee';
  is_active: boolean;
  created_at: string;
};

type AcademyInvite = {
  id: string;
  email: string;
  fullName?: string | null;
  status:
    | 'pending'
    | 'accepted'
    | 'revoked'
    | 'expired';
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
};

type AcademyEmployee = {
  id: string;
  name: string;
  email?: string | null;
  role: 'academy' | 'employee';
  active: boolean;
  academyRequired: boolean;
  certified: boolean;
  certifiedAt?: string | null;
  finalScore?: number | null;
  academyVersion?: number | null;
  academyStatus?: string | null;
  currentMission?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type Roster = {
  invites: AcademyInvite[];
  employees: AcademyEmployee[];
};

type CreatedInvite = {
  invite_id: string;
  invite_token: string;
  expires_at: string;
};

function niceDate(
  value?: string | null,
) {
  if (!value) return '—';

  return new Date(
    value,
  ).toLocaleString();
}

function inviteTone(
  status: AcademyInvite['status'],
) {
  if (status === 'accepted')
    return 'success';

  if (
    status === 'revoked' ||
    status === 'expired'
  )
    return 'danger';

  return 'blue';
}

export default function EmployeeManagement() {
  const [members, setMembers] =
    useState<ExistingMember[]>([]);

  const [
    employmentById,
    setEmploymentById,
  ] =
    useState<Record<string, EmploymentRecord>>(
      {},
    );

  const [roster, setRoster] =
    useState<Roster>({
      invites: [],
      employees: [],
    });

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [inviteLink, setInviteLink] =
    useState('');

  const load = useCallback(
    async () => {
      setLoading(true);
      setError('');

      const [
        membersResult,
        rosterResult,
        employmentResult,
      ] = await Promise.all([
        supabase.rpc(
          'dmh_company_members',
        ),
        supabase.rpc(
          'dmh_owner_academy_roster',
        ),
        supabase.rpc(
          'dmh_owner_employment_roster',
        ),
      ]);

      if (membersResult.error) {
        setError(
          membersResult.error.message,
        );
        setLoading(false);
        return;
      }

      if (rosterResult.error) {
        setError(
          rosterResult.error.message,
        );
        setLoading(false);
        return;
      }

      if (employmentResult.error) {
        setError(
          employmentResult.error.message,
        );
        setLoading(false);
        return;
      }

      setMembers(
        (membersResult.data ||
          []) as ExistingMember[],
      );

      const employmentMap:
        Record<string, EmploymentRecord> =
        {};

      for (
        const row of (
          employmentResult.data ||
          []
        ) as EmploymentRecord[]
      ) {
        employmentMap[
          row.employee_id
        ] = row;
      }

      setEmploymentById(
        employmentMap,
      );

      const raw =
        (rosterResult.data ||
          {}) as Partial<Roster>;

      setRoster({
        invites: Array.isArray(
          raw.invites,
        )
          ? raw.invites
          : [],

        employees: Array.isArray(
          raw.employees,
        )
          ? raw.employees
          : [],
      });

      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const currentEmployees =
    useMemo(
      () =>
        roster.employees.filter(
          (employee) =>
            employee.role ===
            'employee',
        ),
      [roster.employees],
    );

  const academyCandidates =
    useMemo(
      () =>
        roster.employees.filter(
          (employee) =>
            employee.role ===
            'academy',
        ),
      [roster.employees],
    );

  const pendingInvites =
    roster.invites.filter(
      (invite) =>
        invite.status ===
        'pending',
    );

  async function createInvite(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (busy) return;

    const form =
      new FormData(
        event.currentTarget,
      );

    const fullName = String(
      form.get('fullName') || '',
    ).trim();

    const email = String(
      form.get('email') || '',
    )
      .trim()
      .toLowerCase();

    const academyRequired =
      form.get('academyRequired') ===
      'on';

    if (!email) return;

    setBusy('invite');
    setMessage('');
    setError('');
    setInviteLink('');

    const { data, error: rpcError } =
      await supabase.rpc(
        'dmh_owner_create_employee_invite',
        {
          p_email: email,
          p_full_name:
            fullName || null,
          p_expires_hours: 168,
          p_academy_required:
            academyRequired,
        },
      );

    if (rpcError) {
      setError(rpcError.message);
      setBusy('');
      return;
    }

    const created =
      Array.isArray(data) &&
      data.length
        ? (data[0] as CreatedInvite)
        : null;

    if (!created) {
      setError(
        'The invitation was created, but the secure invite token was not returned.',
      );
      setBusy('');
      return;
    }

    const origin =
      window.location.origin;

    const link =
      `${origin}/academy/invite?token=${encodeURIComponent(
        created.invite_token,
      )}`;

    setInviteLink(link);

    const {
      data: sendResult,
      error: sendError,
    } =
      await supabase.functions.invoke(
        'send-employee-invite',
        {
          body: {
            inviteId:
              created.invite_id,
            inviteToken:
              created.invite_token,
            inviteUrl:
              link,
          },
        },
      );

    if (
      sendError ||
      sendResult?.ok === false
    ) {
      setError(
        sendResult?.error ||
        sendError?.message ||
        'The employee invitation was created, but the email could not be sent.',
      );

      setMessage(
        `Invitation created for ${email}. You can still use the secure invite link below.`,
      );

      event.currentTarget.reset();

      await load();

      setBusy('');

      return;
    }

    setMessage(
      academyRequired
        ? `Academy invitation emailed to ${email}. It expires ${niceDate(
            created.expires_at,
          )}.`
        : `Employee invitation emailed to ${email}. Academy was waived by Owner. Employee Sales OS access begins after account setup.`,
    );

    event.currentTarget.reset();

    await load();

    setBusy('');
  }

  async function copyInvite() {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(
        inviteLink,
      );

      setMessage(
        'Secure Academy invite link copied.',
      );
    } catch {
      setMessage(
        'Copy was blocked by the browser. Select the link below and copy it manually.',
      );
    }
  }

  async function revokeInvite(
    invite: AcademyInvite,
  ) {
    if (
      !window.confirm(
        `Revoke the Academy invitation for ${invite.email}?`,
      )
    ) {
      return;
    }

    setBusy(
      `invite-${invite.id}`,
    );
    setError('');
    setMessage('');

    const { error: rpcError } =
      await supabase.rpc(
        'dmh_owner_revoke_employee_invite',
        {
          p_invite_id:
            invite.id,
        },
      );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setMessage(
        `Invitation revoked for ${invite.email}.`,
      );

      await load();
    }

    setBusy('');
  }

  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8 lg:p-10">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Employee Identity &
            Certification
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Employees
          </h1>

          <p className="mt-2 max-w-3xl text-slate-500">
            Invite candidates into
            DMHOUSE Academy, monitor
            certification, and control
            access to the employee
            Sales OS.
          </p>
        </div>

        <SecondaryButton
          onClick={load}
          disabled={loading}
        >
          <RefreshCw
            className="mr-2"
            size={17}
          />
          Refresh
        </SecondaryButton>
      </header>

      {error && (
        <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <Users className="text-blue-600" />

          <p className="mt-4 text-sm text-slate-500">
            Certified employees
          </p>

          <p className="mt-1 text-3xl font-semibold">
            {
              currentEmployees.filter(
                (employee) =>
                  employee.active,
              ).length
            }
          </p>
        </Card>

        <Card className="p-5">
          <GraduationCap className="text-violet-600" />

          <p className="mt-4 text-sm text-slate-500">
            In Academy
          </p>

          <p className="mt-1 text-3xl font-semibold">
            {
              academyCandidates.length
            }
          </p>
        </Card>

        <Card className="p-5">
          <Mail className="text-amber-600" />

          <p className="mt-4 text-sm text-slate-500">
            Pending invites
          </p>

          <p className="mt-1 text-3xl font-semibold">
            {pendingInvites.length}
          </p>
        </Card>

        <Card className="p-5">
          <ShieldCheck className="text-emerald-600" />

          <p className="mt-4 text-sm text-slate-500">
            Portal rule
          </p>

          <p className="mt-1 text-lg font-semibold">
            Pass to unlock
          </p>
        </Card>
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <UserPlus
                  size={21}
                />
              </div>

              <div>
                <h2 className="font-semibold">
                  Invite employee
                </h2>

                <p className="text-sm text-slate-500">
                  Choose the employee's
                  Academy requirement.
                </p>
              </div>
            </div>

            <form
              onSubmit={createInvite}
              className="mt-6 space-y-4"
            >
              <Field label="Full name">
                <input
                  className={inputClass}
                  name="fullName"
                  placeholder="Candidate name"
                />
              </Field>

              <Field label="Email">
                <input
                  className={inputClass}
                  name="email"
                  type="email"
                  required
                  placeholder="employee@example.com"
                />
              </Field>

              <label className="block cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Require DMHOUSE Academy
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Standard hires complete
                      Academy and must score at
                      least 75% on the final
                      assessment before entering
                      the Employee Sales OS.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    name="academyRequired"
                    defaultChecked
                    className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                  />
                </div>

                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  <strong>
                    Owner bypass:
                  </strong>{' '}
                  Turn this off to waive
                  Academy. The employee enters
                  the Sales OS after account
                  setup. A waiver is not an
                  Academy certification.
                </p>
              </label>

              <PrimaryButton
                className="w-full"
                disabled={
                  busy === 'invite'
                }
              >
                <Mail
                  className="mr-2"
                  size={17}
                />

                {busy === 'invite'
                  ? 'Creating invite…'
                  : 'Create Employee Invite'}
              </PrimaryButton>
            </form>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex gap-3">
                <LockKeyhole
                  className="mt-0.5 shrink-0 text-blue-700"
                  size={18}
                />

                <p className="text-xs leading-5 text-blue-900">
                  The employee creates
                  one Supabase Auth
                  account from this
                  invitation.
                  Academy-required hires
                  unlock the Employee
                  Sales OS after
                  certification.
                  Owner-waived hires
                  receive Sales OS access
                  after account setup.
                </p>
              </div>
            </div>
          </Card>

          {inviteLink && (
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <Link2 className="text-emerald-600" />

                <h3 className="font-semibold">
                  Secure invite ready
                </h3>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                For this validation
                stage, copy the secure
                link and send it to the
                invited candidate.
              </p>

              <div className="mt-4 break-all rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                {inviteLink}
              </div>

              <PrimaryButton
                onClick={copyInvite}
                className="mt-4 w-full"
              >
                <Copy
                  className="mr-2"
                  size={17}
                />
                Copy Invite Link
              </PrimaryButton>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <HiringCommandCenter />

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="font-semibold">
                Employee invitations
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Invitation lifecycle
                before Academy account
                creation.
              </p>
            </div>

            {loading ? (
              <div className="p-8 text-sm text-slate-500">
                Loading invitations…
              </div>
            ) : roster.invites.length ===
              0 ? (
              <div className="p-8 text-sm text-slate-500">
                No Academy invitations
                have been created.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {roster.invites.map(
                  (invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col gap-4 p-6 md:flex-row md:items-center"
                    >
                      <div className="flex flex-1 items-center gap-4">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                          <Mail
                            size={19}
                          />
                        </div>

                        <div>
                          <p className="font-semibold">
                            {invite.fullName ||
                              invite.email}
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            {invite.email}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Expires{' '}
                            {niceDate(
                              invite.expiresAt,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Pill
                          tone={
                            inviteTone(
                              invite.status,
                            ) as any
                          }
                        >
                          {
                            invite.status
                          }
                        </Pill>

                        {invite.status ===
                          'pending' && (
                          <SecondaryButton
                            onClick={() =>
                              revokeInvite(
                                invite,
                              )
                            }
                            disabled={
                              busy ===
                              `invite-${invite.id}`
                            }
                          >
                            <XCircle
                              className="mr-2"
                              size={16}
                            />
                            Revoke
                          </SecondaryButton>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="font-semibold">
                Certified company
                members
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Suspend access, terminate
                employment, reinstate
                suspended employees, or
                explicitly rehire former
                employees without deleting
                historical records.
              </p>
            </div>

            {loading ? (
              <div className="p-8 text-sm text-slate-500">
                Loading company
                members…
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.map(
                  (member) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center"
                    >
                      <div className="flex flex-1 items-center gap-4">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                          <UserRound
                            size={20}
                          />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">
                              {
                                member.full_name
                              }
                            </p>

                            {member.role ===
                              'owner' && (
                              <Pill tone="blue">
                                Owner
                              </Pill>
                            )}

                            {member.role ===
                              'employee' && (
                              <Pill tone="success">
                                <CheckCircle2
                                  className="mr-1"
                                  size={13}
                                />
                                Employee
                              </Pill>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {member.email ||
                              'No email available'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {member.role ===
                        'employee' ? (
                          <EmployeeEmploymentActions
                            member={
                              member
                            }
                            employment={
                              employmentById[
                                member.id
                              ]
                            }
                            onChanged={
                              load
                            }
                            onMessage={
                              setMessage
                            }
                            onError={
                              setError
                            }
                          />
                        ) : (
                          <Pill tone="blue">
                            Owner
                          </Pill>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
