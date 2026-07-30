import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { usePortfolioStore } from './PortfolioStore';
import { useAgencyStore } from './AgencyStore';

export type DeliveryMethod='download'|'email';
export type DistributionStatus='prepared'|'queued'|'downloaded'|'sent'|'delivered'|'failed'|'bounced'|'locked';
export type RecipientType='general_agency'|'named_contact';
export interface DistributionRecord{
  id:string; portfolioId:string; portfolioName:string; fileId:string; fileName:string; fileVersion:number;
  agencyId:string; agencyName:string; contactId?:string; contactName?:string; contactEmail:string; recipientType:RecipientType;
  employeeId:string; employeeName:string; method:DeliveryMethod; reason:string; status:DistributionStatus;
  createdAt:string; deliveredAt?:string; followUpAt:string; riskFlags:string[]; testMode?:boolean; providerMessageId?:string; failureReason?:string;
}
interface Store{
  distributions:DistributionRecord[]; loading:boolean; error:string; refresh:()=>Promise<void>;
  createDistribution:(input:{agencyId:string;contactId?:string;recipientEmail:string;recipientName?:string;recipientType:RecipientType;method:DeliveryMethod;reason:string;followUpAt:string})=>Promise<{ok:boolean;message:string;record?:DistributionRecord}>;
  sendEmail:(id:string,subject:string,testMode:boolean)=>Promise<{ok:boolean;message:string;testMode?:boolean}>; markDelivered:(id:string)=>Promise<void>; lockDistribution:(id:string)=>Promise<void>;
  alreadySent:(portfolioId:string,agencyId:string,recipientEmail:string)=>DistributionRecord[]; activeFileLocked:boolean;
}
const Context=createContext<Store|null>(null);
const normalizeEmail=(value:string)=>value.trim().toLowerCase();
export function DistributionProvider({children}:{children:ReactNode}){
  const {active,profile}=usePortfolioStore();
  const {agencies,currentEmployee,addActivity}=useAgencyStore();
  const [distributions,setDistributions]=useState<DistributionRecord[]>([]);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    if(!profile){setDistributions([]);setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const {data,error:e}=await supabase.from('portfolio_distributions').select('*').eq('company_id',profile.company_id).order('created_at',{ascending:false});
      if(e)throw e;
      const rows=data||[];
      setDistributions(rows.map((x:any)=>{
        const portfolio=active?.id===x.portfolio_id?active:undefined;
        const agency=agencies.find(a=>a.id===x.agency_id);
        const contact=agency?.contacts.find(c=>c.id===x.contact_id);
        return {id:x.id,portfolioId:x.portfolio_id,portfolioName:portfolio?.name||x.portfolio_name||'Portfolio',fileId:x.file_id||x.file_version_id||'',fileName:x.file_name||portfolio?.file?.name||'Masked portfolio',fileVersion:Number(x.file_version||1),agencyId:x.agency_id,agencyName:agency?.name||x.agency_name||'Agency',contactId:x.contact_id||undefined,contactName:x.recipient_name||(contact?`${contact.firstName} ${contact.lastName}`.trim():undefined),contactEmail:x.recipient_email||contact?.email||'',recipientType:(x.recipient_type||'general_agency') as RecipientType,employeeId:x.employee_id,employeeName:x.employee_name||currentEmployee.name,method:x.delivery_method,status:x.status,reason:x.business_reason||x.purpose||'',createdAt:x.created_at||x.distributed_at,deliveredAt:x.delivered_at||undefined,followUpAt:x.follow_up_at,riskFlags:Array.isArray(x.risk_flags)?x.risk_flags:[],testMode:Boolean(x.test_mode),providerMessageId:x.provider_message_id||undefined,failureReason:x.failure_reason||undefined};
      }));
    }catch(e){setError(e instanceof Error?e.message:'Unable to load distributions.');}finally{setLoading(false);}
  },[profile,agencies,active,currentEmployee.name]);
  useEffect(()=>{void refresh()},[refresh]);
  const alreadySent=(portfolioId:string,agencyId:string,recipientEmail:string)=>{const email=normalizeEmail(recipientEmail);return distributions.filter(d=>d.portfolioId===portfolioId&&d.agencyId===agencyId&&normalizeEmail(d.contactEmail)===email&&d.status!=='locked');};
  const createDistribution:Store['createDistribution']=async(input)=>{
    try{
      if(!active||!profile)return{ok:false,message:'There is no active portfolio available for distribution.'};
      if(!active.file)return{ok:false,message:'The active portfolio has no approved masked file.'};
      if(['reserved','payment_pending','sold'].includes(active.status))return{ok:false,message:'Distribution is locked while this portfolio is reserved, pending payment, or sold.'};
      const agency=agencies.find(a=>a.id===input.agencyId);if(!agency)return{ok:false,message:'Select an agency.'};
      const recipientEmail=normalizeEmail(input.recipientEmail);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))return{ok:false,message:'Enter a valid recipient email address.'};
      let contactId=input.contactId||null;let contactName=input.recipientName?.trim()||'';
      if(input.recipientType==='named_contact'){
        const contact=agency.contacts.find(c=>c.id===input.contactId);if(!contact)return{ok:false,message:'Select a named contact or use the agency general email.'};
        contactId=contact.id;contactName=`${contact.firstName} ${contact.lastName}`.trim();if(normalizeEmail(contact.email)!==recipientEmail)return{ok:false,message:'The selected contact email does not match the recipient email.'};
      }
      const previous=alreadySent(active.id,agency.id,recipientEmail);
      const {data,error:e}=await supabase.rpc('dmh_create_distribution',{p_portfolio_id:active.id,p_file_id:active.file.id,p_agency_id:agency.id,p_contact_id:contactId,p_recipient_email:recipientEmail,p_recipient_name:contactName||null,p_recipient_type:input.recipientType,p_delivery_method:input.method,p_business_reason:input.reason,p_follow_up_at:input.followUpAt});
      if(e)throw e;
      await addActivity(agency.id,{type:'note',disposition:'Requested portfolio',notes:`Masked portfolio prepared for ${contactName||agency.name} (${recipientEmail}).`,followUpAt:input.followUpAt,contactId:contactId||undefined});
      await refresh();
      const record=(data?{id:data.id,portfolioId:active.id,portfolioName:active.name,fileId:active.file.id,fileName:active.file.name,fileVersion:1,agencyId:agency.id,agencyName:agency.name,contactId:contactId||undefined,contactName:contactName||undefined,contactEmail:recipientEmail,recipientType:input.recipientType,employeeId:profile.id,employeeName:profile.full_name,method:input.method,reason:input.reason,status:'prepared' as const,createdAt:data.created_at,followUpAt:input.followUpAt,riskFlags:Array.isArray(data.risk_flags)?data.risk_flags:previous.length?['Repeat recipient']:[]}:undefined);
      return{ok:true,message:previous.length?'Distribution prepared. Warning: this email has received this portfolio before.':'Distribution prepared and saved to Supabase.',record};
    }catch(e){return{ok:false,message:e instanceof Error?e.message:'Unable to prepare distribution.'};}
  };
  const sendEmail:Store['sendEmail']=async(id,subject,testMode)=>{try{const {data,error:e}=await supabase.functions.invoke('send-portfolio-email',{body:{distributionId:id,subject,testMode}});if(e)throw e;if(!data?.ok)throw new Error(data?.error||'Unable to send email.');await refresh();return{ok:true,message:data.testMode?'Test email accepted by provider. The intended buyer was not contacted.':'Email accepted by provider. Delivery is not yet confirmed.',testMode:Boolean(data.testMode)};}catch(e){await refresh();return{ok:false,message:e instanceof Error?e.message:'Unable to send email.'};}};
  const markDelivered=async(id:string)=>{const row=distributions.find(d=>d.id===id);if(!row)throw new Error('Distribution not found.');const status=row.method==='email'?'sent':'downloaded';const {error:e}=await supabase.rpc('dmh_set_distribution_status',{p_distribution_id:id,p_status:status});if(e)throw e;await refresh();};
  const lockDistribution=async(id:string)=>{const {error:e}=await supabase.rpc('dmh_set_distribution_status',{p_distribution_id:id,p_status:'locked'});if(e)throw e;await refresh();};
  const value=useMemo<Store>(()=>({distributions,loading,error,refresh,createDistribution,sendEmail,markDelivered,lockDistribution,alreadySent,activeFileLocked:Boolean(active&&['reserved','payment_pending','sold'].includes(active.status))}),[distributions,loading,error,refresh,active,agencies]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDistributionStore(){const x=useContext(Context);if(!x)throw new Error('DistributionProvider missing');return x}
