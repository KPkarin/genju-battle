import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Native pixel/frame and fake-rAF lifecycle checks; no browser rendering is implied.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
const nodes=new Map(), events=new Map(), motionEvents=new Map(), raf=new Map();
let now=0, nextRaf=1;
const motion={matches:false, addEventListener:(name,fn)=>motionEvents.set(name,fn), addListener:fn=>motionEvents.set('change',fn)};
function node(){
  const classes=new Set();
  return {value:'',innerHTML:'',textContent:'',children:[],width:32,height:32,
    style:{setProperty:noop}, classList:{add:(...items)=>items.forEach(x=>classes.add(x)),remove:(...items)=>items.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
    appendChild(child){this.children.push(child);return child;},remove:noop,
    querySelector:()=>node(),querySelectorAll:()=>[],
    getContext:()=>({clearRect:noop,fillRect:noop}),
  };
}
const getNode=selector=>{
  const key=selector.startsWith('#')?selector:'#'+selector;
  if(!nodes.has(key))nodes.set(key,node());
  return nodes.get(key);
};
getNode('#scBuild').classList.add('on');
const document={hidden:false,visibilityState:'visible',querySelector:selector=>{
  if(selector==='.screen.on')return ['scBuild','scBattle','scResult'].map(getNode).find(n=>n.classList.contains('on'))??null;
  return getNode(selector);
},getElementById:getNode,querySelectorAll:selector=>selector==='.screen'?['scBuild','scBattle','scResult'].map(getNode):[],
createElement:node,addEventListener:(name,fn)=>events.set(name,fn)};
const context=vm.createContext({console,document,window:{scrollTo:noop,matchMedia:()=>motion},
  matchMedia:()=>motion,performance:{now:()=>now},localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
  setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  requestAnimationFrame:callback=>{const id=nextRaf++;raf.set(id,callback);return id;},cancelAnimationFrame:id=>raf.delete(id),
});
const run=code=>vm.runInContext(code,context,{timeout:10_000});
const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
run(source);
assert.equal(run('typeof getIdleFrame'),'function','idle frame generator is present');
assert.equal(run('typeof IdleAnimation'),'object','idle animator is present');
const original=json('({front:SPRITES,back:BACK_SPRITES})');
context.seedBefore=123456789;run('setSeed(seedBefore)');
const rendered={};
for(const view of ['front','back'])for(const [id,base]of Object.entries(original[view])){
  context.testId=id;context.testView=view;
  const frames=[];
  for(let phase=0;phase<4;phase++){
    context.testPhase=phase;
    const frame=json('getIdleFrame(testId,testView,testPhase)');
    assert.equal(frame.px.length,32,id+' '+view+': frame height');
    assert.ok(frame.px.every(row=>row.length===32),id+' '+view+': frame width');
    for(const row of frame.px)for(const key of row)assert.ok(key==='.'||frame.pal[key],id+': frame palette');
    assert.deepEqual(frame.pal,base.pal,id+': original palette is preserved');
    const footY=run('IDLE_PROFILES[testId][testView].footY');
    assert.deepEqual(frame.px.slice(footY),base.px.slice(footY),id+' '+view+': planted lower pixels remain fixed');
    if(phase===0)assert.deepEqual(frame,base,id+': rest frame is the original sprite');
    frames.push(frame);
  }
  assert.equal(new Set(frames.map(frame=>JSON.stringify(frame.px))).size,4,id+' '+view+': all four poses visibly differ');
  assert.ok(frames.every(frame=>frame.px[0]==='.'.repeat(32)&&frame.px[31]==='.'.repeat(32)),id+' '+view+': no vertical clipping');
  assert.ok(frames.every(frame=>frame.px.every(row=>row[0]==='.'&&row[31]==='.')),id+' '+view+': no horizontal clipping');
  rendered[view+':'+id]=frames;
}
// The rear flame tail must stay attached across its lower root while its tip sways.
// A previous frame left the entire y=20 seam empty and visually split the tail.
for(const phase of [2,3]){
  const rows=rendered['back:homura'][phase].px;
  assert.ok(Array.from({length:8},(_,i)=>i+2).some(x=>rows[20][x]!=='.'&&rows[21][x]!=='.'),
    'rear homura phase '+phase+': tail retains an opaque connection across its root');
}
assert.deepEqual(json('({front:SPRITES,back:BACK_SPRITES})'),original,'frame generation does not mutate base sprites');
assert.equal(run('_seed'),123456789,'frame generation preserves battle RNG');
console.log('PASS 40 poses × 4 native frames, fixed feet, palette, rest pose, margins, nonmutation, and isolated RNG');

// Record the actual drawing calls while retaining the original pixel renderer.
context.drawCalls=[];
run(`const originalDrawIdleTest=drawSprite;
  drawSprite=(canvas,id,view='front',phase=0)=>{
    drawCalls.push({target:canvas===document.querySelector('#spYou')?'you':canvas===document.querySelector('#spFoe')?'foe':'other',id,view,phase});
    return originalDrawIdleTest(canvas,id,view,phase);
  };`);
function advance(ms){
  now+=ms;
  const pending=[...raf.values()];raf.clear();
  for(const callback of pending)callback(now);
  assert.ok(raf.size<=1,'at most one animation loop is scheduled');
}
function clearDraws(){context.drawCalls.length=0;}
function emitVisibility(hidden){document.hidden=hidden;document.visibilityState=hidden?'hidden':'visible';events.get('visibilitychange')?.();}
function emitMotion(reduced){motion.matches=reduced;motionEvents.get('change')?.({matches:reduced});}
function begin(side='you'){
  context.localSide=side;
  run("setSeed(2345); beginBattle(randBuild(),randBuild(),2345,localSide)");
}
assert.equal(raf.size,0,'build screen does not animate');
for(const side of ['you','foe']){
  begin(side);assert.equal(raf.size,1,'battle starts one animation loop');
  run('IdleAnimation.start(); IdleAnimation.start()');assert.equal(raf.size,1,'restarting does not duplicate the loop');
  clearDraws();run('setSeed(13579)');
  for(let i=0;i<30;i++)advance(100);
  assert.ok(context.drawCalls.some(call=>call.target==='you'&&call.view==='back'&&call.phase>0),side+': own rear breath animates');
  assert.ok(context.drawCalls.some(call=>call.target==='foe'&&call.view==='front'&&call.phase>0),side+': opponent front breath animates');
  assert.equal(run('_seed'),13579,'animation preserves battle RNG');
  run("if(ME==='you')B.yi=1;else B.fi=1; paint(false)");
  const ownId=run('MY().id');clearDraws();
  run('IdleAnimation.invalidate()');for(let i=0;i<20;i++)advance(100);
  assert.ok(context.drawCalls.filter(call=>call.target==='you').every(call=>call.id===ownId&&call.view==='back'),side+': switched unit uses its own rear frames');
  for(const effect of ['enter','lunge','hit','faint']){
    getNode('#spYou').classList.add(effect);clearDraws();run('IdleAnimation.invalidate()');
    for(let i=0;i<20;i++)advance(100);
    assert.ok(context.drawCalls.filter(call=>call.target==='you').every(call=>call.phase===0),effect+': effect is not overwritten by breathing');
    getNode('#spYou').classList.remove(effect);
  }
  run('MY().dead=true; MY().hp=0');clearDraws();run('IdleAnimation.invalidate()');
  for(let i=0;i<20;i++)advance(100);
  assert.ok(context.drawCalls.filter(call=>call.target==='you').every(call=>call.phase===0),'fainted unit does not breathe');
  run("show('scResult')");assert.equal(raf.size,0,'leaving battle cancels animation');
}
begin();emitVisibility(true);assert.equal(raf.size,0,'hidden document cancels animation');
clearDraws();advance(1000);assert.equal(context.drawCalls.length,0,'hidden document is not redrawn');
emitVisibility(false);assert.equal(raf.size,1,'returning to visible battle resumes once');
emitMotion(true);assert.equal(raf.size,0,'reduced motion cancels animation');
clearDraws();advance(1000);assert.equal(context.drawCalls.length,0,'reduced motion remains still');
emitMotion(false);assert.equal(raf.size,1,'reduced motion disabled resumes once');
run('B.over=true');clearDraws();advance(1000);assert.equal(raf.size,0,'battle end stops the animation loop');
assert.ok(context.drawCalls.every(call=>call.phase===0),'finished battle does not breathe');
run('IdleAnimation.stop(); IdleAnimation.stop()');assert.equal(raf.size,0,'stopping is idempotent');
console.log('PASS fake-rAF lifecycle: both perspectives, switches, effects, fainting, navigation, visibility, reduced motion, and battle end');
const outputIndex=process.argv.indexOf('--render-json');
if(outputIndex!==-1){const path=process.argv[outputIndex+1];assert.ok(path);fs.writeFileSync(path,JSON.stringify(rendered));console.log('Wrote idle frames to '+path);}
console.log('Unverified: real browser timing/layout, visual smoothness, and live PeerJS matches.');
