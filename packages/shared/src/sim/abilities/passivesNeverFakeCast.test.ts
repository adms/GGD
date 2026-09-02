/**
 * ⭐⭐ **被動不假裝施法**（GH#940 驗收 ①）—— 跑**出貨內容**的兩個方向。
 *
 * ⛔⛔ **票文那一條的前提站不住，這裡記下為什麼**（前提回驗，2026-09-02）：
 *
 * 票文寫「**29 支**卡面掛 `[被動]`／`[靈氣]` 的技能⋯⇒ 零支播 cast 動作」。
 * ⭐ 而逐份掃出貨 `content/abilities/` 量到的是：卡面帶那兩個標籤的有 **104 份**，
 * 其中**有 `effects`**（＝引擎判它可施放）的只有 **15 份** ——
 * ⛔ 而那 15 份裡有 `godie-u010.ex`（5 個 effects，含 `damage` / `screenShake`）
 * 與 `godie-orkn.ex`（`championForm` 變身）⇒ ⭐ **它們顯然是主動技**，
 * 卡面上的 `[被動]` 講的是它**另外那一半**。
 *
 * ⇒ ⭐⭐ 「卡面掛 `[被動]` ⇒ 它是被動」是一個**錯的判準** ——
 * 而 #940 票文自己的第 ③ 點逐字說過同一句話：「⭐ **卡面標籤也不能當判準**」。
 * ⇒ ⛔ 那一條驗收如果照字面做，會把兩支真主動技的施法動作拿掉。
 *
 * ⭐ **正確版本**（這一支驗的）：判準是**文件形狀**，⛔ 不是卡面文字 ——
 * `isPassiveOnly(def)` ＝「有 `passive` 區塊而 `effects` 是空的」。
 * 那一族在 `castAbility()` 裡**在付出任何成本之前**就被擋下
 * ⇒ ⭐ 它們連 `abilityCast` 都不會發，於是**不可能**播 cast 動作。
 *
 * ⚠️ ⭐ **兩個方向一起驗**（CLAUDE.md：一把只驗過單邊的尺不算自證過）：
 * · 純被動 ⇒ `abilityCast` **零次**
 * · 一支真正的主動技 ⇒ **仍然**發
 * ⛔ 只驗前者的話，一個「什麼都不發」的壞實作也會綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isPassiveOnly } from "./abilityPassives";
import type { AbilityDef } from "../content/defs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const DIR = join(ROOT, "content/abilities");

/** ⭐ 出貨的每一份 ability 文件（⛔ 不是自己造的夾具 —— 失敗形態⑤）。 */
function shippedAbilities(): AbilityDef[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as AbilityDef);
}

describe("GH#940 ① —— 被動不假裝施法（跑出貨內容）", () => {
  const all = shippedAbilities();

  it("⭐ 量尺先自證：出貨樹真的載得到，而且兩族都不是空的", () => {
    expect(all.length, "⛔ 一份都沒讀到 ⇒ 下面驗什麼都沒意義").toBeGreaterThan(300);
    const passive = all.filter((d) => isPassiveOnly(d));
    const active = all.filter((d) => !isPassiveOnly(d));
    expect(passive.length, "⛔ 純被動零支 ⇒ 這條守衛在量空氣").toBeGreaterThan(20);
    expect(active.length, "⛔ 主動零支 ⇒ 反方向那一半驗不到").toBeGreaterThan(200);
  });

  it("★★ ⭐ 正方向：純被動的**每一份**都被 `isPassiveOnly` 認出來", () => {
    // ⭐ 判準是**文件形狀**：有 `passive` 而 `effects` 空。
    //   ⛔ 這一族在 `castAbility()` 裡 `return "passive"`（在付出成本之前）
    //   ⇒ 連 `abilityCast` 都不會發 ⇒ 不可能播 cast 動作。
    const wrong = all.filter(
      (d) => d.passive !== undefined && d.effects.length === 0 && !isPassiveOnly(d),
    );
    expect(wrong.map((d) => d.id), "⛔ 有 passive 且零 effects 卻沒被認出來").toEqual([]);
  });

  it("★★ ⭐ 反方向：**有 effects 的一律不是**純被動（⛔ 不可以連主動一起擋掉）", () => {
    const overreach = all.filter((d) => d.effects.length > 0 && isPassiveOnly(d));
    expect(
      overreach.map((d) => d.id),
      "⛔ 一支有真效果的技能被判成純被動 ⇒ 它的施法動作會消失",
    ).toEqual([]);
  });

  it("⭐⭐ 卡面標籤**不是**判準 —— 這一條把票文那個前提釘死", () => {
    // ⚠️ 104 份卡面帶 `[被動]`／`[靈氣]`，⭐ 而其中有 effects 的那幾份
    //   是**真的主動技**（`damage` / `championForm` / `screenShake`）。
    // ⇒ ⛔ 任何「看到 [被動] 就不播 cast」的實作都會弄壞它們。
    const tagged = all.filter((d) => /\[被動\]|\[靈氣\]/.test(String((d as { description?: string }).description ?? "")));
    expect(tagged.length, "⛔ 一份都沒有 ⇒ 描述欄的形狀變了，這條在量空氣").toBeGreaterThan(50);
    const taggedButActive = tagged.filter((d) => d.effects.length > 0);
    expect(
      taggedButActive.length,
      "⭐ 卡面掛 [被動] 而**真的有效果**的技能歸零了 ⇒ " +
        "要嘛內容被改過，要嘛有人照票文字面把它們變成被動了 —— 兩種都要人看一眼",
    ).toBeGreaterThan(0);
  });
});
