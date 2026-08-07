import type {AgreementFields,AgreementType} from '../store/AgreementStore';

const money=(v:string)=>{
  const n=Number(String(v).replace(/[^0-9.-]/g,''));

  return Number.isFinite(n)&&v
    ?new Intl.NumberFormat('en-US',{
        style:'currency',
        currency:'USD',
        maximumFractionDigits:2
      }).format(n)
    :v||'—';
};

const safe=(value?:string|null)=>
  String(value||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

export function buildAgreementHtml(
  type:AgreementType,
  f:AgreementFields,
  test=false,
  sellerSignature?:{name:string;title:string;style:string},
  buyerSignature?:{name:string;title:string;style:string}
){
  const nda=type==='nda';

  const title=nda
    ?'NON-DISCLOSURE AND NON-CIRCUMVENTION AGREEMENT'
    :'DEBT PORTFOLIO PURCHASE AND SALE AGREEMENT';

  const rows=(items:[string,string][])=>
    items
      .map(([a,b])=>`<tr><th>${safe(a)}</th><td>${safe(b||'—')}</td></tr>`)
      .join('');

  const sig=(
    label:string,
    signature?:{name:string;title:string;style:string}
  )=>`
    <div class="sig">
      <div class="sigline">
        ${
          signature
            ?`<span class="${safe(signature.style)}">${safe(signature.name)}</span>`
            :''
        }
      </div>
      <b>${safe(label)}</b>
      <div>${signature?.name?safe(signature.name):'Name: ____________________'}</div>
      <div>${signature?.title?safe(signature.title):'Title: ____________________'}</div>
      <div>Date: ${signature?new Date().toLocaleDateString():'____________________'}</div>
    </div>
  `;

  const wireSection=!nda?`
    <h2>Payment & Wire Instructions</h2>

    <p>
      Buyer shall remit the purchase price of
      <b>${safe(money(f.purchasePrice))}</b>
      according to the following instructions.
      The final unmasked portfolio will not be released until
      Seller confirms cleared funds.
    </p>

    <table>
      ${rows([
        ['Beneficiary / Account Name',f.wireBeneficiary||''],
        ['Bank Name',f.wireBankName||''],
        ['Bank Address',f.wireBankAddress||''],
        ['Routing / ABA Number',f.wireRoutingNumber||''],
        ['Account Number',f.wireAccountNumber||''],
        ['SWIFT / BIC',f.wireSwiftBic||''],
        ['Wire Reference / Memo',f.wireReference||''],
        ['Payment Deadline',f.wirePaymentDeadline||'']
      ])}
    </table>

    ${
      f.wireAdditionalInstructions
        ?`<p><b>Additional Payment Instructions:</b> ${safe(f.wireAdditionalInstructions)}</p>`
        :''
    }
  `:'';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${safe(title)}</title>
<style>
body{
  font-family:Arial,sans-serif;
  color:#142033;
  margin:0;
  background:#eef2f7
}
.page{
  width:8.5in;
  min-height:11in;
  margin:24px auto;
  background:white;
  padding:.72in;
  box-sizing:border-box;
  position:relative
}
.test{
  border:3px solid #b91c1c;
  color:#b91c1c;
  padding:9px;
  text-align:center;
  font-weight:800;
  letter-spacing:2px;
  margin-bottom:24px
}
h1{
  text-align:center;
  font-size:20px;
  margin:0 0 24px
}
h2{
  font-size:14px;
  margin-top:24px;
  border-bottom:1px solid #cbd5e1;
  padding-bottom:6px
}
p,li,td,th{
  font-size:11px;
  line-height:1.55
}
table{
  width:100%;
  border-collapse:collapse
}
th,td{
  border:1px solid #cbd5e1;
  padding:7px;
  text-align:left;
  vertical-align:top
}
th{
  width:34%;
  background:#f8fafc
}
.signatures{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:36px;
  margin-top:45px
}
.sigline{
  height:50px;
  border-bottom:1px solid #111;
  display:flex;
  align-items:end;
  font-size:27px
}
.script{
  font-family:cursive;
  font-style:italic
}
.formal{
  font-family:Georgia,serif;
  font-style:italic
}
.modern{
  font-family:Arial,sans-serif;
  font-weight:300;
  font-style:italic
}
.footer{
  margin-top:55px;
  text-align:center;
  font-size:9px;
  color:#64748b
}
@media print{
  body{background:white}
  .page{margin:0;box-shadow:none}
}
</style>
</head>

<body>
<div class="page">

${test?'<div class="test">DEVELOPMENT TEST — NOT A LEGALLY EXECUTED AGREEMENT</div>':''}

<h1>${safe(title)}</h1>

<p>
This Agreement is entered into as of
<b>${safe(f.effectiveDate||'the effective date shown below')}</b>
between
<b>${safe(f.sellerCompany||'Data Market House')}</b>
(“Seller/Disclosing Party”)
and
<b>${safe(f.buyerCompany||f.buyerName||'Buyer')}</b>
(“Buyer/Receiving Party”).
</p>

<h2>Portfolio and Transaction Information</h2>

<table>
${rows([
  ['Portfolio',f.portfolioName],
  ['Creditor(s)',f.creditors],
  ['Number of Accounts',f.accountCount],
  ['Principal Balance',money(f.principalBalance)],
  ['Current/Face Balance',money(f.currentBalance)],
  ['Purchase Price',money(f.purchasePrice)],
  ['Pricing Basis',f.priceBasis],
  ['Sale Type',f.saleType],
  ['State Coverage',f.stateCoverage],
  ['Media Included',f.mediaIncluded]
])}
</table>

${
  nda
    ?`
      <h2>Confidentiality Terms</h2>

      <p>
        Buyer may use the disclosed information only for
        <b>${safe(f.permittedUse||'evaluating the potential purchase of the portfolio')}</b>.
        Buyer shall protect all data, creditor identities, account information,
        pricing, documents, and business relationships from unauthorized use
        or disclosure for ${safe(f.confidentialityPeriod||'the agreed confidentiality period')}.
      </p>

      <p>
        Buyer will not circumvent Seller or contact identified creditors,
        data owners, brokers, agencies, or counterparties except with
        Seller’s written authorization.
        Governing law: ${safe(f.governingState||'the agreed state')}.
        Expiration: ${safe(f.expirationDate||'as stated by the parties')}.
      </p>
    `
    :`
      <h2>Purchase, Payment and Delivery</h2>

      <p>
        Buyer agrees to purchase the portfolio on an
        <b>${safe(f.saleType||'AS-IS')}</b>
        basis for
        <b>${safe(money(f.purchasePrice))}</b>.
        Payment terms:
        ${safe(f.paymentTerms||'payment in full before release')}.
        Delivery method:
        ${safe(f.deliveryMethod||'secure deal room')}.
        Delivery deadline:
        ${safe(f.deliveryDeadline||'after confirmed payment')}.
      </p>

      <p>
        Buyer is responsible for independent due diligence, licensing,
        compliance, data security, collection practices, and all
        post-closing use of the accounts.
        Seller makes only the representations expressly written in this Agreement.
      </p>

      ${wireSection}
    `
}

<h2>Special Terms</h2>

<p>${safe(f.specialConditions||'None.')}</p>

${f.customClauses?`<p>${safe(f.customClauses)}</p>`:''}

<div class="signatures">
  ${sig('SELLER / AUTHORIZED REPRESENTATIVE',sellerSignature)}
  ${sig('BUYER / AUTHORIZED REPRESENTATIVE',buyerSignature)}
</div>

<div class="footer">
Document generated by Data Market House Sales OS · Electronic signature audit applies to live documents
</div>

</div>
</body>
</html>`;
}

export function downloadAgreement(html:string,name:string){
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');

  a.href=URL.createObjectURL(blob);
  a.download=name.replace(/[^a-z0-9_-]+/gi,'_')+'.html';
  a.click();

  URL.revokeObjectURL(a.href);
}

export function printAgreement(html:string){
  const w=window.open('','_blank');

  if(!w){
    throw new Error('Allow pop-ups to preview and save PDF.');
  }

  w.document.write(html);
  w.document.close();
  w.focus();

  setTimeout(()=>w.print(),250);
}
