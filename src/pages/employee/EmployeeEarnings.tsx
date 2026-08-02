import { Banknote, CheckCircle2, CircleDollarSign, Clock3, TrendingUp, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, Pill } from '../../components/Primitives';
import { useClosingStore } from '../../store/ClosingStore';
import { usePipelineStore } from '../../store/PipelineStore';
import { usePortfolioStore } from '../../store/PortfolioStore';

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
}).format(value);

export default function EmployeeEarnings() {
  const { profile, portfolios } = usePortfolioStore();
  const { opportunities } = usePipelineStore();
  const { commissions, sales, loading, error } = useClosingStore();

  if (!profile) return null;

  const mine = commissions.filter((commission) => commission.employeeId === profile.id);
  const pending = mine.filter((commission) => ['estimated', 'pending', 'approved'].includes(commission.status));
  const paid = mine.filter((commission) => commission.status === 'paid');
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const paidThisMonth = paid.filter((commission) => commission.paidAt && new Date(commission.paidAt).getTime() >= monthStart.getTime());

  const potential = opportunities
    .filter((opportunity) => opportunity.ownerId === profile.id && !['closed_won', 'closed_lost'].includes(opportunity.stage))
    .reduce((sum, opportunity) => {
      const portfolio = portfolios.find((item) => item.id === opportunity.portfolioId);
      if (!portfolio) return sum;
      const salePrice = opportunity.askingPrice || portfolio.askingPrice;
      const commission = portfolio.employeeCommissionType === 'percentage'
        ? salePrice * (portfolio.employeeCommissionValue / 100)
        : portfolio.employeeCommissionValue;
      return sum + Math.max(0, commission);
    }, 0);

  const total = (rows: typeof mine) => rows.reduce((sum, row) => sum + row.amount, 0);
  const mySales = sales.filter((sale) => sale.winningEmployeeId === profile.id);

  return (
    <div className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-blue-600">My earnings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Know what your work is worth.</h1>
        <p className="mt-2 max-w-2xl text-slate-500">Potential earnings come from your active deals. Closed commissions remain tracked from approval through payment.</p>
      </header>

      {error && <div className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<TrendingUp size={20}/>} label="Potential pipeline" value={money(potential)} detail="Active deals" tone="blue" />
        <Metric icon={<Clock3 size={20}/>} label="Pending commission" value={money(total(pending))} detail="Estimated, pending or approved" tone="amber" />
        <Metric icon={<Banknote size={20}/>} label="Paid this month" value={money(total(paidThisMonth))} detail={`${paidThisMonth.length} payment${paidThisMonth.length === 1 ? '' : 's'}`} tone="emerald" />
        <Metric icon={<WalletCards size={20}/>} label="Lifetime paid" value={money(total(paid))} detail={`${mySales.length} closed sale${mySales.length === 1 ? '' : 's'}`} tone="slate" />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-semibold">Commission history</h2>
            <p className="mt-1 text-sm text-slate-500">Every recorded commission tied to your employee account.</p>
          </div>
          <Pill tone="blue">{mine.length} records</Pill>
        </div>
        {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading earnings…</div> : (
          <div className="divide-y divide-slate-100">
            {mine.map((commission) => {
              const sale = sales.find((item) => item.id === commission.saleId);
              return (
                <div key={commission.id} className="grid gap-4 px-6 py-5 md:grid-cols-[1fr_.8fr_.7fr] md:items-center">
                  <div>
                    <p className="font-semibold">{sale?.portfolioName || 'Portfolio sale'}</p>
                    <p className="mt-1 text-sm text-slate-500">{sale?.agencyName || 'Buyer'} · {new Date(commission.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Calculation</p>
                    <p className="mt-1 text-sm font-medium capitalize">{commission.calculationType}{commission.rate != null ? ` · ${commission.rate}${commission.calculationType === 'percentage' ? '%' : ''}` : ''}</p>
                  </div>
                  <div className="md:text-right">
                    <p className="text-lg font-semibold">{money(commission.amount)}</p>
                    <p className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold capitalize ${commission.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {commission.status === 'paid' && <CheckCircle2 size={13}/>} {commission.status}
                    </p>
                  </div>
                </div>
              );
            })}
            {!mine.length && <div className="p-12 text-center"><CircleDollarSign className="mx-auto text-slate-300" size={42}/><p className="mt-4 font-semibold">No commission history yet</p><p className="mt-1 text-sm text-slate-500">Closed sales and approved commissions will appear here.</p></div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function Metric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: 'blue'|'amber'|'emerald'|'slate' }) {
  const styles = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
  }[tone];
  return <Card className="p-5"><div className={`grid h-10 w-10 place-items-center rounded-xl ${styles}`}>{icon}</div><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card>;
}
