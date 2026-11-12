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


await run(`(async()=>{
 let [a,d]=setup();
 a.restTurns=1;
 const originalResolve=resolve;let skipped=0;
 resolve=async act=>{skipped++;assert.equal(act.key,null);};
 renderCmd();
 assert.equal(document.querySelector('#cmd').children.length,1);
 assert.equal(document.querySelector('#btnFocusEnergy').disabled,true);
 await Promise.resolve();assert.equal(skipped,1);resolve=originalResolve;
 [a,d]=setup();d.restTurns=1;
 await takeTurn(move('startle'),move('repose'));
 assert.equal(d.restTurns,0);assert.equal(d.actionCancelled,false);assert.ok(d.hp<1000,'startle damages normally without stopping rest');
 [a,d]=setup();a.restTurns=1;
 assert.equal(forcedAction(a,{kind:'switch',to:1}).kind,'move');
 await takeTurn({kind:'switch',to:1},move('startle'));
 assert.equal(B.yi,0);assert.equal(a.restTurns,0);assert.ok(a.hp<1000,'ordinary startle damages a resting unit');
 for(const key of ['repose','tackle'])for(const mode of ['energy','item','disabled','taunt']){
   [a,d]=setup();a.encore={key,turns:3};a.moves=['repose','guard'];
   if(mode==='energy')a.en=0;
   if(mode==='item'){a.equip='wing';a.lastMove=key;}
   if(mode==='disabled')a.disabled={key,turns:3};
   if(mode==='taunt'){if(key==='tackle')continue;a.tauntTurns=2;}
   assert.equal(forcedAction(a,move(key)).key,'desperate');
   const energy=a.en;
   await takeTurn(move(key),move('startle'));
   assert.equal(a.hp,800-a.dmgTaken,mode+key+': 20% self loss plus ordinary incoming damage');assert.equal(a.en,Math.min(100,energy+EN_REGEN));
   assert.equal(a.actionCancelled,false);
   [a,d]=setup();a.encore={key,turns:3};a.en=0;
   await takeTurn(move(key),move('ambush'));
   assert.ok(a.hp<800,'ambush hits desperate even for status-only sets');
 }
 [a,d]=setup();a.encore={key:'repose',turns:3};a.en=0;a.ability='ghost';a.hp=100;
 await doMove(a,d,'desperate');
 assert.equal(a.hp,0,'desperate can KO and always loses 20% max HP');
 assert.equal(MOVES.bond.pri,0);
})()`);
console.log('PASS rest skip, no startle, forced desperate constraints, ambush and normal bond priority');
