/**
 * displayFinal — the ONE canonical "what the player actually gets" number.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS (task #125: 數字可信)
 * ---------------------------------------------------------------------------
 * Every combat quantity in the sim is scaled by task #28's global combat-env
 * multiplier table (`content/config/combat-env.json`, live-editable by an
 * operator). A base ability cooldown of 35s under `cooldown: 0.25` actually
 * fires at 8.75s — but a tooltip that echoes the authored `ability.cooldown`
 * shows 35s and LIES to the player by ~4×. Playtest caught exactly this on
 * 皮卡丘 十萬伏特 (冷卻 35 秒 shown, ~8.75s real).
 *
 * The fix is a single seam: given a BASE value and WHICH env factor scales it,
 * `displayFinal` returns the post-multiplier value the sim will use. The
 * factor→env-key mapping is the same table the sim applies (see combatEnv.ts),
 * so the number on screen can never disagree with the number in combat.
 *
 * ---------------------------------------------------------------------------
 * PURITY + LIVE UPDATES
 * ---------------------------------------------------------------------------
 * `displayFinal(base, factor, env)` is a pure function — pass the env table and
 * it is fully deterministic + node-testable. For React callers there is a live
 * layer: `useDisplayEnv()` reads the authoritative `MatchState.combatEnvJson`
 * off the HUD store (the SAME wire field the shop's stat preview decodes) and
 * re-renders whenever an operator changes a multiplier, so every displayed
 * final tracks the live table without a reload. The module also keeps a
 * singleton mirror (`getDisplayEnv` / `setDisplayEnv`) so the 2-arg form
 * `displayFinal(base, factor)` resolves against the current table for
 * imperative call-sites and tests.
 *
 * IMPORTANT: `factor: "none"` (or a mana COST, which no env key scales) returns
 * the base unchanged — do NOT route an un-scaled quantity through a real factor.
 */
import { useEffect, useMemo } from "react";
import { useHud } from "../net/RoomStore";
import {
  COMBAT_ENV_KEYS,
  DEFAULT_COMBAT_ENV,
  parseCombatEnvJson,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";

/**
 * Which env factor scales a displayed number. Accepts every canonical
 * `CombatEnvKey` plus a few friendly aliases the UI reads naturally, and
 * `"none"` for a quantity no multiplier touches (e.g. a mana COST — the env has
 * `maxMana`/`manaRegen` for the POOL and REGEN, never the cost).
 */
export type DisplayFactor = CombatEnvKey | DisplayFactorAlias;

export type DisplayFactorAlias =
  | "none"
  | "damage"
  | "hp"
  | "health"
  | "mana"
  | "regen"
  | "ad"
  | "ap";

/** Friendly alias → canonical env key. */
const FACTOR_ALIAS: Record<DisplayFactorAlias, CombatEnvKey | null> = {
  none: null,
  damage: "damageDealt",
  hp: "maxHealth",
  health: "maxHealth",
  mana: "maxMana",
  regen: "healthRegen",
  ad: "attackDamage",
  ap: "abilityPower",
};

const ENV_KEY_SET: ReadonlySet<string> = new Set(COMBAT_ENV_KEYS);

/**
 * Resolve a display factor to the env key that scales it, or `null` when the
 * quantity is unscaled (`"none"`, or an unrecognised token — a safe no-op so a
 * typo shows the base rather than throwing).
 */
export function resolveFactorKey(factor: DisplayFactor): CombatEnvKey | null {
  if (ENV_KEY_SET.has(factor)) return factor as CombatEnvKey;
  if (factor in FACTOR_ALIAS) return FACTOR_ALIAS[factor as DisplayFactorAlias];
  return null;
}

/** The multiplicative factor a display quantity gets (1.0 when unscaled). */
export function envFactor(factor: DisplayFactor, env: CombatEnvMultipliers = getDisplayEnv()): number {
  const key = resolveFactorKey(factor);
  if (key === null) return 1;
  const m = env[key];
  return typeof m === "number" && Number.isFinite(m) && m >= 0 ? m : 1;
}

/**
 * The FINAL value the player gets: `base × env[factor]`. Non-finite bases pass
 * through untouched. `factor: "none"` returns the base. This is the whole
 * contract — `displayFinal(35, "cooldown")` with `cooldown: 0.25` → `8.75`.
 */
export function displayFinal(
  base: number,
  factor: DisplayFactor,
  env: CombatEnvMultipliers = getDisplayEnv(),
): number {
  if (!Number.isFinite(base)) return base;
  return base * envFactor(factor, env);
}

/**
 * Format a final for display — rounds to at most 3 decimals and drops trailing
 * zeros (mirrors the codex `num` helper), with an optional trailing unit.
 * `displayFinalText(35, "cooldown", { unit: "s" })` → `"8.75s"`.
 */
export function displayFinalText(
  base: number,
  factor: DisplayFactor,
  opts?: { env?: CombatEnvMultipliers; unit?: string; digits?: number },
): string {
  const v = displayFinal(base, factor, opts?.env ?? getDisplayEnv());
  const digits = opts?.digits ?? 3;
  const s = !Number.isFinite(v)
    ? String(v)
    : Number.isInteger(v)
      ? String(v)
      : String(Number(v.toFixed(digits)));
  return opts?.unit ? `${s}${opts.unit}` : s;
}

/** True when this factor actually changes the number under `env` (chip hinting). */
export function isScaled(factor: DisplayFactor, env: CombatEnvMultipliers = getDisplayEnv()): boolean {
  return envFactor(factor, env) !== 1;
}

// ---------------------------------------------------------------------------
// live singleton mirror — lets the 2-arg `displayFinal(base, factor)` and any
// imperative call-site resolve against the current table without threading env
// through. `useDisplayEnv` keeps it in sync with the authoritative wire field.
// ---------------------------------------------------------------------------

let currentEnv: CombatEnvMultipliers = DEFAULT_COMBAT_ENV;
let currentJson = "";

/** The env table displayFinal's default resolves against right now. */
export function getDisplayEnv(): CombatEnvMultipliers {
  return currentEnv;
}

/** Replace the ambient table (idempotent; used by the live hook + tests). */
export function setDisplayEnv(env: CombatEnvMultipliers): void {
  currentEnv = env;
}

/** Parse + install the wire JSON as the ambient table (fail-safe to neutral). */
export function setDisplayEnvJson(json: string | null | undefined): void {
  const j = json ?? "";
  if (j === currentJson) return;
  currentJson = j;
  currentEnv = parseCombatEnvJson(j);
}

/** Reset the ambient table to neutral — for test isolation. */
export function resetDisplayEnv(): void {
  currentEnv = DEFAULT_COMBAT_ENV;
  currentJson = "";
}

/**
 * Live combat-env table for React renderers. Reads the authoritative
 * `MatchState.combatEnvJson` off the HUD store, so a component re-renders (and
 * its finals update) the instant the snapshot carries a new table. Also mirrors
 * it into the singleton so imperative `displayFinal(base, factor)` calls in the
 * same frame agree.
 */
export function useDisplayEnv(): CombatEnvMultipliers {
  const json = useHud((s) => s.combatEnvJson);
  const env = useMemo(() => parseCombatEnvJson(json), [json]);
  useEffect(() => {
    setDisplayEnv(env);
  }, [env]);
  return env;
}
