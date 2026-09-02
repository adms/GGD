/**
 * ⭐⭐ GH#916 —— **「連段收尾」從「有模板、沒有積木」變成一塊真的積木。**
 *
 * ── ⛔ 在此之前 ─────────────────────────────────────────────────────────
 * ⭐ 機制**早就做好了**（`comboStrikes` 的 schema ＋ sim 都在出貨），
 * 模板文件也有**13 格填好預設的參數** ——
 * ⛔ 而 `FAMILIES` 裡**沒有它** ⇒ `isExpandable("combo-finisher")` 回 false
 * ⇒ ⭐ 對編輯器來說這塊積木**不存在**。
 *
 * ⚠️ ⭐ 而出貨有 **1 支**技能在用 `comboStrikes`（`godie-hart.r` 01-04 超究武神霸斬）
 * —— ⛔ 它是**手寫**的。⇒ 這一條接線讓下一支不必再手刻一遍。
 *
 * ── ⭐ owner 2026-08-23 逐字 ────────────────────────────────────────────
 * 「放招之後**自動打打打打最後一個重招或大招結尾**」
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · `FAMILIES` 拿掉這一條 → 🔴 ①
 *   · `screenFlash`/`screenShake` 的 `applyTo` 改成 `"victim"` → 🔴 ③
 *   · `finisher` 整段刪掉 → 🔴 ②
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { expand, isExpandable } from "./expand";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const TPL = JSON.parse(
  readFileSync(join(ROOT, "content/ability-templates/tpl-combo-finisher.json"), "utf8"),
) as Parameters<typeof expand>[0];

/** 只填模板**沒有預設**的那幾格（⭐ 其餘走預設 —— 那正是「有預設」的意義）。 */
function combo(over: Record<string, unknown> = {}): Record<string, unknown> {
  return expand(TPL, over) as unknown as Record<string, unknown>;
}

describe("GH#916 tpl-combo-finisher", () => {
  it("★★ ⭐ ① 引擎**認得**這個家族（⛔ 而在此之前它不認得）", () => {
    expect(
      isExpandable("combo-finisher"),
      "⛔⛔ `FAMILIES` 裡沒有 `combo-finisher` ⇒\n" +
        "   ⭐ 機制在、參數在、⛔ 而對編輯器來說這塊積木**不存在**。",
    ).toBe(true);
  });

  it("★★ ⭐ ② 展開得出**每一下**與**收尾**兩段（⛔ 少一段就不是連段收尾）", () => {
    const out = combo();
    const effects = out["effects"] as { kind: string; perStrike?: unknown[]; finisher?: unknown[] }[];
    const node = effects.find((e) => e.kind === "comboStrikes");
    expect(node, "⛔ 展開結果裡沒有 comboStrikes").toBeDefined();
    expect(
      (node!.perStrike ?? []).length,
      "⛔ 沒有「每一下」⇒ owner 說的『自動打打打打』不存在",
    ).toBeGreaterThan(0);
    expect(
      (node!.finisher ?? []).length,
      "⛔ 沒有「收尾」⇒ owner 說的『最後一個重招或大招結尾』不存在",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐⭐ ③ 收尾的閃光與震動是**全場**（⛔ 不是只給受害者）", () => {
    const effects = combo()["effects"] as { kind: string; finisher?: { kind: string; applyTo?: string }[] }[];
    const fin = effects.find((e) => e.kind === "comboStrikes")!.finisher!;
    for (const kind of ["screenFlash", "screenShake"]) {
      const node = fin.find((f) => f.kind === kind);
      expect(node, `⛔ 收尾裡沒有 ${kind}`).toBeDefined();
      expect(
        node!.applyTo,
        `⛔⛔ ${kind} 只給受害者看 ⇒ ⭐ owner 說的是「**大招**結尾」，\n` +
          "   而一個只有被打的人看得到的收尾**不是大招**。",
      ).toBe("all");
    }
  });

  it("★★ ⭐⭐ ④ **每一格**參數都被讀（⛔ 不是「有幾格被讀」）", () => {
    // ⚠️ ⭐ 第一版問的是「換了參數之後展開結果有沒有變」——
    //   ⛔ 而那個問法**擋不住「其中一格是死的」**：只要**別的**格子還在變，
    //   整體就會不同。突變驗過：把 `hitTextSizeScale` 寫死 → **仍然綠**。
    // ⇒ ⭐ 改成**逐格**動一次：一格死掉就指名它。
    const base = JSON.stringify(combo());
    const probe: Record<string, unknown> = {
      comboFamily: "另一個家族",
      hitVfx: "fx.prim.nature.explosion-lg",
      hitText: "改過的字",
      hitTextSizeScale: 7,
      hitTextRiseSpeed: 3.3,
      hitTextDurationSec: 2.2,
      hitTextSizeGrowth: 6,
      finisherVfx: "fx.prim.nature.explosion-lg",
      finisherFlashAlpha: 0.77,
      finisherFlashSec: 0.88,
      finisherShakeAmplitude: 0.99,
      finisherShakeSec: 0.66,
      damageType: "magic",
    };
    const dead: string[] = [];
    for (const [k, v] of Object.entries(probe)) {
      if (JSON.stringify(combo({ [k]: v })) === base) dead.push(k);
    }
    expect(
      dead,
      "⛔⛔ 這幾格參數**動了而展開結果不變** ⇒ ⭐ 它們是死的：\n" +
        "   編輯器會把它們畫成可調的旋鈕，⛔ 而轉它什麼都不會發生（第一·五守則）。",
    ).toEqual([]);
    // ⭐ 儀器：`probe` 要覆蓋模板宣告的**每一格**（⛔ 少一格 = 少驗一格）。
    expect(Object.keys(probe).sort(), "⛔ probe 與模板的參數表對不上").toEqual(
      Object.keys(TPL.params).sort(),
    );
  });

  it("★ ⭐ ⑤ 展開結果過得了**出貨的** Zod（⛔ 不是只有型別對）", async () => {
    const { zAbilityDoc } = await import("../schema/ability");
    const doc = {
      id: "test.combo",
      schema: "ability@1",
      name: "測試連段",
      description: "測試",
      slot: "R",
      maxRank: 1,
      cooldown: [10],
      manaCost: [0],
      // ⚠️ ⭐ `rangeTier` 由**技能文件**帶，⛔ 不是模板 ——
      //   第〇·四守則：文件只寫**級別**，值在載入時從表解析。
      //   ⭐ 出貨的 `godie-hart.r` 就是這樣（`rangeTier: "大"`）。
      //   ⇒ ⛔ 一個 `castType: "targeted"` 的家族**依賴文件補這一格**，
      //     而這條測試把那個依賴寫出來（⛔ 不是靜靜地在夾具裡塞一個值）。
      rangeTier: "大",
      // ⭐ 而 `range` 在 schema 是**必填** —— 級距解析器（`tiers:apply`）會把值寫回檔案，
      //   ⇒ 出貨的 `godie-hart.r` **兩格都有**（`range: 8` ＋ `rangeTier: "大"`）。
      range: 8,
      ...combo(),
    };
    const r = zAbilityDoc.safeParse(doc);
    expect(
      r.success,
      "⛔⛔ 展開結果過不了出貨 schema ⇒ ⭐ 對面照它做出來的內容**上線就是死的**。\n" +
        (r.success ? "" : `   第一個問題：${r.error.issues[0]?.path.join(".")} —— ${r.error.issues[0]?.message}`),
    ).toBe(true);
  });
});
