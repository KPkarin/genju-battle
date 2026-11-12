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
const before=JSON.stringify({SPECIES,MOVES,EQUIPS,ABIL_OF});
function checkBuild(b){
 const sp=spec(b.id),item=EQUIPS[b.equip],pool=learnable(sp),moves=b.moves.map(k=>MOVES[k]);
 assert.equal(moves.length,4);assert.equal(new Set(b.moves).size,4);
 assert.ok(b.moves.every(k=>pool.includes(k)));assert.ok(ABIL_OF[b.id].includes(b.ability));
 const attacks=moves.filter(m=>!isStatusMove(m)),statuses=moves.filter(isStatusMove);
 assert.ok(attacks.some(m=>m.p>0&&m.t===sp.t),sp.id+': actual STAB attack');
 if(item.noStatus||item.lock){assert.equal(attacks.length,4);assert.equal(statuses.length,0);}
 else {assert.equal(attacks.length,2);assert.equal(statuses.length,2);}
 const physical=attacks.some(m=>m.category==='physical'&&m.p>0),special=attacks.some(m=>m.category==='special'&&m.p>0);
 if(b.equip==='fang')assert.ok(attacks.every(m=>m.category==='physical'&&m.p>0));
 if(b.equip==='orb')assert.ok(attacks.every(m=>m.category==='special'&&m.p>0));
 if(statuses.some(m=>m.fx==='atkup'))assert.ok(physical);
 if(statuses.some(m=>m.fx==='spatkup'))assert.ok(special);
 if(['grit','spite'].includes(b.ability))assert.ok(physical);
 if(b.ability==='tempo')assert.ok(attacks.some(m=>['para','burn','accdownfx','spddown','flinch','defdown','atkdownfx'].includes(m.fx)&&m.pr>0&&m.pr<1));
 if(item.mask)assert.ok(statuses.some(m=>m.fx==='swapitem'),'mask must be transferable');
 if(b.ability==='glutton')assert.ok(attacks.some(m=>m.p>0));
}
const seen=new Set();let count=0;
for(const sp of SPECIES)for(const key of Object.keys(EQUIPS).filter(k=>k!=='none')){
 if(!randomBuildRules(sp,key))continue;
 for(let i=0;i<40;i++){checkBuild(randomBuildForSpecies(sp,key));count++;}
}
for(let i=0;i<2000;i++){
 setSeed(i+3721);const team=randBuild();assert.equal(new Set(team.map(b=>b.id)).size,3);
 for(const b of team){checkBuild(b);seen.add(b.equip);count++;}
 assert.equal(JSON.stringify(normalizeDraft(team)),JSON.stringify(team));assert.ok(sanitizeTeam(team));
}
assert.equal(seen.size,Object.keys(EQUIPS).length-1,'all usable item kinds still appear');
assert.equal(randomBuildRules(spec('gako'),'orb'),null,'special item cannot lose STAB on a physical-only wild type');
assert.equal(randomBuildRules(spec('homura'),'mask'),null,'no-transfer mask is excluded');
setSeed(91731);const team1=JSON.stringify(randBuild()),seed1=_seed;setSeed(91731);assert.equal(JSON.stringify(randBuild()),team1);assert.equal(_seed,seed1);
assert.equal(JSON.stringify({SPECIES,MOVES,EQUIPS,ABIL_OF}),before,'generator does not rewrite game data');
console.log('PASS '+count+' builds: all species/items, STAB, 2+2 or 4 attacks, item/category/boost/ability compatibility, mask transfer, unique teams, saved/network payloads and seeded determinism');
`);
