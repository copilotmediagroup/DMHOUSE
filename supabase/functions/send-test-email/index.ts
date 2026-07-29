import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const auth=req.headers.get('Authorization');if(!auth)throw new Error('Missing authorization.');
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});const admin=createClient(url,service);
 const {data:{user}}=await userClient.auth.getUser();if(!user)throw new Error('Unauthorized.');
 const {data:profile}=await userClient.from('profiles').select('company_id,role,is_active').eq('id',user.id).single();if(!profile||profile.role!=='owner'||!profile.is_active)throw new Error('Owner access required.');
 const {recipient,subject,body}=await req.json();if(!recipient||!subject||!body)throw new Error('Recipient, subject, and message are required.');
 const {data:test,error:insertError}=await admin.from('owner_email_tests').insert({company_id:profile.company_id,owner_id:user.id,recipient,subject,body,status:'sending'}).select('*').single();if(insertError)throw insertError;
 const key=Deno.env.get('RESEND_API_KEY'),fromEmail=Deno.env.get('OUTREACH_FROM_EMAIL');if(!key||!fromEmail)throw new Error('Email provider is not configured.');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from:`${Deno.env.get('OUTREACH_FROM_NAME')||'Data Market House'} <${fromEmail}>`,to:[recipient],reply_to:'info@debtpaper.com',subject,html:String(body).replace(/\n/g,'<br>')})});
 const result=await response.json();if(!response.ok){await admin.from('owner_email_tests').update({status:'failed',error_message:result?.message||'Provider rejected request.'}).eq('id',test.id);throw new Error(result?.message||'Provider rejected request.');}
 await admin.from('owner_email_tests').update({status:'sent',provider:'resend',provider_message_id:result.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',test.id);
 return new Response(JSON.stringify({ok:true,id:result.id,testId:test.id}),{headers:{...cors,'Content-Type':'application/json'}});
 }catch(error){return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:'Unknown error'}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}});
