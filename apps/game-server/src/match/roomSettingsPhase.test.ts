/**
 * 開房設定 → 相位時間的**接線**（#288）。體驗層薄守衛，不開對抗輪。
 *
 * 承重點只有一個，而且它是 owner 那句話最容易被寫反的一半：
 *   「預設值保留現在（**包含 vs bot**）」 —— 房主沒碰選角時間的時候，
 *   bot 局仍然吃 `champSelectSecVsBot`，不是被靜默換成 PvP 的一般值。
 *
 * ⛔ 不驗數字：320 / 25 / 180 一個都沒有寫進來，全部從
 * `content/config/config.match.json` 推導（出貨值有三個住處 + drift 測試在守，
 * 抄進測試就是第四個住處）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TICK_HZ } from "@ggd/shared/constants";
import { phaseConfigFromSeconds, resolveMaxRounds } from "./phaseConfig";
import { DEFAULT_PHASE_CONFIG } from "./PhaseMachine";

/** 出貨的那一份 —— 從檔案讀，不抄字面值。 */
const shipped = (): { champSelectSec: number; champSelectSecVsBot?: number } =>
  (
    JSON.parse(
      readFileSync(new URL("../../../../content/config/config.match.json", import.meta.url), "utf8"),
    ) as { match: { champSelectSec: number; champSelectSecVsBot?: number } }
  ).match;
const ticks = (sec: number): number => Math.round(sec * TICK_HZ);

describe("房主設定 → 相位時間（room-settings-phase）", () => {
  it("① 房主沒設 → vs bot 仍然吃 champSelectSecVsBot（預設值保留現在）", () => {
    const sec = shipped();
    expect(sec.champSelectSecVsBot, "出貨檔沒有這一格，這條測不到東西").toBeGreaterThan(
      sec.champSelectSec,
    );
    // 突變點：把 `host.champSelectSec ?? baseChampSelect` 寫成
    // `host.champSelectSec ?? sec.champSelectSec` → 這裡拿到一般值而紅。
    const vsBot = phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, false, {});
    expect(vsBot.champSelectTicks).toBe(ticks(sec.champSelectSecVsBot!));
  });

  it("② 房主有設 → 兩條分支都是房主的值（bot 局也要有反應）", () => {
    const sec = shipped();
    const host = { champSelectSec: 45 };
    // 突變點：只把 host 套在 PvP 分支上 → vs bot 那條紅。
    expect(phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, true, host).champSelectTicks).toBe(
      ticks(45),
    );
    expect(phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, false, host).champSelectTicks).toBe(
      ticks(45),
    );
  });

  it("③ 商店與每回合時間：房主的值贏，沒設就退回出貨值", () => {
    const sec = { intermissionSec: 25, combatMaxSec: 180 }; // 這一條的夾具，不是出貨斷言
    const set = phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, true, {
      intermissionSec: 40,
      combatMaxSec: 90,
    });
    expect(set.intermissionTicks).toBe(ticks(40));
    expect(set.combatMaxTicks).toBe(ticks(90));
    const unset = phaseConfigFromSeconds(sec, DEFAULT_PHASE_CONFIG, true, {});
    expect(unset.intermissionTicks).toBe(ticks(sec.intermissionSec));
    expect(unset.combatMaxTicks).toBe(ticks(sec.combatMaxSec));
  });

  it("④ 總回合數：房主的值優先，缺席才讀出貨值", () => {
    expect(resolveMaxRounds(3)).toBe(3);
    // 房主明說「不設限」(0) 也要被當成一個真的答案，不可以被當成缺席。
    expect(resolveMaxRounds(0)).toBe(0);
  });
});
