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

/**
 * 輪廓形狀。⛔ 封閉 enum —— 加一個要同時加在 schema、`profileInset`、與說明文字。
 *
 * 前五個是通用波形，後五個是**動漫母題**（owner 2026-08-14：
 * 「2d 圖風格是日本動漫風格喔 因為這個遊戲本身就是日本動漫大亂鬥的主題」）。
 */
export type BackdropProfile =
  | "flat"
  | "towers"
  | "peaks"
  | "shards"
  | "waves"
  | "cloudSea"
  | "sakura"
  | "torii"
  | "pagoda"
  | "lightning";

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
 * 用**歸一化**的 `t = (k mod segments) / segments` 取一個「第幾瓣」的索引。
 *
 * ⚠️ 一定要 `% lobes`：`t = 1` 時 `floor(t·L)` 是 `L`（越界），而那一格就是
 * 12 點鐘方向那道縫。⛔ 這不是防禦性寫法，是這裡唯一會裂開的地方。
 */
function lobeIndex(t: number, lobes: number): number {
  return ((Math.floor(t * lobes) % lobes) + lobes) % lobes;
}

/**
 * 第 `k` 段的外緣**縮進量**，回傳 [0,1]：0 = 頂到 `toRadius`，1 = 縮回 `fromRadius`。
 *
 * ⚠️ 每一種 profile 都必須是 `k` 的**週期函式**（`k = segments` 要接回 `k = 0`），
 * 否則環帶會在 12 點鐘方向裂開一道縫。守衛 `backdrop.test.ts` 逐個 profile 在守。
 *
 * ## ⭐ 後半段五個是**動漫母題**（owner 2026-08-14）
 *
 * > 「記得 2d 圖風格是日本動漫風格喔 因為這個遊戲本身就是日本動漫大亂鬥的主題」
 *
 * 前五個（flat／towers／peaks／shards／waves）是**通用**的訊號波形，
 * 後五個是**認得出來的東西**：鳥居、五重塔、櫻花樹冠、雲海、稻妻。
 * ⚠️ 這個差別是重點 —— 動漫背景的辨識度來自**剪影**，不是來自顏色。
 * 一條正弦波塗成粉紅色不會變成櫻花，它只是一條粉紅色的正弦波。
 *
 * ⚠️ **誠實一點**：這是從很陡的俯角看到的**平面剪影帶**，不是一張畫。
 * 它給的是「那邊有一排鳥居／一片雲海」的**讀感**，⛔ 不是一張能單獨拿出來看的
 * 背景畫。真的要畫的話 schema 該多一格貼圖路徑 —— 那是另一張單。
 * （前例：task #93 的烤雞煙火，剪影辨識度改了 7 輪。）
 */
export function profileInset(
  profile: BackdropProfile,
  k: number,
  segments: number,
  seed: number,
): number {
  const t = ((k % segments) + segments) % segments / segments;
  switch (profile) {
    case "flat":
      return 0;
    // ⚠️ towers / peaks 以前是 `k % 4` / `k % 6`，那**會裂開**：`segments` 不是
    //    週期的倍數時（例如 peaks @ 40 段，40 mod 6 = 4），`k = segments` 算出來
    //    的值不等於 `k = 0`，環帶就在 12 點鐘方向開一道縫。⛔ 而且它是**內容**
    //    決定的（作者填幾段），所以出貨的 frieren 真的裂了一條而沒有人會發現。
    //    現在跟動漫母題一樣走 `lobeIndex`：瓣數固定，`segments` 純粹是解析度。
    case "towers": {
      // 方波：一段高一段低 —— 城垛／屋頂天際線。
      return lobeIndex(t, 12) % 2 === 0 ? 0 : 1;
    }
    case "peaks": {
      // 三角波 —— 山稜線。
      const i = lobeIndex(t, 12);
      return i <= 6 ? i / 6 : (12 - i) / 6;
    }
    case "shards":
      // 逐段獨立的雜湊 —— 碎裂的岩塊／漂浮的殘骸。
      return noise01(seed, k % segments);
    case "waves":
      // 正弦 —— 起伏的丘陵。
      return (1 - Math.cos(t * Math.PI * 2 * 3)) / 2;

    // ── 動漫母題 ──────────────────────────────────────────────────────────
    case "cloudSea": {
      // ⛩ 雲海。動漫的雲**不是**正弦波：它是一連串**渾圓的瓣**，
      // 瓣與瓣之間收得很緊 ⇒ 用 |sin| 而不是 sin，谷底才會是尖的收口。
      const lobes = 7;
      return 1 - Math.abs(Math.sin(t * Math.PI * lobes));
    }
    case "sakura": {
      // 🌸 櫻花樹冠。雲海的密集版 + 每一瓣大小不一（樹不會等距）。
      const lobes = 13;
      const amp = 0.55 + 0.45 * noise01(seed, lobeIndex(t, lobes));
      return 1 - Math.abs(Math.sin(t * Math.PI * lobes)) * amp;
    }
    case "torii": {
      // ⛩ 一整排鳥居：兩根柱子頂到最外緣，中間的開口凹進去。
      // ⚠️ 柱子要**窄**（6 瓣裡只佔 2 瓣）—— 寬的話就變回 towers 了。
      const lobes = 6;
      switch (lobeIndex(t, lobes)) {
        case 0:
          return 0; // 左柱
        case 1:
          return 0.18; // 笠木（橫樑，比柱子略退一點）
        case 4:
          return 0.18;
        case 5:
          return 0; // 右柱
        default:
          return 0.78; // 開口
      }
    }
    case "pagoda": {
      // 🏯 五重塔：階梯狀往上收再往下 —— 逐層屋簷。
      const lobes = 8;
      return [0, 0, 0.32, 0.32, 0.66, 0.66, 0.32, 0.32][lobeIndex(t, lobes)]!;
    }
    case "lightning": {
      // ⚡ 稲妻：不對稱的鋸齒，落差比 peaks 陡得多。
      const lobes = 9;
      const frac = t * lobes - Math.floor(t * lobes);
      // 前 30% 急升、後 70% 緩降 —— 對稱的鋸齒讀起來是山，不是電。
      return frac < 0.3 ? 1 - frac / 0.3 : (frac - 0.3) / 0.7;
    }
  }
}

/** 第 `k` 段的外緣半徑（世界單位）。⭐ 本體與逆光邊緣**共用它**，所以兩者永遠對齊。 */
function outerRadiusAt(
  layer: BackdropLayerSpec,
  k: number,
  segments: number,
  boundaryRadius: number,
  seed: number,
): number {
  const r0 = layer.fromRadius * boundaryRadius;
  const span = Math.max(0, layer.toRadius * boundaryRadius - r0);
  const jitter = Math.min(1, Math.max(0, layer.jitter));
  return r0 + span * (1 - jitter * profileInset(layer.profile, k, segments, seed));
}

/**
 * 把一層背景算成三角形帶。
 *
 * 幾何：內緣是**正圓**（`fromRadius`），外緣照 profile 起伏。
 * ⭐ 內緣是正圓是刻意的 —— 相鄰兩層才咬得住，中間不會露出黑色的縫。
 *
 * @param boundaryRadius 場地邊界半徑；`fromRadius`/`toRadius` 是它的倍數。
 * @param rimWidth 傳了就改建**逆光邊緣**：貼著外緣、往內 `rimWidth` 個世界單位的
 *   一條窄帶。⛔ 不是另外算一次輪廓 —— 兩者共用 `outerRadiusAt`，
 *   所以邊緣不可能跟本體錯開（錯開一格就會露出一條浮空的亮線）。
 */
export function buildBackdropLayer(
  layer: BackdropLayerSpec,
  boundaryRadius: number,
  seed: number,
  rimWidth?: number,
): BackdropMesh {
  const segments = Math.max(3, Math.floor(layer.segments));
  const r0 = layer.fromRadius * boundaryRadius;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let k = 0; k < segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const outer = outerRadiusAt(layer, k, segments, boundaryRadius, seed);
    // 逆光邊緣的內緣**跟著外緣走**；本體的內緣是正圓。
    // ⚠️ 夾在 r0 以上 —— 輪廓凹到底的那幾段（inset = 1）外緣就等於 r0，
    //    不夾的話那條窄帶會伸到場地地板底下去。
    const inner = rimWidth === undefined ? r0 : Math.max(r0, outer - rimWidth);
    positions.push(inner * cos, layer.y, inner * sin, outer * cos, layer.y, outer * sin);
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
