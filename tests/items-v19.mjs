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
 a.equip='belt';a.en=0;await endTurn();assert.equal(a.en,17);
 a.equip='pajamas';assert.equal(enCost(a,'tackle'),25);assert.equal(enCost(a,'guard'),35);
 d.ability='heavy';assert.equal(enCost(a,'tackle'),30);d.ability='quick';
 await doMove(a,d,null);a.en=100;await doMove(a,d,'tackle');assert.equal(enCost(a,'tackle'),30,'pajamas stacks with repeat surcharge');
 [a,d]=setup();a.equip='pajamas';d.equip='berry';await doMove(a,d,'swap');assert.equal(a.equip,'berry');assert.equal(d.equip,'pajamas');assert.equal(enCost(d,'tackle'),25);
 // Bell has two charges; healthy entries and switching out never replenish/spend them.
 [a,d]=setup();a.equip='bell';onEnter(a);assert.equal(a.itemState.bellUses,0);
 for(const status of ['麻痺','やけど']){a.status=status;a.statusTurns=4;onEnter(a);assert.equal(a.status,null);assert.equal(a.statusTurns,0);leaveField(a);}
 assert.equal(a.itemState.bellUses,2);a.status='麻痺';onEnter(a);assert.equal(a.status,'麻痺');
 a.en=100;d.equip='berry';await doMove(a,d,'swap');d.status='やけど';onEnter(d);assert.equal(d.status,'やけど','exhausted bell stays exhausted after swap');assert.equal(d.itemState.bellUses,2);
 [a,d]=setup();a.equip='bell';a.status='麻痺';onEnter(a);d.equip='berry';await doMove(a,d,'swap');d.status='やけど';onEnter(d);assert.equal(d.status,null);assert.equal(d.itemState.bellUses,2);
 // One-use drinks, including boosts with negative ranks, cap retention and fainting.
 for(const [equip,rank] of [['protein','def'],['cocktail','spdef']]){
  [a,d]=setup();a.equip=equip;await endTurn();assert.equal(a.rank[rank],1);assert.equal(a.equip,'none');await endTurn();assert.equal(a.rank[rank],1);leaveField(a);await endTurn();assert.equal(a.rank[rank],0);
  [a,d]=setup();a.equip=equip;a.rank[rank]=6;await endTurn();assert.equal(a.equip,equip);assert.equal(a.rank[rank],6);a.rank[rank]=-2;await endTurn();assert.equal(a.rank[rank],-1);assert.equal(a.equip,'none');
  [a,d]=setup();a.equip=equip;a.hp=0;await endTurn();assert.equal(a.equip,equip);assert.equal(a.rank[rank],0);
  [a,d]=setup();a.equip=equip;d.equip='berry';await doMove(a,d,'swap');await endTurn();assert.equal(d.rank[rank],1);assert.equal(d.equip,'none');assert.ok(itemSwapFailure(a,d));
 }
 // All-out stats and actual execution locks: misses count; paralysis/energy failure do not.
 for(const [equip,stat] of [['fullShoes',SPD],['fullKnuckle',ATK],['fullGlasses',SPATK]]){
  [a,d]=setup();const normal=stat(a);a.equip=equip;assert.equal(stat(a),normal*1.5);
  a.status='麻痺';rng=()=>0;await doMove(a,d,'tackle');assert.equal(a.choiceMove,null);a.status=null;rng=()=>.999;
  await doMove(a,d,'edge');assert.equal(a.choiceMove,'edge');assert.equal(moveBlocked(a,'tackle'),true);assert.equal(moveBlocked(a,'edge'),false);
  const before=d.hp;a.en=100;await doMove(a,d,'tackle');assert.equal(d.hp,before);assert.equal(a.en,100,'wrong move fails before energy use');
  await doMove(a,d,null);assert.equal(a.choiceMove,'edge');assert.equal(enCost(a,'edge'),45,'focus resets repeated surcharge but not choice');
  leaveField(a);assert.equal(a.choiceMove,null);a.en=100;rng=()=>.5;await doMove(a,d,'tackle');assert.equal(a.choiceMove,'tackle');assert.equal(enCost(a,'tackle'),25);
  a.encore={key:'guard',turns:3};assert.equal(forcedAction(a,move('guard')).key,'desperate');await doMove(a,d,'desperate');assert.equal(a.choiceMove,'tackle');
 }
 [a,d]=setup();a.equip='fullGlasses';a.en=0;await doMove(a,d,'flame');assert.equal(a.choiceMove,null);
 [a,d]=setup();a.equip='fullShoes';await doMove(a,d,'guard');assert.equal(a.choiceMove,'guard');assert.equal(enCost(a,'guard'),60);
 // Receiving/removing choice items mid-turn does not inherit the previous holder's lock.
 [a,d]=setup();a.equip='berry';d.equip='fullKnuckle';d.choiceMove='tackle';await doMove(a,d,'swap');assert.equal(a.choiceMove,null);assert.equal(d.choiceMove,null);a.en=100;await doMove(a,d,'flame');assert.equal(a.choiceMove,'flame');
 [a,d]=setup();a.equip='fullShoes';a.choiceMove='tackle';d.equip='berry';await doMove(d,a,'swap');assert.equal(a.choiceMove,null);assert.equal(moveBlocked(a,'guard'),false);
 [a,d]=setup();d.equip='pajamas';a.equip='berry';d.moves=['swap','guard'];rng=()=>.5;assert.equal(aiChoose().key,'swap','AI transfers its own debuff item');
 // AI follows the same cost and lock rules; the generator guarantees trade and offense synergy.
 [a,d]=setup();d.equip='fullGlasses';d.choiceMove='tackle';d.moves=['tackle','flame','guard','sand'];for(let i=0;i<20;i++){const action=aiChoose();assert.ok(action.key===null||action.key==='tackle');}
 for(const sp of SPECIES)for(const equip of ['pajamas','fullShoes','fullKnuckle','fullGlasses']){
  if(!randomBuildRules(sp,equip))continue;const b=randomBuildForSpecies(sp,equip);
  if(equip==='pajamas')assert.ok(b.moves.includes('swap'));
  else assert.ok(b.moves.every(k=>!isStatusMove(MOVES[k])));
  if(equip==='fullKnuckle')assert.ok(b.moves.every(k=>MOVES[k].category==='physical'&&MOVES[k].p>0));
  if(equip==='fullGlasses')assert.ok(b.moves.every(k=>MOVES[k].category==='special'&&MOVES[k].p>0));
  assert.ok(sanitizeTeam([b,b,b]));
 }
})()`);
console.log('PASS item v19: belt/pajamas costs, transferable bell charges, one-use drinks, all-out stats/locks/switches/swaps, AI and automatic build synergy');
