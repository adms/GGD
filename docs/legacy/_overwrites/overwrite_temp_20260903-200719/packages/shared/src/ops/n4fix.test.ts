import { describe, it, beforeAll, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { resolveConditionTier, declaresTierWithoutCondition } from "../content/conditionTiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const IDS = ["godie-hart.r","godie-e002.ex","godie-e00l.ex","godie-hjai.w","godie-hvsh.e","godie-edem.ex","godie-e00r.q","godie-h02u.ex","godie-e00l.passive","godie-emns.passive","godie-emns.ex"];

function scalings(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) { for (const n of node) scalings(n, out); return out; }
  if (node === null || typeof node !== "object") return out;
  const o = node as Record<string, unknown>;
  if (o["ratios"] !== undefined || o["conditionTier"] !== undefined) out.push(o);
  for (const v of Object.values(o)) scalings(v, out);
  return out;
}

describe("fix", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });
  it("t", () => {
    for (const id of IDS) {
      const d = Abilities.get(id as never) as unknown as Record<string, unknown>;
      const sc = scalings(d["effects"]).concat(scalings(d["passive"]));
      const cond = sc.map((s) => resolveConditionTier(s));
      const lie = sc.filter((s) => declaresTierWithoutCondition(s)).length;
      const num = (v: unknown): number => (Array.isArray(v) ? Number(v[0] ?? 0) : Number(v ?? 0));
      const lit: string[] = [];
      if (num(d["cooldown"]) > 0 && d["cooldownTier"] === undefined) lit.push(`cooldown=${num(d["cooldown"])}`);
      if (num(d["range"]) > 0 && d["rangeTier"] === undefined) lit.push(`range=${num(d["range"])}`);
      if (num(d["radius"]) > 0 && d["radiusTier"] === undefined) lit.push(`radius=${num(d["radius"])}`);
      if (num(d["manaCost"]) > 0 && d["manaCostTier"] === undefined) lit.push(`manaCost=${num(d["manaCost"])}`);
      console.log(JSON.stringify({ id, scalings: sc.length, conditionTiers: cond, declaredLies: lie, bakedLiterals: lit }));
    }
    expect(true).toBe(true);
  });
});
