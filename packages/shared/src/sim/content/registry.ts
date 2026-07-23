/**
 * Content registries — the lookup seam between the sim and content data.
 * The sim only ever reads via these; how they're populated (TS literals now,
 * JSON ContentLoader later) is invisible to engine code.
 */
import type { AbilityId, AugmentId, ChampionId, ItemId, ProjectileId } from "../../ids";
import type { AbilityDef, AugmentDef, ChampionDef, ItemDef, LootTable, ProjectileDef } from "./defs";

class Registry<K extends string, V> {
  private map = new Map<K, V>();

  register(id: K, v: V): void {
    this.map.set(id, v);
  }
  get(id: K): V {
    const v = this.map.get(id);
    if (!v) throw new Error(`content not registered: ${id}`);
    return v;
  }
  tryGet(id: K): V | undefined {
    return this.map.get(id);
  }
  all(): V[] {
    return [...this.map.values()];
  }
  ids(): K[] {
    return [...this.map.keys()];
  }
  clear(): void {
    this.map.clear();
  }
}

export const Champions = new Registry<ChampionId, ChampionDef>();
export const Abilities = new Registry<AbilityId, AbilityDef>();
export const Items = new Registry<ItemId, ItemDef>();
export const Augments = new Registry<AugmentId, AugmentDef>();
export const Projectiles = new Registry<ProjectileId, ProjectileDef>();
export const LootTables = new Registry<string, LootTable>();

const CORE_SLOTS = ["Q", "W", "E", "R"] as const;

export interface RegisterChampionOptions {
  /**
   * Let this champion's EMBEDDED ability copies REPLACE whatever is already in
   * the Abilities registry, instead of only filling the gaps in it.
   *
   * Off by default (see `registerChampion`). The editor's live preview turns it
   * on: there the champion document under edit IS the newest truth and must win
   * over whatever was loaded from disk at boot.
   */
  readonly overrideAbilities?: boolean;
}

/**
 * Copy of `authoritative` with every key it does NOT define taken from
 * `embedded`. Returns `authoritative` itself when nothing was missing, so the
 * common case allocates nothing and keeps object identity.
 */
function fillGaps<T extends object>(authoritative: T, embedded: T): T {
  let out: T | undefined;
  for (const k of Object.keys(embedded) as (keyof T)[]) {
    if (embedded[k] === undefined || authoritative[k] !== undefined) continue;
    (out ??= { ...authoritative })[k] = embedded[k];
  }
  return out ?? authoritative;
}

/**
 * Register a champion AND resolve its four core abilities.
 *
 * THE SHADOWING TRAP THIS FUNCTION EXISTS TO NOT BE.
 * Every Q/W/E/R ability is stored twice: standalone at
 * `content/abilities/<id>.json` and denormalised into its champion under
 * `abilities[<slot>]`. `registerAll` registers the standalone docs first and
 * then the champions, so for years this function's unconditional
 * `Abilities.register(def.abilities[slot])` silently OVERWROTE the standalone
 * doc with the embedded copy. A content editor who edited the standalone doc —
 * the natural thing to do, and what task #79's VFX re-point did — saw a green
 * test suite and ZERO change in a real match. That has now cost this project
 * five separate bugs.
 *
 * So: THE STANDALONE DOC IS THE SOURCE OF TRUTH. An embedded copy may only
 * fill in fields the standalone doc omits (which is how the two demo champions'
 * `castTimeSec` survives — their standalone JSON predates the field), never
 * overwrite one it defines. When no standalone doc exists at all — the
 * TS-literal skeleton path, where the champion object is the only definition —
 * the embedded copy is registered whole, exactly as before.
 *
 * The resolved ability objects are ALSO written back into the champion stored
 * in `Champions`, because a large amount of client code (HUD ability bar,
 * tooltips, icons, the bot brain) reads `Champions.get(id).abilities[slot]`
 * rather than the Abilities registry. Leaving those two disagreeing would just
 * move the shadow rather than kill it.
 */
export function registerChampion(def: ChampionDef, opts: RegisterChampionOptions = {}): void {
  const resolved: Partial<Record<(typeof CORE_SLOTS)[number], AbilityDef>> = {};
  let changed = false;

  for (const slot of CORE_SLOTS) {
    const embedded = def.abilities[slot];
    const registered = opts.overrideAbilities ? undefined : Abilities.tryGet(embedded.id);
    const winner = registered === undefined ? embedded : fillGaps(registered, embedded);
    Abilities.register(embedded.id, winner);
    resolved[slot] = winner;
    if (winner !== embedded) changed = true;
  }

  Champions.register(
    def.id,
    changed ? { ...def, abilities: { ...def.abilities, ...resolved } } : def,
  );
}
