import test from "node:test";
import assert from "node:assert/strict";
import { RecorderEngine } from "../src/js/recording/recorder-engine.js";
import { CONFIG } from "../src/js/core/config.js";
import { createRecordingState, state } from "../src/js/core/state.js";

function createHarness(t) {
  const globals = { window: globalThis.window, MediaRecorder: globalThis.MediaRecorder, MediaStream: globalThis.MediaStream, Blob: globalThis.Blob };
  const previousAudio = { ...state.audio };
  const createUrl = URL.createObjectURL;
  const revokeUrl = URL.revokeObjectURL;
  const recording = createRecordingState();
  recording.includePlaybackAudio = false;
  const config = { ...CONFIG.recording, outputFileNameTemplate: "recording-A" };
  const created = [];
  const revoked = [];
  const canonicalAtRevocation = [];
  const recorders = [];
  const tracks = [];
  const faults = Object.create(null);

  class FakeStream {
    constructor() { this.tracks = []; }
    addTrack(track) { this.tracks.push(track); }
    getTracks() { return this.tracks.slice(); }
    getVideoTracks() { return this.tracks.filter(track => track.kind === "video"); }
    getAudioTracks() { return []; }
  }
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream) {
      if (faults.constructor) throw new Error("injected constructor failure");
      this.stream = stream;
      this.state = "inactive";
      recorders.push(this);
    }
    start() {
      if (faults.start) throw new Error("injected start failure");
      this.state = "recording";
    }
    stop() {
      if (faults.stop) throw new Error("injected stop failure");
      this.state = "inactive";
    }
    data(value) { this.ondataavailable?.({ data: new globals.Blob([value]) }); }
    finish() { this.onstop?.(); }
    error() { this.onerror?.({ error: new Error("injected recorder error") }); }
  }
  const canvas = {
    captureStream() {
      if (faults.acquisition) throw new Error("injected acquisition failure");
      const track = { kind: "video", stopped: false, stop() { this.stopped = true; } };
      tracks.push(track);
      const stream = new FakeStream();
      stream.addTrack(track);
      return stream;
    },
  };
  globalThis.MediaStream = FakeStream;
  globalThis.MediaRecorder = FakeRecorder;
  globalThis.window = { MediaRecorder: FakeRecorder };
  state.audio.isLoaded = true;
  URL.createObjectURL = blob => {
    if (faults.objectUrl) throw new Error("injected URL creation failure");
    const url = createUrl.call(URL, blob);
    created.push(url);
    if (faults.afterUrl) faults.supportOnce = true;
    return url;
  };
  URL.revokeObjectURL = url => {
    revoked.push(url);
    canonicalAtRevocation.push(recording.lastExportUrl);
    revokeUrl.call(URL, url);
  };
  RecorderEngine.init({
    config, stateRef: recording,
    getRenderTap() {
      if (faults.supportOnce) {
        faults.supportOnce = false;
        throw new Error("injected failure after URL assembly");
      }
      return { canvas };
    },
    nowMs: () => 1234,
  });
  t.after(() => {
    RecorderEngine.dispose();
    // Always clean URLs, even if an assertion catches an ownership leak.
    for (const url of created) revokeUrl.call(URL, url);
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    Object.assign(globalThis, globals);
    Object.assign(state.audio, previousAudio);
  });
  const snapshot = () => ({
    lastExportUrl: recording.lastExportUrl,
    lastExportFileName: recording.lastExportFileName,
    lastExportByteSize: recording.lastExportByteSize,
  });
  function complete(value = "successful A") {
    assert.equal(RecorderEngine.start().ok, true);
    recorders.at(-1).data(value);
    assert.equal(RecorderEngine.stop().ok, true);
    recorders.at(-1).finish();
    assert.equal(recording.phase, "complete");
    return snapshot();
  }
  return { recording, config, faults, created, revoked, canonicalAtRevocation, recorders, tracks, snapshot, complete };
}

async function assertRetained(h, previous, content = "successful A") {
  assert.deepEqual(h.snapshot(), previous);
  assert.equal(h.revoked.includes(previous.lastExportUrl), false);
  assert.equal(await (await fetch(previous.lastExportUrl)).text(), content);
}

for (const [fault, code] of [
  ["acquisition", "render-capture-unavailable"],
  ["constructor", "media-recorder-create-failed"],
  ["start", "media-recorder-start-failed"],
]) {
  test(`RC-06: successful A survives failed B ${fault}`, async t => {
    const h = createHarness(t);
    const previous = h.complete();
    h.faults[fault] = true;
    const result = RecorderEngine.start();
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.phase, "error");
    assert.equal(h.recording.lastCode, code);
    assert.equal(h.recording.phase, "error");
    assert.equal(h.recording.chunkCount, 0);
    assert.equal(h.recording.startedAtMs, null);
    await assertRetained(h, previous);
    assert.deepEqual(h.created, [previous.lastExportUrl]);
    assert.deepEqual(h.revoked, []);
    assert.ok(h.tracks.every(track => track.stopped));
  });
}

test("RC-06: successful A survives B recorder error and stale callbacks", async t => {
  const h = createHarness(t);
  const previous = h.complete();
  assert.equal(RecorderEngine.start().ok, true);
  await assertRetained(h, previous);
  const b = h.recorders.at(-1);
  b.data("discard B");
  const lateData = b.ondataavailable;
  const lateStop = b.onstop;
  b.error();
  assert.equal(h.recording.phase, "error");
  assert.equal(h.recording.lastCode, "recorder-error");
  assert.equal(b.onstop, null);
  assert.equal(b.ondataavailable, null);
  assert.equal(b.onerror, null);
  assert.ok(h.tracks.every(track => track.stopped));
  lateData({ data: new Blob(["late B"]) });
  lateStop();
  await assertRetained(h, previous);
  assert.deepEqual(h.created, [previous.lastExportUrl]);
  h.config.outputFileNameTemplate = "recording-C";
  const next = h.complete("C only");
  assert.equal(await (await fetch(next.lastExportUrl)).text(), "C only");
  assert.deepEqual(h.revoked, [previous.lastExportUrl]);
  assert.deepEqual(h.canonicalAtRevocation, [next.lastExportUrl]);
});

for (const [fault, code] of [
  ["noChunks", "no-captured-chunks"],
  ["emptyBlob", "empty-recording-export"],
  ["filename", "export-filename-unresolved"],
  ["objectUrl", "object-url-create-failed"],
  ["blobThrows", "finalize-failed"],
  ["afterUrl", "finalize-failed"],
]) {
  test(`RC-06: successful A survives B finalization failure (${fault})`, async t => {
    const h = createHarness(t);
    const previous = h.complete();
    if (fault === "filename") h.config.preferredMimeTypes = ["video/unknown"];
    assert.equal(RecorderEngine.start().ok, true);
    const b = h.recorders.at(-1);
    if (fault !== "noChunks") b.data("discard B");
    if (fault === "emptyBlob") globalThis.Blob = class extends Blob { get size() { return 0; } };
    if (fault === "blobThrows") globalThis.Blob = class { constructor() { throw new Error("injected Blob failure"); } };
    h.faults[fault] = true;
    assert.equal(RecorderEngine.stop().ok, true);
    await assertRetained(h, previous);
    b.finish();
    assert.equal(h.recording.phase, "error");
    assert.equal(h.recording.lastCode, code);
    assert.ok(h.tracks.every(track => track.stopped));
    await assertRetained(h, previous);
    if (fault === "afterUrl") {
      assert.equal(h.created.length, 2);
      assert.deepEqual(h.revoked, [h.created[1]]);
      await assert.rejects(fetch(h.created[1]), TypeError);
    } else {
      assert.deepEqual(h.created, [previous.lastExportUrl]);
      assert.deepEqual(h.revoked, []);
    }
  });
}

for (const inactive of [false, true]) {
  test(`RC-06: successful A survives B ${inactive ? "inactive recorder" : "stop exception"}`, async t => {
    const h = createHarness(t);
    const previous = h.complete();
    assert.equal(RecorderEngine.start().ok, true);
    if (inactive) h.recorders.at(-1).state = "inactive";
    else h.faults.stop = true;
    const result = RecorderEngine.stop();
    assert.equal(result.ok, false);
    assert.equal(result.phase, "error");
    assert.equal(result.code, inactive ? "recorder-inactive" : "stop-failed");
    await assertRetained(h, previous);
    assert.ok(h.tracks.every(track => track.stopped));
  });
}

test("RC-06: successful B commits before revoking A exactly once; repeated replacement does not leak", async t => {
  const h = createHarness(t);
  const previous = h.complete();
  h.config.outputFileNameTemplate = "recording-B";
  assert.equal(RecorderEngine.start().ok, true);
  await assertRetained(h, previous);
  h.recorders.at(-1).data("successful recording B is longer");
  assert.equal(RecorderEngine.stop().ok, true);
  await assertRetained(h, previous);
  h.recorders.at(-1).finish();
  const next = h.snapshot();
  assert.notEqual(next.lastExportUrl, previous.lastExportUrl);
  assert.equal(next.lastExportFileName, "recording-B.webm");
  assert.equal(next.lastExportByteSize, new Blob(["successful recording B is longer"]).size);
  assert.deepEqual(h.created, [previous.lastExportUrl, next.lastExportUrl]);
  assert.deepEqual(h.revoked, [previous.lastExportUrl]);
  assert.deepEqual(h.canonicalAtRevocation, [next.lastExportUrl]);
  await assert.rejects(fetch(previous.lastExportUrl), TypeError);
  await assertRetained(h, next, "successful recording B is longer");
  for (let i = 0; i < 3; i++) h.complete(`replacement ${i}`);
  assert.deepEqual(h.revoked, h.created.slice(0, -1));
  assert.deepEqual(h.canonicalAtRevocation, h.created.slice(1));
  assert.equal(await (await fetch(h.recording.lastExportUrl)).text(), "replacement 2");
});

test("RC-06: first recording works without a previous export", async t => {
  const h = createHarness(t);
  assert.deepEqual(h.snapshot(), { lastExportUrl: null, lastExportFileName: "", lastExportByteSize: 0 });
  const first = h.complete();
  assert.equal(first.lastExportFileName, "recording-A.webm");
  assert.equal(first.lastExportByteSize, new Blob(["successful A"]).size);
  await assertRetained(h, first);
  assert.deepEqual(h.created, [first.lastExportUrl]);
  assert.deepEqual(h.revoked, []);
});

test("RC-06: reset retains the completed export", async t => {
  const h = createHarness(t);
  const previous = h.complete();
  assert.equal(RecorderEngine.reset().ok, true);
  await assertRetained(h, previous);
  assert.deepEqual(h.revoked, []);
});

test("RC-06: completed-export disposal revokes and clears exactly once", async t => {
  const h = createHarness(t);
  const previous = h.complete();
  assert.equal(RecorderEngine.dispose().ok, true);
  assert.equal(h.recording.phase, "disabled");
  assert.deepEqual(h.snapshot(), { lastExportUrl: null, lastExportFileName: "", lastExportByteSize: 0 });
  assert.deepEqual(h.revoked, [previous.lastExportUrl]);
  await assert.rejects(fetch(previous.lastExportUrl), TypeError);
  RecorderEngine.dispose();
  assert.deepEqual(h.revoked, [previous.lastExportUrl]);
});
