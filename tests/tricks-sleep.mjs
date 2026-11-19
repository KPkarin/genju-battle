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
 let [a,d]=setup();rng=()=>.5;a.baseSpd=200;
 await takeTurn(move('mindGame'),move('tackle'));assert.equal(a.hp,1000);assert.equal(d.statusOnly,null);assert.equal(d.lastMove,null);
 for(const item of ['armor','fullKnuckle']){
  [a,d]=setup();a.baseSpd=50;d.baseSpd=100;d.equip=item;if(item==='fullKnuckle')d.choiceMove='tackle';await takeTurn(move('mindGame'),move('tackle'));assert.ok(a.hp<1000);assert.ok(d.statusOnly);assert.equal(forcedAction(d,move(null)).key,'desperate');a.en=100;await takeTurn(move('ambush'),move(null));assert.ok(d.hp<800,'ambush hits forced attack then self-harm');assert.equal(d.statusOnly,null);
 }
 [a,d]=setup();d.statusOnly={turn:0,startTurn:1};assert.equal(moveBlocked(d,'tackle'),true);assert.equal(moveBlocked(d,'guard'),false);assert.equal(forcedAction(d,{kind:'switch',to:1}).kind,'switch');await takeTurn(move(null),{kind:'switch',to:1});assert.equal(d.statusOnly,null);
 [a,d]=setup();d.guarding=true;await doMove(a,d,'mindGame');assert.equal(d.statusOnly,null);
 [a,d]=setup();a.rank.def=-6;a.rank.eva=5;await doMove(a,d,'killBreath');assert.equal(a.rank.def,-6);assert.equal(a.rank.eva,6);
 [a,d]=setup();a.statusOnly={turn:0,startTurn:1};renderCmd();assert.equal(document.querySelector('#btnFocusEnergy').disabled,true);a.equip='armor';renderCmd();assert.equal(document.querySelector('#btnFocusEnergy').textContent,'やけくそ');
 // Aura lasts through the following turn's faster enemy, until the owner's action opportunity.
 [a,d]=setup();a.ability=d.ability='grit';a.baseSpd=200;d.baseSpd=100;await takeTurn(move('neighbor'),move('tackle'));assert.equal(a.rank.def,1);assert.ok(d.drowsy);assert.equal(d.status,null);assert.equal(a.inviting,true);a.en=100;await takeTurn(move('tackle'),move('tackle'));assert.equal(a.inviting,false);assert.equal(d.status,'眠り');assert.ok(d.sleepTurns>=1&&d.sleepTurns<=3);
 for(const [roll,count] of [[0,1],[.5,2],[.999,3]]){
  [a,d]=setup();d.ability='grit';rng=()=>roll;assert.ok(inflict(d,'眠り',a));assert.equal(d.sleepTurns,count);for(let i=0;i<count;i++){const hp=a.hp;await doMove(d,a,'tackle');assert.equal(a.hp,hp);}assert.equal(d.status,null);d.en=100;await doMove(d,a,'tackle');assert.ok(a.hp<1000);
 }
 for(const mode of ['ranged','sub','guard']){
  [a,d]=setup();a.inviting=true;if(mode==='sub')a.sub=100;if(mode==='guard')a.guarding=true;await doMove(d,a,mode==='ranged'?'ember':'tackle');assert.equal(d.drowsy,null,mode);
 }
 [a,d]=setup();a.inviting=true;await doMove(d,a,'tackle');leaveField(d);assert.equal(d.drowsy,null);inflict(d,'眠り',a);const remaining=d.sleepTurns;leaveField(d);assert.equal(d.status,'眠り');assert.equal(d.sleepTurns,remaining);
 [a,d]=setup();a.inviting=true;d.ability='stoic';await doMove(d,a,'tackle');await endTurn();assert.equal(d.status,null);B.turn++;await endTurn();assert.equal(d.pendingStatus.status,'眠り');assert.equal(d.status,null);B.turn++;await endTurn();assert.equal(d.status,'眠り');
})()`);console.log('PASS trick first/last/forced desperation/switch/guard, rank caps, contact aura lifetime, drowsy delay and 1-3 sleep actions/stoic');
