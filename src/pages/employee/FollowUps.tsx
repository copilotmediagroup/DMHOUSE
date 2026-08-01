import { CalendarClock, Check, ChevronRight, Clock3, Mail, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { useAgencyStore } from '../../store/AgencyStore';

type View = 'all' | 'overdue' | 'today' | 'upcoming';

export default function FollowUps() {
  const { agencies, currentEmployee, completeFollowUp, snoozeFollowUp } = useAgencyStore();
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endToday = startToday + 86400000;

  const allItems = useMemo(() => agencies
    .filter((agency) => agency.ownerEmployeeId === currentEmployee.id)
    .flatMap((agency) => agency.activities
      .filter((activity) => activity.followUpAt && !activity.completedAt)
      .map((activity) => ({ agency, activity, due: new Date(activity.followUpAt as string) })))
    .sort((a, b) => a.due.getTime() - b.due.getTime()), [agencies, currentEmployee.id]);

  const items = allItems.filter(({ agency, due }) => {
    const dueTime = due.getTime();
    const matchesSearch = !query.trim() || agency.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesView = view === 'all' ||
      (view === 'overdue' && dueTime < startToday) ||
      (view === 'today' && dueTime >= startToday && dueTime < endToday) ||
      (view === 'upcoming' && dueTime >= endToday);
    return matchesSearch && matchesView;
  });

  const counts = {
    overdue: allItems.filter((item) => item.due.getTime() < startToday).length,
    today: allItems.filter((item) => item.due.getTime() >= startToday && item.due.getTime() < endToday).length,
    upcoming: allItems.filter((item) => item.due.getTime() >= endToday).length,
  };

  return (
    <div className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
      <header className="mb-7">
        <p className="text-sm font-semibold text-blue-600">Daily selling queue</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="mt-2 text-slate-500">Handle overdue promises first, finish today’s work, then prepare what comes next.</p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <QueueMetric label="Overdue" value={counts.overdue} tone="danger" />
        <QueueMetric label="Due today" value={counts.today} tone="warning" />
        <QueueMetric label="Upcoming" value={counts.upcoming} tone="blue" />
      </div>

      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-2xl bg-slate-50 px-4"><Search size={18} className="text-slate-400" /><input className="w-full bg-transparent py-3 text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agency" /></div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'overdue', 'today', 'upcoming'] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${view === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{item === 'all' ? 'All' : item === 'today' ? 'Due today' : item[0].toUpperCase() + item.slice(1)}</button>)}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {items.map(({ agency, activity, due }) => {
          const overdue = due.getTime() < startToday;
          const today = due.getTime() >= startToday && due.getTime() < endToday;
          return (
            <Card key={activity.id} className={`overflow-hidden ${overdue ? 'border-red-200' : today ? 'border-amber-200' : ''}`}>
              <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:p-6">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${overdue ? 'bg-red-50 text-red-600' : today ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}><CalendarClock /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{agency.name}</p><Pill tone={overdue ? 'danger' : today ? 'warning' : 'blue'}>{overdue ? 'Overdue' : today ? 'Due today' : 'Upcoming'}</Pill></div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{activity.disposition}</p>
                  <p className="mt-1 text-sm text-slate-500">{due.toLocaleString()}</p>
                  {activity.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{activity.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2 md:max-w-[340px] md:justify-end">
                  {agency.generalEmail && <Link to={`/employee/outreach?agency=${agency.id}`}><SecondaryButton className="min-h-10 px-3"><Mail className="mr-2" size={15} />Email</SecondaryButton></Link>}
                  <SecondaryButton className="min-h-10 px-3" onClick={() => { const tomorrow = new Date(Date.now() + 86400000); void snoozeFollowUp(agency.id, activity.id, tomorrow.toISOString()); }}><Clock3 className="mr-2" size={15} />Tomorrow</SecondaryButton>
                  <PrimaryButton className="min-h-10 px-3" onClick={() => void completeFollowUp(agency.id, activity.id)}><Check className="mr-2" size={15} />Complete</PrimaryButton>
                  <Link to={`/employee/agencies/${agency.id}`}><SecondaryButton className="min-h-10 px-3" aria-label="Open agency"><ChevronRight size={16} /></SecondaryButton></Link>
                </div>
              </div>
            </Card>
          );
        })}
        {!items.length && <Card className="p-12 text-center"><Check className="mx-auto text-emerald-500" size={36} /><p className="mt-3 font-semibold">This queue is clear</p><p className="mt-1 text-sm text-slate-500">No follow-ups match the current view.</p></Card>}
      </div>
    </div>
  );
}

function QueueMetric({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'warning' | 'blue' }) {
  const classes = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-blue-600';
  return <Card className="px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-2xl font-semibold ${classes}`}>{value}</p></Card>;
}
