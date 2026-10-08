import esbuild from "esbuild";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptsDir, "..");
const versionMetadata = readVersionMetadata(projectRoot);

function readVersionMetadata(rootDir) {
  const versionFile = path.join(rootDir, "version");

  let rawVersion = "";
  try {
    rawVersion = readFileSync(versionFile, "utf8");
  } catch (error) {
    throw new Error(`Missing version file: ${versionFile}`, { cause: error });
  }

  const versionTag = rawVersion.trim();
  if (!versionTag) {
    throw new Error(`Version file is empty: ${versionFile}`);
  }
  if (!/^v[0-9][A-Za-z0-9.\-]*$/.test(versionTag)) {
    throw new Error(
      `Version file must contain a safe version tag starting with "v": ${versionFile}`,
    );
  }

  const distVersion = versionTag.slice(1);
  return {
    versionFile,
    versionTag,
    distVersion,
    distHtml: path.join(rootDir, "dist", `auralprint_${distVersion}.html`),
  };
}

const paths = {
  projectRoot,
  versionFile: versionMetadata.versionFile,
  buildDir: path.join(projectRoot, ".build"),
  distDir: path.join(projectRoot, "dist"),
  template: path.join(projectRoot, "src", "index.template.html"),
  cssEntry: path.join(projectRoot, "src", "css", "base.css"),
  jsEntry: path.join(projectRoot, "src", "js", "main.js"),
  cssBundle: path.join(projectRoot, ".build", "auralprint.css"),
  jsBundle: path.join(projectRoot, ".build", "auralprint.js"),
  metafile: path.join(projectRoot, "dist", "esbuild-metafile.json"),
  distHtml: versionMetadata.distHtml,
  branding: path.join(projectRoot, "src", "assets", "branding"),
  hostedDir: path.join(projectRoot, "dist", "hosted"),
  assembler: path.join(projectRoot, "scripts", "assemble_single_file.py"),
};

function describeEsbuildWarning(warning) {
  if (!warning) return "Unknown esbuild warning.";

  const text = typeof warning.text === "string" && warning.text.trim()
    ? warning.text.trim()
    : "Unknown esbuild warning.";
  const location = warning.location;
  if (!location || !location.file) return text;

  return `${location.file}:${location.line}:${location.column} ${text}`;
}

function collectFatalWarnings(result) {
  const warnings = Array.isArray(result && result.warnings) ? result.warnings : [];
  return warnings.filter((warning) => warning && warning.id === "css-syntax-error");
}

function assertNoFatalWarnings(result, label) {
  const fatalWarnings = collectFatalWarnings(result);
  if (!fatalWarnings.length) return;

  const details = fatalWarnings.map(describeEsbuildWarning).join("\n");
  throw new Error(`[${label}] fatal esbuild warnings:\n${details}`);
}

function createJsBuildOptions(extra = {}) {
  return {
    entryPoints: [paths.jsEntry],
    outfile: paths.jsBundle,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["es2020"],
    metafile: true,
    minify: false,
    logLevel: "info",
    ...extra,
  };
}

function createCssBuildOptions(extra = {}) {
  return {
    entryPoints: [paths.cssEntry],
    outfile: paths.cssBundle,
    bundle: true,
    target: ["es2020"],
    metafile: true,
    minify: false,
    logLevel: "info",
    ...extra,
  };
}

async function ensureBuildDirs() {
  await Promise.all([
    mkdir(paths.buildDir, { recursive: true }),
    mkdir(paths.distDir, { recursive: true }),
  ]);
}

async function writeCombinedMetafile(jsMetafile, cssMetafile) {
  const merged = {
    generatedAt: new Date().toISOString(),
    js: jsMetafile,
    css: cssMetafile,
  };
  await writeFile(paths.metafile, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: paths.projectRoot,
      stdio: "inherit",
    });

    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function assembleSingleFile() {
  const scriptArgs = [
    paths.assembler,
    paths.template,
    paths.cssBundle,
    paths.jsBundle,
    versionMetadata.versionTag,
    paths.distHtml,
    "--branding", paths.branding,
    "--hosted-dir", paths.hostedDir,
  ];

  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON, []]);
  candidates.push(["python", []], ["python3", []]);
  if (process.platform === "win32") candidates.push(["py", ["-3"]]);

  let missingInterpreter = null;
  for (const [command, prefixArgs] of candidates) {
    try {
      await runProcess(command, [...prefixArgs, ...scriptArgs]);
      return;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        missingInterpreter = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Could not find a Python interpreter to run ${paths.assembler}. ` +
      `Tried PYTHON, python, python3${process.platform === "win32" ? ", and py -3" : ""}.`,
    { cause: missingInterpreter ?? undefined },
  );
}

async function bundleOnce() {
  await ensureBuildDirs();
  const [jsResult, cssResult] = await Promise.all([
    esbuild.build(createJsBuildOptions()),
    esbuild.build(createCssBuildOptions()),
  ]);
  assertNoFatalWarnings(jsResult, "js");
  assertNoFatalWarnings(cssResult, "css");
  await writeCombinedMetafile(jsResult.metafile, cssResult.metafile);
  return { jsResult, cssResult };
}

async function buildOnce() {
  const results = await bundleOnce();
  await assembleSingleFile();
  return results;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isDirectRun) {
  buildOnce().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  paths,
  versionMetadata,
  describeEsbuildWarning,
  collectFatalWarnings,
  assertNoFatalWarnings,
  createJsBuildOptions,
  createCssBuildOptions,
  ensureBuildDirs,
  writeCombinedMetafile,
  assembleSingleFile,
  bundleOnce,
  buildOnce,
};
