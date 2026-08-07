import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Filter,
  GripVertical,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { Card, Field, PrimaryButton, inputClass } from '../components/Primitives';
import { useAgencyStore, type Agency, type AgencyActivity } from '../store/AgencyStore';
import {
  PIPELINE_STAGES,
  type Opportunity,
  type PipelineStage,
  usePipelineStore,
} from '../store/PipelineStore';
import { usePortfolioStore } from '../store/PortfolioStore';
import type { Portfolio } from '../types/domain';

const labels: Record<PipelineStage, string> = {
  new: 'New',
  researching: 'Research',
  first_contact: 'First Contact',
  conversation_started: 'Conversation',
  decision_maker_found: 'Decision Maker',
  portfolio_requested: 'Portfolio Requested',
  portfolio_sent: 'Portfolio Sent',
  negotiating: 'Negotiation',
  verbal_agreement: 'Verbal Agreement',
  contracts: 'Contracts',
  closed_won: 'Won',
  closed_lost: 'Lost',
};

const stageAccent: Record<PipelineStage, string> = {
  new: 'bg-slate-400',
  researching: 'bg-blue-500',
  first_contact: 'bg-cyan-500',
  conversation_started: 'bg-violet-500',
  decision_maker_found: 'bg-fuchsia-500',
  portfolio_requested: 'bg-indigo-500',
  portfolio_sent: 'bg-sky-500',
  negotiating: 'bg-amber-500',
  verbal_agreement: 'bg-orange-500',
  contracts: 'bg-emerald-500',
  closed_won: 'bg-green-600',
  closed_lost: 'bg-red-500',
};

const visibleStages = PIPELINE_STAGES.filter(
  stage => !['closed_won', 'closed_lost'].includes(stage),
);

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const isToday = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export default function PipelineBoard() {
  const { agencies, refresh: refreshAgencies } = useAgencyStore();
  const { opportunities, moveAgency, saveOpportunity } = usePipelineStore();
  const { portfolios, profile } = usePortfolioStore();

  const [drag, setDrag] = useState<string | null>(null);
  const [editAgencyId, setEditAgencyId] = useState<string | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [busyAgency, setBusyAgency] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'mine' | 'followup' | 'high' | 'closing'>('all');

  const agencyById = useMemo(
    () => new Map(agencies.map(agency => [agency.id, agency])),
    [agencies],
  );

  const portfolioById = useMemo(
    () => new Map(portfolios.map(portfolio => [portfolio.id, portfolio])),
    [portfolios],
  );

  const activeOpportunities = useMemo(
    () => opportunities.filter(opportunity => !['closed_won', 'closed_lost'].includes(opportunity.stage)),
    [opportunities],
  );

  const enriched = useMemo(
    () =>
      activeOpportunities.map(opportunity => {
        const agency = agencyById.get(opportunity.agencyId);
        const portfolio = opportunity.portfolioId
          ? portfolioById.get(opportunity.portfolioId)
          : undefined;
        const nextFollowUp = agency?.activities
          .filter(activity => activity.followUpAt && !activity.completedAt)
          .sort((a, b) => new Date(a.followUpAt as string).getTime() - new Date(b.followUpAt as string).getTime())[0];
        const latestActivity = agency?.activities[0];
        return { opportunity, agency, portfolio, nextFollowUp, latestActivity };
      }),
    [activeOpportunities, agencyById, portfolioById],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return enriched.filter(item => {
      const text = [
        item.agency?.name,
        item.portfolio?.name,
        item.opportunity.title,
        item.agency?.ownerEmployeeName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (normalized && !text.includes(normalized)) return false;
      if (filter === 'mine' && item.opportunity.ownerId !== profile?.id) return false;
      if (filter === 'followup' && !item.nextFollowUp?.followUpAt) return false;
      if (filter === 'high' && item.opportunity.askingPrice < 10000) return false;
      if (
        filter === 'closing' &&
        !['verbal_agreement', 'contracts'].includes(item.opportunity.stage)
      ) return false;
      return true;
    });
  }, [enriched, query, filter, profile?.id]);

  const totalPipeline = activeOpportunities.reduce((total, item) => total + item.askingPrice, 0);
  const weightedPipeline = activeOpportunities.reduce(
    (total, item) => total + (item.askingPrice * item.probability) / 100,
    0,
  );
  const dueToday = enriched.filter(item => isToday(item.nextFollowUp?.followUpAt)).length;
  const closingThisMonth = activeOpportunities
    .filter(item => ['verbal_agreement', 'contracts'].includes(item.stage))
    .reduce((total, item) => total + item.askingPrice, 0);

  const selected = enriched.find(item => item.opportunity.id === selectedOpportunityId);

  async function move(agencyId: string, stage: PipelineStage) {
    setBusyAgency(agencyId);
    setError('');
    try {
      await moveAgency(agencyId, stage);
      await refreshAgencies();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to move this opportunity.');
    } finally {
      setBusyAgency(null);
      setDrag(null);
    }
  }

  async function drop(stage: PipelineStage) {
    if (!drag) return;
    await move(drag, stage);
  }

  function nextStage(stage: PipelineStage): PipelineStage | null {
    if (stage === 'closed_won' || stage === 'closed_lost') return null;
    const currentIndex = PIPELINE_STAGES.indexOf(stage);
    const next = PIPELINE_STAGES[currentIndex + 1];
    if (!next || next === 'closed_lost') return null;
    return next;
  }

  const workspaceBase = profile?.role === 'owner' ? '/pipeline' : '/employee/pipeline';

  return (
    <div className="min-h-full bg-slate-50/70 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Employee deal workspace</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Work the next deal.</h2>
          <p className="mt-1 text-sm text-slate-500">Search, prioritize, and move opportunities without leaving the board.</p>
        </div>
        <PrimaryButton onClick={() => setEditAgencyId(agencies[0]?.id || '')} disabled={!agencies.length}>
          <Plus size={17} className="mr-2" /> New opportunity
        </PrimaryButton>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 md:grid-cols-4 md:divide-y-0">
          <CompactMetric icon={<CircleDollarSign size={18} />} label="Open pipeline" value={money(totalPipeline)} />
          <CompactMetric icon={<TrendingUp size={18} />} label="Weighted" value={money(weightedPipeline)} />
          <CompactMetric icon={<CalendarClock size={18} />} label="Follow-ups today" value={String(dueToday)} warning={dueToday > 0} />
          <CompactMetric icon={<Target size={18} />} label="Closing pipeline" value={money(closingThisMonth)} />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search agency, portfolio, or owner"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          {([
            ['all', 'All'],
            ['mine', 'My deals'],
            ['followup', 'Follow-up due'],
            ['high', 'High value'],
            ['closing', 'Closing soon'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                filter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <div className="mt-4 overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {visibleStages.map(stage => {
            const stageItems = filtered.filter(item => item.opportunity.stage === stage);
            const stageValue = stageItems.reduce((total, item) => total + item.opportunity.askingPrice, 0);
            return (
              <section
                key={stage}
                onDragOver={event => event.preventDefault()}
                onDrop={() => void drop(stage)}
                className="w-[286px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70"
              >
                <div className="bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stageAccent[stage]}`} />
                      <p className="truncate text-sm font-semibold">{labels[stage]}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{stageItems.length}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{money(stageValue)}</p>
                </div>

                <div className="min-h-[480px] space-y-2.5 p-2.5">
                  {stageItems.length === 0 && <EmptyStage stage={stage} />}
                  {stageItems.map(item => {
                    if (!item.agency) return <MissingAgencyCard key={item.opportunity.id} opportunity={item.opportunity} />;
                    const next = nextStage(stage);
                    const busy = busyAgency === item.agency.id;
                    const followUpAt = item.nextFollowUp?.followUpAt;
                    const overdue = followUpAt ? new Date(followUpAt).getTime() < Date.now() : false;
                    return (
                      <article
                        key={item.opportunity.id}
                        draggable={!busy}
                        onDragStart={() => setDrag(item.agency!.id)}
                        onClick={() => setSelectedOpportunityId(item.opportunity.id)}
                        className={`cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${busy ? 'opacity-60' : 'border-slate-200'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.agency.name}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{item.portfolio?.name || 'Portfolio not assigned'}</p>
                          </div>
                          <GripVertical size={15} className="shrink-0 text-slate-300" />
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <p className="text-base font-semibold">{money(item.opportunity.askingPrice)}</p>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{item.opportunity.probability}%</span>
                        </div>

                        <div className={`mt-3 rounded-lg px-2.5 py-2 ${overdue ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-wide ${overdue ? 'text-red-500' : 'text-slate-400'}`}>Next action</p>
                          <p className={`mt-0.5 truncate text-xs font-semibold ${overdue ? 'text-red-700' : 'text-slate-700'}`}>
                            {item.nextFollowUp?.disposition || item.latestActivity?.disposition || 'Contact buyer'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {followUpAt ? new Date(followUpAt).toLocaleDateString() : 'No follow-up scheduled'}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="truncate">{item.agency.ownerEmployeeName}</span>
                          <ChevronRight size={14} />
                        </div>

                        {next && (
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              void move(item.agency!.id, next);
                            }}
                            disabled={busy}
                            className="mt-3 flex w-full items-center justify-center rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                          >
                            Move to {labels[next]} <ArrowRight size={13} className="ml-1.5" />
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {selected && selected.agency && (
        <DealDrawer
          item={selected}
          workspacePath={`${workspaceBase}/${selected.opportunity.id}`}
          onClose={() => setSelectedOpportunityId(null)}
          onEdit={() => setEditAgencyId(selected.agency!.id)}
          onMove={stage => void move(selected.agency!.id, stage)}
          nextStage={nextStage(selected.opportunity.stage)}
        />
      )}

      {editAgencyId && (
        <OpportunityModal
          agencyId={editAgencyId}
          agencyName={agencyById.get(editAgencyId)?.name || ''}
          existing={opportunities.find(opportunity => opportunity.agencyId === editAgencyId)}
          portfolios={portfolios}
          onClose={() => setEditAgencyId(null)}
          onSave={async value => {
            await saveOpportunity(value);
            await refreshAgencies();
            setEditAgencyId(null);
          }}
        />
      )}
    </div>
  );
}

function CompactMetric({ icon, label, value, warning = false }: { icon: ReactNode; label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 md:px-5">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${warning ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className="truncate text-lg font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function EmptyStage({ stage }: { stage: PipelineStage }) {
  const message = stage === 'new'
    ? 'Create an opportunity from My Agencies.'
    : stage === 'researching'
      ? 'Move a new deal here after basic research.'
      : stage === 'first_contact'
        ? 'Deals appear here after the first outreach.'
        : 'Move the next qualified deal into this stage.';
  return (
    <div className="grid min-h-[150px] place-items-center rounded-xl border border-dashed border-slate-300 bg-white/50 p-5 text-center">
      <div>
        <p className="text-xs font-semibold text-slate-500">No deals here</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">{message}</p>
      </div>
    </div>
  );
}

function DealDrawer({ item, workspacePath, onClose, onEdit, onMove, nextStage }: {
  item: PipelineItem;
  workspacePath: string;
  onClose: () => void;
  onEdit: () => void;
  onMove: (stage: PipelineStage) => void;
  nextStage: PipelineStage | null;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30" onMouseDown={onClose}>
      <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Deal workspace</p>
            <h3 className="mt-1 text-xl font-semibold">{item.agency?.name}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="space-y-4 p-5">
          <Card className="p-4">
            <p className="text-xs text-slate-500">Current stage</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${stageAccent[item.opportunity.stage]}`} />
              <p className="font-semibold">{labels[item.opportunity.stage]}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <DrawerMetric label="Deal value" value={money(item.opportunity.askingPrice)} />
              <DrawerMetric label="Probability" value={`${item.opportunity.probability}%`} />
              <DrawerMetric label="Portfolio" value={item.portfolio?.name || 'Not assigned'} />
              <DrawerMetric label="Owner" value={item.agency?.ownerEmployeeName || 'Unassigned'} />
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next action</p>
            <p className="mt-2 font-semibold">{item.nextFollowUp?.disposition || item.latestActivity?.disposition || 'Contact buyer'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {item.nextFollowUp?.followUpAt ? new Date(item.nextFollowUp.followUpAt).toLocaleString() : 'No follow-up scheduled'}
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <a href={item.agency?.phone ? `tel:${item.agency.phone}` : undefined} className="flex items-center justify-center rounded-xl border border-slate-200 py-3 text-sm font-semibold hover:bg-slate-50"><Phone size={16} className="mr-2" /> Call</a>
            <a href={item.agency?.generalEmail ? `${window.location.pathname.startsWith('/employee')?'/employee/conversations':'/conversations'}?compose=1&agency=${item.agency.id}` : undefined} className="flex items-center justify-center rounded-xl border border-slate-200 py-3 text-sm font-semibold hover:bg-slate-50"><Mail size={16} className="mr-2" /> Email</a>
          </div>

          <Link to={workspacePath} className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Open full workspace <ArrowRight size={16} className="ml-2" />
          </Link>

          <button onClick={onEdit} className="flex w-full items-center justify-center rounded-xl border border-slate-200 py-3 text-sm font-semibold hover:bg-slate-50"><Pencil size={16} className="mr-2" /> Edit opportunity</button>

          {nextStage && (
            <button onClick={() => onMove(nextStage)} className="flex w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              Move to {labels[nextStage]} <ArrowRight size={16} className="ml-2" />
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => onMove('closed_won')} className="flex items-center justify-center rounded-xl border border-emerald-200 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={16} className="mr-2" /> Won</button>
            <button onClick={() => onMove('closed_lost')} className="flex items-center justify-center rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"><X size={16} className="mr-2" /> Lost</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

type PipelineItem = {
  opportunity: Opportunity;
  agency: Agency | undefined;
  portfolio: Portfolio | undefined;
  nextFollowUp: AgencyActivity | undefined;
  latestActivity: AgencyActivity | undefined;
};

function DrawerMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>;
}

function MissingAgencyCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <Card className="border-amber-200 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={16} />
        <div><p className="text-sm font-semibold">Agency unavailable</p><p className="mt-1 text-xs text-slate-500">{opportunity.title}</p></div>
      </div>
    </Card>
  );
}

function OpportunityModal({ agencyId, agencyName, existing, portfolios, onClose, onSave }: {
  agencyId: string;
  agencyName: string;
  existing: any;
  portfolios: any[];
  onClose: () => void;
  onSave: (value: any) => Promise<void>;
}) {
  const [title, setTitle] = useState(existing?.title || `${agencyName} opportunity`);
  const [portfolioId, setPortfolioId] = useState(existing?.portfolioId || '');
  const selected = portfolios.find(portfolio => portfolio.id === portfolioId);
  const [price, setPrice] = useState(String(existing?.askingPrice || selected?.askingPrice || 0));
  const [probability, setProbability] = useState(String(existing?.probability ?? 25));
  const [date, setDate] = useState(existing?.expectedCloseDate || '');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <section className="w-full max-w-xl rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">Portfolio opportunity</p><h3 className="mt-1 text-2xl font-semibold">{agencyName}</h3></div><button onClick={onClose}><X /></button></div>
        <div className="mt-6 grid gap-4">
          <Field label="Opportunity name"><input className={inputClass} value={title} onChange={event => setTitle(event.target.value)} /></Field>
          <Field label="Portfolio"><select className={inputClass} value={portfolioId} onChange={event => { setPortfolioId(event.target.value); const portfolio = portfolios.find(item => item.id === event.target.value); if (portfolio) setPrice(String(portfolio.askingPrice || 0)); }}><option value="">Select portfolio</option>{portfolios.map(portfolio => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Deal value"><input className={inputClass} type="number" min="0" value={price} onChange={event => setPrice(event.target.value)} /></Field><Field label="Probability"><input className={inputClass} type="number" min="0" max="100" value={probability} onChange={event => setProbability(event.target.value)} /></Field></div>
          <Field label="Expected close"><input className={inputClass} type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
          <button disabled={saving || !title.trim()} onClick={async () => { setSaving(true); await onSave({ id: existing?.id, agencyId, title: title.trim(), portfolioId: portfolioId || undefined, stage: existing?.stage || 'new', askingPrice: Number(price || 0), probability: Number(probability || 0), expectedCloseDate: date || undefined }); setSaving(false); }} className="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save opportunity'}</button>
        </div>
      </section>
    </div>
  );
}
