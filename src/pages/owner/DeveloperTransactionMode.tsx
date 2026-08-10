import {
  CheckCircle2,
  FlaskConical,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldAlert
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
  PrimaryButton,
  SecondaryButton
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

function isDeveloperTransaction(
  transaction:TransactionRow
){
  const value=
    `${transaction.buyer_company} ${transaction.buyer_name} ${transaction.buyer_email}`
      .toUpperCase();

  return (
    value.includes('TEST')||
    value.includes('DEV')
  );
}

function currentStage(
  transaction:TransactionRow
){
  if(transaction.closed_at){
    return 'Deal Complete';
  }

  if(transaction.final_file_released_at){
    return 'Final Released';
  }

  if(transaction.payment_confirmed_at){
    return 'Payment Confirmed';
  }

  if(
    transaction.purchase_status===
    'fully_executed'
  ){
    return 'Purchase Agreement Signed';
  }

  if(
    transaction.purchase_status===
      'sent_to_buyer'||
    transaction.purchase_status===
      'seller_signed'
  ){
    return 'Purchase Agreement Sent';
  }

  if(
    transaction.nda_status===
    'fully_executed'
  ){
    return 'NDA Signed';
  }

  if(transaction.nda_status){
    return 'NDA Sent';
  }

  return 'Transaction Created';
}

export default function DeveloperTransactionMode(){

  const {
    profile,
    role
  }=usePortfolioStore();

  const [rows,setRows]=
    useState<TransactionRow[]>([]);

  const [selectedId,setSelectedId]=
    useState('');

  const [loading,setLoading]=
    useState(true);

  const [busy,setBusy]=
    useState('');

  const [message,setMessage]=
    useState('');

  const [error,setError]=
    useState('');

  const [armed,setArmed]=
    useState(false);

  const load=useCallback(async()=>{

    if(
      !profile||
      role!=='owner'
    ){
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try{

      const result=
        await supabase.rpc(
          'dmh_staff_transaction_workspace'
        );

      if(result.error){
        throw result.error;
      }

      const all=
        (result.data||[]) as TransactionRow[];

      const developerRows=
        all.filter(
          isDeveloperTransaction
        );

      setRows(developerRows);

      if(
        developerRows.length&&
        !developerRows.some(
          item=>item.room_id===selectedId
        )
      ){
        setSelectedId(
          developerRows[0].room_id
        );
      }

    }catch(reason){

      setError(
        reason instanceof Error
          ?reason.message
          :'Unable to load developer transactions.'
      );

    }finally{

      setLoading(false);

    }

  },[
    profile,
    role,
    selectedId
  ]);

  useEffect(()=>{
    void load();
  },[load]);

  const selected=useMemo(
    ()=>
      rows.find(
        item=>item.room_id===selectedId
      )||null,
    [
      rows,
      selectedId
    ]
  );

  async function refresh(){
    await load();
  }

  async function getLatestDocument(
    type:'nda'|'purchase_agreement'
  ){

    if(!selected){
      throw new Error(
        'Select a developer transaction.'
      );
    }

    const result=
      await supabase
        .from(
          'deal_documents_generated'
        )
        .select(
          'id,document_type,status'
        )
        .eq(
          'room_id',
          selected.room_id
        )
        .eq(
          'document_type',
          type
        )
        .order(
          'created_at',
          {ascending:false}
        )
        .limit(1)
        .maybeSingle();

    if(result.error){
      throw result.error;
    }

    return result.data;
  }

  async function simulateNdaSigned(){

    if(
      !selected||
      !armed
    ){
      return;
    }

    setBusy('nda');
    setMessage('');
    setError('');

    try{

      const document=
        await getLatestDocument(
          'nda'
        );

      if(!document){
        throw new Error(
          'This TEST transaction has no NDA yet. Send the NDA normally once, then Developer Mode can advance it.'
        );
      }

      const now=
        new Date().toISOString();

      const result=
        await supabase
          .from(
            'deal_documents_generated'
          )
          .update({
            status:'fully_executed',
            buyer_signed_at:now,
            updated_at:now
          })
          .eq(
            'id',
            document.id
          );

      if(result.error){
        throw result.error;
      }

      setMessage(
        'Developer simulation: NDA marked fully executed.'
      );

      await refresh();

    }catch(reason){

      setError(
        reason instanceof Error
          ?reason.message
          :'Unable to simulate NDA signature.'
      );

    }finally{

      setBusy('');

    }

  }

  async function simulatePurchaseSigned(){

    if(
      !selected||
      !armed
    ){
      return;
    }

    setBusy('purchase');
    setMessage('');
    setError('');

    try{

      const document=
        await getLatestDocument(
          'purchase_agreement'
        );

      if(!document){
        throw new Error(
          'This TEST transaction has no Purchase Agreement yet. Send it normally once, then Developer Mode can advance it.'
        );
      }

      const now=
        new Date().toISOString();

      const result=
        await supabase
          .from(
            'deal_documents_generated'
          )
          .update({
            status:'fully_executed',
            buyer_signed_at:now,
            updated_at:now
          })
          .eq(
            'id',
            document.id
          );

      if(result.error){
        throw result.error;
      }

      setMessage(
        'Developer simulation: Purchase Agreement marked fully executed.'
      );

      await refresh();

    }catch(reason){

      setError(
        reason instanceof Error
          ?reason.message
          :'Unable to simulate Purchase Agreement signature.'
      );

    }finally{

      setBusy('');

    }

  }

  if(role!=='owner'){
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card className="border-red-200 bg-red-50 p-8">
          <LockKeyhole
            className="text-red-600"
            size={32}
          />

          <h1 className="mt-4 text-2xl font-semibold text-red-950">
            Owner access only
          </h1>

          <p className="mt-2 text-sm text-red-800">
            Developer Transaction Mode is restricted to the DMHOUSE Owner.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1300px] p-5 md:p-8 lg:p-10">

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-700">
              <FlaskConical size={22}/>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">
                Developer Mode
              </p>

              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                Transaction Simulator
              </h1>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
            Skip repetitive buyer-signature steps while testing the real DMHOUSE transaction engine.
            Only transactions containing TEST or DEV in the buyer identity are available here.
          </p>
        </div>

        <div className="flex gap-2">
          <SecondaryButton
            onClick={()=>void refresh()}
          >
            <RefreshCw
              className="mr-2"
              size={16}
            />
            Refresh
          </SecondaryButton>

          <Link to="/transactions">
            <PrimaryButton>
              Open Transactions
            </PrimaryButton>
          </Link>
        </div>
      </header>

      <Card className="mt-7 border-amber-200 bg-amber-50 p-5">
        <div className="flex gap-4">
          <ShieldAlert
            className="mt-0.5 shrink-0 text-amber-700"
            size={23}
          />

          <div>
            <p className="font-bold text-amber-950">
              Safety boundary
            </p>

            <p className="mt-1 text-sm leading-6 text-amber-800">
              Developer Mode does not fake Owner payment confirmation,
              final release, revenue, commissions, or deal closing.
              Those final steps still run through the real transaction engine.
            </p>
          </div>
        </div>
      </Card>

      {message&&(
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      )}

      {error&&(
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-7 grid gap-6 xl:grid-cols-[.75fr_1.25fr]">

        <Card className="p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
            Developer transaction
          </p>

          <h2 className="mt-2 text-xl font-semibold">
            Select TEST deal
          </h2>

          {loading?(
            <p className="mt-6 text-sm text-slate-500">
              Loading test transactions…
            </p>
          ):rows.length===0?(
            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <p className="font-semibold">
                No TEST transactions found
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Create or use a buyer whose company, contact name,
                or email contains TEST or DEV. Developer Mode will
                automatically recognize it.
              </p>
            </div>
          ):(
            <>
              <select
                value={selectedId}
                onChange={event=>{
                  setSelectedId(
                    event.target.value
                  );
                  setArmed(false);
                  setMessage('');
                  setError('');
                }}
                className="mt-5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400"
              >
                {rows.map(
                  transaction=>(
                    <option
                      key={transaction.room_id}
                      value={transaction.room_id}
                    >
                      {transaction.buyer_company}
                      {' — '}
                      {transaction.portfolio_name}
                    </option>
                  )
                )}
              </select>

              {selected&&(
                <div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-5">
                  <Mini
                    label="Buyer"
                    value={
                      selected.buyer_company||
                      selected.buyer_name
                    }
                  />

                  <Mini
                    label="Portfolio"
                    value={
                      selected.portfolio_name
                    }
                  />

                  <Mini
                    label="Current stage"
                    value={
                      currentStage(
                        selected
                      )
                    }
                  />

                  <Mini
                    label="Room"
                    value={
                      selected.room_id.slice(
                        0,
                        12
                      )+'…'
                    }
                  />
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-[#091221] p-6 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">
                  Fast-path testing
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Advance test transaction
                </h2>
              </div>

              {selected&&(
                <Pill tone="blue">
                  {currentStage(
                    selected
                  )}
                </Pill>
              )}
            </div>
          </div>

          <div className="p-6">
            {!selected?(
              <p className="text-sm text-slate-500">
                Select a TEST transaction first.
              </p>
            ):(
              <>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={armed}
                    onChange={
                      event=>
                        setArmed(
                          event.target.checked
                        )
                    }
                    className="mt-1 h-4 w-4"
                  />

                  <div>
                    <p className="font-semibold">
                      Arm Developer Mode
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      I confirm this is a TEST/DEV buyer and understand these buttons change its real transaction records.
                    </p>
                  </div>
                </label>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Action
                    title="Mark NDA Signed"
                    detail="Skips the buyer NDA signing step."
                    complete={
                      selected.nda_status===
                      'fully_executed'
                    }
                    disabled={
                      !armed||
                      busy!==''
                    }
                    busy={
                      busy==='nda'
                    }
                    onClick={
                      ()=>void simulateNdaSigned()
                    }
                  />

                  <Action
                    title="Mark Purchase Agreement Signed"
                    detail="Skips the buyer Purchase Agreement signing step."
                    complete={
                      selected.purchase_status===
                      'fully_executed'
                    }
                    disabled={
                      !armed||
                      busy!==''
                    }
                    busy={
                      busy==='purchase'
                    }
                    onClick={
                      ()=>void simulatePurchaseSigned()
                    }
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <p className="font-semibold text-blue-950">
                    Final financial test
                  </p>

                  <p className="mt-2 text-sm leading-6 text-blue-800">
                    Once Purchase Agreement Signed is complete,
                    open the exact transaction below and use the
                    real Owner Confirm Payment action. That tests
                    payment confirmation, final release, sale creation,
                    revenue and employee commission together.
                  </p>

                  <Link
                    to={
                      '/transactions?room='+
                      encodeURIComponent(
                        selected.room_id
                      )
                    }
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    <Play
                      className="mr-2"
                      size={16}
                    />
                    Open Exact Transaction
                  </Link>
                </div>
              </>
            )}
          </div>
        </Card>

      </div>

      {selected&&(
        <Card className="mt-6 p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
            Test progression
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-5">
            <Stage
              label="NDA"
              done={
                Boolean(
                  selected.nda_status
                )
              }
            />

            <Stage
              label="NDA Signed"
              done={
                selected.nda_status===
                'fully_executed'
              }
            />

            <Stage
              label="Agreement Signed"
              done={
                selected.purchase_status===
                'fully_executed'
              }
            />

            <Stage
              label="Payment"
              done={
                Boolean(
                  selected.payment_confirmed_at
                )
              }
            />

            <Stage
              label="Deal Complete"
              done={
                Boolean(
                  selected.closed_at||
                  selected.final_file_released_at
                )
              }
            />
          </div>
        </Card>
      )}

    </div>
  );
}

function Mini({
  label,
  value
}:{
  label:string;
  value:string;
}){
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-slate-900">
        {value||'—'}
      </p>
    </div>
  );
}

function Action({
  title,
  detail,
  complete,
  disabled,
  busy,
  onClick
}:{
  title:string;
  detail:string;
  complete:boolean;
  disabled:boolean;
  busy:boolean;
  onClick:()=>void;
}){
  return (
    <div
      className={
        'rounded-2xl border p-5 '+
        (
          complete
            ?'border-emerald-200 bg-emerald-50'
            :'border-slate-200 bg-white'
        )
      }
    >
      {complete?(
        <CheckCircle2
          className="text-emerald-600"
          size={24}
        />
      ):(
        <FlaskConical
          className="text-violet-600"
          size={24}
        />
      )}

      <p className="mt-4 font-semibold">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500">
        {detail}
      </p>

      <PrimaryButton
        className="mt-5 w-full"
        disabled={
          disabled||
          complete
        }
        onClick={onClick}
      >
        {complete
          ?'Complete'
          :busy
            ?'Simulating…'
            :'Simulate'
        }
      </PrimaryButton>
    </div>
  );
}

function Stage({
  label,
  done
}:{
  label:string;
  done:boolean;
}){
  return (
    <div
      className={
        'rounded-2xl border p-4 '+
        (
          done
            ?'border-emerald-200 bg-emerald-50'
            :'border-slate-200 bg-slate-50'
        )
      }
    >
      <div
        className={
          'grid h-7 w-7 place-items-center rounded-full text-xs font-bold '+
          (
            done
              ?'bg-emerald-600 text-white'
              :'bg-slate-200 text-slate-500'
          )
        }
      >
        {done?'✓':'·'}
      </div>

      <p
        className={
          'mt-3 text-xs font-semibold '+
          (
            done
              ?'text-emerald-800'
              :'text-slate-500'
          )
        }
      >
        {label}
      </p>
    </div>
  );
}
