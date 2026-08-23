/**
 * ⛔⛔ **系統倍率是 owner 的人工旋鈕 —— 不是我的。**
 *
 * owner 2026-08-22（他說這是**第三次**釐清）：
 *
 * > 「對 我說過**這是我人工的旋鈕**，並沒有放在公式裡，我們上次已經釐清過，**為何你要再犯**？」
 *
 * ── 為什麼這條守衛存在 ────────────────────────────────────────────────────
 * 那句話有**兩半**，而 repo 在 2026-08-22 之前只記了第一半：
 *   ① 倍率不可以**進公式** —— 架構規則，記在 `damageTiers.ts::anchorFloorFrom` ✅
 *   ② ⛔ 倍率**不是我能轉的** —— 所有權規則，⛔ **哪裡都沒記**
 *
 * ⇒ 缺了②的後果（真的發生了）：為了把平衡拉回 owner 說過的「3.5 發」，
 *   我把 `damageDealt` 從 1.0 設成 2.5。⭐ **每一條既有的閘都是綠的** ——
 *   沒進推導公式、三個住處齊全、有中文說明與上下界。
 *   owner 當場抓到：「**我什麼時候提到 damageDealt 1.0→2.5 ?**」
 *
 * ── 它驗什麼 ──────────────────────────────────────────────────────────────
 * ⭐ **不是「值等於某個數字」**（那是第二守則禁止的：出貨數值是 owner 每週在調的）。
 *   驗的是「**這一格的出貨值，引用得到 owner 的哪一句原話**」——
 *   `owner-knobs.json` 的每一列都帶一句逐字 `quote`，而出貨值必須等於那一列。
 *
 * ⇒ owner 改一格 ⇒ 我把新值與**他的原話**一起寫進 `owner-knobs.json`，測試就綠。
 *   我自己改一格 ⇒ 兩份對不上 ⇒ **紅**，而且訊息會問「他哪一句話說了這個？」
 *
 * ── ⭐ 2026-08-23（GH#616 複驗）：授權表**只覆蓋 12 / 38 格** ────────────────
 * 那 26 格漏網的（其中 **17 格是非中性值**，含 `intToAbilityPower` 與
 * `strToMaxHealth`）⇒ ⛔ **我今天轉了它們，這條守衛一個字都不會說。**
 * ⭐ 一張只蓋一半的授權表，守的是它蓋到的那一半，⛔ 而不是「系統倍率」。
 *
 * ⇒ 現在多一條 `覆蓋` 測試：`COMBAT_ENV_KEYS` **推導**出應到的名單，少一格就紅。
 *   ⛔ 名單不是打上去的 —— 引擎 append 第 39 格而沒進授權表 ⇒ 紅。
 *
 * ── ⚠️ `未授權` 的語意：**被改動時**紅，⛔ 不是**存在時**紅 ─────────────────
 * 補齊的那 26 格，⛔ **沒有一句 owner 的原話是我填的**（那會讓這張表變成
 * 「我的推測長得跟他的需求一模一樣」那個病）。它們的 `on` 標 `未授權`，
 * `quote` 寫明「這一列是**基準線**，⛔ 不是授權」。
 * ⭐ 「存在就紅」會讓整份表**開工就是紅的**，而一條開工就紅的閘會被關掉 ——
 *   被關掉的閘等於沒有閘。所以它們吃**同一條** drift 測試：值不動就綠，
 *   一動就紅，而訊息說的是「這一格從來沒有人授權過」。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMBAT_ENV_KEYS } from "../sim/combatEnv";

const ROOT = join(__dirname, "../../../../content/config");
const read = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, f), "utf-8")) as Record<string, unknown>;

interface Knob {
  value: number;
  quote: string;
  on: string;
}

/** `on` 的哨兵值 —— 這一列記的是**基準線**，⛔ 不是 owner 的授權。 */
const UNAUTHORIZED = "未授權";

describe("系統倍率是 owner 的人工旋鈕 (owner 2026-08-22)", () => {
  const knobs = read("owner-knobs.json")["knobs"] as Record<string, Knob>;
  const env = read("combat-env.json")["multipliers"] as Record<string, number>;

  it("⛔ 每一格出貨值都等於 owner 授權表上的那一個 —— 對不上就是我自己轉的", () => {
    const drift = Object.entries(knobs)
      .filter(([k, v]) => env[k] !== v.value)
      .map(([k, v]) =>
        v.on === UNAUTHORIZED
          ? `${k}: 基準線 ${v.value} ⇄ 出貨 ${env[k]}　⛔ 這一格**從來沒有人授權過**`
          : `${k}: 授權表 ${v.value} ⇄ 出貨 ${env[k]}（owner 的原話：「${v.quote}」）`,
      );
    expect(
      drift,
      "⛔ 這幾格的出貨值與 owner 的授權表對不上。\n" +
        "⭐ 要問的是：**他哪一句話說了這個數字？**\n" +
        "  · 他說過 ⇒ 把新值與那句**逐字原話**一起寫進 content/config/owner-knobs.json（`on` 填日期）\n" +
        "  · 他沒說過 ⇒ ⛔ 把出貨值改回表上的那一個，並把選項列給他（⭐ 列了就真的不要自己挑）\n" +
        "⚠️ 標 `未授權` 的那幾列記的是**基準線**，⛔ 不是授權 —— ⛔ 不要為了讓測試變綠而改基準線。",
    ).toEqual([]);
  });

  it("⭐ 授權表覆蓋**每一格**系統倍率 —— 漏一格 = 那一格根本沒有守衛 (GH#616)", () => {
    // ⛔ 名單從 `COMBAT_ENV_KEYS` 推導，⛔ 不是抄一份 —— 引擎 append 一格新倍率
    //    而沒有進授權表，這裡就紅（而不是靜靜多出一格沒人守的旋鈕）。
    const missing = COMBAT_ENV_KEYS.filter((k) => !(k in knobs));
    expect(
      missing,
      "⛔ 這幾格系統倍率不在 content/config/owner-knobs.json 上 ⇒ 改了不會有任何東西紅。\n" +
        "⭐ 補一列：`value` 填**現在的出貨值**；owner 說過就貼他的**逐字原話**＋日期，\n" +
        "  ⛔ 沒說過就把 `on` 填 `未授權`、`quote` 寫明它是基準線不是授權（⛔ 不要替他編一句話）。",
    ).toEqual([]);
  });

  it("⛔ 每一格都要帶一句 owner 的原話 —— 一格沒有出處的旋鈕就是沒有人授權過", () => {
    const noQuote = Object.entries(knobs)
      .filter(([, v]) => typeof v.quote !== "string" || v.quote.trim().length === 0)
      .map(([k]) => k);
    expect(noQuote, "沒有出處的旋鈕 ⇒ 補上 owner 的逐字原話，或把它從表上拿掉").toEqual([]);
  });

  it("⭐ 授權表點名的每一格都真的是引擎認得的倍率（⛔ 不是一個打錯字的名字）", () => {
    const unknown = Object.keys(knobs).filter((k) => !(k in env));
    expect(unknown, "授權表上有引擎不認得的 key ⇒ 它守不到任何東西").toEqual([]);
  });
});
