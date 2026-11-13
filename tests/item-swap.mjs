import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Real turn resolution with presentation stubs; no browser or live PeerJS transport.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
function world(){
  const nodes=new Map();
  function node(){
    const classes=new Set();let markup='';
    return {value:'',textContent:'',children:[],width:384,height:216,open:false,dataset:{},
      get innerHTML(){return markup;},set innerHTML(value){markup=String(value);this.children=[];},
      style:{setProperty:noop,removeProperty:noop},
      classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
      appendChild(child){this.children.push(child);return child;},remove:noop,
      querySelector:()=>node(),querySelectorAll:()=>[],getContext:()=>({clearRect:noop,fillRect:noop}),
      addEventListener:noop,setAttribute:noop,
    };
  }
  const getNode=selector=>{const key=selector.startsWith('#')?selector:'#'+selector;if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
  const context=vm.createContext({console,assert,
    document:{hidden:false,querySelector:getNode,getElementById:getNode,
      querySelectorAll:selector=>selector==='.screen'?['scBuild','scBattle','scResult'].map(getNode):[],createElement:node,addEventListener:noop},
    window:{scrollTo:noop},localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
    setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  });
  const run=code=>vm.runInContext(code,context,{filename:'flinch-checks',timeout:10_000});
  run(source);
  run(`
    function unit(side){
      const u=makeUnit({id:'homura',moves:['slide','tackle','guard','repose'],equip:'none',ability:'focus2'},side);
      u.en=100;u.type='無';u.maxhp=u.hp=1000;u.baseAtk=u.baseSpAtk=u.baseDef=u.baseSpDef=100;u.baseSpd=100;
      return u;
    }
    function setup(){
      B={you:[unit('you'),unit('you'),unit('you')],foe:[unit('foe'),unit('foe'),unit('foe')],
        yi:0,fi:0,hazard:{you:{rock:false,sand:false},foe:{rock:false,sand:false}},
        turn:1,over:false,busy:false,pickSeq:0,reverseTurns:0};
      ME='you';NET.on=false;setSeed(817223);document.querySelector('#log').innerHTML='';return [YOU(),FOE()];
    }
    function logs(){return document.querySelector('#log').children.map(n=>n.innerHTML).join(' ');}
    function forcedFlinch(){rng=()=>.01;}
    const move=key=>({kind:'move',key});
  `);
  return {run,json:expression=>JSON.parse(run('JSON.stringify('+expression+')'))};
}
const {run}=world();




await run(`(async()=>{
 let [a,d]=setup();rng=()=>.5;
 const realFx=playFx;let swapFX=0;playFx=(u,t,m,k)=>{if(m.fx==='swapitem')swapFX++;};
 for(const [mine,theirs] of [['none','none'],['mask','none'],['none','belt']]){
  [a,d]=setup();a.equip=mine;d.equip=theirs;swapFX=0;
  assert.ok(itemSwapFailure(a,d));assert.equal(fxNullified(MOVES.swap,d,a),true);
  await doMove(a,d,'swap');assert.equal(a.equip,mine);assert.equal(d.equip,theirs);assert.equal(a.en,75);assert.equal(a.lastMove,'swap');assert.equal(swapFX,0);
  assert.ok(logs().includes('持ち物を持っていない'));
 }
 for(const mode of ['actor-definition','target-definition','actor-bound','target-bound']){
  [a,d]=setup();a.equip='mask';d.equip='plate';swapFX=0;
  if(mode==='actor-definition')EQUIPS.mask.unremovable=true;
  if(mode==='target-definition')EQUIPS.plate.unremovable=true;
  if(mode==='actor-bound')a.itemBound=true;
  if(mode==='target-bound')d.itemBound=true;
  assert.ok(itemSwapFailure(a,d));await doMove(a,d,'swap');
  assert.equal(a.equip,'mask');assert.equal(d.equip,'plate');assert.equal(abilOff(a),true);assert.equal(abilOff(d),false);assert.equal(swapFX,0);assert.equal(a.en,75);
  assert.ok(logs().includes('持ち主から離れない'));delete EQUIPS.mask.unremovable;delete EQUIPS.plate.unremovable;
 }
 [a,d]=setup();a.equip='mask';d.equip='plate';d.sub=80;swapFX=0;
 assert.equal(itemSwapFailure(a,d),null);assert.equal(fxNullified(MOVES.swap,d,a),false);
 await doMove(a,d,'swap');assert.equal(a.equip,'plate');assert.equal(d.equip,'mask');assert.equal(abilOff(d),true);assert.equal(abilOff(a),false);assert.equal(d.sub,80);assert.equal(swapFX,1,'valid exchange still bypasses substitute');
 // Recheck at execution even if a previous preview was valid.
 [a,d]=setup();a.equip='belt';d.equip='plate';a.moves=['swap'];renderCmd();assert.ok(!document.querySelector('#cmd').children[0].innerHTML.includes('効果なし'));
 d.itemBound=true;renderCmd();assert.ok(document.querySelector('#cmd').children[0].innerHTML.includes('効果なし'));await doMove(a,d,'swap');assert.equal(a.equip,'belt');assert.equal(d.equip,'plate');
 for(const mode of ['none','fixed','valid']){
  [a,d]=setup();a.type=d.type='無';a.equip=mode==='none'?'none':'belt';d.equip='mask';d.moves=['swap','tackle'];if(mode==='fixed')a.itemBound=true;
  assert.equal(aiChoose().key,mode==='valid'?'swap':'tackle','AI respects '+mode+' exchange');
 }
 for(const id of Object.keys(CHALLENGES)){
  party=randBuild();startChallenge(id);a=YOU();d=FOE();a.equip='mask';swapFX=0;await doMove(a,d,'swap');assert.equal(d.equip,'none');assert.equal(a.equip,'mask');assert.equal(swapFX,0,'empty-handed boss cannot receive an item');
 }
 playFx=realFx;
})()`);
console.log('PASS bilateral held items, either definition/unit lock, atomic failure/no FX, energy and last move, valid mask exchange through substitute, preview/execution recheck, AI and empty-handed bosses');
