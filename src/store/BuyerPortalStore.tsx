import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import ExcelJS from 'exceljs';
import {supabase} from '../lib/supabase';
import {usePortfolioStore} from './PortfolioStore';

export type BuyerProfile={id:string;company_name:string;contact_name:string;email:string;phone?:string;status:'pending'|'approved'|'denied'|'suspended';created_at:string};
export type BuyerPortfolio={id:string;name:string;category:string;accountCount:number;faceValue:number|null;askingPrice:number|null;description:string;sellingPoints:string[];status:string;canDownloadSample:boolean;expiresAt:string|null;disclosureSigned:boolean};
export type DealRoomSnapshot={room:any|null;offer:any|null;messages:any[];documents:any[];rounds:any[]};
export type BuyerAccess={id:string;buyer_id:string;portfolio_id:string;can_download_sample:boolean;expires_at:string|null;revoked_at:string|null;portfolio?:{name:string}};
export type BuyerWorkspaceDeal={room_id:string;portfolio_id:string;status:string;reservation_expires_at:string|null;agreement_approved_at:string|null;payment_confirmed_at:string|null;final_file_released_at:string|null;closed_at:string|null;created_at:string;updated_at:string;portfolio_name:string;category:string;account_count:number;face_value:number|null;asking_price:number|null;current_amount:number|null;offer_status:string;nda_executed:boolean;purchase_agreement_executed:boolean};
export type BuyerWorkspaceActivity={id:string;portfolio_id:string|null;event_type:string;metadata:Record<string,unknown>;created_at:string;portfolio_name:string|null};
export type BuyerWorkspaceDownload={id:string;portfolio_id:string;file_type:'masked'|'unmasked';downloaded_at:string;portfolio_name:string;file_name:string;version:number};
export type BuyerWorkspaceSnapshot={buyer:BuyerProfile|null;activeDeals:BuyerWorkspaceDeal[];purchaseHistory:BuyerWorkspaceDeal[];activity:BuyerWorkspaceActivity[];downloads:BuyerWorkspaceDownload[];relationship:{totalPurchases:number;lifetimeSpend:number;averageCloseDays:number;activeDeals:number;preferredCategory:string;tier:string}};
type Store={buyer:BuyerProfile|null;buyers:BuyerProfile[];portfolios:BuyerPortfolio[];access:BuyerAccess[];loading:boolean;error:string;refresh:()=>Promise<void>;setBuyerStatus:(id:string,status:BuyerProfile['status'])=>Promise<void>;grantAccess:(buyerId:string,portfolioId:string,download:boolean,expiresAt?:string)=>Promise<void>;acknowledge:(portfolioId:string)=>Promise<void>;submitOffer:(portfolioId:string,amount:number,terms:string,conditions:string)=>Promise<string>;sendMessage:(buyerId:string,portfolioId:string,body:string,offerId?:string)=>Promise<void>;loadRoom:(portfolioId:string)=>Promise<DealRoomSnapshot>;offerAction:(offerId:string,action:string,amount?:number,message?:string,expiresAt?:string)=>Promise<void>;dealGate:(roomId:string,gate:string)=>Promise<void>;closeDeal:(roomId:string)=>Promise<string>;uploadDocument:(roomId:string,type:string,title:string,url:string,visible:boolean)=>Promise<void>;getDocumentGate:(portfolioId:string)=>Promise<{nda_executed:boolean;purchase_agreement_executed:boolean}>;downloadPortfolioFile:(portfolioId:string,type:'masked'|'unmasked')=>Promise<void>;loadWorkspace:()=>Promise<BuyerWorkspaceSnapshot>};
const C=createContext<Store|null>(null);

function parsePortfolioCsv(text:string){
  const records:string[][]=[];
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
      if(row.some(v=>v.length>0))records.push(row);
      row=[];
    }else{
      field+=ch;
    }
  }

  if(field.length||row.length){
    row.push(field);
    if(row.some(v=>v.length>0))records.push(row);
  }

  return records;
}

function isAccountHeader(value:string){
  const h=value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'_');

  return (
    h==='pri_acctno' ||
    h==='acctno' ||
    h==='acct_no' ||
    h==='account_number' ||
    h==='account_num' ||
    h==='account_no' ||
    h==='account_id' ||
    h.includes('account_number') ||
    h.includes('account_num') ||
    h.includes('acct_no')
  );
}

async function downloadCsvAsExcel(url:string,fileName:string){
  const response=await fetch(url,{cache:'no-store'});

  if(!response.ok){
    throw new Error('Portfolio file could not be downloaded.');
  }

  const text=await response.text();
  const records=parsePortfolioCsv(text);

  if(!records.length){
    throw new Error('Portfolio file is empty.');
  }

  const workbook=new ExcelJS.Workbook();
  const worksheet=workbook.addWorksheet('Portfolio');

  records.forEach(record=>{
    worksheet.addRow(record);
  });

  const headers=records[0]||[];

  headers.forEach((header,index)=>{
    const columnNumber=index+1;

    if(isAccountHeader(header)){
      const column=worksheet.getColumn(columnNumber);
      column.numFmt='@';

      for(let rowNumber=2;rowNumber<=worksheet.rowCount;rowNumber++){
        const cell=worksheet.getRow(rowNumber).getCell(columnNumber);

        if(cell.value!==null&&cell.value!==undefined){
          cell.value=String(cell.value);
          cell.numFmt='@';
        }
      }
    }
  });

  worksheet.columns.forEach(column=>{
    column.width=Math.min(
      40,
      Math.max(
        12,
        ...(column.values||[]).map(value=>String(value??'').length+2)
      )
    );
  });

  const buffer=await workbook.xlsx.writeBuffer();

  const blob=new Blob(
    [buffer],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
  );

  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=fileName.replace(/\.csv$/i,'')+'.xlsx';

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(link.href);
}

export function BuyerPortalProvider({children}:{children:ReactNode}){const {profile}=usePortfolioStore();const [buyer,setBuyer]=useState<BuyerProfile|null>(null);const [buyers,setBuyers]=useState<BuyerProfile[]>([]);const [portfolios,setPortfolios]=useState<BuyerPortfolio[]>([]);const [access,setAccess]=useState<BuyerAccess[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
const refresh=useCallback(async()=>{if(!profile)return;setLoading(true);setError('');try{if(profile.role==='buyer'){const {data,error}=await supabase.rpc('dmh_buyer_marketplace');if(error)throw error;const raw:any=data||{};setBuyer(raw.buyer||null);setPortfolios(raw.portfolios||[]);setBuyers([]);setAccess([]);}else if(profile.role==='owner'){const [b,a]=await Promise.all([supabase.from('buyer_profiles').select('*').eq('company_id',profile.company_id).order('created_at',{ascending:false}),supabase.from('buyer_portfolio_access').select('*,portfolio:portfolios(name)').eq('company_id',profile.company_id).order('granted_at',{ascending:false})]);if(b.error)throw b.error;if(a.error)throw a.error;setBuyers((b.data||[]) as BuyerProfile[]);setAccess((a.data||[]) as BuyerAccess[]);setBuyer(null);setPortfolios([]);}}catch(e){setError(e instanceof Error?e.message:'Unable to load buyer portal.')}finally{setLoading(false)}},[profile]);
useEffect(()=>{refresh()},[refresh]);
const setBuyerStatus=async(id:string,status:BuyerProfile['status'])=>{const {error}=await supabase.rpc('dmh_set_buyer_status',{p_buyer_id:id,p_status:status});if(error)throw error;await refresh()};
const grantAccess=async(buyerId:string,portfolioId:string,download:boolean,expiresAt?:string)=>{const {error}=await supabase.rpc('dmh_grant_buyer_portfolio_access',{p_buyer_id:buyerId,p_portfolio_id:portfolioId,p_can_download_sample:download,p_expires_at:expiresAt||null});if(error)throw error;await refresh()};
const acknowledge=async(portfolioId:string)=>{const {error}=await supabase.rpc('dmh_buyer_acknowledge_disclosure',{p_portfolio_id:portfolioId});if(error)throw error;await refresh()};
const submitOffer=async(portfolioId:string,amount:number,terms:string,conditions:string)=>{const {data,error}=await supabase.rpc('dmh_buyer_submit_offer',{p_portfolio_id:portfolioId,p_amount:amount,p_payment_terms:terms||null,p_conditions:conditions||null});if(error)throw error;await refresh();return String(data)};
const loadRoom=async(portfolioId:string)=>{const {data,error}=await supabase.rpc('dmh_deal_room_snapshot',{p_portfolio_id:portfolioId});if(error)throw error;return (data||{room:null,offer:null,messages:[],documents:[],rounds:[]}) as DealRoomSnapshot};
const offerAction=async(offerId:string,action:string,amount?:number,message?:string,expiresAt?:string)=>{const {error}=await supabase.rpc('dmh_deal_offer_action',{p_offer_id:offerId,p_action:action,p_amount:amount||null,p_message:message||null,p_reservation_expires_at:expiresAt||null});if(error)throw error};
const dealGate=async(roomId:string,gate:string)=>{const {error}=await supabase.rpc('dmh_deal_gate',{p_room_id:roomId,p_gate:gate});if(error)throw error};
const closeDeal=async(roomId:string)=>{const {data,error}=await supabase.rpc('dmh_close_buyer_deal',{p_room_id:roomId});if(error)throw error;return String(data)};
const uploadDocument=async(roomId:string,type:string,title:string,url:string,visible:boolean)=>{if(!profile)throw new Error('Profile unavailable');const {error}=await supabase.from('buyer_deal_documents').insert({company_id:profile.company_id,room_id:roomId,document_type:type,title,external_url:url||null,status:'uploaded',visible_to_buyer:visible,uploaded_by:profile.id});if(error)throw error};

const getDocumentGate=async(portfolioId:string)=>{const {data,error}=await supabase.rpc('dmh_document_access_gate',{p_portfolio_id:portfolioId});if(error)throw error;return (data||{nda_executed:false,purchase_agreement_executed:false}) as {nda_executed:boolean;purchase_agreement_executed:boolean}};
const loadWorkspace=useCallback(async()=>{const {data,error}=await supabase.rpc('dmh_buyer_workspace');if(error)throw error;return data as BuyerWorkspaceSnapshot},[]);
const downloadPortfolioFile=async(portfolioId:string,type:'masked'|'unmasked')=>{
  const {data,error}=await supabase.rpc('dmh_portfolio_file_access',{
    p_portfolio_id:portfolioId,
    p_file_type:type
  });

  if(error)throw error;

  const row:any=data;

  const signed=await supabase.storage
    .from('portfolio-files')
    .createSignedUrl(row.storagePath,300);

  if(signed.error)throw signed.error;

  if(String(row.fileName||'').toLowerCase().endsWith('.csv')){
    await downloadCsvAsExcel(signed.data.signedUrl,row.fileName);
    return;
  }

  window.open(
    signed.data.signedUrl,
    '_blank',
    'noopener,noreferrer'
  );
};
const sendMessage=async(buyerId:string,portfolioId:string,body:string,offerId?:string)=>{if(!profile)throw new Error('Profile unavailable');const {error}=await supabase.from('buyer_deal_messages').insert({company_id:profile.company_id,buyer_id:buyerId,portfolio_id:portfolioId,offer_id:offerId||null,sender_role:profile.role,sender_id:profile.id,body});if(error)throw error;};
const value=useMemo(()=>({buyer,buyers,portfolios,access,loading,error,refresh,setBuyerStatus,grantAccess,acknowledge,submitOffer,sendMessage,loadRoom,offerAction,dealGate,closeDeal,uploadDocument,getDocumentGate,downloadPortfolioFile,loadWorkspace}),[buyer,buyers,portfolios,access,loading,error,refresh,loadWorkspace]);return <C.Provider value={value}>{children}</C.Provider>}
export function useBuyerPortalStore(){const x=useContext(C);if(!x)throw new Error('BuyerPortalProvider missing');return x}
