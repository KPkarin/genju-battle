import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// WebAudio state/loop checks with fake audio and DOM. This does not verify speakers or a browser decoder.
const entryUrl=new URL('../index.html',import.meta.url);
const html=fs.readFileSync(entryUrl,'utf8');
const assetUrl=new URL('assets/audio/MusMus-BGM-170.ogg',entryUrl);
const assetHeader=Buffer.alloc(4), assetFd=fs.openSync(assetUrl,'r');
try{fs.readSync(assetFd,assetHeader,0,4,0);}finally{fs.closeSync(assetFd);}
assert.equal(assetHeader.toString(),'OggS','bundled battle music is an OGG asset');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
const LOOP_START=663639/44100,LOOP_END=8540173/44100;
const approx=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message+': '+actual+' vs '+expected);
async function settle(){for(let i=0;i<16;i++)await Promise.resolve();}
function world(options={}){
  const nodes=new Map(),events=new Map(),windowEvents=new Map(),storage=new Map(Object.entries(options.storage??{}));
  const writes=[],audio={contexts:[],sources:[],gains:[],requests:[],active:new Set(),maxActive:0,failFetch:!!options.failFetch,failStart:!!options.failStart,pending:[]};
  const listen=(map,name,fn)=>map.set(name,[...(map.get(name)??[]),fn]);
  const emit=(map,name,event)=>{for(const fn of map.get(name)??[])fn(event);};
  function node(){
    const classes=new Set(),listeners=new Map(),attrs={};
    return {value:'',innerHTML:'',textContent:'',children:[],width:32,height:32,open:false,dataset:{},listeners,
      style:{setProperty:noop},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
      appendChild(child){this.children.push(child);return child;},remove:noop,
      querySelector:()=>node(),querySelectorAll:()=>[],getContext:()=>({clearRect:noop,fillRect:noop}),
      addEventListener:(name,fn)=>listen(listeners,name,fn),setAttribute:(key,value)=>{attrs[key]=String(value);},getAttribute:key=>attrs[key]??null,
    };
  }
  const getNode=selector=>{const key=selector.startsWith('#')?selector:'#'+selector;if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
  getNode('#scBuild').classList.add('on');
  const document={hidden:false,visibilityState:'visible',baseURI:'https://example.test/genju-battle/',
    querySelector:getNode,getElementById:getNode,
    querySelectorAll:selector=>selector==='.screen'?['scBuild','scBattle','scResult'].map(getNode):[],createElement:node,
    addEventListener:(name,fn)=>listen(events,name,fn)};
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination={};this.resumeCalls=0;audio.contexts.push(this);}
    resume(){this.resumeCalls++;if(options.failResume)return Promise.reject(new Error('Gesture required'));this.state='running';return Promise.resolve();}
    suspend(){this.state='suspended';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createGain(){const gain={value:0,setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},linearRampToValueAtTime(value){this.value=value;},cancelScheduledValues:noop};const n={gain,connect:noop,disconnect:noop};audio.gains.push(n);return n;}
    createBufferSource(){
      const node={buffer:null,loop:false,loopStart:0,loopEnd:0,starts:[],stops:0,disconnects:0,connect:noop,disconnect(){this.disconnects++;},
        start(...args){this.starts.push(args);if(audio.failStart)throw new Error('Source start failed');audio.active.add(this);audio.maxActive=Math.max(audio.maxActive,audio.active.size);},
        stop(){this.stops++;audio.active.delete(this);this.onended?.();},
      };audio.sources.push(node);return node;
    }
    decodeAudioData(){if(options.failDecode)return Promise.reject(new Error('Decoder failed'));return Promise.resolve({duration:options.duration??236.598866,sampleRate:48000,numberOfChannels:2});}
  }
  const response=()=>({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(8)});
  const fetch=path=>{
    audio.requests.push(String(path));
    if(audio.failFetch)return Promise.reject(new Error('Network failed'));
    if(options.deferredFetch)return new Promise(resolve=>audio.pending.push(()=>resolve(response())));
    return Promise.resolve(response());
  };
  const window={scrollTo:noop,addEventListener:(name,fn)=>listen(windowEvents,name,fn),matchMedia:()=>({matches:false,addEventListener:noop,addListener:noop})};
  if(!options.noAudio)window.AudioContext=AudioContext;
  const context=vm.createContext({console,document,window,fetch,AudioContext:options.noAudio?undefined:AudioContext,performance:{now:()=>0},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,String(value));writes.push([key,String(value)]);},removeItem:key=>storage.delete(key)},
    setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  });
  const run=code=>vm.runInContext(code,context,{timeout:10_000});
  run(source);
  return {run,context,document,getNode,audio,writes,storage,
    async click(id){const n=getNode(id);const results=[n.onclick?.({isTrusted:true}),...(n.listeners.get('click')??[]).map(fn=>fn({isTrusted:true}))];await Promise.all(results);await settle();},
    async visibility(hidden){document.hidden=hidden;document.visibilityState=hidden?'hidden':'visible';emit(events,'visibilitychange');await settle();},
    resolveFetch(){for(const fn of audio.pending.splice(0))fn();},
    async windowEvent(name){emit(windowEvents,name);await settle();},
  };
}

assert.match(html,/イクスゲイナー/,'track title is credited');
assert.match(html,/MusMus/,'artist is credited');
const w=world();
assert.equal(w.run('typeof BattleMusic'),'object','BGM controller is present');
assert.equal(w.audio.contexts.length,0,'page load does not create an audio context');
assert.equal(w.audio.requests.length,0,'page load does not download audio');
const writesBefore=w.writes.length, draftBefore=w.storage.get('genju_battle_draft_v1');
w.run('setSeed(246813579)');
await w.run('BattleMusic.unlock()');w.run('BattleMusic.setBattleActive(true)');await settle();
assert.equal(w.audio.requests.length,1,'one cached download');
assert.equal(w.audio.contexts.length,1,'one reusable context');
assert.equal(w.audio.active.size,1,'battle has one source');
let playing=[...w.audio.active][0];
assert.equal(playing.loop,true,'native WebAudio loop is enabled');
approx(playing.loopStart,LOOP_START,'loop start uses source 44100Hz tags');
approx(playing.loopEnd,LOOP_END,'loop end uses source 44100Hz tags');
assert.equal(w.audio.contexts[0].sampleRate,48000,'test context resamples to a different rate');
assert.equal(playing.starts[0][1]??0,0,'introduction starts at zero');
await Promise.all([w.run('BattleMusic.maybePlay()'),w.run('BattleMusic.maybePlay()')]);await settle();
assert.equal(w.audio.sources.length,1,'repeat start does not create another source');
assert.equal(w.audio.maxActive,1,'sources never overlap');
const ctx=w.audio.contexts[0];ctx.currentTime=250;
w.run('BattleMusic.pause()');
assert.equal(w.audio.active.size,0,'pause stops the source');
const expected=LOOP_START+(250-LOOP_START)%(LOOP_END-LOOP_START);
approx(w.run('BattleMusic.offset'),expected,'pause folds playback position into tagged loop');
await w.run('BattleMusic.maybePlay()');await settle();
playing=[...w.audio.active][0];approx(playing.starts[0][1],expected,'resume keeps the loop position');
w.run('BattleMusic.setVolume(.55)');
approx(w.audio.gains[0].gain.value,.55,'volume reaches gain control');
await w.run('BattleMusic.setEnabled(false)');await settle();
assert.equal(w.audio.active.size,0,'BGM off stops audible playback');
await w.run('BattleMusic.setEnabled(true)');await settle();
assert.equal(w.audio.active.size,1,'BGM on resumes in the battle');
await w.visibility(true);assert.equal(w.audio.active.size,0,'hidden page pauses music');
await w.visibility(false);assert.equal(w.audio.active.size,1,'visible battle resumes music');
w.run("show('scBuild')");await settle();
assert.equal(w.audio.active.size,0,'leaving battle stops music');
assert.equal(w.run('BattleMusic.wanted'),false,'leaving clears playback intent');
assert.equal(w.run('BattleMusic.offset'),0,'next battle starts with introduction');
assert.equal(w.run('_seed'),246813579,'audio does not consume battle RNG');
assert.equal(w.storage.get('genju_battle_draft_v1'),draftBefore,'audio controls preserve party draft');
assert.ok(w.writes.slice(writesBefore).every(([key])=>key!=='genju_battle_draft_v1'),'audio controls do not write the party draft');
console.log('PASS tagged sample-accurate loop, resampling, intro, caching, single source, pause, controls, and visibility');

const game=world();
await game.click('#btnStart');
assert.equal(game.run('B.over'),false,'AI battle starts normally');
assert.ok(game.audio.contexts[0]?.resumeCalls>0,'AI button unlocks audio');
assert.equal(game.audio.active.size,1,'AI battle plays BGM');
game.run("finish('you')");await settle();
assert.equal(game.audio.active.size,0,'battle finish stops BGM immediately');
await game.click('#btnAgain');
assert.equal(game.audio.active.size,1,'rematch starts BGM');
assert.equal([...game.audio.active][0].starts[0][1]??0,0,'rematch restarts the introduction');
game.run("netLost('Disconnected')");await settle();assert.equal(game.audio.active.size,0,'disconnect stops BGM');
const network=world();network.context.unlockCalls=0;network.run(`hostGame=()=>{}; joinGame=()=>{};
  const unlockForBgmTest=BattleMusic.unlock.bind(BattleMusic);
  BattleMusic.unlock=(...args)=>{unlockCalls++;return unlockForBgmTest(...args);};`);
await network.click('#btnHost');await network.click('#btnJoin');
assert.equal(network.context.unlockCalls,2,'host and join gestures both unlock audio');
assert.equal(network.audio.active.size,0,'lobby waiting does not play battle music');
const restored=world();await restored.click('#btnStart');restored.audio.contexts[0].currentTime=37;
await restored.windowEvent('pagehide');assert.equal(restored.audio.active.size,0,'pagehide pauses playback');
assert.equal(restored.run('BattleMusic.wanted'),true,'pagehide retains battle playback intent for BFCache');
approx(restored.run('BattleMusic.offset'),37,'BFCache pause retains music position');
await restored.windowEvent('pageshow');assert.equal(restored.audio.active.size,1,'BFCache pageshow resumes active battle');
approx([...restored.audio.active][0].starts[0][1],37,'BFCache restore does not replay the introduction');
assert.equal(restored.audio.maxActive,1,'BFCache restore does not duplicate sources');
console.log('PASS actual AI/rematch/host/join controls, finish, disconnect, and BFCache lifecycle');

const race=world({deferredFetch:true});
race.run('void BattleMusic.unlock(); BattleMusic.setBattleActive(true)');await settle();
assert.equal(race.audio.requests.length,1,'concurrent unlock/start shares the load');
race.run('BattleMusic.stop()');race.resolveFetch();await settle();
assert.equal(race.audio.sources.length,0,'late loading cannot start BGM after battle stops');
const failure=world({failFetch:true});
await assert.doesNotReject(async()=>{await failure.click('#btnStart');await settle();},'audio fetch failure is contained');
assert.equal(failure.run('B.over'),false,'audio failure does not prevent game play');
assert.equal(failure.audio.active.size,0,'failed audio is silent');
assert.ok(failure.getNode('#bgmStatus').textContent.length>0,'failure gives user feedback');
failure.audio.failFetch=false;
await assert.doesNotReject(async()=>{await failure.run('BattleMusic.unlock()');await settle();},'failed load can retry');
assert.equal(failure.audio.active.size,1,'retry can start the intended battle music');
const unsupported=world({noAudio:true});
await assert.doesNotReject(async()=>{await unsupported.click('#btnStart');await settle();},'unsupported audio is contained');
assert.equal(unsupported.run('B.over'),false,'unsupported audio does not prevent battle');
const decoding=world({failDecode:true});
await assert.doesNotReject(async()=>{await decoding.click('#btnStart');await settle();},'decoder failure is contained');
assert.equal(decoding.audio.active.size,0,'failed decoding creates no audible source');
assert.equal(decoding.run('B.over'),false,'decoder failure leaves battle playable');
const short=world({duration:100});
await short.click('#btnStart');
assert.equal(short.audio.sources.length,0,'invalid loop beyond decoded duration is rejected');
const blocked=world({failResume:true});
await assert.doesNotReject(async()=>{await blocked.click('#btnStart');await settle();},'autoplay policy rejection is contained');
assert.equal(blocked.audio.active.size,0,'blocked context stays silent');
const startFailure=world({failStart:true});
await assert.doesNotReject(async()=>{await startFailure.click('#btnStart');await settle();},'source start exception is contained');
assert.equal(startFailure.run('BattleMusic.source'),null,'failed source is not retained as playing');
assert.ok(startFailure.audio.sources.length>0,'source start was attempted');
assert.ok(startFailure.audio.sources.every(n=>n.disconnects>0),'failed sources are disconnected');
startFailure.audio.failStart=false;await startFailure.click('#btnBgmPlay');
assert.equal(startFailure.audio.active.size,1,'source start failure can retry from the real replay button');
console.log('PASS stale-load cancellation, recoverable fetch/decode/start/policy failure, duration validation, and unsupported audio');

const prefs=world({storage:{genju_battle_audio_v1:JSON.stringify({enabled:false,volume:.42})}});
assert.equal(prefs.run('BattleMusic.enabled'),false,'mute setting survives reload');
approx(prefs.run('BattleMusic.volume'),.42,'volume setting survives reload');
await prefs.click('#btnStart');
assert.equal(prefs.audio.contexts.length,0,'muted battle does not request audio access');
const volume=prefs.getNode('#bgmVolume');volume.value='75';volume.oninput({target:volume});
approx(prefs.run('BattleMusic.volume'),.75,'real volume input updates controller');
assert.equal(JSON.parse(prefs.storage.get('genju_battle_audio_v1')).volume,.75,'volume preference is saved');
await prefs.click('#btnBgm');assert.equal(prefs.audio.active.size,1,'real BGM toggle unlocks muted battle');
assert.equal(JSON.parse(prefs.storage.get('genju_battle_audio_v1')).enabled,true,'enabled preference is saved');
console.log('PASS saved preferences and real BGM/volume controls');
console.log('Unverified: real browser audio policy, OGG decoding, audible playback, and perceived loop seam.');
