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
import { zAbilityVfxLayerOverride } from "./abilityVfx";
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
  /**
   * ⭐⭐ **反彈成功**（GH#885）—— ⭐ owner 指名的驗收三招之一 **20-002 理想鄉EX**
   * 就是由這一刻觸發的，⛔ 而在 2026-08-31 之前它在 schema 層**寫不出來**。
   *
   * ⭐ **歸屬乾淨**：反彈封包的 `source` 就是**防禦者**，而封包的 provenance
   * （`combat/damage.ts:61` 的 `` `ability:${id}` ``）指的正是**他自己那支反彈技能**
   * ⇒ ⛔ 播放器不需要新的 dep，用既有的 `scriptFor()`。
   *
   * ── ⛔⛔ 為什麼**沒有** `blockSuccess`（⭐ 量過才決定的，⛔ 不是漏掉）──────
   * ⚠️ 格擋的訊號**早就到客戶端了**（`combat/block.ts:65` 逐字「照常
   * `emit("damage", { amount: 0, blocked: true })`」）—— ⛔ 但**歸屬是錯的**：
   * 那個事件的 `origin` 是**攻擊者的**技能，而格擋特效屬於**防禦者的**技能。
   * ⭐ 而 `blockCutFor()`（`block.ts:315`）只回一個 `number` ⇒ 拿不到是哪一格 grant 擋的。
   * ⇒ ⭐ 加一格 `blockSuccess` 而作者填了卻掛在錯的人身上 ＝ **一格「說了但不會發生」的欄位**
   *   （第一·五守則）。⛔ 所以這一輪不加它。
   * ⭐ 它的正解住 **GH#650**（BlockGrant 缺一道特效軸）：那張票要讓 `blockCutFor`
   *   說得出**是誰擋的**，⇒ 那一天 `blockSuccess` 才有正確的歸屬。
   */
  "reflectSuccess",
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
    /**
     * ⭐【升空曲線】M3 —— JASS `SetUnitFlyHeightBJ(u, h, rate)`：01-04 收尾把三個
     * 身體拉到 1000 wc3u 再急墜。單一個 `heightU` 表達不了「升上去再掉下來」。
     * `[{t 秒, h 世界單位}]`，逐段線性、兩端夾住；疊在 `heightU` 之上。
     * ⚠️ 必須**依 t 遞增**（客戶端每幀取樣，⛔ 不會替你排序）—— refine 擋。
     */
    heightKeys: z
      .array(z.object({ t: z.number().min(0).max(30), h: z.number().min(-10).max(40) }).strict())
      .min(2)
      .max(12)
      .optional(),
    /**
     * ⭐【沿路拖尾】M11 —— 移動中的模型每隔一段時間在**當下的位置**放一發 vfx
     * （04-03 龍破斬的火球沿路 HCancelDeath＋VolcanoDeath）。
     * ⚠️ 那是「傷害段的視覺」，⛔ 不是多具實體（三種迴圈的判別，CLAUDE.md）。
     * ⛔ `path:"static"` 不動 ⇒ 拖尾會疊在同一點，refine 擋。
     */
    trailVfxId: zRef("vfx", { soft: true }).optional(),
    /** 拖尾間隔（秒）。⛔ 只有填了 trailVfxId 才讀得到。 */
    trailIntervalSec: z.number().min(0.02).max(2).optional(),
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
    /**
     * ⭐【這一發粒子的連續參數】owner 2026-08-28（逐字）：
     * > 「我要可以拖拉 model,**粒子特效**進編輯器模擬遊戲畫面，用 silder 調
     * >  **大小、透明度、顏色、轉向、高度、動畫速度** 等各種連續參數」
     *
     * ⭐ 六格**直接展開 `zAbilityVfxLayerOverride`**（它自己又是 pick 鑄技工坊
     * 那張表的同名欄位）⇒ 上下界與語意**不可能**與家族綁定表漂開，
     * ⛔ 這裡一個 `z.number()` 都沒有自己寫。
     * 對應：`w3xScale` 大小 · `alpha` 透明度 · `tint` 顏色 ·
     *       `facingDeg`/`pitchDeg` 轉向 · `flyHeight` 高度 · `timeScale` 動畫速度。
     *
     * ⚠️ 消費端**沿用出貨的 `applyVfxOverrides`**（客戶端 `abilityLayers.ts`）——
     * ⛔ 不是第二套套用邏輯：它連池 key 的簽章都算好了，所以同樣的覆寫共用同一格池。
     * 全部缺席 ⇒ `applyVfxOverrides` 走 identity 快速路徑 ⇒ 逐位元同這一格出現之前。
     */
    ...zAbilityVfxLayerOverride.shape,
  });

/** 浮動文字段（喊招／Hit 數）。 */
export const zVfxScriptText = zFloatingText
  .pick({
    text: true,
    colorRgb: true,
    sizeScale: true,
    riseSpeed: true,
    durationSec: true,
    driftSpeed: true,
    driftAngleDeg: true,
    driftAngleStepDeg: true,
    driftFrom: true,
    // ⭐ 方向（GH#853）—— ⛔ 少了這四格，走 vfx script 段寫的浮字**表達不出方向**，
    //   而它不會壞（沒 drift ⇒ undefined ⇒ 舊行為）⇒ ⚠️ 那正是最難發現的一種缺口：
    //   「schema→sim→client 整條接上了」這句話會是**半真的**。
    //   （2026-08-29 對抗性複驗找到的第二個作者面。）
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

/**
 * ⭐【動畫脈衝】M4 —— 讓**受害者**（或施法者）播一次動畫並用剪輯窗拉長成慢動作。
 *
 * 原作 01-04／20-002 每一刀都對目標 `SetUnitAnimation(死亡)` ＋
 * `SetUnitTimeScalePercent(10)`：屍體僵在那裡被連續劈。
 * ⭐ 零新渲染機制：`ChampionView.pulse(kind, now, {clipWindowMs})` 的
 * `clipWindowMs` 本來就會**拉長/壓縮**一次性剪輯 —— 拉長 = 慢動作 = 定格感。
 * ⚠️ 誠實邊界：出貨的脈衝詞彙只有 `attack|cast|hurt`（`AnimPulse`），
 * ⛔ **沒有 death** —— 這裡用 `hurt` 拉長來表達，那是**近似**不是 1:1，
 * 而缺的那一格（受害者強制播 death 剪輯）留在票上的 M4 尾巴。
 */
export const zVfxScriptAnim = z
  .object({
    kind: z.literal("anim"),
    ...SEG_COMMON,
    /** 誰演：目標（省略＝target —— 這一族的主詞就是受害者）或施法者。 */
    at: z.enum(["target", "caster"]).optional(),
    pulse: z.enum(["attack", "cast", "hurt"]),
    /** 剪輯窗（毫秒）—— 拉長＝慢動作。省略＝用出貨預設窗。 */
    clipWindowMs: z.number().int().min(50).max(6000).optional(),
  })
  .strict();

/**
 * ⭐【暫時隱形】N6 —— 把**英雄本體模型**藏起來一段時間（純演出）。
 *
 * JASS `Trig_ABanX`（war3map.j:28905）逐字 `ShowUnitHide(GetTriggerUnit())`：
 * 08-04 阿邦快速劍X 的招牌 —— 小呆本人消失 1 秒，畫面上只有那道劍氣。
 *
 * ⚠️ 這**不是** `ENTITY_FLAG.INVISIBLE`（那是權威隱身，伺服器索敵會拒絕鎖定
 * ⇒ 借它來做演出等於偷加一個無敵窗）。客戶端自己一格 alpha 覆寫，⛔ 不動 sim。
 * ⭐ 它**自己會過期** —— 掉一則封包不會留下一具永遠不回來的身體。
 */
/**
 * ⭐⭐【演出位移】**M1 逐刀瞬移** ＋ **M3 升空曲線**（GH#838，超究武神霸斬）。
 *
 * owner 指名的驗收三招之一。原作 01-04 每一刀之前把小呆 `SetUnitPositionLoc` 到
 * 目標的**另一個角度**（M1），而第三段把兩個人一起 `SetUnitFlyHeight` 拉上天（M3）。
 *
 * ── ⭐ 一段，⛔ 不是兩段 ──────────────────────────────────────────────────
 * 「瞬移」與「升空」在資料上是**同一件事**：把一具身體的**視覺位置**推到一個偏移。
 * 差別只有**怎麼過去** ⇒ 一個 `mode`，⛔ 不是兩個 segment kind（第〇·五守則）。
 *
 * ── ⚠️ 誠實邊界：它**只動畫面**，⛔ 不動 sim ────────────────────────────
 * 判定框、索敵、碰撞**一格都不變** —— 與 `hideBody` 逐字同一個理由：
 * 把演出借給權威狀態，等於偷加一個**位移窗**（而位移是這個遊戲最貴的資源之一）。
 *
 * ⭐ 逐刀不同的角度用 `strikeIndex` 表達：N 刀 = N 段，各自一個 `offset`。
 * ⭐ 逐段加速用 `anim` 段的 `clipWindowMs`（M4）—— ⛔ 那一格本來就在。
 */
export const zVfxScriptBodyMove = z
  .object({
    kind: z.literal("bodyMove"),
    ...SEG_COMMON,
    /** 動誰：施法者（省略＝caster —— 這一族的主詞）或目標。 */
    at: z.enum(["caster", "target"]).optional(),
    /**
     * ⭐ `teleport` = 立刻到位、時間到瞬間回來（**M1**，原作一刀砍完就閃到下一個角度
     * ⇒ ⛔ 中間沒有滑行）· `arc` = 沿拋物線去而復返（**M3** 升空）。省略＝`teleport`。
     */
    mode: z.enum(["teleport", "arc"]).optional(),
    /** 相對於權威位置的偏移（世界單位）。⚠️ 上界是**護欄** —— 一份寫錯的腳本不可以把身體丟出場外。 */
    offset: z
      .object({
        x: z.number().min(-12).max(12),
        y: z.number().min(-12).max(12),
        z: z.number().min(-12).max(12),
      })
      .strict(),
    /** 這段偏移持續多久（毫秒）。⚠️ 上界同樣是護欄 —— 原作最長那一段約 1.2 秒。 */
    durationMs: z.number().int().min(50).max(3000),
  })
  .strict();

export const zVfxScriptHideBody = z
  .object({
    kind: z.literal("hideBody"),
    ...SEG_COMMON,
    /** 藏誰：施法者（省略＝caster —— 原作的主詞）或目標。 */
    at: z.enum(["caster", "target"]).optional(),
    /** 藏多久（毫秒）。原作最長的那一發是 1 秒。 */
    durationMs: z.number().int().min(50).max(4000),
  })
  .strict();

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
  zVfxScriptAnim,
  zVfxScriptHideBody,
  zVfxScriptBodyMove,
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
        // ⚠️ 升空曲線的 t 必須遞增 —— 客戶端每幀取樣時**不排序**（那是 N×60fps
        //    的浪費），所以順序錯了會靜靜地跳高度，⛔ 而畫面上看起來只是「抖」。
        const hk = seg.heightKeys;
        if (hk) {
          for (let k = 1; k < hk.length; k++) {
            if (hk[k]!.t <= hk[k - 1]!.t) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["segments", i, "heightKeys", k, "t"],
                message: `heightKeys 的 t 必須嚴格遞增（第 ${k} 格 ${hk[k]!.t} ≤ 前一格 ${hk[k - 1]!.t}）`,
              });
              break;
            }
          }
        }
        if (seg.trailIntervalSec !== undefined && seg.trailVfxId === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", i, "trailIntervalSec"],
            message: "沒有 trailVfxId 就沒有人讀 trailIntervalSec —— 一個看起來有設、其實沒人讀的數字",
          });
        }
        if (seg.trailVfxId !== undefined && seg.path === "static") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", i, "trailVfxId"],
            message: 'path:"static" 不會移動 —— 拖尾會整串疊在同一點（那不是拖尾，是一個越來越亮的點）',
          });
        }
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
