// @vitest-environment jsdom
/**
 * 🎒 **背包滿的道具卡點得下去 ⇒ 列出六格 ⇒ 點一格 ⇒ 送出帶 `swapSlot` 的 `pickOffer`**（GH#1110 B）。
 *
 * > 「隨機選寶具的時候 道具欄已滿 怎麼辦」「A ＋ B 開票」—— owner 2026-09-08 02:28
 * （出處與「括號定義是 Claude 補的」見 `draftSwapPicker.tsx` 檔頭）。
 *
 * ⭐ 掛**真的面板**、讀**出貨內容**（`arena-rules.json` 的 `swapWhenFull` 走 `Configs`），
 * 點**真的按鈕**，量**真的送出去的指令** —— ⛔ 不掃原始碼字串。
 * 伺服器那一半的承重守衛在 `apps/game-server/src/match/offerSwap.test.ts`。
 * ⚠️ 這一條只證明「送得出去」；⛔ 畫面長相沒有實機截圖（鏈路已接上，⛔ 未驗收）。
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { registerAll } from "@ggd/shared/content/registries";
import { Items } from "@ggd/shared/sim/content/registry";
import { resetHudStore, syncHudFromState } from "../../net/RoomStore";
import { hudActions } from "../actions";
import { AugmentDraftPanel } from "./AugmentDraftPanel";

const ME = "acc-me";
let root: Root;
let host: HTMLDivElement;

beforeAll(async () => {
  registerAll((await new ContentLoader(shippedContentSource(join(__dirname, "../../../../../content"))).load()).store);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

function snap(items: string[], card: string): MatchState {
  return {
    matchId: "m", phase: "intermission", round: 3, tick: 30, phaseTicksLeft: 300, seed: 1, teams: [],
    seats: new Map([["0", { seatId: 0, teamId: 0, accountId: ME, displayName: "me", connected: true,
      driver: "human", championId: "champ.sela", entityId: 101, level: 1, gold: 0, xp: 0, ready: false,
      unspentPoints: 0, lastAckSeq: 0, items, itemRefund: items.map(() => 400), augments: [], mobKills: 0,
      abilityRanks: [1, 0, 0, 0], cooldowns: [0, 0, 0, 0], offers: [{ offerId: "of_1", tier: "weapon", choices: [card] }] }]]),
    entities: new Map(),
  } as unknown as MatchState;
}

describe("三選一換裝介面（GH#1110 B）", () => {
  it("★ 背包滿 ⇒ 點卡 ⇒ 挑第 4 格 ⇒ 送出 `pickOffer{swapSlot:3}`", () => {
    const ids = Items.ids() as string[];
    expect(ids.length, "⛔ 內容沒載進來").toBeGreaterThan(6);
    const sent = vi.spyOn(hudActions, "sendCommand").mockImplementation(() => {});
    vi.useFakeTimers();
    resetHudStore();
    syncHudFromState(snap(ids.slice(0, 6), ids[6]!), ME);
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    act(() => root.render(React.createElement(AugmentDraftPanel)));
    act(() => void vi.advanceTimersByTime(10_000)); // 翻牌動畫跑完

    const card = host.querySelector<HTMLButtonElement>('[role="dialog"] button');
    expect(card, "⛔ 面板沒畫出卡片").not.toBeNull();
    act(() => card!.click());
    expect(sent, "⛔ 背包滿卻直接送出了（沒有先問要換哪一格）").not.toHaveBeenCalled();

    const slot = host.querySelector<HTMLButtonElement>('[data-draft-swap-picker] [data-swap-slot="3"]');
    expect(slot, "⛔ 點了滿背包的卡，換裝介面沒有出現（開關開著）").not.toBeNull();
    act(() => slot!.click());
    expect(sent).toHaveBeenCalledWith({ kind: "pickOffer", offerId: "of_1#0", swapSlot: 3 });
  });
});
