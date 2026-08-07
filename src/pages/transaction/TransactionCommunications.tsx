import { MessageSquareText, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SecondaryButton } from '../../components/Primitives';

export default function TransactionCommunications({
  role,
  buyerCompany,
  buyerEmail
}:{
  role:'owner'|'employee';
  buyerCompany:string;
  buyerEmail:string;
}){
  const destination=
    role==='employee'
      ?'/employee/conversations'
      :'/conversations';

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
        Communications
      </p>

      <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white">
            <MessageSquareText size={20}/>
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-950">
              {buyerCompany}
            </p>

            <p className="mt-1 break-all text-sm text-slate-600">
              {buyerEmail}
            </p>

            <p className="mt-3 text-sm leading-6 text-blue-900">
              Open the Communications Hub to review buyer emails,
              replies and internal notes without leaving DMHOUSE.
            </p>

            <Link to={destination}>
              <SecondaryButton className="mt-4">
                <Send className="mr-2" size={16}/>
                Open Communications
              </SecondaryButton>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
