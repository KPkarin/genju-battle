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
 let [a,d]=setup();rng=()=>.5;a.ability=d.ability='grit';const base=damage(a,d,MOVES.wakeSlap).dmg;d.status='眠り';d.sleepTurns=3;const boosted=damage(a,d,MOVES.wakeSlap).dmg;const equivalent=damage(a,d,{...MOVES.wakeSlap,p:140,fx:null}).dmg;assert.equal(boosted,equivalent);assert.ok(boosted>base*1.8);await doMove(a,d,'wakeSlap');assert.equal(d.status,null);assert.equal(d.sleepTurns,0);assert.equal(a.en,65);assert.equal(MOVES.wakeSlap.p,70);
 for(const mode of ['guard','sub','miss']){[a,d]=setup();d.status='眠り';d.sleepTurns=3;if(mode==='guard')d.guarding=true;if(mode==='sub')d.sub=10;if(mode==='miss'){d.rank.eva=6;rng=()=>.999;}await doMove(a,d,'wakeSlap');assert.equal(d.status,'眠り',mode);assert.equal(d.sleepTurns,3);}
 [a,d]=setup();a.ability=d.ability='grit';a.baseSpd=200;d.status='眠り';d.sleepTurns=3;await takeTurn(move('wakeSlap'),move('tackle'));assert.ok(a.hp<1000,'faster slap wakes the target in time to act that turn');assert.equal(d.status,null);
 [a,d]=setup();d.status='やけど';await doMove(a,d,'wakeSlap');assert.equal(d.status,'やけど','other ailments unaffected');
 for(const id of ['soukou','tsutazaru','damasdevil'])assert.ok(learnable(spec(id)).includes('wakeSlap'));
})()`);console.log('PASS waking slap base/doubled power, post-body-hit wake, energy, immutable move data, guard/sub/miss and same-turn action revival');
