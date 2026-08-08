/**
 * 【具名標記】的客戶端接線守衛（GH#278）—— 體驗層，一條薄守衛。
 *
 * 驗的是**行為**，不是原始碼字串：GameApp 真正的 drain 迴圈跑一批真的事件，
 * 然後讀「選出來要畫的東西」——HUD 的 `markRows` 與浮動文字池 —— 有沒有真的變。
 * 掃 `grep recordMarkEvent` 只證明那行字被打出來過（見 killCombo.test.ts 檔頭的
 * 實測：把呼叫改成永不可達，regex 照樣 match）。
 *
 * ⚠️ 零出貨數值：層數用 7/6 這種任意數，不是十二道試煉的 12。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { GameApp } from "../../GameApp";
import { frameBus, clearCombatText } from "../../frameBus";
import { hudStore, resetHudStore } from "../../net/RoomStore";
import { markRows } from "./markModel";

const ME = 11;
const OTHER = 22;
const MARK = "godie-test.passive";
const NAME = "試煉";

/** GameApp 的原型是真的，只把 canvas/audio/socket 換成惰性替身（同 killCombo.test.ts）。 */
function runDrain(events: unknown[], nowMs: number): void {
  const noop = (): void => {};
  const stub = Object.assign(Object.create(GameApp.prototype) as object, {
    sessions: { primary: { drainEvents: () => events } },
    vfx: { handleEvent: noop, statusFx: { set: noop } },
    views: { handleEvent: noop },
    casts: { handleEvent: noop },
    sfxQueue: { push: noop },
    deathFocus: { noteDeath: noop },
    applyCombatFeedback: noop,
    dispatchContextualVoice: noop,
    audioEntityPos: () => ({ x: 3, z: 4 }),
    audioTeamOf: () => 0,
    batchProfiled: false,
    frameKicks: 0,
  }) as unknown as { drainNetworkEvents(s: null, id: number | null, n: number): void };
  stub.drainNetworkEvents(null, ME, nowMs);
}

const ev = (type: string, data: Record<string, unknown>): unknown => ({ type, tick: 1, data });

beforeEach(() => {
  resetHudStore();
  clearCombatText();
  frameBus.champions.clear();
  frameBus.champions.set(ME, { entityId: ME, teamId: 0, isLocal: true } as never);
  Abilities.register(MARK as AbilityId, { id: MARK, name: NAME } as never);
  hudStore.setState({ localEntityId: ME });
});

describe("標記 → 螢幕", () => {
  it("markChanged 進來,HUD 選出來要畫的東西真的變了(而且只認自己的)", () => {
    expect(markRows(hudStore.getState().marks, 0)).toHaveLength(0);
    runDrain([ev("markChanged", { id: OTHER, markId: MARK, count: 9 })], 1000);
    expect(markRows(hudStore.getState().marks, 1000)).toHaveLength(0); // 別人的不畫
    runDrain([ev("markChanged", { id: ME, markId: MARK, count: 7 })], 1000);
    const rows = markRows(hudStore.getState().marks, 1000);
    expect(rows).toHaveLength(1);
    // 名字來自那份文件,不是裸 id —— #202「商店顯示 raw item ID」的同型缺陷
    expect(rows[0]!.label).toBe(NAME);
    expect(rows[0]!.count).toBe(7);
  });

  it("lethalSaved 在身上留下一行看得見的字,而且那是名字不是 id", () => {
    runDrain([ev("lethalSaved", { id: ME, markId: MARK, remaining: 6, spent: 1, hp: 50 })], 2000);
    const live = frameBus.combatText.filter((e) => e.active);
    expect(live).toHaveLength(1);
    expect(live[0]!.label).toContain(NAME);
    expect(live[0]!.label).not.toContain(MARK);
    expect(live[0]!.label).toContain("6");
    // 同一顆事件也把層數帶進 HUD —— 兩個通道各自獨立,壞一個不會被另一個掩護
    expect(markRows(hudStore.getState().marks, 2000)[0]!.saving).toBe(true);
  });
});
