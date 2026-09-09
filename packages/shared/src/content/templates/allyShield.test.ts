/**
 * 🛡 **友軍護盾：盾真的落在友軍身上**（GH#1132 AC②／AC③）。
 *
 * > 票文的 Test criteria 逐字：「**友軍盾測試把 `side` 改回 `enemies` 或 `castType` 改回 `self` 時必須失敗**」
 *
 * ── ⭐ 為什麼這一族是**模板**而不是機制 ────────────────────────────────────
 * 引擎那一側**早就支援**：`sim/abilities/abilitySystem.ts` 的地面 AoE 在
 * `targetsEnemies: false` 時走 `bodiesInCircle` 的**友方**路徑，⭐ 而且**施法者自己算在圈內**
 * ——那一段的註解逐字寫著理由（GH#458）：一個以自己為圓心的結界把自己排除在外，
 * 就會退化成另一種「說了但不會發生」。
 *
 * ⚠️ ⭐ 而 GH#1132 量到：37 名社群英雄裡**提到友軍的 18 槽**，其中 **12 槽**綁著
 * `tpl-buff-self` —— 那個家族發 `applyTo: "self"`、⛔ 不設 `targetsEnemies`
 * ⇒ ⭐「友軍盾」實際只罩施法者自己，而卡面說它保護隊友。
 *
 * ⭐ 這條守衛驗的是**展開結果的三個關係**（⛔ 不是「有沒有這個欄位」）：
 *   · `ally` ⇒ `castType: "targeted"` **且** `targetsEnemies === false`（⛔ 點不到敵人）
 *   · `area` ⇒ `castType: "ground"`   **且** `targetsEnemies === false` **且**有 `radius`
 *   · `self` ⇒ `castType: "self"`     **且** ⛔ **不設** `targetsEnemies`
 * ⚠️ 「圈內誰進得來」由 `abilitySystem` 決定，⛔ 這條守衛不假裝驗得到它 ——
 *   ⭐ 那一段有它自己的守衛（`targetsEnemies:false` 的既有測試）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc } from "../schema/template";
import { expand } from "./expand";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const TPL = zTemplateDoc.parse(
  JSON.parse(readFileSync(join(REPO, "content/ability-templates/tpl-ally-shield.json"), "utf8")),
);

const BASE = { amount: { perRank: [50, 85, 120, 155] }, duration: 8, radius: 8 };

describe("🛡 友軍護盾（GH#1132 AC②／AC③）", () => {
  it("⭐ 量尺自證：模板真的讀得到、家族真的展得開（⛔ 不是在量空氣）", () => {
    expect(TPL.family).toBe("ally-shield");
    expect(expand(TPL, { ...BASE, target: "area" }).effects?.[0]?.kind).toBe("shield");
  });

  it("★★ ⭐ `ally` ⇒ 指定一位隊友，⛔ **點不到敵人**", () => {
    const r = expand(TPL, { ...BASE, target: "ally" });
    expect(r.castType, "⛔ 指定友軍要走 targeted").toBe("targeted");
    expect(
      r.targetsEnemies,
      "⛔⛔ `targetsEnemies` 不是 false ⇒ 這支「友軍盾」點得到敵人 —— " +
        "那正是 GH#1132 說的「友軍盾仍作用自身／錯對象」",
    ).toBe(false);
  });

  it("★★ ⭐ `area` ⇒ 範圍友軍**與自己**，⛔ 不是敵方 AoE", () => {
    const r = expand(TPL, { ...BASE, target: "area" });
    expect(r.castType, "⛔ 範圍友軍要走 ground").toBe("ground");
    expect(r.targetsEnemies, "⛔⛔ 沒設 false ⇒ 這一發會罩到**敵人**").toBe(false);
    expect(r.radius, "⛔ 沒有半徑的範圍盾罩不到任何人").toBe(8);
  });

  it("★ ⭐ `self` ⇒ 只罩自己，⛔ 而且**不設** `targetsEnemies`（自己不是「友方目標」）", () => {
    const r = expand(TPL, { ...BASE, target: "self" });
    expect(r.castType).toBe("self");
    expect(r.targetsEnemies, "⛔ self 施放不需要方向 —— 設了它是一句多餘的宣稱").toBeUndefined();
  });

  it("★★ ⭐ 盾的**量與秒數**真的進節點（⛔ 不是一個空的 shield）", () => {
    const e = expand(TPL, { ...BASE, target: "area", duration: 12 }).effects?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(e?.["duration"]).toBe(12);
    expect(JSON.stringify(e?.["amount"]), "⛔ 盾量沒進去 ⇒ 一層 0 點的盾").toContain("155");
  });

  it("⭐ sentinel：`target` 填一個不存在的值 ⇒ 展開器**擲例外**（⛔ 不是靜默退回 self）", () => {
    expect(() => expand(TPL, { ...BASE, target: "enemies" })).toThrow(/不是 self\/ally\/area/);
  });
});
