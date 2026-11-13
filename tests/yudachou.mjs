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




// Logic tests use the actual engine; browser display and live PeerJS are separate checks.
await run(`(async()=>{
 let [a,d]=setup();rng=()=>.25;
 assert.equal(MOVES.steamchoice.p,100);assert.equal(MOVES.steamchoice.acc,85);assert.equal(MOVES.steamchoice.en,45);
 assert.equal(MOVES.steamchoice.pr,.5);assert.equal(MOVES.steamchoice.contact,false);assert.equal(MOVES.steamchoice.category,'special');
 for(const reversed of [0,3]){
  B.reverseTurns=reversed;
  for(const type of TYPES)for(const other of TYPES){
   d.type=[type,other];
   assert.equal(effectiveMove(MOVES.steamchoice,a,d).t,attackEff('炎',d,a)>attackEff('水',d,a)?'炎':'水');
  }
 }
 B.reverseTurns=0;d.type='草';
 await doMove(a,d,'steamchoice');assert.equal(a.en,55);assert.equal(d.status,'やけど');assert.ok(logs().includes('火炎属性'));
 assert.equal(MOVES.steamchoice.t,'水','resolving never mutates shared move data');
 [a,d]=setup();d.type='草';rng=()=>.75;await doMove(a,d,'steamchoice');assert.equal(d.status,null,'burn fails above 50%');assert.ok(d.hp<1000);
 [a,d]=setup();rng=()=>.9;await doMove(a,d,'steamchoice');assert.equal(d.hp,1000,'accuracy miss');
 [a,d]=setup();d.guarding=true;rng=()=>.25;await doMove(a,d,'steamchoice');assert.equal(d.hp,1000);assert.equal(d.status,null);
 [a,d]=setup();d.sub=50;d.type='草';await doMove(a,d,'steamchoice');assert.equal(d.status,null,'substitute blocks burn');
 [a,d]=setup();d.ability='stoic';await doMove(a,d,'steamchoice');assert.equal(d.status,null);assert.equal(d.pendingStatus.status,'やけど');

 [a,d]=setup();
 for(const type of TYPES){a.type=type;assert.equal(showerFraction(a),type==='水'?-1/8:CHART['水'][type]/8);}
 a.type=['水','炎'];assert.equal(showerFraction(a),1/8);
 a.type=['水','草'];assert.equal(showerFraction(a),-1/16);
 a.type=['水','幻'];assert.equal(showerFraction(a),0);
 a.type=['炎','水'];a.ability='steamtank';assert.equal(showerFraction(a),-3/8);
 a.maxhp=160;a.hp=10;applyShower(a);assert.equal(a.hp,70);
 a.hp=150;applyShower(a);assert.equal(a.hp,160,'healing caps at max HP');
 a.equip='mask';a.hp=100;applyShower(a);assert.equal(a.hp,80,'mask converts the same weather into net damage');
 a.equip='none';a.ability='focus2';a.hp=1;applyShower(a);assert.equal(a.hp,-19,'net amount applied once, no intermediate healing revival');
 a.hp=0;a.ability='steamtank';applyShower(a);assert.equal(a.hp,0,'weather cannot revive a fainted unit');
 a.type='草';a.hp=100;a.maxhp=161;a.ability='focus2';applyShower(a);assert.equal(a.hp,90,'floor once after net calculation');
 a.type=['水','草'];a.hp=100;applyShower(a);assert.equal(a.hp,110);
 a.type='炎';a.ability='ghost';a.hp=100;applyShower(a);assert.equal(a.hp,100,'ghost ignores indirect rain damage');
 a.ability='focus2';a.type=['水','炎'];B.reverseTurns=3;assert.equal(showerFraction(a),1/8,'room changes move matchups, not weather');

 [a,d]=setup();a.type=d.type='水';a.hp=d.hp=200;a.maxhp=d.maxhp=1600;
 const bench=B.you[1];bench.hp=333;
 await doMove(a,d,'unwantedshower');assert.equal(a.en,65);assert.equal(B.weather.turns,5);
 for(let i=0;i<5;i++){await endTurn();assert.equal(a.hp,400+i*200);assert.equal(bench.hp,333);}
 assert.equal(B.weather,null);const before=a.hp;await endTurn();assert.equal(a.hp,before,'exactly five ticks including cast turn');
 assert.ok(logs().includes('夕立がやみ'));
 await doMove(a,d,'unwantedshower');await endTurn();assert.equal(B.weather.turns,4);
 a.en=100;await doMove(a,d,'unwantedshower');assert.equal(B.weather.turns,5,'recasting refreshes duration');
 leaveField(a);assert.equal(B.weather.turns,5,'weather persists through switches');

 for(const mode of ['normal','mask','breaker','guard','shield']){
  [a,d]=setup();rng=()=>.25;d.ability='steamtank';d.hp=500;d.type=['炎','水'];
  if(mode==='mask')d.equip='mask';if(mode==='breaker')a.ability='breaker';if(mode==='guard')d.guarding=true;if(mode==='shield')d.sub=50;
  const expected=damage(a,d,MOVES.squirt).dmg;
  await doMove(a,d,'squirt');
  assert.equal(d.hp,mode==='guard'?500:['mask','breaker'].includes(mode)?500-expected:500+expected,mode);
  assert.equal(d.dmgTaken,['mask','breaker'].includes(mode)?expected:0,'absorption is not damage');
  if(mode==='shield')assert.equal(d.sub,50,'ability absorbs water before shield');
 }
 for(const mode of ['normal','mask','breaker','guard','shield','miss','cap']){
  [a,d]=setup();d.ability='steamtank';d.type=['炎','水'];rng=()=>mode==='miss'?.99:.25;
  if(mode==='mask')d.equip='mask';if(mode==='breaker')a.ability='breaker';if(mode==='guard')d.guarding=true;if(mode==='shield')d.sub=500;
  if(mode==='cap')d.rank.spatk=6;
  await doMove(a,d,mode==='miss'?'inferno':'flame');
  assert.equal(d.rank.spatk,mode==='cap'?6:mode==='normal'?1:0,mode+' fire special boost');
 }
 [a,d]=setup();a.equip='mask';d.equip='belt';d.ability='steamtank';d.type=['炎','水'];await doMove(a,d,'swap');assert.equal(d.equip,'mask');assert.equal(showerFraction(d),1/8);
 party=randBuild();startChallenge('yudachou');assert.equal(B.foe.length,1);assert.equal(FOE().id,'yudachou');assert.equal(B.weather,null);assert.equal(challengeMode,'yudachou');assert.equal(SPECIES.length,20);
 rng=()=>.5;assert.equal(aiChoose().key,'unwantedshower','boss establishes the weather combo');
 B.weather={kind:'shower',turns:3};assert.notEqual(aiChoose().key,'unwantedshower','boss attacks while rain is active');
 startChallenge(challengeMode);assert.equal(FOE().id,'yudachou');assert.equal(B.weather,null,'rematch starts with clean field');

 // Startle no longer prevents a weather setup, including on the opening turn.
 party=randBuild();startChallenge('yudachou');rng=()=>.5;
 let player=YOU(),bird=FOE();player.maxhp=player.hp=100000;bird.maxhp=bird.hp=100000;
 player.type='無';player.baseSpDef=1000;player.equip='none';player.ability='focus2';
 assert.equal(aiChoose().key,'unwantedshower');await takeTurn(move('startle'),aiChoose());
 assert.equal(B.weather.kind,'shower');assert.equal(bird.actionCancelled,false);
 for(let turn=0;turn<3;turn++){player.en=bird.en=100;const action=aiChoose();assert.ok(MOVES[action.key].p>0);const hp=player.hp;await takeTurn(move('startle'),action);assert.ok(player.hp<hp);}
 bird.en=100;bird.encore={key:'unwantedshower',turns:3};assert.equal(aiChoose().key,'unwantedshower');bird.encore=null;
 bird.en=0;assert.equal(aiChoose().key,null);bird.en=100;bird.disabled={key:'steamchoice',turns:3};assert.equal(aiChoose().key,'flame');bird.disabled=null;
 startChallenge(challengeMode);assert.equal(B.weather,null);
 startChallenge('kefarock');assert.equal(FOE().id,'kefarock');
})()`);
console.log('PASS steam choice actual types, hit/burn/guard/sub/stoic; net rain fractions and five turns; absorption, fire boost, mask/breaker and both boss/rematch paths');
