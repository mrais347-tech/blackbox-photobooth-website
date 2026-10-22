'use strict';
(() => {
 const URL_BASE='https://iacplaiyqnbekdkhjbak.supabase.co';
 const KEY='sb_publishable_tlzMyoi_6SRFVetrtcWcLA_RE7RvJn-';
 const $=s=>document.querySelector(s);
 let token=null, generation=0;
 const message=(text,error=false)=>{ $('#message').textContent=text; $('#message').classList.toggle('error',error); };
 async function api(path,options={}) {
  const response=await fetch(URL_BASE+path,{...options,headers:{apikey:KEY,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers},cache:'no-store'});
  if(!response.ok){ if(response.status===401 && token) signOut(); throw new Error(response.status===401?'Session expired or sign-in details incorrect. Please sign in again.':'Request failed. Check your connection and staff access, then retry.'); }
  if(response.status===204) return null;
  return response.json();
 }
 function signOut(){ generation++; token=null; $('#desk').hidden=true; $('#logout').hidden=true; $('#login').hidden=false; $('#orders').replaceChildren(); }
 function node(tag,text,className){ const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el; }
 function render(order){
  const card=node('article','','order');
  card.append(node('h3',`Order ${order.id.slice(0,8).toUpperCase()}`));
  card.append(node('span',order.is_test?'TEST ORDER':'LIVE ORDER','tag'),node('span',order.payment_status.toUpperCase(),'tag'));
  card.append(node('p',`${new Date(order.created_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})} · ${order.quantity} set(s)`,'muted'));
  card.append(node('p',`${order.customer_name}\n${order.email}\n${order.phone}`));
  card.append(node('p',Object.entries(order.shipping_address).map(([key,value])=>`${key}: ${typeof value==='string'?value:JSON.stringify(value)}`).join('\n')));
  card.append(node('p',order.amount_sen===null?'Price not set':`RM ${(order.amount_sen/100).toFixed(2)}`));
  const files=node('div','','files'),download=node('button','Load private photo links');
  download.type='button';files.append(download);card.append(files);
  download.onclick=async()=>{
   const gen=generation; download.disabled=true;message('Loading photo links…');
   try{
    const assets=await api(`/rest/v1/order_assets?order_id=eq.${order.id}&select=bucket_id,object_path`);
    const links=await Promise.all(assets.map(async asset=>{
     const path=asset.object_path.split('/').map(encodeURIComponent).join('/');
     const result=await api(`/storage/v1/object/sign/${asset.bucket_id}/${path}`,{method:'POST',body:JSON.stringify({expiresIn:60})});
     const href=new URL(URL_BASE+'/storage/v1'+result.signedURL);
     if(href.origin!==URL_BASE) throw new Error('Unexpected file address.');
     const a=node('a',asset.bucket_id==='order-renders'?'Strip preview':'Original photo');a.href=href.href;a.target='_blank';a.rel='noopener noreferrer';return a;
    }));
    if(gen!==generation)return;
    files.replaceChildren(download,...links);message(assets.length?'Photo links expire in 60 seconds. Load again if needed.':'No photos attached to this order yet.');
   }catch(e){message(e.message,true);}finally{download.disabled=false;}
  };
  const form=node('form'),fields=node('div','','fields');
  const statusLabel=node('label','Order status'),status=node('select');
  for(const val of ['new','printing','shipped','cancelled']){ const option=node('option',val);option.value=val;option.disabled=order.payment_status!=='paid'&&['printing','shipped'].includes(val);status.append(option); }
  status.value=order.fulfillment_status;statusLabel.append(status);
  const trackingLabel=node('label','Tracking number'),tracking=node('input');tracking.value=order.tracking_number||'';tracking.maxLength=120;trackingLabel.append(tracking);
  fields.append(statusLabel,trackingLabel);const save=node('button','Save status');form.append(fields,save);card.append(form);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{
   const rows=await api(`/rest/v1/orders?id=eq.${order.id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({fulfillment_status:status.value,tracking_number:tracking.value.trim()||null})});
   if(rows.length!==1)throw new Error('Order was not updated. Refresh and check access.');message('Order updated.');
  }catch(e){message(e.message,true);}finally{save.disabled=false;}};
  return card;
 }
 async function refresh(){ const gen=generation;$('#refresh').disabled=true;try{
  const rows=await api('/rest/v1/orders?select=*&order=created_at.desc&limit=100');if(gen!==generation)return;
  $('#orders').replaceChildren(...(rows.length?rows.map(render):[node('p','No orders yet. Customer checkout is still closed.')]));message('Orders refreshed.');
 }catch(e){message(e.message,true);}finally{$('#refresh').disabled=false;} }
 $('#login').onsubmit=async event=>{event.preventDefault();const button=$('#login button');button.disabled=true;message('Signing in…');try{
  const data=new FormData(event.target);
  const session=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:data.get('email'),password:data.get('password')})});
  token=session.access_token;$('#login').reset();
  const admins=await api('/rest/v1/blackbox_admins?select=user_id');
  if(!admins.length){signOut();throw new Error('This account has not been approved for Blackbox staff access.');}
  $('#login').hidden=true;$('#desk').hidden=false;$('#logout').hidden=false;await refresh();
 }catch(e){signOut();message(e.message,true);}finally{button.disabled=false;} };
 $('#logout').onclick=async()=>{const old=token;signOut();message('Signed out.');if(old)try{await fetch(URL_BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${old}`}});}catch{}};
 $('#refresh').onclick=refresh;
})();
