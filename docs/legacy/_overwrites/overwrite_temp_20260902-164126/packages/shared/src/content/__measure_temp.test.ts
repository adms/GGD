import { describe, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { isPassiveOnly } from "@ggd/shared/sim/abilities/abilityPassives";
import { innateCastBlock } from "@ggd/shared/sim/abilities/innateActive";
import { templateExpansionFailures } from "@ggd/shared/content/templates/failures";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

describe("量", () => {
  it("卡面 vs 引擎", () => {
    const TAG = /\[(被動|靈氣)\]/;
    let tagged = 0, liars: string[] = [], noEffects: string[] = [];
    for (const def of Abilities.all()) {
      const d = def as unknown as Record<string, unknown>;
      const txt = `${String(d["name"] ?? "")} ${String(d["description"] ?? "")}`;
      const eff = (d["effects"] as unknown[]) ?? [];
      if (eff.length === 0) noEffects.push(String(d["id"]));
      if (!TAG.test(txt)) continue;
      tagged++;
      const castable = innateCastBlock(def as never) === null && !isPassiveOnly(def as never);
      if (castable) liars.push(String(d["id"]));
    }
    console.log(`\n  ⭐ 出貨載入器量到（⛔ 不是 raw JSON）`);
    console.log(`     · 註冊表大小            ${Abilities.all().length}`);
    console.log(`     · 卡面掛 [被動]/[靈氣]  ${tagged}`);
    console.log(`     · 其中引擎判**可施放**  ${liars.length}`);
    console.log(`     · 展開後仍然 effects=0  ${noEffects.length}  ${noEffects.slice(0, 6).join(" ")}`);
    console.log(`     · 前 12 支說謊的: ${liars.slice(0, 12).join(" ")}`);
    // ⭐ 那 76 支 effects=0 的分佈
    let withPassive = 0, empty: string[] = [];
    for (const def of Abilities.all()) {
      const d = def as unknown as Record<string, unknown>;
      if (((d["effects"] as unknown[]) ?? []).length > 0) continue;
      if (d["passive"] !== undefined) withPassive++;
      else empty.push(String(d["id"]));
    }
    console.log(`     · ⭐ effects=0 之中：有 passive ${withPassive} · ⛔ **兩者都無** ${empty.length}`);
    console.log(`        兩者都無的: ${empty.slice(0, 14).join(" ")}`);
    const one = Abilities.tryGet("godie-e001.ex" as never) as unknown as Record<string, unknown>;
    console.log(`     · ⭐ godie-e001.ex 註冊後: keys=${Object.keys(one ?? {}).join(",")}`);
    console.log(`        effects=${JSON.stringify((one?.["effects"] as unknown[])?.length)} template=${JSON.stringify(one?.["template"])?.slice(0,80)}`);
    const tmplCount = (Abilities.all() as unknown as Record<string, unknown>[]).filter((a) => a["template"]).length;
    console.log(`     · ⭐ 註冊後仍帶 template 欄位的: ${tmplCount}`);
    const fails = templateExpansionFailures();
    console.log(`     · ⭐⭐ 模板展開**失敗**（靜默降級）: ${fails.length}`);
    for (const f of fails.slice(0, 8)) console.log(`        ${JSON.stringify(f).slice(0, 160)}`);
  });
});
