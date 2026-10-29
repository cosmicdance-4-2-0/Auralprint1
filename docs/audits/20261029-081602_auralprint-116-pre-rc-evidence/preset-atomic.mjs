import assert from 'node:assert/strict';
import { CONFIG } from '../../../src/js/core/config.js';
import { preferences, runtime, replacePreferences, resolveSettings } from '../../../src/js/core/preferences.js';
import { state } from '../../../src/js/core/state.js';
import { UrlPreset, encodePrefsToHash, decodePrefsFromHash } from '../../../src/js/presets/url-preset.js';
import { sanitizePreset, decodePresetPayload } from '../../../src/js/presets/preset-codec.js';
const saved=structuredClone(preferences);globalThis.location={hash:''};
let checked=0;
try {
  const active=sanitizePreset({schema:12,prefs:{sceneCamera:{x:22.125},audio:{volume:.5},orbs:[]}});
  replacePreferences(active);resolveSettings();
  const view=runtime.settings,world=state.world,camera=state.camera;
  const rawPayloads=[{schema:16,prefs:{orbs:[{trace:{fadeSegments:'5'}}]}},{schema:16,prefs:{orbs:[{bandIds:'1:2,03'}]}},{schema:16,prefs:{world:{widthUnits:Infinity}}},{schema:16,prefs:{bands:{ceilingHz:384001}}},{schema:14,prefs:{}},{schema:15,prefs:{}}];
  for(const payload of rawPayloads) {
    location.hash='#p='+Buffer.from(JSON.stringify(payload)).toString('base64url');
    assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);
    assert.deepEqual(preferences,active);assert.equal(runtime.settings,view);assert.equal(state.world,world);assert.equal(state.camera,camera);checked++;
  }
  const deep='['.repeat(18)+'0'+']'.repeat(18);
  location.hash='#p='+Buffer.from('{"schema":16,"prefs":{"unknown":'+deep+'}}').toString('base64url');
  assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);assert.deepEqual(preferences,active);checked++;
  const literal=JSON.parse('{"schema":16,"prefs":{"__proto__":{"polluted":true}}}');
  assert.equal(decodePresetPayload(literal).ok,false);assert.equal({}.polluted,undefined);checked++;
  const cfg=structuredClone(CONFIG.defaults);cfg.orbs=[{...cfg.orbs[0],id:'opaque-宇宙',bandIds:[59,60,61,2,143,150,151,152]}];
  cfg.sceneCamera={x:123.456789012345,y:-22.4,zoom:1.234567,rotationRad:.7135792468013579};cfg.audio.clearQueueOnSourceExit=true;cfg.orbs[0].trace.fadeSegments=5;
  const roundtrip=await decodePrefsFromHash(encodePrefsToHash(cfg));assert.deepEqual(roundtrip,cfg);checked++;
}finally{replacePreferences(saved);resolveSettings();UrlPreset.cancelPendingImport();}
console.log(JSON.stringify({smallAtomicAndPrecisionChecksPassed:checked}));
