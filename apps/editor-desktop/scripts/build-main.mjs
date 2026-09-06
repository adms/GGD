import { build } from "esbuild";
const common = {
  bundle: true, platform: "node", format: "cjs",
  define: { "import.meta.url": "__GGD_MODULE_URL", "import.meta.dirname": "__dirname" },
  banner: { js: 'const __GGD_MODULE_URL = require("node:url").pathToFileURL(__filename).href;' },
};
await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs", external: ["electron"] });
await build({ ...common, entryPoints: ["../content-api/src/heroPackageWorker.ts"], outfile: "dist/heroPackageWorker.cjs" });
await build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs", external: ["electron"] });
