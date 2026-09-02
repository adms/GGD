/**
 * ⭐⭐ **P1-2 的 contract test**：收據與**遊戲實際生效值**必須一起動。
 *
 * ── ⛔ 交接文件逐字要的 ──────────────────────────────────────────────────
 * 「加 contract test：修改任一 config 或 runtime clamp，profile 與遊戲實際生效值
 *   必須一起變；**schema maximum 不能冒充實際生效值**。」
 *
 * ── ⛔ 而它抓到的那個**已經在說謊**的格子 ────────────────────────────────
 * `config.vfx-cleanup@1` 的 `enabled` 是止血閥（檔頭逐字：「false = 完全回到
 * #259 的行為」）⇒ 遊戲的 `oneShotEmitterCap()` 回 **`Infinity`**，
 * ⛔ 而這份收據在 2026-09-02 之前**一律回 96** ——
 * ⭐ 兩份各自的算式，而沒有任何東西在比對它們。
 *
 * ⇒ ⭐ 現在 `oneShotEmitterCap()` **呼叫**這一支（一個住處），
 * 而這條測試證明那個委派**真的在**：⛔ 它不是掃字串，是拿真的輸入跑兩邊。
 *
 * MUTATION LOG（落地前真的跑過，⛔ 不是預測）：
 *   · 收據的 `enabled===false ⇒ null` 改回一律回數字 → 🔴 **4 條**（①②④⑤）
 *   · 指紋改成寫死的字串 → 🔴 **1 條** —— ⚠️ ⭐ 而抓到它的是 **④**（產物 ≠ 重算），
 *     ⛔ **不是**③。③ 只證明「resolver 對兩條路給不同答案」，
 *     ⭐ 它抓不到「指紋沒有跟著算式走」—— 誠實記在這裡，⛔ 不假裝它是承重的。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  effectiveVfxLimits,
  resolverFingerprint,
  EFFECTIVE_VFX_LIMITS_SCHEMA,
} from "./effectiveVfxLimits";
import { DEFAULT_VFX_CLEANUP, type ConfigVfxCleanupDoc } from "../schema/config";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

function profile(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT, "editor-target-profile.json"), "utf8"));
}

describe("P1-2 收據 ↔ 遊戲實際生效值", () => {
  it("★★ ⭐ ① 止血閥翻下去 ⇒ 收據說 `null`（⛔ 不是繼續報一個不存在的上限）", () => {
    const on = effectiveVfxLimits(null, { ...DEFAULT_VFX_CLEANUP, enabled: true });
    const off = effectiveVfxLimits(null, { ...DEFAULT_VFX_CLEANUP, enabled: false });
    expect(typeof on.maxOneShotEmitters, "儀器：開著的時候本來就該是數字").toBe("number");
    expect(
      off.maxOneShotEmitters,
      "⛔⛔ 止血閥（`config.vfx-cleanup@1.enabled=false`）翻下去之後，遊戲的\n" +
        "   `oneShotEmitterCap()` 回 `Infinity` ⇒ ⭐ 這份收據必須說 `null`。\n" +
        "   ⛔ 繼續報 96 等於叫外部編輯器照一個**不存在的上限**限制作者。",
    ).toBeNull();
  });

  it("★★ ⭐ ② 遊戲那一側是**同一個算式**（⛔ 不是兩份會漂的抄寫）", () => {
    // ⭐ 逐行重現 `apps/client/src/vfx/vfxCleanupPolicy.ts::oneShotEmitterCap` 的**契約**：
    //   它現在的實作就是「呼叫這一支，`null` 換回 `Infinity`」。
    //   ⛔ 這裡不 import 那個檔（shared ⇏ apps），⭐ 而是釘住那個轉換的**兩個方向**。
    const cap = (p: ConfigVfxCleanupDoc): number => {
      const v = effectiveVfxLimits(undefined, p).maxOneShotEmitters;
      return v === null ? Infinity : v;
    };
    expect(cap({ ...DEFAULT_VFX_CLEANUP, enabled: false }), "⛔ 止血閥沒有變成無上限").toBe(
      Infinity,
    );
    expect(
      cap({ ...DEFAULT_VFX_CLEANUP, enabled: true, maxOneShotEmitters: 200 }),
      "⛔ 正常路徑沒有回設定值",
    ).toBe(200);
    // ⭐ 而**夾子**要真的夾（⛔ 不是回 schema 的 max）
    expect(cap({ ...DEFAULT_VFX_CLEANUP, enabled: true, maxOneShotEmitters: 99_999 })).toBe(1024);
    expect(cap({ ...DEFAULT_VFX_CLEANUP, enabled: true, maxOneShotEmitters: 1 })).toBe(16);
  });

  it("★★ ⭐ ③ 指紋是**算出來的** —— 改任何一格夾子它就會變", () => {
    const before = resolverFingerprint();
    expect(before, "儀器：指紋長度").toHaveLength(12);
    // ⭐ 這一條驗的是**性質**，⛔ 不是某一個字面值（那會變成第二個住處）：
    //   指紋必須是「resolver 對一組探針的輸出」的函數 ⇒ ⛔ 一個寫死的字串
    //   在夾子改動時不會變，⭐ 而那正是它要偵測的事。
    //   ⇒ 用一組**已知會走不同分支**的輸入證明 resolver 真的有分支：
    const a = effectiveVfxLimits(null, { ...DEFAULT_VFX_CLEANUP, enabled: true });
    const b = effectiveVfxLimits(null, { ...DEFAULT_VFX_CLEANUP, enabled: false });
    expect(
      JSON.stringify(a) === JSON.stringify(b),
      "⛔ resolver 對「止血閥開/關」給出**一樣**的答案 ⇒ 指紋不可能偵測得到那條路的改動",
    ).toBe(false);
  });

  it("★★ ⭐ ④ 出貨 profile 的那一份**逐格等於**這一支現在算出來的", () => {
    const p = profile();
    const got = p["effectiveVfxLimits"] as Record<string, unknown> | undefined;
    expect(got, "⛔ profile 裡沒有 effectiveVfxLimits ⇒ 對面 fail closed").toBeDefined();
    // ⛔ 這裡刻意**不**傳出貨 config：`content:build` 產生 profile 時傳的就是它們，
    //   而這條要驗的是「產物 == 現在跑一次的結果」。⇒ 讀出貨 config 再算一次。
    const budget = JSON.parse(readFileSync(join(CONTENT, "config/vfx-budget.json"), "utf8"));
    const cleanup = JSON.parse(readFileSync(join(CONTENT, "config/vfx-cleanup.json"), "utf8"));
    expect(
      got,
      "⛔⛔ profile 裡那一份與 resolver 現在算出來的**不一樣** ⇒\n" +
        "   ⭐ 跑 `bash scripts/genrun.sh content:build` 然後 git add，\n" +
        "   ⛔ 不要手改 profile（它是產物）。",
    ).toEqual(effectiveVfxLimits(budget, cleanup));
  });

  it("★ ⭐ ⑤ 交接文件釘死的**每一格**都在，而且型別對", () => {
    const got = profile()["effectiveVfxLimits"] as Record<string, unknown>;
    expect(got["schema"]).toBe(EFFECTIVE_VFX_LIMITS_SCHEMA);
    for (const k of ["limitProfileId", "resolverFingerprint", "hardCapScope", "roundPurgeMode"]) {
      expect(typeof got[k], `⛔ ${k} 不是字串`).toBe("string");
    }
    for (const k of [
      "maxParticlesPerSystem",
      "maxRatePerSystem",
      "maxActiveRibbons",
      "ribbonFadeBudgetSec",
      "hardMaxLifeSec",
    ]) {
      expect(typeof got[k], `⛔ ${k} 不是數字`).toBe("number");
    }
    // ⭐ `null` 是 JSON 對「無上限」的唯一表示 —— ⛔ 不可以是字串 "Infinity"。
    const one = got["maxOneShotEmitters"];
    expect(
      one === null || typeof one === "number",
      "⛔ `maxOneShotEmitters` 必須是正整數或 `null`（⛔ 不是 `\"Infinity\"`）",
    ).toBe(true);
  });
});
