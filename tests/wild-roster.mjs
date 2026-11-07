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
setup();
for(const id of ['gako','arakuma']){
 const sp=spec(id);assert.equal(sp.t,'野');assert.ok(SPRITES[id]&&BACK_SPRITES[id]&&IDLE_PROFILES[id]);
 const moves=['wildfang','guard',id==='gako'?'devour':'quake',id==='gako'?'wildclaw':'repose'];
 const build={id,moves,equip:'none',ability:ABIL_OF[id][0]};
 for(const m of moves)assert.ok(learnable(sp).includes(m));
 party=[build,{id:'homura',moves:['tackle','guard','rock','firefang'],equip:'none',ability:'stoic'},{id:'shiogame',moves:['tackle','guard','rock','squirt'],equip:'none',ability:'mirror'}];
 assert.equal(normalizeDraft(party)[0].id,id);assert.equal(sanitizeTeam(party)[0].id,id);
 const a=makeUnit(build,'you'),d=makeUnit({...build,id:id==='gako'?'arakuma':'gako',ability:ABIL_OF[id==='gako'?'arakuma':'gako'][0]},'foe');
 a.ability='focus2';d.ability='focus2';a.en=100;
 setSeed(10987);const wild=damage(a,d,MOVES.wildfang);setSeed(10987);const same=damage({...a,type:'無'},d,MOVES.wildfang);
 assert.equal(wild.e,2);assert.ok(wild.dmg>same.dmg,'wild primary type receives STAB');
}
assert.ok(spec('gako').spd>spec('arakuma').spd);assert.ok(spec('arakuma').def>spec('gako').def);
`);
console.log('PASS two wild species, front/back/idle resources, legal moves, legacy draft/network validation, same-type bonus and differentiated roles');
