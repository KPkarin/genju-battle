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
assert.equal(MOVES.tackle.p,55);assert.equal(MOVES.tackle.en,20);
assert.equal(MOVES.rock.p,60);assert.equal(MOVES.gravel.en,25);assert.equal(MOVES.gravel.fx,'defdown');
for(const [low,high,rate,cost] of [['ember','flame',.2,15],['squirt','aqua',.35,20],['spark','bolt',.25,20],['gust','blast',.3,20]]){
 assert.equal(MOVES[low].pr,rate);assert.equal(MOVES[low].en,cost);
 assert.ok(MOVES[low].pr>MOVES[high].pr);assert.ok(MOVES[low].en<MOVES[high].en);
}
assert.equal(MOVES.flame.pr,.1);
`);
await run(`(async()=>{
 for(const [roll,expected] of [[0,true],[.499999,true],[.5,false],[.999999,false]]){
  const [a,d]=setup();B.hazard.foe.sand=true;fixedRandom(roll);await applyHazards(d);
  assert.equal(d.status==='麻痺',expected,'50% hazard boundary '+roll);
 }
 for(const type of ['空','地','雷']){const [a,d]=setup();d.type=type;B.hazard.foe.sand=true;fixedRandom(0);await applyHazards(d);assert.equal(d.status,null);}
 for(const protection of ['none','shield','mirror']){
  const [a,d]=setup();d.type='水';if(protection==='shield')d.sub=100;if(protection==='mirror')d.ability='mirror';
  fixedRandom(.5);await doMove(a,d,'gravel');assert.equal(d.rank.def,protection==='none'?-1:0);
 }
 for(const key of ['tackle','ember','gravel','crushrock','phantom','revenge']){
  const [a,d]=setup();d.sub=50;d.guarding=true;d.equip='thorn';a.dmgTaken=40;a.hp=500;fixedRandom(.01);
  await doMove(a,d,key);assert.equal(d.hp,1000,key);assert.equal(d.sub,50,key+': protected shield');assert.equal(d.status,null);assert.equal(d.rank.def,0);assert.equal(d.en,100);assert.equal(a.hp,500,'blocked attacks cause no thorn damage');
 }
 {
  const [a,d]=setup();fixedRandom(.5);await takeTurn({kind:'move',key:'guard'},{kind:'move',key:'startle'});
  assert.equal(a.hp,1000);assert.equal(a.rank.atk,0);assert.equal(a.guardStreak,1,'guard executes despite faster startle');
  assert.equal(a.actionCancelled,false);assert.equal(a.en,100-MOVES.guard.en+EN_REGEN);
  assert.equal(enCost(a,'guard'),50,'consecutive cost stays doubled');
 }
 for(const speed of [50,200]){
  let [a,d]=setup();a.baseSpd=speed;d.baseSpd=100;fixedRandom(.5);
  await takeTurn({kind:'move',key:'focus'},{kind:'move',key:'tackle'});const normal=1000-a.hp;
  [a,d]=setup();a.baseSpd=speed;d.baseSpd=100;fixedRandom(.5);
  await takeTurn({kind:'move',key:null},{kind:'move',key:'tackle'});const exposed=1000-a.hp;
  assert.ok(exposed>=normal*1.2-1&&exposed<=normal*1.2+1,'focus risk before/after action at speed '+speed);
  assert.equal(a.focusExposed,false,'focus risk expires at turn end');const before=a.hp;
  await takeTurn({kind:'move',key:'focus'},{kind:'move',key:'tackle'});assert.equal(before-a.hp,normal,'risk cannot persist');
 }
 {
  const [a,d]=setup();a.focusExposed=true;a.status='やけど';await endTurn();assert.equal(a.hp,1000-Math.floor(1000/16),'burn is not amplified');
  d.focusExposed=true;a.dmgTaken=20;fixedRandom(.5);await doMove(a,d,'revenge');assert.equal(d.hp,1000-36,'fixed retaliation uses focus risk');
 }
 restoreRandom();
})()`);
const host=world(),guest=world();for(const w of [host,guest])w.run('setup();setSeed(715199);');guest.run("ME='foe'");
for(const [a,b] of [['guard','startle'],[null,'gravel'],['ember',null],['gust','spark']]){
 await host.run('takeTurn('+JSON.stringify({kind:'move',key:a})+','+JSON.stringify({kind:'move',key:b})+')');
 await guest.run('takeTurn('+JSON.stringify({kind:'move',key:b})+','+JSON.stringify({kind:'move',key:a})+')');
 assert.deepEqual(host.json('({you:B.you,foe:B.foe,turn:B.turn,seed:_seed})'),guest.json('({you:B.you,foe:B.foe,turn:B.turn,seed:_seed})'));
}
console.log('PASS new move data and niches, 50% hazard boundaries/immunities, guaranteed defense drop/protection, complete guard/startle/counter/secondary protection, focus risk before and after acting, expiry, burn, and host/guest determinism');
