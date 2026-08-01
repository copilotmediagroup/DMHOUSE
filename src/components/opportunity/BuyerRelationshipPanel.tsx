import { useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  HeartPulse,
  History,
  MessageSquare,
  ShoppingBag,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { Card, Pill } from '../Primitives';
import { useAgencyStore } from '../../store/AgencyStore';
import { useClosingStore } from '../../store/ClosingStore';
import { useConversationStore } from '../../store/ConversationStore';
import { useNegotiationStore } from '../../store/NegotiationStore';
import { usePipelineStore } from '../../store/PipelineStore';

const DAY = 86400000;

const money = (value = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
        new Date(value),
      )
    : 'Not available';

export default function BuyerRelationshipPanel() {
  const { opportunityId } = useParams();
  const { opportunities } = usePipelineStore();
  const { agencies } = useAgencyStore();
  const { offers } = useNegotiationStore();
  const { sales, reservations } = useClosingStore();
  const { conversations, messages } = useConversationStore();

  const opportunity = opportunities.find(item => item.id === opportunityId);
  const agency = agencies.find(item => item.id === opportunity?.agencyId);

  const buyerSales = useMemo(
    () =>
      sales
        .filter(item => item.agencyId === agency?.id)
        .sort(
          (first, second) =>
            new Date(second.closedAt).getTime() -
            new Date(first.closedAt).getTime(),
        ),
    [agency?.id, sales],
  );

  const buyerOffers = useMemo(
    () =>
      offers
        .filter(item => item.agencyId === agency?.id)
        .sort(
          (first, second) =>
            new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime(),
        ),
    [agency?.id, offers],
  );

  const buyerConversations = useMemo(
    () => conversations.filter(item => item.agencyId === agency?.id),
    [agency?.id, conversations],
  );

  const buyerMessages = useMemo(() => {
    const ids = new Set(buyerConversations.map(item => item.id));
    return messages.filter(item => ids.has(item.conversationId));
  }, [buyerConversations, messages]);

  const buyerReservations = useMemo(
    () => reservations.filter(item => item.agencyId === agency?.id),
    [agency?.id, reservations],
  );

  const intelligence = useMemo(() => {
    const lifetimeRevenue = buyerSales.reduce(
      (total, item) => total + item.salePrice,
      0,
    );
    const lifetimeProfit = buyerSales.reduce(
      (total, item) => total + item.netRevenue,
      0,
    );
    const averageDealSize = buyerSales.length
      ? lifetimeRevenue / buyerSales.length
      : 0;

    const acceptedOffers = buyerOffers.filter(item =>
      ['accepted', 'reserved', 'closed'].includes(item.status),
    ).length;
    const decidedOffers = buyerOffers.filter(item =>
      ['accepted', 'reserved', 'closed', 'rejected'].includes(item.status),
    ).length;
    const winRate = decidedOffers ? (acceptedOffers / decidedOffers) * 100 : 0;

    const inbound = buyerMessages.filter(
      item => item.direction === 'inbound',
    ).length;
    const outbound = buyerMessages.filter(
      item => item.direction === 'outbound',
    ).length;
    const responseRate = outbound
      ? Math.min((inbound / outbound) * 100, 100)
      : 0;

    const lastSale = buyerSales[0];
    const lastContactAt = [
      ...buyerMessages.map(item => item.createdAt),
      ...(agency?.activities.map(item => item.occurredAt) || []),
    ]
      .filter(Boolean)
      .sort(
        (first, second) =>
          new Date(second).getTime() - new Date(first).getTime(),
      )[0];

    const daysSincePurchase = lastSale
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(lastSale.closedAt).getTime()) / DAY,
          ),
        )
      : null;

    const daysSinceContact = lastContactAt
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(lastContactAt).getTime()) / DAY),
        )
      : null;

    const portfolioCounts = new Map<string, number>();
    for (const sale of buyerSales) {
      portfolioCounts.set(
        sale.portfolioName,
        (portfolioCounts.get(sale.portfolioName) || 0) + 1,
      );
    }
    for (const offer of buyerOffers) {
      portfolioCounts.set(
        offer.portfolioName,
        (portfolioCounts.get(offer.portfolioName) || 0) + 1,
      );
    }

    const favoritePortfolio =
      Array.from(portfolioCounts.entries()).sort(
        (first, second) => second[1] - first[1],
      )[0]?.[0] || 'Not enough history';

    const closedDates = buyerSales
      .map(item => new Date(item.closedAt).getTime())
      .sort((first, second) => first - second);

    const purchaseIntervals =
      closedDates.length > 1
        ? closedDates
            .slice(1)
            .map((value, index) => (value - closedDates[index]) / DAY)
        : [];

    const averagePurchaseInterval = purchaseIntervals.length
      ? purchaseIntervals.reduce((total, value) => total + value, 0) /
        purchaseIntervals.length
      : null;

    const predictedNextPurchase =
      lastSale && averagePurchaseInterval
        ? new Date(
            new Date(lastSale.closedAt).getTime() +
              averagePurchaseInterval * DAY,
          ).toISOString()
        : undefined;

    let healthScore = 35;
    if (buyerSales.length > 0) healthScore += 20;
    if (buyerSales.length >= 2) healthScore += 10;
    if (responseRate >= 50) healthScore += 15;
    else if (responseRate > 0) healthScore += 8;
    if (winRate >= 50) healthScore += 10;
    if (daysSinceContact != null && daysSinceContact <= 14) healthScore += 10;
    if (daysSinceContact != null && daysSinceContact > 45) healthScore -= 15;
    if (daysSincePurchase != null && daysSincePurchase > 180) healthScore -= 10;
    if (
      agency?.status === 'not_interested' ||
      agency?.status === 'do_not_contact'
    ) {
      healthScore -= 35;
    }

    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    const risk =
      healthScore >= 75
        ? { label: 'Low', tone: 'success' as const }
        : healthScore >= 50
          ? { label: 'Moderate', tone: 'warning' as const }
          : { label: 'High', tone: 'danger' as const };

    let recommendedAction = 'Continue relationship development.';
    let recommendationDetail =
      'Maintain regular contact and learn the buyer’s portfolio preferences.';

    if (!agency?.contacts.some(contact => contact.decisionMaker)) {
      recommendedAction = 'Identify the decision maker';
      recommendationDetail =
        'This buyer does not yet have a confirmed decision-maker contact.';
    } else if (daysSinceContact == null || daysSinceContact > 30) {
      recommendedAction = 'Re-engage the buyer';
      recommendationDetail =
        'There has been no recent recorded contact. Schedule direct outreach.';
    } else if (buyerSales.length === 0 && buyerOffers.length > 0) {
      recommendedAction = 'Convert active interest';
      recommendationDetail =
        'The buyer has offer activity but no completed purchase history.';
    } else if (
      predictedNextPurchase &&
      new Date(predictedNextPurchase).getTime() <= Date.now() + 30 * DAY
    ) {
      recommendedAction = 'Present the next matching portfolio';
      recommendationDetail =
        'The buyer is approaching the predicted point in their buying cycle.';
    } else if (buyerReservations.some(item => item.status === 'active')) {
      recommendedAction = 'Protect the active closing';
      recommendationDetail =
        'This buyer has an active reservation. Prioritize payment and closing.';
    }

    return {
      lifetimeRevenue,
      lifetimeProfit,
      averageDealSize,
      purchases: buyerSales.length,
      winRate,
      responseRate,
      lastSale,
      lastContactAt,
      daysSincePurchase,
      daysSinceContact,
      favoritePortfolio,
      averagePurchaseInterval,
      predictedNextPurchase,
      healthScore,
      risk,
      recommendedAction,
      recommendationDetail,
    };
  }, [agency, buyerMessages, buyerOffers, buyerReservations, buyerSales]);

  if (!opportunity || !agency) {
    return (
      <Card className="p-6">
        <p className="font-semibold">Buyer relationship unavailable</p>
        <p className="mt-2 text-sm text-slate-500">
          The opportunity or linked agency could not be found.
        </p>
      </Card>
    );
  }

  const recentRelationshipEvents = [
    ...buyerSales.map(item => ({
      id: `sale-${item.id}`,
      title: `Purchased ${item.portfolioName}`,
      detail: `${money(item.salePrice)} sale`,
      at: item.closedAt,
    })),
    ...buyerOffers.map(item => ({
      id: `offer-${item.id}`,
      title: `${item.portfolioName} offer`,
      detail: `${money(item.currentAmount)} · ${item.status.replace(/_/g, ' ')}`,
      at: item.updatedAt,
    })),
    ...buyerMessages.map(item => ({
      id: `message-${item.id}`,
      title:
        item.direction === 'inbound'
          ? 'Buyer replied'
          : item.direction === 'outbound'
            ? 'Message sent'
            : 'Internal note',
      detail: item.subject || item.body,
      at: item.createdAt,
    })),
  ]
    .sort(
      (first, second) =>
        new Date(second.at).getTime() - new Date(first.at).getTime(),
    )
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[260px_1fr]">
          <div className="bg-slate-950 p-6 text-white">
            <div className="flex items-center gap-3 text-blue-300">
              <HeartPulse size={20} />
              <p className="text-sm font-semibold">Buyer Health</p>
            </div>

            <div className="mt-7 flex items-end gap-2">
              <p className="text-5xl font-semibold">
                {intelligence.healthScore}
              </p>
              <p className="pb-1 text-lg text-slate-400">/100</p>
            </div>

            <div className="mt-5">
              <Pill tone={intelligence.risk.tone}>
                {intelligence.risk.label} risk
              </Pill>
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-400">
              Measures purchase history, responsiveness, recent contact and deal
              conversion.
            </p>
          </div>

          <div className="p-6">
            <p className="text-sm text-slate-500">
              Buyer Relationship Intelligence · v2.3.0
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {agency.name} Buyer 360
            </h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<CircleDollarSign />} label="Lifetime revenue" value={money(intelligence.lifetimeRevenue)} />
              <Metric icon={<TrendingUp />} label="Lifetime net revenue" value={money(intelligence.lifetimeProfit)} />
              <Metric icon={<ShoppingBag />} label="Completed purchases" value={String(intelligence.purchases)} />
              <Metric icon={<Target />} label="Win rate" value={`${intelligence.winRate.toFixed(0)}%`} />
              <Metric icon={<MessageSquare />} label="Response rate" value={`${intelligence.responseRate.toFixed(0)}%`} />
              <Metric icon={<CircleDollarSign />} label="Average deal size" value={money(intelligence.averageDealSize)} />
              <Metric icon={<CalendarClock />} label="Last purchase" value={dateLabel(intelligence.lastSale?.closedAt)} />
              <Metric icon={<Clock3 />} label="Last contact" value={dateLabel(intelligence.lastContactAt)} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="p-6">
          <p className="text-sm text-slate-500">Relationship profile</p>
          <h3 className="mt-1 text-xl font-semibold">Buyer behavior</h3>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Detail label="Favorite portfolio" value={intelligence.favoritePortfolio} />
            <Detail label="Days since last purchase" value={intelligence.daysSincePurchase == null ? 'No purchase history' : String(intelligence.daysSincePurchase)} />
            <Detail label="Days since last contact" value={intelligence.daysSinceContact == null ? 'No contact history' : String(intelligence.daysSinceContact)} />
            <Detail label="Average buying cycle" value={intelligence.averagePurchaseInterval == null ? 'Not enough purchase history' : `${Math.round(intelligence.averagePurchaseInterval)} days`} />
            <Detail label="Predicted next purchase" value={dateLabel(intelligence.predictedNextPurchase)} />
            <Detail label="Relationship owner" value={agency.ownerEmployeeName} />
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-slate-500">Recommended next action</p>

          <div className="mt-5 flex items-start gap-3">
            {intelligence.healthScore >= 75 ? (
              <CheckCircle2 className="mt-0.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 text-amber-600" />
            )}

            <div>
              <h3 className="font-semibold">
                {intelligence.recommendedAction}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {intelligence.recommendationDetail}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <UserRound size={18} className="text-blue-600" />
              <p className="text-sm font-semibold">Relationship summary</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {agency.name} has completed {intelligence.purchases}{' '}
              purchase{intelligence.purchases === 1 ? '' : 's'} totaling{' '}
              {money(intelligence.lifetimeRevenue)}. Their current response rate
              is {intelligence.responseRate.toFixed(0)}% and offer win rate is{' '}
              {intelligence.winRate.toFixed(0)}%.
            </p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <p className="text-sm text-slate-500">Buyer relationship history</p>
          <h3 className="mt-1 text-xl font-semibold">Recent buyer activity</h3>
        </div>

        {!recentRelationshipEvents.length ? (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <History className="mx-auto text-slate-300" size={32} />
              <p className="mt-3 font-semibold">No buyer history yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Communications, offers and purchases will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentRelationshipEvents.map(event => (
              <div key={event.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{event.title}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-500">{event.detail}</p>
                </div>
                <p className="shrink-0 text-xs text-slate-400">
                  {new Date(event.at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
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
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-blue-600">{icon}</div>
      <p className="mt-4 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
