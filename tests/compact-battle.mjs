import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Tests real UI handlers against a small DOM, not browser rendering or layout.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).join('\n');
const noop=()=>{};
const decode=text=>String(text).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function world(storage=new Map(),options={}){
  let document,clock=0,nextTimer=0;const timers=new Map();
  class Element {
    constructor(tag='div'){
      this.tagName=tag.toUpperCase();this.nodeName=this.tagName;this.nodeType=1;
      this.attrs={};this.children=[];this.parentNode=null;this._text='';this.listeners=new Map();this.value='';this.width=32;this.height=32;this.inert=false;
      this.style={overflow:'',setProperty(key,value){this[key]=String(value);},removeProperty(key){delete this[key];},getPropertyValue(key){return this[key]??'';}};
      this.classList={add:(...xs)=>{const c=new Set(this.className.split(/\s+/).filter(Boolean));xs.forEach(x=>c.add(x));this.className=[...c].join(' ');},remove:(...xs)=>{this.className=this.className.split(/\s+/).filter(x=>!xs.includes(x)).join(' ');},contains:x=>this.className.split(/\s+/).includes(x),toggle:(x,force)=>{const yes=force??!this.classList.contains(x);if(yes)this.classList.add(x);else this.classList.remove(x);return yes;}};
      this.dataset=new Proxy({}, {get:(_,key)=>this.getAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())),set:(_,key,value)=>{this.setAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);return true;}});
    }
    get id(){return this.attrs.id??'';}set id(v){this.attrs.id=String(v);}
    get className(){return this.attrs.class??'';}set className(v){this.attrs.class=String(v);}
    get hidden(){return Object.hasOwn(this.attrs,'hidden');}set hidden(v){if(v)this.attrs.hidden='';else delete this.attrs.hidden;}
    get tabIndex(){return this.hasAttribute('tabindex')?Number(this.getAttribute('tabindex')):['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(this.tagName)?0:-1;}set tabIndex(value){this.setAttribute('tabindex',value);}
    get disabled(){return Object.hasOwn(this.attrs,'disabled');}set disabled(v){if(v)this.attrs.disabled='';else delete this.attrs.disabled;}
    get open(){return Object.hasOwn(this.attrs,'open');}set open(v){if(v)this.attrs.open='';else delete this.attrs.open;}
    get parentElement(){return this.parentNode;}
    get firstChild(){return this.children[0]??null;}get lastChild(){return this.children.at(-1)??null;}get childNodes(){return this.children;}
    get isConnected(){return !!document&&document.body.contains(this);}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(v){this.replaceChildren();this._text=String(v??'');}
    get innerHTML(){return this._text+this.children.map(c=>c.outerHTML).join('');}
    set innerHTML(v){this.replaceChildren();this._text='';parse(String(v??''),this);}
    get outerHTML(){return '<'+this.tagName.toLowerCase()+Object.entries(this.attrs).map(([k,v])=>' '+k+'="'+String(v).replace(/"/g,'&quot;')+'"').join('')+'>'+this.innerHTML+'</'+this.tagName.toLowerCase()+'>';}
    get offsetParent(){return this.isHidden()?null:this.parentElement;}
    isHidden(){for(let n=this;n;n=n.parentElement)if(n.hidden)return true;return false;}
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k==='width'||k==='height')this[k]=Number(v);}
    getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}removeAttribute(k){delete this.attrs[k];}
    appendChild(child){if(child.parentNode)child.remove();this.children.push(child);child.parentNode=this;return child;}
    append(...children){for(const child of children)this.appendChild(typeof child==='string'?textNode(child):child);}
    prepend(child){if(child.parentNode)child.remove();this.children.unshift(child);child.parentNode=this;}
    remove(){if(this.parentNode){const parent=this.parentNode;parent.children=parent.children.filter(c=>c!==this);this.parentNode=null;}}
    replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...children);}
    insertBefore(child,before){if(!before)return this.appendChild(child);if(child.parentNode)child.remove();const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,child);child.parentNode=this;return child;}
    contains(other){for(let n=other;n;n=n.parentNode)if(n===this)return true;return false;}
    matches(selector){return selector.split(',').some(part=>matches(this,part.trim()));}
    closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    querySelectorAll(selector){const out=[];for(const child of this.children){if(child.matches(selector))out.push(child);out.push(...child.querySelectorAll(selector));}return out;}
    addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)??[]),fn]);}
    removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)??[]).filter(f=>f!==fn));}
    dispatchEvent(event){event.target??=this;event.currentTarget=this;event.preventDefault??=function(){this.defaultPrevented=true;};event.stopPropagation??=function(){this.stopped=true;};this['on'+event.type]?.(event);for(const fn of this.listeners.get(event.type)??[])fn(event);if(event.bubbles!==false&&!event.stopped){if(this.parentNode)this.parentNode.dispatchEvent(event);else if(this===document.body)document.dispatchEvent(event);}return !event.defaultPrevented;}
    click(){if(this.disabled)return;return this.dispatchEvent({type:'click',target:this,isTrusted:true});}
    focus(){document.activeElement=this;}blur(){if(document.activeElement===this)document.activeElement=document.body;}
    getContext(){return {clearRect:noop,fillRect:noop,drawImage:noop};}
    getBoundingClientRect(){return {x:0,y:0,width:640,height:480,top:0,left:0,right:640,bottom:480};}
    getClientRects(){return this.isHidden()?[]:[this.getBoundingClientRect()];}
    scrollIntoView(){} scrollTo(){}
    setPointerCapture(){} releasePointerCapture(){} hasPointerCapture(){return false;}
  }
  function textNode(text){const n=new Element('text-node');n._text=decode(text);return n;}
  function matches(node,selector){
    if(!selector)return false;
    if(selector.includes(','))return selector.split(',').some(part=>matches(node,part.trim()));
    const not=[...selector.matchAll(/:not\(([^)]*)\)/g)].map(m=>m[1]);
    if(not.some(part=>matches(node,part)))return false;
    selector=selector.replace(/:not\([^)]*\)/g,'').replace(/:scope\s*>?\s*/g,'').trim();
    const parts=selector.match(/(?:\[[^\]]*\]|[^\s])+/g)??[];
    if(parts.length>1){if(!matches(node,parts.pop()))return false;let parent=node.parentElement;while(parts.length){const next=parts.pop();while(parent&&!matches(parent,next))parent=parent.parentElement;if(!parent)return false;parent=parent.parentElement;}return true;}
    const tag=selector.match(/^[a-z][\w-]*/i)?.[0];if(tag&&node.tagName!==tag.toUpperCase())return false;
    for(const [,id]of selector.matchAll(/#([\w-]+)/g))if(node.id!==id)return false;
    for(const [,cls]of selector.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(cls))return false;
    for(const [,key,,value]of selector.matchAll(/\[([^\s=\]]+)(?:\s*=\s*(["']?)(.*?)\2)?\]/g)){if(!node.hasAttribute(key))return false;if(value!==undefined&&node.getAttribute(key)!==value)return false;}
    if(selector.includes(':disabled')&&!node.disabled)return false;
    if(selector.includes(':enabled')&&node.disabled)return false;
    return true;
  }
  function parse(markup,parent){
    const stack=[parent];
    for(const token of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/g)){
      const raw=token[0];if(raw.startsWith('<!--')||raw.startsWith('<!'))continue;
      if(raw.startsWith('</')){const tag=raw.match(/^<\/([^\s>]+)/)[1].toUpperCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===tag){stack.length=i;break;}continue;}
      if(raw.startsWith('<')){
        const tag=raw.match(/^<([^\s/>]+)/)[1],n=new Element(tag),attributes=raw.slice(tag.length+1).replace(/\/?\s*>$/,'');
        for(const a of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))n.setAttribute(a[1],decode(a[2]??a[3]??a[4]??''));
        stack.at(-1).appendChild(n);if(!voidTags.has(tag.toLowerCase())&&!raw.endsWith('/>'))stack.push(n);
      }else if(raw.trim())stack.at(-1).appendChild(textNode(raw));
    }
  }
  const body=new Element('body'),events=new Map();
  document={body,activeElement:body,hidden:false,documentElement:new Element('html'),
    createElement:tag=>new Element(tag),createTextNode:textNode,
    getElementById:id=>body.querySelector('#'+id),querySelector:selector=>selector==='body'?body:body.querySelector(selector),querySelectorAll:selector=>body.querySelectorAll(selector),
    addEventListener(name,fn){events.set(name,[...(events.get(name)??[]),fn]);},
    removeEventListener(name,fn){events.set(name,(events.get(name)??[]).filter(f=>f!==fn));},
    dispatchEvent(event){event.currentTarget=this;this['on'+event.type]?.(event);for(const fn of events.get(event.type)??[])fn(event);return !event.defaultPrevented;},
  };
  parse(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),body);
  const context=vm.createContext({console,assert,document,
    window:{scrollTo:noop,addEventListener:noop,matchMedia:()=>({matches:false,addEventListener:noop,addListener:noop}),innerWidth:390},
    performance:{now:()=>clock},setTimeout:(fn,delay=0)=>{if(!options.queuedTimers){fn();return 0;}const id=++nextTimer;timers.set(id,{fn,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  });
  const run=code=>vm.runInContext(code,context,{filename:'compact-battle-checks',timeout:10_000});
  const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
  run(source);
  return {document,storage,context,run,json,get:id=>document.getElementById(id),
    async advance(ms){clock+=ms;for(const [id,t]of [...timers])if(t.due<=clock){timers.delete(id);t.fn();}for(let n=0;n<24;n++)await Promise.resolve();},
    click(id){const node=typeof id==='string'?document.getElementById(id):id;assert.ok(node,'click target exists');node.focus();return node.click();},
    key(key,shiftKey=false){const event={type:'keydown',key,shiftKey,target:document.activeElement,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};document.activeElement.dispatchEvent(event);return event;},
  };
}


// Layout geometry is checked separately in Chromium by the parent task. This suite
// verifies structure and interaction without depending on a particular stylesheet.
const fixture=[
  {id:'homura',moves:['firefang','flame','rock','guard'],equip:'fang',ability:'stoic'},
  {id:'shiogame',moves:['squirt','aqua','haze','whirl'],equip:'plate',ability:'mirror'},
  {id:'fuen',moves:['pivot','gust','dive','soar'],equip:'wing',ability:'regen'},
];
function start(options={}){
  const w=world(new Map(),options);w.context.testFixture=structuredClone(fixture);
  w.context.testPerspective=options.perspective??'you';
  w.run("beginBattle(testFixture,testFixture,187733,testPerspective);NET.on=false;B.busy=false;globalThis.actions=[];resolve=action=>{actions.push(action);return Promise.resolve();};renderCmd()");
  return w;
}
const card=(w,side,index)=>w.get('modalBody').querySelector('[data-battle-unit="'+side+':'+index+'"]');
const pointer=(node,type,extra={})=>node.dispatchEvent({type,bubbles:true,pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:100,clientY:100,...extra});
const actionCount=w=>w.json('actions').length;

const compact=start();
assert.ok(compact.get('stage').contains(compact.get('log')),'battle log is an overlay mounted inside the battlefield');
assert.equal(compact.get('cmd').querySelectorAll('.move-command').length,4,'the command grid contains exactly four move buttons');
for(const id of ['btnFocusEnergy','btnBattleMonsters'])assert.ok(compact.get(id),id+' is available during battle');
assert.equal(compact.get('btnFocusEnergy').parentElement,compact.get('btnBattleMonsters').parentElement,'focus and monsters share the same action row');
assert.ok(compact.get('btnFocusEnergy').textContent.includes('気を溜める'),'focus action remains recognizable');
assert.ok(compact.get('btnBattleMonsters').textContent.includes('幻獣'),'the monster-list action uses the requested label');
for(const id of ['youEq','foeEq']){
  const node=compact.get(id);
  if(node)assert.ok(node.isHidden()||node.style.display==='none','ability/equipment line '+id+' is not exposed on the main battlefield');
}
compact.click('btnFocusEnergy');
assert.deepEqual(compact.json('actions'),[{kind:'move',key:null}],'the focus button submits the energy-gathering action');
compact.run('B.busy=true;renderCmd()');
assert.equal(compact.get('btnFocusEnergy').disabled,true,'focus is locked while a turn resolves');
compact.click('btnFocusEnergy');assert.equal(actionCount(compact),1,'disabled focus cannot submit a second action');
assert.equal(compact.get('btnBattleMonsters').disabled,false,'inspection remains available during a resolving turn');
console.log('PASS compact battle structure, four moves, the focus/monster row, embedded log, and action availability');

for(const perspective of ['you','foe']){
  const w=start({perspective});
  const own=perspective,enemy=perspective==='you'?'foe':'you';
  const stateBefore=w.run('JSON.stringify(B)'),seedBefore=w.run('_seed'),draft=w.storage.get('genju_battle_draft_v1');
  w.click('btnBattleMonsters');
  assert.equal(w.get('uiModal').hidden,false,'monster list opens as a dialog');
  assert.equal(w.get('modalBody').querySelectorAll('[data-battle-unit]').length,6,'both teams expose all six monsters');
  assert.ok(card(w,own,0)&&card(w,enemy,0),'canonical team sides remain addressable in either player perspective');
  assert.ok(!w.get('modalBody').textContent.includes('猛火の牙'),'equipment is concealed until detail inspection');
  assert.ok(!w.get('modalBody').textContent.includes('やせ我慢'),'abilities are concealed until detail inspection');
  assert.equal(w.run('JSON.stringify(B)'),stateBefore,'opening the list does not mutate the battle');
  assert.equal(w.run('_seed'),seedBefore,'opening the list consumes no battle RNG');
  assert.equal(w.storage.get('genju_battle_draft_v1'),draft,'inspection never edits the saved party');
  w.click(card(w,enemy,1));assert.equal(actionCount(w),0,'an enemy card cannot submit a switch');
  w.run('GameUI.returnBattleMonsters()');
  w.click(card(w,own,1));
  assert.equal(w.get('btnConfirmSwitch').disabled,false,'a living own bench monster can be selected');
  w.click('btnConfirmSwitch');
  assert.deepEqual(w.json('actions'),[{kind:'switch',to:1}],perspective+': confirmation sends the local bench index');
  assert.equal(w.get('uiModal').hidden,true,'switch confirmation closes the list');
  assert.notEqual(w.document.body.style.overflow,'hidden','switch confirmation releases the modal scroll lock');
}
console.log('PASS six-monster list, concealed details, cosmetic isolation, and confirmed local switches from both perspectives');

for(const condition of ['busy','over','bound','dead','active']){
  const w=start();w.click('btnBattleMonsters');
  w.click(card(w,'you',1));
  if(condition==='busy')w.run('B.busy=true');
  if(condition==='over')w.run('B.over=true');
  if(condition==='bound')w.run('MY().bindTurns=2;MY().boundBy=OP()');
  if(condition==='dead')w.run('myTeam()[1].dead=true;myTeam()[1].hp=0');
  if(condition==='active')w.run('GameUI.selectedBattleIndex=myIdx()');
  // Call the actual confirmation handler after state changes; a stale enabled UI
  // control must never be able to bypass the current battle restrictions.
  w.run('GameUI.confirmBattleSwitch()');
  assert.equal(actionCount(w),0,condition+': stale confirmation cannot submit a forbidden switch');
}
const inspecting=start();inspecting.run('B.busy=true;renderCmd()');inspecting.click('btnBattleMonsters');
assert.equal(inspecting.get('uiModal').hidden,false,'the list is available while actions are locked');
inspecting.run("GameUI.inspectBattleUnit('foe',0)");assert.ok(inspecting.get('btnUnitBack'),'opponent details remain readable during a resolving turn');
console.log('PASS switch guards against busy, ended, bound, fainted, and already-active targets while inspection stays available');

const forced=start();forced.run('B.busy=true;MY().dead=true;MY().hp=0;globalThis.requiredPick=chooseReplacement("次の幻獣を選ぶ")');
assert.equal(forced.get('uiModal').hidden,false,'faint replacement opens the same monster-list window');
forced.click('btnModalClose');assert.equal(forced.get('uiModal').hidden,true,'the required list may be dismissed to inspect the battlefield');
forced.click('btnBattleMonsters');forced.click(card(forced,'you',1));
assert.equal(forced.get('btnConfirmSwitch').disabled,false,'required replacement remains possible while the turn is busy');
forced.click('btnConfirmSwitch');assert.equal(await forced.run('requiredPick'),1,'required selection resolves the pending replacement instead of submitting a new action');
assert.equal(actionCount(forced),0,'required replacement never submits a second turn action');
assert.equal(forced.run('GameUI.replacement'),null,'fulfilled replacement intent is cleared');
const cancelPick=start();cancelPick.run('B.busy=true;globalThis.previousBattle=B;globalThis.oldPick=chooseReplacement("翻しの交代先")');
cancelPick.run('beginBattle(testFixture,testFixture,9127,"you")');
assert.equal(await cancelPick.run('oldPick'),null,'starting a fresh battle releases an abandoned replacement promise');
assert.equal(cancelPick.run('B===previousBattle'),false,'replacement cancellation does not reuse the old battle session');
assert.equal(cancelPick.run('B.over'),false,'abandoned replacement cancellation cannot end the fresh battle');
console.log('PASS mandatory faint/pivot selection stays available while busy, survives modal dismissal, and cancels cleanly before a fresh battle');


const details=start({queuedTimers:true});details.run("YOU().rank.atk=2;YOU().rank.def=-1;YOU().status='麻痺';YOU().perish=2;YOU().seedTurns=3;renderCmd()");
details.click('btnBattleMonsters');
let held=card(details,'you',0);pointer(held,'pointerdown');await details.advance(499);
assert.equal(details.get('btnUnitBack'),null,'a short touch does not open detail mode');
await details.advance(1);
assert.ok(details.get('btnUnitBack'),'a continuous half-second hold opens details');
let detailText=details.get('modalBody').textContent;
for(const text of ['焔犬','やせ我慢','猛火の牙','麻痺','滅び'])assert.ok(detailText.includes(text),'detail view includes '+text);
assert.ok(detailText.includes('物攻')||detailText.includes('物理攻撃'),'detail view names physical attack');
assert.ok(detailText.includes('+2'),'detail view includes positive rank changes');
assert.ok(detailText.includes('-1'),'detail view includes negative rank changes');
const afterHold=actionCount(details);pointer(held,'pointerup');held.click();
assert.equal(actionCount(details),afterHold,'the release click after a long hold cannot trigger a switch');
assert.ok(details.get('btnUnitBack'),'release after long hold stays in detail mode');
details.click('btnUnitBack');assert.equal(details.get('modalBody').querySelectorAll('[data-battle-unit]').length,6,'detail back returns to the team list');
held=card(details,'you',1);pointer(held,'pointerdown');pointer(held,'pointermove',{clientX:114});await details.advance(600);
assert.equal(details.get('btnUnitBack'),null,'moving a finger beyond the tolerance cancels long press');pointer(held,'pointerup');
held=card(details,'foe',0);pointer(held,'pointerdown');pointer(held,'pointercancel');await details.advance(600);
assert.equal(details.get('btnUnitBack'),null,'pointer cancellation does not reveal details later');
const accessible=details.get('modalBody').querySelector('[data-unit-detail="foe:0"]');
assert.ok(accessible,'each monster has an explicit accessible details control');details.click(accessible);
assert.ok(details.get('btnUnitBack'),'the accessible detail button works without long press');
details.click('btnUnitBack');
details.run("YOU().status=null;YOU().pendingStatus={status:'やけど',turn:B.turn};GameUI.inspectBattleUnit('you',0)");
assert.ok(details.get('modalBody').textContent.includes('やけど'),'details include the queued ailment');
assert.ok(details.get('modalBody').textContent.includes('予約')||details.get('modalBody').textContent.includes('我慢'),'queued ailments are identified as pending rather than active');
details.run('GameUI.returnBattleMonsters()');
held=card(details,'you',0);pointer(held,'pointerdown');details.click('btnModalClose');await details.advance(600);
assert.equal(details.get('uiModal').hidden,true,'closing the list cancels its pending hold instead of reopening a detail window');
console.log('PASS genuine timed long press, release suppression, movement/cancel/close handling, accessible inspection, and current stats/status/rank details');

const encore=start();encore.run("MY().encore={key:'firefang',turns:2};renderCmd()");
assert.ok(encore.get('btnFocusEnergy').disabled,'encore does not permit energy gathering through the compact action row');
assert.equal(encore.get('btnBattleMonsters').disabled,false,'encore does not disable the informational monster list');
console.log('PASS existing forced-move restriction is preserved by the compact controls');
console.log('Unverified: real browser geometry, touch-device behavior, perceived long-press timing, and live PeerJS transport.');
