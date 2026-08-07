import { Building2, CalendarClock, ChevronRight, Mail, Phone, Plus, Search, Sparkles, Trash2, ArchiveX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../components/Primitives';
import { useAgencyStore, type Agency } from '../store/AgencyStore';
import { usePipelineStore } from '../store/PipelineStore';
import { usePortfolioStore } from '../store/PortfolioStore';

type Filter = 'all' | 'follow_up' | 'active_deal' | 'new';

function latestActivity(agency: Agency) {
  return [...agency.activities].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )[0];
}

function nextFollowUp(agency: Agency) {
  return agency.activities
    .filter((activity) => activity.followUpAt && !activity.completedAt)
    .sort(
      (a, b) =>
        new Date(a.followUpAt as string).getTime() - new Date(b.followUpAt as string).getTime(),
    )[0];
}

export default function AgencyDirectory() {
  const { agencies, currentEmployee, release, clearInventory } = useAgencyStore();
  const { opportunities } = usePipelineStore();
  const { role } = usePortfolioStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [working, setWorking] = useState('');

  const base = role === 'owner' ? '/agencies' : '/employee/agencies';
  const owned = role === 'owner' ? agencies : agencies.filter((agency) => agency.ownerEmployeeId === currentEmployee.id);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return owned.filter((agency) => {
      const opportunity = opportunities.find(
        (item) => item.agencyId === agency.id && !['closed_won', 'closed_lost'].includes(item.stage),
      );
      const followUp = nextFollowUp(agency);
      const matchesSearch = !term || `${agency.name} ${agency.city} ${agency.state} ${agency.generalEmail}`.toLowerCase().includes(term);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'follow_up' && Boolean(followUp)) ||
        (filter === 'active_deal' && Boolean(opportunity)) ||
        (filter === 'new' && agency.status === 'new');
      return matchesSearch && matchesFilter;
    });
  }, [filter, opportunities, owned, query]);

  const dueCount = owned.filter((agency) => Boolean(nextFollowUp(agency))).length;
  const activeDealCount = owned.filter((agency) =>
    opportunities.some((item) => item.agencyId === agency.id && !['closed_won', 'closed_lost'].includes(item.stage)),
  ).length;

  return (
    <div className="mx-auto max-w-[1380px] p-5 md:p-8 lg:p-10">
      <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">{role === 'owner' ? 'Agency intelligence' : 'Relationship workspace'}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{role === 'owner' ? 'Agency directory' : 'My agencies'}</h1>
          <p className="mt-2 max-w-2xl text-slate-500">See who needs attention, what happened last, and which relationship should move next.</p>
        </div>
        {role === 'employee' && (
          <div className="flex flex-wrap gap-2"><Link to="/employee/agencies/new"><PrimaryButton><Plus className="mr-2" size={17}/>Add agency</PrimaryButton></Link><Link to="/employee/prospect"><SecondaryButton><Search className="mr-2" size={17}/>Search Maps</SecondaryButton></Link><SecondaryButton disabled={!owned.length||working==='all'} onClick={async()=>{if(!confirm(`Remove all ${owned.length} agencies from your inventory? The owner keeps every record, note, contact and conversation.`))return;setWorking('all');await clearInventory();setWorking('')}}><ArchiveX className="mr-2" size={17}/>{working==='all'?'Clearing…':'Clear inventory'}</SecondaryButton></div>
        )}
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Assigned agencies" value={owned.length} />
        <Metric label="Follow-ups scheduled" value={dueCount} />
        <Metric label="Active deals" value={activeDealCount} />
      </div>

      <Card className="mb-6 p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-2xl bg-slate-50 px-4">
            <Search className="text-slate-400" size={19} />
            <input
              className="w-full bg-transparent py-3 text-sm outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agency, city, state or email"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All'],
              ['follow_up', 'Follow-up'],
              ['active_deal', 'Active deal'],
              ['new', 'New'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((agency) => {
          const activity = latestActivity(agency);
          const followUp = nextFollowUp(agency);
          const opportunity = opportunities.find(
            (item) => item.agencyId === agency.id && !['closed_won', 'closed_lost'].includes(item.stage),
          );
          const primaryContact = agency.contacts.find((contact) => contact.decisionMaker) || agency.contacts[0];
          const overdue = Boolean(followUp?.followUpAt && new Date(followUp.followUpAt).getTime() < Date.now());

          return (
            <Card key={agency.id} className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="p-5 md:p-6">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Building2 /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`${base}/${agency.id}`} className="truncate text-lg font-semibold text-slate-950 hover:text-blue-600">{agency.name}</Link>
                      {agency.isTest&&<Pill tone="warning">TEST</Pill>}<Pill tone={agency.status === 'qualified' ? 'success' : agency.status === 'new' ? 'blue' : 'neutral'}>{agency.status.replace(/_/g, ' ')}</Pill>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{[agency.city, agency.state].filter(Boolean).join(', ') || 'Location not listed'}</p>
                  </div>
                  <Link to={`${base}/${agency.id}`} aria-label={`Open ${agency.name}`} className="rounded-xl p-2 text-slate-300 hover:bg-slate-50 hover:text-blue-600"><ChevronRight /></Link>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info label="Primary contact" value={primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}`.trim() : 'Add decision-maker'} />
                  <Info label="Last activity" value={activity ? `${activity.disposition} · ${new Date(activity.occurredAt).toLocaleDateString()}` : 'No outreach yet'} />
                  <Info label="Next follow-up" value={followUp?.followUpAt ? new Date(followUp.followUpAt).toLocaleString() : 'Not scheduled'} emphasis={overdue} />
                  <Info label="Current deal" value={opportunity ? `${opportunity.title} · $${opportunity.askingPrice.toLocaleString()}` : 'No active deal'} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:px-6">
                {agency.phone && <a href={`tel:${agency.phone.replace(/[^+\d]/g, '')}`}><SecondaryButton className="min-h-9 px-3 py-2"><Phone className="mr-2" size={15} />Call</SecondaryButton></a>}
                {agency.generalEmail && <a href={`${window.location.pathname.startsWith('/employee')?'/employee/conversations':'/conversations'}?compose=1&agency=${agency.id}`}><SecondaryButton className="min-h-9 px-3 py-2"><Mail className="mr-2" size={15} />Email</SecondaryButton></a>}
                {role==='employee'&&<SecondaryButton disabled={working===agency.id} onClick={async()=>{if(!confirm(`Remove ${agency.name} from your inventory? The owner will keep the permanent company record and history.`))return;setWorking(agency.id);await release(agency.id);setWorking('')}} className="ml-auto min-h-9 px-3 py-2 text-red-600"><Trash2 className="mr-2" size={15}/>{working===agency.id?'Removing…':'Remove'}</SecondaryButton>}<Link to={`${base}/${agency.id}`} className={role==='employee'?'':'ml-auto'}><PrimaryButton className="min-h-9 px-4 py-2"><Sparkles className="mr-2" size={15} />Work relationship</PrimaryButton></Link>
              </div>
            </Card>
          );
        })}
      </div>

      {!visible.length && (
        <Card className="grid min-h-72 place-items-center p-8 text-center">
          <div>
            <CalendarClock className="mx-auto text-slate-300" size={42} />
            <p className="mt-4 font-semibold">No agencies match this view</p>
            <p className="mt-1 text-sm text-slate-500">Clear the filters or import a new agency to continue selling.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card className="px-5 py-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></Card>;
}

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`rounded-2xl border p-3.5 ${emphasis ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}><p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-sm font-semibold ${emphasis ? 'text-red-700' : 'text-slate-700'}`}>{value}</p></div>;
}
