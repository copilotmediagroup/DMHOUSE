import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Inbox,
  Mail,
  MailCheck,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  UserRound,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton, inputClass } from '../components/Primitives';
import { useAgencyStore } from '../store/AgencyStore';
import {
  useConversationStore,
  type ConversationMessage,
} from '../store/ConversationStore';
import { usePipelineStore } from '../store/PipelineStore';
import { usePortfolioStore } from '../store/PortfolioStore';

const normalizeSubject = (value = '') =>
  value.replace(/^(re|fw|fwd):\s*/gi, '').trim() || '(No subject)';

const compactPreview = (value = '') =>
  value.replace(/\s+/g, ' ').replace(/^>+/gm, '').trim().slice(0, 110);

const dateLabel = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat('en-US',
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric' },
  ).format(date);
};

const fullDateLabel = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso))
    : '';

type InboxFilter = 'all' | 'unread' | 'waiting';

type Thread = {
  key: string;
  conversationId: string;
  agencyId: string;
  contactId?: string;
  participantEmail: string;
  contactName: string;
  agencyName: string;
  subject: string;
  messages: ConversationMessage[];
  lastMessage: ConversationMessage;
  lastAt: string;
  unread: number;
  waitingOnEmployee: boolean;
};

export default function ConversationCenter() {
  const { profile } = usePortfolioStore();
  const owner = profile?.role === 'owner';
  const { opportunities } = usePipelineStore();
  const [params] = useSearchParams();
  const {
    conversations,
    messages,
    employees,
    tests,
    loading,
    syncing,
    error,
    syncInbox,
    setWorkflow,
    markRead,
    sendReply,
    addInternalNote,
    sendTest,
  } = useConversationStore();
  const { agencies } = useAgencyStore();

  const [selectedKey, setSelectedKey] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [notice, setNotice] = useState('');
  const [testOpen, setTestOpen] = useState(false);

  const threads = useMemo<Thread[]>(() => {
    const grouped = new Map<string, ConversationMessage[]>();

    for (const message of messages) {
      if (message.direction === 'internal') continue;

      const participant =
        (message.direction === 'inbound' ? message.fromEmail : message.toEmail) ||
        'unknown-contact';
      const key =
        message.providerThreadId ||
        `legacy:${message.conversationId}:${participant.toLowerCase()}:${normalizeSubject(
          message.subject,
        ).toLowerCase()}`;

      const group = grouped.get(key) || [];
      group.push(message);
      grouped.set(key, group);
    }

    return [...grouped.entries()]
      .map(([key, group]) => {
        group.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const latest = group[group.length - 1];
        const inbound = [...group]
          .reverse()
          .find((message) => message.direction === 'inbound');
        const outbound = [...group]
          .reverse()
          .find((message) => message.direction === 'outbound');
        const participantEmail =
          inbound?.fromEmail || outbound?.toEmail || 'Unknown contact';
        const contactId = inbound?.contactId || outbound?.contactId;
        const agency = agencies.find((item) => item.id === latest.agencyId);
        const contact =
          agency?.contacts.find((item) => item.id === contactId) ||
          agency?.contacts.find(
            (item) =>
              item.email?.toLowerCase() === participantEmail.toLowerCase(),
          );
        const contactName =
          [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ||
          participantEmail;
        const lastInbound = [...group]
          .reverse()
          .find((message) => message.direction === 'inbound');
        const lastOutbound = [...group]
          .reverse()
          .find((message) => message.direction === 'outbound');
        const waitingOnEmployee = Boolean(
          lastInbound &&
            (!lastOutbound ||
              new Date(lastInbound.createdAt) > new Date(lastOutbound.createdAt)),
        );

        return {
          key,
          conversationId: latest.conversationId,
          agencyId: latest.agencyId,
          contactId,
          participantEmail,
          contactName,
          agencyName: agency?.name || 'Unknown agency',
          subject: normalizeSubject(
            latest.subject || outbound?.subject || inbound?.subject,
          ),
          messages: group,
          lastMessage: latest,
          lastAt: latest.createdAt,
          unread: group.filter(
            (message) => message.direction === 'inbound' && !message.isRead,
          ).length,
          waitingOnEmployee,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
      );
  }, [messages, agencies]);

  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (filter === 'unread' && thread.unread === 0) return false;
      if (filter === 'waiting' && !thread.waitingOnEmployee) return false;
      if (!needle) return true;

      return [
        thread.contactName,
        thread.participantEmail,
        thread.agencyName,
        thread.subject,
        thread.lastMessage.body,
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [threads, query, filter]);

  useEffect(() => {
    const requested = params.get('conversation');
    const candidate = threads.find(
      (thread) => thread.conversationId === requested,
    );
    if (candidate) setSelectedKey(candidate.key);
  }, [params, threads]);

  useEffect(() => {
    if (!filteredThreads.some((thread) => thread.key === selectedKey)) {
      setSelectedKey(filteredThreads[0]?.key || '');
    }
  }, [filteredThreads, selectedKey]);

  const selected = threads.find((thread) => thread.key === selectedKey);
  const conversation = conversations.find(
    (item) => item.id === selected?.conversationId,
  );
  const agency = agencies.find((item) => item.id === selected?.agencyId);
  const employee = employees.find(
    (item) => item.id === conversation?.assignedEmployeeId,
  );
  const linkedDeal = conversation
    ? opportunities.find((item) => item.id === conversation.opportunityId) ||
      opportunities.find(
        (item) =>
          item.agencyId === conversation.agencyId &&
          !['closed_won', 'closed_lost'].includes(item.stage),
      )
    : undefined;
  const internalNotes = messages.filter(
    (message) =>
      message.conversationId === conversation?.id &&
      message.direction === 'internal',
  );

  async function chooseThread(thread: Thread) {
    setSelectedKey(thread.key);
    setNotice('');
    if (thread.unread) {
      await markRead(
        thread.conversationId,
        thread.key.startsWith('legacy:') ? undefined : thread.key,
      );
    }
  }

  async function sendBuyerReply() {
    if (!selected || !conversation || !agency || !reply.trim()) return;
    try {
      await sendReply(
        conversation.id,
        agency.id,
        selected.participantEmail,
        `Re: ${selected.subject}`,
        reply,
        selected.key.startsWith('legacy:') ? undefined : selected.key,
      );
      setReply('');
      setNotice(`Reply sent to ${selected.contactName}.`);
    } catch (sendError) {
      setNotice(sendError instanceof Error ? sendError.message : 'Send failed.');
    }
  }

  async function saveInternalNote() {
    if (!conversation || !note.trim()) return;
    try {
      await addInternalNote(conversation.id, note);
      setNote('');
      setNotice('Internal note saved.');
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'Note failed.');
    }
  }

  if (loading) return <div className="p-10">Loading conversations…</div>;

  return (
    <div className="mx-auto max-w-[1680px] p-4 md:p-6">
      <header className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            True Threaded Inbox · v4.0.5
          </p>
          <h2 className="mt-1 text-3xl font-semibold">Messages</h2>
          <p className="mt-1 text-slate-500">
            Every contact and Gmail subject is a separate conversation.
          </p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton
            disabled={syncing}
            onClick={async () => {
              try {
                const result = await syncInbox();
                setNotice(
                  result.imported
                    ? `${result.imported} new repl${
                        result.imported === 1 ? 'y' : 'ies'
                      } imported.`
                    : 'Inbox is up to date.',
                );
              } catch (syncError) {
                setNotice(
                  syncError instanceof Error ? syncError.message : 'Sync failed.',
                );
              }
            }}
          >
            <RefreshCw
              size={16}
              className={`mr-2 ${syncing ? 'animate-spin' : ''}`}
            />
            {syncing ? 'Syncing…' : 'Sync inbox'}
          </SecondaryButton>
          {owner && (
            <PrimaryButton onClick={() => setTestOpen((value) => !value)}>
              <MailCheck size={16} className="mr-2" />
              Owner test
            </PrimaryButton>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {testOpen && owner && <TestPanel tests={tests} onSend={sendTest} />}

      <div className="grid min-h-[760px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[390px_minmax(0,1fr)_310px]">
        <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <Inbox size={18} /> Inbox
              </div>
              <span className="text-sm text-slate-400">{filteredThreads.length}</span>
            </div>
            <div className="relative mt-3">
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={16}
              />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Search person, agency, or subject"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                ['all', 'All'],
                ['unread', 'Unread'],
                ['waiting', 'Needs reply'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                    filter === value
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[680px] overflow-y-auto">
            {filteredThreads.map((thread) => {
              const outbound = thread.lastMessage.direction === 'outbound';
              const initial = thread.contactName.charAt(0).toUpperCase();
              return (
                <button
                  key={thread.key}
                  onClick={() => void chooseThread(thread)}
                  className={`w-full border-b p-4 text-left transition hover:bg-slate-50 ${
                    selected?.key === thread.key
                      ? 'border-l-4 border-l-blue-600 bg-blue-50/70'
                      : 'border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">
                            {thread.contactName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {thread.participantEmail}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-slate-400">
                            {dateLabel(thread.lastAt)}
                          </p>
                          {thread.unread > 0 && (
                            <span className="mt-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">
                              {thread.unread}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Building2 size={13} />
                        <span className="truncate">{thread.agencyName}</span>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-800">
                        {thread.subject}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        <span className="font-semibold">
                          {outbound ? 'You: ' : `${thread.contactName}: `}
                        </span>
                        {compactPreview(thread.lastMessage.body)}
                      </p>
                      {thread.waitingOnEmployee && (
                        <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                          Needs your reply
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {!filteredThreads.length && (
              <div className="p-8 text-center text-sm text-slate-500">
                No matching email threads.
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-col bg-slate-50/40">
          {selected && conversation && agency ? (
            <>
              <div className="border-b bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-900 font-bold text-white">
                        {selected.contactName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-semibold">
                          {selected.contactName}
                        </h3>
                        <p className="truncate text-sm text-slate-500">
                          {selected.participantEmail}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                        <Building2 size={14} /> {selected.agencyName}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 font-medium text-blue-700">
                        <Mail size={14} /> {selected.subject}
                      </span>
                    </div>
                  </div>
                  {selected.waitingOnEmployee && (
                    <Pill tone="warning">Waiting on employee</Pill>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <div className="mx-auto max-w-3xl space-y-5">
                  {selected.messages.map((message) => {
                    const outbound = message.direction === 'outbound';
                    const sender = outbound
                      ? 'Data Market House'
                      : selected.contactName;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                            outbound
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold opacity-80">
                            <UserRound size={13} />
                            {sender}
                            <span className="font-normal">·</span>
                            <span className="font-normal">
                              {outbound
                                ? 'sent from sales@debtpaper.com'
                                : message.fromEmail}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.body}
                          </p>
                          <p className="mt-2 text-[11px] opacity-70">
                            {fullDateLabel(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t bg-white p-5">
                <div className="mx-auto max-w-3xl">
                  <div className="mb-3 flex gap-2">
                    <button
                      onClick={() => setMode('reply')}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        mode === 'reply'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100'
                      }`}
                    >
                      <Send size={14} className="mr-2 inline" />
                      Reply to {selected.contactName}
                    </button>
                    <button
                      onClick={() => setMode('note')}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        mode === 'note'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100'
                      }`}
                    >
                      <StickyNote size={14} className="mr-2 inline" />
                      Internal note
                    </button>
                  </div>

                  {mode === 'reply' ? (
                    <>
                      <textarea
                        className={`${inputClass} min-h-28`}
                        placeholder={`Reply to ${selected.contactName} at ${selected.participantEmail}`}
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                          This reply stays in “{selected.subject}”.
                        </p>
                        <PrimaryButton onClick={sendBuyerReply}>
                          <Send size={16} className="mr-2" />
                          Send to {selected.contactName}
                        </PrimaryButton>
                      </div>
                    </>
                  ) : (
                    <>
                      <textarea
                        className={`${inputClass} min-h-24`}
                        placeholder="Private note for your team"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <div className="mt-3 flex justify-end">
                        <SecondaryButton onClick={saveInternalNote}>
                          Save note
                        </SecondaryButton>
                      </div>
                    </>
                  )}
                  {notice && (
                    <p className="mt-3 text-sm text-slate-600">{notice}</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-slate-500">
              Select an email thread.
            </div>
          )}
        </main>

        <aside className="border-t p-5 lg:border-l lg:border-t-0">
          <h4 className="font-semibold">Conversation details</h4>
          {selected && conversation && agency ? (
            <div className="mt-5 space-y-5 text-sm">
              <Detail label="Contact" value={selected.contactName} />
              <Detail label="Contact email" value={selected.participantEmail} />
              <Detail label="Agency" value={selected.agencyName} />
              <Detail label="Subject" value={selected.subject} />
              <Detail
                label="Assigned employee"
                value={employee?.name || 'Unassigned'}
              />
              <Detail label="Messages in thread" value={String(selected.messages.length)} />
              <Detail label="Unread replies" value={String(selected.unread)} />
              <Detail
                label="Linked deal"
                value={linkedDeal?.title || 'No active deal'}
              />
              {!selected.key.startsWith('legacy:') && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Gmail thread
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    {selected.key}
                  </p>
                </div>
              )}
              {conversation.nextFollowUpAt && (
                <div className="rounded-xl bg-amber-50 p-3 text-amber-800">
                  <Clock3 size={15} className="mr-2 inline" />
                  Follow-up {fullDateLabel(conversation.nextFollowUpAt)}
                </div>
              )}
              {internalNotes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Internal notes
                  </p>
                  <p className="mt-2 text-slate-600">
                    {internalNotes.length} saved on this agency conversation
                  </p>
                </div>
              )}
              <SecondaryButton
                className="w-full"
                onClick={() =>
                  setWorkflow(conversation.id, { status: 'ready_for_owner' })
                }
              >
                <CheckCircle2 size={16} className="mr-2" />
                Ready for owner
              </SecondaryButton>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Select a thread to see its contact and deal context.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-medium text-slate-800">{value}</p>
    </div>
  );
}

function TestPanel({
  tests,
  onSend,
}: {
  tests: any[];
  onSend: (recipient: string, subject: string, body: string) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('DMHOUSE email test');
  const [body, setBody] = useState(
    'This is a live delivery test from Data Market House Sales OS.',
  );
  const [message, setMessage] = useState('');

  return (
    <Card className="mb-5 p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <input
          className={inputClass}
          type="email"
          placeholder="Test recipient"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
        />
        <input
          className={inputClass}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <PrimaryButton
          onClick={async () => {
            try {
              await onSend(recipient, subject, body);
              setMessage('Test sent.');
            } catch (sendError) {
              setMessage(
                sendError instanceof Error ? sendError.message : 'Test failed.',
              );
            }
          }}
        >
          Send test
        </PrimaryButton>
        <textarea
          className={`${inputClass} md:col-span-3`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      {message && <p className="mt-3 text-sm">{message}</p>}
      {tests[0] && (
        <p className="mt-2 text-xs text-slate-500">
          Latest: {tests[0].recipient} · {tests[0].status}
        </p>
      )}
    </Card>
  );
}
