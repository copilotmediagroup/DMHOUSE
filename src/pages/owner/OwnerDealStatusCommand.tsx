import {
  CheckCircle2,
  Clock3,
  FileSignature,
  ShieldCheck,
  UserRound,
  WalletCards
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {Link} from 'react-router-dom';
import {
  Card,
  Pill,
  PrimaryButton
} from '../../components/Primitives';
import {supabase} from '../../lib/supabase';
import {usePortfolioStore} from '../../store/PortfolioStore';

type TransactionRow={
  room_id:string;
  buyer_id:string;
  buyer_user_id:string|null;
  buyer_name:string;
  buyer_company:string;
  buyer_email:string;

  portfolio_id:string;
  portfolio_name:string;

  status:string;

  nda_status:string|null;
  nda_sent_at:string|null;
  nda_buyer_signed_at:string|null;

  purchase_status:string|null;
  purchase_sent_at:string|null;
  purchase_buyer_signed_at:string|null;

  payment_confirmed_at:string|null;
  final_file_released_at:string|null;
  closed_at:string|null;

  employee_id:string|null;

  created_at:string;
  updated_at:string;
};

type Employee={
  id:string;
  full_name:string;
};

type CommandStage=
  |'nda_wait'
  |'purchase_ready'
  |'purchase_wait'
  |'owner_payment'
  |'release'
  |'complete';

function stageOf(t:TransactionRow):CommandStage{

  if(t.final_file_released_at){
    return 'complete';
  }

  if(t.payment_confirmed_at){
    return 'release';
  }

  if(t.purchase_status==='fully_executed'){
    return 'owner_payment';
  }

  if(
    t.purchase_status==='sent_to_buyer'||
    t.purchase_status==='seller_signed'
  ){
    return 'purchase_wait';
  }

  if(t.nda_status==='fully_executed'){
    return 'purchase_ready';
  }

  return 'nda_wait';
}

function stageLabel(stage:CommandStage){

  switch(stage){

    case 'nda_wait':
      return 'Waiting on NDA';

    case 'purchase_ready':
      return 'Purchase Agreement Ready';

    case 'purchase_wait':
      return 'Waiting on Agreement';

    case 'owner_payment':
      return 'Owner Payment Action';

    case 'release':
      return 'Payment Confirmed';

    case 'complete':
      return 'Complete';
  }
}

function stageDetail(stage:CommandStage){

  switch(stage){

    case 'nda_wait':
      return 'Buyer must sign NDA.';

    case 'purchase_ready':
      return 'Employee needs to send Purchase Agreement.';

    case 'purchase_wait':
      return 'Buyer needs to sign Purchase Agreement.';

    case 'owner_payment':
      return 'Purchase Agreement signed. Owner must verify cleared funds.';

    case 'release':
      return 'Payment confirmed. Verify final release state.';

    case 'complete':
      return 'Final portfolio released.';
  }
}

function stageTone(
  stage:CommandStage
):'success'|'warning'|'blue'|'neutral'{

  if(stage==='complete'){
    return 'success';
  }

  if(
    stage==='owner_payment'||
    stage==='release'
  ){
    return 'warning';
  }

  if(stage==='purchase_ready'){
    return 'blue';
  }

  return 'neutral';
}

function niceDate(value:string|null){

  if(!value){
    return '—';
  }

  const d=new Date(value);

  return Number.isNaN(d.getTime())
    ?'—'
    :d.toLocaleString();
}

export default function OwnerDealStatusCommand(){

  const {profile}=usePortfolioStore();

  const [rows,setRows]=
    useState<TransactionRow[]>([]);

  const [employees,setEmployees]=
    useState<Employee[]>([]);

  const [loading,setLoading]=
    useState(true);

  const [error,setError]=
    useState('');

  const load=useCallback(async()=>{

    if(!profile){
      setRows([]);
      setEmployees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try{

      const [
        workspaceResult,
        employeeResult
      ]=await Promise.all([

        supabase.rpc(
          'dmh_staff_transaction_workspace'
        ),

        supabase
          .from('profiles')
          .select('id,full_name')
          .eq(
            'company_id',
            profile.company_id
          )
          .eq(
            'role',
            'employee'
          )

      ]);

      if(workspaceResult.error){
        throw workspaceResult.error;
      }

      if(employeeResult.error){
        throw employeeResult.error;
      }

      setRows(
        (workspaceResult.data||[]) as TransactionRow[]
      );

      setEmployees(
        (employeeResult.data||[]) as Employee[]
      );

    }catch(reason){

      setError(
        reason instanceof Error
          ?reason.message
          :'Unable to load company transactions.'
      );

    }finally{

      setLoading(false);

    }

  },[profile]);

  useEffect(()=>{

    void load();

    const channel=
      supabase
        .channel(
          'owner-deal-status-command'
        )
        .on(
          'postgres_changes',
          {
            event:'*',
            schema:'public',
            table:'buyer_deal_rooms'
          },
          ()=>void load()
        )
        .on(
          'postgres_changes',
          {
            event:'*',
            schema:'public',
            table:'deal_documents_generated'
          },
          ()=>void load()
        )
        .subscribe();

    return ()=>{
      void supabase.removeChannel(channel);
    };

  },[load]);


  const employeeNames=useMemo(
    ()=>new Map(
      employees.map(
        employee=>[
          employee.id,
          employee.full_name
        ]
      )
    ),
    [employees]
  );


  const classified=useMemo(
    ()=>rows.map(row=>({
      row,
      stage:stageOf(row)
    })),
    [rows]
  );


  const waitingNda=
    classified.filter(
      x=>x.stage==='nda_wait'
    );


  const employeePurchaseAction=
    classified.filter(
      x=>x.stage==='purchase_ready'
    );


  const waitingAgreement=
    classified.filter(
      x=>x.stage==='purchase_wait'
    );


  const ownerPaymentAction=
    classified.filter(
      x=>x.stage==='owner_payment'
    );


  const paymentConfirmed=
    classified.filter(
      x=>x.stage==='release'
    );


  const complete=
    classified.filter(
      x=>x.stage==='complete'
    );


  const ownerPriority=[
    ...ownerPaymentAction,
    ...paymentConfirmed
  ];


  const active=
    classified.filter(
      x=>x.stage!=='complete'
    );


  const closedToday=
    complete.filter(({row})=>{

      const value=
        row.final_file_released_at||
        row.closed_at;

      if(!value){
        return false;
      }

      const date=new Date(value);
      const now=new Date();

      return (
        date.getFullYear()===
          now.getFullYear() &&
        date.getMonth()===
          now.getMonth() &&
        date.getDate()===
          now.getDate()
      );

    });


  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8 lg:p-10">

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">

        <div>

          <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-600">
            Owner transaction command
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Every deal. Every employee. One screen.
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Live visibility from NDA through Purchase Agreement,
            payment confirmation and final portfolio release.
          </p>

        </div>

        <PrimaryButton
          onClick={()=>void load()}
          disabled={loading}
        >
          {loading
            ?'Refreshing…'
            :'Refresh command'
          }
        </PrimaryButton>

      </header>


      {error&&(
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}


      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">

        <Metric
          label="Active Deals"
          value={active.length}
          icon={<Clock3 size={19}/>}
        />

        <Metric
          label="Waiting NDA"
          value={waitingNda.length}
          icon={<ShieldCheck size={19}/>}
        />

        <Metric
          label="Employee Action"
          value={employeePurchaseAction.length}
          icon={<UserRound size={19}/>}
        />

        <Metric
          label="Waiting Agreement"
          value={waitingAgreement.length}
          icon={<FileSignature size={19}/>}
        />

        <Metric
          label="Owner Action"
          value={ownerPriority.length}
          icon={<WalletCards size={19}/>}
          alert={ownerPriority.length>0}
        />

        <Metric
          label="Closed Today"
          value={closedToday.length}
          icon={<CheckCircle2 size={19}/>}
        />

      </div>


      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">

        <Card className="overflow-hidden">

          <div className="border-b border-slate-100 p-6">

            <div className="flex items-center justify-between gap-4">

              <div>

                <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-600">
                  Owner priorities
                </p>

                <h2 className="mt-1 text-xl font-semibold">
                  Deals waiting on you
                </h2>

              </div>

              <Pill
                tone={
                  ownerPriority.length
                    ?'warning'
                    :'success'
                }
              >
                {ownerPriority.length}
              </Pill>

            </div>

          </div>


          {ownerPriority.length===0?(
            <div className="p-10 text-center">

              <CheckCircle2
                className="mx-auto text-emerald-500"
                size={36}
              />

              <p className="mt-4 font-semibold">
                No Owner transaction actions waiting.
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Signed agreements and payment-release actions
                will appear here automatically.
              </p>

            </div>
          ):(
            <div className="divide-y divide-slate-100">

              {ownerPriority.map(({row,stage})=>(

                <DealRow
                  key={row.room_id}
                  row={row}
                  stage={stage}
                  employeeName={
                    row.employee_id
                      ?employeeNames.get(
                          row.employee_id
                        )||'Employee'
                      :'Unassigned'
                  }
                />

              ))}

            </div>
          )}

        </Card>


        <Card className="overflow-hidden">

          <div className="border-b border-slate-100 p-6">

            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">
              Team execution
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              Who needs to move next
            </h2>

          </div>


          <div className="divide-y divide-slate-100">

            <QueueLine
              label="Waiting for buyer NDA"
              count={waitingNda.length}
              detail="Buyer action"
            />

            <QueueLine
              label="Send Purchase Agreement"
              count={employeePurchaseAction.length}
              detail="Employee action"
              highlight
            />

            <QueueLine
              label="Waiting for agreement signature"
              count={waitingAgreement.length}
              detail="Buyer action"
            />

            <QueueLine
              label="Confirm payment / release"
              count={ownerPriority.length}
              detail="Owner action"
              alert={ownerPriority.length>0}
            />

            <QueueLine
              label="Completed transactions"
              count={complete.length}
              detail="Closed"
            />

          </div>

        </Card>

      </div>


      <Card className="mt-6 overflow-hidden">

        <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
              Company deal ledger
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              All secure transactions
            </h2>

          </div>

          <Link
            to="/transactions"
            className="text-sm font-bold text-blue-600 hover:text-blue-700"
          >
            Open Transaction Desk
          </Link>

        </div>


        {loading&&!rows.length?(
          <div className="p-10 text-center text-sm text-slate-500">
            Loading company transactions…
          </div>
        ):rows.length===0?(
          <div className="p-10 text-center text-sm text-slate-500">
            No secure transactions yet.
          </div>
        ):(
          <div className="divide-y divide-slate-100">

            {classified.map(({row,stage})=>(

              <DealRow
                key={row.room_id}
                row={row}
                stage={stage}
                employeeName={
                  row.employee_id
                    ?employeeNames.get(
                        row.employee_id
                      )||'Employee'
                    :'Unassigned'
                }
              />

            ))}

          </div>
        )}

      </Card>

    </div>
  );
}


function Metric({
  label,
  value,
  icon,
  alert=false
}:{
  label:string;
  value:number;
  icon:React.ReactNode;
  alert?:boolean;
}){

  return (
    <Card
      className={
        'p-5 '+
        (
          alert
            ?'border-amber-200 bg-amber-50'
            :''
        )
      }
    >

      <div className="flex items-center justify-between">

        <div
          className={
            'grid h-10 w-10 place-items-center rounded-2xl '+
            (
              alert
                ?'bg-amber-100 text-amber-700'
                :'bg-blue-50 text-blue-600'
            )
          }
        >
          {icon}
        </div>

        {alert&&(
          <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Action
          </span>
        )}

      </div>

      <p className="mt-4 text-3xl font-semibold text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

    </Card>
  );
}


function QueueLine({
  label,
  count,
  detail,
  highlight=false,
  alert=false
}:{
  label:string;
  count:number;
  detail:string;
  highlight?:boolean;
  alert?:boolean;
}){

  return (
    <div className="flex items-center justify-between gap-4 p-5">

      <div>

        <p className="font-semibold text-slate-900">
          {label}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {detail}
        </p>

      </div>

      <span
        className={
          'grid h-10 min-w-10 place-items-center rounded-xl px-3 text-sm font-bold '+
          (
            alert
              ?'bg-amber-100 text-amber-800'
              :highlight
                ?'bg-blue-100 text-blue-700'
                :'bg-slate-100 text-slate-700'
          )
        }
      >
        {count}
      </span>

    </div>
  );
}


function DealRow({
  row,
  stage,
  employeeName
}:{
  row:TransactionRow;
  stage:CommandStage;
  employeeName:string;
}){

  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-center">

      <div className="min-w-0">

        <p className="truncate font-semibold text-slate-950">
          {row.buyer_company||row.buyer_name}
        </p>

        <p className="mt-1 truncate text-sm text-slate-500">
          {row.portfolio_name}
        </p>

      </div>


      <div>

        <Pill tone={stageTone(stage)}>
          {stageLabel(stage)}
        </Pill>

        <p className="mt-2 text-xs leading-5 text-slate-500">
          {stageDetail(stage)}
        </p>

      </div>


      <div>

        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Employee
        </p>

        <p className="mt-1 text-sm font-semibold text-slate-700">
          {employeeName}
        </p>

        <p className="mt-1 text-xs text-slate-400">
          Updated {niceDate(row.updated_at)}
        </p>

      </div>


      <Link
        to={
          '/transactions?room='+
          encodeURIComponent(
            row.room_id
          )
        }
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
      >
        Open Deal
      </Link>

    </div>
  );
}
