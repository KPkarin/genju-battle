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
const {run,json}=world();
await run(`(async()=>{
 let [a,d]=setup();paint();
 assert.equal(BattleIntel.entry(d).seen,true);
 assert.equal(BattleIntel.entry(B.foe[1]).seen,false);
 assert.equal(BattleIntel.view(B.foe[1]),null);
 assert.equal(BattleIntel.view(d).ability,'unknown');assert.equal(BattleIntel.view(d).itemKnown,false);
 assert.deepEqual(BattleIntel.view(d).moves,[]);
 const state=JSON.stringify(B),seed=_seed;
 renderTeams();renderStrip();GameUI.renderBattleMonsters();
 assert.equal(JSON.stringify(B),state);assert.equal(_seed,seed,'inspection does not consume battle RNG');
 assert.ok(BattleIntel.eqText(d).includes('特性不明'));
 assert.equal(BattleIntel.hpText(d),'HP 100%');
 // The same public state must produce identical AI choices, independent of private loadouts/commands.
 d.moves=['tackle','rainDance','swap','reverseRoom'];d.equip='pajamas';a.type='無';d.type='無';
 const actions=[];
 for(const variant of [0,1]){
  a.moves=variant?['flame','guard','repose','sand']:['tackle','sand','slide','guard'];
  a.ability=variant?'hani':'hide';a.equip=variant?'armor':'orb';
  a.baseDef=variant?999:1;a.baseSpDef=variant?1:999;a.baseSpd=variant?999:1;
  a.plannedMove=variant?'guard':'tackle';a.choiceMove=variant?'flame':null;a.en=variant?0:150;a.itemBound=!!variant;
  const list=[];for(let n=1;n<=40;n++){setSeed(n);list.push(aiChoose());}actions.push(JSON.stringify(list));
 }
 assert.equal(actions[0],actions[1],'hidden loadout/stat/input changes cannot affect the decision');
 a.moves=['tackle','guard','repose','swap'];a.equip='none';a.ability='quick';a.baseSpd=100;a.en=100;d.moves=['tackle'];d.equip='none';d.ability='quick';
 setSeed(1);await doMove(a,d,'tackle');assert.deepEqual(BattleIntel.entry(a).moves,['tackle']);
 d.guarding=true;a.en=100;await doMove(a,d,'guard');assert.ok(BattleIntel.entry(a).moves.includes('guard'));
 // Missing still reveals the announced move.
 a.en=100;a.rank.acc=-6;d.rank.eva=6;d.guarding=false;const hpBefore=d.hp;rng=()=>.999;await doMove(a,d,'slide');assert.equal(d.hp,hpBefore);assert.ok(BattleIntel.entry(a).moves.includes('slide'));
 // A move stopped before announcement is not learned.
 a.status='凍結';a.en=100;await doMove(a,d,'repose');assert.ok(!BattleIntel.entry(a).moves.includes('repose'));a.status=null;
 d.ability='pressure';onEnter(d);assert.equal(BattleIntel.entry(d).ability,'pressure');
 d.equip='charm';d.hp=0;d.preHitHp=d.maxhp;tryCharm(d);assert.equal(BattleIntel.entry(d).item,'charm');
 [a,d]=setup();d.equip='berry';d.hp=800;await endTurn();assert.equal(BattleIntel.entry(d).item,'berry');
 [a,d]=setup();a.equip='pajamas';d.equip='plate';await doMove(a,d,'swap');assert.equal(BattleIntel.entry(d).item,'pajamas');assert.equal(BattleIntel.entry(a).item,'plate');
 [a,d]=setup();d.equip='protein';await endTurn();assert.equal(BattleIntel.entry(d).item,'none');assert.ok(BattleIntel.entry(d).itemHistory.includes('protein'));
 // A benched unit is a last-observed snapshot, not a live private-state view.
 [a,d]=setup();d.hp=650;paint();leaveField(d);B.fi=1;paint();const old=BattleIntel.view(d).hpPercent;d.hp=999;d.status='麻痺';
 assert.equal(BattleIntel.view(d).hpPercent,old);assert.equal(BattleIntel.view(d).status,null);
 B.fi=0;paint();assert.equal(BattleIntel.view(d).hpPercent,100);assert.equal(BattleIntel.view(d).status,'麻痺');
 [a,d]=setup();paint();assert.equal(BattleIntel.entry(d).ability,null);assert.deepEqual(BattleIntel.entry(d).moves,[],'new battle clears observations');
})()`);
console.log('PASS public roster, event discoveries, missed/prevented move distinction, item swap/use, bench snapshots, battle reset, and AI private-information invariance');
