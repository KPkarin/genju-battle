import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Behavior checks with a fake DOM; not browser animation, sound, or live PeerJS QA.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
function world(){
  const nodes=new Map(),storage=new Map();
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
    window:{scrollTo:noop},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  });
  const run=code=>vm.runInContext(code,context,{filename:'balance-update-checks',timeout:10_000});
  run(source);
  run(`
    function unit(side='you'){
      const u=makeUnit({id:'homura',moves:['tackle','crushrock','reverseRoom','sub'],equip:'none',ability:'focus2'},side);
      u.type='無';u.maxhp=u.hp=1000;u.baseAtk=u.baseSpAtk=u.baseDef=u.baseSpDef=100;u.baseSpd=100;
      return u;
    }
    function setup(){
      B={you:[unit('you'),unit('you'),unit('you')],foe:[unit('foe'),unit('foe'),unit('foe')],
        yi:0,fi:0,hazard:{you:{rock:false,sand:false},foe:{rock:false,sand:false}},
        turn:1,over:false,busy:false,pickSeq:0,reverseTurns:0};
      ME='you';NET.on=false;setSeed(8921347);return [YOU(),FOE()];
    }
    const normalRng=rng,normalDamage=damage;
    function restoreRandom(){rng=normalRng;damage=normalDamage;}
    function fixedRandom(value){globalThis.randomCalls=0;rng=()=>{randomCalls++;return value;};}
    function fixedDamage(value=10){globalThis.damageRecords=[];damage=(a,d,m)=>{damageRecords.push({attacker:a.side,defender:d.side,p:m.p,shield:d.sub,hp:d.hp});return {dmg:value,e:attackEff(m.t,d.type),crit:false,stab:m.t===a.type};};}
  `);
  return {run,getNode,nodes,json:expression=>JSON.parse(run('JSON.stringify('+expression+')'))};
}
const {run}=world();
await run(`(async()=>{
 const normalFx=playFx,normalSprite=drawSprite,normalDoll=drawSubstitute;
 globalThis.fxCalls=[];playFx=(...args)=>fxCalls.push(args[3]);
 const reset=()=>{const pair=setup();fxCalls=[];return pair;};
 let [a,d]=reset();fixedRandom(.99);await doMove(a,d,'slide');assert.equal(fxCalls.length,0,'miss has no move animation');
 [a,d]=reset();d.type='幻';fixedRandom(.1);await doMove(a,d,'tackle');assert.equal(fxCalls.length,0,'immunity has no attack animation');
 for(const key of ['ambush','startle','revenge','encore','disable','swap','clear']){
  if(!MOVES[key])continue;
  [a,d]=reset();fixedRandom(.1);await doMove(a,d,key);assert.equal(fxCalls.length,0,key+': failed prerequisite is silent');
 }
 [a,d]=reset();fixedRandom(.1);a.sub=20;await doMove(a,d,'sub');assert.equal(fxCalls.length,0,'existing substitute fails silently');
 [a,d]=reset();fixedRandom(.1);a.hp=1;await doMove(a,d,'sub');assert.equal(fxCalls.length,0,'insufficient substitute HP fails silently');
 [a,d]=reset();fixedRandom(.1);d.type='炎';await doMove(a,d,'coal');assert.equal(fxCalls.length,0,'status immunity is silent');
 [a,d]=reset();fixedRandom(.1);await doMove(a,d,Object.keys(MOVES).find(k=>MOVES[k].fx==='heal'));assert.equal(fxCalls.length,0,'full health recovery has no animation');
 [a,d]=reset();fixedRandom(.1);a.rank.atk=6;await doMove(a,d,'focus');assert.equal(fxCalls.length,0,'capped stat fails silently');
 [a,d]=reset();fixedRandom(.1);await doMove(a,d,'sub');assert.equal(fxCalls.length,1);assert.ok(a.sub>0);
 fxCalls=[];await doMove(d,a,'crushrock');assert.ok(fxCalls.length>=2,'successful hits still animate');
 [a,d]=reset();fixedRandom(.1);await doMove(a,d,'coal');assert.equal(fxCalls.length,1,'accepted status still animates');
 [a,d]=reset();d.sub=10;d.pendingStatus={status:'麻痺',turn:1};d.rank.atk=2;
 const state=JSON.stringify(B),seed=_seed,calls=[];
 drawSprite=(cv,id,view)=>calls.push(['monster',id,view]);drawSubstitute=(cv,view)=>calls.push(['doll',view]);
 drawBattleSprite(document.querySelector('#spFoe'),d);assert.equal(calls.at(-1)[0],'doll');
 d.sub=0;drawBattleSprite(document.querySelector('#spFoe'),d);assert.equal(calls.at(-1)[0],'monster');d.sub=10;
 for(const side of ['you','foe']){ME=side;paint();assert.ok(calls.some(c=>c[0]==='doll'));}
 ME='you';assert.equal(JSON.stringify(B),state);assert.equal(_seed,seed,'rendering has no battle RNG');
 drawSprite=normalSprite;drawSubstitute=normalDoll;playFx=normalFx;
 const pixels=[];const cv={width:32,height:32,getContext:()=>({clearRect(){},fillRect(...rect){pixels.push(rect);}})};
 drawSubstitute(cv,'front');const front=JSON.stringify(pixels);pixels.length=0;drawSubstitute(cv,'back');assert.notEqual(JSON.stringify(pixels),front);
 for(const [x,y,w,h] of pixels){assert.ok([x,y,w,h].every(Number.isInteger));assert.ok(x>=0&&y>=0&&x+w<=32&&y+h<=32);}
})()`);
console.log('PASS decoy front/back, restoration, canonical sides, nonmutation; failed/missed/immune moves stay silent and successful effects animate');
