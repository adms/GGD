/** item@1 — mirrors `ItemDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { ItemId } from "../../ids";
import { zIdFor, zItemStatModifier } from "./common";
import { zAuraDef, zHookDef } from "./effect";
import { MISMATCH_SCALE_MAX, MISMATCH_SCALE_MIN } from "../../sim/content/requirement";

/**
 * 職業限定閘 — mirrors `ClassRequirement` in sim/content/requirement.ts, which
 * is where the axes are justified (and where `role` is shown to be a pure
 * function of `attackType`, hence useless as a gate).
 *
 * `.strict()` and every field optional: `{}` is legal and means "no
 * constraint", which is the same thing as omitting the object.
 */
export const zClassRequirement = z
  .object({
    /** 近戰 / 遠程 — 83 / 36 on the live roster. */
    attackType: z.enum(["melee", "ranged"]).optional(),
    /** 主屬性, read off the champion's `attributes.primary` — 力 50 / 敏 40 / 智 29. */
    primaryStat: z.enum(["STR", "AGI", "INT"]).optional(),
    /**
     * 不符合條件時怎麼辦 — 完全不觸發 ("block", 預設) 或 打折觸發 ("reduced").
     * owner 沒有裁決過這一題, 所以兩種都做成模式讓後台切, 預設選比較好理解的
     * 那個 (CLAUDE.md 第一守則).
     */
    onMismatch: z.enum(["block", "reduced"]).optional(),
    /**
     * "reduced" 模式下不符合條件的英雄拿到的效果強度倍率 (0.5 = 效果減半).
     *
     * 上下界都有: 上界 1 是因為這是一個**懲罰**旋鈕 —— 大於 1 會讓不符合條件的
     * 英雄比符合的還強, 那不是平衡選擇而是把 0.5 打成 5。下界 0 合法, 意思是
     * 「打到沒有」。
     *
     * ⚠️ 2026-07-30 稽核更正(第三守則): 這裡本來寫「0 仍然會消耗內部冷卻與
     * 觸發事件, 所以跟 block 不同」—— **程式不是這樣寫的**。
     * `effects/hooks.ts` 在 `scale === 0` 就 `continue`, 而且是在內部冷卻閘與
     * 機率骰之前, 所以 `reduced` + 0 目前與 `block` 完全等價。詳見
     * `sim/content/requirement.ts` 的同一段更正。
     */
    mismatchScale: z.number().min(MISMATCH_SCALE_MIN).max(MISMATCH_SCALE_MAX).optional(),
  })
  .strict();

/**
 * A hook authorable on an ITEM. `zHookDef` plus the 職業限定閘.
 *
 * WHY THE FIELD IS ADDED HERE AND NOT ON `zHookDef` ITSELF. `zHookDef` is
 * shared with `ability@1` and `augment@1`, and neither has been designed
 * against a class gate — an ability already belongs to exactly one champion, so
 * 「限近戰」 on it is either a tautology or a contradiction, and an augment is
 * drafted, not equipped. Extending only the item's copy keeps the authoring
 * surface exactly as wide as the feature, so the editor cannot offer a field
 * that would be nonsense where it is shown. The RUNTIME type (`HookDef` in
 * sim/stats/modifiers.ts) carries `requires` for everybody, because `fireHooks`
 * is one loop over every source kind and a second code path there would be a
 * place to forget.
 */
export const zItemHookDef = zHookDef.extend({ requires: zClassRequirement.optional() }).strict();

/**
 * An aura authorable on an ITEM — `zAuraDef` with the item hook type, so a
 * projected hook can carry its own 職業限定閘 (「周圍的**近戰**友軍」).
 *
 * The refine is re-stated because `.extend()` returns the base OBJECT schema,
 * dropping the `.refine` that `zAuraDef` carries; without this line an item
 * could ship an aura with an empty payload — a radius that does nothing, i.e.
 * exactly the tier-5 「描述在承諾機制，資料是空的」 defect this lane exists to
 * close, re-introduced one level down.
 */
export const zItemAuraDef = zAuraDef.innerType()
  .extend({ hooks: z.array(zItemHookDef).optional() })
  .strict()
  .refine((a) => (a.modifiers?.length ?? 0) + (a.hooks?.length ?? 0) > 0, {
    message: "aura must carry at least one modifier or hook",
  });

export const zItemDef = z
  .object({
    id: zIdFor<ItemId>(),
    name: z.string().min(1),
    /**
     * Human-readable item description recovered from the w3x source (WC3 color
     * codes stripped, line breaks normalized). Optional metadata — absent when
     * the map yields no text. Not consumed by the sim; drives editor/UI display.
     */
    description: z.string().optional(),
    cost: z.number().int().min(0),
    tier: z.number().int().min(1).max(5),
    unique: z.boolean().optional(),
    /** Range-guarded: see `zItemStatModifier` for why items get their own band. */
    modifiers: z.array(zItemStatModifier).optional(),
    passive: z.array(zItemHookDef).optional(),
    /**
     * 光環 (auras) this item projects onto units around its holder — the
     * 「周圍的友軍/部隊…」 half that `modifiers` (holder only) and `passive`
     * (holder's own events) cannot reach.
     *
     * REUSES THE EXISTING PRIMITIVE rather than inventing an item-side one:
     * `sim/aura/aura.ts` already reconciles membership every tick off
     * `ModifierSource.auras`, and `shop.ts` now forwards this array onto the
     * `kind: "item"` source it attaches. So radius, team filter, enter/leave,
     * holder death, zone change, `abilityRange` scaling and teardown are all
     * inherited — an item aura is not a second mechanism.
     *
     * This is what made the three tier-5 「積分獎勵」 docs (戰旗 / 復仇之袍 /
     * 惡魔吉他) authorable: their descriptions promise 「周圍部隊反彈 70% 傷害」
     * and 「周圍的近戰友軍獲得吸血 30%」, and before this field `item@1` could
     * not express either, so all three shipped with hooks=0 mods=0.
     */
    auras: z.array(zItemAuraDef).optional(),
    iconKey: z.string().optional(),
    /**
     * w3x item icon extracted from the map archive (task #33), path relative
     * to content/, e.g. "assets/icons/items/godie-i022.png". Absent = the
     * source used Blizzard STOCK art — client keeps its text-only fallback.
     * (`iconKey` above is the legacy skeleton-era symbolic key — unrelated.)
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
    tags: z.array(z.string()),
    /**
     * Crafting/provenance role recovered from the source-map TRIGGERS
     * (tools/w3x-import/extract_item_roles.py), NOT inferred from cost or name.
     * The shop lists only `final`; the 3-choose-1 draft offers only `quest`.
     * See `ItemCraftRole` in sim/content/defs.ts for the full role vocabulary
     * and task #70 for why a structural marker had to replace the cost filter.
     */
    craftRole: z
      .enum(["final", "component", "quest", "token", "direct", "service", "none"])
      .optional(),
    /**
     * The recipe a `final` item's own trigger implements (book + components),
     * kept for auditability. GGD has no combine step; this is provenance only.
     */
    recipe: z
      .object({
        book: zIdFor<ItemId>().optional(),
        components: z.array(zIdFor<ItemId>()),
      })
      .strict()
      .optional(),
    /**
     * 三選一/寶玉只會把這件武器發給這種攻擊型態的英雄 (#189). 省略 = 所有人,
     * 也就是 #189 之前的每一份文件。See `ItemDef.requiresAttackType`.
     */
    requiresAttackType: z.enum(["melee", "ranged"]).optional(),
    /**
     * 這件道具可不可以出現在**抽卡/三選一**的池子裡 (任務三選一 · 回合武器卡 ·
     * 傳說寶玉)。`false` = 內容樹留著它、白名單留著它、已經拿到的人照常帶著,
     * 但發卡的時候不會再抽到。省略 = `true`,所以每一份既有文件都不受影響。
     *
     * 這是一個**決策點做成欄位**(CLAUDE.md 第一守則), 不是一次刪除:
     * 有幾件從 w3x 匯進來的任務道具,代價實作了而回報還沒有 —— 天堂之劍
     * (godie-i01n) 帶著 生命-500 卻沒有它招牌的「魂藏」原地復活, 仙后座
     * (godie-i01s) 的「瞬間移動 / 25%物理迴避」兩樣都還沒有 payload。留在池子裡
     * 玩家抽到就是被主動傷害(前者更慘: 抽到就是純扣血)。把它們刪掉會讓
     * owner 之後想放回去得改程式; 設成 `false` 只要在後台把開關撥回來。
     *
     * ⚠️ 它**不是**白名單。白名單說「這件東西存不存在」, 這個欄位說「發卡的時候
     * 要不要考慮它」—— 跟 `requiresAttackType` 同一層, 兩個都在 roll **之前**
     * 過濾(見 `sim/economy/offerEligibility.ts` 的檔頭: 先抽後濾正是 #47 空卡片
     * 的成因)。
     */
    draftEligible: z
      .boolean()
      .describe(
        "抽卡池開關。關掉之後,這件道具就不會再被任務三選一 / 回合武器卡 / 傳說寶玉抽到 —— " +
          "但它仍然存在、仍然在白名單裡,已經拿到的人也照常帶著。用來把「代價做了、回報還沒做」" +
          "的道具暫時移出抽卡池,不必刪掉它。留空 = 照常會被抽到。",
      )
      .optional(),
    /**
     * 作者備註 —— **不會顯示給玩家**,只給編輯者與稽核看。
     *
     * 存在的理由是 CLAUDE.md 第三守則(註解會說謊):一份道具文件跟解釋它的程式
     * 註解分開放,那份註解遲早會跟資料脫節,而且**改資料的人根本不會看到它**。
     * 這個欄位讓「這件道具缺什麼 / 對應哪個 w3x rawcode / 為什麼被關掉」跟數值
     * 躺在同一個檔、同一次 diff、同一個後台表單裡。
     *
     * `description` 是玩家看得到的文案,兩者不可互相取代:玩家不需要知道
     * rawcode,稽核不能靠玩家文案判斷實作缺口。
     */
    authoringNote: z
      .string()
      .max(2000)
      .describe(
        "作者備註,只給編輯者與稽核看,**玩家永遠看不到**(玩家讀的是上面的『描述』)。" +
          "寫「這件道具還缺什麼 / 對應哪個 w3x rawcode / 為什麼被關掉」,讓下一個改數值的人" +
          "在同一個表單裡就看得到,不用去翻程式註解。",
      )
      .optional(),
  })
  .strict();

export const zItemDoc = zItemDef.extend({ schema: z.literal("item@1") }).strict();

export type ItemDoc = z.infer<typeof zItemDoc>;
