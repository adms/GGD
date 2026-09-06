/**
 * GH#1024 PR-1 —— 英雄層級的「模板 ref ＋ 微調覆寫」（十出身 × 十一屬性）。
 *
 * ⭐ 承重的那一條同時證明兩件事：**模板生效**（改 `byOrigin` 一格，沒覆寫的英雄跟著變）
 * 與**沒有第二個住處**（有覆寫的那一格不被模板蓋掉）。⛔ 只驗一邊就是「一把只驗過單邊的尺」。
 *
 * 驗機制不驗數字：期望值全部從 `bands` 推導，⛔ 不抄 5/6/8/10/12。
 *
 * 突變紀錄（跑過）：
 *   ① `statNormalization.ts` 的 `bandFor` 拿掉 `statOverridesOf(def)[key] ??` ⇒ 「有覆寫的那一格不被蓋掉」紅
 */
import { describe, expect, it } from "vitest";
import { Champions } from "../sim/content/registry";
import { registerAll } from "./registries";
import { zChampionDoc } from "./schema/champion";
import {
  DEFAULT_STAT_NORMALIZATION,
  NORMAL_BANDS,
  ORIGIN_TO_ARCHETYPE,
  type NormalBand,
} from "./statNormalization";
import type { ContentStore } from "./store";

const ab = (id: string) => ({
  id, name: id, icon: "assets/icons/abilities/x.webp", description: "測試用",
  slot: id.slice(-1).toUpperCase(), castType: "self", maxRank: 1, cooldown: [10], manaCost: [10], range: 0, effects: [],
});
const hero = (id: string, extra: Record<string, unknown>) => ({
  id, schema: "champion@1", name: id, role: "marksman", attackType: "melee", modelKey: "m", origin: "坦克",
  baseStats: { ms: 99 }, growth: {},
  attributes: { str: 30, agi: 10, int: 10, strGrowth: 2, agiGrowth: 0.5, intGrowth: 0.5, primary: "STR", source: "authored" },
  abilities: { Q: ab(`${id}.q`), W: ab(`${id}.w`), E: ab(`${id}.e`), R: ab(`${id}.r`) },
  skillOrder: [], buildPriority: [], tags: [],
  ...extra,
});
const storeOf = (docs: Record<string, unknown[]>): ContentStore =>
  ({ all: (c: string) => docs[c] ?? [] }) as unknown as ContentStore;
const msOf = (id: string): number => (Champions.tryGet(id as never)?.baseStats as Record<string, number>).ms!;

describe("英雄 = 出身模板 ＋ statOverrides 微調（GH#1024）", () => {
  const cfg = DEFAULT_STAT_NORMALIZATION;
  const shipped = cfg.byOrigin.ms["坦克"]!;
  // 模板改成一格**不同於出貨**的級別；覆寫再挑一格與兩者都不同的。
  const moved = NORMAL_BANDS.find((b) => b !== shipped)!;
  const pinned = NORMAL_BANDS.find((b) => b !== shipped && b !== moved)!;

  it("⭐ 改模板 → 沒覆寫的格子跟著變；有覆寫的格子不被蓋掉（兩個方向）", () => {
    Champions.clear();
    registerAll(
      storeOf({
        champions: [hero("t.plain", {}), hero("t.pinned", { statOverrides: { ms: pinned } })],
        config: [{ id: "stat-normalization", schema: "config.stat-normalization@1", byOrigin: { ms: { 坦克: moved } } }],
      }),
    );
    expect(cfg.channel.ms).toBe("baseStats"); // 下面讀 baseStats 才有意義
    expect(msOf("t.plain")).toBe(cfg.bands.ms[moved]); // 跟著模板走
    expect(msOf("t.plain")).not.toBe(cfg.bands.ms[shipped]); // 真的動了 —— 沒有第二個住處
    expect(msOf("t.pinned")).toBe(cfg.bands.ms[pinned]); // 覆寫贏過模板
  });

  it("⛔ 同一格填了算好的值 ⇒ schema 紅，並指名那一格", () => {
    const r = zChampionDoc.safeParse(hero("t.baked", { statOverrides: { ms: 12 } }));
    expect(r.success).toBe(false);
    const issue = r.success ? undefined : r.error.issues.find((i) => i.path.join(".") === "statOverrides.ms");
    expect(issue?.message).toContain("算好的值");
    // 級別名照收（⛔ 這一條擋的是數字，不是覆寫本身）
    expect(zChampionDoc.safeParse(hero("t.ok", { statOverrides: { ms: "極大" satisfies NormalBand } })).success).toBe(true);
  });

  it("⭐ A4：註冊表上的 role 由出身推導（roleFromOrigin 出貨 true），英雄卡的 role 只是退路", () => {
    Champions.clear();
    registerAll(storeOf({ champions: [hero("t.role", { role: "marksman", origin: "坦克" })] }));
    expect(cfg.roleFromOrigin).toBe(true);
    expect(Champions.tryGet("t.role" as never)?.role).toBe(ORIGIN_TO_ARCHETYPE["坦克"]);
    expect(ORIGIN_TO_ARCHETYPE["坦克"]).not.toBe("marksman"); // 夾具前提：退路值與推導真的不同
  });
});
