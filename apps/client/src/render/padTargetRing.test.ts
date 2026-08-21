/**
 * GUARD — GH#519「指定型技能沒有目標指示」的**接線**那一半。
 *
 * `views/targetMarker.test.ts` 已經驗了**決定**層（畫不畫·畫在哪·什麼顏色）。
 * ⚠️ 那一層全綠而玩家仍然什麼都看不到 —— 因為在此之前**沒有人畫那顆 mesh**，
 * 也沒有人把手把挑到的目標 publish 進暫存器（失敗形態②：算出來了但從沒送到畫面）。
 * 這一支就是把那整條線接起來之後的守衛，⛔ 全程走出貨那條路：
 *
 *   真的 `GamepadSystem.poll()`（長按到門檻）
 *     → `mapGamepadFrame` 的 `describeTarget`
 *     → `PadDescribeHold` → `setCursorlessTarget`
 *     → `resolvePadTargetMarker` → 真的 Babylon mesh 的 `position` / `isEnabled()`
 *
 * ⛔ 沒有一條手捏 `hoveredEntityId`、⛔ 沒有一條自己叫 `setCursorlessTarget`
 * （那會把被測的接線換成測試自己寫的一份，失敗形態⑤）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { AimIndicator } from "./AimIndicator";
import { resolvePadTargetMarker } from "./views/targetMarker";
import { BTN, GamepadSystem, padCastReach, type PadState } from "../input/GamepadInput";
import { setCursorlessAim } from "../input/AimResolver";

const TARGETED = { castType: "targeted", range: 8 } as const;
const SELF: Vec2 = { x: 0, z: 0 };
const WHERE: Record<number, Vec2> = { 11: { x: 3, z: 0 }, 22: { x: -2, z: 4 } };
const posOf = (id: number): Vec2 | null => WHERE[id] ?? null;
/** 環的 mesh —— 找不到就是「這條斷言在測空氣」。 */
const ring = () => scene.meshes.find((m) => m.name === "aim-target-rim");

let engine: NullEngine;
let scene: Scene;
let indicator: AimIndicator;
/** 這一幀 `nearestEnemy` 被問到的半徑（要跟真的施法夾限同一個）。 */
let askedReach = 0;
let locked: number | null = 11;
/** A 鍵（＝Q 槽）現在按著沒有 —— 放開就是「放開技能鍵」。 */
let held = true;

const pad = (): PadState[] => [
  {
    connected: true,
    axes: [0, 0, 1, 0],
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: held && i === BTN.A })),
  },
];

function padSystem(): GamepadSystem {
  return new GamepadSystem(
    { onOrder: () => {}, onAim: () => {}, onCommand: () => {}, onPadsChanged: () => {} },
    () => ({
      selfPos: SELF,
      facing: { x: 1, z: 0 },
      ability: () => TARGETED,
      nearestEnemy: (_from, maxRange) => {
        askedReach = maxRange;
        return locked;
      },
      skillPoints: 0, // ⛔ 有點數的長按是升級，不是說明
    }),
    pad,
    () => 1,
  );
}

/** 長按過門檻的一次真 poll（`performance.now` 走假時鐘）。 */
function holdPastThreshold(sys: GamepadSystem): void {
  sys.poll();
  vi.advanceTimersByTime(2000); // > 任何合法的 longPressMs 上界
  sys.poll();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance"] });
  engine = new NullEngine();
  scene = new Scene(engine);
  indicator = new AimIndicator(scene);
  locked = 11;
  held = true;
});
afterEach(() => {
  setCursorlessAim(null);
  indicator.dispose();
  scene.dispose();
  engine.dispose();
  vi.useRealTimers();
});

/** 出貨那一行：GameApp 每幀就是這樣叫的。 */
const paint = () => indicator.update(null, resolvePadTargetMarker(posOf, () => "enemy"));

describe("手把長按指定型技能 → 被鎖定的人腳下有一個環 (GH#519)", () => {
  it("⭐ 承重：環落在手把真的鎖住的那個人腳下，搖桿換人環就跟著搬", () => {
    const sys = padSystem();
    holdPastThreshold(sys);
    paint();
    expect(ring()?.isEnabled()).toBe(true);
    expect(ring()?.position.x).toBe(WHERE[11]!.x);
    // ⚠️ 挑目標的半徑必須是**真的施法夾限**：拿卡面值去挑會挑到一個必定被拒的敵人
    expect(askedReach).toBe(padCastReach(TARGETED, 1));

    // 搖桿偏壓挑到另一個人（⛔ 沒有循環鍵，方向就是換目標的手勢）
    locked = 22;
    sys.poll();
    paint();
    expect(ring()?.position.x).toBe(WHERE[22]!.x);
  });

  it("放開技能鍵就收環 —— 一個活過放開那一刻的環會指著沒有人在瞄的敵人", () => {
    const sys = padSystem();
    holdPastThreshold(sys);
    paint();
    expect(ring()?.isEnabled()).toBe(true);

    held = false; // 放開 A ⇒ describe 消失 ⇒ 暫存器清空
    sys.poll();
    paint();
    expect(ring()?.isEnabled()).toBe(false);
  });
});
