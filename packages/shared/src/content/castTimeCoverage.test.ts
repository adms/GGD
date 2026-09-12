/**
 * 吟唱普查 —— **owner 2026-08-13 的規則**（這一份改寫過，見下面那段警告）。
 *
 * 現行規則只有兩句，兩句都是 owner 逐字說的：
 *
 *   ①「請你照我的 **0.06~4.00 秒**來設定吟唱時間
 *      （所有的技能都有最低吟唱技能時間 0.06 秒，讓 tick 一定可以處理）」
 *   ②「吟唱時間**倍率**／**上下限** 也可以在系統後台設定」
 *
 * ⇒ 出貨的 `castTimeSec` 是 `castTimeFormula` 的純函數輸出（**內容是推導資料**，
 *   不是 461 個手寫數字），而倍率與上下限在**施法當下**由 `sim/castTimeRules.ts`
 *   套用（守衛在 `sim/castTimeRules.test.ts`）。
 *
 * ── ⚠️ 這一份被改寫的原因（第三守則：註解會說謊，而它撒的是**誰決定的**）─────
 * 這裡以前寫著規則是
 *
 *   「castTimeSec 0.3 - 0.6 s，依技能有多兇殘決定，最兇的封頂 0.9 s」
 *
 * 並把它歸給 owner。2026-08-13 拿去對質時 owner 的回覆是：
 *
 *   「**這是你自己講的吧 我沒講過這樣的話**」
 *
 * ⛔ 那個 0.3–0.9 是 repo 自己的政策，被寫成像一則裁決 —— 而一個假的出處會讓
 * 之後每一個人都不敢動它。**所以這一份現在只引用真的說過的那兩句。**
 *
 * ── 這一份**不再**驗的東西（第零守則⑦ + 第二守則）─────────────────────────
 * 舊版有 12 條，其中 5 條在驗**數字**而不是機制：中位數要 0.4 秒、0.9 秒要罕見、
 * 10 個 pre-lane 值要被重推、`PRE_LANE_CAST_TIMES` 對照表⋯⋯
 * ⛔ 全部刪掉：那些是 owner 每週在調的東西，寫進測試就是**第四個住處**，
 * 而且它會用錯誤的訊息紅（「吟唱壞了」其實只是有人調了平衡）。
 *
 * 留下來的是**機制**：內容 = 公式、地板守得住、天花板守得住、規格值會贏。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";
import type { AbilityDef } from "../sim/content/defs";
import { CAST_CAP, CAST_FLOOR, deriveCastTime } from "./castTimeFormula";
import { DEFAULT_CAST_TIME_TIERS } from "./castTimeTiers";
import { SKILL_TIER_NAMES } from "./skillTiers";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** `content/abilities/` 裡真的有幾份文件 —— 普查的母體下界，⛔ 不寫死規模常數。 */
function shippedAbilityDocCount(): number {
  return readdirSync(join(CONTENT_DIR, "abilities")).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  ).length;
}

let all: AbilityDef[];
let cdMult: number;

beforeAll(async () => {
  const result = await new ContentLoader(shippedContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  all = Abilities.all();
  const env = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
  cdMult = env?.multipliers.cooldown ?? 1;
});

describe("吟唱普查（owner 2026-08-13 的 0.06–4.00）", () => {
  it("⭐ 每一支出貨技能帶的正是公式算出來的值 —— 內容是推導資料，不是手寫數字", () => {
    // `deriveCastTime` 從不讀 `castTimeSec`，所以這不是循環論證。
    //
    // ⭐⭐ **帶 `castTimeTier` 的技能不歸這條公式管**（GH#943／#1243）——
    // owner 2026-09-02：「吟唱⋯其實這個也可以五級距 **0, 0.1, 0.3, 0.5, 1**」
    // ⇒ 那五格住 `content/config/cast-time-tiers.json`，⭐ **級距說了算**。
    //
    // ⛔ 在此之前這一條拿**過期的 20 階階梯**去比**照級距寫的內容**
    // ⇒ 報出 182 支「不一致」，⚠️ 而內容是 `0.1`（＝小）、`0.5`（＝大）——
    // ⭐ **內容一直是對的，說謊的是公式**。我因此開了兩個假缺陷（#1243）。
    //
    // ⭐ owner 2026-09-12：「請你更正讓你誤會的 吟唱冷卻公式 **以後不要再發生**」
    // ⇒ ⭐ 這一格就是那個「不要再發生」：**問對象變了**，⛔ 不是把斷言放寬。
    const tiered = all.filter((d) => (d as { castTimeTier?: string }).castTimeTier !== undefined);
    const untiered = all.filter((d) => (d as { castTimeTier?: string }).castTimeTier === undefined);
    const wrong = untiered
      .map((d) => ({ d, want: deriveCastTime(d, cdMult).castTimeSec }))
      .filter((r) => r.d.castTimeSec !== r.want)
      .map((r) => `${r.d.id}: 內容 ${String(r.d.castTimeSec)} != 公式 ${String(r.want)}`);

    // ⭐ **遷移進度要看得見**（⛔ 靜默跳過與「全部驗過」長得一模一樣）。
    // ⚠️ 這一行**不是**斷言，是一行印出來的事實 —— 遷移完成那天它會變成 `0 支`。
    console.log(
      `⏳ 吟唱五級距遷移：${tiered.length} / ${all.length} 支已遷移` +
        `（⛔ 其餘 ${untiered.length} 支仍由過期的 20 階階梯推導 —— GH#1243）`,
    );

    expect(
      wrong,
      "⛔ 這幾支**沒有** `castTimeTier`，所以它們歸舊公式管，而它們對不上。\n" +
        "⭐ 兩條路擇一：①補 `castTimeTier`（⭐ 首選 —— 那是 GH#943 之後的正解）" +
        "②讓值等於 `deriveCastTime` 算出來的。\n" +
        "⛔ 不要改這條測試，也⛔ 不要去改那條 20 階階梯的常數 —— 它整條已經被五級距取代了。",
    ).toEqual([]);
    // 守衛的守衛：母體要真的是整份註冊表，⛔ 不是 3 份文件。
    // 跟磁碟對帳而不是釘一個規模常數 —— 常數擋不住「有 50 份載入失敗」。
    expect(shippedAbilityDocCount()).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThanOrEqual(shippedAbilityDocCount());
  });

  it("⭐ 沒有任何技能低於下限或超過上限 —— owner「最低 0.06 秒，讓 tick 一定可以處理」", () => {
    // ⚠️ 界線從 `castTimeFormula` 的匯出讀，⛔ 不抄字面值：0.06 / 4.00 住在
    //    `DEFAULT_CAST_TIME_RULES` + `content/config/cast-time.json` + 後台三處。
    const out = all
      .filter((d) => (d.castTimeSec ?? 0) > 0)
      .filter((d) => d.castTimeSec! < CAST_FLOOR || d.castTimeSec! > CAST_CAP)
      .map((d) => `${d.id}: ${String(d.castTimeSec)}`);
    expect(out).toEqual([]);
  });

  it("⭐ 每一個吟唱都是整數個 sim tick —— 半個 tick 的吟唱 sim 表達不出來", () => {
    // ⚠️ 容差不是 1e-6：`snapTick` 會把結果**四捨五入到小數第三位**（JSON 好讀），
    //    所以 19 個 tick 出貨成 0.633 而不是 0.6333…。0.02 tick ≈ 0.7 ms，
    //    足以擋住「0.45 秒」這種真的落在半個 tick 上的值。
    const off = all
      .filter((d) => (d.castTimeSec ?? 0) > 0)
      .filter((d) => Math.abs(d.castTimeSec! * 30 - Math.round(d.castTimeSec! * 30)) > 0.02)
      .map((d) => `${d.id}: ${String(d.castTimeSec)}`);
    expect(off).toEqual([]);
  });

  it("⭐ 規格說明寫了吟唱秒數的，出貨值就等於它（第〇·六守則：owner 的說明是第 1 層）", () => {
    // 「吟唱 N 秒」寫在 description 裡的技能，公式**必須讓步**。
    // ⚠️ 先剝掉 「…」（角色對白，不是效果）—— 否則 44-04 的台詞「在35秒後宣布
    //    勝利吧」會被讀成 35 秒吟唱。
    const missed: string[] = [];
    for (const d of all) {
      const raw = (d as AbilityDef & { description?: string }).description;
      if (typeof raw !== "string") continue;
      const m = /(?:吟唱|施展時間|詠唱)\s*([\d.]+)\s*秒/.exec(raw.replace(/「[^」]*」/gs, ""));
      if (!m) continue;
      // ⭐⭐ 【五級距**取代**了 0.06–4.00 的自由值】（owner 2026-09-02 ／ 09-12）
      //
      // ⛔ 在此之前這一行夾的是 `[CAST_FLOOR 0.06, CAST_CAP 4.00]` ——
      // ⭐ 那是 owner 2026-08-13「請你照我的 0.06~4.00 秒」的區間，
      // ⚠️ 而 **2026-09-02 他用五級距取代了它**（`0, 0.1, 0.3, 0.5, 1`），
      // ⭐ 2026-09-12 又逐字確認：「照五級距 **最高就是1秒 有什麼好爭議的**」。
      //
      // ⇒ ⭐ 規格文字寫「吟唱 2 秒」時，**上界是 1.0，⛔ 不是 4.00** ——
      //   而那 1.0 同時是 `castTimeMaxSec`（引擎真的夾得住的值）
      //   ⇒ ⭐ 寫 2 秒的技能，玩家**從來就只吟唱 1 秒**。
      //
      // ⚠️ ⛔ 這不是把斷言放寬：它仍然要求「規格說了就要照做」，
      //   ⭐ 只是「照做」的上界改成 owner 今天的那一個。
      const tierCap = Math.max(...SKILL_TIER_NAMES.map((n) => DEFAULT_CAST_TIME_TIERS.seconds[n]));
      const want = Math.min(tierCap, Math.max(CAST_FLOOR, Number(m[1])));
      if (Math.abs((d.castTimeSec ?? 0) - want) > 0.05) {
        missed.push(`${d.id}: 規格 ${m[1]}s → 出貨 ${String(d.castTimeSec)}s`);
      }
    }
    expect(
      missed,
      "規格寫了吟唱秒數但出貨值不同。⛔ 不要改這條測試 —— 去看 `castTimeFormula.ts`\n" +
        "的 `authoredCastSec` 是不是又被某個夾子蓋過去了（2026-08-13 就是 `cooldownCeiling`）。",
    ).toEqual([]);
  });
});
