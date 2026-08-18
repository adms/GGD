/**
 * 發射器方位 (#366) —— 純數學,不 import Babylon。
 *
 * owner 2026-08-18 要的四個參數是**大小 / 顏色 / 透明度 / 方位**。前三個
 * (`applyArtParams` 的 `scale` / `tint` / `alpha`) 早就落地了;**方位一格都沒有**:
 * `artParams.ts` 有一個 `facingDeg?: number` 的型別欄位、一個沒有任何 production
 * 呼叫者的 `resolveSpatial()`、一條測試 —— 就這樣。所以 `beam`(47 支)、
 * `slash`(41)、`bolt`(11)、`dash`(6)、`tornado`(6) 這些**有方向的形狀,每一次
 * 施法都朝同一個方向噴**。
 *
 * ⚠️ 這裡刻意只做**機制**,不做技能(第〇·五守則)。一支龍捲風和一門橫放的柱狀砲
 * 在這個檔案裡是**同一段程式的兩組參數**:
 *
 * | | `pitchDeg` | `swirlDegPerSec` | 用哪支 primitive |
 * |---|---:|---:|---|
 * | 龍捲風 | 90(直立) | 540 | `tornado` |
 * | 橫放的柱狀砲 | **0**(橫放) | 0 | `column` |
 *
 * ⛔ 如果有一天有人為了某一支技能在這裡加一個 `if (abilityId === ...)`,那就是
 * 越線了 —— 那個 if 應該是這張表上的一列。
 *
 * ── 約定 ────────────────────────────────────────────────────────────────
 * 發射器的**局部 +Y 是它的軸**(Babylon 的 cone/sphere/point emitter 全都往 +Y
 * 噴)。`orientDirection` 把局部向量轉成世界向量,轉換是
 *
 *     R = Ry(yawDeg) · Rx(90° − pitchDeg)
 *
 * ⭐ `yaw 0 / pitch 90` 因此是**恆等變換**,而那正是出貨預設 —— 沒有寫 `orient`
 * 的 633 份文件一位元都不會變。這不是巧合,是挑這個角度約定的理由。
 */
import type { VfxOrient } from "@ggd/shared/content";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 出貨預設:直立、朝 +X、不旋轉。 */
export const DEFAULT_PITCH_DEG = 90;

const DEG = Math.PI / 180;

/**
 * 沒有方位可言的 `orient`(或 `undefined`)—— 呼叫端靠它走一位元不差的舊路徑。
 * ⚠️ 判斷的是**效果**不是**有沒有這個 key**:`{ yawDeg: 0 }` 也是恆等。
 */
export function orientIsIdentity(o: VfxOrient | undefined): boolean {
  if (!o) return true;
  return (
    (o.yawDeg ?? 0) === 0 &&
    (o.pitchDeg ?? DEFAULT_PITCH_DEG) === DEFAULT_PITCH_DEG &&
    (o.swirlDegPerSec ?? 0) === 0
  );
}

/**
 * 把一個**局部**向量轉到世界座標。`v` 會被原地改寫並回傳(粒子路徑一幀跑幾十次,
 * 不配置新物件)。
 */
export function orientDirection(v: Vec3, o: VfxOrient | undefined): Vec3 {
  const yaw = (o?.yawDeg ?? 0) * DEG;
  const tilt = (DEFAULT_PITCH_DEG - (o?.pitchDeg ?? DEFAULT_PITCH_DEG)) * DEG;
  // Rx(tilt):把局部 +Y 往 +Z 倒。tilt = 0 → 不動(直立)。
  const cx = Math.cos(tilt);
  const sx = Math.sin(tilt);
  const y1 = v.y * cx - v.z * sx;
  const z1 = v.y * sx + v.z * cx;
  // Ry(yaw):在水平面上轉到方位角。
  // ⚠️ x 要先存起來 —— 兩行都讀它,先寫回去第二行就拿到轉過的值了。
  const x0 = v.x;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  v.x = x0 * cy + z1 * sy;
  v.y = y1;
  v.z = -x0 * sy + z1 * cy;
  return v;
}

/** 這個發射器的**軸**在世界座標的方向(局部 +Y 轉出來的那一條)。 */
export function orientAxis(o: VfxOrient | undefined): Vec3 {
  return orientDirection({ x: 0, y: 1, z: 0 }, o);
}

/**
 * 龍捲風的「旋轉」—— 把**切線速度**加進一顆粒子的初始方向。
 *
 * 粒子生在離軸 `r` 的地方,繞軸以 ω(度/秒)轉,切線速度就是 ω·r(世界單位/秒)。
 * 切線方向 = 軸 × 徑向。⛔ 不是「隨機亂噴」也不是雜訊貼圖 —— 它是一個由參數決定
 * 的量,所以同一段程式換個 ω 就是另一支技能。
 *
 * `dir` 原地改寫。`radial` 是粒子生成點**減掉發射器位置**的世界向量。
 * 徑向長度為 0(正好生在軸上)時沒有切線可言,原樣回傳。
 */
export function addSwirl(dir: Vec3, radial: Vec3, axis: Vec3, swirlDegPerSec: number): Vec3 {
  if (swirlDegPerSec === 0) return dir;
  // 只取徑向中**垂直於軸**的那一段,否則沿軸的位移會污染半徑。
  const along = radial.x * axis.x + radial.y * axis.y + radial.z * axis.z;
  const px = radial.x - axis.x * along;
  const py = radial.y - axis.y * along;
  const pz = radial.z - axis.z * along;
  const r = Math.sqrt(px * px + py * py + pz * pz);
  if (r < 1e-6) return dir;
  // 切線 = 軸 × 徑向(已正規化)
  const tx = axis.y * pz - axis.z * py;
  const ty = axis.z * px - axis.x * pz;
  const tz = axis.x * py - axis.y * px;
  const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tl < 1e-6) return dir;
  const speed = swirlDegPerSec * DEG * r;
  dir.x += (tx / tl) * speed;
  dir.y += (ty / tl) * speed;
  dir.z += (tz / tl) * speed;
  return dir;
}
