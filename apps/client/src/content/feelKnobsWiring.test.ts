/**
 * 🔌 **四格爽度旋鈕真的從 `ContentDb.load()` 走到消費端** —— GH#741／#725 的接線閘。
 *
 * ## 為什麼這一條是承重的
 * 四格都已經有：出貨 JSON（住處①）· Zod（住處②）· 後台標籤（住處③）· 消費端 setter。
 * ⛔ **而少了 `ContentDb.load()` 的那四行，四樣都是對的而遊戲一輩子看不到** ——
 * 操作者在後台存得起來、重整讀得回來，⭐ 畫面上什麼都不會變（**失敗形態②**）。
 *
 * ⚠️ 這不是假設：`damagePalette.ts` 的檔頭記過同一件事，而 2026-08-27 一天之內
 * 同型的洞被量到**五次**（`modelFxSpawn` · `screenFlash` · `floatingText` ·
 * `immune` · `vfxArc`）—— 每一次都是「消費端存在，但它消費不到」。
 *
 * ## ⭐ 它問的是**關係**，⛔ 不是「有沒有那行字」
 * 讀**出貨的** `ContentDb.ts` 原始碼，逐格問「這個 setter 有沒有被呼叫、
 * 而且它的引數是不是**那份 config 的那一格**」。
 * ⛔ grep setter 名字不夠 —— `setExDimTuning(undefined)` 也會 match，而那等於沒接。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · 把 `setCooldownPredictTuning(feelFxDoc?.cooldownPredict)` 改成
 *    `setCooldownPredictTuning(undefined)` → 這一條紅並指名那一格。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FEEL_FX, DEFAULT_DAMAGE_COLORS } from "@ggd/shared/content";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "ContentDb.ts"), "utf8");

/** setter → 它**必須**收到的那一格（⛔ 不是「有沒有被呼叫」）。 */
const WIRED: readonly (readonly [string, string])[] = [
  ["setBlockFlashMode", "blockFlashMode"],
  ["setImpactSmokeLifeScale", "feelFxDoc?.impactSmokeLifeScale"],
  ["setExDimTuning", "feelFxDoc?.exDim"],
  ["setCooldownPredictTuning", "feelFxDoc?.cooldownPredict"],
];

describe("四格爽度旋鈕的接線 (feel-knobs-wiring)", () => {
  it("⭐ `ContentDb.load()` 逐格把 config 的值餵給消費端（⛔ 不是餵 undefined）", () => {
    const missing = WIRED.filter(([setter, arg]) => {
      const call = SRC.match(new RegExp(`${setter}\\(([^;]*?)\\)\\s*;`, "s"));
      return call === null || !call[1]!.includes(arg);
    }).map(
      ([setter, arg]) =>
        `${setter} 沒有收到 \`${arg}\` —— 後台存得起來、重整讀得回來，而遊戲看不到（失敗形態②）`,
    );
    expect(
      missing.join("\n"),
      "修在 apps/client/src/content/ContentDb.ts 的 setStockGlowAdditive 那一段。\n" +
        "⛔ 不要改這條測試 —— 它問的是「值有沒有走到消費端」，那是這四格存在的全部理由。\n",
    ).toBe("");
  });

  it("⭐ 出貨 JSON 真的帶著這四格（⛔ 否則上一條在對一份空文件接線）", () => {
    // ⚠️ 母體是**出貨的** Zod 預設文件，⛔ 不是手寫的期望值。
    const feel = DEFAULT_FEEL_FX as unknown as Record<string, unknown>;
    const colors = DEFAULT_DAMAGE_COLORS as unknown as Record<string, unknown>;
    // 四格全部 optional ⇒ 缺席時行為與今天逐位元相同，所以這裡只驗**出貨那一份**有值。
    const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/config");
    const shipped = (f: string): Record<string, unknown> =>
      JSON.parse(readFileSync(join(repo, f), "utf8")) as Record<string, unknown>;
    const ff = shipped("feel-fx.json");
    const dc = shipped("damage-colors.json");
    expect(Object.keys(feel).length, "Zod 預設文件是空的 —— 母體壞了").toBeGreaterThan(3);
    expect(Object.keys(colors).length, "Zod 預設文件是空的 —— 母體壞了").toBeGreaterThan(3);
    for (const [file, doc, key] of [
      ["feel-fx.json", ff, "impactSmokeLifeScale"],
      ["feel-fx.json", ff, "exDim"],
      ["feel-fx.json", ff, "cooldownPredict"],
      ["damage-colors.json", dc, "blockFlashMode"],
    ] as const) {
      expect(doc[key], `${file} 少了 \`${key}\` —— 接線接到一格永遠是 undefined 的東西`).toBeDefined();
    }
  });
});
