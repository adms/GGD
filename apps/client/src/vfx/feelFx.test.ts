/**
 * GH#494 —— 爽度那一層的守衛。**兩條承重的線**，⛔ 其餘不寫：
 *
 *   ① 金幣總額**逐位元等於今天**（硬條件）。這一層根本沒有一條路可以寫到錢，
 *      而「沒有路」要用**行為**證明，⛔ 不是掃原始碼看有沒有出現 `gold`
 *      （失敗形態 ⑥）。做法：兩個只有 `gold` 不同的 `mobSlain` 事件必須產生
 *      **逐格相同**的飛行軌跡；而且總開關關掉時，一枚都不畫、一聲都不響。
 *   ② 「吸回」那一段真的在動。突變驗證挑的就是這一條（見檔尾）。
 *
 * ⛔ 出貨數值不住在這裡（第零守則⑦）：每一條斷言都從 `DEFAULT_FEEL_FX` 推導，
 * 所以 owner 明天把停留改成 0.6 秒，這支測試**不會**用錯誤的訊息紅。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { GoldPickupFx } from "./GoldPickupFx";
import { moteSpec, pillarPalette } from "./castPillar";
import {
  DEFAULT_FEEL_FX,
  bezierAt,
  comboSemitones,
  easeAccelerate,
  flightControlPoint,
  readFeelFx,
  semitonesToPlaybackRate,
  type ConfigFeelFxDoc,
} from "./feelFx";

const TAG = "gh494-gold-pickup";
const G = DEFAULT_FEEL_FX.goldPickup;
const HOVER_MS = G.hoverSeconds * 1000;
const FLIGHT_MS = G.flightSeconds * 1000;

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

interface Played {
  event: string;
  volume?: number;
  semitones?: number;
}

/** 一具測試用的金幣層：殭屍固定在 (10,10)，擊殺者固定在 (0,0)。 */
function rig(patch?: Partial<ConfigFeelFxDoc["goldPickup"]>): {
  fx: GoldPickupFx;
  played: Played[];
} {
  const played: Played[] = [];
  const doc: ConfigFeelFxDoc = {
    ...DEFAULT_FEEL_FX,
    goldPickup: { ...G, ...patch },
  };
  const fx = new GoldPickupFx(scene, {
    entityPos: (id) => (id === 1 ? { x: 10, z: 10 } : id === 2 ? { x: 0, z: 0 } : null),
    playSfx: (event, opts) => {
      played.push({ event, volume: opts.volume, semitones: opts.semitones });
      return true;
    },
    policy: () => doc,
  });
  return { fx, played };
}

/** 走完一枚金幣的一生，回傳飛行途中每一幀的座標。 */
function flightPath(fx: GoldPickupFx, t0: number): { x: number; y: number; z: number }[] {
  const path: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= 12; i++) {
    const now = t0 + HOVER_MS + (FLIGHT_MS * i) / 12;
    fx.update(now);
    const m = scene.meshes.find((mm) => mm.name.startsWith("goldPickup-") && mm.isEnabled());
    if (m) path.push({ x: m.position.x, y: m.position.y, z: m.position.z });
  }
  return path;
}

describe("① 這一層碰不到錢 (gh494-gold-pickup)", () => {
  it("兩個只有 gold 不同的擊殺，飛出來的軌跡逐格相同", () => {
    cover(TAG);
    const a = rig();
    a.fx.spawn({ mobId: 1, killer: 2, gold: 20 }, 0);
    const pathA = flightPath(a.fx, 0);
    a.fx.dispose();

    const b = rig();
    // 同一個擊殺，但這一隻殭屍值 999,999 —— 對這一層必須**完全沒有差別**。
    b.fx.spawn({ mobId: 1, killer: 2, gold: 999_999 }, 0);
    const pathB = flightPath(b.fx, 0);
    b.fx.dispose();

    expect(pathA.length).toBeGreaterThan(6);
    expect(pathB).toEqual(pathA);
  });

  it("總開關關掉 = 一枚都不畫、一聲都不響（錢照給）", () => {
    cover(TAG);
    const { fx, played } = rig({ enabled: false });
    fx.spawn({ mobId: 1, killer: 2, gold: 20 }, 0);
    fx.update(HOVER_MS + FLIGHT_MS + 1);
    expect(fx.activeCount).toBe(0);
    expect(fx.instanceCount).toBe(0);
    expect(played).toEqual([]);
    fx.dispose();
  });

  it("擊殺者是 null（火圈/環境擊殺）時什麼都不生", () => {
    cover(TAG);
    const { fx } = rig();
    fx.spawn({ mobId: 1, killer: null, gold: 20 }, 0);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });
});

describe("② 掉落 → 停留 → 貝茲加速 → 落袋 (gh494-gold-pickup)", () => {
  it("停留期間待在屍體上，之後彎著飛回擊殺者並在到站時 dispose + 播一聲", () => {
    cover(TAG);
    const { fx, played } = rig();
    fx.spawn({ mobId: 1, killer: 2, gold: 20 }, 0);
    // ① 掉落：在屍體位置，⛔ 不是擊殺者位置
    fx.update(1);
    const born = scene.meshes.find((m) => m.name.startsWith("goldPickup-"))!;
    expect(born.position.x).toBeCloseTo(10, 5);
    expect(born.position.z).toBeCloseTo(10, 5);
    // ⚠️ 抄成數字：`born` 是**同一個** mesh 物件，飛起來之後它的 y 會跟著變 ——
    // 拿 `born.position.y` 當基準等於拿飛行結束的高度跟自己比（永遠不會紅）。
    const groundY = born.position.y;
    // ② 停留：整段時間都還在原地
    fx.update(HOVER_MS - 1);
    expect(born.position.x).toBeCloseTo(10, 5);
    expect(played).toEqual([]);

    // ③ 吸回：真的在動，而且**離開了兩點連線**（有弧）
    const path = flightPath(fx, 0);
    expect(path.length).toBeGreaterThan(6);
    const mid = path[Math.floor(path.length / 2)]!;
    expect(mid.x).toBeLessThan(10);
    expect(mid.y).toBeGreaterThan(groundY + 0.2);

    // ⭐ 加速（⛔ 不是等速）：後半段走的距離必須比前半段多
    const first = path[0]!;
    const last = path[path.length - 1]!;
    const d = (p: { x: number; z: number }, q: { x: number; z: number }): number =>
      Math.hypot(p.x - q.x, p.z - q.z);
    expect(d(mid, last)).toBeGreaterThan(d(first, mid));

    // ④ 落袋：instance 被回收（#262），而且響了一聲「輕」的
    fx.update(HOVER_MS + FLIGHT_MS + 1);
    expect(fx.activeCount).toBe(0);
    expect(fx.instanceCount).toBe(0);
    expect(played).toHaveLength(1);
    expect(played[0]!.volume).toBe(G.sfxVolume);
    fx.dispose();
  });

  it("同時飛行上限滿了就不畫（⛔ 不排隊），reset 不留下任何 mesh", () => {
    cover(TAG);
    const { fx } = rig({ maxConcurrent: 2 });
    for (let i = 0; i < 6; i++) fx.spawn({ mobId: 1, killer: 2, gold: 20 }, 0);
    expect(fx.activeCount).toBe(2);
    expect(fx.stats.skipped).toBe(4);
    fx.reset();
    expect(fx.instanceCount).toBe(0);
    fx.dispose();
  });
});

describe("⑤ 連段音階 (gh494-gold-pickup)", () => {
  it("一階一階升上去，到頂就停住，斷了歸零", () => {
    cover(TAG);
    const c = DEFAULT_FEEL_FX.comboPitch;
    expect(comboSemitones(1, c)).toBe(0);
    expect(comboSemitones(2, c)).toBe(c.semitonesPerStep);
    // ⭐「到頂不刺耳」：超過上限之後不再升高
    const capped = comboSemitones(c.maxSteps + 1, c);
    expect(comboSemitones(c.maxSteps + 99, c)).toBe(capped);
    // 一個八度 = 12 半音 = ×2 的播放倍率（⛔ 不是 12 個音檔）
    expect(semitonesToPlaybackRate(12)).toBeCloseTo(2, 10);
    expect(semitonesToPlaybackRate(0)).toBe(1);
    expect(comboSemitones(9, { ...c, enabled: false })).toBe(0);
  });

  it("落袋那一聲帶著掉落當下的連段，超過歸零視窗就回到基準音", () => {
    cover(TAG);
    const step = DEFAULT_FEEL_FX.comboPitch.semitonesPerStep;
    const resetMs = DEFAULT_FEEL_FX.comboPitch.resetAfterSeconds * 1000;
    const { fx, played } = rig();
    fx.noteCombo(2, 4, 0);
    fx.spawn({ mobId: 1, killer: 2, gold: 20 }, 0);
    fx.update(HOVER_MS + FLIGHT_MS + 1);
    expect(played[0]!.semitones).toBe(3 * step);

    // 同一條鏈，但已經過了歸零視窗 ⇒ 回到基準音
    fx.spawn({ mobId: 1, killer: 2, gold: 20 }, resetMs + 1);
    fx.update(resetMs + 1 + HOVER_MS + FLIGHT_MS + 1000);
    expect(played[1]!.semitones).toBe(0);
    fx.dispose();
  });

  it("音效節流：擋掉的那幾發是不播，⛔ 不是延後", () => {
    cover(TAG);
    const { fx, played } = rig({ sfxThrottleMs: 10_000, maxConcurrent: 8 });
    for (let i = 0; i < 5; i++) fx.spawn({ mobId: 1, killer: 2, gold: 20 }, 0);
    fx.update(HOVER_MS + FLIGHT_MS + 1);
    expect(fx.activeCount).toBe(0); // 五枚都飛完了
    expect(played).toHaveLength(1); // 但只響了一聲
    fx.dispose();
  });
});

describe("施法餘燼不再飄到天空 (gh494-gold-pickup)", () => {
  it("壽命/重力/阻力真的來自後台那份文件，⛔ 不是寫死的常數", () => {
    cover(TAG);
    const m = DEFAULT_FEEL_FX.castMotes;
    // 出貨值：上升在壽命結束**之前**就收斂 —— ⛔ 不是靠壽命把粒子剪掉。
    expect(moteSpec(pillarPalette("fx.prim.holy.nova", null))).toMatchObject({
      lifetimeSec: { min: m.lifetimeMinSec, max: m.lifetimeMaxSec },
      gravityY: m.gravityY,
      drag: m.drag,
    });
    // 後台改一格 → 粒子跟著改（這一條就是「可調」不是一句話的證據）
    const tuned = moteSpec(pillarPalette("fx.prim.holy.nova", null), {
      ...m,
      lifetimeMinSec: 1.2,
      lifetimeMaxSec: 0.4, // 故意寫反：夾成 [0.4, 1.2]，⛔ 不讓 min>max 流進粒子系統
      gravityY: 9,
      drag: 0.95,
    });
    expect(tuned.lifetimeSec).toEqual({ min: 0.4, max: 1.2 });
    expect(tuned.gravityY).toBe(9);
    expect(tuned.drag).toBe(0.95);
  });
});

describe("後台政策讀取 (gh494-gold-pickup)", () => {
  it("讀不到 / 壞掉的 override 逐格退回出貨值，界外的數字被夾回來", () => {
    cover(TAG);
    expect(readFeelFx(null)).toEqual(DEFAULT_FEEL_FX);
    expect(readFeelFx({ schema: "config.vfx-cleanup@1" })).toEqual(DEFAULT_FEEL_FX);
    // 只存了一格的 override：那一格生效，其餘退回出貨值（⛔ 不是整份丟掉）
    const partial = readFeelFx({
      schema: "config.feel-fx@1",
      goldPickup: { hoverSeconds: 2, easePower: 999 },
    });
    expect(partial.goldPickup.hoverSeconds).toBe(2);
    expect(partial.goldPickup.easePower).toBe(6); // 夾回 schema 上界
    expect(partial.goldPickup.flightSeconds).toBe(G.flightSeconds);
    expect(partial.castMotes).toEqual(DEFAULT_FEEL_FX.castMotes);
  });

  it("純函式：緩動與貝茲的端點是釘死的（起點/終點不因彎度而漂）", () => {
    cover(TAG);
    expect(easeAccelerate(0, 3)).toBe(0);
    expect(easeAccelerate(1, 3)).toBe(1);
    expect(easeAccelerate(0.5, 1)).toBe(0.5); // power 1 = 等速（止血閥）
    const from = { x: 4, z: -2 };
    const to = { x: -6, z: 8 };
    const ctrl = flightControlPoint(from, to, 2, 0.5);
    expect(bezierAt(from, ctrl, to, 0.5, 0)).toEqual({ x: 4, y: 0.5, z: -2 });
    expect(bezierAt(from, ctrl, to, 0.5, 1)).toEqual({ x: -6, y: 0.5, z: 8 });
  });
});

/**
 * ⭐ 突變紀錄（承重的那一條）——「拿掉吸回那一段」：
 * `GoldPickupFx.update` 裡把
 *   `const t = easeAccelerate(raw, cfg.easePower);` 改成 `const t = raw;`
 * ⇒ ②「後半段走的距離必須比前半段多」紅（等速直線，兩段相等）。
 * 再把整個 `coin.inst.position.set(...)` 那一行刪掉
 * ⇒ ②「彎著飛回擊殺者」的三條斷言一起紅（金幣停在屍體上不動）。
 */
