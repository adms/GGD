/**
 * championFormVisuals — 「變身看得出來」的解析層 (task #249 / GH#288).
 *
 * ---------------------------------------------------------------------------
 * 這個檔案在守的那條線
 * ---------------------------------------------------------------------------
 * 26 對變身裡有 21 對 base 與 alternate 的 `modelKey` **完全相同**,悟空(09)與
 * Saber(20) 都在裡面。所以「換模型」這條路對它們不存在,能用的只有:
 *
 *      顏色(tint) × 大小(scale) × 球體掛件(attachment)
 *
 * 而這三樣的資料入口只有一個 —— `config.form-visuals@1`,一份操作者能改的文件。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 地雷:`godie-ogrh` 與 `godie-o00x` 共用 `imported.goku`
 * ---------------------------------------------------------------------------
 * `Gokuhead.mdx` 已經被 #267 烘進 `goku.glb`。若把 `Goku3head.mdx` 也烘進去,
 * **基本型悟空也會長出超三的頭**。所以掛件是執行期的,而且這個模組**只認**
 * `Emeu`(alternate)那一半:
 *
 *   `resolveFormVisual` 第一件事就是 `isAlternateForm(championId)`,不是查表。
 *   有人把 `godie-ogrh` 寫進 `forms` 也拿不到任何外觀 —— 資料錯不會變成畫面錯。
 *
 * `championFormVisuals.test.ts` 用真的出貨文件跑這條分支,而不是自己捏一個假
 * 的 config(失敗形態 ⑤:被測的不是出貨的那個)。
 *
 * ---------------------------------------------------------------------------
 * 為什麼 strength 是「對偏離量的濃度」而不是直接相乘
 * ---------------------------------------------------------------------------
 * tint 是**乘法**(見 render/views/modelTint.ts)。`tintStrength = 0` 如果寫成
 * `tint * 0` 就變成全黑 —— 把旋鈕轉到零反而是最誇張的效果,語意完全相反。
 * 所以它插值的是「離中性值有多遠」:
 *
 *      effective = 1 + (authored - 1) * strength
 *
 * 於是 0 = 中性(功能關掉,`applyModelTint` 直接跳過整個材質走訪),
 * 1 = 照文件寫的值。scale 同理,中性值也是 1。
 */
import { isAlternateForm } from "./championForms";
import {
  DEFAULT_FORM_VISUALS,
  type ConfigFormVisualsDoc,
  type FormVisualEntry,
} from "./schema/config";

/** 中性色 = 不上色。與 render/views/modelTint.ts 的 `NEUTRAL_TINT` 同義。 */
export const FORM_TINT_NEUTRAL: readonly [number, number, number] = [1, 1, 1];

/** 低於這個差距,乘法在 8-bit 輸出上是 no-op(0.5/255)。和 modelTint 同一個常數。 */
const EPSILON = 0.002;

/**
 * 掛件的預設掛點,而且是 **WC3 自己的字**。
 *
 * `SPHERE_ATTACHMENTS.json` 對 `A0MI`(球體(悟空正常))與 `A0MJ`(球體(悟空超3))
 * 記的 `attachPoint` 都是 `"origin"` —— 也就是**模型原點**,不是頭骨。這不是
 * 偷懶:兩個 mdx 都把幾何烘在原點座標系的絕對高度上(goku3head.glb 的頂點在
 * Y 2.27..5.11,那正是 mdx 的頭部高度 ÷36),所以掛在原點它會**自己站到正確
 * 位置**,只需要一個把兩份 glb 的轉檔倍率對齊的縮放。掛到頭骨反而要再倒推
 * 一次偏移,而且會錯。
 *
 * 其他值視為骨頭名稱;找不到就退回模型根節點(絕不丟例外)。
 */
export const FORM_ATTACH_ORIGIN = "origin";

/** @deprecated 舊名,保留給既有呼叫端;語意同 {@link FORM_ATTACH_ORIGIN}。 */
export const FORM_ATTACH_DEFAULT_BONE = FORM_ATTACH_ORIGIN;

/** 一個變身態解析完的外觀。三個欄位互相獨立,可以只有其中一個。 */
export interface FormVisual {
  /** 乘在 albedo/diffuse 上的顏色;null = 不上色。 */
  readonly tint: readonly [number, number, number] | null;
  /** 疊在 #150 身高正規化之上的倍率;1 = 和本體一樣高。 */
  readonly scaleMult: number;
  /** 球體掛件;null = 沒有(或後台把掛件關掉了)。 */
  readonly attachment: FormAttachment | null;
}

/** 執行期掛在 ChampionView 上的第二個 glb。 */
export interface FormAttachment {
  /** models/ 文件 id,例如 `imported.goku3head`。 */
  readonly modelKey: string;
  /** 掛到哪根骨頭;找不到就退回模型根節點。 */
  readonly bone: string;
  readonly scale: number;
  readonly offsetY: number;
}

/** 中性外觀 —— 「這一態不改任何東西」。 */
export const NEUTRAL_FORM_VISUAL: FormVisual = { tint: null, scaleMult: 1, attachment: null };

/** 顏色/大小的合法輸入區間(後台驗證與 Zod 用的是同一組數字)。 */
export const FORM_VISUAL_BOUNDS = {
  tint: [0, 4],
  scaleMult: [0.2, 3],
  tintStrength: [0, 1],
  scaleStrength: [0, 2],
  attachScale: [0.01, 10],
  attachOffsetY: [-5, 5],
} as const;

function lerpFromNeutral(authored: number, strength: number): number {
  return 1 + (authored - 1) * strength;
}

function isNeutral(tint: readonly [number, number, number]): boolean {
  return tint.every((c) => Math.abs(c - 1) < EPSILON);
}

function finite(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * 這一個 championId 在**變身態**時要長什麼樣,或 null。
 *
 * `null` 有四個來源,而且刻意不區分 —— 呼叫端的動作都是「什麼都不做」:
 * 總開關關著、這個 id 根本不是變身態、文件裡沒有這一格、或三個欄位算完都中性。
 *
 * @param doc 後台文件;`null`/`undefined` = 讀出貨預設(不是「空表」)。
 *            這一點和 `baseBonusFromDoc` 一致:缺文件不等於全部關掉。
 */
export function resolveFormVisual(
  doc: ConfigFormVisualsDoc | null | undefined,
  championId: string | null | undefined,
): FormVisual | null {
  if (!championId) return null;
  // 資料層防線:只有 `Emeu` 那一半有外觀。基本型永遠拿不到掛件。
  if (!isAlternateForm(championId)) return null;
  const cfg = doc ?? DEFAULT_FORM_VISUALS;
  if (!cfg.enabled) return null;
  const entry: FormVisualEntry | undefined = cfg.forms[championId];
  if (!entry) return null;

  const tintStrength = clamp(finite(cfg.tintStrength, 1), 0, 1);
  const scaleStrength = clamp(finite(cfg.scaleStrength, 1), 0, 2);

  const authoredTint = entry.tint;
  const tint: [number, number, number] | null = authoredTint
    ? [
        lerpFromNeutral(authoredTint[0], tintStrength),
        lerpFromNeutral(authoredTint[1], tintStrength),
        lerpFromNeutral(authoredTint[2], tintStrength),
      ]
    : null;

  const scaleMult = lerpFromNeutral(finite(entry.scaleMult, 1), scaleStrength);

  const attachment: FormAttachment | null =
    cfg.attachmentsEnabled && entry.attachModelKey
      ? {
          modelKey: entry.attachModelKey,
          bone: entry.attachBone ?? FORM_ATTACH_ORIGIN,
          scale: finite(entry.attachScale, 1),
          offsetY: finite(entry.attachOffsetY, 0),
        }
      : null;

  const effectiveTint = tint && !isNeutral(tint) ? tint : null;
  const effectiveScale = Math.abs(scaleMult - 1) < EPSILON ? 1 : scaleMult;
  if (effectiveTint === null && effectiveScale === 1 && attachment === null) return null;
  return { tint: effectiveTint, scaleMult: effectiveScale, attachment };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 取出文件裡明寫的那一格(不套全域濃度,不做中性化)。後台頁面要顯示
 * 「操作者填了什麼」,而不是「算完之後是什麼」—— 那是兩個不同的問題。
 */
export function authoredFormVisual(
  doc: ConfigFormVisualsDoc | null | undefined,
  championId: string,
): FormVisualEntry | null {
  return (doc ?? DEFAULT_FORM_VISUALS).forms[championId] ?? null;
}
