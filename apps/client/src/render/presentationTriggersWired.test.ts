/**
 * ⭐⭐ **每一個演出登錄表的 trigger，都有一個角色動作消費端。**
 *
 * ⛔⛔ 2026-09-02 量到：`comboStrike` · `projectileHit` · `reflectSuccess`
 * 三個 trigger 在登錄表裡（P0-3 一起做的），emitter ✅ fanout ✅
 * 客戶端 case ✅ —— ⭐ **而那三個 case 全部只排 VFX 腳本，一格身體都沒動。**
 * ⇒ 月牙飛出去而兩個人站著、火花炸開而被射中的人不縮、
 *   反彈成功而畫面上完全沒有反彈這件事（失敗形態⑧的第二種形狀：
 *   消費端存在，⛔ 而它消費的不是這一格）。
 *
 * ⭐ ⛔ **沒有任何既有守衛在問這一題** —— 那正是它們掉了而沒有東西紅的原因。
 *
 * ⚠️ ⭐ **兩個方向都走**（失敗形態⑫：單向掃描結構上失明）：
 * · 正 —— 登錄表有的，消費端要接（新增 trigger 忘了接 ⇒ 紅）
 * · 反 —— 消費端接的，登錄表要有（打錯字 ⇒ 紅，⛔ 不是靜默 no-op）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRESENTATION_RULES,
  resolveAbilityPresentation,
} from "@ggd/shared/content/abilityPresentation";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SRC = readFileSync(join(ROOT, "apps/client/src/render/EntityViewRegistry.ts"), "utf8");

/** 出貨消費端真的接了哪些 trigger（`playDefaultPresentation("X"` 的 X）。 */
const wired = new Set(
  [...SRC.matchAll(/playDefaultPresentation\(\s*\n?\s*"([A-Za-z]+)"/g)].map((m) => m[1]!),
);
/** ⚠️ 三元的那一則（`blocked ? "a" : "b"`）—— 兩邊都算接上了。 */
for (const m of SRC.matchAll(/playDefaultPresentation\(\s*\n?\s*\S[^\n]*\?\s*"(\w+)"\s*:\s*"(\w+)"/g))
  wired.add(m[1]!), wired.add(m[2]!);

describe("演出 trigger ↔ 角色動作消費端", () => {
  it("⭐ 正方向：登錄表的每一個 trigger 都有人播", () => {
    const declared = [...new Set(PRESENTATION_RULES.map((r) => r.trigger))];
    expect(declared.length, "登錄表空了 ⇒ 這條守衛量不到東西").toBeGreaterThan(5);
    const orphan = declared.filter((t) => !wired.has(t));
    expect(
      orphan,
      `⛔ 這幾個 trigger 在登錄表裡有規則，而 EntityViewRegistry **沒有人播**` +
        ` ⇒ 玩家身上一格都不會動（失敗形態⑧）。` +
        `→ 在事件 switch 加一個 case 呼叫 playDefaultPresentation("<trigger>", …)。`,
    ).toEqual([]);
  });

  it("⭐ 反方向：消費端播的每一個 trigger，登錄表都要有", () => {
    expect(wired.size, "⛔ 一個都沒掃到 ⇒ 正則過期了,這條守衛在說謊").toBeGreaterThan(5);
    const ghost = [...wired].filter((t) => resolveAbilityPresentation(t as never).length === 0);
    expect(
      ghost,
      `⛔ 這幾個字串在消費端被播,而登錄表**解析不出任何規則** ⇒ 靜默 no-op（打錯字）。`,
    ).toEqual([]);
  });

  it("⭐ 三個新接的,actor 對邊（⛔ 填錯邊＝攻擊者做出防禦姿勢）", () => {
    const combo = resolveAbilityPresentation("comboStrike");
    expect(combo.map((r) => `${r.actor}:${r.pulse}`).sort()).toEqual([
      "caster:attack",
      "target:hurt",
    ]);
    // ⛔ 命中只有受害者那一半 —— 射手在射出那一刻就播過了
    expect(resolveAbilityPresentation("projectileHit").map((r) => r.actor)).toEqual(["target"]);
    // ⛔ 反彈的動作在**防禦者**身上（登錄表記成 target）
    expect(resolveAbilityPresentation("reflectSuccess").map((r) => `${r.actor}:${r.pulse}`)).toEqual(
      ["target:guard"],
    );
  });
});
