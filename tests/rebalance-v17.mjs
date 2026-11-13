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
      u.en=100;u.type='無';u.maxhp=u.hp=1000;u.baseAtk=u.baseSpAtk=u.baseDef=u.baseSpDef=100;u.baseSpd=100;
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
 let [a,d]=setup();rng=()=>.25;
 assert.equal(COMMON_MOVES.length,5);assert.equal(MOVES.startle.pri,0);assert.equal(MOVES.startle.fx,'atkdownfx');
 for(const planned of [null,'tackle','focus','repose']){
  [a,d]=setup();d.plannedMove=planned;await doMove(a,d,'startle');assert.ok(d.hp<1000);assert.equal(d.rank.atk,-1);assert.equal(d.actionCancelled,false);
 }
 [a,d]=setup();rng=()=>.5;await doMove(a,d,'startle');assert.equal(d.rank.atk,0,'50% boundary');rng=()=>.25;
 for(const [key,rank] of [['focus','atk'],['meditate','spatk'],['barrier','spdef'],['root','def']]){
  [a,d]=setup();await doMove(a,d,key);assert.equal(a.rank[rank],2);a.en=100;a.rank[rank]=5;await doMove(a,d,key);assert.equal(a.rank[rank],6);assert.equal(MOVES[key].en,key==='root'?30:35);
 }
 [a,d]=setup();a.maxhp=160;a.dmgTaken=159;await doMove(a,d,'revenge');assert.equal(d.hp,920,'counter capped at half max HP');
 [a,d]=setup();a.maxhp=160;a.dmgTaken=159;d.sub=50;d.equip='thorn';a.hp=100;await doMove(a,d,'revenge');assert.equal(d.sub,0);assert.equal(d.hp,1000);assert.equal(a.hp,100,'shielded counter does not touch thorns');
 [a,d]=setup();a.dmgTaken=100;d.type='幻';await doMove(a,d,'revenge');assert.equal(d.hp,1000,'normal counter obeys spirit immunity');
 [a,d]=setup();a.dmgTaken=20;await doMove(a,d,'revenge');assert.equal(d.hp,970,'ordinary 1.5x retained');
 for(const energy of [0,5,100]){
  [a,d]=setup();d.type="草";d.en=energy;await doMove(a,d,'phantom');const gain=Math.min(10,energy);assert.equal(d.en,energy-gain);assert.equal(a.en,65+gain);
 }
 [a,d]=setup();a.ability='glutton';a.hp=500;const realDamage=damage;damage=()=>({dmg:100,e:1,crit:false,stab:false});await doMove(a,d,'devour');assert.equal(a.hp,545);assert.equal(a.en,60);damage=realDamage;
 [a,d]=setup();a.encore={key:'tackle',turns:3};assert.equal(forcedAction(a,{kind:'switch',to:1}).kind,'switch');await takeTurn({kind:'switch',to:1},move(null));assert.equal(B.yi,1);assert.equal(a.encore,null);
 [a,d]=setup();d.ability='blur';assert.equal(rollFx(a,d,{pr:.5}),false,'blur halves chance at RNG .25');rng=()=>.249;assert.equal(rollFx(a,d,{pr:.5}),true);rng=()=>.99;await doMove(a,d,'tackle');assert.ok(d.hp<1000,'blur no longer changes accuracy');rng=()=>.25;
 [a,d]=setup();d.ability='spite';lowerRank(d,'atk',1,a);assert.equal(d.rank.atk,1,'intimidate-style drop becomes a net +1');
 [a,d]=setup();d.ability='heavy';assert.equal(enCost(a,'tackle'),25);a.ability='breaker';assert.equal(enCost(a,'tackle'),20);
 [a,d]=setup();a.ability='ghost';for(const label of ['岩棘','砂嵐のダメージ','夕立のダメージ','やけどのダメージ'])assert.equal(indirect(a,10,label),0);for(const label of ['寄生','毒棘','反動'])assert.equal(indirect(a,10,label),10);
 [a,d]=setup();a.type='炎';d.type='水';rng=()=>.5;const base=damage(a,d,MOVES.flame).dmg;d.equip='ward';assert.equal(damage(a,d,MOVES.flame).dmg,base,'ward no longer harms its holder');a.equip='ward';assert.equal(damage(a,d,MOVES.flame).e,.75,'ward improves the holder attack');
 [a,d]=setup();a.ability='quick';a.status='やけど';await endTurn();assert.equal(a.status,'やけど');await endTurn();assert.equal(a.status,null);
 [a,d]=setup();d.maxhp=d.hp=1200;a.maxhp=160;a.hp=50;d.seedTurns=2;await endTurn();assert.equal(d.hp,1100);assert.equal(a.hp,70,'seed heal capped at host max HP / 8');
 assert.equal(MOVES.night.t,'影');assert.ok(learnable(spec('fukurou')).includes('night'));assert.ok(learnable(spec('kokejyu')).includes('sprout'));assert.deepEqual([...ABIL_OF.tsutazaru],['glutton','spite']);
 for(const sp of SPECIES){assert.ok(learnable(sp).some(k=>MOVES[k].p>0&&MOVES[k].t===sp.t));if(ABIL_OF[sp.id].includes('tempo'))assert.ok(learnable(sp).some(k=>MOVES[k].pr>0&&MOVES[k].pr<1),sp.id+': no dead secondary trait');}
 assert.equal(SPECIES.filter(s=>learnable(s).includes('revenge')).length,7);assert.ok(!learnable(spec('raitachi')).includes('bond'));assert.ok(!learnable(spec('homura')).includes('revenge'));
 assert.equal(KEFAROCK.hp,500);assert.equal(YUDACHOU.hp,450);assert.equal(SARANDI.hp,480);
})()`);
console.log('PASS v17 mechanics: no stun, +2/clamps, bounded counter/shield/immunity, drain accounting, encore switch, trait changes, offensive ward, seed cap and individualized roles');

await run(`(async()=>{
 // Mirror the existing AI chooser for the player's side without changing any live state.
 const text=aiChoose.toString().replace('const f = FOE(), y = YOU();','const f = YOU(), y = FOE();').replaceAll('B.foe','B.TEMP').replaceAll('B.you','B.foe').replaceAll('B.TEMP','B.you').replaceAll('B.fi','B.TEMPINDEX').replaceAll('B.yi','B.fi').replaceAll('B.TEMPINDEX','B.yi').replaceAll('B.hazard.foe','B.hazard.TEMP').replaceAll('B.hazard.you','B.hazard.foe').replaceAll('B.hazard.TEMP','B.hazard.you');
 const chooseYou=eval('('+text+')');const originalSwitch=decideSwitch;decideSwitch=async(side,seq,alive)=>alive[0].i;
 let finished=0,total=0;
 for(let seed=1;seed<=100;seed++){
  setSeed(seed);const left=randBuild(),right=randBuild();beginBattle(left,right,seed,'you');
  for(let turn=0;turn<150&&!B.over;turn++){const a=chooseYou(),d=aiChoose();await takeTurn(a,d);total++;for(const u of [...B.you,...B.foe]){assert.ok(Number.isFinite(u.hp));assert.ok(u.en>=0&&u.en<=100);}}
  if(B.over)finished++;
 }
 decideSwitch=originalSwitch;assert.ok(finished>=95,'at least 95/100 balanced AI duels finish within 150 turns');
 console.log('PASS '+finished+'/100 seeded duels completed; '+total+' resolved turns; finite HP and bounded energy');
})()`);
