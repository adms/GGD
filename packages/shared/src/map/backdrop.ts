/**
 * 圓盤外的 2D 景深背景（GH#324 第三層 —— owner 2026-08-14）。
 *
 * > 「圓盤外的世界 可以生成多張 2D 有景深的景色圖形來顯示補空
 * >  （許多遊戲也採用這個方式填補場景外的空缺）」
 *
 * ## ⚠️ 先量鏡頭，再決定形狀 —— 天空盒在這個遊戲裡是**看不到的**
 *
 * 攝影機俯角 68°（`CameraRig.CAMERA_PITCH_RAD`），Babylon 預設垂直 FOV ≈ 45.8°
 * ⇒ **畫面最上緣**是水平線**下方 45.1°**（68 − 22.9）。
 * ⛔ 地平線永遠不進畫面 ⇒ 一面立起來的天空盒／遠景牆**一個像素都看不到**。
 *
 * 所以「圓盤外」看得到的東西**只有地板平面**，而且是從很陡的角度往下看。
 * ⭐ 這正好就是 2D 景深圖的用法：**一層一層攤平的環帶**，
 * 越外圈越低、越暗 —— 從上往下看就是一個往下塌陷的深淵／浮島群。
 *
 * ```
 *        （攝影機在南邊高處，往北俯視 68°）
 *   ┌───────────────────────────────────────┐
 *   │ ▒▒▒▒ 第 3 層 y=-24 最暗（最外、最深）  │
 *   │  ▒▒▒ 第 2 層 y=-12                    │
 *   │   ░░ 第 1 層 y=-4                     │
 *   │    ██ 場地地板 y=0（玩家在這裡）       │
 *   └───────────────────────────────────────┘
 * ```
 *
 * ## ⭐ `y ≤ 0` 不是美術偏好，是**遮擋的結構性保證**
 *
 * 一條「攝影機眼睛 → 英雄頭頂」的視線，兩端的 y 分別是 9.3–83 與 1.7，
 * 所以**整條線段的 y 都 ≥ 1.7**。背景層的 y 上界是 **0** ⇒
 * ⭐ **它在幾何上不可能落在任何一條視線上。**
 *
 * ⛔ 這比「加一條檢查」強：`occludesPlayArea` 那一套是**檢查**，會被新的內容繞過；
 * schema 的 `.max(0)` 是**閘**。task #218 的教訓正是「一個相機保證依賴內容狀態」
 * —— 刪掉某張圖的 pillar decor 就靜靜地重新武裝了遮擋 bug。
 *
 * ## ⭐ 「生成多張」＝ 一個產生器 × 一張參數表（第零守則⑨）
 *
 * ⛔ **不是 N 張手畫的圖。** 輪廓由 `(profile, seed, segments, jitter)` 決定，
 * 其中 seed 從**地圖 id 的雜湊**來 ⇒ 七張圖天生七個樣子，⛔ 不用畫七張。
 * profile 是**封閉 enum**（跟 4 個版面模板同一個理由）——
 * ⛔ 「為某一張圖寫一個 if」就越線了（第〇·五守則）。
 *
 * ## ⚠️ 決定性
 *
 * ⛔ 零 `Math.random`。`shards` 的亂數是 `(seed, k)` 的整數雜湊 ——
 * 同一份文件在伺服器、客戶端、編輯器算出**逐位元組相同**的頂點。
 * ⚠️ 這個檔在 `map/` 不在 `sim/`，所以三角函式是合法的（`sim/purity.test.ts`
 * 掃的是 `sim/**` 的原始碼文字，見 `unitCircle.ts` 的檔頭）。
 */

/** 輪廓形狀。⛔ 封閉 enum —— 加一個要同時加在 schema、這裡、與說明文字。 */
export type BackdropProfile = "flat" | "towers" | "peaks" | "shards" | "waves";

export interface BackdropLayerSpec {
  /** 內緣半徑，**場地邊界半徑的倍數**（1 = 貼著邊界）。 */
  fromRadius: number;
  /** 外緣半徑（同上）。⚠️ 必須 > fromRadius。 */
  toRadius: number;
  /** 這一層的高度。⛔ 上界是 0 —— 理由見檔頭「結構性保證」。 */
  y: number;
  /** 外緣輪廓。 */
  profile: BackdropProfile;
  /** 輪廓起伏幅度。0 = 平滑的環；1 = 外緣可以一路凹回內緣。 */
  jitter: number;
  /** 圓周切幾段 ＝ 輪廓有幾個「齒」。 */
  segments: number;
}

/** 一層算出來的平面幾何。⛔ 純數字，這一層不認識 Babylon。 */
export interface BackdropMesh {
  /** `[x0,y0,z0, x1,y1,z1, …]`，以場地中心為原點。 */
  positions: number[];
  /** 三角形索引。 */
  indices: number[];
}

/**
 * 字串 → 32 bit 種子（FNV-1a）。
 *
 * ⚠️ 用 `Math.imul` 而不是 `*`：32 bit 乘法在 double 上會**溢位到浮點**，
 * 於是同一個 id 在不同 JS 引擎可能算出不同的數 —— 那會讓「客戶端與編輯器看到
 * 同一張圖」這件事無聲地失效。
 */
export function backdropSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** `(seed, k)` → [0,1)。整數雜湊，⛔ 不是 `Math.random`。 */
function noise01(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

/**
 * 第 `k` 段的外緣**縮進量**，回傳 [0,1]：0 = 頂到 `toRadius`，1 = 縮回 `fromRadius`。
 *
 * ⚠️ 每一種 profile 都必須是 `k` 的**週期函式**（`k = segments` 要接回 `k = 0`），
 * 否則環帶會在 12 點鐘方向裂開一道縫。
 */
export function profileInset(
  profile: BackdropProfile,
  k: number,
  segments: number,
  seed: number,
): number {
  switch (profile) {
    case "flat":
      return 0;
    case "towers": {
      // 方波：一段高一段低 —— 城垛／屋頂天際線。週期 4 段。
      const phase = ((k % 4) + 4) % 4;
      return phase < 2 ? 0 : 1;
    }
    case "peaks": {
      // 三角波 —— 山稜線。週期 6 段。
      const phase = ((k % 6) + 6) % 6;
      return phase <= 3 ? phase / 3 : (6 - phase) / 3;
    }
    case "shards":
      // 逐段獨立的雜湊 —— 碎裂的岩塊／漂浮的殘骸。
      return noise01(seed, k % segments);
    case "waves": {
      // 正弦 —— 起伏的雲海／丘陵。⚠️ 用 k/segments 保證接得回去。
      const t = (k % segments) / segments;
      return (1 - Math.cos(t * Math.PI * 2 * 3)) / 2;
    }
  }
}

/**
 * 把一層背景算成三角形帶。
 *
 * 幾何：內緣是**正圓**（`fromRadius`），外緣照 profile 起伏。
 * ⭐ 內緣是正圓是刻意的 —— 相鄰兩層才咬得住，中間不會露出黑色的縫。
 *
 * @param boundaryRadius 場地邊界半徑；`fromRadius`/`toRadius` 是它的倍數。
 */
export function buildBackdropLayer(
  layer: BackdropLayerSpec,
  boundaryRadius: number,
  seed: number,
): BackdropMesh {
  const segments = Math.max(3, Math.floor(layer.segments));
  const r0 = layer.fromRadius * boundaryRadius;
  const r1 = layer.toRadius * boundaryRadius;
  const span = Math.max(0, r1 - r0);
  const jitter = Math.min(1, Math.max(0, layer.jitter));

  const positions: number[] = [];
  const indices: number[] = [];

  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const outer = r0 + span * (1 - jitter * profileInset(layer.profile, k, segments, seed));
    // 每段兩個頂點：內、外。
    positions.push(r0 * cos, layer.y, r0 * sin, outer * cos, layer.y, outer * sin);
  }
  for (let k = 0; k < segments; k++) {
    const i0 = k * 2;
    const i1 = i0 + 1;
    const j0 = ((k + 1) % segments) * 2;
    const j1 = j0 + 1;
    // ⚠️ 繞序要讓法線朝 +Y（從上面看得到）—— 反了就整層消失，
    //    而且**畫面上跟「沒做」長得一模一樣**（失敗形態①）。
    indices.push(i0, j0, i1, i1, j0, j1);
  }

  return { positions, indices };
}
