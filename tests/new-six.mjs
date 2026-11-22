import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Real turn resolution with presentation stubs; no browser or live PeerJS transport.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
function world(){
  const storage=new Map();
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
    window:{scrollTo:noop},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  });
  const run=code=>vm.runInContext(code,context,{filename:'flinch-checks',timeout:10_000});
  run(source);
  run(`
    function unit(side){
      const u=makeUnit({id:'homura',moves:['slide','tackle','guard','repose'],equip:'none',ability:'quick'},side);
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
 const ids=['tsurarauchi','shimosura','kamegane','kanippa','hazumimi','robariton'];
 for(const id of ids){const s=spec(id);assert.ok(s);assert.equal(['hp','atk','def','spatk','spdef','spd'].reduce((v,k)=>v+s[k],0),550);assert.equal(ABIL_OF[id].length,2);assert.ok(ABIL_OF[id].every(k=>ABILITIES[k]));const pool=learnable(s);assert.ok(pool.every(k=>MOVES[k]));assert.ok(pool.some(k=>MOVES[k].p>0&&hasType(s.t,MOVES[k].t)));
 for(let i=0;i<100;i++){const b=randomBuildForSpecies(s);assert.equal(b.moves.length,4);assert.equal(new Set(b.moves).size,4);assert.ok(b.moves.every(k=>pool.includes(k)));assert.ok(b.moves.some(k=>MOVES[k].p>0&&hasType(s.t,MOVES[k].t)));const u=makeUnit(b,'you');assert.equal(u.name,s.n);assert.equal(u.boss,false);assert.ok(usefulBuildAbility(b.ability,b.moves,b.equip)||!ABIL_OF[id].some(k=>usefulBuildAbility(k,b.moves,b.equip)));}}
 assert.ok(learnable(spec('kanippa')).includes('kenkenma'));assert.ok(learnable(spec('hazumimi')).includes('jumpKick'));assert.ok(learnable(spec('robariton')).includes('heeHaw'));
 const saved=ids.map(id=>randomBuildForSpecies(spec(id)));for(let i=0;i<6;i+=3){party=saved.slice(i,i+3);saveDraft();assert.equal(JSON.stringify(loadDraft()),JSON.stringify(party));assert.ok(sanitizeTeam(party));}
 let [a,d]=setup();a.ability='snowWarning';onEnter(a);assert.equal(B.weather.kind,'snow');a.ability='snowShovel';assert.equal(SPD(a),200);
`);
console.log('PASS six normal creatures:550 totals, valid types/abilities,600 constrained random builds, STAB, signature learners, save/load and snow synergy');
