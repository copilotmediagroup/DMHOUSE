import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async(req)=>{try{const payload=await req.json();const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const type=String(payload.type||payload.event||'');const data=payload.data||payload;const providerMessageId=String(data.email_id||data.id||data.message_id||'');const providerEventId=String(payload.id||data.event_id||crypto.randomUUID());
 if(!providerMessageId)return new Response('ignored',{status:202});
 const bounceType=String(data.bounce?.type||data.bounce_type||'');
 const {error}=await service.rpc('dmh_apply_outreach_event',{p_provider:'resend',p_provider_message_id:providerMessageId,p_provider_event_id:providerEventId,p_event_type:type,p_payload:{...payload,bounce_type:bounceType}});if(error)throw error;
 return new Response('ok',{status:200});}catch(error){return new Response(error instanceof Error?error.message:'Webhook error',{status:400})}});
