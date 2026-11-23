import assert from 'node:assert/strict';
import {engine} from '../tools/selfplay/engine.mjs';
const a=engine(),b=engine();
assert.deepEqual(a.json('simStart(932)'),b.json('simStart(932)'));
for(let turn=0;turn<10&&!a.run('B.over');turn++){
 const seed=a.run('_seed');const expected=a.json('aiChoose()');
 a.run(`setSeed(${seed})`);assert.deepEqual(a.json("simChoose('foe')"),expected,'adapter preserves production foe scoring and RNG');a.run(`setSeed(${seed})`);
 await a.run("takeTurn(simChoose('you'),simChoose('foe'))");
 await b.run("takeTurn(simChoose('you'),simChoose('foe'))");
 assert.deepEqual(a.json('simState()'),b.json('simState()'),'repeatable real battle resolution');
}
const first=a.json('simStart(51)'),swapped=b.json('simStart(51,true)');assert.deepEqual(first,swapped);assert.deepEqual(a.json('B.you.map(u=>u.id)'),b.json('B.foe.map(u=>u.id)'));
console.log('PASS headless actual engine, production AI adapter, seeded replay and mirrored matchups');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'genju-selfplay-'));
try{
 const run=()=>{const r=spawnSync(process.execPath,['tools/selfplay/run.mjs','--games','4','--seed','77','--out',temp],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 run();const original=fs.readFileSync(path.join(temp,'games.jsonl'),'utf8');run();assert.equal(fs.readFileSync(path.join(temp,'games.jsonl'),'utf8'),original,'completed resume does not duplicate games');
 const lines=original.trim().split('\n');fs.writeFileSync(path.join(temp,'games.jsonl'),lines.slice(0,2).join('\n')+'\n{"partial":');run();assert.equal(fs.readFileSync(path.join(temp,'games.jsonl'),'utf8'),original,'interrupted last write replays deterministically');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS CLI checkpoint, no duplicates and truncated-write recovery');
