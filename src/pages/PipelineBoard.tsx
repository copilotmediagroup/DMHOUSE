import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  GripVertical,
  Pencil,
  Plus,
  Target,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import {
  Card,
  Field,
  PrimaryButton,
  SecondaryButton,
  inputClass,
} from '../components/Primitives';
import { useAgencyStore } from '../store/AgencyStore';
import {
  PIPELINE_STAGES,
  type Opportunity,
  type PipelineStage,
  usePipelineStore,
} from '../store/PipelineStore';
import { usePortfolioStore } from '../store/PortfolioStore';

const labels: Record<PipelineStage, string> = {
  new: 'New',
  researching: 'Researching',
  first_contact: 'First Contact',
  conversation_started: 'Conversation Started',
  decision_maker_found: 'Decision Maker Found',
  portfolio_requested: 'Portfolio Requested',
  portfolio_sent: 'Portfolio Sent',
  negotiating: 'Negotiating',
  verbal_agreement: 'Verbal Agreement',
  contracts: 'Contracts',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

export default function PipelineBoard() {
  const { agencies, refresh: refreshAgencies } = useAgencyStore();
  const { opportunities, moveAgency, saveOpportunity } = usePipelineStore();
  const { portfolios, profile } = usePortfolioStore();

  const [drag, setDrag] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busyAgency, setBusyAgency] = useState<string | null>(null);
  const [error, setError] = useState('');

  const agencyById = useMemo(
    () => new Map(agencies.map(agency => [agency.id, agency])),
    [agencies],
  );

  const activeOpportunities = useMemo(
    () =>
      opportunities.filter(
        opportunity =>
          !['closed_won', 'closed_lost'].includes(opportunity.stage),
      ),
    [opportunities],
  );

  const totalPipeline = useMemo(
    () =>
      activeOpportunities.reduce(
        (total, opportunity) => total + opportunity.askingPrice,
        0,
      ),
    [activeOpportunities],
  );

  const weightedPipeline = useMemo(
    () =>
      activeOpportunities.reduce(
        (total, opportunity) =>
          total +
          (opportunity.askingPrice * opportunity.probability) / 100,
        0,
      ),
    [activeOpportunities],
  );

  const overdueCount = useMemo(() => {
    const today = new Date();

    return activeOpportunities.filter(
      opportunity =>
        opportunity.expectedCloseDate &&
        new Date(`${opportunity.expectedCloseDate}T12:00:00`) < today,
    ).length;
  }, [activeOpportunities]);

  const missingFollowUps = useMemo(
    () =>
      activeOpportunities.filter(opportunity => {
        const agency = agencyById.get(opportunity.agencyId);
        const nextFollowUp = agency?.activities.find(
          activity => activity.followUpAt && !activity.completedAt,
        );

        return !nextFollowUp;
      }).length,
    [activeOpportunities, agencyById],
  );

  async function move(agencyId: string, stage: PipelineStage) {
    setBusyAgency(agencyId);
    setError('');

    try {
      await moveAgency(agencyId, stage);
      await refreshAgencies();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to move this opportunity.',
      );
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

  const workspaceBase =
    profile?.role === 'owner' ? '/pipeline' : '/employee/pipeline';

  return (
    <div className="p-5 md:p-8 lg:p-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Pipeline Command Center · v1.6.1
          </p>

          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            Choose the deal. Open the workspace. Close the sale.
          </h2>

          <p className="mt-2 text-slate-500">
            The board shows position. The workspace handles the work.
          </p>
        </div>

        <PrimaryButton
          onClick={() => setOpen(agencies[0]?.id || '')}
          disabled={!agencies.length}
        >
          <Plus size={17} className="mr-2" />
          New opportunity
        </PrimaryButton>
      </header>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<CircleDollarSign />}
          label="Open pipeline"
          value={money(totalPipeline)}
        />

        <SummaryCard
          icon={<TrendingUp />}
          label="Weighted pipeline"
          value={money(weightedPipeline)}
        />

        <SummaryCard
          icon={<AlertTriangle />}
          label="Overdue expected closes"
          value={String(overdueCount)}
          warning={overdueCount > 0}
        />

        <SummaryCard
          icon={<CalendarClock />}
          label="Missing next follow-up"
          value={String(missingFollowUps)}
          warning={missingFollowUps > 0}
        />
      </div>

      {error && (
        <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-7 overflow-x-auto pb-5">
        <div className="flex min-w-max gap-4">
          {PIPELINE_STAGES.filter(
            stage => !['closed_won', 'closed_lost'].includes(stage),
          ).map(stage => {
            const stageOpportunities = activeOpportunities.filter(
              opportunity => opportunity.stage === stage,
            );

            const stageValue = stageOpportunities.reduce(
              (total, opportunity) => total + opportunity.askingPrice,
              0,
            );

            const stageWeighted = stageOpportunities.reduce(
              (total, opportunity) =>
                total +
                (opportunity.askingPrice * opportunity.probability) / 100,
              0,
            );

            return (
              <section
                key={stage}
                onDragOver={event => event.preventDefault()}
                onDrop={() => void drop(stage)}
                className="w-[340px] rounded-[24px] border border-slate-200 bg-slate-100/70 p-3"
              >
                <div className="flex items-start justify-between px-2 py-2">
                  <div>
                    <p className="text-sm font-semibold">{labels[stage]}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {stageOpportunities.length} opportunit
                      {stageOpportunities.length === 1 ? 'y' : 'ies'} ·{' '}
                      {money(stageValue)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Weighted {money(stageWeighted)}
                    </p>
                  </div>

                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
                    {stageOpportunities.length}
                  </span>
                </div>

                <div className="mt-2 min-h-[190px] space-y-3">
                  {stageOpportunities.map(opportunity => {
                    const agency = agencyById.get(opportunity.agencyId);

                    if (!agency) {
                      return (
                        <MissingAgencyCard
                          key={opportunity.id}
                          opportunity={opportunity}
                        />
                      );
                    }

                    const portfolio = portfolios.find(
                      item => item.id === opportunity.portfolioId,
                    );

                    const nextFollowUp = agency.activities.find(
                      activity => activity.followUpAt && !activity.completedAt,
                    );

                    const latestActivity = agency.activities[0];
                    const next = nextStage(stage);
                    const busy = busyAgency === agency.id;

                    return (
                      <Card
                        key={opportunity.id}
                        className={`p-4 transition ${
                          busy
                            ? 'opacity-60'
                            : 'hover:-translate-y-0.5 hover:shadow-lg'
                        }`}
                      >
                        <div
                          draggable={!busy}
                          onDragStart={() => setDrag(agency.id)}
                          className="flex cursor-grab items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold">
                              {agency.name}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {agency.ownerEmployeeName}
                            </p>
                          </div>

                          <GripVertical
                            size={17}
                            className="shrink-0 text-slate-300"
                          />
                        </div>

                        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Portfolio
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold">
                            {portfolio?.name || 'No portfolio assigned'}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <Metric
                              icon={<CircleDollarSign size={14} />}
                              label="Deal value"
                              value={money(opportunity.askingPrice)}
                            />

                            <Metric
                              icon={<Target size={14} />}
                              label="Probability"
                              value={`${opportunity.probability}%`}
                            />

                            <Metric
                              icon={<TrendingUp size={14} />}
                              label="Weighted"
                              value={money(
                                (opportunity.askingPrice *
                                  opportunity.probability) /
                                  100,
                              )}
                            />

                            <Metric
                              icon={<CalendarClock size={14} />}
                              label="Next follow-up"
                              value={
                                nextFollowUp?.followUpAt
                                  ? new Date(
                                      nextFollowUp.followUpAt,
                                    ).toLocaleDateString()
                                  : 'Not scheduled'
                              }
                            />

                            <Metric
                              icon={<UserRound size={14} />}
                              label="Owner"
                              value={agency.ownerEmployeeName}
                            />

                            <Metric
                              icon={<CalendarClock size={14} />}
                              label="Expected close"
                              value={
                                opportunity.expectedCloseDate
                                  ? new Date(
                                      `${opportunity.expectedCloseDate}T12:00:00`,
                                    ).toLocaleDateString()
                                  : 'Not scheduled'
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-slate-100 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Latest activity
                          </p>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {latestActivity?.disposition || 'No activity recorded'}
                          </p>
                        </div>

                        <div className="mt-4 space-y-2">
                          <Link
                            to={`${workspaceBase}/${opportunity.id}`}
                            className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                          >
                            Open workspace
                            <ArrowRight size={15} className="ml-2" />
                          </Link>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setOpen(agency.id)}
                              className="flex items-center justify-center rounded-xl border border-slate-200 py-2 text-xs font-semibold hover:bg-slate-50"
                            >
                              <Pencil size={14} className="mr-1.5" />
                              Edit
                            </button>

                            {next ? (
                              <button
                                onClick={() => void move(agency.id, next)}
                                disabled={busy}
                                className="flex items-center justify-center rounded-xl border border-slate-200 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                              >
                                Advance
                                <ArrowRight size={14} className="ml-1.5" />
                              </button>
                            ) : (
                              <button
                                disabled
                                className="rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-300"
                              >
                                Final stage
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => void move(agency.id, 'closed_won')}
                              disabled={busy}
                              className="flex items-center justify-center rounded-xl border border-emerald-200 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} className="mr-1.5" />
                              Won
                            </button>

                            <button
                              onClick={() => void move(agency.id, 'closed_lost')}
                              disabled={busy}
                              className="flex items-center justify-center rounded-xl border border-red-200 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <X size={14} className="mr-1.5" />
                              Lost
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {open && (
        <OpportunityModal
          agencyId={open}
          agencyName={agencyById.get(open)?.name || ''}
          existing={opportunities.find(
            opportunity => opportunity.agencyId === open,
          )}
          portfolios={portfolios}
          onClose={() => setOpen(null)}
          onSave={async value => {
            await saveOpportunity(value);
            await refreshAgencies();
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function MissingAgencyCard({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  return (
    <Card className="border-amber-200 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
        <div>
          <p className="font-semibold">Agency record unavailable</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {opportunity.title} exists, but its linked agency was not returned.
          </p>
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  warning = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className={warning ? 'text-amber-600' : 'text-blue-600'}>{icon}</div>
      <p className="mt-5 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <p className="text-[11px]">{label}</p>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">
        {value}
      </p>
    </div>
  );
}

function OpportunityModal({
  agencyId,
  agencyName,
  existing,
  portfolios,
  onClose,
  onSave,
}: {
  agencyId: string;
  agencyName: string;
  existing: any;
  portfolios: any[];
  onClose: () => void;
  onSave: (value: any) => Promise<void>;
}) {
  const [title, setTitle] = useState(
    existing?.title || `${agencyName} opportunity`,
  );
  const [portfolioId, setPortfolioId] = useState(
    existing?.portfolioId || '',
  );
  const selected = portfolios.find(portfolio => portfolio.id === portfolioId);
  const [price, setPrice] = useState(
    String(existing?.askingPrice || selected?.askingPrice || 0),
  );
  const [probability, setProbability] = useState(
    String(existing?.probability ?? 25),
  );
  const [date, setDate] = useState(existing?.expectedCloseDate || '');
  const [saving, setSaving] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
      onMouseDown={onClose}
    >
      <section
        className="w-full max-w-xl rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">Portfolio opportunity</p>
            <h3 className="mt-1 text-2xl font-semibold">{agencyName}</h3>
          </div>

          <button onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <Field label="Opportunity name">
            <input
              className={inputClass}
              value={title}
              onChange={event => setTitle(event.target.value)}
            />
          </Field>

          <Field label="Portfolio">
            <select
              className={inputClass}
              value={portfolioId}
              onChange={event => {
                setPortfolioId(event.target.value);

                const portfolio = portfolios.find(
                  item => item.id === event.target.value,
                );

                if (portfolio) {
                  setPrice(String(portfolio.askingPrice || 0));
                }
              }}
            >
              <option value="">Select portfolio</option>
              {portfolios.map(portfolio => (
                <option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Potential sale value">
              <input
                type="number"
                className={inputClass}
                value={price}
                onChange={event => setPrice(event.target.value)}
              />
            </Field>

            <Field label="Close probability">
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={probability}
                onChange={event => setProbability(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Expected close date">
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={event => setDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>

          <PrimaryButton
            disabled={saving || !title}
            onClick={async () => {
              setSaving(true);

              try {
                await onSave({
                  id: existing?.id,
                  agencyId,
                  title,
                  portfolioId: portfolioId || undefined,
                  askingPrice: Number(price || 0),
                  probability: Number(probability || 0),
                  expectedCloseDate: date || undefined,
                  stage: existing?.stage || 'new',
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save opportunity'}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}
