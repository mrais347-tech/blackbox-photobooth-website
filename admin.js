'use strict';
(() => {
 const URL_BASE='https://iacplaiyqnbekdkhjbak.supabase.co';
 const KEY='sb_publishable_tlzMyoi_6SRFVetrtcWcLA_RE7RvJn-';
 const $=s=>document.querySelector(s);
 let token=null, generation=0, orders=[], queue='all', offset=0;
 const observers=[];
 function stopPreviews(){observers.splice(0).forEach(o=>o.disconnect());}
 const message=(text,error=false)=>{ $('#message').textContent=text; $('#message').classList.toggle('error',error); };
 async function api(path,options={}) {
  const response=await fetch(URL_BASE+path,{...options,headers:{apikey:KEY,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers},cache:'no-store'});
  if(!response.ok){ if(response.status===401 && token) signOut(); throw new Error(response.status===401?'Session expired or sign-in details incorrect. Please sign in again.':'Request failed. Check your connection and staff access, then retry.'); }
  if(response.status===204) return null;
  return response.json();
 }
 function signOut(){ stopPreviews(); generation++; token=null; $('#desk').hidden=true; $('#logout').hidden=true; $('#login').hidden=false; $('#orders').replaceChildren();orders=[];$('#order-detail').replaceChildren();if($('#order-dialog').open)$('#order-dialog').close(); }
 function node(tag,text,className){ const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el; }
 function render(order){
  let syncActions=()=>{};
  const card=node('article','','order');
  card.append(node('h3',`Order ${order.id.slice(0,8).toUpperCase()}`));
  const fulfillment=node('span',order.fulfillment_status.toUpperCase(),'tag fulfillment');
  card.classList.toggle('cancelled',order.fulfillment_status==='cancelled');
  card.append(node('span',order.is_test?'TEST ORDER':'LIVE ORDER','tag'),node('span',order.payment_status.toUpperCase(),'tag'),fulfillment);
  card.append(node('p',`${new Date(order.created_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})} · ${order.quantity} set(s)`,'muted'));
  card.append(node('p',`${order.customer_name}\n${order.email}\n${order.phone}`));
  card.append(node('p',Object.entries(order.shipping_address).map(([key,value])=>`${key}: ${typeof value==='string'?value:JSON.stringify(value)}`).join('\n')));
  card.append(node('p',order.amount_sen===null?'Price not set':`RM ${(order.amount_sen/100).toFixed(2)}`));
  const preview=node('div','','strip-preview'),previewNote=node('p','Loading strip preview…','muted');
  const previewButton=node('button','Reload strip preview');previewButton.type='button';previewButton.hidden=true;
  preview.append(previewNote,previewButton);card.append(preview);
  const files=node('div','','files'),download=node('button','Show original photos');download.type='button';files.append(download);card.append(files);
  async function imageLink(asset,label,className){
   const path=asset.object_path.split('/').map(encodeURIComponent).join('/');
   const result=await api(`/storage/v1/object/sign/${asset.bucket_id}/${path}`,{method:'POST',body:JSON.stringify({expiresIn:300})});
   const href=new URL(URL_BASE+'/storage/v1'+result.signedURL);
   if(href.origin!==URL_BASE)throw new Error('Unexpected file address.');
   const a=node('a','',className);a.href=href.href;a.target='_blank';a.rel='noopener noreferrer';
   const img=document.createElement('img');img.alt=label;img.src=href.href;img.loading='lazy';
   img.onerror=()=>{img.hidden=true;a.append(node('span','Preview unavailable — reload to try again.'));previewButton.hidden=false;};
   a.append(img,node('span',label+' ↗'));return a;
  }
  async function loadPreview(){
   const gen=generation;previewButton.disabled=true;
   try{
    const assets=order.order_assets||[];const asset=assets.find(a=>a.bucket_id==='order-renders');
    if(!asset){preview.replaceChildren(node('p','No strip preview attached.','muted'));return;}
    const link=await imageLink(asset,'Strip preview','strip-image');if(gen!==generation)return;
    preview.replaceChildren(link,previewButton);previewButton.hidden=false;
   }catch(e){previewNote.textContent='Could not load strip preview. '+e.message;preview.replaceChildren(previewNote,previewButton);previewButton.hidden=false;}
   finally{previewButton.disabled=false;}
  }
  previewButton.onclick=loadPreview;
  if('IntersectionObserver' in window){
   const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();loadPreview();}},{rootMargin:'200px'});
   observers.push(observer);observer.observe(card);
  }else{loadPreview();}
  download.onclick=async()=>{
   const gen=generation;download.disabled=true;
   try{
    const assets=(order.order_assets||[]).filter(a=>a.bucket_id==='order-originals');
    const links=await Promise.all(assets.map((asset,i)=>imageLink(asset,`Original photo ${i+1}`,'original-image')));
    if(gen!==generation)return;
    download.textContent='Reload original photos';files.replaceChildren(download,...(links.length?links:[node('p','No original photos attached.')]));
   }catch(e){message(e.message,true);}finally{download.disabled=false;}
  };
  const form=node('form'),fields=node('div','','fields');
  const statusLabel=node('label','Order status'),status=node('select');
  for(const val of ['new','printing','ready_to_ship','shipped','cancelled']){ const option=node('option',val);option.value=val;option.disabled=order.payment_status!=='paid'&&['printing','ready_to_ship','shipped'].includes(val);status.append(option); }
  status.value=order.fulfillment_status;statusLabel.append(status);
  const trackingLabel=node('label','Tracking number'),tracking=node('input');tracking.value=order.tracking_number||'';tracking.maxLength=120;trackingLabel.append(tracking);
  const courierLabel=node('label','Courier'),courier=node('input');courier.value=order.courier||'';courier.maxLength=80;courierLabel.append(courier);fields.append(statusLabel,courierLabel,trackingLabel);const save=node('button','Save status'),feedback=node('p','','order-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');form.append(fields,save,feedback,node('p','Status updates are internal. Cancelling keeps the order and photos; it does not issue a refund or send a customer notification.','muted'));card.append(form);
  form.onsubmit=async event=>{event.preventDefault();if(status.value==='shipped'&&(!courier.value.trim()||!tracking.value.trim())){feedback.textContent='Enter courier and tracking number before marking shipped.';feedback.classList.add('error');return;}save.disabled=true;save.textContent='Saving…';feedback.textContent='Saving changes…';feedback.classList.remove('error');try{
   const rows=await api(`/rest/v1/orders?id=eq.${order.id}&version=eq.${order.version}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({fulfillment_status:status.value,tracking_number:tracking.value.trim()||null,courier:courier.value.trim()||null})});
   if(rows.length!==1)throw new Error('This order changed in another session. Refresh orders before trying again.');
   Object.assign(order,rows[0]);drawList();loadActivity();syncActions();status.value=order.fulfillment_status;tracking.value=order.tracking_number||'';fulfillment.textContent=order.fulfillment_status.toUpperCase();card.classList.toggle('cancelled',order.fulfillment_status==='cancelled');feedback.textContent=order.fulfillment_status==='cancelled'?'Saved — order cancelled. Record and photos retained.':'Saved — status: '+order.fulfillment_status+'.';
  }catch(e){feedback.textContent='Not saved. '+e.message;feedback.classList.add('error');}finally{save.disabled=false;save.textContent='Save status';}};
  const actions=node('div','','workflow-actions');
  const next={new:['printing','Start printing'],printing:['ready_to_ship','Ready to ship'],ready_to_ship:['shipped','Mark shipped']};
  syncActions=()=>{actions.replaceChildren();if(next[order.fulfillment_status]){const [value,label]=next[order.fulfillment_status],action=node('button',label);action.type='button';action.disabled=order.payment_status!=='paid';action.onclick=()=>{status.value=value;form.requestSubmit();};actions.append(action);}};syncActions();
  card.append(actions);
  if(order.payment_status!=='paid')card.append(node('p','Awaiting payment. Printing and shipping actions become available after payment is verified.','muted'));
  const notesHeading=node('h3','Internal notes'),notes=node('div'),noteForm=node('form'),noteLabel=node('label','Add a note'),noteInput=node('textarea');noteInput.maxLength=2000;noteInput.required=true;noteLabel.append(noteInput);const noteSave=node('button','Add note'),noteFeedback=node('p');noteFeedback.setAttribute('role','status');noteForm.append(noteLabel,noteSave,noteFeedback);card.append(notesHeading,notes,noteForm);
  const historyHeading=node('h3','Activity history'),history=node('div');card.append(historyHeading,node('p','Latest 50 changes, recorded from this dashboard update onwards.','muted'),history);
  const stamp=value=>new Date(value).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'});
  async function loadNotes(){try{const rows=await api(`/rest/v1/order_notes?order_id=eq.${order.id}&select=body,created_at,created_by&order=created_at.desc&limit=50`);notes.replaceChildren(...(rows.length?rows.map(n=>node('p',`${n.body}\n${stamp(n.created_at)} · Staff ${n.created_by.slice(0,8)}`,'note')):[node('p','No notes yet.','muted')]));}catch(e){notes.replaceChildren(node('p',e.message,'error'));}}
  async function loadActivity(){try{const rows=await api(`/rest/v1/order_history?order_id=eq.${order.id}&select=changes,actor_id,created_at&order=created_at.desc&limit=50`);history.replaceChildren(...(rows.length?rows.map(h=>node('p',`${stamp(h.created_at)} · ${h.actor_id?'Staff '+h.actor_id.slice(0,8):'System'}\n`+Object.entries(h.changes).map(([key,val])=>`${key.replaceAll('_',' ')}: ${val.from??'—'} → ${val.to??'—'}`).join('\n'),'note')):[node('p','No changes recorded yet.','muted')]));}catch(e){history.replaceChildren(node('p',e.message,'error'));}}
  let noteId=null,noteBody=null;
  noteForm.onsubmit=async e=>{e.preventDefault();const body=noteInput.value.trim();if(!body)return;noteSave.disabled=true;noteInput.disabled=true;if(noteBody!==body){noteId=crypto.randomUUID();noteBody=body;}try{await api('/rest/v1/order_notes',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({id:noteId,order_id:order.id,body})});noteId=null;noteBody=null;noteInput.value='';noteFeedback.textContent='Note saved.';await loadNotes();}catch(err){noteFeedback.textContent='Not saved. '+err.message;}finally{noteSave.disabled=false;noteInput.disabled=false;}};
  loadNotes();loadActivity();return card;
 }
 const queues=[['all','All'],['awaiting','Awaiting payment'],['to_print','To print'],['printing','Printing'],['ready_to_ship','To ship'],['shipped','Shipped'],['cancelled','Cancelled']];
 function inQueue(o,key){return key==='all'||(key==='awaiting'?o.fulfillment_status==='new'&&o.payment_status!=='paid':key==='to_print'?o.fulfillment_status==='new'&&o.payment_status==='paid':o.fulfillment_status===key);}
 function drawList(){
  const search=$('#search').value.trim().toLowerCase(),kind=$('#order-type').value,from=$('#date-from').value,to=$('#date-to').value;
  const filtered=orders.filter(o=>{const date=new Date(o.created_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'});return (kind==='all'||o.is_test===(kind==='test'))&&(!from||date>=from)&&(!to||date<=to)&&[o.id,o.customer_name,o.email,o.phone,o.tracking_number||''].some(v=>v.toLowerCase().includes(search));});
  $('#queues').replaceChildren(...queues.map(([key,label])=>{const button=node('button',`${label} (${filtered.filter(o=>inQueue(o,key)).length})`);button.type='button';button.setAttribute('aria-pressed',String(queue===key));button.onclick=()=>{queue=key;drawList();};return button;}));
  const visible=filtered.filter(o=>inQueue(o,queue));$('#result-count').textContent=`${visible.length} shown · ${orders.length} orders loaded`;
  const cards=visible.map(o=>{
   const row=node('article','','order order-summary');const info=node('div');info.append(node('h3',`#${o.id.slice(0,8).toUpperCase()} · ${o.customer_name}`),node('span',o.is_test?'TEST':'LIVE','tag'),node('span',o.payment_status.toUpperCase(),'tag'),node('span',o.fulfillment_status.replaceAll('_',' ').toUpperCase(),'tag'),node('p',`${new Date(o.created_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})} · ${o.quantity} set(s)`,'muted'));
   const thumb=node('div','','queue-thumb');thumb.append(node('span','Preview loading…'));const asset=o.order_assets?.find(a=>a.bucket_id==='order-renders');
   async function load(){try{if(!asset){thumb.replaceChildren(node('span','No preview'));return;}const result=await api(`/storage/v1/object/sign/${asset.bucket_id}/${asset.object_path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',body:JSON.stringify({expiresIn:300})});const img=document.createElement('img');img.alt='Strip preview';img.loading='lazy';img.src=URL_BASE+'/storage/v1'+result.signedURL;img.onerror=()=>thumb.replaceChildren(node('span','Preview unavailable'));thumb.replaceChildren(img);}catch{thumb.replaceChildren(node('span','Preview unavailable'));}}
   if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'150px'});observers.push(observer);observer.observe(row);}else{load();}
   const open=node('button','Open order ↗');open.onclick=()=>{$('#order-detail').replaceChildren(render(o));$('#order-dialog').showModal();};row.append(thumb,info,open);return row;
  });$('#orders').replaceChildren(...(cards.length?cards:[node('p','No orders match this queue and filters.','muted')]));
 }
 async function refresh(more=false){const gen=generation;$('#refresh').disabled=true;$('#load-more').disabled=true;try{
  const start=more?offset:0;const rows=await api(`/rest/v1/orders?select=*,order_assets(bucket_id,object_path)&order=created_at.desc,id.desc&limit=100&offset=${start}`);if(gen!==generation)return;
  if(!more){orders=[];offset=0;stopPreviews();if($('#order-dialog').open){$('#order-dialog').close();$('#order-detail').replaceChildren();}}
  const existing=new Set(orders.map(o=>o.id));orders.push(...rows.filter(o=>!existing.has(o.id)));offset=start+rows.length;$('#load-more').hidden=rows.length<100;drawList();message('Orders refreshed.');
 }catch(e){message(e.message,true);}finally{$('#refresh').disabled=false;$('#load-more').disabled=false;}}
 for(const id of ['search','order-type','date-from','date-to'])$('#'+id).addEventListener('input',drawList);
 $('#close-order').onclick=()=>$('#order-dialog').close();$('#order-dialog').addEventListener('close',()=>$('#order-detail').replaceChildren());
 $('#load-more').onclick=()=>refresh(true);
 $('#login').onsubmit=async event=>{event.preventDefault();const button=$('#login button');button.disabled=true;message('Signing in…');try{
  const data=new FormData(event.target);
  const session=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:data.get('email'),password:data.get('password')})});
  token=session.access_token;$('#login').reset();
  const admins=await api('/rest/v1/blackbox_admins?select=user_id');
  if(!admins.length){signOut();throw new Error('This account has not been approved for Blackbox staff access.');}
  $('#login').hidden=true;$('#desk').hidden=false;$('#logout').hidden=false;await refresh();
 }catch(e){signOut();message(e.message,true);}finally{button.disabled=false;} };
 $('#logout').onclick=async()=>{const old=token;signOut();message('Signed out.');if(old)try{await fetch(URL_BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${old}`}});}catch{}};
 $('#refresh').onclick=()=>refresh();
})();
