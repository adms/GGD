// @vitest-environment jsdom
/**
 * 🔴 **GH#618 —— 三選一還沒選完時，那棵子樹不可以每張快照重跑 React。**
 *
 * > owner 2026-08-23：「剛進商店 介面有些部分會黑閃爍 **選完隨機三選一又回復正常**」
 * 面板訂的是 `seat.offers` **陣列本身**，而 `seats` 的快取鍵含 `cooldowns`/`mana`
 * ⇒ 修好前**卡片出現到選完為止每張快照 commit 一次**（量到 20/20）；沒有 offer 時選擇器
 * 回同一個 `null`，churn 的開／關時機與 owner 那半句話逐字吻合。
 * ⚠️ **必須數 commit**，⛔ 不可以只看 DOM：那 20 次重跑**零個 DOM mutation**，
 * 兩種實作在螢幕上逐位元相同，差的只有主執行緒（失敗形態④）。
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { MatchState } from "@ggd/shared/protocol/schema";

import { resetHudStore, syncHudFromState } from "../../net/RoomStore";
import { AugmentDraftPanel } from "./AugmentDraftPanel";

const ME = "acc-me";
/** 真的出貨道具 id —— 走最重的那條卡面（`ItemCardBody`），⛔ 不是手編字串。 */
const CARDS = ["all-might-hair", "bezoar-of-the-apothecary", "book-of-gospel"];

/** 出貨形狀的一張快照：`mana` 是「每張都在動」的那一欄，`offerId` 是牌的身分。 */
function snap(mana: number, offerId = "of_1"): MatchState {
  return {
    matchId: "m", phase: "intermission", round: 3, tick: 30, phaseTicksLeft: 300, seed: 1,
    teams: [],
    seats: new Map([["0", { seatId: 0, teamId: 0, accountId: ME, displayName: "me",
      connected: true, driver: "human", championId: "champ.sela", entityId: 101, level: 1,
      gold: 0, xp: 0, ready: false, unspentPoints: 0, lastAckSeq: 0, items: [], augments: [],
      mobKills: 0, abilityRanks: [1, 0, 0, 0], cooldowns: [0, 0, 0, 0],
      offers: [{ offerId, tier: "weapon", choices: CARDS }] }]]),
    entities: new Map([["101", { id: 101, kind: 1, seatId: 0, x: 0, z: 0, fx: 1, fz: 0,
      zone: 0, alive: true, hp: 100, maxHp: 100, shield: 0, mana, maxMana: 500 }]]),
  } as unknown as MatchState;
}

let root: Root;
let host: HTMLDivElement;
let commits = 0;

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** 掛上面板、歸零計數；回傳掛載時的那一顆 dialog 節點。 */
function mountDraft(): Element {
  resetHudStore();
  syncHudFromState(snap(10), ME);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  const profiled = React.createElement(
    React.Profiler,
    { id: "draft", onRender: () => (commits += 1) },
    React.createElement(AugmentDraftPanel),
  );
  act(() => root.render(profiled));
  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog, "面板沒掛上 —— 後面數的是一棵空樹").not.toBeNull();
  commits = 0;
  return dialog!;
}

describe("GH#618 三選一子樹", () => {
  it("★ 牌沒變，20 張快照 React **一次都不重跑**（卡片還在螢幕上）", () => {
    const dialog = mountDraft();
    for (let i = 1; i <= 20; i += 1) act(() => syncHudFromState(snap(10 + i), ME));
    expect(commits, "牌一張都沒變卻重跑了 React —— 玩家正在做這回合最大的決定").toBe(0);
    expect(host.querySelector('[role="dialog"]'), "卡片被換掉了").toBe(dialog);
  });

  it("換一組新的牌才重跑（⛔ 不可以修成永遠不更新）", () => {
    mountDraft();
    act(() => syncHudFromState(snap(11, "of_2"), ME));
    expect(commits, "來了新的一組牌卻沒重跑 —— 玩家看到的是上一組").toBeGreaterThan(0);
  });
});
