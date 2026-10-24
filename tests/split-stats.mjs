import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Engine and generated UI checks with DOM stubs; this is not browser or PeerJS QA.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
function node(){
  const classes=new Set();let markup='';
  return {value:'',textContent:'',children:[],style:{setProperty:noop},
    get innerHTML(){return markup;},set innerHTML(value){markup=String(value);this.children=[];},
    classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
    appendChild(child){this.children.push(child);return child;},remove:noop,
    querySelector:()=>node(),querySelectorAll:()=>[],getContext:()=>({clearRect:noop,fillRect:noop}),
    addEventListener:noop,setAttribute:noop,
  };
}
const nodes=new Map(),storage=new Map();
const getNode=selector=>{const key=selector.startsWith('#')?selector:'#'+selector;if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
const context=vm.createContext({console,assert,
  document:{hidden:false,querySelector:getNode,getElementById:getNode,querySelectorAll:()=>[],createElement:node,addEventListener:noop},
  window:{scrollTo:noop},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
});
const run=code=>vm.runInContext(code,context,{filename:'split-stats-checks',timeout:10_000});
const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
const markup=n=>n.innerHTML+n.textContent+n.children.map(markup).join('');
run(source);
run(`
  assert.equal(SPECIES.length,18);
  for(const s of SPECIES){
    for(const key of ['hp','atk','def','spatk','spdef','spd'])
      assert.ok(Number.isInteger(s[key])&&s[key]>0,s.id+': '+key+' is a positive integer');
    assert.ok(typeof s.role==='string'&&s.role.trim(),s.id+': visible battle role');
    const u=makeUnit({id:s.id,moves:learnable(s).slice(0,4),equip:'none',ability:ABIL_OF[s.id][0]},'you');
    assert.equal(u.baseAtk,s.atk);assert.equal(u.baseDef,s.def);
    assert.equal(u.baseSpAtk,s.spatk);assert.equal(u.baseSpDef,s.spdef);assert.equal(u.baseSpd,s.spd);
    for(const key of ['atk','def','spatk','spdef','spd','acc','eva'])assert.equal(u.rank[key],0,s.id+': '+key+' rank initializes');
  }
  assert.ok(SPECIES.some(s=>s.atk>s.spatk),'physical specialists exist');
  assert.ok(SPECIES.some(s=>s.spatk>s.atk),'special specialists exist');
  assert.ok(SPECIES.some(s=>s.def>s.spdef),'physical defenders exist');
  assert.ok(SPECIES.some(s=>s.spdef>s.def),'special defenders exist');
  const categories=new Set();
  for(const [key,m] of Object.entries(MOVES)){
    assert.ok(['physical','special','status'].includes(m.category),key+': explicit move category');
    assert.equal(m.category==='status',m.p===0&&m.fx!=='counter',key+': damage/status semantics');
    categories.add(m.category);
  }
  assert.equal(categories.size,3);
  assert.equal(MOVES.revenge.category,'physical','fixed retaliation remains an attack');
`);
console.log('PASS all 18 six-stat species, differentiated roles, unit initialization, and explicit move categories');

run(`
  function probeUnit(side='you'){
    const u=makeUnit({id:'homura',moves:['tackle','ember','focus','revenge'],equip:'none',ability:'quick'},side);
    u.type='無';u.baseAtk=u.baseDef=u.baseSpAtk=u.baseSpDef=u.baseSpd=100;
    u.maxhp=u.hp=500;return u;
  }
  const physicalProbe={t:'無',p:80,acc:100,en:25,category:'physical'};
  const specialProbe={...physicalProbe,category:'special'};
  function sampleDamage(m,att=probeUnit(),def=probeUnit('foe')){setSeed(7812345);return damage(att,def,m).dmg;}
  const physicalBase=sampleDamage(physicalProbe),specialBase=sampleDamage(specialProbe);
  assert.equal(physicalBase,specialBase,'equal stats and move data give equal base damage');
  for(const [field,category] of [['baseAtk','physical'],['baseSpAtk','special']]){
    const a=probeUnit();a[field]=300;
    assert.ok(sampleDamage(category==='physical'?physicalProbe:specialProbe,a)>physicalBase,field+': own damage rises');
    assert.equal(sampleDamage(category==='physical'?specialProbe:physicalProbe,a),physicalBase,field+': opposite category is independent');
  }
  for(const [field,category] of [['baseDef','physical'],['baseSpDef','special']]){
    const d=probeUnit('foe');d[field]=300;
    assert.ok(sampleDamage(category==='physical'?physicalProbe:specialProbe,probeUnit(),d)<physicalBase,field+': own received damage falls');
    assert.equal(sampleDamage(category==='physical'?specialProbe:physicalProbe,probeUnit(),d),physicalBase,field+': opposite category is independent');
  }
  for(const [rank,category,side] of [['atk','physical','attack'],['spatk','special','attack'],['def','physical','defend'],['spdef','special','defend']]){
    const a=probeUnit(),d=probeUnit('foe');(side==='attack'?a:d).rank[rank]=2;
    const own=sampleDamage(category==='physical'?physicalProbe:specialProbe,a,d);
    assert.ok(side==='attack'?own>physicalBase:own<physicalBase,rank+': own rank affects damage');
    assert.equal(sampleDamage(category==='physical'?specialProbe:physicalProbe,a,d),physicalBase,rank+': opposite category ignores rank');
  }
  const burned=probeUnit();burned.status='やけど';
  assert.ok(sampleDamage(physicalProbe,burned)<physicalBase,'burn weakens physical attacks');
  assert.equal(sampleDamage(specialProbe,burned),specialBase,'burn does not weaken special attacks');
  const gritty=probeUnit();gritty.ability='grit';gritty.hp=100;
  assert.ok(sampleDamage(physicalProbe,gritty)>physicalBase,'grit boosts physical attacks at low HP');
  assert.equal(sampleDamage(specialProbe,gritty),specialBase,'grit does not boost special attacks');
  const guarded=probeUnit('foe');guarded.guarding=true;
  assert.ok(sampleDamage(physicalProbe,probeUnit(),guarded)<physicalBase,'guard reduces physical damage');
  assert.ok(sampleDamage(specialProbe,probeUnit(),guarded)<specialBase,'guard reduces special damage');
`);
console.log('PASS independent damage paths, all four ranks, physical burn/grit, and guard for both categories');

run(`
  for(const [equip,side] of [['fang','attack'],['plate','defend'],['armor','defend']]){
    const a=probeUnit(),d=probeUnit('foe');(side==='attack'?a:d).equip=equip;
    const pd=sampleDamage(physicalProbe,a,d);
    assert.ok(side==='attack'?pd>physicalBase:pd<physicalBase,equip+': physical modifier applies');
    assert.equal(sampleDamage(specialProbe,a,d),specialBase,equip+': special damage is unchanged');
  }
  // Discover the two matching special items from actual stat behavior, not their names.
  const specialAttackItems=Object.keys(EQUIPS).filter(key=>{const u=probeUnit();u.equip=key;return SPATK(u)>SPATK(probeUnit());});
  const specialDefenseItems=Object.keys(EQUIPS).filter(key=>{const u=probeUnit();u.equip=key;return SPDEF(u)>SPDEF(probeUnit());});
  assert.ok(specialAttackItems.length>0,'a special attack item exists');
  assert.ok(specialDefenseItems.length>0,'a special defense item exists');
  for(const equip of specialAttackItems){
    const a=probeUnit();a.equip=equip;
    assert.ok(sampleDamage(specialProbe,a)>specialBase,equip+': special attack bonus reaches damage');
    assert.equal(sampleDamage(physicalProbe,a),physicalBase,equip+': special item leaves physical attack unchanged');
  }
  for(const equip of specialDefenseItems){
    const d=probeUnit('foe');d.equip=equip;
    assert.ok(sampleDamage(specialProbe,probeUnit(),d)<specialBase,equip+': special defense bonus reaches damage');
    assert.equal(sampleDamage(physicalProbe,probeUnit(),d),physicalBase,equip+': special item leaves physical defense unchanged');
  }
  for(const equip of [...specialAttackItems,...specialDefenseItems]){
    const u=probeUnit();u.equip=equip;u.lastMove='ember';
    if(EQUIPS[equip].lock)assert.ok(moveBlocked(u,'ember'),equip+': consecutive move lock still applies');
  }
`);
console.log('PASS physical and special equipment affects only its intended category and preserves item restrictions');

await run(`(async()=>{
  B={you:[probeUnit()],foe:[probeUnit('foe')],yi:0,fi:0,hazard:{you:{rock:false,sand:false},foe:{rock:false,sand:false}},turn:1,over:false,busy:false,pickSeq:0};
  ME='you';NET.on=false;
  const a=YOU(),d=FOE();
  a.ability='pressure';onEnter(a);
  assert.equal(d.rank.atk,-1,'pressure lowers physical attack');assert.equal(d.rank.spatk,0,'pressure leaves special attack unchanged');
  d.ability='spite';lowerRank(d,'spdef',1,a);
  assert.equal(d.rank.spdef,-1,'special defense lowering is supported');
  assert.equal(d.rank.atk,0,'spite raises physical attack');assert.equal(d.rank.spatk,0,'spite leaves special attack unchanged');
  d.ability='mirror';const before=JSON.stringify(d.rank);lowerRank(d,'spatk',1,a);
  assert.equal(JSON.stringify(d.rank),before,'mirror protects the newly added ranks');
  a.ability='quick';d.ability='quick';
  for(const key of Object.keys(a.rank))a.rank[key]=2;
  a.status='やけど';const messages=leaveField(a);
  for(const key of ['atk','def','spatk','spdef','spd','acc','eva'])assert.equal(a.rank[key],0,key+': switching clears every rank');
  assert.equal(a.status,'やけど','switching preserves status');assert.ok(messages.length>0,'rank reset is reported');
  a.status=null;a.en=100;await doMove(a,d,'focus');
  assert.equal(a.rank.atk,1,'focus boosts physical attack');assert.equal(a.rank.spatk,0,'focus does not boost special attack');
  a.en=100;await doMove(a,d,'root');
  assert.equal(a.rank.def,1,'root boosts physical defense');assert.equal(a.rank.spdef,0,'root does not boost special defense');
  a.en=100;await doMove(a,d,'meditate');
  assert.equal(a.rank.spatk,1,'meditation boosts special attack');assert.equal(a.rank.atk,1,'meditation leaves physical attack unchanged');
  a.en=100;await doMove(a,d,'barrier');
  assert.equal(a.rank.spdef,1,'barrier boosts special defense');assert.equal(a.rank.def,1,'barrier leaves physical defense unchanged');
  a.rank.spatk=6;a.en=100;await doMove(a,d,'meditate');assert.equal(a.rank.spatk,6,'special attack rank is capped');
  a.rank.spdef=6;a.en=100;await doMove(a,d,'barrier');assert.equal(a.rank.spdef,6,'special defense rank is capped');
  for(const u of [a,d])for(const key of Object.keys(u.rank))u.rank[key]=2;
  a.en=100;await doMove(a,d,'haze');
  for(const u of [a,d])for(const key of ['atk','def','spatk','spdef','spd','acc','eva'])assert.equal(u.rank[key],0,'haze clears '+key+' on both sides');
  // Revenge is a physical fixed-damage attack, rather than a zero-power status move.
  a.tauntTurns=2;a.equip='armor';
  assert.equal(moveBlocked(a,'revenge'),false,'taunt and status-blocking armor permit retaliation');
  assert.equal(moveBlocked(a,'focus'),true,'status moves stay blocked');
  for(const stat of ['baseAtk','baseSpAtk'])a[stat]=999;
  for(const stat of ['baseDef','baseSpDef'])d[stat]=999;
  a.status='やけど';a.dmgTaken=20;a.en=100;d.hp=500;
  await doMove(a,d,'revenge');assert.equal(d.hp,470,'retaliation preserves fixed 1.5x damage irrespective of stats/burn');
  a.tauntTurns=0;a.equip='none';a.status=null;a.en=100;d.hp=500;d.plannedMove='revenge';
  await doMove(a,d,'ambush');assert.ok(d.hp<500,'ambush recognizes zero-power retaliation as an attack');
  a.en=100;d.hp=500;d.plannedMove='revenge';d.actionCancelled=false;
  await doMove(a,d,'startle');assert.equal(d.hp,500,'startle does not treat retaliation as a status move');
  assert.equal(d.actionCancelled,false,'failed startle does not cancel retaliation');
})()`);
console.log('PASS physical abilities, special rank protection/reset, setup moves, haze, fixed retaliation, and attack/status restrictions');

run(`
  // Keep move power, type, accuracy, and energy identical to isolate AI category choice.
  const oldTackle={...MOVES.tackle},oldEmber={...MOVES.ember};
  Object.assign(MOVES.tackle,physicalProbe);Object.assign(MOVES.ember,specialProbe);
  B.you=[probeUnit()];B.foe=[probeUnit('foe')];B.yi=B.fi=0;
  const f=FOE();f.moves=['tackle','ember'];f.baseAtk=300;f.baseSpAtk=30;
  for(let seed=1;seed<=20;seed++){setSeed(seed);assert.equal(aiChoose().key,'tackle','AI chooses much stronger physical attack');}
  f.baseAtk=30;f.baseSpAtk=300;
  for(let seed=1;seed<=20;seed++){setSeed(seed);assert.equal(aiChoose().key,'ember','AI chooses much stronger special attack');}
  setSeed(45291);const firstChoice=JSON.stringify(aiChoose()),firstSeed=_seed;
  setSeed(45291);assert.equal(JSON.stringify(aiChoose()),firstChoice,'same state and seed produce identical action');
  assert.equal(_seed,firstSeed,'AI consumes deterministic RNG');
  Object.assign(MOVES.tackle,oldTackle);Object.assign(MOVES.ember,oldEmber);
  const legacy=[{id:'homura',moves:['tackle','guard','focus','ember'],equip:'fang',ability:ABIL_OF.homura[0]},
    {id:'shiogame',moves:['tackle','guard','squirt','aqua'],equip:'plate',ability:ABIL_OF.shiogame[0]},
    {id:'oborogi',moves:['tackle','guard','phantom','mirage'],equip:'none',ability:ABIL_OF.oborogi[0]}];
  localStorage.setItem(DRAFT_KEY,JSON.stringify(legacy));party=loadDraft();
  assert.equal(JSON.stringify(party),JSON.stringify(legacy),'previous draft format restores unchanged');
  assert.equal(JSON.stringify(sanitizeTeam(legacy)),JSON.stringify(legacy),'previous network team format remains valid');
  for(const build of party){const u=makeUnit(build,'you');assert.ok(Number.isFinite(u.baseSpAtk)&&Number.isFinite(u.baseSpDef),'legacy builds receive current species stats');}
  saveDraft();assert.equal(localStorage.getItem(DRAFT_KEY),JSON.stringify(legacy),'saving does not insert stale derived stats into drafts');
  rosterFilter='all';renderRoster();renderSlots();
`);
console.log('PASS AI category selection and seeded determinism, legacy saved teams, and payload validation');

const roster=getNode('#roster');
assert.equal(roster.children.length,18,'all species remain visible');
const species=json('SPECIES');
for(let i=0;i<species.length;i++){
  const card=markup(roster.children[i]);
  assert.ok(card.includes(species[i].role),species[i].id+': role visible on roster');
  for(const label of ['物攻','物防','特攻','特防'])assert.ok(card.includes(label),species[i].id+': '+label+' visible on roster');
}
const slotsMarkup=markup(getNode('#slots'));
for(const id of ['homura','shiogame','oborogi'])assert.ok(slotsMarkup.includes(species.find(s=>s.id===id).role),id+': role visible in selected team');
for(const label of ['物攻','物防','特攻','特防'])assert.ok(slotsMarkup.includes(label),label+': explicit selected-team stat label');
console.log('PASS six-stat and role information appears in rendered roster and selected team UI');

await run(`(async()=>{
  class TestConnection {
    constructor(){this.handlers={};this.open=true;this.sent=[];this.closed=false;}
    on(name,handler){this.handlers[name]=handler;}
    emit(name,value){return this.handlers[name]?.(value);}
    send(message){this.sent.push(message);}
    close(){this.closed=true;this.open=false;this.emit('close');}
  }
  globalThis.Peer=class {
    constructor(){this.handlers={};this.destroyed=false;}
    on(name,handler){this.handlers[name]=handler;}
    emit(name,value){return this.handlers[name]?.(value);}
    connect(){return this.connection=new TestConnection();}
    destroy(){this.destroyed=true;}
  };
  const originalBegin=beginBattle,started=[];
  beginBattle=(...args)=>started.push(args);
  try {
    await hostGame('same');
    const host=NET.peer,conn=new TestConnection();host.emit('connection',conn);
    const opened=conn.emit('open');
    conn.emit('data',{t:'team',rulesVersion:BATTLE_RULES_VERSION,team:teamPayload()});
    await opened;
    assert.equal(started.length,1,'matching guest starts the host battle');
    assert.equal(conn.sent[0].t,'start');assert.equal(conn.sent[0].rulesVersion,BATTLE_RULES_VERSION);
    assert.equal(started[0][3],'you','host keeps its canonical perspective');
    await hostGame('old');
    const oldConn=new TestConnection();NET.peer.emit('connection',oldConn);
    const oldOpened=oldConn.emit('open');oldConn.emit('data',{t:'team',team:teamPayload()});await oldOpened;
    assert.equal(started.length,1,'old guest never starts mismatched rules');
    assert.ok(oldConn.closed,'incompatible guest is disconnected instead of waiting forever');
    assert.ok(oldConn.sent.some(m=>m.t==='bye'),'old clients receive a compatible departure message');
    assert.ok(document.querySelector('#lobbyStatus').textContent.includes('バージョン'),'host sees reload guidance');
    await joinGame('same');NET.peer.emit('open');const guestConn=NET.conn;
    const guestOpened=guestConn.emit('open');
    assert.equal(guestConn.sent[0].rulesVersion,BATTLE_RULES_VERSION,'guest advertises rules with its team');
    guestConn.emit('data',{t:'start',rulesVersion:BATTLE_RULES_VERSION,team:teamPayload(),seed:117});await guestOpened;
    assert.equal(started.length,2,'matching host starts guest battle');assert.equal(started[1][3],'foe');
    await joinGame('old');NET.peer.emit('open');const oldHostConn=NET.conn;
    const oldHostOpened=oldHostConn.emit('open');
    oldHostConn.emit('data',{t:'start',team:teamPayload(),seed:117});await oldHostOpened;
    assert.equal(started.length,2,'old host never starts mismatched rules');
    assert.ok(oldHostConn.closed,'guest disconnects from an incompatible host');
    assert.equal(NET.on,false);assert.equal(Object.keys(NET.waiters).length,0,'version rejection leaves no hanging waiters');
  } finally { NET.reset();beginBattle=originalBegin; }
})()`);
console.log('PASS host/guest rules handshake, canonical perspectives, and old-version rejection without hanging waits');
console.log('Unverified: browser layout/input, actual audio, and live PeerJS matches.');
