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
 const events=[];window.BattlePresentation={ability:(u,key,text,weather)=>events.push({key,text,weather}),item:(u,key,text)=>events.push({key,text,item:true}),ready:()=>Promise.resolve(),settleHP:()=>Promise.resolve()};
 let [a,d]=setup();a.ability='rainBeast';onEnter(a);assert.equal(events.at(-1).key,'rainBeast');assert.equal(events.at(-1).weather.before,null);assert.equal(B.weather.kind,'rain');a.ability='snowWarning';onEnter(a);assert.equal(events.at(-1).weather.before,'rain');assert.equal(B.weather.kind,'snow');
 a.equip='mask';const n=events.length;onEnter(a);assert.equal(events.length,n);
 [a,d]=setup();a.ability='pressure';onEnter(a);assert.ok(events.some(x=>x.key==='pressure'));assert.equal(d.rank.atk,-1);
 d.ability='spite';lowerRank(d,'def',1,a);assert.equal(events.at(-1).key,'spite');assert.equal(d.rank.atk,1);
 d.ability='mirror';lowerRank(d,'def',1,a);assert.equal(events.at(-1).key,'mirror');
 a.equip='charm';a.preHitHp=a.maxhp;a.hp=0;assert.equal(tryCharm(a),true);assert.equal(events.at(-1).key,'charm');assert.equal(events.at(-1).item,true);assert.equal(a.hp,1);
 a.equip='none';a.ability='stoic';a.hp=a.maxhp;inflict(a,'麻痺',d);assert.equal(events.at(-1).key,'stoic');assert.equal(a.status,null);
 for(const key of ['fluid','snowShovel','tempo','blur','ballast','hide','superLegs','minorityWave','armPiece','focus2']){a.ability=key;const count=events.length;SPD(a);ATK(a);SPATK(a);DEF(a);SPDEF(a);assert.equal(events.length,count,key+' is quiet');}
`);
console.log('PASS successful weather/pressure/spite/mirror/stoic/charm cues, masked suppression, and quiet constant modifiers');
