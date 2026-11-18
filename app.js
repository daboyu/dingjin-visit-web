'use strict';
const base='https://iahcqjgdpkvheygyauic.supabase.co', key="sb_publishable_RM2k5HlVDTNICLoghslCVg_TeMQD9Qr";
const el=id=>document.getElementById(id), status=value=>{el('status').textContent=value};
const normalize=value=>String(value).normalize('NFKC').replace(/\s/g,'').toLowerCase();
let session,map,pins,position,timer,busy=false,epoch=0,records=new Map(),openIds=[],lastFull=0;
async function api(path,options={}){
 const headers={apikey:key,'Content-Type':'application/json',...options.headers};
 if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
 const res=await fetch(base+path,{...options,headers,cache:'no-store'});
 if(!res.ok)throw Object.assign(Error('Request failed'),{status:res.status});
 return res.status===204?null:res.json();
}
function save(value){
 session=value;
 sessionStorage.setItem('dingjin-refresh',value.refresh_token);
}
function boot(){
 if(!window.L)throw Error('Map library unavailable');
 el('app').hidden=el('logout').hidden=false;el('login').hidden=true;
 if(map){map.invalidateSize();return}
 map=L.map('map',{preferCanvas:true}).setView([22.656,120.32],15);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
 pins=L.layerGroup().addTo(map);
 map.on('popupclose',()=>{openIds=[]});
}
function popup(group,zoom=false){
 const first=group[0],point=[first.latitude,first.longitude],root=document.createElement('div');
 for(const row of group){
  const article=document.createElement('article'),label=document.createElement('div'),button=document.createElement('button'),nav=document.createElement('a');
  label.textContent=[row.completed?'已訪視':'待訪',row.name,row.address,row.roster_number].join(' · ');
  button.textContent=row.completed?'復原為待訪':'完成訪視';button.className='primary';
  button.onclick=()=>update(row,button);
  const url=new URL('https://www.google.com/maps/dir/');
  url.search=new URLSearchParams({api:'1',destination:row.latitude+','+row.longitude,travelmode:'walking',dir_action:'navigate'});
  nav.href=url.href;nav.target='_blank';nav.rel='noopener noreferrer';nav.textContent='Google 地圖導航';
  article.append(label,button,nav);root.append(article);
 }
 if(zoom)map.setView(point,18);
 map.openPopup(root,point);openIds=group.map(r=>r.id);
}
function draw(reopen=false){
 if(!pins)return;
 const query=normalize(el('search').value),category=el('category').value,groups=new Map(),list=el('results');
 const shown=[...records.values()].filter(r=>(!category||r.category===category)&&(!query||normalize(r.name+' '+r.address+' '+r.roster_number).includes(query)));
 pins.clearLayers();list.replaceChildren();
 for(const row of shown){
  if(query){
   const li=document.createElement('li'),b=document.createElement('button');
   b.textContent=(row.completed?'已訪視 · ':'待訪 · ')+row.name+' · '+row.address;
   b.onclick=()=>popup([row],true);li.append(b);list.append(li);
  }
  if(row.completed&&!query)continue;
  const id=row.latitude+','+row.longitude;
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(row);
 }
 for(const group of groups.values()){
  const r=group[0],fillColor=group.every(x=>x.completed)?'#75817e':r.category==='a'?'#007568':'#ad500d';
  L.circleMarker([r.latitude,r.longitude],{radius:group.length>1?10:8,fillColor,fillOpacity:.93,color:'#fff',weight:1}).addTo(pins).on('click',()=>popup(group));
 }
 if(reopen&&openIds.length){
  const group=shown.filter(r=>openIds.includes(r.id)&&(!r.completed||query));
  if(group.length)popup(group);else map.closePopup();
 }
 report();
}
function report(){
 const completed=[...records.values()].filter(r=>r.completed).length;
 status('待訪 '+(records.size-completed)+' 筆 · 已訪視 '+completed+' 筆');
}
async function refresh(force=false){
 const current=epoch;
 if(session.expires_at*1000<Date.now()+60000){
  const value=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
  if(epoch!==current)return;
  save(value);
 }
 const members=await api('/rest/v1/team_members?select=user_id&limit=1');
 if(!members.length)throw Object.assign(Error('Access denied'),{status:403});
 const full=force||Date.now()-lastFull>120000;
 const fields=full?'id,category,name,address,roster_number,latitude,longitude,completed,revision':'id,completed,revision';
 const data=[];
 for(let offset=0;;offset+=500){
  const page=await api('/rest/v1/visits?select='+fields+'&order=id&limit=500&offset='+offset);
  data.push(...page);
  if(page.length<500)break;
 }
 if(epoch!==current)return;
 if(!full&&(data.length!==records.size||data.some(r=>!records.has(r.id))))return refresh(true);
 const changed=full||data.some(r=>records.get(r.id)?.revision!==r.revision);
 if(full){records=new Map(data.map(r=>[r.id,r]));lastFull=Date.now()}
 else for(const row of data)Object.assign(records.get(row.id),row);
 if(changed)draw(true);else report();
}
function logout(){
 epoch++;clearInterval(timer);session=null;sessionStorage.removeItem('dingjin-refresh');
 records.clear();lastFull=0;openIds=[];
 if(map){map.closePopup();pins.clearLayers();position?.remove();position=undefined}
 el('results').replaceChildren();el('search').value='';
 el('app').hidden=el('logout').hidden=true;el('login').hidden=false;
}
function failure(error){
 if([400,401,403].includes(error.status)){logout();status('登入已失效或帳號未獲授權')}
 else status('暫時無法同步，請確認網路');
}
async function update(row,button){
 if(!session||busy)return;
 const current=epoch;busy=true;button.disabled=true;
 try{
  const data=await api('/rest/v1/visits?id=eq.'+encodeURIComponent(row.id)+'&revision=eq.'+row.revision+'&select=id,completed,revision',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({completed:!row.completed})});
  if(epoch!==current)return;
  if(data.length){Object.assign(records.get(row.id),data[0]);draw(true)}
  else{await refresh();if(epoch===current)status('紀錄已由其他裝置更新，請確認後再操作')}
 }catch(error){if(epoch===current)failure(error)}
 finally{busy=false;button.disabled=false}
}
async function tick(){
 if(!session||busy||document.hidden)return;
 const current=epoch;busy=true;
 try{await refresh()}catch(error){if(epoch===current)failure(error)}
 finally{busy=false}
}
async function enter(value){
 save(value);await refresh(true);boot();draw();
 timer=setInterval(tick,5000);
}
el('login').onsubmit=async e=>{
 e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;
 status('登入中…');
 try{
  const value=await api('/functions/v1/team-login',{method:'POST',body:JSON.stringify({password:el('password').value})});
  el('password').value='';await enter(value);
 }catch(error){logout();status(error.status===429?'嘗試次數過多，請稍後再試':error.status===401?'共用密碼不正確':error.status===403?'此登入未獲授權':'無法登入，請確認網路或稍後再試')}
 finally{button.disabled=false}
};
el('logout').onclick=()=>{
 if(session)api('/auth/v1/logout?scope=local',{method:'POST'}).catch(()=>{});
 logout();status('已登出');
};
el('search').oninput=el('category').onchange=()=>{map.closePopup();draw()};
el('locate').onclick=()=>{
 if(!navigator.geolocation)return status('此瀏覽器不支援定位');
 const current=epoch;
 navigator.geolocation.getCurrentPosition(({coords})=>{
  if(epoch!==current||!session)return;
  const point=[coords.latitude,coords.longitude];
  position?.remove();
  position=L.circleMarker(point,{radius:9,color:'#fff',fillColor:'#1265ef',fillOpacity:1}).addTo(map);
  map.setView(point,17);
 },()=>{if(epoch===current)status('無法定位，請檢查位置權限')},{enableHighAccuracy:true,timeout:12000});
};
document.addEventListener('visibilitychange',tick);
(async()=>{
 const token=sessionStorage.getItem('dingjin-refresh');
 if(!token)return;
 const button=el('login').querySelector('button');button.disabled=true;
 try{await enter(await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:token})}))}
 catch{logout();status('請重新登入')}
 finally{button.disabled=false}
})();