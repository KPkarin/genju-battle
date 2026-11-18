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
 let [a,d]=setup();rng=()=>.5;d.ability='quick';d.status='やけど';
 for(let i=1;i<=5;i++){a.en=100;await doMove(a,d,'tearBite');assert.equal(d.bleedLevel,i);assert.equal(d.status,'やけど');}assert.equal(applyBleed(d,a),false);
 for(let level=1;level<=5;level++){[a,d]=setup();d.bleedLevel=level;await endTurn();assert.equal(d.hp,1000-[10,20,40,80,160][level-1]);}
 [a,d]=setup();d.bleedLevel=3;leaveField(d);assert.equal(d.bleedLevel,3);d.hp=800;assert.equal(recoverHP(d,20),20);assert.equal(d.bleedLevel,2);d.hp=1000;assert.equal(recoverHP(d,20),0);assert.equal(d.bleedLevel,2);d.hp=900;recoverHP(d,20);recoverHP(d,20);assert.equal(d.bleedLevel,0);
 [a,d]=setup();d.ability='stoic';d.status='やけど';assert.equal(applyBleed(d,a),true);assert.equal(d.bleedLevel,0);assert.equal(d.bleedPending.length,1);await endTurn();assert.equal(d.bleedPending.length,1);d.hp=800;recoverHP(d,1);assert.equal(bleedTotal(d),0);
 applyBleed(d,a);leaveField(d);assert.equal(d.bleedPending.length,1);B.turn++;await endTurn();assert.equal(d.bleedLevel,1);assert.equal(d.bleedPending.length,0);
 [a,d]=setup();d.bleedLevel=2;d.hp=800;d.equip='berry';await endTurn();assert.equal(d.bleedLevel,1);assert.equal(d.hp,840);assert.ok(logs().includes('命の実'));
 for(const protect of ['sub','guard']){[a,d]=setup();d.ability='quick';if(protect==='sub')d.sub=100;else d.guarding=true;await doMove(a,d,'tearBite');assert.equal(bleedTotal(d),0);}
 [a,d]=setup();d.ability='regen';d.bleedLevel=2;d.hp=800;leaveField(d);assert.equal(d.bleedLevel,1);
 [a,d]=setup();a.hp=800;a.equip='berry';a.status='やけど';a.bleedLevel=2;const oldTimer=setTimeout,frames=[];setTimeout=fn=>{frames.push(a.hp);fn();return 0;};await endTurn();setTimeout=oldTimer;assert.ok(frames.includes(850)&&frames.includes(788)&&frames.includes(778),'separate visible recovery, burn and bleeding HP changes');
 assert.deepEqual([...spec('damasdevil').t],['影','野']);assert.equal(SPRITES.damasdevil.px.length,32);
})()`);console.log('PASS bleed stacks/chip/coexistence/healing/zero-heal/persistence/delay/berry/shields/regen and species');
