import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Tests canvas data and drawing commands, not browser layout or real input.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).filter(value => value.trim()).join('\n');
const noop = () => {};
const node = () => ({
  value:'', innerHTML:'', children:[], style:{setProperty:noop},
  classList:{add:noop, remove:noop, contains:()=>false},
  appendChild(child){ this.children.push(child); }, remove:noop,
  querySelector:()=>node(), querySelectorAll:()=>[],
  getContext:()=>({clearRect:noop, fillRect:noop}),
});
const nodes = new Map();
const getNode = selector => {
  if (!nodes.has(selector)) nodes.set(selector, node());
  return nodes.get(selector);
};
const context = vm.createContext({
  document:{querySelector:getNode, getElementById:getNode, querySelectorAll:()=>[], createElement:node},
  window:{scrollTo:noop}, localStorage:{getItem:()=>null, setItem:noop, removeItem:noop},
  setTimeout:callback=>{ callback(); return 0; }, clearTimeout:noop, console,
});
vm.runInContext(source, context, {filename:'index.html', timeout:10_000});
const sprites = JSON.parse(vm.runInContext('JSON.stringify(SPRITES)', context));
const backSprites = JSON.parse(vm.runInContext('JSON.stringify(BACK_SPRITES)', context));
assert.equal(Object.keys(sprites).length, 22);
assert.deepEqual(Object.keys(backSprites).sort(),Object.keys(sprites).sort(),'every species has a back sprite');

function rgba(color) {
  assert.match(color, /^#[0-9a-f]{6}$/i, 'opaque six-digit pixel color');
  return (Number.parseInt(color.slice(1),16) * 256 + 255) >>> 0;
}
class Canvas {
  constructor(width, height) {
    this._width=width; this._height=height; this.reset();
    this.ctx={fillStyle:'#000000', clearRect:(...box)=>this.rect(...box,0),
      fillRect:(...box)=>this.rect(...box,rgba(this.ctx.fillStyle))};
  }
  reset(){ this.pixels=new Uint32Array(this._width*this._height); }
  get width(){ return this._width; }
  set width(value){ this._width=value; this.reset(); }
  get height(){ return this._height; }
  set height(value){ this._height=value; this.reset(); }
  getContext(){ return this.ctx; }
  rect(x,y,width,height,color){
    assert.ok([x,y,width,height].every(Number.isInteger), 'draw on integer pixel grid');
    for(let py=Math.max(0,y); py<Math.min(this.height,y+height); py++)
      for(let px=Math.max(0,x); px<Math.min(this.width,x+width); px++)
        this.pixels[py*this.width+px]=color;
  }
}
for(const [view,collection] of [['front',sprites],['back',backSprites]]) {
  for(const [id,sprite] of Object.entries(collection)) {
    assert.equal(sprite.px.length,32,id+': height');
    assert.ok(sprite.px.every(row=>row.length===32),id+': width');
    assert.ok(sprite.px[0]==='.'.repeat(32) && sprite.px[31]==='.'.repeat(32),id+': vertical margin');
    assert.ok(sprite.px.every(row=>row[0]==='.' && row[31]==='.'),id+': horizontal margin');
    let detailedBlocks=0, opaque=0;
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      const key=sprite.px[y][x];
      assert.ok(key==='.' || sprite.pal[key],id+': palette symbol '+key);
      if(key!=='.') opaque++;
      if(y%2===0 && x%2===0 && new Set([
        key,sprite.px[y][x+1],sprite.px[y+1][x],sprite.px[y+1][x+1],
      ]).size>1) detailedBlocks++;
    }
    assert.ok(opaque>120,id+': visible character');
    assert.ok(detailedBlocks>20,id+': native detail beyond 2x nearest-neighbor enlargement');
    context.probe=new Canvas(8,8); context.spriteId=id;
    vm.runInContext(view==='back' ? "drawSprite(probe,spriteId,'back')" : 'drawSprite(probe,spriteId)',context);
    assert.equal(context.probe.width,32,id+': canvas resized');
    assert.equal(context.probe.height,32,id+': canvas resized');
    assert.equal(context.probe.ctx.imageSmoothingEnabled,false,id+': smoothing disabled');
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      const key=sprite.px[y][x];
      assert.equal(context.probe.pixels[y*32+x],key==='.'?0:rgba(sprite.pal[key]),id+': rendered pixel');
    }
  }
}
const pixels = sprite => sprite.px.map(row=>[...row].map(key=>key==='.'?0:rgba(sprite.pal[key])));
for(const id of Object.keys(sprites)) {
  const front=pixels(sprites[id]), back=pixels(backSprites[id]);
  assert.notDeepEqual(back,front,id+': back differs from front');
  assert.notDeepEqual(back,front.map(row=>[...row].reverse()),id+': back is not a mirrored front');
}
console.log('PASS 22 front/back pairs: native 32x32 detail, transparency, palettes, and exact drawing');

// Exercise real paint() through battle startup for both local/host and guest perspectives.
context.drawCalls=[];
vm.runInContext(`
  const originalDrawSprite=drawSprite;
  drawSprite=(canvas,id,view='front')=>{
    drawCalls.push({target:canvas===document.querySelector('#spYou')?'you':canvas===document.querySelector('#spFoe')?'foe':'roster',id,view});
    return originalDrawSprite(canvas,id,view);
  };
`,context);
for(const side of ['you','foe']) {
  context.mySide=side; context.drawCalls.length=0;
  vm.runInContext('setSeed(6789); beginBattle(randBuild(),randBuild(),12345,mySide)',context);
  const ids=JSON.parse(vm.runInContext('JSON.stringify({mine:MY().id,opponent:OP().id})',context));
  const mine=context.drawCalls.filter(call=>call.target==='you');
  const opponent=context.drawCalls.filter(call=>call.target==='foe');
  assert.equal(mine.length,1,side+': paint own actor once');
  assert.equal(opponent.length,1,side+': paint opposing actor once');
  assert.equal(mine[0].id,ids.mine,side+': own actor species');
  assert.equal(mine[0].view,'back',side+': own actor uses back view');
  assert.equal(opponent[0].id,ids.opponent,side+': opponent species');
  assert.equal(opponent[0].view,'front',side+': opponent uses front view');
}
context.drawCalls.length=0;
vm.runInContext('renderRoster(); renderSlots()',context);
assert.ok(context.drawCalls.length>=18,'roster portraits are rendered');
assert.ok(context.drawCalls.every(call=>call.view==='front'),'roster and party portraits retain front view');
console.log('PASS real battle paint selects own back/opponent front on both host and guest; roster stays front');

context.field=new Canvas(384,216);
vm.runInContext('setSeed(987654321); drawField(field)',context);
assert.equal(vm.runInContext('_seed',context),987654321,'field must not consume battle RNG');
assert.ok(context.field.pixels.every(pixel=>pixel!==0),'field covers the full canvas');
assert.ok(new Set(context.field.pixels).size>12,'field has a detailed color palette');
const first=context.field.pixels.slice();
context.field.reset();
vm.runInContext('setSeed(123); drawField(field)',context);
assert.equal(vm.runInContext('_seed',context),123,'field must preserve another seed');
assert.deepEqual(context.field.pixels,first,'field is stable across battle seeds');
console.log('PASS 384x216 field coverage, pixel grid, deterministic art, and isolated battle RNG');
const outputIndex=process.argv.indexOf('--render-json');
if(outputIndex!==-1) {
  const outputPath=process.argv[outputIndex+1];
  assert.ok(outputPath,'--render-json requires an output path');
  fs.writeFileSync(outputPath,JSON.stringify({sprites,backSprites,field:{width:384,height:216,pixels:[...first]}}));
  console.log('Wrote pixel data for asset review to '+outputPath);
}
console.log('Unverified: browser layout, actual screen scaling, and live PeerJS matches.');
