import { describe, it, beforeAll } from "vitest";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import type { AbilityDef } from "../sim/content/defs";
import {
  scanAbility,
  mechanicsText,
  cooldownClaims,
  manaClaims,
  durationClaims,
  damageClaims,
  manaRestoreClaims,
  hpPctClaims,
  leadTags,
  TAG_NEEDS_KIND,
  mismatchKey,
} from "./descriptionClaims";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

describe("census", () => {
  let defs: (AbilityDef & { description?: string })[] = [];
  const prov = new Map<string, string>();
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
    defs = Abilities.ids().sort().map((id) => Abilities.get(id) as AbilityDef & { description?: string });
    for (const f of readdirSync(join(CONTENT, "abilities"))) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const d = JSON.parse(readFileSync(join(CONTENT, "abilities", f), "utf8")) as {
        id?: string;
        provenance?: string;
      };
      if (d.id) prov.set(d.id, d.provenance ?? "(none)");
    }
  });

  it("dump", () => {
    const axes = [
      ["冷卻", cooldownClaims, "cooldown-mismatch"],
      ["耗魔", manaClaims, "mana-mismatch"],
      ["持續", durationClaims, "duration-absent"],
      ["傷害", damageClaims, "damage-absent"],
      ["回魔", manaRestoreClaims, "mana-restore-absent"],
      ["最大生命%", hpPctClaims, "hp-pct-absent"],
    ] as const;
    const lines: string[] = [];
    const rows: string[] = [];
    lines.push(`abilities in registry: ${defs.length}`);
    for (const [name, extract, rule] of axes) {
      let withClaim = 0;
      let bad = 0;
      const per: Record<string, [number, number]> = {};
      const badIds: string[] = [];
      for (const d of defs) {
        const t = mechanicsText(d.description ?? "");
        if (extract(t).length === 0) continue;
        withClaim++;
        const p = prov.get(d.id) ?? "?";
        per[p] ??= [0, 0];
        per[p][0]++;
        const ms = scanAbility(d).filter((m) => m.rule === rule);
        if (ms.length > 0) {
          bad++;
          per[p][1]++;
          badIds.push(`${d.id} [${p}] :: ${ms.map((m) => `${m.claim} → ${m.why}`).join(" ; ")}`);
        }
      }
      const split = Object.entries(per)
        .map(([p, [w, b]]) => `${p} ${w - b}/${w}`)
        .join(", ");
      rows.push(
        `${name}: 有宣稱 ${withClaim}, 不一致 ${bad}, 通過 ${(((withClaim - bad) / (withClaim || 1)) * 100).toFixed(1)}%  (${split})`,
      );
      lines.push(`\n===== ${name} (${bad}/${withClaim}) =====`);
      lines.push(...badIds);
    }
    let tagWith = 0;
    let tagBad = 0;
    const tagIds: string[] = [];
    for (const d of defs) {
      const tags = new Set(leadTags(d.description ?? ""));
      if (![...tags].some((t) => TAG_NEEDS_KIND[t] !== undefined)) continue;
      tagWith++;
      const ms = scanAbility(d).filter((m) => m.rule === "tag-no-mechanism");
      if (ms.length > 0) {
        tagBad++;
        tagIds.push(`${d.id} [${prov.get(d.id)}] :: ${ms.map((m) => `${m.claim} → ${m.why}`).join(" ; ")}`);
      }
    }
    rows.push(
      `標籤: 有宣稱 ${tagWith}, 不一致 ${tagBad}, 通過 ${(((tagWith - tagBad) / (tagWith || 1)) * 100).toFixed(1)}%`,
    );
    lines.push(`\n===== 標籤 (${tagBad}/${tagWith}) =====`);
    lines.push(...tagIds);

    const all: string[] = [];
    let dirty = 0;
    for (const d of defs) {
      const ms = scanAbility(d);
      if (ms.length > 0) dirty++;
      for (const m of ms) all.push(mismatchKey(d.id, m));
    }
    rows.push(`\n總計: ${dirty}/${defs.length} 支技能至少有一處不一致；共 ${all.length} 處`);
    lines.unshift(rows.join("\n"));
    lines.push(`\n===== KEYS (${all.length}) =====`);
    lines.push(...all.sort());
    writeFileSync("/private/tmp/ggd-desc-claims-census.txt", lines.join("\n"));
    console.log(rows.join("\n"));
  });
});
