/**
 * offerEligibility — 「這件武器可以發給這個英雄嗎」, in ONE place.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS ITS OWN MODULE (#189)
 * ---------------------------------------------------------------------------
 * owner 2026-07-28:「傳說武器三選一…只出現在近戰英雄」. The legendary pool had
 * no attack-type dimension at all — and it is rolled from TWO places:
 *
 *   · `economy/draft.offerItems`        the round weapon card (arena-rules)
 *   · `economy/legendaryOrb.legendaryPool`  the 2400g 傳說寶玉 roll
 *
 * Both filtered on ownership + operator whitelist + craftRole and nothing else.
 * Adding the melee gate to only one of them is the obvious way to ship a
 * half-fix: the card would respect it and the orb would not, and the orb is the
 * path the owner explicitly said the legendaries live behind. So the predicate
 * lives here and BOTH import it — there is no second copy to forget.
 *
 * ---------------------------------------------------------------------------
 * IT GATES THE OFFER, NOT THE INVENTORY
 * ---------------------------------------------------------------------------
 * Nothing re-checks `requiresAttackType` after the item is in a slot. A ranged
 * champion can never be OFFERED a melee-only weapon, but an item already held
 * keeps working — deleting somebody's weapon mid-match because a form-swap
 * changed their attack type would be a much worse bug than the one this fixes.
 *
 * PURITY: pure reads of world components + the content registry. No rng, no
 * clock — the filter runs BEFORE the roll, so it cannot perturb `world.rng`
 * (post-filtering a rolled offer is exactly how task #47's empty cards
 * happened).
 */
import type { EntityId, ItemId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Champions, Items } from "../content/registry";

/**
 * This entity's attack type, or `null` when it is not a champion / its doc is
 * not registered. `null` means "unknown", and an unknown attack type passes
 * every gate below — a restriction is a statement about the CONTENT, and it
 * must never become a silent way to hand a test harness an empty pool.
 */
export function championAttackType(world: SimWorld, id: EntityId): "melee" | "ranged" | null {
  const champ = world.champion.get(id);
  if (!champ) return null;
  const def = Champions.tryGet(champ.championId);
  return def?.attackType ?? null;
}

/**
 * 哪些 `craftRole` 不可以被三選一發出去 —— 出貨值。
 *
 * ---------------------------------------------------------------------------
 * owner 2026-08-04:「**49支可被隨機三選一 就好**」
 * ---------------------------------------------------------------------------
 * 這一行**放寬**了 task #70 重開時加在 `economy/legendaryOrb.ts` 上的
 * 「第二道門」守衛。那道守衛把 `component` 也排除掉，於是 49 支傳說武器裡有
 * **8 支合成原料**（雅典娜的驚嘆號 / 名刀-天狼 / 熾天使之弓 / 緣一零式 /
 * 天叢雲劍 / 貫雷槍 / 祕銀鎖子甲 / 瑪那魔杖）**永遠**抽不到 2400 金傳說寶玉,
 * 只有第 2/5 回合的免費卡發得出來 —— 兩條門對同一份池子給出不同答案。
 *
 * 為什麼放寬 `component` 是對的（而不是把免費卡也一起關起來）：
 *
 *   1. **GGD 沒有合成系統。** owner 2026-07-22:「理論上競技場上的所有道具跟武器
 *      都不需要合成」(`curation/starter.go` 的合成段落引了原話)。所以
 *      `craftRole: "component"` 在這個遊戲裡是 WC3 匯入留下的**無效標記**,
 *      它描述的是一個不存在的系統裡的角色。
 *   2. **owner 親筆背書過全部 49 支。** `content/__fixtures__/legendary49OwnerText.json`
 *      是 owner 2026-08-01 逐支寫的「效能」文案,49 支一支不缺 —— 那就是核准。
 *   3. 那 8 支**每一支都有真的效果**（`itemHasEffect` 全過,我逐支驗過）,
 *      它們是「能用的武器,同時也是別人的材料」,不是空殼。
 *
 * ⛔ `token`（兌換券）與 `service`（商店服務）**留在排除名單裡**:
 * 它們在獎勵池裡是無意義的,而且今天的 49 支裡**一支都不是**
 * —— 所以留著它們的代價是零,拿掉它們的代價是一個沒有守衛的洞。
 *
 * ⚠️ **這是一個後台欄位不是一個常數**（第一守則）: `config.arena-rules@1`
 * 的 `itemDraft.excludedCraftRoles`。owner 想把 `component` 關回去,是**存檔**
 * 不是**部署**。
 *
 * ⚠️ **兩條門現在讀同一份清單。** 這正是 `legendaryOrb.ts` 檔頭與本檔檔頭
 * 都警告過的那件事:「只把閘加在其中一條路上,是最典型的半套修法」。
 */
export const DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES: readonly string[] = ["token", "service"];

/**
 * May `itemId` be OFFERED to `id`? Absent `requiresAttackType` (every pre-#189
 * doc) and absent `draftEligible` (every pre-2026-07-30 doc) = yes, for
 * everybody.
 *
 * THREE GATES, DELIBERATELY DIFFERENT SHAPES. `requiresAttackType` is about the
 * CARRIER (「這個英雄配不配得上這把武器」) and so consults the world;
 * `draftEligible` and `craftRole` are about the ITEM ALONE (「這件東西還能不能
 * 發出去」) and do not — a card that grants nothing but a penalty is a bad card
 * on every body. Order matters only for readability; all three must pass.
 *
 * ⚠️ `craftRole` 這一道**故意住在這裡而不是各門自己一份**: 在 2026-08-04 之前
 * 它只活在 `legendaryOrb.orbEligible` 裡,於是免費卡與寶玉對同一支道具給出不同
 * 答案。搬進來之後兩條門**結構上不可能再分岔**。
 */
export function itemOfferableTo(world: SimWorld, id: EntityId, itemId: ItemId): boolean {
  const def = Items.tryGet(itemId);
  if (!def) return false;
  // 抽卡池開關 (owner 2026-07-30). Explicit `false` only — `undefined` is the
  // shipped default for 200+ docs and must keep meaning "offerable".
  if (def.draftEligible === false) return false;
  // craftRole 排除清單 (owner 2026-08-04). `undefined` = legacy/skeleton doc,
  // 一律放行 —— 缺一個角色標記從來不是「不可以發」的證據。
  if (def.craftRole !== undefined && world.offerExcludedCraftRoles.includes(def.craftRole)) {
    return false;
  }
  const need = def.requiresAttackType;
  if (need === undefined) return true;
  const have = championAttackType(world, id);
  // Unknown attack type → do not filter. See `championAttackType`.
  return have === null || have === need;
}
