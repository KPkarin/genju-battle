/* Approved 128px artwork. Presentation only; never reads or changes battle RNG. */
(() => {
  'use strict';
  if (typeof Image !== 'function') return;
  const root = 'assets/pixel-v1/';
  const ids = ['homura','shiogame','kokejyu','raitachi','iwaushi','fukurou','doryu','fuen','youcho','soukou','tsutazaru','rainen','saikaku','yoigumo','sarou','ungei','mubaku','oborogi','gako','arakuma','hasukaba','damasdevil','kefarock','yudachou','sarandi'];
  const rightFacing = new Set(['homura','shiogame','kokejyu','fuen','youcho','soukou','tsutazaru','sarou','ungei','arakuma','kefarock']);
  const durations = [420,220,220,300,420,300,220,220];
  const images = new Map(), actors = new Map(), fields = new Map();
  const weatherBuffer = document.createElement('canvas');
  weatherBuffer.width=384; weatherBuffer.height=288;
  let weatherKind=null, weatherPhase=-1;
  function image(name) {
    if (images.has(name)) return images.get(name);
    const im=new Image(); images.set(name,im);
    im.onload=()=>{
      for (const [cv,a] of actors) {
        if (cv.isConnected===false) {actors.delete(cv);continue;}
        if (name===`creatures-${a.view}.png`) api.creature(cv,a.id,a.view,a.phase);
      }
      for (const [cv,kind] of fields) {
        if (cv.isConnected===false) {fields.delete(cv);continue;}
        if (name===`field-${kind}.png`) api.field(cv,kind);
      }
      weatherPhase=-1;
      window.dispatchEvent(new Event('pixelartready'));
    };
    im.src=root+name;
    return im;
  }
  const loaded=im=>im.complete && im.naturalWidth>0;
  const api=window.PixelArt={
    stageHeight() {
      return window.matchMedia('(max-width:999px) and (orientation:portrait)').matches?288:216;
    },
    actorBox(actor,fallback) {
      const stage=document.getElementById('stage')?.getBoundingClientRect();
      const box=actor?.getBoundingClientRect();
      if(!stage?.width || !box?.width)return fallback;
      const scale=384/stage.width;
      return {x:Math.round((box.left-stage.left)*scale),y:Math.round((box.top-stage.top)*scale),w:Math.round(box.width*scale),h:Math.round(box.height*scale)};
    },
    phase(ms) {
      let t=((ms%2320)+2320)%2320;
      for(let i=0;i<durations.length;i++){if(t<durations[i])return i;t-=durations[i];}
      return 0;
    },
    creature(cv,id,view='front',phase=0) {
      const row=ids.indexOf(id);
      if(row<0)return false;
      view=view==='back'?'back':'front';phase=((Math.floor(phase)%8)+8)%8;
      const im=image(`creatures-${view}.png`);
      if(!loaded(im)){actors.set(cv,{id,view,phase});return false;}
      actors.delete(cv);
      if(cv.width!==128)cv.width=128;if(cv.height!==128)cv.height=128;
      const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,128,128);
      const mirror=cv.id==='spFoe' && view==='front' && rightFacing.has(id);
      if(mirror){ctx.save();ctx.translate(128,0);ctx.scale(-1,1);}
      ctx.drawImage(im,phase*128,row*128,128,128,0,0,128,128);
      if(mirror)ctx.restore();
      return true;
    },
    field(cv,kind='clear') {
      if(!cv)return false;
      if(!['rain','shower','sandstorm','snow'].includes(kind))kind='clear';
      fields.set(cv,kind);
      const height=cv.id==='fieldCanvas'?api.stageHeight():216;
      if(cv.width!==384)cv.width=384;if(cv.height!==height)cv.height=height;
      if(cv.id==='fieldCanvas')for(const id of ['statusCanvas','moveCanvas','pixelWeatherCanvas']){
        const layer=document.getElementById(id);if(layer && layer.height!==height)layer.height=height;
      }
      const im=image(`field-${kind}.png`);
      if(!loaded(im))return false;
      const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;
      // Portrait uses the full 4:3 art. Wide layouts crop without stretching pixels.
      ctx.drawImage(im,0,(288-height)/2,384,height,0,0,384,height);
      return true;
    },
    status(ctx,key,frame,box) {
      if(!['paralysis','burn','freeze','sleep','confusion','drowsy','bleed1','bleed2','bleed3','bleed4','bleed5'].includes(key))return false;
      const im=image(`status-${key}.png`);
      if(!loaded(im))return false;
      const f=((Math.floor(frame)%16)+16)%16;
      const scale=box.w/128;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(im,f%8*160,Math.floor(f/8)*160,160,160,
        Math.round(box.x-16*scale),Math.round(box.y-24*scale),Math.round(160*scale),Math.round(160*scale));
      return true;
    },
    preview(ctx,key,now,animate) {
      const im=image('creatures-front.png');if(!loaded(im))return false;
      const phase=animate && key!=='freeze'?api.phase(now):0;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(im,phase*128,17*128,128,128,64,32,64,64);
      api.status(ctx,key,animate?Math.floor(now/150):0,{x:64,y:32,w:64,h:64});
      return true;
    },
    weather(kind,now=0,animate=false) {
      const cv=document.getElementById('pixelWeatherCanvas');if(!cv)return;
      if(!['rain','shower','sandstorm','snow'].includes(kind))kind=null;
      cv.hidden=!kind;
      if(!kind){weatherKind=null;weatherPhase=-1;return;}
      const period=kind==='snow'?80:kind==='shower'?50:70;
      const count=kind==='snow'?48:kind==='sandstorm'?24:18;
      const phase=animate?Math.floor(now/period)%count:0;
      if(weatherKind===kind && weatherPhase===phase)return;
      const src=image(`weather-${kind}.png`);if(!loaded(src))return;
      weatherKind=kind;weatherPhase=phase;
      const ctx=weatherBuffer.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,384,288);
      const tile=(sx,sy,w,h,dx,dy)=>ctx.drawImage(src,sx,sy,w,h,dx,dy,w,h);
      if(kind==='rain'||kind==='shower'){
        const off=phase*12%216;
        ctx.save();ctx.beginPath();ctx.rect(0,0,384,216);ctx.clip();
        tile(0,0,384,216,0,off);tile(0,0,384,216,0,off-216);ctx.restore();
        if(kind==='shower')tile(0,216,384,72,0,216+Math.round(2*Math.sin(phase/count*Math.PI*2)));
        else for(let x=0;x<384;x+=36)if((Math.floor(x/36)+Math.floor(phase/3))%3!==0)tile(x,216,Math.min(36,384-x),72,x,216);
      }else if(kind==='sandstorm'){
        const dx=phase*16%384;tile(0,0,384,288,dx,0);tile(0,0,384,288,dx-384,0);
      }else{
        const dy=phase*6%288,dx=Math.round(3*Math.sin(phase/count*Math.PI*2));
        for(const x of [dx-384,dx,dx+384])for(const y of [dy,dy-288])tile(0,0,384,288,x,y);
      }
      const out=cv.getContext('2d');out.imageSmoothingEnabled=false;out.clearRect(0,0,384,cv.height);
      out.drawImage(weatherBuffer,0,(288-cv.height)/2,384,cv.height,0,0,384,cv.height);
    }
  };
  image('creatures-front.png');image('creatures-back.png');image('field-clear.png');
  window.addEventListener('resize',()=>{
    for(const [cv,kind] of fields)if(cv.isConnected!==false)api.field(cv,kind);
    weatherPhase=-1;window.dispatchEvent(new Event('pixelartready'));
  });
})();
