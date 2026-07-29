/**
 * formVisual — 把「變身外觀」接到既有的 #49 tint / #150 scale 管線上。
 *
 * 純函式,沒有 Babylon,沒有 HUD store。它存在的理由和 `championTint.ts` 一樣:
 * 決定要不要上色是可以單獨測的,而查 seat 表不行(client-08)。
 *
 * ---------------------------------------------------------------------------
 * 為什麼是「相乘」而不是「取代」
 * ---------------------------------------------------------------------------
 * `applyModelTint` 寫的是 `base_material × tint`(見 views/modelTint.ts)。英雄
 * 自己的 w3x tint 已經佔了那個乘數,所以變身色如果用取代的,像 依文潔琳 那種
 * 本來就有顏色的英雄變身後會**掉色**。相乘則是兩層濾鏡疊起來,而且
 * `[1,1,1]` 在兩邊都是單位元 —— 沒有顏色的英雄不受影響。
 *
 * ⚠️ `undefined` 要原封不動傳回去。`EntityViewRegistry.applyTint` 用它表示
 * 「seat 表還沒填好,下一幀再問」;把它折成 `null` 會讓變身態的英雄永遠停在
 * 未上色的狀態,而且看起來像「解析完成:沒有顏色」。
 */
import type { FormVisual } from "@ggd/shared/content";
import type { ModelTint } from "./modelTint";
import { isIdentityTint } from "./modelTint";
import type { FormAttachmentSpec } from "./ChampionView";

/**
 * 英雄自己的 tint × 變身態的 tint。
 *
 * @param base `undefined` = 還解析不出來(照傳);`null` = 這隻英雄沒顏色。
 * @param form null = 這個 body 不是變身態,或後台把顏色關掉了。
 */
export function composeFormTint(
  base: ModelTint | null | undefined,
  form: FormVisual | null,
): ModelTint | null | undefined {
  if (base === undefined) return undefined; // 「還不行」必須原樣往上傳
  const formTint = form?.tint;
  if (!formTint) return base;
  const b = base?.tint ?? [1, 1, 1];
  const out: ModelTint = {
    tint: [b[0] * formTint[0], b[1] * formTint[1], b[2] * formTint[2]] as [number, number, number],
  };
  // alpha 不屬於變身:#220 的死亡溶解擁有那條通道(見 mobTint.ts 的同一段推理)。
  // 英雄自己宣告的透明度照舊帶過去。
  if (base?.alpha !== undefined) out.alpha = base.alpha;
  return isIdentityTint(out) ? null : out;
}

/**
 * 變身態疊在 #150 正規化之上的倍率。1 = 沒有變化(呼叫端可以直接相乘)。
 */
export function formScaleMultiplier(form: FormVisual | null): number {
  const m = form?.scaleMult;
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * 把 shared 的 `FormAttachment`(記 modelKey)換成渲染層要的 spec(記 glbPath)。
 *
 * @param glbPathOf modelKey → glbPath;查不到回 null(掛件就整個不掛)。內容還沒
 *        載完時也會回 null,呼叫端下一幀會再問一次,所以不會永久遺失。
 */
export function formAttachmentSpecFor(
  form: FormVisual | null,
  glbPathOf: (modelKey: string) => string | null,
): FormAttachmentSpec | null {
  const a = form?.attachment;
  if (!a) return null;
  const glbPath = glbPathOf(a.modelKey);
  if (!glbPath) return null;
  return { glbPath, bone: a.bone, scale: a.scale, offsetY: a.offsetY };
}
