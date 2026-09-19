import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TemplateDoc } from "../schema/template";
import { compileGeneratedHeroDraft, generateHeroDraft, resolveAuthoredHeroBodies } from "./generator";
import { createDeterministicHeroPlans } from "./planner";
import { championStatBase } from "../../sim/stats/attributes";
import { Stat } from "../../sim/stats/statTypes";

/**
 * ⭐ GH#1024 B2 —— 英雄這一層的「模板 ref ＋ 微調覆寫」。
 *
 * ⚠️ 2026-09-19 量到：投稿包送的 `compiled.champion`（`import/heroPackage.ts:164`）
 * 裡有 **30 格算好的數字**（baseStats 15 · growth 9 · attributes 6），
 * 而 `statOverrides` 被 `resolveChampionRuntimeStats()` 刪掉 ⇒ 出身表有了第二個住處。
 * ⭐ 這條守衛兩個方向一起讀：沒覆寫的跟著出身表動、有覆寫的那一格不動；
 * ⛔ 只驗一邊就是「一把只驗過單邊的尺」。
 */
const ROOT = join(import.meta.dirname, "../../../../..");
const normalization = () => JSON.parse(readFileSync(join(ROOT, "content/config/stat-normalization.json"), "utf8"));
const templates = (): TemplateDoc[] => readdirSync(join(ROOT, "content/ability-templates"))
  .filter((name) => name.endsWith(".json") && name !== "_index.json")
  .map((name) => JSON.parse(readFileSync(join(ROOT, "content/ability-templates", name), "utf8")) as TemplateDoc)
  .filter((template) => template.status === "enabled");

/** 覆寫 `armor`（大）、⛔ 不覆寫 `mr` —— 兩個方向各用一格。 */
function draftFor(configs: readonly Record<string, unknown>[]) {
  const catalog = templates();
  const plan = createDeterministicHeroPlans({
    projectId: "authored-round-trip", brief: { name: "作者稿", concept: "匯出匯入一輪", moveNames: {} },
    sourceLock: { canonicalId: null, versionId: null }, origin: "鬥士",
    availableTemplateIds: catalog.map((template) => template.id), availableTemplates: catalog,
  })[0]!;
  plan.statOverrides = { armor: "大" };
  const result = compileGeneratedHeroDraft(
    generateHeroDraft(plan, { heroId: "authored-round-trip", heroName: "作者稿" }), catalog, configs);
  if (!result.ok) throw new Error(`編譯失敗：${JSON.stringify(result.failures)}`);
  return result.draft;
}

describe("英雄作者稿：模板 ref ＋ 微調覆寫（GH#1024 B2）", () => {
  it("匯出的是稀疏作者稿，而匯入解析回來與出貨文件逐位元組相同", () => {
    const configs = [normalization()];
    const draft = draftFor(configs);
    const authored = draft.authoredBodies.champion as unknown as Record<string, unknown>;
    // ⭐ AC：包裡是「模板 ref ＋ 覆寫」，⛔ 不是十一個算好的數字。
    expect(authored.origin).toBe("鬥士");
    expect(authored.statOverrides).toEqual({ armor: "大" });
    expect(authored.baseStats).toEqual({});
    expect(authored.growth).toEqual({});
    expect(authored.attributes).toBeUndefined();
    // ⭐ 逐位元組，⛔ 不是「看起來一樣」；兩具身體一起比（變身態不可以掉）。
    const replay = resolveAuthoredHeroBodies(draft.authoredBodies, [normalization()]);
    expect(JSON.stringify([replay.champion, replay.relatedChampions]))
      .toBe(JSON.stringify([draft.champion, draft.relatedChampions]));
  });

  it("改出身表：沒覆寫的 mr 跟著動，有覆寫的 armor 不動", () => {
    const base = normalization();
    const moved = structuredClone(base) as { byOrigin: Record<string, Record<string, string>> };
    moved.byOrigin.mr!["鬥士"] = "極大";
    moved.byOrigin.armor!["鬥士"] = "極大";
    const before = draftFor([base]).champion;
    const after = draftFor([moved]).champion;
    const level = base.referenceLevel as number;
    expect(championStatBase(after, Stat.MagicResist, level))
      .toBeGreaterThan(championStatBase(before, Stat.MagicResist, level));
    expect(championStatBase(after, Stat.Armor, level))
      .toBe(championStatBase(before, Stat.Armor, level));
  });
});
