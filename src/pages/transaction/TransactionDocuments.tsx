import {
  CheckCircle2,
  FileSignature,
  FileSpreadsheet,
  LockKeyhole
} from 'lucide-react';

function DocumentRow({
  icon,
  name,
  status,
  complete
}:{
  icon:React.ReactNode;
  name:string;
  status:string;
  complete:boolean;
}){
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${
          complete
            ?'bg-emerald-50 text-emerald-600'
            :'bg-slate-100 text-slate-400'
        }`}>
          {icon}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">{name}</p>
          <p className="mt-1 text-xs text-slate-500">{status}</p>
        </div>
      </div>

      {complete
        ?<CheckCircle2 className="text-emerald-600" size={20}/>
        :<LockKeyhole className="text-slate-300" size={18}/>
      }
    </div>
  );
}

export default function TransactionDocuments({
  ndaSigned,
  paSent,
  paSigned,
  unmaskedUploaded,
  released
}:{
  ndaSigned:boolean;
  paSent:boolean;
  paSigned:boolean;
  unmaskedUploaded:boolean;
  released:boolean;
}){
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
        Documents
      </p>

      <div className="mt-4 space-y-3">
        <DocumentRow
          icon={<FileSignature size={18}/>}
          name="NDA"
          complete={ndaSigned}
          status={ndaSigned?'Executed':'Waiting for buyer signature'}
        />

        <DocumentRow
          icon={<FileSignature size={18}/>}
          name="Purchase Agreement"
          complete={paSigned}
          status={
            paSigned
              ?'Executed'
              :paSent
                ?'Waiting for buyer signature'
                :'Not sent'
          }
        />

        <DocumentRow
          icon={<FileSpreadsheet size={18}/>}
          name="Final Portfolio"
          complete={released}
          status={
            released
              ?'Released to buyer'
              :unmaskedUploaded
                ?'Uploaded · locked until payment confirmation'
                :'Not uploaded'
          }
        />
      </div>
    </section>
  );
}
