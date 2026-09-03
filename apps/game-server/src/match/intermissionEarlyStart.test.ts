/**
 * A3 —— 中場（商店）的早退（GH#970）。
 *
 * owner 2026-09-02：
 *
 * > 「不是有開一張票是**練習模式按 ready 後直接進商店不用等待**了嗎？
 * >   而且還被關了？」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 這個檔釘的是一個**量到的**根因，⛔ 不是票文寫的那個
 * ═══════════════════════════════════════════════════════════════════════════
 * #970 的票文說「你按 Ready 之後還要等 11 個 bot 各自逛完商店」。
 * ⛔ **量了，不成立**（2026-09-03，用下面同一組夾具）：bot 在第 5 個 tick 就
 * 全部 Ready、牠們的三選一在第 10 個 tick 就被代選掉，一場「1 真人 + 11 bot」
 * 的中場在真人選卡＋按 Ready 之後 **10 個 tick** 就進戰鬥了。
 *
 * ⭐ 真正堵住的是 `allSeatsReady` 等的**另一種座位**：練習房的三個靶子
 * （`config.practice@1.dummyCount`，出貨 3）拿的是 `DummyDriver` —— 一支每一
 * tick 回 `EMPTY_INTENT` 的 driver ⇒ 它們**結構上永遠不會送 `ready`**
 * ⇒ `allSeatsReady` 在練習房裡**恆為 false** ⇒ 玩家按了 Ready 之後每一次都
 * 等滿整個倒數（實測 749/750 ticks）。⚠️ 那是失敗形態⑧：讀端在（`seat.ready`），
 * 而那一格有**零個寫入端**。
 *
 * ⚠️ 沒有任何一條寫死秒數或 tick 數當成**斷言**：預算從夾具推導，斷言問的一律
 * 是「有沒有在倒數跑完**之前**進戰鬥」——一個「會不會發生」的問題。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId } from "@ggd/shared/ids";
import { Configs, DEFAULT_PRACTICE_RULES } from "@ggd/shared/content";
import { HumanDriver } from "../seat/HumanDriver";
import { MatchController, type SeatSpec } from "./MatchController";

/** 中場預算。⚠️ 它是**夾具**，⛔ 不是出貨值的第二個住處 —— 沒有一條斷言拿它當答案。 */
const CFG = {
  champSelectTicks: 2,
  intermissionTicks: 25 * 30,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

/**
 * ⚠️⚠️ **一個「早退」的斷言為什麼不可以寫成 `waited < intermissionTicks`**
 * （2026-09-03 我第一版就是這樣寫的，而突變**沒有紅**）：相位是在預算的**最後
 * 一個 tick**（749/750）逾時推進的 ⇒ 那個不等式**對逾時那條路也成立**
 * ⇒ 它問的不是「有沒有早退」，是「這場比賽有沒有結束」。⭐ 失敗形態④。
 *
 * ⇒ 所以底下每一條都用兩種**可判**的形狀之一：
 *   · **A/B**：同一組夾具跑兩次（開關開／關），斷言開著的那一次**更早**離開中場。
 *     ⭐ 這也是「兩個方向都要量」——「已知有的量得到」**且**「已知沒有的量不到」。
 *   · **有界的 tick 數**：推 `SOON` 個 tick（遠小於預算）之後問相位是什麼。
 */
const SOON = 60;

/** 用**真的那條路**（`config.match@1` → `resolveVsBotPacing`）開關這一格。 */
function registerKnob(on: boolean): void {
  Configs.register({
    id: "config.match",
    schema: "config@1",
    match: { teamCount: 4, teamSize: 3, intermissionEarlyStartVsBot: on },
  } as never);
}

/**
 * 練習／離線 dev join 的形狀：建構時 12 席**全部**是 bot，人是「之後」才接管
 * 座位 0 的（`MatchRoom.onJoin`「dev mode: take over the first AI seat」）。
 * ⭐ 這正是 #847 在選角那一段踩到的形狀，所以這裡刻意用同一個。
 */
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function toIntermission(ctl: MatchController): MatchController {
  let guard = 0;
  while (ctl.phase.phase !== "intermission" && guard++ < 50_000) ctl.tick();
  return ctl;
}

/** 座位 `n` 換成真人（`humanSeat` + 一顆真的 `HumanDriver`，⛔ 不是手寫 intent）。 */
function takeOverSeat(ctl: MatchController, n: number): HumanDriver {
  const seat = ctl.seats.get(asSeatId(n))!;
  seat.humanSeat = true;
  const drv = new HumanDriver();
  seat.setDriver(drv);
  ctl.tick(); // driver swap 在 tick 邊界落地
  return drv;
}

/** 真人做完中場該做的兩件事：選掉自己的卡、按 Ready。走真的網路郵箱。 */
function pickAndReady(ctl: MatchController, drv: HumanDriver, n: number): void {
  const seatId = asSeatId(n);
  const mine = [...ctl.offers.entries()].filter(([, o]) => o.seatId === seatId).map(([id]) => id);
  drv.mailbox.push({
    seq: 1,
    commands: [...mine.map((id) => ({ kind: "pickOffer" as const, offerId: `${id}#0` })), { kind: "ready" }],
  });
}

/** 從中場往前推，回傳「等了幾個 tick 才離開中場」。 */
function ticksSpentInIntermission(ctl: MatchController): number {
  const t0 = ctl.world.tick;
  let guard = 0;
  while (ctl.phase.phase === "intermission" && guard++ < 50_000) ctl.tick();
  return ctl.world.tick - t0;
}

/** 練習房形狀：真人接管座位 0，靶子拿 `DummyDriver`。停在中場的第一個 tick。 */
function practiceAtIntermission(id: string, seed: number): { ctl: MatchController; drv: HumanDriver } {
  const ctl = new MatchController(id, seed, allBots(), CFG);
  ctl.practice = { ...DEFAULT_PRACTICE_RULES };
  ctl.tick();
  const drv = takeOverSeat(ctl, 0);
  toIntermission(ctl);
  ctl.tick();
  return { ctl, drv };
}

/** 一次完整的練習房中場：開關 = `knob`，真人選卡＋按 Ready，回報等了幾個 tick。 */
function practiceRun(knob: boolean): { waited: number; leftSomeoneUnready: boolean; phase: string } {
  registerKnob(knob);
  const { ctl, drv } = practiceAtIntermission(`prac-${knob}`, 7);
  // 這一條的前提：場上真的有「生出來了但**永遠不會** Ready」的座位（靶子）。
  // ⛔ 少了它，底下的比較在一場每個 bot 都會 Ready 的局裡也會有差 —— 形態⑩。
  const others = [...ctl.seats.values()].filter((s) => s.entityId !== null && !s.humanSeat);
  expect(others.length, "練習房生出了非真人的座位").toBeGreaterThan(0);
  pickAndReady(ctl, drv, 0);
  const waited = ticksSpentInIntermission(ctl);
  return { waited, leftSomeoneUnready: others.some((s) => !s.ready), phase: ctl.phase.phase };
}

describe("A3 —— 中場的早退（GH#970）", () => {
  it("① ⭐⭐ 練習房 A/B：開關關著等滿倒數，開著就**更早**離開中場", () => {
    cover("intermission-early-start");
    // 「已知沒有」的那一邊 —— 這正是 owner 回報的今天：靶子永遠不 Ready
    // ⇒ `allSeatsReady` 恆為 false ⇒ 只剩逾時那條路。
    const off = practiceRun(false);
    // 「已知有」的那一邊。
    const on = practiceRun(true);

    expect(off.phase).toBe("combat");
    expect(on.phase).toBe("combat");
    // 突變點（2026-09-03 驗過）：`intermissionEarlyStartDue` 的主體換成
    // `return false`（＝這一格不存在）⇒ on 與 off 變成同一個數字 ⇒ 這一條紅。
    expect(on.waited, "開著這一格 ⇒ ⛔ 不必等中場倒數").toBeLessThan(off.waited);
    // 而且離開中場的那一刻**仍然有座位沒 Ready** ⇒ 走的確實是「只等真人」那條路，
    // ⛔ 不是「牠們剛好也好了」。
    expect(on.leftSomeoneUnready, "早退時仍有座位沒 Ready ⇒ 舊條件在這一場是 false").toBe(true);
  });

  it("② ⭐ 零個真人座位（全 bot 沙盒）走的仍然是舊規則 —— 這一格碰不到它", () => {
    cover("intermission-early-start");
    registerKnob(true);
    const ctl = toIntermission(new MatchController("allbot", 4242, allBots(), CFG));
    // 「全部 Ready」對空集合恆真 —— 少了 `humans.length === 0` 那一關，這一場會
    // 在第 1 個 tick 就跳過中場（bot 連 Ready 與代選的機會都沒有）。
    const waited = ticksSpentInIntermission(ctl);
    expect(ctl.phase.phase).toBe("combat");
    expect(waited, "⛔ 不是第 1 個 tick 就走 —— bot 要有時間 Ready 與代選").toBeGreaterThan(1);
    expect(
      [...ctl.seats.values()].every((s) => s.entityId === null || s.ready),
      "走的是舊規則:每一個生出來的座位都 Ready 了才離開",
    ).toBe(true);
  });

  it("③ ⭐ couch 多人：一個按了另一個沒按 ⇒ 不早退；兩個都按 ⇒ 開打", () => {
    cover("intermission-early-start");
    registerKnob(true);
    const ctl = toIntermission(new MatchController("couch", 31, allBots(), CFG));
    const drv0 = takeOverSeat(ctl, 0);
    const drv1 = takeOverSeat(ctl, 1);

    pickAndReady(ctl, drv0, 0); // 只有座位 0
    for (let i = 0; i < SOON; i++) ctl.tick();
    expect(ctl.phase.phase, "另一個真人還沒按 ⇒ ⛔ 不可以被第一個按的人拖走").toBe("intermission");

    pickAndReady(ctl, drv1, 1);
    for (let i = 0; i < SOON; i++) ctl.tick();
    // ⚠️ `SOON` 遠小於 `intermissionTicks` ⇒ 這一條**只可能**因為早退而綠。
    expect(ctl.phase.phase, "兩個真人都按了 ⇒ ⛔ 不等倒數").toBe("combat");
  });

  it("④ ⭐ 真人自己那張卡還開著時**不**早退 —— 早退不可以替他把強化丟掉", () => {
    cover("intermission-early-start");
    registerKnob(true);
    const { ctl, drv } = practiceAtIntermission("card", 88);
    expect(
      [...ctl.offers.values()].some((o) => o.seatId === asSeatId(0)),
      "這一場真的發了一張真人的卡（⛔ 否則下面那條斷言是空的）",
    ).toBe(true);

    // ⛔ 只按 Ready，⛔ 不選卡。
    drv.mailbox.push({ seq: 1, commands: [{ kind: "ready" }] });
    for (let i = 0; i < SOON; i++) ctl.tick();
    expect(ctl.phase.phase, "他的三選一還開著 ⇒ 停在中場等他選").toBe("intermission");
  });

  it("⑤ ⭐ 早退的那一 tick 把非真人的卡收乾淨 —— ⛔ 沒有一張卡被帶進 combat", () => {
    cover("intermission-early-start");
    registerKnob(true);
    const { ctl, drv } = practiceAtIntermission("offers", 5150);
    pickAndReady(ctl, drv, 0);
    for (let i = 0; i < SOON; i++) ctl.tick();
    expect(ctl.phase.phase, "早退了（⛔ 不是逾時 —— SOON 遠小於預算）").toBe("combat");
    expect(ctl.offers.size, "⛔ 不可以把一張沒收掉的卡帶進戰鬥").toBe(0);
  });
});
