import { Check, Eye, FileSignature, LockKeyhole, ShieldCheck, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { usePortfolioStore } from '../../store/PortfolioStore';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const lifecycle = [
  ['1', 'Send NDA', 'Buyer reviews and signs inside the secure portal.'],
  ['2', 'Masked file unlocks', 'The buyer downloads the masked portfolio only after the NDA is executed.'],
  ['3', 'Send purchase agreement', 'The employee advances the qualified buyer through the document workspace.'],
  ['4', 'Buyer funds the deal', 'Funding remains pending until the owner verifies cleared funds.'],
  ['5', 'Owner releases final file', 'Only the owner can release the unmasked portfolio.'],
] as const;

export default function EmployeePortfolio() {
  const { active } = usePortfolioStore();

  if (!active) return <div className="p-10">No active portfolio.</div>;

  const payout =
    active.employeeCommissionType === 'percentage'
      ? active.askingPrice * (active.employeeCommissionValue / 100)
      : active.employeeCommissionValue;

  return (
    <div className="mx-auto max-w-6xl p-5 md:p-8 lg:p-10">
      <header className="mb-8">
        <Pill tone="success">Active</Pill>
        <h2 className="mt-3 text-3xl font-semibold">{active.name}</h2>
        <p className="mt-2 text-slate-500">Approved employee sales workspace</p>
      </header>

      {active.employeeCommissionVisible ? (
        <Card className="mb-6 overflow-hidden border-emerald-200 bg-emerald-50 p-7 md:p-9">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
              <Trophy size={28} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Potential commission</p>
              <p className="mt-2 text-4xl font-bold text-emerald-950">{money(payout)}</p>
              <p className="mt-2 text-sm text-emerald-800">
                {active.employeeCommissionType === 'percentage'
                  ? `${active.employeeCommissionValue}% of the approved ${money(active.askingPrice)} asking price`
                  : `Flat commission on a ${money(active.askingPrice)} sale`}
              </p>
              <p className="mt-3 text-xs font-medium text-emerald-700">Final commission is recorded when the funded deal closes.</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mb-6 flex items-center gap-4 border-blue-100 bg-blue-50 p-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-blue-600"><Trophy size={23} /></div>
          <div>
            <p className="font-semibold text-blue-950">Commission available upon closing</p>
            <p className="mt-1 text-sm text-blue-700">The owner configured compensation for this portfolio. The amount is private until closing.</p>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <div className="space-y-6">
          <Card className="p-7 md:p-9">
            <p className="text-sm text-slate-500">Portfolio story</p>
            <p className="mt-3 text-lg leading-8 text-slate-700">{active.description}</p>
            <div className="mt-7 space-y-3">
              {active.sellingPoints.map((point) => (
                <div className="flex gap-3 rounded-2xl bg-slate-50 p-4" key={point}>
                  <Check className="text-emerald-600" size={19} />
                  <span className="text-sm font-medium">{point}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-7 md:p-9">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 text-blue-600" />
              <div>
                <p className="text-lg font-semibold">Secure buyer lifecycle</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">There is one approved path for every buyer. Employees advance documents; the portal and owner control file access.</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {lifecycle.map(([step, title, detail]) => (
                <div key={step} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-blue-600 shadow-sm">{step}</div>
                  <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <p className="text-sm text-slate-500">Asking price</p>
            <p className="mt-2 text-3xl font-semibold">{money(active.askingPrice)}</p>
            <p className="mt-4 text-sm text-slate-500">Use the approved asking price. All offers still require owner review.</p>
          </Card>

          <Card className="p-6">
            <p className="font-semibold">Employee portfolio preview</p>
            <p className="mt-2 text-sm text-slate-500">{active.maskedFile?.name || 'No file available'}</p>
            <Link to={`/employee/portfolio/${active.id}/preview`}>
              <PrimaryButton className="mt-5 w-full" disabled={!active.maskedFile}>
                <Eye className="mr-2" size={17} />Preview complete masked file
              </PrimaryButton>
            </Link>
            <p className="mt-3 text-xs leading-5 text-slate-400">View-only access helps you understand the product. Employees cannot release this file to buyers from here.</p>
          </Card>

          <Card className="border-blue-100 bg-blue-50 p-6">
            <div className="flex gap-3">
              <FileSignature className="shrink-0 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-950">Ready to qualify a buyer?</p>
                <p className="mt-1 text-sm leading-6 text-blue-800">Start in Documents. Once the buyer signs the NDA, the Buyer Portal automatically unlocks the masked portfolio.</p>
              </div>
            </div>
            <Link to="/employee/documents"><PrimaryButton className="mt-5 w-full"><FileSignature className="mr-2" size={17} />Open Documents</PrimaryButton></Link>
          </Card>

          <Card className="flex gap-3 p-5">
            <LockKeyhole className="shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-semibold">Owner controls final release</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">The final unmasked portfolio stays locked until the agreement is executed, funds are verified, and the owner releases it.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
