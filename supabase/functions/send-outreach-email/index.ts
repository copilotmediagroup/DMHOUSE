import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const auth=req.headers.get('Authorization');if(!auth)throw new Error('Missing authorization.');
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Unauthorized.');
 const {messageId}=await req.json();
 const {data:message,error}=await supabase.from('outreach_messages').select('*').eq('id',messageId).eq('employee_id',user.id).single();if(error)throw error;
 if(message.status!=='queued'&&message.status!=='failed')throw new Error('Message is not available for sending.');
 const apiKey=Deno.env.get('RESEND_API_KEY');const fromEmail=Deno.env.get('OUTREACH_FROM_EMAIL');if(!apiKey||!fromEmail)throw new Error('Email provider is not configured.');
 await supabase.from('outreach_messages').update({status:'sending',updated_at:new Date().toISOString()}).eq('id',message.id);
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:`${Deno.env.get('OUTREACH_FROM_NAME')||'Data Market House'} <${fromEmail}>`,to:[message.recipient],reply_to:'info@debtpaper.com',subject:message.subject,html:String(message.body||'').replace(/\n/g,'<br>')})});
 const result=await response.json();if(!response.ok)throw new Error(result?.message||'Email provider rejected the request.');
 await supabase.from('outreach_messages').update({status:'sent',provider:'resend',provider_message_id:result.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',message.id);
 return new Response(JSON.stringify({ok:true,id:result.id}),{headers:{...cors,'Content-Type':'application/json'}});
 }catch(error){return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:'Unknown error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}});
