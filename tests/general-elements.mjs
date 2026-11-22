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
 let [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;
 const keys=['icePebble','frostFang','iceLance','coldRay','whiteStorm','snowCall','iceArmor','scrapShot','alloyClaw','alchemyShot','resonantCannon','armoredRush','plateArmor','repair'];
 assert.equal(Object.keys(MOVES).length,94); // six boss signature moves are deliberately nonenumerable
 for(const key of keys){const m=MOVES[key];assert.ok(BY_TYPE[m.t].includes(key));assert.equal(m.key,key);assert.ok(MOVE_MOTION_PROFILES[key]);for(const sp of SPECIES)assert.ok(!learnable(sp).includes(key),'future characters only: '+key);}
 for(const key of ['icePebble','frostFang','iceLance','coldRay','whiteStorm','scrapShot','alloyClaw','alchemyShot','resonantCannon','armoredRush']){
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;const p=d.hp;await doMove(a,d,key);assert.ok(d.hp<p,key);assert.equal(a.en,100-MOVES[key].en);assert.equal(isContactMove(MOVES[key]),['frostFang','alloyClaw','armoredRush'].includes(key));}
 [a,d]=setup();a.ability=d.ability='grit';a.type='氷';a.baseDef=100;await doMove(a,d,'snowCall');assert.equal(B.weather.kind,'snow');assert.equal(B.weather.turns,5);assert.equal(DEF(a),150);assert.equal(SPDEF(a),100);for(let t=0;t<5;t++){await endTurn();B.turn++;}assert.equal(B.weather,null);
 for(const key of ['iceArmor','plateArmor']){[a,d]=setup();await doMove(a,d,key);assert.equal(a.rank.def,2);assert.equal(a.rank.spd,0);a.en=100;a.rank.def=5;await doMove(a,d,key);assert.equal(a.rank.def,6);}
 [a,d]=setup();a.ability=d.ability='grit';a.hp=500;a.bleedLevel=2;await doMove(a,d,'repair');assert.equal(a.hp,850);assert.equal(a.bleedLevel,1);assert.equal(a.en,60);
 [a,d]=setup();a.ability='grit';d.ability='lowVoice';await doMove(a,d,'resonantCannon');assert.equal(d.hp,1000);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.5;await doMove(a,d,'armoredRush');assert.ok(a.hp<1000);[a,d]=setup();a.ability='rockhead';d.ability='grit';rng=()=>.5;await doMove(a,d,'armoredRush');assert.equal(a.hp,1000);
 [a,d]=setup();a.ability=d.ability='grit';rng=()=>.1;await doMove(a,d,'frostFang');assert.equal(d.rank.spd,-1);[a,d]=setup();a.ability=d.ability='grit';d.sub=1000;rng=()=>.1;await doMove(a,d,'frostFang');assert.equal(d.rank.spd,0);
 assert.equal(usefulBuildAbility('snowShovel',['snowCall','coldRay'],'none'),true);assert.equal(usefulBuildAbility('superLegs',['coldRay'],'none'),false);assert.equal(usefulBuildAbility('armPiece',['kenkenma'],'none'),true);assert.equal(usefulBuildAbility('minorityWave',['resonantCannon'],'none'),true);
})()`);console.log('PASS 14 general moves: internal catalog, future learner isolation, energy, attack/contact, five snow turns, defense ranks/cap, repair/bleed, sound immunity, rush/recoil and secondary/substitute');
