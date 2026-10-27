'use strict';
(()=>{
 const base='https://iacplaiyqnbekdkhjbak.supabase.co',key='sb_publishable_tlzMyoi_6SRFVetrtcWcLA_RE7RvJn-';
 const $=s=>document.querySelector(s);let token=null;
 const note=text=>$('#activation-message').textContent=text;
 const fragment=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 history.replaceState(null,'',location.pathname);
 async function request(path,body,method='POST'){
  const r=await fetch(base+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
  const data=await r.json();if(!r.ok)throw new Error('The invitation could not be verified or has expired. Please request a new invitation.');return data;
 }
 async function ready(){
  const user=await request('/auth/v1/user',undefined,'GET');
  if(!user.email_confirmed_at)throw new Error('Please verify your email first.');
  const admins=await request('/rest/v1/blackbox_admins?select=user_id',undefined,'GET');
  if(!admins.some(a=>a.user_id===user.id))throw new Error('Staff access has not been assigned to this account yet.');
  $('#invite-link').hidden=true;$('#password-form').hidden=false;note('Email verified. Choose your staff password.');
 }
 async function verify(raw){
  const link=new URL(raw);if(link.origin!==base||link.pathname!=='/auth/v1/verify'||link.searchParams.get('type')!=='invite')throw new Error('Paste the original Blackbox invitation link from your email.');
  const hash=link.searchParams.get('token');if(!hash)throw new Error('This invitation link is incomplete.');
  const session=await request('/auth/v1/verify',{type:'invite',token_hash:hash});token=session.access_token;await ready();
 }
 $('#invite-link').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await verify(new FormData(e.target).get('link'));e.target.reset();}catch(err){token=null;note(err.message);}finally{button.disabled=false;}};
 $('#password-form').onsubmit=async e=>{
  e.preventDefault();const fields=new FormData(e.target);if(fields.get('password')!==fields.get('confirm')){note('Passwords do not match.');return;}
  const button=e.target.querySelector('button');button.disabled=true;
  try{await request('/auth/v1/user',{password:fields.get('password')},'PUT');e.target.reset();e.target.hidden=true;note('Your staff password is saved. Sign in using your email and new password.');try{await request('/auth/v1/logout',{});}catch{}token=null;}
  catch(err){note(err.message);}finally{button.disabled=false;}
 };
 if(fragment.get('access_token')){token=fragment.get('access_token');ready().catch(err=>{token=null;note(err.message);});}
 else if(query.get('token_hash')&&query.get('type')==='invite'){
  request('/auth/v1/verify',{type:'invite',token_hash:query.get('token_hash')}).then(session=>{token=session.access_token;return ready();}).catch(err=>{token=null;note(err.message);});
 }else if(fragment.get('error_description')||query.get('error_description'))note('The invitation expired or could not be verified. Please request a new one.');
})();
