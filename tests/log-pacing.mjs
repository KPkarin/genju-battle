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
run(`
setup();BattleLog.reset();
globalThis.clock=0;globalThis.tasks=new Map();globalThis.nextTask=0;
globalThis.performance={now:()=>clock};
setTimeout=(fn,ms)=>{const id=++nextTask;tasks.set(id,{fn,due:clock+ms});return id;};
clearTimeout=id=>tasks.delete(id);
function tick(ms){const end=clock+ms;for(let n=0;n<100;n++){const next=[...tasks].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;clock=next[1].due;tasks.delete(next[0]);next[1].fn();}clock=end;}
const seed=_seed,state=JSON.stringify(B);
say('first');say('second');say('third');assert.equal(document.querySelector('#log').children.length,1);
tick(279);assert.equal(document.querySelector('#log').children.length,1);
tick(1);assert.equal(document.querySelector('#log').children.length,2);
assert.equal(BattleLog.readDelay(),780,'queued last line gets a reading pause');
tick(280);assert.equal(logs(),'first second third');
assert.equal(BattleLog.readDelay(),500);
assert.equal(JSON.stringify(B),state);assert.equal(_seed,seed);
say('abandoned');BattleLog.reset();tick(1000);assert.equal(logs(),'first second third','reset cancels queued text');
say('old battle');say('old pending');setup();say('new battle');tick(1000);
assert.equal(logs(),'new battle','old session cannot write into a new log');
say('leave shown');say('leave pending');show('scBuild');tick(1000);assert.equal(logs(),'new battle leave shown','leaving cancels pending text');
`);
console.log('PASS ordered 280ms messages, reading pause, cosmetic isolation, reset, battle replacement and exit cancellation');
