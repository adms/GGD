/**
 * vs bot 一鍵開打的選角時間（owner 2026-08-03）。
 *
 * > 「vs bot 一鍵開打的時候，選角色時間可以延長+300秒」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這個檔驗的是**接線**，不是那個數字
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE.md 第二守則（owner 2026-08-03 補的那一段）：**守衛驗機制，不驗數字**。
 * 所以這裡沒有任何一條寫 `320`。出貨值改成 400 或 250，這個檔照樣綠 ——
 * 它證明的是三件會壞掉的事：
 *
 *   ① bot 局真的走 `champSelectSecVsBot` 那一格（不是被無視）
 *   ② 有人類對手的局**不受影響**（不會拖慢朋友一起打的那種）
 *   ③ 判準是「人類座位 <= 1」而不是「場上有 bot」——
 *      後者在**每一場**都成立（MatchRoom 把空位一律填成 isBot），
 *      用它判會讓三個朋友一起打也吃到 320 秒。③ 是最容易寫錯的一條。
 *
 * ⚠️ 失敗形態 ②（算出來了但從沒送到消費端）：schema 有欄位、JSON 有值、後台有格子，
 * 但 `phaseConfigFromSeconds` 不讀它的話，玩家那邊一秒都不會變長。
 */
import { describe, expect, it } from "vitest";
import { TICK_HZ } from "@ggd/shared/constants";
import { phaseConfigFromSeconds } from "./phaseConfig";
import { DEFAULT_PHASE_CONFIG } from "./PhaseMachine";

/** 出貨的那一份 —— 從檔案讀，不抄字面值。 */
function shippedMatchSeconds(): {
  champSelectSec: number;
  champSelectSecVsBot?: number;
} {
  const fs = require("node:fs") as typeof import("node:fs");
  const doc = JSON.parse(
    fs.readFileSync(new URL("../../../../content/config/config.match.json", import.meta.url), "utf8"),
  ) as { match: { champSelectSec: number; champSelectSecVsBot?: number } };
  return doc.match;
}

describe("vs bot 一鍵開打的選角時間（champ-select-vs-bot）", () => {
  it("① bot 局吃 champSelectSecVsBot，不是一般值", () => {
    const sec = shippedMatchSeconds();
    expect(sec.champSelectSecVsBot, "出貨檔沒有這一格 —— 這個功能等於沒出").toBeDefined();

    const vsBot = phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, /* hasHumanOpponent */ false);
    // 期望值從出貨檔推導。突變點：把 `phaseConfigFromSeconds` 裡的
    // `sec.champSelectSecVsBot ?? sec.champSelectSec` 改成 `sec.champSelectSec`
    // → 這裡拿到一般值而紅。
    expect(vsBot.champSelectTicks).toBe(Math.round(sec.champSelectSecVsBot! * TICK_HZ));
  });

  it("② 有人類對手的局完全不受影響", () => {
    const sec = shippedMatchSeconds();
    const pvp = phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, /* hasHumanOpponent */ true);
    expect(pvp.champSelectTicks).toBe(Math.round(sec.champSelectSec * TICK_HZ));
  });

  it("③ 兩者真的不同 —— 否則上面兩條對「這一格被無視」是盲的", () => {
    const sec = shippedMatchSeconds();
    // ⚠️ 沒有這一條，①② 在 `champSelectSecVsBot === champSelectSec` 時**都會過**，
    // 而那正是「功能沒生效」的樣子（失敗形態 ④：斷言方向跟缺陷無關）。
    expect(
      sec.champSelectSecVsBot,
      "vs bot 的選角秒數和一般局一樣 —— 那 owner 要的 +300 秒沒有發生",
    ).toBeGreaterThan(sec.champSelectSec);
  });

  it("④ 缺席時安全退回一般值（不是退回 0、也不是丟例外）", () => {
    const only = { champSelectSec: 20 };
    const cfg = phaseConfigFromSeconds(only, DEFAULT_PHASE_CONFIG, false);
    expect(cfg.champSelectTicks).toBe(Math.round(20 * TICK_HZ));
  });

  it("⑤ 呼叫端忘了傳旗標 → 當成有人類對手（保守面）", () => {
    const sec = shippedMatchSeconds();
    // 預設值選錯方向的代價不對稱：預設成 bot 局的話，一場 3v3 的朋友局會讓
    // 所有人一起等 5 分鐘，而且沒有人知道為什麼。
    const noFlag = phaseConfigFromSeconds(sec);
    expect(noFlag.champSelectTicks).toBe(Math.round(sec.champSelectSec * TICK_HZ));
  });
});
