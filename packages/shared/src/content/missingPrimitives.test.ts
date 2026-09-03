/**
 * ⭐⭐ **#838 的非重疊那一半：Main 側的 MISSING primitive**（GH#965）。
 *
 * owner 2026-09-02（逐字）：
 * > 「#838 可以連動這 46 個技能驗收 來做**部分驗收關票**，
 * >  **沒有重疊的部分額外開一張新票**」
 * > 「Main 只提供**可重用 primitive**、runtime 行為、限制 resolver 與機器契約」
 *
 * ⚠️ ⭐ **本票⛔ 不拼任何一支完整技能** —— 它只做積木（票文逐字）。
 *
 * ⭐ **前提回驗（2026-09-03）—— 一半已經做完了**：
 * | 機制 | 現況 |
 * |---|---|
 * | **M0** `at:"bone"` 掛受擊者 | ⭐ **已在**（`spawnVfx.boneOn`，GH#809）—— ⭐ 而它的註解裡有比票文**更精確**的量測 |
 * | **M1** 連段逐擊瞬移 | ⭐ **已在**（`delayed` / `comboStrikes.strikeReposition`） |
 * | **M3** 模型 fx 高度曲線 | ⭐ **已在**（`vfxScript.heightKeys`） |
 * | **M11** 投射物拖尾班表 | ⭐ **已在**（`trailVfxId`） |
 * | ⛔ **M2 M4 M6 M7 M10 ＋ 表示形四標籤** | ⛔ **缺** ⇒ ⭐ 本輪做的就是這五個半 |
 *
 * ⭐ 而 M0 的註解量到的是 **92 次**明確錨在受擊者（`GetEnumUnit` 83 ＋ `GetSpellTargetUnit` 9），
 * ⛔ 而票文寫 124 —— ⭐ 那個差是因為票文把 `GetTriggerUnit()` 96 次也算了進去，
 * 而它**在施法觸發器裡是施法者、在傷害觸發器裡是受擊者** ⇒ ⛔ 不該併進那個數。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `status-effect@1` 的 `alpha` 下界從 0.05 改成 0
 *    → 🔴 ③「全透明的角色點不到也看不到 —— 隱身是另一個機制」
 */
import { describe, expect, it } from "vitest";
import { zStatusEffectDoc } from "./schema/statusEffect";
import { zVfxPresentation } from "./schema/vfx";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = join(__dirname, "schema");
const src = (p: string): string => readFileSync(join(SCHEMA, p), "utf8");

describe("MISSING primitive M0–M11（GH#965）", () => {
  it("★★ ⭐ **九個 primitive 都在**（⛔ 少一個 = 那一支技能拼不出來）", () => {
    const have: Record<string, boolean> = {
      "M0 boneOn": src("effects/spawnVfx.ts").includes("boneOn"),
      "M1 strikeReposition": src("effects/delayed.ts").includes("strikeReposition"),
      "M2 tint/alpha": src("statusEffect.ts").includes("tint:") && src("statusEffect.ts").includes("alpha:"),
      "M3 heightKeys": src("vfxScript.ts").includes("heightKeys"),
      "M4 forceClip": src("effects/applyStatus.ts").includes("forceClip"),
      "M6 perStrikeSoundKey": src("effects/comboStrikes.ts").includes("perStrikeSoundKey"),
      "M7 velocityAngle": src("effects/floatingText.ts").includes("velocityAngle"),
      "M10 intervalJitter": src("effects/comboStrikes.ts").includes("intervalJitter"),
      "M11 trailVfxId": src("vfxScript.ts").includes("trailVfxId"),
    };
    const missing = Object.entries(have).filter(([, v]) => !v).map(([k]) => k);
    expect(
      missing,
      "⛔⛔ 少了 primitive ⇒ ⭐ 那一族的技能**拼不出來**（票文：它擋住哪幾支寫在表裡）",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ **M2 的 `alpha` 下界不可以是 0**（⛔ 全透明是另一個機制）", () => {
    const ok = zStatusEffectDoc.safeParse({
      id: "probe", schema: "status-effect@1", name: "探針", alpha: 0.05,
    });
    expect(ok.success, "⛔ 合法的 0.05 被拒 ⇒ 界線設錯了").toBe(true);
    const bad = zStatusEffectDoc.safeParse({
      id: "probe", schema: "status-effect@1", name: "探針", alpha: 0,
    });
    expect(
      bad.success,
      "⛔⛔ `alpha: 0` 被收下了 ⇒ ⭐ 全透明的角色**點不到也看不到**，\n" +
        "  ⚠️ 而「隱身」是另一個機制（`ENTITY_FLAG` 的 `INVISIBLE`），⛔ 不是這一格。",
    ).toBe(false);
  });

  it("★★ ⭐ **M2 的 `tint` 只收 `#RRGGBB`**（⛔ 具名顏色與 rgba 都是注入面）", () => {
    for (const bad of ["red", "rgba(1,2,3,0.5)", "#fff", "url(x)"])
      expect(
        zStatusEffectDoc.safeParse({ id: "p", schema: "status-effect@1", name: "n", tint: bad }).success,
        `⛔ \`${bad}\` 被收下了 —— ⭐ 顏色欄位是 CSS 注入最常見的入口`,
      ).toBe(false);
    expect(
      zStatusEffectDoc.safeParse({ id: "p", schema: "status-effect@1", name: "n", tint: "#7030A0" }).success,
    ).toBe(true);
  });

  it("★★ ⭐ **M10 的抖動吃比賽種子**（⛔ `Math.random` 會讓每份錄影對不上）", () => {
    // ⭐ sim 純度閘已經禁掉 `Math.random`；這裡驗的是**界線本身**留了 0 這條 rollback。
    expect(src("effects/comboStrikes.ts")).toContain("intervalJitter");
    expect(
      src("effects/comboStrikes.ts").includes("min(0)"),
      "⛔ 抖動的下界不是 0 ⇒ ⭐ 「完全等距」（＝今天的行為）寫不出來 = 沒有 rollback",
    ).toBe(true);
  });

  it("★★ ⭐ **表示形四標籤**齊全，而且它們是**另一個軸**（⛔ 不是 13 個輪廓）", () => {
    expect(
      [...zVfxPresentation.options].sort(),
      "⛔ 表示形不是那四個 —— 票文逐字：`ribbon` · `trail` · `decal` · `billboard`",
    ).toEqual(["billboard", "decal", "ribbon", "trail"]);
    // ⭐ 反方向：它們**不可以**與輪廓詞彙重疊（⛔ 重疊 = 兩個軸被壓成一個）
    const vfx = src("vfx.ts");
    const primBlock = vfx.slice(vfx.indexOf("zVfxPrimitiveKind = z.enum("), vfx.indexOf("]", vfx.indexOf("zVfxPrimitiveKind = z.enum(")));
    for (const p of zVfxPresentation.options)
      expect(
        primBlock.includes(`"${p}"`),
        `⛔ \`${p}\` 同時在輪廓詞彙裡 ⇒ ⭐ 「看起來像什麼」與「用什麼畫的」被壓成同一個軸`,
      ).toBe(false);
  });
});
