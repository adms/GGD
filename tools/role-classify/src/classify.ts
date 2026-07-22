/**
 * The classifier: Features -> a proposed Role, with the evidence that produced
 * it. Deliberately a transparent additive-evidence model, not a black box —
 * every point is attributable to one named rule so a human can argue with a
 * specific line of the report instead of with "the script".
 *
 * Thresholds are ROSTER-RELATIVE (percentiles over the 113 champions), not
 * absolute constants. The imported stat bands are tight — maxHealth runs
 * 420-620 for the middle 80% — so "tanky" only means anything as "tanky
 * compared to this roster", and re-importing a rebalanced map re-centres the
 * cutoffs instead of silently classifying everyone the same way.
 */
import type { Features } from "./features";
import { ROLES, type Role } from "./roles";

export interface Evidence {
  role: Role;
  points: number;
  reason: string;
}

export interface Verdict {
  features: Features;
  role: Role;
  scores: Record<Role, number>;
  /** top score minus runner-up — how much argument there is for second place. */
  margin: number;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
}

/**
 * Percentile RANK, not percentile VALUE: the fraction of the roster scoring
 * strictly below `value`.
 *
 * This matters enormously here because the imported columns are full of ties —
 * base attack speed is 0.50 for 90 of 113 champions, `maxHealth` is 480 for so
 * many that p50 and p60 are the same number, and `ms` 5.9 sits on the p85
 * boundary. A `value >= percentile(p)` test therefore admits the whole tied
 * block: "ms ≥ p85" fired for 40% of the roster and quietly manufactured
 * assassins. Ranking by "how many are STRICTLY below me" gives every member of
 * a tied block the same, honest rank, so a rule asking for the top 15% cannot
 * accidentally take 40%.
 */
function rankOf(sortedAsc: readonly number[], value: number): number {
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return sortedAsc.length === 0 ? 0 : lo / sortedAsc.length;
}

/** The numeric columns the rules rank against. */
const COLUMNS = ["hp", "hpGrowth", "armor", "mana", "adGrowth", "moveSpeed", "peakDamage"] as const;
type Column = (typeof COLUMNS)[number];

/**
 * NOT in the cohort, deliberately: `as` and `range`.
 *
 * The import left both degenerate. Base attack speed is 0.50 for 90 of 113
 * champions, and attack range does not separate a mage from a marksman — the
 * longest-ranged hero in the roster (godie-ogld, range 12.0) is a pure INT
 * caster. Scoring either one just re-derives `attackType` under a new name,
 * which is the exact failure this task exists to undo.
 */
export interface Cohort {
  /** ascending values per column, for rankOf(). */
  sorted: Record<Column, number[]>;
}

export function buildCohort(all: readonly Features[]): Cohort {
  const sorted = {} as Record<Column, number[]>;
  for (const col of COLUMNS) sorted[col] = all.map((f) => f[col]).sort((a, b) => a - b);
  return { sorted };
}

/** Substring rules over the w3x author's own "推薦玩家" playstyle label. */
const PLAYSTYLE_RULES: ReadonlyArray<{ needles: readonly string[]; award: Partial<Record<Role, number>> }> = [
  { needles: ["輔助"], award: { support: 3 } },
  { needles: ["肉盾", "坦克", "血牛", "龜裝"], award: { tank: 3 } },
  { needles: ["暗殺", "鬼隱", "心機"], award: { assassin: 3 } },
  { needles: ["砲台", "巨砲", "狙擊", "攻城"], award: { marksman: 1.5, mage: 1 } },
  { needles: ["牽制"], award: { mage: 1, support: 0.5 } },
  { needles: ["連技", "逼戰", "衝鋒", "單挑", "戰士"], award: { bruiser: 1.5 } },
  { needles: ["追擊", "PK"], award: { assassin: 1 } },
  { needles: ["破塔"], award: { marksman: 0.75, bruiser: 0.25 } },
  { needles: ["團戰"], award: { tank: 0.5, support: 0.5 } },
  { needles: ["爆發"], award: { mage: 1, assassin: 0.5 } },
];

/** "top 12%" / "bottom 30%" — renders a rank as the human-readable side of it. */
const pctLeft = (rank: number): string => `${Math.max(1, Math.round((1 - rank) * 100))}%`;
const pctRight = (rank: number): string => `${Math.max(1, Math.round(rank * 100))}%`;

export function classify(f: Features, c: Cohort): Verdict {
  const scores: Record<Role, number> = { tank: 0, bruiser: 0, assassin: 0, mage: 0, marksman: 0, support: 0 };
  const evidence: Evidence[] = [];

  // Where this champion sits in the roster on each numeric column, as a
  // fraction of the roster strictly below it.
  const r = {} as Record<Column, number>;
  for (const col of COLUMNS) r[col] = rankOf(c.sorted[col], f[col]);

  const add = (role: Role, points: number, reason: string): void => {
    if (points === 0) return;
    scores[role] += points;
    evidence.push({ role, points, reason });
  };
  const addAll = (award: Partial<Record<Role, number>>, reason: string): void => {
    for (const [role, points] of Object.entries(award)) add(role as Role, points, reason);
  };

  // --- A. WC3 primary attribute -------------------------------------------
  // The strongest single prior the map gives us: a WC3 hero is built around one
  // attribute and its kit formulas scale off it. Read WITH attackType, because
  // the attribute says which HALF of the taxonomy and attackType breaks the
  // tie inside it: an AGI hero is a duellist either way, but a ranged one wins
  // by auto-attacking (marksman) and a melee one by jumping someone (assassin).
  const attrTag = f.primaryAttrInferred ? `primary≈${f.primaryAttr} (max growth)` : `primary=${f.primaryAttr}`;
  const ranged = f.attackType === "ranged";
  if (f.primaryAttr === "STR") addAll({ tank: 2, bruiser: 2 }, attrTag);
  else if (f.primaryAttr === "AGI")
    addAll(ranged ? { marksman: 3, assassin: 1 } : { assassin: 2, bruiser: 1 }, `${attrTag}, ${f.attackType}`);
  else if (f.primaryAttr === "INT") addAll({ mage: 2.5, support: 1.5 }, attrTag);

  // --- B. durability ------------------------------------------------------
  // Split EVENLY between tank and bruiser. Both are front-liners and the
  // roster's hp band is narrow; raw hp says "not squishy", it does not say
  // which of the two. Sections C and H are what actually break the tie.
  if (r.hp >= 0.85) addAll({ tank: 1.5, bruiser: 1.5 }, `hp ${f.hp} — top ${pctLeft(r.hp)}`);
  else if (r.hp >= 0.6) addAll({ tank: 0.75, bruiser: 0.75 }, `hp ${f.hp} — top ${pctLeft(r.hp)}`);
  if (r.hp <= 0.25) addAll({ assassin: 1, mage: 1, marksman: 0.5 }, `hp ${f.hp} — bottom quartile`);
  if (r.hpGrowth >= 0.75) addAll({ tank: 1, bruiser: 0.75 }, `hp growth ${f.hpGrowth} — top ${pctLeft(r.hpGrowth)}`);
  if (r.armor >= 0.85) addAll({ tank: 1.5, bruiser: 0.5 }, `armor ${f.armor} — top ${pctLeft(r.armor)}`);

  // --- C. mitigation and low output — what separates tank from bruiser ----
  if (f.nShield >= 1) addAll({ tank: 1.5 }, `${f.nShield}× shield effect`);
  if (f.keywords.includes("mitigate")) addAll({ tank: 1.5 }, "text: 結界/減傷/無敵");
  if (f.keywords.includes("taunt")) addAll({ tank: 3 }, "text: 嘲諷/吸引仇恨");
  if (r.hp >= 0.6 && r.peakDamage <= 0.35)
    addAll({ tank: 1.5 }, `durable but low burst (peak ${f.peakDamage}, bottom ${pctRight(r.peakDamage)})`);

  // --- D. support kit — must be pointed at SOMEONE ELSE -------------------
  // A self-shield is mitigation and a self-heal is sustain; section C and
  // section H already take those. Support has to name an ally.
  if (f.nHeal >= 1) addAll({ support: 2.5 }, `${f.nHeal}× heal effect`);
  if (f.nAllyEffect >= 1) addAll({ support: 2.5 }, `${f.nAllyEffect}× ally-directed heal/shield`);
  if (f.nAllyLines >= 1) addAll({ support: 3 }, `${f.nAllyLines}× tooltip line healing/buffing an ally`);
  if (f.keywords.includes("revive")) addAll({ support: 2 }, "text: 復活/重生");

  // --- E. assassin kit ----------------------------------------------------
  if (f.keywords.includes("stealth")) addAll({ assassin: 3 }, "text: 隱形/隱身/鬼隱");
  if (f.keywords.includes("assassinate")) addAll({ assassin: 2 }, "text: 暗殺/斬殺/即死");
  if (f.nDash >= 1) addAll({ assassin: 1.5, bruiser: 0.5 }, `${f.nDash}× dash`);
  if (r.peakDamage >= 0.85 && r.hp <= 0.5)
    addAll({ assassin: 1.5 }, `burst ${f.peakDamage} (top ${pctLeft(r.peakDamage)}) on thin hp`);
  if (r.moveSpeed >= 0.85) addAll({ assassin: 1 }, `ms ${f.moveSpeed} — top ${pctLeft(r.moveSpeed)}`);

  // --- F. mage kit --------------------------------------------------------
  if (r.mana >= 0.8) addAll({ mage: 1.5 }, `mana ${f.mana} — top ${pctLeft(r.mana)}`);
  if (f.nMagicDamage >= 3 && f.nPhysicalDamage === 0)
    addAll({ mage: 1 }, `${f.nMagicDamage}× magic dmg, 0 physical`);
  if (f.keywords.includes("burst")) addAll({ mage: 1.5 }, "text: 爆發/巨砲/狙擊");
  if (f.keywords.includes("poke")) addAll({ mage: 1 }, "text: 牽制/騷擾");

  // --- G. marksman kit ----------------------------------------------------
  // Sustained physical scaling, NOT range: see the Cohort note on why `range`
  // and `as` are excluded.
  if (r.adGrowth >= 0.75) addAll({ marksman: 1.5, bruiser: 0.5 }, `ad growth ${f.adGrowth} — top ${pctLeft(r.adGrowth)}`);
  if (f.nProjectile >= 2) addAll({ marksman: 0.5 }, `${f.nProjectile}× projectile`);
  if (ranged && f.nPhysicalDamage > f.nMagicDamage)
    addAll({ marksman: 1 }, `${f.nPhysicalDamage}p > ${f.nMagicDamage}m damage`);

  // --- H. bruiser kit — durable AND hits hard -----------------------------
  if (r.hp >= 0.5 && r.peakDamage >= 0.5)
    addAll({ bruiser: 1.5 }, `durable and hits hard (hp top ${pctLeft(r.hp)}, burst top ${pctLeft(r.peakDamage)})`);
  if (f.attackType === "melee" && f.nDamage >= 3 && r.hp >= 0.5)
    addAll({ bruiser: 1.5 }, `melee, ${f.nDamage} dmg effects, hp top ${pctLeft(r.hp)}`);
  if (f.keywords.includes("sustain")) addAll({ bruiser: 1.5 }, "text: 吸血/生命偷取");
  if (f.nSelfSustainLines >= 1)
    addAll({ bruiser: 1 }, `${f.nSelfSustainLines}× self-sustain line (heals, no ally named)`);
  if (f.keywords.includes("chase")) addAll({ bruiser: 0.5, assassin: 1 }, "text: 追擊/衝刺/突進");

  // --- I. crowd control ---------------------------------------------------
  // nHardCc and the 暈眩/定身 keywords describe the same skills for most heroes
  // (50 and 44 of 113 respectively), so both are priced low — CC is table
  // stakes in this roster, not a role signal on its own.
  if (f.nHardCc >= 1) addAll({ tank: 0.75, support: 0.5 }, `${f.nHardCc}× hard CC`);
  if (f.keywords.includes("hardCc")) addAll({ tank: 0.5, support: 0.5, mage: 0.5 }, "text: 暈眩/定身/沉默");

  // --- J. the author's own playstyle label --------------------------------
  if (f.playstyle) {
    for (const rule of PLAYSTYLE_RULES) {
      const hit = rule.needles.find((n) => f.playstyle!.includes(n));
      if (hit) addAll(rule.award, `推薦玩家「${f.playstyle}」→ ${hit}`);
    }
  }

  // --- K. attackType gates ------------------------------------------------
  // Soft, not absolute — role must NOT become a function of attackType again.
  // The one true implication: a marksman IS its ranged auto-attack.
  if (f.attackType === "melee") {
    scores.marksman = Number.NEGATIVE_INFINITY;
    evidence.push({ role: "marksman", points: -Infinity, reason: "melee — marksman requires ranged" });
  } else {
    addAll({ tank: -3, bruiser: -3 }, "ranged — front-line roles need strong other evidence");
  }

  const ranked = [...ROLES].sort((a, b) => scores[b] - scores[a]);
  const role = ranked[0]!;
  const runnerUp = ranked[1]!;
  const margin = scores[role] - scores[runnerUp];
  const confidence = margin >= 2 ? "high" : margin >= 1 ? "medium" : "low";

  return { features: f, role, scores, margin, confidence, evidence };
}

/**
 * Classify the whole roster. The cohort — every percentile the rules rank
 * against — is built from the IMPORTED champions only. The two hand-authored
 * stand-ins carry stats well outside the imported bands (thorne's armor 32
 * against an imported p85 of 10) and would drag every cutoff if they were in
 * the reference set. They are still classified, against that cohort, so the
 * report can show whether the model agrees with the only two roles a human
 * ever wrote by hand.
 */
export function classifyAll(all: readonly Features[]): Verdict[] {
  const imported = all.filter((f) => f.imported);
  const cohort = buildCohort(imported.length > 0 ? imported : all);
  return all.map((f) => classify(f, cohort));
}
