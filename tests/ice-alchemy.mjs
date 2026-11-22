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
 let [a,d]=setup();rng=()=>.5;a.ability=d.ability='grit';
 assert.equal(TYPES.length,13);assert.equal(eff('岩','氷'),2);assert.equal(eff('岩','雷'),1);assert.equal(eff('野','草'),1);assert.equal(eff('野','雷'),1);assert.equal(eff('野','影'),2);assert.equal(eff('影','野'),.5);
 for(const t of ['炎','氷']){d.type=t;assert.equal(inflict(d,'凍結',a),false);}d.type='無';assert.equal(inflict(d,'凍結',a),true);assert.equal(d.freezeTurns,2);await doMove(d,a,'tackle');assert.equal(a.hp,1000);await endTurn();assert.equal(d.freezeTurns,1);await endTurn();assert.equal(d.status,null);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.3;await doMove(a,d,'iceMake');assert.equal(d.status,null);a.en=100;await doMove(a,d,'iceMake');assert.equal(d.status,'凍結');assert.equal(a.iceHits[0].count,2);
 d.status=null;a.en=100;rng=()=>.99;await doMove(a,d,'iceMake');assert.equal(d.status,'凍結');assert.equal(a.iceHits[0].count,3);
 d.sub=100;await doMove(d,a,'tackle');assert.equal(a.hp,1000);d.sub=0;a.en=100;await doMove(a,d,'ember');assert.equal(d.status,null);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.99;inflict(d,'凍結',a);assert.equal(d.freezeTurns,3);rng=()=>.1;await doMove(a,d,'tackle');assert.equal(d.status,null,'ordinary body hit thaws with 20 percent chance');
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.99;inflict(d,'凍結',a);rng=()=>.1;d.sub=100;await doMove(a,d,'ember');assert.equal(d.status,'凍結','substitute prevents fire thaw');
 [a,d]=setup();a.ability=d.ability='grit';a.baseAtk=10;a.baseSpd=200;assert.equal(moveAttack(a,MOVES.headlong),200);a.rank.atk=6;assert.equal(moveAttack(a,MOVES.headlong),200);a.rank.spd=1;assert.equal(moveAttack(a,MOVES.headlong),300);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;a.en=100;await doMove(a,d,'pincer');d.en=100;const before=B.fi;await doMove(d,a,'pivot');assert.equal(B.fi,before,'pincer also blocks pivot');
 [a,d]=setup();a.ability=d.ability='grit';a.type='氷';a.ability='snowWarning';onEnter(a);assert.equal(B.weather.kind,'snow');assert.equal(B.weather.turns,5);assert.equal(DEF(a),150);a.ability='snowShovel';assert.equal(SPD(a),200);a.equip='mask';assert.equal(SPD(a),100);assert.equal(DEF(a),150);a.equip='none';
 [a,d]=setup();a.ability=d.ability='grit';await doMove(a,d,'snowball');assert.equal(a.rank.spatk,1);assert.equal(d.rank.atk,-1);await endTurn();assert.equal(a.rank.spd,-1);assert.equal(d.rank.spd,-1);a.en=100;await doMove(a,d,'tackle');assert.equal(d.snowball,false);await endTurn();assert.equal(d.rank.spd,-1);assert.equal(a.rank.spd,-2);
 [a,d]=setup();a.ability=d.ability='grit';d.guarding=true;await doMove(a,d,'alarmBell');assert.equal(d.rank.atk,0);d.guarding=false;d.sub=10;a.en=100;await doMove(a,d,'alarmBell');assert.equal(d.rank.eva,0);d.sub=0;a.en=100;await doMove(a,d,'alarmBell');assert.equal(d.rank.atk,-1);assert.equal(d.rank.eva,-1);
 [a,d]=setup();a.ability=d.ability='grit';d.bindTurns=1;d.boundBy=a;await doMove(a,d,'pincer');assert.ok(isBound(d));await endTurn();assert.ok(isBound(d),'pincer supersedes a timed bind');leaveField(a);assert.equal(isBound(d),false);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;await doMove(a,d,'kenkenma');assert.equal(a.en,0);assert.equal(a.combo,1);assert.equal(a.rank.def,1);assert.equal(d.hp,1000);assert.equal(forcedAction(a,{kind:'switch'}).key,'kenkenma');await doMove(a,d,'kenkenma');assert.equal(a.en,0);assert.equal(a.rank.atk,1);assert.equal(a.combo,2);await doMove(a,d,'kenkenma');assert.equal(a.en,0);assert.equal(a.combo,0);assert.equal(a.rank.eva,3);assert.ok(d.hp<1000);assert.equal(a.hitsThisTurn,2);
 [a,d]=setup();a.ability=d.ability='grit';d.plannedMove='kenkenma';await doMove(a,d,'ambush');assert.equal(d.hp,1000);a.en=100;d.combo=2;await doMove(a,d,'ambush');assert.ok(d.hp<1000);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;const ordinary=damage(a,d,MOVES.jumpKick).dmg;d.usedStatusTurn=B.turn;assert.ok(damage(a,d,MOVES.jumpKick).dmg>ordinary);a.ability='superLegs';assert.ok(damage(a,d,MOVES.jumpKick).dmg>ordinary*2.5);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;const raw=damage(d,a,MOVES.tackle).dmg;await doMove(a,d,'runUp');assert.equal(a.rank.spd,1);assert.ok(damage(d,a,MOVES.tackle).dmg<=raw/2+1);await endTurn();assert.equal(a.runUp,false);
 [a,d]=setup();a.ability=d.ability='grit';a.rank.acc=-6;d.rank.eva=6;rng=()=>.99;await doMove(a,d,'headlong');assert.equal(a.headlongLock,true);assert.equal(a.rank.spd,1);assert.ok(moveBlocked(a,'tackle'));leaveField(a);assert.equal(a.headlongLock,false);
 [a,d]=setup();a.ability='minorityWave';d.ability='lowVoice';await doMove(a,d,'heeHaw');assert.equal(d.hp,1000);d.sub=100;await doMove(a,d,'alarmBell');assert.equal(d.rank.atk,0);
 [a,d]=setup();a.ability=d.ability='grit';a.hp=500;await doMove(a,d,'heeHaw');assert.ok(a.hp>500);
 [a,d]=setup();a.ability='armPiece';d.ability='grit';rng=()=>.5;const first=damage(a,d,MOVES.crushrock).dmg;a.hitsThisTurn=1;assert.ok(damage(a,d,MOVES.crushrock).dmg>first);
})()`);console.log('PASS ice/alchemy types, freeze, snow, snowball, sound immunity, traps, three-turn sequence, ambush, speed damage, kick and multihit abilities');
