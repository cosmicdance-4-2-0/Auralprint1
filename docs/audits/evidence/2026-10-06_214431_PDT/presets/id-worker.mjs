import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repoRoot = process.env.AUDIT_REPO_ROOT || process.cwd();
const source = (relative) => import(pathToFileURL(resolve(repoRoot, relative)).href);
const { UrlPreset } = await source('src/js/presets/url-preset.js');
const { preferences } = await source('src/js/core/preferences.js');
const { createOrb } = await source('src/js/core/orb-collection.js');

const mode = process.argv[2] || 'huge-add';
const id = mode === 'control' ? 'ORB42' : 'ORB9007199254740992';
const orbs = mode === 'huge-import' ? [{ id }, { id }] : [{ id }];
const token = Buffer.from(JSON.stringify({schema:10,prefs:{orbs}})).toString('base64url');
globalThis.location = {hash:'#p='+token};
console.log('URI hash',location.hash);
console.log('before import');
const applied = UrlPreset.applyFromLocationHash();
assert.equal(applied, true);
console.log('import result',applied);
if (mode !== 'huge-import') {
  console.log('before Add');
  const newId = createOrb(preferences.orbs).id;
  if (mode === 'control') assert.equal(newId, 'ORB43');
  console.log('new ID',newId);
  console.log('after Add');
}
