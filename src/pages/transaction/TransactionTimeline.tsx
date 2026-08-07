import { CheckCircle2, Clock3 } from 'lucide-react';

type Event={
  label:string;
  at:string|null;
};

export default function TransactionTimeline({
  createdAt,
  ndaSentAt,
  ndaSignedAt,
  purchaseSentAt,
  purchaseSignedAt,
  paymentConfirmedAt,
  releasedAt
}:{
  createdAt:string;
  ndaSentAt:string|null;
  ndaSignedAt:string|null;
  purchaseSentAt:string|null;
  purchaseSignedAt:string|null;
  paymentConfirmedAt:string|null;
  releasedAt:string|null;
}){
  const events:Event[]=[
    {label:'Transaction opened',at:createdAt},
    {label:'NDA sent',at:ndaSentAt},
    {label:'NDA signed',at:ndaSignedAt},
    {label:'Purchase Agreement sent',at:purchaseSentAt},
    {label:'Purchase Agreement signed',at:purchaseSignedAt},
    {label:'Payment confirmed by Owner',at:paymentConfirmedAt},
    {label:'Final portfolio automatically released',at:releasedAt}
  ];

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
        Transaction Timeline
      </p>

      <div className="mt-5">
        {events.map((event,index)=>{
          const complete=Boolean(event.at);

          return (
            <div key={event.label} className="relative flex gap-4 pb-6 last:pb-0">
              {index<events.length-1&&(
                <div className="absolute left-[17px] top-8 h-full w-px bg-slate-200"/>
              )}

              <div className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                complete
                  ?'bg-emerald-100 text-emerald-700'
                  :'bg-slate-100 text-slate-400'
              }`}>
                {complete
                  ?<CheckCircle2 size={16}/>
                  :<Clock3 size={15}/>
                }
              </div>

              <div className="pt-1">
                <p className={`text-sm font-semibold ${
                  complete?'text-slate-900':'text-slate-400'
                }`}>
                  {event.label}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {event.at
                    ?new Date(event.at).toLocaleString()
                    :'Pending'
                  }
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
