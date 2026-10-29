import test from "node:test";
import assert from "node:assert/strict";
import { Scrubber } from "../src/js/audio/scrubber.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";
import { state } from "../src/js/core/state.js";

function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
async function flush() { for(let i=0;i<12;i++) await Promise.resolve(); }
function harness(t) {
  const oldWindow=globalThis.window, oldDocument=globalThis.document, oldOffline=globalThis.OfflineAudioContext;
  const oldAudio={...state.audio}, oldSource=structuredClone(state.source);
  const media={duration:20,currentTime:0}, files=[], reads=[], decodes=[], listeners=[];
  let writes=0, text="", rects=[];
  const time={get textContent(){return text},set textContent(v){writes++;text=v}};
  const ctx=new Proxy({clearRect(){rects=[]},fillRect(...args){rects.push(args)}},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const win=new EventTarget(), surface=Object.assign(new EventTarget(),{clientWidth:100,clientHeight:36,width:100,height:36,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,width:100})});
  for(const target of [win,surface]) {
    const add=target.addEventListener;
    target.addEventListener=function(type,...args){listeners.push(type);return add.call(this,type,...args)};
  }
  globalThis.window=win;globalThis.document=Object.assign(new EventTarget(),{getElementById:id=>id==="scrubberTime"?time:null});
  globalThis.OfflineAudioContext=class {decodeAudioData(bytes){const f=files.find(f=>f.bytes===bytes);decodes.push(f.name);return f.decode.promise}};
  t.mock.method(AudioEngine,"getMediaEl",()=>media);
  Object.assign(state.audio,{isLoaded:true,isPlaying:true,transportError:""});
  Object.assign(state.source,{kind:"file",status:"active",sessionActive:true});
  Scrubber.init(surface);Scrubber.reset();
  t.after(()=>{Scrubber.reset();Object.assign(state.audio,oldAudio);Object.assign(state.source,oldSource);globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.OfflineAudioContext=oldOffline});
  function file(name,amplitude=.25){const f={name,size:16,slice:()=>({arrayBuffer:async()=>new ArrayBuffer(16)}),bytes:new ArrayBuffer(8),read:deferred(),decode:deferred()};f.arrayBuffer=()=>{reads.push(name);return f.read.promise};f.pcm={numberOfChannels:1,getChannelData:()=>new Float32Array(13).fill(amplitude)};files.push(f);return f}
  return {file,reads,decodes,media,surface,win,listeners,
    get text(){return text},get writes(){return writes},get rectCount(){return rects.length},
    async read(f){f.read.resolve(f.bytes);await flush()},async decode(f){f.decode.resolve(f.pcm);await flush()},
  };
}
function mouse(target,type,x,buttons=type==="mouseup"?0:1){const e=new Event(type);e.clientX=x;e.button=0;e.buttons=buttons;target.dispatchEvent(e)}

test("AUD-007 Scrubber clears old peaks, terminates drag and distinguishes waiting from decoding",async t=>{
  const h=harness(t),a=h.file("completed"),b=h.file("blocked"),c=h.file("newest");
  const pa=Scrubber.loadFile(a);await h.read(a);await h.decode(a);await pa;
  assert.ok(h.rectCount>1);
  mouse(h.surface,"mousedown",25);assert.equal(h.media.currentTime,5);
  const pb=Scrubber.loadFile(b);assert.equal(h.rectCount,1,"new selection clears old peaks immediately");
  mouse(h.win,"mousemove",75);assert.equal(h.media.currentTime,5,"load must end old drag");
  await h.read(b);const pc=Scrubber.loadFile(c);assert.match(h.text,/waiting for waveform/);
  assert.deepEqual(h.reads,["completed","blocked"]);
  await h.decode(b);await pb;
  assert.equal(h.rectCount,1,"obsolete native success cannot restore old waveform");
  assert.match(h.text,/decoding waveform/);
  await h.read(c);await h.decode(c);await pc;
  assert.doesNotMatch(h.text,/waiting|decoding|unavailable/);
});

for(const transition of ["Clear","mic","stream"]) test(`AUD-007 ${transition} invalidates pending presentation without admitting stale File work`,async t=>{
  const h=harness(t),a=h.file("A"),b=h.file("pending B");
  const pa=Scrubber.loadFile(a);await h.read(a);
  const pb=Scrubber.loadFile(b);
  Scrubber.reset();
  Object.assign(state.audio,{isLoaded:false,isPlaying:false});
  Object.assign(state.source,{kind:transition==="Clear"?"none":transition,status:transition==="Clear"?"idle":"active"});
  Scrubber.draw();const copy=h.text;
  await h.decode(a);await pa;await pb;
  assert.deepEqual(h.reads,["A"],"source transition must discard pending File work");
  assert.deepEqual(h.decodes,["A"]);
  assert.equal(h.text,copy);
  assert.equal(h.rectCount,1);
});

test("AUD-007 fallback seeking/playback and unchanged time text remain independent of waveform failure",async t=>{
  const h=harness(t),a=h.file("A"),p=Scrubber.loadFile(a);
  await flush();a.read.reject(new Error("waveform only"));await p;
  assert.match(h.text,/waveform unavailable/);
  mouse(h.surface,"mousedown",75);mouse(h.win,"mouseup",75);
  assert.equal(h.media.currentTime,15);
  assert.equal(state.audio.isLoaded,true);assert.equal(state.audio.isPlaying,true);assert.equal(state.audio.transportError,"");
  Scrubber.draw();const before=h.writes;
  for(let i=0;i<100;i++)Scrubber.draw();
  assert.equal(h.writes,before,"unchanged waveform status must not rewrite time text");
});

test("AUD-007 repeated load/reset retains no pending File reads or new interaction listeners",async t=>{
  const h=harness(t),a=h.file("A");const pa=Scrubber.loadFile(a);await h.read(a);
  const listeners=[...h.listeners];
  for(let i=0;i<100;i++){Scrubber.loadFile(h.file(`discarded ${i}`));Scrubber.reset()}
  assert.deepEqual(h.listeners,listeners);
  await h.decode(a);await pa;
  assert.deepEqual(h.reads,["A"]);
  assert.equal(h.rectCount,1);
});

test("AUD-007 native waveform rejection preserves an active recorder and seekable playing media",async t=>{
  const h=harness(t),a=h.file("native failure"),oldRecording=structuredClone(state.recording);
  Object.assign(state.recording,{phase:"recording"});
  const recording=structuredClone(state.recording);
  t.after(()=>Object.assign(state.recording,oldRecording));
  const p=Scrubber.loadFile(a);await h.read(a);a.decode.reject(new Error("native decoding rejected"));await p;
  assert.match(h.text,/waveform unavailable/);
  mouse(h.surface,"mousedown",75);mouse(h.win,"mouseup",75);
  assert.equal(h.media.currentTime,15);assert.equal(state.audio.isPlaying,true);assert.equal(state.audio.transportError,"");
  assert.deepEqual(state.recording,recording,"optional native failure must preserve recorder state");
});

for (const gesture of ["mouse", "touch"]) test(`AUD116-004 ${gesture} cancellation fences a replacement track and preserves transport/recording`, async t => {
  const h = harness(t), oldRecording = structuredClone(state.recording);
  Object.assign(state.recording, { phase: "recording" });
  const audio = structuredClone(state.audio), source = structuredClone(state.source), recording = structuredClone(state.recording);
  t.after(() => Object.assign(state.recording, oldRecording));
  const touch = (target, type, x) => { const e = new Event(type, { cancelable: true }); e.touches = [{ clientX: x }]; target.dispatchEvent(e); return e; };
  for (let cycle = 0; cycle < 10; cycle++) {
    if (gesture === "mouse") mouse(h.surface, "mousedown", 25);
    else touch(h.surface, "touchstart", 25);
    assert.equal(h.media.currentTime, 5);
    Scrubber.reset();
    const replacement = { duration: 40, currentTime: 3 };
    t.mock.method(AudioEngine, "getMediaEl", () => replacement);
    await Scrubber.loadFile({ size: NaN });
    mouse(h.win, "mousemove", 80);
    assert.equal(touch(h.win, "touchmove", 80).defaultPrevented, false);
    assert.equal(replacement.currentTime, 3, "stale input cannot seek the new track");
    assert.equal(h.media.currentTime, 5, "cancellation must not seek the old track");
    if (gesture === "mouse") { mouse(h.surface, "mousedown", 20); mouse(h.win, "mousemove", 40); }
    else { touch(h.surface, "touchstart", 20); assert.equal(touch(h.win, "touchmove", 40).defaultPrevented, true); }
    assert.equal(replacement.currentTime, 16);
    Scrubber.reset();
    t.mock.method(AudioEngine, "getMediaEl", () => h.media);
  }
  assert.deepEqual(state.audio, audio);
  assert.deepEqual(state.source, source);
  assert.deepEqual(state.recording, recording);
});
