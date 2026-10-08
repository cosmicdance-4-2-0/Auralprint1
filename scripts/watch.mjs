import esbuild from "esbuild";
import {
  assembleSingleFile,
  collectFatalWarnings,
  describeEsbuildWarning,
  createCssBuildOptions,
  createJsBuildOptions,
  ensureBuildDirs,
  paths,
  writeCombinedMetafile,
} from "./build.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let lastJsResult = null;
let lastCssResult = null;
let assemblyChain = Promise.resolve();

async function prepareWatchBuild() {
  await ensureBuildDirs();
}

function queueAssemble() {
  if (!lastJsResult || !lastCssResult) return;
  if (lastJsResult.errors.length || lastCssResult.errors.length) return;
  if (collectFatalWarnings(lastJsResult).length || collectFatalWarnings(lastCssResult).length) return;

  const jsMetafile = lastJsResult.metafile;
  const cssMetafile = lastCssResult.metafile;

  assemblyChain = assemblyChain
    .then(async () => {
      await prepareWatchBuild();
      await writeCombinedMetafile(jsMetafile, cssMetafile);
      await assembleSingleFile();
      console.log(`[watch] assembled ${paths.distHtml} and ${paths.hostedDir}`);
    })
    .catch((error) => {
      console.error(error);
    });
}

function watchPlugin(kind) {
  return {
    name: `auralprint-watch-${kind}`,
    setup(build) {
      build.onEnd((result) => {
        if (kind === "js") lastJsResult = result;
        else lastCssResult = result;

        if (result.errors.length) {
          console.error(`[watch] ${kind} bundle failed; skipping assembly.`);
          return;
        }

        const fatalWarnings = collectFatalWarnings(result);
        if (fatalWarnings.length) {
          const details = fatalWarnings.map(describeEsbuildWarning).join("\n");
          console.error(`[watch] ${kind} bundle has fatal syntax warnings; skipping assembly.\n${details}`);
          return;
        }

        queueAssemble();
      });
    },
  };
}

async function main() {
  await prepareWatchBuild();

  const jsContext = await esbuild.context(
    createJsBuildOptions({ plugins: [watchPlugin("js")] }),
  );
  const cssContext = await esbuild.context(
    createCssBuildOptions({ plugins: [watchPlugin("css")] }),
  );

  const closeContexts = async () => {
    await Promise.all([jsContext.dispose(), cssContext.dispose()]);
  };

  process.on("SIGINT", async () => {
    await closeContexts();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await closeContexts();
    process.exit(0);
  });

  await Promise.all([jsContext.watch(), cssContext.watch()]);
  console.log("[watch] watching src/js and src/css for changes...");
}

const scriptPath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { prepareWatchBuild, watchPlugin, queueAssemble, main };
