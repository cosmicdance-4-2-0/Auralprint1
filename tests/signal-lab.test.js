import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignalLab} from '../src/js/audio/signal-lab.js';
const edges=[0,100,200],highs=[100,200,Infinity];
function frame(l=[0,0,0],r=[0,0,0],c=[0,0,0]){return {ready:true,spectrum:{lowHz:edges,highHz:highs},channels:{L:{bandEnergies01:l},R:{bandEnergies01:r},C:{bandEnergies01:c}}};}
test('select valid range and channel',()=>{const s=createSignalLab();assert.equal(s.select({channel:'L',lowHz:50,highHz:150}),true);assert.equal(s.select({lowHz:200,highHz:100}),false);assert.equal(s.select({channel:'X'}),false)});
test('weighted overlap ignores other bands',()=>{const s=createSignalLab();s.select({lowHz:50,highHz:150});const v=s.update(frame([],[],[0.2,0.6,1]),.05);assert.ok(Math.abs(v.energy01-.4)<1e-9);assert.equal(v.bandCount,2)});
test('channel separation and positive flux',()=>{const s=createSignalLab();s.select({channel:'L',lowHz:0,highHz:100});s.update(frame([0,0,0],[1,1,1],[1,1,1]),.05);const v=s.update(frame([0.6,0,0],[1,1,1],[1,1,1]),.05);assert.ok(Math.abs(v.flux01-.6)<1e-9);assert.ok(Math.abs(v.attack01-.6)<1e-9);assert.equal(s.update(frame([0.1,0,0]),.05).flux01,0)});
test('first sample and gaps avoid false attacks',()=>{const s=createSignalLab();assert.equal(s.update(frame([0],[0],[.5]),.05).attack01,0);assert.equal(s.update(frame([0],[0],[1]),1).ready,false);assert.equal(s.update(frame([0],[0],[1]),.05).flux01,0)});
test('read only inputs and reusable result',()=>{const s=createSignalLab(),a=[.4, .7, .2],f=frame([],[],a),copy=[...a],one=s.update(f,.05);assert.equal(s.update(f,.05),one);assert.deepEqual(a,copy)});
test('selecting new target rebases history',()=>{const s=createSignalLab();s.update(frame([],[],[.1,.1]),.05);s.update(frame([],[],[.8,.8]),.05);s.select({lowHz:100,highHz:200});assert.equal(s.update(frame([],[],[.8,.8]),.05).flux01,0)});
