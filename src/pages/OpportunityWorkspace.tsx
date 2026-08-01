import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Clock3,
  Download,
  FileText,
  Gauge,
  Gavel,
  HandCoins,
  Landmark,
  History,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../components/Primitives';
import { supabase } from '../lib/supabase';
import { useAgencyStore } from '../store/AgencyStore';
import { useApprovalStore } from '../store/ApprovalStore';
import { useClosingStore } from '../store/ClosingStore';
import { useConversationStore } from '../store/ConversationStore';
import { usePipelineStore } from '../store/PipelineStore';
import { useNegotiationStore } from '../store/NegotiationStore';
import { useRevenueStore } from '../store/RevenueStore';
import { usePortfolioStore } from '../store/PortfolioStore';

type Tab = 'overview' | 'negotiation' | 'closing' | 'communications' | 'documents' | 'tasks' | 'history';

type TimelineEvent = {
  id: string;
  type: 'stage' | 'offer' | 'approval' | 'closing' | 'revenue' | 'email' | 'call' | 'note' | 'follow_up' | 'system';
  title: string;
  detail: string;
  occurredAt: string;
  actor?: string;
};

const money = (value = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const stageLabel = (value: string) =>
  value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export default function OpportunityWorkspace() {
  const { opportunityId } = useParams();
  const { opportunities, moveAgency, refresh: refreshPipeline } = usePipelineStore();
  const { offers, addRound, reserve, refresh: refreshOffers } = useNegotiationStore();
  const { requests, create: createApproval, refresh: refreshApprovals } = useApprovalStore();
  const {
    reservations,
    sales: closedSales,
    commissions: closingCommissions,
    employees: closingEmployees,
    recordDeposit,
    closeSale,
    releaseReservation,
    refresh: refreshClosing,
  } = useClosingStore();
  const { refresh: refreshRevenue } = useRevenueStore();
  const { agencies } = useAgencyStore();
  const { conversations, messages, ensure, addInternalNote, setWorkflow, refresh: refreshConversations } = useConversationStore();
  const { portfolios, profile } = usePortfolioStore();

  const [tab, setTab] = useState<Tab>('overview');
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpPriority, setFollowUpPriority] = useState('normal');
  const [followUpStatus, setFollowUpStatus] = useState('waiting_on_buyer');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [counterTerms, setCounterTerms] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [negotiationBusy, setNegotiationBusy] = useState(false);
  const [negotiationNotice, setNegotiationNotice] = useState('');
  const [closingBusy, setClosingBusy] = useState(false);
  const [closingNotice, setClosingNotice] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wire');
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [winningEmployeeId, setWinningEmployeeId] = useState('');
  const [commissionType, setCommissionType] = useState<'flat' | 'percentage'>('percentage');
  const [commissionValue, setCommissionValue] = useState('0');
  const [closingNotes, setClosingNotes] = useState('');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<
    'all' | TimelineEvent['type']
  >('all');
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const [reservationDeadline, setReservationDeadline] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  );
  const [reservationExpiresAt, setReservationExpiresAt] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16),
  );
  const [reservationDeposit, setReservationDeposit] = useState('0');

  const opportunity = opportunities.find(item => item.id === opportunityId);
  const agency = agencies.find(item => item.id === opportunity?.agencyId);
  const portfolio = portfolios.find(item => item.id === opportunity?.portfolioId);
  const conversation = conversations.find(
    item =>
      item.opportunityId === opportunity?.id ||
      item.agencyId === opportunity?.agencyId,
  );

  const activeOffer = offers.find(
    offer =>
      offer.agencyId === opportunity?.agencyId &&
      (!opportunity?.portfolioId || offer.portfolioId === opportunity.portfolioId),
  );
  const pendingApproval = requests.find(
    request =>
      request.status === 'pending' &&
      request.entityType === 'offer' &&
      request.entityId === activeOffer?.id,
  );

  const reservation = reservations.find(
    item =>
      item.agencyId === opportunity?.agencyId &&
      item.portfolioId === opportunity?.portfolioId &&
      (!activeOffer || item.offerId === activeOffer.id),
  );
  const closedSale = closedSales.find(
    item =>
      item.agencyId === opportunity?.agencyId &&
      item.portfolioId === opportunity?.portfolioId,
  );

  const dealLocked = Boolean(closedSale);

  const relatedCommissions = closingCommissions.filter(
    item => item.saleId === closedSale?.id,
  );

  const conversationMessages = useMemo(
    () =>
      messages
        .filter(item => item.conversationId === conversation?.id)
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime(),
        ),
    [conversation?.id, messages],
  );

  const decisionMaker = agency?.contacts.find(contact => contact.decisionMaker);
  const latestActivity = agency?.activities[0];
  const agencyFollowUp = agency?.activities.find(
    activity => activity.followUpAt && !activity.completedAt,
  );
  const effectiveFollowUpAt =
    conversation?.nextFollowUpAt || agencyFollowUp?.followUpAt;
  const nextFollowUp = effectiveFollowUpAt
    ? { followUpAt: effectiveFollowUpAt }
    : undefined;

  const daysOpen = opportunity
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(opportunity.createdAt).getTime()) / 86400000,
        ),
      )
    : 0;

  const overdue =
    Boolean(opportunity?.expectedCloseDate) &&
    new Date(`${opportunity?.expectedCloseDate}T12:00:00`) < new Date();

  useEffect(() => {
    if (!conversation) return;

    setFollowUpPriority(conversation.priority || 'normal');
    setFollowUpStatus(conversation.status || 'waiting_on_buyer');

    if (conversation.nextFollowUpAt) {
      const value = new Date(conversation.nextFollowUpAt);
      const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setFollowUpAt(local);
    } else {
      setFollowUpAt('');
    }
  }, [
    conversation?.id,
    conversation?.nextFollowUpAt,
    conversation?.priority,
    conversation?.status,
  ]);

  useEffect(() => {
    if (!agency?.id) {
      setHistoryRows([]);
      setHistoryLoading(false);
      return;
    }

    let active = true;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError('');

      const result = await supabase
        .from('pipeline_stage_history')
        .select('*')
        .eq('agency_id', agency!.id)
        .order('created_at', { ascending: false });

      if (!active) return;

      if (result.error) {
        if (result.error.code === '42P01') {
          setHistoryRows([]);
        } else {
          setHistoryError(result.error.message);
        }
      } else {
        setHistoryRows(result.data || []);
      }

      setHistoryLoading(false);
    }

    void loadHistory();

    const channel = supabase
      .channel(`dmh-opportunity-timeline-${agency.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_stage_history',
          filter: `agency_id=eq.${agency.id}`,
        },
        () => setTimelineVersion(value => value + 1),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outreach_activities',
          filter: `agency_id=eq.${agency.id}`,
        },
        () => setTimelineVersion(value => value + 1),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [agency?.id, timelineVersion]);

  useEffect(() => {
    if (!reservation) return;

    const remainingDeposit = Math.max(
      reservation.depositRequired - reservation.depositReceived,
      0,
    );
    const remainingBalance = Math.max(
      reservation.amount -
        reservation.depositReceived -
        reservation.balanceReceived,
      0,
    );

    setDepositAmount(String(remainingDeposit));
    setBalanceAmount(String(remainingBalance));

    if (!winningEmployeeId) {
      setWinningEmployeeId(
        activeOffer?.employeeId || closingEmployees[0]?.id || '',
      );
    }
  }, [
    activeOffer?.employeeId,
    closingEmployees,
    reservation,
    winningEmployeeId,
  ]);

  const negotiationMetrics = useMemo(() => {
    const asking = opportunity?.askingPrice || 0;
    const current = activeOffer?.currentAmount || 0;
    const spread = Math.max(asking - current, 0);
    const discountPercent = asking > 0 ? (spread / asking) * 100 : 0;
    const offerPercent = asking > 0 ? (current / asking) * 100 : 0;

    let recommendation = 'No structured offer recorded.';
    let tone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';

    if (activeOffer) {
      if (current >= asking) {
        recommendation = 'Offer meets or exceeds asking price. Review terms and accept if clean.';
        tone = 'success';
      } else if (offerPercent >= 90) {
        recommendation = 'Strong offer. Consider accepting or issuing a narrow counter.';
        tone = 'success';
      } else if (offerPercent >= 75) {
        recommendation = 'Counteroffer recommended. Preserve value while keeping momentum.';
        tone = 'warning';
      } else {
        recommendation = 'Large pricing gap. Escalate for owner review before accepting.';
        tone = 'danger';
      }
    }

    return { asking, current, spread, discountPercent, offerPercent, recommendation, tone };
  }, [activeOffer, opportunity?.askingPrice]);

  const healthScore = useMemo(() => {
    if (!opportunity) return 0;

    let score = 25;
    if (opportunity.askingPrice > 0) score += 15;
    if (opportunity.probability > 0) score += 15;
    if (opportunity.expectedCloseDate) score += 15;
    if (decisionMaker) score += 10;
    if (nextFollowUp) score += 10;
    if (conversation?.lastInboundAt || conversation?.lastOutboundAt) score += 10;
    if (overdue) score -= 20;

    return Math.max(0, Math.min(100, score));
  }, [
    conversation?.lastInboundAt,
    conversation?.lastOutboundAt,
    decisionMaker,
    nextFollowUp,
    opportunity,
    overdue,
  ]);

  const health =
    healthScore >= 75
      ? { label: 'Healthy', tone: 'success' as const }
      : healthScore >= 50
        ? { label: 'Needs Attention', tone: 'warning' as const }
        : { label: 'At Risk', tone: 'neutral' as const };

  const timeline = useMemo<TimelineEvent[]>(() => {
    if (!opportunity || !agency) return [];

    const stageEvents = historyRows.map((row: any) => {
      const fromStage = row.from_stage || row.previous_stage || row.old_stage;
      const toStage = row.to_stage || row.stage || row.new_stage || opportunity.stage;

      return {
        id: `stage-${row.id}`,
        type: 'stage' as const,
        title: `Stage changed to ${stageLabel(String(toStage))}`,
        detail: fromStage
          ? `${stageLabel(String(fromStage))} → ${stageLabel(String(toStage))}`
          : `Moved into ${stageLabel(String(toStage))}`,
        occurredAt: row.created_at || row.changed_at || opportunity.updatedAt,
        actor: row.changed_by_name || row.employee_name || undefined,
      };
    });

    const activityEvents: TimelineEvent[] = agency.activities.map(activity => ({
      id: `activity-${activity.id}`,
      type:
        activity.type === 'call'
          ? 'call'
          : activity.type === 'email'
            ? 'email'
            : activity.type === 'follow_up'
              ? 'follow_up'
              : 'note',
      title: activity.disposition || 'Agency activity',
      detail: activity.notes || activity.subject || 'Activity recorded',
      occurredAt: activity.occurredAt,
      actor: activity.employeeName,
    }));

    const messageEvents: TimelineEvent[] = conversationMessages.map(message => ({
      id: `message-${message.id}`,
      type: message.direction === 'internal' ? 'note' : 'email',
      title:
        message.direction === 'internal'
          ? 'Internal note added'
          : message.direction === 'inbound'
            ? 'Buyer replied'
            : 'Email sent',
      detail: message.subject
        ? `${message.subject} — ${message.body}`
        : message.body,
      occurredAt: message.createdAt,
    }));

    const offerEvents: TimelineEvent[] = activeOffer
      ? activeOffer.rounds.map(round => ({
          id: `offer-${round.id}`,
          type: 'offer',
          title:
            round.action === 'counter'
              ? `${stageLabel(round.actorRole)} counteroffer`
              : round.action === 'accept'
                ? 'Offer accepted'
                : round.action === 'reject'
                  ? 'Offer rejected'
                  : round.action === 'request_info'
                    ? 'More information requested'
                    : `${stageLabel(round.actorRole)} offer`,
          detail: [
            round.amount == null ? '' : money(round.amount),
            round.terms || '',
            round.message || '',
          ]
            .filter(Boolean)
            .join(' · '),
          occurredAt: round.createdAt,
        }))
      : [];

    const approvalEvents: TimelineEvent[] = requests
      .filter(
        request =>
          request.dealId === opportunity.id ||
          request.entityId === activeOffer?.id ||
          request.agencyId === agency.id,
      )
      .map(request => ({
        id: `approval-${request.id}`,
        type: 'approval',
        title:
          request.status === 'pending'
            ? 'Owner approval requested'
            : `Approval ${stageLabel(request.status)}`,
        detail: [
          request.title,
          request.requestedValue == null
            ? ''
            : `Requested ${money(request.requestedValue)}`,
          request.approvedValue == null
            ? ''
            : `Approved ${money(request.approvedValue)}`,
          request.ownerNotes || request.reason || '',
        ]
          .filter(Boolean)
          .join(' · '),
        occurredAt: request.decidedAt || request.updatedAt || request.createdAt,
      }));

    const closingEvents: TimelineEvent[] = [];

    if (reservation) {
      closingEvents.push({
        id: `reservation-${reservation.id}`,
        type: 'closing',
        title: 'Reservation created',
        detail: `${money(reservation.amount)} reserved for ${reservation.agencyName}.`,
        occurredAt: reservation.createdAt,
      });

      if (reservation.depositReceivedAt) {
        closingEvents.push({
          id: `deposit-${reservation.id}`,
          type: 'closing',
          title: 'Deposit received',
          detail: `${money(reservation.depositReceived)} received${
            reservation.paymentMethod ? ` via ${reservation.paymentMethod}` : ''
          }.`,
          occurredAt: reservation.depositReceivedAt,
        });
      }

      if (reservation.balanceReceivedAt) {
        closingEvents.push({
          id: `balance-${reservation.id}`,
          type: 'closing',
          title: 'Balance received',
          detail: `${money(reservation.balanceReceived)} received${
            reservation.paymentMethod ? ` via ${reservation.paymentMethod}` : ''
          }.`,
          occurredAt: reservation.balanceReceivedAt,
        });
      }
    }

    const revenueEvents: TimelineEvent[] = [];

    if (closedSale) {
      revenueEvents.push({
        id: `sale-${closedSale.id}`,
        type: 'revenue',
        title: 'Sale closed',
        detail: `${money(closedSale.salePrice)} sale · ${money(
          closedSale.netRevenue,
        )} net revenue.`,
        occurredAt: closedSale.closedAt,
        actor: closedSale.winningEmployeeName,
      });
    }

    for (const commission of relatedCommissions) {
      revenueEvents.push({
        id: `commission-${commission.id}`,
        type: 'revenue',
        title: `Commission ${stageLabel(commission.status)}`,
        detail: `${commission.employeeName} · ${money(commission.amount)}${
          commission.rate == null ? '' : ` · ${commission.rate}%`
        }`,
        occurredAt:
          commission.paidAt ||
          commission.approvedAt ||
          commission.createdAt,
        actor: commission.employeeName,
      });
    }

    const createdEvent: TimelineEvent = {
      id: `created-${opportunity.id}`,
      type: 'system',
      title: 'Opportunity created',
      detail: `${opportunity.title} entered the pipeline at ${money(opportunity.askingPrice)}.`,
      occurredAt: opportunity.createdAt,
    };

    return [
      createdEvent,
      ...stageEvents,
      ...offerEvents,
      ...approvalEvents,
      ...closingEvents,
      ...revenueEvents,
      ...activityEvents,
      ...messageEvents,
    ].sort(
      (first, second) =>
        new Date(second.occurredAt).getTime() -
        new Date(first.occurredAt).getTime(),
    );
  }, [
    activeOffer,
    agency,
    closedSale,
    conversationMessages,
    historyRows,
    opportunity,
    relatedCommissions,
    requests,
    reservation,
  ]);

  const filteredTimeline = useMemo(() => {
    const query = timelineSearch.trim().toLowerCase();

    return timeline.filter(event => {
      const matchesFilter =
        timelineFilter === 'all' || event.type === timelineFilter;
      const matchesSearch =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.detail.toLowerCase().includes(query) ||
        (event.actor || '').toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [timeline, timelineFilter, timelineSearch]);

  const groupedTimeline = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();

    for (const event of filteredTimeline) {
      const date = new Date(event.occurredAt);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let label = date.toLocaleDateString();

      if (date.toDateString() === today.toDateString()) label = 'Today';
      if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday';

      groups.set(label, [...(groups.get(label) || []), event]);
    }

    return Array.from(groups.entries());
  }, [filteredTimeline]);

  if (!opportunity || !agency) {
    return (
      <div className="p-10">
        <Card className="p-8">
          <h2 className="text-xl font-semibold">Opportunity not found</h2>
          <p className="mt-2 text-sm text-slate-500">
            This opportunity may have been removed or is unavailable to your account.
          </p>
          <Link
            to={profile?.role === 'owner' ? '/pipeline' : '/employee/pipeline'}
            className="mt-5 inline-flex text-sm font-semibold text-blue-600"
          >
            Return to pipeline
          </Link>
        </Card>
      </div>
    );
  }

  const pipelinePath =
    profile?.role === 'owner' ? '/pipeline' : '/employee/pipeline';

  async function saveInternalNote() {
    if (dealLocked) return;
    const body = note.trim();
    if (!body) return;

    setSavingNote(true);

    try {
      const conversationId =
        conversation?.id || (await ensure(opportunity!.agencyId));

      await addInternalNote(conversationId, body);
      setNote('');
      setTimelineVersion(value => value + 1);
    } finally {
      setSavingNote(false);
    }
  }

  async function resolveConversationId() {
    return conversation?.id || (await ensure(opportunity!.agencyId));
  }

  async function scheduleFollowUp(nextAt?: Date) {
    if (dealLocked) return;
    const selectedDate = nextAt || (followUpAt ? new Date(followUpAt) : null);

    if (!selectedDate || Number.isNaN(selectedDate.getTime())) {
      setWorkflowNotice('Choose a valid follow-up date and time.');
      return;
    }

    setWorkflowBusy(true);
    setWorkflowNotice('');

    try {
      const conversationId = await resolveConversationId();
      const nextFollowUpAt = selectedDate.toISOString();

      await setWorkflow(conversationId, {
        status: followUpStatus,
        priority: followUpPriority,
        nextFollowUpAt,
      });

      await addInternalNote(
        conversationId,
        `Follow-up scheduled for ${selectedDate.toLocaleString()} · ${followUpPriority} priority.`,
      );

      await refreshConversations();
      setWorkflowNotice(`Follow-up scheduled for ${selectedDate.toLocaleString()}.`);
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setWorkflowNotice(
        cause instanceof Error ? cause.message : 'Unable to schedule follow-up.',
      );
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function quickSchedule(days: number) {
    const next = new Date();
    next.setDate(next.getDate() + days);
    next.setHours(10, 0, 0, 0);

    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setFollowUpAt(local);
    await scheduleFollowUp(next);
  }

  async function completeFollowUp() {
    if (dealLocked) return;
    if (!conversation?.id) {
      setWorkflowNotice('No active follow-up exists for this opportunity.');
      return;
    }

    setWorkflowBusy(true);
    setWorkflowNotice('');

    try {
      await setWorkflow(conversation.id, {
        clearFollowUp: true,
        status:
          conversation.status === 'waiting_on_buyer'
            ? 'open'
            : conversation.status,
      });

      await addInternalNote(conversation.id, 'Follow-up marked complete.');
      await refreshConversations();
      setFollowUpAt('');
      setWorkflowNotice('Follow-up completed. The deal is ready for its next action.');
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setWorkflowNotice(
        cause instanceof Error ? cause.message : 'Unable to complete follow-up.',
      );
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function addNegotiationRound(
    action: 'counter' | 'accept' | 'reject' | 'request_info',
  ) {
    if (dealLocked) return;
    if (!activeOffer) {
      setNegotiationNotice('No active offer is linked to this opportunity.');
      return;
    }

    if (action === 'counter' && Number(counterAmount) <= 0) {
      setNegotiationNotice('Enter a valid counteroffer amount.');
      return;
    }

    setNegotiationBusy(true);
    setNegotiationNotice('');

    try {
      const actorRole = profile?.role === 'owner' ? 'owner' : 'employee';

      await addRound(activeOffer.id, {
        actorRole,
        action,
        amount: action === 'counter' ? Number(counterAmount) : undefined,
        terms: counterTerms || undefined,
        message: counterMessage || undefined,
      });

      if (conversation?.id) {
        const actionLabel =
          action === 'counter'
            ? `Counteroffer recorded at ${money(Number(counterAmount))}.`
            : action === 'accept'
              ? 'Offer accepted.'
              : action === 'reject'
                ? 'Offer rejected.'
                : 'Additional buyer information requested.';

        await addInternalNote(conversation.id, actionLabel);
      }

      await Promise.all([refreshOffers(), refreshConversations()]);
      setCounterAmount('');
      setCounterTerms('');
      setCounterMessage('');
      setNegotiationNotice('Negotiation updated.');
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setNegotiationNotice(
        cause instanceof Error ? cause.message : 'Unable to update negotiation.',
      );
    } finally {
      setNegotiationBusy(false);
    }
  }

  async function acceptOfferAndCreateReservation() {
    if (dealLocked) return;

    if (!activeOffer) {
      setNegotiationNotice('No active offer is available.');
      return;
    }

    if (reservation) {
      setNegotiationNotice('A reservation already exists for this deal.');
      return;
    }

    const paymentDeadline = new Date(
      `${reservationDeadline}T17:00:00`,
    ).toISOString();
    const expiresAt = new Date(reservationExpiresAt).toISOString();
    const depositRequired = Number(reservationDeposit || 0);

    if (Number.isNaN(new Date(paymentDeadline).getTime())) {
      setNegotiationNotice('Choose a valid payment deadline.');
      return;
    }

    if (Number.isNaN(new Date(expiresAt).getTime())) {
      setNegotiationNotice('Choose a valid reservation expiration.');
      return;
    }

    if (depositRequired < 0) {
      setNegotiationNotice('Deposit cannot be negative.');
      return;
    }

    setNegotiationBusy(true);
    setNegotiationNotice('');

    try {
      await addRound(activeOffer.id, {
        actorRole: 'owner',
        action: 'accept',
        amount: activeOffer.currentAmount,
        terms: activeOffer.paymentTerms || undefined,
        message: 'Offer accepted and moved into reservation.',
      });

      await reserve(activeOffer.id, {
        paymentDeadline,
        depositRequired,
        reservationExpiresAt: expiresAt,
      });

      if (conversation?.id) {
        await addInternalNote(
          conversation.id,
          `Offer accepted at ${money(
            activeOffer.currentAmount,
          )}. Reservation created with ${money(
            depositRequired,
          )} deposit required.`,
        );
      }

      await Promise.all([
        refreshOffers(),
        refreshClosing(),
        refreshRevenue(),
        refreshConversations(),
      ]);

      setNegotiationNotice(
        'Offer accepted. Reservation and closing workflow created.',
      );
      setTab('closing');
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setNegotiationNotice(
        cause instanceof Error
          ? cause.message
          : 'Unable to accept and reserve this offer.',
      );
    } finally {
      setNegotiationBusy(false);
    }
  }

  async function requestOwnerApproval() {
    if (dealLocked) return;
    if (!activeOffer || !opportunity) {
      setNegotiationNotice('No active offer is available for approval.');
      return;
    }

    setNegotiationBusy(true);
    setNegotiationNotice('');

    try {
      await createApproval({
        requestType: 'below_floor_offer',
        title: `${activeOffer?.agencyName ?? 'Agency'} offer approval`,
        reason: `Buyer offer of ${money(activeOffer.currentAmount)} is ${negotiationMetrics.discountPercent.toFixed(1)}% below the opportunity asking price.`,
        recommendation: negotiationMetrics.recommendation,
        entityType: 'offer',
        entityId: activeOffer.id,
        portfolioId: activeOffer.portfolioId,
        agencyId: activeOffer.agencyId,
        dealId: opportunity.id,
        assignedEmployeeId: activeOffer.employeeId,
        originalValue: opportunity.askingPrice,
        requestedValue: activeOffer.currentAmount,
        financialImpact: negotiationMetrics.spread,
        supportingNotes: counterMessage || activeOffer.conditions || '',
      });

      if (conversation?.id) {
        await addInternalNote(
          conversation.id,
          `Owner approval requested for ${money(activeOffer.currentAmount)} offer.`,
        );
      }

      await Promise.all([refreshApprovals(), refreshConversations()]);
      setNegotiationNotice('Owner approval request created.');
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setNegotiationNotice(
        cause instanceof Error ? cause.message : 'Unable to request owner approval.',
      );
    } finally {
      setNegotiationBusy(false);
    }
  }


  async function recordClosingDeposit() {
    if (dealLocked) return;
    if (!reservation) {
      setClosingNotice('No active reservation is linked to this opportunity.');
      return;
    }

    const amount = Number(depositAmount);

    if (amount <= 0) {
      setClosingNotice('Enter a valid deposit amount.');
      return;
    }

    setClosingBusy(true);
    setClosingNotice('');

    try {
      await recordDeposit(reservation.id, {
        amount,
        paymentMethod,
        receivedAt: new Date(`${paymentDate}T12:00:00`).toISOString(),
        notes: closingNotes || undefined,
      });

      if (conversation?.id) {
        await addInternalNote(
          conversation.id,
          `Deposit recorded: ${money(amount)} via ${paymentMethod}.`,
        );
      }

      await Promise.all([
        refreshClosing(),
        refreshRevenue(),
        refreshConversations(),
      ]);

      setClosingNotice('Deposit recorded successfully.');
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setClosingNotice(
        cause instanceof Error
          ? cause.message
          : 'Unable to record deposit.',
      );
    } finally {
      setClosingBusy(false);
    }
  }

  async function completeClosing() {
    if (!reservation) {
      setClosingNotice('No active reservation is linked to this opportunity.');
      return;
    }

    const amount = Number(balanceAmount);

    if (amount < 0) {
      setClosingNotice('Enter a valid balance amount.');
      return;
    }

    if (!winningEmployeeId) {
      setClosingNotice('Select the winning employee.');
      return;
    }

    setClosingBusy(true);
    setClosingNotice('');

    try {
      await closeSale(reservation.id, {
        balanceAmount: amount,
        paymentMethod,
        paidAt: new Date(`${paymentDate}T12:00:00`).toISOString(),
        winningEmployeeId,
        commissionType,
        commissionValue: Number(commissionValue || 0),
        notes: closingNotes || undefined,
      });

      if (conversation?.id) {
        await addInternalNote(
          conversation.id,
          `Sale closed at ${money(reservation.amount)} via ${paymentMethod}.`,
        );
      }

      if (opportunity) {
        await moveAgency(opportunity.agencyId, 'closed_won');
      }

      await Promise.all([
        refreshClosing(),
        refreshRevenue(),
        refreshConversations(),
        refreshPipeline(),
      ]);

      setClosingNotice(
        'Sale closed. Portfolio, revenue and pipeline were updated automatically.',
      );
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setClosingNotice(
        cause instanceof Error ? cause.message : 'Unable to close sale.',
      );
    } finally {
      setClosingBusy(false);
    }
  }

  async function releaseClosingReservation() {
    if (dealLocked) return;
    if (!reservation) {
      setClosingNotice('No active reservation is linked to this opportunity.');
      return;
    }

    const reason =
      closingNotes.trim() || 'Released from Opportunity Workspace';

    setClosingBusy(true);
    setClosingNotice('');

    try {
      await releaseReservation(reservation.id, reason);

      if (conversation?.id) {
        await addInternalNote(
          conversation.id,
          `Reservation released. Reason: ${reason}`,
        );
      }

      await Promise.all([
        refreshClosing(),
        refreshConversations(),
      ]);

      setClosingNotice('Reservation released.');
      setTimelineVersion(value => value + 1);
    } catch (cause) {
      setClosingNotice(
        cause instanceof Error
          ? cause.message
          : 'Unable to release reservation.',
      );
    } finally {
      setClosingBusy(false);
    }
  }

  function exportTimelineCsv() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ['Timestamp', 'Type', 'Actor', 'Action', 'Details'],
      ...filteredTimeline.map(event => [
        new Date(event.occurredAt).toISOString(),
        event.type,
        event.actor || '',
        event.title,
        event.detail,
      ]),
    ];

    const csv = rows
      .map(row => row.map(value => escape(String(value))).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${(agency ? agency.name : 'agency').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-deal-timeline.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1600px] p-5 md:p-8 lg:p-10">
      <Link
        to={pipelinePath}
        className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={17} className="mr-2" />
        Pipeline
      </Link>

      <header className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone={health.tone}>{health.label}</Pill>
            <Pill tone="blue">{stageLabel(opportunity.stage)}</Pill>
          </div>
          <p className="mt-3 text-sm font-semibold text-blue-600">
            Lifecycle Automation Engine · v2.2.0
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {agency.name}
          </h1>
          <p className="mt-2 text-slate-500">{opportunity.title}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <SecondaryButton onClick={() => setTimelineVersion(value => value + 1)}>
            <RefreshCw size={17} className="mr-2" />
            Refresh timeline
          </SecondaryButton>
          <PrimaryButton>
            <Mail size={17} className="mr-2" />
            Contact buyer
          </PrimaryButton>
        </div>
      </header>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={<CircleDollarSign />} label="Potential value" value={money(opportunity.askingPrice)} />
        <Kpi icon={<TrendingUp />} label="Weighted value" value={money((opportunity.askingPrice * opportunity.probability) / 100)} />
        <Kpi icon={<CalendarClock />} label="Days open" value={String(daysOpen)} />
        <Kpi icon={<CalendarClock />} label="Next follow-up" value={nextFollowUp?.followUpAt ? new Date(nextFollowUp.followUpAt).toLocaleDateString() : 'Not set'} warning={!nextFollowUp} />
        <Kpi icon={<Target />} label="Probability" value={`${opportunity.probability}%`} />
        <Kpi icon={<Gauge />} label="Health score" value={`${healthScore}/100`} warning={healthScore < 50} />
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="p-6">
            <p className="text-sm text-slate-500">Buyer intelligence</p>
            <h2 className="mt-1 text-xl font-semibold">{agency.name}</h2>
            <div className="mt-6 space-y-4">
              <Detail label="Owner" value={agency.ownerEmployeeName} />
              <Detail label="Decision maker" value={decisionMaker ? `${decisionMaker.firstName} ${decisionMaker.lastName}`.trim() : 'Not identified'} />
              <Detail label="Email" value={decisionMaker?.email || agency.generalEmail || 'Not available'} />
              <Detail label="Phone" value={decisionMaker?.phone || agency.phone || 'Not available'} />
              <Detail label="Location" value={[agency.city, agency.state].filter(Boolean).join(', ') || 'Not available'} />
              <Detail label="Website" value={agency.website || 'Not available'} />
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-sm text-slate-500">Current deal</p>
            <div className="mt-5 space-y-4">
              <Detail label="Portfolio" value={portfolio?.name || 'Not assigned'} />
              <Detail label="Asking price" value={money(opportunity.askingPrice)} />
              <Detail label="Probability" value={`${opportunity.probability}%`} />
              <Detail label="Expected close" value={opportunity.expectedCloseDate ? new Date(`${opportunity.expectedCloseDate}T12:00:00`).toLocaleDateString() : 'Not scheduled'} />
              <Detail label="Stage" value={stageLabel(opportunity.stage)} />
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 pt-6">
            <div className="flex gap-6 overflow-x-auto">
              {(
                [
                  ['overview', 'Overview'],
                  ['negotiation', 'Negotiation'],
                  ['closing', 'Closing'],
                  ['communications', 'Communications'],
                  ['documents', 'Documents'],
                  ['tasks', 'Tasks'],
                  ['history', 'History'],
                ] as [Tab, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={`border-b-2 pb-4 text-sm font-semibold ${
                    tab === value
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {tab === 'overview' && (
              <Overview
                opportunity={opportunity}
                latestActivity={latestActivity}
                nextFollowUp={nextFollowUp}
                overdue={overdue}
                timelineCount={timeline.length}
              />
            )}

            {tab === 'negotiation' && (
              <NegotiationPanel
                offer={activeOffer}
                metrics={negotiationMetrics}
                pendingApproval={pendingApproval}
                profileRole={profile?.role}
                counterAmount={counterAmount}
                counterTerms={counterTerms}
                counterMessage={counterMessage}
                busy={negotiationBusy}
                notice={negotiationNotice}
                onCounterAmount={setCounterAmount}
                onCounterTerms={setCounterTerms}
                onCounterMessage={setCounterMessage}
                reservation={reservation}
                dealLocked={dealLocked}
                reservationDeadline={reservationDeadline}
                reservationExpiresAt={reservationExpiresAt}
                reservationDeposit={reservationDeposit}
                onReservationDeadline={setReservationDeadline}
                onReservationExpiresAt={setReservationExpiresAt}
                onReservationDeposit={setReservationDeposit}
                onAction={addNegotiationRound}
                onAcceptAndReserve={acceptOfferAndCreateReservation}
                onRequestApproval={requestOwnerApproval}
              />
            )}
            {tab === 'closing' && (
              <ClosingPanel
                reservation={reservation}
                closedSale={closedSale}
                offer={activeOffer}
                opportunity={opportunity}
                profileRole={profile?.role}
                employees={closingEmployees}
                depositAmount={depositAmount}
                balanceAmount={balanceAmount}
                paymentMethod={paymentMethod}
                paymentDate={paymentDate}
                winningEmployeeId={winningEmployeeId}
                commissionType={commissionType}
                commissionValue={commissionValue}
                notes={closingNotes}
                busy={closingBusy}
                notice={closingNotice}
                dealLocked={dealLocked}
                onDepositAmount={setDepositAmount}
                onBalanceAmount={setBalanceAmount}
                onPaymentMethod={setPaymentMethod}
                onPaymentDate={setPaymentDate}
                onWinningEmployee={setWinningEmployeeId}
                onCommissionType={setCommissionType}
                onCommissionValue={setCommissionValue}
                onNotes={setClosingNotes}
                onRecordDeposit={recordClosingDeposit}
                onCloseSale={completeClosing}
                onRelease={releaseClosingReservation}
              />
            )}
            {tab === 'communications' && <Communications rows={conversationMessages} />}
            {tab === 'documents' && <Documents portfolioName={portfolio?.name} />}
            {tab === 'tasks' && (
              <Tasks
                hasDecisionMaker={Boolean(decisionMaker)}
                hasFollowUp={Boolean(nextFollowUp)}
                hasCloseDate={Boolean(opportunity.expectedCloseDate)}
                hasPortfolio={Boolean(portfolio)}
              />
            )}
            {tab === 'history' && (
              <Timeline
                groups={groupedTimeline}
                loading={historyLoading}
                error={historyError}
                search={timelineSearch}
                filter={timelineFilter}
                expandedId={expandedTimelineId}
                canExport={profile?.role === 'owner'}
                total={timeline.length}
                visible={filteredTimeline.length}
                onSearch={setTimelineSearch}
                onFilter={setTimelineFilter}
                onToggle={id =>
                  setExpandedTimelineId(current => (current === id ? null : id))
                }
                onExport={exportTimelineCsv}
              />
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <p className="text-sm text-slate-500">Recommended next action</p>
            <div className="mt-4 flex items-start gap-3">
              {overdue || !nextFollowUp ? (
                <AlertTriangle className="mt-0.5 text-amber-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 text-emerald-600" />
              )}
              <div>
                <p className="font-semibold">
                  {overdue
                    ? 'Reschedule expected close'
                    : !nextFollowUp
                      ? 'Set the next follow-up'
                      : 'Continue active deal management'}
                </p>
                {effectiveFollowUpAt && (
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-blue-600">
                    <Clock3 size={14} />
                    {new Date(effectiveFollowUpAt).toLocaleString()}
                  </p>
                )}
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {overdue
                    ? 'The expected close date has passed. Update the date or resolve the opportunity.'
                    : !nextFollowUp
                      ? 'This open opportunity has no scheduled next action.'
                      : 'The deal has ownership, timing and a scheduled next action.'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Follow-Up Action Center</p>
                <h3 className="mt-1 text-lg font-semibold">
                  {effectiveFollowUpAt ? 'Manage next action' : 'Schedule next action'}
                </h3>
              </div>
              <Pill
                tone={
                  effectiveFollowUpAt &&
                  new Date(effectiveFollowUpAt).getTime() < Date.now()
                    ? 'danger'
                    : effectiveFollowUpAt
                      ? 'blue'
                      : 'warning'
                }
              >
                {effectiveFollowUpAt
                  ? new Date(effectiveFollowUpAt).getTime() < Date.now()
                    ? 'overdue'
                    : 'scheduled'
                  : 'not set'}
              </Pill>
            </div>

            {workflowNotice && (
              <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm text-blue-800">
                {workflowNotice}
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <label className="text-xs font-semibold text-slate-500">
                Date and time
                <input
                  type="datetime-local"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  value={followUpAt}
                  onChange={event => setFollowUpAt(event.target.value)}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500">
                  Priority
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    value={followUpPriority}
                    onChange={event => setFollowUpPriority(event.target.value)}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-500">
                  Conversation status
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                    value={followUpStatus}
                    onChange={event => setFollowUpStatus(event.target.value)}
                  >
                    <option value="open">Open</option>
                    <option value="waiting_on_buyer">Waiting on buyer</option>
                    <option value="pending_internal">Pending internal</option>
                  </select>
                </label>
              </div>

              <PrimaryButton
                className="w-full"
                disabled={dealLocked || workflowBusy || !followUpAt}
                onClick={() => void scheduleFollowUp()}
              >
                <CalendarClock size={17} className="mr-2" />
                {workflowBusy ? 'Saving…' : 'Schedule follow-up'}
              </PrimaryButton>

              <div className="grid grid-cols-3 gap-2">
                <SecondaryButton
                  disabled={workflowBusy}
                  onClick={() => void quickSchedule(1)}
                >
                  Tomorrow
                </SecondaryButton>
                <SecondaryButton
                  disabled={workflowBusy}
                  onClick={() => void quickSchedule(3)}
                >
                  3 days
                </SecondaryButton>
                <SecondaryButton
                  disabled={workflowBusy}
                  onClick={() => void quickSchedule(7)}
                >
                  7 days
                </SecondaryButton>
              </div>

              {effectiveFollowUpAt && (
                <SecondaryButton
                  className="w-full text-emerald-700"
                  disabled={workflowBusy}
                  onClick={() => void completeFollowUp()}
                >
                  <CheckCircle2 size={17} className="mr-2" />
                  Mark follow-up complete
                </SecondaryButton>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-sm text-slate-500">Internal note</p>
            <textarea
              className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-500"
              placeholder={dealLocked ? "Closed deals are read-only." : "Add context for the sales team..."}
              value={note}
              disabled={dealLocked}
              onChange={event => setNote(event.target.value)}
            />
            <PrimaryButton
              className="mt-3 w-full"
              disabled={dealLocked || savingNote || !note.trim()}
              onClick={() => void saveInternalNote()}
            >
              <MessageSquare size={17} className="mr-2" />
              {savingNote ? 'Saving…' : 'Add internal note'}
            </PrimaryButton>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <p className="text-sm text-slate-500">Unified activity stream</p>
              <h3 className="mt-1 text-lg font-semibold">Deal feed</h3>
            </div>

            {!timeline.length ? (
              <p className="p-6 text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {timeline.slice(0, 6).map(event => (
                  <div key={event.id} className="p-5">
                    <div className="flex items-start gap-3">
                      <TimelineIcon type={event.type} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{event.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                          {event.detail}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          {new Date(event.occurredAt).toLocaleString()}
                          {event.actor ? ` · ${event.actor}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, warning = false }: { icon: ReactNode; label: string; value: string; warning?: boolean }) {
  return (
    <Card className="p-5">
      <div className={warning ? 'text-amber-600' : 'text-blue-600'}>{icon}</div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function Overview({ opportunity, latestActivity, nextFollowUp, overdue, timelineCount }: any) {
  return (
    <div>
      <p className="text-sm text-slate-500">Deal overview</p>
      <h3 className="mt-1 text-xl font-semibold">Current operating position</h3>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <OverviewCard label="Pipeline stage" value={stageLabel(opportunity.stage)} />
        <OverviewCard label="Expected close" value={opportunity.expectedCloseDate ? new Date(`${opportunity.expectedCloseDate}T12:00:00`).toLocaleDateString() : 'Not scheduled'} warning={overdue} />
        <OverviewCard label="Latest activity" value={latestActivity?.disposition || 'No activity'} />
        <OverviewCard label="Next follow-up" value={nextFollowUp?.followUpAt ? new Date(nextFollowUp.followUpAt).toLocaleString() : 'Not scheduled'} warning={!nextFollowUp} />
        <OverviewCard label="Timeline events" value={String(timelineCount)} />
      </div>
    </div>
  );
}

function OverviewCard({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${warning ? 'bg-amber-50' : 'bg-slate-50'}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function ClosingPanel({
  reservation,
  closedSale,
  offer,
  opportunity,
  profileRole,
  employees,
  depositAmount,
  balanceAmount,
  paymentMethod,
  paymentDate,
  winningEmployeeId,
  commissionType,
  commissionValue,
  notes,
  busy,
  notice,
  dealLocked,
  onDepositAmount,
  onBalanceAmount,
  onPaymentMethod,
  onPaymentDate,
  onWinningEmployee,
  onCommissionType,
  onCommissionValue,
  onNotes,
  onRecordDeposit,
  onCloseSale,
  onRelease,
}: any) {
  if (closedSale) {
    return (
      <div>
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-5">
          <CheckCircle2 className="mt-0.5 text-emerald-600" size={22} />
          <div>
            <p className="font-semibold text-emerald-900">Deal closed</p>
            <p className="mt-1 text-sm text-emerald-700">
              Closed for {money(closedSale.salePrice)} on{' '}
              {new Date(closedSale.closedAt).toLocaleDateString()}.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard label="Sale price" value={money(closedSale.salePrice)} />
          <OverviewCard label="Acquisition cost" value={money(closedSale.acquisitionCost)} />
          <OverviewCard label="Commission" value={money(closedSale.commissionTotal)} />
          <OverviewCard label="Net revenue" value={money(closedSale.netRevenue)} />
        </div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="grid min-h-72 place-items-center text-center">
        <div>
          <Landmark className="mx-auto text-blue-600" size={36} />
          <h3 className="mt-4 text-lg font-semibold">No reservation yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Accept an offer and create a reservation through the existing
            negotiation workflow. The closing checklist and funding controls
            will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  const depositComplete =
    reservation.depositRequired <= 0 ||
    reservation.depositReceived >= reservation.depositRequired;
  const balanceRemaining = Math.max(
    reservation.amount -
      reservation.depositReceived -
      reservation.balanceReceived,
    0,
  );
  const paidComplete = reservation.status === 'paid' || balanceRemaining <= 0;
  const expired =
    reservation.reservationExpiresAt &&
    new Date(reservation.reservationExpiresAt).getTime() < Date.now();

  const checklist = [
    ['Offer accepted', Boolean(offer && ['accepted', 'reserved', 'closed'].includes(offer.status))],
    ['Reservation created', true],
    ['Deposit received', depositComplete],
    ['Balance received', paidComplete],
    ['Payment method recorded', Boolean(reservation.paymentMethod)],
    ['Sale closed', false],
  ] as const;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">Closing intelligence</p>
          <h3 className="mt-1 text-xl font-semibold">Funding and release command</h3>
        </div>
        <Pill tone={expired ? 'danger' : reservation.status === 'paid' ? 'success' : 'blue'}>
          {expired ? 'expired' : stageLabel(reservation.status)}
        </Pill>
      </div>

      {notice && (
        <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Accepted amount" value={money(reservation.amount)} />
        <OverviewCard label="Deposit required" value={money(reservation.depositRequired)} />
        <OverviewCard label="Deposit received" value={money(reservation.depositReceived)} />
        <OverviewCard label="Balance remaining" value={money(balanceRemaining)} warning={balanceRemaining > 0} />
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <div>
          <p className="text-sm text-slate-500">Closing checklist</p>
          <div className="mt-3 space-y-3">
            {checklist.map(([label, complete]) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                {complete ? (
                  <CheckCircle2 className="text-emerald-600" size={19} />
                ) : (
                  <CalendarClock className="text-slate-400" size={19} />
                )}
                <p className="text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400">Payment deadline</p>
            <p className="mt-1 font-semibold">
              {new Date(`${reservation.paymentDeadline}T12:00:00`).toLocaleDateString()}
            </p>
            {reservation.reservationExpiresAt && (
              <>
                <p className="mt-4 text-xs text-slate-400">Reservation expires</p>
                <p className={`mt-1 font-semibold ${expired ? 'text-red-700' : ''}`}>
                  {new Date(reservation.reservationExpiresAt).toLocaleString()}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <p className="font-semibold">
            {profileRole === 'owner' ? 'Owner closing controls' : 'Closing status'}
          </p>

          {profileRole !== 'owner' || dealLocked ? (
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {dealLocked
                ? 'This deal is closed and read-only.'
                : 'Employees can monitor funding progress. Only the owner can record money, release reservations, or close the sale.'}
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  min="0"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Deposit amount"
                  value={depositAmount}
                  onChange={event => onDepositAmount(event.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Balance amount"
                  value={balanceAmount}
                  onChange={event => onBalanceAmount(event.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  value={paymentMethod}
                  onChange={event => onPaymentMethod(event.target.value)}
                >
                  <option value="wire">Wire</option>
                  <option value="ach">ACH</option>
                  <option value="check">Check</option>
                  <option value="cashier_check">Cashier's check</option>
                </select>

                <input
                  type="date"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  value={paymentDate}
                  onChange={event => onPaymentDate(event.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                value={winningEmployeeId}
                onChange={event => onWinningEmployee(event.target.value)}
              >
                <option value="">Select winning employee</option>
                {employees.map((employee: any) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  value={commissionType}
                  onChange={event => onCommissionType(event.target.value)}
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat</option>
                </select>
                <input
                  type="number"
                  min="0"
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  placeholder="Commission value"
                  value={commissionValue}
                  onChange={event => onCommissionValue(event.target.value)}
                />
              </div>

              <textarea
                className="min-h-24 rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-500"
                placeholder="Closing notes or release reason"
                value={notes}
                onChange={event => onNotes(event.target.value)}
              />

              {!depositComplete && (
                <PrimaryButton disabled={busy || Number(depositAmount) <= 0} onClick={() => void onRecordDeposit()}>
                  <CreditCard size={17} className="mr-2" />
                  Record deposit
                </PrimaryButton>
              )}

              <PrimaryButton disabled={busy || !winningEmployeeId} onClick={() => void onCloseSale()}>
                <Landmark size={17} className="mr-2" />
                Close sale
              </PrimaryButton>

              <SecondaryButton className="text-red-700" disabled={busy} onClick={() => void onRelease()}>
                Release reservation
              </SecondaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NegotiationPanel({
  offer,
  metrics,
  pendingApproval,
  profileRole,
  counterAmount,
  counterTerms,
  counterMessage,
  busy,
  notice,
  reservation,
  dealLocked,
  reservationDeadline,
  reservationExpiresAt,
  reservationDeposit,
  onReservationDeadline,
  onReservationExpiresAt,
  onReservationDeposit,
  onCounterAmount,
  onCounterTerms,
  onCounterMessage,
  onAction,
  onAcceptAndReserve,
  onRequestApproval,
}: any) {
  if (!offer) {
    return (
      <div className="grid min-h-72 place-items-center text-center">
        <div>
          <HandCoins className="mx-auto text-blue-600" size={34} />
          <h3 className="mt-4 text-lg font-semibold">No structured offer yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Record the buyer offer through the existing offer workflow. Once linked
            to this agency and portfolio, the full offer ladder will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">Negotiation intelligence</p>
          <h3 className="mt-1 text-xl font-semibold">Offer ladder and decision support</h3>
        </div>
        <Pill
          tone={
            offer.status === 'accepted'
              ? 'success'
              : offer.status === 'rejected'
                ? 'danger'
                : 'blue'
          }
        >
          {stageLabel(offer.status)}
        </Pill>
      </div>

      {notice && (
        <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Asking price" value={money(metrics.asking)} />
        <OverviewCard label="Current offer" value={money(metrics.current)} />
        <OverviewCard label="Pricing spread" value={money(metrics.spread)} warning={metrics.spread > 0} />
        <OverviewCard label="Offer vs. asking" value={`${metrics.offerPercent.toFixed(1)}%`} />
      </div>

      <div className="mt-6 rounded-2xl bg-slate-50 p-5">
        <div className="flex items-start gap-3">
          <Gavel className="mt-0.5 shrink-0 text-blue-600" size={20} />
          <div>
            <p className="font-semibold">Recommended action</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {metrics.recommendation}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7">
        <p className="text-sm text-slate-500">Offer ladder</p>
        <div className="mt-3 space-y-3">
          {offer.rounds.map((round: any) => (
            <div key={round.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    Round {round.roundNumber} · {stageLabel(round.actorRole)} {stageLabel(round.action)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(round.createdAt).toLocaleString()}
                  </p>
                </div>
                {round.amount != null && (
                  <p className="text-lg font-semibold">{money(round.amount)}</p>
                )}
              </div>
              {round.terms && <p className="mt-3 text-sm text-slate-600">{round.terms}</p>}
              {round.message && <p className="mt-2 text-sm text-slate-500">{round.message}</p>}
            </div>
          ))}
        </div>
      </div>

      {dealLocked && (
        <div className="mt-7 rounded-2xl bg-slate-100 p-5 text-sm font-semibold text-slate-600">
          This deal is closed and read-only.
        </div>
      )}

      {!dealLocked && !['accepted', 'rejected', 'closed'].includes(offer.status) && (
        <div className="mt-7 rounded-2xl border border-slate-200 p-5">
          <p className="font-semibold">Record next negotiation action</p>
          <div className="mt-4 grid gap-3">
            <input
              type="number"
              min="0"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              placeholder="Counteroffer amount"
              value={counterAmount}
              onChange={event => onCounterAmount(event.target.value)}
            />
            <input
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
              placeholder="Terms"
              value={counterTerms}
              onChange={event => onCounterTerms(event.target.value)}
            />
            <textarea
              className="min-h-24 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-500"
              placeholder="Negotiation note"
              value={counterMessage}
              onChange={event => onCounterMessage(event.target.value)}
            />

            <PrimaryButton disabled={busy || Number(counterAmount) <= 0} onClick={() => void onAction('counter')}>
              <HandCoins size={17} className="mr-2" />
              {busy ? 'Saving…' : 'Record counteroffer'}
            </PrimaryButton>

            <div className="grid gap-2 sm:grid-cols-2">
              <SecondaryButton disabled={busy} onClick={() => void onAction('request_info')}>
                Request information
              </SecondaryButton>

              {profileRole === 'owner' ? (
                <div className="sm:col-span-2 grid gap-3">
                  {!reservation && (
                    <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
                      <label className="text-xs font-semibold text-slate-500">
                        Payment deadline
                        <input
                          type="date"
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={reservationDeadline}
                          onChange={event =>
                            onReservationDeadline(event.target.value)
                          }
                        />
                      </label>

                      <label className="text-xs font-semibold text-slate-500">
                        Reservation expires
                        <input
                          type="datetime-local"
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={reservationExpiresAt}
                          onChange={event =>
                            onReservationExpiresAt(event.target.value)
                          }
                        />
                      </label>

                      <label className="text-xs font-semibold text-slate-500">
                        Deposit required
                        <input
                          type="number"
                          min="0"
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={reservationDeposit}
                          onChange={event =>
                            onReservationDeposit(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <PrimaryButton
                      disabled={busy || Boolean(reservation)}
                      onClick={() => void onAcceptAndReserve()}
                    >
                      {reservation ? 'Reservation created' : 'Accept & reserve'}
                    </PrimaryButton>
                    <SecondaryButton
                      disabled={busy}
                      onClick={() => void onAction('reject')}
                    >
                      Reject
                    </SecondaryButton>
                  </div>
                </div>
              ) : (
                <SecondaryButton
                  disabled={busy || Boolean(pendingApproval)}
                  onClick={() => void onRequestApproval()}
                >
                  {pendingApproval ? 'Approval pending' : 'Request owner approval'}
                </SecondaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Communications({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No conversation activity yet.</p>;

  return (
    <div className="space-y-4">
      {rows.map(row => (
        <div key={row.id} className="rounded-2xl bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              {row.direction === 'inbound' ? 'Buyer reply' : row.direction === 'internal' ? 'Internal note' : 'Outbound message'}
            </p>
            <p className="text-xs text-slate-400">{new Date(row.createdAt).toLocaleString()}</p>
          </div>
          {row.subject && <p className="mt-3 text-sm font-semibold">{row.subject}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{row.body}</p>
        </div>
      ))}
    </div>
  );
}

function Documents({ portfolioName }: { portfolioName?: string }) {
  const rows = [
    { name: portfolioName || 'Portfolio file', status: portfolioName ? 'Available' : 'Missing' },
    { name: 'NDA', status: 'Not attached' },
    { name: 'Purchase agreement', status: 'Not attached' },
    { name: 'Wire instructions', status: 'Not attached' },
  ];

  return (
    <div className="divide-y divide-slate-100">
      {rows.map(row => (
        <div key={row.name} className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <FileText className="text-slate-400" size={19} />
            <p className="text-sm font-semibold">{row.name}</p>
          </div>
          <p className="text-xs text-slate-500">{row.status}</p>
        </div>
      ))}
    </div>
  );
}

function Tasks({ hasDecisionMaker, hasFollowUp, hasCloseDate, hasPortfolio }: any) {
  const rows = [
    ['Identify decision maker', hasDecisionMaker],
    ['Assign portfolio', hasPortfolio],
    ['Schedule next follow-up', hasFollowUp],
    ['Set expected close date', hasCloseDate],
  ] as const;

  return (
    <div className="space-y-3">
      {rows.map(([label, complete]) => (
        <div key={label} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
          {complete ? <CheckCircle2 className="text-emerald-600" size={19} /> : <AlertTriangle className="text-amber-600" size={19} />}
          <p className="text-sm font-semibold">{label}</p>
        </div>
      ))}
    </div>
  );
}

function Timeline({
  groups,
  loading,
  error,
  search,
  filter,
  expandedId,
  canExport,
  total,
  visible,
  onSearch,
  onFilter,
  onToggle,
  onExport,
}: {
  groups: [string, TimelineEvent[]][];
  loading: boolean;
  error: string;
  search: string;
  filter: 'all' | TimelineEvent['type'];
  expandedId: string | null;
  canExport: boolean;
  total: number;
  visible: number;
  onSearch: (value: string) => void;
  onFilter: (value: 'all' | TimelineEvent['type']) => void;
  onToggle: (id: string) => void;
  onExport: () => void;
}) {
  const filters: Array<{
    value: 'all' | TimelineEvent['type'];
    label: string;
  }> = [
    { value: 'all', label: 'All' },
    { value: 'email', label: 'Emails' },
    { value: 'call', label: 'Calls' },
    { value: 'offer', label: 'Offers' },
    { value: 'approval', label: 'Approvals' },
    { value: 'closing', label: 'Closing' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div>
      <div className="border-b border-slate-100 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Permanent deal audit trail</p>
            <h3 className="mt-1 text-xl font-semibold">Timeline intelligence</h3>
            <p className="mt-2 text-xs text-slate-400">
              Showing {visible} of {total} events
            </p>
          </div>

          {canExport && (
            <SecondaryButton onClick={onExport} disabled={visible === 0}>
              <Download size={16} className="mr-2" />
              Export CSV
            </SecondaryButton>
          )}
        </div>

        <div className="relative mt-5">
          <Search
            size={17}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500"
            placeholder="Search deal history..."
            value={search}
            onChange={event => onSearch(event.target.value)}
          />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map(item => (
            <button
              key={item.value}
              onClick={() => onFilter(item.value)}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold transition ${
                filter === item.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-sm text-slate-500">Loading timeline…</p>
      ) : error ? (
        <p className="py-8 text-sm text-red-700">{error}</p>
      ) : !groups.length ? (
        <div className="grid min-h-56 place-items-center text-center">
          <div>
            <History className="mx-auto text-slate-300" size={32} />
            <p className="mt-3 font-semibold">No matching events</p>
            <p className="mt-1 text-sm text-slate-500">
              Change the filter or search phrase to view more history.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-7 space-y-8">
          {groups.map(([label, events]) => (
            <section key={label}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {label}
              </p>

              <div className="relative space-y-4 border-l border-slate-200 pl-7">
                {events.map(event => {
                  const expanded = expandedId === event.id;

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onToggle(event.id)}
                      className="relative block w-full rounded-2xl p-4 text-left transition hover:bg-slate-50"
                    >
                      <span className="absolute -left-[33px] top-5 grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-slate-200">
                        <TimelineIcon type={event.type} compact />
                      </span>

                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{event.title}</p>
                            <Pill tone="neutral">{stageLabel(event.type)}</Pill>
                          </div>

                          <p
                            className={`mt-2 text-sm leading-6 text-slate-500 ${
                              expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                            }`}
                          >
                            {event.detail || 'No additional details.'}
                          </p>

                          {expanded && (
                            <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2">
                              <div>
                                <p className="text-slate-400">Event ID</p>
                                <p className="mt-1 break-all font-semibold text-slate-700">
                                  {event.id}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-400">Actor</p>
                                <p className="mt-1 font-semibold text-slate-700">
                                  {event.actor || 'System'}
                                </p>
                              </div>
                              <div className="sm:col-span-2">
                                <p className="text-slate-400">Exact timestamp</p>
                                <p className="mt-1 font-semibold text-slate-700">
                                  {new Date(event.occurredAt).toISOString()}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="shrink-0 text-xs text-slate-400">
                          {new Date(event.occurredAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineIcon({ type, compact = false }: { type: TimelineEvent['type']; compact?: boolean }) {
  const size = compact ? 11 : 18;
  const className = compact ? 'text-blue-600' : 'mt-0.5 shrink-0 text-blue-600';

  if (type === 'offer') return <HandCoins size={size} className={className} />;
  if (type === 'approval') return <Gavel size={size} className={className} />;
  if (type === 'closing') return <Landmark size={size} className={className} />;
  if (type === 'revenue') return <CircleDollarSign size={size} className={className} />;
  if (type === 'call') return <Phone size={size} className={className} />;
  if (type === 'email') return <Mail size={size} className={className} />;
  if (type === 'stage') return <TrendingUp size={size} className={className} />;
  if (type === 'follow_up') return <CalendarClock size={size} className={className} />;
  if (type === 'system') return <History size={size} className={className} />;
  return <MessageSquare size={size} className={className} />;
}
