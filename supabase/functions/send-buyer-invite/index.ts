import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const resend=Deno.env.get('RESEND_API_KEY')!, app=(Deno.env.get('APP_URL')||'').replace(/\/$/,'');
 if(!resend||!app)throw new Error('RESEND_API_KEY and APP_URL secrets are required');
 const auth=req.headers.get('Authorization')||'';const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {documentId,subject,message}=await req.json();
 const {data,error}=await userClient.rpc('dmh_prepare_buyer_invitation',{p_document_id:documentId,p_subject:subject,p_message:message||null});if(error)throw error;
 const admin=createClient(url,service);let userId=data.buyerUserId;
 if(!userId){const created=await admin.auth.admin.createUser({email:data.email,email_confirm:true,user_metadata:{full_name:data.buyerName,account_type:'buyer'}});if(created.error)throw created.error;userId=created.data.user.id;}
 const redeem=`${url}/functions/v1/redeem-buyer-invite?token=${encodeURIComponent(data.rawToken)}`;
 const body=`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><p style="font-size:12px;letter-spacing:.18em;color:#2563eb;font-weight:700">DATA MARKET HOUSE</p><h1 style="font-size:26px">${data.documentType==='nda'?'NDA ready for review':'Purchase agreement ready for signature'}</h1><p>${message||'Your secure Buyer Portal is ready. Review the document and continue the transaction inside the portal.'}</p><p><a href="${redeem}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700">Access Buyer Portal</a></p><p style="font-size:13px;color:#64748b">This secure link expires in 24 hours. A newer invitation will invalidate any prior unused link.</p></div>`;
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},body:JSON.stringify({from:'Data Market House <info@debtpaper.com>',to:[data.email],subject:subject||'Your Data Market House Buyer Portal Access',html:body})});const out=await r.json();
 await admin.rpc('dmh_mark_buyer_invitation_delivery',{p_invitation_id:data.invitationId,p_status:r.ok?'sent':'failed',p_provider_message_id:out.id||null,p_failure_reason:r.ok?null:JSON.stringify(out)});
 if(!r.ok)throw new Error(out.message||'Resend delivery failed');return new Response(JSON.stringify({...data,rawToken:undefined,providerMessageId:out.id}),{headers:{...cors,'Content-Type':'application/json'}});
}catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:400,headers:{...cors,'Content-Type':'application/json'}})}});
