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
  const [a,d]=setup();a.baseSpd=50;d.baseSpd=200;forcedFlinch();
  await takeTurn(move('slide'),move('tackle'));
  assert.ok(a.hp<1000,'the faster defender attacked before the flinch move');
  assert.ok(d.hp<1000,'a late flinch move still deals its ordinary damage');
  const hp=a.hp;
  await takeTurn(move(null),move('tackle'));
  assert.ok(a.hp<hp,"late flinch must never cancel the following-turn action");
  assert.equal(d.flinch,false,'no late flinch remains after the turn');
  assert.equal(logs().includes('ひるんで動けない'),false,'a late flinch does not announce a skipped action');
})()`);
console.log('PASS late flinch deals damage but never skips the following turn');

await run(`(async()=>{
  const [a,d]=setup();a.baseSpd=200;d.baseSpd=50;forcedFlinch();
  await takeTurn(move('slide'),move('tackle'));
  assert.equal(a.hp,1000,'an early successful flinch prevents the pending enemy action');
  assert.ok(d.hp<1000);assert.ok(logs().includes('ひるんで動けない'));
  assert.equal(d.flinch,false,'a consumed flinch does not survive the current turn');
  await takeTurn(move(null),move('tackle'));
  assert.ok(a.hp<1000,'the defender resumes acting normally next turn');
})()`);
console.log('PASS early flinch skips only the pending action in the same turn');

await run(`(async()=>{
  const oldPriority=MOVES.slide.pri;
  try {
    const [a,d]=setup();a.baseSpd=50;d.baseSpd=200;MOVES.slide.pri=2;forcedFlinch();
    await takeTurn(move('slide'),move('tackle'));
    assert.equal(a.hp,1000,'priority lets a slower unit flinch before a faster unit acts');
  } finally {if(oldPriority===undefined)delete MOVES.slide.pri;else MOVES.slide.pri=oldPriority;}
  const [a,d]=setup();a.baseSpd=200;d.baseSpd=50;forcedFlinch();
  await takeTurn(move('slide'),move('guard'));
  const hp=a.hp;
  await takeTurn(move(null),move('tackle'));
  assert.ok(a.hp<hp,'a faster unit cannot bank flinch after a higher-priority guard');
})()`);
console.log('PASS flinch follows actual action priority rather than speed alone');

await run(`(async()=>{
  {
    const [a,d]=setup();a.baseSpd=200;d.baseSpd=50;d.restTurns=1;forcedFlinch();
    await takeTurn(move('slide'),move('tackle'));
    const hp=a.hp;
    await takeTurn(move(null),move('tackle'));
    assert.ok(a.hp<hp,'resting through a flinch cannot defer that flinch into the following turn');
    assert.equal(d.flinch,false);
  }
  for(const reason of ['rest','cancelled']){
    const [a,d]=setup();a.flinch=true;a.baseSpd=200;d.baseSpd=50;forcedFlinch();
    if(reason==='rest')a.restTurns=1;else a.actionCancelled=true;
    await doMove(a,d,'tackle');await endTurn();B.turn++;
    const hp=d.hp;
    await takeTurn(move('tackle'),move(null));
    assert.ok(d.hp<hp,reason+': early action return cannot carry flinch into another turn');
    assert.equal(a.flinch,false);
  }
})()`);
console.log('PASS rest and cancelled-action paths cannot preserve stale flinch');

const host=world(),guest=world();
for(const w of [host,guest])w.run(`setup();YOU().baseSpd=70;FOE().baseSpd=150;`);
guest.run(`ME='foe'`);
for(const [you,foe] of [['slide','tackle'],[null,'tackle'],['slide','guard'],['slide','tackle'],[null,'slide']]){
  await host.run(`takeTurn(move(${JSON.stringify(you)}),move(${JSON.stringify(foe)}))`);
  await guest.run(`takeTurn(move(${JSON.stringify(foe)}),move(${JSON.stringify(you)}))`);
  assert.deepEqual(host.json('({you:B.you,foe:B.foe,turn:B.turn,seed:_seed})'),guest.json('({you:B.you,foe:B.foe,turn:B.turn,seed:_seed})'));
}
console.log('PASS independently seeded host and guest remain synchronized across flinch turns');
console.log('Unverified: real browser presentation and live PeerJS transport.');
