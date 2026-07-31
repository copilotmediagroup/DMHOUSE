import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { Card, Pill, PrimaryButton } from '../../components/Primitives';
import { supabase } from '../../lib/supabase';
import {
  PIPELINE_STAGES,
  usePipelineStore,
  type PipelineStage,
} from '../../store/PipelineStore';
import { useAgencyStore } from '../../store/AgencyStore';

const money = (number = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(number);

type Forecast = {
  totalPipeline: number;
  weightedPipeline: number;
  expectedThisMonth: number;
  negotiations: number;
  portfoliosSent: number;
  winRate: number;
  averageDaysToClose: number;
};

const empty: Forecast = {
  totalPipeline: 0,
  weightedPipeline: 0,
  expectedThisMonth: 0,
  negotiations: 0,
  portfoliosSent: 0,
  winRate: 0,
  averageDaysToClose: 0,
};

const stageLabels: Record<PipelineStage, string> = {
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

export default function PipelineForecast() {
  const { opportunities, refresh } = usePipelineStore();
  const { agencies } = useAgencyStore();

  const [data, setData] = useState<Forecast>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const result = await supabase.rpc('dmh_pipeline_forecast');

      if (result.error) {
        throw result.error;
      }

      if (result.data) {
        setData(result.data as Forecast);
      }

      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to refresh the revenue forecast.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const openRows = useMemo(
    () =>
      opportunities
        .filter(
          opportunity =>
            !['closed_won', 'closed_lost'].includes(opportunity.stage),
        )
        .sort(
          (first, second) =>
            second.askingPrice * second.probability -
            first.askingPrice * first.probability,
        ),
    [opportunities],
  );

  const closedRows = useMemo(
    () =>
      opportunities.filter(opportunity =>
        ['closed_won', 'closed_lost'].includes(opportunity.stage),
      ),
    [opportunities],
  );

  const stageSummary = useMemo(
    () =>
      PIPELINE_STAGES.filter(
        stage => !['closed_won', 'closed_lost'].includes(stage),
      )
        .map(stage => {
          const rows = openRows.filter(
            opportunity => opportunity.stage === stage,
          );

          return {
            stage,
            count: rows.length,
            value: rows.reduce(
              (total, opportunity) => total + opportunity.askingPrice,
              0,
            ),
            weighted: rows.reduce(
              (total, opportunity) =>
                total +
                (opportunity.askingPrice * opportunity.probability) / 100,
              0,
            ),
          };
        })
        .filter(summary => summary.count > 0),
    [openRows],
  );

  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const risks = useMemo(() => {
    const overdue = openRows.filter(
      opportunity =>
        opportunity.expectedCloseDate &&
        new Date(`${opportunity.expectedCloseDate}T12:00:00`) < today,
    );

    const unscheduled = openRows.filter(
      opportunity => !opportunity.expectedCloseDate,
    );

    const lowProbability = openRows.filter(
      opportunity => opportunity.probability < 25,
    );

    const highValue = openRows.filter(
      opportunity =>
        opportunity.askingPrice >= 10000 &&
        opportunity.probability >= 40 &&
        opportunity.expectedCloseDate &&
        new Date(`${opportunity.expectedCloseDate}T12:00:00`) <=
          thirtyDaysFromNow,
    );

    return {
      overdue,
      unscheduled,
      lowProbability,
      highValue,
    };
  }, [openRows]);

  const forecastHealth = useMemo(() => {
    if (!openRows.length) {
      return 0;
    }

    const scheduled = openRows.filter(
      opportunity => opportunity.expectedCloseDate,
    ).length;

    const probabilityReady = openRows.filter(
      opportunity => opportunity.probability > 0,
    ).length;

    const owned = openRows.filter(opportunity => {
      const agency = agencies.find(
        agencyItem => agencyItem.id === opportunity.agencyId,
      );

      return Boolean(agency?.ownerEmployeeName);
    }).length;

    return Math.round(
      ((scheduled / openRows.length +
        probabilityReady / openRows.length +
        owned / openRows.length) /
        3) *
        100,
    );
  }, [agencies, openRows]);

  const nextBestAction = useMemo(() => {
    if (risks.overdue.length) {
      return {
        tone: 'warning' as const,
        title: 'Reschedule overdue opportunities',
        detail: `${risks.overdue.length} open deal${
          risks.overdue.length === 1 ? '' : 's'
        } passed the expected close date.`,
      };
    }

    if (risks.unscheduled.length) {
      return {
        tone: 'blue' as const,
        title: 'Add expected close dates',
        detail: `${risks.unscheduled.length} open opportunit${
          risks.unscheduled.length === 1 ? 'y has' : 'ies have'
        } no forecast date.`,
      };
    }

    if (risks.highValue.length) {
      return {
        tone: 'success' as const,
        title: 'Protect near-term revenue',
        detail: `${risks.highValue.length} high-value opportunit${
          risks.highValue.length === 1 ? 'y is' : 'ies are'
        } positioned to close within 30 days.`,
      };
    }

    return {
      tone: 'neutral' as const,
      title: 'Keep pipeline activity current',
      detail: 'No urgent forecast issue is currently detected.',
    };
  }, [risks]);

  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8 lg:p-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Revenue Forecast · v1.4.1
          </p>

          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            Know what may close before it closes.
          </h2>

          <p className="mt-2 text-slate-500">
            Live opportunity value, probability, timing, ownership and forecast
            risk.
          </p>
        </div>

        <PrimaryButton onClick={() => void load()}>
          <RefreshCw
            size={17}
            className={`mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          Refresh forecast
        </PrimaryButton>
      </header>

      {error && (
        <Card className="mt-5 border-red-200 p-4 text-sm text-red-700">
          {error}
        </Card>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={<CircleDollarSign />}
          label="Total pipeline"
          value={money(data.totalPipeline)}
        />

        <Stat
          icon={<TrendingUp />}
          label="Weighted pipeline"
          value={money(data.weightedPipeline)}
        />

        <Stat
          icon={<CalendarClock />}
          label="Expected this month"
          value={money(data.expectedThisMonth)}
        />

        <Stat
          icon={<Target />}
          label="Active negotiations"
          value={String(data.negotiations)}
        />

        <Stat
          icon={<Trophy />}
          label="Win rate"
          value={`${data.winRate}%`}
        />

        <Stat
          icon={<CalendarClock />}
          label="Average days to close"
          value={String(data.averageDaysToClose)}
        />

        <Stat
          icon={<UsersRound />}
          label="Portfolios sent"
          value={String(data.portfoliosSent)}
        />

        <Stat
          icon={<TrendingUp />}
          label="Open opportunities"
          value={String(openRows.length)}
        />
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-[230px_1fr]">
            <div className="bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-3 text-blue-300">
                <Gauge size={20} />
                <p className="text-sm font-semibold">Forecast Health</p>
              </div>

              <div className="mt-7 flex items-end gap-2">
                <p className="text-5xl font-semibold">{forecastHealth}</p>
                <p className="pb-1 text-lg text-slate-400">%</p>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-400">
                Measures whether open opportunities have a close date,
                probability and assigned ownership.
              </p>
            </div>

            <div className="p-6">
              <div className="flex items-start gap-3">
                {nextBestAction.tone === 'warning' ? (
                  <AlertTriangle className="mt-0.5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="mt-0.5 text-emerald-600" />
                )}

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{nextBestAction.title}</p>
                    <Pill tone={nextBestAction.tone}>
                      {nextBestAction.tone}
                    </Pill>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {nextBestAction.detail}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <RiskMetric
                  label="Overdue close dates"
                  value={risks.overdue.length}
                  warning={risks.overdue.length > 0}
                />

                <RiskMetric
                  label="Missing close dates"
                  value={risks.unscheduled.length}
                  warning={risks.unscheduled.length > 0}
                />

                <RiskMetric
                  label="Low-probability deals"
                  value={risks.lowProbability.length}
                  warning={risks.lowProbability.length > 0}
                />

                <RiskMetric
                  label="High-value near-term"
                  value={risks.highValue.length}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-slate-500">Closed-deal intelligence</p>

          <h3 className="mt-1 text-xl font-semibold">
            Historical performance
          </h3>

          <div className="mt-6 space-y-4">
            <MetricRow
              label="Closed opportunities"
              value={String(closedRows.length)}
            />

            <MetricRow
              label="Closed won"
              value={String(
                closedRows.filter(
                  opportunity => opportunity.stage === 'closed_won',
                ).length,
              )}
            />

            <MetricRow
              label="Closed lost"
              value={String(
                closedRows.filter(
                  opportunity => opportunity.stage === 'closed_lost',
                ).length,
              )}
            />

            <MetricRow
              label="Average days to close"
              value={String(data.averageDaysToClose)}
            />

            <MetricRow label="Win rate" value={`${data.winRate}%`} />
          </div>
        </Card>
      </div>

      <Card className="mt-7 overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <p className="text-sm text-slate-500">Pipeline by stage</p>

          <h3 className="mt-1 text-xl font-semibold">
            Where projected revenue currently sits
          </h3>
        </div>

        {!stageSummary.length ? (
          <p className="p-6 text-sm text-slate-500">
            Create an opportunity from the Pipeline board to begin forecasting.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {stageSummary.map(summary => (
              <div
                key={summary.stage}
                className="grid gap-4 p-5 md:grid-cols-[1.2fr_.4fr_.7fr_.7fr]"
              >
                <div>
                  <p className="font-semibold">
                    {stageLabels[summary.stage]}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {summary.count} opportunit
                    {summary.count === 1 ? 'y' : 'ies'}
                  </p>
                </div>

                <Mini label="Count" value={String(summary.count)} />

                <Mini
                  label="Potential value"
                  value={money(summary.value)}
                />

                <Mini
                  label="Weighted value"
                  value={money(summary.weighted)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-7 overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <p className="text-sm text-slate-500">
            Revenue-ranked opportunity list
          </p>

          <h3 className="mt-1 text-xl font-semibold">
            What requires management attention
          </h3>
        </div>

        {openRows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            Create an opportunity from the Pipeline board to begin forecasting.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {openRows.map(opportunity => {
              const agency = agencies.find(
                agencyItem => agencyItem.id === opportunity.agencyId,
              );

              const overdue =
                opportunity.expectedCloseDate &&
                new Date(`${opportunity.expectedCloseDate}T12:00:00`) < today;

              return (
                <div
                  key={opportunity.id}
                  className="grid gap-4 p-5 md:grid-cols-[1.3fr_.8fr_.7fr_.7fr_.8fr]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{opportunity.title}</p>

                      {overdue && <Pill tone="warning">overdue</Pill>}
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {agency?.name || 'Agency'} ·{' '}
                      {agency?.ownerEmployeeName || 'Unassigned'}
                    </p>
                  </div>

                  <Mini
                    label="Potential"
                    value={money(opportunity.askingPrice)}
                  />

                  <Mini
                    label="Probability"
                    value={`${opportunity.probability}%`}
                  />

                  <Mini
                    label="Weighted"
                    value={money(
                      (opportunity.askingPrice *
                        opportunity.probability) /
                        100,
                    )}
                  />

                  <Mini
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
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-blue-600">{icon}</div>
      <p className="mt-5 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

function Mini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function RiskMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        warning
          ? 'bg-amber-50 text-amber-800'
          : 'bg-slate-50 text-slate-700'
      }`}
    >
      <p className="text-xs">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
