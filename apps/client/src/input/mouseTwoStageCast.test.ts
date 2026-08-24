// @vitest-environment jsdom
/**
 * 滑鼠二段施放 (GH#639) —— owner 2026-08-24:
 * > 「純滑鼠操作直接按技能按鈕應該要能二段選擇後施放才對，例如初號機陽離子砲」
 *
 * 掛**出貨的** <AbilityBar/>（真 React pointer 事件 → 真 holdProps）＋**出貨的**
 * InputCapture，兩段點擊逐下驗：第一下（技能格）⛔ 不可以送出任何 command，只進
 * 瞄準（地板圈 seam 讀得到）；第二下（場景）→ **出貨的 intent 通道**（deps.onCommand，
 * GameApp 接去房間的那一格）收到一筆 castAbility，瞄準解除。取消路：同格再按、場景
 * 右鍵（且⛔ 不可以下移動指令）。鍵盤 quick-cast 的既有守衛在 inputMapping.test.ts，
 * 這裡一格不重驗。
 *
 * 突變（接線類，一條）：InputCapture.pointerdown 拿掉 `if (this.castTwoStage(ev)) return;`
 * → 「第二下送 cast」紅（onCommand 一筆都沒有）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import type { Command, Order } from "@ggd/shared/sim/intents";
import { AbilityBar } from "../ui/components/AbilityBar";
import { getHeldAimSlot, setHeldAbility } from "../ui/abilityHold";
import { hudStore, resetHudStore, type SeatView } from "../net/RoomStore";
import { InputCapture } from "./InputCapture";
import { cancelTwoStageCast, getTwoStageArmedSlot } from "./mouseTwoStageCast";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HERO = "godie-mouse2c" as ChampionId;
const ability = (id: string): AbilityDef =>
  ({ id, name: `技能${id}`, castType: "ground", maxRank: 5, cooldown: [8, 8, 8, 8, 8],
     manaCost: [0, 0, 0, 0, 0], range: 6, effects: [] }) as unknown as AbilityDef;

let root: Root, host: HTMLDivElement, scene: HTMLDivElement, capture: InputCapture;
const commands: Command[] = [];
const orders: Order[] = [];
// 每條測試可換的兩格（GH#679 指定型要能瞄）：技能定義與游標下的敵人。
let abilityStub: { castType: "ground" | "targeted"; range: number };
let enemyStub: number | null;

beforeEach(async () => {
  globalThis.requestAnimationFrame = (() => 0) as never; // AbilityBar 的 rAF 迴圈
  globalThis.cancelAnimationFrame = (() => {}) as never;
  Champions.register(HERO, {
    id: HERO, name: "測試英雄", role: "fighter", attackType: "melee", modelKey: "champ.test",
    baseStats: {}, growth: {},
    abilities: { Q: ability(`${HERO}.Q`), W: ability(`${HERO}.W`), E: ability(`${HERO}.E`), R: ability(`${HERO}.R`) },
  } as unknown as ChampionDef);
  resetHudStore();
  hudStore.setState({
    connected: true, phase: "combat", localSeatId: 0, localMana: 100,
    seats: [{ seatId: 0, championId: HERO, abilityRanks: [1, 0, 0, 0], cooldowns: [0, 0, 0, 0],
              unspentPoints: 0, exRank: 0, exCooldown: 0, passiveCooldown: 0 } as unknown as SeatView],
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => root.render(createElement(AbilityBar)));
  scene = document.body.appendChild(document.createElement("div"));
  commands.length = orders.length = 0;
  abilityStub = { castType: "ground", range: 6 };
  enemyStub = null;
  capture = new InputCapture(scene as unknown as HTMLElement, {
    screenToGround: () => ({ x: 3, z: 2 }),
    getSelfPos: () => ({ x: 0, z: 0 }),
    getAbility: () => abilityStub,
    pickEnemy: () => enemyStub,
    pickSelf: () => false,
    onOrder: (o) => orders.push(o),
    onCommand: (c) => commands.push(c),
    onSelectSelf: () => {}, onZoom: () => {}, onToggleFollow: () => {},
  });
  capture.attach();
});

afterEach(() => {
  capture.dispose();
  act(() => root.unmount());
  document.body.innerHTML = "";
  cancelTwoStageCast();
  setHeldAbility(null);
  resetHudStore();
});

const pressTile = async (key: string, button = 0): Promise<void> => {
  const tile = host.querySelector(`[data-slot-key="${key}"]`);
  expect(tile, `沒有 data-slot-key="${key}" 的技能格`).toBeTruthy();
  await act(async () => {
    tile!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button }));
  });
};
const clickScene = (type = "pointerdown"): void => {
  scene.dispatchEvent(new MouseEvent(type, { button: 0, clientX: 10, clientY: 10 }));
};

describe("純滑鼠二段施放 (GH#639)", () => {
  it("⭐ 第一下（技能格）不施放、只進瞄準；第二下（場景）送出 castAbility 並解除", async () => {
    await pressTile("Q");
    expect(commands, "第一下就送了 command —— 那是一段施放，不是二段").toHaveLength(0);
    expect(getTwoStageArmedSlot()).toBe("Q");
    expect(getHeldAimSlot(), "瞄準中地板圈 seam 要釘在 Q 上").toBe("Q");

    clickScene();
    expect(commands, "第二下沒有送出 cast（出貨 intent 通道一筆都沒收到）").toEqual([
      { kind: "castAbility", slot: "Q", target: { type: "point", point: { x: 3, z: 2 } } },
    ]);
    expect(getTwoStageArmedSlot(), "施放後瞄準要解除").toBeNull();
    expect(getHeldAimSlot(), "施放後地板圈要收回").toBeNull();
  });

  it("再點同一格＝取消；場景右鍵＝取消且不下移動指令", async () => {
    await pressTile("Q");
    await pressTile("Q"); // owner:「再點鈕⋯=取消」
    expect(getTwoStageArmedSlot()).toBeNull();
    clickScene();
    expect(commands, "取消之後場景左鍵不可以還在施放").toHaveLength(0);

    await pressTile("Q");
    clickScene("contextmenu"); // owner:「右鍵=取消」
    expect(getTwoStageArmedSlot()).toBeNull();
    expect(orders, "取消瞄準的那一下右鍵不可以同時下移動指令").toHaveLength(0);
  });

  it("Esc＝取消瞄準 (GH#679)", async () => {
    await pressTile("Q");
    expect(getTwoStageArmedSlot()).toBe("Q");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(getTwoStageArmedSlot(), "Esc 之後瞄準要解除").toBeNull();
    clickScene();
    expect(commands, "Esc 取消之後場景左鍵不可以還在施放").toHaveLength(0);
  });

  it("指定型 (targeted)：點空地維持瞄準；點在敵人上才施放且鎖定該實體 (GH#679)", async () => {
    abilityStub = { castType: "targeted", range: 6 };
    await pressTile("Q");
    clickScene(); // 游標下沒有目標 → 拒絕但**維持瞄準**（取消是玩家自己的手勢）
    expect(commands, "沒有目標的第二下不可以送出任何 command").toHaveLength(0);
    expect(getTwoStageArmedSlot(), "沒打中目標要維持瞄準").toBe("Q");

    enemyStub = 42;
    clickScene();
    expect(commands, "點在敵人上要送出 entity target 的 castAbility").toEqual([
      { kind: "castAbility", slot: "Q", target: { type: "entity", entityId: 42 } },
    ]);
    expect(getTwoStageArmedSlot(), "施放後瞄準要解除").toBeNull();
  });
});
