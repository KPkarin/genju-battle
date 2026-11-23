import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {engine} from './engine.mjs';
const argv=process.argv.slice(2),opt=(key,fallback)=>{const i=argv.indexOf('--'+key);return i<0?fallback:argv[i+1];};
const games=Number(opt('games',1000)),startSeed=Number(opt('seed',1000)),maxTurns=Number(opt('max-turns',150)),out=opt('out','selfplay-results');
if(!Number.isInteger(games)||games<1||games>100000||!Number.isInteger(startSeed)||!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>1000)throw Error('Invalid bounds');
fs.mkdirSync(out,{recursive:true});
const fingerprint=crypto.createHash('sha256').update(fs.readFileSync(new URL('../../index.html',import.meta.url))).digest('hex');
const config={games,startSeed,maxTurns,fingerprint,format:1};
const configFile=path.join(out,'config.json'),recordsFile=path.join(out,'games.jsonl');
if(fs.existsSync(configFile)&&JSON.stringify(JSON.parse(fs.readFileSync(configFile)))!==JSON.stringify(config))throw Error('Output belongs to a different configuration or engine. Choose a new --out.');
fs.writeFileSync(configFile,JSON.stringify(config));
let records=[];
if(fs.existsSync(recordsFile)){
 const raw=fs.readFileSync(recordsFile,'utf8'),lines=raw.split('\n');
 for(let i=0;i<lines.length-1;i++)if(lines[i])records.push(JSON.parse(lines[i]));
 // A process interrupted during a write may leave an incomplete last line.
 if(lines.at(-1))fs.writeFileSync(recordsFile,records.map(r=>JSON.stringify(r)+'\n').join(''));
}
if(records.some((r,i)=>r.index!==i))throw Error('Non-contiguous checkpoint');
const w=engine();let stop=false;process.on('SIGTERM',()=>stop=true);process.on('SIGINT',()=>stop=true);
function summary(){
 const complete=records.filter(r=>!r.error),turns=complete.map(r=>r.turn).sort((a,b)=>a-b),count={you:0,foe:0,turnLimit:0,error:0};
 const species={};
 for(const r of records){count[r.error?'error':r.winner||'turnLimit']++;if(r.error)continue;for(const [side,team]of [['you',r.build.you],['foe',r.build.foe]])for(const u of team){const v=species[u.id]??={games:0,wins:0};v.games++;if(r.winner===side)v.wins++;}}
 return {config,completed:records.length,counts:count,medianTurns:turns[Math.floor(turns.length/2)]??null,actions:records.reduce((sum,r)=>sum+(r.actions||0),0),species,updatedAt:new Date().toISOString(),note:'Baseline observations only; random team win rates are not controlled balance estimates. No automatic promotion.'};
}
function save(){const s=summary(),tmp=path.join(out,'summary.json.tmp');fs.writeFileSync(tmp,JSON.stringify(s,null,2));fs.renameSync(tmp,path.join(out,'summary.json'));return s;}
for(let index=records.length;index<games&&!stop;index++){
 const seed=(startSeed+Math.floor(index/2))>>>0,mirror=!!(index%2);let actions=0,build;
 let timer;
 try{
  build=w.json(`simStart(${seed},${mirror})`);
  await Promise.race([(async()=>{
   while(!w.run('B.over')&&w.run('B.turn')<=maxTurns){
    // Both actions are selected before planned moves are assigned.
    await w.run(`takeTurn(simChoose('you'),simChoose('foe'))`);actions+=2;
   }
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Match timeout')),10000);})]);
  const state=w.json('simState()');
  const record={index,seed,mirror,build:mirror?{you:build.foe,foe:build.you}:build,actions,...state};
  records.push(record);fs.appendFileSync(recordsFile,JSON.stringify(record)+'\n');
 }catch(error){
  const record={index,seed,mirror,build,actions,error:String(error),state:w.json('simState()')};records.push(record);fs.appendFileSync(recordsFile,JSON.stringify(record)+'\n');save();throw error;
 }finally{clearTimeout(timer);}
 if(records.length%50===0){const s=save();console.log(JSON.stringify({completed:s.completed,counts:s.counts,medianTurns:s.medianTurns}));await new Promise(r=>setImmediate(r));}
}
console.log(JSON.stringify(save(),null,2));
