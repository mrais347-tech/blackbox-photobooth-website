// No browser-facing service key. Sensitive actions require the draft's random bearer token.
const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origins=new Set(['https://blackboxphotobooth.com','https://www.blackboxphotobooth.com']);
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function db(path:string,method='GET',body?:unknown){
 const res=await fetch(base+path,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await res.json();if(!res.ok)throw new Error(data.message||data.error||'storage_error');return data;
}
const slots=(id:string)=>[1,2,3].map(i=>({bucket:'order-originals',path:`${id}/photo-${i}.jpg`,type:'image/jpeg',max:8388608})).concat([{bucket:'order-renders',path:`${id}/preview.png`,type:'image/png',max:5242880}]);
function payloadOf(p:any){
 const text=(v:unknown,max:number,min=1)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)throw new Error('invalid_details');return v.trim();};
 const email=text(p.email,254,3);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('invalid_details');
 const phone=text(p.phone,30,6);if(!/^[+\d\s()-]+$/.test(phone))throw new Error('invalid_details');
 const states=['Johor','Kedah','Kelantan','Kuala Lumpur','Labuan','Melaka','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Putrajaya','Sabah','Sarawak','Selangor','Terengganu'];
 if(!p.address||!states.includes(p.address.state)||!/^\d{5}$/.test(p.address.postcode)||![1,2,3,5,10].includes(p.quantity))throw new Error('invalid_details');
 const d=p.design;if(!d||!['#f8f5ee','#171717','#e9b5bd'].includes(d.frame)||typeof d.mono!=='boolean'||typeof d.caption!=='string'||d.caption.length>32||!Array.isArray(d.crops)||d.crops.length!==3)throw new Error('invalid_design');
 const crops=d.crops.map((c:any)=>{if(!c||!Number.isFinite(c.x)||c.x<0||c.x>100||!Number.isFinite(c.y)||c.y<0||c.y>100||!Number.isFinite(c.zoom)||c.zoom<1||c.zoom>3)throw new Error('invalid_design');return {x:c.x,y:c.y,zoom:c.zoom};});
 return {name:text(p.name,100),email,phone,address:{street:text(p.address.street,300),postcode:p.address.postcode,city:text(p.address.city,100),state:p.address.state,country:'Malaysia'},quantity:p.quantity,design:{frame:d.frame,caption:d.caption,mono:d.mono,crops,previewWidth:600,previewHeight:1800,printReady:false}};
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin','Content-Type':'application/json'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!origins.has(origin))return new Response('Origin not allowed',{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
 try{
  // Enforce body limit while streaming, including requests without Content-Length.
  const reader=req.body?.getReader();if(!reader)throw new Error('invalid_request');let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return reply({error:'Request too large.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const input=JSON.parse(new TextDecoder().decode(bytes));
  const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  if(!/^[a-f0-9]{64}$/.test(token)||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/.test(input.id))return reply({error:'Invalid upload session.'},401);
  const tokenHash=await hash(token);
  if(input.action==='begin'){
   const payload=payloadOf(input.payload);
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
   const state=await db('/rest/v1/rpc/begin_test_upload','POST',{p_id:input.id,p_hash:tokenHash,p_ip:await hash(key+ip),p_payload:payload});
   if(state.complete)return reply({complete:true,orderId:input.id,isTest:true});
   const uploads=[];
   for(const slot of slots(input.id)){
    const signed=await db(`/storage/v1/object/upload/sign/${slot.bucket}/${slot.path}`,'POST',{});
    uploads.push({...slot,url:base+'/storage/v1'+signed.url});
   }
   return reply({complete:false,uploads});
  }
  if(input.action!=='complete')throw new Error('invalid_request');
  const sessions=await db(`/rest/v1/test_upload_sessions?id=eq.${input.id}&token_hash=eq.${tokenHash}&select=expires_at,completed_at`);
  if(!sessions.length)return reply({error:'Upload session not found.'},401);
  if(sessions[0].completed_at)return reply({orderId:input.id,isTest:true});
  if(new Date(sessions[0].expires_at).getTime()<Date.now())throw new Error('session_expired');
  // Verify object size, declared format and byte signature before saving an order.
  for(const slot of slots(input.id)){
   const objects=await db(`/storage/v1/object/list/${slot.bucket}`,'POST',{prefix:input.id+'/',limit:10});
   const obj=objects.find((o:any)=>o.name===slot.path.split('/')[1]);
   if(!obj||!obj.metadata||Number(obj.metadata.size)<=0||Number(obj.metadata.size)>slot.max||obj.metadata.mimetype!==slot.type)throw new Error('uploads_incomplete');
   const res=await fetch(`${base}/storage/v1/object/${slot.bucket}/${slot.path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Range:'bytes=0-15'}});
   if(!res.ok)throw new Error('uploads_incomplete');const b=new Uint8Array(await res.arrayBuffer());
   const valid=slot.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
   if(!valid)throw new Error('invalid_image');
  }
  return reply(await db('/rest/v1/rpc/complete_test_upload','POST',{p_id:input.id,p_hash:tokenHash}));
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const messages:Record<string,string>={preview_capacity:'Test upload capacity is full. Please contact the studio.',preview_rate_limit:'Too many test uploads. Please try again in an hour.',session_expired:'This upload session expired. Refresh the page to start again.',session_changed:'Your test details changed. Refresh to start again.',uploads_incomplete:'Some photos have not finished uploading. Please retry.',invalid_image:'A photo could not be verified. Please choose another image.'};
  return reply({error:messages[code]||'Could not save the test order. Check your details and try again.'},code==='preview_capacity'||code==='preview_rate_limit'?429:400);
 }
});
