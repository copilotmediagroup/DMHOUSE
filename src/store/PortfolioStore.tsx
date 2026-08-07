import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ExcelJS from 'exceljs';
import type { Portfolio, PortfolioFile, PortfolioStatus, UserRole } from '../types/domain';
import { supabase } from '../lib/supabase';

type Profile = { id:string; company_id:string; role:UserRole; full_name:string; is_active:boolean };
export type AuditEntry = { id:string; action:string; detail:string; occurredAt:string };
export type PortfolioFileType = 'masked'|'unmasked';
type CreateInput = Omit<Portfolio,'id'|'createdAt'|'status'|'file'|'maskedFile'|'unmaskedFile'> & { maskedFile?:File; unmaskedFile?:File; file?:File };
type Store={
 portfolios:Portfolio[]; audit:AuditEntry[]; role:UserRole; profile:Profile|null; loading:boolean; error:string;
 setRole:(role:UserRole)=>void; refresh:()=>Promise<void>;
 createPortfolio:(input:CreateInput)=>Promise<Portfolio>;
 updatePortfolio:(id:string,patch:Partial<Portfolio>)=>Promise<void>;
 uploadPortfolioFile:(portfolioId:string,type:PortfolioFileType,file:File)=>Promise<void>;
 transition:(id:string,status:PortfolioStatus)=>Promise<{ok:boolean;message:string}>;
 removePortfolio:(id:string)=>Promise<void>;
 getDownloadUrl:(portfolioId:string,type?:PortfolioFileType)=>Promise<string|null>;
 active?:Portfolio;
};
const Context=createContext<Store|null>(null);
const mapFile=(file:any):PortfolioFile|undefined=>file?{id:file.id,name:file.file_name,size:Number(file.size_bytes||0),type:file.mime_type||'text/csv',uploadedAt:file.created_at,storagePath:file.storage_path}:undefined;
function mapPortfolio(row:any,files:any[]=[]):Portfolio{
 const masked=files.find(f=>f.file_type==='masked'&&f.employee_visible!==false)||files.find(f=>f.file_type==='masked');
 const unmasked=files.find(f=>f.file_type==='unmasked');
 return {id:row.id,name:row.name,originalCreditor:row.original_creditor||'',category:row.category||'',accountCount:Number(row.account_count||0),faceValue:Number(row.face_value||0),askingPrice:Number(row.asking_price||0),privateMinimum:Number(row.private_minimum||0),acquisitionCost:Number(row.acquisition_cost||0),employeeCommissionType:row.employee_commission_type||'percentage',employeeCommissionValue:Number(row.employee_commission_value||0),employeeCommissionVisible:row.employee_commission_visible!==false,description:row.description||'',sellingPoints:Array.isArray(row.selling_points)?row.selling_points:[],status:row.status,createdAt:row.created_at,activatedAt:row.activated_at||undefined,file:mapFile(masked),maskedFile:mapFile(masked),unmaskedFile:mapFile(unmasked)};
}

const ACCOUNT_HEADER_PATTERN =
  /(^|_)(acct|account)(_|\s)*(no|num|number|id)?$|pri_acctno|accountnumber|account_number|acctno|acct_no/i;

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function accountCellToText(value: any): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') return value;

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString('fullwide', {
          useGrouping: false,
          maximumFractionDigits: 0,
        })
      : String(value);
  }

  if (typeof value === 'bigint') return value.toString();

  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) {
      return accountCellToText(value.result);
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((part: any) => part.text || '').join('');
    }

    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
  }

  return String(value);
}

async function normalizePortfolioSpreadsheet(file: File): Promise<File> {
  const lower = file.name.toLowerCase();

  // XLSX files support persistent text formatting.
  // CSV files are already plain text and are left byte-for-byte unchanged.
  if (!lower.endsWith('.xlsx')) return file;

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();

  await workbook.xlsx.load(buffer);

  workbook.eachSheet((worksheet) => {
    let headerRowNumber = 0;
    const accountColumns = new Set<number>();

    // Locate the first non-empty row and treat it as the header row.
    for (let r = 1; r <= Math.min(worksheet.rowCount, 25); r++) {
      const row = worksheet.getRow(r);

      let hasValues = false;

      row.eachCell({ includeEmpty: false }, (cell) => {
        if (String(cell.value ?? '').trim() !== '') {
          hasValues = true;
        }
      });

      if (hasValues) {
        headerRowNumber = r;
        break;
      }
    }

    if (!headerRowNumber) return;

    const headerRow = worksheet.getRow(headerRowNumber);

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = normalizeHeader(cell.value);

      if (
        ACCOUNT_HEADER_PATTERN.test(header) ||
        (header.includes('account') &&
          (header.includes('number') ||
            header.includes('num') ||
            header.endsWith('_id'))) ||
        (header.includes('acct') &&
          (header.includes('no') ||
            header.includes('num') ||
            header.includes('number')))
      ) {
        accountColumns.add(colNumber);
      }
    });

    accountColumns.forEach((colNumber) => {
      worksheet.getColumn(colNumber).numFmt = '@';

      for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
        const cell = worksheet.getRow(r).getCell(colNumber);

        if (cell.value === null || cell.value === undefined || cell.value === '') {
          continue;
        }

        const textValue = accountCellToText(cell.value);

        cell.value = textValue;
        cell.numFmt = '@';
      }
    });
  });

  const output = await workbook.xlsx.writeBuffer();

  return new File(
    [output],
    file.name,
    {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      lastModified: Date.now(),
    }
  );
}

export function PortfolioProvider({children}:{children:ReactNode}){
 const [portfolios,setPortfolios]=useState<Portfolio[]>([]);const [role,setRoleState]=useState<UserRole>('owner');const [profile,setProfile]=useState<Profile|null>(null);const [audit,setAudit]=useState<AuditEntry[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{const {data:{user}}=await supabase.auth.getUser();if(!user){setProfile(null);setPortfolios([]);setAudit([]);return;}let {data:profileRow,error:profileError}=await supabase.from('profiles').select('id,company_id,role,full_name,is_active').eq('id',user.id).maybeSingle();if(profileError)throw profileError;if(!profileRow){const accountType=user.user_metadata?.account_type||'owner';const boot=accountType==='buyer'?await supabase.rpc('bootstrap_dmh_buyer',{p_company_name:user.user_metadata?.company_name||'Buyer Company',p_contact_name:user.user_metadata?.full_name||user.email?.split('@')[0]||'Buyer',p_phone:user.user_metadata?.phone||null}):await supabase.rpc('bootstrap_dmh_owner',{p_full_name:user.user_metadata?.full_name||user.email?.split('@')[0]||'Owner'});if(boot.error)throw boot.error;const result=await supabase.from('profiles').select('id,company_id,role,full_name,is_active').eq('id',user.id).single();if(result.error)throw result.error;profileRow=result.data;}setProfile(profileRow as Profile);setRoleState(profileRow.role as UserRole);if(profileRow.role==='buyer'){setPortfolios([]);setAudit([]);return;}const portfolioFields=profileRow.role==='owner'?'*':'id,name,original_creditor,category,account_count,face_value,asking_price,employee_commission_type,employee_commission_value,employee_commission_visible,description,selling_points,status,created_at,activated_at';const {data:rows,error:rowsError}=await supabase.from('portfolios').select(portfolioFields).eq('company_id',profileRow.company_id).order('created_at',{ascending:false});if(rowsError)throw rowsError;const {data:files,error:filesError}=await supabase.from('portfolio_files').select('*').eq('company_id',profileRow.company_id).is('locked_at',null).order('version',{ascending:false});if(filesError)throw filesError;const grouped=new Map<string,any[]>();for(const f of files||[]){const list=grouped.get(f.portfolio_id)||[];if(!list.some(x=>x.file_type===f.file_type))list.push(f);grouped.set(f.portfolio_id,list);}setPortfolios(((rows||[]) as any[]).map(r=>mapPortfolio(r,grouped.get(r.id)||[])));const {data:auditRows}=await supabase.from('audit_logs').select('id,action,entity_type,created_at').eq('company_id',profileRow.company_id).order('created_at',{ascending:false}).limit(50);setAudit((auditRows||[]).map((a:any)=>({id:String(a.id),action:a.action,detail:`${a.action} · ${a.entity_type}`,occurredAt:a.created_at})));}catch(e){setError(e instanceof Error?e.message:'Unable to load portfolios.');}finally{setLoading(false)}},[]);
 useEffect(()=>{
  refresh();
  const {data}=supabase.auth.onAuthStateChange(()=>refresh());
  const channel=supabase
   .channel('dmh-portfolio-live-refresh')
   .on('postgres_changes',{event:'*',schema:'public',table:'portfolios'},()=>void refresh())
   .on('postgres_changes',{event:'*',schema:'public',table:'portfolio_files'},()=>void refresh())
   .subscribe();
  return()=>{
   data.subscription.unsubscribe();
   void supabase.removeChannel(channel);
  };
 },[refresh]);
 const uploadRaw=async(portfolioId:string,type:PortfolioFileType,file:File)=>{
  if(!profile||profile.role!=='owner')throw new Error('Owner profile is required.');

  const normalizedFile=await normalizePortfolioSpreadsheet(file);

  const current=portfolios.find(p=>p.id===portfolioId);
  const existing=type==='masked'?current?.maskedFile:current?.unmaskedFile;

  const safe=normalizedFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${profile.company_id}/${portfolioId}/${type}/${Date.now()}-${safe}`;

  const upload=await supabase.storage
    .from('portfolio-files')
    .upload(path,normalizedFile,{
      contentType:normalizedFile.type||'application/octet-stream',
      upsert:false
    });

  if(upload.error)throw upload.error;

  const {data:latest}=await supabase
    .from('portfolio_files')
    .select('version')
    .eq('portfolio_id',portfolioId)
    .eq('file_type',type)
    .order('version',{ascending:false})
    .limit(1)
    .maybeSingle();

  const meta=await supabase
    .from('portfolio_files')
    .insert({
      company_id:profile.company_id,
      portfolio_id:portfolioId,
      storage_path:path,
      file_name:normalizedFile.name,
      file_type:type,
      version:Number(latest?.version||0)+1,
      employee_visible:type==='masked',
      size_bytes:normalizedFile.size,
      mime_type:normalizedFile.type||'application/octet-stream'
    });

  if(meta.error){
    await supabase.storage.from('portfolio-files').remove([path]);
    throw meta.error;
  }

  if(existing?.id){
    await supabase
      .from('portfolio_files')
      .update({locked_at:new Date().toISOString()})
      .eq('id',existing.id);
  }
};

const uploadPortfolioFile=async(portfolioId:string,type:PortfolioFileType,file:File)=>{await uploadRaw(portfolioId,type,file);await refresh();};
 const createPortfolio=async(input:CreateInput)=>{if(!profile)throw new Error('Owner profile is not ready.');const {maskedFile,unmaskedFile,file,...values}=input;const {data:row,error:insertError}=await supabase.from('portfolios').insert({company_id:profile.company_id,created_by:profile.id,name:values.name,original_creditor:values.originalCreditor,category:values.category,account_count:values.accountCount,face_value:values.faceValue,asking_price:values.askingPrice,private_minimum:values.privateMinimum,acquisition_cost:values.acquisitionCost,employee_commission_type:values.employeeCommissionType,employee_commission_value:values.employeeCommissionValue,employee_commission_visible:values.employeeCommissionVisible,description:values.description,selling_points:values.sellingPoints,status:'draft'}).select('*').single();if(insertError)throw insertError;try{if(maskedFile||file)await uploadRaw(row.id,'masked',(maskedFile||file)!);if(unmaskedFile)await uploadRaw(row.id,'unmasked',unmaskedFile);}catch(e){await supabase.from('portfolios').delete().eq('id',row.id);throw e;}await refresh();return mapPortfolio(row,[]);};
 const updatePortfolio=async(id:string,patch:Partial<Portfolio>)=>{const db:any={};const pairs:any=[['name','name'],['originalCreditor','original_creditor'],['category','category'],['accountCount','account_count'],['faceValue','face_value'],['askingPrice','asking_price'],['privateMinimum','private_minimum'],['acquisitionCost','acquisition_cost'],['employeeCommissionType','employee_commission_type'],['employeeCommissionValue','employee_commission_value'],['employeeCommissionVisible','employee_commission_visible'],['description','description'],['sellingPoints','selling_points']];for(const [a,b] of pairs)if((patch as any)[a]!==undefined)db[b]=(patch as any)[a];const {error:e}=await supabase.from('portfolios').update(db).eq('id',id);if(e)throw e;await refresh();};
 const transition=async(id:string,status:PortfolioStatus)=>{try{const current=portfolios.find(p=>p.id===id);if(!current)return{ok:false,message:'Portfolio not found.'};if(status==='ready'&&!current.maskedFile)return{ok:false,message:'Upload a masked CSV before marking Ready.'};const patch:any={status};if(status==='active')patch.activated_at=new Date().toISOString();if(status==='sold')patch.sold_at=new Date().toISOString();const {error:e}=await supabase.from('portfolios').update(patch).eq('id',id);if(e)throw e;await refresh();return{ok:true,message:`${current.name} is now ${status}.`};}catch(e){return{ok:false,message:e instanceof Error?e.message:'Status change failed.'}}};
 const removePortfolio=async(id:string)=>{const p=portfolios.find(x=>x.id===id);const paths=[p?.maskedFile?.storagePath,p?.unmaskedFile?.storagePath].filter(Boolean) as string[];if(paths.length)await supabase.storage.from('portfolio-files').remove(paths);const {error:e}=await supabase.rpc('dmh_delete_portfolio',{p_portfolio_id:id});if(e)throw e;await refresh();};
 const getDownloadUrl=async(portfolioId:string,type:PortfolioFileType='masked')=>{const p=portfolios.find(x=>x.id===portfolioId);const f=type==='masked'?p?.maskedFile:p?.unmaskedFile;if(!f?.storagePath)return null;const {data,error:e}=await supabase.storage.from('portfolio-files').createSignedUrl(f.storagePath,300);if(e)throw e;return data.signedUrl;};
 const value=useMemo<Store>(()=>({portfolios,audit,role,profile,loading,error,setRole:setRoleState,refresh,createPortfolio,updatePortfolio,uploadPortfolioFile,transition,removePortfolio,getDownloadUrl,active:portfolios.find(p=>['active','negotiating','reserved','payment_pending'].includes(p.status))}),[portfolios,audit,role,profile,loading,error,refresh]);return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePortfolioStore(){const x=useContext(Context);if(!x)throw new Error('PortfolioProvider missing');return x}
