import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Portfolio, PortfolioStatus, UserRole } from '../types/domain';
import { supabase } from '../lib/supabase';

type Profile = { id:string; company_id:string; role:UserRole; full_name:string; is_active:boolean };
export type AuditEntry = { id:string; action:string; detail:string; occurredAt:string };
type CreateInput = Omit<Portfolio,'id'|'createdAt'|'status'|'file'> & { file?: File };
type Store={
 portfolios:Portfolio[]; audit:AuditEntry[]; role:UserRole; profile:Profile|null; loading:boolean; error:string;
 setRole:(role:UserRole)=>void; refresh:()=>Promise<void>;
 createPortfolio:(input:CreateInput)=>Promise<Portfolio>;
 updatePortfolio:(id:string,patch:Partial<Portfolio>)=>Promise<void>;
 transition:(id:string,status:PortfolioStatus)=>Promise<{ok:boolean;message:string}>;
 removePortfolio:(id:string)=>Promise<void>; getDownloadUrl:(portfolioId:string)=>Promise<string|null>;
 active?:Portfolio;
};
const Context=createContext<Store|null>(null);

function mapPortfolio(row:any,file?:any):Portfolio{return {
 id:row.id,name:row.name,originalCreditor:row.original_creditor||'',category:row.category||'',accountCount:Number(row.account_count||0),
 faceValue:Number(row.face_value||0),askingPrice:Number(row.asking_price||0),privateMinimum:Number(row.private_minimum||0),
 acquisitionCost:Number(row.acquisition_cost||0),employeeCommissionType:(row.employee_commission_type||'percentage'),employeeCommissionValue:Number(row.employee_commission_value||0),employeeCommissionVisible:row.employee_commission_visible!==false,description:row.description||'',sellingPoints:Array.isArray(row.selling_points)?row.selling_points:[],
 status:row.status,createdAt:row.created_at,activatedAt:row.activated_at||undefined,
 file:file?{id:file.id,name:file.file_name,size:Number(file.size_bytes||0),type:file.mime_type||'text/csv',uploadedAt:file.created_at,storagePath:file.storage_path}:undefined
};}

export function PortfolioProvider({children}:{children:ReactNode}){
 const [portfolios,setPortfolios]=useState<Portfolio[]>([]); const [role,setRoleState]=useState<UserRole>('owner');
 const [profile,setProfile]=useState<Profile|null>(null); const [audit,setAudit]=useState<AuditEntry[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{
  const {data:{user}}=await supabase.auth.getUser(); if(!user){setProfile(null);setPortfolios([]);setAudit([]);return;}
  let {data:profileRow,error:profileError}=await supabase.from('profiles').select('id,company_id,role,full_name,is_active').eq('id',user.id).maybeSingle();
  if(profileError)throw profileError;
  if(!profileRow){const accountType=user.user_metadata?.account_type||'owner';const boot=accountType==='buyer'?await supabase.rpc('bootstrap_dmh_buyer',{p_company_name:user.user_metadata?.company_name||'Buyer Company',p_contact_name:user.user_metadata?.full_name||user.email?.split('@')[0]||'Buyer',p_phone:user.user_metadata?.phone||null}):await supabase.rpc('bootstrap_dmh_owner',{p_full_name:user.user_metadata?.full_name||user.email?.split('@')[0]||'Owner'});if(boot.error)throw boot.error;
   const result=await supabase.from('profiles').select('id,company_id,role,full_name,is_active').eq('id',user.id).single();if(result.error)throw result.error;profileRow=result.data;}
  setProfile(profileRow as Profile); setRoleState(profileRow.role as UserRole);
  const portfolioFields=profileRow.role==='owner'?'*':'id,name,original_creditor,category,account_count,face_value,asking_price,employee_commission_type,employee_commission_value,employee_commission_visible,description,selling_points,status,created_at,activated_at';
  if(profileRow.role==='buyer'){setPortfolios([]);setAudit([]);return;}
  const {data:rows,error:rowsError}=await supabase.from('portfolios').select(portfolioFields).eq('company_id',profileRow.company_id).order('created_at',{ascending:false});if(rowsError)throw rowsError;
  const {data:files,error:filesError}=await supabase.from('portfolio_files').select('*').eq('company_id',profileRow.company_id).is('locked_at',null).order('version',{ascending:false});if(filesError)throw filesError;
  const byPortfolio=new Map<string,any>();for(const f of files||[])if(!byPortfolio.has(f.portfolio_id))byPortfolio.set(f.portfolio_id,f);
  setPortfolios((rows||[]).map(r=>mapPortfolio(r,byPortfolio.get(r.id))));
  const {data:auditRows,error:auditError}=await supabase.from('audit_logs').select('id,action,entity_type,created_at').eq('company_id',profileRow.company_id).order('created_at',{ascending:false}).limit(50);
  if(auditError){setAudit([]);}else{setAudit((auditRows||[]).map((a:any)=>({id:String(a.id),action:a.action,detail:`${a.action} · ${a.entity_type}`,occurredAt:a.created_at})));}
 }catch(e){setError(e instanceof Error?e.message:'Unable to load portfolios.');}finally{setLoading(false)}},[]);
 useEffect(()=>{refresh();const {data}=supabase.auth.onAuthStateChange(()=>refresh());return()=>data.subscription.unsubscribe()},[refresh]);
 const createPortfolio=async(input:CreateInput)=>{if(!profile)throw new Error('Owner profile is not ready.');
  const {file,...values}=input; const {data:row,error:insertError}=await supabase.from('portfolios').insert({company_id:profile.company_id,created_by:profile.id,name:values.name,original_creditor:values.originalCreditor,category:values.category,account_count:values.accountCount,face_value:values.faceValue,asking_price:values.askingPrice,private_minimum:values.privateMinimum,acquisition_cost:values.acquisitionCost,employee_commission_type:values.employeeCommissionType,employee_commission_value:values.employeeCommissionValue,employee_commission_visible:values.employeeCommissionVisible,description:values.description,selling_points:values.sellingPoints,status:'draft'}).select('*').single();if(insertError)throw insertError;
  let fileRow:any=null;
  if(file){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${profile.company_id}/${row.id}/${Date.now()}-${safe}`;const upload=await supabase.storage.from('portfolio-files').upload(path,file,{contentType:file.type||'text/csv',upsert:false});if(upload.error){await supabase.from('portfolios').delete().eq('id',row.id);throw upload.error;}
   const meta=await supabase.from('portfolio_files').insert({company_id:profile.company_id,portfolio_id:row.id,storage_path:path,file_name:file.name,version:1,employee_visible:true,size_bytes:file.size,mime_type:file.type||'text/csv'}).select('*').single();if(meta.error)throw meta.error;fileRow=meta.data;}
  const created=mapPortfolio(row,fileRow);setPortfolios(p=>[created,...p]);return created;
 };
 const updatePortfolio=async(id:string,patch:Partial<Portfolio>)=>{const db:any={};if(patch.name!==undefined)db.name=patch.name;if(patch.originalCreditor!==undefined)db.original_creditor=patch.originalCreditor;if(patch.category!==undefined)db.category=patch.category;if(patch.accountCount!==undefined)db.account_count=patch.accountCount;if(patch.faceValue!==undefined)db.face_value=patch.faceValue;if(patch.askingPrice!==undefined)db.asking_price=patch.askingPrice;if(patch.privateMinimum!==undefined)db.private_minimum=patch.privateMinimum;if(patch.acquisitionCost!==undefined)db.acquisition_cost=patch.acquisitionCost;if(patch.employeeCommissionType!==undefined)db.employee_commission_type=patch.employeeCommissionType;if(patch.employeeCommissionValue!==undefined)db.employee_commission_value=patch.employeeCommissionValue;if(patch.employeeCommissionVisible!==undefined)db.employee_commission_visible=patch.employeeCommissionVisible;if(patch.description!==undefined)db.description=patch.description;if(patch.sellingPoints!==undefined)db.selling_points=patch.sellingPoints;
  const {error:e}=await supabase.from('portfolios').update(db).eq('id',id);if(e)throw e;await refresh();};
 const transition=async(id:string,status:PortfolioStatus)=>{try{const current=portfolios.find(p=>p.id===id);if(!current)return{ok:false,message:'Portfolio not found.'};if(status==='ready'&&!current.file)return{ok:false,message:'Upload a masked CSV before marking Ready.'};
  const patch:any={status};if(status==='active')patch.activated_at=new Date().toISOString();if(status==='sold')patch.sold_at=new Date().toISOString();const {error:e}=await supabase.from('portfolios').update(patch).eq('id',id);if(e)throw e;await refresh();return{ok:true,message:`${current.name} is now ${status}.`};}catch(e){return{ok:false,message:e instanceof Error?e.message:'Status change failed.'}}};
 const removePortfolio=async(id:string)=>{const p=portfolios.find(x=>x.id===id);if(p?.file?.storagePath)await supabase.storage.from('portfolio-files').remove([p.file.storagePath]);const {error:e}=await supabase.from('portfolios').delete().eq('id',id).eq('status','draft');if(e)throw e;setPortfolios(x=>x.filter(p=>p.id!==id));};
 const getDownloadUrl=async(portfolioId:string)=>{const p=portfolios.find(x=>x.id===portfolioId);if(!p?.file?.storagePath)return null;const {data,error:e}=await supabase.storage.from('portfolio-files').createSignedUrl(p.file.storagePath,300);if(e)throw e;return data.signedUrl;};
 const value=useMemo<Store>(()=>({portfolios,audit,role,profile,loading,error,setRole:setRoleState,refresh,createPortfolio,updatePortfolio,transition,removePortfolio,getDownloadUrl,active:portfolios.find(p=>['active','negotiating','reserved','payment_pending'].includes(p.status))}),[portfolios,audit,role,profile,loading,error,refresh]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePortfolioStore(){const x=useContext(Context);if(!x)throw new Error('PortfolioProvider missing');return x}
