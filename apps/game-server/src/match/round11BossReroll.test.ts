/**
 * ⭐⭐ ④ 打死殭屍王 ⇒ **重抽三選一**，⛔ 不暫停戰鬥（GH#920 ④ / #1151 C）。
 *
 * > owner 2026-09-01 23:52（逐字）：「打死殭屍王後的**重抽三選一 不暫停時間**喔 我回答過了」
 * > owner 2026-09-01（逐字，較早）：「寶具死掉會隨機噴 **有機會**隨機三選一再拿到新的」
 *
 * ⭐ 跑**真的 `MatchController` ＋ 真的 `content/`** —— ⛔ 不自己 `emit`
 * （`step()` 第一行就清空 `world.events`，那是虛構通道 ＝ 失敗形態⑤），
 * ⛔ 也不自己註冊獎池（那樣量到的是一個測試才有的世界）。
 * ⭐ 王是**波次表**生的（`waveTable.events = [boss]`），⭐ 致命傷走 `world.damageQueue`。
 *
 * ── 突變紀錄（實跑，改壞 → 🔴 → 還原）────────────────────────────────
 * M1（承重）`MatchController.onRound11BossReroll` 的 `this.offers.set(...)` 那一行刪掉
 *    → 🔴 ①「王死了 ⇒ 這個座位手上多一張寶具三選一」（卡片根本沒出現）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { ContentLoader, registerAll, DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { TICK_HZ } from "@ggd/shared/constants";
import type { EntityId } from "@ggd/shared/ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** ⛔ 池子與道具都要是**出貨的**那一份 —— 沒有它 `offerItems` 抽得到的是 0 條。 */
beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

const rules = (over: Partial<ArenaRules["round11"]["survivalLoop"]> = {}): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 90,
    maxAliveZombies: 60,
    spawnRampSec: 0,
    deadPlayersControlBoss: false,
    // ⭐ 只抽「殭屍王」那一列 ⇒ 王一定會出現（⛔ 不是等它從權重 5 裡中獎）。
    waveTable: { eventIntervalSec: 2, difficultyBase: 1, baseSpawnCount: 0, events: [{ kind: "boss", weight: 1 }] },
    bombardment: { ...DEFAULT_ARENA_RULES.round11.bombardment, enabled: false },
    survivalLoop: {
      ...DEFAULT_ARENA_RULES.round11.survivalLoop,
      normalToSpecialSec: 0,
      specialDropsReviveCircle: false,
      breakItemOnDeath: false,
      bossRerollChancePct: 100,
      bossRerollTable: "legendary-weapons",
      ...over,
    },
  },
});

function toRound11(ctl: MatchController): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
}

/** ⭐ 跑到場上出現一隻王，把牠打死，回傳「殺牠的那一 tick 前後」的觀測。 */
function killOneBoss(id: string, over: Partial<ArenaRules["round11"]["survivalLoop"]> = {}) {
  const ctl = new MatchController(id, 7, allBots(), FAST, undefined, rules(over));
  toRound11(ctl);
  let boss: EntityId | null = null;
  for (let i = 0; boss === null && i < Math.round(20 * TICK_HZ); i++) {
    ctl.tick();
    for (const [mid, m] of ctl.world.mob) if (m.kind === "boss") { boss = mid; break; }
  }
  expect(boss, "⭐ 波次表真的生出了一隻殭屍王").not.toBeNull();
  const seatId = [...ctl.seats.keys()].find((s) => ctl.world.health.get(ctl.seats.get(s)!.entityId!)?.alive)!;
  const killer = ctl.seats.get(seatId)!.entityId!;
  const before = {
    offers: [...ctl.offers.values()].filter((o) => o.seatId === seatId).length,
    ticksLeft: ctl.phase.ticksLeft,
    phase: ctl.phase.phase,
  };
  ctl.world.damageQueue.push({
    source: killer,
    target: boss!,
    amount: ctl.world.health.get(boss!)!.maxHp * 100,
    type: "true",
    crit: false,
    origin: "basic",
  });
  ctl.tick();
  return {
    ctl,
    seatId,
    bossId: boss! as unknown as number,
    before,
    cards: [...ctl.offers.values()].filter((o) => o.seatId === seatId && o.kind === "item"),
  };
}

describe("④ 打死殭屍王 ⇒ 重抽三選一（GH#920 ④）", () => {
  it("★★ ⭐⭐ 王死了 ⇒ 這個座位手上**多一張寶具三選一**", () => {
    const r = killOneBoss("r11-reroll-on");
    expect(r.before.offers, "⭐ 前提：他手上本來沒有卡（⛔ 否則量到的是別人發的）").toBe(0);
    expect(r.cards.length, "⭐ 王死那一 tick 真的發了一張卡").toBe(1);
    expect(r.cards[0]!.choices.length, "⭐ 是**三**選一，⛔ 不是一張空卡").toBe(3);
    // ⭐ 去重帳本記上了 ⇒ 斷線重連／重播/同 tick 多來源致命再來一次領不到第二張。
    expect(r.ctl.round11ClaimsForTest.claimed("reroll", String(r.bossId))).toBe(true);
  });

  it("★★ ⭐⭐ **⛔ 不暫停戰鬥** —— 相位、倒數、商店一格都沒動（owner 逐字）", () => {
    const r = killOneBoss("r11-reroll-nopause");
    expect(r.cards.length, "前提：卡真的發了").toBe(1);
    expect(r.ctl.phase.phase, "⛔ 相位沒有被推走 —— 還在戰鬥").toBe("combat");
    expect(r.ctl.phase.ticksLeft, "⭐ 倒數照跑一格（⛔ 沒有被凍結、也沒有被延長）").toBe(
      r.before.ticksLeft - 1,
    );
    expect(r.ctl.world.combatActive, "⛔ 戰鬥沒有被關掉").toBe(true);
    expect(r.ctl.world.economyOpen, "⛔ 沒有順手把商店打開（那才是「暫停」的樣子）").toBe(false);
  });

  it("⛔ 機率調 0 ⇒ **一張都不發**（⭐ 一鍵 rollback，⛔ 而不是「每次都不中」）", () => {
    const r = killOneBoss("r11-reroll-off", { bossRerollChancePct: 0 });
    expect(r.cards.length).toBe(0);
    // ⭐ 關著的時候**連帳本都沒動** ⇒ 那條路逐位元 no-op（⛔ 也沒有多抽一顆亂數）。
    expect(r.ctl.round11ClaimsForTest.claimed("reroll", String(r.bossId))).toBe(false);
  });

  it("⭐ 回合結束時**沒按的卡會被自動代選**，⛔ 不是蒸發（第十一回合後面沒有下一場戰鬥）", () => {
    const r = killOneBoss("r11-reroll-autopick");
    expect(r.cards.length, "前提：卡開著").toBe(1);
    const entity = r.ctl.seats.get(r.seatId)!.entityId!;
    const held = () => (r.ctl.world.champion.get(entity)?.items ?? []).filter(Boolean).length;
    const beforeItems = held();
    let n = 0;
    while (r.ctl.phase.round === 4 && r.ctl.phase.phase === "combat" && n++ < 40000) r.ctl.tick();
    expect([...r.ctl.offers.values()].filter((o) => o.seatId === r.seatId), "⛔ 卡沒有被留著").toEqual([]);
    expect(held(), "⭐ 那張卡真的變成了背包裡的一件東西").toBe(beforeItems + 1);
  });
});
