/**
 * ability@1 · 多層特效模板 (task #205 / #230 — owner 2026-07-30)
 *
 *   > 「保有**彈性設定特效各種參數**跟**模板複數可被套用於技能中**」
 *
 * 在這個檔案之前,`ability.vfxKey` 是**一個 optional 字串** —— 一支技能只能綁
 * 一個特效文件,而且綁上去之後那份文件長什麼樣就是什麼樣,沒有任何 per-技能的
 * 覆寫空間。想做「先蓄力光柱 → 再爆炸 → 再留一圈餘燼」就得再烘一份新的 vfx 檔。
 *
 * ============================================================================
 * 要給一支技能加第二層特效,你只要在 doc 裡寫 `vfxLayers`
 * ============================================================================
 * `vfxLayers` **在的時候就是這支技能施法時的完整特效堆疊**,由上往下依序播。
 * 舊的 `vfxKey` 一個字都不用動(它仍然是這份 doc 的「主要特效」,普查頁、
 * 鑄技工坊、CodexDetail 都還讀它),但 `vfxLayers` 一旦存在,施法時畫出來的就是
 * 這張表 —— 所以**第一層通常就把原本的 `vfxKey` 再寫一次**。
 *
 * 可以直接貼進 `content/abilities/<id>.json` 的例子(B1–B6 六條綁定 lane 照抄
 * 這一段就對了):
 *
 * ```json
 * {
 *   "id": "godie-n003.r",
 *   "schema": "ability@1",
 *   "name": "42-04 世界終結",
 *   "vfxKey": "fx.w3x.locust.frostnova.p01",
 *   "vfxLayers": [
 *     { "vfxKey": "fx.w3x.locust.frostnova.p01" },
 *     {
 *       "vfxKey": "fx.prim.ice.nova",
 *       "delayMs": 220,
 *       "w3xScale": 1.8,
 *       "alpha": 0.85
 *     },
 *     {
 *       "vfxKey": "fx.prim.ice.shockwave",
 *       "delayMs": 620,
 *       "attachTo": "point",
 *       "timeScale": 2.4,
 *       "tint": [90, 170, 255]
 *     }
 *   ]
 * }
 * ```
 *
 * ⚠️ 上面那三個 vfx id **是出貨的檔案**,不是我編的示意值 ——
 * `abilityVfx.test.ts` 會把這個 JSON 從這段註解裡剖出來、用真的 `zAbilityDoc`
 * 解一遍、再確認每一個 `vfxKey` 在 `content/vfx/` 真的有檔案。範例爛掉會紅,
 * 而不是等六條綁定 lane 照抄之後才發現。(第一版寫 `fx.w3x.frostnova.a` 與
 * `fx.prim.ice.nova-lg`,兩個都不存在。)
 *
 * 讀作:命中瞬間放原作的霜之新星 → 220 ms 後疊一圈放大 1.8 倍、稍微透明的
 * 冰新星 → 620 ms 後在**技能落點**留一圈拉長 2.4 倍的餘波。
 *
 * ---------------------------------------------------------------------------
 * 向後相容:646 支帶 `vfxKey` 的技能一個字都不用改
 * ---------------------------------------------------------------------------
 * `resolveAbilityVfxLayers()` 把兩種寫法正規化成同一個內部形狀。沒有 `vfxLayers`
 * 的 doc 得到**恰好一層、零覆寫**的結果,而零覆寫這件事是有意義的:
 * `applyLayerOverrides` 對零覆寫的層走 identity 路徑,**原封不動把同一個 VfxDoc
 * 物件回傳**(同一個 reference,不是一份拷貝)。所以升級前後這 646 支走的是同一
 * 份文件、同一個 pool key、同一組粒子參數 —— 一位元不差,而且那是靠物件identity
 * 保證的,不是靠比對欄位。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 欄位名與上下界**不是這裡發明的**,是 pick 出來的
 * ---------------------------------------------------------------------------
 * 每一層的參數覆寫欄位(`w3xScale` / `tint` / `flyHeight` / `alpha` /
 * `timeScale`)是從 `zVfxAbilityFamilyBinding`(鑄技工坊的 per-ability 覆寫表,
 * 見 `./vfx.ts`)`.pick()` 出來的 —— **同一個 Zod 定義**,不是抄一份同名的。
 * 這代表兩張表的界限不可能漂開:漂開需要有人去改 `zVfxAbilityFamilyBinding`,
 * 而那一改會同時改到這裡。後台 `apps/admin/src/vfxForge.ts` 的 `ABILITY_BOUNDS`
 * 也是對著同一份 schema 用 `safeParse` 驗四個點的。
 *
 * ⚠️ **`anchor`(骨頭掛點)刻意沒有被 pick 進來。** 施法特效走的是 `VfxSystem`
 * 的 pooled `play()` 路徑,那條路只把發射器擺到一個世界座標,**沒有 bone
 * parenting**(會 parent 骨頭的是 `AmbientVfx` 與 `W3xEmitterRig`)。把 `anchor`
 * 開在這裡等於開一個寫了會被吃掉的欄位 —— 就是七種故障的第 ② 種。家族綁定那張
 * 表的 `anchor` 仍然有效,因為它走的是 rig。要在層上支援掛點,先把 `play()` 接上
 * 掛點解析,再把欄位加進來;`abilityLayers.test.ts` 有一條守衛盯著「宣告的覆寫
 * 欄位必須真的被消費」,漏接就會紅。
 *
 * ---------------------------------------------------------------------------
 * ABSENT ≠ ZERO(和 `./vfx.ts` 同一條規則)
 * ---------------------------------------------------------------------------
 * 一層少一格的意思是「這一層不覆寫這個參數,用文件自己的值」,**不是 0**。
 * `alpha: 0` 是「明確要求完全透明」,也就是看不見。操作者清空一格時要把 key
 * 整個拿掉。
 */
import { z } from "zod";
import { zRef } from "./common";
import { zVfxAbilityFamilyBinding } from "./vfx";

/**
 * 一層特效跟著誰。
 *
 * · `caster` —— 施法者當下的位置(這是 `vfxKey` 單值時代唯一的行為,所以它是預設)
 * · `point`  —— 技能的落點(`abilityCast` 事件自己帶的 `point`);沒有落點的
 *               castType(self / dash)會自動退回 `caster`,而不是畫在原點。
 *
 * ⚠️ 這裡**只列執行期真的會照做的兩個值**。「命中時」「持續期間」在 sim 那側
 * 還沒有可綁的事件(`damage` 事件不帶 abilityId),先開一個列舉成員等於開一個
 * 寫了不會發生的設定 —— 故障 ②。要加,先把事件補齊。
 */
export const zAbilityVfxAttachTo = z.enum(["caster", "point"]);
export type AbilityVfxAttachTo = z.infer<typeof zAbilityVfxAttachTo>;

/**
 * 一層可以覆寫哪些參數 —— **直接 pick 鑄技工坊那張表的同名欄位**,連 Zod 的
 * min/max 都是同一個物件。見檔頭的 ⚠️ 說明(以及為什麼 `anchor` 不在裡面)。
 */
export const zAbilityVfxLayerOverride = zVfxAbilityFamilyBinding.pick({
  w3xScale: true,
  tint: true,
  flyHeight: true,
  alpha: true,
  timeScale: true,
  // #366 —— 方位的兩半。和上面五格同一條規則:pick 的是**同一個 Zod 定義**,
  // 所以家族綁定表與層堆疊表的上下界不可能漂開。
  facingDeg: true,
  pitchDeg: true,
});
export type AbilityVfxLayerOverride = z.infer<typeof zAbilityVfxLayerOverride>;

/** 這一層覆寫欄位的名字,執行期從 schema 讀出來 —— 沒有第二份手抄的清單。 */
export const ABILITY_VFX_LAYER_OVERRIDE_FIELDS = Object.keys(
  zAbilityVfxLayerOverride.shape,
) as readonly (keyof AbilityVfxLayerOverride)[];

/**
 * 一支技能最多疊幾層 —— **絕對上限**,schema 直接擋。
 *
 * 這個數字不是挑的,是接在 `apps/client/src/render/vfx/emitterBudget.ts` 的
 * `MAX_SYSTEMS_PER_EFFECT` 上:一層至少吃一個 `ParticleSystem`,而那個常數就是
 * 「一次特效無論如何不准超過幾個 system」的那條線。shared 不可以 import
 * client,所以這裡放常數、由 `abilityLayers.test.ts` 對真的預算常數做等式斷言 ——
 * 有人動預算而沒動這裡,那條測試就紅。
 */
export const ABILITY_VFX_LAYER_HARD_CAP = 6;

/**
 * 出貨預設的層數上限,**後台可調**(`config.vfx-families@1.maxAbilityVfxLayers`)。
 *
 * 推導:`SCREEN_SYSTEM_BUDGET`(64)÷ `MAX_LIVE_W3X_EFFECTS`(12,一位英雄一份)
 * = 5.33 → 5。也就是「12 個人同時施法,每個人的堆疊都塞滿,總 system 數仍在整個
 * 畫面的預算內」。同樣由 `abilityLayers.test.ts` 對真常數釘住。
 */
export const DEFAULT_MAX_ABILITY_VFX_LAYERS = 5;

/**
 * 一層特效模板的套用。
 *
 * ⚠️ `.strict()` —— 打錯的欄位名要在載入時就被擋下來,而不是靜靜地不生效。
 * 六條綁定 lane 會照著檔頭的 JSON 寫,寫錯一個字六份內容一起壞,所以這裡寧可
 * 紅在 `bundle.test.ts`。
 */
export const zAbilityVfxLayer = zAbilityVfxLayerOverride
  .extend({
    /** 哪一個模板 —— `content/vfx/` 的 id(soft ref,和 `vfxKey` 同一條規則) */
    vfxKey: zRef("vfx", { soft: true }),
    /** false = 這一層暫時不播(留著設定,不用刪)。省略 = 播。 */
    enabled: z.boolean().optional(),
    /** 這一層跟著誰。省略 = `caster`,也就是單值 `vfxKey` 時代的行為。 */
    attachTo: zAbilityVfxAttachTo.optional(),
    /**
     * 施法後幾毫秒才播這一層。省略 = 0(和主特效同一幀)。
     * 這是「蓄力 → 爆炸 → 餘燼」的時間軸;上界 8 秒是因為一場戰鬥裡沒有任何
     * 施法動作長到那個地步,更長的值只可能是打錯。
     */
    delayMs: z.number().min(0).max(8000).optional(),
  })
  .strict();
export type AbilityVfxLayer = z.infer<typeof zAbilityVfxLayer>;

/** 技能文件上的欄位型別:一到 `ABILITY_VFX_LAYER_HARD_CAP` 層。 */
export const zAbilityVfxLayers = z.array(zAbilityVfxLayer).min(1).max(ABILITY_VFX_LAYER_HARD_CAP);

// ---------------------------------------------------------------------------
// 正規化 —— 兩種寫法,一個內部形狀
// ---------------------------------------------------------------------------

/** 讀取端只認得這個形狀。`overrides` 是 `undefined` 就代表「這一層零覆寫」。 */
export interface ResolvedVfxLayer {
  readonly vfxKey: string;
  readonly attachTo: AbilityVfxAttachTo;
  readonly delayMs: number;
  /**
   * ⚠️ 零覆寫時是 `undefined`,**不是 `{}`**。下游靠這個分辨「原封不動播出貨的
   * 那份文件」和「播一份改過的」,而向後相容的一位元不差就是靠這個分支。
   */
  readonly overrides: AbilityVfxLayerOverride | undefined;
}

/** 一支技能的 doc 上和特效有關的兩個欄位(結構型別,不綁 `AbilityDef`)。 */
export interface AbilityVfxSource {
  readonly vfxKey?: string | undefined;
  readonly vfxLayers?: readonly AbilityVfxLayer[] | undefined;
}

function overridesOf(layer: AbilityVfxLayer): AbilityVfxLayerOverride | undefined {
  const out: Record<string, unknown> = {};
  for (const f of ABILITY_VFX_LAYER_OVERRIDE_FIELDS) {
    const v = layer[f];
    if (v !== undefined) out[f] = v;
  }
  return Object.keys(out).length === 0 ? undefined : (out as AbilityVfxLayerOverride);
}

/**
 * 把 `vfxKey`(舊)與 `vfxLayers`(新)正規化成同一串層。
 *
 * · 有 `vfxLayers` → 它就是完整堆疊(`enabled: false` 的層被濾掉),再依
 *   `maxLayers` 截斷。**截斷是從後面砍**:第一層是主特效,任何情況下都要留著。
 * · 沒有 `vfxLayers` → `vfxKey` 變成恰好一層、零覆寫、delay 0、跟著施法者。
 * · 兩個都沒有 → 空陣列(這支技能施法時不畫東西,和以前一樣)。
 *
 * `maxLayers` 是**後台可調**的那個上限(見 `DEFAULT_MAX_ABILITY_VFX_LAYERS`);
 * 傳進來的值再被 `ABILITY_VFX_LAYER_HARD_CAP` 夾一次,所以一個壞掉的 override
 * 也塞不爆 GPU。
 */
export function resolveAbilityVfxLayers(
  def: AbilityVfxSource | null | undefined,
  maxLayers: number = DEFAULT_MAX_ABILITY_VFX_LAYERS,
): ResolvedVfxLayer[] {
  if (!def) return [];
  const cap = Math.max(1, Math.min(ABILITY_VFX_LAYER_HARD_CAP, Math.trunc(maxLayers) || 1));
  const authored = def.vfxLayers;
  if (authored && authored.length > 0) {
    const out: ResolvedVfxLayer[] = [];
    for (const layer of authored) {
      if (layer.enabled === false) continue;
      out.push({
        vfxKey: layer.vfxKey,
        attachTo: layer.attachTo ?? "caster",
        delayMs: layer.delayMs ?? 0,
        overrides: overridesOf(layer),
      });
      if (out.length >= cap) break;
    }
    return out;
  }
  if (!def.vfxKey) return [];
  return [{ vfxKey: def.vfxKey, attachTo: "caster", delayMs: 0, overrides: undefined }];
}

/**
 * 這支技能是不是**只有**舊的單值 `vfxKey`(也就是走升級前那條路)。
 *
 * 讀取端用它決定要不要走原本那條一字未改的分支 —— 向後相容的守衛就是釘這個。
 */
export function isLegacySingleVfx(def: AbilityVfxSource | null | undefined): boolean {
  if (!def) return false;
  return (def.vfxLayers === undefined || def.vfxLayers.length === 0) && Boolean(def.vfxKey);
}

/** 後台存進來的上限,夾進 [1, HARD_CAP]。省略 = 出貨預設。 */
export function clampMaxAbilityVfxLayers(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_MAX_ABILITY_VFX_LAYERS;
  return Math.max(1, Math.min(ABILITY_VFX_LAYER_HARD_CAP, Math.trunc(v)));
}
