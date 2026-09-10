import { createServer } from "vite";
const s = await createServer({ configFile: "apps/editor/vite.config.ts", root: "apps/editor", server: { middlewareMode: true }, logLevel: "error" });
const id = "/Users/Takuro/GGD/packages/shared/src/content/schema/victoryPodium.ts";
const r = await s.transformRequest(id, { ssr: true });
const code = r?.code ?? "(none)";
const lines = code.split("\n");
console.log("TOTAL LINES:", lines.length);
lines.forEach((l, i) => { if (/PODIUM_CLIP_OPTS|__vite_ssr_import__|__vite_ssr_exports__/.test(l)) console.log(String(i+1).padStart(4), l.slice(0, 200)); });
await s.close();
