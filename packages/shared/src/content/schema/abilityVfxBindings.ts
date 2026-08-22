/**
 * `config.ability-vfx-bindings@1` —— **一張共用表**回答「這一支技能該播原作的哪一組
 * emitter」,⛔ 而不是把答案抄進 420 份技能文件的 `vfxKey`。
 *
 * ============================================================================
 * ⭐ 為什麼是一張表(CLAUDE.md 第〇·四守則:值在載入時從共用表解析)
 * ============================================================================
 * 一支技能該播哪一份 `fx.w3x.*`,是一個從**證據**推導得出的結論:
 *
 *   `content/assets/vfx/w3x-ability-provenance.json`  技能 rawcode ↔ 原作藝術 ↔ emitter
 *   `content/vfx/*.json`                              哪幾份 emitter 真的出貨了
 *   `content/abilities/*.json`                        哪幾支技能今天還活著
 *
 * 把結論抄進技能文件就是**第二個住處**,而它會過期:抽取器多收一個模型、一支技能
 * 被退休、一份 emitter 被砍 —— 每一次都讓那幾份技能文件的 `vfxKey` 變成謊話,而
 * ⛔ **沒有任何東西會紅**。⇒ 結論住這張表,表由 `tools/vfx-bind/scan.py` 產生,
 * `--check` 逐位元組比對。
 *
 * ============================================================================
 * ⚠️ 覆蓋順序 —— 這一格是**第三順位**,⛔ 不是最高
 * ============================================================================
 * `resolveAbilityVfxSource()`(見 `../vfxBindings.ts`)的四階:
 *
 *   1. 技能文件自己寫的 `vfxLayers`      —— 作者已經明說了整個堆疊
 *   2. 技能文件自己寫的**原作** `vfxKey` —— `fx.w3x.*` / `godie-*`(手挑的主 emitter)
 *   3. **這張表**                        —— 證據推導出來的整組
 *   4. 技能文件的 `fx.prim.*` / 空       —— 通用原型 / 下游的元素 fallback
 *
 * ⭐ 第 2 階為什麼贏過這張表:出貨的 27 列裡有 **20 列**技能文件已經寫了原作 doc,
 * 而且那是**人挑過主 emitter 的**(例 `holyawakening` 挑 `p04` 而不是 `p00`)。
 * 表贏過它 = 用一條「取第一顆」的機械規則推翻一個人的判斷,⛔ 那是退步。
 *
 * ============================================================================
 * ⭐ 一列存的是 `vfxKeys`(有序陣列),⛔ 不是 `vfxKey` + `extra`
 * ============================================================================
 * 一次原作施法 = **一組** emitter(`holyawakening` 是 6 顆)。如果一列同時存
 * 「主 emitter」與「其餘」,那個「主」就是一個**存下來的值**,而它是一條規則算得出
 * 來的(`vfxKeys[0]`)—— 第〇·四守則的第二住處。⇒ 只存整組,主 emitter 由解析器
 * 依規則取,兩者不可能漂開。
 *
 * ============================================================================
 * ⛔ `unmatched` 不是待辦清單,是**理由**清單
 * ============================================================================
 * 每一份沒被綁上的 `fx.w3x.*` emitter 文件都在 `unmatched` 裡,帶著一句**能被反駁
 * 的理由**(哪一道閘、量到的數字是多少),⛔ 不是「還沒收」。量到的分佈(2026-08-22):
 * 多數是「原作地圖裡沒有任何技能引用這個模型」與既有的 **root-anchor 可渲染性閘**
 * (`apps/client/src/render/vfx/w3xAbilityArt.ts` 檔頭逐字記著 divinering 20 顆
 * emitter 掛在 `BlizParticle*` 節點上,用世界座標重播會變成一團而不是一圈)。
 * ⇒ ⭐ 那些文件**不是接線漏掉**,是**刻意不接**。
 */
import { z } from "zod";
import { zId, zRef } from "./common";

/** 一列 = 一支技能 ↔ 它在原作地圖裡真正播的那一組 emitter。 */
export const zAbilityVfxBindingRow = z
  .object({
    /** 技能文件 id(soft ref —— 技能退休時由 `scan.py --check` 的對帳報 DEAD) */
    abilityId: zRef("ability", { soft: true }),
    /**
     * 這一族的 emitter 文件,**有序**。`vfxKeys[0]` 是主 emitter(規則,⛔ 不是存下來的值)。
     *
     * 上限 6 對齊 `abilityVfx.ts` 的 `ABILITY_VFX_LAYER_HARD_CAP` —— 超過的家族由
     * `scan.py` **整列拒收**並進 `unmatched`,⛔ 不截斷:截斷會讓表面上綁好了、
     * 畫面上少一半,而那是安靜的失敗。
     */
    vfxKeys: z.array(zRef("vfx", { soft: true })).min(1).max(6),
    /**
     * 這個結論是**怎麼**得到的 —— `<provenance>:<channel>`,例
     * `jass-literal:jass:effectTargetUnit`(作者在 JASS 裡逐字打了模型路徑)。
     * ⛔ 它不是註解:半年後沒有這一格就分不出「作者設的」與「暴雪內建繼承的」。
     */
    source: z.string().min(1).max(120),
    /** 原作地圖裡這一支技能的 rawcode(`A0D5`)。join 不到時是空字串。 */
    rawcode: z.string().max(8),
    /**
     * ⛔ 只收 `CONFIRMED`。猜的一律進 `unmatched` ——
     * 接錯 = 玩家看到**別支技能**的特效,比通用原型更糟。
     */
    confidence: z.literal("CONFIRMED"),
  })
  .strict();
export type AbilityVfxBindingRow = z.infer<typeof zAbilityVfxBindingRow>;

/** 一份沒被綁上的 emitter 文件,以及**為什麼**。 */
export const zAbilityVfxUnmatched = z
  .object({
    vfxKey: zRef("vfx", { soft: true }),
    /**
     * ⭐ 一個**能被反駁**的理由,⛔ 不是「還沒收」。下界 8 字是為了擋住
     * `"TODO"` 這種等於沒寫的字串(同 `zVfxOwnerBinding.why` 的口徑)。
     */
    why: z.string().min(8).max(400),
  })
  .strict();
export type AbilityVfxUnmatched = z.infer<typeof zAbilityVfxUnmatched>;

export const zConfigAbilityVfxBindingsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ability-vfx-bindings@1"),
    bindings: z.array(zAbilityVfxBindingRow),
    unmatched: z.array(zAbilityVfxUnmatched),
  })
  .strict();
export type ConfigAbilityVfxBindingsDoc = z.infer<typeof zConfigAbilityVfxBindingsDoc>;

/**
 * 出貨預設 = **空表**。
 *
 * ⚠️ 空的預設是刻意的,而且它是相容性保證的那一半:內容裡沒有這份文件時,
 * `resolveAbilityVfxSource()` 走 identity 路徑**原封回傳同一個物件** ——
 * 420 支技能一位元不差,和這一版之前完全一樣。⛔ 這裡不可以塞出貨值:
 * 出貨值住 `content/config/ability-vfx-bindings.json`,由 `scan.py` 產生。
 */
export const DEFAULT_ABILITY_VFX_BINDINGS: ConfigAbilityVfxBindingsDoc = {
  id: "ability-vfx-bindings",
  schema: "config.ability-vfx-bindings@1",
  bindings: [],
  unmatched: [],
};
