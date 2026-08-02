import { FormEvent, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, FileSignature, Landmark, LockKeyhole } from 'lucide-react';
import { Card, Field, Pill, PrimaryButton, SecondaryButton, inputClass } from '../../components/Primitives';
import { useClosingStore } from '../../store/ClosingStore';
import { useNegotiationStore } from '../../store/NegotiationStore';
import { usePortfolioStore } from '../../store/PortfolioStore';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const today = () => new Date().toISOString().slice(0, 10);

type DepositDraft = { amount: string; method: string; receivedAt: string; notes: string; proof?: File };
type CloseDraft = { balance: string; method: string; paidAt: string; notes: string; proof?: File };

export default function EmployeeClosings() {
  const { reservations, sales, recordDeposit, closeSale, loading, error } = useClosingStore();
  const { offers } = useNegotiationStore();
  const { profile, portfolios } = usePortfolioStore();
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'deposit' | 'close'>('deposit');
  const [deposit, setDeposit] = useState<DepositDraft>({ amount: '', method: 'Wire', receivedAt: today(), notes: '' });
  const [closing, setClosing] = useState<CloseDraft>({ balance: '', method: 'Wire', paidAt: today(), notes: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const ownOfferIds = useMemo(() => new Set(offers.filter((offer) => offer.employeeId === profile?.id).map((offer) => offer.id)), [offers, profile?.id]);
  const ownReservations = useMemo(() => reservations.filter((reservation) => ownOfferIds.has(reservation.offerId)), [reservations, ownOfferIds]);
  const ownSales = useMemo(() => sales.filter((sale) => sale.winningEmployeeId === profile?.id), [sales, profile?.id]);
  const selected = ownReservations.find((reservation) => reservation.id === selectedId) || ownReservations[0];
  const portfolio = portfolios.find((item) => item.id === selected?.portfolioId);
  const commissionType = portfolio?.employeeCommissionType || 'flat';
  const commissionValue = portfolio?.employeeCommissionValue || 0;
  const expectedCommission = portfolio ? (commissionType === 'percentage' ? selected?.amount || 0 : 1) * (commissionType === 'percentage' ? commissionValue / 100 : commissionValue) : 0;

  async function submitDeposit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setNotice('');
    try {
      await recordDeposit(selected.id, { amount: Number(deposit.amount), paymentMethod: deposit.method, receivedAt: deposit.receivedAt, proof: deposit.proof, notes: deposit.notes });
      setNotice('Deposit recorded. The owner can monitor the updated closing in real time.');
      setDeposit({ amount: '', method: 'Wire', receivedAt: today(), notes: '' });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Unable to record deposit.'); }
    finally { setBusy(false); }
  }

  async function submitClose(event: FormEvent) {
    event.preventDefault();
    if (!selected || !profile) return;
    setBusy(true); setNotice('');
    try {
      await closeSale(selected.id, { balanceAmount: Number(closing.balance), paymentMethod: closing.method, paidAt: closing.paidAt, winningEmployeeId: profile.id, commissionType, commissionValue, proof: closing.proof, notes: closing.notes });
      setNotice('Deal closed. Revenue, commission, portfolio status and owner reporting were updated.');
      setClosing({ balance: '', method: 'Wire', paidAt: today(), notes: '' });
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Unable to close sale.'); }
    finally { setBusy(false); }
  }

  return <div className="p-5 md:p-8 lg:p-10"><div className="mx-auto max-w-7xl">
    <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold text-blue-600">EMPLOYEE SALES EXECUTION</p><h1 className="mt-1 text-3xl font-semibold">Closings</h1><p className="mt-2 text-slate-500">You drive your assigned buyer from accepted offer through payment and completed sale. The owner monitors and guides.</p></div><div className="flex gap-3"><Pill tone="success">{ownReservations.filter((item) => item.status === 'active').length} active</Pill><Pill>{ownSales.length} closed</Pill></div></header>
    {notice && <p className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-medium text-blue-700">{notice}</p>}
    {error && <p className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p>}

    <div className="mt-7 grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
      <Card className="overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-semibold">My closing queue</h2><p className="mt-1 text-xs text-slate-500">Only transactions tied to your own offers are shown.</p></div>{loading ? <div className="p-6 text-sm text-slate-500">Loading closings…</div> : ownReservations.length === 0 ? <div className="p-8 text-center"><Landmark className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-semibold">No active closings</p><p className="mt-1 text-sm text-slate-500">An accepted and reserved offer will appear here.</p></div> : <div className="divide-y divide-slate-200">{ownReservations.map((reservation) => <button key={reservation.id} onClick={() => setSelectedId(reservation.id)} className={`w-full p-5 text-left transition ${selected?.id === reservation.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{reservation.agencyName}</p><p className="mt-1 text-sm text-slate-500">{reservation.portfolioName}</p></div><Pill tone={reservation.status === 'paid' ? 'success' : 'warning'}>{reservation.status}</Pill></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-400">Sale amount</p><p className="mt-1 font-semibold text-slate-800">{money(reservation.amount)}</p></div><div><p className="text-slate-400">Payment deadline</p><p className="mt-1 font-semibold text-slate-800">{reservation.paymentDeadline ? new Date(reservation.paymentDeadline).toLocaleDateString() : 'Not set'}</p></div></div></button>)}</div>}</Card>

      <div className="space-y-6">{selected ? <>
        <Card className="p-6"><div className="flex flex-col justify-between gap-5 md:flex-row"><div><p className="text-sm text-slate-500">Closing with</p><h2 className="mt-1 text-2xl font-semibold">{selected.agencyName}</h2><p className="mt-1 text-sm text-slate-500">{selected.portfolioName}</p></div><div className="text-left md:text-right"><p className="text-sm text-slate-500">Agreed price</p><p className="mt-1 text-3xl font-semibold">{money(selected.amount)}</p><p className="mt-1 text-xs font-medium text-emerald-700">Expected commission: {money(expectedCommission)}</p></div></div>
          <div className="mt-6 grid gap-3 md:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4"><Clock3 className="text-blue-600" size={19}/><p className="mt-3 text-xs text-slate-500">Deposit required</p><p className="mt-1 font-semibold">{money(selected.depositRequired)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><Banknote className="text-emerald-600" size={19}/><p className="mt-3 text-xs text-slate-500">Deposit received</p><p className="mt-1 font-semibold">{money(selected.depositReceived)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><FileSignature className="text-violet-600" size={19}/><p className="mt-3 text-xs text-slate-500">Agreement</p><p className="mt-1 font-semibold">Verify in Documents</p></div><div className="rounded-2xl bg-slate-50 p-4"><LockKeyhole className="text-amber-600" size={19}/><p className="mt-3 text-xs text-slate-500">Final file</p><p className="mt-1 font-semibold">Owner-controlled release</p></div></div>
        </Card>

        <Card className="p-6"><div className="flex gap-2"><SecondaryButton onClick={() => setMode('deposit')} className={mode === 'deposit' ? 'ring-2 ring-blue-500' : ''}>Record deposit</SecondaryButton><SecondaryButton onClick={() => setMode('close')} className={mode === 'close' ? 'ring-2 ring-blue-500' : ''}>Complete closing</SecondaryButton></div>
          {mode === 'deposit' ? <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={submitDeposit}><Field label="Deposit amount"><input className={inputClass} type="number" min="0" step=".01" required value={deposit.amount} onChange={(event) => setDeposit((draft) => ({ ...draft, amount: event.target.value }))}/></Field><Field label="Payment method"><select className={inputClass} value={deposit.method} onChange={(event) => setDeposit((draft) => ({ ...draft, method: event.target.value }))}><option>Wire</option><option>ACH</option><option>Cashier's check</option><option>Other</option></select></Field><Field label="Received date"><input className={inputClass} type="date" required value={deposit.receivedAt} onChange={(event) => setDeposit((draft) => ({ ...draft, receivedAt: event.target.value }))}/></Field><Field label="Payment proof"><input className={inputClass} type="file" onChange={(event) => setDeposit((draft) => ({ ...draft, proof: event.target.files?.[0] }))}/></Field><div className="md:col-span-2"><Field label="Closing notes"><textarea className={`${inputClass} min-h-24`} value={deposit.notes} onChange={(event) => setDeposit((draft) => ({ ...draft, notes: event.target.value }))}/></Field></div><div className="md:col-span-2"><PrimaryButton disabled={busy} type="submit"><Banknote className="mr-2" size={17}/>{busy ? 'Saving…' : 'Record deposit'}</PrimaryButton></div></form> : <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={submitClose}><Field label="Final balance received"><input className={inputClass} type="number" min="0" step=".01" required value={closing.balance} onChange={(event) => setClosing((draft) => ({ ...draft, balance: event.target.value }))}/></Field><Field label="Payment method"><select className={inputClass} value={closing.method} onChange={(event) => setClosing((draft) => ({ ...draft, method: event.target.value }))}><option>Wire</option><option>ACH</option><option>Cashier's check</option><option>Other</option></select></Field><Field label="Paid date"><input className={inputClass} type="date" required value={closing.paidAt} onChange={(event) => setClosing((draft) => ({ ...draft, paidAt: event.target.value }))}/></Field><Field label="Final payment proof"><input className={inputClass} type="file" onChange={(event) => setClosing((draft) => ({ ...draft, proof: event.target.files?.[0] }))}/></Field><div className="md:col-span-2"><Field label="Closing notes"><textarea className={`${inputClass} min-h-24`} value={closing.notes} onChange={(event) => setClosing((draft) => ({ ...draft, notes: event.target.value }))}/></Field></div><div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex gap-3"><CheckCircle2 className="shrink-0 text-emerald-700"/><p>Completing this action records the sale under your employee account and updates owner reporting. Final unmasked-file release remains protected by the owner-controlled release gate.</p></div></div><div className="md:col-span-2"><PrimaryButton disabled={busy} type="submit"><CheckCircle2 className="mr-2" size={17}/>{busy ? 'Closing…' : 'Mark deal closed'}</PrimaryButton></div></form>}
        </Card>
      </> : null}</div>
    </div>
  </div></div>;
}
