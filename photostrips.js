'use strict';
const $=s=>document.querySelector(s), canvas=$('#strip'),ctx=canvas.getContext('2d');
let photos=[],frame='#f8f5ee';
function draw(){ctx.fillStyle=frame;ctx.fillRect(0,0,600,1800);const ink=frame==='#171717'?'#f8f5ee':'#171717';for(let i=0;i<3;i++){const x=34,y=34+i*505,w=532,h=475,p=photos[i];ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();if(p){const scale=Math.max(w/p.img.width,h/p.img.height)*p.zoom,iw=p.img.width*scale,ih=p.img.height*scale;ctx.filter=$('#mono').checked?'grayscale(1)':'none';ctx.drawImage(p.img,x-(iw-w)*p.x/100,y-(ih-h)*p.y/100,iw,ih);}else{ctx.fillStyle=frame==='#171717'?'#333':'#e0dbd3';ctx.fillRect(x,y,w,h);ctx.fillStyle='#77716b';ctx.font='32px Arial';ctx.textAlign='center';ctx.fillText('YOUR PHOTO '+(i+1),300,y+h/2);}ctx.restore();}ctx.fillStyle=ink;ctx.textAlign='center';ctx.font='bold 29px Arial';const caption=$('#caption').value.trim()||'A DAY WORTH KEEPING';let size=29;while(ctx.measureText(caption).width>520&&size>12){ctx.font=`bold ${--size}px Arial`;}ctx.fillText(caption,300,1640);ctx.font='bold 21px Arial';ctx.fillText('BLACKBOX',300,1710);ctx.font='12px Arial';ctx.fillText('GOOD TIMES. KEPT.',300,1740);$('#filled').textContent=photos.length+' / 3 PHOTOS';$('#next').disabled=photos.length!==3;}
function rows(){const host=$('#photo-controls');host.replaceChildren();photos.forEach((p,i)=>{const row=document.createElement('div');row.className='photo-row';row.innerHTML=`<div class="row-top"><strong>Photo ${i+1}</strong><button type="button" data-action="up" aria-label="Move photo ${i+1} up" ${i===0?'disabled':''}>↑</button><button type="button" data-action="down" aria-label="Move photo ${i+1} down" ${i===photos.length-1?'disabled':''}>↓</button><button type="button" data-action="remove" aria-label="Remove photo ${i+1}">×</button></div><label>Zoom<input type="range" min="1" max="3" step="0.01" value="${p.zoom}" data-key="zoom"></label><label>Left / right<input type="range" min="0" max="100" value="${p.x}" data-key="x"></label><label>Up / down<input type="range" min="0" max="100" value="${p.y}" data-key="y"></label>`;row.querySelectorAll('[data-key]').forEach(input=>input.addEventListener('input',()=>{p[input.dataset.key]=Number(input.value);draw();}));row.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{const a=button.dataset.action;if(a==='remove'){URL.revokeObjectURL(p.url);photos.splice(i,1);}else{const j=i+(a==='up'?-1:1);[photos[i],photos[j]]=[photos[j],photos[i]];}rows();draw();}));host.append(row);});}
$('#upload').addEventListener('change',async e=>{const input=e.target,files=[...input.files];input.disabled=true;const errors=[];for(const file of files){if(photos.length===3){errors.push('Your strip has 3 photos. Remove one to replace it.');break;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)){errors.push('Please choose JPG, PNG or WebP images.');continue;}if(file.size>15*1024*1024){errors.push('One photo is over 15 MB. Choose a smaller copy.');continue;}const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(img.width*img.height>50000000)throw Error('large');photos.push({img,url,x:50,y:50,zoom:1});}catch{URL.revokeObjectURL(url);errors.push('A photo could not be opened or is too large. Try a smaller JPG.');}}input.value='';input.disabled=false;$('#message').textContent=errors.join(' ')||(photos.length===3?'All set. Adjust the crops below before continuing.':`Choose ${3-photos.length} more photo(s).`);rows();draw();});
document.querySelectorAll('[data-frame]').forEach(b=>b.addEventListener('click',()=>{frame=b.dataset.frame;document.querySelectorAll('[data-frame]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();}));
$('#caption').addEventListener('input',()=>{$('#count').textContent=$('#caption').value.length+' / 32';draw();});$('#mono').addEventListener('change',draw);
$('#next').addEventListener('click',()=>{if(photos.length!==3)return;$('#editor').hidden=true;$('#delivery').hidden=false;$('#delivery-step').classList.add('active');$('#delivery input').focus();});
$('#back').addEventListener('click',()=>{$('#delivery').hidden=true;$('#editor').hidden=false;$('#delivery-step').classList.remove('active');$('#next').focus();});
$('#quantity').addEventListener('change',()=>{$('#qty-label').textContent=$('#quantity').value+' strip'+($('#quantity').value==='1'?'':'s');});
let pendingTest=null, testSaved=false;
const testEndpoint='https://iacplaiyqnbekdkhjbak.supabase.co/functions/v1/test-orders';
const review=text=>{$('#review').textContent=text;};
function lockTestForm(){
 document.querySelectorAll('#delivery-form input,#delivery-form select,#delivery-form button').forEach(el=>el.disabled=true);
 $('#back').disabled=true;
}
function toBlob(surface,type,quality){return new Promise((resolve,reject)=>surface.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the image.')),type,quality));}
async function preparePhoto(photo){
 const surface=document.createElement('canvas'),ratio=Math.min(1,4000/Math.max(photo.img.width,photo.img.height));
 surface.width=Math.max(1,Math.round(photo.img.width*ratio));surface.height=Math.max(1,Math.round(photo.img.height*ratio));
 const context=surface.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,surface.width,surface.height);context.drawImage(photo.img,0,0,surface.width,surface.height);
 let blob=await toBlob(surface,'image/jpeg',0.94);
 if(blob.size>8*1024*1024)blob=await toBlob(surface,'image/jpeg',0.82);
 if(blob.size>8*1024*1024)throw new Error('A photo is too large to upload. Start again with a smaller image.');
 surface.width=surface.height=1;return blob;
}
async function orderRequest(draft,action){
 const response=await fetch(testEndpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+draft.token},body:JSON.stringify({action,id:draft.id,payload:draft.payload})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'The test order could not be saved. Please retry.');return data;
}
$('#delivery-form').addEventListener('submit',async event=>{
 event.preventDefault();if(testSaved||photos.length!==3)return;
 if(!pendingTest){
  const fields=new FormData(event.target);
  pendingTest={id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''),payload:{
   name:fields.get('name'),email:fields.get('email'),phone:fields.get('phone'),quantity:Number($('#quantity').value),
   address:{street:fields.get('address'),postcode:fields.get('postcode'),city:fields.get('city'),state:fields.get('state')},
   design:{frame,caption:$('#caption').value.trim(),mono:$('#mono').checked,crops:photos.map(p=>({x:p.x,y:p.y,zoom:p.zoom}))}
  },files:null};
 }
 lockTestForm();$('#save-test').textContent='Saving…';
 try{
  if(!pendingTest.files){review('Preparing your photos…');pendingTest.files=[...await Promise.all(photos.map(preparePhoto)),await toBlob(canvas,'image/png')];}
  review('Creating a private test upload…');const draft=await orderRequest(pendingTest,'begin');
  if(!draft.complete){
   if(!Array.isArray(draft.uploads)||draft.uploads.length!==4)throw new Error('Upload slots could not be prepared. Please retry.');
   for(let i=0;i<draft.uploads.length;i++){
    const slot=draft.uploads[i],url=new URL(slot.url);
    if(url.origin!=='https://iacplaiyqnbekdkhjbak.supabase.co'||!url.pathname.startsWith('/storage/v1/object/upload/sign/'))throw new Error('Invalid upload destination.');
    review(i===3?'Uploading your strip preview…':`Uploading photo ${i+1} of 3…`);
    const response=await fetch(url.href,{method:'PUT',headers:{'Content-Type':slot.type},body:pendingTest.files[i]});
    if(!response.ok){const error=await response.json().catch(()=>({}));if(!(response.status===409||error.error==='Duplicate'||error.code==='Duplicate'))throw new Error('A photo upload failed. Retry to continue the same test order.');}
   }
   review('Checking the uploads…');await orderRequest(pendingTest,'complete');
  }
  testSaved=true;pendingTest.files=null;
  review(`Test order ${pendingTest.id.slice(0,8).toUpperCase()} saved. Your photos and delivery details were uploaded privately. No payment was taken. This order will not be printed or shipped.`);
  $('#save-test').textContent='Test order saved';$('#restart-test').hidden=false;$('#restart-test').disabled=false;
 }catch(error){
  review((error.message||'Upload interrupted.')+' Your details are locked for this attempt. Retry, or start a new design.');
  $('#save-test').disabled=false;$('#save-test').textContent='Retry save ↗';$('#restart-test').hidden=false;$('#restart-test').disabled=false;
 }
});
$('#restart-test').addEventListener('click',()=>{if(testSaved||confirm('Start again? This clears the current design. Any uploaded test files remain private with Blackbox.')){testSaved=true;location.reload();}});
window.addEventListener('beforeunload',e=>{if(photos.length&&!testSaved){e.preventDefault();e.returnValue='';}});draw();
