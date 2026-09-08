/**
 * ⭐ **靈基適性條件** —— 聖杯願望設計規則 §15「⛔ 禁止死願望」的機制本體。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要它（量到的，2026-08-17，⛔ 不是猜的）
 *
 * owner 的 60 張聖杯願望裡有一族是「**騎在別的機制上**」的：
 * 「成功迴避時⋯」「成功反彈時⋯」「敵人身上有燃燒時⋯」。這一族發給一位
 * **沒有那個機制**的英雄，就是一張玩家永遠按不到的卡 —— 而畫面上它跟正常的
 * 一模一樣（CLAUDE.md 七種失敗形態的第 ② 種）。
 *
 * 出貨內容量到的分佈：
 *
 * | 機制 | 有來源的內容 |
 * |---|---|
 * | 反彈 (`incomingPct`) | **全 repo 只有 1 支技能**（`godie-h00l.r`） |
 * | 迴避 | 9 支技能 + 2 件道具 |
 * | 燃燒 | 4 支技能 |
 * | 護盾 | 7 支技能 |
 * | 魔力 | 78 位英雄裡 **5 位沒有** |
 * | 遠程 | 78 位裡 23 位 |
 *
 * ⇒ 沒有這道閘，「反彈成功時⋯」那兩張願望對 **77/78** 的英雄是死的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼機制名是一個**封閉列舉**，而不是自由字串
 *
 * 自由字串（或「讀 `tags`」）在這裡會安靜地失敗，而且我真的量過：
 * `content/abilities/*.json` 461 份**一份都沒有 `tags` 欄位**，
 * `content/items/*.json` 的 tags 有 208/219 是 `wc3-import` 這種匯入痕跡。
 * 用 tag 當謂詞的話，每一條「需要迴避來源」都會回 false，於是 50 張願望
 * **一張都不會出現**，而且沒有任何東西會紅。
 *
 * 所以這裡的每一個名字都必須**有一條真的走內容的推導**（見 {@link MECHANIC_PROBES}）。
 * 封閉列舉 = 願望寫不出一個引擎答不出來的條件。⛔ 這是刻意的取捨：
 * 開放架構屬於 `status-effect.tags`（那裡的消費者是條件葉，缺席只是比不中），
 * 這裡的消費者是**一張卡出不出得來**，答不出來就等於靜默放行。
 *
 * ⭐ 要加一個機制：在 {@link GRAIL_MECHANICS} 加名字、在 {@link MECHANIC_PROBES}
 * 加那一條推導。兩處缺一，TypeScript 的 `Record<GrailMechanic, …>` 就不編譯 ——
 * 這是本檔唯一需要的守衛（第零守則⑨：一份模板 + 一張表）。
 */
import type { EntityId } from "../../ids";
import type { CoreAbilitySlot } from "../intents";
import type { SimWorld } from "../SimWorld";
import { Abilities, Augments, Champions, Items } from "../content/registry";
import { Stat } from "../stats/statTypes";
import type { GrailEligibility, GrailMechanic, GrailModeFeature } from "./grailVocabulary";

// ⛔ 詞彙（兩個列舉 + `GrailEligibility`）住在 `grailVocabulary.ts`，那是一支
// **零 import** 的葉子。理由寫在它的檔頭：Zod schema 也要讀同一份，而 schema
// 直接 import 這一支會拉出 `schema → sim → schema` 的循環（＝某個打包順序下
// 整張效果表變成執行期 undefined）。這裡原樣轉出，呼叫端不需要知道分兩支。
export {
  AUGMENT_SELECTION_SLOTS,
  GRAIL_MECHANICS,
  GRAIL_MODE_FEATURES,
} from "./grailVocabulary";
export type {
  AugmentSelectionSlot,
  GrailEligibility,
  GrailMechanic,
  GrailModeFeature,
} from "./grailVocabulary";

// ─────────────────────────────────────────────────────────────────────────────

/** 一條推導：`match` 認得出簽名，`scope` 說去哪裡找。 */
interface MechanicProbe {
  /** `abilities` = 只看六格技能；`owned` = 技能 + 道具 + 已刻印的願望。 */
  readonly scope: "abilities" | "owned";
  readonly match: (node: Record<string, unknown>) => boolean;
}

/**
 * ⭐ **一張表，六條推導。** 每一條都對著出貨內容真的長的樣子。
 *
 * ⚠️ `reflect` 認的是 `damage.incomingPct` —— 反彈在這個引擎裡**不是**一個
 * `Stat`、也不是一個 effect kind，它是傷害效果上的一格
 * （見 `sim/systems/ReflectHookSystem.ts` 的「反彈成功的定義」）。
 * 掃 `stat === "reflect"` 會回一個永遠是 false 的答案。
 */
const MECHANIC_PROBES: Record<GrailMechanic, MechanicProbe> = {
  evasion: {
    scope: "owned",
    match: (n) => n["stat"] === Stat.Evasion && typeof n["value"] === "number" && n["value"] > 0,
  },
  reflect: {
    scope: "owned",
    match: (n) => n["kind"] === "damage" && n["incomingPct"] !== undefined,
  },
  burn: {
    scope: "owned",
    match: (n) => n["kind"] === "applyStatus" && n["statusId"] === "burn",
  },
  shield: {
    scope: "owned",
    match: (n) => n["kind"] === "shield",
  },
  flight: {
    scope: "owned",
    match: (n) => n["flight"] !== undefined,
  },
  abilityDamage: {
    scope: "abilities",
    match: (n) =>
      n["kind"] === "damage" || n["kind"] === "damageArea" || n["kind"] === "damageLine",
  },
};

/** 深走一份文件找簽名。命中就短路 —— 一份文件只回答「有沒有」。 */
function containsSignature(node: unknown, match: MechanicProbe["match"]): boolean {
  if (Array.isArray(node)) {
    for (const child of node) if (containsSignature(child, match)) return true;
    return false;
  }
  if (node === null || typeof node !== "object") return false;
  const rec = node as Record<string, unknown>;
  if (match(rec)) return true;
  for (const value of Object.values(rec)) if (containsSignature(value, match)) return true;
  return false;
}

/** 這位英雄的六格技能定義（缺席的格子跳過）。 */
function abilityDefsOf(world: SimWorld, entity: EntityId): unknown[] {
  const comp = world.abilities.get(entity);
  if (!comp) return [];
  const out: unknown[] = [];
  const push = (abilityId: string | undefined): void => {
    if (abilityId === undefined) return;
    const def = Abilities.tryGet(abilityId as never);
    if (def !== undefined) out.push(def);
  };
  // ⛔ 固定順序（Q W E R + EX + 天生技）—— `sim/**` 禁止未排序的 Map 迭代，
  // 而這裡短路回傳，順序會影響「走了幾個節點」以外的東西時就是不決定性。
  for (const slot of ["Q", "W", "E", "R"] as const) push(comp.slots[slot]?.abilityId);
  push(comp.exSlot?.abilityId);
  push(comp.passiveSlot?.abilityId);
  return out;
}

/** 這位英雄**擁有**的全部內容：六格技能 + 背包道具 + 已刻印的願望。 */
function ownedDefsOf(world: SimWorld, entity: EntityId): unknown[] {
  const out = abilityDefsOf(world, entity);
  const champ = world.champion.get(entity);
  if (!champ) return out;
  for (const itemId of champ.items) {
    if (itemId === null) continue;
    const def = Items.tryGet(itemId);
    if (def !== undefined) out.push(def);
  }
  for (const augmentId of champ.augments) {
    const def = Augments.tryGet(augmentId);
    if (def !== undefined) out.push(def);
  }
  return out;
}

/** 這位英雄身上有沒有這個機制。 */
export function hasMechanic(world: SimWorld, entity: EntityId, mechanic: GrailMechanic): boolean {
  const probe = MECHANIC_PROBES[mechanic];
  const docs = probe.scope === "abilities" ? abilityDefsOf(world, entity) : ownedDefsOf(world, entity);
  for (const doc of docs) if (containsSignature(doc, probe.match)) return true;
  return false;
}

/**
 * 這一場**有哪些模式特徵**。
 *
 * ⚠️ `team` 問的是「這位英雄有沒有隊友」而不是「設定上 teamSize > 1」——
 * 兩者在 1v1 測試房與真的少一個人的房間裡會給不同的答案，而「隊友死亡時⋯」
 * 那三張願望在**沒有隊友**的時候是死的，不管設定寫幾。
 */
export function modeFeaturesFor(world: SimWorld, entity: EntityId): ReadonlySet<GrailModeFeature> {
  const out = new Set<GrailModeFeature>();
  if (world.fireRingRules !== null) out.add("fireRing");
  if (world.reviveRules !== null) out.add("revive");
  if (world.mobRules !== null) {
    out.add("mobs");
    if (world.mobRules.boss !== null && world.mobRules.boss.enabled) out.add("boss");
  }
  if (world.flowerRules !== null || world.guardianRules !== null) out.add("neutralObjects");
  const mine = world.team.get(entity);
  if (mine !== undefined) {
    for (const [other, team] of world.team) {
      if (other === entity || team.teamId !== mine.teamId) continue;
      if (!world.champion.has(other)) continue;
      out.add("team");
      break;
    }
  }
  return out;
}

/** 敵方陣營裡有沒有人帶著這個機制。 */
function anyEnemyHas(world: SimWorld, entity: EntityId, mechanics: readonly GrailMechanic[]): boolean {
  const mine = world.team.get(entity);
  if (mine === undefined) return false;
  // ⛔ 排序後再走：`world.team` 是 Map，而 `sim/**` 的純度守衛禁止未排序迭代
  //（這裡雖然短路回傳布林，但兩個玩家的 Map 插入序不同就會走不同路徑）。
  const enemies = [...world.team.keys()]
    .filter((id) => world.team.get(id)!.teamId !== mine.teamId && world.champion.has(id))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const enemy of enemies) {
    for (const mechanic of mechanics) if (hasMechanic(world, enemy, mechanic)) return true;
  }
  return false;
}

/** 這位英雄學得到這一格技能嗎（`rank` 是 0 也算 —— 那是「還沒點」不是「沒有」）。 */
function hasSlot(world: SimWorld, entity: EntityId, slot: CoreAbilitySlot): boolean {
  const comp = world.abilities.get(entity);
  const instance = comp?.slots[slot];
  return instance !== undefined && Abilities.tryGet(instance.abilityId) !== undefined;
}

/**
 * ⭐ **這張願望對這位英雄活得起來嗎。** 這是 §15 的判定本體。
 *
 * ⛔ 回 false 就是「不進卡池」，⛔ 不是「權重降低」—— 一張按不到的卡不管權重
 * 多低都還是會被抽到，而它出現的那一回合玩家就少了一個選擇。
 */
export function grailWishEligible(
  world: SimWorld,
  entity: EntityId,
  eligibility: GrailEligibility | undefined,
  features: ReadonlySet<GrailModeFeature>,
): boolean {
  if (eligibility === undefined) return true;

  const self = eligibility.requiresSelfMechanic;
  if (self !== undefined && !self.some((m) => hasMechanic(world, entity, m))) return false;

  const exclude = eligibility.excludeSelfMechanic;
  if (exclude !== undefined && exclude.some((m) => hasMechanic(world, entity, m))) return false;

  const enemy = eligibility.requiresEnemyMechanic;
  if (enemy !== undefined && !anyEnemyHas(world, entity, enemy)) return false;

  if (eligibility.requiresMana === true) {
    const stats = world.stats.get(entity);
    if (stats === undefined || stats.final[Stat.MaxMana] <= 0) return false;
  }

  const all = eligibility.requiresAbilitySlots;
  if (all !== undefined && !all.every((s) => hasSlot(world, entity, s))) return false;

  const any = eligibility.requiresAnyAbilitySlot;
  if (any !== undefined && !any.some((s) => hasSlot(world, entity, s))) return false;

  const needed = eligibility.requiresModeFeature;
  if (needed !== undefined && !needed.every((f) => features.has(f))) return false;

  if (eligibility.onlyAttackType !== undefined) {
    const champ = world.champion.get(entity);
    const def = champ === undefined ? undefined : Champions.tryGet(champ.championId);
    if (def === undefined || def.attackType !== eligibility.onlyAttackType) return false;
  }

  return true;
}

/**
 * 軟偏好的權重倍率。命中 `prefersSelfMechanic` 的其中一個就乘上 `bonus`。
 *
 * ⚠️ 只乘**一次** —— 命中兩個不會乘兩次。理由是這一格是「這張卡跟你的
 * build 有連動」（§16 的第一願望），那是一個布林的觀察，不是一個可以疊的量。
 */
export function grailPreferenceMultiplier(
  world: SimWorld,
  entity: EntityId,
  eligibility: GrailEligibility | undefined,
  bonus: number,
): number {
  const prefers = eligibility?.prefersSelfMechanic;
  if (prefers === undefined || prefers.length === 0) return 1;
  return prefers.some((m) => hasMechanic(world, entity, m)) ? bonus : 1;
}
