import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exact native draw commands and fake animation/timer lifecycle, not browser QA.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(s=>s.trim()).join('\n');
const noop=()=>{};
let now=0,nextRaf=1,nextTimer=1;
const raf=new Map(),timers=new Map(),events=new Map(),motionEvents=new Map(),nodes=new Map();
const preference={matches:false,addEventListener:(name,fn)=>motionEvents.set(name,fn),addListener:fn=>motionEvents.set('change',fn)};
function node(){
  const classes=new Set(),commands=[];
  const ctx={fillStyle:'#ffffff',clearRect:(...args)=>commands.push({clear:args}),
    fillRect(...args){commands.push({fill:this.fillStyle,rect:args});}};
  let markup='';
  return {value:'',textContent:'',children:[],width:32,height:32,commands,ctx,
    get innerHTML(){return markup;},set innerHTML(value){markup=String(value);this.children=[];},
    style:{setProperty:noop},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
    appendChild(child){this.children.push(child);return child;},remove:noop,
    querySelector:()=>node(),querySelectorAll:()=>[],getContext:()=>ctx,setAttribute:noop,
  };
}
const getNode=selector=>{const key=selector.startsWith('#')?selector:'#'+selector;if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
getNode('#scBuild').classList.add('on');
const document={hidden:false,visibilityState:'visible',querySelector:selector=>{
  if(selector==='.screen.on')return ['scBuild','scBattle','scResult'].map(getNode).find(n=>n.classList.contains('on'))??null;
  return getNode(selector);
},getElementById:getNode,querySelectorAll:selector=>selector==='.screen'?['scBuild','scBattle','scResult'].map(getNode):[],
createElement:node,addEventListener:(name,fn)=>events.set(name,fn)};
const context=vm.createContext({console,assert,document,
  window:{scrollTo:noop,matchMedia:()=>preference,addEventListener:noop},
  performance:{now:()=>now},localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
  setTimeout:(fn,delay=0)=>{const id=nextTimer++;timers.set(id,{fn,due:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:fn=>{const id=nextRaf++;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),
});
const run=code=>vm.runInContext(code,context,{filename:'move-motion-checks',timeout:10_000});
const json=code=>JSON.parse(run('JSON.stringify('+code+')'));
run(source);
assert.equal(run('typeof drawMoveMotion'),'function','pure move renderer exists');
assert.equal(run('typeof MoveMotion'),'object','move controller exists');
assert.match(html,/<canvas\s+[^>]*id="moveCanvas"[^>]*width="384"[^>]*height="216"/,'native effect overlay is mounted');
const profiles=json('MOVE_MOTION_PROFILES'),moves=json('MOVES');
assert.equal(Object.keys(moves).length,58,'current catalog has all 58 moves');
assert.deepEqual(Object.keys(profiles).sort(),Object.keys(moves).sort(),'every move has an explicit motion profile');
assert.ok(new Set(Object.values(profiles).map(p=>p.shape)).size>=12,'moves use varied geometry families');
assert.ok(new Set(Object.values(profiles).map(p=>p.actor)).size>=4,'source body gestures vary');
for(const p of Object.values(profiles))assert.ok(['lunge','cast','rise','brace','recoil'].includes(p.actor));
const allRendered={},progresses=[0,.18,.36,.54,.72,.9,1];
context.drawProbe={fillStyle:'',calls:[],fillRect(...args){this.calls.push({fill:this.fillStyle,rect:args});}};
run('setSeed(23456789)');
for(const [key,p] of Object.entries(profiles)){
  context.motionKey=key;
  const sequence=[];
  for(const reverse of [false,true])for(const kind of ['attack','miss']){
    const snapshots=[];
    context.probeFrom=reverse?{x:288,y:83}:{x:100,y:130};context.probeTo=reverse?{x:100,y:130}:{x:288,y:83};context.probeKind=kind;
    for(const progress of progresses){
      context.probeProgress=progress;context.drawProbe.calls=[];
      run('drawMoveMotion(drawProbe,motionKey,probeProgress,probeFrom,probeTo,probeKind)');
      const calls=structuredClone(context.drawProbe.calls);
      for(const call of calls){
        assert.match(call.fill,/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i,key+': native palette');
        assert.ok(call.rect.every(Number.isInteger),key+': integer pixel rectangle');
        const [x,y,w,h]=call.rect;
        assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=384&&y+h<=216,key+': bounded positive rectangles');
        assert.ok(w<384||h<216,key+': effect never paints an opaque backdrop');
      }
      snapshots.push(calls);
      if(!reverse&&kind==='attack')sequence.push(calls);
    }
    // Physical bite/claw/slash misses intentionally contain no hit particles.
    if(kind==='attack'){
      assert.ok(snapshots.some(c=>c.length),key+': visible effect');
      assert.ok(new Set(snapshots.map(c=>JSON.stringify(c))).size>=3,key+': changing native frames');
    }
    assert.equal(snapshots.at(-1).length,0,key+': final frame is transparent');
  }
  allRendered[key]={profile:p,type:moves[key].t,frames:sequence};
}
assert.equal(run('_seed'),23456789,'pure drawing never consumes combat RNG');
context.drawProbe.calls=[];run("drawMoveMotion(drawProbe,'removed-move',.5,{x:100,y:130},{x:288,y:83})");
assert.equal(context.drawProbe.calls.length,0,'unknown move leaves canvas transparent');
console.log('PASS all 58 explicit profiles, varied geometry/gestures, integer transparent frames, both directions, and miss paths');

function advance(ms){
  now+=ms;
  const pending=[...raf.values()];raf.clear();for(const fn of pending)fn(now);
  for(let n=0;n<100;n++){
    const ready=[...timers].filter(([,t])=>t.due<=now);if(!ready.length)break;
    for(const [id,t] of ready){if(timers.delete(id))t.fn();}
  }
}
function begin(side='you'){
  context.testSide=side;
  run("setSeed(34567);beginBattle(randBuild(),randBuild(),34567,testSide)");
}
function play(key='tackle',opponent=false,kind='attack'){
  context.testKey=key;context.testOpponent=opponent;context.testKind=kind;
  run('playFx(testOpponent?OP():MY(),testOpponent?MY():OP(),MOVES[testKey],testKind)');
}
function stopped(label){
  assert.equal(run('MoveMotion.active'),null,label+': active motion cleared');
  assert.equal(run('MoveMotion.frame'),null,label+': scheduled frame canceled');
  assert.equal(run('MoveMotion.timer'),null,label+': fallback timer canceled');
  for(const id of ['spYou','spFoe'])for(const gesture of ['lunge','cast','rise','brace','recoil'])
    assert.equal(getNode('#'+id).classList.contains('move-'+gesture),false,label+': actor class removed');
  assert.deepEqual(getNode('#moveCanvas').commands.at(-1),{clear:[0,0,384,216]},label+': overlay cleared');
}
const draws=[];context.spriteDraws=draws;
run(`const motionOriginalDraw=drawSprite;drawSprite=(canvas,id,view='front',phase=0)=>{
  spriteDraws.push({target:canvas===document.querySelector('#spYou')?'you':canvas===document.querySelector('#spFoe')?'foe':'other',id,view,phase});
  return motionOriginalDraw(canvas,id,view,phase);
};`);
for(const side of ['you','foe']){
  draws.length=0;begin(side);
  assert.ok(draws.some(d=>d.target==='you'&&d.view==='back'),side+': own rear sprite is preserved');
  assert.ok(draws.some(d=>d.target==='foe'&&d.view==='front'),side+': opponent front is preserved');
  advance(400); // Let entry animation finish so the motion class itself must pause breathing.
  const before=run('JSON.stringify(B)');run('setSeed(998877)');
  play('tackle');
  let active=json('MoveMotion.active');
  assert.equal(active.from.x,100,side+': own motion starts at near-side sprite');assert.equal(active.to.x,288,side+': own motion aims to far-side sprite');
  assert.ok(active.from.y>active.to.y,side+': near-to-far attack moves upward');
  assert.ok(getNode('#spYou').classList.contains('move-lunge'),side+': near sprite uses its gesture');
  assert.equal(getNode('#spFoe').classList.contains('move-lunge'),false,side+': opponent remains still before damage');
  draws.length=0;run('IdleAnimation.invalidate()');advance(110);
  assert.ok(draws.filter(d=>d.target==='you').every(d=>d.phase===0),'breathing pauses during source gesture');
  assert.equal(run('_seed'),998877,'playback never consumes combat RNG');
  assert.equal(run('JSON.stringify(B)'),before,'playback never mutates battle units or state');
  const oldFrame=run('MoveMotion.frame');play('flame');
  assert.equal(raf.has(oldFrame),false,'a newer move cancels the previous frame');
  assert.equal(getNode('#spYou').classList.contains('move-lunge'),false,'new gesture removes previous transform');
  assert.ok(getNode('#spYou').classList.contains('move-cast'),'flame uses casting gesture');
  play('tackle',true);active=json('MoveMotion.active');
  assert.equal(active.from.x,288,side+': opponent motion starts at far sprite');assert.equal(active.to.x,100,side+': opponent motion aims toward near sprite');
  assert.ok(active.from.y<active.to.y,'far-to-near direction moves downward');
  assert.ok(getNode('#spFoe').classList.contains('move-lunge'),'opponent gesture uses far actor');
  advance(700);stopped('normal expiry');
  play('firefang');run("show('scBuild')");stopped('leaving battle');
  play('firefang');stopped('outside battle');
}
begin();play('thunder');
document.hidden=true;document.visibilityState='hidden';events.get('visibilitychange')?.();stopped('visibility event');
play('thunder');stopped('hidden playback');
document.hidden=false;document.visibilityState='visible';events.get('visibilitychange')?.();
play('thunder');preference.matches=true;motionEvents.get('change')?.({matches:true});stopped('preference changed mid-move');
play('firefang');
assert.equal(run('MoveMotion.frame'),null,'reduced motion schedules no animated frames');
assert.equal(getNode('#spYou').classList.contains('move-lunge'),false,'reduced motion skips source transforms');
assert.ok(getNode('#moveCanvas').commands.some(c=>c.fill),'reduced motion can show a static impact');
advance(400);stopped('reduced-motion static expiry');
preference.matches=false;motionEvents.get('change')?.({matches:false});
begin();play('night');run('finish(ME)');stopped('battle finish');
begin();play('night');run("netLost('test disconnect')");stopped('network disconnect');
begin();play('flame');begin();stopped('new battle');
run('MoveMotion.stop();MoveMotion.stop()');stopped('idempotent cleanup');
console.log('PASS playback nonmutation/RNG isolation, rear/front perspectives, breathing pause, replacement/expiry, navigation, visibility, reduced motion, finish and disconnect cleanup');

const outputIndex=process.argv.indexOf('--render-json');
if(outputIndex!==-1){const file=process.argv[outputIndex+1];assert.ok(file);fs.writeFileSync(file,JSON.stringify({progresses,rendered:allRendered,
  field:getNode('#fieldCanvas').commands.filter(c=>c.fill),
  own:json('BACK_SPRITES.homura'),opponent:json('SPRITES.oborogi'),
}));console.log('Wrote exact native effect drawing commands to '+file);}
console.log('Unverified: real browser layout/timing, perceived motion, and live PeerJS matches.');
