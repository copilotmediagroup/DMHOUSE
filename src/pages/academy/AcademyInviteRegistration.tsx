import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Card,
  Field,
  PrimaryButton,
  inputClass,
} from '../../components/Primitives';
import { supabase } from '../../lib/supabase';

type Invite = {
  invite_id: string;
  email: string;
  intended_full_name: string | null;
  company_id: string;
  expires_at: string;
};

export default function AcademyInviteRegistration() {
  const token = useMemo(
    () =>
      new URLSearchParams(
        window.location.search,
      )
        .get('token')
        ?.trim() || '',
    [],
  );

  const [invite, setInvite] =
    useState<Invite | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [complete, setComplete] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validate() {
      setLoading(true);
      setError('');

      if (!token) {
        setError(
          'This Academy invitation is missing its secure token.',
        );
        setLoading(false);
        return;
      }

      const { data, error: rpcError } =
        await supabase.rpc(
          'dmh_validate_employee_invite',
          {
            p_token: token,
          },
        );

      if (cancelled) return;

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      const row =
        Array.isArray(data) &&
        data.length
          ? (data[0] as Invite)
          : null;

      if (!row) {
        setError(
          'This invitation is invalid, expired, revoked, or has already been used.',
        );
        setLoading(false);
        return;
      }

      setInvite(row);
      setLoading(false);
    }

    validate();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!invite || busy) return;

    setBusy(true);
    setError('');

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

    const password = String(
      form.get('password') || '',
    );

    const confirmPassword =
      String(
        form.get(
          'confirmPassword',
        ) || '',
      );

    if (!fullName) {
      setError(
        'Enter your full name.',
      );
      setBusy(false);
      return;
    }

    if (
      email !==
      invite.email.toLowerCase()
    ) {
      setError(
        'Your email must match the address that received this Academy invitation.',
      );
      setBusy(false);
      return;
    }

    if (password.length < 8) {
      setError(
        'Your password must contain at least 8 characters.',
      );
      setBusy(false);
      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        'The passwords do not match.',
      );
      setBusy(false);
      return;
    }

    const { data, error: signUpError } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            account_type:
              'academy',
            academy_invite_token:
              token,
          },
        },
      });

    if (signUpError) {
      setError(
        signUpError.message,
      );
      setBusy(false);
      return;
    }

    if (data.session) {
      window.location.replace(
        '/academy',
      );
      return;
    }

    setComplete(true);
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#08101f] p-6 text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />

          <p className="mt-4 text-sm font-medium text-slate-300">
            Validating your secure
            Academy invitation…
          </p>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#08101f] p-5">
        <Card className="w-full max-w-lg p-8">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
            <LockKeyhole
              size={27}
            />
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-red-600">
            Academy invitation unavailable
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            This invitation cannot
            be opened.
          </h1>

          <p className="mt-4 leading-7 text-slate-500">
            {error}
          </p>

          <p className="mt-4 text-sm text-slate-400">
            Contact the Data Market
            House owner for a new
            employee invitation.
          </p>
        </Card>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#08101f] p-5">
        <Card className="w-full max-w-lg p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2
              size={31}
            />
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-emerald-600">
            Account created
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Confirm your email
          </h1>

          <p className="mt-4 leading-7 text-slate-500">
            We created your DMHOUSE
            Academy account using{' '}
            <strong>
              {invite?.email}
            </strong>
            .
          </p>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            Confirm the email from
            Supabase, then sign in
            using the same email and
            password you just
            created. Those become
            your permanent DMHOUSE
            credentials.
          </p>

          <a
            href="/"
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Continue to Sign In
            <ArrowRight
              size={17}
            />
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08101f] px-5 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <div className="text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-300/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <GraduationCap
              size={16}
            />
            DMHOUSE QuickStart™
          </div>

          <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
            Your employee journey
            starts here.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
            Create one secure account,
            complete the Academy, and
            pass certification. The
            same email and password
            will then unlock your
            employee workspace.
          </p>

          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <UserRound className="text-blue-300" />

              <p className="mt-3 text-sm font-semibold">
                One identity
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <GraduationCap className="text-blue-300" />

              <p className="mt-3 text-sm font-semibold">
                Six missions
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck className="text-blue-300" />

              <p className="mt-3 text-sm font-semibold">
                Portal after pass
              </p>
            </div>
          </div>
        </div>

        <Card className="p-7 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">
            Employee invitation
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            Create your DMHOUSE account
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            This account is used for
            both Academy and your
            employee portal after
            certification.
          </p>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex gap-3">
              <Mail
                size={18}
                className="mt-0.5 shrink-0 text-blue-600"
              />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Invited email
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {invite?.email}
                </p>
              </div>
            </div>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={submit}
          >
            <Field label="Full name">
              <input
                className={inputClass}
                name="fullName"
                required
                defaultValue={
                  invite
                    ?.intended_full_name ||
                  ''
                }
                autoComplete="name"
              />
            </Field>

            <Field label="Email">
              <input
                className={`${inputClass} bg-slate-50`}
                name="email"
                type="email"
                required
                readOnly
                value={
                  invite?.email || ''
                }
                autoComplete="email"
              />
            </Field>

            <Field label="Password">
              <input
                className={inputClass}
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>

            <Field label="Confirm password">
              <input
                className={inputClass}
                name="confirmPassword"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>

            {error && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <PrimaryButton
              className="w-full"
              disabled={busy}
            >
              {busy
                ? 'Creating account…'
                : 'Create Account & Enter Academy'}

              {!busy && (
                <KeyRound
                  className="ml-2"
                  size={17}
                />
              )}
            </PrimaryButton>
          </form>

          <div className="mt-6 flex gap-3 border-t border-slate-100 pt-5">
            <LockKeyhole
              size={17}
              className="mt-0.5 shrink-0 text-slate-400"
            />

            <p className="text-xs leading-5 text-slate-500">
              Your employee portal
              remains locked until you
              successfully complete
              DMHOUSE QuickStart
              certification.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
