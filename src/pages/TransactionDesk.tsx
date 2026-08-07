import {
  CheckCircle2,
  Clock3,
  FileSignature,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
  WalletCards
} from 'lucide-react';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Card,PrimaryButton,SecondaryButton} from '../components/Primitives';
import {buildAgreementHtml} from '../components/AgreementDocument';
import {
  useAgreementStore,
  type AgreementFields
} from '../store/AgreementStore';
import {usePortfolioStore} from '../store/PortfolioStore';
import {supabase} from '../lib/supabase';

type Transaction={
  room_id:string;
  buyer_id:string;
  buyer_user_id:string|null;
  buyer_name:string;
  buyer_company:string;
  buyer_email:string;

  portfolio_id:string;
  portfolio_name:string;
  asking_price:number;
  account_count:number;

  status:string;
  agreement_approved_at:string|null;
  payment_confirmed_at:string|null;
  final_file_released_at:string|null;
  closed_at:string|null;
  created_at:string;
  updated_at:string;

  nda_document_id:string|null;
  nda_document_buyer_id:string|null;
  nda_status:string|null;
  nda_field_values:AgreementFields|null;
  nda_seller_name:string|null;
  nda_seller_title:string|null;
  nda_sent_at:string|null;
  nda_buyer_signed_at:string|null;
  employee_id:string|null;

  purchase_document_id:string|null;
  purchase_status:string|null;
  purchase_sent_at:string|null;
  purchase_buyer_signed_at:string|null;

  unmasked_uploaded:boolean;
};

const money=(value:number|null|undefined)=>
  new Intl.NumberFormat('en-US',{
    style:'currency',
    currency:'USD',
    maximumFractionDigits:0
  }).format(Number(value||0));

function transactionStage(t:Transaction){
  if(t.final_file_released_at)return 5;
  if(t.purchase_status==='fully_executed')return 4;
  if(t.purchase_status==='sent_to_buyer'||t.purchase_status==='seller_signed')return 3;
  if(t.nda_status==='fully_executed')return 2;
  return 1;
}

function stageName(t:Transaction){
  if(t.final_file_released_at)return 'Deal Complete';
  if(t.payment_confirmed_at)return 'Payment Confirmed';
  if(t.purchase_status==='fully_executed')return 'Purchase Agreement Signed';
  if(t.purchase_status==='sent_to_buyer'||t.purchase_status==='seller_signed')
    return 'Purchase Agreement Sent';
  if(t.nda_status==='fully_executed')return 'NDA Signed';
  return 'Waiting for NDA Signature';
}

function Step({
  complete,
  active,
  label
}:{
  complete:boolean;
  active:boolean;
  label:string;
}){
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
        complete
          ?'bg-emerald-100 text-emerald-700'
          :active
            ?'bg-blue-600 text-white'
            :'bg-slate-100 text-slate-400'
      }`}>
        {complete?<CheckCircle2 size={17}/>:<span className="h-2 w-2 rounded-full bg-current"/>}
      </div>
      <p className={`text-sm ${active?'font-semibold text-slate-950':'text-slate-500'}`}>
        {label}
      </p>
    </div>
  );
}

export default function TransactionDesk(){
  const {
    profile,
    uploadPortfolioFile
  }=usePortfolioStore();

  const {
    save,
    sign,
    send,
    workflowState
  }=useAgreementStore();

  const [transactions,setTransactions]=useState<Transaction[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');

  const role=profile?.role==='owner'?'owner':'employee';

  const load=useCallback(async()=>{
    if(!profile)return;

    setLoading(true);

    const {data,error}=await supabase.rpc(
      'dmh_staff_transaction_workspace'
    );

    if(error){
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setTransactions((data||[]) as Transaction[]);
    setLoading(false);
  },[profile]);

  useEffect(()=>{
    void load();

    const channel=supabase
      .channel('dmh-simple-transaction-desk')
      .on(
        'postgres_changes',
        {event:'*',schema:'public',table:'buyer_deal_rooms'},
        ()=>void load()
      )
      .on(
        'postgres_changes',
        {event:'*',schema:'public',table:'deal_documents_generated'},
        ()=>void load()
      )
      .subscribe();

    return()=>{
      void supabase.removeChannel(channel);
    };
  },[load]);

  const counts=useMemo(()=>({
    total:transactions.length,
    waitingNda:transactions.filter(x=>x.nda_status!=='fully_executed').length,
    readyAgreement:transactions.filter(
      x=>x.nda_status==='fully_executed'&&!x.purchase_document_id
    ).length,
    waitingOwner:transactions.filter(
      x=>x.purchase_status==='fully_executed'&&!x.final_file_released_at
    ).length
  }),[transactions]);

  async function sendPurchaseAgreement(t:Transaction){
    setBusy(t.room_id);
    setMessage('');

    try{
      if(t.nda_status!=='fully_executed'){
        throw new Error('Buyer must sign the NDA first.');
      }

      if(!t.nda_field_values){
        throw new Error('The executed NDA document data is unavailable.');
      }

      if(t.purchase_status==='sent_to_buyer'){
        throw new Error('Purchase Agreement is already waiting for the buyer.');
      }

      if(t.purchase_status==='fully_executed'){
        throw new Error('Purchase Agreement is already signed.');
      }

      let documentId=t.purchase_document_id||'';

      const {data:paymentSettings,error:paymentError}=
        await supabase.rpc('dmh_get_company_payment_settings');

      if(paymentError)throw paymentError;

      if(
        !paymentSettings?.beneficiary_name||
        !paymentSettings?.bank_name||
        !paymentSettings?.routing_number||
        !paymentSettings?.account_number
      ){
        throw new Error(
          'Owner must complete Payment & Wire Instructions before a Purchase Agreement can be sent.'
        );
      }

      const fields:AgreementFields={
        ...t.nda_field_values,
        deliveryMethod:'Secure Deal Room',
        deliveryDeadline:'After confirmed payment',
        paymentTerms:
          paymentSettings.payment_terms||
          'Payment in full by wire transfer before final portfolio release.',
        wireBeneficiary:paymentSettings.beneficiary_name||'',
        wireBankName:paymentSettings.bank_name||'',
        wireBankAddress:paymentSettings.bank_address||'',
        wireRoutingNumber:paymentSettings.routing_number||'',
        wireAccountNumber:paymentSettings.account_number||'',
        wireSwiftBic:paymentSettings.swift_bic||'',
        wireReference:paymentSettings.wire_reference||'',
        wirePaymentDeadline:paymentSettings.payment_deadline||'',
        wireAdditionalInstructions:
          paymentSettings.additional_instructions||''
      };

      const html=buildAgreementHtml(
        'purchase_agreement',
        fields,
        false
      );

      if(!documentId){
        documentId=await save({
          roomId:t.room_id,
          buyerId:t.nda_document_buyer_id||t.buyer_user_id||t.buyer_id,
          portfolioId:t.portfolio_id,
          type:'purchase_agreement',
          title:`Purchase Agreement — ${t.portfolio_name}`,
          fields,
          html
        });
      }else{
        const existingState=await workflowState(documentId);

        if(existingState?.buyerSigned){
          throw new Error(
            'This Purchase Agreement has already been signed by the buyer and cannot be regenerated.'
          );
        }

        await save({
          documentId,
          roomId:t.room_id,
          buyerId:t.nda_document_buyer_id||t.buyer_user_id||t.buyer_id,
          portfolioId:t.portfolio_id,
          type:'purchase_agreement',
          title:`Purchase Agreement — ${t.portfolio_name}`,
          fields,
          html
        });
      }

      const state=await workflowState(documentId);

      if(!state?.sellerSigned){
        const signer=
          t.nda_seller_name||
          fields.sellerName||
          (profile as any)?.full_name||
          'Data Market House';

        const title=
          t.nda_seller_title||
          fields.sellerTitle||
          'Portfolio Sales Specialist';

        await sign(
          documentId,
          signer,
          title,
          'script'
        );
      }

      await send(
        documentId,
        'Purchase Agreement Ready for Signature',
        'Your Purchase Agreement is ready. Review and sign it securely inside your Data Market House Buyer Portal.'
      );

      setMessage(`Purchase Agreement sent to ${t.buyer_email}.`);
      await load();

    }catch(error){
      setMessage(
        error instanceof Error
          ?error.message
          :'Unable to send Purchase Agreement.'
      );
    }finally{
      setBusy('');
    }
  }

  async function uploadFinalFile(t:Transaction,file:File){
    setBusy(t.room_id);
    setMessage('');

    try{
      await uploadPortfolioFile(
        t.portfolio_id,
        'unmasked',
        file
      );

      setMessage(
        `Final unmasked file uploaded for ${t.portfolio_name}.`
      );

      await load();

    }catch(error){
      setMessage(
        error instanceof Error
          ?error.message
          :'Unable to upload final portfolio.'
      );
    }finally{
      setBusy('');
    }
  }

  async function confirmPaymentAndRelease(t:Transaction){
    setBusy(t.room_id);
    setMessage('');

    try{
      if(t.purchase_status!=='fully_executed'){
        throw new Error(
          'Purchase Agreement must be signed before payment confirmation.'
        );
      }

      if(!t.unmasked_uploaded){
        throw new Error(
          'Upload the unmasked portfolio before releasing the deal.'
        );
      }

      if(!t.agreement_approved_at){
        const {error}=await supabase.rpc(
          'dmh_deal_gate',
          {
            p_room_id:t.room_id,
            p_gate:'agreement'
          }
        );
        if(error)throw error;
      }

      if(!t.payment_confirmed_at){
        const {error}=await supabase.rpc(
          'dmh_deal_gate',
          {
            p_room_id:t.room_id,
            p_gate:'payment'
          }
        );
        if(error)throw error;
      }

      if(!t.final_file_released_at){
        const {error}=await supabase.rpc(
          'dmh_deal_gate',
          {
            p_room_id:t.room_id,
            p_gate:'release'
          }
        );
        if(error)throw error;
      }

      setMessage(
        `Payment confirmed and final portfolio released to ${t.buyer_company}.`
      );

      await load();

    }catch(error){
      setMessage(
        error instanceof Error
          ?error.message
          :'Unable to complete release.'
      );
    }finally{
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] p-5 md:p-8 lg:p-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            TRANSACTIONS
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Every deal. One page. One next step.
          </h1>

          <p className="mt-2 max-w-3xl text-slate-500">
            NDA → Purchase Agreement → Payment → Final File.
            No searching through the system to move a buyer forward.
          </p>
        </div>

        <div className="flex gap-2">
          {role==='employee'&&(
            <Link to="/employee/documents">
              <SecondaryButton>
                <FileSignature className="mr-2" size={17}/>
                Start New NDA
              </SecondaryButton>
            </Link>
          )}

          <SecondaryButton onClick={()=>void load()}>
            <RefreshCw className="mr-2" size={17}/>
            Refresh
          </SecondaryButton>
        </div>
      </header>

      {message&&(
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
          {message}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">Active transactions</p>
          <p className="mt-2 text-3xl font-semibold">{counts.total}</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-slate-500">Waiting for NDA</p>
          <p className="mt-2 text-3xl font-semibold">{counts.waitingNda}</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-slate-500">Ready for agreement</p>
          <p className="mt-2 text-3xl font-semibold">{counts.readyAgreement}</p>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-slate-500">Waiting for owner</p>
          <p className="mt-2 text-3xl font-semibold">{counts.waitingOwner}</p>
        </Card>
      </div>

      <div className="mt-7 space-y-5">
        {transactions.map(t=>{
          const stage=transactionStage(t);
          const ndaSigned=t.nda_status==='fully_executed';
          const paSent=
            t.purchase_status==='sent_to_buyer'||
            t.purchase_status==='fully_executed';
          const paSigned=t.purchase_status==='fully_executed';
          const released=Boolean(t.final_file_released_at);

          return (
            <Card
              key={t.room_id}
              className="overflow-hidden border-slate-200"
            >
              <div className="border-b border-slate-100 bg-white p-6 md:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                        STAGE {stage} OF 5
                      </span>

                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                        released
                          ?'bg-emerald-50 text-emerald-700'
                          :'bg-slate-100 text-slate-600'
                      }`}>
                        {stageName(t)}
                      </span>
                    </div>

                    <h2 className="mt-3 text-2xl font-semibold">
                      {t.portfolio_name}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {t.buyer_company} · {t.buyer_name} · {t.buyer_email}
                    </p>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Purchase price
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {money(t.asking_price)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {Number(t.account_count||0).toLocaleString()} accounts
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-6 md:p-7 xl:grid-cols-[1fr_1fr]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">
                    Deal progress
                  </p>

                  <div className="mt-5 space-y-4">
                    <Step
                      complete={ndaSigned}
                      active={!ndaSigned}
                      label={ndaSigned?'NDA signed':'Waiting for buyer to sign NDA'}
                    />

                    <Step
                      complete={paSigned}
                      active={ndaSigned&&!paSigned}
                      label={
                        paSigned
                          ?'Purchase Agreement signed'
                          :paSent
                            ?'Waiting for buyer to sign Purchase Agreement'
                            :'Purchase Agreement not sent'
                      }
                    />

                    <Step
                      complete={Boolean(t.payment_confirmed_at)}
                      active={paSigned&&!t.payment_confirmed_at}
                      label={
                        t.payment_confirmed_at
                          ?'Payment confirmed'
                          :'Payment not confirmed'
                      }
                    />

                    <Step
                      complete={released}
                      active={Boolean(t.payment_confirmed_at)&&!released}
                      label={
                        released
                          ?'Final file released'
                          :'Final file locked'
                      }
                    />
                  </div>
                </div>

                <div className="rounded-3xl bg-[#08101f] p-6 text-white">
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">
                    NEXT STEP
                  </p>

                  {!ndaSigned&&(
                    <>
                      <Clock3 className="mt-5 text-amber-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Waiting for buyer
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        The NDA has been sent. As soon as the buyer signs,
                        this deal automatically advances here.
                      </p>
                    </>
                  )}

                  {ndaSigned&&!paSent&&role==='employee'&&(
                    <>
                      <FileSignature className="mt-5 text-blue-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Send Purchase Agreement
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        NDA is complete. Move the buyer to the next step now.
                      </p>

                      <PrimaryButton
                        className="mt-5 w-full"
                        disabled={busy===t.room_id}
                        onClick={()=>void sendPurchaseAgreement(t)}
                      >
                        {busy===t.room_id
                          ?'Sending…'
                          :'Send Purchase Agreement'}
                      </PrimaryButton>
                    </>
                  )}

                  {ndaSigned&&!paSent&&role==='owner'&&(
                    <>
                      <ShieldCheck className="mt-5 text-emerald-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Employee action required
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        NDA is signed. The employee needs to send the Purchase Agreement.
                      </p>
                    </>
                  )}

                  {paSent&&!paSigned&&(
                    <>
                      <Clock3 className="mt-5 text-amber-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Waiting for buyer
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Purchase Agreement has been sent and is waiting for signature.
                      </p>
                    </>
                  )}

                  {paSigned&&role==='employee'&&!released&&(
                    <>
                      <WalletCards className="mt-5 text-emerald-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Waiting for Owner
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Purchase Agreement is signed. The Owner now confirms payment
                        and releases the final portfolio.
                      </p>
                    </>
                  )}

                  {paSigned&&role==='owner'&&!t.unmasked_uploaded&&!released&&(
                    <>
                      <Upload className="mt-5 text-blue-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Upload final portfolio
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        The Purchase Agreement is signed. Upload the unmasked file
                        here before releasing it.
                      </p>

                      <label className="mt-5 block cursor-pointer rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-center text-sm font-semibold hover:bg-white/10">
                        Select unmasked file
                        <input
                          className="hidden"
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          disabled={busy===t.room_id}
                          onChange={e=>{
                            const file=e.target.files?.[0];
                            if(file)void uploadFinalFile(t,file);
                          }}
                        />
                      </label>
                    </>
                  )}

                  {paSigned&&role==='owner'&&t.unmasked_uploaded&&!released&&(
                    <>
                      <WalletCards className="mt-5 text-emerald-300" size={30}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Confirm Payment & Release
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Signed agreement and final file are ready.
                        Confirm cleared funds and release the unmasked portfolio.
                      </p>

                      <PrimaryButton
                        className="mt-5 w-full"
                        disabled={busy===t.room_id}
                        onClick={()=>void confirmPaymentAndRelease(t)}
                      >
                        {busy===t.room_id
                          ?'Completing…'
                          :'Confirm Payment & Release Final File'}
                      </PrimaryButton>
                    </>
                  )}

                  {released&&(
                    <>
                      <CheckCircle2 className="mt-5 text-emerald-300" size={34}/>
                      <h3 className="mt-3 text-xl font-semibold">
                        Deal Complete
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Payment is confirmed and the buyer has access to the final portfolio.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {!loading&&transactions.length===0&&(
          <Card className="grid min-h-72 place-items-center p-10 text-center">
            <div>
              <LockKeyhole className="mx-auto text-slate-300" size={42}/>
              <h3 className="mt-4 text-lg font-semibold">
                No active transactions
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                {role==='employee'
                  ?'Send an NDA to start the first buyer transaction.'
                  :'Active buyer transactions will appear here automatically.'}
              </p>
            </div>
          </Card>
        )}

        {loading&&(
          <Card className="p-10 text-center text-slate-500">
            Loading transactions…
          </Card>
        )}
      </div>
    </div>
  );
}
