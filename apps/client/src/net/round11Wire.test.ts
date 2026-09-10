/**
 * ⭐⭐ 第十一回合：**真的伺服器 → 真的白名單 → 真的收端 → 真的畫面字**（GH#1151 H）。
 *
 * ⛔⛔ **為什麼這條守衛必須跑真的東西。** CLAUDE.md 失敗形態⑧逐字：
 * 「事件有 `case`、`eventFanout` 放行、`tsc` 綠 —— ⭐ 而那個 case 的**第一行**讀一個
 *  **零寫入端**的欄位然後 break（或擲 TypeError，帶走同一批後面每一個事件）」，
 * 2026-08-23 一天之內中五次，而四種守衛全部結構性失明 —— 其中一種正是
 * 「測試**自己造**一份 payload 餵進消費端」（它量的是一個虛構通道）。
 *
 * ⇒ ⭐ 這裡一個 payload 都不手寫：
 *
 *   真的 `MatchController`（出貨的 `arena-rules` 形狀，只把 round11 開起來）
 *     → 真的 `world.events`
 *       → 真的 `isFannedOutEvent`（⛔ 漏放行就到不了下一步）
 *         → 真的 `recordRound11Event`（⛔ 欄位名漂掉就進不了 store）
 *           → 真的 `round11View` + 真的 `Round11OverlayView`
 *             → ⭐ `renderToStaticMarkup` 讀回**畫面上的字**
 *
 * ⭐ 而「現在是不是第十一回合」那一格走的是**出貨的 `projectSnapshot`**，
 * ⛔ 不是我在測試裡設一個 round 數字。
 *
 * MUTATION LOG（2026-09-10，逐條驗過）：
 *   · `eventFanout.CONTROLLER_FANNED_OUT_EVENT_TYPES` 清空 → ①③④ 紅
 *   · `round11Model.isRound11` 改成 `round >= finalRound` → ② 紅（它在第十回合就成立）
 *   · `RoomStore.recordRound11Event` 的 `hudStore.setState` 拿掉 → ③④ 紅
 */
import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ItemId } from "@ggd/shared/ids";
import { MatchState } from "@ggd/shared/protocol/schema";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MatchController, type SeatSpec } from "../../../game-server/src/match/MatchController";
import { rulesFromDoc, type ArenaRules } from "../../../game-server/src/match/arenaRules";
import { isFannedOutEvent } from "../../../game-server/src/net/eventFanout";
import { projectSnapshot } from "../../../game-server/src/net/snapshot";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { TICK_HZ } from "@ggd/shared/constants";
import { hudStore, recordRound11Event } from "./RoomStore";
import { isRound11, round11View, type Round11Rules } from "../ui/hud/round11Model";
import { Round11OverlayView } from "../ui/hud/Round11Overlay";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const FINAL_ROUND = 3; // ⭐ ⇒ 第十一回合 ＝ 第 4 回合（`finalRound + 1`，見 round11Model 檔頭）
const TELEGRAPH = 4;
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/**
 * ⭐⭐ **出貨的那一份設定**（`content/config/arena-rules.json` → `rulesFromDoc`），
 * 只把 round11 的總開關打開、把節奏調快 —— ⛔ 不改任何語意。
 *
 * ⛔⛔ **⛔ 不可以用 `DEFAULT_ARENA_RULES.round11` 當底。** 2026-09-10 實測：
 * 那一份是「缺欄時的 fallback」，而它刻意是**不會動的值**
 * （`bombardment.radius: 0` · `breakItemOnDeath: false` · `normalToSpecialSec: 0`，
 *  見 `round11Wiring.test.ts` 的「⛔ 缺欄的設定 ⇒ fallback 是**不會動**的值」）。
 * ⇒ ⭐ 拿它當底的守衛會**綠得毫無意義**：轟炸半徑 0 打不到人、死亡不損壞寶具。
 *   ⚠️ 這正是 CLAUDE.md 記過的「守衛是靠缺陷才綠的」的鏡像 —— 它一開始就是紅的，
 *   而紅的原因不是實作壞了，是**夾具用了一個永遠不會發生的世界**。
 */
const SHIPPED = rulesFromDoc(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- JSON.parse 是 any；`rulesFromDoc` 自己逐欄位守
  JSON.parse(readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8")),
);

const rules = (): ArenaRules => ({
  ...SHIPPED,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: FINAL_ROUND,
  round11: {
    ...SHIPPED.round11,
    enabled: true,
    triggerBossKills: 2,
    durationSec: 60,
    maxAliveZombies: 60,
    spawnRampSec: 0,
    deadPlayersControlBoss: false,
    waveTable: {
      eventIntervalSec: 1,
      difficultyBase: 1,
      baseSpawnCount: 2,
      events: [{ kind: "bombardment", weight: 1 }],
    },
    bombardment: { ...SHIPPED.round11.bombardment, enabled: true, telegraphSec: TELEGRAPH },
  },
});

function toRound11(id: string): MatchController {
  const ctl = new MatchController(id, 7, allBots(), FAST, undefined, rules());
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === FINAL_ROUND + 1 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "⭐ 有跑到第十一回合").toBe(FINAL_ROUND + 1);
  return ctl;
}

/** ⭐ 跑 N 秒，把**過得了白名單**的事件餵進真的收端；回傳過線的事件名。 */
function pump(ctl: MatchController, secs: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < Math.round(secs * TICK_HZ); i++) {
    ctl.tick();
    for (const ev of ctl.world.events) {
      if (!isFannedOutEvent(ev)) continue; // ⭐ 出貨漏斗（`MatchRoom.ts:1002`）就是這一行
      seen.push(ev.type);
      // ⭐ `EventMessage` 與 `SimEvent` 是同一個形狀（`{type,tick,data}`）——
      //   ⛔ 這裡**不改任何一格**，`MatchRoom` 送上線的也是原封不動的 `ev.data`。
      const msg: EventMessage = { type: ev.type, tick: ev.tick, data: ev.data };
      recordRound11Event(msg, 1_000 + i * 33);
    }
  }
  return seen;
}

const VIEW_RULES: Round11Rules = {
  finalRound: FINAL_ROUND,
  bannerText: "第十一回合・生存模式",
  durationSec: 60,
  deadPlayersControlBoss: false,
  bombardTelegraphSec: TELEGRAPH,
};

/** 出貨的模型 + 出貨的元件 ⇒ 玩家真的會讀到的那串字。 */
function paint(nowMs: number, over: Partial<Parameters<typeof round11View>[0]> = {}): string {
  const s = hudStore.getState();
  return renderToStaticMarkup(
    React.createElement(Round11OverlayView, {
      view: round11View({
        phase: "combat",
        round: FINAL_ROUND + 1,
        secondsLeft: 125,
        alive: true,
        roundDeaths: 0,
        teamAllDied: false,
        bannerStartedAtMs: nowMs,
        bombard: s.round11Bombard,
        notices: s.round11Notices,
        nowMs,
        rules: VIEW_RULES,
        ...over,
      }),
    }),
  );
}

describe("GH#1151 H —— 第十一回合的畫面，走出貨的那一條路", () => {
  beforeEach(() => hudStore.setState({ round11Bombard: null, round11Notices: [], localSeatId: 0, seats: [] }));

  it("★ ⭐ ② 出貨的 `projectSnapshot` 投出來的 round，客戶端判得出這是第十一回合", () => {
    const ctl = toRound11("r11-snap");
    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());
    expect(state.round, "⛔ 快照沒有把回合送出去").toBe(FINAL_ROUND + 1);
    expect(isRound11(state.round, FINAL_ROUND), "⛔ 客戶端判不出第十一回合").toBe(true);
    // ⛔ 反方向：第十回合**不可以**被判成第十一回合（⛔ 否則橫幅每一場都跳）。
    expect(isRound11(FINAL_ROUND, FINAL_ROUND)).toBe(false);
  });

  it("★ ⭐ ①③ 真的轟炸事件過得了白名單，而且**畫面上真的出現倒數**", () => {
    const ctl = toRound11("r11-bomb");
    const seen = pump(ctl, TELEGRAPH - 1);
    expect(seen, "⛔ `round11Bombardment` 沒有過白名單 ⇒ 玩家挨的是沒有前兆的半血真傷").toContain(
      "round11Bombardment",
    );
    const bomb = hudStore.getState().round11Bombard;
    expect(bomb, "⛔ 收端沒有接住（欄位名漂掉？）").not.toBeNull();
    expect(bomb!.radius, "⭐ 半徑是伺服器給的").toBeGreaterThan(0);
    // ⭐ 倒數還沒走完 ⇒ 畫面上要有那一行字。
    const html = paint(bomb!.startedAtMs + 1000);
    expect(html, "⛔ 紅圈預警沒有畫出來").toContain("轟炸來襲");
    expect(html, "⛔ 橫幅沒有畫出來").toContain("第十一回合・生存模式");
    expect(html, "⛔ 倒數沒有畫出來（2:05 ＝ 伺服器給的 125 秒）").toContain("2:05");
    // ⛔ 落下之後那一行必須消失 —— 一個永遠掛著的警告等於沒有警告。
    expect(paint(bomb!.startedAtMs + (TELEGRAPH + 1) * 1000)).not.toContain("轟炸來襲");
  });

  it("★ ⭐ ①④ 死亡損壞的寶具，玩家**看得到是哪一件** —— ⛔ 不是無聲消失", () => {
    const ctl = toRound11("r11-broken");
    const seatId = [...ctl.seats.keys()][0]!;
    const entity = ctl.seats.get(seatId)!.entityId!;
    ctl.world.champion.get(entity)!.items[0] = "godie-item-a" as ItemId;
    const held = ctl.world.champion.get(entity)!.items.filter(Boolean).map(String);
    hudStore.setState({ localSeatId: Number(seatId) });
    ctl.world.health.get(entity)!.hp = 0; // ⭐ 走真的 DeathSystem，⛔ 不自己 emit
    expect(pump(ctl, 1 / TICK_HZ), "⛔ `round11ItemBroken` 沒有過白名單").toContain("round11ItemBroken");
    const notices = hudStore.getState().round11Notices;
    expect(notices.length, "⛔ 收端沒有接住").toBeGreaterThan(0);
    const line = notices[notices.length - 1]!.text;
    expect(line, "⛔ 沒有說「撿不回來」⇒ 玩家會把它讀成 bug").toContain("撿不回來");
    // ⭐ 指名的那一件必須是他真的帶著的（⛔ 不是憑空一個字串）。
    expect(held.some((h) => line.includes(h)), `⛔ 提示沒有指名任何一件他帶著的寶具：${line}`).toBe(true);
    expect(paint(1_000), "⛔ 提示沒有畫到畫面上").toContain("寶具損壞");
  });

  it("★ ⭐ 換邊／旁觀**畫得出來** —— ⛔ 死了之後不再是一片沉默", () => {
    const r = { ...VIEW_RULES, deadPlayersControlBoss: true };
    // 死了、隊友還在 ⇒ 旁觀（⛔ 不是「換邊」—— 伺服器只在**整隊團滅**才換）
    expect(paint(1_000, { alive: false, roundDeaths: 1, teamAllDied: false, rules: r })).toContain("旁觀中");
    // 整隊團滅之後又站起來 ⇒ 那不是復活，是換邊
    expect(paint(1_000, { alive: true, roundDeaths: 1, teamAllDied: true, rules: r })).toContain(
      "操作殭屍王",
    );
    // ⛔ 反方向：沒死過的人不可以被說成在開王
    expect(paint(1_000, { alive: true, roundDeaths: 0, teamAllDied: true, rules: r })).not.toContain(
      "操作殭屍王",
    );
    // ⛔ 開關關掉（出貨預設 rollback 的那一邊）⇒ 不可以出現「換邊」的字
    expect(paint(1_000, { alive: true, roundDeaths: 1, teamAllDied: true })).not.toContain("操作殭屍王");
  });

  it("★ ⭐ 不是第十一回合就**一個像素都不畫**（⛔ 不是畫一塊空的）", () => {
    expect(paint(1_000, { round: FINAL_ROUND })).toBe("");
    expect(paint(1_000, { phase: "intermission" })).toBe("");
  });
});
