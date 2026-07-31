import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Gauge,
  Gavel,
  HandCoins,
  History,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../components/Primitives';
import { supabase } from '../lib/supabase';
import { useAgencyStore } from '../store/AgencyStore';
import { useApprovalStore } from '../store/ApprovalStore';
import { useConversationStore } from '../store/ConversationStore';
import { usePipelineStore } from '../store/PipelineStore';
import { useNegotiationStore } from '../store/NegotiationStore';
import { usePortfolioStore } from '../store/PortfolioStore';

type Tab = 'overview' | 'negotiation' | 'communications' | 'documents' | 'tasks' | 'history';

type TimelineEvent = {
  id: string;
  type: 'stage' | 'offer' | 'email' | 'call' | 'note' | 'follow_up' | 'system';
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
  const { opportunities } = usePipelineStore();
  const { offers, addRound, refresh: refreshOffers } = useNegotiationStore();
  const { requests, create: createApproval, refresh: refreshApprovals } = useApprovalStore();
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

    const createdEvent: TimelineEvent = {
      id: `created-${opportunity.id}`,
      type: 'system',
      title: 'Opportunity created',
      detail: `${opportunity.title} entered the pipeline at ${money(opportunity.askingPrice)}.`,
      occurredAt: opportunity.createdAt,
    };

    return [createdEvent, ...stageEvents, ...offerEvents, ...activityEvents, ...messageEvents].sort(
      (first, second) =>
        new Date(second.occurredAt).getTime() -
        new Date(first.occurredAt).getTime(),
    );
  }, [activeOffer, agency, conversationMessages, historyRows, opportunity]);

  const groupedTimeline = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();

    for (const event of timeline) {
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
  }, [timeline]);

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

  async function requestOwnerApproval() {
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
            Negotiation Intelligence Engine · v1.9.0
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
                onAction={addNegotiationRound}
                onRequestApproval={requestOwnerApproval}
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
                disabled={workflowBusy || !followUpAt}
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
              placeholder="Add context for the sales team..."
              value={note}
              onChange={event => setNote(event.target.value)}
            />
            <PrimaryButton
              className="mt-3 w-full"
              disabled={savingNote || !note.trim()}
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
  onCounterAmount,
  onCounterTerms,
  onCounterMessage,
  onAction,
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

      {!['accepted', 'rejected', 'closed'].includes(offer.status) && (
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
                <div className="grid grid-cols-2 gap-2">
                  <SecondaryButton disabled={busy} onClick={() => void onAction('accept')}>
                    Accept
                  </SecondaryButton>
                  <SecondaryButton disabled={busy} onClick={() => void onAction('reject')}>
                    Reject
                  </SecondaryButton>
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

function Timeline({ groups, loading, error }: { groups: [string, TimelineEvent[]][]; loading: boolean; error: string }) {
  if (loading) return <p className="text-sm text-slate-500">Loading timeline…</p>;
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!groups.length) return <p className="text-sm text-slate-500">No timeline activity recorded yet.</p>;

  return (
    <div className="space-y-8">
      {groups.map(([label, events]) => (
        <section key={label}>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <div className="relative space-y-5 border-l border-slate-200 pl-7">
            {events.map(event => (
              <div key={event.id} className="relative">
                <span className="absolute -left-[33px] top-1 grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-slate-200">
                  <TimelineIcon type={event.type} compact />
                </span>
                <p className="text-sm font-semibold">{event.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{event.detail}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {event.actor ? ` · ${event.actor}` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TimelineIcon({ type, compact = false }: { type: TimelineEvent['type']; compact?: boolean }) {
  const size = compact ? 11 : 18;
  const className = compact ? 'text-blue-600' : 'mt-0.5 shrink-0 text-blue-600';

  if (type === 'offer') return <HandCoins size={size} className={className} />;
  if (type === 'call') return <Phone size={size} className={className} />;
  if (type === 'email') return <Mail size={size} className={className} />;
  if (type === 'stage') return <TrendingUp size={size} className={className} />;
  if (type === 'follow_up') return <CalendarClock size={size} className={className} />;
  if (type === 'system') return <History size={size} className={className} />;
  return <MessageSquare size={size} className={className} />;
}
