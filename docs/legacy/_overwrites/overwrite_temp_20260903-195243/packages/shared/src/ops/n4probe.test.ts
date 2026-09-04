import { describe, it, beforeAll, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const IDS = ["godie-hart.r","godie-e002.ex","godie-e00l.ex","godie-hjai.w","godie-hvsh.e","godie-edem.ex","godie-e00r.q","godie-h02u.ex","godie-e00l.passive","godie-emns.passive","godie-emns.ex"];
const TIERS = ["cooldownTier","rangeTier","radiusTier","manaCostTier","conditionTier"];
const DUR: Record<string,string> = { dot:"durationSec", applyBuff:"duration", applyStatus:"duration", manaBarrier:"durationSec", invulnerable:"durationSec", shield:"duration", cycleBuff:"durationSec" };

function walk(n: unknown, out: Record<string,unknown>[]): void {
  if (Array.isArray(n)) { for (const x of n) walk(x, out); return; }
  if (n === null || typeof n !== "object") return;
  const r = n as Record<string,unknown>;
  if (typeof r["kind"] === "string") out.push(r);
  for (const v of Object.values(r)) walk(v, out);
}

describe("profile", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });
  it("table", () => {
    for (const id of IDS) {
      const def = Abilities.get(id as never) as unknown as Record<string,unknown>;
      const nodes: Record<string,unknown>[] = [];
      walk(def["effects"], nodes); walk(def["passive"], nodes);
      const segs = nodes.filter(n => n["kind"] === "comboStrikes" || n["kind"] === "delayed")
        .map(n => n["kind"] === "comboStrikes"
          ? { k: "comboStrikes", n: ((n["steps"] as number[] | undefined)?.length ?? 0) + 1, fam: n["family"] }
          : { k: "delayed", n: Number(n["count"] ?? 1), iv: n["intervalSec"] });
      const durs = nodes.filter(n => DUR[String(n["kind"])] !== undefined && typeof n[DUR[String(n["kind"])]!] === "number")
        .map(n => ({ k: n["kind"], s: n[DUR[String(n["kind"])]!] }));
      const spans = nodes.filter(n => n["kind"] === "delayed").map(n => ({ k: "delayed-span", s: Number(n["count"] ?? 1) * Number(n["intervalSec"] ?? 0) }));
      const desc = String(def["description"] ?? "").replace(/「[^」]*」/gs, "");
      const declared = (desc.match(/持續\s*[0-9.]+\s*秒/g) ?? []).length;
      const missing = TIERS.filter(t => def[t] === undefined);
      console.log(JSON.stringify({ id, slot: def["slot"], innateKind: def["innateKind"] ?? null,
        effects: (def["effects"] as unknown[]).length, segs, durNodes: durs.length + spans.length,
        durs: [...durs, ...spans], declared, missing, kinds: [...new Set(nodes.map(n => n["kind"]))] }));
    }
    expect(true).toBe(true);
  });
});
