import test from "node:test";
import assert from "node:assert/strict";
import { BAND_NAMES, runtime } from "../src/js/core/preferences.js";
import { parseBandSelection, bandRangeSelection, matchingBandIndices } from "../src/js/ui/orb-band-picker.js";

test("exact targeting preserves sparse selections and explicitly treats empty input as full spectrum", () => {
  assert.deepEqual(parseBandSelection("3, 7; 7 12").ids, [3, 7, 12]);
  assert.deepEqual(parseBandSelection("  ").ids, []);
  for (const invalid of ["-1", "1.5", "1,nope,2", String(BAND_NAMES.length), "1e2", ",,,"]) {
    assert.equal(parseBandSelection(invalid).ids, null, invalid);
    assert.ok(parseBandSelection(invalid).error);
  }
});

test("range selection validates both bounds without silently clamping or reversing intent", () => {
  assert.deepEqual(bandRangeSelection("12", "15"), [12, 13, 14, 15]);
  assert.deepEqual(bandRangeSelection("0", "0"), [0]);
  assert.equal(bandRangeSelection("0", String(BAND_NAMES.length - 1)).length, BAND_NAMES.length);
  for (const pair of [["", "3"], ["3", ""], ["4", "2"], ["-1", "3"], ["2.5", "3"], ["0", String(BAND_NAMES.length)]]) {
    assert.equal(bandRangeSelection(...pair), null);
  }
});

test("search finds configured names, repeated names, indices, and empty results without changing selection", () => {
  assert.equal(matchingBandIndices("  ").length, BAND_NAMES.length);
  assert.ok(matchingBandIndices("eTeRnAl CoRe").includes(BAND_NAMES.indexOf("Eternal Core")));
  assert.ok(matchingBandIndices("255").includes(255));
  const repeated = BAND_NAMES.map((name, i) => name === "Lunar Reflection" ? i : -1).filter(i => i >= 0);
  assert.deepEqual(matchingBandIndices("Lunar Reflection"), repeated);
  assert.deepEqual(matchingBandIndices("no such band"), []);
});

const { createOrbBandPicker } = await import('../src/js/ui/orb-band-picker.js');
const { installUiDocument } = await import('./helpers/ui-dom.js');
function activePicker(t, ids = [0, 255], initialCount = 3) {
  const dom = installUiDocument(); t.after(dom.restore); let count = initialCount, selected = ids;
  const container = dom.element(); dom.document.body.append(container);
  const picker = createOrbBandPicker(container, { orbLabel: 'Orb A', getActiveCount: () => count, onChange: ids => { selected = ids; }, formatRange: index => `range-${index}`, describeBank: () => `${count} active bands` });
  picker.sync(selected); const details = container.children[2]; details.open = true; details.dispatchEvent({ type: 'toggle' });
  const range = details.children[3], first = range.children[0].children[0], last = range.children[1].children[0], apply = range.children[2];
  const search = details.children[5].children[0], list = details.children.at(-1);
  return { dom, container, picker, details, first, last, apply, search, list,
    get selected() { return selected; }, get count() { return count; },
    setCount(value) { count = value; picker.sync(selected); },
    check(index, checked) { const c = list.children[index].children[0]; c.checked = checked; c.dispatchEvent({ type: 'change' }); },
    active() { return list.children.filter(row => !row.children[0].disabled && !row.hidden); },
  };
}

test('AUD-003: picker choices, searches and numeric limits use active count; inactive targets are described', t => {
  const h = activePicker(t);
  assert.equal(h.active().length, 3); assert.equal(h.list.children.length, 3);
  assert.equal(h.first.max, '2'); assert.equal(h.last.max, '2');
  assert.match(h.container.children[0].textContent, /1 active target · 1 inactive target \(255\)/);
  assert.match(h.container.children[0].textContent, /Raise the band count/);
  assert.match(h.first.getAttribute('aria-description'), /0–2/);
  h.search.value = '255'; h.search.dispatchEvent({ type: 'input' }); assert.equal(h.active().length, 0);
});

test('AUD-003: active checkbox edits preserve inactive authored ordering; Full Spectrum clears all', t => {
  const h = activePicker(t, [255, 0]); h.check(1, true); assert.deepEqual(h.selected, [255, 0, 1]);
  h.check(0, false); assert.deepEqual(h.selected, [255, 1]);
  h.container.children[1].children[0].click(); assert.deepEqual(h.selected, []);
  assert.match(h.container.children[0].textContent, /Full spectrum/);
});

test('AUD-003: active ranges reject unavailable indices and retain inactive selection on successful edits', t => {
  const h = activePicker(t); h.first.value = '0'; h.last.value = '255'; h.apply.click();
  assert.deepEqual(h.selected, [0, 255]); assert.equal(h.last.getAttribute('aria-invalid'), 'true');
  assert.match(h.details.children[4].textContent, /0 to 2/);
  h.last.value = '2'; h.first.value = '1'; h.apply.click(); assert.deepEqual(h.selected, [1, 2, 255]);
  assert.equal(h.last.getAttribute('aria-invalid'), 'false');
});

test('AUD116-003: explicit replacement discards rejected and uncommitted picker ranges without replacing controls', t => {
  const h = activePicker(t, [0, 1], 32), first = h.first, last = h.last;
  for (const targets of [[12, 13], [12, 13], [2, 9], []]) {
    first.value = '-1'; last.value = '7'; first.dispatchEvent({ type: 'input' }); h.apply.click(); first.focus();
    h.picker.sync(targets);
    assert.equal(first.value, '-1'); assert.equal(first.getAttribute('aria-invalid'), 'true');
    h.picker.sync(targets, { replaceDrafts: true });
    assert.equal(h.first, first); assert.equal(h.last, last); assert.equal(h.dom.document.activeElement, first);
    assert.equal(first.value, targets.length === 2 && targets[1] === targets[0] + 1 ? String(targets[0]) : '');
    assert.equal(last.value, targets.length === 2 && targets[1] === targets[0] + 1 ? String(targets[1]) : '');
    assert.equal(first.getAttribute('aria-invalid'), 'false'); assert.equal(last.getAttribute('aria-invalid'), 'false');
    assert.equal(h.details.children[4].textContent, '');
    first.dispatchEvent({ type: 'blur' }); first.dispatchEvent({ type: 'change' });
    assert.deepEqual(h.selected, [0, 1], 'replacement synchronization and late events never commit');
    first.value = '7'; first.dispatchEvent({ type: 'input' });
    h.picker.sync(targets, { replaceDrafts: true }); assert.notEqual(first.value, '7');
  }
});

test('AUD-003: count changes retain row/control identity, focus and search/range drafts and reactivate choices', t => {
  const h = activePicker(t, [5, 100, 255], 256), row = h.list.children[0], search = h.search;
  h.search.value = '255'; h.search.focus(); h.setCount(32);
  assert.equal(h.dom.document.activeElement === search, true); assert.equal(search.value, '255');
  assert.equal(h.list.children[0] === row, true); assert.equal(h.list.children[255].children[0].disabled, true);
  assert.equal(h.active().length, 0); assert.match(h.container.children[0].textContent, /1 active target · 2 inactive targets \(100, 255\)/);
  h.first.value = '7'; h.last.value = '12'; h.first.dispatchEvent({ type: 'input' }); h.first.focus(); h.setCount(3);
  assert.equal(h.first.value, '7'); assert.equal(h.last.value, '12'); assert.equal(h.first.max, '2');
  assert.equal(h.dom.document.activeElement === h.first, true); h.setCount(256);
  assert.equal(h.active().length, 1); assert.equal(h.list.children[255].children[0].disabled, false);
  assert.equal(h.list.children[0] === row, true); assert.deepEqual(h.selected, [5, 100, 255]);
  assert.equal(row.children[0].listenerCount("change"), 1);
  assert.match(h.container.children[0].textContent, /3 active targets · 0 inactive targets/);
});

test('AUD-003: picker default reads active runtime count rather than the canonical name table', t => {
  const { settings } = runtime;
  t.after(() => { runtime.settings = settings; });
  runtime.settings = { ...settings, bands: { ...settings.bands, count: 3 } };
  const dom = installUiDocument(); t.after(dom.restore); const container = dom.element();
  const picker = createOrbBandPicker(container, { orbLabel: 'Orb A', onChange() {}, formatRange: () => 'range', describeBank: () => '3 active bands' });
  picker.sync([255]); const details = container.children[2]; details.open = true; details.dispatchEvent({ type: 'toggle' });
  assert.equal(details.children.at(-1).children.length, 3);
  assert.match(container.children[0].textContent, /0 active targets · 1 inactive target \(255\)/);
});

test('AUD-003: closed chooser updates cached inactive availability without replacing rows or building new ones', t => {
  const h = activePicker(t, [255], 256), row = h.list.children[0];
  h.details.open = false; h.details.dispatchEvent({ type: 'toggle' }); h.setCount(3);
  assert.equal(h.list.children.filter(row => !row.children[0].disabled).length, 3);
  assert.equal(h.list.children[255].hidden, true); assert.equal(h.list.children[255].children[0].disabled, true);
  assert.equal(h.list.children[0] === row, true); assert.equal(h.list.children.length, 256);
  h.setCount(256); assert.equal(h.list.children[255].children[0].disabled, false);
  assert.equal(h.list.children[0] === row, true);
});
