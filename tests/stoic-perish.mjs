import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Headless behavior checks: real engine methods, stubbed presentation, no browser or PeerJS transport.
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
  const run=code=>vm.runInContext(code,context,{filename:'stoic-perish-checks',timeout:10_000});
  run(source);
  run(`
    function unit(side='you',id='homura',ability='focus2'){
      const u=makeUnit({id,moves:['tackle','pivot','repose','perish'],equip:'none',ability},side);
      u.type='無';u.maxhp=u.hp=1000;u.baseAtk=u.baseSpAtk=u.baseDef=u.baseSpDef=100;u.baseSpd=100;
      return u;
    }
    function setup(){
      B={you:[unit('you'),unit('you'),unit('you')],foe:[unit('foe'),unit('foe'),unit('foe')],
        yi:0,fi:0,hazard:{you:{rock:false,sand:false},foe:{rock:false,sand:false}},
        turn:1,over:false,busy:false,pickSeq:0,reverseTurns:0};
      ME='you';NET.on=false;setSeed(837162);document.querySelector('#log').innerHTML='';return [YOU(),FOE()];
    }
    function logs(){return document.querySelector('#log').children.map(n=>n.innerHTML).join(' ');}
    async function endAndAdvance(){await endTurn();await markFaints();if(!B.over)B.turn++;}
    const normalRng=rng;
    function stableRandom(){rng=()=>.5;}
    function restoreRandom(){rng=normalRng;}
    const priorAbilities={
      homura:['grit','tempo'],youcho:['hide','ballast'],shiogame:['ballast','mirror'],soukou:['glutton','tempo'],
      kokejyu:['regen','quick'],tsutazaru:['glutton','tempo'],raitachi:['tempo','blur'],rainen:['ballast','quick'],
      iwaushi:['hide','mirror'],saikaku:['grit','spite'],fukurou:['tempo','glutton'],yoigumo:['blur','ghost'],
      doryu:['hide','focus2'],sarou:['grit','breaker'],fuen:['blur','regen'],ungei:['pressure','heavy'],
      mubaku:['mirror','glutton'],oborogi:['blur','tempo']
    };
  `);
  return {run,getNode,json:expression=>JSON.parse(run('JSON.stringify('+expression+')'))};
}
const w=world(),run=w.run;
run(`
  assert.equal(ABILITIES.stoic.n,'やせ我慢');
  const users=Object.keys(ABIL_OF).filter(id=>ABIL_OF[id].includes('stoic')).sort();
  assert.equal(JSON.stringify(users),JSON.stringify(['homura','shiogame','saikaku','fuen'].sort()),'exactly four selected species gain stoic');
  for(const [id,previous] of Object.entries(priorAbilities)){
    assert.equal(JSON.stringify(ABIL_OF[id].slice(0,2)),JSON.stringify(previous),id+': existing ability options remain in place');
    assert.equal(ABIL_OF[id].length,users.includes(id)?3:2,id+': only selected species gain a third choice');
    if(users.includes(id))assert.equal(ABIL_OF[id][2],'stoic',id+': stoic is the third ability');
  }
  const builds=['homura','shiogame','fuen'].map(id=>({id,moves:learnable(spec(id)).slice(0,4),equip:'none',ability:'stoic'}));
  assert.ok(sanitizeTeam(builds).every(build=>build.ability==='stoic'),'network team validation accepts the new selectable trait');
  const [a,d]=setup();
  assert.equal(a.pendingStatus??null,null,'a fresh unit has no deferred status');
  assert.equal(a.perish,0,'a fresh unit has no perish countdown');
`);
console.log('PASS exactly four third-trait choices, retained legacy abilities, network validation, and clean unit initialization');

await run(`(async()=>{
  for(const status of ['麻痺','やけど']){
    const [a,d]=setup();d.ability='stoic';
    const originalAttack=ATK(d),originalSpeed=SPD(d),before=d.hp,seed=_seed;
    assert.equal(inflict(d,status,a),true,'an eligible delayed affliction is accepted');
    assert.equal(d.status,null,'the affliction is not active immediately');
    assert.equal(d.pendingStatus.status,status);assert.equal(d.pendingStatus.turn,1,'queue records the affliction turn');
    assert.equal(_seed,seed,'queuing a status never consumes combat RNG');
    assert.ok(logs().includes('やせ我慢している！'),'deferred affliction announces stoic');
    assert.ok(tags(d).includes('やせ我慢')&&tags(d).includes(status),'HUD distinguishes the pending affliction');
    assert.equal(getStatusVisualKeys(d).includes(status==='麻痺'?'paralysis':'burn'),false,'major-status visual is not active for a pending flag');
    assert.equal(ATK(d),originalAttack);assert.equal(SPD(d),originalSpeed);
    await endAndAdvance();
    assert.equal(B.turn,2);assert.equal(d.status,null,'activation-turn ending retains the delay');
    assert.equal(d.hp,before,'a delayed burn has no damage on its activation-turn ending');
    assert.equal(ATK(d),originalAttack);assert.equal(SPD(d),originalSpeed);
    d.en=100;stableRandom();const beforeTarget=a.hp;await doMove(d,a,'tackle');restoreRandom();
    assert.ok(a.hp<beforeTarget,'the unit acts normally throughout the following turn');
    await endAndAdvance();
    assert.equal(B.turn,3);assert.equal(d.status,status,'actual affliction begins at the following turn ending');
    assert.equal(d.pendingStatus??null,null,'matured queue is cleared');
    assert.equal(d.hp,before,'newly matured burn does not tick during its maturation ending');
    assert.equal(d.statusTurns,0,'maturation does not consume a cure turn');
    if(status==='麻痺')assert.equal(SPD(d),originalSpeed*.5,'paralysis begins to slow only after maturation');
    else assert.equal(ATK(d),originalAttack*.75,'burn begins to weaken only after maturation');
    assert.ok(getStatusVisualKeys(d).includes(status==='麻痺'?'paralysis':'burn'),'the actual status enables its usual visual');
    await endAndAdvance();
    assert.equal(d.hp,status==='やけど'?before-Math.floor(d.maxhp/16):before,'burn first ticks at the next ending after maturation');
  }
  {
    const [a,d]=setup();d.ability='stoic';inflict(d,'麻痺',a);const original=JSON.stringify(d.pendingStatus);
    B.turn=2;assert.equal(inflict(d,'やけど',a),false,'a second status cannot overwrite an existing deferred flag');
    assert.equal(inflict(d,'麻痺',a),false,'a repeated status cannot refresh a pending flag');
    assert.equal(JSON.stringify(d.pendingStatus),original,'rejected afflictions preserve status and timing');
    await endTurn();assert.equal(d.status,'麻痺','repeated incoming effects do not postpone maturation');
  }
  {
    const [a,d]=setup();d.ability='stoic';inflict(d,'やけど',a);await endAndAdvance();
    d.sub=100;d.equip='mask';await endTurn();
    assert.equal(d.status,'やけど','a shield or mask added after the flag does not erase its scheduled outcome');
  }
})()`);
console.log('PASS exact one-turn deferred status timing, HUD/visual distinction, physical penalties, first burn tick, and first-status-only queue');

await run(`(async()=>{
  for(const blocked of ['shield','fire','electric','existing','fainted']){
    const [a,d]=setup();d.ability='stoic';let status='やけど';
    if(blocked==='shield')d.sub=100;
    if(blocked==='fire')d.type='炎';
    if(blocked==='electric'){d.type='雷';status='麻痺';}
    if(blocked==='existing')d.status='麻痺';
    if(blocked==='fainted')d.hp=0;
    assert.equal(inflict(d,status,a),false,blocked+': invalid affliction remains rejected');
    assert.equal(d.pendingStatus??null,null,blocked+': rejected affliction does not create a stoic queue');
    assert.ok(!logs().includes('やせ我慢している！'),blocked+': rejection does not announce stoic');
  }
  for(const bypass of ['mask','breaker']){
    const [a,d]=setup();d.ability='stoic';
    if(bypass==='mask')d.equip='mask';else a.ability='breaker';
    assert.equal(inflict(d,'やけど',a),true,bypass+': valid affliction is accepted');
    assert.equal(d.status,'やけど',bypass+': suppressed or ignored stoic does not defer');
    assert.equal(d.pendingStatus??null,null,bypass+': no delayed queue');
  }
  for(const breaker of [false,true]){
    const [a,d]=setup();d.ability='stoic';if(breaker)a.ability='breaker';
    stableRandom();await doMove(a,d,'coal');restoreRandom();
    if(breaker){assert.equal(d.status,'やけど','burnsure passes attacker into trait suppression');assert.equal(d.pendingStatus??null,null);}
    else {
      assert.equal(d.status,null);assert.equal(d.pendingStatus.status,'やけど','status move queues a delayed burn');
      assert.ok(logs().includes('やせ我慢している！'));
      assert.ok(!logs().includes('やけどを負った'),'queued burn is not reported as immediate');
      assert.ok(!logs().includes('効果がなかった'),'accepted delayed burn is not reported as a failed move');
    }
  }
  for(const breaker of [false,true]){
    const [a,d]=setup();d.ability='stoic';if(breaker)a.ability='breaker';
    const probability=MOVES.spark.pr;MOVES.spark.pr=1;stableRandom();
    try {await doMove(a,d,'spark');}finally{MOVES.spark.pr=probability;restoreRandom();}
    assert.equal(d.status,breaker?'麻痺':null,'attack secondary effect respects attacker-specific trait bypass');
    if(!breaker)assert.equal(d.pendingStatus.status,'麻痺','attack secondary effect can defer');
  }
  {
    const [a,d]=setup();d.ability='stoic';B.hazard.foe.sand=true;
    await applyHazards(d);assert.equal(d.status,null);assert.equal(d.pendingStatus.status,'麻痺','environmental status also respects stoic');
  }
  {
    const [a,d]=setup();d.ability='stoic';stableRandom();await doMove(a,d,'parasite');restoreRandom();
    assert.equal(d.seedTurns,SEED_TURNS,'parasitic seed remains outside major status deferral');assert.equal(d.pendingStatus??null,null);
  }
})()`);
console.log('PASS normal status immunity/substitute boundaries, mask and breaker, accurate effect text, attack secondary effects, and hazard interaction');

await run(`(async()=>{
  {
    const [a,d]=setup();d.ability='stoic';inflict(d,'やけど',a);
    await takeTurn({kind:'move',key:null},{kind:'switch',to:1});
    assert.equal(d.pendingStatus??null,null,'a regular switch clears the delayed flag');
    assert.equal(d.status,null);assert.equal(B.fi,1);
    leaveField(FOE());B.fi=0;await endAndAdvance();assert.equal(d.status,null,'returning after a switch cannot revive the old deferred flag');
  }
  {
    const [a,d]=setup();a.id='fuen';a.sp=spec('fuen');a.ability='stoic';inflict(a,'麻痺',d);
    const originalChoice=chooseReplacement;chooseReplacement=async()=>1;stableRandom();
    try {await doMove(a,d,'pivot');}finally{chooseReplacement=originalChoice;restoreRandom();}
    assert.equal(B.yi,1,'pivot changes the active unit');assert.equal(a.pendingStatus??null,null,'pivot clears the same delayed flag as ordinary switching');
    leaveField(YOU());B.yi=0;await endAndAdvance();await endAndAdvance();assert.equal(a.status,null,'pivot removes the scheduled outcome permanently');
  }
  {
    const [a,d]=setup();a.ability='stoic';inflict(a,'やけど',d);await doMove(a,d,'repose');
    assert.equal(a.pendingStatus??null,null,'rest cures a pending affliction');
    await endAndAdvance();await endAndAdvance();assert.equal(a.status,null,'a cured pending affliction does not mature later');
  }
  {
    const [a,d]=setup();d.ability='stoic';inflict(d,'麻痺',a);d.hp=0;await markFaints();
    assert.equal(d.dead,true);assert.equal(d.pendingStatus??null,null,'fainting discards an uncommitted status');
  }
  {
    const [a,d]=setup();d.ability='stoic';inflict(d,'麻痺',a);await endAndAdvance();await endAndAdvance();
    assert.equal(d.status,'麻痺');leaveField(d);
    assert.equal(d.status,'麻痺','switching preserves a status which has already become active');
    assert.equal(d.pendingStatus??null,null);
  }
})()`);
console.log('PASS regular/pivot switching, re-entry, rest cure, death cleanup, and already-active status persistence');

await run(`(async()=>{
  {
    const [a,d]=setup();await doMove(a,d,'perish');
    assert.equal(a.perish,3);assert.equal(d.perish,3);
    assert.equal(a.perishStartTurn,1);assert.equal(d.perishStartTurn,1);
    await endAndAdvance();assert.equal(a.perish,3,'casting-turn ending starts at three');assert.equal(d.perish,3);
    assert.match(logs(),/滅びのカウント[^<]*3/,'the first turn ending announces the full three-count');
    a.en=100;await doMove(a,d,'perish');
    assert.equal(a.perishStartTurn,1,'repeated song cannot postpone an already running countdown');
    await endAndAdvance();assert.equal(a.perish,2);assert.equal(d.perish,2);
    await endAndAdvance();assert.equal(a.perish,1);assert.equal(d.perish,1);
    await endAndAdvance();assert.equal(a.hp,0);assert.equal(d.hp,0);assert.equal(a.dead,true);assert.equal(d.dead,true);
  }
  {
    const [a,d]=setup();await doMove(a,d,'perish');leaveField(d);
    assert.equal(d.perish,0,'switching escapes the song');assert.ok(d.perishStartTurn==null||d.perishStartTurn<=0,'switching also resets the start marker');
    await endAndAdvance();await endAndAdvance();assert.equal(d.perish,0,'a stale start marker cannot restart a canceled countdown');
  }
  {
    const [a,d]=setup();a.perish=1;a.perishStartTurn=1;B.turn=2;a.equip='charm';a.hp=a.maxhp;a.preHitHp=a.hp;
    a.ability='stoic';a.pendingStatus={status:'麻痺',turn:1};d.seedTurns=2;d.hp=800;
    await endTurn();await markFaints();
    assert.equal(a.hp,0,'parasitic healing cannot revive a unit whose perish count reached zero earlier in the same ending');
    assert.equal(a.dead,true,'perish death is finalized');assert.equal(a.charmUsed,false,'a direct-hit survival item does not undo perish death');
    assert.equal(a.pendingStatus??null,null,'a unit defeated by perish does not retain a deferred status');
    assert.equal(a.status,null,'a defeated unit never matures its pending affliction');
  }
})()`);
console.log('PASS perish starts at the casting-turn ending, repeat/switch behavior, and no survival-item/parasitic revival or posthumous status');

const host=world(),guest=world();
for(const [instance,perspective] of [[host,'you'],[guest,'foe']]){
  instance.run(`
    const builds=['fuen','shiogame','homura'].map(id=>({id,moves:['coal','perish','pivot','tackle'],equip:'none',ability:'stoic'}));
    beginBattle(builds,builds,718254,${JSON.stringify(perspective)});
    for(const u of [...B.you,...B.foe]){u.type='無';u.maxhp=u.hp=3000;u.baseAtk=u.baseDef=u.baseSpAtk=u.baseSpDef=100;u.baseSpd=u.side==='you'?120:80;}
    // Replacement is another player input: supply the same choice to both perspectives.
    decideSwitch=async(side,seq,alive)=>alive[0].i;
  `);
}
const actions=[
  [{kind:'move',key:'coal'},{kind:'move',key:'perish'}],
  [{kind:'move',key:'tackle'},{kind:'move',key:'pivot'}],
  [{kind:'switch',to:1},{kind:'move',key:'coal'}],
  [{kind:'move',key:'pivot'},{kind:'move',key:'tackle'}],
];
for(const [playerAction,foeAction] of actions){
  await host.run(`takeTurn(${JSON.stringify(playerAction)},${JSON.stringify(foeAction)})`);
  await guest.run(`takeTurn(${JSON.stringify(foeAction)},${JSON.stringify(playerAction)})`);
  assert.deepEqual(host.json('({state:B,seed:_seed})'),guest.json('({state:B,seed:_seed})'),'host and guest keep the same pending flags, countdowns, and combat RNG');
}
console.log('PASS independently executed host/guest states stay synchronized through delay, song, ordinary switches, and pivot');
console.log('Unverified: real browser layout/input, audio, animation timing, and live PeerJS transport.');
