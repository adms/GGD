/**
 * 落差治理 (design §2.4) — turn a template's `requires` into the honest
 * degradation notes shown BEFORE the designer commits, not after.
 *
 * The rule the design states: 「能力缺席時編輯器明示降級方案與分數」. The sim
 * capability table lives in shared (`SIM_CAPABILITIES` in content/templates/
 * expand.ts) precisely so this panel and the expander cannot disagree about what
 * the engine can do.
 */
import { SIM_CAPABILITIES, missingCaps } from "@ggd/shared/content";

export interface DegradeNote {
  capability: string;
  /** what the sim will actually do instead */
  plan: string;
  /** which phase brings the real vocabulary */
  phase: 1 | 2 | 3;
}

/**
 * The降級 sentence per absent capability. Every one names a CONCRETE substitute
 * behaviour, because a note that just says「不支援」 tells the designer nothing
 * about what their skill will do in game.
 */
const PLANS: Readonly<Record<string, string>> = {
  // NOTE (task #247): `leap` USED to live here — 「拋物線跳躍未支援 — 將以 dash
  // 位移 + 落點傷害近似」. The sim now has a real parabolic leap (LeapSystem +
  // the wire height channel), so SIM_CAPABILITIES.leap flipped to available and
  // this line became unreachable. Deleting it rather than leaving it is the
  // point: a stale confession in the ledger is how a future reader concludes the
  // feature does not exist. The generic fallback at the bottom of degradeNotes
  // covers any regression.
  //
  // Three MORE went the same way in the 鑄技工坊 default-audit pass: `knockback`
  // (lane P4 — a real `kind: "knockback"` with `from` push/facing/pull), `summon`
  // (lane P2 — real bodies that fight and expire) and `periodicDamage` (lane P1
  // `dot`). All three had a confession here and a `false` in SIM_CAPABILITIES
  // while their handlers, registry rows and behavioural tests were already
  // shipping. `combo` followed in GH#541: comboStrikes now resolves every beat
  // separately and combo-finisher expands through the shipped family. Keep no
  // dead confession here — if a future capability becomes partial, add its
  // concrete substitute only while SIM_CAPABILITIES marks it unavailable.
};

/** Absent capabilities this template declares, with their degradation plans. */
export function degradeNotes(requires: readonly string[]): DegradeNote[] {
  return missingCaps(requires).map((capability) => ({
    capability,
    plan: PLANS[capability] ?? `${capability} 未支援 — 相關參數在本版不生效`,
    phase: SIM_CAPABILITIES[capability]?.p ?? 3,
  }));
}

/** Capabilities the template needs AND the sim already has (shown as ✓ chips). */
export function satisfiedCaps(requires: readonly string[]): string[] {
  const missing = new Set(missingCaps(requires));
  return requires.filter((r) => !missing.has(r));
}

/**
 * The 「部分可用」 line for a capability that IS available but refuses a named
 * sub-case (today: `summon.killCredit: "owner"`). Returned alongside the green
 * ✓ rather than instead of it — the template runs, one authoring choice does
 * not, and a designer should meet that in the form rather than in a throw.
 *
 * Empty for a capability that is whole, so the caller can render nothing.
 */
export function capCaveats(requires: readonly string[]): { capability: string; caveat: string }[] {
  const out: { capability: string; caveat: string }[] = [];
  for (const r of satisfiedCaps(requires)) {
    const caveat = SIM_CAPABILITIES[r]?.caveat;
    if (caveat !== undefined && caveat.length > 0) out.push({ capability: r, caveat });
  }
  return out;
}
