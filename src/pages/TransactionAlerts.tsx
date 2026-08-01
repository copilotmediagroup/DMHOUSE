import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCheck,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Filter,
  Play,
  Search,
  ShieldAlert,
} from 'lucide-react';
import {
  Card,
  Pill,
  PrimaryButton,
  SecondaryButton,
} from '../components/Primitives';
import {
  type TransactionAlert,
  useTransactionAutomation,
} from '../store/TransactionAutomationStore';

type FilterKey =
  | 'all'
  | 'unread'
  | 'critical'
  | 'warning'
  | 'payments'
  | 'reservations'
  | 'documents';

const label = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not scheduled';

const normalize = (value?: string) => (value || '').toLowerCase();

export default function TransactionAlerts() {
  const {
    alerts,
    metrics,
    loading,
    error,
    run,
    markRead,
    markAllRead,
  } = useTransactionAutomation();

  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return alerts.filter(alert => {
      const haystack = [
        alert.title,
        alert.body,
        alert.type,
        alert.severity,
      ]
        .map(normalize)
        .join(' ');

      const matchesSearch = !query || haystack.includes(query);

      const type = normalize(alert.type);
      const title = normalize(alert.title);
      const body = normalize(alert.body);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && !alert.read_at) ||
        (filter === 'critical' && alert.severity === 'critical') ||
        (filter === 'warning' && alert.severity === 'warning') ||
        (filter === 'payments' &&
          [type, title, body].some(value =>
            /payment|deposit|balance|wire|fund/.test(value),
          )) ||
        (filter === 'reservations' &&
          [type, title, body].some(value =>
            /reservation|expir/.test(value),
          )) ||
        (filter === 'documents' &&
          [type, title, body].some(value =>
            /document|nda|agreement|contract|signature/.test(value),
          ));

      return matchesSearch && matchesFilter;
    });
  }, [alerts, filter, search]);

  const unread = alerts.filter(alert => !alert.read_at).length;
  const critical = alerts.filter(
    alert => alert.severity === 'critical' && !alert.read_at,
  ).length;
  const warning = alerts.filter(
    alert => alert.severity === 'warning' && !alert.read_at,
  ).length;

  async function refreshActions() {
    setRunning(true);
    setNotice('');

    try {
      const processed = await run();
      setNotice(
        processed > 0
          ? `${processed} alert${processed === 1 ? '' : 's'} processed.`
          : 'Automation completed. No new alerts were created.',
      );
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'Unable to refresh transaction alerts.',
      );
    } finally {
      setRunning(false);
    }
  }

  async function openAlert(alert: TransactionAlert) {
    if (!alert.read_at) {
      await markRead(alert.id);
    }

    if (alert.action_path) {
      navigate(alert.action_path);
    }
  }

  return (
    <div className="p-5 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.2em] text-blue-600">
              NOTIFICATIONS & ALERTS · v2.4.0
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Transaction Command Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Documents, approvals, reservations, payments and buyer actions
              that require attention.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              onClick={() => void markAllRead()}
              disabled={unread === 0}
            >
              <CheckCheck size={16} className="mr-2" />
              Mark all read
            </SecondaryButton>

            <PrimaryButton
              onClick={() => void refreshActions()}
              disabled={running || loading}
            >
              <Play size={16} className="mr-2" />
              {running ? 'Running…' : 'Refresh actions'}
            </PrimaryButton>
          </div>
        </header>

        {notice && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            {notice}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<BellRing />} label="Unread alerts" value={String(metrics?.unread_alerts ?? unread)} warning={unread > 0} />
          <Metric icon={<AlertTriangle />} label="Critical" value={String(critical)} danger={critical > 0} />
          <Metric icon={<Clock3 />} label="Payments overdue" value={String(metrics?.payments_overdue ?? 0)} danger={(metrics?.payments_overdue ?? 0) > 0} />
          <Metric icon={<CalendarClock />} label="Reservations expiring" value={String(metrics?.reservations_expiring ?? 0)} warning={(metrics?.reservations_expiring ?? 0) > 0} />
          <Metric icon={<FileCheck2 />} label="NDAs waiting" value={String(metrics?.nda_waiting ?? 0)} />
          <Metric icon={<FileCheck2 />} label="Agreements waiting" value={String(metrics?.agreements_waiting ?? 0)} />
          <Metric icon={<CircleDollarSign />} label="Payments due" value={String(metrics?.payments_due ?? 0)} warning={(metrics?.payments_due ?? 0) > 0} />
          <Metric icon={<ShieldAlert />} label="Final release ready" value={String(metrics?.final_release_ready ?? 0)} />
        </div>

        <Card className="mt-7 overflow-hidden">
          <div className="border-b border-slate-100 p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm text-slate-500">Current action queue</p>
                <h2 className="mt-1 text-xl font-semibold">
                  {filtered.length} alert{filtered.length === 1 ? '' : 's'} shown
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-[260px]">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500"
                    placeholder="Search alerts..."
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>

                <div className="relative">
                  <Filter size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    className="rounded-2xl border border-slate-200 py-3 pl-10 pr-9 text-sm outline-none focus:border-blue-500"
                    value={filter}
                    onChange={event => setFilter(event.target.value as FilterKey)}
                  >
                    <option value="all">All alerts</option>
                    <option value="unread">Unread</option>
                    <option value="critical">Critical</option>
                    <option value="warning">Warnings</option>
                    <option value="payments">Payments</option>
                    <option value="reservations">Reservations</option>
                    <option value="documents">Documents</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <QueuePill active={filter === 'unread'} onClick={() => setFilter('unread')} label={`Unread ${unread}`} />
              <QueuePill active={filter === 'critical'} onClick={() => setFilter('critical')} label={`Critical ${critical}`} />
              <QueuePill active={filter === 'warning'} onClick={() => setFilter('warning')} label={`Warnings ${warning}`} />
              <QueuePill active={filter === 'payments'} onClick={() => setFilter('payments')} label="Payments" />
              <QueuePill active={filter === 'reservations'} onClick={() => setFilter('reservations')} label="Reservations" />
              <QueuePill active={filter === 'documents'} onClick={() => setFilter('documents')} label="Documents" />
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="p-6 text-sm text-slate-500">Loading alerts…</p>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <BellRing className="mx-auto text-slate-300" />
                <p className="mt-3 font-semibold">Queue clear</p>
                <p className="mt-1 text-sm text-slate-500">
                  No alerts match the selected filter.
                </p>
              </div>
            ) : (
              filtered.map(alert => (
                <button
                  key={alert.id}
                  onClick={() => void openAlert(alert)}
                  className={`block w-full p-5 text-left transition hover:bg-slate-50 ${alert.read_at ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{alert.title}</p>
                        <Pill tone={tone(alert.severity)}>{alert.severity}</Pill>
                        <Pill tone="neutral">{alert.type.replace(/_/g, ' ')}</Pill>
                      </div>

                      {alert.body && (
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {alert.body}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                        <span>Created {label(alert.created_at)}</span>
                        {alert.due_at && (
                          <span className={new Date(alert.due_at).getTime() < Date.now() ? 'font-semibold text-red-600' : ''}>
                            Due {label(alert.due_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {!alert.read_at && (
                      <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  warning = false,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className={danger ? 'text-red-600' : warning ? 'text-amber-600' : 'text-blue-600'}>
        {icon}
      </div>
      <p className="mt-5 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

function QueuePill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  );
}

function tone(severity: TransactionAlert['severity']) {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'success';
  return 'blue';
}
