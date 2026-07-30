import {FormEvent,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {FileSignature,MailCheck,Send,ShieldCheck} from 'lucide-react';
import {Card,Field,PrimaryButton,SecondaryButton,inputClass} from '../../components/Primitives';
import {buildAgreementHtml,printAgreement} from '../../components/AgreementDocument';
import {useAgreementStore,type AgreementFields,type AgreementType} from '../../store/AgreementStore';

const initial:AgreementFields={
  buyerCompany:'',buyerName:'',buyerTitle:'',buyerAddress:'',buyerEmail:'',buyerPhone:'',
  sellerCompany:'Data Market House',sellerName:'',sellerTitle:'Portfolio Sales Specialist',
  portfolioName:'',creditors:'',accountCount:'',principalBalance:'',currentBalance:'',
  purchasePrice:'',priceBasis:'',saleType:'AS-IS',mediaIncluded:'',stateCoverage:'',
  permittedUse:'Evaluation of portfolio purchase',confidentialityPeriod:'Three years',
  governingState:'Florida',effectiveDate:new Date().toISOString().slice(0,10),expirationDate:'',
  paymentTerms:'Payment in full before final-file release',deliveryMethod:'Secure Deal Room',
  deliveryDeadline:'After confirmed payment',specialConditions:'',customClauses:''
};

export default function DocumentStudio(){
  const navigate=useNavigate();
  const {upsertBuyer,save,sign,send,history,workflowState}=useAgreementStore();
  const [type,setType]=useState<AgreementType>('nda');
  const [f,setF]=useState(initial);
  const [portfolioId,setPortfolioId]=useState('');
  const [documentId,setDocumentId]=useState('');
  const [message,setMessage]=useState('');
  const [emailSubject,setEmailSubject]=useState('NDA Ready for Review and Signature');
  const [emailMessage,setEmailMessage]=useState('A secure Data Market House transaction has been prepared for you. Use the link below to review and electronically sign the NDA, then continue through the next purchase stages inside the Buyer Portal.');
  const [invites,setInvites]=useState<any[]>([]);
  const [style,setStyle]=useState('script');
  const html=useMemo(()=>buildAgreementHtml(type,f,false,documentId?{name:f.sellerName,title:f.sellerTitle,style}:undefined),[type,f,documentId,style]);
  const set=(k:keyof AgreementFields,v:string)=>setF(x=>({...x,[k]:v}));
  const chooseType=(v:AgreementType)=>{
    setType(v);
    setDocumentId('');
    setEmailSubject(v==='nda'?'NDA Ready for Review and Signature':'Purchase Agreement Ready for Signature');
    setEmailMessage(v==='nda'
      ?'A secure Data Market House transaction has been prepared for you. Use the link below to review and electronically sign the NDA, then continue through the next purchase stages inside the Buyer Portal.'
      :'Your purchase agreement is ready for review and electronic signature inside the Data Market House Buyer Portal.');
  };

  async function create(e:FormEvent){
    e.preventDefault();
    try{
      if(!f.buyerEmail.trim())throw new Error('Buyer email is required.');
      const buyerId=await upsertBuyer({
        email:f.buyerEmail,
        companyName:f.buyerCompany,
        contactName:f.buyerName,
        title:f.buyerTitle,
        phone:f.buyerPhone
      });
      const id=await save({
        buyerId,
        portfolioId:portfolioId||undefined,
        type,
        title:type==='nda'?`NDA — ${f.portfolioName}`:`Purchase Agreement — ${f.portfolioName}`,
        fields:f,
        html
      });
      setDocumentId(id);
      setMessage(`${type==='nda'?'NDA':'Purchase agreement'} draft created for ${f.buyerEmail}. Review it, then Finish & Send.`);
    }catch(e){
      setMessage(e instanceof Error?e.message:'Unable to save document');
    }
  }

  async function signAndSend(){
    try{
      if(!documentId)throw new Error('Create the draft first.');
      if(!f.sellerName)throw new Error('Enter the employee legal name.');
      if(!f.buyerEmail)throw new Error('Buyer email is required.');
      if(!emailSubject.trim())throw new Error('Email subject is required.');
      setMessage('Locking the document and opening the buyer transaction…');
      const state=await workflowState(documentId);
      if(!state?.sellerSigned)await sign(documentId,f.sellerName,f.sellerTitle,style);
      const result=await send(documentId,emailSubject,emailMessage);
      setInvites(await history(documentId));
      navigate('/employee/invitation-sent',{replace:true,state:{buyerName:f.buyerName,buyerEmail:result.email||f.buyerEmail,portfolioName:f.portfolioName,sentAt:new Date().toISOString(),inviteNumber:result.inviteNumber}});
    }catch(e){
      setMessage(e instanceof Error?e.message:'Unable to finish and send');
    }
  }

  const fields:(keyof AgreementFields)[]=[
    'buyerCompany','buyerName','buyerTitle','buyerEmail','buyerPhone','buyerAddress',
    'sellerName','sellerTitle','portfolioName','creditors','accountCount','principalBalance',
    'currentBalance','purchasePrice','mediaIncluded','stateCoverage','paymentTerms',
    'specialConditions','customClauses'
  ];
  const required=['buyerCompany','buyerName','buyerEmail','sellerName','portfolioName','creditors','accountCount','principalBalance'];

  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-7xl">
    <p className="text-xs font-bold tracking-[.2em] text-blue-600">IN-APP TRANSACTION ENTRY</p>
    <h1 className="mt-2 text-3xl font-semibold">NDA & Agreement Studio</h1>
    <p className="mt-2 text-sm text-slate-500">Sending the NDA is the buyer invitation. The buyer enters the portal with the NDA waiting, then continues through portfolio review, agreement, payment and file release.</p>
    {message&&<p className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-700">{message}</p>}

    <div className="mt-7 grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
      <Card className="p-6">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>chooseType('nda')} className={`rounded-2xl p-4 ${type==='nda'?'bg-blue-600 text-white':'bg-slate-100'}`}><ShieldCheck className="mx-auto"/><b className="mt-2 block">NDA / Start Transaction</b></button>
          <button onClick={()=>chooseType('purchase_agreement')} className={`rounded-2xl p-4 ${type==='purchase_agreement'?'bg-blue-600 text-white':'bg-slate-100'}`}><FileSignature className="mx-auto"/><b className="mt-2 block">Purchase Agreement</b></button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={create}>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-700"><MailCheck size={18}/><p className="text-xs font-bold uppercase tracking-wider">Buyer and portal recipient</p></div>
            <p className="mt-2 text-xs text-blue-700">The email below receives the secure Buyer Portal link. It is never hidden at send time.</p>
          </div>

          <Field label="Portfolio ID (linked automatically in a live deal)"><input className={inputClass} value={portfolioId} onChange={e=>setPortfolioId(e.target.value)} placeholder="Optional during development testing"/></Field>
          {fields.map(k=><Field key={k} label={k.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase())}>
            <input type={k==='buyerEmail'?'email':'text'} className={inputClass} value={f[k]} onChange={e=>set(k,e.target.value)} required={required.includes(k)}/>
          </Field>)}

          <Field label="Prepared signature style"><select className={inputClass} value={style} onChange={e=>setStyle(e.target.value)}><option value="script">Script</option><option value="formal">Formal</option><option value="modern">Modern</option></select></Field>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Portal invitation email</p>
            <div className="mt-3 space-y-3">
              <Field label="To"><input className={inputClass} value={f.buyerEmail} readOnly placeholder="Enter Buyer Email above"/></Field>
              <Field label="Subject"><input className={inputClass} value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} required/></Field>
              <Field label="Message"><textarea className={inputClass+' min-h-28'} value={emailMessage} onChange={e=>setEmailMessage(e.target.value)}/></Field>
              <div className="rounded-xl bg-white p-3 text-xs text-slate-600"><b>Next action:</b> {type==='nda'?'Buyer opens the portal and signs the NDA. The remaining purchase stages stay inside the same transaction.':'Buyer returns to the existing transaction and signs the purchase agreement.'}<br/><b>Access:</b> 24 hours per link · maximum 3 invitations in one 7-day cycle.</div>
            </div>
          </div>
          <PrimaryButton className="w-full">Create Draft</PrimaryButton>
        </form>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <SecondaryButton onClick={()=>printAgreement(html)}>Preview / PDF</SecondaryButton>
          <PrimaryButton onClick={signAndSend} disabled={!documentId||!f.buyerEmail}><Send size={16}/>Finish & Send</PrimaryButton>
        </div>
        {documentId&&<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm"><p className="font-semibold">Ready to send</p><p className="mt-1 text-slate-600">To: <b>{f.buyerEmail}</b></p><p className="text-slate-600">Action: <b>{type==='nda'?'Open transaction and sign NDA':'Sign purchase agreement'}</b></p></div>}
        {invites.length>0&&<div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Invitation history</p>{invites.map((x:any)=><div key={x.id} className="mt-2 rounded-xl bg-slate-50 p-3 text-xs"><b>Invite {x.inviteNumber}</b> · {x.status}<br/>{new Date(x.sentAt).toLocaleString()} · expires {new Date(x.expiresAt).toLocaleString()}</div>)}</div>}
      </Card>
      <Card className="overflow-hidden p-0"><iframe title="Document preview" className="h-[1050px] w-full" srcDoc={html}/></Card>
    </div>
  </div></div>;
}
