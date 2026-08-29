/**
 * modelFxPlacement — spawnModelFx 的**擺位幾何**，刻意住在一個**無環**模組裡。
 *
 * ⭐ GH#838：客戶端 VfxScriptPlayer 要在瀏覽器 runtime import 這一份 ——
 * 它原本住 `spawnModelFx.ts`，而那個檔在 `delayed ↔ effectRegistry` 的
 * import 環上；從播放器進入那個環會讓 `effectRegistry.ts` 在 `delayed.ts`
 * 完成初始化之前讀 `delayedEffect` ⇒ **TDZ ReferenceError**（studio 首開實測）。
 * ⇒ 這裡只准 import 純模組（`../math/vec2`、`./kindLimits`）。
 * ⛔ 不要往這個檔加任何 `./effect*`／`./delayed`／`./pull` 的 **runtime** import。
 *
 * `pull.ts` 與 `spawnModelFx.ts` re-export 這裡的名字 —— 既有消費端一行不改。
 */
import type { Vec2 } from "../math/vec2";
import { dist, len, normalize, sub } from "../math/vec2";
import {
  MODEL_FX_MAX_DISTANCE,
  MODEL_FX_MAX_INSTANCES,
  PULL_MAX_ANCHORS,
} from "./kindLimits";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 擺位需要的參數子集（結構相容 `spawnModelFx` 的 effect def，⛔ 不 import 它的型別 —— 那會把環拖回來）。 */
export interface ModelFxPlacementParams {
  path: "forward" | "toTarget" | "orbit" | "radial" | "static";
  anchor?: "self" | "point" | "target";
  distance?: number;
  count?: number;
  spacing?: number;
}

/** 一個實例：從哪出發、往哪走、走多遠。`dir` 缺席 = `orbit`（不做線性推進）。 */
export interface Instance {
  readonly origin: Vec2;
  readonly dir?: Vec2;
  readonly travel: number;
}

/**
 * `(cos 2π/N, sin 2π/N)`，N = 1…{@link PULL_MAX_ANCHORS}。索引 0 不用。
 * ⛔ 這是**常數表**不是算出來的（見檔頭③）。長度必須等於 `PULL_MAX_ANCHORS + 1`。
 */
export const RING_UNIT_ROTATION: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 0],
  [-1, 0],
  [-0.5, 0.8660254037844387],
  [0, 1],
  [0.30901699437494745, 0.9510565162951535],
  [0.5, 0.8660254037844386],
  [0.6234898018587336, 0.7818314824680298],
  [0.7071067811865476, 0.7071067811865476],
  [0.766044443118978, 0.6427876096865393],
  [0.8090169943749475, 0.5877852522924731],
  [0.8412535328311812, 0.5406408174555976],
  [0.8660254037844387, 0.5],
];

/**
 * N 個等分點，半徑 `r`，圓心 `centre`。第 0 個永遠在 +x 方向 —— ⭐ 一個**固定**
 * 的起始相位，⛔ 不是「跟著施法者面向轉」：後者要一次旋轉（= 一次三角函式），
 * 而且原作 A091 的第一個錨點也是固定相位（`180/level × i`，i 從 1 起算）。
 */
export function ringPoints(centre: Vec2, r: number, n: number): Vec2[] {
  const count = Math.max(1, Math.min(PULL_MAX_ANCHORS, Math.floor(n)));
  const rot = RING_UNIT_ROTATION[count] ?? RING_UNIT_ROTATION[1]!;
  const [c, s] = rot;
  const out: Vec2[] = [];
  let ux = 1;
  let uz = 0;
  for (let i = 0; i < count; i++) {
    out.push({ x: centre.x + ux * r, z: centre.z + uz * r });
    // 複數乘法 (ux + i·uz) × (c + i·s)。只有 + − ×（檔頭③）。
    const nx = ux * c - uz * s;
    const nz = ux * s + uz * c;
    ux = nx;
    uz = nz;
  }
  return out;
}

/**
 * ⭐ GH#838 —— 擺位幾何的**唯一住處**，context-free。
 *
 * sim 的 {@link modelFxInstances} 與客戶端 VfxScriptPlayer（特效工坊的演出腳本）
 * 都吃這一份：sim 從 `EffectContext` 解出 frame 再委派；播放器從線上事件/畫面
 * 狀態解出 frame。⛔ 幾何**不可以**在兩邊各活一份 —— 那正是家族預設漂移那次的形狀。
 */
export interface ModelFxFrame {
  /** 施法者腳下（所有路徑的共同起點）。 */
  origin: Vec2;
  /** 施法者面向（單位向量不強求，內部會 normalize；解不到就缺席）。 */
  facing?: Vec2;
  /** 施放的地板點（anchor:"point" 與 target 缺席時的退化）。 */
  point?: Vec2;
  /** 第一個 shape 目標的位置（anchor:"target"／path:"toTarget" 用）。 */
  targetPos?: Vec2;
}

export function modelFxInstancesFromFrame(
  e: ModelFxPlacementParams,
  frame: ModelFxFrame,
): Instance[] {
  const origin = frame.origin;
  const spread = e.path === "radial" || e.path === "orbit";
  const count = spread
    ? Math.max(1, Math.min(MODEL_FX_MAX_INSTANCES, Math.floor(e.count ?? 1)))
    : 1;
  const far = clamp(e.distance ?? 0, 0, MODEL_FX_MAX_DISTANCE);

  if (e.path === "static") {
    // ⭐【定點 3D 模型】#649 類④ —— 原作 266 具 dummy 有 238 具（89%）站著不動：
    // `CreateUnit` → `AddSpecialEffect` → `UnitApplyTimedLife`，⛔ 一次
    // `SetUnitPosition` 都沒有。⇒ 一具、travel 0、終點只有 `lifeSec`。
    // 線路形狀與 orbit 的環上一點**逐位元同族**（`dx=dz=0`），所以客戶端
    // `modelFxPoseFromWire` 的「不動」分支照畫，⛔ 零行新客戶端數學。
    //
    // 錨點解析：target → point → self 逐層退化 —— 錨解不出來時退到施法者腳下，
    // ⛔ 不是整支消失（一支安靜什麼都不做的技能是失敗形態②）。
    let at: Vec2 | undefined;
    if (e.anchor === "target") {
      at = frame.targetPos ?? frame.point;
    } else if (e.anchor === "point") {
      at = frame.point;
    }
    const p = at ?? origin;
    // ⭐⭐ 不動 ≠ 沒有方向。原作那十具 dummy 是**沿一條線**擺的（`A0D5`@32322
    // 逐行），所以一具橫放的光束砲即使原地不動，它的**長軸仍然要躺在開火方向上**。
    // ⚠️ 這一格是被守衛抓出來的：`dir` 不送 ⇒ 線上 `dx=dz=0` ⇒ 客戶端走「不動」
    //    分支 ⇒ `yawRad` 恆為 0 ⇒ `modelFxWireContract` 的 |cos| 從 1 掉到 **0**
    //    ——**正是 #607 的形狀**（長軸在接縫上被挑掉），⛔ 而畫面上它看起來只是
    //    「光束躺錯方向」，⛔ 不會有任何錯誤訊息。
    // ⭐ `travel: 0` 已經讓客戶端 `travelled = dist × frac = 0` ⇒ 位置不動，
    //    所以送方向**零行客戶端改動**就同時拿到「不位移」與「指向正確」。
    let sdir: Vec2 | undefined;
    if (at !== undefined) {
      const to = sub(at, origin);
      if (len(to) > 1e-6) sdir = normalize(to);
    }
    if (sdir === undefined) {
      const f = frame.facing;
      if (f !== undefined && len(f) > 1e-6) sdir = normalize(f);
    }
    // ⛔ 解不到方向就退回無向（`dx=dz=0`）—— 仍然**畫**，⛔ 不是整支消失。
    if (sdir === undefined) return [{ origin: { x: p.x, z: p.z }, travel: 0 }];
    // ⭐【沿線 N 具】#673-④／GH#688 Phase 4 —— 原作的光束/火柱是**一次擺出一條線**：
    //   `A03S`（09-04 龜派氣功）@31924 逐行 `loop i=1..6: PolarProjectionBJ(caster,
    //   i×200, angle)`（火柱 h006）；`A05J`（**08-03**）@28838 同型 `i=1..10 × 150`。
    // ⇒ 第 k 具（k=0..count−1）在錨點沿 `sdir` 的 **spacing×k** 處。間距與具數
    //   照量到的原作值（200 wc3u ÷100 ＝ 2.0 世界單位 × 6 具）；⚠️ 與原作差**一個
    //   步長的平移**（原作 i=1..6 從 spacing 起，我們第 0 具在錨點上 —— 光束/火柱
    //   從施法者腳下長出來，⭐ count:1 逐位元等於今天的單具，這是刻意的取捨）。
    // ⚠️ 純度：只有乘加（單位向量 × 標量），⛔ 沒有三角函式 —— 角度在 `sdir` 裡。
    const stN = Math.max(1, Math.min(MODEL_FX_MAX_INSTANCES, Math.floor(e.count ?? 1)));
    const stGap = clamp(e.spacing ?? 0, 0, MODEL_FX_MAX_DISTANCE);
    const out: Instance[] = [];
    for (let k = 0; k < stN; k++) {
      // stGap 0（作者沒填 spacing）⇒ N 具疊同一點也不對 ⇒ 退化成 1 具（refine 擋
      // 在載入時，這裡只是防第三條路）。
      if (k > 0 && stGap <= 0) break;
      out.push({
        origin: { x: p.x + sdir.x * stGap * k, z: p.z + sdir.z * stGap * k },
        dir: sdir,
        travel: 0,
      });
    }
    return out;
  }
  if (e.path === "orbit") {
    // 環上 `count` 個等分位置。⛔ 不做線性推進 —— 繞圈的終點是 `lifeSec`。
    return ringPoints(origin, far, count).map((p) => ({ origin: p, travel: 0 }));
  }
  if (e.path === "radial") {
    // ⭐ 單位方向 = 半徑 1 的環上的點（同一張常數表，⛔ 不是第二份等分邏輯）。
    return ringPoints({ x: 0, z: 0 }, 1, count).map((d) => ({
      origin,
      dir: { x: d.x, z: d.z },
      travel: far,
    }));
  }

  // 直線兩種：方向從面向或目標來。
  let dir: Vec2 | undefined;
  let travel = far;
  if (e.path === "toTarget") {
    const tp = frame.targetPos;
    if (tp !== undefined) {
      const to = sub(tp, origin);
      if (len(to) > 1e-6) {
        dir = normalize(to);
        // ⚠️ 沒寫 `distance` = 走到目標身上；寫了就取**先到的那一個**
        // （⛔ 不是無條件用作者的數字，那會讓光束穿過目標繼續飛）。
        const reach = Math.min(MODEL_FX_MAX_DISTANCE, dist(origin, tp));
        travel = far > 0 ? Math.min(far, reach) : reach;
      }
    }
  }
  if (dir === undefined) {
    // `forward`，以及「`toTarget` 但目標已經不在了」—— ⛔ 退化成面向直線，
    // 不是整支消失：一支安靜什麼都不做的技能是失敗形態②。
    const f = frame.facing;
    if (f !== undefined && len(f) > 1e-6) dir = normalize(f);
  }
  if (dir === undefined) return [];
  return [{ origin, dir, travel }];
}
