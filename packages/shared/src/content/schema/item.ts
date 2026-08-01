/** item@1 — mirrors `ItemDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { ItemId } from "../../ids";
import {
  refineItemModifierBand,
  refineStatModifierFrom,
  zId,
  zIdFor,
  zStatModifierFields,
} from "./common";
import {
  refineHookDamageContext,
  zAuraDef,
  zDamageType,
  zFlightGrant,
  zHookDefBase,
  zVisionGrant,
} from "./effect";
import { MISMATCH_SCALE_MAX, MISMATCH_SCALE_MIN } from "../../sim/content/requirement";
import { ATTR_GRANT_MAX, ATTR_GRANT_MIN } from "../../sim/stats/attributes";
// 套裝的上下界定義在 sim 那一份(它也是判斷「湊齊了沒」的地方),schema 只是把
// 同一組數字接上 Zod,所以兩層守的不可能是兩個數字。
import { ITEM_SET_MAX_PIECES, ITEM_SET_MIN_PIECES } from "../../sim/economy/itemSets";

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
export const zItemHookDef = zHookDefBase
  .extend({ requires: zClassRequirement.optional() })
  .strict()
  // ⚠️ `zHookDefBase` 而不是 `zHookDef`,而且 refine 要在這裡**再套一次**:
  // `zHookDef` 是 `zHookDefBase.superRefine(...)`,也就是一個 `ZodEffects`,
  // 而 `ZodEffects` 沒有 `.extend()`(`zItemAuraDef` 用 `.innerType()` 繞開的
  // 是同一個坑)。兩邊共用**同一個函式**,所以「只有帶傷害的事件才談得上那一發」
  // 不可能只在 ability 那半邊生效 —— 而反射之盾正是走 item 這半邊。
  .superRefine(refineHookDamageContext);

/**
 * A STATIC modifier authorable on an ITEM — `zStatModifier` plus the item range
 * band plus the SAME 職業限定閘 the hooks carry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE GATE IS ON THE MODIFIER AND NOT A SECOND `modifiersByAttackType` MAP
 *
 * The card this exists for is 貫雷槍 (godie-i01g): 「[伸長] 近戰攻擊距離+4；
 * 遠戰攻擊距離+2」 — ONE weapon whose STAT BLOCK differs by the wielder's body.
 * `requiresAttackType` (#189) cannot say it (it gates whether the card may be
 * DEALT, all-or-nothing), and `zItemHookDef.requires` cannot say it either
 * (it gates a HOOK, and a permanent +4 range is not an event).
 *
 * Two shapes could: a parallel map (`modifiersByAttackType: {melee, ranged}`),
 * or the gate on each entry. This is the entry-gate, for three reasons:
 *
 *   1. ONE VOCABULARY. `zClassRequirement` already spells 近戰/遠程 AND
 *      力/敏/智 AND the block/reduced mismatch mode, and `requirement.ts` is
 *      already the single definition of 「這位英雄配不配」. A parallel map would
 *      be a SECOND axis vocabulary that can express only one of those axes, and
 *      「法師專用 +40 AP」 would then need a third field.
 *   2. ONE PLACE MODIFIERS LIVE. Every consumer of `ItemDef.modifiers` — the
 *      shop shelf, the 三選一 card, the equipment tooltip, the codex, the AEP
 *      rescale tool — reads that one array today. A second array is a second
 *      thing each of them must learn about, and the ones that forget silently
 *      under-report the item (失敗形態 ③).
 *   3. IT DEGRADES TO NOTHING. `requires` absent = no constraint, so all 218
 *      other item docs parse and behave byte-identically.
 *
 * ⚠️ RESOLVED AT EQUIP TIME, NOT PER TICK — see `sim/economy/itemSource.ts`.
 * The runtime `ModifierSource.modifiers` the sim aggregates stays a plain
 * `StatModifier[]` with the gate already applied, so nothing in the hot stat
 * loop learns a new concept and no panel can read the unresolved list by
 * accident.
 */
export const zGatedItemStatModifier = zStatModifierFields
  .extend({ requires: zClassRequirement.optional() })
  .strict()
  .superRefine(refineStatModifierFrom)
  .superRefine(refineItemModifierBand);

/**
 * 三圍加成 — `item@1.attributes`, mirroring `AttrGrant` in
 * sim/stats/attributes.ts. 四魂之玉 「力敏智+30」 → `{str:30,agi:30,int:30}`;
 * 朗基努斯之槍 「力量+12 敏捷+12」 → `{str:12,agi:12}`.
 *
 * `.strict()`, and every key optional, because 「力量+12 敏捷+12」 says nothing
 * about 智慧 and an explicit `int: 0` is a number somebody later "corrects".
 * `.refine` rejects `{}`: an EMPTY block is the tier-5 defect this whole lane
 * exists to close — a field that looks authored and pays nothing.
 *
 * BOUNDS come from `ATTR_GRANT_MIN`/`MAX` in sim/stats/attributes.ts, where the
 * reasoning lives (floor 0 because a large negative AGI silently zeroes attack
 * speed through the one MULTIPLICATIVE derivation row; ceiling 500 ≈ 16× the
 * largest authored line, to catch a ×100 typo or a raw un-normalised w3x field
 * rather than to express a balance opinion).
 *
 * ⚠️ NOT `.int()`. The 能力屬性強化 三選一 pays 0.1–2.0 per pick (#260), so
 * fractional 三圍 are already normal in a live match and an integer-only item
 * field would be a second, contradictory rule about what an attribute is.
 */
export const zItemAttributes = z
  .object({
    str: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
    agi: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
    int: z.number().min(ATTR_GRANT_MIN).max(ATTR_GRANT_MAX).optional(),
  })
  .strict()
  .refine((a) => a.str !== undefined || a.agi !== undefined || a.int !== undefined, {
    message: "attributes must grant at least one of str/agi/int",
  });

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

/**
 * 套裝 —— 「同時裝備死之王長槍、意志、神盾，則總 AP 額外 + 100%」.
 *
 * Mirrors `ItemSetBonus` in `sim/content/defs.ts`; the MECHANISM (one source per
 * set, reconciled on every equip/unequip) and the reason it is authored HERE
 * rather than in a `config.*@1` doc are argued in `sim/economy/itemSets.ts`.
 *
 * ⚠️ THE BLOCK IS REPEATED ON EVERY PIECE, identically. That mirrors owner's own
 * prose, which repeats the clause on all three cards, and it is what lets the
 * sim see a set from any piece in the bag. `activeItemSets` de-duplicates by
 * `id`, so repeating it does NOT repeat the reward.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY DECISION HERE IS A FIELD, AND EVERY NUMBER HAS BOTH BOUNDS
 * (CLAUDE.md 第一守則 + 「欄位要有上界，不是只有下界」)
 *
 *   · `requiredPieces` — 「幾件才算一套」. Absent = ALL of them, the strictest
 *     reading of 「同時裝備」 and therefore the conservative default. Bounded
 *     2..6 AND `<= pieces.length`: the ceiling catches the mis-parse that costs
 *     the most, a `requiredPieces` larger than the set (or larger than the
 *     backpack), which produces a clause that can NEVER pay and says nothing
 *     about it — CLAUDE.md 失敗形態 ②.
 *   · `countDuplicates` — 「同一件帶兩份算兩件嗎」. Absent = false: a set is
 *     about DISTINCT pieces, so it can never be completed by stacking one item.
 *     The permissive reading is one boolean away.
 *   · `enabled` — the off switch, so a set can be retired without deleting it
 *     (same argument as `draftEligible`). Absent = TRUE: an off switch that
 *     defaults to off is a mechanism that never happens.
 *   · `pieces` — 2..6. Two because a one-piece 「set」 is just a modifier on that
 *     item; six because that is the inventory size (`INVENTORY_SLOTS`) and a
 *     seven-piece set is unreachable by construction.
 *
 * The reward reuses `zGatedItemStatModifier`, so a set bonus inherits the item
 * range band AND the 職業限定閘 with no new vocabulary — 「套裝加成，限法師」 is
 * already authorable.
 */
export const zItemSetBonus = z
  .object({
    id: zId.describe("套裝 id。每一件成員都要寫同一個 id —— 獎勵只會依這個 id 發一次。"),
    name: z
      .string()
      .min(1)
      .max(40)
      .optional()
      .describe("套裝名（卡片/提示會顯示），例如「死之王套裝」。留空 = 只顯示效果。"),
    pieces: z
      .array(zIdFor<ItemId>())
      .min(ITEM_SET_MIN_PIECES)
      .max(ITEM_SET_MAX_PIECES)
      .describe("哪些道具算這一套。必須包含這份文件自己，而且每一件都要重複同一個 sets 區塊。"),
    requiredPieces: z
      .number()
      .int()
      .min(ITEM_SET_MIN_PIECES)
      .max(ITEM_SET_MAX_PIECES)
      .optional()
      .describe(
        "要湊幾件才生效。留空 = 全部（最嚴格的讀法）。填比 pieces 少 = 部分套裝加成；" +
          "不能填得比 pieces 多，那樣這一條永遠不會生效。",
      ),
    countDuplicates: z
      .boolean()
      .optional()
      .describe(
        "同一件帶兩份算不算兩件。留空 = 不算（一套講的是不同的件數），所以不可能靠疊同一件湊滿。",
      ),
    enabled: z
      .boolean()
      .optional()
      .describe("套裝總開關。留空 = 開。關掉之後這一套就不再生效，但文件與文案都留著。"),
    modifiers: z
      .array(zGatedItemStatModifier)
      .min(1)
      .describe("湊齊之後持有者拿到的加成。只發一次，不是每件一份。"),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (new Set(s.pieces).size !== s.pieces.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pieces"],
        message:
          "pieces 有重複的 id —— 一件道具在同一套裡只能算一件，" +
          "想讓「帶兩份算兩件」請用 countDuplicates",
      });
    }
    if ((s.requiredPieces ?? s.pieces.length) > s.pieces.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredPieces"],
        message:
          `requiredPieces ${s.requiredPieces} 大於 pieces 的件數 ${s.pieces.length} —— ` +
          "這一套永遠湊不齊，卡片上的那一行會是一句永遠不兌現的承諾",
      });
    }
  });

/**
 * 傷害型別轉換 —— mirrors `DamageTypeOverride` in
 * `sim/combat/damageTypeOverride.ts`, which is where the mechanism and every
 * one of these three decisions is argued out.
 *
 * 四個欄位對應這一族的四個問題:
 *   · `scope`      —— 霸王破甲槍/死之王的長槍 換的是**普攻**,惡夢魔王碎片 換的是
 *                     **技能**(⚠️ 含技能留下的延燒每一跳 —— owner 2026-08-01
 *                     「技能留下的延燒算不算技能傷害? => yes」)。這個差別是設計
 *                     本身,所以它是一個必填欄位而不是兩條程式路徑。
 *   · `becomes`    —— 出貨三件都是 `"true"`。做成完整的 `DamageType` 而不是
 *                     `toTrue: boolean`,是因為 WC3 有一整族「物理↔魔法」轉換的
 *                     道具用同一個機制就寫得出來。
 *   · `applyAt`    —— 相對於無敵/閃避兩道閘的先後。省略 = `"afterGates"`,也就是
 *                     **只**跳過護甲/魔抗與護盾型別過濾,不順便無效化魔法免疫。
 *   · `impactType` —— 換完之後**擊倒**讀哪一個型別。省略 = `"original"`,也就是
 *                     轉換不會偷偷送出一個沒有人設計過的硬控。
 *
 * ⚠️ 為什麼沒有「上下界」可以標:這四個欄位**沒有一個是數字**,全部是封閉的
 * 列舉,而 `.strict()` + `z.enum` 就是它們的上下界 —— 打錯一個字的
 * `scope: "basics"` 會在載入時就被擋掉,而不是變成一件安靜地什麼都不做的武器。
 * 這一族真正的「誤植會很貴」風險不是數量級,是**範圍**:把 `"basic"` 打成
 * `"all"` 會讓技能、技能的延燒、道具 proc(`hook:`)、小怪與守衛塔封包**全部**
 * 一起變成真傷。列舉沒辦法擋這種誤植,所以擋它的是守衛 ——
 * `sim/combat/damageTypeOverride.shipped.test.ts` 逐件釘死出貨的 scope,
 * 新增或改動任何一件都會紅。
 */
export const zItemDamageTypeOverride = z
  .object({
    scope: z
      .enum(["basic", "ability", "all"])
      .describe(
        "換哪些傷害:basic = 普通攻擊(近戰與遠程投射物都算)、" +
          "ability = 技能,含技能留下的延燒/中毒每一跳、" +
          "all = 這件裝備的持有者打出去的每一發(額外含道具觸發、小怪與守衛塔封包)。",
      ),
    becomes: zDamageType.describe(
      "換成什麼型別。true = 真實傷害(完全跳過護甲與魔抗,而且只有不指定型別的護盾吃得到)。",
    ),
    applyAt: z
      .enum(["afterGates", "beforeGates"])
      .optional()
      .describe(
        "什麼時候換。afterGates(預設)= 無敵/免疫與閃避先用原本的型別判定,轉換只影響護甲魔抗與護盾;" +
          "beforeGates = 連免疫與閃避也用新型別判定(例:被轉成真傷的法術,魔法免疫就擋不住了)。",
      ),
    impactType: z
      .enum(["original", "converted"])
      .optional()
      .describe(
        "換完之後,擊倒判定讀哪一個型別。original(預設)= 讀轉換前的型別 —— " +
          "被轉成真傷的法術跳過魔抗,但不會因此多出一個它本來沒有的擊倒;" +
          "converted = 讀轉換後的型別,也就是「轉真傷順便附贈擊倒」。",
      ),
  })
  .strict();

/**
 * 格擋 —— mirrors `BlockGrant` in `sim/combat/block.ts`, which is where the
 * mechanism, the WC3 evidence and every one of these decisions is argued out.
 *
 * 四支出貨道具、三種讀法、一組軸:
 *   奇門盾甲   `{damageTypes:["physical","magic"], chance:0.5, fraction:1}`
 *   黃金聖鬥衣 `{damageTypes:["magic"],            chance:0.5, fraction:1}`
 *   晨曦之光/殺豬刀 `{damageTypes:[…三種都列], chance:0.3, fraction:1, lethalOnly:true,
 *                    internalCooldown:1}`
 *
 * ⚠️ 上下界不是裝飾,每一個都擋一種真的會發生的誤植:
 *   · `chance` / `fraction` 上界 **1** —— 文案寫的是「50%」「30%」,而一個把
 *     百分比直接抄進來的 `0.5 → 50` 在沒有上界時就是**永遠觸發**(`chance`)或
 *     **把傷害變成治療**(`fraction > 1` ⇒ `impact - cut < 0`)。上界 1 讓這種
 *     誤植在**載入時**就紅,而不是在某一場比賽裡變成一個無敵的玩家。
 *   · `chance` / `fraction` 下界 **>0**(`.positive()`)—— `0` 是一個合法但
 *     **會說謊**的值:卡片上寫著 [格擋],骰子照抽、擋格語音照喊,傷害一點沒少。
 *     這正是這一批要消滅的「描述承諾了、資料沒有付」再往下一層。
 *   · `damageTypes` 必填且 `.min(1)` —— 「真實傷害無法阻擋」必須是這個陣列的
 *     內容,不是程式裡的一行 `if`;而空陣列是一件永遠不會觸發的裝備。
 *   · `internalCooldown` 上界 **300 秒** —— owner 選的是 1 秒,w3x 原作那兩支是
 *     Cool 45 / Cool 100,所以 300 是「這是誤植不是設計」的那條線(把 1 打成
 *     1000 = 這件裝備一整場只擋一次,而畫面上完全看不出來),不是平衡政策。
 *     下界 0 是合法且有意義的(= 沒有冷卻),所以是 `.min(0)` 不是 `.positive()`。
 */
export const zItemBlockGrant = z
  .object({
    damageTypes: z
      .array(zDamageType)
      .min(1)
      .describe(
        "這個格擋擋得住哪些傷害型別。想表達「真實傷害無法阻擋」就**不要**把 true 列進來 —— " +
          "擋不擋真傷是這個欄位的內容,不是寫死的規則。",
      ),
    chance: z
      .number()
      .positive()
      .max(1)
      .describe("觸發機率,0~1(0.5 = 50%)。每一發合格的傷害各抽一次,抽中才擋。"),
    fraction: z
      .number()
      .positive()
      .max(1)
      .describe(
        "抽中時擋掉這一發的幾成,0~1(1 = 整包擋掉)。擋掉的部分不會進護盾池,也不會扣血;" +
          "沒擋掉的部分照常走護盾與血條。",
      ),
    lethalOnly: z
      .boolean()
      .optional()
      .describe(
        "只擋「會殺死我」的那一發(抵擋致命一擊)。留空 = 每一發合格的傷害都可能被擋。",
      ),
    lethalBasis: z
      .enum(["hp", "hpAndShields"])
      .optional()
      .describe(
        "致死怎麼算:hpAndShields(預設)= 血 + 這一發吃得到的護盾,也就是「這一發真的會殺死我嗎」;" +
          "hp = 只看血條(文案的字面讀法)。只有 lethalOnly 打開時才有意義。",
      ),
    internalCooldown: z
      .number()
      .min(0)
      .max(300)
      .optional()
      .describe(
        "內部冷卻(秒):這件擋中一次之後,要隔多久才能再擋一次。留空 / 0 = 沒有冷卻," +
          "每一發合格的傷害都各抽一次(奇門盾甲、黃金聖鬥衣就是這樣)。" +
          "抽輸不會進冷卻,只有真的擋中才會。",
      ),
  })
  .strict();

/**
 * [暴擊吸血] —— mirrors `CritStrikeGrant` in `sim/combat/critStrike.ts`, which is
 * where the mechanism and every one of these decisions is argued out.
 *
 * 一支出貨道具、五根軸:天堂之劍 godie-i01n
 * `{chance:0.06, damageMult:10, lifestealFraction:1}`.
 *
 * ⚠️ 上下界不是裝飾,每一個都擋一種真的會發生的誤植:
 *   · `chance` 上界 **1** —— 文案寫的是「6%」,一個把百分比直接抄進來的
 *     `0.06 → 6` 在沒有上界時就是**每一發都 10 倍而且回滿血**。
 *   · `chance` / `lifestealFraction` 下界 `.positive()` / `.min(0)` ——
 *     `chance: 0` 是一個合法但**會說謊**的值:卡片上寫著 [暴擊吸血],骰子照抽,
 *     什麼都不會發生。`lifestealFraction: 0` 反而是合法且有意義的(一個只給
 *     倍率、不給吸血的 grant),所以那一格的下界是 0 不是正數。
 *   · `damageMult` 下界 **1** —— 小於 1 的「暴擊」會讓暴擊比普通攻擊還弱,
 *     那不是平衡選擇,那是把 10 打成 0.1。
 *   · `damageMult` 上界 **50** —— 出貨最強是 10。50 是「這是誤植不是設計」的
 *     那條線(把 10 打成 100 會被擋在載入時),而不是平衡政策;真的要更高是
 *     這裡一行,改的人知道自己在改什麼。
 */
export const zItemCritStrike = z
  .object({
    chance: z
      .number()
      .positive()
      .max(1)
      .describe("觸發機率,0~1(0.06 = 6%)。每一次普攻(近戰揮擊/遠程射出)各抽一次。"),
    damageMult: z
      .number()
      .min(1)
      .max(50)
      .describe(
        "抽中時這一發的**總**倍率(10 = 10倍),不是加在暴擊傷害屬性上的增量。" +
          "和英雄自己的暴擊傷害**取大的那一個**,不相乘。",
      ),
    lifestealFraction: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "抽中時吸回**真的從血條掉下來的量**的幾成,0~1(1 = 100%)。" +
          "打在護盾上被吃掉的部分不算,和一般吸血同一個基數。",
      ),
    empowers: z
      .enum(["ownProcOnly", "everyCrit"])
      .optional()
      .describe(
        "倍率與吸血套用在哪些暴擊上:ownProcOnly(預設)= 只有這件裝備自己抽中的那一發;" +
          "everyCrit = 這一發只要是暴擊就算(包含英雄自己暴擊率骰出來的)。" +
          "預設選較弱的那一個 —— 一個已經堆滿暴擊率的英雄不會因為撿到它就整場 10 倍。",
      ),
    lifestealMode: z
      .enum(["replace", "add"])
      .optional()
      .describe(
        "這一發的吸血怎麼結合持有者原本的吸血:replace(預設)= 直接用上面那個比例;" +
          "add = 加在原本的吸血上面。預設 replace 是較弱的那一個。",
      ),
  })
  .strict();

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
    /**
     * Range-guarded: see `refineItemModifierBand` for why items get their own
     * band, and {@link zGatedItemStatModifier} for the per-entry 職業限定閘 that
     * lets ONE weapon carry 「近戰攻擊距離+4；遠戰攻擊距離+2」.
     */
    modifiers: z.array(zGatedItemStatModifier).optional(),
    /**
     * 三圍加成 — 力/敏/智 granted while this item is equipped.
     * 四魂之玉 (godie-i00z) 「力敏智+30」, 朗基努斯之槍 (godie-i018) 「力量+12
     * 敏捷+12」. See {@link zItemAttributes} for the bounds and their reasons,
     * and `sim/stats/attrSources.ts` for the mechanism.
     *
     * WHY IT IS NOT A `modifiers` ENTRY. 力/敏/智 are not members of `Stat`
     * (`sim/stats/statTypes.ts`); they are the champion attribute model, and one
     * point of AGI feeds armor ADDITIVELY but attack speed MULTIPLICATIVELY on
     * the champion's own base. `zStatModifier` has one `value` and one `op` and
     * cannot say that. Authoring the nine equivalent stat modifiers instead
     * would bake TODAY's combat-env coefficients into the document, so retuning
     * 智慧→魔抗 in the 戰鬥系統 console would silently stop moving this item.
     */
    attributes: zItemAttributes.optional(),
    /**
     * 套裝 (see {@link zItemSetBonus}) — 「同時裝備 A、B、C，則…」, the ONLY
     * clause on any of the 49 legendaries whose condition is WHAT ELSE IS IN THE
     * BACKPACK. Absent on every doc that predates it.
     *
     * The whole array must be REPEATED, identically, on every id in `pieces` —
     * `zItemDef`'s refine below rejects a block that forgets to list its own
     * document, and `sim/economy/itemSets.auditItemSets` (guarded by
     * `content/legendaryItemSets.test.ts`) catches the pieces that forget to
     * repeat it.
     */
    sets: z.array(zItemSetBonus).min(1).optional(),
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
     * 隱形 / 真視 this item grants while equipped — the SAME `VisionGrant` an
     * ability passive rank carries (sim/stealth.ts).
     *
     * WHY IT HAD TO BE A THIRD PAYLOAD, next to `modifiers` and `auras`:
     * 「看不看得見」 is not a number on a stat table and is not projected onto
     * anybody else, which is verbatim the reason `AbilityPassiveRank` needed it.
     * The three owner 2026-08-01 items that need it prove the same point —
     * 至尊魔戒 「永久隱身」, 晨曦之光 「看穿隱形」 — and before this field they
     * were empty promises: the sim has had `syncVisionGrants` since 2026-07-30,
     * but it walks `StatsComp.sources`, and NO item could put a `vision` on one.
     *
     * ⚠️ Nothing new in the sim. `syncVisionGrants` (sim/stealth.ts) already
     * reads `src.vision` off EVERY ModifierSource regardless of `kind`, so the
     * whole cost of this field is forwarding it in `economy/itemSource.ts`.
     * That is also why it is safe: the stacking rule (shortest fade wins,
     * largest true-sight radius wins) is the existing one, unchanged.
     */
    vision: zVisionGrant.optional(),
    /**
     * 飛行 (無視碰撞) this item grants while equipped — the same `FlightGrant`
     * an ability passive rank carries (sim/flight.ts). 天叢雲劍's 「[飛昇] 移動
     * 轉變為無視碰撞的飛行形態」 is the first item to want it.
     *
     * Same argument as `vision` directly above, and the same near-zero cost:
     * `syncFlightGrants` already walks `StatsComp.sources` for `src.flight`.
     */
    flight: zFlightGrant.optional(),
    /**
     * 傷害型別轉換 while equipped — 無視防禦 / 真實傷害家族。
     *
     * 這是三份 authoringNote 一直登記為「仍缺」的那個原語:
     * 霸王破甲槍「[無視] 普攻無視敵方防禦真實傷害」、
     * 死之王的長槍「[無視] 普通攻擊無視防禦給予傷害」、
     * 惡夢魔王碎片「[真實傷害] 所有裝備者技能傷害都轉為真實傷害」。
     *
     * ⚠️ 兩份 authoringNote 建議的實作方式(「由 BasicAttackSystem 組封包時
     * 讀」)**是錯的接縫**,而且錯法可以數出來:普攻自己就有兩個 push 站點,
     * 近戰在 `BasicAttackSystem`、遠程在 `ProjectileSystem`,所以那個做法會讓
     * 遠程英雄拿到一件完全沒有效果的武器。真正的接縫是傷害佇列 ——
     * 見 `sim/combat/damageTypeOverride.ts` 檔頭 ②。
     */
    damageTypeOverride: zItemDamageTypeOverride.optional(),
    /**
     * 格擋 —— 「擋下一部分/整發傷害」的機率門。四支傳說武器共用同一組軸,
     * 見 {@link zItemBlockGrant} 與 `sim/combat/block.ts` 的檔頭。
     *
     * ⚠️ 它**不是** `evasion`。迴避是「這一下沒有打到我」(整包消失、on-hit 不
     * 觸發、只作用在普攻);格擋是「打到了,被我擋下來」—— 打擊感、擋格火花、
     * 格擋語音、on-hit 觸發全部照常,而且對技能傷害一樣有效。
     */
    block: zItemBlockGrant.optional(),
    /**
     * [暴擊吸血] —— 天堂之劍 godie-i01n 「6%機率造成10倍暴擊傷害，暴擊時吸血
     * 回復100%傷害」。見 {@link zItemCritStrike} 與 `sim/combat/critStrike.ts`
     * 的檔頭。
     *
     * ⚠️ 它**取代**了那一行原本的兩條 modifier(`critChance` + `critDamage`)。
     * 兩者不可並存:一起寫等於 12% 的暴擊率,而其中一半還是舊語意(所有暴擊都
     * 10 倍)。`content/legendaryCritStrike.test.ts` 逐件釘死這一點。
     */
    critStrike: zItemCritStrike.optional(),
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
