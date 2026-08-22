/**
 * modelFxPath —— `spawnModelFx` 的**純**路徑數學（⛔ 沒有 Babylon、沒有 DOM）。
 *
 * ── 為什麼這是一個獨立的模組 ────────────────────────────────────────────────
 * owner 2026-08-22:「w3x jass + 球體 + 蝗蟲群單位 3d model 特效
 * (ex. Saber約束勝利之劍的翻滾光束就是)」。
 *
 * ⚠️ 原作那個東西**不是粒子發射器** —— JASS 生的是一隻帶模型的 dummy 單位
 * (`AddSpecialEffect` 貼在一個 locust 單位上)，然後每 0.03 秒把它往前推一格。
 * 所以「翻滾光束」的三個可見特徵全部是**單位運動**，不是粒子行為：
 *   ① 一個**實體**沿直線前進（粒子系統做不出「一顆一直存在的球體」）
 *   ② 它繞**自己的行進軸**滾（`spinDegPerSec`）——那是 `SetUnitFacing` 做不到的
 *      第三軸，原作用的是模型自帶的旋轉動畫
 *   ③ 走完就在**落點**爆（`onArrive`，莉娜龍破斬）
 *
 * ⭐ 這裡只算**位置與姿態**。誰被打到、打多少，是引擎（L1）的事 ——
 * 客戶端算傷害是失敗形態⑤（被測的不是出貨的那個）的最短路徑。
 *
 * ⚠️ 這裡**不可以**出現任何級距數字（第〇·四守則）：`speed`/`distance`/`scale`
 * 全部由呼叫端從技能 JSON 帶進來，這個檔一個字面平衡值都沒有。
 */

import type {
  ModelFxSpawnEvent,
  ModelFxSpawnInstance,
} from "@ggd/shared/sim/effects/spawnModelFx";

// ⭐ 契約型別**從 sim 那一側 import**,⛔ 不在這裡抄一份（GH#606 的根治）。
export type { ModelFxSpawnEvent, ModelFxSpawnInstance };

/**
 * ⭐ 這一份 .glb 的**長軸**烘在自己的哪一軸上（`model@1.fxLongAxis`）。
 * ⛔ 它不是一個方向（沒有正負），是一條**線** —— 見 `modelFxAxisCorrection`。
 */
export type ModelFxLongAxis = "x" | "y" | "z";

/** 一組 euler（弧度），照 Babylon `TransformNode.rotation` 的 x=pitch / y=yaw / z=roll。 */
export interface ModelFxEuler {
  x: number;
  y: number;
  z: number;
}

/** ⛔ 不做修正 —— 沒宣告長軸的模型走這一格（今天的行為，逐位元不變）。 */
const NO_AXIS_CORRECTION: ModelFxEuler = { x: 0, y: 0, z: 0 };

/**
 * 把模型自己的長軸轉到**行進軸**（Babylon 的 +Z）所需要的初始姿態。
 *
 * owner 2026-08-22:「翻滾光束應該包含 **90 度橫放的 beam** 吧」。
 *
 * ── 為什麼這是一個**姿態**而不是一個角度欄位 ──────────────────────────────
 * 一根沿自己 **Y** 建的柱子（`imported.netherstrike`，Saber 約束與勝利之劍）
 * 需要的是**俯仰**；一團沿自己 **X** 建的火焰（`imported.fireblast`，龍破斬）
 * 需要的是**偏航**。⛔ 一個 `orientDeg` 講不出兩者的差別 —— 它會逼作者自己去換算
 * 「哪一軸轉幾度」，而那個換算就是第〇·四守則說的「算得出來的數字」。
 * ⇒ 文件只寫**級別名**（哪一軸），角度在載入時由這裡解析。
 *
 * ── ⭐ 為什麼可以無視正負號 ────────────────────────────────────────────────
 * 長軸是一條線，⛔ 不是一個箭頭。所以 glTF 載入器那個 X 鏡射
 * （`__root__` 的 180° + scale(1,1,−1)，見 `views/glbFacing.ts` 檔頭）
 * 把 +X 變成 −X **不影響結論** —— X 軸還是 X 軸。
 * ⚠️ 這正是這一格能從 bbox **推導**而 `yawOffsetDeg` 不行的原因：
 * 後者要分前後，於是它需要骨架對稱性/腳尖偏移那一套線索。
 *
 * ── ⭐ 它必須疊在翻滾**裡面** ──────────────────────────────────────────────
 * 呼叫端把它掛在姿態節點的**子**節點上，於是合成順序是
 * `Ry(yaw) ∘ Rz(roll) ∘ A` —— A 先把長軸擺到 +Z，`spinDegPerSec` 的 roll 再繞
 * **那根長軸**滾（+Z 是 roll 的不動軸），最後 yaw 把它指向行進方向。
 * ⛔ 反過來（A 掛在外面）會讓翻滾把光束**甩離**它飛的那條線。
 */
export function modelFxAxisCorrection(axis: ModelFxLongAxis | undefined): ModelFxEuler {
  // ⚠️ Babylon 是**左手**系：繞 Y 轉 −90° 把 +X 送到 +Z；繞 X 轉 +90° 把 +Y 送到 +Z。
  if (axis === "x") return { x: 0, y: -Math.PI / 2, z: 0 };
  if (axis === "y") return { x: Math.PI / 2, y: 0, z: 0 };
  // "z" 與 undefined 都是恆等 —— Babylon 的前方本來就是 +Z。
  return NO_AXIS_CORRECTION;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** 一個實例在某個時刻的姿態。 */
export interface ModelFxPose {
  x: number;
  y: number;
  z: number;
  /** 世界偏航（模型的「前方」指向哪） */
  yawRad: number;
  /** 繞行進軸的翻滾角 */
  rollRad: number;
  /** 這一具已經走完全程；不動的那一種（orbit）永遠 false */
  arrived: boolean;
}

/**
 * ⛔⛔ **這個檔在 2026-08-23 之前自己重算了一次路徑,而那份是死的（GH#606）。**
 *
 * 舊版匯出 `modelFxPose(spec, at, index, t)` —— 它從 `ModelFxMotionSpec` ＋
 * `facingRad` 重新推導方向、等分角、行進距離。⛔ 三個問題,每一個都獨立致命：
 *
 * | | 舊的客戶端重算 | sim（傷害真的發生的地方） |
 * |---|---|---|
 * | `radial` 等分基準 | `facingRad + (i/n)·2π`（跟著施法者轉） | `ringPoints` 的**常數表**（⛔ 不跟著轉） |
 * | 行進距離 | `speed·t`,**不受 `lifeSec` 夾** | `min(travel, speed·dt·ticks)` |
 * | `circle` 側向排開 | 有（`lateral`） | ⛔ **沒有** |
 *
 * ⇒ 就算 payload 沒接錯,畫面上的光束也會**掃過與傷害不同的格子**。
 *
 * ⭐ 現在只有**一份**路徑數學,住在 `sim/effects/spawnModelFx.ts`,解算完的結果
 * 逐具走線路過來。這裡只負責**把它變成姿態** —— ⛔ 一個決策都不做。
 * （第〇·四守則的形狀:同一個答案不可以有第二個住處。）
 */

/** 一具實例在 `tSec` 時的姿態。⛔ 純函式、無狀態 —— 暫停／倒帶／逐格步進走同一條路。 */
export function modelFxPoseFromWire(
  inst: ModelFxSpawnInstance,
  opts: { y?: number; spinDegPerSec?: number },
  tSec: number,
): ModelFxPose {
  const t = tSec > 0 ? tSec : 0;
  const rollRad = (((opts.spinDegPerSec ?? 0) * Math.PI) / 180) * t;
  const y = opts.y ?? 0;

  // ⚠️ `dx=dz=0` = sim 說這一具**不動**（`orbit` 的環上一點）。
  // ⛔ 不要在這裡「補上」繞圈 —— sim 的 `onTouch` 班表用的是固定圓心,
  //    客戶端自己轉起來就是「畫面在轉、傷害在原地」。
  if (inst.dx === 0 && inst.dz === 0) {
    return { x: inst.x, y, z: inst.z, yawRad: 0, rollRad, arrived: false };
  }

  const frac = inst.durationSec > 0 ? Math.min(1, t / inst.durationSec) : 1;
  const travelled = inst.dist * frac;
  return {
    x: inst.x + inst.dx * travelled,
    y,
    z: inst.z + inst.dz * travelled,
    yawRad: Math.atan2(inst.dx, inst.dz),
    rollRad,
    // ⭐ 用**時間**判抵達,⛔ 不是距離 —— `dist` 為 0 的一具（速度 0 / 目標貼臉）
    //    用距離判會永遠 arrived=true,落點回呼在第 0 幀就響。
    arrived: frac >= 1 - 1e-6,
  };
}

/**
 * 這一發活多久（秒）＝ 最久的那一具。
 *
 * ⚠️ `maxSec` 是**硬**上限（`vfxCleanupPolicy` 的三秒鐵則,owner 2026-08-22：
 * 「不管什麼特效⋯生命週期最多維持三秒」）,⛔ 不是建議。
 */
export function modelFxWireLifeSec(insts: readonly ModelFxSpawnInstance[], maxSec: number): number {
  let m = 0;
  for (const i of insts) if (i.durationSec > m) m = i.durationSec;
  return Math.min(m > 0 ? m : maxSec, maxSec);
}
