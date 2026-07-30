/**
 * stealthVisual — 隱形的**畫面**那一半 (owner 2026-07-30 「選小的就好」).
 *
 * Deliberately Babylon-free plain data, on the `vfx/goreConfig.ts` precedent, so
 * the content layer can push the operator's doc in without dragging the render
 * seam along (client-08 gate) and so the rule below is testable without a scene.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE
 *
 * A champion carrying `ENTITY_FLAG.INVISIBLE` renders at ONE of two opacities,
 * and which one depends ENTIRELY on who is looking:
 *
 *   · FRIENDLY (yourself, or a teammate) → `allyAlpha` (0.35 shipped). NOT 0:
 *     if your own hero vanished from your own screen you could not play him,
 *     and a teammate you cannot see is a teammate you cannot follow. This is
 *     WC3's behaviour too — your own invisible unit is drawn with a shimmer.
 *   · ENEMY → `enemyAlpha` (0 shipped = gone).
 *
 * ⚠️ THE HEALTH BAR IS A SEPARATE DECISION, and it has to be, because
 * `enemyAlpha` is a FIELD. Set it to 0.15 for a 「半透明鬼影」 look and a bar
 * still floating over the ghost would hand the enemy a perfect position readout
 * — the exact thing being hidden. So the bar answers to `hideEnemyHealthBar`
 * and not to "is alpha 0".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES **NOT** DO — say it out loud
 *
 * It does not hide the entity's POSITION. `EntityState.x/z` are still in every
 * client's snapshot; this module only decides how the local client DRAWS them.
 * The owner made that trade knowingly for a 家用局 (see sim/stealth.ts). Nobody
 * may cite this file as an anti-cheat measure.
 */
import { DEFAULT_STEALTH_RULES, type StealthRules } from "@ggd/shared/sim/stealth";

/**
 * The rules the RENDER side is using right now.
 *
 * A module-level holder rather than a parameter threaded through six call sites,
 * exactly like `goreConfig`: the doc arrives once at content load and every
 * consumer wants the same answer. Starts at the shipping table, so a client that
 * never loads a `config.stealth@1` doc still renders correctly — 缺文件 = 出貨
 * 預設, never an empty object.
 */
let rules: StealthRules = DEFAULT_STEALTH_RULES;

/** The live table (read by the registry / the HUD anchor loop). */
export function stealthRules(): StealthRules {
  return rules;
}

/**
 * Push a `config.stealth@1` doc in (ContentDb.load). `null` — no doc, or a doc
 * whose schema did not match — RESTORES THE SHIPPING TABLE rather than leaving
 * whatever a previous match set, so switching arenas cannot strand the renderer
 * on a stale operator override.
 */
export function applyStealthDoc(doc: Partial<StealthRules> | null | undefined): void {
  rules = doc ? { ...DEFAULT_STEALTH_RULES, ...doc } : DEFAULT_STEALTH_RULES;
}

/** What one body should look like this frame. */
export interface StealthVisual {
  /**
   * Multiplier on `mesh.visibility`, 0..1. **Exactly 1 when nothing is hidden**
   * — that identity is what lets the registry write this every frame without
   * fighting the #220 corpse dissolve, which also writes `visibility`.
   */
  alpha: number;
  /** false = do not draw this body's overhead health bar at all. */
  healthBar: boolean;
}

/** The all-clear: what every body in a match with no stealth hero gets. */
const VISIBLE: StealthVisual = { alpha: 1, healthBar: true };

/**
 * THE one rule. `friendly` means "on the viewing seat's team" and INCLUDES the
 * viewer's own body — the caller resolves it, because the entity → local-seat
 * hop needs the HUD store that render/** is walled off from (client-08), the
 * same seam `isLocal` / `championTintFor` already use.
 *
 * Pure: no Babylon, no module state beyond the rules table, so the guard test
 * can assert the numbers directly AND the registry test can assert they reached
 * a real material.
 */
export function stealthVisualFor(invisible: boolean, friendly: boolean): StealthVisual {
  if (!invisible) return VISIBLE;
  const r = rules;
  if (friendly) {
    // A friendly hidden body always keeps its bar: you are allowed to know your
    // own team's health, and a stealth hero whose bar vanished at the worst
    // moment of a fight would read as a bug.
    return { alpha: r.allyAlpha, healthBar: true };
  }
  return { alpha: r.enemyAlpha, healthBar: !r.hideEnemyHealthBar };
}
