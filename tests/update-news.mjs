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
    localStorage:{getItem(key){if(options.denyStore)throw Error('blocked');return storage.get(key)??null;},setItem(key,value){if(options.denyStore)throw Error('blocked');storage.set(key,String(value));},removeItem:key=>storage.delete(key)},
    sessionStorage:{getItem(key){if(options.denySession)throw Error('blocked');return options.session?.get(key)??null;},setItem(key,value){if(options.denySession)throw Error('blocked');options.session?.set(key,String(value));}},
  });
  const run=code=>vm.runInContext(code,context,{filename:'ui-overhaul-checks',timeout:10_000});
  const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
  run(options.gameSource||source);
  return {document,storage,context,run,json,get:id=>document.getElementById(id),
    async advance(ms){clock+=ms;for(const [id,t]of [...timers])if(t.due<=clock){timers.delete(id);t.fn();}for(let n=0;n<24;n++)await Promise.resolve();},
    click(id){const node=typeof id==='string'?document.getElementById(id):id;assert.ok(node,'click target exists');node.focus();return node.click();},
    key(key,shiftKey=false){const event={type:'keydown',key,shiftKey,target:document.activeElement,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};document.activeElement.dispatchEvent(event);return event;},
  };
}

const key='genju_battle_news_seen_v1',store=new Map();
const first=world(store);const latest=first.run('UPDATE_NEWS[0].id');
assert.equal(first.run('GameUI.kind'),'news');assert.equal(first.run('GameUI.newsLatestOnly'),true);
assert.equal(first.get('modalBody').querySelectorAll('[data-news-id]').length,1);
assert.match(first.get('modalBody').querySelector('time').getAttribute('datetime'),/^\d{4}-\d{2}-\d{2}$/);
assert.ok(JSON.parse(store.get(key)).includes(latest),'opening marks the latest seen immediately');
first.click('btnNewsHistory');assert.equal(first.run('GameUI.newsLatestOnly'),false);
assert.equal(first.get('modalBody').querySelectorAll('[data-news-id]').length,first.run('UPDATE_NEWS.length'));
first.click('btnNewsDone');assert.equal(first.get('uiModal').hidden,true);assert.equal(first.get('appShell').inert,false);
assert.equal(first.document.activeElement,first.get('btnOpenNews'),'closing startup returns focus to news entry');
const second=world(store);assert.equal(second.run('GameUI.kind'),null,'seen latest stays closed on next visit');
second.click('btnOpenNews');assert.equal(second.run('GameUI.kind'),'news','manual history always available');
second.click('btnNewsDone');second.run('setSeed(12345)');const seed=second.run('_seed'),party=second.run('JSON.stringify(party)');
second.click('btnOpenNews');second.click('btnNewsDone');assert.equal(second.run('_seed'),seed);assert.equal(second.run('JSON.stringify(party)'),party);
const nextSource=source.replaceAll(latest,'test-next-release');
const next=world(store,{gameSource:nextSource});assert.equal(next.run('GameUI.kind'),'news','new version opens once');
assert.equal(world(store,{gameSource:nextSource}).run('GameUI.kind'),null,'new version then stays closed');
for(const value of ['not-json','{}','null','[1,null]']){
 const corrupt=new Map([[key,value]]);assert.equal(world(corrupt).run('GameUI.kind'),'news');assert.ok(JSON.parse(corrupt.get(key)).includes(latest));
}
const session=new Map();const blocked=world(new Map(),{denyStore:true,session});assert.equal(blocked.run('GameUI.kind'),'news');blocked.click('btnNewsDone');
assert.equal(world(new Map(),{denyStore:true,session}).run('GameUI.kind'),null,'session fallback survives reload when local storage is blocked');
const denied=world(new Map(),{denyStore:true,denySession:true});denied.click('btnNewsDone');denied.run('UpdateNews.start()');assert.equal(denied.run('GameUI.kind'),null,'storage denial cannot loop dialogs within a visit');
const empty=world(new Map(),{gameSource:source.replace(/^const UPDATE_NEWS = .*;$/m,'const UPDATE_NEWS = [];')});assert.equal(empty.run('GameUI.kind'),null);
console.log('PASS latest-only first visit, persisted read state and new release, manual dated history, focus/background cleanup, corrupt/denied storage and session fallback, empty feed and cosmetic isolation');
