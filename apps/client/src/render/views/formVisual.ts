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
import type { FormVisual, WornAttachment } from "@ggd/shared/content";
import { wornFromFormAttachment } from "@ggd/shared/content";
import { counterpartFormId } from "@ggd/shared/content";
import type { ModelTint } from "./modelTint";
import { isIdentityTint } from "./modelTint";
import type { FormAttachmentSpec } from "./ChampionView";

/**
 * 「這個座位**現在**穿的是哪一隻」—— 基本型是選角鎖定的那一隻,變身態是它的
 * `Emeu` 對半。
 *
 * ---------------------------------------------------------------------------
 * #223 —— 為什麼這是一個被共用的函式,而不是各自寫一次
 * ---------------------------------------------------------------------------
 * `seat.championId` 在選角那一刻凍住,**變身不會改它**(同一個 seat、同一個
 * entity,只換 body)。所以任何拿 seat 直接去查「這具身體該長什麼樣」的解析器,
 * 對變身態一律答錯。那樣的縫有四條:`championTintFor`、`voxelSkinFor`、
 * `modelOverrideFor`、`modelDocFor`,前三條收 `EntityViewState`(拿得到 FORM
 * bits),第四條只收 `(modelKey, seatId, formIndex)` —— 因為花朵 / 守衛 /
 * 選角預覽都沒有 entity。四條都經由這一個函式做形態跳轉,實作住在
 * `championBody.ts`(GameApp 只餵資料),那裡有真的守衛。
 *
 * ⚠️ 這句「四條都經由這一個函式」**在 2026-07-30 之前是假的**:`championTintFor`
 * 當時在 GameApp 直接寫 `championTintForId(championIdForSeat(e.seatId))`,
 * 一次形態跳轉都沒做,而這段註解已經先宣稱它做了。現在四條是真的四條,
 * 而且各有一條會紅的守衛(`formAwareModelResolve.test.ts` 第 2 組)。
 *
 * ⚠️ 事實更正(2026-07-30 重量,原本這裡寫反了):
 * 本檔曾寫「#06 傑·富力士 的 `godie-u034` 與 #61 克勞薩 的 `godie-u011` 都指向
 * `champ.thorne`,所以 overlay 會把本體的 WC3 模型裝回變身態身上」。**出貨內容
 * 正好相反**:`godie-ucrl`(本體)= `champ.thorne`、`godie-u034`(變身)=
 * `imported.herobiggon`;`godie-u012`(本體)= `champ.thorne`、`godie-u011`
 * (變身)= `champ.skin.barbarian`。穿 `champ.thorne` 的是**本體**。而
 * `imported.herobiggon` 不是替身,`resolve()` 第一行就 return,#06 那個「缺陷」
 * 在物理上不可能發生。26 對逐對重量的結果、以及形態感知**必須**同時帶兩條
 * 「缺省即繼承」保底(否則 5 對會從 WC3 模型掉成方塊人)的理由,
 * 寫在 `championBody.ts` 的檔頭與 `formAwareModelResolve.test.ts`。
 *
 * 這個函式故意留在 render/views 底下(純函式、沒有 Babylon、沒有 HUD store),
 * 測試才能直接跑出貨的那一份,而不是在測試裡重寫兩行(第⑤號故障形態)。
 *
 * @param seatedChampionId 座位鎖定的英雄;null/"" = 還沒選角。
 * @param formIndex `formIndexFromFlags` 解出來的 0..3。0 = 本體。
 * @returns 沒有對半可換時回 `seatedChampionId` 本身 —— 「這一隻沒有變身態」
 *          不是錯誤,是 113 位裡 87 位的常態。
 */
export function formAwareChampionId(
  seatedChampionId: string | null | undefined,
  formIndex: number,
): string | null {
  if (!seatedChampionId) return null;
  if (formIndex === 0) return seatedChampionId;
  return counterpartFormId(seatedChampionId) ?? seatedChampionId;
}

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
  return wornAttachmentSpec(wornFromFormAttachment(a), glbPathOf);
}

/**
 * GH#392 —— 一份**已解析的掛件**(`WornAttachment`)→ 渲染層的 spec。
 *
 * 兩個來源(變身外觀表 / `attachment@1` 文件)在 shared 就折成同一個型別了,
 * 所以這裡只剩「modelKey → glbPath」這一步 —— ⛔ 沒有第二份 follow/anim 的規則。
 */
export function wornAttachmentSpec(
  worn: WornAttachment,
  glbPathOf: (modelKey: string) => string | null,
): FormAttachmentSpec | null {
  const glbPath = glbPathOf(worn.modelKey);
  if (!glbPath) return null;
  return {
    glbPath,
    bone: worn.bone,
    scale: worn.scale,
    offsetY: worn.offsetY,
    follow: worn.follow,
    anim: worn.anim,
    animLoop: worn.animLoop,
  };
}
