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
run(`
const agreed=[
[.5,.5,2,1,.5,2,.5,1,1,2,1],[2,.5,.5,.5,2,1,2,1,1,.5,1],
[.5,2,.5,1,2,.5,2,.5,1,.5,1],[1,2,.5,.5,.5,1,0,2,2,1,1],
[2,.5,.5,2,1,1,.5,2,1,1,1],[1,1,2,1,1,.5,1,1,1,.5,2],
[2,.5,.5,2,2,1,1,0,1,.5,1],[.5,1,2,1,1,1,1,.5,1,2,1],
[1,1,1,1,1,2,1,1,.5,1,0],[1,1,2,.5,.5,2,1,.5,.5,2,1],
[1,1,1,1,1,1,1,1,0,1,1]];
const order=['炎','水','草','雷','岩','影','地','空','幻','野','無'];
assert.equal(TYPES.join(),order.join());
setup();
for(let a=0;a<11;a++)for(let d=0;d<11;d++){
 assert.equal(eff(order[a],order[d]),agreed[a][d],order[a]+'/'+order[d]);
 B.reverseTurns=3;
 assert.equal(attackEff(order[a],order[d]),agreed[a][d]===0?4:1/agreed[a][d]);
 B.reverseTurns=0;
}
assert.equal(Object.values(TYPE_NAMES).join(),'火炎,流水,草木,雷電,岩石,暗闇,大地,天空,幽玄,野生,無属性');
for(const t of TYPES){assert.ok(TYPE_SYMBOLS[t]);assert.ok(chip(t).includes('<svg'));assert.ok(chip(t).includes(typeName(t)));}
assert.equal(SPECIES.slice(0,18).map(s=>s.t).join(),'炎,水,草,雷,岩,影,地,空,炎,水,草,雷,岩,影,地,空,幻,幻');
assert.ok(learnable(spec('homura')).includes('wildfang'));
assert.ok(learnable(spec('raitachi')).includes('wildclaw'));
assert.ok(!learnable(spec('shiogame')).includes('wildclaw'));
assert.ok(learnable(spec('homura')).includes('firefang'));
party=[{id:'homura',moves:[],equip:'none',ability:'stoic'}];
GameUI.edit(0);
const markup=n=>(n.innerHTML||'')+(n.children||[]).map(markup).join('');
assert.ok(markup(document.querySelector('#modalBody')).includes('かみつく'),'motif-based wild moves appear in the actual editor');
GameUI.close();
renderChart();
assert.ok(document.querySelector('#chartBox').innerHTML.includes('✕'));
assert.ok(document.querySelector('#chartBox').innerHTML.includes('○'));
assert.ok(document.querySelector('#chartBox').innerHTML.includes('△'));
`);
await run(`(async()=>{
 const [a,d]=setup();fixedRandom(.5);d.type='幻';
 assert.equal(damage(a,d,MOVES.tackle).dmg,0);
 B.reverseTurns=3;assert.equal(damage(a,d,MOVES.tackle).e,4);
 B.reverseTurns=0;d.type='野';
 assert.equal(damage(a,d,MOVES.wildfang).e,2);
 a.en=100;d.hp=1000;await doMove(a,d,'wildfang');assert.ok(d.hp<1000);
})()`);
console.log('PASS agreed 121 matchups, reverse room, eleven named SVG symbols, legacy species and learned moves, wild damage and chart labels');
