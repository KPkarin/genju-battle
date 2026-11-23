import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Real turn resolution with presentation stubs; no browser or live PeerJS transport.
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
export function world(){
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
  run(source.replace('const sleep =','let sleep ='));
  return {run,json:expression=>JSON.parse(run('JSON.stringify('+expression+')'))};
}

export function engine(){
 const w=world();
 w.run(`
 sleep=()=>Promise.resolve();
 say=h=>{simLog.push(String(h));if(simLog.length>40)simLog.shift();};
 paint=()=>{if(B){BattleIntel.observe(YOU());BattleIntel.observe(FOE());}};
 renderCmd=()=>{};playFx=()=>{};flash=()=>{};popDmg=()=>{};
 finish=winner=>{B.over=true;B.busy=true;simWinner=winner;};
 chooseReplacement=()=>Promise.resolve(myTeam().findIndex(u=>!u.dead&&u.hp>0));
 decideSwitch=async(side,seq,alive)=>alive[0].i;
 let simWinner=null,simLog=[];
 // Adapt only canonical side references in the unchanged production scoring body.
 let aiBody=aiChoose.toString().replace('function aiChoose()','function simChoose(side)');
 aiBody=aiBody.replace('const f = FOE(), target=YOU()',"const other=side==='you'?'foe':'you', f=active(side), target=active(other)");
 aiBody=aiBody.replaceAll('B.foe','B[side]').replaceAll('B.you','B[other]').replaceAll('B.fi',"(side==='you'?B.yi:B.fi)").replaceAll('B.hazard.you','B.hazard[other]').replaceAll('B.hazard.foe','B.hazard[side]');
 globalThis.simChoose=eval('('+aiBody+')');
 function simStart(seed,mirror=false){
   setSeed(seed);const first=randBuild(),second=randBuild();
   simWinner=null;simLog=[];beginBattle(mirror?second:first,mirror?first:second,seed^0x6a09e667,'you');
   return {you:first,foe:second};
 }
 function simState(){return {winner:simWinner,turn:B.turn,over:B.over,seed:_seed,log:simLog.slice(),teams:[B.you,B.foe].map(team=>team.map(u=>({id:u.id,hp:u.hp,dead:u.dead}))) };}
 `);
 return w;
}
