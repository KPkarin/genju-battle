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
      u.type='無';u.maxhp=u.hp=1000;u.baseAtk=u.baseSpAtk=u.baseDef=u.baseSpDef=100;u.baseSpd=100;
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
run(`
const oldTypes={barrier:'無',sand:'無',ambush:'無',startle:'無',gravel:'地',root:'地',pivot:'空',swap:'幻',taunt:'影',bond:'影',night:'影'};
const newTypes={barrier:'幻',sand:'地',ambush:'影',startle:'野',gravel:'岩',root:'草',pivot:'野',swap:'無',taunt:'無',bond:'幻',night:'幻'};
const common=['meditate','barrier','tackle','guard','focus','sand','ambush','startle','sub','repose','revenge'];
for(const [k,t] of Object.entries(newTypes))assert.equal(MOVES[k].t,t,k);
for(const sp of SPECIES){
 const oldPool=Object.keys(MOVES).filter(k=>common.includes(k)||[sp.t,sp.aff].includes(oldTypes[k]||MOVES[k].t)||(WILD_LEARNERS[k]||[]).includes(sp.id)).filter(k=>!MOVES[k].own||(oldTypes[k]||MOVES[k].t)===sp.t);
 const current=learnable(sp);assert.equal(new Set(current).size,current.length);
 for(const k of oldPool)assert.ok(current.includes(k),sp.id+' retains '+k);
 const draft={id:sp.id,moves:oldPool.slice(0,4),equip:'none',ability:ABIL_OF[sp.id][0]};
 assert.equal(JSON.stringify(normalizeDraft([draft])[0]),JSON.stringify(draft));
}
assert.ok(!learnable(spec('homura')).includes('taunt'),'neutral classification does not make taunt universal');
assert.ok(!learnable(spec('homura')).includes('swap'),'neutral classification does not make swap universal');
assert.ok(learnable(spec('mubaku')).includes('swap'));
assert.ok(learnable(spec('fukurou')).includes('night'));
assert.ok(learnable(spec('gako')).includes('pivot'));
assert.ok(learnable(spec('kokejyu')).includes('root'));
assert.equal(MOVES.meditate.t,'無');assert.equal(MOVES.perish.t,'幻');
setup();const a=YOU(),d=FOE();a.ability=d.ability='focus2';a.type='幻';d.type='無';
assert.equal(damage(a,d,MOVES.night).dmg,0,'nightmare now follows spirit immunity');
d.type='草';setSeed(1198);const normal=damage({...a,type:'無'},d,MOVES.night);setSeed(1198);assert.ok(damage(a,d,MOVES.night).dmg>normal.dmg,'ghost STAB follows retyped move');
`);
console.log('PASS eleven type changes, all twenty legacy learnsets/drafts retained, no duplicate or universalized utility moves, new motif access, immunity and STAB');
