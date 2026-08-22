/**
 * 【每回合的負載不隨回合數成長】—— owner 2026-08-23「戰鬥進到第二回合變得非常
 * lag，之後每回合越來越嚴重，直到整個地圖無回應」的 **sim 那一半**。
 *
 * ── 先講量到的（⛔ 不是推論）─────────────────────────────────────────────────
 * 三顆種子 × 十回合的真實 headless 比賽（出貨內容 + 出貨 arena-rules，殭屍波
 * armed）逐回合量 ms/tick、`delayed` 佇列與每一個 Map 的 size：**sim 這一半沒有
 * 任何一項隨回合數成長**。ms/tick 跟的是「場上有幾隻殭屍」而⛔ 不是回合號
 * （第 10 回合比第 3 回合便宜）；ms/tick 全程 0.07–0.45，30Hz 的預算是 33ms。
 * 完整數字在 `docs/_reports/lag-sim_temp_20260823-0100.md`。
 *
 * ── 所以這一份守的是「成長」這個**形狀**，⛔ 不是任何一個耗時數字 ────────────
 * 時間會因機器而異（會用錯誤的訊息紅），而「每回合越來越嚴重」在資料上的樣子是
 * **有一池只進不出**。兩條不變式就把那個形狀關起來，而且**一個出貨數字都沒有**：
 *   ① 每一回合開打時，四條「排在未來 tick 的工作」佇列都是空的
 *      （`delayed` / `randomArea` / `chainLightning` / `dashOnEnd`）
 *   ② 每一回合開打時的實體數不比**第一回合**多（殭屍／投射體／召喚物沒有漏掉 despawn）
 *
 * ── 突變紀錄（一批一條，挑承重的那一行）──────────────────────────────────
 *  · ⭐ `effects/delayed.ts::delayedSystem` 結尾的整段 compaction
 *      （`if (anyDone) { const live = q.filter(...) … }`）拿掉
 *    ＝ 付完的班永遠留在佇列裡，每一次施法都讓 `delayedSystem` 的迴圈更長一點 ——
 *      **逐字就是 owner 描述的那個症狀**。
 *      → ① 紅：「第 2 回合開打時還帶著上一回合的排程: expected 8 to be 0」
 */
import { describe, it, expect, beforeAll } from "vitest";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { CONTENT } from "../testkit/contentFixtures";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules } from "./arenaRules";

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** 四條「排在未來 tick 的工作」佇列現在總共有幾筆。 */
const queued = (w: MatchController["world"]): number =>
  w.delayed.length + w.randomArea.length + w.chainLightning.length + w.dashOnEnd.length;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
}, 120_000);

describe("每回合的負載不隨回合數成長（sim）", () => {
  it("★ 十回合實戰：排程佇列每回合歸零、實體數不成長", () => {
    const ctl = new MatchController("load-4242", 4242, allBots(), undefined, undefined, resolveArenaRules());
    const w = ctl.world;
    let round = 0;
    let firstRoundEnts = 0;
    let peakQueued = 0;
    let peakMobs = 0;
    for (let n = 0; n < 400_000 && ctl.phase.phase !== "matchEnd"; n++) {
      if (ctl.phase.phase === "combat" && ctl.phase.round !== round) {
        round = ctl.phase.round;
        // ① 上一回合排的班一發都不剩。
        expect(queued(w), `第 ${round} 回合開打時還帶著上一回合的排程`).toBe(0);
        // ② 實體數不比第一回合多。⛔ 不是一個出貨值：基準線是這一場自己的第一回合。
        if (firstRoundEnts === 0) firstRoundEnts = w.transform.size;
        else expect(w.transform.size, `第 ${round} 回合開打時實體比第一回合多 —— 有東西沒 despawn`)
          .toBeLessThanOrEqual(firstRoundEnts);
      }
      ctl.tick();
      peakQueued = Math.max(peakQueued, queued(w));
      peakMobs = Math.max(peakMobs, w.mob.size);
    }
    // 非空性：這一場真的打滿多回合、真的排過班、真的生過怪，否則上面兩條是廢話。
    expect(round, "這一場沒有打滿多回合").toBeGreaterThan(2);
    expect(peakQueued, "整場一筆排程都沒有 —— ① 是空的").toBeGreaterThan(0);
    expect(peakMobs, "整場一隻殭屍都沒生 —— ② 沒被壓到").toBeGreaterThan(0);
  }, 300_000);
});
