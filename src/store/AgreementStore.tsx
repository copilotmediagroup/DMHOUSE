import {createContext,useContext,useMemo,type ReactNode} from 'react';
import {supabase} from '../lib/supabase';

export type AgreementType='nda'|'purchase_agreement';
export type AgreementFields={
  buyerCompany:string;buyerName:string;buyerTitle:string;buyerAddress:string;buyerEmail:string;buyerPhone:string;
  sellerCompany:string;sellerName:string;sellerTitle:string;
  portfolioName:string;creditors:string;accountCount:string;principalBalance:string;currentBalance:string;
  purchasePrice:string;priceBasis:string;saleType:string;mediaIncluded:string;stateCoverage:string;
  permittedUse:string;confidentialityPeriod:string;governingState:string;effectiveDate:string;expirationDate:string;
  paymentTerms:string;deliveryMethod:string;deliveryDeadline:string;specialConditions:string;customClauses:string;
};
export type GeneratedAgreement={id:string;document_type:AgreementType;title:string;status:string;field_values:AgreementFields;rendered_html:string;seller_name?:string;seller_title?:string;seller_signature_style?:string;seller_signed_at?:string;buyer_name?:string;buyer_title?:string;buyer_signature_style?:string;buyer_signed_at?:string;created_at:string};
type Store={upsertBuyer:(args:{email:string;companyName:string;contactName:string;title?:string;phone?:string})=>Promise<string>;workflowState:(id:string)=>Promise<any>;save:(args:{documentId?:string;roomId?:string;buyerId?:string;portfolioId?:string;type:AgreementType;title:string;fields:AgreementFields;html:string})=>Promise<string>;sign:(id:string,name:string,title:string,style:string)=>Promise<void>;send:(id:string,subject:string,message?:string)=>Promise<any>;history:(id:string)=>Promise<any[]>;listForPortfolio:(portfolioId:string)=>Promise<GeneratedAgreement[]>;listBuyerDocuments:(portfolioId:string)=>Promise<GeneratedAgreement[]>};
const C=createContext<Store|null>(null);
export function AgreementProvider({children}:{children:ReactNode}){
 const upsertBuyer=async(args:Parameters<Store['upsertBuyer']>[0])=>{const {data,error}=await supabase.rpc('dmh_upsert_transaction_buyer',{p_email:args.email.trim().toLowerCase(),p_company_name:args.companyName,p_contact_name:args.contactName,p_title:args.title||null,p_phone:args.phone||null});if(error)throw error;return String(data)};
 const workflowState=async(id:string)=>{const {data,error}=await supabase.rpc('dmh_document_workflow_state',{p_document_id:id});if(error)throw error;return data};
 const save=async(a:Parameters<Store['save']>[0])=>{const {data,error}=await supabase.rpc('dmh_save_generated_document',{p_document_id:a.documentId||null,p_room_id:a.roomId||null,p_buyer_id:a.buyerId||null,p_portfolio_id:a.portfolioId||null,p_document_type:a.type,p_title:a.title,p_field_values:a.fields,p_rendered_html:a.html});if(error)throw error;return String(data)};
 const sign=async(id:string,name:string,title:string,style:string)=>{const {error}=await supabase.rpc('dmh_apply_typed_signature',{p_document_id:id,p_typed_name:name,p_title:title||null,p_signature_style:style,p_intent_confirmed:true,p_user_agent:navigator.userAgent});if(error)throw error};
 const send=async(id:string,subject:string,message?:string)=>{const {data,error}=await supabase.functions.invoke('send-buyer-invite',{body:{documentId:id,subject,message}});if(error)throw error;if(data?.error)throw new Error(data.error);return data};
 const history=async(id:string)=>{const {data,error}=await supabase.rpc('dmh_buyer_invitation_history',{p_document_id:id});if(error)throw error;return data||[]};
 const listForPortfolio=async(portfolioId:string)=>{const {data,error}=await supabase.from('deal_documents_generated').select('*').eq('portfolio_id',portfolioId).order('created_at',{ascending:false});if(error)throw error;return (data||[]) as GeneratedAgreement[]};
 const listBuyerDocuments=async(portfolioId:string)=>{const {data,error}=await supabase.from('deal_documents_generated').select('*').eq('portfolio_id',portfolioId).in('status',['sent_to_buyer','fully_executed']).order('created_at',{ascending:false});if(error)throw error;return (data||[]) as GeneratedAgreement[]};
 const value=useMemo(()=>({upsertBuyer,workflowState,save,sign,send,history,listForPortfolio,listBuyerDocuments}),[]);return <C.Provider value={value}>{children}</C.Provider>
}
export function useAgreementStore(){const x=useContext(C);if(!x)throw new Error('AgreementProvider missing');return x}
