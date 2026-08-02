import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {supabase} from '../lib/supabase';
import {usePortfolioStore} from './PortfolioStore';

export type Conversation={id:string;agencyId:string;opportunityId?:string;assignedEmployeeId?:string;ownerJoined:boolean;ownerTakenOver:boolean;status:string;priority:string;subject?:string;lastMessageAt?:string;lastInboundAt?:string;lastOutboundAt?:string;nextFollowUpAt?:string;createdAt:string};
export type ConversationMessage={id:string;conversationId:string;agencyId:string;contactId?:string;senderProfileId?:string;direction:'outbound'|'inbound'|'internal';fromEmail?:string;toEmail?:string;subject?:string;body:string;providerThreadId?:string;rfcMessageId?:string;isRead:boolean;createdAt:string};
export type EmployeeOption={id:string;name:string;active:boolean};
type WorkflowInput={status?:string;priority?:string;nextFollowUpAt?:string;clearFollowUp?:boolean};
type Store={conversations:Conversation[];messages:ConversationMessage[];employees:EmployeeOption[];tests:any[];loading:boolean;syncing:boolean;error:string;refresh:()=>Promise<void>;syncInbox:()=>Promise<{imported:number;unassigned:number}>;ensure:(agencyId:string)=>Promise<string>;setState:(id:string,input:{status?:string;assignedEmployeeId?:string;ownerJoined?:boolean;takeOwnership?:boolean;releaseOwnership?:boolean})=>Promise<void>;setWorkflow:(id:string,input:WorkflowInput)=>Promise<void>;markRead:(conversationId:string,providerThreadId?:string)=>Promise<void>;sendReply:(conversationId:string,agencyId:string,recipient:string,subject:string,body:string,providerThreadId?:string)=>Promise<void>;addInternalNote:(conversationId:string,body:string)=>Promise<void>;sendTest:(recipient:string,subject:string,body:string)=>Promise<void>};
const C=createContext<Store|null>(null);

export function ConversationProvider({children}:{children:ReactNode}){
 const {profile}=usePortfolioStore();
 const [conversations,setConversations]=useState<Conversation[]>([]),[messages,setMessages]=useState<ConversationMessage[]>([]),[employees,setEmployees]=useState<EmployeeOption[]>([]),[tests,setTests]=useState<any[]>([]);
 const [loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(async()=>{if(!profile){setLoading(false);return}setLoading(true);setError('');const [c,m,p,t]=await Promise.all([
  supabase.from('conversations').select('*').eq('company_id',profile.company_id).order('last_message_at',{ascending:false,nullsFirst:false}),
  supabase.from('conversation_messages').select('*').eq('company_id',profile.company_id).order('created_at'),
  supabase.from('profiles').select('id,full_name,is_active,role').eq('company_id',profile.company_id).eq('role','employee'),
  profile.role==='owner'?supabase.from('owner_email_tests').select('*').eq('company_id',profile.company_id).order('created_at',{ascending:false}).limit(10):Promise.resolve({data:[],error:null}) as any
 ]);for(const r of [c,m,p,t])if(r.error&&r.error.code!=='42P01')setError(r.error.message);
 setConversations((c.data||[]).map((r:any)=>({id:r.id,agencyId:r.agency_id,opportunityId:r.opportunity_id||undefined,assignedEmployeeId:r.assigned_employee_id||undefined,ownerJoined:!!r.owner_joined,ownerTakenOver:!!r.owner_taken_over,status:r.status,priority:r.follow_up_priority||r.priority||'normal',subject:r.subject||undefined,lastMessageAt:r.last_message_at||undefined,lastInboundAt:r.last_inbound_at||undefined,lastOutboundAt:r.last_outbound_at||undefined,nextFollowUpAt:r.next_follow_up_at||undefined,createdAt:r.created_at})));
 setMessages((m.data||[]).map((r:any)=>({id:r.id,conversationId:r.conversation_id,agencyId:r.agency_id,contactId:r.contact_id||undefined,senderProfileId:r.sender_profile_id||undefined,direction:r.direction,fromEmail:r.from_email||undefined,toEmail:r.to_email||undefined,subject:r.subject||undefined,body:r.body,providerThreadId:r.provider_thread_id||undefined,rfcMessageId:r.rfc_message_id||undefined,isRead:!!r.is_read,createdAt:r.created_at})));
 setEmployees((p.data||[]).map((r:any)=>({id:r.id,name:r.full_name,active:!!r.is_active})));setTests(t.data||[]);setLoading(false)},[profile]);
 const syncInbox=useCallback(async()=>{
  if(!profile)return {imported:0,unassigned:0};
  setSyncing(true);
  try{
   const {data,error:e}=await supabase.functions.invoke('google-workspace-sync',{body:{}});
   if(e)throw e;
   if(data?.ok===false)throw new Error(data.error);
   await refresh();
   return {imported:Number(data?.imported||0),unassigned:Number(data?.unassigned||0)};
  }finally{setSyncing(false)}
 },[profile,refresh]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{
  if(!profile)return;
  const run=()=>void syncInbox().catch(()=>undefined);
  const initial=window.setTimeout(run,1200);
  const interval=window.setInterval(run,60000);
  return()=>{window.clearTimeout(initial);window.clearInterval(interval)};
 },[profile,syncInbox]);
 useEffect(()=>{if(!profile)return;const channel=supabase.channel(`dmh-conversations-${profile.company_id}`).on('postgres_changes',{event:'*',schema:'public',table:'conversations',filter:`company_id=eq.${profile.company_id}`},()=>void refresh()).on('postgres_changes',{event:'*',schema:'public',table:'conversation_messages',filter:`company_id=eq.${profile.company_id}`},()=>void refresh()).subscribe();return()=>{void supabase.removeChannel(channel)}},[profile,refresh]);
 const ensure=async(agencyId:string)=>{const {data,error:e}=await supabase.rpc('dmh_get_or_create_conversation',{p_agency_id:agencyId});if(e)throw e;await refresh();return data as string};
 const setState=async(id:string,i:any)=>{const {error:e}=await supabase.rpc('dmh_set_conversation_state',{p_conversation_id:id,p_status:i.status||null,p_assigned_employee_id:i.assignedEmployeeId||null,p_owner_joined:i.ownerJoined??null,p_take_ownership:i.takeOwnership??null,p_release_ownership:i.releaseOwnership??null});if(e)throw e;await refresh()};
 const setWorkflow=async(id:string,i:WorkflowInput)=>{const {error:e}=await supabase.rpc('dmh_set_conversation_workflow',{p_conversation_id:id,p_status:i.status||null,p_priority:i.priority||null,p_next_follow_up_at:i.nextFollowUpAt||null,p_clear_follow_up:i.clearFollowUp||false});if(e)throw e;await refresh()};
 const markRead=async(conversationId:string,providerThreadId?:string)=>{let query=supabase.from('conversation_messages').update({is_read:true}).eq('conversation_id',conversationId).eq('direction','inbound');if(providerThreadId)query=query.eq('provider_thread_id',providerThreadId);const {error:e}=await query;if(e)throw e;await refresh()};
 const sendReply=async(conversationId:string,agencyId:string,recipient:string,subject:string,body:string,providerThreadId?:string)=>{if(!profile)throw new Error('Profile unavailable.');const related=messages.filter(m=>m.conversationId===conversationId&&(!providerThreadId||m.providerThreadId===providerThreadId));const contactId=[...related].reverse().find(m=>m.contactId)?.contactId||null;const {data,error:e}=await supabase.rpc('dmh_queue_outreach_email',{p_agency_id:agencyId,p_contact_id:contactId,p_portfolio_id:null,p_template_id:null,p_recipient:recipient,p_subject:subject,p_body:body,p_follow_up_at:null});if(e)throw e;const {data:fn,error:fe}=await supabase.functions.invoke('send-outreach-email',{body:{messageId:data,threadId:providerThreadId||null}});if(fe)throw fe;if(fn?.ok===false)throw new Error(fn.error);await supabase.from('conversations').update({last_message_at:new Date().toISOString(),last_outbound_at:new Date().toISOString(),subject,updated_at:new Date().toISOString()}).eq('id',conversationId);await refresh()};
 const addInternalNote=async(conversationId:string,body:string)=>{const {error:e}=await supabase.rpc('dmh_add_internal_conversation_note',{p_conversation_id:conversationId,p_body:body});if(e)throw e;await refresh()};
 const sendTest=async(recipient:string,subject:string,body:string)=>{const {data,error:e}=await supabase.functions.invoke('send-test-email',{body:{recipient,subject,body}});if(e)throw e;if(data?.ok===false)throw new Error(data.error);await refresh()};
 return <C.Provider value={useMemo(()=>({conversations,messages,employees,tests,loading,syncing,error,refresh,syncInbox,ensure,setState,setWorkflow,markRead,sendReply,addInternalNote,sendTest}),[conversations,messages,employees,tests,loading,syncing,error,refresh,syncInbox])}>{children}</C.Provider>
}
export function useConversationStore(){const x=useContext(C);if(!x)throw new Error('ConversationProvider missing');return x}
