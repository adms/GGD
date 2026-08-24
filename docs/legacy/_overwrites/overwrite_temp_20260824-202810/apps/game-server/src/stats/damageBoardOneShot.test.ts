/**
 * GH#658 「這一發佔了目標多少血」—— **真線**守衛。owner 2026-08-24:
 *
 *   「後台單次傷害排行榜(**另外標記該傷害是否一擊超過英雄目標 80% 生命傷害**)」
 *
 * ⚠️ 這一條刻意**不手拼事件 payload**(失敗形態⑤/⑧):跑一場真的比賽 →
 * 真的 `MatchController.ledgerObserve` 收真的 `damage` 事件 → 真的
 * `topDamageCasts` → 真的 `buildDamageBoardEntries`。中間任何一段沒接上,
 * `victimMaxHp` 就會是 0,而 0 的意思是「不知道」⇒ 後台整欄畫「—」。
 *
 * ⛔ 驗的是**機制**不是數字:斷言只問「有沒有記到那個人的血量上限」與
 * 「百分比落在一個合法區間」,⛔ 不釘任何出貨傷害值(那是 owner 每週在調的東西)。
 *
 * 突變驗證(2026-08-24):把 `MatchController` 的 `heroHit: targetIsHero ? …`
 * 那一行拿掉 → 第 1 條紅(victimMaxHp 全部 0)→ 補回來綠。
 */
import { describe, it, expect } from "vitest";
import { pctOfVictimMaxHp, topDamageCasts } from "@ggd/shared/sim/stats/matchLedger";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { buildDamageBoardEntries, isDamageBoardEntry } from "./damageBoard";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));
const FAST = { champSelectTicks: 5, intermissionTicks: 10, combatMaxTicks: 1800, resolutionTicks: 5 };

describe("GH#658 一擊佔目標多少血", () => {
  it("真的打一場 → 那一擊的目標最大生命被記下來,而且進得了排行榜 payload", () => {
    const ctl = new MatchController("gh658", 4242, allBots(), FAST);
    for (let i = 0; i < 2600; i++) ctl.tick();
    const snap = ctl.ledger.snapshot();

    // 母體不可以是 0 —— 一場十二隻 bot 互毆不可能一次技能都沒打到人;
    // 這裡若是 0,下面每一條斷言都會對「空集合」恆真(失敗形態④)。
    const hits = snap.casts.filter((c) => c.heroHits > 0);
    expect(hits.length, "十二隻 bot 打一整回合不可能一次都沒打到英雄").toBeGreaterThan(0);

    // ⭐ 承重線:打到英雄的施放,一定同時帶著「打了多少」與「他有多厚」。
    for (const c of hits) {
      expect(c.topHeroHit).toBeGreaterThan(0);
      expect(c.topHeroHitMaxHp, `cast ${c.castId} 記到了傷害卻沒記到目標血量上限`).toBeGreaterThan(0);
      // 單一目標的最大一擊 ≤ 這次施放對英雄的總傷害(它是其中一發)。
      expect(c.topHeroHit).toBeLessThanOrEqual(c.damageToHeroes + 1e-6);
    }

    // payload 那一層:兩格真的被搬上去,而且百分比推導得出來。
    const top = topDamageCasts(snap, 50).filter((c) => c.victimMaxHp > 0);
    expect(top.length).toBeGreaterThan(0);
    for (const c of top) expect(pctOfVictimMaxHp(c)).toBeGreaterThan(0);

    const entries = buildDamageBoardEntries(snap, { top: 50, ts: 1, version: "t" });
    expect(entries.some((e) => (e.victimMaxHp ?? 0) > 0 && (e.victimDamage ?? 0) > 0)).toBe(true);
    // ⚠️ 舊 member(沒有這兩格)仍然要讀得出來 —— 榜上幾萬筆舊資料不可以整批消失。
    const legacy = { ...entries[0]! };
    delete legacy.victimMaxHp;
    delete legacy.victimDamage;
    expect(isDamageBoardEntry(legacy)).toBe(true);
  });
});
