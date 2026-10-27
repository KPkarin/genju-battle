import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Multiple fresh VMs share only storage, as separate page visits do. DOM and browser storage
// policies are simulated here; real browser persistence is not verified by this script.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const DRAFT='genju_battle_draft_v1',TEAMS='genju_battle_teams_v1';
const noop=()=>{};
function world(storage=new Map(),faults={}){
  const nodes=new Map(),events=new Map(),writes=[];
  function node(){
    const classes=new Set();let markup='';
    return {value:'',textContent:'',children:[],width:32,height:32,hidden:false,disabled:false,dataset:{},
      style:{setProperty:noop},
      get innerHTML(){return markup;},set innerHTML(value){markup=String(value);this.children=[];},
      classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
      appendChild(child){this.children.push(child);return child;},remove:noop,
      querySelector:()=>node(),querySelectorAll:()=>[],getContext:()=>({clearRect:noop,fillRect:noop}),
      addEventListener:noop,setAttribute:noop,
    };
  }
  const getNode=selector=>{const key=selector.startsWith('#')?selector:'#'+selector;if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
  getNode('#scBuild').classList.add('on');getNode('#teamSaveSlot').value='0';
  const context=vm.createContext({console,assert,
    document:{hidden:false,querySelector:getNode,getElementById:getNode,createElement:node,
      querySelectorAll:selector=>selector==='.screen'?['scBuild','scBattle','scResult'].map(getNode):[],
      addEventListener:(name,fn)=>events.set(name,fn)},
    window:{scrollTo:noop,addEventListener:noop},
    localStorage:{
      getItem(key){if(faults.read)throw new Error('Storage read denied');return storage.get(key)??null;},
      setItem(key,value){if(faults.write)throw new Error('Storage quota or write denied');storage.set(key,String(value));writes.push([key,String(value)]);},
      removeItem(key){if(faults.write)throw new Error('Storage write denied');storage.delete(key);},
    },
    setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  });
  const run=code=>vm.runInContext(code,context,{filename:'draft-storage-checks',timeout:10_000});
  assert.doesNotThrow(()=>run(source),'storage state must not prevent page startup');
  const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
  return {storage,faults,writes,context,getNode,run,json,
    setParty(party){context.fixture=structuredClone(party);run('party=JSON.parse(JSON.stringify(fixture));renderAll()');},
    async click(id){const n=getNode(id);assert.equal(typeof n.onclick,'function',id+' has a working control');if(!n.disabled)await n.onclick({isTrusted:true});},
    select(slot){getNode('#teamSaveSlot').value=String(slot);getNode('#teamSaveSlot').onchange?.();},
    party(){return json('party');},
  };
}

for(const id of ['teamSaveSlot','btnSaveTeam','btnLoadTeam','saveStatus'])
  assert.match(html,new RegExp('id="'+id+'"'),id+' is rendered in the page');
assert.match(html,/<[^>]*id="saveStatus"[^>]*role="status"|<[^>]*role="status"[^>]*id="saveStatus"/,'save feedback is accessible');

const complete=[
  {id:'fuen',moves:['pivot','gust','dive','soar'],equip:'wing',ability:'stoic'},
  {id:'homura',moves:['firefang','rock','guard','focus'],equip:'fang',ability:'stoic'},
  {id:'shiogame',moves:['squirt','aqua','haze','whirl'],equip:'plate',ability:'stoic'},
];
const partial=[{id:'saikaku',moves:['crushrock'],equip:'none',ability:'stoic'}];
const alternate=[
  {id:'shiogame',moves:['squirt','aqua','haze','whirl'],equip:'bell',ability:'mirror'},
  {id:'homura',moves:['firefang','rock','guard','focus'],equip:'belt',ability:'grit'},
  {id:'fuen',moves:['pivot','gust','dive','soar'],equip:'none',ability:'regen'},
];
const initialStorage=new Map([[DRAFT,JSON.stringify(complete)]]);
const initial=world(initialStorage);
assert.deepEqual(initial.party(),complete,'an existing draft restores species order, move order, third ability, and equipment');
assert.deepEqual(JSON.parse(initialStorage.get(DRAFT)),complete,'startup preserves a valid prior draft');
assert.ok(initial.getNode('#saveStatus').textContent.length>0,'autosave exposes current save feedback');
initial.setParty(alternate);
assert.deepEqual(JSON.parse(initialStorage.get(DRAFT)),alternate,'editing automatically writes the current draft');
assert.deepEqual(world(initialStorage).party(),alternate,'a new visit restores the last automatic edit');
await initial.click('#btnClearDraft');
assert.deepEqual(initial.party(),[],'clear control empties the current draft');
assert.deepEqual(JSON.parse(initialStorage.get(DRAFT)),[],'clear is saved intentionally as an empty array');
assert.deepEqual(world(initialStorage).party(),[],'cleared draft stays empty across reload instead of becoming random');
console.log('PASS existing drafts, ordered moves/third abilities/equipment, automatic edit saving, visible feedback, and empty-draft reload');

const slots=world();
for(const [slot,party] of [[0,complete],[1,partial],[2,alternate]]){
  slots.setParty(party);slots.select(slot);await slots.click('#btnSaveTeam');
  assert.ok(slots.storage.has(TEAMS),'manual save writes the persistent team library');
  assert.match(slots.getNode('#saveStatus').textContent,/保存しました/,'manual save explicitly reports success only after writing');
}
const libraryBefore=slots.storage.get(TEAMS);
for(const [slot,expected] of [[2,alternate],[0,complete],[1,partial]]){
  const visit=world(slots.storage);visit.select(slot);await visit.click('#btnLoadTeam');
  assert.deepEqual(visit.party(),expected,'saved slot '+(slot+1)+' restores after a fresh page visit');
  assert.deepEqual(JSON.parse(slots.storage.get(DRAFT)),expected,'loading slot '+(slot+1)+' also updates the automatic draft');
  assert.equal(slots.storage.get(TEAMS),libraryBefore,'loading does not overwrite saved teams');
  visit.setParty([]);assert.equal(slots.storage.get(TEAMS),libraryBefore,'editing/clearing draft does not modify saved slots');
}
const protect=world(slots.storage);protect.select(0);protect.setParty([]);await protect.click('#btnSaveTeam');
assert.equal(slots.storage.get(TEAMS),libraryBefore,'an empty current party cannot silently erase a saved team');
const empty=world();empty.setParty(alternate);empty.select(2);const emptyBefore=empty.party();await empty.click('#btnLoadTeam');
assert.deepEqual(empty.party(),emptyBefore,'loading an empty slot leaves the current draft intact');
console.log('PASS three independent saved slots, complete and partial parties, load into active draft, and protected empty saves/loads');

const repairedStorage=new Map([[DRAFT,JSON.stringify([
  {id:'homura',moves:['tackle','tackle','not-a-move','firefang'],equip:'deleted',ability:'deleted'},
  {id:'homura',moves:['ember'],equip:'fang',ability:'grit'},
  {id:'shiogame',moves:['squirt'],equip:'none',ability:'mirror'},
])]]);
const repaired=world(repairedStorage),repairedParty=repaired.party();
assert.deepEqual(repairedParty.map(p=>p.id),['homura','shiogame'],'corrupt saved drafts remove duplicate species');
assert.deepEqual(repairedParty[0].moves,['tackle','firefang'],'corrupt saved moves are deduplicated and filtered');
assert.equal(repairedParty[0].equip,'none','deleted equipment is safely repaired');
assert.equal(repairedParty[0].ability,repaired.json('ABIL_OF.homura[0]'),'deleted ability falls back to a valid option');
for(const raw of ['{broken','{}','[null,{"id":"deleted"}]']){
  const broken=world(new Map([[DRAFT,raw]]));assert.equal(broken.party().length,3,'unusable draft recovers to a playable random party');
}
const corruptLibrary=world(new Map([[TEAMS,'{broken']]));corruptLibrary.setParty(complete);corruptLibrary.select(0);
assert.doesNotThrow(()=>corruptLibrary.run("document.querySelector('#btnLoadTeam').onclick()"),'corrupt team library does not throw');
assert.deepEqual(corruptLibrary.party(),complete,'corrupt saved slot does not destroy the active party');
console.log('PASS malformed storage recovery, duplicate-species/move repair, and invalid saved-slot protection');

const unavailable=world(new Map(),{read:true,write:true});
assert.equal(unavailable.party().length,3,'unavailable storage leaves a usable in-memory initial party');
assert.ok(unavailable.getNode('#saveStatus').textContent.length>0,'storage unavailability is visible');
const memoryBefore=unavailable.party();unavailable.select(0);await assert.doesNotReject(()=>unavailable.click('#btnSaveTeam'));
assert.deepEqual(unavailable.party(),memoryBefore,'failed persistence does not modify the active party');
assert.equal(unavailable.storage.has(TEAMS),false,'failed manual save does not pretend to have persisted data');
assert.match(unavailable.getNode('#saveStatus').textContent,/保存.*ません|保存.*失敗/,'failed manual save reports failure instead of an old success message');
assert.match(unavailable.getNode('#saveStatus').className,/err/,'failed manual save is visibly marked as an error');
const deniedReadStorage=new Map([[DRAFT,JSON.stringify(complete)]]);
const originalDraft=deniedReadStorage.get(DRAFT);
const deniedRead=world(deniedReadStorage,{read:true});
assert.equal(deniedReadStorage.get(DRAFT),originalDraft,'a denied initial read cannot overwrite a saved draft with a random fallback');
assert.equal(deniedRead.writes.some(([key])=>key===DRAFT),false,'read-denied/write-allowed startup never writes the draft key');
assert.ok(deniedRead.party().length>0,'a blocked read still permits an in-memory party');
assert.match(deniedRead.getNode('#saveStatus').textContent,/読み取れません|読み込めません|保存.*ません/,'blocked draft restoration gives actionable failure feedback');
deniedRead.setParty(alternate);
assert.equal(deniedReadStorage.get(DRAFT),originalDraft,'editing while restoration is blocked preserves the unread saved draft');
const quota=world();quota.setParty(complete);quota.select(0);await quota.click('#btnSaveTeam');
const persistentBefore=quota.storage.get(TEAMS);quota.setParty(alternate);quota.faults.write=true;
await assert.doesNotReject(()=>quota.click('#btnSaveTeam'),'storage quota errors remain contained');
assert.equal(quota.storage.get(TEAMS),persistentBefore,'failed overwrite preserves the previously saved team');
assert.deepEqual(quota.party(),alternate,'failed overwrite keeps the current edited team usable');
assert.match(quota.getNode('#saveStatus').textContent,/保存.*ません|保存.*失敗/,'failed overwrite reports failure instead of success');
assert.match(quota.getNode('#saveStatus').className,/err/,'failed overwrite is visibly marked as an error');
console.log('PASS denied/quota and read-only access failures stay visible and leave unread drafts, active parties, and saved teams intact');
console.log('Unverified: real browser persistence, storage restrictions, page layout/input, and cross-device transfer.');
