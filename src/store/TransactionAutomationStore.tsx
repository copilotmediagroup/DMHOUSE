import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {supabase} from '../lib/supabase';
import {usePortfolioStore} from './PortfolioStore';

export type TransactionAlert={id:string;type:string;title:string;body?:string;action_path?:string;severity:'info'|'warning'|'critical'|'success';due_at?:string;read_at?:string;created_at:string;resolved_at?:string};
export type AutomationSettings={nda_reminder_hours:number;agreement_reminder_hours:number;reservation_warning_hours:number;payment_warning_days:number;owner_escalation_enabled:boolean;buyer_alerts_enabled:boolean;employee_alerts_enabled:boolean};
export type CommandMetrics={nda_waiting:number;agreements_waiting:number;payments_due:number;payments_overdue:number;reservations_expiring:number;final_release_ready:number;unread_alerts:number;settings?:AutomationSettings};
export type FollowUpItem={id:string;reminder_type:string;recipient:string;subject:string;status:'queued'|'sending'|'sent'|'failed'|'cancelled';scheduled_for:string;sent_at?:string;last_error?:string;created_at:string};
export type FollowUpSnapshot={queued:number;sent:number;failed:number;due_now:number;recent:FollowUpItem[]};
type Store={alerts:TransactionAlert[];metrics:CommandMetrics|null;followUps:FollowUpSnapshot|null;loading:boolean;error:string;refresh:()=>Promise<void>;run:()=>Promise<number>;planFollowUps:()=>Promise<number>;sendFollowUps:()=>Promise<{sent:number;failed:number}>;markRead:(id:string)=>Promise<void>;markAllRead:()=>Promise<void>;saveSettings:(s:AutomationSettings)=>Promise<void>};
const C=createContext<Store|null>(null);
export function TransactionAutomationProvider({children}:{children:ReactNode}){
 const {profile}=usePortfolioStore();const [alerts,setAlerts]=useState<TransactionAlert[]>([]);const [metrics,setMetrics]=useState<CommandMetrics|null>(null);const [followUps,setFollowUps]=useState<FollowUpSnapshot|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 const refresh=useCallback(async()=>{if(!profile)return;setLoading(true);setError('');try{const {data:a,error:ae}=await supabase.from('notifications').select('id,type,title,body,action_path,severity,due_at,read_at,created_at,resolved_at').is('resolved_at',null).order('created_at',{ascending:false}).limit(100);if(ae)throw ae;setAlerts((a||[]) as TransactionAlert[]);if(profile.role==='owner'){const [{data:m,error:me},{data:f,error:fe}]=await Promise.all([supabase.rpc('dmh_transaction_command_center'),supabase.rpc('dmh_transaction_followup_snapshot')]);if(me)throw me;if(fe)throw fe;setMetrics(m as CommandMetrics);setFollowUps(f as FollowUpSnapshot)}}catch(e){setError(e instanceof Error?e.message:'Unable to load transaction alerts')}finally{setLoading(false)}},[profile]);
 useEffect(()=>{void refresh()},[refresh]);
 const run=async()=>{const {data,error}=await supabase.rpc('dmh_run_transaction_automation');if(error)throw error;await refresh();return Number(data?.notifications_processed||0)};
 const planFollowUps=async()=>{const {data,error}=await supabase.rpc('dmh_plan_transaction_followups');if(error)throw error;await refresh();return Number(data?.planned||0)};
 const sendFollowUps=async()=>{const {data,error}=await supabase.functions.invoke('send-transaction-followups',{body:{}});if(error)throw error;if(data?.ok===false)throw new Error(data.error||'Follow-up delivery failed.');await refresh();return{sent:Number(data?.sent||0),failed:Number(data?.failed||0)}};
 const markRead=async(id:string)=>{const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(error)throw error;await refresh()};
 const markAllRead=async()=>{const ids=alerts.filter(a=>!a.read_at).map(a=>a.id);if(!ids.length)return;const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).in('id',ids);if(error)throw error;await refresh()};
 const saveSettings=async(s:AutomationSettings)=>{const {error}=await supabase.rpc('dmh_set_transaction_automation_settings',{p_nda_hours:s.nda_reminder_hours,p_agreement_hours:s.agreement_reminder_hours,p_reservation_hours:s.reservation_warning_hours,p_payment_days:s.payment_warning_days,p_owner_escalation:s.owner_escalation_enabled,p_buyer_alerts:s.buyer_alerts_enabled,p_employee_alerts:s.employee_alerts_enabled});if(error)throw error;await refresh()};
 const value=useMemo(()=>({alerts,metrics,followUps,loading,error,refresh,run,planFollowUps,sendFollowUps,markRead,markAllRead,saveSettings}),[alerts,metrics,followUps,loading,error,refresh]);return <C.Provider value={value}>{children}</C.Provider>
}
export function useTransactionAutomation(){const x=useContext(C);if(!x)throw new Error('TransactionAutomationProvider missing');return x}
