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
 let [a,d]=setup();a.type='無';d.type='無';rng=()=>.5;
 const water=damage(a,d,MOVES.aqua).dmg,fire=damage(a,d,MOVES.flame).dmg;
 await doMove(a,d,'rainDance');assert.equal(B.weather.kind,'rain');assert.equal(B.weather.turns,5);
 assert.ok(Math.abs(damage(a,d,MOVES.aqua).dmg-water*1.5)<=1);assert.ok(Math.abs(damage(a,d,MOVES.flame).dmg-fire*.5)<=1);
 assert.equal(effectiveMove(MOVES.bolt,a,d).acc,null);assert.equal(effectiveMove(MOVES.thunder,a,d).acc,null);assert.equal(MOVES.bolt.acc,90);assert.equal(MOVES.thunder.acc,75);assert.equal(effectiveMove(MOVES.spark,a,d).acc,100);
 for(const key of ['bolt','thunder']){a.en=100;d.hp=1000;d.rank.eva=6;a.rank.acc=-6;d.windMantle=true;rng=()=>.99;await doMove(a,d,key);assert.ok(d.hp<1000,key+' always hits');assert.equal(d.windMantle,false);}
 [a,d]=setup();a.ability='fluid';const base=SPD(a);B.weather={kind:'rain',turns:5};assert.equal(SPD(a),base*2);a.status='麻痺';assert.equal(SPD(a),base);a.equip='mask';assert.equal(SPD(a),base/2);a.equip='none';a.status=null;
 const hp=a.hp;for(let i=0;i<5;i++){await endTurn();assert.equal(a.hp,hp,'ordinary rain has no weather damage');}assert.equal(B.weather,null);assert.equal(SPD(a),base);
 [a,d]=setup();a.ability='rainBeast';B.weather={kind:'sandstorm',turns:2};onEnter(a);assert.equal(B.weather.kind,'rain');assert.equal(B.weather.turns,5);leaveField(a);assert.equal(B.weather.kind,'rain');
 a.equip='mask';B.weather=null;onEnter(a);assert.equal(B.weather,null);a.equip='none';onEnter(a);await endTurn();assert.equal(B.weather.turns,4);onEnter(a);assert.equal(B.weather.turns,5);
 a.en=100;await doMove(a,d,'unwantedshower');assert.equal(B.weather.kind,'rain');B.weather=null;a.en=100;await doMove(a,d,'unwantedshower');assert.equal(B.weather.kind,'shower');assert.equal(weatherDamageFactor(MOVES.flame),1);a.ability='fluid';assert.equal(SPD(a),a.baseSpd);a.en=100;await doMove(a,d,'rainDance');assert.equal(B.weather.kind,'rain');a.en=100;await doMove(a,d,'sandbreak');assert.equal(B.weather.kind,'sandstorm');
 assert.ok(ABIL_OF.ungei.includes('rainBeast'));assert.ok(ABIL_OF.rainen.includes('fluid'));for(const id of ['shiogame','rainen','ungei'])assert.ok(learnable(spec(id)).includes('rainDance'));
})()`);console.log('PASS rain duration, weather replacement, modifiers, sure hits/wind, speed/mask/ailment, entry trait, learners');

await run(`(async()=>{
 let [a,d]=setup();B.weather={kind:'rain',turns:3};const weather=B.weather;a.en=100;let fx=0;const originalFx=playFx;playFx=()=>fx++;
 assert.equal(fxNullified(MOVES.unwantedshower,d,a),true);await doMove(a,d,'unwantedshower');assert.equal(B.weather,weather);assert.equal(B.weather.turns,3);assert.equal(a.en,65);assert.equal(a.lastMove,'unwantedshower');assert.equal(fx,0);assert.ok(logs().includes('夕立を起こせなかった'));playFx=originalFx;
 d.moves=['unwantedshower','flame'];d.en=100;for(let i=0;i<20;i++)assert.notEqual(aiChoose().key,'unwantedshower');
 for(let i=0;i<3;i++)await endTurn();assert.equal(B.weather,null);a.en=100;assert.equal(fxNullified(MOVES.unwantedshower,d,a),false);await doMove(a,d,'unwantedshower');assert.equal(B.weather.kind,'shower');assert.equal(B.weather.turns,5);
 [a,d]=setup();a.baseSpd=200;d.baseSpd=50;await takeTurn(move('rainDance'),move('unwantedshower'));assert.equal(B.weather.kind,'rain');assert.equal(d.lastMove,'unwantedshower');
})()`);console.log('PASS rain blocks shower at execution without resetting duration/FX, pays cost, AI avoids it, rain expiry restores use and faster rain interrupts setup');
