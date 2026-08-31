/**
 * ⭐⭐ GH#423 —— **千年練成樹精的身體**（召喚物的那一具）。
 *
 * ── 票文逐字的擋點 ──────────────────────────────────────────────────────
 * 「⛔ 為什麼 #404 先走了『改描述』而不是『接上召喚』——
 *   **缺的不是數值，是一具身體。**」
 *
 * ⭐ 而 2026-08-31 拆掉了那一半：`Roots.mdx` 從 `war3.mpq` 轉出來了。
 *
 * ── ⚠️ 過程中票文的路徑是**錯的** ────────────────────────────────────────
 * 票文寫 `Roots.mdl`，而它把它歸在 `Doodads\Cinematic\` —— ⛔ 那個路徑在
 * **四份 MPQ 裡都不存在**。真的路徑取自 `OBJECTS.json` 的 `n00Q.model`：
 *   `Abilities\Spells\NightElf\EntangleMine\Roots.mdl`
 * ⇒ ⭐ CLAUDE.md 記過的形狀：「票文寫**缺席的檔案路徑**時，
 *   要同時寫下**哪一行程式會去讀它**」——⛔ 沒有那半句，「它缺席」驗證不了。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 刪掉 `content/models/imported.roots.json` → 「身體在」紅
 *   · 把 `clipMap.death` 改成 `"Stand"` → 「死亡用真的 Death clip」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

describe("GH#423 召喚物的身體", () => {
  it("★ ⭐ **身體在**（`model@1` ＋ 真的 glb）—— 那是這張票唯一的擋點", () => {
    const p = resolve(ROOT, "content/models/imported.roots.json");
    expect(existsSync(p), "⛔ 沒有 model@1 ⇒ `summon.championId` 接不上任何東西").toBe(true);
    const d = JSON.parse(readFileSync(p, "utf8")) as { glbPath: string; scale: number; clipMap: Record<string, string> };
    const glb = resolve(ROOT, "content", d.glbPath);
    expect(existsSync(glb), `⛔ ${d.glbPath} 不存在`).toBe(true);
    // ⭐ 量尺自證：不是一個 0 byte 的殼
    expect(statSync(glb).size, "⛔ 空的 glb 與沒有 glb 是同一件事").toBeGreaterThan(10_000);
  });

  it("⭐ **死亡用真的 `Death` clip** —— ⛔ 不是抄一份全 `Stand`", () => {
    const d = JSON.parse(
      readFileSync(resolve(ROOT, "content/models/imported.roots.json"), "utf8"),
    ) as { clipMap: Record<string, string> };
    // ⚠️ 這一顆 glb 真的有三個動畫（Birth / Stand / Death）——
    //   ⭐ 一份全 "Stand" 的 clipMap 會讓它**死掉時不動**，
    //   ⛔ 而那與「動畫沒轉進來」在畫面上長得一模一樣。
    expect(d.clipMap["death"], "⛔ 死亡動畫被填成 Stand").toBe("Death");
  });

  it("⭐ scale 從 glb **量**出來（⛔ 不是挑的）—— 1.7 / 包圍盒高度", () => {
    const d = JSON.parse(
      readFileSync(resolve(ROOT, "content/models/imported.roots.json"), "utf8"),
    ) as { scale: number };
    // 包圍盒高 4.976（POSITION accessor 的 min/max）⇒ 1.7/4.976 = 0.3416
    expect(d.scale).toBeCloseTo(1.7 / 4.976, 3);
  });
});
