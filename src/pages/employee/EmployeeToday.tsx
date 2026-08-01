import { AlertTriangle, ArrowRight, BriefcaseBusiness, Clock3, Mail, Phone, Search, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { usePortfolioStore } from '../../store/PortfolioStore';
import { useAgencyStore } from '../../store/AgencyStore';

const money = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(n);

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export default function EmployeeToday() {
  const { active } = usePortfolioStore();
  const { agencies, currentEmployee } = useAgencyStore();
  const mine = agencies.filter((agency) => agency.ownerEmployeeId === currentEmployee.id);
  const followUps = mine
    .flatMap((agency) => agency.activities
      .filter((activity) => activity.followUpAt && !activity.completedAt)
      .map((activity) => ({ agency, activity, due: new Date(activity.followUpAt as string).getTime() })))
    .sort((a, b) => a.due - b.due);
  const today = followUps.filter((item) => item.due >= startOfDay() && item.due <= endOfDay());
  const overdue = followUps.filter((item) => item.due < startOfDay());
  const dealsNeedingAction = mine.filter((agency) => agency.status === 'negotiating' || agency.status === 'offer_submitted');
  const importedToday = mine.filter((agency) => new Date(agency.createdAt).getTime() >= startOfDay());
  const priority = overdue[0] || today[0];

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8 lg:p-10">
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">Your sales day</p>
          <h2 className="mt-1 text-3xl font-semibold">What needs attention now?</h2>
          <p className="mt-2 max-w-2xl text-slate-500">Find buyers, pitch the active portfolio, complete follow-ups, and move deals forward.</p>
        </div>
        <Link to="/employee/prospect">
          <PrimaryButton><Search className="mr-2" size={18} />Find Agencies</PrimaryButton>
        </Link>
      </header>

      {priority ? (
        <Card className={`mb-6 flex flex-col gap-4 p-6 md:flex-row md:items-center ${overdue.includes(priority) ? 'border-red-200' : 'border-blue-200'}`}>
          <div className={`grid h-12 w-12 place-items-center rounded-2xl ${overdue.includes(priority) ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            {overdue.includes(priority) ? <AlertTriangle /> : <Clock3 />}
          </div>
          <div className="flex-1">
            <p className={`text-xs font-semibold uppercase tracking-wider ${overdue.includes(priority) ? 'text-red-600' : 'text-blue-600'}`}>
              {overdue.includes(priority) ? 'Overdue follow-up' : 'Next follow-up'}
            </p>
            <p className="mt-1 text-lg font-semibold">{priority.agency.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {priority.activity.disposition} · {new Date(priority.activity.followUpAt as string).toLocaleString()}
            </p>
          </div>
          <Link to={`/employee/agencies/${priority.agency.id}`}>
            <PrimaryButton>Open agency<ArrowRight className="ml-2" size={17} /></PrimaryButton>
          </Link>
        </Card>
      ) : (
        <Card className="mb-6 flex flex-col gap-4 border-emerald-200 p-6 md:flex-row md:items-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Search /></div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Follow-up queue clear</p>
            <p className="mt-1 text-lg font-semibold">Build the next buyer relationship</p>
            <p className="mt-1 text-sm text-slate-500">Search for a qualified agency and import it into your pipeline.</p>
          </div>
          <Link to="/employee/prospect"><PrimaryButton>Find Agencies</PrimaryButton></Link>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Queue label="Follow-ups due today" value={today.length} icon={<Clock3 size={18} />} tone="blue" />
        <Queue label="Overdue follow-ups" value={overdue.length} icon={<AlertTriangle size={18} />} tone={overdue.length ? 'red' : 'slate'} />
        <Queue label="Agencies imported today" value={importedToday.length} icon={<Search size={18} />} tone="slate" />
        <Queue label="Deals needing action" value={dealsNeedingAction.length} icon={<BriefcaseBusiness size={18} />} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        {active ? (
          <Card className="overflow-hidden">
            <div className="bg-[#091221] p-7 text-white md:p-9">
              <Pill tone="success">Portfolio to sell now</Pill>
              <h3 className="mt-5 text-3xl font-semibold">{active.name}</h3>
              <p className="mt-2 max-w-2xl text-slate-300">{active.description}</p>
              <div className="mt-7 flex flex-wrap gap-8">
                <Metric label="Accounts" value={active.accountCount.toLocaleString()} />
                <Metric label="Asking price" value={money(active.askingPrice)} />
                <Metric label="My agencies" value={String(mine.length)} />
              </div>
            </div>
            <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
              <div>
                <p className="font-semibold">Pitch this portfolio to a qualified agency</p>
                <p className="mt-1 text-sm text-slate-500">Open an agency, contact the decision-maker, and record the next action.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/employee/agencies"><SecondaryButton>My Agencies</SecondaryButton></Link>
                <Link to="/employee/outreach"><PrimaryButton><Send className="mr-2" size={17} />Start Outreach</PrimaryButton></Link>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="grid min-h-80 place-items-center p-8 text-center">
            <div>
              <BriefcaseBusiness className="mx-auto text-slate-300" size={48} />
              <h3 className="mt-5 text-2xl font-semibold">No active portfolio</h3>
              <p className="mt-2 text-slate-500">The owner has not assigned a portfolio to sell yet.</p>
            </div>
          </Card>
        )}

        <Card className="p-6 md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Simple sales workflow</p>
          <h3 className="mt-2 text-xl font-semibold">Move one buyer forward</h3>
          <div className="mt-6 space-y-4">
            <WorkflowStep number="1" title="Find an agency" detail="Search Maps and import a qualified buyer." icon={<Search size={17} />} />
            <WorkflowStep number="2" title="Pitch the portfolio" detail="Call or email the decision-maker." icon={<Phone size={17} />} />
            <WorkflowStep number="3" title="Schedule follow-up" detail="Always leave the relationship with a next action." icon={<Mail size={17} />} />
            <WorkflowStep number="4" title="Move the deal" detail="Negotiate, submit the offer, and close." icon={<BriefcaseBusiness size={17} />} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Queue({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: 'blue' | 'red' | 'slate' }) {
  const style = tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600';
  return (
    <Card className="p-5">
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${style}`}>{icon}</div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function WorkflowStep({ number, title, detail, icon }: { number: string; title: string; detail: string; icon: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">{icon}</div>
      <div>
        <p className="font-semibold"><span className="mr-2 text-xs text-slate-400">{number}</span>{title}</p>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </div>
    </div>
  );
}
