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
import { fanDirections } from "./fanRotation";
import { dist, len, normalize, sub } from "../math/vec2";
import {
  MODEL_FX_MAX_DISTANCE,
  MODEL_FX_MAX_INSTANCES,
  PULL_MAX_ANCHORS,
} from "./kindLimits";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 擺位需要的參數子集（結構相容 `spawnModelFx` 的 effect def，⛔ 不 import 它的型別 —— 那會把環拖回來）。 */
export interface ModelFxPlacementParams {
  /** optional 同 sim 的 effect def（preset 補值前可能缺席 —— 缺席走直線分支，語意同舊碼）。 */
  path?: "forward" | "toTarget" | "orbit" | "radial" | "static" | "fan";
  /** ⭐ GH#916 —— `path:"fan"` 時相鄰兩臂之間的角度（度）。⛔ 不是總張角。 */
  spreadDeg?: number;
  /**
   * ⚠️ ⭐ **`"bone"` 也收得下**（GH#761 AC②）—— ⛔ 而擺位這一層**不處理它**：
   * 骨頭掛點是**渲染層**的事（模型掛到 joint 上），⛔ 不是「算一個世界座標」。
   * ⇒ 這裡把它當成 `self`（實例仍然生在施法者身上），
   * ⭐ 而真正的掛載由 `modelFxRig` 讀 `attach`/`boneOn` 完成 ——
   * 與 `spawnVfx` 的 `at:"bone"` 同一條路。
   * ⛔ 型別上少收它會讓 `spawnModelFx` 的 def 指派不進來（實際踩到過）。
   */
  anchor?: "self" | "point" | "target" | "bone";
  distance?: number;
  count?: number;
  spacing?: number;
  /**
   * ⭐【槍口偏移】GH#838 N1 —— 沿**開火方向**把整組實例往前推。
   * JASS 的 `PolarProjectionBJ(GetUnitLoc(caster), 150.00, GetUnitFacing(caster))`
   * 是真動詞（09-04 龜派的三個東西都在槍口 +150wc3u ≈ 2.75u，⛔ 不在腳下）。
   * 缺席 ⇒ 0 ⇒ 這一格出現以前的每一份文件逐位元不變。
   */
  offsetForwardU?: number;
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

/**
 * 沿面向把一個點往前推（GH#838 N1；JASS `PolarProjectionBJ(loc, d, facing)`）。
 * ⚠️ 面向解不到 ⇒ **不推**（⛔ 不是猜一個 +x：那會讓落點跑到一個沒有人指定的方向）。
 * ⚠️ 純度：只有乘加，⛔ 沒有三角函式（角度已經在單位向量 `facing` 裡）。
 */
function offsetAlongFacing(p: Vec2, facing: Vec2 | undefined, d: number): Vec2 {
  if (d === 0 || facing === undefined) return p;
  const l = len(facing);
  if (l <= 1e-6) return p;
  return { x: p.x + (facing.x / l) * d, z: p.z + (facing.z / l) * d };
}

export function modelFxInstancesFromFrame(
  e: ModelFxPlacementParams,
  frame: ModelFxFrame,
): Instance[] {
  // ⭐ N1 槍口偏移：把**起點**沿開火方向推出去（⛔ 不是推每一具 —— radial/orbit
  //    的環心要跟著動，而沿線 static 的第 0 具本來就從 origin 長出來）。
  //    方向優先用面向（原作讀的正是 `GetUnitFacing`），面向解不到就不推。
  const origin = offsetAlongFacing(frame.origin, frame.facing, e.offsetForwardU ?? 0);
  const spread = e.path === "radial" || e.path === "orbit" || e.path === "fan";
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
  if (e.path === "fan") {
    // ⭐⭐ GH#916 —— **起點排成一段弧，方向全部平行於面向**（原作 A09I）。
    //
    // ⚠️⚠️ ⭐ 這**不是**「方向扇」—— 2026-09-04 逐行讀 war3map.j 才確定的，
    //    而我第一版就是照模板的 `inert` 散文做成了方向扇（第三守則：註解會說謊）：
    //      j:44062  中央：PolarProjectionBJ(casterLoc, **160**, facing)
    //      j:44068  右側：PolarProjectionBJ(casterLoc, **200**, **45 + facing**)
    //      j:44069  左側：PolarProjectionBJ(casterLoc, **200**, **−45 + facing**)
    //      j:44070  CreateNUnitsAtLoc(1,'h02F',…, point2, **GetUnitFacing(施法者)**)
    //    ⇒ ⭐ ±45 是**生成點的方位角**，⛔ 而三具的 facing 是**同一個**。
    //    ⇒ 畫面上是「三條並排往前衝的龍」，⛔ 不是「朝三個方向散開」。
    //
    // ⭐ 弧半徑用既有的 `offsetForwardU`（原作那兩個 160/200 就是它）——
    //    ⛔ 不新開一格：`offsetForwardU` 的語意本來就是「槍口離施法者多遠」。
    // ⚠️ 誠實：原作中央 160、兩側 200，⭐ 而這裡是**同一個半徑** ——
    //    那 40 wc3u 的差今天表達不了（要一格「逐臂半徑」），⛔ 不假裝有。
    const r = clamp(e.offsetForwardU ?? 0, -MODEL_FX_MAX_DISTANCE, MODEL_FX_MAX_DISTANCE);
    const arms = fanDirections(frame.facing, count, e.spreadDeg ?? 0);
    if (arms.length === 0) return [];
    // ⭐ 方向：**面向本身**（arms 的中間那一臂在 count 為奇數時就是它，
    //    ⛔ 但偶數時不是）⇒ 用正規化的 facing，⛔ 不是 arms[0]。
    const f = frame.facing;
    if (f === undefined || len(f) <= 1e-6) return [];
    const fwd = normalize(f);
    return arms.map((a) => ({
      // ⚠️ 弧心是**施法者本人**（`frame.origin`），⛔ 不是已經被 offsetForwardU
      //    往前推過的 `origin` —— 推兩次會把整段弧推到兩倍遠。
      origin: { x: frame.origin.x + a.x * r, z: frame.origin.z + a.z * r },
      dir: fwd,
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
