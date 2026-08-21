import { join } from "node:path";
import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities } from "../src/sim/content/registry";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(process.cwd(), "../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const ids = [
  "godie-ubal.passive", "godie-e007.ex", "godie-ewar.ex", "godie-efur.w",
  "godie-emns.q", "godie-h01n.w", "godie-o00l.e", "godie-u00j.q",
  "godie-hvsh.e", "godie-etyr.e", "godie-o00k.passive",
  "godie-orkn.passive", "godie-o030.passive",
];
for (const id of ids) {
  const a = Abilities.get(id) as unknown as Record<string, unknown> | undefined;
  if (!a) { console.log(`${id}: ⛔ NOT REGISTERED`); continue; }
  const radiusOf = (n: unknown): unknown => {
    if (Array.isArray(n)) { for (const x of n) { const r = radiusOf(x); if (r !== undefined) return r; } return undefined; }
    if (n && typeof n === "object") {
      const rec = n as Record<string, unknown>;
      if (typeof rec["radius"] === "number") return rec["radius"];
      for (const v of Object.values(rec)) { const r = radiusOf(v); if (r !== undefined) return r; }
    }
    return undefined;
  };
  console.log(`\n=== ${id} — ${a["name"]}`);
  console.log(`   range=${a["range"]} rangeTier=${a["rangeTier"]} radius=${a["radius"]} radiusTier=${a["radiusTier"]} effRadius=${radiusOf(a["effects"])} cd=${JSON.stringify(a["cooldown"])}`);
  console.log(String(a["description"]).split("\n").slice(0, 8).join("\n"));
}
