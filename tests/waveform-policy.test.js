import test from 'node:test';
import assert from 'node:assert/strict';
import {createWaveformCoordinator} from '../src/js/audio/waveform-coordinator.js';
import {CONFIG} from '../src/js/core/config.js';
import {validateWaveformPolicy,resolveWaveformProfile,evaluateWaveformPolicy} from '../src/js/audio/waveform-policy.js';
import {interpretWaveformMetadata,inspectPcmWavHeader} from '../src/js/audio/waveform-metadata.js';
import {pcmHeader} from './helpers/waveform-wav.js';
import {encodePresetPayload} from '../src/js/presets/preset-codec.js';
const policy=()=>structuredClone(CONFIG.waveform);
const input=(extra={})=>({fileSizeBytes:1024,durationSeconds:60,channelCount:2,metadataConfidence:'verified',durationState:'available',...extra});

for(const [id,bytes] of [['4m',84672000],['8m',169344000],['15m',317520000]])test(`AUD-007 profile ${id} computes exact configured stereo workload`,()=>{
 const p=resolveWaveformProfile(CONFIG.waveform,id);assert.equal(p.pcmBytes,bytes);assert.equal(p.usedDefault,false);
});
test('AUD-007 configured factory default and source profile edits are authoritative',()=>{
 assert.equal(resolveWaveformProfile(CONFIG.waveform).id,'8m');assert.equal(resolveWaveformProfile(CONFIG.waveform,'obsolete').id,'8m');
 const p=policy();p.decodeSampleRateHz=48000;p.automaticProfiles[1].approximateMinutes=10;p.defaultProfileId='15m';
 assert.equal(resolveWaveformProfile(p,'8m').pcmBytes,230400000);assert.equal(resolveWaveformProfile(p).id,'15m');
});
test('AUD-007 encoded equality admits; oversize refuses before metadata access or full read',()=>{
 const p=policy(),i=input({fileSizeBytes:p.maxEncodedBytes});assert.equal(evaluateWaveformPolicy(i,p).decision,'admit');
 let reads=0,metadataReads=0;
 const over={fileSizeBytes:p.maxEncodedBytes+1,file:{arrayBuffer(){reads++;return new ArrayBuffer(8)}},get durationSeconds(){metadataReads++;return 1}};
 assert.equal(evaluateWaveformPolicy(over,p).reason,'encoded-budget');assert.equal(reads,0,'encoded gate must precede any full read');assert.equal(metadataReads,0,'encoded gate must precede metadata access');
});
test('AUD-007 PCM equality admits and one output frame over refuses',()=>{
 const p=policy();p.maxEstimatedDecodedPcmBytes=44100*8;const i=input({durationSeconds:1,requestKind:'manual'});
 assert.equal(evaluateWaveformPolicy(i,p).decision,'admit');assert.equal(evaluateWaveformPolicy({...i,durationSeconds:1+1/44100},p).reason,'pcm-budget','PCM ceiling must be enforced before native work');
});
for(const [id,decision] of [['8m','offer'],['15m','admit']])test(`AUD-007 nine-minute stereo under ${id} is ${decision}`,()=>{
 const r=evaluateWaveformPolicy(input({durationSeconds:540,selectedProfileId:id}));assert.equal(r.decision,decision);assert.equal(r.estimatedPcmBytes,190512000);
});
test('AUD-007 one-hour compressed estimate exceeds hard PCM ceiling despite fitting encoded bytes',()=>{
 const r=evaluateWaveformPolicy(input({fileSizeBytes:57600000,durationSeconds:3600,channelCount:null,metadataConfidence:'unknown'}));
 assert.equal(r.reason,'pcm-budget');assert.equal(r.estimatedPcmBytes,1270080000);assert.equal(r.metadata.confidence,'estimated');
});
test('AUD-007 profile is a PCM workload, not an absolute duration gate',()=>{
 const mono=evaluateWaveformPolicy(input({durationSeconds:540,channelCount:1}));assert.equal(mono.decision,'admit','nine-minute mono fits eight-minute stereo workload');
 const six=evaluateWaveformPolicy(input({durationSeconds:120,channelCount:6,selectedProfileId:'4m'}));assert.equal(six.decision,'offer','two-minute six-channel exceeds four-minute stereo workload');
});
test('AUD-007 manual bypasses convenience only, never encoded or PCM hard ceilings',()=>{
 assert.equal(evaluateWaveformPolicy(input({durationSeconds:540,requestKind:'manual'})).decision,'admit');
 assert.equal(evaluateWaveformPolicy(input({durationSeconds:3600,requestKind:'manual'})).reason,'pcm-budget','manual request must respect PCM ceiling');
 assert.equal(evaluateWaveformPolicy(input({fileSizeBytes:CONFIG.waveform.maxEncodedBytes+1,requestKind:'manual'})).reason,'encoded-budget');
});
test('AUD-007 valid source hard-ceiling overrides are honored without hidden factory cap',()=>{
 const p=policy();p.maxEncodedBytes=128*1024*1024;p.maxEstimatedDecodedPcmBytes=2*1024*1024*1024;
 const r=evaluateWaveformPolicy(input({fileSizeBytes:100*1024*1024,durationSeconds:3600,requestKind:'manual'}),p);
 assert.equal(r.decision,'admit','source overrides must supersede factory ceilings');
});
test('AUD-007 unknown channels use explicit configured estimated fallback, never verified',()=>{
 const p=policy(),r=evaluateWaveformPolicy(input({channelCount:null,metadataConfidence:'unknown'}),p);
 assert.equal(r.metadata.channelCount,2);assert.equal(r.metadata.confidence,'estimated','channel assumption must remain estimated');assert.equal(r.metadata.assumption,'configured-channel-fallback');
 p.fallbackEstimatedChannels=6;assert.equal(evaluateWaveformPolicy(input({channelCount:null,metadataConfidence:'unknown'}),p).metadata.channelCount,6);
});
test('AUD-007 verified six-channel WAV cost uses header and configured output rate',()=>{
 const fixture=pcmHeader({frames:96000*2,rate:96000,channels:6,extensible:true});
 const header=inspectPcmWavHeader(fixture.bytes,fixture.fileSize,CONFIG.waveform.metadataProbe);
 const r=evaluateWaveformPolicy(input({fileSizeBytes:fixture.fileSize,durationSeconds:2,channelCount:null,metadataConfidence:'unknown',headerMetadata:header}));
 assert.equal(r.metadata.confidence,'verified');assert.equal(r.metadata.channelCount,6);assert.equal(r.metadata.sourceSampleRateHz,96000);assert.equal(r.estimatedPcmBytes,2116800);
});
test('AUD-007 contradictions cannot be replaced with a smaller stereo assumption',()=>{
 const header={confidence:'verified',durationSeconds:2,channelCount:6,sourceSampleRateHz:96000};
 assert.equal(evaluateWaveformPolicy(input({durationSeconds:4,channelCount:null,metadataConfidence:'unknown',headerMetadata:header})).reason,'metadata-unavailable');
 assert.equal(evaluateWaveformPolicy(input({durationSeconds:2,channelCount:2,headerMetadata:header})).metadata.confidence,'invalid');
 assert.equal(evaluateWaveformPolicy(input({headerMetadata:{confidence:'invalid'}})).decision,'refuse');
 assert.equal(evaluateWaveformPolicy(input({channelCount:null})).decision,'refuse');
});
for(const value of [undefined,null,NaN])test(`AUD-007 pending duration ${String(value)} defers and unavailable refuses`,()=>{
 const i=input({durationSeconds:value,durationState:'pending',channelCount:null,metadataConfidence:'unknown'});
 assert.equal(evaluateWaveformPolicy(i).decision,'defer');assert.equal(evaluateWaveformPolicy({...i,durationState:'unavailable'}).decision,'refuse');
});
for(const value of [Infinity,-Infinity,-1,0,'60',NaN])test(`AUD-007 invalid available duration ${String(value)} never admits`,()=>{
 assert.equal(evaluateWaveformPolicy(input({durationSeconds:value})).decision,'refuse','invalid numeric duration must never admit');
});
for(const value of [undefined,null,NaN,Infinity,-1,0,1.5,'1024'])test(`AUD-007 malformed File.size ${String(value)} refuses`,()=>{
 assert.equal(evaluateWaveformPolicy(input({fileSizeBytes:value})).reason,'invalid-file-size');
});
test('AUD-007 overflow and invalid channels fail closed',()=>{
 for(const values of [{durationSeconds:Number.MAX_VALUE},{channelCount:NaN},{channelCount:Infinity},{channelCount:0},{channelCount:1.5},{channelCount:Number.MAX_SAFE_INTEGER}]) assert.equal(evaluateWaveformPolicy(input(values)).decision,'refuse');
});
for(const field of ['decodeSampleRateHz','peakBucketCount','fallbackEstimatedChannels','maxEncodedBytes','maxEstimatedDecodedPcmBytes'])test(`AUD-007 edited ${field} rejects unsafe numeric policy`,()=>{
 for(const value of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1,'2']){const p=policy();p[field]=value;assert.equal(validateWaveformPolicy(p).ok,false);assert.equal(evaluateWaveformPolicy(input(),p).reason,'invalid-policy')}
});
test('AUD-007 invalid profile/probe configuration refuses instead of unlimited fallback',()=>{
 for(const edit of [p=>p.defaultProfileId='missing',p=>p.automaticProfiles=[],p=>p.automaticProfiles[0].approximateMinutes=1.5,p=>p.automaticProfiles[0].approximateMinutes=Number.MAX_SAFE_INTEGER,p=>p.automaticProfiles.push(p.automaticProfiles[0]),p=>p.metadataProbe.maxBytes=Infinity,p=>p.metadataProbe.maxChunks=0]){const p=policy();edit(p);assert.equal(evaluateWaveformPolicy(input(),p).reason,'invalid-policy')}
 const zero=policy();zero.maxEncodedBytes=0;assert.equal(validateWaveformPolicy(zero).ok,true);assert.equal(evaluateWaveformPolicy(input(),zero).reason,'encoded-budget');
});
test('AUD-007 policy is frozen, pure and absent from scene schema-10 serialization',()=>{
 assert.equal(Object.isFrozen(CONFIG.waveform),true);assert.equal(Object.isFrozen(CONFIG.waveform.automaticProfiles[0]),true);assert.equal(Object.hasOwn(CONFIG.defaults,'waveform'),false);
 const before=JSON.stringify(CONFIG.defaults),r=evaluateWaveformPolicy(input());assert.equal(r.decision,'admit');assert.equal(JSON.stringify(CONFIG.defaults),before);
 const payload=encodePresetPayload({...CONFIG.defaults,waveform:CONFIG.waveform});assert.equal(payload.schema, 12);assert.equal(Object.hasOwn(payload.prefs,"waveform"),false);const encoded=JSON.stringify(payload);assert.doesNotMatch(encoded,/maxEncodedBytes|automaticProfiles|fallbackEstimatedChannels/);
 let calls=0;const i=input({file:{arrayBuffer(){calls++;throw Error('forbidden read')}}});evaluateWaveformPolicy(i);assert.equal(calls,0);
 assert.equal(interpretWaveformMetadata(input({channelCount:3,metadataConfidence:'unknown'}),CONFIG.waveform).confidence,'estimated');
});

test('AUD-007 offer/defer/refuse never consume or alter coordinator occupancy',async()=>{
 let starts=0,settle;
 const active=new Promise(resolve=>settle=resolve);
 const c=createWaveformCoordinator({extract(){starts++;return active},onUpdate(){}});
 const job=c.request({});const before=c.snapshot();
 for(const i of [input({durationSeconds:540}),input({durationSeconds:NaN,durationState:'pending'}),input({fileSizeBytes:CONFIG.waveform.maxEncodedBytes+1})])evaluateWaveformPolicy(i);
 assert.deepEqual(c.snapshot(),before);assert.equal(starts,1);
 settle(null);await job;
});

test('AUD-007 accepted above-profile behaviors are pure inputs with hard ceilings intact',()=>{
 const i=input({durationSeconds:540});
 assert.equal(evaluateWaveformPolicy(i).decision,'offer');
 assert.equal(evaluateWaveformPolicy({...i,aboveProfileBehavior:'generate-if-permitted'}).decision,'admit');
 const skip=evaluateWaveformPolicy({...i,aboveProfileBehavior:'skip'});assert.equal(skip.decision,'refuse');assert.equal(skip.manualEligible,true);
 assert.equal(evaluateWaveformPolicy({...i,aboveProfileBehavior:'skip',requestKind:'manual'}).decision,'admit');
 assert.equal(evaluateWaveformPolicy({...i,durationSeconds:3600,aboveProfileBehavior:'generate-if-permitted'}).reason,'pcm-budget');
 assert.equal(evaluateWaveformPolicy({...i,aboveProfileBehavior:'unlimited'}).reason,'invalid-request');
 const p=policy();p.defaultAboveProfileBehavior='generate-if-permitted';assert.equal(evaluateWaveformPolicy(i,p).decision,'admit');
 p.defaultAboveProfileBehavior='unlimited';assert.equal(evaluateWaveformPolicy(i,p).reason,'invalid-policy');
});
