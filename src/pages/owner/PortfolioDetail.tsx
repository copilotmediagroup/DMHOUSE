import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Gauge,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { usePortfolioStore } from '../../store/PortfolioStore';
import type { PortfolioStatus } from '../../types/domain';
import PortfolioFileControl from '../../components/portfolio/PortfolioFileControl';

const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

type HealthCheck = {
  label: string;
  detail: string;
  passed: boolean;
  weight: number;
};

export default function PortfolioDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { portfolios, transition, removePortfolio, getDownloadUrl } = usePortfolioStore();
  const p = portfolios.find((x) => x.id === id);
  const [notice, setNotice] = useState('');

  const health = useMemo(() => {
    if (!p) return null;

    const checks: HealthCheck[] = [
      {
        label: 'Masked sales file',
        detail: p.file ? 'Masked CSV is available for controlled distribution.' : 'Upload a masked CSV before marketing.',
        passed: Boolean(p.file),
        weight: 20,
      },
      {
        label: 'Portfolio description',
        detail: p.description.trim().length >= 40 ? 'Buyer-facing description is complete.' : 'Add a stronger buyer-facing description.',
        passed: p.description.trim().length >= 40,
        weight: 10,
      },
      {
        label: 'Selling points',
        detail: p.sellingPoints.length >= 2 ? `${p.sellingPoints.length} approved selling points are available.` : 'Add at least two approved selling points.',
        passed: p.sellingPoints.length >= 2,
        weight: 10,
      },
      {
        label: 'Pricing integrity',
        detail: p.askingPrice > 0 && p.privateMinimum > 0 && p.privateMinimum <= p.askingPrice
          ? 'Asking price and private minimum are configured.'
          : 'Review asking price and private minimum.',
        passed: p.askingPrice > 0 && p.privateMinimum > 0 && p.privateMinimum <= p.askingPrice,
        weight: 15,
      },
      {
        label: 'Acquisition economics',
        detail: p.acquisitionCost >= 0 && p.askingPrice > p.acquisitionCost
          ? 'Projected sale produces positive gross profit.'
          : 'Acquisition cost does not support positive projected profit.',
        passed: p.acquisitionCost >= 0 && p.askingPrice > p.acquisitionCost,
        weight: 15,
      },
      {
        label: 'Portfolio identity',
        detail: p.originalCreditor && p.category ? 'Creditor and portfolio category are defined.' : 'Add creditor and category information.',
        passed: Boolean(p.originalCreditor && p.category),
        weight: 10,
      },
      {
        label: 'Account inventory',
        detail: p.accountCount > 0 && p.faceValue > 0 ? 'Account count and face value are available.' : 'Complete account count and face value.',
        passed: p.accountCount > 0 && p.faceValue > 0,
        weight: 10,
      },
      {
        label: 'Sales lifecycle',
        detail: p.status === 'draft' ? 'Portfolio is still in draft.' : `Portfolio is currently ${p.status.replace(/_/g, ' ')}.`,
        passed: p.status !== 'draft',
        weight: 10,
      },
    ];

    const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
    const blockers = checks.filter((check) => !check.passed);

    let label = 'Needs attention';
    let tone: 'success' | 'blue' | 'neutral' = 'neutral';
    if (score >= 90) {
      label = 'Market ready';
      tone = 'success';
    } else if (score >= 70) {
      label = 'Nearly ready';
      tone = 'blue';
    }

    const recommendation =
      blockers[0]?.detail ||
      (p.status === 'ready'
        ? 'Activate the portfolio and begin controlled outreach.'
        : p.status === 'active'
          ? 'Portfolio is ready for buyer activity and campaign monitoring.'
          : 'Continue monitoring buyer activity and transaction progress.');

    return { checks, score, blockers, label, tone, recommendation };
  }, [p]);

  if (!p || !health) return <div className="p-10">Portfolio not found.</div>;

  const portfolio = p;

  async function move(status: PortfolioStatus) {
    const result = await transition(portfolio.id, status);
    setNotice(result.message);
  }

  async function download() {
    const url = await getDownloadUrl(portfolio.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  const grossProfit = p.askingPrice - p.acquisitionCost;
  const margin = p.askingPrice > 0 ? Math.max(0, (grossProfit / p.askingPrice) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1350px] p-5 md:p-8 lg:p-10">
      <Link to="/portfolios" className="mb-6 inline-flex items-center text-sm font-semibold text-slate-500">
        <ArrowLeft className="mr-2" size={17} />
        Portfolio queue
      </Link>

      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone={p.status === 'active' ? 'success' : p.status === 'ready' ? 'blue' : 'neutral'}>
              {p.status.replace(/_/g, ' ')}
            </Pill>
            <span className="text-sm text-slate-400">{p.category}</span>
          </div>
          <h2 className="mt-3 text-3xl font-semibold">{p.name}</h2>
          <p className="mt-2 text-slate-500">
            {p.originalCreditor} · {p.accountCount.toLocaleString()} accounts
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {p.status === 'draft' && (
            <PrimaryButton onClick={() => move('ready')}>
              <Check className="mr-2" size={18} />
              Mark Ready
            </PrimaryButton>
          )}
          {p.status === 'ready' && (
            <PrimaryButton onClick={() => move('active')}>
              <Play className="mr-2" size={18} />
              Activate campaign
            </PrimaryButton>
          )}
          {p.status === 'active' && (
            <SecondaryButton onClick={() => move('archived')}>Withdraw campaign</SecondaryButton>
          )}
          {p.status === 'archived' && (
            <SecondaryButton disabled>
              <RotateCcw className="mr-2" size={17} />
              Archived
            </SecondaryButton>
          )}
        </div>
      </header>

      {notice && (
        <div
          className={`mb-6 rounded-2xl p-4 text-sm font-semibold ${
            notice.includes('now') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {notice}
        </div>
      )}

      <Card className="mb-6 overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
          <div className="border-b border-slate-100 bg-slate-950 p-7 text-white lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3 text-blue-300">
              <Gauge size={22} />
              <p className="text-sm font-semibold">Portfolio Health</p>
            </div>
            <div className="mt-8 flex items-end gap-2">
              <span className="text-6xl font-semibold tracking-tight">{health.score}</span>
              <span className="pb-2 text-xl text-slate-400">%</span>
            </div>
            <div className="mt-5">
              <Pill tone={health.tone}>{health.label}</Pill>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-400">
              {health.blockers.length === 0
                ? 'Every core readiness requirement is complete.'
                : `${health.blockers.length} item${health.blockers.length === 1 ? '' : 's'} require attention.`}
            </p>
          </div>

          <div className="p-6 md:p-8">
            <div className="grid gap-3 md:grid-cols-2">
              {health.checks.map((check) => (
                <div
                  key={check.label}
                  className={`rounded-2xl border p-4 ${
                    check.passed ? 'border-emerald-100 bg-emerald-50/60' : 'border-amber-100 bg-amber-50/70'
                  }`}
                >
                  <div className="flex gap-3">
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} />
                    ) : (
                      <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={19} />
                    )}
                    <div>
                      <p className="text-sm font-semibold">{check.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-3 rounded-2xl bg-blue-50 p-4">
              <Sparkles className="mt-0.5 shrink-0 text-blue-600" size={19} />
              <div>
                <p className="text-sm font-semibold text-blue-900">Recommended next action</p>
                <p className="mt-1 text-sm leading-6 text-blue-700">{health.recommendation}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <div className="space-y-6">
          <Card className="p-6 md:p-8">
            <h3 className="text-xl font-semibold">Approved sales package</h3>
            <p className="mt-4 leading-7 text-slate-600">{p.description}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {p.sellingPoints.map((point) => (
                <div key={point} className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                  <Check className="mt-0.5 text-emerald-600" size={18} />
                  <span className="text-sm font-medium">{point}</span>
                </div>
              ))}
            </div>
          </Card>

          <PortfolioFileControl portfolio={p}/>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-blue-600" />
                <div>
                  <p className="font-semibold">Owner-only economics</p>
                  <p className="text-xs text-slate-400">Hidden from employees</p>
                </div>
              </div>
            </div>
            <OwnerMetric label="Asking price" value={money(p.askingPrice)} />
            <OwnerMetric label="Private minimum" value={money(p.privateMinimum)} />
            <OwnerMetric label="Acquisition cost" value={money(p.acquisitionCost)} />
            <OwnerMetric label="Potential gross profit" value={money(grossProfit)} />
            <OwnerMetric label="Projected margin" value={`${margin.toFixed(1)}%`} />
          </Card>

          {p.status === 'draft' && (
            <Card className="p-6">
              <p className="text-sm font-semibold text-red-700">Draft controls</p>
              <p className="mt-2 text-sm text-slate-500">
                Deletion is allowed only when no negotiation, deal, sale, closing, distribution, or assignment exists.
              </p>
              <SecondaryButton
                className="mt-5 w-full text-red-700"
                onClick={async () => {
                  try {
                    await removePortfolio(p.id);
                    nav('/portfolios');
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : 'Portfolio could not be deleted.');
                  }
                }}
              >
                <Trash2 className="mr-2" size={17} />
                Delete draft
              </SecondaryButton>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 p-6 last:border-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
