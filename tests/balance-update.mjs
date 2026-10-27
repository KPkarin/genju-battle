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
const w=world();
const run=w.run;

run(`
  setup();
  assert.equal(CHART['無']['空'],1,'neutral no longer has an immunity against air');
  assert.equal(eff('無','空'),1,'the static type chart also shows neutral against air');
  const [a,d]=setup();d.type='空';fixedRandom(.5);
  const neutralHit=damage(a,d,MOVES.tackle);
  assert.equal(neutralHit.e,1);assert.ok(neutralHit.dmg>0,'a neutral move damages air');
  restoreRandom();
  assert.equal(MOVES.crushrock.n,'粉砕岩');assert.equal(MOVES.crushrock.t,'岩');
  assert.equal(MOVES.crushrock.category,'physical');assert.equal(MOVES.crushrock.p,20);
  assert.ok(learnable(spec('iwaushi')).includes('crushrock'),'rock species learn the multi-hit move');
  assert.ok(learnable(spec('homura')).includes('crushrock'),'rock affinity also learns the multi-hit move');
  assert.equal(MOVES.reverseRoom.n,'アベコベルーム');assert.equal(MOVES.reverseRoom.t,'幻');
  assert.equal(MOVES.reverseRoom.category,'status');
  assert.ok(learnable(spec('oborogi')).includes('reverseRoom'),'phantom species learn the room');
  const distribution=[0,0,0,0];
  setSeed(123457);const before=_seed;
  for(let n=0;n<10000;n++)distribution[chooseHitCount((n+.5)/10000)-2]++;
  assert.equal(JSON.stringify(distribution),JSON.stringify([3500,3500,1500,1500]),'exact 35/35/15/15 allocation');
  for(const [roll,count] of [[0,2],[.349999999,2],[.35,3],[.699999999,3],[.7,4],[.849999999,4],[.85,5],[.999999999,5]])
    assert.equal(chooseHitCount(roll),count,'hit-count boundary '+roll);
  assert.equal(_seed,before,'explicit hit-count rolls do not consume battle RNG');
`);
console.log('PASS neutral versus air, new move data/learning, and exact multi-hit probability boundaries');

await run(`(async()=>{
  for(const roll of [.01,.5,.75,.9]){
    const [a,d]=setup();fixedRandom(roll);
    globalThis.damageRecords=[];
    damage=(...args)=>{const result=normalDamage(...args);damageRecords.push(result);return result;};
    const hits=chooseHitCount(roll),before=d.hp;
    await doMove(a,d,'crushrock');
    assert.equal(damageRecords.length,hits,'rolled '+hits+' separate damage calculations');
    assert.equal(randomCalls,2+hits*2,'one accuracy roll, one count roll, independent critical/spread for each hit');
    assert.equal(a.en,100-MOVES.crushrock.en,'energy is charged once for the whole move');
    assert.equal(d.hp,before-damageRecords.reduce((sum,r)=>sum+r.dmg,0),'every hit is applied');
    assert.equal(d.dmgTaken,before-d.hp,'counter records the actual total body damage');
    restoreRandom();
  }
  {
    const [a,d]=setup();const sequence=[.1,.9,.01,.5,.5,.5,.01,.5,.5,.5,.01,.5];
    globalThis.damageRecords=[];rng=()=>{assert.ok(sequence.length,'no unexpected random rolls');return sequence.shift();};
    damage=(...args)=>{const result=normalDamage(...args);damageRecords.push(result);return result;};
    await doMove(a,d,'crushrock');
    assert.equal(JSON.stringify(damageRecords.map(r=>r.crit)),JSON.stringify([true,false,true,false,true]),'critical hits roll separately');
    assert.equal(sequence.length,0);restoreRandom();
  }
  {
    const [a,d]=setup();d.rank.eva=6;fixedRandom(.9);fixedDamage();
    await doMove(a,d,'crushrock');
    assert.equal(damageRecords.length,0,'a missed multi-hit move has no successful hits');
    assert.equal(randomCalls,1,'a miss rolls accuracy once and does not roll count/damage');
    assert.equal(a.en,100-MOVES.crushrock.en,'a missed move still pays energy only once');
    restoreRandom();
  }
  for(const [shield,expectedBody,expectedShield] of [[100,0,50],[15,30,0],[1,40,0]]){
    const [a,d]=setup();d.sub=shield;fixedRandom(.9);fixedDamage(10);
    await doMove(a,d,'crushrock');
    assert.equal(damageRecords.length,5);assert.equal(d.hp,1000-expectedBody,'remaining hits reach body only after shield breaks');
    assert.equal(d.sub,expectedShield,'shield damage does not overflow the breaking hit');
    assert.equal(d.dmgTaken,expectedBody,'counter excludes damage absorbed by a substitute');
    restoreRandom();
  }
  {
    const [a,d]=setup();d.hp=15;fixedRandom(.9);fixedDamage(10);
    await doMove(a,d,'crushrock');
    assert.equal(damageRecords.length,2,'stop hits as soon as the defender faints');
    assert.equal(d.dmgTaken,15,'overkill cannot inflate recorded damage');
    assert.ok(d.hp<=0);restoreRandom();
  }
  {
    const [a,d]=setup();a.hp=15;d.maxhp=d.hp=200;d.equip='thorn';fixedRandom(.9);fixedDamage(10);
    await doMove(a,d,'crushrock');
    assert.equal(damageRecords.length,2,'stop hits if contact recoil defeats the attacker');
    assert.equal(d.hp,180);assert.ok(a.hp<=0);restoreRandom();
  }
  {
    const [a,d]=setup();a.hp=50;d.sub=100;d.equip='thorn';fixedRandom(.9);fixedDamage(10);
    await doMove(a,d,'crushrock');assert.equal(a.hp,50,'substitute-only hits do not trigger body-contact thorn');restoreRandom();
  }
  {
    const [a,d]=setup();d.maxhp=d.hp=40;d.equip='charm';fixedRandom(.9);fixedDamage(50);
    await doMove(a,d,'crushrock');
    assert.equal(damageRecords.length,2,'a survival charm does not stop later hits');
    assert.equal(d.charmUsed,true,'the charm can activate on the first lethal hit');
    assert.ok(d.hp<=0,'the next hit can knock out the one-HP survivor');restoreRandom();
  }
  {
    const [a,d]=setup();B.you=[a];B.foe=[d];a.baseSpd=200;d.hp=15;
    fixedRandom(.9);fixedDamage(10);
    const actualFinish=finish;let finishCalls=0;
    finish=(...args)=>{finishCalls++;return actualFinish(...args);};
    try {
      await takeTurn({kind:'move',key:'crushrock'},{kind:'move',key:null});
      assert.equal(B.over,true,'a final multi-hit knockout finishes the real turn');
      assert.equal(damageRecords.length,2,'final knockout stops the remaining hits');
      assert.equal(finishCalls,1,'inner and outer faint checks finish the match only once');
      assert.equal(d.dead,true);assert.equal(B.turn,1,'a completed match does not advance another turn');
    } finally {finish=actualFinish;restoreRandom();VictoryAudio.stop();}
  }
})()`);
console.log('PASS independent multi-hit damage/crit, one accuracy/energy cost, shield-to-body continuation, overkill, recoil, and survival item');

await run(`(async()=>{
  {
    const [a,d]=setup();d.sub=100;
    assert.equal(inflict(d,'麻痺'),false,'substitute blocks a new major status');
    assert.equal(lowerRank(d,'atk',1,a),false,'substitute blocks opposing stat reductions');
    assert.equal(d.rank.atk,0);assert.equal(d.status,null);
    await doMove(a,d,'coal');assert.equal(d.status,null,'status-only burn move is stopped');
    a.en=100;await doMove(a,d,'sand');assert.equal(d.rank.acc,0,'stat-reducing status move is stopped');
    a.en=100;await doMove(a,d,'parasite');assert.equal(d.seedTurns,0,'new parasitic seed is blocked');
    d.seedTurns=3;d.hp=800;a.hp=800;await endTurn();
    assert.ok(d.hp<800,'a seed attached before substitute still drains HP');
    assert.ok(a.hp>800,'existing seed still heals its source');
  }
  for(const key of ['encore','disable','taunt','whirl','swap','perish']){
    const [a,d]=setup();d.sub=100;d.lastMove='tackle';a.equip='fang';d.equip='plate';fixedRandom(.1);
    await doMove(a,d,key);
    assert.equal(d.sub,100,key+': non-damaging effect does not consume substitute');
    if(key==='encore')assert.equal(d.encore?.key,'tackle','encore bypasses substitute');
    if(key==='disable')assert.equal(d.disabled?.key,'tackle','disable bypasses substitute');
    if(key==='taunt')assert.equal(d.tauntTurns,3,'taunt bypasses substitute');
    if(key==='whirl'){
      assert.equal(d.bindTurns,BIND_TURNS,'binding restriction bypasses substitute');
      assert.equal(d.rank.spd,0,'but binding move stat drop stays blocked');
      assert.equal(isBound(d),true);
    }
    if(key==='swap'){assert.equal(a.equip,'plate');assert.equal(d.equip,'fang','item swap bypasses substitute');}
    if(key==='perish'){assert.equal(a.perish,3);assert.equal(d.perish,3,'perish song is not blocked by substitute');}
    restoreRandom();
  }
  for(const key of ['ember','spark','touch','squirt','blast','slide','phantom','startle']){
    const [a,d]=setup();d.sub=5;d.plannedMove='focus';fixedRandom(0);fixedDamage(10);
    const oldPr=MOVES[key].pr;if(oldPr!==undefined)MOVES[key].pr=1;
    try {
      await doMove(a,d,key);
      assert.equal(d.sub,0,key+': hit breaks substitute');assert.equal(d.hp,1000,key+': breaking hit does not overflow');
      assert.equal(d.status,null,key+': status addition is blocked even on shield-breaking hit');
      for(const rank of ['atk','def','acc','spd'])assert.equal(d.rank[rank],0,key+': shield-breaking hit stat drop stays blocked');
      if(key==='slide')assert.equal(d.flinch,true,'flinch is outside the narrowed substitute protection');
      if(key==='phantom'){assert.equal(d.en,85,'phantom energy drain bypasses substitute');assert.equal(a.en,90);}
      if(key==='startle')assert.equal(d.actionCancelled,true,'startle can cancel a status action through substitute');
    } finally {if(oldPr!==undefined)MOVES[key].pr=oldPr;restoreRandom();}
  }
  {
    const [a,d]=setup();a.rank.spd=2;fixedRandom(.1);await doMove(a,d,'soar');
    assert.equal(a.rank.eva,1,'soar raises evasion');assert.equal(a.rank.spd,2,'soar never raises speed');
    a.rank.eva=6;a.en=100;await doMove(a,d,'soar');assert.equal(a.rank.eva,6,'evasion cap still applies');assert.equal(a.rank.spd,2);restoreRandom();
  }
})()`);
console.log('PASS narrowed substitute protection, existing seed, bypassing disruption, shield-breaking secondary effects, and evasion-only soar');

await run(`(async()=>{
  setup();
  for(const a of TYPES)for(const d of TYPES){
    B.reverseTurns=0;assert.equal(attackEff(a,d),eff(a,d),'normal attack chart '+a+'/'+d);
    B.reverseTurns=3;const value=eff(a,d),expected=value===0?4:value===2?.5:value===.5?2:1;
    assert.equal(attackEff(a,d),expected,'reversed attack chart '+a+'/'+d);
    assert.equal(eff(a,d),CHART[a][d],'room does not mutate the static chart');
  }
  {
    const [a,d]=setup();d.type='空';const m={t:'地',p:80,category:'physical'};fixedRandom(.5);
    assert.equal(damage(a,d,m).dmg,0,'ground is normally ineffective against air');
    B.reverseTurns=3;const reversed=damage(a,d,m);assert.equal(reversed.e,4);assert.ok(reversed.dmg>0,'normal immunity becomes fourfold damage');
    d.type='水';const fire={t:'炎',p:80,category:'special'};
    assert.equal(damage(a,d,fire).e,2,'normally resisted fire is strong during room');
    const electric={...fire,t:'雷'};assert.equal(damage(a,d,electric).e,.5,'normally strong electricity is resisted during room');
    d.equip='ward';assert.equal(damage(a,d,electric).e,.75,'ward acts after reversed resistance');restoreRandom();
  }
  {
    const [a,d]=setup();d.sub=100;a.sub=100;await doMove(a,d,'reverseRoom');
    assert.equal(B.reverseTurns,3,'room begins immediately and bypasses substitute');
    assert.equal(document.querySelector('#fieldState').hidden,false,'active room status is visible');
    assert.ok(document.querySelector('#fieldState').textContent.includes('アベコベルーム'),'field status names the active room');
    assert.ok(document.querySelector('#fieldState').textContent.includes('3'),'field status reports the current duration');
    assert.equal(attackEff('地','空'),4,'room applies immediately to later actions in the activation turn');
    await endTurn();assert.equal(B.reverseTurns,2,'activation turn is the first of three turns');
    leaveField(a);B.yi=1;assert.equal(B.reverseTurns,2,'switching does not end the room');
    await endTurn();assert.equal(B.reverseTurns,1);
    await endTurn();assert.equal(B.reverseTurns,0,'room expires after exactly three turn endings');
    assert.equal(document.querySelector('#fieldState').hidden,true,'expired room status is hidden');
    assert.equal(attackEff('地','空'),0,'normal type matchups return at expiry');
    YOU().en=100;await doMove(YOU(),FOE(),'reverseRoom');await endTurn();assert.equal(B.reverseTurns,2);
    YOU().en=100;await doMove(YOU(),FOE(),'reverseRoom');assert.equal(B.reverseTurns,3,'reusing room refreshes the full duration');
  }
  {
    const [a,d]=setup();B.reverseTurns=3;d.type='炎';B.hazard.foe.rock=true;
    await applyHazards(d);assert.equal(d.hp,750,'rock hazard keeps the regular twofold matchup during room');
    d.type='地';d.status=null;B.hazard.foe.rock=false;B.hazard.foe.sand=true;
    await applyHazards(d);assert.equal(d.status,null,'sand hazard regular ground immunity is unchanged');
  }
  {
    const [a,d]=setup();a.moves=['tackle'];d.type='空';renderCmd();
    assert.ok(!document.querySelector('#cmd').children[0].innerHTML.includes('効果なし'),'neutral against air is usable in command UI');
    a.moves=['rift'];B.reverseTurns=3;renderCmd();
    assert.ok(document.querySelector('#cmd').children[0].innerHTML.includes('ばつぐん'),'command UI shows reversed fourfold effectiveness');
    for(const room of [0,3])for(let seed=1;seed<=20;seed++){
      B.reverseTurns=room;FOE().moves=['bolt','flame'];FOE().type='無';YOU().type='水';setSeed(seed);
      assert.equal(aiChoose().key,room?'flame':'bolt','AI evaluates current reversed or normal type matchup');
    }
  }
})()`);
console.log('PASS full reversed type matrix, damage/ward, immediate three-turn global room, switch/refresh/expiry, unaffected hazards, command UI, and AI');

const host=world(),guest=world();
for(const [instance,perspective] of [[host,'you'],[guest,'foe']]){
  instance.run(`
    const team=['homura','shiogame','oborogi'].map(id=>({id,moves:['crushrock','reverseRoom','sub','soar'],equip:'none',ability:'focus2'}));
    beginBattle(team,team,938125,${JSON.stringify(perspective)});
    assert.equal(B.reverseTurns,0,'new battle starts with no room');
    for(const u of [...B.you,...B.foe]){u.maxhp=u.hp=2000;u.baseAtk=u.baseDef=u.baseSpAtk=u.baseSpDef=100;u.baseSpd=u.side==='you'?120:80;}
  `);
}
const actions=[
  [{kind:'move',key:'reverseRoom'},{kind:'move',key:'sub'}],
  [{kind:'move',key:'crushrock'},{kind:'move',key:'soar'}],
  [{kind:'move',key:'crushrock'},{kind:'move',key:'crushrock'}],
  [{kind:'switch',to:1},{kind:'move',key:'reverseRoom'}],
  [{kind:'move',key:'crushrock'},{kind:'move',key:'crushrock'}],
  [{kind:'move',key:'reverseRoom'},{kind:'move',key:'reverseRoom'}],
];
for(const [playerAction,foeAction] of actions){
  await host.run(`takeTurn(${JSON.stringify(playerAction)},${JSON.stringify(foeAction)})`);
  await guest.run(`takeTurn(${JSON.stringify(foeAction)},${JSON.stringify(playerAction)})`);
  const snapshot='({state:B,seed:_seed})';
  assert.deepEqual(host.json(snapshot),guest.json(snapshot),'host and guest keep identical state and battle RNG after every full turn');
}
console.log('PASS independent host/guest simulations remain synchronized through multi-hit, substitute, room, switches, and expiry');
console.log('Unverified: real browser layout/input, audible playback, animation timing, and live PeerJS transport.');
