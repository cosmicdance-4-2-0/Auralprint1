import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateVisualizerManifest, planVisualizerUpdates } from "../src/js/visualizers/contract.js";

function entries(directory) { return readdirSync(directory).sort(); }

export function visualizerSnapshotMatches(snapshot) {
  if (!snapshot) return false;
  try {
    return [...snapshot.files].every(([file, bytes]) => readFileSync(file).equals(bytes)) &&
      [...snapshot.directories].every(([directory, names]) => JSON.stringify(entries(directory)) === JSON.stringify(names));
  } catch { return false; }
}

export function createVisualizerDiscoveryPlugin({ rootDir, onSnapshot = () => {} }) {
  const directory = path.join(rootDir, "src/js/visualizers");
  const catalog = path.join(directory, "catalog.js");
  return {
    name: "auralprint-visualizer-discovery",
    setup(build) {
      build.onLoad({ filter: /[/\\]visualizers[/\\]catalog\.js$/, namespace: "file" }, args => {
        if (args.path !== catalog) return;
        const snapshot = { files: new Map(), directories: new Map() };
        const watchFiles = [catalog];
        try {
          snapshot.files.set(catalog, readFileSync(catalog));
          const names = entries(directory);
          snapshot.directories.set(directory, names);
          const types = [];
          for (const name of names) {
            const location = path.join(directory, name);
            const stat = lstatSync(location);
            if (stat.isSymbolicLink()) throw new Error(`Visualizer paths cannot be symbolic links: ${name}`);
            if (!stat.isDirectory()) continue;
            if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`Invalid Visualizer directory: ${name}`);
            snapshot.directories.set(location, entries(location));
            const manifestPath = path.join(location, "visualizer.json");
            const entryPath = path.join(location, "index.js");
            watchFiles.push(manifestPath, entryPath);
            for (const file of [manifestPath, entryPath]) if (!lstatSync(file).isFile()) throw new Error(`Expected regular Visualizer file: ${file}`);
            const bytes = readFileSync(manifestPath);
            snapshot.files.set(manifestPath, bytes);
            const manifest = validateVisualizerManifest(JSON.parse(bytes.toString("utf8")));
            types.push({ manifest, entryPath });
          }
          planVisualizerUpdates(types.map(type => type.manifest));
          const contents = types.map((type, i) =>
            `import { createVisualizer as factory${i} } from ${JSON.stringify(type.entryPath)};`).join("\n") +
            `\nexport const visualizerTypes = Object.freeze([${types.map((type, i) =>
              `{ manifest: ${JSON.stringify(type.manifest)}, createVisualizer: factory${i} }`).join(",\n")}]);\n`;
          onSnapshot(snapshot);
          return { contents, loader: "js", resolveDir: directory, watchFiles, watchDirs: [...snapshot.directories.keys()] };
        } catch (error) {
          onSnapshot(snapshot);
          return { errors: [{ text: `Visualizer discovery: ${error.message}` }], watchFiles, watchDirs: [...snapshot.directories.keys()] };
        }
      });
    },
  };
}
