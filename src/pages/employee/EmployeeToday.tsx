import { AlertTriangle, ArrowRight, BriefcaseBusiness, Clock3, FileSignature, Mail, Search, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { useAgencyStore } from '../../store/AgencyStore';
import { useClosingStore } from '../../store/ClosingStore';
import { useConversationStore } from '../../store/ConversationStore';
import { usePipelineStore } from '../../store/PipelineStore';
import { usePortfolioStore } from '../../store/PortfolioStore';

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
}).format(value);

const dayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const dayEnd = () => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

export default function EmployeeToday() {
  const { active, profile } = usePortfolioStore();
  const { agencies, currentEmployee } = useAgencyStore();
  const { opportunities } = usePipelineStore();
  const { conversations, messages } = useConversationStore();
  const { reservations, commissions } = useClosingStore();

  if (!profile) return null;

  const mine = agencies.filter((agency) => agency.ownerEmployeeId === currentEmployee.id);
  const mineIds = new Set(mine.map((agency) => agency.id));
  const myDeals = opportunities.filter((opportunity) => opportunity.ownerId === profile.id || mineIds.has(opportunity.agencyId));
  const openDeals = myDeals.filter((opportunity) => !['closed_won', 'closed_lost'].includes(opportunity.stage));

  const followUps = mine.flatMap((agency) => agency.activities
    .filter((activity) => activity.followUpAt && !activity.completedAt)
    .map((activity) => ({ agency, activity, due: new Date(activity.followUpAt as string).getTime() })))
    .sort((a, b) => a.due - b.due);
  const overdue = followUps.filter((item) => item.due < dayStart());
  const dueToday = followUps.filter((item) => item.due >= dayStart() && item.due <= dayEnd());

  const assignedConversations = conversations.filter((conversation) =>
    conversation.assignedEmployeeId === profile.id || mineIds.has(conversation.agencyId));
  const conversationIds = new Set(assignedConversations.map((conversation) => conversation.id));
  const unreadReplies = messages.filter((message) =>
    conversationIds.has(message.conversationId) && message.direction === 'inbound' && !message.isRead);

  const activeClosings = reservations.filter((reservation) =>
    reservation.status === 'active' && mineIds.has(reservation.agencyId));
  const pendingCommission = commissions
    .filter((commission) => commission.employeeId === profile.id && ['estimated', 'pending', 'approved'].includes(commission.status))
    .reduce((sum, commission) => sum + commission.amount, 0);

  const portfolioCommission = active
    ? active.employeeCommissionType === 'percentage'
      ? active.askingPrice * (active.employeeCommissionValue / 100)
      : active.employeeCommissionValue
    : 0;

  const nextAction = unreadReplies.length
    ? { label: 'Reply to a buyer', detail: `${unreadReplies.length} unread buyer repl${unreadReplies.length === 1 ? 'y' : 'ies'} need attention.`, path: '/employee/conversations', action: 'Open Messages', icon: <Mail/> }
    : overdue.length
      ? { label: `Follow up with ${overdue[0].agency.name}`, detail: `${overdue.length} overdue follow-up${overdue.length === 1 ? '' : 's'} in your agency inventory.`, path: `/employee/agencies/${overdue[0].agency.id}`, action: 'Open Agency', icon: <AlertTriangle/> }
      : activeClosings.length
        ? { label: `Advance ${activeClosings[0].agencyName}`, detail: 'A closing is active and waiting for its next required step.', path: '/employee/closings', action: 'Open Closings', icon: <BriefcaseBusiness/> }
        : { label: 'Build the next buyer relationship', detail: 'Add or search for an agency and begin a focused sales conversation.', path: '/employee/agencies', action: 'Open Agencies', icon: <Search/> };

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8 lg:p-10">
      <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">Today</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your sales desk, without the clutter.</h1>
          <p className="mt-2 max-w-2xl text-slate-500">Work the next buyer, move the next deal, and know what you can earn.</p>
        </div>
        <Link to="/employee/agencies"><PrimaryButton><Search className="mr-2" size={17}/>Find or add agency</PrimaryButton></Link>
      </header>

      <Card className="mb-6 overflow-hidden border-blue-200">
        <div className="grid gap-5 bg-[#091221] p-6 text-white md:grid-cols-[auto_1fr_auto] md:items-center md:p-8">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-blue-300">{nextAction.icon}</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-300">Next best action</p>
            <h2 className="mt-2 text-2xl font-semibold">{nextAction.label}</h2>
            <p className="mt-2 text-sm text-slate-300">{nextAction.detail}</p>
          </div>
          <Link to={nextAction.path}><PrimaryButton>{nextAction.action}<ArrowRight className="ml-2" size={17}/></PrimaryButton></Link>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Queue icon={<Mail size={18}/>} label="Buyer replies" value={unreadReplies.length} detail="Need your response" tone={unreadReplies.length ? 'red' : 'slate'} path="/employee/conversations"/>
        <Queue icon={<Clock3 size={18}/>} label="Follow-ups" value={overdue.length + dueToday.length} detail={`${overdue.length} overdue · ${dueToday.length} today`} tone={overdue.length ? 'amber' : 'blue'} path="/employee/agencies"/>
        <Queue icon={<BriefcaseBusiness size={18}/>} label="Active deals" value={openDeals.length} detail={`${activeClosings.length} in closing`} tone="blue" path="/employee/pipeline"/>
        <Queue icon={<WalletCards size={18}/>} label="Pending earnings" value={money(pendingCommission)} detail="Recorded commissions" tone="emerald" path="/employee/earnings"/>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        {active ? (
          <Card className="overflow-hidden">
            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div><Pill tone="success">Portfolio to sell</Pill><h2 className="mt-3 text-2xl font-semibold">{active.name}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{active.description}</p></div>
                {active.employeeCommissionVisible && <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-right"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Potential commission</p><p className="mt-1 text-2xl font-semibold text-emerald-950">{money(portfolioCommission)}</p></div>}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Info label="Accounts" value={active.accountCount.toLocaleString()}/>
                <Info label="Asking price" value={money(active.askingPrice)}/>
                <Info label="My agencies" value={String(mine.length)}/>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/employee/portfolio"><PrimaryButton>Open Portfolio</PrimaryButton></Link>
                <Link to="/employee/agencies"><SecondaryButton>Choose Buyer</SecondaryButton></Link>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="grid min-h-72 place-items-center p-8 text-center"><div><BriefcaseBusiness className="mx-auto text-slate-300" size={44}/><p className="mt-4 font-semibold">No active portfolio</p><p className="mt-1 text-sm text-slate-500">The owner must activate inventory before selling begins.</p></div></Card>
        )}

        <Card className="p-6 md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Core workflow</p>
          <h2 className="mt-2 text-xl font-semibold">One sale, one clear path.</h2>
          <div className="mt-6 space-y-3">
            <Step number="1" title="Choose an agency" detail="Search or add the buyer inside Agencies." path="/employee/agencies"/>
            <Step number="2" title="Start the conversation" detail="Email and buyer replies stay inside Messages." path="/employee/conversations"/>
            <Step number="3" title="Move the deal" detail="Track the offer and negotiation in Deals." path="/employee/pipeline"/>
            <Step number="4" title="Send documents" detail="Prepare the NDA and purchase agreement." path="/employee/documents" icon={<FileSignature size={16}/>}/>
            <Step number="5" title="Close and get paid" detail="Finish funding steps and track commission." path="/employee/closings"/>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Queue({ icon, label, value, detail, tone, path }: { icon: ReactNode; label: string; value: number|string; detail: string; tone: 'red'|'amber'|'blue'|'emerald'|'slate'; path: string }) {
  const styles = { red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-700', slate: 'bg-slate-100 text-slate-600' }[tone];
  return <Link to={path}><Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className={`grid h-9 w-9 place-items-center rounded-xl ${styles}`}>{icon}</div><p className="mt-4 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Card></Link>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}

function Step({ number, title, detail, path, icon }: { number: string; title: string; detail: string; path: string; icon?: ReactNode }) {
  return <Link to={path} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-4 transition hover:border-blue-200 hover:bg-blue-50/40"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-sm font-semibold text-blue-600">{icon || number}</div><div className="flex-1"><p className="font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div><ArrowRight className="text-slate-300" size={17}/></Link>;
}
