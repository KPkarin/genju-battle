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




await run(`(async()=>{
 let [a,d]=setup();rng=()=>.5;
 assert.equal(MOVES.sandbreak.p,50);assert.equal(MOVES.sandbreak.en,35);assert.equal(MOVES.sandbreak.pr,.3);assert.equal(MOVES.sandbreak.category,'special');assert.equal(MOVES.sandbreak.explosion,true);assert.equal(MOVES.seed.explosion,true);
 for(const key of ['flame','tackle','wildrock','steamchoice','windmantle'])assert.equal(MOVES[key].explosion,false);
 assert.equal(MOVES.windmantle.en,50);assert.equal(MOVES.windmantle.category,'status');assert.equal(MOVES.windmantle.pri||0,0);
 await doMove(a,d,'sandbreak');assert.equal(a.en,65);assert.equal(B.weather.kind,'sandstorm');assert.equal(B.weather.turns,5);
 for(const reason of ['guard','immune','miss']){
  [a,d]=setup();if(reason==='guard')d.guarding=true;if(reason==='immune')d.type='空';if(reason==='miss'){a.rank.acc=-6;rng=()=>.99;}
  await doMove(a,d,'sandbreak');assert.equal(d.hp,1000,reason);assert.equal(B.weather.turns,5,reason+' still starts sand on use');
 }
 for(const reason of ['energy','cancelled','rest','disabled']){
  [a,d]=setup();if(reason==='energy')a.en=0;if(reason==='cancelled')a.actionCancelled=true;if(reason==='rest')a.restTurns=1;if(reason==='disabled')a.disabled={key:'sandbreak',turns:2};
  await doMove(a,d,'sandbreak');assert.equal(B.weather,undefined,reason+' never executes the move');
 }
 [a,d]=setup();rng=()=>.5;
 for(const type of TYPES){a.type=type;a.maxhp=160;a.hp=100;applySandstorm(a);assert.equal(a.hp,['地','岩'].includes(type)?100:90,type);}
 for(const type of [['岩','水'],['地','草'],['空','地']]){a.type=type;a.hp=100;applySandstorm(a);assert.equal(a.hp,100);}
 a.type='空';a.hp=100;a.guarding=true;a.sub=50;applySandstorm(a);assert.equal(a.hp,90);assert.equal(a.sub,50);
 a.ability='ghost';a.hp=100;applySandstorm(a);assert.equal(a.hp,100);a.equip='mask';applySandstorm(a);assert.equal(a.hp,90);
 a.hp=0;applySandstorm(a);assert.equal(a.hp,0);
 [a,d]=setup();a.type='地';d.type='水';a.hp=a.maxhp=d.hp=d.maxhp=1600;B.weather={kind:'sandstorm',turns:5};const reserve=B.you[1];reserve.hp=333;
 for(let i=0;i<5;i++){await endTurn();assert.equal(d.hp,1500-i*100);assert.equal(a.hp,1600);assert.equal(reserve.hp,333);}
 assert.equal(B.weather,null);await endTurn();assert.equal(d.hp,1100,'five ticks then expires');
 B.weather={kind:'shower',turns:4};a.en=100;await doMove(a,d,'sandbreak');assert.equal(B.weather.kind,'sandstorm');assert.equal(B.weather.turns,5);
 a.en=100;await doMove(a,d,'unwantedshower');assert.equal(B.weather.kind,'shower');assert.equal(SPDEF(d),100,'weather replacement removes sand modifiers');
 [a,d]=setup();a.ability='hani';a.type=['地','空'];assert.equal(DEF(a),100);assert.equal(SPDEF(a),100);
 B.weather={kind:'sandstorm',turns:5};assert.equal(DEF(a),150);assert.equal(SPDEF(a),150);
 a.type=['岩','地'];assert.equal(SPDEF(a),225,'rock and trait bonuses multiply');
 a.equip='mask';assert.equal(DEF(a),100);assert.equal(SPDEF(a),150,'mask only removes trait, not rock weather bonus');
 a.equip='none';d.ability='breaker';assert.equal(DEF(a,d),100);assert.equal(SPDEF(a,d),150);
 a.type=['地','空'];assert.equal(SPDEF(a,d),100);
 d.ability='focus2';rng=()=>.599;assert.equal(rollFx(a,d,MOVES.sandbreak),true);rng=()=>.6;assert.equal(rollFx(a,d,MOVES.sandbreak),false);
 a.equip='mask';rng=()=>.4;assert.equal(rollFx(a,d,MOVES.sandbreak),false);a.equip='none';B.weather=null;assert.equal(rollFx(a,d,MOVES.sandbreak),false);
 // New flinch uses the actual turn's remaining actors only.
 [a,d]=setup();a.baseSpd=200;d.baseSpd=50;a.type='地';d.type='岩';rng=()=>.1;
 await takeTurn(move('sandbreak'),move('tackle'));assert.equal(d.lastMove,null);assert.equal(d.flinch,false);
 [a,d]=setup();a.baseSpd=50;d.baseSpd=200;a.type='地';d.type='岩';rng=()=>.1;
 await takeTurn(move('sandbreak'),move('tackle'));assert.equal(d.lastMove,'tackle');assert.equal(d.flinch,false);
 const hp=a.hp;await takeTurn(move(null),move('tackle'));assert.ok(a.hp<hp,'late sandbreak cannot flinch on the following turn');

 [a,d]=setup();rng=()=>.5;await doMove(d,a,'windmantle');assert.equal(d.en,50);assert.equal(d.windMantle,true);
 a.baseSpAtk=180;a.baseSpDef=50;d.baseSpAtk=10000;d.baseSpDef=10000;
 const expected=damage(a,a,{...MOVES.flame,p:40}).dmg,oldHP=a.hp;
 await doMove(a,d,'flame');assert.equal(d.hp,1000);assert.equal(a.hp,oldHP-expected,'reflection uses original caster offense and its own defense');assert.equal(d.windMantle,false);assert.equal(a.status,null,'reflection has no burn');assert.equal(a.en,65);
 d.baseSpDef=100;const before=d.hp;a.en=100;await doMove(a,d,'flame');assert.ok(d.hp<before,'wind is consumed once');
 for(const key of ['tackle','sand','guard']){
  [a,d]=setup();d.windMantle=true;rng=()=>.5;await doMove(a,d,key);assert.equal(d.windMantle,true,key+' does not consume wind');
 }
 for(const reason of ['guard','energy','para','failed-startle']){
  [a,d]=setup();d.windMantle=true;rng=()=>.5;
  if(reason==='guard')d.guarding=true;if(reason==='energy')a.en=0;if(reason==='para'){a.status='麻痺';rng=()=>0;}
  d.plannedMove='tackle';await doMove(a,d,reason==='failed-startle'?'startle':'flame');assert.equal(d.windMantle,true,reason);
 }
 [a,d]=setup();d.windMantle=true;a.rank.acc=1;rng=()=>.2;
 await doMove(a,d,'flame');assert.ok(d.hp<1000,'boosted accuracy can still hit after minus 100 points');assert.equal(a.hp,1000);assert.equal(d.windMantle,false);
 [a,d]=setup();d.windMantle=true;a.windMantle=true;rng=()=>0;await doMove(a,d,'flame');assert.equal(d.hp,1000,'zero percent never hits, even at RNG zero');assert.equal(a.windMantle,true,'reflections cannot recurse');
 [a,d]=setup();d.windMantle=true;MOVES.sureTest={...MOVES.flame,acc:null};rng=()=>.5;await doMove(a,d,'sureTest');assert.ok(d.hp<1000);assert.equal(d.windMantle,false,'a sure hit consumes the next-special shield without reflecting');delete MOVES.sureTest;
 [a,d]=setup();d.windMantle=true;d.equip='mask';rng=()=>.5;await doMove(a,d,'flame');assert.ok(a.hp<1000,'mask cannot disable a move-created wind mantle');
 [a,d]=setup();d.windMantle=true;a.type='地';rng=()=>.5;await doMove(a,d,'thunder');assert.equal(a.hp,1000,'reflection retains elemental immunity');
 [a,d]=setup();d.windMantle=true;d.type='草';a.type='水';rng=()=>.5;
 const realDamage=damage;let reflectedMove;damage=(att,def,m)=>{if(att===def)reflectedMove=m;return realDamage(att,def,m);};
 await doMove(a,d,'steamchoice');assert.equal(reflectedMove.t,'炎');assert.equal(reflectedMove.p,50);assert.equal(reflectedMove.fixedType,true);damage=realDamage;assert.equal(MOVES.steamchoice.t,'水');
 [a,d]=setup();d.windMantle=true;a.ability='steamtank';a.hp=500;rng=()=>.5;await doMove(a,d,'squirt');assert.ok(a.hp>500);assert.equal(a.rank.spd,0);
 [a,d]=setup();d.windMantle=true;a.sub=20;d.sub=30;rng=()=>.5;await doMove(a,d,'flame');assert.equal(a.hp,1000);assert.ok(a.sub<20);assert.equal(d.sub,30);
 [a,d]=setup();d.windMantle=true;a.maxhp=a.hp=10;a.baseSpAtk=10000;a.baseSpDef=1;a.equip='charm';rng=()=>.5;await doMove(a,d,'flame');assert.equal(a.hp,1);assert.equal(a.charmUsed,true);
 [a,d]=setup();d.windMantle=true;leaveField(d);assert.equal(d.windMantle,false);

 party=randBuild().map(x=>({...x,equip:'none'}));startChallenge('sarandi');let boss=FOE();assert.equal(boss.hp,480);assert.equal(boss.boss,true);assert.equal(hasType(boss,'地'),true);assert.equal(hasType(boss,'空'),true);assert.equal(boss.ability,'hani');assert.equal(SPECIES.length,20);
 rng=()=>.5;assert.equal(aiChoose().key,'sandbreak');await doMove(boss,YOU(),'sandbreak');assert.equal(B.weather.kind,'sandstorm');
 boss.en=100;boss.windInterruptedBy=battleUnitKey(YOU());YOU().lastMove='flame';assert.notEqual(aiChoose().key,'windmantle','observed startle does not cause a new wind-setup loop');
 startChallenge(challengeMode);assert.equal(FOE().windMantle,false);assert.equal(B.weather,null);
})()`);
console.log('PASS Sarandi: sand-on-use, five turns, chip immunities, rock/trait defense and mask/breaker, doubled effects, early/late flinch, wind accuracy/consumption/half-power self-reflection and challenge AI/rematch');
