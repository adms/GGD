/**
 * 一個 effect 節點的**子效果鏈**住在哪幾格 —— 一張**從 `EffectDef` 型別推導、
 * 兩個方向都關死**的表。
 *
 * ⛔ 這不是「再加一個名字」的地方。它存在的理由是 `abilityAugment.ts` 曾經手寫
 * 三個名字（`onHit` / `onLand` / `branches`），而引擎有十幾條子鏈 —— 於是
 * 70-002 樹海降臨「[千年練成] 追加 500% [AP] 傷害」整條發不出來：70-04 的傷害
 * 住在 `randomArea.effects[]`，那個名字不在清單上（失敗形態②：畫面上跟沒強化
 * 一模一樣，而 schema / 後台 / editorCapabilities 全部說它 supported）。
 *
 * ⚠️ **為什麼不用結構嗅探**（「任何一個物件陣列都走進去」）：
 * `EffectCommon.condition` 的 `all` / `any` 底下也是一串帶 `kind` 的物件，
 * `applyBuff.perRank[]` 與 `cycleBuff.steps[]` 底下也帶 `duration`。嗅探會走進
 * 這三處，而它們**不是效果**。名字表 + 型別閘既不會漏（漏 = 編譯紅）也不會多
 * （多 = 編譯紅），這就是「泛化」與「安全」不必二選一的那條路。
 */
import type { EffectDef } from "./effect";

/** 值**就是** `EffectDef[]` 的欄位名（union 逐成員算完再聯集）。 */
type DirectChainKey<T> = T extends unknown
  ? { [K in keyof T]-?: NonNullable<T[K]> extends readonly EffectDef[] ? K : never }[keyof T]
  : never;

/** 值是「一層包裝物件，`effects` 才是子鏈」的欄位名。 */
type WrappedChainKey<T> = T extends unknown
  ? {
      [K in keyof T]-?: NonNullable<T[K]> extends readonly { effects: EffectDef[] }[] ? K : never;
    }[keyof T]
  : never;

/**
 * 直接子鏈。⛔ 順序是固定的（`as const` tuple），⛔ 不可以改成 `Object.keys` ——
 * 後者的順序取決於 JSON 解析的插入序，而改寫是可觀測的（同一支多條 op 時後者
 * 覆蓋前者），順序不可以浮動（`sim/purity.test.ts` 的精神）。
 */
export const EFFECT_CHILD_CHAINS = [
  "effects", // randomArea · delayed
  "finalEffects", // delayed
  "onArrive", // blink
  "onDevour", // devour
  "onEnd", // dash
  "onHit", // spawnProjectile
  "onHitTargets", // damageArea · damageLine
  "onLand", // leap
] as const;

/** 包一層的子鏈（`{…, effects}` 的陣列）。 */
export const EFFECT_CHILD_CHAIN_WRAPPERS = [
  "branches", // weightedBranch —— { weight, effects }
  "hooks", // applyBuff —— HookDef（.effects）
] as const;

type Assert<T extends true> = T;
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * ⭐ **這兩行就是守衛的另一半，而且它跑在 `pnpm typecheck` 不是 vitest**：
 * 引擎多一條子鏈而表沒跟上 → `Eq` 是 `false` → `Assert` 的約束不成立 → 編譯紅；
 * 表上多一個引擎沒有的名字 → 同樣紅。⛔ 紅了不要 `// @ts-expect-error`，補表。
 */
export type _ChainKeysExhaustive = Assert<
  Eq<DirectChainKey<EffectDef>, (typeof EFFECT_CHILD_CHAINS)[number]>
>;
export type _WrapperKeysExhaustive = Assert<
  Eq<WrappedChainKey<EffectDef>, (typeof EFFECT_CHILD_CHAIN_WRAPPERS)[number]>
>;
