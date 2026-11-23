/* Cosmetic timing, HP interpolation and event banners. Battle values stay authoritative. */
(() => {
'use strict';
const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
const now=()=>performance.now();
const hpStates=new Map();let queue=[],active=null,timers=[],seen=new WeakMap(),generation=0,weatherHeld=false,weatherValue=null,ready=[];
const stage=document.getElementById('stage');
const banner=document.createElement('div');banner.id='abilityBanner';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');stage.appendChild(banner);
function schedule(fn,ms){const epoch=generation;const id=setTimeout(()=>{if(epoch===generation)fn();},ms);timers.push(id);return id;}
function drainReady(){const rs=ready;ready=[];rs.forEach(r=>r());}
function fieldLabel(){if(!B)return;const node=document.getElementById('fieldState');if(!node)return;const k=api.visualWeather(B.weather?.kind);const parts=[];if(B.reverseTurns)parts.push(`アベコベルーム：残り${B.reverseTurns}ターン`);if(k)parts.push(`${{rain:'雨',snow:'雪',sandstorm:'砂嵐',shower:'夕立'}[k]}（残り${B.weather?.turns||0}ターン）`);node.textContent=parts.join(' ／ ');node.hidden=!parts.length;}
function refreshWeather(){if(!B)return;fieldLabel();PixelArt.field(document.getElementById('fieldCanvas'),B.weather?.kind);PixelArt.weather(B.weather?.kind,now(),!reduced()&&!document.hidden);}
function next(){
 if(active||!queue.length){if(!active&&!queue.length){weatherHeld=false;refreshWeather();drainReady();}return;}
 active=queue.shift();const e=active;
 banner.replaceChildren();banner.dataset.side=e.unit.side===ME?'you':'foe';banner.dataset.kind=e.kind;
 const who=document.createElement('small');who.textContent=(e.unit.side===ME?'':'相手の')+e.unit.name;
 const title=document.createElement('strong');title.textContent=(e.kind==='item'?'持ち物：':'特性：')+e.title;
 const desc=document.createElement('span');desc.textContent=e.message;banner.append(who,title,desc);banner.hidden=false;
 if(e.weather){weatherHeld=true;weatherValue=e.weather.before;refreshWeather();schedule(()=>{weatherValue=e.weather.after;refreshWeather();banner.dataset.phase='effect';},400);}
 schedule(()=>{banner.hidden=true;delete banner.dataset.phase;active=null;next();},1150);
}
function finishHP(s){s.display=s.target;s.running=false;if(s.handle!=null)cancelAnimationFrame(s.handle);s.handle=null;drawHP(s);const wait=s.waiters.splice(0);wait.forEach(r=>r());}
function sample(s,t){if(!s.running)return s.display;return s.from+(s.target-s.from)*Math.min(1,(t-s.start)/800);}
function drawHP(s){
 const bar=document.getElementById(s.slot==='you'?'youHp':'foeHp'),value=document.getElementById(s.slot==='you'?'youHpV':'foeHpV');
 if(!bar||!value)return;
 const hp=Math.max(0,Math.ceil(s.display)),ratio=Math.max(0,Math.min(1,s.display/s.unit.maxhp));
 bar.style.transition='none';bar.style.width=ratio*100+'%';bar.style.background=ratio<.25?'var(--red)':ratio<.5?'var(--gold)':'var(--green)';
 value.textContent=s.slot==='you'?`HP ${hp}/${s.unit.maxhp}  気力 ${Math.floor(s.unit.en)}`:`HP ${Math.ceil(ratio*100)}%`;
 bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(s.slot==='you'?s.unit.maxhp:100));bar.setAttribute('aria-valuenow',String(s.slot==='you'?hp:Math.ceil(ratio*100)));
}
function tickHP(s,t){if(hpStates.get(s.slot)!==s)return;s.display=sample(s,t);drawHP(s);if(t-s.start>=800){finishHP(s);return;}s.handle=requestAnimationFrame(t=>tickHP(s,t));}
function syncHP(){
 if(!B)return;
 for(const [slot,u] of [['you',MY()],['foe',OP()]]){
  const target=Math.max(0,Math.min(u.maxhp,u.hp));let s=hpStates.get(slot);
  if(!s||s.unit!==u){if(s)finishHP(s);s={slot,unit:u,target,display:target,from:target,running:false,handle:null,waiters:[]};hpStates.set(slot,s);}
  else if(s.target!==target){s.display=sample(s,now());s.from=s.display;s.target=target;s.start=now();s.running=true;if(s.handle!=null)cancelAnimationFrame(s.handle);s.handle=null;if(reduced()||document.hidden)finishHP(s);else s.handle=requestAnimationFrame(t=>tickHP(s,t));}
  else if(s.running)s.display=sample(s,now());
  drawHP(s);
 }
}
const api=window.BattlePresentation={
 reset(){generation++;timers.forEach(clearTimeout);timers=[];queue=[];active=null;seen=new WeakMap();weatherHeld=false;banner.hidden=true;for(const s of hpStates.values())finishHP(s);hpStates.clear();drainReady();},
 ability(unit,key,message,weather=null){
  if(!B||document.hidden)return;
  let marks=seen.get(unit);if(!marks){marks=new Map();seen.set(unit,marks);}const stamp=B.turn+':'+key;
  if(marks.has(stamp))return;marks.set(stamp,true);
  queue.push({unit,title:ABILITIES[key]?.n||key,message,weather,kind:'ability'});
  if(weather&&!weatherHeld){weatherHeld=true;weatherValue=weather.before;}
  next();
 },
 item(unit,key,message){if(!B)return;queue.push({unit,title:EQUIPS[key]?.n||key,message,kind:'item'});next();},
 ready(){if(!active&&!queue.length)return Promise.resolve();return new Promise(r=>ready.push(r));},
 settleHP(u){syncHP();const s=[...hpStates.values()].find(x=>x.unit===u);if(!s?.running)return Promise.resolve();return new Promise(r=>s.waiters.push(r));},
 visualWeather(kind){return weatherHeld?weatherValue:kind;},
 hpSnapshot(){return [...hpStates.values()].map(s=>({side:s.unit.side,hp:s.display,target:s.target,running:s.running}));}
};
const basePaint=paint;paint=function(enter){basePaint(enter);syncHP();fieldLabel();};
if(window.PixelArt){
 const field=PixelArt.field,weather=PixelArt.weather;
 PixelArt.field=function(cv,kind){return field.call(this,cv,cv?.id==='fieldCanvas'?api.visualWeather(kind):kind);};
 PixelArt.weather=function(kind,t,a){return weather.call(this,api.visualWeather(kind),t,a);};
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){timers.forEach(clearTimeout);timers=[];queue=[];active=null;weatherHeld=false;banner.hidden=true;for(const s of hpStates.values())finishHP(s);drainReady();refreshWeather();}else refreshWeather();});
window.matchMedia('(prefers-reduced-motion:reduce)').addEventListener?.('change',()=>{if(reduced())for(const s of hpStates.values())finishHP(s);});
if(B)syncHP();
})();
