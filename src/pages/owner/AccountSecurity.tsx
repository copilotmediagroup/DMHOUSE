import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import {
  Card,
  Field,
  PrimaryButton,
  inputClass,
} from '../../components/Primitives';
import { supabase } from '../../lib/supabase';

export default function AccountSecurity() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setSuccess('');

    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      event.currentTarget.reset();

      setSuccess(
        'Password changed successfully. Your new password is now active.',
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Password could not be changed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-5 md:p-8 lg:p-10">
      <header>
        <p className="text-sm font-semibold text-blue-600">
          OWNER SETTINGS
        </p>

        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Account Security
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Manage the password used to access the Data Market House Owner
          workspace.
        </p>
      </header>

      <Card className="mt-8 overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <KeyRound size={21} />
            </div>

            <div>
              <h2 className="font-semibold text-slate-950">
                Change password
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Choose a strong password that you do not use on another
                account.
              </p>
            </div>
          </div>
        </div>

        <form
          className="max-w-xl space-y-5 p-6"
          onSubmit={changePassword}
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
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <ShieldCheck className="mt-0.5 shrink-0" size={18} />
              <span>{success}</span>
            </div>
          )}

          <PrimaryButton disabled={busy}>
            <KeyRound className="mr-2" size={17} />
            {busy ? 'Changing password…' : 'Change password'}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
