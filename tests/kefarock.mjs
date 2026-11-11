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
 const boss=makeUnit({id:'kefarock',moves:['wildrock','wildreturn','wildfang','tackle'],equip:'none',ability:'rockhead'},'foe');
 B.foe=[boss];
 assert.equal(boss.maxhp,500);assert.equal(hasType(boss,'岩'),true);assert.equal(hasType(boss,'野'),true);
 assert.equal(SPECIES.some(s=>s.id==='kefarock'),false,'boss remains outside regular roster');
 for(const t of TYPES)assert.equal(attackEff(t,boss),CHART[t]['岩']*CHART[t]['野']);
 assert.equal(attackEff('空',boss),2);assert.equal(attackEff('水',boss),1);
 await doMove(boss,a,'wildreturn');assert.equal(boss.en,65);assert.equal(boss.wildAwakened,true);
 assert.ok(logs().includes('野生に目覚めている!!'));
 assert.equal(attackEff('水',boss),.5);assert.equal(attackEff('炎',boss),2);assert.equal(attackEff('空',boss),4);
 a.type='草';assert.equal(attackEff('野',a,boss),4);
 a.type='雷';assert.equal(attackEff('野',a,boss),.25);
 const originalRng=rng;rng=()=>.5;a.type='無';
 boss.wildAwakened=false;const plain=damage(boss,a,MOVES.wildfang).dmg;
 boss.wildAwakened=true;assert.ok(damage(boss,a,MOVES.wildfang).dmg>plain*1.4);
 await doMove(boss,a,'guard');assert.equal(boss.wildAwakened,true,'status moves preserve awakening');
 boss.en=100;await doMove(boss,a,'wildfang');assert.equal(boss.wildAwakened,false);
 boss.wildAwakened=true;boss.en=0;await doMove(boss,a,'wildrock');assert.equal(boss.wildAwakened,true,'insufficient energy preserves awakening');
 boss.en=100;rng=()=>.99;await doMove(boss,a,'wildrock');assert.equal(boss.wildAwakened,false,'a missed attack consumes awakening');
 boss.en=100;boss.wildAwakened=true;boss.encore={key:'wildrock',turns:3};boss.disabled={key:'wildrock',turns:3};
 await doMove(boss,a,'desperate');assert.equal(boss.wildAwakened,false);
 rng=originalRng;
 for(const k of ['wildrock','tackle','pivot','dive'])assert.equal(MOVES[k].rush,true);
 for(const k of ['wildfang','wildclaw','inferno','gravel'])assert.equal(!!MOVES[k].rush,false);
 assert.equal(MOVES.wildrock.p,130);assert.equal(MOVES.wildrock.acc,90);assert.equal(MOVES.wildrock.en,50);assert.equal(MOVES.wildrock.contact,true);
 for(const ability of ['focus2','rockhead']){
   [a,d]=setup();a.ability=ability;rng=()=>.5;
   const normalDamage=damage;damage=()=>({dmg:100,e:1,crit:false,stab:true});
   await doMove(a,d,'wildrock');assert.equal(a.hp,ability==='rockhead'?1000:950);
   damage=normalDamage;
   const boosted=damage(a,d,MOVES.tackle).dmg;a.ability='focus2';
   if(ability==='rockhead')assert.ok(boosted>damage(a,d,MOVES.tackle).dmg*1.4);
 }
 [a,d]=setup();a.wildAwakened=true;leaveField(a);assert.equal(a.wildAwakened,false);
 party=randBuild();startChallenge();assert.equal(B.you.length,3);assert.equal(B.foe.length,1);assert.equal(FOE().id,'kefarock');assert.equal(NET.on,false);
 for(const collection of [SPRITES,BACK_SPRITES])assert.ok(collection.kefarock.px.every(row=>row.length===32));
})()`);
console.log('PASS boss compound matchups, awakening lifecycle/power, rush classification and recoil exemption');
