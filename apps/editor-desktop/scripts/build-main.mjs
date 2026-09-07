import { build } from "esbuild";
const common = {
  bundle: true, platform: "node", format: "cjs",
  define: { "import.meta.url": "__GGD_MODULE_URL", "import.meta.dirname": "__dirname" },
  banner: { js: 'const __GGD_MODULE_URL = require("node:url").pathToFileURL(__filename).href;' },
};
await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs", external: ["electron"] });
await build({ ...common, entryPoints: ["../content-api/src/heroPackageWorker.ts"], outfile: "dist/heroPackageWorker.cjs" });
// Sandboxed preloads have no __filename. The main/worker module-location
// banner aborts the preload before it exposes the draft-save IPC bridge.
await build({ bundle: true, platform: "node", format: "cjs", entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs", external: ["electron"] });
