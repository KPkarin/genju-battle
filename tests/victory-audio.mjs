import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Fake WebAudio/DOM verifies playback decisions and races, not real decoding or speakers.
const entryUrl=new URL('../index.html',import.meta.url);
const html=fs.readFileSync(entryUrl,'utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(value=>value.trim()).join('\n');
const noop=()=>{};
const approx=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,message+': '+a+' vs '+b);
async function settle(){for(let i=0;i<32;i++)await Promise.resolve();}
function world(options={}){
  const nodes=new Map(),events=new Map(),windowEvents=new Map(),storage=new Map(Object.entries(options.storage??{}));
  const audio={contexts:[],sources:[],gains:[],requests:[],active:new Set(),pending:[],failVictoryFetch:!!options.failVictoryFetch,failVictoryStart:!!options.failVictoryStart,failVictoryDecode:!!options.failVictoryDecode};
  const listen=(map,name,fn)=>map.set(name,[...(map.get(name)??[]),fn]);
  const emit=(map,name,event)=>{for(const fn of map.get(name)??[])fn(event);};
  function node(){
    const classes=new Set(),listeners=new Map(),attrs={};
    return {value:'',innerHTML:'',textContent:'',children:[],width:32,height:32,open:false,dataset:{},listeners,
      style:{setProperty:noop,removeProperty:noop},
      classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},
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
    constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination={};audio.contexts.push(this);}
    resume(){this.state='running';return Promise.resolve();}
    createGain(){const gain={value:0,setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},linearRampToValueAtTime(value){this.value=value;},cancelScheduledValues:noop};const n={gain,connect:noop,disconnect:noop};audio.gains.push(n);return n;}
    createBufferSource(){
      const n={buffer:null,loop:false,loopStart:0,loopEnd:0,starts:[],stops:0,disconnects:0,connect:noop,
        disconnect(){this.disconnects++;},
        start(...args){this.starts.push(args);if(audio.failVictoryStart&&this.buffer?.track==='victory')throw new Error('Victory start failed');audio.active.add(this);},
        stop(){this.stops++;audio.active.delete(this);this.onended?.();},
      };audio.sources.push(n);return n;
    }
    decodeAudioData(bytes){
      const victory=new Uint8Array(bytes)[0]===2;
      if(victory&&audio.failVictoryDecode)return Promise.reject(new Error('Victory decode failed'));
      return Promise.resolve({duration:victory?4.464688:236.598866,sampleRate:48000,numberOfChannels:2,track:victory?'victory':'battle'});
    }
  }
  const response=victory=>({ok:true,status:200,arrayBuffer:async()=>Uint8Array.of(victory?2:1).buffer});
  const fetch=path=>{
    const value=String(path),victory=value.endsWith('j_24.mp3');audio.requests.push(value);
    if(victory&&audio.failVictoryFetch)return Promise.reject(new Error('Victory fetch failed'));
    if(victory&&options.deferredVictory)return new Promise(resolve=>audio.pending.push(()=>resolve(response(true))));
    return Promise.resolve(response(victory));
  };
  const window={scrollTo:noop,addEventListener:(name,fn)=>listen(windowEvents,name,fn),matchMedia:()=>({matches:false,addEventListener:noop,addListener:noop})};
  if(!options.noAudio)window.AudioContext=AudioContext;
  const context=vm.createContext({console,document,window,fetch,performance:{now:()=>0},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setTimeout:callback=>{callback();return 0;},clearTimeout:noop,
  });
  const run=code=>vm.runInContext(code,context,{timeout:10_000});run(source);
  return {run,context,document,getNode,audio,storage,
    async click(id){const n=getNode(id);await Promise.all([n.onclick?.({isTrusted:true}),...(n.listeners.get('click')??[]).map(fn=>fn({isTrusted:true}))]);await settle();},
    async visibility(hidden){document.hidden=hidden;document.visibilityState=hidden?'hidden':'visible';emit(events,'visibilitychange');await settle();},
    async windowEvent(name){emit(windowEvents,name);await settle();},
    async resolveVictory(){for(const fn of audio.pending.splice(0))fn();await settle();},
    active(track){return [...audio.active].filter(n=>n.buffer?.track===track);},
    end(n){audio.active.delete(n);n.onended?.();},
  };
}

const assetUrl=new URL('assets/audio/j_24.mp3',entryUrl),asset=fs.readFileSync(assetUrl);
assert.ok(asset.length>1000,'victory MP3 is bundled');
assert.ok(asset.subarray(0,3).toString()==='ID3'||(asset[0]===0xff&&(asset[1]&0xe0)===0xe0),'victory asset has an MP3/ID3 header');
assert.match(html.replace(/<[^>]*>/g,''),/BGM：hitoshi by Senses Circuit/,'requested victory credit is visible');
assert.match(html,/MusMus/,'battle BGM credit is retained');

const idle=world();
assert.equal(idle.run('typeof VictoryAudio'),'object');
assert.equal(idle.audio.requests.length,0,'loading the page downloads no audio');
assert.equal(idle.audio.contexts.length,0,'loading the page creates no audio context');
assert.equal(idle.run('VICTORY_AUDIO_INFO.src'),'assets/audio/j_24.mp3');

const game=world();
await game.click('#btnStart');
assert.equal(game.active('battle').length,1,'battle BGM plays during battle');
assert.equal(game.active('victory').length,0,'preloading does not play the victory jingle');
const battle=game.active('battle')[0],draft=game.storage.get('genju_battle_draft_v1');
game.run("setSeed(478122);finish('you')");await settle();
assert.equal(game.run('_seed'),478122,'victory audio consumes no battle RNG');
assert.equal(game.storage.get('genju_battle_draft_v1'),draft,'victory does not modify the saved party');
assert.equal(game.active('battle').length,0,'winning stops battle BGM');
assert.ok(battle.stops>0,'battle source is actually stopped');
assert.equal(game.active('victory').length,1,'local winner hears the victory jingle');
assert.equal(game.getNode('#scResult').classList.contains('on'),true,'result screen opens while the jingle continues');
let jingle=game.active('victory')[0];
assert.equal(jingle.loop,false,'victory jingle is one-shot');
approx(jingle.starts[0][1]??0,0,'victory starts at the beginning');
assert.equal(game.audio.contexts.length,1,'battle and victory reuse one audio context');
await Promise.all([game.run('VictoryAudio.maybePlay()'),game.run('VictoryAudio.maybePlay()')]);await settle();
assert.equal(game.active('victory').length,1,'concurrent playback requests do not overlap jingles');
assert.equal(game.audio.requests.filter(p=>p.endsWith('j_24.mp3')).length,1,'victory audio is cached');
game.run('BattleMusic.setVolume(.61)');
approx(game.audio.gains[0].gain.value,.61,'shared volume applies to victory playback');
await game.click('#btnBgm');assert.equal(game.audio.active.size,0,'shared mute stops victory playback');
await game.click('#btnBgm');assert.equal(game.active('victory').length,1,'shared unmute resumes the intended victory jingle');
jingle=game.active('victory')[0];game.end(jingle);await settle();
assert.equal(game.run('VictoryAudio.wanted'),false,'natural completion clears victory playback intent');
assert.equal(game.active('victory').length,0,'natural completion never restarts or loops');
await game.click('#btnAgain');assert.equal(game.active('battle').length,1,'rematch starts the battle BGM');
assert.equal(game.active('victory').length,0,'rematch has no old victory source');
console.log('PASS cached one-shot victory playback, local-win result lifecycle, shared controls, natural completion, and RNG/draft isolation');

for(const [perspective,winner,expectVictory] of [['you','foe',false],['foe','foe',true],['foe','you',false]]){
  const w=world();await w.click('#btnStart');w.run(`ME=${JSON.stringify(perspective)};finish(${JSON.stringify(winner)})`);await settle();
  assert.equal(w.active('victory').length,expectVictory?1:0,perspective+' client with '+winner+' winner gets correct local result audio');
  assert.equal(w.active('battle').length,0,'every result stops battle BGM');
}
const muted=world({storage:{genju_battle_audio_v1:JSON.stringify({enabled:false,volume:.3})}});
await muted.click('#btnStart');muted.run("finish('you')");await settle();
assert.equal(muted.audio.active.size,0,'saved mute also suppresses the victory jingle');
assert.equal(muted.audio.contexts.length,0,'muted victory does not request audio access');
console.log('PASS host/guest local-win versus loss selection and saved mute');

const hidden=world();await hidden.click('#btnStart');hidden.run("finish('you')");await settle();
hidden.audio.contexts[0].currentTime=1.25;
await hidden.visibility(true);assert.equal(hidden.audio.active.size,0,'hidden page pauses the victory jingle');
approx(hidden.run('VictoryAudio.offset'),1.25,'pause retains the short jingle position');
await hidden.visibility(false);assert.equal(hidden.active('victory').length,1,'visible result resumes victory');
approx(hidden.active('victory')[0].starts[0][1],1.25,'visibility resumes from the paused offset');
await hidden.windowEvent('pagehide');assert.equal(hidden.audio.active.size,0,'pagehide pauses victory for BFCache');
await hidden.windowEvent('pageshow');assert.equal(hidden.active('victory').length,1,'pageshow restores an unfinished victory');
hidden.run("show('scBuild')");await settle();
assert.equal(hidden.audio.active.size,0,'return to team building stops victory');
assert.equal(hidden.run('VictoryAudio.wanted'),false,'return to team building clears victory intent');
await hidden.visibility(true);await hidden.visibility(false);
assert.equal(hidden.audio.active.size,0,'visibility cannot revive an exited result');
const lost=world();await lost.click('#btnStart');lost.run("finish('you')");await settle();lost.run("netLost('Disconnected')");await settle();
assert.equal(lost.active('victory').length,0,'disconnect cleanup stops victory');
console.log('PASS victory visibility/BFCache pause and resume, navigation cleanup, and disconnect cleanup');

// Install the actual host/guest close and data handlers rather than calling the
// departure helper directly: a peer often closes its channel on the result page.
for(const role of ['host','guest'])for(const departure of ['close','bye'])for(const finished of [false,true]){
  const w=world();
  w.run(`
    class VictoryTestConnection {
      constructor(){this.handlers={};this.open=true;this.sent=[];this.closed=false;}
      on(name,handler){this.handlers[name]=handler;}
      emit(name,value){return this.handlers[name]?.(value);}
      send(message){this.sent.push(message);}
      close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');}
    }
    globalThis.Peer=class {
      constructor(){this.handlers={};}
      on(name,handler){this.handlers[name]=handler;}
      emit(name,value){return this.handlers[name]?.(value);}
      connect(){return this.connection=new VictoryTestConnection();}
      destroy(){}
    };
    var victoryPeerConnection;
  `);
  await w.run('BattleMusic.unlock()');
  await w.run(`(async()=>{
    if(${JSON.stringify(role)}==='host'){
      await hostGame('victory-test');
      victoryPeerConnection=new VictoryTestConnection();
      NET.peer.emit('connection',victoryPeerConnection);
      const opening=victoryPeerConnection.emit('open');
      victoryPeerConnection.emit('data',{t:'team',rulesVersion:BATTLE_RULES_VERSION,team:teamPayload()});
      await opening;
    }else{
      await joinGame('victory-test');NET.peer.emit('open');
      victoryPeerConnection=NET.conn;
      const opening=victoryPeerConnection.emit('open');
      victoryPeerConnection.emit('data',{t:'start',rulesVersion:BATTLE_RULES_VERSION,team:teamPayload(),seed:4419});
      await opening;
    }
  })()`);await settle();
  assert.equal(w.run('NET.on'),true,role+': real handshake established the connection');
  assert.equal(w.run('ME'),role==='host'?'you':'foe',role+': canonical local perspective');
  assert.equal(w.active('battle').length,1,role+': live match has battle music');
  if(finished){w.run('finish(ME)');await settle();}
  const beforeDeparture=w.active(finished?'victory':'battle')[0];
  assert.ok(beforeDeparture,role+': expected source exists before departure');
  if(departure==='bye')w.run("victoryPeerConnection.emit('data',{t:'bye'})");
  w.run('victoryPeerConnection.close()');await settle();
  assert.equal(w.run('NET.on'),false,role+': peer departure clears the network flag');
  assert.equal(w.run('Object.keys(NET.waiters).length'),0,role+': peer departure clears waiters');
  if(finished){
    assert.equal(w.active('victory').length,1,role+' '+departure+': peer leaving a completed match preserves victory audio');
    assert.equal(w.active('victory')[0],beforeDeparture,role+' '+departure+': existing jingle keeps playing without restart');
    assert.equal(beforeDeparture.stops,0,role+' '+departure+': result jingle source was never stopped');
    assert.equal(w.getNode('#scResult').classList.contains('on'),true,role+': result stays visible after departure');
  }else{
    assert.equal(w.audio.active.size,0,role+' '+departure+': unfinished match departure stops all audio');
    assert.ok(beforeDeparture.stops>0,role+': actual battle source was stopped');
    assert.equal(w.run('B.over'),true,role+': disconnected live match is closed');
    assert.equal(w.run('VictoryAudio.wanted'),false,role+': disconnect does not invent a victory');
  }
}
console.log('PASS actual host/guest connection close and bye callbacks preserve completed victory jingles and stop unfinished match audio');

const race=world({deferredVictory:true});await race.click('#btnStart');
race.run("finish('you')");await settle();race.run("show('scBuild')");await race.resolveVictory();
assert.equal(race.active('victory').length,0,'a delayed victory fetch cannot play after leaving results');
assert.equal(race.run('VictoryAudio.wanted'),false,'delayed decode does not restore canceled playback intent');
const nextBattle=world({deferredVictory:true});await nextBattle.click('#btnStart');nextBattle.run("finish('you')");await settle();
await nextBattle.click('#btnAgain');await nextBattle.resolveVictory();
assert.equal(nextBattle.active('victory').length,0,'old async victory cannot start over a rematch');
assert.equal(nextBattle.active('battle').length,1,'rematch BGM keeps playing after old victory load resolves');
for(const options of [{failVictoryFetch:true},{failVictoryDecode:true},{failVictoryStart:true},{noAudio:true}]){
  const w=world(options);await w.click('#btnStart');
  await assert.doesNotReject(async()=>{w.run("finish('you')");await settle();},'victory audio failure stays contained');
  assert.equal(w.run('B.over'),true,'victory audio failure does not prevent match completion');
  assert.equal(w.getNode('#scResult').classList.contains('on'),true,'victory audio failure still shows result');
  assert.equal(w.active('victory').length,0,'failed victory audio is silent');
  w.audio.failVictoryFetch=w.audio.failVictoryDecode=w.audio.failVictoryStart=false;
  if(!options.noAudio){
    await w.click('#btnBgmPlay');
    assert.equal(w.active('victory').length,1,'the real replay button retries the intended victory jingle');
    assert.equal(w.active('battle').length,0,'victory retry does not restart battle BGM');
  }
}
console.log('PASS late-load cancellation across navigation/rematch and contained MP3 fetch/decode/start/unsupported-audio failures');
console.log('Unverified: real browser layout/input, MP3 decoding, audible level, and live PeerJS matches.');
