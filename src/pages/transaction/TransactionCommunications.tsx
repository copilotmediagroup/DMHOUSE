import {
  ArrowRight,
  Clock3,
  Mail,
  MessageSquareText
} from 'lucide-react';
import {Link} from 'react-router-dom';
import {SecondaryButton} from '../../components/Primitives';
import {useConversationStore} from '../../store/ConversationStore';

function compact(value=''){
  return value
    .replace(/^>.*$/gm,'')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,180);
}

function when(value?:string){
  if(!value)return '';

  const date=new Date(value);

  return new Intl.DateTimeFormat('en-US',{
    month:'short',
    day:'numeric',
    hour:'numeric',
    minute:'2-digit'
  }).format(date);
}

export default function TransactionCommunications({
  role,
  buyerCompany,
  buyerName,
  buyerEmail
}:{
  role:'owner'|'employee';
  buyerCompany:string;
  buyerName?:string;
  buyerEmail:string;
}){
  const {
    messages
  }=useConversationStore();

  const normalizedEmail=buyerEmail.trim().toLowerCase();

  /*
   * Relationship-level communication match.
   *
   * We intentionally match both inbound and outbound addresses so
   * communications started inside DMHOUSE and replies received from
   * Google Workspace appear in the same transaction context.
   */
  const relevant=messages
    .filter(message=>{
      if(message.direction==='internal')return false;

      const from=(message.fromEmail||'').trim().toLowerCase();
      const to=(message.toEmail||'').trim().toLowerCase();

      return Boolean(
        normalizedEmail&&
        (from===normalizedEmail||to===normalizedEmail)
      );
    })
    .sort(
      (a,b)=>
        new Date(b.createdAt).getTime()-
        new Date(a.createdAt).getTime()
    );

  const latest=relevant[0];

  const latestInbound=relevant.find(
    message=>message.direction==='inbound'
  );

  const latestOutbound=relevant.find(
    message=>message.direction==='outbound'
  );

  const unread=relevant.filter(
    message=>
      message.direction==='inbound'&&
      !message.isRead
  ).length;

  const buyerWaiting=Boolean(
    latestInbound&&
    (
      !latestOutbound||
      new Date(latestInbound.createdAt).getTime()>
      new Date(latestOutbound.createdAt).getTime()
    )
  );

  const base=
    role==='employee'
      ?'/employee/conversations'
      :'/conversations';

  const destination=latest?.conversationId
    ?`${base}?conversation=${encodeURIComponent(latest.conversationId)}`
    :`${base}?compose=1`;

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
          Communications
        </p>

        {unread>0&&(
          <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white">
            {unread} NEW
          </span>
        )}
      </div>

      {!latest?(
        <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <Mail size={19}/>
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">
                No email conversation yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {buyerCompany} · {buyerEmail}
              </p>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                Start the first email without leaving DMHOUSE.
              </p>

              <Link
                to={`${base}?compose=1`}
              >
                <SecondaryButton className="mt-4">
                  <Mail className="mr-2" size={16}/>
                  Start Email
                </SecondaryButton>
              </Link>
            </div>
          </div>
        </div>
      ):(
        <div className={`mt-4 rounded-3xl border p-5 ${
          buyerWaiting
            ?'border-amber-200 bg-amber-50'
            :'border-blue-100 bg-blue-50'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white ${
              buyerWaiting
                ?'bg-amber-500'
                :'bg-blue-600'
            }`}>
              <MessageSquareText size={20}/>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">
                    {buyerName||buyerCompany}
                  </p>

                  <p className="mt-1 break-all text-xs text-slate-500">
                    {buyerEmail}
                  </p>
                </div>

                <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                  buyerWaiting
                    ?'bg-amber-100 text-amber-800'
                    :'bg-emerald-100 text-emerald-700'
                }`}>
                  {buyerWaiting
                    ?'BUYER WAITING'
                    :'WAITING ON BUYER'}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {latest.subject||'(No subject)'}
                  </p>

                  <span className="shrink-0 text-xs text-slate-400">
                    <Clock3 className="mr-1 inline" size={12}/>
                    {when(latest.createdAt)}
                  </span>
                </div>

                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {latest.direction==='inbound'
                    ?'Buyer'
                    :'Data Market House'}
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {compact(latest.body)||'Email message'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {relevant.length} message{relevant.length===1?'':'s'} in relationship history
                </p>

                <Link to={destination}>
                  <SecondaryButton>
                    Open Conversation
                    <ArrowRight className="ml-2" size={16}/>
                  </SecondaryButton>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
