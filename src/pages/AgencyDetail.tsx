import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  ExternalLink,
  Globe2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../components/Primitives';
import { useAgencyStore, type AgencyActivity } from '../store/AgencyStore';
import { usePortfolioStore } from '../store/PortfolioStore';
import { supabase } from '../lib/supabase';
import { usePipelineStore } from '../store/PipelineStore';
import { useNegotiationStore } from '../store/NegotiationStore';
import { useClosingStore } from '../store/ClosingStore';

type AgencySecureTransaction={
  roomId:string;
  buyerId:string;
  buyerUserId:string|null;
  buyerName:string;
  buyerCompany:string;
  portfolioId:string;
  portfolioName:string;
  roomStatus:string;

  ndaStatus:string|null;
  ndaSentAt:string|null;
  ndaSignedAt:string|null;

  purchaseStatus:string|null;
  purchaseSentAt:string|null;
  purchaseSignedAt:string|null;

  paymentConfirmedAt:string|null;
  finalFileReleasedAt:string|null;
  closedAt:string|null;
};

const input='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

function externalUrl(value:string){const trimmed=value.trim();if(!trimmed)return '';return /^https?:\/\//i.test(trimmed)?trimmed:`https://${trimmed}`;}
function emailUrl(agencyId:string,contactId?:string){
  const base=window.location.pathname.startsWith('/employee')
    ?'/employee/conversations'
    :'/conversations';

  return `${base}?compose=1&agency=${encodeURIComponent(agencyId)}${contactId?`&contact=${encodeURIComponent(contactId)}`:''}`;
}
function phoneUrl(value:string){return value?`tel:${value.replace(/[^+\d]/g,'')}`:'';}

function agencySalesStage(input:{
  agencyStatus:string;
  opportunityStage?:string;
  offerStatus?:string;
  reservationStatus?:string;
  hasSale:boolean;

  secureRoom?:boolean;
  ndaStatus?:string|null;
  purchaseStatus?:string|null;
  paymentConfirmed?:boolean;
  finalReleased?:boolean;
}){
  /*
    Secure deal-room state outranks the legacy sales pipeline.
    Once a buyer transaction exists, the document/payment
    workflow becomes the canonical stage.
  */

  if(input.finalReleased){
    return {
      key:'final_released',
      label:'Final Portfolio Released',
      detail:'Payment is confirmed and the final portfolio has been released to the buyer.',
      progress:100
    };
  }

  if(input.paymentConfirmed){
    return {
      key:'payment_confirmed',
      label:'Payment Confirmed',
      detail:'Cleared funds are confirmed. The final portfolio is ready for controlled release.',
      progress:94
    };
  }

  if(input.purchaseStatus==='fully_executed'){
    return {
      key:'purchase_signed',
      label:'Purchase Agreement Signed',
      detail:'The Purchase Agreement is fully executed. The transaction is waiting for payment confirmation.',
      progress:86
    };
  }

  if(
    input.purchaseStatus==='sent_to_buyer' ||
    input.purchaseStatus==='seller_signed'
  ){
    return {
      key:'purchase_sent',
      label:'Purchase Agreement Sent',
      detail:'The Purchase Agreement is with the buyer for signature.',
      progress:76
    };
  }

  if(input.ndaStatus==='fully_executed'){
    return {
      key:'nda_signed',
      label:'NDA Signed',
      detail:'The NDA is fully executed. The next step is the Purchase Agreement.',
      progress:64
    };
  }

  if(
    input.ndaStatus==='sent_to_buyer' ||
    input.secureRoom
  ){
    return {
      key:'nda_sent',
      label:'NDA Sent',
      detail:'The secure buyer transaction is active and waiting for the NDA to be signed.',
      progress:54
    };
  }

  if(input.hasSale){
    return {
      key:'complete',
      label:'Deal Complete',
      detail:'This agency has completed a portfolio purchase.',
      progress:100
    };
  }

  if(input.reservationStatus==='paid'){
    return {
      key:'payment_confirmed',
      label:'Payment Confirmed',
      detail:'Payment has been recorded. Complete the secured transaction release process.',
      progress:90
    };
  }

  if(input.reservationStatus==='active'){
    return {
      key:'payment',
      label:'Payment / Closing',
      detail:'The transaction has reached funding and closing.',
      progress:80
    };
  }

  if(
    input.offerStatus==='accepted' ||
    input.offerStatus==='reserved'
  ){
    return {
      key:'transaction',
      label:'Transaction Ready',
      detail:'Commercial terms have advanced. Continue through the secure transaction workspace.',
      progress:68
    };
  }

  if(
    input.offerStatus==='submitted' ||
    input.offerStatus==='owner_countered' ||
    input.offerStatus==='buyer_countered'
  ){
    return {
      key:'offer',
      label:'Offer / Negotiation',
      detail:'An active offer is being negotiated with this agency.',
      progress:58
    };
  }

  if(
    input.opportunityStage==='contracts' ||
    input.agencyStatus==='offer_submitted'
  ){
    return {
      key:'contracts',
      label:'Contracts',
      detail:'The relationship has reached transaction documentation.',
      progress:52
    };
  }

  if(
    input.opportunityStage==='verbal_agreement' ||
    input.opportunityStage==='negotiating' ||
    input.agencyStatus==='negotiating'
  ){
    return {
      key:'negotiating',
      label:'Negotiating',
      detail:'The buyer relationship has moved into commercial discussion.',
      progress:44
    };
  }

  if(
    input.opportunityStage==='portfolio_sent' ||
    input.agencyStatus==='portfolio_sent'
  ){
    return {
      key:'portfolio_sent',
      label:'Portfolio Sent',
      detail:'The buyer has received portfolio information for review.',
      progress:36
    };
  }

  if(
    input.opportunityStage==='portfolio_requested' ||
    input.opportunityStage==='decision_maker_found' ||
    input.agencyStatus==='qualified'
  ){
    return {
      key:'qualified',
      label:'Qualified Buyer',
      detail:'This agency is qualified. Move the relationship toward a portfolio opportunity.',
      progress:28
    };
  }

  if(
    input.opportunityStage==='conversation_started' ||
    input.opportunityStage==='first_contact' ||
    input.agencyStatus==='contacted'
  ){
    return {
      key:'contacted',
      label:'Contacted',
      detail:'Outreach has started. Continue developing the buyer relationship.',
      progress:18
    };
  }

  if(input.agencyStatus==='researching'){
    return {
      key:'researching',
      label:'Researching',
      detail:'Research the agency and identify the correct decision-maker.',
      progress:10
    };
  }

  if(
    input.agencyStatus==='not_interested' ||
    input.agencyStatus==='do_not_contact'
  ){
    return {
      key:'closed_lost',
      label:
        input.agencyStatus==='do_not_contact'
          ?'Do Not Contact'
          :'Not Interested',
      detail:'This relationship is not currently moving forward.',
      progress:0
    };
  }

  return {
    key:'prospected',
    label:'Prospected',
    detail:'Agency discovered. Begin research and first outreach.',
    progress:5
  };
}

function formatDate(value:string){if(!value)return 'Not available';const d=new Date(value);return Number.isNaN(d.getTime())?'Not available':d.toLocaleDateString();}
function formatDateTime(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString();}

export default function AgencyDetail(){
  const {id}=useParams();
  const {get,loading,addContact,addActivity,reassign,release,updateChannel}=useAgencyStore();
  const {role,portfolios}=usePortfolioStore();
  const {opportunities}=usePipelineStore();
  const {offers}=useNegotiationStore();
  const {reservations,sales}=useClosingStore();
  const agency=get(id||'');

  const agencyOpportunity=useMemo(
    ()=>opportunities
      .filter(item=>item.agencyId===(id||''))
      .sort(
        (a,b)=>
          new Date(b.updatedAt).getTime()
          -
          new Date(a.updatedAt).getTime()
      )[0],
    [opportunities,id]
  );

  const agencyOffer=useMemo(
    ()=>offers
      .filter(item=>item.agencyId===(id||''))
      .sort(
        (a,b)=>
          new Date(b.updatedAt).getTime()
          -
          new Date(a.updatedAt).getTime()
      )[0],
    [offers,id]
  );

  const agencyReservation=useMemo(
    ()=>reservations
      .filter(item=>item.agencyId===(id||''))
      .sort(
        (a,b)=>
          new Date(b.createdAt).getTime()
          -
          new Date(a.createdAt).getTime()
      )[0],
    [reservations,id]
  );

  const agencySale=useMemo(
    ()=>sales
      .filter(item=>item.agencyId===(id||''))
      .sort(
        (a,b)=>
          new Date(b.closedAt).getTime()
          -
          new Date(a.closedAt).getTime()
      )[0],
    [sales,id]
  );
  const [panel,setPanel]=useState<'contact'|'activity'|null>(null);
  const [activityKind,setActivityKind]=useState<'call'|'email'|'note'>('call');

  const [ndaLaunchOpen,setNdaLaunchOpen]=
    useState(false);

  const [ndaContactId,setNdaContactId]=
    useState('');

  const [ndaPortfolioId,setNdaPortfolioId]=
    useState('');


  const [secureTransaction,setSecureTransaction]=
    useState<AgencySecureTransaction|null>(null);

  const [secureTransactionLoading,setSecureTransactionLoading]=
    useState(false);

  const [secureTransactionError,setSecureTransactionError]=
    useState('');

  useEffect(()=>{

    let cancelled=false;

    async function loadAgencySecureTransaction(){

      if(!id){
        setSecureTransaction(null);
        return;
      }

      setSecureTransactionLoading(true);
      setSecureTransactionError('');

      try{

        /*
          Agency → Buyer Profile
        */

        const buyerResult=
          await supabase
            .from('buyer_profiles')
            .select(
              'id,user_id,company_name,contact_name,agency_id'
            )
            .eq('agency_id',id)
            .order('created_at',{ascending:false})
            .limit(1)
            .maybeSingle();

        if(buyerResult.error){
          throw buyerResult.error;
        }

        const buyer:any=buyerResult.data;

        if(!buyer){

          if(!cancelled){
            setSecureTransaction(null);
          }

          return;
        }


        /*
          Buyer → Most Recent Deal Room
        */

        const roomResult=
          await supabase
            .from('buyer_deal_rooms')
            .select(
              'id,buyer_id,portfolio_id,offer_id,status,payment_confirmed_at,final_file_released_at,closed_at,created_at,updated_at'
            )
            .eq('buyer_id',buyer.id)
            .order('updated_at',{ascending:false})
            .limit(1)
            .maybeSingle();

        if(roomResult.error){
          throw roomResult.error;
        }

        const room:any=roomResult.data;

        if(!room){

          if(!cancelled){
            setSecureTransaction(null);
          }

          return;
        }


        /*
          Load portfolio + generated legal documents.
        */

        const [
          portfolioResult,
          documentResult
        ]=
          await Promise.all([

            supabase
              .from('portfolios')
              .select('id,name')
              .eq('id',room.portfolio_id)
              .maybeSingle(),

            supabase
              .from('deal_documents_generated')
              .select(
                'id,document_type,status,sent_at,buyer_signed_at,created_at'
              )
              .eq('room_id',room.id)
              .in(
                'document_type',
                ['nda','purchase_agreement']
              )
              .order(
                'created_at',
                {ascending:false}
              )

          ]);


        if(portfolioResult.error){
          throw portfolioResult.error;
        }

        if(documentResult.error){
          throw documentResult.error;
        }


        const documents:any[]=
          documentResult.data||[];


        const nda=
          documents.find(
            document=>document.document_type==='nda'
          );


        const purchase=
          documents.find(
            document=>document.document_type==='purchase_agreement'
          );


        if(cancelled){
          return;
        }


        setSecureTransaction({
          roomId:String(room.id),
          buyerId:String(buyer.id),
          buyerUserId:
            buyer.user_id
              ?String(buyer.user_id)
              :null,

          buyerName:
            String(
              buyer.contact_name||
              'Buyer'
            ),

          buyerCompany:
            String(
              buyer.company_name||
              'Buyer'
            ),

          portfolioId:
            String(room.portfolio_id),

          portfolioName:
            String(
              portfolioResult.data?.name||
              'Portfolio'
            ),

          roomStatus:
            String(
              room.status||
              ''
            ),

          ndaStatus:
            nda?.status||null,

          ndaSentAt:
            nda?.sent_at||null,

          ndaSignedAt:
            nda?.buyer_signed_at||null,

          purchaseStatus:
            purchase?.status||null,

          purchaseSentAt:
            purchase?.sent_at||null,

          purchaseSignedAt:
            purchase?.buyer_signed_at||null,

          paymentConfirmedAt:
            room.payment_confirmed_at||null,

          finalFileReleasedAt:
            room.final_file_released_at||null,

          closedAt:
            room.closed_at||null
        });

      }catch(reason){

        if(!cancelled){

          setSecureTransaction(null);

          setSecureTransactionError(
            reason instanceof Error
              ?reason.message
              :'Unable to load secure transaction.'
          );

        }

      }finally{

        if(!cancelled){
          setSecureTransactionLoading(false);
        }

      }

    }

    void loadAgencySecureTransaction();

    return ()=>{
      cancelled=true;
    };

  },[id]);


  const timeline=useMemo(()=>{
    if(!agency)return [];
    const imported:AgencyActivity={id:`imported-${agency.id}`,type:'note',disposition:'Agency imported',notes:'Added to My Agencies from prospect discovery.',occurredAt:agency.createdAt,employeeName:agency.ownerEmployeeName};
    return [imported,...agency.activities].sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
  },[agency]);


  const back=role==='owner'?'/agencies':'/employee/agencies';
  if(loading){
    return (
      <div className="grid min-h-[50vh] place-items-center p-10">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/>
          <p className="mt-4 text-sm font-medium text-slate-500">
            Loading agency…
          </p>
        </div>
      </div>
    );
  }

  if(!agency){
    return (
      <div className="p-10">
        Agency not found.
      </div>
    );
  }

  const salesExecution=agencySalesStage({
    agencyStatus:agency.status,
    opportunityStage:agencyOpportunity?.stage,
    offerStatus:agencyOffer?.status,
    reservationStatus:agencyReservation?.status,
    hasSale:Boolean(agencySale),

    secureRoom:Boolean(secureTransaction),

    ndaStatus:
      secureTransaction?.ndaStatus,

    purchaseStatus:
      secureTransaction?.purchaseStatus,

    paymentConfirmed:
      Boolean(
        secureTransaction?.paymentConfirmedAt
      ),

    finalReleased:
      Boolean(
        secureTransaction?.finalFileReleasedAt
      )
  });

  const transactionBasePath=
    role==='owner'
      ?'/transactions'
      :'/employee/transactions';

  const transactionPath=
    secureTransaction?.roomId
      ?transactionBasePath+
        '?room='+
        encodeURIComponent(
          secureTransaction.roomId
        )
      :transactionBasePath;

  const websiteHref=externalUrl(agency.website);

  const closingExecution=
    !secureTransaction
      ?null

      :secureTransaction.finalFileReleasedAt
        ?{
            key:'complete',
            label:'Deal Complete',
            detail:'Payment was confirmed and the final portfolio has been securely released.',
            progress:100,
            tone:'emerald'
          }

      :secureTransaction.paymentConfirmedAt
        ?{
            key:'payment_confirmed',
            label:'Payment Confirmed',
            detail:'Cleared payment is confirmed. Final portfolio release is being completed through the secure transaction.',
            progress:90,
            tone:'emerald'
          }

      :secureTransaction.purchaseStatus==='fully_executed'
        ?{
            key:'awaiting_owner_payment',
            label:'Waiting for Owner Payment Confirmation',
            detail:'The Purchase Agreement is signed. The employee has completed their transaction action. The Owner must verify cleared funds before final release.',
            progress:75,
            tone:'amber'
          }

      :(
          secureTransaction.purchaseStatus==='sent_to_buyer'||
          secureTransaction.purchaseStatus==='seller_signed'
        )
        ?{
            key:'awaiting_purchase_signature',
            label:'Waiting for Buyer Signature',
            detail:'The Purchase Agreement has been sent. No payment or final-file action is available until it is signed.',
            progress:50,
            tone:'blue'
          }

      :secureTransaction.ndaStatus==='fully_executed'
        ?{
            key:'purchase_ready',
            label:'Purchase Agreement Ready',
            detail:'The NDA is signed. The employee should send the Purchase Agreement next.',
            progress:25,
            tone:'blue'
          }

      :null;


  const ndaExecuted=
    secureTransaction?.ndaStatus==='fully_executed';

  const purchaseSent=
    secureTransaction?.purchaseStatus==='sent_to_buyer'||
    secureTransaction?.purchaseStatus==='seller_signed';

  const purchaseExecuted=
    secureTransaction?.purchaseStatus==='fully_executed';

  const transactionNextAction=
    secureTransaction?.finalFileReleasedAt
      ?{
          label:'View Completed Transaction',
          detail:'The final portfolio has been released.',
          tone:'emerald'
        }
      :secureTransaction?.paymentConfirmedAt
        ?{
            label:'View Release Status',
            detail:'Payment has been confirmed. Final-file release is controlled by the Owner.',
            tone:'blue'
          }
        :purchaseExecuted
          ?{
              label:'Waiting for Owner',
              detail:'The Purchase Agreement is signed. The Owner must confirm cleared payment.',
              tone:'amber'
            }
          :purchaseSent
            ?{
                label:'Waiting for Buyer Signature',
                detail:'The Purchase Agreement has been sent and is waiting for the buyer.',
                tone:'amber'
              }
            :ndaExecuted
              ?{
                  label:'Send Purchase Agreement',
                  detail:'The NDA is signed. Send the Purchase Agreement from this exact transaction.',
                  tone:'emerald'
                }
              :secureTransaction
                ?{
                    label:'Waiting for NDA Signature',
                    detail:'The NDA has been sent and is waiting for the buyer.',
                    tone:'amber'
                  }
                :null;


  const ndaAvailablePortfolios=
    portfolios.filter(
      portfolio=>
        portfolio.status==='active'||
        portfolio.status==='negotiating'
    );

  const ndaSelectedContact=
    agency.contacts.find(
      contact=>contact.id===ndaContactId
    )
    ||
    agency.contacts.find(
      contact=>Boolean(contact.email)
    );

  const ndaSelectedPortfolio=
    ndaAvailablePortfolios.find(
      portfolio=>portfolio.id===ndaPortfolioId
    )
    ||
    ndaAvailablePortfolios[0];

  const ndaEmail=
    ndaSelectedContact?.email||
    agency.generalEmail||
    '';

  const ndaContactName=
    ndaSelectedContact
      ?[ndaSelectedContact.firstName,ndaSelectedContact.lastName]
          .filter(Boolean)
          .join(' ')
          .trim()
      :'';

  const ndaPhone=
    ndaSelectedContact?.phone||
    agency.phone||
    '';

  const canLaunchNda=
    Boolean(
      agency.name&&
      ndaContactName&&
      ndaEmail&&
      ndaSelectedPortfolio
    );

  const ndaStudioPath=
    canLaunchNda
      ?'/employee/documents?'+
        new URLSearchParams({
          source:'agency',
          type:'nda',
          agencyId:agency.id,
          company:agency.name,
          contact:ndaContactName,
          email:ndaEmail,
          phone:ndaPhone,
          portfolioId:
            ndaSelectedPortfolio?.id||'',
          portfolioName:
            ndaSelectedPortfolio?.name||''
        }).toString()
      :'';

  const fullLocation=agency.address||[agency.city,agency.state].filter(Boolean).join(', ');
  const mapsHref=agency.sourceUrl?externalUrl(agency.sourceUrl):(fullLocation?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullLocation)}`:'');
  const namedDecisionMaker=agency.contacts.some(c=>c.decisionMaker||((c.firstName||'').toLowerCase()!=='general'&&Boolean(c.lastName)));
  const hasFollowUp=agency.activities.some(a=>Boolean(a.followUpAt)&&!a.completedAt&&new Date(a.followUpAt as string).getTime()>=Date.now()-86400000);
  const scoreItems=[
    {label:'Main phone',complete:Boolean(agency.phone)},
    {label:'General email',complete:Boolean(agency.generalEmail)},
    {label:'Website',complete:Boolean(agency.website)},
    {label:'Full address',complete:Boolean(agency.address)},
    {label:'Named decision-maker',complete:namedDecisionMaker},
    {label:'Activity logged',complete:agency.activities.length>0},
    {label:'Follow-up scheduled',complete:hasFollowUp},
  ];
  const weights=[15,15,15,15,20,10,10];
  const relationshipScore=scoreItems.reduce((total,item,index)=>total+(item.complete?weights[index]:0),0);
  const scoreLabel=relationshipScore>=80?'Strong':relationshipScore>=55?'Developing':'Building';


  return <div className="mx-auto max-w-[1380px] p-5 md:p-8 lg:p-10">
    <Link to={back} className="mb-6 inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="mr-2" size={17}/>Agency directory</Link>

    <header className="mb-7 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone="blue">{agency.status.replace(/_/g,' ')}</Pill>
            {(agency.category||agency.city||agency.state)&&<span className="text-sm text-slate-500">{agency.category||[agency.city,agency.state].filter(Boolean).join(', ')}</span>}
            {agency.rating!=null&&<span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600"><Star size={15} fill="currentColor"/>{agency.rating.toFixed(1)}{agency.reviewCount!=null&&<span className="font-normal text-slate-400">({agency.reviewCount.toLocaleString()} reviews)</span>}</span>}
          </div>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{agency.name}</h1>
          {fullLocation&&<p className="mt-3 flex items-start gap-2 text-sm text-slate-500"><MapPin className="mt-0.5 shrink-0" size={16}/><span>{fullLocation}</span></p>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap xl:max-w-[660px] xl:justify-end">
          {websiteHref&&<ActionLink href={websiteHref} icon={<Globe2 size={17}/>} label="Visit website" external primary/>}
          {mapsHref&&<ActionLink href={mapsHref} icon={<MapPin size={17}/>} label="Google Maps" external/>}
          {agency.phone&&<button onClick={()=>{setActivityKind('call');setPanel('activity')}} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-600"><Phone size={17}/><span className="ml-2">Call & log</span></button>}
          {agency.generalEmail&&<button onClick={()=>{setActivityKind('email');setPanel('activity')}} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-600"><Mail size={17}/><span className="ml-2">Email & log</span></button>}
          <SecondaryButton onClick={()=>setPanel('contact')}><Plus className="mr-2" size={17}/>Add contact</SecondaryButton>
          <PrimaryButton onClick={()=>setPanel('activity')}><MessageSquareText className="mr-2" size={17}/>Log activity</PrimaryButton>
        </div>
      </div>
    </header>

        {/* =====================================================
        AGENCY NDA LAUNCH PANEL
    ====================================================== */}

    {ndaLaunchOpen&&(
      <Card className="mb-6 border-emerald-200 p-6">

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">

          <div>

            <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">
              Start secure transaction
            </p>

            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Send NDA to {agency.name}
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Select the buyer contact and portfolio. DMHOUSE will carry this information into the approved NDA workflow for review and sending.
            </p>

          </div>

          <button
            type="button"
            onClick={()=>setNdaLaunchOpen(false)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>

        </div>


        <div className="mt-6 grid gap-5 md:grid-cols-2">

          <label className="block">

            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Buyer contact
            </span>

            <select
              value={
                ndaContactId||
                ndaSelectedContact?.id||
                ''
              }
              onChange={event=>
                setNdaContactId(
                  event.target.value
                )
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
            >

              <option value="">
                Select contact
              </option>

              {agency.contacts.map(contact=>(
                <option
                  key={contact.id}
                  value={contact.id}
                >
                  {[contact.firstName,contact.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim()||'Unnamed contact'}
                  {contact.email
                    ?' — '+contact.email
                    :' — no email'
                  }
                </option>
              ))}

            </select>

          </label>


          <label className="block">

            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Portfolio
            </span>

            <select
              value={
                ndaPortfolioId||
                ndaSelectedPortfolio?.id||
                ''
              }
              onChange={event=>
                setNdaPortfolioId(
                  event.target.value
                )
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
            >

              <option value="">
                Select portfolio
              </option>

              {ndaAvailablePortfolios.map(portfolio=>(
                <option
                  key={portfolio.id}
                  value={portfolio.id}
                >
                  {portfolio.name}
                </option>
              ))}

            </select>

          </label>

        </div>


        <div className="mt-5 rounded-2xl bg-slate-50 p-4">

          <div className="grid gap-3 text-sm md:grid-cols-3">

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Company
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {agency.name}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Contact
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {ndaContactName||'Missing'}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Email
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {ndaEmail||'Missing'}
              </p>
            </div>

          </div>

        </div>


        {!agency.contacts.length&&(
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Add a buyer contact to this agency before starting the NDA.
          </div>
        )}


        {agency.contacts.length>0&&!ndaEmail&&(
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The selected buyer contact needs a valid email address before the NDA can be sent.
          </div>
        )}


        {!ndaAvailablePortfolios.length&&(
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            There is no active portfolio available for this transaction.
          </div>
        )}


        <div className="mt-6 flex justify-end">

          {canLaunchNda?(
            <Link
              to={ndaStudioPath}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-6 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Review & Send NDA
            </Link>
          ):(
            <button
              type="button"
              disabled
              className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-2xl bg-slate-200 px-6 text-sm font-bold text-slate-400"
            >
              Complete Missing Information
            </button>
          )}

        </div>

      </Card>
    )}

{panel==='contact'&&<div className="mb-6"><ContactForm agencyId={agency.id} done={()=>setPanel(null)} add={addContact}/></div>}
    {panel==='activity'&&<div className="mb-6"><ActivityForm agency={agency} initialType={activityKind} done={()=>setPanel(null)} add={addActivity}/></div>}

    {/* =====================================================
        SALES EXECUTION WORKSPACE
    ====================================================== */}

    <Card className="mb-6 overflow-hidden border-blue-200">

      <div className="bg-[#091221] p-6 text-white md:p-7">

        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

          <div className="max-w-3xl">

            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">
              SALES EXECUTION WORKSPACE
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3">

              <h2 className="text-2xl font-semibold">
                {salesExecution.label}
              </h2>

              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                {salesExecution.progress}% complete
              </span>

            </div>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              {salesExecution.detail}
            </p>

          </div>


          <div className="shrink-0">

            {role==='employee'&&
              !secureTransaction&&
              (
                salesExecution.key==='qualified'||
                salesExecution.key==='portfolio_sent'||
                salesExecution.key==='negotiating'||
                salesExecution.key==='contracts'||
                salesExecution.key==='offer'
              )&&(
                <button
                  type="button"
                  onClick={()=>setNdaLaunchOpen(true)}
                  className="mb-2 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-bold text-white transition hover:bg-emerald-600"
                >
                  Start NDA Process
                </button>
              )}


            {salesExecution.key==='complete'?(
              <Link
                to={transactionPath}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-500 px-5 text-sm font-bold text-white transition hover:bg-emerald-600"
              >
                View Completed Transaction
              </Link>
            ):salesExecution.key==='prospected'||
              salesExecution.key==='researching'||
              salesExecution.key==='contacted'?(
              <button
                type="button"
                onClick={()=>{
                  setActivityKind('call');
                  setPanel('activity');
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                Continue Outreach
              </button>
            ):(
              <Link
                to={transactionPath}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                {transactionNextAction?.label||'Continue Transaction'}
              </Link>
            )}

          </div>

        </div>


        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">

          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{
              width:String(Math.max(4,salesExecution.progress))+'%'
            }}
          />

        </div>

      </div>


      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">

        <div className="bg-white p-5">

          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Buyer relationship
          </p>

          <p className="mt-2 font-semibold capitalize text-slate-900">
            {agency.status.replace(/_/g,' ')}
          </p>

        </div>


        <div className="bg-white p-5">

          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Pipeline
          </p>

          <p className="mt-2 font-semibold capitalize text-slate-900">
            {agencyOpportunity
              ?agencyOpportunity.stage.replace(/_/g,' ')
              :'No opportunity yet'
            }
          </p>

        </div>


        <div className="bg-white p-5">

          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Offer
          </p>

          <p className="mt-2 font-semibold capitalize text-slate-900">
            {agencyOffer
              ?agencyOffer.status.replace(/_/g,' ')
              :'No offer yet'
            }
          </p>

          {agencyOffer&&(
            <p className="mt-1 text-xs text-slate-500">
              {new Intl.NumberFormat(
                'en-US',
                {
                  style:'currency',
                  currency:'USD',
                  maximumFractionDigits:0
                }
              ).format(agencyOffer.currentAmount)}
            </p>
          )}

        </div>


        <div className="bg-white p-5">

          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Closing
          </p>

          <p className="mt-2 font-semibold capitalize text-slate-900">
            {agencySale
              ?'Closed'
              :agencyReservation
                ?agencyReservation.status.replace(/_/g,' ')
                :'Not started'
            }
          </p>

          {agencySale&&(
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              {new Intl.NumberFormat(
                'en-US',
                {
                  style:'currency',
                  currency:'USD',
                  maximumFractionDigits:0
                }
              ).format(agencySale.salePrice)}
            </p>
          )}

        </div>

      </div>


      <div className="border-t border-slate-100 bg-white px-6 py-5">

        {secureTransactionLoading&&(
          <div className="mb-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            Loading secure transaction…
          </div>
        )}

        {secureTransactionError&&(
          <div className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            Secure transaction unavailable: {secureTransactionError}
          </div>
        )}

        {secureTransaction&&transactionNextAction&&(
          <div
            className={
              'mb-5 rounded-2xl border p-5 '+
              (
                transactionNextAction.tone==='emerald'
                  ?'border-emerald-200 bg-emerald-50'
                  :transactionNextAction.tone==='amber'
                    ?'border-amber-200 bg-amber-50'
                    :'border-blue-200 bg-blue-50'
              )
            }
          >
            {/* POST NDA NEXT ACTION */}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-500">
                  Next transaction action
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-950">
                  {transactionNextAction.label}
                </h3>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {transactionNextAction.detail}
                </p>

              </div>

              {ndaExecuted&&!purchaseSent&&!purchaseExecuted&&(
                <Link
                  to={transactionPath}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 px-6 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Send Purchase Agreement
                </Link>
              )}

              {secureTransaction&&(
                purchaseSent||
                purchaseExecuted||
                Boolean(secureTransaction.paymentConfirmedAt)||
                Boolean(secureTransaction.finalFileReleasedAt)
              )&&(
                <Link
                  to={transactionPath}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Open Exact Transaction
                </Link>
              )}

            </div>

          </div>
        )}

        {secureTransaction&&closingExecution&&(
          <div
            className={
              'mb-6 overflow-hidden rounded-2xl border '+
              (
                closingExecution.tone==='emerald'
                  ?'border-emerald-200'
                  :closingExecution.tone==='amber'
                    ?'border-amber-200'
                    :'border-blue-200'
              )
            }
          >
            {/* CLOSING HANDOFF CONTROL */}

            <div
              className={
                'p-5 md:p-6 '+
                (
                  closingExecution.tone==='emerald'
                    ?'bg-emerald-50'
                    :closingExecution.tone==='amber'
                      ?'bg-amber-50'
                      :'bg-blue-50'
                )
              }
            >

              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                <div className="max-w-3xl">

                  <p className="text-[11px] font-bold uppercase tracking-[.18em] text-slate-500">
                    Closing control
                  </p>

                  <h3 className="mt-2 text-xl font-bold text-slate-950">
                    {closingExecution.label}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {closingExecution.detail}
                  </p>

                </div>


                <div className="shrink-0">

                  {closingExecution.key==='awaiting_owner_payment'&&
                    role==='employee'&&(
                      <div className="rounded-2xl border border-amber-200 bg-white px-5 py-3 text-center">

                        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                          Employee action complete
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Waiting for Owner
                        </p>

                      </div>
                    )}


                  {closingExecution.key==='awaiting_owner_payment'&&
                    role==='owner'&&(
                      <Link
                        to={transactionPath}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-amber-600 px-6 text-sm font-bold text-white hover:bg-amber-700"
                      >
                        Review Payment & Release
                      </Link>
                    )}


                  {closingExecution.key==='purchase_ready'&&
                    role==='employee'&&(
                      <Link
                        to={transactionPath}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        Send Purchase Agreement
                      </Link>
                    )}


                  {(
                    closingExecution.key==='awaiting_purchase_signature'||
                    closingExecution.key==='payment_confirmed'||
                    closingExecution.key==='complete'
                  )&&(
                    <Link
                      to={transactionPath}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700"
                    >
                      Open Exact Transaction
                    </Link>
                  )}

                </div>

              </div>


              <div className="mt-6">

                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">

                  <span>Closing progress</span>

                  <span>
                    {closingExecution.progress}%
                  </span>

                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white">

                  <div
                    className={
                      'h-full rounded-full '+
                      (
                        closingExecution.tone==='emerald'
                          ?'bg-emerald-500'
                          :closingExecution.tone==='amber'
                            ?'bg-amber-500'
                            :'bg-blue-500'
                      )
                    }
                    style={{
                      width:String(
                        closingExecution.progress
                      )+'%'
                    }}
                  />

                </div>

              </div>

            </div>


            <div className="grid gap-px bg-slate-100 sm:grid-cols-4">

              {[
                {
                  label:'Agreement Signed',
                  complete:
                    secureTransaction.purchaseStatus===
                    'fully_executed'
                },

                {
                  label:'Payment Confirmed',
                  complete:Boolean(
                    secureTransaction.paymentConfirmedAt
                  )
                },

                {
                  label:'Final Released',
                  complete:Boolean(
                    secureTransaction.finalFileReleasedAt
                  )
                },

                {
                  label:'Deal Complete',
                  complete:Boolean(
                    secureTransaction.finalFileReleasedAt
                  )
                }
              ].map(item=>(
                <div
                  key={item.label}
                  className="bg-white p-4"
                >

                  <div className="flex items-center gap-2">

                    <span
                      className={
                        'grid h-6 w-6 place-items-center rounded-full text-xs font-bold '+
                        (
                          item.complete
                            ?'bg-emerald-600 text-white'
                            :'bg-slate-100 text-slate-400'
                        )
                      }
                    >
                      {item.complete?'✓':'·'}
                    </span>

                    <span
                      className={
                        'text-xs font-semibold '+
                        (
                          item.complete
                            ?'text-emerald-800'
                            :'text-slate-500'
                        )
                      }
                    >
                      {item.label}
                    </span>

                  </div>

                </div>
              ))}

            </div>

          </div>
        )}

        {secureTransaction&&(
          <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-5">

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-blue-600">
                  Secure transaction lifecycle
                </p>

                <p className="mt-2 font-bold text-slate-950">
                  {secureTransaction.portfolioName}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Buyer: {secureTransaction.buyerCompany}
                </p>

              </div>


              <Link
                to={transactionPath}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
              >
                Open Exact Transaction
              </Link>

            </div>


            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

              {[
                {
                  label:'NDA Sent',
                  done:Boolean(
                    secureTransaction.ndaSentAt||
                    secureTransaction.ndaStatus
                  )
                },
                {
                  label:'NDA Signed',
                  done:
                    secureTransaction.ndaStatus===
                    'fully_executed'
                },
                {
                  label:'Purchase Agreement',
                  done:Boolean(
                    secureTransaction.purchaseSentAt||
                    secureTransaction.purchaseStatus
                  )
                },
                {
                  label:'Payment Confirmed',
                  done:Boolean(
                    secureTransaction.paymentConfirmedAt
                  )
                },
                {
                  label:'Final Released',
                  done:Boolean(
                    secureTransaction.finalFileReleasedAt
                  )
                }
              ].map(item=>(
                <div
                  key={item.label}
                  className={
                    'rounded-xl border p-3 '+
                    (
                      item.done
                        ?'border-emerald-200 bg-emerald-50'
                        :'border-slate-200 bg-white'
                    )
                  }
                >

                  <div
                    className={
                      'mb-2 grid h-6 w-6 place-items-center rounded-full text-xs font-bold '+
                      (
                        item.done
                          ?'bg-emerald-600 text-white'
                          :'bg-slate-100 text-slate-400'
                      )
                    }
                  >
                    {item.done?'✓':'·'}
                  </div>

                  <p
                    className={
                      'text-xs font-semibold '+
                      (
                        item.done
                          ?'text-emerald-800'
                          :'text-slate-500'
                      )
                    }
                  >
                    {item.label}
                  </p>

                </div>
              ))}

            </div>

          </div>
        )}

        <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
          Deal path
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-5">

          {[
            {
              label:'Prospected',
              done:salesExecution.progress>=5
            },
            {
              label:'Contacted',
              done:salesExecution.progress>=18
            },
            {
              label:'Qualified',
              done:salesExecution.progress>=28
            },
            {
              label:'Transaction',
              done:salesExecution.progress>=52
            },
            {
              label:'Complete',
              done:salesExecution.progress>=100
            }
          ].map(step=>(
            <div
              key={step.label}
              className={
                'rounded-2xl border px-4 py-3 '+
                (
                  step.done
                    ?'border-emerald-200 bg-emerald-50'
                    :'border-slate-200 bg-slate-50'
                )
              }
            >

              <div className="flex items-center gap-2">

                <span
                  className={
                    'grid h-5 w-5 place-items-center rounded-full text-xs font-bold '+
                    (
                      step.done
                        ?'bg-emerald-600 text-white'
                        :'bg-slate-200 text-slate-500'
                    )
                  }
                >
                  {step.done?'✓':'·'}
                </span>

                <span
                  className={
                    'text-xs font-semibold '+
                    (
                      step.done
                        ?'text-emerald-800'
                        :'text-slate-500'
                    )
                  }
                >
                  {step.label}
                </span>

              </div>

            </div>
          ))}

        </div>

      </div>

    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <div className="space-y-6">
        <Card className="overflow-hidden border-blue-200">
          <div className="bg-[#091221] p-6 text-white md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-300">Agency action center</p><h2 className="mt-2 text-2xl font-semibold">Move this relationship forward</h2><p className="mt-2 text-sm text-slate-300">Every outreach action must create a next step or close the relationship.</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4"><p className="text-xs uppercase tracking-wide text-slate-400">Current stage</p><p className="mt-1 text-lg font-semibold capitalize">{agency.status.replace(/_/g,' ')}</p></div>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-3 md:p-6">
            <button disabled={!agency.phone||agency.phoneStatus!=='active'} onClick={()=>{setActivityKind('call');setPanel('activity')}} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><Phone className="text-blue-600" size={20}/><p className="mt-3 font-semibold">Call agency</p><p className="mt-1 truncate text-sm text-slate-500">{agency.phoneStatus!=='active'?`Phone ${agency.phoneStatus.replace(/_/g,' ')}`:(agency.phone||'No phone available')}</p></button>
            <button disabled={!agency.generalEmail||agency.generalEmailStatus!=='active'} onClick={()=>{setActivityKind('email');setPanel('activity')}} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"><Mail className="text-blue-600" size={20}/><p className="mt-3 font-semibold">Email agency</p><p className="mt-1 truncate text-sm text-slate-500">{agency.generalEmailStatus!=='active'?`Email ${agency.generalEmailStatus.replace(/_/g,' ')}`:(agency.generalEmail||'No email available')}</p></button>
            <button onClick={()=>{setActivityKind('note');setPanel('activity')}} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"><CalendarClock className="text-blue-600" size={20}/><p className="mt-3 font-semibold">Schedule next action</p><p className="mt-1 text-sm text-slate-500">Create a dated follow-up</p></button>
          </div>
        </Card>

        <Card className="p-6 md:p-8">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Building2 size={22}/></div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Company profile</p><h2 className="mt-1 text-xl font-semibold">Business information</h2></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InfoRow icon={<Globe2 size={19}/>} label="Website" value={agency.website} href={websiteHref} external/>
            <InfoRow icon={<Mail size={19}/>} label="General email" value={agency.generalEmail} href={emailUrl(agency.id)}/>
            <InfoRow icon={<Phone size={19}/>} label="Main phone" value={agency.phone} href={phoneUrl(agency.phone)}/>
            <InfoRow icon={<MapPin size={19}/>} label="Business address" value={fullLocation} href={mapsHref} external/>
            <InfoRow icon={<Building2 size={19}/>} label="Category" value={agency.category}/>
            <InfoRow icon={<Star size={19}/>} label="Google reputation" value={agency.rating!=null?`${agency.rating.toFixed(1)} stars${agency.reviewCount!=null?` · ${agency.reviewCount.toLocaleString()} reviews`:''}`:''}/>
            {agency.sourceUrl&&<InfoRow icon={<ExternalLink size={19}/>} label="Source record" value="Open original Google Maps listing" href={externalUrl(agency.sourceUrl)} external/>}
            <InfoRow icon={<CalendarClock size={19}/>} label="Added to pipeline" value={formatDate(agency.createdAt)}/>
          </div>
          {role==='owner'&&<div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <SecondaryButton onClick={async()=>{const value=prompt('Edit main phone',agency.phone);if(value!==null)await updateChannel(agency.id,undefined,'phone',value,value?'active':'archived','Owner edited agency phone')}}>Edit main phone</SecondaryButton>
            <SecondaryButton onClick={async()=>{const value=prompt('Edit general email',agency.generalEmail);if(value!==null)await updateChannel(agency.id,undefined,'email',value,value?'active':'archived','Owner edited agency email')}}>Edit general email</SecondaryButton>
          </div>}
        </Card>

        <Card className="p-6 md:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">People</p><h2 className="mt-1 text-xl font-semibold">Contacts and decision-makers</h2></div><span className="text-sm text-slate-400">{agency.contacts.length} contact{agency.contacts.length===1?'':'s'}</span></div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">{agency.contacts.length?agency.contacts.map(c=><div key={c.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-5"><div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm"><UserRound size={21}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{[c.firstName,c.lastName].filter(Boolean).join(' ')||'General contact'}</p>{c.decisionMaker&&<Pill tone="success">Decision-maker</Pill>}</div><p className="mt-1 text-sm text-slate-500">{c.title||'Contact'}</p></div></div><div className="mt-5 space-y-2">{c.email&&<div className="flex items-center gap-2"><div className="min-w-0 flex-1"><MiniLink href={c.emailStatus==='active'?emailUrl(agency.id,c.id):'#'} icon={<Mail size={15}/>} label={c.email}/></div><Pill tone={c.emailStatus==='active'?'success':'warning'}>{c.emailStatus.replace(/_/g,' ')}</Pill></div>}{c.phone&&<div className="flex items-center gap-2"><div className="min-w-0 flex-1"><MiniLink href={c.phoneStatus==='active'?phoneUrl(c.phone):'#'} icon={<Phone size={15}/>} label={c.phone}/></div><Pill tone={c.phoneStatus==='active'?'success':'warning'}>{c.phoneStatus.replace(/_/g,' ')}</Pill></div>}</div>{c.emailBounceCount>0&&<p className="mt-3 text-xs font-medium text-amber-700">{c.emailBounceCount} email bounce{c.emailBounceCount===1?'':'s'} recorded</p>}{role==='owner'&&<div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4"><button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm" onClick={async()=>{const value=prompt('Edit contact email',c.email);if(value!==null)await updateChannel(agency.id,c.id,'email',value,value?'active':'archived','Owner edited contact email')}}>Edit email</button><button className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm" onClick={async()=>{const value=prompt('Edit contact phone',c.phone);if(value!==null)await updateChannel(agency.id,c.id,'phone',value,value?'active':'archived','Owner edited contact phone')}}>Edit phone</button><button className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" onClick={async()=>{if(confirm('Remove this email from future sending?'))await updateChannel(agency.id,c.id,'email',c.email,'archived','Owner archived email')}}>Remove email</button><button className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" onClick={async()=>{if(confirm('Remove this phone from future calling?'))await updateChannel(agency.id,c.id,'phone',c.phone,'archived','Owner archived phone')}}>Remove phone</button></div>}</div>):<Empty text="No contacts yet. Add the first decision-maker or general contact."/>}</div>
        </Card>

        <Card className="p-6 md:p-8">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">History</p><h2 className="mt-1 text-xl font-semibold">Relationship timeline</h2></div>
          <div className="mt-6 space-y-0">{timeline.map((a,index)=><div key={a.id} className="relative flex gap-4 pb-7 last:pb-0"><div className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-4 border-white bg-blue-100 text-blue-700">{a.type==='call'?<Phone size={14}/>:a.type==='email'?<Mail size={14}/>:<MessageSquareText size={14}/>}</div>{index<timeline.length-1&&<div className="absolute left-[17px] top-8 h-full w-px bg-slate-200"/>}<div className="min-w-0 flex-1 pt-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{a.disposition}</p><span className="text-xs text-slate-400">{formatDateTime(a.occurredAt)}</span></div>{a.notes&&<p className="mt-1 text-sm leading-6 text-slate-500">{a.notes}</p>}<div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">{a.employeeName&&<span>Employee: {a.employeeName}</span>}{a.followUpAt&&<span className="font-semibold text-blue-600">Follow up {formatDateTime(a.followUpAt)}</span>}</div></div></div>)}</div>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card className="p-6">
          <div className="flex gap-3"><ShieldCheck className="text-blue-600"/><div><p className="font-semibold">Working ownership</p><p className="mt-1 text-sm text-slate-500">{agency.ownerEmployeeName}</p></div></div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Protected until</p><p className="mt-1 text-lg font-semibold">{formatDate(agency.ownershipExpiresAt)}</p></div>
          {role==='owner'&&<div className="mt-4 grid gap-3"><SecondaryButton onClick={()=>{const name=prompt('Reassign to employee name');if(name)reassign(agency.id,name)}}>Reassign agency</SecondaryButton><SecondaryButton onClick={()=>release(agency.id)}>Release ownership</SecondaryButton></div>}
        </Card>

        <Card className="p-6">
          <p className="text-sm font-medium text-slate-500">Relationship score</p>
          <div className="mt-3 flex items-end justify-between"><div><p className="text-4xl font-semibold tracking-tight">{relationshipScore}<span className="text-xl text-slate-400">/100</span></p><p className="mt-1 font-semibold text-blue-600">{scoreLabel}</p></div><div className="grid h-16 w-16 place-items-center rounded-full bg-blue-50 text-lg font-semibold text-blue-700">{relationshipScore}%</div></div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${relationshipScore}%`}}/></div>
          <div className="mt-5 space-y-3">{scoreItems.map(item=><div key={item.label} className="flex items-center justify-between gap-3 text-sm"><span className={item.complete?'text-slate-700':'text-slate-400'}>{item.label}</span><span className={`grid h-5 w-5 place-items-center rounded-full ${item.complete?'bg-emerald-100 text-emerald-700':'border border-slate-200 text-transparent'}`}>{item.complete&&<Check size={13}/>}</span></div>)}</div>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Next best action</p>
          <h3 className="mt-2 text-xl font-semibold">{agency.status==='qualified'
  ?'Start NDA process'
  :!namedDecisionMaker
    ?'Find a decision-maker'
    :agency.activities.length===0
      ?'Start outreach'
      :!hasFollowUp
        ?'Schedule a follow-up'
        :'Continue the relationship'}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{agency.status==='qualified'
  ?'Buyer interest is confirmed. Start the secure NDA transaction from this agency record.'
  :!namedDecisionMaker
    ?'The general contact is saved. Add the owner, president, recovery manager, or portfolio buyer next.'
    :agency.activities.length===0
      ?'Use the phone or email above, then log the result so the relationship stays visible.'
      :!hasFollowUp
        ?'Add a dated follow-up so this agency does not fall out of the pipeline.'
        :'Your next follow-up is already in the system.'}</p>
          <PrimaryButton
              className="mt-5 w-full"
              onClick={()=>{
                if(agency.status==='qualified'){
                  setNdaLaunchOpen(true);
                  return;
                }

                setPanel(
                  !namedDecisionMaker
                    ?'contact'
                    :'activity'
                );
              }}
            >
              {agency.status==='qualified'
                ?'Start NDA Process'
                :!namedDecisionMaker
                  ?'Add decision-maker'
                  :'Log next action'
              }
            </PrimaryButton>
        </Card>
      </aside>
    </div>
  </div>;
}

function ActionLink({href,icon,label,external=false,primary=false}:{href:string;icon:ReactNode;label:string;external?:boolean;primary?:boolean}){return <a href={href} target={external?'_blank':undefined} rel={external?'noreferrer':undefined} className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${primary?'bg-blue-600 text-white hover:bg-blue-700':'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-600'}`}>{icon}<span className="ml-2">{label}</span>{external&&<ExternalLink className="ml-2" size={13}/>}</a>;}
function MiniLink({href,icon,label}:{href:string;icon:ReactNode;label:string}){return <a href={href} className="flex min-w-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:text-blue-600"><span className="shrink-0">{icon}</span><span className="truncate">{label}</span></a>;}
function InfoRow({icon,label,value,href,external=false}:{icon:ReactNode;label:string;value:string;href?:string;external?:boolean}){return <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="mt-0.5 text-blue-600">{icon}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>{value?(href?<a href={href} target={external?'_blank':undefined} rel={external?'noreferrer':undefined} className="mt-1 inline-flex max-w-full items-center gap-1 break-words font-medium text-slate-800 hover:text-blue-600 hover:underline">{value}{external&&<ExternalLink className="shrink-0" size={13}/>}</a>:<p className="mt-1 break-words font-medium text-slate-800">{value}</p>):<p className="mt-1 text-sm text-slate-400">Not available</p>}</div></div>;}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">{text}</div>;}

function ContactForm({agencyId,done,add}:{agencyId:string;done:()=>void;add:ReturnType<typeof useAgencyStore>['addContact']}){async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await add(agencyId,{firstName:String(f.get('first')),lastName:String(f.get('last')),title:String(f.get('title')),email:String(f.get('email')),phone:String(f.get('phone')),decisionMaker:f.get('decision')==='on'});done();}return <Card className="p-6"><h3 className="text-xl font-semibold">Add contact</h3><form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2"><input className={input} name="first" required placeholder="First name"/><input className={input} name="last" placeholder="Last name"/><input className={input} name="title" required placeholder="Job title"/><input className={input} name="email" type="email" placeholder="Email"/><input className={input} name="phone" placeholder="Direct phone"/><label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4"><input name="decision" type="checkbox"/> Decision-maker</label><div className="flex gap-3 md:col-span-2 md:justify-end"><SecondaryButton type="button" onClick={done}>Cancel</SecondaryButton><PrimaryButton>Save contact</PrimaryButton></div></form></Card>;}
function ActivityForm({agency,initialType,done,add}:{agency:ReturnType<typeof useAgencyStore>['agencies'][number];initialType:'call'|'email'|'note';done:()=>void;add:ReturnType<typeof useAgencyStore>['addActivity']}){
  const [type,setType]=useState<'call'|'email'|'note'>(initialType);
  const [disposition,setDisposition]=useState(initialType==='email'?'Email sent':initialType==='note'?'Follow-up required':'No answer');
  const [error,setError]=useState('');
  const closing=['Closed','Not interested','Do not contact'].includes(disposition);
  const options=type==='call'
    ?['No answer','Left voicemail','Reached receptionist','Reached decision-maker','Requested information','Call back later','Wrong number','Qualified','Negotiating','Not interested','Do not contact']
    :type==='email'
      ?['Email drafted','Email sent','Email replied','Hard bounce','Soft bounce','Follow-up required','Requested information','Portfolio sent','Qualified','Negotiating','Offer submitted','Not interested','Do not contact']
      :['Follow-up required','Requested information','Portfolio sent','Qualified','Negotiating','Offer submitted','Closed','Not interested','Do not contact'];
  function changeType(next:'call'|'email'|'note'){setType(next);const first=next==='call'?'No answer':next==='email'?'Email sent':'Follow-up required';setDisposition(first);}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');const f=new FormData(e.currentTarget);const followUp=String(f.get('followUp')||'');
    if(!closing&&!followUp){setError('Schedule the next action or choose a closing outcome.');return;}
    try{await add(agency.id,{type,disposition,notes:String(f.get('notes')),subject:String(f.get('subject')||''),contactId:String(f.get('contact')||'')||undefined,followUpAt:followUp?new Date(followUp).toISOString():undefined});done();}catch(reason){setError(reason instanceof Error?reason.message:'Unable to save activity.');}
  }
  return <Card className="border-blue-200 p-6 md:p-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Action center</p><h3 className="mt-1 text-2xl font-semibold">Record the outcome</h3><p className="mt-1 text-sm text-slate-500">Contact the agency, capture what happened, and lock in the next move. DMHOUSE advances the relationship stage automatically from the outcome.</p></div>{type==='call'&&agency.phone&&<a href={phoneUrl(agency.phone)} className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"><Phone className="mr-2" size={17}/>Call {agency.phone}</a>}{type==='email'&&agency.generalEmail&&<a href={emailUrl(agency.id)} className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"><Mail className="mr-2" size={17}/>Open email</a>}</div>
    <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium text-slate-600">Activity type<select className={`${input} mt-2`} value={type} onChange={e=>changeType(e.target.value as 'call'|'email'|'note')}><option value="call">Call</option><option value="email">Email</option><option value="note">Note / follow-up</option></select></label>
      <label className="text-sm font-medium text-slate-600">Outcome<select className={`${input} mt-2`} value={disposition} onChange={e=>setDisposition(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-600">Contact<select className={`${input} mt-2`} name="contact"><option value="">General agency contact</option>{agency.contacts.map(c=><option key={c.id} value={c.id}>{[c.firstName,c.lastName].filter(Boolean).join(' ')}{c.title?` — ${c.title}`:''}</option>)}</select></label>
      <label className="text-sm font-medium text-slate-600 md:col-span-2">Subject<input className={`${input} mt-2`} name="subject" placeholder={type==='email'?'Email subject':'Purpose of this contact'}/></label>
      <label className="text-sm font-medium text-slate-600 md:col-span-2">Outcome notes<textarea className={`${input} mt-2 min-h-28`} name="notes" required placeholder="What happened, what did they say, and what matters for the next contact?"/></label>
      <label className="text-sm font-medium text-slate-600 md:col-span-2">Next action date{!closing&&<span className="ml-2 text-xs font-semibold text-red-500">Required unless relationship is closed</span>}<input className={`${input} mt-2`} name="followUp" type="datetime-local" disabled={closing}/></label>
      {error&&<p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2">{error}</p>}
      <div className="flex gap-3 md:col-span-2 md:justify-end"><SecondaryButton type="button" onClick={done}>Cancel</SecondaryButton><PrimaryButton>Save outcome and next action</PrimaryButton></div>
    </form>
  </Card>;
}
