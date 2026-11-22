import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const assetRoot=new URL('../assets/pixel-v1/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',assetRoot),'utf8'));
const pngSize=path=>{const b=fs.readFileSync(new URL(path,assetRoot));assert.equal(b.subarray(1,4).toString(),'PNG');return [b.readUInt32BE(16),b.readUInt32BE(20)];};
assert.equal(manifest.creatures.length,31);
for(const side of ['front','back'])assert.deepEqual(pngSize(`creatures-${side}.png`),[1024,3968]);
for(const kind of ['clear','rain','shower','sandstorm','snow'])assert.deepEqual(pngSize(`field-${kind}.png`),[384,288]);
for(const key of manifest.statuses)assert.deepEqual(pngSize(`status-${key}.png`),[1280,320]);

const images=[],nodes=new Map(),events=new Map();let portrait=false;
class FakeImage {
  constructor(){this.complete=false;this.naturalWidth=0;images.push(this);}
  finish(){this.complete=true;this.naturalWidth=1024;this.onload();}
}
function canvas(id=''){
  const calls=[];const ctx={calls,clearRect:(...x)=>calls.push(['clear',...x]),drawImage:(...x)=>calls.push(['draw',...x]),save:()=>{},restore:()=>{},translate:()=>{},scale:(...x)=>calls.push(['scale',...x]),beginPath:()=>{},rect:()=>{},clip:()=>{}};
  return {id,width:32,height:32,isConnected:true,style:{visibility:''},hidden:false,getContext:()=>ctx};
}
for(const id of ['fieldCanvas','statusCanvas','moveCanvas','pixelWeatherCanvas'])nodes.set(id,canvas(id));
const context=vm.createContext({Image:FakeImage,Event:class{constructor(type){this.type=type;}},
 document:{createElement:()=>canvas(),getElementById:id=>nodes.get(id)},
 window:{matchMedia:()=>({matches:portrait}),dispatchEvent:()=>{},addEventListener:(name,fn)=>events.set(name,fn)}});
vm.runInContext(fs.readFileSync(new URL('../pixel-art.js',import.meta.url),'utf8'),context);
const api=context.window.PixelArt;
assert.equal(api.phase(0),0);assert.equal(api.phase(419),0);assert.equal(api.phase(420),1);
let elapsed=0;
for(let i=0;i<8;i++){assert.equal(api.phase(elapsed),i);elapsed+=manifest.durations_ms[i];}
assert.equal(api.phase(elapsed),0);assert.equal(api.phase(-1),7);

const hidden=canvas('spYou');hidden.style.visibility='hidden';
assert.equal(api.creature(hidden,'homura','back'),false,'loading retains the existing renderer');
images.slice().forEach(im=>im.finish());
assert.equal(hidden.width,128);assert.equal(hidden.style.visibility,'hidden','async load must not reveal a substituted creature');
for(const [row,sp] of manifest.creatures.entries())for(const view of ['front','back'])for(let phase=0;phase<8;phase++){
 const cv=canvas();assert.equal(api.creature(cv,sp.id,view,phase),true);
 assert.equal(cv.width,128);assert.equal(cv.height,128);
 const draw=cv.getContext().calls.findLast(x=>x[0]==='draw');
 assert.equal(draw[1].src,`assets/pixel-v1/creatures-${view}.png?v=20261123-02`);
 assert.deepEqual(draw.slice(2),[128*phase,128*row,128,128,0,0,128,128]);
}
assert.equal(api.creature(canvas(),'missing'),false);
const foe=canvas('spFoe');api.creature(foe,'homura');assert.ok(foe.getContext().calls.some(x=>x[0]==='scale'&&x[1]===-1));
const portraitCanvas=canvas();api.creature(portraitCanvas,'homura');assert.ok(!portraitCanvas.getContext().calls.some(x=>x[0]==='scale'),'roster artwork keeps its approved orientation');

for(const id of ['fukurou','doryu','oborogi','hasukaba','damasdevil']){
 const enemy=canvas('spFoe');api.creature(enemy,id);assert.ok(enemy.getContext().calls.some(x=>x[0]==='scale'&&x[1]===-1),id+': right-facing enemy turns toward player');
 const roster=canvas();api.creature(roster,id);assert.ok(!roster.getContext().calls.some(x=>x[0]==='scale'),id+': portrait keeps its original art');
}
for(const id of ['raitachi','rainen','saikaku','mubaku','yudachou']){
 const enemy=canvas('spFoe');api.creature(enemy,id);assert.ok(!enemy.getContext().calls.some(x=>x[0]==='scale'),id+': already left-facing enemy stays left');
}

const field=nodes.get('fieldCanvas');api.field(field);
assert.equal(field.height,216);
portrait=true;events.get('resize')();assert.equal(field.height,288);
for(const id of ['statusCanvas','moveCanvas','pixelWeatherCanvas'])assert.equal(nodes.get(id).height,288);
api.field(field,'snow');images.filter(im=>!im.complete).forEach(im=>im.finish());
const native=field.getContext().calls.findLast(x=>x[0]==='draw');assert.deepEqual(native.slice(2),[0,0,384,288,0,0,384,288]);
api.weather(null);assert.equal(nodes.get('pixelWeatherCanvas').hidden,true);
api.weather('snow',1000,true);images.filter(im=>!im.complete).forEach(im=>im.finish());api.weather('snow',1000,true);
assert.equal(nodes.get('pixelWeatherCanvas').hidden,false);api.weather(null);assert.equal(nodes.get('pixelWeatherCanvas').hidden,true);
for(const key of manifest.statuses){
 const ctx=canvas().getContext();api.status(ctx,key,15,{x:16,y:24,w:128,h:128});
 images.filter(im=>!im.complete).forEach(im=>im.finish());assert.equal(api.status(ctx,key,15,{x:16,y:24,w:128,h:128}),true);
 assert.deepEqual(ctx.calls.findLast(x=>x[0]==='draw').slice(2),[1120,160,160,160,0,0,160,160]);
}
console.log('PASS approved native asset dimensions, all 400 atlas frames, frame timing/wrap, asynchronous fallback, substitute visibility, opponent orientation, portrait sizing, weather cleanup, and all 11 status variants');
