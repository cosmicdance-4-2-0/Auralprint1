import esbuild from "esbuild";
import { createHash } from "node:crypto";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { readFileSync, readdirSync, watch, writeFileSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { visualizerSnapshotMatches } from "./visualizer-discovery.mjs";
import {
  assembleSingleFile, collectFatalWarnings, describeEsbuildWarning,
  createCssBuildOptions, createJsBuildOptions, ensureBuildDirs, paths,
  readVersionMetadata,
} from "./build.mjs";

// Coalesce the several directory notifications produced by one editor save.
// This is a one-shot event debounce, not a filesystem polling interval.
const SAVE_SETTLE_MS = 50;
let activeSession;

async function prepareWatchBuild() { await ensureBuildDirs(); }

function inputsMatch(inputs) {
  try {
    return [...inputs].every(([file, bytes]) => readFileSync(file).equals(bytes));
  } catch { return false; }
}

function fingerprint(inputs) {
  const hash = createHash("sha256");
  for (const [file, bytes] of [...inputs].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(file).update("\0").update(String(bytes.length)).update("\0").update(bytes);
  }
  return hash.digest("hex");
}

function assemblyInputs() {
  // Capture exactly the flat branding files and first-party OG directory.
  // The legacy assets/ SVG subtree is not a deployed input.
  const brandingFiles = readdirSync(paths.branding, { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => path.join(paths.branding, entry.name));
  const ogDir = path.join(paths.branding, "og");
  const ogFiles = readdirSync(ogDir, { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => path.join(ogDir, entry.name));
  return new Map([paths.versionFile, paths.template, ...brandingFiles, ...ogFiles]
    .map(file => [file, readFileSync(file)]));
}

function stagedHostedFiles(directory, targetDirectory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const from = path.join(directory, entry.name);
    const to = path.join(targetDirectory, entry.name);
    if (entry.isDirectory()) files.push(...stagedHostedFiles(from, to));
    else if (entry.isFile()) files.push([to, readFileSync(from)]);
  }
  return files;
}

function watchPlugin(kind, session = activeSession) {
  let sources;
  return {
    name: `auralprint-watch-${kind}`,
    setup(build) {
      build.onStart(() => {
        sources = new Map();
        session.building.add(kind);
      });
      // Capture exact bytes esbuild consumes, including imported dependencies.
      // write:false prevents a later build from mutating queued bundles.
      build.onLoad({ filter: /\.(?:[cm]?js|css|json)$/, namespace: "file" }, args => {
        const contents = readFileSync(args.path);
        sources.set(args.path, contents);
        const extension = path.extname(args.path).slice(1);
        return { contents, loader: ["mjs", "cjs"].includes(extension) ? "js" : extension };
      });
      build.onEnd(result => {
        session.building.delete(kind);
        session.results[kind] = { result, sources };
        const warnings = collectFatalWarnings(result);
        if (result.errors.length || warnings.length) {
          console.error(`[watch] ${kind} bundle failed; skipping assembly.\n${warnings.map(describeEsbuildWarning).join("\n")}`);
        }
        session.queue();
      });
    },
  };
}

function queueAssemble() { activeSession?.queue(); }

async function main() {
  await prepareWatchBuild();
  const contexts = [];
  const watchers = [];
  const abort = new AbortController();
  const services = new Map();
  // esbuild.stop() kills an unref'ed child but does not join its close event.
  // Node 24's child_process diagnostics expose the actual owned handle without
  // patching esbuild or spawn. Join it so shutdown cannot orphan the service.
  function observeChild({ process: child }) {
    child.once("spawn", () => {
      if (!child.spawnargs.some(arg => arg.startsWith("--service="))) return;
      services.set(child, new Promise(resolve => child.once("close", () => {
        services.delete(child);
        resolve();
      })));
    });
  }
  subscribe("child_process", observeChild);
  let timer;
  let assemblyChain = Promise.resolve();
  let draining = false;
  let dirty = false;
  let stopping = false;
  let shutdownPromise;
  let lastSuccess;
  const session = {
    results: {}, building: new Set(),
    queue() {
      if (stopping) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(drain, SAVE_SETTLE_MS);
    },
  };
  activeSession = session;

  async function assembleTransaction() {
    const { js, css } = session.results;
    if (!js || !css || session.building.size) return;
    if ([js, css].some(({ result }) => result.errors.length || collectFatalWarnings(result).length)) return;

    // Validate version for every candidate, even before deduplication.
    const metadata = readVersionMetadata();
    const extra = assemblyInputs();
    const discovery = session.discovery;
    const sources = new Map([...js.sources, ...css.sources, ...discovery.files]);
    const inputs = new Map([...sources, ...extra]);
    if (metadata.versionTag !== extra.get(paths.versionFile).toString("utf8").trim()) {
      session.queue();
      return;
    }
    // A source save can precede esbuild's next notification. Never publish old
    // bundles under a newly selected version while awaiting that rebuild.
    if (!inputsMatch(inputs) || !visualizerSnapshotMatches(discovery)) return;
    const signature = fingerprint(inputs) + JSON.stringify([...discovery.directories]);
    if (signature === lastSuccess) return;

    const stage = await mkdtemp(path.join(paths.buildDir, "watch-"));
    try {
      const branding = path.join(stage, "branding");
      const hostedDir = path.join(stage, "hosted");
      const template = path.join(stage, "template.html");
      const cssBundle = path.join(stage, "auralprint.css");
      const jsBundle = path.join(stage, "auralprint.js");
      const distHtml = path.join(stage, path.basename(metadata.distHtml));
      await mkdir(branding);
      await writeFile(template, extra.get(paths.template));
      for (const [file, bytes] of extra) {
        const relative = path.relative(paths.branding, file);
        if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
          const destination = path.join(branding, relative);
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, bytes);
        }
      }
      await writeFile(jsBundle, js.result.outputFiles[0].contents);
      await writeFile(cssBundle, css.result.outputFiles[0].contents);
      console.log(`[watch] assembling ${metadata.versionTag}`);
      await assembleSingleFile({ metadata, template, cssBundle, jsBundle, distHtml, branding, hostedDir, signal: abort.signal });

      // Events during Python work stay dirty. Byte comparisons also fence saves
      // whose native/esbuild notifications have not arrived yet.
      if (stopping) return;
      if (session.building.size || session.results.js !== js || session.results.css !== css ||
          session.discovery !== discovery || !visualizerSnapshotMatches(discovery) ||
          !inputsMatch(inputs) || fingerprint(assemblyInputs()) !== fingerprint(extra)) {
        console.log(`[watch] superseded ${metadata.versionTag}; awaiting current inputs`);
        session.queue();
        return;
      }

      // Prepare every output before publication. Python never writes live dist.
      // Per-file rename avoids exposing truncated files on Linux and Windows.
      const files = new Map([
        [metadata.distHtml, readFileSync(distHtml)],
        [paths.jsBundle, readFileSync(jsBundle)],
        [paths.cssBundle, readFileSync(cssBundle)],
        [paths.metafile, Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), js: js.result.metafile, css: css.result.metafile }, null, 2) + "\n")],
        ...stagedHostedFiles(hostedDir, paths.hostedDir),
      ]);
      publish(files);
      lastSuccess = signature;
      console.log(`[watch] assembled ${metadata.distHtml} and ${paths.hostedDir} (${metadata.versionTag}; inputs ${signature})`);
    } finally { await rm(stage, { recursive: true, force: true }); }
  }

  function drain() {
    if (draining || stopping) return;
    draining = true;
    assemblyChain = (async () => {
      while (dirty && !stopping) {
        dirty = false;
        try { await assembleTransaction(); }
        catch (error) { if (!stopping) console.error(`[watch] assembly failed: ${error.message}`); }
      }
    })().finally(() => { draining = false; });
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    abort.abort();
    shutdownPromise = (async () => {
      await Promise.all(contexts.map(context => context.dispose()));
      await assemblyChain;
      for (const child of services.keys()) child.ref();
      await esbuild.stop();
      await Promise.all(services.values());
      unsubscribe("child_process", observeChild);
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("message", onMessage);
      if (process.connected) process.disconnect();
      activeSession = undefined;
      console.log("[watch] stopped; filesystem watchers, esbuild and assembler released");
    })();
    return shutdownPromise;
  }
  // Node parents can request graceful shutdown on Windows, where child.kill
  // forcibly terminates instead of delivering a POSIX signal.
  function onMessage(message) { if (message?.type === "shutdown") void shutdown(); }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("message", onMessage);

  try {
    for (const [directory, name] of [[paths.projectRoot, "version"], [path.dirname(paths.template), path.basename(paths.template)], [paths.branding, null], [path.join(paths.branding, "og"), null]]) {
      const watcher = watch(directory, (_event, filename) => {
        if (filename == null || name === null || filename.toString() === name) session.queue();
      });
      watcher.on("error", error => {
        console.error(`[watch] filesystem observation failed: ${error.message}`);
        process.exitCode = 1;
        void shutdown();
      });
      watchers.push(watcher);
    }
    for (const [kind, options] of [["js", createJsBuildOptions], ["css", createCssBuildOptions]]) {
      const context = await esbuild.context(options({ write: false, plugins: [watchPlugin(kind, session)],
        ...(kind === "js" ? { visualizerSnapshot: snapshot => { session.discovery = snapshot; } } : {}),
      }));
      // A signal can arrive while context creation is still awaiting esbuild.
      if (stopping) { await context.dispose(); return { close: shutdown }; }
      contexts.push(context);
    }
    if (stopping) return { close: shutdown };
    await Promise.all(contexts.map(context => context.watch()));
    console.log("[watch] watching JS/CSS dependencies, template, version and hosted branding inputs");
  } catch (error) {
    const cancelled = stopping;
    await shutdown();
    if (!cancelled) throw error;
  }
  return { close: shutdown };
}

function publish(files) {
  const pending = [];
  const published = [];
  try {
    for (const [target, bytes] of files) {
      mkdirSync(path.dirname(target), { recursive: true });
      let previous;
      try { previous = readFileSync(target); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      const temporary = `${target}.watch-tmp`;
      pending.push(temporary);
      writeFileSync(temporary, bytes);
      published.push({ target, temporary, previous, done: false });
    }
    for (const entry of published) {
      renameSync(entry.temporary, entry.target);
      entry.done = true;
    }
  } catch (error) {
    for (const entry of published.reverse()) {
      if (!entry.done) continue;
      if (entry.previous) writeFileSync(entry.target, entry.previous);
      else rmSync(entry.target, { force: true });
    }
    throw error;
  } finally { for (const temporary of pending) rmSync(temporary, { force: true }); }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}

export { prepareWatchBuild, watchPlugin, queueAssemble, main };
