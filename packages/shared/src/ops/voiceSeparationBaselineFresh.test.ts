/**
 * ⭐⭐ **語音分離度的基準線有沒有過期**（GH#756 段①）。
 *
 * ⭐ 票文逐字：「漏斗**已接上**，⛔ 剩段① —— 重跑 campplus GEMM
 * （量測是 07-24 的 n=1，現在 n=8）」。
 *
 * ⛔⛔ **而段① 在這台跑不了**（2026-09-03 實查）：
 * `campplus.onnx`（CosyVoice 3 的 speaker embedding 模型）**不在 repo** ——
 * `_separation-baseline.json` 的 `instrument` 逐字寫著它來自
 * `pretrained_models/Fun-CosyVoice3-0.5B`，⭐ 而那是要另外下載的權重。
 * ⇒ ⭐ 照卡住三階第二階（**縮範圍**）：做**能落地的那一半** ——
 * 把「**帳本已經過期**」從一句散文變成一個**會紅的數字**。
 *
 * ⚠️⚠️ ⭐ **為什麼這件事重要**（票文自己記的）：
 * > 「⛔ 段①→②→③→④ **順序不可換**⋯照舊數字建表會**試聽到一批已經不存在的配對**」
 * ⇒ ⭐ 一份停在 2026-07-24 的基準線，會讓後面每一段都建在錯的分母上。
 *
 * ⭐ 量到的（2026-09-03）：
 * · `content/assets/audio/voices/lines/` 有 **54 位**英雄 ⇒ pair = **1,431**
 * · 而帳本的 `currentState` 逐字寫著 **1,128** 對（＝ n=48）、**n=1**（一句 quote）
 * ⇒ ⭐⭐ **分母對不上，而它是兩個不同空間**（CLAUDE.md：⛔ 不要混算）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 帳本的 `pairs` 從 1128 改成 1431（＝假裝重測過）
 *    → 🔴 ②「`measuredOn` 還寫著 n=1 ⇒ 數字對了而**量測本身沒重跑**」
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const VOICES = join(ROOT, "content/assets/audio/voices");

const GATE = JSON.parse(
  readFileSync(join(VOICES, "_separation-qc-gate.json"), "utf8"),
) as { currentState?: { pairs?: number; measuredOn?: string } };
const BASE = JSON.parse(
  readFileSync(join(VOICES, "_separation-baseline.json"), "utf8"),
) as { measuredAt?: string };

/** ⭐ 今天真的有語音行的英雄數 —— ⛔ 不是 roster 的英雄數（那兩個不一樣）。 */
function heroesWithLines(): number {
  const dir = join(VOICES, "lines");
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

describe("語音分離度的基準線（GH#756 段①）", () => {
  it("★★ ⭐⭐ **帳本的分母與今天的語料對不上** —— 這條紅是它該紅的樣子", () => {
    const n = heroesWithLines();
    const pairsToday = (n * (n - 1)) / 2;
    const pairsLedger = GATE.currentState?.pairs ?? 0;
    expect(n, "⛔ 一位有語音的英雄都沒量到 ⇒ 掃描器瞎了，這一支的結論全部作廢").toBeGreaterThan(10);
    // ⭐⭐ **兩條路，而它們合起來才是完整的**（⛔ 一條永遠紅的閘等於沒有閘）：
    //   · 帳本**誠實標記自己過期** ⇒ ⭐ 綠（今天走這條）
    //   · 標記拿掉了 ⇒ ⭐ 那就是在宣稱「量測是最新的」⇒ **數字必須對得上**
    // ⚠️ CLAUDE.md 記過：一條從來沒人看它綠過的閘，與一條不存在的閘沒有差別。
    if (GATE.currentState?.staleSince !== undefined) {
      expect(
        GATE.currentState.staleReason ?? "",
        "⛔ 標了 `staleSince` 卻沒寫**到期條件** ⇒ 下一輪讀到時不知道怎麼讓它消失",
      ).toContain("到期條件");
      return;
    }
    expect(
      pairsLedger,
      `⛔⛔ **帳本宣稱自己是最新的**（沒有 \`staleSince\`），而數字對不上：\n` +
        `  帳本寫 ${pairsLedger} 對（量於 ${BASE.measuredAt}），\n` +
        `  ⭐ 而今天有 **${n} 位**英雄有語音行 ⇒ **${pairsToday}** 對。\n` +
        "  ⚠️ 票文逐字：「⛔ 段①→②→③→④ **順序不可換**⋯照舊數字建表會\n" +
        "  **試聽到一批已經不存在的配對**」。\n" +
        "  ⇒ ⭐ 修法：拿到 `campplus.onnx`（CosyVoice 3 的權重，⛔ 不在 repo）之後\n" +
        "  重跑 §9.5 的 GEMM，更新這兩份 JSON 的 `currentState`。\n" +
        "  ⛔ **不要手改那個數字** —— 見下面第二條。",
    ).toBe(pairsToday);
  });

  it("★★ ⭐⭐ **手改數字騙不過去**：`measuredOn` 必須說出真的量了什麼", () => {
    if (GATE.currentState?.staleSince !== undefined) return; // ⭐ 已誠實標記
    const on = GATE.currentState?.measuredOn ?? "";
    expect(
      /n=1\b/u.test(on),
      `⛔⛔ \`measuredOn\` 還寫著 **n=1**（逐字：「${on.slice(0, 60)}…」）⇒\n` +
        "  ⭐ 就算有人把 `pairs` 那個數字改對了，**量測本身沒有重跑**。\n" +
        "  ⚠️ 而那正是 CLAUDE.md 記過的形狀：一個看起來已經量過的東西，\n" +
        "  量的不是你以為的那個。",
    ).toBe(false);
  });

  it("⭐ 量尺自證：那兩份帳本**還在**（⛔ 檔案不見了上面兩條會靜靜變綠）", () => {
    expect(existsSync(join(VOICES, "_separation-qc-gate.json"))).toBe(true);
    expect(existsSync(join(VOICES, "_separation-baseline.json"))).toBe(true);
    expect(GATE.currentState, "⛔ `currentState` 整塊不見了").toBeTruthy();
  });
});
