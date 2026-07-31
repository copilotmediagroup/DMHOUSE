import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Mail,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { Card, Pill, PrimaryButton, SecondaryButton, inputClass } from '../../components/Primitives';
import { usePortfolioStore } from '../../store/PortfolioStore';
import { useAgencyStore } from '../../store/AgencyStore';
import { useOutreachStore } from '../../store/OutreachStore';
import { useMatchingStore } from '../../store/MatchingStore';
import { type RecipientStatus, useCampaignStore } from '../../store/CampaignStore';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const vars = (text: string, data: Record<string, string | number>) =>
  Object.entries(data).reduce(
    (out, [key, value]) => out.split(`{{${key}}}`).join(String(value)),
    text,
  );

const sentStatuses: RecipientStatus[] = [
  'sent',
  'delivered',
  'opened',
  'replied',
  'interested',
  'negotiating',
  'purchased',
];

export default function PortfolioCampaigns() {
  const { portfolios } = usePortfolioStore();
  const { agencies } = useAgencyStore();
  const { templates } = useOutreachStore();
  const { matches, employees } = useMatchingStore();
  const {
    campaigns,
    recipients,
    events,
    loading,
    error,
    createCampaign,
    setCampaignStatus,
    addRecipient,
    removeRecipient,
    assignRecipient,
    updateRecipientStatus,
    sendRecipient,
  } = useCampaignStore();

  const [selectedId, setSelectedId] = useState(campaigns[0]?.id || '');
  const selected = campaigns.find((campaign) => campaign.id === selectedId) || campaigns[0];
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [bulkAdding, setBulkAdding] = useState(false);

  const rows = selected
    ? recipients.filter((recipient) => recipient.campaignId === selected.id)
    : [];
  const portfolio = selected
    ? portfolios.find((item) => item.id === selected.portfolioId)
    : undefined;

  const counts = useMemo(
    () => ({
      selected: rows.filter((row) => ['selected', 'assigned', 'queued'].includes(row.status)).length,
      sent: rows.filter((row) => sentStatuses.includes(row.status)).length,
      delivered: rows.filter((row) =>
        ['delivered', 'opened', 'replied', 'interested', 'negotiating', 'purchased'].includes(row.status),
      ).length,
      opened: rows.filter((row) =>
        ['opened', 'replied', 'interested', 'negotiating', 'purchased'].includes(row.status),
      ).length,
      replies: rows.filter((row) =>
        ['replied', 'interested', 'negotiating', 'purchased'].includes(row.status),
      ).length,
      interested: rows.filter((row) =>
        ['interested', 'negotiating', 'purchased'].includes(row.status),
      ).length,
      negotiating: rows.filter((row) => ['negotiating', 'purchased'].includes(row.status)).length,
      purchased: rows.filter((row) => row.status === 'purchased').length,
    }),
    [rows],
  );

  const candidateMatches = selected
    ? matches
        .filter(
          (match) =>
            match.portfolioId === selected.portfolioId &&
            !rows.some((recipient) => recipient.agencyId === match.agencyId),
        )
        .sort((a, b) => b.score - a.score)
    : [];

  const launchChecks = useMemo(() => {
    if (!selected || !portfolio) return [];

    return [
      {
        label: 'Active portfolio',
        detail: portfolio.status === 'active' ? 'Portfolio is active.' : 'Portfolio must be active before launch.',
        passed: portfolio.status === 'active',
      },
      {
        label: 'Approved subject',
        detail: selected.subject.trim() ? 'Campaign subject is ready.' : 'Campaign subject is missing.',
        passed: Boolean(selected.subject.trim()),
      },
      {
        label: 'Approved message',
        detail: selected.body.trim() ? 'Campaign body is ready.' : 'Campaign body is missing.',
        passed: Boolean(selected.body.trim()),
      },
      {
        label: 'Recipients added',
        detail: rows.length ? `${rows.length} recipient${rows.length === 1 ? '' : 's'} selected.` : 'Add at least one matched buyer.',
        passed: rows.length > 0,
      },
      {
        label: 'Email coverage',
        detail: rows.every((row) => Boolean(row.recipientEmail))
          ? 'Every recipient has an email address.'
          : 'One or more recipients are missing email addresses.',
        passed: rows.length > 0 && rows.every((row) => Boolean(row.recipientEmail)),
      },
      {
        label: 'Employee ownership',
        detail: rows.every((row) => Boolean(row.assignedEmployeeId))
          ? 'Every recipient has an assigned employee.'
          : 'Assign an employee to every recipient.',
        passed: rows.length > 0 && rows.every((row) => Boolean(row.assignedEmployeeId)),
      },
    ];
  }, [portfolio, rows, selected]);

  const campaignHealth = useMemo(() => {
    if (!launchChecks.length) return { score: 0, blockers: [] as typeof launchChecks };
    const passed = launchChecks.filter((check) => check.passed).length;
    return {
      score: Math.round((passed / launchChecks.length) * 100),
      blockers: launchChecks.filter((check) => !check.passed),
    };
  }, [launchChecks]);

  const projection = useMemo(() => {
    if (!portfolio || !selected) {
      return {
        expectedReplies: 0,
        expectedInterested: 0,
        expectedSales: 0,
        projectedRevenue: 0,
        projectedGrossProfit: 0,
      };
    }

    const recipientBase = Math.max(rows.length, Math.min(selected.maxRecipients, 50));
    const expectedReplies = Math.round(recipientBase * 0.18);
    const expectedInterested = Math.round(recipientBase * 0.08);
    const expectedSales = Math.min(1, Math.round(recipientBase * 0.03));
    const projectedRevenue = expectedSales * portfolio.askingPrice;
    const projectedGrossProfit = expectedSales * Math.max(0, portfolio.askingPrice - portfolio.acquisitionCost);

    return {
      expectedReplies,
      expectedInterested,
      expectedSales,
      projectedRevenue,
      projectedGrossProfit,
    };
  }, [portfolio, rows.length, selected]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const template = templates.find((item) => item.id === String(form.get('templateId')));

    try {
      const id = await createCampaign({
        portfolioId: String(form.get('portfolioId')),
        name: String(form.get('name')),
        templateId: template?.id,
        subject: String(form.get('subject') || template?.subject || ''),
        body: String(form.get('body') || template?.body || ''),
        maxRecipients: Number(form.get('maxRecipients') || 50),
      });
      setSelectedId(id);
      setCreating(false);
      setMessage('Campaign created. Add matched buyers, then approve it.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unable to create campaign.');
    }
  }

  async function addMatched(agencyId: string) {
    if (!selected || !portfolio) return;

    const agency = agencies.find((item) => item.id === agencyId);
    const match = matches.find(
      (item) => item.portfolioId === portfolio.id && item.agencyId === agencyId,
    );
    if (!agency || !match) return;

    const contact =
      agency.contacts.find((item) => item.decisionMaker && item.email) ||
      agency.contacts.find((item) => item.email);
    const email = contact?.email || agency.generalEmail;
    const name = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      : agency.name;
    const data = {
      agency_name: agency.name,
      contact_name: name,
      portfolio_name: portfolio.name,
      account_count: portfolio.accountCount,
      asking_price: money.format(portfolio.askingPrice),
      employee_name: 'Data Market House',
    };

    await addRecipient({
      campaignId: selected.id,
      portfolioId: portfolio.id,
      agencyId,
      contactId: contact?.id,
      assignedEmployeeId: match.assignedEmployeeId,
      matchScore: match.score,
      recipientEmail: email,
      recipientName: name,
      personalizedSubject: vars(selected.subject, data),
      personalizedBody: vars(selected.body, data),
    });
  }

  async function addTopMatches() {
    if (!selected) return;

    const availableSlots = Math.max(0, selected.maxRecipients - rows.length);
    const topMatches = candidateMatches.slice(0, availableSlots);

    if (!topMatches.length) {
      setMessage('No additional matched buyers are available.');
      return;
    }

    setBulkAdding(true);
    let added = 0;
    try {
      for (const match of topMatches) {
        await addMatched(match.agencyId);
        added += 1;
      }
      setMessage(`${added} matched buyer${added === 1 ? '' : 's'} added to the campaign.`);
    } catch (cause) {
      setMessage(
        `${added} buyer${added === 1 ? '' : 's'} added before an error occurred: ${
          cause instanceof Error ? cause.message : 'Unable to finish bulk add.'
        }`,
      );
    } finally {
      setBulkAdding(false);
    }
  }

  async function launchCampaign() {
    if (!selected) return;

    if (campaignHealth.blockers.length) {
      setMessage(`Launch blocked: ${campaignHealth.blockers.map((item) => item.detail).join(' ')}`);
      return;
    }

    await setCampaignStatus(selected.id, 'active');
    setMessage('Campaign launched. Recipients are ready for controlled outreach.');
  }

  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8 lg:p-10">
      <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">Smart Campaign Engine · v3.1</p>
          <h2 className="mt-1 text-3xl font-semibold">Portfolio campaigns</h2>
          <p className="mt-2 text-slate-500">
            Turn buyer matches into approved, assigned, duplicate-safe outreach.
          </p>
        </div>
        <PrimaryButton onClick={() => setCreating(true)}>
          <Plus className="mr-2" size={17} />
          New campaign
        </PrimaryButton>
      </header>

      {error && <Card className="mb-5 border-red-200 p-4 text-red-700">{error}</Card>}
      {message && <Card className="mb-5 p-4 text-sm text-slate-600">{message}</Card>}

      {creating && (
        <Card className="mb-6 p-6">
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <input className={inputClass} name="name" placeholder="Campaign name" required />
            <select className={inputClass} name="portfolioId" required>
              <option value="">Select portfolio</option>
              {portfolios
                .filter((item) => item.status !== 'sold')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <select className={inputClass} name="templateId">
              <option value="">Select approved template</option>
              {templates
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <input
              className={inputClass}
              type="number"
              min="1"
              max="500"
              name="maxRecipients"
              defaultValue="50"
            />
            <input
              className={`${inputClass} md:col-span-2`}
              name="subject"
              placeholder="Optional subject override"
            />
            <textarea
              className={`${inputClass} min-h-36 md:col-span-2`}
              name="body"
              placeholder="Optional message override"
            />
            <div className="flex gap-3 md:col-span-2">
              <PrimaryButton>Create campaign</PrimaryButton>
              <SecondaryButton type="button" onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
        <Card className="h-fit p-4">
          <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[.18em] text-slate-400">
            Campaigns
          </p>
          <div className="space-y-2">
            {campaigns.map((campaign) => {
              const campaignPortfolio = portfolios.find(
                (item) => item.id === campaign.portfolioId,
              );
              return (
                <button
                  key={campaign.id}
                  onClick={() => setSelectedId(campaign.id)}
                  className={`w-full rounded-2xl p-4 text-left ${
                    selected?.id === campaign.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{campaign.name}</p>
                    <Pill
                      tone={
                        campaign.status === 'active'
                          ? 'success'
                          : campaign.status === 'paused'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {campaign.status}
                    </Pill>
                  </div>
                  <p
                    className={`mt-1 text-xs ${
                      selected?.id === campaign.id ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {campaignPortfolio?.name || 'Portfolio'} ·{' '}
                    {recipients.filter((recipient) => recipient.campaignId === campaign.id).length}/
                    {campaign.maxRecipients}
                  </p>
                </button>
              );
            })}
            {!campaigns.length && !loading && (
              <p className="p-5 text-center text-sm text-slate-400">No campaigns yet.</p>
            )}
          </div>
        </Card>

        {selected && portfolio ? (
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="grid lg:grid-cols-[260px_1fr]">
                <div className="bg-slate-950 p-7 text-white">
                  <div className="flex items-center gap-3 text-blue-300">
                    <Gauge size={21} />
                    <p className="text-sm font-semibold">Campaign Health</p>
                  </div>
                  <div className="mt-8 flex items-end gap-2">
                    <span className="text-6xl font-semibold">{campaignHealth.score}</span>
                    <span className="pb-2 text-xl text-slate-400">%</span>
                  </div>
                  <div className="mt-5">
                    <Pill tone={campaignHealth.score === 100 ? 'success' : campaignHealth.score >= 70 ? 'blue' : 'neutral'}>
                      {campaignHealth.score === 100
                        ? 'Launch ready'
                        : campaignHealth.score >= 70
                          ? 'Nearly ready'
                          : 'Needs attention'}
                    </Pill>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-slate-400">
                    {campaignHealth.blockers.length
                      ? `${campaignHealth.blockers.length} launch requirement${
                          campaignHealth.blockers.length === 1 ? '' : 's'
                        } remain.`
                      : 'All launch safeguards are satisfied.'}
                  </p>
                </div>

                <div className="p-6 md:p-8">
                  <div className="grid gap-3 md:grid-cols-2">
                    {launchChecks.map((check) => (
                      <div
                        key={check.label}
                        className={`rounded-2xl border p-4 ${
                          check.passed
                            ? 'border-emerald-100 bg-emerald-50/60'
                            : 'border-amber-100 bg-amber-50/70'
                        }`}
                      >
                        <div className="flex gap-3">
                          {check.passed ? (
                            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                          ) : (
                            <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
                          )}
                          <div>
                            <p className="text-sm font-semibold">{check.label}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 md:p-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-semibold">{selected.name}</h3>
                    <Pill
                      tone={
                        selected.status === 'active'
                          ? 'success'
                          : selected.status === 'paused'
                            ? 'warning'
                            : 'blue'
                      }
                    >
                      {selected.status}
                    </Pill>
                  </div>
                  <p className="mt-2 text-slate-500">
                    {portfolio.name} · {portfolio.accountCount.toLocaleString()} accounts ·{' '}
                    {money.format(portfolio.askingPrice)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.status === 'draft' && (
                    <PrimaryButton onClick={() => void setCampaignStatus(selected.id, 'ready')}>
                      Approve campaign
                    </PrimaryButton>
                  )}
                  {selected.status === 'ready' && (
                    <PrimaryButton onClick={() => void launchCampaign()}>
                      <Play className="mr-2" size={16} />
                      Launch
                    </PrimaryButton>
                  )}
                  {selected.status === 'active' && (
                    <SecondaryButton onClick={() => void setCampaignStatus(selected.id, 'paused')}>
                      <Pause className="mr-2" size={16} />
                      Pause
                    </SecondaryButton>
                  )}
                  {selected.status === 'paused' && (
                    <PrimaryButton onClick={() => void setCampaignStatus(selected.id, 'active')}>
                      <Play className="mr-2" size={16} />
                      Resume
                    </PrimaryButton>
                  )}
                  {!['completed', 'cancelled'].includes(selected.status) && (
                    <SecondaryButton
                      onClick={() => void setCampaignStatus(selected.id, 'completed')}
                    >
                      <CheckCircle2 className="mr-2" size={16} />
                      Complete
                    </SecondaryButton>
                  )}
                </div>
              </div>

              <div className="mt-7 overflow-x-auto">
                <div className="flex min-w-[920px] items-center">
                  {[
                    ['Recipients', rows.length],
                    ['Sent', counts.sent],
                    ['Delivered', counts.delivered],
                    ['Opened', counts.opened],
                    ['Replies', counts.replies],
                    ['Interested', counts.interested],
                    ['Negotiating', counts.negotiating],
                    ['Purchased', counts.purchased],
                  ].map(([label, value], index, list) => (
                    <div key={String(label)} className="flex flex-1 items-center">
                      <div className="min-w-[92px] rounded-2xl bg-slate-50 p-4 text-center">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="mt-1 text-2xl font-semibold">{value}</p>
                      </div>
                      {index < list.length - 1 && (
                        <ChevronRight className="mx-2 shrink-0 text-slate-300" size={19} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div className="grid gap-6 2xl:grid-cols-[1fr_390px]">
              <Card className="overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Campaign recipients</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Employees can only work recipients assigned to them.
                    </p>
                  </div>
                  <SecondaryButton
                    onClick={() => void addTopMatches()}
                    disabled={bulkAdding || !candidateMatches.length || rows.length >= selected.maxRecipients}
                  >
                    <Sparkles className="mr-2" size={16} />
                    {bulkAdding ? 'Adding buyers…' : 'Add top matches'}
                  </SecondaryButton>
                </div>

                <div className="divide-y divide-slate-100">
                  {rows.map((recipient) => {
                    const agency = agencies.find((item) => item.id === recipient.agencyId);
                    return (
                      <div
                        key={recipient.id}
                        className="grid gap-3 p-5 xl:grid-cols-[1fr_170px_170px_auto]"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">
                              {agency?.name || recipient.recipientName}
                            </p>
                            <Pill
                              tone={
                                recipient.status === 'purchased'
                                  ? 'success'
                                  : recipient.status === 'failed' || recipient.status === 'declined'
                                    ? 'danger'
                                    : recipient.status === 'interested' ||
                                        recipient.status === 'negotiating'
                                      ? 'warning'
                                      : 'blue'
                              }
                            >
                              {recipient.status}
                            </Pill>
                            <span className="text-xs font-semibold text-slate-400">
                              {recipient.matchScore}% match
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {recipient.recipientEmail || 'Missing email'}
                          </p>
                        </div>

                        <select
                          className={inputClass}
                          value={recipient.assignedEmployeeId || ''}
                          onChange={(event) =>
                            void assignRecipient(recipient.id, event.target.value)
                          }
                        >
                          <option value="">Unassigned</option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>

                        <select
                          className={inputClass}
                          value={recipient.status}
                          onChange={(event) =>
                            void updateRecipientStatus(
                              recipient.id,
                              event.target.value as RecipientStatus,
                            )
                          }
                        >
                          {[
                            'selected',
                            'assigned',
                            'sent',
                            'delivered',
                            'opened',
                            'replied',
                            'interested',
                            'declined',
                            'negotiating',
                            'purchased',
                            'failed',
                            'suppressed',
                          ].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>

                        <div className="flex gap-2">
                          <PrimaryButton
                            disabled={
                              selected.status !== 'active' ||
                              !recipient.recipientEmail ||
                              sentStatuses.includes(recipient.status)
                            }
                            onClick={() => void sendRecipient(recipient.id)}
                          >
                            <Send size={16} />
                          </PrimaryButton>
                          <SecondaryButton
                            disabled={!['selected', 'assigned'].includes(recipient.status)}
                            onClick={() => void removeRecipient(recipient.id)}
                          >
                            <Trash2 size={16} />
                          </SecondaryButton>
                        </div>
                      </div>
                    );
                  })}
                  {!rows.length && (
                    <p className="p-10 text-center text-slate-400">
                      Add matched buyers to begin.
                    </p>
                  )}
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="p-5">
                  <div className="flex items-center gap-3">
                    <WalletCards className="text-blue-600" />
                    <div>
                      <h3 className="font-semibold">Revenue projection</h3>
                      <p className="text-xs text-slate-500">Planning estimate</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    <ProjectionMetric label="Expected replies" value={projection.expectedReplies.toString()} />
                    <ProjectionMetric
                      label="Expected interested buyers"
                      value={projection.expectedInterested.toString()}
                    />
                    <ProjectionMetric label="Expected sales" value={projection.expectedSales.toString()} />
                    <ProjectionMetric
                      label="Projected revenue"
                      value={money.format(projection.projectedRevenue)}
                    />
                    <ProjectionMetric
                      label="Projected gross profit"
                      value={money.format(projection.projectedGrossProfit)}
                    />
                  </div>
                  <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    Projection uses planning assumptions of 18% replies, 8% interested buyers,
                    and a maximum of one sale per portfolio campaign.
                  </p>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center gap-3">
                    <Users className="text-blue-600" />
                    <div>
                      <h3 className="font-semibold">Best matched buyers</h3>
                      <p className="text-xs text-slate-500">Highest fit first</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {candidateMatches.slice(0, 12).map((match) => {
                      const agency = agencies.find((item) => item.id === match.agencyId);
                      return (
                        <div key={match.agencyId} className="rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{agency?.name || 'Agency'}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {match.score}% · {match.reasons.slice(0, 2).join(' · ')}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                void addMatched(match.agencyId)
                                  .then(() => setMessage(`${agency?.name || 'Agency'} added.`))
                                  .catch((cause) =>
                                    setMessage(
                                      cause instanceof Error
                                        ? cause.message
                                        : 'Unable to add buyer.',
                                    ),
                                  )
                              }
                              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!candidateMatches.length && (
                      <p className="py-8 text-center text-sm text-slate-400">
                        No additional matches.
                      </p>
                    )}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center gap-3">
                    <Mail className="text-blue-600" />
                    <h3 className="font-semibold">Recent campaign events</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {events
                      .filter((event) => event.campaignId === selected.id)
                      .slice(0, 8)
                      .map((event) => (
                        <div key={event.id} className="border-l-2 border-slate-200 pl-3">
                          <p className="text-sm font-medium">{event.detail || event.eventType}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {new Date(event.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <Card className="grid min-h-80 place-items-center p-8 text-slate-400">
            Select or create a campaign.
          </Card>
        )}
      </div>
    </div>
  );
}

function ProjectionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
