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
  const run=code=>vm.runInContext(code,context,{filename:'ui-overhaul-checks',timeout:10_000});
  const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
  run(source);
  return {document,storage,context,run,json,get:id=>document.getElementById(id),
    async advance(ms){clock+=ms;for(const [id,t]of [...timers])if(t.due<=clock){timers.delete(id);t.fn();}for(let n=0;n<24;n++)await Promise.resolve();},
    click(id){const node=typeof id==='string'?document.getElementById(id):id;assert.ok(node,'click target exists');node.focus();return node.click();},
    key(key,shiftKey=false){const event={type:'keydown',key,shiftKey,target:document.activeElement,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};document.activeElement.dispatchEvent(event);return event;},
  };
}

assert.match(html,/id="uiModal"[^>]*role="dialog"|role="dialog"[^>]*id="uiModal"/,'modal has dialog semantics');
assert.match(html,/aria-modal="true"/,'modal communicates its modality');
assert.match(html,/aria-labelledby="modalTitle"/,'modal has an accessible title');
for(const id of ['btnOpenSound','btnOpenGuide','btnOpenSaves','btnOpenLobby','btnModalClose','uiResources','modalBody'])assert.ok(html.includes('id="'+id+'"'),id+' is present');
const w=world();
assert.equal(w.run('typeof GameUI'),'object','UI controller is initialized');
assert.equal(w.get('uiModal').hidden,true,'modal is closed on initial page load');
const draftBefore=w.storage.get('genju_battle_draft_v1');w.run('setSeed(84279)');
for(const [button,resource]of [['btnOpenSound','resourceSound'],['btnOpenGuide','resourceGuide'],['btnOpenSaves','resourceSaves'],['btnOpenLobby','resourceLobby']]){
  const opener=w.get(button),panel=w.get(resource);assert.ok(panel,resource+' exists');
  w.click(button);
  assert.equal(w.get('uiModal').hidden,false,button+' opens a dialog');
  assert.ok(w.get('modalBody').contains(panel),resource+' is moved into the visible modal');
  assert.equal(w.document.body.style.overflow,'hidden','opening locks background scrolling');
  assert.equal(w.document.querySelector('.app-shell').inert,true,'opening makes the page background inert');
  assert.ok(w.get('uiModal').contains(w.document.activeElement),'focus moves into the dialog');
  w.key('Escape');
  assert.equal(w.get('uiModal').hidden,true,'Escape closes the dialog');
  assert.ok(w.get('uiResources').contains(panel),resource+' returns to its resource container');
  assert.notEqual(w.document.body.style.overflow,'hidden','close restores background scrolling');
  assert.equal(w.document.querySelector('.app-shell').inert,false,'close releases background interaction');
  assert.equal(w.document.activeElement,opener,'close returns focus to the opener');
}
assert.equal(w.run('_seed'),84279,'opening cosmetic dialogs never consumes battle RNG');
assert.equal(w.storage.get('genju_battle_draft_v1'),draftBefore,'opening cosmetic dialogs never changes the saved draft');
w.run("GameUI.open('sound')");
const volume=w.get('bgmVolume');volume.value='61';volume.oninput({target:volume});
assert.equal(w.run('BattleMusic.volume'),.61,'moved sound controls retain their real input handlers');
w.run("GameUI.close();GameUI.open('sound')");assert.equal(w.get('bgmVolume'),volume,'reopening sound uses the same controls rather than detached clones');
assert.equal(Number(volume.value),61,'sound preference remains visible after reopening');w.run('GameUI.close()');
console.log('PASS dialog resources, semantic labels, focus/scroll/background lifecycle, keyboard close, real sound controls, and cosmetic state isolation');

w.run("party=[];renderAll()");w.click(w.get('roster').children[0]);
assert.equal(w.get('uiModal').hidden,false,'monster inspection opens in a dialog');
assert.ok(w.get('modalBody').textContent.includes('焔犬'),'inspection names the selected monster');
w.click(w.get('modalBody').querySelector('[data-choose-species="homura"]'));
assert.ok(w.document.activeElement.isConnected&&w.get('uiModal').contains(w.document.activeElement),'adding a monster retains usable focus inside its inspection dialog');
assert.deepEqual(w.json('party.map(p=>p.id)'),['homura'],'inspection can add a monster');
w.run("GameUI.toggleSpecies('shiogame');GameUI.toggleSpecies('fuen');GameUI.toggleSpecies('saikaku')");
assert.equal(w.json('party').length,3,'selection respects the three-monster team limit');
w.run("GameUI.moveParty(2,-1)");assert.deepEqual(w.json('party.map(p=>p.id)'),['homura','fuen','shiogame'],'team order can be changed');
w.run("GameUI.removeParty(2)");assert.deepEqual(w.json('party.map(p=>p.id)'),['homura','fuen'],'removal updates the party');
w.run("GameUI.edit(0,'moves')");
const pool=w.json("learnable(spec('homura'))");
for(const key of pool.slice(0,4)){const button=w.get('modalBody').querySelector('[data-move="'+key+'"]');assert.ok(button,key+': move has a real selectable control');w.click(button);}
assert.equal(w.json('party[0].moves').length,4,'four moves can be selected');
w.click(w.get('modalBody').querySelector('[data-move="'+pool[4]+'"]'));assert.equal(w.json('party[0].moves').length,4,'a fifth move cannot be selected');
w.click(w.get('modalBody').querySelector('[data-move="'+pool[0]+'"]'));assert.equal(w.json('party[0].moves').length,3,'a selected move can be removed');
assert.equal(w.get('uiModal').hidden,false,'live editing keeps the editor open');
const selectedKey=w.json('party[0].moves[0]'),selectedName=w.json('MOVES')[selectedKey].n;
const removeSelected=w.get('modalBody').querySelector('button[aria-label="'+selectedName+'を外す"]');
assert.ok(removeSelected,'selected move has an accessible removal button');w.click(removeSelected);
assert.ok(!w.json('party[0].moves').includes(selectedKey),'top selected-move button removes that move');
assert.ok(w.document.activeElement.isConnected&&w.get('uiModal').contains(w.document.activeElement),'removing a selected move keeps keyboard focus in the live editor');
assert.ok(w.get('modalBody').querySelectorAll('[data-move]').length>0,'move editor exposes actionable move controls');
w.run("GameUI.edit(0,'abilities')");w.click(w.get('modalBody').querySelector('[data-ability="stoic"]'));assert.equal(w.json('party[0].ability'),'stoic','third-trait selection works in the editor');
assert.equal(w.get('uiModal').hidden,false,'ability editing keeps the modal open');
w.run("GameUI.edit(0,'equipment')");w.click(w.get('modalBody').querySelector('[data-equip="fang"]'));assert.equal(w.json('party[0].equip'),'fang','equipment selection works in the editor');
assert.deepEqual(JSON.parse(w.storage.get('genju_battle_draft_v1')),w.json('party'),'live editor changes persist through the existing draft format');
w.run("GameUI.selectAbility(0,'not-an-ability');GameUI.selectEquip(0,'not-an-equipment');GameUI.selectMove(0,'not-a-move')");
assert.equal(w.json('party[0].ability'),'stoic','invalid UI trait requests do not corrupt a team');assert.equal(w.json('party[0].equip'),'fang','invalid equipment requests do not corrupt a team');
w.run("GameUI.edit(0,'abilities')");
for(const [key,expected]of [['ArrowRight','equipment'],['ArrowLeft','abilities'],['Home','moves'],['End','equipment']]){
  const active=w.get('modalBody').querySelector('[data-editor-tab="'+w.run('GameUI.tab')+'"]');active.focus();
  const event=w.key(key);assert.equal(event.defaultPrevented,true,key+': tab navigation intercepts native scrolling');
  assert.equal(w.run('GameUI.tab'),expected,key+': switches the editor category');
  assert.equal(w.document.activeElement.getAttribute('data-editor-tab'),expected,key+': places focus on the active category');
}
console.log('PASS monster inspection, team add/remove/reorder, four-move limit, live focus, arrow-key tabs, trait/equipment selection, and autosave');

w.run("GameUI.close()");const originalSoundOpener=w.get('btnOpenSound');w.click(originalSoundOpener);
w.run("GameUI.open('saves');GameUI.open('sound')");
assert.ok(w.get('modalBody').contains(w.get('resourceSound')),'switching windows reuses the original resource panel');
assert.ok(w.get('uiResources').contains(w.get('resourceSaves')),'the previous resource is returned before switching windows');
assert.equal(w.document.body.style.overflow,'hidden','switching windows preserves the original scroll lock');
w.run('GameUI.close()');assert.notEqual(w.document.body.style.overflow,'hidden','closing a switched window releases its scroll lock');assert.equal(w.document.activeElement,originalSoundOpener,'switching resource windows preserves the original focus return point');
w.run("GameUI.open('sound')");w.click('btnModalClose');assert.equal(w.get('uiModal').hidden,true,'the close button works');
w.run("GameUI.open('sound')");w.click(w.get('uiModal').querySelector('.modal-panel'));assert.equal(w.get('uiModal').hidden,false,'clicking inside the dialog does not dismiss it');
const backdrop=w.get('uiModal').querySelector('.modal-backdrop')??w.get('uiModal');w.click(backdrop);assert.equal(w.get('uiModal').hidden,true,'backdrop click dismisses the dialog');
w.run("GameUI.open('guide');show('scBattle')");assert.equal(w.get('uiModal').hidden,true,'changing game screens closes transient windows');
assert.notEqual(w.document.body.style.overflow,'hidden','navigation cannot leave the page scroll-locked');
w.run("show('scBuild');GameUI.open('sound')");
const focusable=w.get('uiModal').querySelectorAll('button, input, select, a[href], [tabindex]')
  .filter(node=>!node.disabled&&!node.isHidden()&&node.getAttribute('tabindex')!=='-1');
if(focusable.length>1){
  focusable.at(-1).focus();const forward=w.key('Tab');assert.equal(forward.defaultPrevented,true,'forward tab at the end is intercepted');assert.notEqual(w.document.activeElement,focusable.at(-1),'forward tab wraps away from the last control');assert.ok(w.get('uiModal').contains(w.document.activeElement),'forward tab remains inside the dialog');
  focusable[0].focus();const reverse=w.key('Tab',true);assert.equal(reverse.defaultPrevented,true,'reverse tab at the beginning is intercepted');assert.notEqual(w.document.activeElement,focusable[0],'reverse tab wraps away from the first control');assert.ok(w.get('uiModal').contains(w.document.activeElement),'reverse tab remains inside the dialog');
}
w.run('GameUI.close()');
const previewFrames=new Map();let previewFrameId=0;
w.context.requestAnimationFrame=fn=>{const id=++previewFrameId;previewFrames.set(id,fn);return id;};
w.context.cancelAnimationFrame=id=>previewFrames.delete(id);
w.run("GameUI.open('guide');document.getElementById('statusPreview').open=true;StatusPreview.sync()");
assert.equal(w.run('StatusPreview.running'),true,'opening the status demonstration starts its preview animation');
const previewHandle=w.run('StatusPreview.handle');w.run('GameUI.close()');
assert.equal(w.get('statusPreview').open,false,'closing the guide also closes its disclosure');
assert.equal(w.run('StatusPreview.running'),false,'a hidden guide stops its preview animation');
assert.equal(previewFrames.has(previewHandle),false,'closing the guide cancels its pending animation frame');
delete w.context.requestAnimationFrame;delete w.context.cancelAnimationFrame;
assert.ok(/prefers-reduced-motion/.test(html),'motion preference remains supported');
console.log('PASS explicit close, screen navigation cleanup, dialog tab containment, and reduced-motion support');
const canceled=world(new Map(),{queuedTimers:true});
canceled.run("beginBattle(randBuild(),randBuild(),123,'you');B.busy=true;YOU().baseSpd=220;FOE().baseSpd=1;globalThis.oldBattle=B;globalThis.oldTurn=takeTurn({kind:'move',key:'reverseRoom'},{kind:'move',key:null})");
await canceled.advance(0); // Allow the initial async faint check to schedule the first move delay.
await canceled.advance(360);
canceled.click('btnLeaveBattle');canceled.click(canceled.get('modalBody').querySelector('button.primary'));
assert.equal(canceled.run('oldBattle.over'),true,'exiting cancels the current battle');
canceled.click('btnStart');
assert.equal(canceled.run('B===oldBattle'),false,'a new battle has a separate session');
const nextSeed=canceled.run('_seed');assert.equal(canceled.run('B.reverseTurns'),0,'a rematch begins without the old room');
await canceled.advance(200);
assert.equal(canceled.run('B.reverseTurns'),0,'an old delayed status animation cannot mutate a new battle');
assert.equal(canceled.run('B.turn'),1,'an old turn cannot advance the new battle');
assert.equal(canceled.run('_seed'),nextSeed,'a canceled turn cannot consume the new battle RNG');
await canceled.run('oldTurn');
const outcome=world(new Map(),{queuedTimers:true});outcome.click('btnStart');outcome.run("finish('you')");
outcome.click('btnLeaveBattle');outcome.click(outcome.get('modalBody').querySelector('button.primary'));outcome.click('btnStart');
await outcome.advance(900);
assert.equal(outcome.get('scBattle').classList.contains('on'),true,'an old result timeout cannot replace a newly started battle');
assert.equal(outcome.get('scResult').classList.contains('on'),false,'an abandoned result screen remains hidden');
console.log('PASS exit/rematch session isolation across delayed moves, turn resolution, and old result timeouts');
console.log('Unverified: real browser layout, touch/keyboard behavior, visual focus, and mobile viewport rendering.');
