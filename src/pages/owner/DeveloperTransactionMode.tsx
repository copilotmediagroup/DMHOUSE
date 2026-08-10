import {
CheckCircle2,
  FlaskConical,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import EmployeeFirstRunTour, {
  employeeTourSteps,
  launchEmployeeTourPreview,
} from '../../components/employee/EmployeeFirstRunTour';

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

import {buildAgreementHtml} from '../../components/AgreementDocument';
import {useAgreementStore,type AgreementFields} from '../../store/AgreementStore';

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
    role,
    portfolios
  }=usePortfolioStore();

  const {upsertBuyer,save,sign,send,workflowState}=useAgreementStore();

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

  const [testPortfolioId,setTestPortfolioId]=
    useState('');

  const [testCompany,setTestCompany]=
    useState('DMHOUSE TEST BUYER');

  const [testBuyerName,setTestBuyerName]=
    useState('Developer Test Buyer');

  const [testBuyerEmail,setTestBuyerEmail]=
    useState('');

  const [testSellerName,setTestSellerName]=
    useState(profile?.full_name||'');

  const [startingTest,setStartingTest]=
    useState(false);

  const [tourPreviewOpen,setTourPreviewOpen]=
    useState(false);

  const [tourPreviewStep,setTourPreviewStep]=
    useState(0);

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

  useEffect(()=>{

    if(
      profile?.full_name&&
      !testSellerName
    ){
      setTestSellerName(
        profile.full_name
      );
    }

  },[
    profile?.full_name,
    testSellerName
  ]);

  useEffect(()=>{

    if(
      !testPortfolioId
    ){

      const first=
        portfolios.find(
          portfolio=>
            ['active','negotiating','reserved']
              .includes(portfolio.status)
        );

      if(first){
        setTestPortfolioId(first.id);
      }

    }

  },[
    portfolios,
    testPortfolioId
  ]);

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
          'id,document_type,status,field_values,seller_name,seller_title,buyer_id'
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

  async function startTestTransaction(){

    if(
      role!=='owner'||
      !profile
    ){
      return;
    }

    const portfolio=
      portfolios.find(
        item=>
          item.id===testPortfolioId
      );

    if(!portfolio){

      setError(
        'Select an active portfolio for the TEST transaction.'
      );

      return;
    }

    const identity=
      (
        testCompany+
        ' '+
        testBuyerName+
        ' '+
        testBuyerEmail
      ).toUpperCase();

    if(
      !identity.includes('TEST')&&
      !identity.includes('DEV')
    ){

      setError(
        'Developer transactions must contain TEST or DEV in the buyer company, name, or email.'
      );

      return;
    }

    if(
      !testBuyerEmail.trim()
    ){

      setError(
        'Enter the email address that should receive the TEST Buyer Portal invitation.'
      );

      return;
    }

    if(
      !testSellerName.trim()
    ){

      setError(
        'Enter the Owner legal name used to sign the TEST NDA.'
      );

      return;
    }

    setStartingTest(true);
    setBusy('start');
    setMessage('');
    setError('');

    try{

      const fields:AgreementFields={
        buyerCompany:
          testCompany.trim(),

        buyerName:
          testBuyerName.trim(),

        buyerTitle:
          'TEST Buyer',

        buyerAddress:
          '',

        buyerEmail:
          testBuyerEmail.trim().toLowerCase(),

        buyerPhone:
          '',

        sellerCompany:
          'Data Market House',

        sellerName:
          testSellerName.trim(),

        sellerTitle:
          'Owner',

        portfolioName:
          portfolio.name,

        creditors:
          portfolio.originalCreditor||'',

        accountCount:
          String(
            portfolio.accountCount||0
          ),

        principalBalance:
          String(
            portfolio.faceValue||0
          ),

        currentBalance:
          String(
            portfolio.faceValue||0
          ),

        purchasePrice:
          String(
            portfolio.askingPrice||0
          ),

        priceBasis:
          '',

        saleType:
          'AS-IS',

        mediaIncluded:
          '',

        stateCoverage:
          '',

        permittedUse:
          'Evaluation of portfolio purchase',

        confidentialityPeriod:
          'Three years',

        governingState:
          'Florida',

        effectiveDate:
          new Date()
            .toISOString()
            .slice(0,10),

        expirationDate:
          '',

        paymentTerms:
          'Payment in full before final-file release',

        deliveryMethod:
          'Secure Deal Room',

        deliveryDeadline:
          'After confirmed payment',

        specialConditions:
          'DEVELOPER MODE TEST TRANSACTION',

        customClauses:
          ''
      };


      /*
        PRODUCTION STEP 1:
        Real buyer profile RPC.
      */

      const buyerId=
        await upsertBuyer({
          email:
            fields.buyerEmail,

          companyName:
            fields.buyerCompany,

          contactName:
            fields.buyerName,

          title:
            fields.buyerTitle,

          phone:
            fields.buyerPhone
        });


      /*
        PRODUCTION STEP 2:
        Render the real NDA using the same builder
        used by Document Studio.
      */

      const html=
        buildAgreementHtml(
          'nda',
          fields,
          true
        );


      /*
        PRODUCTION STEP 3:
        Save generated NDA through the real RPC.
      */

      const documentId=
        await save({
          buyerId,
          portfolioId:
            portfolio.id,

          type:
            'nda',

          title:
            'TEST NDA — '+
            portfolio.name,

          fields,
          html
        });


      /*
        PRODUCTION STEP 4:
        Apply real seller signature.
      */

      await sign(
        documentId,
        fields.sellerName,
        fields.sellerTitle,
        'script'
      );


      /*
        PRODUCTION STEP 5:
        Real invitation Edge Function.

        dmh_prepare_buyer_invitation() behind this
        creates/upserts buyer_deal_rooms and links
        this document to that exact room.
      */

      const result=
        await send(
          documentId,
          'TEST — NDA Ready for Review and Signature',
          'This is a DMHOUSE Developer Mode TEST transaction. The secure Buyer Portal link is being used to validate the production transaction workflow.'
        );


      const roomId=
        String(
          result?.roomId||
          ''
        );


      if(!roomId){

        throw new Error(
          'The invitation completed but did not return a transaction room ID.'
        );
      }


      setSelectedId(
        roomId
      );

      setArmed(false);

      setMessage(
        'TEST transaction created through the real production NDA pipeline. Transaction room: '+
        roomId.slice(0,12)+
        '…'
      );


      /*
        Allow the workspace query to see the newly
        created production transaction.
      */

      await new Promise(
        resolve=>
          setTimeout(
            resolve,
            500
          )
      );

      await refresh();

    }catch(reason){

      setError(
        reason instanceof Error
          ?reason.message
          :'Unable to create TEST transaction.'
      );

    }finally{

      setStartingTest(false);
      setBusy('');

    }

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


  async function sendDeveloperPurchaseAgreement(){

    if(
      !selected||
      !armed
    ){
      return;
    }

    if(
      selected.nda_status!=='fully_executed'
    ){
      setError(
        'Buyer must sign the NDA first.'
      );
      return;
    }

    if(
      selected.purchase_status==='sent_to_buyer'||
      selected.purchase_status==='seller_signed'
    ){
      setError(
        'Purchase Agreement is already waiting for the buyer.'
      );
      return;
    }

    if(
      selected.purchase_status==='fully_executed'
    ){
      setError(
        'Purchase Agreement is already signed.'
      );
      return;
    }

    setBusy('send-purchase');
    setMessage('');
    setError('');

    try{

      /*
        Use the actual executed NDA document as the source
        of buyer, portfolio and transaction terms.
      */

      const nda=
        await getLatestDocument(
          'nda'
        );

      if(!nda){
        throw new Error(
          'The executed NDA document is unavailable.'
        );
      }

      if(
        nda.status!=='fully_executed'
      ){
        throw new Error(
          'The NDA must be fully executed before sending the Purchase Agreement.'
        );
      }

      if(!nda.field_values){
        throw new Error(
          'The executed NDA document data is unavailable.'
        );
      }


      /*
        Same payment-settings gate used by Transaction Desk.
      */

      const {
        data:paymentSettings,
        error:paymentError
      }=
        await supabase.rpc(
          'dmh_get_company_payment_settings'
        );

      if(paymentError){
        throw paymentError;
      }

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


      /*
        Preserve the executed NDA fields and append the
        real production wire/payment instructions.
      */

      const fields:AgreementFields={
        ...(nda.field_values as AgreementFields),

        deliveryMethod:
          'Secure Deal Room',

        deliveryDeadline:
          'After confirmed payment',

        paymentTerms:
          paymentSettings.payment_terms||
          'Payment in full by wire transfer before final portfolio release.',

        wireBeneficiary:
          paymentSettings.beneficiary_name||'',

        wireBankName:
          paymentSettings.bank_name||'',

        wireBankAddress:
          paymentSettings.bank_address||'',

        wireRoutingNumber:
          paymentSettings.routing_number||'',

        wireAccountNumber:
          paymentSettings.account_number||'',

        wireSwiftBic:
          paymentSettings.swift_bic||'',

        wireReference:
          paymentSettings.wire_reference||'',

        wirePaymentDeadline:
          paymentSettings.payment_deadline||'',

        wireAdditionalInstructions:
          paymentSettings.additional_instructions||''
      };


      /*
        Same production document renderer used by
        Transaction Desk.
      */

      const html=
        buildAgreementHtml(
          'purchase_agreement',
          fields,
          false
        );


      /*
        Reuse an existing unsent PA if one exists.
        Otherwise create it inside the exact room.
      */

      const existing=
        await getLatestDocument(
          'purchase_agreement'
        );

      let documentId=
        existing?.id||'';

      if(documentId){

        const existingState=
          await workflowState(
            documentId
          );

        if(existingState?.buyerSigned){
          throw new Error(
            'This Purchase Agreement has already been signed by the buyer and cannot be regenerated.'
          );
        }

        await save({
          documentId,
          roomId:
            selected.room_id,
          buyerId:
            nda.buyer_id||
            selected.buyer_user_id||
            selected.buyer_id,
          portfolioId:
            selected.portfolio_id,
          type:
            'purchase_agreement',
          title:
            'Purchase Agreement — '+
            selected.portfolio_name,
          fields,
          html
        });

      }else{

        documentId=
          await save({
            roomId:
              selected.room_id,
            buyerId:
              nda.buyer_id||
              selected.buyer_user_id||
              selected.buyer_id,
            portfolioId:
              selected.portfolio_id,
            type:
              'purchase_agreement',
            title:
              'Purchase Agreement — '+
              selected.portfolio_name,
            fields,
            html
          });
      }


      /*
        Real seller signature.
      */

      const state=
        await workflowState(
          documentId
        );

      if(!state?.sellerSigned){

        const signer=
          nda.seller_name||
          fields.sellerName||
          profile?.full_name||
          'Data Market House';

        const title=
          nda.seller_title||
          fields.sellerTitle||
          'Portfolio Sales Specialist';

        await sign(
          documentId,
          signer,
          title,
          'script'
        );
      }


      /*
        Real buyer invitation/send engine.
      */

      await send(
        documentId,
        'Purchase Agreement Ready for Signature',
        'Your Purchase Agreement is ready. Review and sign it securely inside your Data Market House Buyer Portal.'
      );


      setMessage(
        'Purchase Agreement sent to '+
        selected.buyer_email+
        '.'
      );

      await refresh();

    }catch(reason){

      setError(
        reason instanceof Error
          ?reason.message
          :'Unable to send Purchase Agreement.'
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
          'This TEST transaction has no Purchase Agreement yet. Use Send Purchase Agreement in Developer Mode first.'
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

      <div className="mb-7 rounded-[28px] border border-blue-200 bg-blue-50 p-6 md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">
              Employee Onboarding
            </p>

            <h2 className="mt-2 text-xl font-semibold text-blue-950">
              Employee First-Run Tour Preview
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-800">
              Preview the guided tour exactly as a new employee will see it after certification.
              This does not change your Owner role and does not change any employee completion record.
            </p>
          </div>

          <button
            type="button"
            onClick={()=>{
              setTourPreviewStep(0);
              setTourPreviewOpen(true);
            }}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Launch Tour Preview
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label>
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-blue-700">
              Jump to step
            </span>

            <select
              value={tourPreviewStep}
              onChange={(event)=>setTourPreviewStep(Number(event.target.value))}
              className="w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            >
              {employeeTourSteps.map((item,index)=>(
                <option key={item.title} value={index}>
                  {index+1}. {item.title}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={()=>{
              setTourPreviewOpen(true);
              window.setTimeout(
                ()=>launchEmployeeTourPreview(tourPreviewStep),
                0,
              );
            }}
            className="rounded-xl border border-blue-300 bg-white px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            Preview Selected Step
          </button>
        </div>
      </div>



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

      <Card className="mt-7 overflow-hidden">

        <div className="border-b border-slate-100 bg-violet-50 p-6">

          <div className="flex items-start gap-4">

            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white">

              <FlaskConical size={21}/>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">
                Production-path launcher
              </p>

              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                Start TEST Transaction
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Creates a real buyer profile, real generated NDA, real seller signature,
                real Buyer Portal invitation and real transaction room. The buyer identity
                must contain TEST or DEV.
              </p>

            </div>

          </div>

        </div>


        <div className="p-6">

          <div className="grid gap-5 lg:grid-cols-2">

            <label className="block">

              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Portfolio
              </span>

              <select
                value={testPortfolioId}
                onChange={
                  event=>
                    setTestPortfolioId(
                      event.target.value
                    )
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
              >

                <option value="">
                  Select portfolio
                </option>

                {portfolios
                  .filter(
                    portfolio=>
                      ['active','negotiating','reserved']
                        .includes(portfolio.status)
                  )
                  .map(
                    portfolio=>(
                      <option
                        key={portfolio.id}
                        value={portfolio.id}
                      >
                        {portfolio.name}
                        {' · '}
                        {portfolio.accountCount.toLocaleString()}
                        {' accounts'}
                      </option>
                    )
                  )
                }

              </select>

            </label>


            <label className="block">

              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                TEST company
              </span>

              <input
                value={testCompany}
                onChange={
                  event=>
                    setTestCompany(
                      event.target.value
                    )
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
              />

            </label>


            <label className="block">

              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                TEST buyer name
              </span>

              <input
                value={testBuyerName}
                onChange={
                  event=>
                    setTestBuyerName(
                      event.target.value
                    )
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
              />

            </label>


            <label className="block">

              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Buyer invitation email
              </span>

              <input
                type="email"
                value={testBuyerEmail}
                onChange={
                  event=>
                    setTestBuyerEmail(
                      event.target.value
                    )
                }
                placeholder="Your test email address"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
              />

              <span className="mt-2 block text-xs leading-5 text-amber-700">
                This uses the real invitation service, so an actual TEST Buyer Portal email will be sent.
              </span>

            </label>


            <label className="block lg:col-span-2">

              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Owner seller signature
              </span>

              <input
                value={testSellerName}
                onChange={
                  event=>
                    setTestSellerName(
                      event.target.value
                    )
                }
                placeholder="Owner legal name"
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400"
              />

            </label>

          </div>


          <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">

            <b>Real path:</b>
            {' '}
            TEST Buyer → Generated NDA → Owner Signature → Buyer Invitation →
            Transaction Room → Developer Simulator.

          </div>


          <PrimaryButton
            className="mt-5 w-full"
            disabled={
              startingTest||
              busy!==''
            }
            onClick={
              ()=>void startTestTransaction()
            }
          >

            <Play
              className="mr-2"
              size={16}
            />

            {startingTest
              ?'Starting TEST Transaction…'
              :'Start TEST Transaction'
            }

          </PrimaryButton>

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
                Use Start TEST Transaction above, or select an existing
                buyer whose company, contact name, or email contains
                TEST or DEV.
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
                    title="Send Purchase Agreement"
                    detail="Creates, seller-signs and sends the real Purchase Agreement through the production transaction engine."
                    complete={
                      selected.purchase_status==='sent_to_buyer'||
                      selected.purchase_status==='seller_signed'||
                      selected.purchase_status==='fully_executed'
                    }
                    disabled={
                      !armed||
                      busy!==''||
                      selected.nda_status!=='fully_executed'||
                      selected.purchase_status==='sent_to_buyer'||
                      selected.purchase_status==='seller_signed'||
                      selected.purchase_status==='fully_executed'
                    }
                    busy={
                      busy==='send-purchase'
                    }
                    onClick={
                      ()=>void sendDeveloperPurchaseAgreement()
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

    {tourPreviewOpen && (
      <EmployeeFirstRunTour
        enabled={true}
        preview={true}
      />
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
