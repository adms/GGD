/**
 * ⭐【具名計數器】真的上了線,而且**重連之後還在**(GH#304)。
 *
 * owner 2026-08-09 在「加欄位」與「發事件」之間選了加欄位,而**唯一**的理由就是
 * 這件事:事件是瞬間的,中途加入／重連的客戶端沒有事件歷史,補不回層數。所以
 * 承重的那一條是 ★①:層數是**很久以前**變的,一個全新的 `MatchState`(= 一個
 * 剛連上的客戶端收到的第一份完整狀態)必須就帶著正確的數字。
 *
 * ⛔ 「層數變的時候有送」對事件方案也是綠的(失敗形態 ④),所以這裡**沒有**那種
 * 斷言 —— 每一條都在 `projectSnapshot` 到一個**全新** state 上之後才讀。
 *
 * ⛔ 零出貨數值:12 這種十二道試煉的初始層數不住在這裡,用任意數。
 *
 * ── 突變紀錄(實跑)────────────────────────────────────────────────────────
 * M1 `net/snapshot.ts` 把 `setArray(ss.counterIds, …)` / `(ss.counterCounts, …)`
 *    兩行刪掉 → ★①②③ FAIL(拿到空陣列)。④ 仍綠 —— 它問的是「不該出現的
 *    東西沒有出現」,而什麼都不送當然也滿足,所以它一個人證明不了任何東西。
 * M2 `namedCounters` 的 `if (e.stacks === undefined) continue` 拿掉
 *    → ④ FAIL(沒寫 stacks 的狀態長出一個 ×1)。①②③ 仍綠。
 * 兩個改回來 → 4/4 綠。
 */
import { describe, it, expect } from "vitest";
import { MatchState } from "@ggd/shared/protocol/schema";
import { installMark, consumeMark } from "@ggd/shared/sim/marks";
import { MARK_DURATION_PERMANENT } from "@ggd/shared/sim/markLimits";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EntityId, StatusId } from "@ggd/shared/ids";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";

const seats = Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));
const COUNTER = "godie-test.passive";
const LAYERED = "test-layered" as StatusId;

function inCombat(): MatchController {
  const ctl = new MatchController("counters", 909, seats, {
    champSelectTicks: 5,
    intermissionTicks: 30,
    combatMaxTicks: 1200,
    resolutionTicks: 5,
  });
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

function heroOf(ctl: MatchController): EntityId {
  return [...ctl.seats.values()][0]!.entityId!;
}

/** 一個**剛連上的客戶端**收到的第一份完整狀態。 */
function firstSnapshotOfSeat0(ctl: MatchController): Map<string, number> {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  const want = [...ctl.seats.values()][0]!.seatId;
  const ss = [...state.seats.values()].find((s) => s.seatId === want)!;
  const ids = [...ss.counterIds];
  const counts = [...ss.counterCounts];
  return new Map(ids.map((id, i) => [id, counts[i]!]));
}

/** 走出貨的 `applyStatus`(手寫進 `StatusComp.effects` 會繞過正在被守的那條路)。 */
function applyLayered(ctl: MatchController, who: EntityId, stacks: number | undefined): void {
  runEffects([{ kind: "applyStatus", statusId: LAYERED, duration: 30, ...(stacks !== undefined ? { stacks } : {}) }], {
    world: ctl.world,
    caster: who,
    rank: 1,
    targets: [who],
    origin: "test",
    rng: ctl.world.rng,
  });
}

describe("具名計數器上線 (GH#304)", () => {
  it("★ ① 重連:層數是 200 tick 前變的,全新客戶端的第一份快照仍然讀得到", () => {
    const ctl = inCombat();
    const who = heroOf(ctl);
    installMark(ctl.world, who, {
      markId: COUNTER,
      initial: 9,
      max: 9,
      durationSec: MARK_DURATION_PERMANENT,
      resetOn: "match",
    });
    expect(consumeMark(ctl.world, who, COUNTER, 2)).toBe(true);
    // 事件在**這裡**發完了。之後才連上的人一顆都收不到。
    for (let i = 0; i < 200; i++) ctl.tick();
    expect(firstSnapshotOfSeat0(ctl).get(COUNTER)).toBe(7);
  });

  it("★ ② 狀態層數與標記層數走同一條線,同一個 id 兩邊都有就相加", () => {
    const ctl = inCombat();
    const who = heroOf(ctl);
    applyLayered(ctl, who, 3);
    installMark(ctl.world, who, {
      markId: LAYERED,
      initial: 4,
      max: 4,
      durationSec: MARK_DURATION_PERMANENT,
      resetOn: "match",
    });
    // 一個 id = 一列。相加是 `statusStacks` 已經在用的規則(跨來源相加),
    // 不是為了這一格新發明的仲裁。
    expect(firstSnapshotOfSeat0(ctl).get(LAYERED)).toBe(7);
  });

  it("★ ⑤ 房間已經投影過幾百次之後,**才**連上的那個人仍然拿得到完整層數", () => {
    const ctl = inCombat();
    const who = heroOf(ctl);
    installMark(ctl.world, who, {
      markId: COUNTER,
      initial: 6,
      max: 6,
      durationSec: MARK_DURATION_PERMANENT,
      resetOn: "match",
    });
    // ⚠️ 這一段是 ★① 缺的那一半。★① 只投影**一次**,所以任何「跟上次比,
    // 沒變就不送」的實作在它底下都是綠的 —— 那正是失敗形態 ④。真的房間是
    // 每 tick 投影進同一份 state,delta 快取在這裡才會變熱。
    const live = new MatchState();
    for (let i = 0; i < 200; i++) {
      ctl.tick();
      projectSnapshot(ctl, live, new Map());
    }
    // 現在才有人連上:他收到的是一份全新的完整狀態,不是這 200 次的差分。
    expect(firstSnapshotOfSeat0(ctl).get(COUNTER)).toBe(6);
  });

  it("★ ③ 0 層仍然上線 ——「你沒有免死了」是玩家最需要的那一格", () => {
    const ctl = inCombat();
    const who = heroOf(ctl);
    installMark(ctl.world, who, {
      markId: COUNTER,
      initial: 1,
      max: 1,
      durationSec: MARK_DURATION_PERMANENT,
      resetOn: "match",
    });
    consumeMark(ctl.world, who, COUNTER, 1);
    // 整列消失 = 玩家以為自己還有免死。0 與「沒有這個計數器」是兩件事。
    expect(firstSnapshotOfSeat0(ctl).has(COUNTER)).toBe(true);
    expect(firstSnapshotOfSeat0(ctl).get(COUNTER)).toBe(0);
  });

  it("★ ④ 作者沒寫 stacks 的狀態**不會**長出一個 ×1(相容性)", () => {
    const ctl = inCombat();
    applyLayered(ctl, heroOf(ctl), undefined);
    // 出貨的 28 份 status 沒有一份寫這一格。收進來的話,每一次【暈眩】【減速】
    // 都會在玩家的計數器列上多一行 —— 而那不是一個在疊的東西。
    expect([...firstSnapshotOfSeat0(ctl).keys()]).toEqual([]);
  });
});
