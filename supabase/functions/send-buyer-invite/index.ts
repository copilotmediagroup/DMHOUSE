import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...cors,'Content-Type':'application/json'},
});

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});

  try{
    const url=Deno.env.get('SUPABASE_URL');
    const anon=Deno.env.get('SUPABASE_ANON_KEY');
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resend=Deno.env.get('RESEND_API_KEY');
    const app=(Deno.env.get('APP_URL')||'').replace(/\/$/,'');

    if(!url||!anon||!service||!resend||!app){
      throw new Error('Buyer invitation service is not fully configured.');
    }

    const auth=req.headers.get('Authorization')||'';
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    const {documentId,subject,message}=await req.json();

    if(!documentId)throw new Error('Document ID is required.');

    const {data,error}=await userClient.rpc('dmh_prepare_buyer_invitation',{
      p_document_id:documentId,
      p_subject:subject,
      p_message:message||null,
    });
    if(error)throw error;

    let userId=data.buyerUserId as string|null;
    if(!userId){
      const created=await admin.auth.admin.createUser({
        email:data.email,
        email_confirm:true,
        user_metadata:{full_name:data.buyerName,account_type:'buyer'},
      });
      if(created.error)throw created.error;
      userId=created.data.user.id;
    }

    const buyerUpdate=await admin.from('buyer_profiles').update({user_id:userId}).eq('id',data.buyerId);
    if(buyerUpdate.error)throw buyerUpdate.error;

    const documentUpdate=await admin.from('deal_documents_generated').update({
      buyer_id:userId,
      room_id:data.roomId,
      portfolio_id:data.portfolioId,
      updated_at:new Date().toISOString(),
    }).eq('id',documentId);
    if(documentUpdate.error)throw documentUpdate.error;

    const redeem=`${app}/buyer/invite?token=${encodeURIComponent(data.rawToken)}`;
    const destination=`${app}/buyer/portfolio/${data.portfolioId}/documents`;
    const body=`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">
      <p style="font-size:12px;letter-spacing:.18em;color:#2563eb;font-weight:700">DATA MARKET HOUSE</p>
      <h1 style="font-size:26px">${data.documentType==='nda'?'NDA ready for review':'Purchase agreement ready for signature'}</h1>
      <p>${message||'Your secure transaction is ready. Review the document and continue inside the Buyer Portal.'}</p>
      <p><a href="${redeem}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700">Review & Sign Document</a></p>
      <p style="font-size:13px;color:#64748b">After secure authentication, you will be taken directly to this transaction: ${destination}</p>
      <p style="font-size:13px;color:#64748b">This secure link expires in 24 hours. A newer invitation invalidates any prior unused link.</p>
    </div>`;

    const r=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        from:'Data Market House <sales@debtpaper.com>',
        to:[data.email],
        subject:subject||'Your Data Market House Buyer Portal Access',
        html:body,
      }),
    });
    const out=await r.json();

    await admin.rpc('dmh_mark_buyer_invitation_delivery',{
      p_invitation_id:data.invitationId,
      p_status:r.ok?'sent':'failed',
      p_provider_message_id:out.id||null,
      p_failure_reason:r.ok?null:JSON.stringify(out),
    });

    if(!r.ok)throw new Error(out.message||'Email delivery failed.');

    return json({
      ...data,
      rawToken:undefined,
      buyerUserId:userId,
      providerMessageId:out.id,
      destination,
    });
  }catch(e){
    return json({error:e instanceof Error?e.message:String(e)},400);
  }
});
