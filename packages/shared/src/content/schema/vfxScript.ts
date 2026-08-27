/**
 * vfx-script@1 — GH#838 特效工坊（VFX Forge）的演出腳本。
 *
 * 一份 script＝一支技能的**純演出**時間軸：畫什麼（segment kinds）、掛哪（各 kind
 * 自己的錨點詞彙）、何時（`on` 觸發器＋`atMs` 位移）。行為真相（傷害／次數／CC）
 * 永遠住 ability JSON —— 這裡一個行為數字都不可以有（第〇·四守則）。
 *
 * ⭐ 為什麼是**獨立集合**而不是塞回 ability JSON：三招驗收對象裡
 * `godie-e002.ex.json` 是 `skillremake:json` 的產物 —— 編輯器直寫它，下一次 sync
 * 就打回來。演出軸分離成**編輯器唯一擁有**的手編集合，行為產物照常重生成。
 *
 * ⭐ 詞彙**不另起一份**：每個 segment kind 從對應的出貨 effect schema `.pick()`
 * 演出欄位（spawnModelFx／spawnVfx／floatingText／screenFlash／screenShake），
 * 上下界與欄位語意只有一個住處；sim 側欄位（shape/side/onArrive/onTouch…）
 * 刻意不進來 —— 那些是行為。
 *
 * 觸發器 v1 只收**客戶端今天真的收得到**的事件（第一·五守則：schema 收得下但
 * 播放器播不動＝說了但不會發生）：castBegin / castEffect(=abilityCast) /
 * projectileSpawn / projectileHit。逐段 strike 與 defenseSuccess 等 sim 事件
 * 落地後才進這個 enum。
 */
import { z } from "zod";
import { zId, zRef } from "./common";
import { zSpawnModelFx } from "./effects/spawnModelFx";
import { zSpawnVfx } from "./effects/spawnVfx";
import { zFloatingText } from "./effects/floatingText";
import { zScreenFlash } from "./effects/screenFlash";
import { zScreenShake } from "./effects/screenShake";

/**
 * 觸發器（v1 —— 只列播放器真的接了的）。⭐ 語意名**刻意與 wire 事件名解耦**：
 * `castStart`＝wire `abilityCast`（提交）、`castEffect`＝結算（詠唱技等 wire
 * `castEnd`、瞬發＝提交當幀 —— 判別在播放器，⛔ 不在作者身上）。
 */
export const VFX_SCRIPT_TRIGGERS = [
  "castStart",
  "castEffect",
  /** wire `comboStrike`（GH#838 逐段演出錨 —— comboStrikes／delayed 的每一段）。 */
  "strike",
  "projectileSpawn",
  "projectileHit",
] as const;

const SEG_COMMON = {
  /** 錨定哪一個客戶端事件（都以本技能的 abilityId 過濾）。 */
  on: z.enum(VFX_SCRIPT_TRIGGERS),
  /** 觸發後再等幾毫秒（0–20000）。省略＝0＝事件當幀。 */
  atMs: z.number().int().min(0).max(20000).optional(),
  /**
   * 只在第 N 段觸發（1 起算，同 JASS 的 `SupI`；省略＝每一段都觸發）。
   * ⛔ 只有 `on:"strike"` 讀它（doc-level refine 擋半套）。
   */
  strikeIndex: z.number().int().min(1).max(100).optional(),
} as const;

/** 模型演出段 —— 詞彙照抄 spawnModelFx 的演出子集（單一住處）。 */
export const zVfxScriptModelFx = zSpawnModelFx
  .pick({
    modelKey: true,
    path: true,
    anchor: true,
    speed: true,
    distance: true,
    count: true,
    spacing: true,
    spinDegPerSec: true,
    clip: true,
    clipTimeScale: true,
    scale: true,
    scaleAxis: true,
    tint: true,
    alpha: true,
    lifeSec: true,
    soundKey: true,
  })
  .extend({
    kind: z.literal("modelFx"),
    ...SEG_COMMON,
    // script 裡沒有 preset 補值 ⇒ 這兩格必填（sim 版是 optional）
    modelKey: z.string().min(1),
    path: z.enum(["forward", "toTarget", "orbit", "radial", "static"]),
    // ── owner 2026-08-28 slider 裁決的四格連續參數（各自有 JASS 對應動詞）────
    /** 沿施法者面向的前後位移（世界單位；JASS `PolarProjectionBJ` 的 dist 分量）。 */
    offsetForwardU: z.number().min(-30).max(30).optional(),
    /** 垂直面向的左右位移（＋＝面向的右手邊；同上 PolarProjection 的側分量）。 */
    offsetSideU: z.number().min(-30).max(30).optional(),
    /** 離地高度（世界單位；JASS `SetUnitFlyHeightBJ` —— 500 wc3u ≈ 9.2u）。 */
    heightU: z.number().min(0).max(30).optional(),
    /** 朝向偏移（度，逆時針；JASS `CreateNUnitsAtLoc(…, angle)` 的那一格）。 */
    yawOffsetDeg: z.number().min(-360).max(360).optional(),
  });

/** 粒子／貼圖 vfx 段 —— 詞彙照抄 spawnVfx（含 at:"bone"＋attach 掛骨）。 */
export const zVfxScriptVfx = zSpawnVfx
  .pick({ vfxId: true, at: true, attach: true, durationSec: true })
  .extend({
    kind: z.literal("vfx"),
    ...SEG_COMMON,
    /** 沿施法者面向的前後位移（世界單位；拖拉落點的翻譯 —— PolarProjection 同族）。 */
    offsetForwardU: z.number().min(-30).max(30).optional(),
    /** 垂直面向的左右位移（＋＝面向的右手邊）。 */
    offsetSideU: z.number().min(-30).max(30).optional(),
  });

/** 浮動文字段（喊招／Hit 數）。 */
export const zVfxScriptText = zFloatingText
  .pick({
    text: true,
    colorRgb: true,
    sizeScale: true,
    riseSpeed: true,
    durationSec: true,
  })
  .extend({
    kind: z.literal("floatingText"),
    ...SEG_COMMON,
    /** 文字浮在誰頭上：施法者（省略）或目標。 */
    at: z.enum(["caster", "target"]).optional(),
  });

export const zVfxScriptFlash = zScreenFlash
  .pick({ colorRgb: true, peakAlpha: true, durationSec: true })
  .extend({ kind: z.literal("screenFlash"), ...SEG_COMMON });

export const zVfxScriptShake = zScreenShake
  .pick({ amplitude: true, durationSec: true })
  .extend({ kind: z.literal("screenShake"), ...SEG_COMMON });

/** 純音效段（audio-map 的 key，⛔ 不是檔名）。 */
export const zVfxScriptSound = z
  .object({
    kind: z.literal("sound"),
    ...SEG_COMMON,
    soundKey: z.string().min(1).max(120),
  })
  .strict();

export const zVfxScriptSegment = z.discriminatedUnion("kind", [
  zVfxScriptModelFx,
  zVfxScriptVfx,
  zVfxScriptText,
  zVfxScriptFlash,
  zVfxScriptShake,
  zVfxScriptSound,
]);
export type VfxScriptSegment = z.infer<typeof zVfxScriptSegment>;

export const zVfxScriptDoc = z
  .object({
    id: zId,
    schema: z.literal("vfx-script@1"),
    /** 綁哪一支技能（對映唯一住處 —— ability JSON 不知道 script 的存在）。 */
    abilityId: zRef("abilities"),
    /** 給編輯器／下一輪的出處備註（JASS 行號、換算依據…）。 */
    notes: z.string().max(2000).optional(),
    segments: z.array(zVfxScriptSegment).min(1).max(64),
  })
  .strict()
  .superRefine((doc, ctx) => {
    doc.segments.forEach((seg, i) => {
      if (seg.strikeIndex !== undefined && seg.on !== "strike") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", i, "strikeIndex"],
          message: '只有 on:"strike" 讀得到 strikeIndex —— 其他觸發器沒有段號',
        });
      }
      if (seg.kind === "modelFx") {
        // 鏡射 spawnModelFx 的跨欄檢查（pick 不帶 refinement）—— 訊息同語意
        if ((seg.path === "static" || seg.path === "orbit") && seg.lifeSec === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", i, "lifeSec"],
            message: `path:"${seg.path}" 一定要有 lifeSec —— 那是它唯一的終止條件`,
          });
        }
        if (seg.path !== "static" && seg.path !== "toTarget" && seg.distance === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", i, "distance"],
            message: `path:"${seg.path}" 一定要有 distance（orbit 時是環半徑）`,
          });
        }
        if (seg.anchor !== undefined && seg.path !== "static") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", i, "anchor"],
            message: '只有 path:"static" 讀得到 anchor',
          });
        }
      }
      if (seg.kind === "vfx") {
        const bone = seg.at === "bone";
        if (bone !== (seg.attach !== undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", i, bone ? "attach" : "at"],
            message: 'at:"bone" ⇔ attach 成對出現',
          });
        }
      }
    });
  });

export type VfxScriptDoc = z.infer<typeof zVfxScriptDoc>;
