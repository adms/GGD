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
  knockback: "敵方強制位移未支援 — 範圍傷害照常結算，擊退/拉扯不會發生",
  summon: "召喚單位未支援 — 召喚物不會出現，僅保留施法端的數值效果",
  combo: "鎖定連段未支援 — 一次施放只跑一輪效果，分段時序不表現",
  periodicDamage: "週期傷害未支援 — 傷害會一次結算，DoT 的每跳節奏不表現",
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
