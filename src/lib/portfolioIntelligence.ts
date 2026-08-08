import ExcelJS from 'exceljs';

export type PortfolioIntelligence={
  accountCount:number;
  principalBalance:number|null;
  averageBalance:number|null;
  chargeOffYear:string;
};

function normalizeHeader(value:unknown){
  return String(value??'')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}

function numeric(value:unknown):number|null{
  if(value===null||value===undefined||value==='')return null;

  if(typeof value==='number'){
    return Number.isFinite(value)?value:null;
  }

  if(typeof value==='object'){
    const v:any=value;

    if(v.result!==undefined){
      return numeric(v.result);
    }

    if(typeof v.text==='string'){
      return numeric(v.text);
    }
  }

  const cleaned=String(value)
    .replace(/[$,\s]/g,'')
    .replace(/[()]/g,m=>m==='('?'-':'');

  const parsed=Number(cleaned);

  return Number.isFinite(parsed)?parsed:null;
}

function yearFromValue(value:unknown):number|null{
  if(value===null||value===undefined||value==='')return null;

  if(value instanceof Date){
    return value.getFullYear();
  }

  if(typeof value==='number'){
    if(value>=1900&&value<=2100){
      return Math.trunc(value);
    }

    /*
     * Excel serial date.
     */
    if(value>20000&&value<80000){
      const epoch=new Date(Date.UTC(1899,11,30));
      epoch.setUTCDate(epoch.getUTCDate()+Math.trunc(value));

      const year=epoch.getUTCFullYear();

      return year>=1900&&year<=2100?year:null;
    }
  }

  if(typeof value==='object'){
    const v:any=value;

    if(v.result!==undefined){
      return yearFromValue(v.result);
    }

    if(typeof v.text==='string'){
      return yearFromValue(v.text);
    }
  }

  const text=String(value).trim();

  const direct=text.match(/\b(19|20)\d{2}\b/);

  if(direct){
    return Number(direct[0]);
  }

  const date=new Date(text);

  if(!Number.isNaN(date.getTime())){
    const year=date.getFullYear();

    if(year>=1900&&year<=2100){
      return year;
    }
  }

  return null;
}

function isPrincipalHeader(header:string){
  return [
    'principal',
    'principal_balance',
    'principal_bal',
    'principal_amount',
    'principal_due',
    'current_principal',
    'principal_owed'
  ].includes(header)||
  (
    header.includes('principal')&&
    (
      header.includes('balance')||
      header.includes('amount')||
      header.includes('due')
    )
  );
}

function isBalanceHeader(header:string){
  if(isPrincipalHeader(header))return false;

  return [
    'balance',
    'current_balance',
    'current_bal',
    'account_balance',
    'total_balance',
    'balance_due',
    'face_value',
    'face_balance',
    'amount_due'
  ].includes(header)||
  (
    header.includes('balance')&&
    !header.includes('principal')
  );
}

function isChargeOffHeader(header:string){
  return [
    'charge_off_date',
    'chargeoff_date',
    'charge_off_year',
    'chargeoff_year',
    'date_of_charge_off',
    'chargeoff',
    'charge_off',
    'co_date',
    'codate'
  ].includes(header)||
  (
    header.includes('charge')&&
    header.includes('off')
  );
}

function isAccountHeader(header:string){
  return (
    header==='account'||
    header==='account_number'||
    header==='account_num'||
    header==='account_no'||
    header==='account_id'||
    header==='acctno'||
    header==='acct_no'||
    header==='acct_num'||
    header==='pri_acctno'||
    (
      header.includes('account')&&
      (
        header.includes('number')||
        header.includes('num')||
        header.endsWith('_id')
      )
    )
  );
}

function finalize(
  accountCount:number,
  principalTotal:number,
  principalValues:number,
  balanceTotal:number,
  balanceValues:number,
  years:Set<number>
):PortfolioIntelligence{
  const sortedYears=[...years].sort((a,b)=>a-b);

  const chargeOffYear=
    sortedYears.length===0
      ?''
      :sortedYears.length===1
        ?String(sortedYears[0])
        :`${sortedYears[0]}–${sortedYears[sortedYears.length-1]}`;

  return {
    accountCount,
    principalBalance:
      principalValues
        ?Math.round(principalTotal*100)/100
        :null,

    /*
     * Average balance is portfolio balance divided by total
     * account count, not merely the number of populated balance cells.
     */
    averageBalance:
      accountCount&&balanceValues
        ?Math.round((balanceTotal/accountCount)*100)/100
        :null,

    chargeOffYear
  };
}

async function analyzeXlsx(file:File):Promise<PortfolioIntelligence>{
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet=workbook.worksheets[0];

  if(!worksheet){
    return {
      accountCount:0,
      principalBalance:null,
      averageBalance:null,
      chargeOffYear:''
    };
  }

  let headerRowNumber=0;

  for(let r=1;r<=Math.min(worksheet.rowCount,25);r++){
    const row=worksheet.getRow(r);
    let found=false;

    row.eachCell({includeEmpty:false},cell=>{
      if(String(cell.value??'').trim()){
        found=true;
      }
    });

    if(found){
      headerRowNumber=r;
      break;
    }
  }

  if(!headerRowNumber){
    return {
      accountCount:0,
      principalBalance:null,
      averageBalance:null,
      chargeOffYear:''
    };
  }

  const headerRow=worksheet.getRow(headerRowNumber);

  let accountColumn=0;
  let principalColumn=0;
  let balanceColumn=0;
  let chargeOffColumn=0;

  headerRow.eachCell({includeEmpty:false},(cell,column)=>{
    const header=normalizeHeader(cell.value);

    if(!accountColumn&&isAccountHeader(header)){
      accountColumn=column;
    }

    if(!principalColumn&&isPrincipalHeader(header)){
      principalColumn=column;
    }

    if(!balanceColumn&&isBalanceHeader(header)){
      balanceColumn=column;
    }

    if(!chargeOffColumn&&isChargeOffHeader(header)){
      chargeOffColumn=column;
    }
  });

  let accountCount=0;
  let principalTotal=0;
  let principalValues=0;
  let balanceTotal=0;
  let balanceValues=0;

  const years=new Set<number>();

  for(let r=headerRowNumber+1;r<=worksheet.rowCount;r++){
    const row=worksheet.getRow(r);

    let nonEmpty=false;

    row.eachCell({includeEmpty:false},cell=>{
      if(String(cell.value??'').trim()){
        nonEmpty=true;
      }
    });

    if(!nonEmpty)continue;

    if(accountColumn){
      const account=row.getCell(accountColumn).value;

      if(
        account!==null&&
        account!==undefined&&
        String(account).trim()!==''
      ){
        accountCount++;
      }
    }else{
      accountCount++;
    }

    if(principalColumn){
      const value=numeric(
        row.getCell(principalColumn).value
      );

      if(value!==null){
        principalTotal+=value;
        principalValues++;
      }
    }

    if(balanceColumn){
      const value=numeric(
        row.getCell(balanceColumn).value
      );

      if(value!==null){
        balanceTotal+=value;
        balanceValues++;
      }
    }

    if(chargeOffColumn){
      const year=yearFromValue(
        row.getCell(chargeOffColumn).value
      );

      if(year){
        years.add(year);
      }
    }
  }

  return finalize(
    accountCount,
    principalTotal,
    principalValues,
    balanceTotal,
    balanceValues,
    years
  );
}

function parseCsv(text:string):string[][]{
  const rows:string[][]=[];
  let row:string[]=[];
  let field='';
  let quoted=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];
    const next=text[i+1];

    if(ch==='"'){
      if(quoted&&next==='"'){
        field+='"';
        i++;
      }else{
        quoted=!quoted;
      }
    }else if(ch===','&&!quoted){
      row.push(field);
      field='';
    }else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&next==='\n')i++;

      row.push(field);
      field='';

      if(row.some(value=>value.trim()!=='')){
        rows.push(row);
      }

      row=[];
    }else{
      field+=ch;
    }
  }

  if(field.length||row.length){
    row.push(field);

    if(row.some(value=>value.trim()!=='')){
      rows.push(row);
    }
  }

  return rows;
}

async function analyzeCsv(file:File):Promise<PortfolioIntelligence>{
  const rows=parseCsv(await file.text());

  if(!rows.length){
    return {
      accountCount:0,
      principalBalance:null,
      averageBalance:null,
      chargeOffYear:''
    };
  }

  const headers=rows[0].map(normalizeHeader);

  const accountColumn=headers.findIndex(isAccountHeader);
  const principalColumn=headers.findIndex(isPrincipalHeader);
  const balanceColumn=headers.findIndex(isBalanceHeader);
  const chargeOffColumn=headers.findIndex(isChargeOffHeader);

  let accountCount=0;
  let principalTotal=0;
  let principalValues=0;
  let balanceTotal=0;
  let balanceValues=0;

  const years=new Set<number>();

  for(const row of rows.slice(1)){
    if(!row.some(value=>String(value??'').trim())){
      continue;
    }

    if(accountColumn>=0){
      if(String(row[accountColumn]??'').trim()){
        accountCount++;
      }
    }else{
      accountCount++;
    }

    if(principalColumn>=0){
      const value=numeric(row[principalColumn]);

      if(value!==null){
        principalTotal+=value;
        principalValues++;
      }
    }

    if(balanceColumn>=0){
      const value=numeric(row[balanceColumn]);

      if(value!==null){
        balanceTotal+=value;
        balanceValues++;
      }
    }

    if(chargeOffColumn>=0){
      const year=yearFromValue(row[chargeOffColumn]);

      if(year){
        years.add(year);
      }
    }
  }

  return finalize(
    accountCount,
    principalTotal,
    principalValues,
    balanceTotal,
    balanceValues,
    years
  );
}

export async function analyzePortfolioFile(
  file:File
):Promise<PortfolioIntelligence>{
  const lower=file.name.toLowerCase();

  if(lower.endsWith('.xlsx')){
    return analyzeXlsx(file);
  }

  if(lower.endsWith('.csv')){
    return analyzeCsv(file);
  }

  return {
    accountCount:0,
    principalBalance:null,
    averageBalance:null,
    chargeOffYear:''
  };
}
