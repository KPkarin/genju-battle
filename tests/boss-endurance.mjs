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
 for(const id of ['kefarock','yudachou','sarandi']){
  party=randBuild().map(u=>({...u,equip:"none"}));startChallenge(id);let boss=FOE(),player=YOU();
  const max={kefarock:500,yudachou:450,sarandi:480}[id],loss=Math.floor(max/3);
  assert.equal(statPct('hp',max),100,'boss stat bars stay inside their track');assert.equal(boss.maxhp,max);assert.equal(boss.boss,true);assert.equal(player.boss,false);
  player.bond=true;player.hp=0;await markFaints();
  assert.equal(player.dead,true);assert.equal(boss.hp,max-loss);assert.equal(boss.dead,false);assert.equal(B.over,false);
  await markFaints();assert.equal(boss.hp,max-loss,'the same sacrifice applies once');
  startChallenge(id);boss=FOE();player=YOU();boss.hp=loss;player.bond=true;player.hp=0;
  await markFaints();assert.equal(boss.hp,0);assert.equal(boss.dead,true);assert.equal(B.over,true,'bond can finish a weakened boss');
  for(const mode of ['normal','mask','ghost','sub','guard']){
   startChallenge(id);boss=FOE();boss.perish=1;boss.perishStartTurn=1;B.turn=2;
   if(mode==='mask')boss.equip='mask';if(mode==='ghost')boss.ability='ghost';if(mode==='sub')boss.sub=100;if(mode==='guard')boss.guarding=true;
   await endTurn();assert.equal(boss.hp,max-loss,mode+' boss perish fraction');assert.equal(boss.perish,0);
   await endTurn();assert.equal(boss.hp,max-loss,'perish damage does not repeat');
  }
  startChallenge(id);boss=FOE();boss.hp=loss;boss.perish=1;B.turn=2;
  await endTurn();await markFaints();assert.equal(boss.dead,true,'perish can finish a weakened boss');
 }
 let [a,d]=setup();a.bond=true;a.hp=0;await markFaints();assert.equal(d.dead,true,'ordinary bond stays an instant KO');
 [a,d]=setup();a.perish=1;B.turn=2;a.equip='charm';await endTurn();await markFaints();assert.equal(a.dead,true,'ordinary perish still KOs through charm');
 party=randBuild().map(u=>({...u,equip:"none"}));startChallenge('kefarock');let player=YOU();player.perish=1;B.turn=2;await endTurn();await markFaints();assert.equal(player.dead,true,'player in challenge still receives normal perish');
 // Also resolve the reversed iteration order correctly.
 [a,d]=setup();a.boss=true;a.maxhp=a.hp=450;d.bond=true;d.hp=0;await markFaints();assert.equal(a.hp,300);assert.equal(a.dead,false);
 [a,d]=setup();a.boss=true;a.maxhp=450;a.hp=100;d.bond=true;d.hp=0;await markFaints();assert.equal(a.dead,true,'lethal boss damage works even if the boss slot was already visited');
 const untagged=makeUnit({id:'kefarock',moves:['tackle'],equip:'none',ability:'rockhead'},'foe');assert.equal(untagged.boss,false,'species alone does not enable challenge rules');
 party=randBuild().map(u=>({...u,equip:"none"}));startChallenge('yudachou');let boss=FOE();boss.hp=100;B.weather={kind:'shower',turns:5};await endTurn();assert.equal(boss.hp,268,'larger HP gives 168 weather healing');
 startChallenge('yudachou');boss=FOE();boss.hp=100;boss.equip='mask';B.weather={kind:'shower',turns:5};await endTurn();assert.equal(boss.hp,44,'mask still turns weather into damage');
})()`);
console.log('PASS boss HP, one-third bond/perish, lethal finishes, normal/player instant KO, ordering, trait-independent rules and scaled weather');
