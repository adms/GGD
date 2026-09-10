/**
 * The TYPE seam between {@link EffectDef} and its handlers.
 *
 * Deliberately a TYPES-ONLY module with no runtime exports. `effectRegistry.ts`
 * imports every kind module and every kind module imports these types — if the
 * types lived in the registry that would be a genuine import cycle, and the one
 * that bites is not the compile error (there isn't one) but the runtime
 * `undefined` when a bundler picks the wrong initialisation order. Keeping the
 * shapes here makes the graph a tree: kinds → effectKind, registry → kinds.
 */
import type { EffectContext, EffectDef } from "./effect";

/** Narrow the union to one member by its `kind` tag. */
export type EffectOf<K extends EffectDef["kind"]> = Extract<EffectDef, { kind: K }>;

/**
 * Recurse a nested payload through cast-time baking. Passed IN to both `apply`
 * and `bake` rather than imported by them, which is what keeps
 * `effects/leap.ts` (and every future kind with a deferred payload) free of any
 * dependency on the baker — see the cycle note above. `leap.apply` needs it
 * because a leap resolves its `onLand` at TAKEOFF, not at touchdown (#247).
 */
export type BakeList = (effects: readonly EffectDef[], ctx: EffectContext) => EffectDef[];

/**
 * 用**這一次自己解出來的**目標集合再跑一段效果（G1 ②，`effect.target-set-chain@1`）。
 *
 * 與 {@link BakeList} 完全同一個理由**傳進來而不是 import**：handler 一旦
 * `import { runEffects }`，依賴圖就從 kinds → effectKind 的樹變成
 * kinds → effectRunner → registry → kinds 的環，而咬人的不是編譯錯誤（沒有），
 * 是 bundler 挑錯初始化順序時的 runtime `undefined`（見本檔檔頭）。
 */
export type RunList = (effects: readonly EffectDef[], ctx: EffectContext) => void;

/**
 * Everything the runner knows about ONE effect kind. One kind = one module =
 * one registry line, which is the whole point of the split: six lanes adding
 * six primitives no longer collide on a 500-line switch.
 */
export interface EffectKindSpec<K extends EffectDef["kind"]> {
  /**
   * Execute the effect against the world. Mutates only through the well-defined
   * paths (damage queue, shields, statuses, buff sources, dash overrides,
   * projectile spawns) — see the header of effectRegistry.ts.
   *
   * `bakeList` is only meaningful to a kind that LAUNCHES a deferred payload
   * (`leap`, `spawnProjectile`); `runList` only to a kind that resolves its own
   * victim set and hands it downstream (`damageArea` / `damageLine`, G1 ②).
   * Every other handler simply declares fewer parameters — TS assigns a
   * shorter function to the wider type, so adding this seam changed no existing
   * kind module.
   */
  apply: (e: EffectOf<K>, ctx: EffectContext, bakeList: BakeList, runList: RunList) => void;
  /**
   * OPTIONAL cast-time resolution, applied wherever an `EffectDef[]` stops
   * being immediate and becomes a promise (`leap.onLand`, `spawnProjectile
   * .onHit`). ABSENT = identity, which is the correct answer for a kind that
   * carries neither a conditional term nor a nested payload — it is not a
   * "not implemented yet" hole, so it must NOT throw.
   */
  bake?: (e: EffectOf<K>, ctx: EffectContext, bakeList: BakeList) => EffectDef;
}

/**
 * A handler for EVERY kind, enforced by the mapped type. Adding a member to
 * `EffectDef` and forgetting to register it is a COMPILE error, not a silent
 * no-op — the pre-split switch had no such guard (it had no `default`, so an
 * unhandled kind fell straight through and the effect simply never happened).
 */
export type EffectRegistry = { [K in EffectDef["kind"]]: EffectKindSpec<K> };
