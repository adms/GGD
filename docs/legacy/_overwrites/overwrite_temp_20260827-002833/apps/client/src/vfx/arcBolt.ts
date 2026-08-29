/**
 * arcBolt —— 「**一段電弧：從 A 打到 B**」的 PURE 幾何 + 參數表。
 *
 * ---------------------------------------------------------------------------
 * 這是**機制**，不是某一支技能
 * ---------------------------------------------------------------------------
 * CLAUDE.md 第〇·五守則：引擎做機制、JSON 做技能，⛔「為某支技能寫一個 if」
 * 就是越線。所以這個檔案裡**沒有**「連鎖閃電」四個字的邏輯 —— 它只知道
 * 「兩個世界座標之間長出一條會抖的亮線」。
 *
 * 一條鏈 = 呼叫端**逐跳各請求一段**：hop1 = strike(A,B)、hop2 = strike(B,C)…
 * 每一段自己有出生時間與壽命，所以「每個閃電有極小的時間間隔播放」是
 * **呼叫端排程出來的**，⛔ 不是這裡寫死的一段時間軸。同一個單元也直接服務
 * 「鎖鏈/電纜/牽引光束/雷擊補刀」這些同型的東西 —— 第二個只差參數，
 * 所以它不該是第二段程式（第零守則⑨）。
 *
 * ---------------------------------------------------------------------------
 * 為什麼弧帶是**躺平在 XZ 平面**的
 * ---------------------------------------------------------------------------
 * 戰鬥相機的俯角是 68°（`CAMERA_PITCH_RAD`），也就是視線離地板法線只有 22°。
 * 一條**直立**的帶子（`ribbonMath.buildRibbonPaths` 的世界-up 慣例，武器殘影
 * 用的那個）在這個角度會被壓成一條幾乎沒有面積的線；躺平的帶子則保有
 * cos(22°) ≈ 93% 的投影面積，等於幾乎正對鏡頭。這與地面痕跡 / 預告圈選擇
 * 躺平是同一個理由，⛔ 不是美術偏好。
 *
 * ⚠️ 高度（`y`）仍然是**逐點**的：`jitterY` 讓每一節上下歪一點，弧才不會看起來
 * 像貼在地板上的一條膠帶。
 *
 * ---------------------------------------------------------------------------
 * 隨機是**決定性**的
 * ---------------------------------------------------------------------------
 * `arcNoise` 是一個整數雜湊，⛔ 不是 `Math.random`。同一顆 seed 永遠長出同一條
 * 弧，所以 (a) 這個檔案可以被純測試釘住，(b) 重播同一場比賽畫面一樣，
 * (c) 渲染迴圈裡沒有 RNG（`GroundDecalPool` 的黃金角自旋是同一個立場）。
 */
import type { VfxBlendMode } from "@ggd/shared/content";
import { hotToCoolStops, type ColorStop, type Rgb } from "./vfxPresets";
import { sampleColorStops, type Vec3Triple } from "./ribbonMath";
import { DEFAULT_CAST_ARCS, DEFAULT_MAX_CONCURRENT_ARCS } from "@ggd/shared/content/schema/vfx";

/** 世界座標的一端（電弧兩頭都是點，⛔ 不是實體 —— 實體會死掉，點不會）。 */
export interface ArcEnd {
  x: number;
  y: number;
  z: number;
}

/** 折線上的一個節點。與 `ribbonMath` 共用同一個三元組型別。 */
export type ArcPoint = Vec3Triple;

/** 一段弧的完整參數。**每一個數字只住在這裡一份**。 */
export interface ArcBoltSpec {
  /** 折線段數（節點數 = segments + 1） */
  segments: number;
  /** 側向抖動幅度，佔兩端**水平**距離的比例 */
  jitter: number;
  /** 垂直抖動幅度，world units */
  jitterY: number;
  /** 弧帶半寬，world units */
  halfWidth: number;
  /** 一段弧的壽命（ms）。一跳一閃 —— 這個數字短到會讓人以為是錯字，是故意的 */
  lifeMs: number;
  /** 亮度維持在峰值的比例，之後才開始掉 */
  holdT: number;
  /** 分岔數（每一岔就是**另一段弧**，同一個單元） */
  forks: number;
  /** 分岔長度佔主幹全長的比例 */
  forkLength: number;
  /**
   * ⚡ **折線每秒重算幾次**（owner 2026-08-23 的參考圖：WoW 的鏈式閃電）。
   *
   * 0 = 這一段弧出生時抖一次就定住（`ArcBoltFx` 在這一格出現之前的行為）。
   * > 0 = 活著的每一格時間窗各換一顆種子重算整條折線 ⇒ 它在**抖**，
   * 而那正是「電」與「一條畫好的亮線」在畫面上的差別。
   *
   * ⛔ 不是 `Math.random`：步數由 `arcRejitterStep(age)` 算出來，種子是
   * `seed + step`，所以同一場重播長出同一串折線（見檔頭「隨機是決定性的」）。
   */
  rejitterHz: number;
  /**
   * 弧帶**橫向**的白熱核心佔半寬的比例（0..1）—— 沿線發光貼圖的唯一參數。
   *
   * 這是 owner 說的「特效貼圖」那一層：一條等亮度的帶子讀起來是**膠帶**，
   * 中間白熱、邊緣拖著輝光才讀得出「光」。⛔ 它是**空間**的漸層，
   * 與 `stops`（**時間**的 ramp）是兩件不同的事，兩個都要才像閃電。
   */
  glowCoreT: number;
  /** 顏色 ramp（白熱 → 本色 → 冷卻 → 沒了） */
  stops: ColorStop[];
  blend: VfxBlendMode;
}

/**
 * ⭐ **參數表 —— 這一族視覺的唯一數字來源。**
 *
 * 渲染程式（`ArcBoltFx`）裡**一個數字都沒有**：它拿到的是一份 `ArcBoltSpec`。
 * 呼叫端可以逐次覆寫任何一格（`arcBoltSpec(tint, { halfWidth, forks, … })`），
 * 所以「粗一點 / 短一點 / 多兩岔」不需要改程式。
 *
 * ⚠️ 這一格**還不是**後台欄位：`config.vfx-families@1` 的 Zod schema 住在
 * `packages/shared`，不在這條 lane 裡。⛔ 所以上面那句話講的是「呼叫端可調」，
 * ⛔ 不是「後台可調」—— 第一·五守則：不寫做不到的事。要把它接上後台，
 * 加一格 schema 欄位然後把它折進 `arcBoltSpec` 的 `opts` 即可，
 * ⛔ 不必動 `ArcBoltFx`。
 */
export const ARC_BOLT_TUNING = {
  segments: 8,
  jitter: 0.11,
  jitterY: 0.16,
  halfWidth: 0.085,
  lifeMs: 130,
  holdT: 0.35,
  forks: 2,
  forkLength: 0.22,
  // ⚡ 30 Hz —— 一段 130ms 的弧會被重算約 4 次。⛔ 不是每一幀（144Hz 螢幕上
  // 那會變成一團噪訊而不是閃電），也⛔ 不是 0（那是一條畫好的亮線）。
  rejitterHz: 30,
  // 白熱核心佔半寬的 34%,其餘是外圍輝光。
  glowCoreT: 0.34,
  blend: "additive" as VfxBlendMode,
};

/** 元素本色。白熱的核心由 `hotToCoolStops` 自己疊出來，⛔ 不在這裡調白。 */
export const ARC_TINTS = {
  lightning: [0.62, 0.82, 1],
  holy: [1, 0.94, 0.7],
  fire: [1, 0.58, 0.24],
  arcane: [0.76, 0.6, 1],
} as const satisfies Record<string, Rgb>;

// ═══════════════════════════════════════════════════════════════════════════
//  ⚡⚡ 施法電弧 —— 「電系技能施法時，除了粒子之外**再打一道真的電弧**」
// ═══════════════════════════════════════════════════════════════════════════
//
// owner 2026-08-23（逐字）：
// > 「你需要**認真找一個演算法以及特效貼圖**來做出閃電的效果 一堆閃電特效
// >   如**皮卡丘 飛鼠先生 雷神之槌** 等雷電特效 **都沒有真的出現**」
//
// ── 上一輪修好的只有「鏈」那一種 ──────────────────────────────────────────
// `chainLightning` 那條線在 2026-08-23 已經接上了，但它只有**兩支**技能在用
// （`grep -l chainLightning content/abilities/`：86-04 打雷絕招 / 65-04 天譴
// ＝**飛鼠先生**）。而帶著 `fx.prim.lightning.*` 的技能有 **28 支** ——
// 那 28 支的「閃電」逐字只是一份**粒子預設**，而粒子做不出「一道有分岔的
// 鋸齒電弧」。⇒ 皮卡丘（58-xx / `godie-ofar`）與雷神之槌（15-01 雷神槍
// 「巨神殺手」）到今天為止仍然沒有電弧。
//
// ── 為什麼這是一條**家族規則**，⛔ 不是 26 份 JSON ────────────────────────
// ⭐ 第〇·五守則：引擎做機制、⛔「為某支技能寫一個 if」就是越線。
//    26 個 `if`、或 26 份各自填一格的 JSON，都是同一件事抄 26 次。
// ⭐ 而且**那 26 份有 8 份改不動**：`godie-emfr.*`（雷神之槌！）/ `godie-e00w.*`
//    / `godie-edem.*` / `godie-e00r.*` 是 `tools/skill-remake/batch1.py` 的
//    **產物**（`--check` 逐位元組比對，手改會在下一次 `skills:sync` 被無聲覆寫）。
//    ⇒ 走 JSON 那條路，owner 點名的三個例子裡**最主要的那一個永遠修不好**。
//
// ⇒ 規則掛在**已經存在的命名慣例**上：`fx.prim.<element>.<shape>`。
//   ⭐ 這不是我發明的鍵 —— `sim/abilities/abilitySystem.ts` 的 emit 註解逐字
//   寫著它把 `vfxKey` 送上線就是為了讓客戶端「play the ELEMENT whoosh
//   (fire/ice/lightning)」。**音效那一層早就照這個 token 路由了**，
//   視覺這一層照同一個 token 路由，⛔ 不是第二套判斷。
//
// ── 一張表，兩個模板（第零守則⑨：N 個同型 = K 個模板 + 一張表） ──────────
//   · `strike` —— 施法者 → 落點的一道（`beam` / `bolt` / `slash` / `dash`）
//   · `burst`  —— 從身上往外炸開的 N 道（`nova` / `explosion` / `pulse`）
// 出貨盤點（2026-08-23 量的，⛔ 不是估的）：28 支裡**形狀 token** 是 strike 的
// 有 16 支、burst 的 12 支；再套下面那條「自身型沒有落點就退回 burst」之後，
// **實際畫出來是 strike 11 支 / burst 17 支**。⛔ 沒有第三種。

/** 一種施法電弧的完整參數。**每一個數字只住在這張表一份**。 */
export interface ArcCastShape {
  /** `strike` = 施法者 → 落點的一道；`burst` = 從中心往外炸開的 N 道 */
  mode: "strike" | "burst";
  /** `burst` 打幾道（`strike` 恆為 1） */
  count: number;
  /** `burst` 每一道有多長（world units）；`strike` 用不到（它的長度是落點決定的） */
  reach: number;
  /** 這一族的粗細／分岔強度（餵給 `arcBoltSpec` 的 `power`） */
  power: number;
  /** 每一道的分岔數。⚠️ `burst` 壓低 —— N 道 ×(1 + 分岔) 會吃光弧帶池（`MAX_ARC_STRIPS`） */
  forks: number;
}

/**
 * ⭐ **形狀 token → 一種電弧。** 出貨的 `fx.prim.lightning.*` 只有這七個字根
 * （`beam` `bolt` `slash` `dash` `nova` `explosion` `pulse`），⛔ 表以外的字根
 * 不畫電弧 —— 沉默地猜一個模式，等於在畫面上加一個沒有人決定過的東西。
 */
export const ARC_CAST_SHAPES: Readonly<Record<string, ArcCastShape>> = {
  beam: { mode: "strike", count: 1, reach: 0, power: 1.25, forks: 2 },
  bolt: { mode: "strike", count: 1, reach: 0, power: 1.5, forks: 3 },
  slash: { mode: "strike", count: 1, reach: 0, power: 1, forks: 1 },
  dash: { mode: "strike", count: 1, reach: 0, power: 0.9, forks: 1 },
  nova: { mode: "burst", count: 6, reach: 2.4, power: 1, forks: 1 },
  explosion: { mode: "burst", count: 8, reach: 3, power: 1.2, forks: 1 },
  pulse: { mode: "burst", count: 5, reach: 1.6, power: 0.85, forks: 0 },
};

/**
 * `-lg` / `-sm` 這一層**只縮放強度與長度**，⛔ 不改模式。
 * 表以外的後綴（出貨有一個 `beam-flat`）= 1 ＝ 不縮放，⛔ 不是「不畫」。
 */
export const ARC_CAST_SIZES: Readonly<Record<string, number>> = { lg: 1.35, sm: 0.7 };

/**
 * ⭐ **哪些元素會長出電弧** —— 出貨只開 `lightning` 一列。
 *
 * ⚠️ `ARC_TINTS` 有四個顏色，但「有顏色」⛔ 不等於「該畫弧」：把 `holy` 打開
 * 會一次改掉上百支技能的畫面，而 owner 這一票問的是**閃電**。
 * ⭐ 之後要開一族（鎖鏈／牽引／聖光落雷）就是**加一列**，⛔ 不必動任何程式。
 */
export const ARC_CAST_ELEMENTS: Readonly<Record<string, Rgb>> = {
  lightning: ARC_TINTS.lightning,
};

/**
 * `strike` 的落點太近時，那一道弧的長度趨近 0 —— 畫面上是一個亮點，
 * 讀不出「閃電」。低於這條線就退回 `burst`（從身上炸開）。
 * ⚠️ 這條線是**必要的**：出貨有 `castType: "ground"` 而 `range: 0` 的技能
 * （86-04 打雷絕招），它的落點就是施法者自己。
 */
/**
 * ⚡ 施法電弧的**總開關**（`config.vfx-families@1.castArcs`，GH#571）。
 *
 * ⭐ 樣板逐字照 `vfx/oneShotLife.ts::setOneShotMaxLifeSec` —— 由
 * `ContentDb.load()` 呼叫，所以**後台存檔 → 下一次載入內容就生效**，
 * ⛔ 不必重建映像（`content/` 是 live bind-mount）。
 *
 * ⚠️ 它擋的是**要不要有這個機制**，⛔ 不是品質降級（那是 `AdaptiveQuality`）。
 * 轉成 `false` ⇒ 28 支雷電技能逐位元組回到 2026-08-23 之前。
 */
let arcCastEnabled: boolean = DEFAULT_CAST_ARCS;

export function setCastArcsEnabled(v: boolean | undefined): void {
  arcCastEnabled = v ?? DEFAULT_CAST_ARCS;
}

export function castArcsEnabled(): boolean {
  return arcCastEnabled;
}

export const ARC_CAST_MIN_STRIKE_LEN = 0.6;

/** `strike` 退回 `burst` 時用的長度／道數 —— 自身型的「電流爬滿全身」。 */
export const ARC_CAST_SELF_REACH = 1.8;
export const ARC_CAST_SELF_COUNT = 5;

/** 一次施法要打的**一段**弧（世界座標 + 這一段自己的參數）。 */
export interface ArcCastRequest {
  from: ArcEnd;
  to: ArcEnd;
  tint: Rgb;
  power: number;
  forks: number;
  seed: number;
}

/**
 * `fx.prim.<element>.<shape>[-<size>]` → 三個 token。
 *
 * ⛔ 其他任何命名一律回 `null`（w3x 匯入的 `fx.w3x.particle.*`、手寫的
 * `fx.ember-bolt`…）—— 猜一個元素出來畫弧，就是在畫面上加一個沒有來源的東西。
 */
export function parsePrimFxKey(
  key: string | null | undefined,
): { element: string; shape: string; size: string | null } | null {
  if (!key) return null;
  const p = key.split(".");
  if (p.length !== 4 || p[0] !== "fx" || p[1] !== "prim") return null;
  const element = p[2]!;
  const token = p[3]!;
  const dash = token.indexOf("-");
  if (!element || !token) return null;
  return dash < 0
    ? { element, shape: token, size: null }
    : { element, shape: token.slice(0, dash), size: token.slice(dash + 1) };
}

/**
 * 從一個中心往外的 N 個端點 —— `burst` 的幾何。
 *
 * ⭐ **均分一圈再各自抖一點**，⛔ 不是「N 顆雜湊當方向」：純雜湊會結塊，
 * 而結塊的放電讀起來是「往那邊噴了一坨」而不是「電流炸開」。
 * 三角函數在這裡是合法的 —— 這是**客戶端**（`sim/purity.test.ts` 管的是
 * `packages/shared/src/sim/**`），而電弧的幾何本來就全部在客戶端算。
 */
export function arcRadiateEnds(
  centre: ArcEnd,
  count: number,
  reach: number,
  seed: number,
): ArcEnd[] {
  const n = Math.max(1, Math.floor(count));
  const out: ArcEnd[] = new Array<ArcEnd>(n);
  for (let i = 0; i < n; i++) {
    // 均分 + 半格以內的抖動 ⇒ 每一道都落在自己的扇區裡，⛔ 不會兩道疊在一起
    const a = ((i + 0.5) / n + arcNoise(seed, i * 3 + 1) * (0.5 / n)) * Math.PI * 2;
    const r = reach * (0.72 + Math.abs(arcNoise(seed, i * 3 + 2)) * 0.28);
    out[i] = {
      x: centre.x + Math.cos(a) * r,
      y: centre.y + arcNoise(seed, i * 3 + 3) * ARC_BOLT_TUNING.jitterY * 2,
      z: centre.z + Math.sin(a) * r,
    };
  }
  return out;
}

/**
 * ⚡ **這一次施法要打哪幾道弧。** 純函數 —— 它不認識 Babylon、不認識技能，
 * 只認識「這次施法用到的那幾個 `vfxKey`、施法者在哪、落點在哪」。
 *
 * ⭐ **第一個認得的元素說了算**：一次施法最多**一組**弧。一支技能可以疊好幾層
 * 特效（15-01 雷神槍的主層是龍捲風、閃電在第二層），但兩組弧疊在同一個位置
 * 只是兩倍的網格與同一個畫面。
 */
export function arcCastPlan(
  keys: readonly (string | null | undefined)[],
  caster: { x: number; z: number },
  point: { x: number; z: number } | null | undefined,
  seed: number,
  bodyY: number,
): ArcCastRequest[] {
  // ⭐ 總開關（`config.vfx-families@1.castArcs`）。⛔ 閘在**這裡**而不是呼叫端：
  //    呼叫端只有一個今天，明天可能有第二個，而一個只擋住第一個入口的開關
  //    是一句「說了但不會發生」的宣稱（第一·五守則）。
  if (!arcCastEnabled) return [];
  for (const key of keys) {
    const p = parsePrimFxKey(key);
    if (!p) continue;
    const tint = ARC_CAST_ELEMENTS[p.element];
    const shape = ARC_CAST_SHAPES[p.shape];
    if (!tint || !shape) continue;
    const scale = (p.size !== null ? ARC_CAST_SIZES[p.size] : undefined) ?? 1;
    const power = shape.power * scale;
    const from: ArcEnd = { x: caster.x, y: bodyY, z: caster.z };
    if (shape.mode === "strike" && point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
      const d = Math.hypot(point.x - caster.x, point.z - caster.z);
      if (d >= ARC_CAST_MIN_STRIKE_LEN) {
        return [
          { from, to: { x: point.x, y: bodyY, z: point.z }, tint, power, forks: shape.forks, seed },
        ];
      }
    }
    // 落點不存在（self / dash）或太近（`range: 0`）⇒ 從身上炸開。
    // ⛔ 不是「不畫」——那正是 owner 回報的症狀（12 支自身型雷電技能一道弧都沒有）。
    const burst = shape.mode === "burst";
    const ends = arcRadiateEnds(
      from,
      burst ? shape.count : ARC_CAST_SELF_COUNT,
      (burst ? shape.reach : ARC_CAST_SELF_REACH) * scale,
      seed,
    );
    return ends.map((to, i) => ({ from, to, tint, power, forks: shape.forks, seed: seed + i + 1 }));
  }
  return [];
}

/** 逐次覆寫。`power` 是「這一段有多重」的單一旋鈕（粗細 + 分岔一起動）。 */
export interface ArcBoltOptions extends Partial<Omit<ArcBoltSpec, "stops">> {
  /** 整體強度，0.4–2（粗細與分岔數一起放大） */
  power?: number;
  /** ramp 峰值透明度 */
  peakAlpha?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 參數表 + 這一次的覆寫 → 一份 spec。 */
export function arcBoltSpec(tint: Rgb = ARC_TINTS.lightning, opts: ArcBoltOptions = {}): ArcBoltSpec {
  const t = ARC_BOLT_TUNING;
  const p = clamp(opts.power ?? 1, 0.4, 2);
  return {
    segments: Math.max(2, Math.floor(opts.segments ?? t.segments)),
    jitter: opts.jitter ?? t.jitter,
    jitterY: opts.jitterY ?? t.jitterY,
    halfWidth: (opts.halfWidth ?? t.halfWidth) * p,
    lifeMs: Math.max(1, opts.lifeMs ?? t.lifeMs),
    holdT: clamp(opts.holdT ?? t.holdT, 0, 0.95),
    forks: Math.max(0, Math.round(opts.forks ?? t.forks * p)),
    forkLength: opts.forkLength ?? t.forkLength,
    rejitterHz: Math.max(0, opts.rejitterHz ?? t.rejitterHz),
    glowCoreT: clamp(opts.glowCoreT ?? t.glowCoreT, 0.02, 0.98),
    blend: opts.blend ?? t.blend,
    stops: hotToCoolStops(tint, { peakAlpha: opts.peakAlpha ?? 1, hotT: 0.12 }),
  };
}

/**
 * ⚡ 這一刻該用**第幾顆**種子重算折線 —— 「它真的在抖」的那個時鐘。
 *
 * ⭐ 純函數、單調不減、⛔ 沒有 RNG：呼叫端把它加到 `seed` 上，於是同一段弧在
 * 不同的時間窗長出不同的折線，而**同一場重播的同一毫秒永遠長出同一條**。
 * `rejitterHz === 0` 恆回 0 ＝ 出生時抖一次就定住（這一格出現之前的行為）。
 */
export function arcRejitterStep(spec: ArcBoltSpec, ageMs: number): number {
  if (!(spec.rejitterHz > 0) || !(ageMs > 0)) return 0;
  return Math.floor((ageMs * spec.rejitterHz) / 1000);
}

/**
 * ⚡ **沿線發光貼圖** —— 一條 `size` 像素高的 RGBA 直條，v 軸橫跨弧帶的寬度。
 *
 * 中心是白熱（RGB 全 1、alpha 1），往兩邊掉到 0；`coreT` 決定核心有多寬。
 * ⭐ 回傳的是**位元組**，⛔ 不碰 Babylon —— 所以它測得起來（headless 沒有
 * canvas，`DynamicTexture` 在那裡要 stub，`RawTexture` 不用；同
 * `render/views/voxelSkinTexture.ts` 的立場）。
 *
 * ⚠️ alpha 通道是承重的那一個：材質走 `ALPHA_ADD`（`SRC_ALPHA, ONE`），
 * 所以邊緣的柔邊**只能**從 alpha 出來，⛔ 不是把 RGB 調暗（那樣邊緣仍然是
 * 一條硬邊，只是比較暗）。
 */
export function arcGlowRamp(size: number, coreT: number): Uint8Array {
  const n = Math.max(2, Math.floor(size));
  const core = coreT < 0.02 ? 0.02 : coreT > 0.98 ? 0.98 : coreT;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    // 0 在正中央、1 在兩緣
    const d = Math.abs((i + 0.5) / n - 0.5) * 2;
    let a: number;
    if (d <= core) {
      a = 1;
    } else {
      const k = 1 - (d - core) / (1 - core);
      a = k * k; // 二次衰減 = 外圍輝光,⛔ 不是線性(線性讀起來仍然是一條帶子)
    }
    // ⛔⛔ **柔邊烘進 RGB，⛔ 不是 alpha。**（2026-08-24，量到並拍到）
    //
    // 在這一行之前，RGB 是平的 255、形狀住在 **alpha** 裡，而材質把同一張圖
    // 掛成 `opacityTexture` ⇒ 一條 0.17 世界單位寬的弧在螢幕上只有幾個像素，
    // 而那幾個像素取樣到的 alpha 幾乎都在兩緣（≈0）⇒ **整族閃電一個像素都沒畫出來過**。
    // ⭐ 實測（`chain-lightning-audition.html`）：把 `opacityTexture` 拿掉的那一刻
    //    整片電網當場出現；把 UV 的 v 全部強制成 0.5（漸層正中央）也一樣
    //    ——亮像素 0 → 7,991、最大通道 44 → 255。
    // ⇒ 加法混合的亮度本來就由 **RGB** 決定：把形狀寫進 RGB、alpha 留滿，
    //   柔邊一樣在，⛔ 而且不再有「取樣到邊緣就整條消失」這個懸崖。
    const v = Math.round(255 * a);
    const o = i * 4;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
  return out;
}

/** 決定性雜湊 → [-1, 1)。⛔ 不是 `Math.random`（見檔頭）。 */
export function arcNoise(seed: number, i: number): number {
  let h = (Math.imul(seed | 0, 374761393) + Math.imul(i | 0, 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return h / 2147483648;
}

/**
 * A → B 的折線。
 *
 * ⭐ **兩端是精確的。** 中間的節點才抖（`sin(πt)` 讓抖動在中段最大、兩端歸零）——
 * 一條沒有打在目標身上的閃電，玩家讀到的是「這一跳沒中」，
 * 而那正是這個特效存在的目的的反面。
 */
export function buildArcPath(a: ArcEnd, b: ArcEnd, spec: ArcBoltSpec, seed: number): ArcPoint[] {
  const n = spec.segments;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  // XZ 平面上的法線 —— 側向位移就是玩家真正看得到的那個方向（見檔頭）
  const px = -dz / len;
  const pz = dx / len;
  const amp = len * spec.jitter;
  const out: ArcPoint[] = new Array<ArcPoint>(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = i === 0 || i === n ? 0 : Math.sin(Math.PI * t);
    const j = arcNoise(seed, i) * amp * taper;
    const jy = arcNoise(seed ^ 0x9e37, i) * spec.jitterY * taper;
    out[i] = [a.x + dx * t + px * j, a.y + dy * t + jy, a.z + dz * t + pz * j];
  }
  return out;
}

/**
 * 折線 → 躺平的弧帶（`CreateRibbon` 的兩條 path）。
 *
 * 每個節點的半寬沿著**局部切線的 XZ 法線**推開，兩端收窄成尖點 ——
 * 等寬的矩形帶讀起來是緞帶，不是閃電。
 */
export function arcStripPaths(
  points: readonly ArcPoint[],
  halfWidth: number,
): { left: ArcPoint[]; right: ArcPoint[] } {
  const n = points.length;
  const left: ArcPoint[] = new Array<ArcPoint>(n);
  const right: ArcPoint[] = new Array<ArcPoint>(n);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[i > 0 ? i - 1 : 0]!;
    const next = points[i < n - 1 ? i + 1 : n - 1]!;
    let tx = next[0] - prev[0];
    let tz = next[2] - prev[2];
    const m = Math.hypot(tx, tz) || 1e-6;
    tx /= m;
    tz /= m;
    const w = halfWidth * (i === 0 || i === n - 1 ? 0.15 : 1);
    left[i] = [p[0] - tz * w, p[1], p[2] + tx * w];
    right[i] = [p[0] + tz * w, p[1], p[2] - tx * w];
  }
  return { left, right };
}

/** 一條分岔：從主幹上的某一節點岔出去的**另一段弧**。 */
export interface ArcFork {
  from: ArcEnd;
  to: ArcEnd;
}

/**
 * 主幹 → 分岔清單。分岔一律從**內部**節點長出來（從端點岔會讓人以為那是主幹
 * 的續段，也就是把「打到誰」這個資訊弄糊）。方向由兩顆雜湊值正規化而來，
 * ⛔ 不需要三角函數，也⛔ 不需要 RNG。
 */
export function arcForks(points: readonly ArcPoint[], spec: ArcBoltSpec, seed: number): ArcFork[] {
  const k = spec.forks;
  if (k <= 0 || points.length < 3) return [];
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1e-6;
  const reach = len * spec.forkLength;
  const inner = points.length - 2;
  const out: ArcFork[] = [];
  for (let f = 0; f < k; f++) {
    const idx = 1 + Math.floor(Math.abs(arcNoise(seed + f * 7919, 101)) * inner) % inner;
    const p = points[idx]!;
    let ux = arcNoise(seed + f * 7919, idx * 3 + 1);
    let uz = arcNoise(seed + f * 7919, idx * 3 + 2);
    const m = Math.hypot(ux, uz) || 1e-6;
    ux /= m;
    uz /= m;
    const scale = 0.5 + Math.abs(arcNoise(seed + f * 7919, idx * 3 + 3)) * 0.5;
    out.push({
      from: { x: p[0], y: p[1], z: p[2] },
      to: {
        x: p[0] + ux * reach * scale,
        y: p[1] + arcNoise(seed + f * 7919, idx * 3 + 4) * spec.jitterY,
        z: p[2] + uz * reach * scale,
      },
    });
  }
  return out;
}

/**
 * 亮度隨壽命：**維持在峰值，然後啪一聲不見**。
 *
 * ⛔ 不是線性淡出 —— 電弧慢慢變暗會讀成「一道光」而不是「一次放電」，
 * 而 owner 要的正是「一跳一閃」的顆粒感。
 */
export function arcFade(t: number, holdT: number): number {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  if (t <= holdT) return 1;
  const k = (1 - t) / (1 - holdT || 1);
  return k * k;
}

/**
 * 這一刻該畫成什麼顏色 / 多亮。
 *
 * 回傳的 `rgb` 是 ramp 的顏色，`alpha` 已經把 ramp 自己的 alpha 與 `arcFade`
 * 乘在一起 —— 加法混合（`ALPHA_ADD` = `SRC_ALPHA, ONE`）只有 alpha 這個通道
 * 會縮放亮度，所以「消失」必須從這裡算出來，⛔ 不可以只把材質 alpha 設 0
 * 之外還指望 RGB 幫忙（`ribbonMath` 檔頭記錄的就是這條被踩過的線）。
 */
export function arcColorAt(spec: ArcBoltSpec, t: number): { rgb: Rgb; alpha: number } {
  const [r, g, b, a] = sampleColorStops(spec.stops, t);
  return { rgb: [r, g, b], alpha: a * arcFade(t, spec.holdT) };
}
