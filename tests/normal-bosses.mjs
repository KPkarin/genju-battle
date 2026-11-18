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
 let [a,d]=setup();const ids=['kefarock','yudachou','sarandi'];
 const builds=ids.map(id=>({id,moves:CHALLENGES[id].moves.slice(),equip:'none',ability:ABIL_OF[id][0]}));assert.ok(sanitizeTeam(builds));assert.ok(normalizeDraft(builds));
 for(const build of builds){const normal=makeUnit(build,'you'),boss=makeUnit({...build,boss:true},'foe');assert.equal(normal.boss,false);assert.equal(boss.boss,true);assert.equal(normal.name,CHALLENGES[build.id].species.n.slice(2));assert.equal(boss.name,'ボス'+normal.name);assert.ok(normal.maxhp<boss.maxhp);const sp=spec(build.id);assert.equal(['hp','atk','def','spatk','spdef','spd'].reduce((sum,k)=>sum+sp[k],0),550);assert.equal(spec(build.id).n,normal.name);assert.ok(build.moves.every(k=>learnable(sp).includes(k)));for(let i=0;i<10;i++)assert.ok(randomBuildForSpecies(sp).moves.some(k=>MOVES[k].p>0&&hasType(sp.t,MOVES[k].t)));
 B.you[0]=normal;B.foe[0]=boss;normal.perish=boss.perish=1;normal.perishStartTurn=boss.perishStartTurn=0;B.turn=1;await endTurn();assert.equal(normal.hp,0,'normal form is not immune to perish');assert.ok(boss.hp>0,'challenge form uses one-third fate damage');}
 const injected=builds.map(x=>({...x,boss:true}));const clean=sanitizeTeam(injected);assert.ok(clean.every(x=>!x.boss),'network strips challenge flags');
})()`);console.log('PASS three normal forms, total550 stats, challenge labels/stats/fate split, signature moves, builds, saves and network flags');
