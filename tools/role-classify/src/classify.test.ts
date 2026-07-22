/**
 * classify.ts + roles.ts gate suite.
 *
 * Two halves:
 *   1. SYNTHETIC — hand-built Features against a hand-built cohort. Every rule
 *      the classifier's comments make a claim about (rank-not-value ties, the
 *      melee/marksman gate, the ranged front-line penalty, support needing an
 *      ally, additive attributable evidence, the imported-only cohort) is
 *      pinned here, where the inputs are two numbers instead of 113 champions.
 *   2. REAL ROSTER — the whole content tree through extractFeatures +
 *      classifyAll, asserting only what must stay true no matter how the
 *      heuristics are tuned: the four hand-read calibration labels, and that
 *      `role` is no longer a mechanical echo of `attackType`.
 *
 * Beacons: docs/todo/role-taxonomy.md.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { compositeScore, createMatchStats } from "@ggd/shared/sim";
import { buildCohort, classify, classifyAll, type Verdict } from "./classify";
import { extractFeatures, type Features } from "./features";
import { ROLES, ROLE_BLURB, type Role } from "./roles";
import { CALIBRATION, HAND_AUTHORED } from "./calibration";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** A deliberately featureless champion — every rule is opt-in per test. */
const feat = (over: Partial<Features> = {}): Features => ({
  id: "fx",
  name: "fx",
  currentRole: "fighter",
  attackType: "melee",
  tags: ["wc3-import"],
  imported: true,
  hp: 480,
  hpGrowth: 40,
  mana: 300,
  manaRegen: 1.2,
  ad: 30,
  adGrowth: 2,
  armor: 5,
  attackSpeed: 0.5,
  moveSpeed: 5.5,
  range: 1.6,
  primaryAttr: null,
  primaryAttrInferred: false,
  strGrowth: 0,
  agiGrowth: 0,
  intGrowth: 0,
  nDamage: 0,
  nMagicDamage: 0,
  nPhysicalDamage: 0,
  nHeal: 0,
  nShield: 0,
  nCc: 0,
  nHardCc: 0,
  nDash: 0,
  nProjectile: 0,
  nAllyEffect: 0,
  peakDamage: 100,
  playstyle: null,
  keywords: [],
  nAllyLines: 0,
  nSelfSustainLines: 0,
  ...over,
});

/** Reasons the classifier awarded points for, in evidence order. */
const reasons = (v: Verdict): string[] => v.evidence.map((e) => e.reason);
const hasReason = (v: Verdict, re: RegExp): boolean => reasons(v).some((r) => re.test(r));

describe("ROLES — the taxonomy", () => {
  it("is the six real roles, with no `fighter` catch-all", () => {
    expect([...ROLES]).toEqual(["tank", "bruiser", "assassin", "mage", "marksman", "support"]);
    expect(ROLES).not.toContain("fighter");
    expect(new Set(ROLES).size).toBe(ROLES.length);
    for (const r of ROLES) {
      expect(ROLE_BLURB[r], `${r} needs a legend blurb`).toBeTruthy();
    }
    expect(new Set(Object.values(ROLE_BLURB)).size).toBe(ROLES.length);
    cover("role-taxonomy-six");
  });

  it("names roles the match grader actually weights", () => {
    // WHY THIS LIVES HERE: roles.ts justifies the six by pointing at
    // ROLE_WEIGHTS in packages/shared/src/sim/stats/rating.ts. A role the
    // grader does not know silently falls back to DEFAULT_WEIGHTS, which is
    // exactly the "role carries no information" state this taxonomy exists to
    // end — and nothing else in the repo would catch the rename.
    const healer = { ...createMatchStats(), healingDone: 6000, timeAliveTicks: 1800 };
    const lobby = [healer];
    const agnostic = compositeScore(healer, lobby, "no-such-role");
    for (const r of ROLES) {
      expect(compositeScore(healer, lobby, r), `rating.ts has no weights for "${r}"`).not.toBe(agnostic);
    }
    // …and the taxonomy is not just a re-spelling of the old catch-all: the
    // healer scores far above the generic vector under `support` alone.
    expect(compositeScore(healer, lobby, "support")).toBeGreaterThan(agnostic);
    cover("role-taxonomy-grader-keys");
  });
});

describe("classify — percentile RANK, not percentile VALUE", () => {
  it("never counts a tied modal block as the top band", () => {
    // The imported columns are full of ties (base as is 0.50 for 90 of 113).
    // 18 of these 20 champions share one hp value; a rule asking for the top
    // 15% must not hand the award to all 18 of them.
    const roster = [
      ...Array.from({ length: 18 }, (_, i) => feat({ id: `tie${i}`, hp: 480 })),
      feat({ id: "big0", hp: 640 }),
      feat({ id: "big1", hp: 640 }),
    ];
    const cohort = buildCohort(roster);

    const tied = classify(feat({ hp: 480 }), cohort);
    expect(hasReason(tied, /^hp 480 — top /), reasons(tied).join(" | ")).toBe(false);

    const tall = classify(feat({ hp: 640 }), cohort);
    expect(hasReason(tall, /^hp 640 — top /)).toBe(true);
    expect(tall.scores.tank).toBeGreaterThan(tied.scores.tank);
    cover("role-classify-rank-ties");
  });
});

describe("classify — attackType gates", () => {
  const cohort = buildCohort([
    ...Array.from({ length: 10 }, (_, i) => feat({ id: `c${i}`, adGrowth: 1 + i * 0.1, hp: 400 + i * 10, armor: i })),
  ]);
  const duellist: Partial<Features> = {
    primaryAttr: "AGI",
    adGrowth: 5,
    nProjectile: 3,
    nPhysicalDamage: 3,
    nMagicDamage: 0,
    nDamage: 3,
  };

  it("makes marksman unreachable for a melee champion, reachable for its ranged twin", () => {
    const melee = classify(feat({ ...duellist, attackType: "melee" }), cohort);
    expect(melee.scores.marksman).toBe(Number.NEGATIVE_INFINITY);
    expect(melee.role).not.toBe("marksman");
    expect(hasReason(melee, /^melee — marksman requires ranged$/)).toBe(true);

    // Same champion, ranged: the marksman evidence was there all along.
    const ranged = classify(feat({ ...duellist, attackType: "ranged" }), cohort);
    expect(ranged.role).toBe("marksman");
    expect(ranged.scores.marksman).toBeGreaterThan(0);
    cover("role-classify-melee-gate");
  });

  it("charges ranged champions for the front-line roles without forbidding them", () => {
    const squishy = classify(feat({ attackType: "ranged" }), cohort);
    const penalties = squishy.evidence.filter((e) => e.reason.startsWith("ranged — front-line"));
    expect(penalties.map((e) => [e.role, e.points])).toEqual([
      ["tank", -3],
      ["bruiser", -3],
    ]);

    // Soft, not absolute: a ranged champion with a real front-line kit still
    // lands tank (the roster's hand-authored `sela` is exactly this shape).
    const fortress = classify(
      feat({ attackType: "ranged", hp: 900, hpGrowth: 90, armor: 40, nShield: 2, keywords: ["mitigate", "taunt"] }),
      cohort,
    );
    expect(fortress.role).toBe("tank");
    cover("role-classify-ranged-frontline");
  });
});

describe("classify — support has to point at someone else", () => {
  const cohort = buildCohort(Array.from({ length: 10 }, (_, i) => feat({ id: `c${i}`, hp: 400 + i * 10 })));

  it("scores ally-directed sustain as support and self-only sustain as front-line", () => {
    const enchanter = classify(feat({ nHeal: 1, nAllyEffect: 1, nAllyLines: 1 }), cohort);
    expect(enchanter.role).toBe("support");
    expect(enchanter.confidence).toBe("high");

    // The same THREE pieces of sustain, all aimed at the caster.
    const selfish = classify(feat({ nShield: 1, nSelfSustainLines: 1, keywords: ["mitigate", "sustain"] }), cohort);
    expect(selfish.role).not.toBe("support");
    expect(selfish.scores.support).toBe(0);
    expect(selfish.scores.tank).toBeGreaterThan(0);
    expect(selfish.scores.bruiser).toBeGreaterThan(0);
    cover("role-classify-support-ally");
  });
});

describe("classify — the model is transparent", () => {
  const roster = [
    feat({ id: "a", primaryAttr: "STR", hp: 640, armor: 12, nShield: 1, keywords: ["mitigate"], playstyle: "肉盾團戰" }),
    feat({ id: "b", primaryAttr: "AGI", attackType: "ranged", adGrowth: 4, nProjectile: 2, nPhysicalDamage: 2 }),
    feat({ id: "c", primaryAttr: "INT", attackType: "ranged", mana: 900, nMagicDamage: 4, keywords: ["burst", "poke"] }),
    feat({ id: "d", primaryAttr: "AGI", nDash: 2, moveSpeed: 9, keywords: ["stealth", "assassinate", "chase"], hp: 400 }),
    feat({ id: "e", nHeal: 2, nAllyEffect: 2, nAllyLines: 3, nHardCc: 1, keywords: ["revive"] }),
    feat({ id: "f", primaryAttr: "STR", hp: 620, nDamage: 4, peakDamage: 900, keywords: ["sustain"] }),
  ];
  const cohort = buildCohort(roster);

  it("scores are exactly the sum of their evidence, and margin/confidence follow the top two", () => {
    for (const f of roster) {
      const v = classify(f, cohort);
      for (const role of ROLES) {
        const items = v.evidence.filter((e) => e.role === role);
        if (items.some((e) => e.points === Number.NEGATIVE_INFINITY)) {
          expect(v.scores[role]).toBe(Number.NEGATIVE_INFINITY);
          continue;
        }
        const summed = items.reduce((n, e) => n + e.points, 0);
        expect(v.scores[role], `${f.id}/${role} score must be attributable to named rules`).toBeCloseTo(summed, 10);
      }
      // Every non-zero score has at least one reason a human can argue with.
      for (const role of ROLES) {
        if (v.scores[role] !== 0) expect(v.evidence.some((e) => e.role === role)).toBe(true);
      }

      const desc = [...ROLES].sort((x, y) => v.scores[y] - v.scores[x]);
      expect(v.role).toBe(desc[0]);
      expect(v.margin).toBeCloseTo(v.scores[desc[0]!] - v.scores[desc[1]!], 10);
      expect(v.confidence).toBe(v.margin >= 2 ? "high" : v.margin >= 1 ? "medium" : "low");
    }
    cover("role-classify-evidence-additive");
  });
});

describe("classifyAll — the cohort is the imported roster", () => {
  // 20 imported champions with distinct armor 1..20, plus two hand-authored
  // stand-ins whose armor sits far outside the imported band (thorne is 32
  // against an imported p85 of 10).
  const imported = Array.from({ length: 20 }, (_, i) => feat({ id: `imp${i + 1}`, armor: i + 1 }));
  const handAuthored = [
    feat({ id: "sela", imported: false, tags: [], armor: 200, hp: 900 }),
    feat({ id: "thorne", imported: false, tags: [], armor: 220, hp: 950 }),
  ];
  /** armor 19 of 20 — inside the top 15% of the imported band, outside it once
   *  the two outliers are allowed to stretch the column. */
  const probe = feat({ id: "imp19", armor: 19 });

  it("keeps hand-authored outliers out of the percentiles while still scoring them", () => {
    const alone = classifyAll(imported);
    const withStandins = classifyAll([...imported, ...handAuthored]);

    // The outliers WOULD move the cutoff if they were in the reference set…
    const stretched = classify(probe, buildCohort([...imported, ...handAuthored]));
    expect(hasReason(stretched, /^armor 19 — top /)).toBe(false);
    // …but the imported champions are ranked against their own band either way.
    const before = alone.find((v) => v.features.id === "imp19")!;
    const after = withStandins.find((v) => v.features.id === "imp19")!;
    expect(hasReason(after, /^armor 19 — top /)).toBe(true);
    expect(after.scores).toEqual(before.scores);

    // Held out of the cohort, never out of the report.
    expect(withStandins).toHaveLength(22);
    for (const id of ["sela", "thorne"]) {
      expect(withStandins.some((v) => v.features.id === id)).toBe(true);
    }
    cover("role-classify-cohort-imported");
  });

  it("falls back to the whole roster when nothing is tagged as imported", () => {
    const verdicts = classifyAll(handAuthored);
    expect(verdicts).toHaveLength(2);
    for (const v of verdicts) expect(ROLES).toContain(v.role);
    cover("role-classify-cohort-imported");
  });
});

// ---------------------------------------------------------------------------
// The real roster. These two assertions are the ones a heuristic tweak has to
// keep true; everything above is about HOW the model gets there.
// ---------------------------------------------------------------------------
const CONTENT = join(REPO_ROOT, "content/champions");
const rosterPresent = existsSync(CONTENT);

describe.runIf(rosterPresent)("the imported roster", () => {
  const verdicts = classifyAll(extractFeatures(REPO_ROOT));
  const byId = new Map(verdicts.map((v) => [v.features.id, v]));
  const proposals = verdicts.filter((v) => v.features.imported);

  it("agrees with every label a human read off the kit", () => {
    expect(CALIBRATION.length).toBeGreaterThan(0);
    const disagreements: string[] = [];
    for (const c of CALIBRATION) {
      const v = byId.get(c.id);
      expect(v, `calibration champion ${c.id} is missing from content/champions`).toBeDefined();
      if (v && v.role !== c.expected) disagreements.push(`${c.id}: expected ${c.expected}, got ${v.role} — ${c.rationale}`);
    }
    // A calibration miss means the tweak is wrong, not the label (calibration.ts).
    expect(disagreements).toEqual([]);
    cover("role-classify-calibration");
  });

  it("no longer makes role a mechanical echo of attackType", () => {
    const used = new Set(proposals.map((v) => v.role));
    expect(used.size, `only ${[...used].join(", ")} were proposed`).toBe(ROLES.length);

    const perAttackType = new Map<string, Set<Role>>();
    for (const v of proposals) {
      const s = perAttackType.get(v.features.attackType) ?? new Set<Role>();
      s.add(v.role);
      perAttackType.set(v.features.attackType, s);
    }
    expect([...perAttackType.keys()].sort()).toEqual(["melee", "ranged"]);
    for (const [attackType, roles] of perAttackType) {
      expect(roles.size, `${attackType} collapsed to ${[...roles].join(", ")}`).toBeGreaterThanOrEqual(3);
    }
    // The one implication the taxonomy does keep: a marksman IS its ranged auto.
    expect(proposals.filter((v) => v.role === "marksman" && v.features.attackType === "melee")).toEqual([]);

    // The hand-authored stand-ins are scored but never proposed for backfill.
    for (const id of HAND_AUTHORED) {
      expect(byId.get(id)?.features.imported, `${id} must stay held out`).toBe(false);
    }
    cover("role-classify-not-attacktype");
  });
});
