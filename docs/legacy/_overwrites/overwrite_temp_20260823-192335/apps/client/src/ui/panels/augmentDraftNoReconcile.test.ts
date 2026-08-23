// @vitest-environment jsdom
/**
 * 🔴 **GH#618 —— 三選一還沒選完時，那棵子樹不可以每張快照重跑 React。**
 *
 * > owner 2026-08-23 逐字：「剛進商店 介面有些部分會**黑閃爍** **選完隨機三選一又回復正常**」
 *
 * `AugmentDraftPanel` 訂的是 `seat.offers` **陣列本身**，而 `RoomStore` 的
 * `seats` 快取鍵含 `cooldowns`/`mana`/`statusRemainTicks`（中場每張快照都在動）
 * ⇒ 修好之前，**卡片出現到玩家選完為止每一張快照 commit 一次**（量到 20/20）。
 * ⭐ 它的開／關時機與 owner 那半句話逐字吻合：沒有 offer 時選擇器回**同一個
 * `null`**，所以 churn 只在「還沒選完」這段存在。
 *
 * ⚠️ 這一條**必須數 commit 次數**，⛔ 不可以只看 DOM —— 量到修好前的 20 次重跑
 * **一個 DOM mutation 都沒有產生**（畫面逐位元相同）。兩種實作在螢幕上一模一樣，
 * 差的只有主執行緒（失敗形態④）。⇒ `React.Profiler`。
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { MatchState } from "@ggd/shared/protocol/schema";

import { resetHudStore, syncHudFromState } from "../../net/RoomStore";
import { AugmentDraftPanel } from "./AugmentDraftPanel";

const ME = "acc-me";
/** 真的出貨道具 id —— 走的是最重的那條卡面（`ItemCardBody`），⛔ 不是手編字串。 */
const CARDS = ["all-might-hair", "bezoar-of-the-apothecary", "book-of-gospel"];

/** 一張出貨形狀的快照。`mana` 是「每張都在動」的那一欄，`offerId` 是牌的身分。 */
function snap(mana: number, offerId = "of_1"): MatchState {
  const seat = {
    seatId: 0, teamId: 0, accountId: ME, displayName: "me", connected: true,
    driver: "human", championId: "champ.sela", entityId: 101, level: 1, gold: 0, xp: 0,
    ready: false, unspentPoints: 0, lastAckSeq: 0, items: [], augments: [], mobKills: 0,
    abilityRanks: [1, 0, 0, 0], cooldowns: [0, 0, 0, 0],
    offers: [{ offerId, tier: "weapon", choices: CARDS }],
  };
  const ent = { id: 101, kind: 1, seatId: 0, x: 0, z: 0, fx: 1, fz: 0, zone: 0,
    alive: true, hp: 100, maxHp: 100, shield: 0, mana, maxMana: 500 };
  return {
    matchId: "m", phase: "intermission", round: 3, tick: 30, phaseTicksLeft: 300, seed: 1,
    seats: new Map([["0", seat]]), entities: new Map([["101", ent]]), teams: [],
  } as unknown as MatchState;
}

let root: Root;
let host: HTMLDivElement;
let commits = 0;

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** 掛上面板並開始數 commit；回傳掛載時的那一顆 dialog 節點。 */
function mountDraft(): Element {
  resetHudStore();
  syncHudFromState(snap(10), ME);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(
        React.Profiler,
        { id: "draft", onRender: () => (commits += 1) },
        React.createElement(AugmentDraftPanel),
      ),
    );
  });
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
