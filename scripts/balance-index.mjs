import fs from 'node:fs';
import vm from 'node:vm';
// Read-only neutral matchup probe. Does not publish, edit saves, or simulate human win rates.
const html=fs.readFileSync(process.argv[2]||new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).join('\n');
const noop=()=>{},nodes=new Map();
function node(){return {value:'',textContent:'',innerHTML:'',children:[],dataset:{},width:384,height:216,style:{setProperty:noop,removeProperty:noop},classList:{add:noop,remove:noop,contains:()=>false},appendChild(n){this.children.push(n);return n;},remove:noop,querySelector:node,querySelectorAll:()=>[],getContext:()=>({clearRect:noop,fillRect:noop}),addEventListener:noop,setAttribute:noop};}
const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
const ctx=vm.createContext({console,document:{hidden:false,querySelector:get,getElementById:get,querySelectorAll:()=>[],createElement:node,addEventListener:noop},window:{scrollTo:noop},localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},setTimeout:f=>{f();return 0;},clearTimeout:noop});
vm.runInContext(source,ctx,{timeout:10000});
const result=vm.runInContext(`(()=>{
 const unit=side=>{const u=makeUnit({id:'homura',moves:[],equip:'none',ability:'quick'},side);u.maxhp=130;u.hp=65;u.baseAtk=u.baseSpAtk=u.baseDef=u.baseSpDef=100;u.baseSpd=100;return u;};
 const a=unit('you'),d=unit('foe');B={you:[a],foe:[d],yi:0,fi:0,reverseTurns:0,weather:null};
 function expectation(m){
  a.type=m.t==='無'?'炎':'無';d.type=TYPES.find(t=>CHART[m.t][t]===1);
  let damageSum=0,recoil=0,drain=0,glutton=0;
  for(const [critical,weight] of [[false,15/16],[true,1/16]])for(let i=0;i<1000;i++){
   let call=0;rng=()=>call++===0?(critical?.01:.5):(i+.5)/1000;
   const n=damage(a,d,m).dmg,w=weight/1000;
   damageSum+=n*w;recoil+=Math.max(1,Math.floor(n*(m.recoil??1/3)))*w;
   drain+=Math.max(1,Math.floor(n*(m.dr||0)))*w;glutton+=Math.max(1,Math.floor(n*.15))*w;
  }
  return {damage:damageSum,recoil,drain,glutton};
 }
 const F=c=>47/(47+Math.max(c-22,0)),reference=expectation({...MOVES.flame,t:'無',fx:null}).damage*F(35);
 const moves=Object.keys(MOVES).filter(k=>MOVES[k].p>0).map(key=>{
  const m=MOVES[key],sample=expectation(m),hit=(m.acc??100)/100,hits=expectedHits(m),gain=m.fx==='endrain'?(m.drainEn??15):0,frequency=F(m.en-gain);
  const raw=sample.damage*hit*hits,recoil=m.fx==='recoil'?sample.recoil*hit*hits:0,heal=m.fx==='drain'?sample.drain*hit*hits:0,extra=m.fx==='drain'?sample.glutton*hit*hits:0;
  return {key,name:m.n,type:typeName(m.t),category:m.category,power:m.p,accuracy:m.acc,energy:m.en,secondary:m.pr??null,
   directIndex:100*raw*frequency/reference,
   hpSwingIndex:100*(raw-recoil+heal*.5)*frequency/reference,
   drainWithGluttonHalfUse:m.fx==='drain'?100*(raw+(heal+extra)*.5)*frequency/reference:null,
   resourceIndex:gain?100*(raw+gain/47*reference/F(35))*frequency/reference:null,
   conditional:['ambush','pivot','flinch','endrain','startle'].includes(m.fx),explosion:m.explosion};
 });
 return {reference:{power:80,accuracy:100,energy:35,index:100,stats:100,HP:130,stab:false,matchup:1,critRate:1/16,energyRegen:22,focusGain:47,healingUtilization:.5},
  limits:'Neutral long-run screening only. Does not price KO thresholds, status damage, buffs, priority, switching, weather, or human strategy. Resource index assumes recovered energy is useful and opponent drain forces future focus actions.',
  moves,moveData:Object.fromEntries(Object.getOwnPropertyNames(MOVES).map(k=>[k,MOVES[k]])),abilities:ABILITIES,equipment:EQUIPS,species:SPECIES.map(s=>({...s,abilities:ABIL_OF[s.id].map(k=>({key:k,...ABILITIES[k]})),moves:learnable(s).map(k=>({key:k,name:MOVES[k].n}))}))};
})()`,ctx,{timeout:20000});
process.stdout.write(JSON.stringify(result,null,2)+'\n');
