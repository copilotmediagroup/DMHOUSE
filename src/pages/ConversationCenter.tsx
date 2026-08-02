import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
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
import { useConversationStore, type ConversationMessage } from '../store/ConversationStore';
import { usePipelineStore } from '../store/PipelineStore';
import { usePortfolioStore } from '../store/PortfolioStore';

const normalizeSubject = (value = '') => value.replace(/^(re|fw|fwd):\s*/gi, '').trim() || '(No subject)';
const compactPreview = (value = '') => value.replace(/^>.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 92);
const formatShort = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  return new Intl.DateTimeFormat('en-US', date.toDateString() === today.toDateString()
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' }).format(date);
};
const formatFull = (iso?: string) => iso ? new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso)) : '';

type Filter = 'all' | 'needs_reply' | 'unread';
type Thread = {
  key: string;
  conversationId: string;
  agencyId: string;
  contactId?: string;
  contactName: string;
  contactEmail: string;
  agencyName: string;
  subject: string;
  messages: ConversationMessage[];
  lastMessage: ConversationMessage;
  unread: number;
  needsReply: boolean;
};

export default function ConversationCenter() {
  const { profile } = usePortfolioStore();
  const owner = profile?.role === 'owner';
  const { agencies } = useAgencyStore();
  const { opportunities } = usePipelineStore();
  const [params] = useSearchParams();
  const {
    conversations, messages, employees, tests, loading, syncing, error,
    syncInbox, setWorkflow, markRead, sendReply, addInternalNote, sendTest,
  } = useConversationStore();

  const [selectedKey, setSelectedKey] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [testOpen, setTestOpen] = useState(false);

  const threads = useMemo<Thread[]>(() => {
    const grouped = new Map<string, ConversationMessage[]>();
    messages.forEach((message) => {
      if (message.direction === 'internal') return;
      const participant = (message.direction === 'inbound' ? message.fromEmail : message.toEmail) || 'unknown-contact';
      const key = message.providerThreadId || `legacy:${message.conversationId}:${participant.toLowerCase()}:${normalizeSubject(message.subject).toLowerCase()}`;
      grouped.set(key, [...(grouped.get(key) || []), message]);
    });

    return [...grouped.entries()].map(([key, group]) => {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const latest = group[group.length - 1];
      const inbound = [...group].reverse().find((message) => message.direction === 'inbound');
      const outbound = [...group].reverse().find((message) => message.direction === 'outbound');
      const contactEmail = inbound?.fromEmail || outbound?.toEmail || 'Unknown contact';
      const contactId = inbound?.contactId || outbound?.contactId;
      const agency = agencies.find((item) => item.id === latest.agencyId);
      const contact = agency?.contacts.find((item) => item.id === contactId) || agency?.contacts.find((item) => item.email?.toLowerCase() === contactEmail.toLowerCase());
      const contactName = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || contactEmail;
      const lastInbound = [...group].reverse().find((message) => message.direction === 'inbound');
      const lastOutbound = [...group].reverse().find((message) => message.direction === 'outbound');
      return {
        key,
        conversationId: latest.conversationId,
        agencyId: latest.agencyId,
        contactId,
        contactName,
        contactEmail,
        agencyName: agency?.name || 'Unknown agency',
        subject: normalizeSubject(latest.subject || outbound?.subject || inbound?.subject),
        messages: group,
        lastMessage: latest,
        unread: group.filter((message) => message.direction === 'inbound' && !message.isRead).length,
        needsReply: Boolean(lastInbound && (!lastOutbound || new Date(lastInbound.createdAt) > new Date(lastOutbound.createdAt))),
      };
    }).sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [messages, agencies]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (filter === 'needs_reply' && !thread.needsReply) return false;
      if (filter === 'unread' && thread.unread === 0) return false;
      if (!needle) return true;
      return [thread.contactName, thread.contactEmail, thread.agencyName, thread.subject, thread.lastMessage.body].join(' ').toLowerCase().includes(needle);
    });
  }, [threads, query, filter]);

  useEffect(() => {
    const requested = params.get('conversation');
    const match = threads.find((thread) => thread.conversationId === requested);
    if (match) setSelectedKey(match.key);
  }, [params, threads]);
  useEffect(() => {
    if (!filtered.some((thread) => thread.key === selectedKey)) setSelectedKey(filtered[0]?.key || '');
  }, [filtered, selectedKey]);

  const selected = threads.find((thread) => thread.key === selectedKey);
  const conversation = conversations.find((item) => item.id === selected?.conversationId);
  const agency = agencies.find((item) => item.id === selected?.agencyId);
  const employee = employees.find((item) => item.id === conversation?.assignedEmployeeId);
  const linkedDeal = conversation ? opportunities.find((item) => item.id === conversation.opportunityId) || opportunities.find((item) => item.agencyId === conversation.agencyId && !['closed_won', 'closed_lost'].includes(item.stage)) : undefined;
  const internalNotes = messages.filter((message) => message.conversationId === conversation?.id && message.direction === 'internal');

  async function selectThread(thread: Thread) {
    setSelectedKey(thread.key);
    setNotice('');
    setReply('');
    if (thread.unread) await markRead(thread.conversationId, thread.key.startsWith('legacy:') ? undefined : thread.key);
  }

  async function sendBuyerReply() {
    if (!selected || !conversation || !agency || !reply.trim()) return;
    try {
      await sendReply(conversation.id, agency.id, selected.contactEmail, `Re: ${selected.subject}`, reply.trim(), selected.key.startsWith('legacy:') ? undefined : selected.key);
      setReply('');
      setNotice(`Sent to ${selected.contactName} at ${selected.contactEmail}.`);
    } catch (sendError) {
      setNotice(sendError instanceof Error ? sendError.message : 'Send failed.');
    }
  }

  async function saveNote() {
    if (!conversation || !note.trim()) return;
    try {
      await addInternalNote(conversation.id, note.trim());
      setNote('');
      setNotice('Internal note saved.');
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'Note failed.');
    }
  }

  if (loading) return <div className="p-10">Loading conversations…</div>;

  return (
    <div className="mx-auto max-w-[1720px] p-4 md:p-6">
      <header className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-600">Communications Hub · v5.0.0</p>
          <h2 className="mt-1 text-3xl font-semibold">Buyer conversations</h2>
          <p className="mt-1 text-slate-500">One contact. One subject. One unmistakable thread.</p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton disabled={syncing} onClick={async () => {
            try {
              const result = await syncInbox();
              setNotice(result.imported ? `${result.imported} new ${result.imported === 1 ? 'reply' : 'replies'} imported.` : 'Inbox is up to date.');
            } catch (syncError) {
              setNotice(syncError instanceof Error ? syncError.message : 'Sync failed.');
            }
          }}>
            <RefreshCw size={16} className={`mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync inbox'}
          </SecondaryButton>
          {owner && <PrimaryButton onClick={() => setTestOpen((value) => !value)}><MailCheck size={16} className="mr-2" />Owner test</PrimaryButton>}
        </div>
      </header>

      {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {testOpen && owner && <TestPanel tests={tests} onSend={sendTest} />}

      <div className="grid min-h-[780px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[370px_minmax(0,1fr)_300px]">
        <aside className="border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Inbox size={18} />Inbox</div><span className="text-sm text-slate-400">{filtered.length}</span></div>
            <div className="relative mt-3"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search contact, agency, or subject" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([['all', 'All'], ['needs_reply', 'Needs reply'], ['unread', 'Unread']] as const).map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}
            </div>
          </div>
          <div className="max-h-[690px] overflow-y-auto">
            {filtered.map((thread) => {
              const active = thread.key === selectedKey;
              return <button key={thread.key} onClick={() => void selectThread(thread)} className={`w-full border-b px-4 py-4 text-left transition ${active ? 'border-l-4 border-l-blue-600 bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{thread.contactName.slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><p className="truncate font-semibold text-slate-900">{thread.contactName}</p><span className="shrink-0 text-xs text-slate-400">{formatShort(thread.lastMessage.createdAt)}</span></div>
                    <p className="truncate text-xs font-medium text-slate-500">{thread.agencyName} · {thread.contactEmail}</p>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-800">{thread.subject}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{thread.lastMessage.direction === 'inbound' ? 'Buyer: ' : 'You: '}{compactPreview(thread.lastMessage.body)}</p>
                    <div className="mt-2 flex items-center gap-2">{thread.needsReply && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">NEEDS REPLY</span>}{thread.unread > 0 && <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white">{thread.unread} NEW</span>}</div>
                  </div>
                </div>
              </button>;
            })}
            {!filtered.length && <div className="p-8 text-center text-sm text-slate-500">No conversations match this view.</div>}
          </div>
        </aside>

        <main className="flex min-w-0 flex-col bg-slate-50">
          {selected && conversation && agency ? <>
            <div className="border-b bg-white px-5 py-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><div className="grid h-11 w-11 place-items-center rounded-full bg-blue-100 font-bold text-blue-700">{selected.contactName.slice(0, 1).toUpperCase()}</div><div><h3 className="truncate text-xl font-semibold">{selected.contactName}</h3><p className="truncate text-sm text-slate-500">{selected.contactEmail}</p></div></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm"><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Building2 size={14} />{selected.agencyName}</span><span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Mail size={14} />{selected.subject}</span></div>
                </div>
                {selected.needsReply ? <Pill tone="warning">Buyer is waiting</Pill> : <Pill tone="success">Waiting on buyer</Pill>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-3xl space-y-4">
                {selected.messages.map((message) => {
                  const outbound = message.direction === 'outbound';
                  return <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${outbound ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold opacity-80"><UserRound size={13} />{outbound ? 'You · Data Market House' : selected.contactName}<span className="font-normal">{outbound ? 'sales@debtpaper.com' : message.fromEmail}</span></div>
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                      <p className="mt-2 text-[11px] opacity-70">{formatFull(message.createdAt)}</p>
                    </div>
                  </div>;
                })}
              </div>
            </div>

            <div className="border-t bg-white p-5">
              <div className="mx-auto max-w-3xl">
                <div className="mb-3 rounded-2xl border-2 border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">You are replying to</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{selected.contactName}</p><p className="text-sm text-slate-600">{selected.contactEmail} · {selected.agencyName}</p></div><p className="max-w-sm truncate text-sm font-medium text-slate-700">Re: {selected.subject}</p></div>
                </div>
                <div className="mb-3 flex gap-2"><button onClick={() => setMode('reply')} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === 'reply' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}><Send size={14} className="mr-2 inline" />Buyer reply</button><button onClick={() => setMode('note')} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === 'note' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}`}><StickyNote size={14} className="mr-2 inline" />Internal note</button></div>
                {mode === 'reply' ? <><textarea className={`${inputClass} min-h-28`} placeholder={`Write to ${selected.contactName}…`} value={reply} onChange={(event) => setReply(event.target.value)} /><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">This sends through sales@debtpaper.com and stays in this Gmail thread.</p><PrimaryButton onClick={sendBuyerReply}><Send size={16} className="mr-2" />Send to {selected.contactName}</PrimaryButton></div></> : <><textarea className={`${inputClass} min-h-24`} placeholder="Private note visible only inside DMHOUSE" value={note} onChange={(event) => setNote(event.target.value)} /><div className="mt-3 flex justify-end"><SecondaryButton onClick={saveNote}>Save internal note</SecondaryButton></div></>}
                {notice && <p className="mt-3 text-sm text-slate-600">{notice}</p>}
              </div>
            </div>
          </> : <div className="grid flex-1 place-items-center p-8 text-center text-slate-500"><div><Inbox size={36} className="mx-auto mb-3" /><p className="font-semibold">Select a buyer conversation</p><p className="mt-1 text-sm">The exact contact, company, and subject will always appear before you reply.</p></div></div>}
        </main>

        <aside className="border-t bg-white p-5 xl:border-l xl:border-t-0">
          <h4 className="font-semibold">Relationship context</h4>
          {selected && conversation && agency ? <div className="mt-5 space-y-5 text-sm">
            <Detail label="Contact" value={selected.contactName} />
            <Detail label="Email" value={selected.contactEmail} />
            <Detail label="Agency" value={selected.agencyName} />
            <Detail label="Subject" value={selected.subject} />
            <Detail label="Assigned employee" value={employee?.name || 'Unassigned'} />
            <Detail label="Linked deal" value={linkedDeal?.title || 'No active deal'} />
            <div className="grid grid-cols-2 gap-3"><Stat label="Messages" value={String(selected.messages.length)} /><Stat label="Unread" value={String(selected.unread)} /></div>
            {conversation.nextFollowUpAt && <div className="rounded-xl bg-amber-50 p-3 text-amber-800"><Clock3 size={15} className="mr-2 inline" />Follow-up {formatFull(conversation.nextFollowUpAt)}</div>}
            {internalNotes.length > 0 && <div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold">{internalNotes.length} internal note{internalNotes.length === 1 ? '' : 's'}</p><p className="mt-1 text-xs text-slate-500">Private company history stays with this relationship.</p></div>}
            <SecondaryButton className="w-full" onClick={() => setWorkflow(conversation.id, { status: 'ready_for_owner' })}><CheckCircle2 size={16} className="mr-2" />Ready for owner</SecondaryButton>
          </div> : <p className="mt-4 text-sm text-slate-500">Select a thread to see the buyer and deal context.</p>}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words font-medium text-slate-800">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>; }
function TestPanel({ tests, onSend }: { tests: any[]; onSend: (recipient: string, subject: string, body: string) => Promise<void> }) {
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('DMHOUSE email test');
  const [body, setBody] = useState('This is a live delivery test from Data Market House Sales OS.');
  const [message, setMessage] = useState('');
  return <Card className="mb-5 p-5"><div className="grid gap-3 md:grid-cols-3"><input className={inputClass} type="email" placeholder="Test recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} /><input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} /><PrimaryButton onClick={async () => { try { await onSend(recipient, subject, body); setMessage('Test sent.'); } catch (sendError) { setMessage(sendError instanceof Error ? sendError.message : 'Test failed.'); } }}>Send test</PrimaryButton><textarea className={`${inputClass} md:col-span-3`} value={body} onChange={(event) => setBody(event.target.value)} /></div>{message && <p className="mt-3 text-sm">{message}</p>}{tests[0] && <p className="mt-2 text-xs text-slate-500">Latest: {tests[0].recipient} · {tests[0].status}</p>}</Card>;
}
