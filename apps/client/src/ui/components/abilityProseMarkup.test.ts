/**
 * GUARD — `rescaleAbilityProse` must survive #114's role markup (GH#103).
 *
 * THE DEFECT IT PINS. `COOLDOWN_PROSE_RE` / `DAMAGE_PROSE_RE` anchor on a number
 * sitting DIRECTLY against its keyword. #114's semantic colouring wraps exactly
 * that number: `造成[c=damage]650[/c]傷害`, `冷卻時間[c=duration]30[/c]秒`. Before
 * this file, all three shapes simply did not match — so the rewrite became a
 * SILENT no-op and the card printed the raw WC3 60s instead of the shipped 12s
 * (`combat-env.cooldown` is 0.2 today — a 5× lie), while plain-text abilities
 * kept being rewritten correctly. Nothing was red. That is the whole point:
 * shipped content carries 0 role-markup descriptions right now, so the failure
 * is invisible until #114's importer half lands, and then it is invisible again
 * because half the roster still reads right.
 *
 * WHY THE ASSERTION IS A RELATION, NOT A NUMBER. Every expectation here is
 * 「stripping the markup must not change the numbers」 — the markup version and
 * the plain version are rescaled independently and compared. No shipped
 * multiplier, no expected literal, nothing to go stale when the owner retunes
 * `combat-env` (第零守則: guards check the mechanism, not the digits). The
 * fixture envs are deliberately NOT the live table.
 *
 * A second assertion keeps the relation from passing vacuously: the rescale has
 * to have actually CHANGED something, or 「both sides are no-ops」 would satisfy
 * equality forever.
 */
import { describe, it, expect } from "vitest";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { parseRoleMarkup, rescaleAbilityProse } from "./abilityText";

/** Fixture tables — NOT the shipped ones; only their non-neutrality matters. */
const CD = normalizeCombatEnv({ cooldown: 0.25 });
const DMG = normalizeCombatEnv({ damageDealt: 0.5 });

const strip = (s: string): string => s.replace(/\[c=[a-z-]+\]|\[\/c\]/g, "");

/** Every phrasing the two regexes claim to read, once wrapped in role markup. */
const CASES: readonly (readonly [string, ReturnType<typeof normalizeCombatEnv>])[] = [
  ["[c=duration]60[/c]秒冷卻時間", CD],
  ["冷卻時間[c=duration]30[/c]秒", CD],
  ["[c=duration]60/50/40/30[/c]秒冷卻", CD], // 逐階串也要逐階乘
  ["cooldown [c=duration]12[/c]s", CD],
  ["造成[c=damage]650[/c]傷害", DMG],
  ["[c=damage]550[/c]點傷害", DMG],
  ["deal [c=damage]650[/c] damage", DMG],
];

describe("ability prose rescale survives #114 role markup (GH#103)", () => {
  it("the markup does not change WHICH numbers get rescaled, or to what", () => {
    for (const [marked, env] of CASES) {
      const plain = strip(marked);
      const rewritten = rescaleAbilityProse(marked, env);
      expect(
        strip(rewritten),
        `role markup swallowed the rewrite for 「${marked}」 — the card would print ` +
          `the raw WC3 number while the plain-text abilities beside it print the final`,
      ).toBe(rescaleAbilityProse(plain, env));
      // non-vacuity: a rewrite that did nothing would satisfy the line above
      expect(strip(rewritten), `nothing was rescaled in 「${marked}」`).not.toBe(plain);
    }
  });

  it("the markup itself survives the rewrite (it still parses into coloured runs)", () => {
    const out = rescaleAbilityProse("造成[c=damage]650[/c]傷害", DMG);
    expect(out).toContain("[c=damage]");
    expect(parseRoleMarkup(out).some((seg) => seg.role === "damage")).toBe(true);
  });

  it("the markup tolerance is ADDITIVE — plain prose still rescales, unrelated numbers still do not", () => {
    for (const [marked, env] of CASES) {
      const plain = strip(marked);
      expect(rescaleAbilityProse(plain, env), `plain 「${plain}」 stopped rescaling`).not.toBe(plain);
    }
    // heal / shield / mana / duration numbers were never in scope and still are not
    expect(rescaleAbilityProse("回復[c=heal]300[/c]生命", DMG)).toBe("回復[c=heal]300[/c]生命");
  });
});
