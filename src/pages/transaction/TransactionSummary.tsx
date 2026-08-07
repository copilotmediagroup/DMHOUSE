import { Building2, CircleDollarSign, Mail, UserRound, WalletCards } from 'lucide-react';

type Props={
  buyerCompany:string;
  buyerName:string;
  buyerEmail:string;
  portfolioName:string;
  askingPrice:number;
  accountCount:number;
  createdAt:string;
};

const money=(value:number)=>
  new Intl.NumberFormat('en-US',{
    style:'currency',
    currency:'USD',
    maximumFractionDigits:0
  }).format(Number(value||0));

function Detail({
  icon,
  label,
  value
}:{
  icon:React.ReactNode;
  label:string;
  value:string;
}){
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TransactionSummary({
  buyerCompany,
  buyerName,
  buyerEmail,
  portfolioName,
  askingPrice,
  accountCount,
  createdAt
}:Props){
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
        Transaction Summary
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Detail
          icon={<Building2 size={17}/>}
          label="Buyer"
          value={buyerCompany||'Buyer company'}
        />

        <Detail
          icon={<UserRound size={17}/>}
          label="Contact"
          value={buyerName||'Buyer contact'}
        />

        <Detail
          icon={<Mail size={17}/>}
          label="Email"
          value={buyerEmail||'No email'}
        />

        <Detail
          icon={<WalletCards size={17}/>}
          label="Portfolio"
          value={portfolioName}
        />

        <Detail
          icon={<CircleDollarSign size={17}/>}
          label="Purchase Price"
          value={money(askingPrice)}
        />

        <Detail
          icon={<WalletCards size={17}/>}
          label="Accounts"
          value={Number(accountCount||0).toLocaleString()}
        />
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Transaction opened {new Date(createdAt).toLocaleString()}
      </p>
    </section>
  );
}
