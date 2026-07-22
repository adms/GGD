/**
 * limits — THE BUDGET ITSELF, and the arithmetic that produced every number.
 *
 * The unit of concern is ONE FRAME (同一畫面), never the repository. A total
 * across 198 files is not a budget; what is simultaneously resident while the
 * player looks at the screen is. Every line below is therefore either
 *   (a) a per-scene cap on simultaneous residency, or
 *   (b) a per-import cap DERIVED from (a) divided by the worst-case number of
 *       copies of that asset that can be on screen at once.
 * No line is a round number that felt right; each carries its derivation in
 * `why`, and the page prints that string next to the number.
 *
 * WHAT THE MEASUREMENT SAID, AND WHY THE BUDGET IS NOT MOSTLY ABOUT TRIANGLES.
 * The whole repository is 182,610 triangles. The worst frame the game can build
 * is ~124k. That is small for any GPU made this decade, and the project's own
 * A/B (task #80) moved frame time by MESH COUNT, not by triangle count: 279 vs
 * 713 meshes on the same scene was p50 5.6 vs 9.2 ms. So triangles get a real
 * line (the user asked for one, and it catches a catastrophic import), but the
 * lines that actually bind are draw calls, texture VRAM and skinned-animation
 * CPU. Saying otherwise would be compliance dressed up as engineering.
 *
 * THE TWO MEASURED COST CONSTANTS. Both come from this project, not a textbook:
 *   c_mesh = 0.0083 ms per resident mesh   (task #80 A/B, fit through the two
 *            measured points: (9.2 − 5.6) / (713 − 279))
 *   c_chan = 0.00148 ms per animation channel evaluated per frame
 *            (task #99 runtime probe: 12 KayKit champions = 1,476 channels =
 *            2.19 ms p50, Babylon NullEngine, Apple M5 Max)
 * Both were measured on a fast development machine. The client ships a "mobile"
 * quality tier and targets 60 fps on iPhone (render/RenderConfig.ts), so the
 * variable terms are derated by DERATE below before any line is drawn. That
 * derating factor is the one number here that is an ASSUMPTION rather than a
 * measurement, and it is isolated on its own line so it can be replaced the
 * moment someone runs the AdaptiveQuality meter on a real handset.
 */

/** 60 fps. The client's fps cap is 60 in every preset (settings/presets.ts). */
export const FRAME_MS = 1000 / 60;

/** ms per resident mesh, measured (task #80 A/B). */
export const C_MESH_MS = (9.2 - 5.6) / (713 - 279);

/** ms per per-frame animation channel, measured (task #99 runtime probe). */
export const C_CHAN_MS = 2.19 / 1476;

/**
 * Single-thread slowdown of the 60-fps target device vs the machine both cost
 * constants were measured on. ASSUMPTION, not a measurement — 3× is the
 * optimistic end of the 3–5× range the runtime probe used, so the lines below
 * are the generous ones. Replace with a measured figure and every limit moves.
 */
export const DERATE = 3;

/**
 * How the 16.67 ms is spent in COMBAT on the target device. The two budgeted
 * slices are the ones this file draws lines for; the rest is named so the
 * arithmetic is auditable rather than convenient.
 */
export const COMBAT_FRAME_SPLIT = [
  { slice: "mesh / draw submission", ms: 6.0, budgeted: true },
  { slice: "skinned animation + Skeleton.prepare", ms: 3.0, budgeted: true },
  { slice: "sim tick, netcode, interpolation, React HUD", ms: 3.0, budgeted: false },
  { slice: "fill, particles, post-FX, compositing headroom", ms: 4.67, budgeted: false },
] as const;

export interface Line {
  /** metric key, matching the report's per-scene measurements */
  key: string;
  label: string;
  unit: string;
  /** hard cap — above this the import is rejected or sent to batch optimisation */
  limit: number;
  /** warning line — above this it is reviewed, not blocked */
  warn: number;
  /** the derivation, printed on the page next to the number */
  why: string;
}

const round = (n: number, step: number): number => Math.round(n / step) * step;

/** meshes resident before the mesh/draw slice is spent: 6.0 ms ÷ (c_mesh × 3). */
export const MESH_LIMIT = round(6.0 / (C_MESH_MS * DERATE), 10); // 240
/** channels per frame before the animation slice is spent: 3.0 ms ÷ (c_chan × 3). */
export const CHAN_LIMIT = round(3.0 / (C_CHAN_MS * DERATE), 20); // 680

/**
 * Texture VRAM is deliberately NOT derived from a guessed hardware ceiling.
 * Nobody here has measured what iOS Safari will tolerate, and inventing a
 * number would make the page lie with confidence. It is derived from the
 * CONTENT instead: the worst combat frame needs ~12 MB of actual image
 * information once the 25 duplicate copies of one 24-colour palette are
 * deduplicated and right-sized (task #99 texture probe). The limit is 4× that,
 * the warning 2.7× — i.e. "you may spend four times what the art actually
 * needs, and no more". OVER on this axis means wasteful, not crashing, and the
 * page says so in those words.
 */
export const TEX_INFO_MB = 12;
export const TEX_LIMIT_MB = TEX_INFO_MB * 4; // 48
export const TEX_WARN_MB = TEX_INFO_MB * 8 / 3; // 32

/**
 * Triangles. Not time-bound at this project's magnitudes, so the line is set
 * where it can still catch the import that has not happened yet: 12 copies of
 * the single heaviest asset in the repository (menu/dragon2, 19,542 tris) on
 * top of the heaviest arena is ~289k, so 400k has real headroom over the worst
 * frame the CURRENT assets can build, and 250k trips before one bad import can
 * double a frame. 400k tris at 60 fps is 24M tris/s, which is inside every GPU
 * the game targets — that is why this axis is not the binding one.
 */
export const TRI_LIMIT = 400_000;
export const TRI_WARN = 250_000;

const MB = 1024 * 1024;

/** The report-level lines. Per-scene overrides live in scenes.ts. */
export const LINES: Line[] = [
  {
    key: "drawCalls",
    label: "同畫面 mesh / draw call 數",
    unit: "meshes",
    limit: MESH_LIMIT,
    warn: Math.round(MESH_LIMIT * 0.7),
    why: `6.0 ms ÷ (${C_MESH_MS.toFixed(4)} ms/mesh × ${DERATE}) = ${Math.round(6.0 / (C_MESH_MS * DERATE))}；c_mesh 來自 #80 的 A/B（279→5.6 ms、713→9.2 ms，同一場景）。警戒線 = 上限的 70%。`,
  },
  {
    key: "triangles",
    label: "同畫面三角面數",
    unit: "tris",
    limit: TRI_LIMIT,
    warn: TRI_WARN,
    why: "不是時間瓶頸，是防呆線：目前資產能組出的最壞畫面約 289k（12 × 全案最重的 dragon2 19,542 + 最重競技場），上限 400k 留有真正的餘裕；400k tris @60fps = 24M tris/s，任何目標 GPU 都吃得下。",
  },
  {
    key: "vramBytes",
    label: "同畫面貼圖 VRAM（RGBA8 + mipmap）",
    unit: "bytes",
    limit: TEX_LIMIT_MB * MB,
    warn: Math.round(TEX_WARN_MB * MB),
    why: `不猜硬體上限：最壞戰鬥畫面真正需要的影像資訊約 ${TEX_INFO_MB} MB（去掉 25 份同一張 24 色調色盤後），上限 = 4×、警戒 = 2.67×。超線代表「浪費超過約定」，不代表會當掉。`,
  },
  {
    key: "animChannels",
    label: "同畫面每幀動畫通道數",
    unit: "channels",
    limit: CHAN_LIMIT,
    warn: Math.round(CHAN_LIMIT * 0.7),
    why: `3.0 ms ÷ (${C_CHAN_MS.toFixed(5)} ms/channel × ${DERATE}) = ${Math.round(3.0 / (C_CHAN_MS * DERATE))}；c_chan 來自 12 隻 KayKit = 1,476 通道 = 2.19 ms 的實測。警戒線 = 上限的 70%。`,
  },
  {
    key: "textureBytes",
    label: "同畫面貼圖檔案大小（磁碟）",
    unit: "bytes",
    limit: 8 * MB,
    warn: 4 * MB,
    why: "只作參考欄位。磁碟位元組是無用的代理指標：25 張 1024² PNG 共 384.6 KB，卻是 133.33 MB 的 VRAM（放大 355×）。真正的閘門是上面的 VRAM 與下面的像素尺寸。",
  },
];

/**
 * PER-IMPORT GATES. Each is a scene line divided by the worst-case number of
 * simultaneous copies of an asset in that ROLE — which is why the same triangle
 * count passes as a champion and fails as a 50-instance tree.
 *
 * `simultaneous` is not a guess: 12 comes from twelve seats with no
 * duplicate-pick rule anywhere in champ select or MatchRoom (so twelve copies
 * of ONE model is legal and is the worst case); 50 is godie's japanesecherry
 * placement count; 78 is the intermission grass ring; 2 is the login dragon.
 */
export interface Gate {
  role: string;
  label: string;
  simultaneous: number;
  simultaneousWhy: string;
  /** per-instance triangle cap */
  tris: { warn: number; limit: number };
  /** per-model resident meshes (= draw calls; nothing in this project is instanced today) */
  meshes: { warn: number; limit: number };
  /** largest allowed texture edge in PIXELS — bytes are not a gate */
  texEdge: { warn: number; limit: number };
  /** per-frame animation channels */
  channels: { warn: number; limit: number };
  why: string;
}

export const GATES: Gate[] = [
  {
    role: "champion",
    label: "英雄模型（champ.* / imported.* 綁在 champion 上）",
    simultaneous: 12,
    simultaneousWhy:
      "12 個席次，且 champ select 與 MatchRoom 都沒有「不可重複選角」的規則 —— 同一支模型出現 12 份是合法的最壞情況。",
    tris: { warn: 16_000, limit: 28_000 },
    meshes: { warn: 3, limit: 5 },
    texEdge: { warn: 512, limit: 1024 },
    channels: { warn: 35, limit: 55 },
    why:
      "面數 =(250k 警戒 − 58k 最重競技場)/12 ≈ 16k、(400k − 64k)/12 = 28k。" +
      "Mesh = 英雄可用的 60 個 mesh 額度 ÷ 12。" +
      "貼圖 = 32 MB 英雄額度 ÷ 12 = 2.67 MB/隻，512²+mip = 1.33 MB 過關，1024²+mip = 5.33 MB 不過（除非它被多隻英雄共用、只上傳一次）。" +
      "通道 = 680 ÷ 12 = 56。",
  },
  {
    role: "arena-decor",
    label: "競技場擺設（arena doc 的 decor[]）",
    simultaneous: 50,
    simultaneousWhy: "godie 放了 50 棵 japanesecherry；這是目前單一擺設模型的最高擺放數。",
    tris: { warn: 4_000, limit: 8_000 },
    meshes: { warn: 1, limit: 2 },
    texEdge: { warn: 512, limit: 1024 },
    channels: { warn: 0, limit: 0 },
    why:
      "閘門看的是「單一模型 × 它的擺放數」的總和，不是模型本身：擺設可用 120 個 mesh 與 120k 面，" +
      "任何一支模型不得吃掉超過 1/4（30 mesh、30k 面）。逐支的 warn/limit 是把該額度攤回單一實例後的值，" +
      "並額外要求擺設模型不得有骨架（通道上限 0）—— 一棵 74 面的樹帶 1 根骨頭，就會讓 50 棵樹變成 100 個無法 instance 的 draw call。",
  },
  {
    role: "intermission-prop",
    label: "中場市集道具",
    simultaneous: 78,
    simultaneousWhy: "grassRing() 產生 78 個 hex_grass；paving 是 49 個 floor_tile_large。",
    tris: { warn: 300, limit: 600 },
    meshes: { warn: 1, limit: 1 },
    texEdge: { warn: 256, limit: 512 },
    channels: { warn: 0, limit: 0 },
    why: "78 × 600 = 46.8k 面、78 個 mesh —— 已經是中場一半的 mesh 額度。大量鋪設的道具必須是單 mesh、單材質、可 instance。",
  },
  {
    role: "hero-prop",
    label: "單件主角道具（店員、攤位、登入巨龍）",
    simultaneous: 2,
    simultaneousWhy: "登入畫面 2 條龍共用同一個 container；店員/攤位各 1 件。",
    tris: { warn: 20_000, limit: 40_000 },
    meshes: { warn: 12, limit: 20 },
    texEdge: { warn: 1024, limit: 1024 },
    channels: { warn: 120, limit: 200 },
    why: "只有 1–2 份，所以可以吃掉整個場景額度的一大塊；但 1024² 是硬上限 —— 沒有任何一張貼圖在這個鏡頭距離下需要更高。",
  },
  {
    role: "vfx-model",
    label: "技能／特效模型",
    simultaneous: 8,
    simultaneousWhy: "12 人混戰時同時存活的特效實例，取 8 為工作假設（尚未實測，標示為假設）。",
    tris: { warn: 1_000, limit: 2_000 },
    meshes: { warn: 2, limit: 3 },
    texEdge: { warn: 256, limit: 512 },
    channels: { warn: 20, limit: 40 },
    why: "特效是加在最忙的一幀上的，所以額度最小。注意：目前沒有任何一支 imported 特效模型真的被 vfx doc 引用（#79），所以這條閘門現在守的是未來。",
  },
];

/** Verdict of one measured value against a line. */
export type Verdict = "ok" | "warn" | "over";

export function verdict(value: number, warn: number, limit: number): Verdict {
  if (value > limit) return "over";
  if (value > warn) return "warn";
  return "ok";
}
