/**
 * 【回合邊界不留班・不隨回合數成長】—— owner 2026-08-23「戰鬥進到第二回合變得
 * 非常 lag，之後每回合越來越嚴重」的 **sim 那一半**的守衛。
 *
 * ── 先講量到的結論（⛔ 不是推論）─────────────────────────────────────────────
 * 三顆種子 × 十回合的真實 headless 比賽（出貨內容 + 出貨 arena-rules，殭屍波
 * armed）逐回合量 ms/tick、`delayed` 佇列、各 Map size：**沒有任何一項隨回合數
 * 成長**。ms/tick 跟的是「場上有幾隻殭屍」，⛔ 不是回合號（第 10 回合比第 3
 * 回合便宜）。所以這一份守的不是效能，是**排程的生命週期**。
 *
 * ── 它擋什麼 ───────────────────────────────────────────────────────────────
 * ① 上一回合排在未來 tick 的班，一發都不可以活到下一回合開打
 *    （`delayed` / `randomArea` / `chainLightning` / `dashOnEnd`）。
 * ② 而且這件事不可以靠「resolution 那一段剛好夠長」—— 所以①用一份**撐到
 *    schema 上界**的班來問，⛔ 不是等出貨內容自己排空（那樣的守衛是空的）。
 *
 * ── 突變紀錄（一批一條，挑承重的那一行）──────────────────────────────────
 *  · `MatchController.enterCombat` 的 `this.world.clearScheduledWork()` 拿掉
 *    → ① 紅：「上一回合排的班活到下一回合開打了」。② 仍綠（出貨內容自己排得完，
 *      這正是為什麼①不可以只讀出貨內容）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { DELAYED_MAX_DELAY_SEC } from "@ggd/shared/sim/effects/kindLimits";
import { CONTENT } from "../testkit/contentFixtures";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules } from "./arenaRules";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const newMatch = (seed: number): MatchController =>
  new MatchController(`sched-${seed}`, seed, allBots(), undefined, undefined, resolveArenaRules());

/** 四條「排在未來 tick 的工作」佇列現在各有幾筆。 */
const queued = (w: MatchController["world"]): number =>
  w.delayed.length + w.randomArea.length + w.chainLightning.length + w.dashOnEnd.length;

/** 一路 tick 到「第 `round` 回合的 combat 剛開始」的那一刻。 */
function advanceToCombat(ctl: MatchController, round: number): void {
  for (let n = 0; n < 400_000; n++) {
    if (ctl.phase.phase === "combat" && ctl.phase.round === round) return;
    ctl.tick();
  }
  throw new Error(`從來沒有走到第 ${round} 回合的 combat`);
}

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
}, 120_000);

describe("回合邊界：上一回合排的班不可以活到下一回合", () => {
  it("★ 撐到 schema 上界的一串排程，在下一回合開打時已經不存在", () => {
    const ctl = newMatch(4242);
    advanceToCombat(ctl, 1);
    const caster = [...ctl.world.transform.keys()][0]!;
    // ⛔ 刻意用**上界**而不是出貨值：出貨內容今天排的班短到 resolution 就付完了，
    // 拿它來問等於問一個不會失敗的問題（第二守則的「守衛驗機制」）。
    ctl.world.delayed.push({
      caster, rank: 1, origin: "test:boundary", frozen: [],
      effects: [], strikes: [{ atTick: ctl.world.tick + DELAYED_MAX_DELAY_SEC / ctl.world.dt, final: true }],
      next: 0, dropDeadTargets: true, stopOnCasterDeath: false, zone: 0,
    });
    expect(queued(ctl.world), "夾具沒排進去 —— 這條測試是空的").toBeGreaterThan(0);

    advanceToCombat(ctl, 2);
    expect(queued(ctl.world), "上一回合排的班活到下一回合開打了").toBe(0);
  }, 300_000);

  it("★ 一整場十回合：每一回合開打時排程都是空的，而且比賽真的排過班", () => {
    const ctl = newMatch(4242);
    let scheduledEver = 0;
    let lastRound = 0;
    for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
      if (ctl.phase.phase === "combat" && ctl.phase.round !== lastRound) {
        lastRound = ctl.phase.round;
        expect(queued(ctl.world), `第 ${lastRound} 回合開打時還帶著上一回合的排程`).toBe(0);
      }
      ctl.tick();
      scheduledEver = Math.max(scheduledEver, queued(ctl.world));
    }
    expect(lastRound, "這一場沒有打滿多回合，上面那條等於沒問").toBeGreaterThan(2);
    // 非空性：這一場真的有技能排過未來 tick 的班，否則「開打時是 0」是廢話。
    expect(scheduledEver, "整場一筆排程都沒有 —— 上面那條是空的").toBeGreaterThan(0);
  }, 300_000);
});
