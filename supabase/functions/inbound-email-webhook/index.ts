import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const emailFrom=(value:unknown)=>{const raw=String(value||'').toLowerCase();const bracket=raw.match(/<([^>]+)>/);return (bracket?.[1]||raw).trim()};

Deno.serve(async(req)=>{try{
 const secret=Deno.env.get('INBOUND_EMAIL_WEBHOOK_SECRET');if(secret&&req.headers.get('x-dmh-webhook-secret')!==secret)throw new Error('Invalid webhook signature.');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const payload=await req.json();
 const from=emailFrom(payload.from||payload.sender);const to=emailFrom(Array.isArray(payload.to)?payload.to[0]:payload.to)||'info@debtpaper.com';
 const subject=String(payload.subject||'Reply');const body=String(payload.text||payload.body||payload.html||'').trim();const providerId=String(payload.id||payload.email_id||payload.message_id||crypto.randomUUID());
 const inReplyTo=String(payload.in_reply_to||payload.headers?.['in-reply-to']||payload.headers?.['In-Reply-To']||'').replace(/[<>]/g,'');
 let match:any=null;let outreach:any=null;
 if(inReplyTo){const {data}=await admin.from('conversation_messages').select('company_id,agency_id,conversation_id').eq('provider_message_id',inReplyTo).maybeSingle();match=data;}
 if(!match){const {data}=await admin.from('outreach_messages').select('id,company_id,agency_id,employee_id,portfolio_id').eq('normalized_recipient',from).order('created_at',{ascending:false}).limit(1).maybeSingle();outreach=data;match=data;}
 if(!match)return json({ok:true,ignored:true,reason:'No matching agency conversation.'});
 const assigned=match.employee_id||null;const now=new Date().toISOString();
 const {data:conversation,error:cError}=await admin.from('conversations').upsert({company_id:match.company_id,agency_id:match.agency_id,assigned_employee_id:assigned,last_message_at:now,last_inbound_at:now,subject},{onConflict:'company_id,agency_id'}).select('id').single();if(cError)throw cError;
 const {data:inserted,error:mError}=await admin.from('conversation_messages').insert({company_id:match.company_id,conversation_id:conversation.id,agency_id:match.agency_id,direction:'inbound',from_email:from,to_email:to,subject,body:body||'(No plain-text body supplied)',provider:String(payload.provider||'resend-inbound'),provider_message_id:providerId,in_reply_to:inReplyTo||null,is_read:false,attachment_count:Array.isArray(payload.attachments)?payload.attachments.length:0,raw_payload:payload}).select('id').single();if(mError&&mError.code!=='23505')throw mError;
 if(inserted&&Array.isArray(payload.attachments)&&payload.attachments.length){await admin.from('conversation_attachments').insert(payload.attachments.map((a:any)=>({company_id:match.company_id,conversation_id:conversation.id,message_id:inserted.id,file_name:String(a.filename||a.name||'attachment'),content_type:a.content_type||a.contentType||null,external_url:a.url||null,size_bytes:a.size||null})));}
 await admin.from('conversations').update({last_message_at:now,last_inbound_at:now,follow_up_priority:'high',updated_at:now}).eq('id',conversation.id);

 let recipient:any=null;
 if(outreach?.id){const {data}=await admin.from('portfolio_campaign_recipients').select('*').eq('outreach_message_id',outreach.id).maybeSingle();recipient=data;}
 if(!recipient){const {data}=await admin.from('portfolio_campaign_recipients').select('*').eq('company_id',match.company_id).eq('agency_id',match.agency_id).in('status',['sent','delivered','opened','replied','interested','negotiating']).order('sent_at',{ascending:false}).limit(1).maybeSingle();recipient=data;}
 if(recipient&&inserted){const {data:category}=await admin.rpc('dmh_classify_campaign_reply',{p_subject:subject,p_body:body});const requiresOwner=['offer','documents'].includes(category);const recipientStatus=category==='interested'?'interested':category==='offer'?'negotiating':category==='declined'?'declined':'replied';const summary=(body||subject).replace(/\s+/g,' ').trim().slice(0,500);
  await admin.from('portfolio_campaign_recipients').update({conversation_id:conversation.id,latest_inbound_message_id:inserted.id,reply_category:category,reply_summary:summary,reply_requires_owner:requiresOwner,reply_action_status:requiresOwner?'owner_review':'new',status:recipientStatus,replied_at:now,last_status_at:now,updated_at:now}).eq('id',recipient.id);
  await admin.from('campaign_reply_events').insert({company_id:match.company_id,campaign_id:recipient.campaign_id,recipient_id:recipient.id,conversation_id:conversation.id,message_id:inserted.id,agency_id:match.agency_id,portfolio_id:recipient.portfolio_id,category,summary,requires_owner:requiresOwner,action_status:requiresOwner?'owner_review':'new',assigned_employee_id:recipient.assigned_employee_id});
  await admin.from('portfolio_campaign_events').insert({company_id:match.company_id,campaign_id:recipient.campaign_id,recipient_id:recipient.id,event_type:`reply_${category}`,detail:summary});
 }
 return json({ok:true,conversationId:conversation.id,campaignReplyMatched:Boolean(recipient)});
 }catch(error){return json({ok:false,error:error instanceof Error?error.message:'Unknown error'},400)}});
