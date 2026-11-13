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




await run(`(async()=>{
 let [a,d]=setup();rng=()=>.5;
 assert.equal(EN_REGEN,12);assert.equal(a.en,100);
 for(const expected of [20,25,30]){assert.equal(enCost(a,'tackle'),expected);await doMove(a,d,'tackle');}
 assert.equal(a.en,25);assert.equal(a.repeatCount,3);assert.equal(a.lastMove,'tackle');
 await doMove(a,d,null);assert.equal(enCost(a,'tackle'),20);assert.equal(a.lastMove,'tackle');
 a.en=100;await doMove(a,d,'tackle');await doMove(a,d,'wildclaw');assert.equal(enCost(a,'tackle'),20);
 a.en=100;await doMove(a,d,'guard');assert.equal(enCost(a,'guard'),60);a.en=100;await doMove(a,d,'guard');assert.equal(enCost(a,'guard'),120);
 [a,d]=setup();rng=()=>.999;await doMove(a,d,'edge');assert.equal(a.repeatCount,1);assert.equal(enCost(a,'edge'),50,'miss costs energy and increments');
 a.en=100;a.status='麻痺';rng=()=>0;await doMove(a,d,'edge');assert.equal(a.repeatCount,1,'paralysis does not increment');
 leaveField(a);assert.equal(enCost(a,'edge'),45);
 [a,d]=setup();a.en=0;await doMove(a,d,null);await endTurn();assert.equal(a.en,37);
 const makeFocus=equip=>makeUnit({id:'doryu',moves:['guard','tackle'],equip,ability:'focus2'},'you');
 a=makeFocus('none');assert.equal(a.en,150);assert.equal(a.maxen,150);assert.equal(makeFocus('mask').en,100);
 B.you[0]=a;a.en=0;await doMove(a,d,null);await endTurn();assert.equal(a.en,62);
 rng=()=>.5;d.focusExposed=false;const normal=damage(d,a,MOVES.tackle).dmg;a.focusExposed=true;assert.equal(damage(d,a,MOVES.tackle).dmg,normal);
 a.equip='mask';syncEnergyCap(a);assert.equal(a.maxen,100);a.en=150;syncEnergyCap(a);assert.equal(a.en,100);a.equip='none';syncEnergyCap(a);assert.equal(a.en,100);assert.equal(a.maxen,150,'unmasking does not refill');
 [a,d]=setup();a.en=0;a.equip='belt';await endTurn();assert.equal(a.en,17);
 [a,d]=setup();a.ability='tempo';a.baseSpd=200;rng=()=>.749;assert.equal(rollFx(a,d,{pr:.5}),true);rng=()=>.75;assert.equal(rollFx(a,d,{pr:.5}),false);d.ability='blur';rng=()=>.375;assert.equal(rollFx(a,d,{pr:.5}),false);
 // Every directed status move and attacks are blocked without applying an effect.
 for(const key of ['coal','sand','parasite','whirl','swap','encore','disable','taunt','tackle','revenge']){
  [a,d]=setup();rng=()=>.1;d.type='無';d.guarding=true;d.lastMove='tackle';a.equip='berry';d.equip='belt';a.dmgTaken=40;
  const initial=a.en;const cost=enCost(a,key);a.en-=cost;const before=statusEffectSnapshot(a,d);a.en=initial;await doMove(a,d,key);assert.equal(statusEffectSnapshot(a,d),before,key+' blocked');assert.equal(a.en,100-MOVES[key].en,key+' cost paid');
 }
 [a,d]=setup();d.guarding=true;a.rank.atk=2;await doMove(a,d,'haze');assert.equal(a.rank.atk,0,'global haze passes guard');
 [a,d]=setup();d.guarding=true;await doMove(a,d,'spikes');assert.equal(B.hazard.foe.rock,true);
 [a,d]=setup();d.guarding=true;await doMove(a,d,'perish');assert.equal(d.perish,3);
 [a,d]=setup();d.guarding=true;await doMove(a,d,'sandbreak');assert.equal(B.weather.kind,'sandstorm');assert.equal(d.hp,1000);d.type='無';await endTurn();assert.ok(d.hp<1000,'weather passes guard');
 // Both speeds yield exactly 3 action opportunities, then release.
 for(const key of ['encore','disable','taunt'])for(const fast of [true,false]){
  [a,d]=setup();a.baseSpd=fast?200:50;d.lastMove='tackle';
  await takeTurn(move(key),move('tackle'));
  const remaining=()=>key==='taunt'?d.tauntTurns:d[key==='disable'?'disabled':'encore']?.turns||0;
  assert.equal(remaining(),fast?2:3,key+' first turn');
  for(let n=remaining();n>0;n--){a.en=100;d.en=100;await takeTurn(move(null),move('tackle'));assert.equal(remaining(),n-1,key+' duration');}
 }
 [a,d]=setup();a.baseSpd=200;d.lastMove='guard';await takeTurn(move('encore'),move('tackle'));assert.equal(d.guarding,false);assert.equal(d.lastMove,'guard');assert.equal(d.encore.turns,2,'previous guard can be encored next turn');
 [a,d]=setup();a.baseSpd=200;await takeTurn(move('encore'),move('guard'));assert.equal(d.encore,null,'priority guard blocks encore');
})()`);
console.log('PASS v18 energy, repetition, focus, guard scope, weather and equal restriction durations');
