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
const contact=['wildfang','wildclaw','firefang','waterfang','thunderclaw','tackle','ambush','revenge','vine','pivot','dive','devour'];
for(const [key,m] of Object.entries(MOVES)){
 assert.equal(typeof m.contact,'boolean',key+': explicit classification');
 assert.equal(isContactMove(m),contact.includes(key),key);
 if(m.category!=='physical')assert.equal(m.contact,false);
 if(!isStatusMove(m))assert.ok(moveBadge(m).includes(isContactMove(m)?'接触':'非接触'));
}
assert.equal(isContactMove({...MOVES.ember,contact:true}),false,'special moves cannot become contact accidentally');
`);
await run(`(async()=>{
 const normalDecide=decideSwitch;decideSwitch=async(side,seq,alive)=>alive[0].i;
 for(const key of Object.keys(MOVES).filter(k=>!isStatusMove(MOVES[k]))){
  const [a,d]=setup();a.hp=500;a.maxhp=1000;a.dmgTaken=10;d.maxhp=d.hp=1000;d.type='水';d.equip='thorn';d.plannedMove=key==='ambush'?'tackle':'focus';fixedRandom(.1);fixedDamage(10);
  await doMove(a,d,key);
  if(['wildfang','wildclaw','firefang','waterfang','thunderclaw','tackle','ambush','revenge','vine','pivot','dive','devour'].includes(key)){
   // Every successful body-contact move triggers the same reaction.
   assert.ok(a.hp<500+(key==='vine'?3:key==='devour'?5:0),key+': contact retaliates');
  }else if(key!=='inferno')assert.equal(a.hp,500,key+': ranged does not trigger poison');
  restoreRandom();
 }
 for(const mode of ['shield','guard','miss','ghost']){
  const [a,d]=setup();a.hp=500;d.equip='thorn';fixedRandom(mode==='miss'?.999:.1);fixedDamage(10);
  if(mode==='shield')d.sub=100;if(mode==='guard')d.guarding=true;
  if(mode==='miss')d.rank.eva=6;if(mode==='ghost')a.ability='ghost';
  await doMove(a,d,'tackle');assert.equal(a.hp,500,mode+': no thorn loss');restoreRandom();
 }
 {
  const [a,d]=setup();a.hp=500;a.dmgTaken=10;a.ability='ghost';d.equip='thorn';fixedRandom(.1);await doMove(a,d,'revenge');assert.equal(a.hp,500,'fixed contact retaliation respects indirect immunity');restoreRandom();
 }
 for(const hp of [1000,999,500]){
  const [a,d]=setup();d.equip='charm';d.hp=hp;fixedRandom(.1);fixedDamage(2000);
  await doMove(a,d,'tackle');assert.equal(d.hp,hp===1000?1:hp-2000,'full HP survival boundary '+hp);assert.equal(d.charmUsed,hp===1000);restoreRandom();
 }
 {
  const [a,d]=setup();d.equip='charm';fixedRandom(.1);fixedDamage(600);
  await doMove(a,d,'tackle');assert.equal(d.hp,400);assert.equal(d.charmUsed,false);
  a.en=100;await doMove(a,d,'tackle');assert.ok(d.hp<=0);assert.equal(d.charmUsed,false,'a later lethal hit cannot activate from damaged HP');restoreRandom();
 }
 {
  const [a,d]=setup();d.equip='charm';d.hp=999;hurt(d,2000);assert.equal(tryCharm(d),false);d.hp=1000;hurt(d,2000);assert.equal(tryCharm(d),true);hurt(d,2000);assert.equal(tryCharm(d),false,'only one use');
 }
 {
  const [a,d]=setup();d.equip='charm';d.maxhp=d.hp=40;fixedRandom(.9);fixedDamage(50);await doMove(a,d,'crushrock');assert.ok(d.hp<=0);assert.equal(damageRecords.length,2,'later hits still KO a full-HP survivor');restoreRandom();
 }
 decideSwitch=normalDecide;
})()`);
console.log('PASS all 62 contact flags, physical/ranged/special separation, thorn contact-only reaction and protection, fixed retaliation immunity, full-HP charm boundary, recovery, one-use and multi-hit continuation');
