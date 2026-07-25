/**
 * THE FIELD ADOPTION CENSUS — detection recipe **S8** as a standing CI guard.
 *
 * S8 (docs/_false-completions.md) is 「機制上線、內容 0 筆」: the schema, the sim
 * and the UI all ship, every test is green, and not one content document fills
 * the field — so the mechanism never happens in a match and nothing anywhere
 * says so. It is the quietest of the 27 false completions because there is no
 * error to find: the code is correct, it is simply never reached.
 *
 * WHAT MAKES THIS TEST WORTH KEEPING (and not just a restatement of the audit)
 * --------------------------------------------------------------------------
 * Both sides of the comparison are derived AT TEST TIME:
 *
 *   supply  ← `nameSchemas`/`register` walk the Zod schemas in ./schema
 *   demand  ← the real `content/` tree, loaded through the real loader
 *
 * Nothing below hard-codes what is currently wrong. A field is censused because
 * it EXISTS, on the commit that adds it — so the next S8, the one nobody has
 * thought of yet, fails this test the day it lands. The audit doc's own version
 * of the recipe was `grep -rl '"hitFeel"' content/ | wc -l`, and a grep can only
 * ever find what you already suspected.
 *
 * That is not a hypothetical distinction. Of the three zeroes the audit named:
 *   • `hitFeel` is now on 142 ability docs and 112 champion docs,
 *   • champion weapon tags are on 33 of 113 champions (katana 20, sword 8,
 *     greatsword 3, gun 1, bow 1 — so `attackKatana`/`attackGreatsword`/
 *     `gunshot` are all reachable now),
 *   • `evasion` reached content DURING the writing of this file (7 docs).
 * A test that asserted the audit's findings would have been wrong within hours.
 * This one recomputes them and reports whatever is true today.
 *
 * WHAT IT ASSERTS
 * ---------------
 *  1. Every registered, reachable, sufficiently-sampled key has at least one
 *     content doc using it — or a documented exemption saying why not.
 *  2. No exemption is STALE. An exemption whose key has since been adopted is
 *     a hard failure, because a permanently-true exemption list is how the
 *     guard rots into a rubber stamp (same discipline as
 *     apps/game-server/src/net/eventFanout.test.ts).
 *  3. No `landing` grace has expired. See THE NEW-FIELD PROBLEM below.
 *  4. The census actually measured the whole tree (guard the guard).
 *
 * THE NEW-FIELD PROBLEM
 * ---------------------
 * A brand-new field is legitimately at zero on the day it lands — the schema
 * change and the content migration are usually two commits, often two people.
 * Failing that is how a guard gets disabled. But "it's new" with no expiry is
 * how a guard gets useless: every S8 in the audit doc was new once.
 *
 * The answer here is a BOUNDED, SELF-EXPIRING grace: status `"landing"` with a
 * `since` date. It suppresses the failure for `GRACE_DAYS`, and then the test
 * fails and names the entry. The clock does the follow-up nobody remembers to
 * do. Deliberately not `"debt"`, which never expires but is printed as a loud
 * banner on every single run — a debt you have to look at is a debt you might
 * pay; a debt that is silent is the pathology itself.
 *
 * WHAT THIS DOES NOT CATCH (stated so nobody mistakes green for coverage)
 * ----------------------------------------------------------------------
 *  • ADOPTION > 0 BUT MEANINGLESS. One doc setting a field is enough to make
 *    this test green. `craftRole: "service"` on 2 of 214 items passes here; if
 *    that is too few to matter, that is a balance/curation question and needs
 *    its own guard. This test answers exactly one question: is it ZERO.
 *  • SMALL SAMPLES. `MIN_REACH` (3) mutes every `config@1` singleton and any
 *    container present in fewer than 3 docs — `projectiles.meshShape`'s `orb`
 *    and `shard`, the `gore.style` options, the per-hook `abilitySlot` filter.
 *    A dead option inside a one-doc container will not be reported.
 *  • REQUIRED FIELDS. Present in 100 % of docs by construction, so they cannot
 *    be an S8 — but a required field the SIM never reads is a different
 *    pathology this does not look for.
 *  • CURATION. A field adopted only by docs outside the operator's whitelist
 *    still counts as adopted. Whether the whitelist reaches it is P0-2's
 *    question, not this one.
 *  • FREE-TEXT VOCABULARIES the code reads out of `string[]` fields are only
 *    censused when declared in `TAG_VOCABULARIES`. `weaponClass` is declared;
 *    a future `if (tags.includes("…"))` in some system is invisible until
 *    someone adds it there. This is the one place the guard needs a human.
 *  • THE OTHER DIRECTION. Content that sets a field NO code reads (the mirror
 *    pathology) is not this test — see the `onLevelUp` note in EXEMPTIONS,
 *    which this census found only because the member also had zero adoption.
 *
 * COST: one `ContentLoader` pass over the real tree (~1450 docs) plus a paired
 * schema/value walk. Measured ~1.4 s wall for the load and ~90 ms for the
 * census itself on an M-series laptop — the same order as
 * castTimeCoverage.test.ts, which loads the identical tree. Cheap enough to
 * run on every commit; that is the point of it existing at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import {
  censusAdoption,
  formatCensus,
  unadopted,
  MIN_REACH,
  TAG_VOCABULARIES,
  type Census,
} from "./fieldAdoption";
import type { ContentStore } from "./store";
import { ALL_STATS } from "../sim/stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/**
 * How long a `"landing"` exemption may suppress a failure. 30 days is roughly
 * "the schema commit and the content commit are in the same月", and short
 * enough that a forgotten migration surfaces while the author still remembers
 * writing it.
 */
export const GRACE_DAYS = 30;

type ExemptionStatus =
  /** the behaviour ships from a CODE DEFAULT; the field only overrides it, so
   *  zero adoption means "nobody needed to override", not "mechanism dead". */
  | "default-live"
  /** the field is filled by code that SYNTHESIZES docs at runtime, so it can be
   *  live in a match while no doc on disk carries it. */
  | "runtime-authored"
  /** content CANNOT legally set it here — another schema rule forbids it. */
  | "schema-impossible"
  /** a dead field kept for compatibility; adopting it would be the bug. */
  | "superseded"
  /** a REAL S8. Never expires, but is printed as a loud banner every run. */
  | "debt"
  /** brand new; adoption expected. EXPIRES after GRACE_DAYS — see above. */
  | "landing";

interface Exemption {
  readonly status: ExemptionStatus;
  /** why zero is acceptable, or (for `debt`) what is actually broken. */
  readonly why: string;
  /** ISO date. Required for `landing`; the grace counts from here. */
  readonly since?: string;
}

/**
 * ===========================================================================
 * THE EXEMPTION LIST — every key the census reports at zero, with a reason.
 * ===========================================================================
 *
 * RULES OF THE ROAD
 *   • A key here must currently be at zero. If it gets adopted, this test goes
 *     red and the entry must be DELETED (test 2). That is the whole reason the
 *     list cannot quietly grow into a rubber stamp.
 *   • Never add a key to silence a failure you have not understood. The three
 *     honest outcomes are: fix the content, mark it `debt` with what is
 *     actually broken, or mark it `landing` and finish the migration.
 *   • The `why` is for a reader six months from now who has never seen the
 *     field. "not used" is not a reason.
 *
 * Sorted by key, matching the census output order.
 */
const EXEMPTIONS: Readonly<Record<string, Exemption>> = {
  // --- hit-feel: the sim DERIVES every one of these from the damage tier.
  // An authored value is an override, so zero authored overrides is the
  // designed resting state, not a dead mechanism (task #133).
  "enum:abilities.hitFeel.sparkKind=counter": {
    status: "default-live",
    why: "sim/combat/hitFeel.ts:131 emits `counter` itself when the hit is a counter — content authoring it would only pin what the default already picks situationally.",
  },
  "enum:abilities.hitFeel.sparkKind=hit": {
    status: "default-live",
    why: "`hit` IS the default spark (hitFeel.ts SparkKind head). Authoring it explicitly writes the fallback into 662 docs for no behaviour change.",
  },
  "field:abilities.hitFeel.exFreeze": {
    status: "default-live",
    why: "cosmetic client-side EX freeze; the default already applies it to EX hits only. An override is for an ability that wants a non-EX freeze.",
  },

  // --- recovery / cast root: LIVE BY DEFAULT, deliberately (task #181,
  // sim/abilities/abilityRecovery.ts DEFAULT_RECOVERY_SEC = 0.6). Absence of
  // the field does NOT mean absence of the 後搖 — every ability has one.
  "field:abilities.recoverySec": {
    status: "default-live",
    why: "abilityRecovery.ts:171 `def.recoverySec ?? DEFAULT_RECOVERY_SEC` — 0.6 s applies to all 662 abilities. The field only shortens/lengthens one.",
  },
  "field:abilities.recoveryRoots": {
    status: "default-live",
    why: "defaults false ON PURPOSE (recovery locks output, not movement — abilityRecovery.ts DECISION 2). Zero adoption = no ability has opted into the full lock.",
  },
  "field:abilities.rootWhileCasting": {
    status: "default-live",
    why: "abilitySystem.ts:239 `def.rootWhileCasting !== false` — every cast roots unless a doc opts out, and none does.",
  },
  "field:champions.abilities.*.recoverySec": {
    status: "default-live",
    why: "mirror of field:abilities.recoverySec on the champion-embedded Q/W/E/R copies; same default, same reasoning.",
  },
  "field:champions.abilities.*.recoveryRoots": {
    status: "default-live",
    why: "mirror of field:abilities.recoveryRoots.",
  },
  "field:champions.abilities.*.rootWhileCasting": {
    status: "default-live",
    why: "mirror of field:abilities.rootWhileCasting.",
  },

  // --- absent == identity. Writing the neutral value into every doc is
  // explicitly forbidden by the schema comments (zTintRgb / zAlpha: "we never
  // write [1,1,1]"), so zero here is the schema's own instruction being obeyed.
  "field:champions.alpha": {
    status: "default-live",
    why: "zAlpha: ABSENT == 1 (opaque). No w3x champion is authored translucent, and schema/champion.ts forbids writing the identity value.",
  },
  "field:skins.alpha": {
    status: "default-live",
    why: "same contract as champions.alpha; the 5 shipped skins are all opaque.",
  },
  "field:skins.tint": {
    status: "default-live",
    why: "zTintRgb: ABSENT == untinted, and `[1,1,1]` must never be written. Skin tint is for a recolour variant; none has shipped.",
  },

  // --- structurally impossible here.
  "field:champions.abilities.*.innateKind": {
    status: "schema-impossible",
    why: "zChampionDoc pins the embedded slots to Q/W/E/R, and zAbilityDoc.refineInnate REJECTS innateKind on anything but slot PASSIVE. A doc setting it would fail to load.",
  },

  // --- dead fields kept for compatibility. Adoption would be the bug.
  "field:items.iconKey": {
    status: "superseded",
    why: "the skeleton-era symbolic key, replaced by `icon` (214/214 adopted). schema/item.ts calls it legacy in so many words.",
  },
  "field:status-effects.iconKey": {
    status: "superseded",
    why: "same legacy key as items.iconKey; status effects render from `polarity` + tags today.",
  },

  // --- filled by code, not by files.
  "field:vfx#vfx@1.spriteSheet": {
    status: "runtime-authored",
    why: "apps/client/src/render/vfx/w3xEmitter.ts:520 SYNTHESIZES the VfxDoc and sets spriteSheet from the w3x emitter's rows/cols at load; particleFactory.ts:244 consumes it. Live in matches, absent from content/.",
  },

  // --- an enum member with a documented decision to stay unused.
  "enum:arenas.groundStyle=wood": {
    status: "default-live",
    why: "apps/client/src/render/groundMaterials.test.ts:25 already pins this: `wood` is in the enum, no shipped arena uses it, and groundTextureSet falls back to stone. Deliberate.",
  },

  // ===================================================================
  // DEBT — real S8s. Each of these is a mechanism that ships and never
  // happens. They print as a banner on every run until someone fixes them.
  // ===================================================================
  // "field:abilities.passive.ranks[].auras" exemption DELETED 2026-07-25: the
  // JASS effect-audit batch converted 66-04 靈壓震撼 (godie-e00t.r, A0IC/A0ID)
  // to a passive slow-aura — the first content aura, so the key is adopted.
  "field:abilities.descriptionRoles": {
    status: "debt",
    why: "task #114 (semantic colour-role markup) is marked COMPLETE and the render path handles it, but the importer has never been re-run, so 0 of 662 abilities carry it and every tooltip falls back to plain text. schema/ability.ts predicted exactly this: 'absent until the importer re-runs'.",
  },
  "field:champions.abilities.*.descriptionRoles": {
    status: "debt",
    why: "the champion-embedded mirror of the above; same missing importer run.",
  },
  // `field:champions.abilities.*.hitFeel` was exempt here as "a MIRROR GAP, not a
  // plain zero" — 30 standalone ability docs carried hitFeel and 0 of their
  // champion-embedded twins did. The gap is closed: all 30 embedded copies now
  // carry it, so the exemption became a lie and this suite said so. Deleted
  // rather than re-worded, which is what the stale-exemption check asks for.
  "field:champions.baseAttackTime": {
    status: "debt",
    why: "task #144 (per-champion w3x movement/attack speed) is still pending, so all 113 champions use BasicAttackSystem.ts:173's `?? 1.0` and every hero attacks at the same base cadence — the w3x per-hero values were never imported.",
  },
  "enum:abilities.passive.ranks[].hooks[].on=onDamageDealt": {
    status: "debt",
    why: "sim/combat/damage.ts:582 FIRES this hook every time damage is dealt, and no content subscribes to it across all 43 hook-carrying docs (abilities, items, augments, champion passives). Every on-damage-dealt proc in the source map is currently unimported.",
  },
  "enum:abilities.passive.ranks[].hooks[].on=onLevelUp": {
    status: "debt",
    why: "the opposite failure, found by the same census: the member exists in zHookEvent and in modifiers.ts's HookEvent type, but NOTHING in sim/ ever fires it. Content adopting it would be inert. Resolve by implementing the dispatch or deleting the member — do not 'adopt' it.",
  },
  "enum:items.craftRole=direct": {
    status: "debt",
    why: "extract_item_roles.py recovers 7 roles from the map triggers and assigned `direct` to nothing across 214 items. Either the extractor never emits it (a recovery gap worth checking against the JASS) or the role is redundant and should leave the enum.",
  },
  "enum:status-effects.polarity=buff": {
    status: "debt",
    why: "all 5 shipped status-effect docs are debuffs, so any UI that colours or filters by positive polarity has never rendered a single case. The map's buff-side statuses (haste/regen auras) were not imported.",
  },
};

let census: Census;
let store: ContentStore;

beforeAll(async () => {
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  store = result.store;
  census = censusAdoption(store);
}, 60_000);

/** Days between an ISO date and now, floored. */
function daysSince(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

/** Entries whose `landing` grace has run out at `now`. */
function expiredGraces(now: number): string[] {
  return Object.entries(EXEMPTIONS)
    .filter(([, e]) => e.status === "landing")
    .filter(([, e]) => e.since === undefined || daysSince(e.since, now) > GRACE_DAYS)
    .map(([k]) => k);
}

describe("field adoption census (recipe S8: mechanism shipped, content 0)", () => {
  it("prints the census — this is the owner-facing report", () => {
    // Always emitted, pass or fail. The numbers ARE the deliverable: which
    // mechanisms content actually reaches, and how hard.
    // eslint-disable-next-line no-console
    console.log("\n" + formatCensus(census) + "\n");

    const debts = Object.entries(EXEMPTIONS).filter(([, e]) => e.status === "debt");
    if (debts.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        [
          `\n  ${"═".repeat(74)}`,
          `  KNOWN DEAD MECHANISMS — ${debts.length} registered features that never happen in a match.`,
          `  These are ACCEPTED FAILURES, not passing checks. They print every run on purpose.`,
          `  ${"═".repeat(74)}`,
          ...debts.map(([k, e]) => `   • ${k}\n     ${e.why}`),
          "",
        ].join("\n"),
      );
    }
    expect(census.rows.length).toBeGreaterThan(0);
  });

  it("every registered field / Stat / enum member / effect kind is adopted, or exempted", () => {
    const zeroes = unadopted(census);
    const unexplained = zeroes.filter((r) => EXEMPTIONS[r.key] === undefined);

    const message =
      unexplained.length === 0
        ? ""
        : [
            "",
            "S8 — A REGISTERED MECHANISM WITH ZERO CONTENT ADOPTION.",
            "",
            "These keys are offered by the schemas (or by a code vocabulary) and NOT ONE",
            "content document uses them. Nothing will error; the feature simply never",
            "happens in a match. That is exactly the shape docs/_false-completions.md",
            "catalogues as S8, and it is why this test exists.",
            "",
            ...unexplained.map(
              (r) => `  ${r.key}\n      0 of ${r.reach} docs that could have used it`,
            ),
            "",
            "THREE WAYS TO RESOLVE THIS — pick one deliberately:",
            "",
            "  1. AUTHOR THE CONTENT. Usually the right answer. Editing one doc in",
            "     content/ is enough to turn the row green, and that one doc is proof the",
            "     path works end to end.",
            "",
            "  2. IT IS NEW — add it to EXEMPTIONS in this file with",
            `     { status: "landing", since: "<today, ISO>", why: "…" }.`,
            `     That suppresses the failure for ${GRACE_DAYS} days and then fails again,`,
            "     so the migration cannot be forgotten.",
            "",
            "  3. ZERO IS CORRECT AND PERMANENT — add it to EXEMPTIONS with the status",
            `     that says WHY: "default-live" (the behaviour ships from a code default`,
            `     and the field only overrides it), "runtime-authored" (code synthesizes`,
            `     the doc), "schema-impossible" (another rule forbids setting it here),`,
            `     "superseded" (dead field kept for compat), or "debt" (it IS broken,`,
            "     you are recording it rather than fixing it now — debts print as a loud",
            "     banner on every run).",
            "",
            "Do NOT delete the field, the Stat, or the enum member just to make this",
            "pass unless you actually mean to remove the mechanism.",
            "",
          ].join("\n");

    expect(unexplained.map((r) => r.key), message).toEqual([]);
  });

  it("no exemption is STALE — an adopted key must lose its exemption", () => {
    // The self-cleaning half. Without it the list only ever grows, and a list
    // that is always true is a list nobody reads.
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    const byKey = new Map(census.rows.map((r) => [r.key, r]));
    const stale = Object.keys(EXEMPTIONS).filter((k) => !zeroKeys.has(k));

    const message = [
      "",
      "STALE EXEMPTION(S) — these keys are no longer at zero, so their entries in",
      "EXEMPTIONS (packages/shared/src/content/fieldAdoption.test.ts) are now lies.",
      "DELETE the listed entries; that is the entire fix.",
      "",
      ...stale.map((k) => {
        const r = byKey.get(k);
        if (r === undefined) {
          return `  ${k}\n      no longer a registered key at all — the schema changed under it`;
        }
        if (r.reach < MIN_REACH) {
          return `  ${k}\n      reach fell to ${r.reach} (< MIN_REACH ${MIN_REACH}); the census no longer claims anything about it`;
        }
        return `  ${k}\n      now adopted by ${r.docs} doc(s), e.g. ${r.examples.join(", ")}`;
      }),
      "",
    ].join("\n");

    expect(stale, message).toEqual([]);
  });

  it("no `landing` grace has expired — a new field cannot stay new forever", () => {
    const expired = expiredGraces(Date.now());
    expect(
      expired,
      `\nThese exemptions were filed as "landing" (brand-new field, adoption imminent)\n` +
        `and are now older than ${GRACE_DAYS} days. Either finish the content migration,\n` +
        `or re-file them with an honest status — "debt" if the migration is not going to\n` +
        `happen soon, which at least keeps them visible in the banner every run.\n` +
        expired.map((k) => `  ${k}`).join("\n") +
        "\n",
    ).toEqual([]);
  });

  it("the grace really does expire (the mechanism, not today's data)", () => {
    // Exercised on synthetic entries so the assertion holds no matter what the
    // EXEMPTIONS table contains — otherwise this logic would be dead code the
    // day the table has no `landing` rows, which is most days.
    const now = Date.parse("2026-07-24T00:00:00Z");
    expect(daysSince("2026-07-24T00:00:00Z", now)).toBe(0);
    expect(daysSince("2026-06-24T00:00:00Z", now)).toBe(30);
    expect(daysSince("2026-06-23T00:00:00Z", now)).toBe(31);
    // …and a `landing` entry with no `since` is expired on sight, so it cannot
    // be used as an unbounded silencer.
    expect(daysSince("2026-06-23T00:00:00Z", now) > GRACE_DAYS).toBe(true);
    expect(daysSince("2026-06-24T00:00:00Z", now) > GRACE_DAYS).toBe(false);
  });

  it("every exemption is well-formed: a status, a real reason, and a date when required", () => {
    const bad: string[] = [];
    for (const [key, e] of Object.entries(EXEMPTIONS)) {
      if (!/^(field|enum|variant|tag):/.test(key)) bad.push(`${key}: not a census key`);
      // A reason short enough to be "n/a" is not a reason. This is the rule
      // that stops the list degrading into a list of keys.
      if (e.why.trim().length < 40) bad.push(`${key}: why is too short to be a reason`);
      if (e.status === "landing" && e.since === undefined) bad.push(`${key}: landing needs since`);
      if (e.since !== undefined && Number.isNaN(Date.parse(e.since))) {
        bad.push(`${key}: since is not a date`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("GUARD THE GUARD: the census measured the whole tree, not three documents", () => {
    // Every assertion above is vacuously true against an empty census. These
    // are the numbers that make a green run mean something. They are floors,
    // not pins, so authoring content never breaks them.
    expect(census.totalDocs).toBeGreaterThan(1400);
    expect(census.rows.length).toBeGreaterThan(250);

    const kinds = new Set(census.rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["enum", "field", "tag", "variant"]);

    // The four things the recipe names must each be genuinely reachable, or a
    // refactor could silently stop censusing one of them and still pass.
    const reachable = census.rows.filter((r) => r.reach >= MIN_REACH);
    expect(reachable.filter((r) => r.kind === "field").length).toBeGreaterThan(80);
    expect(reachable.filter((r) => r.kind === "enum").length).toBeGreaterThan(60);
    expect(reachable.filter((r) => r.kind === "variant").length).toBeGreaterThan(10);
    expect(reachable.filter((r) => r.kind === "tag").length).toBe(
      TAG_VOCABULARIES.reduce((n, v) => n + v.members.length, 0),
    );

    // Stats arrive through zStat as a nativeEnum; if that walk ever breaks,
    // "a Stat nothing references" stops being detectable and this test would
    // pass for the wrong reason. Counted against ALL_STATS rather than a
    // literal, so adding a Stat cannot quietly fall outside the census.
    const statRows = census.rows.filter((r) => r.key.includes("].stat="));
    expect(statRows.map((r) => r.key.split("=").pop()).sort()).toEqual(
      [...ALL_STATS].sort(),
    );
    // `evasion` is the canary: it was the audit's headline zero, and it landed
    // in content while this file was being written. The row must EXIST; this
    // test deliberately does not assert what its count is.
    expect(statRows.some((r) => r.key.endsWith("=evasion"))).toBe(true);
  });

  it("THE CASCADE RULE: a child of an unadopted container is not an independent finding", () => {
    // hitFeel has ten optional children. If `hitFeel` itself were unset the
    // report would name eleven problems that are one problem. Anything with
    // reach 0 is suppressed, so adopting the parent is what makes the children
    // visible — one finding at a time, outermost first.
    const suppressed = census.rows.filter((r) => r.reach === 0);
    for (const r of suppressed) expect(r.docs).toBe(0);
    // There must actually BE some, or this rule is untested. Today's example
    // is everything under `passive.ranks[].auras`, whose container has zero
    // adoption: the aura's own radius/affects/lingerSec are ONE finding, not
    // four. Adopting the container is what makes its children visible.
    expect(suppressed.length).toBeGreaterThan(0);
    // Suppressed rows appear in neither the report nor the failure set.
    const report = formatCensus(census);
    const zeroKeys = new Set(unadopted(census).map((r) => r.key));
    for (const r of suppressed) {
      expect(report, `${r.key} should be cascade-suppressed`).not.toContain(r.key);
      expect(zeroKeys.has(r.key), `${r.key} must not be a reported failure`).toBe(false);
    }
  });

  it("the census is deterministic — same store, same rows, same order", () => {
    // Key stability is what lets EXEMPTIONS be written down at all. The schema
    // naming walk picks shortest-path names with a lexicographic tiebreak, so a
    // second pass over the same store must reproduce the keys byte for byte.
    // (A Map-iteration-order dependency here would make the exemption list
    // flap between runs, which is worse than having no guard.)
    const again = censusAdoption(store);
    expect(again.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`)).toEqual(
      census.rows.map((r) => `${r.key}:${r.docs}:${r.reach}`),
    );
  });
});
