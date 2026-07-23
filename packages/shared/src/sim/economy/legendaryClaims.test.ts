/**
 * 傳說武器 SAY WHAT THEY DO — the 效能 block ⇔ the modifiers (task #108).
 *
 * A legendary is never bought: it arrives through the round-5 3-choose-1 or the
 * 傳說寶玉 roll, and the ONLY thing the player reads before picking is the
 * item's 效能 block. So that block is a promise the sim has to keep. Every
 * stat-line in it («攻擊力+32.9», «攻擊速度+23.9%», …) must be backed by an
 * identical modifier, and — the direction that catches the more dangerous
 * drift — no legendary may carry a stat its 效能 block never claims.
 *
 * The #108 audit found the shipped pool already consistent; nothing here is a
 * repair. It exists because the failure it guards against is a CONTENT edit
 * (a rescale, a re-import, a hand-tuned number) touching one side of the pair
 * and not the other, which no code review of packages/ would ever see. That is
 * also why it reads content/ rather than a fixture.
 *
 * WHAT THE PARSER DELIBERATELY IGNORES: a 效能 block also advertises effects
 * `item@1` cannot express — procs (30%機率造成100點範圍傷害), actives
 * (螺旋擊, 針刺地獄), orb effects (10%機率淨化) and auras (死之王的長槍's
 * 額外17%攻擊力增加). Those have no modifier by design, so a claim is only
 * read off a line of the exact shape «標籤+數值[%]». The one exception is the
 * crit tooltip, which IS expressible — see the crit test below.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import type { ItemDoc } from "../../content/schema/item";
import type { ChampionDoc } from "../../content/schema/champion";
import type { LootTableDoc } from "../../content/schema/lootTable";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { LEGENDARY_POOL_TABLE } from "./itemTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/**
 * The champion base crit multiplier. An item's `critDamage` is a flat DELTA
 * into `(base + Σflat)`, so a 「造成2.198倍傷害」 tooltip means +0.448 — not
 * 2.198. Pinned against the real roster below.
 */
const CRIT_BASE = 1.75;

/**
 * Every 效能 label `item@1` can express, and how the text maps onto a modifier.
 *
 * `percent: true` means the DESCRIPTION writes the value as N% while the
 * MODIFIER stores N/100 — true of 攻擊速度 and 魔力回復速度 (pctAdd fractions)
 * and equally of 吸血, which is a flat 0..1 fraction. The distinction is about
 * notation, not about the op, so the two are declared separately.
 */
const STAT_CLAIMS: { label: string; stat: Stat; op: ModOp; percent: boolean }[] = [
  { label: "攻擊力", stat: Stat.AttackDamage, op: ModOp.Flat, percent: false },
  { label: "生命", stat: Stat.MaxHealth, op: ModOp.Flat, percent: false },
  { label: "魔力", stat: Stat.MaxMana, op: ModOp.Flat, percent: false },
  { label: "法術強度", stat: Stat.AbilityPower, op: ModOp.Flat, percent: false },
  { label: "裝甲", stat: Stat.Armor, op: ModOp.Flat, percent: false },
  { label: "魔法抗性", stat: Stat.MagicResist, op: ModOp.Flat, percent: false },
  { label: "每秒回復生命", stat: Stat.HealthRegen, op: ModOp.Flat, percent: false },
  { label: "攻擊速度", stat: Stat.AttackSpeed, op: ModOp.PercentAdd, percent: true },
  { label: "魔力回復速度", stat: Stat.ManaRegen, op: ModOp.PercentAdd, percent: true },
  { label: "吸血", stat: Stat.Lifesteal, op: ModOp.Flat, percent: true },
];

/**
 * Anchored to the WHOLE line on purpose: 「每秒回復生命+8.29」 contains
 * 「生命+8.29」, and a `startsWith`/substring parser would silently read it as
 * +8 maxHealth and then fail against the healthRegen modifier.
 */
const CLAIM_RES = STAT_CLAIMS.map((c) => ({
  ...c,
  re: new RegExp(`^${c.label}\\+(\\d+(?:\\.\\d+)?)${c.percent ? "%" : ""}$`),
}));

/** 「17.9%機率造成2.198倍傷害」 → critChance 0.179 + critDamage (2.198 − base). */
const CRIT_RE = /^(\d+(?:\.\d+)?)%機率造成(\d+(?:\.\d+)?)倍傷害$/;

/** Any 「標籤+數值[%]」 line at all — a claim the parser is REQUIRED to know. */
const CLAIM_SHAPE = /^([^+\d]+)\+(\d+(?:\.\d+)?)(%?)$/;

const EFFICACY_HEAD = /^效能[:：]?$/;
/** The prose sections a 效能 block runs into. Everything after one is lore. */
const SECTION_HEAD = /^(解說|歷史|背景|說明)[:：]?$/;

/** The 效能 lines of a doc, i.e. what the player reads as the item's stats. */
function efficacyLines(doc: ItemDoc): string[] {
  const lines = (doc.description ?? "").split("\n").map((l) => l.trim());
  const head = lines.findIndex((l) => EFFICACY_HEAD.test(l));
  if (head < 0) return [];
  const body = lines.slice(head + 1);
  const end = body.findIndex((l) => SECTION_HEAD.test(l));
  return (end < 0 ? body : body.slice(0, end)).filter((l) => l.length > 0);
}

interface Claim {
  stat: Stat;
  op: ModOp;
  value: number;
  line: string;
}

/** Every modifier the 效能 text promises. Inexpressible effect lines yield none. */
function parseClaims(lines: string[]): Claim[] {
  const claims: Claim[] = [];
  for (const line of lines) {
    const crit = CRIT_RE.exec(line);
    if (crit) {
      claims.push({ stat: Stat.CritChance, op: ModOp.Flat, value: Number(crit[1]) / 100, line });
      claims.push({ stat: Stat.CritDamage, op: ModOp.Flat, value: Number(crit[2]) - CRIT_BASE, line });
      continue;
    }
    for (const c of CLAIM_RES) {
      const m = c.re.exec(line);
      if (!m) continue;
      claims.push({ stat: c.stat, op: c.op, value: c.percent ? Number(m[1]) / 100 : Number(m[1]), line });
      break;
    }
  }
  return claims;
}

let pool: ItemDoc[];
let champions: ChampionDoc[];

beforeAll(async () => {
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  const byId = new Map(store.all<ItemDoc>("items").map((d) => [d.id as string, d]));
  const table = store.all<LootTableDoc>("loot-tables").find((t) => t.id === LEGENDARY_POOL_TABLE);
  if (!table) throw new Error(`content/loot-tables/${LEGENDARY_POOL_TABLE}.json is missing`);
  pool = table.entries.map((e) => {
    const doc = byId.get(e.itemId as string);
    if (!doc) throw new Error(`legendary ${e.itemId} has no content doc`);
    return doc;
  });
  champions = store.all<ChampionDoc>("champions");
});

describe("傳說武器 say what they do (效能 ⇔ modifiers)", () => {
  it("every 效能 stat-line is backed by an identical modifier", () => {
    cover("eco-legendary-desc-matches-modifiers");
    // A load-sanity floor, not a pinned count: the pool is re-curated freely
    // (it was 25, it is 14 now), and the sibling econ-legendary-not-purchasable
    // guards this same table at >= 6. The real assertion is the per-item loop.
    expect(pool.length).toBeGreaterThanOrEqual(6);
    const broken: string[] = [];
    for (const doc of pool) {
      const lines = efficacyLines(doc);
      expect(lines.length, `${doc.name} (${doc.id}) has no 效能 block — the draft card shows nothing`).toBeGreaterThan(0);
      for (const claim of parseClaims(lines)) {
        const mods = (doc.modifiers ?? []).filter((m) => m.stat === claim.stat);
        if (mods.length !== 1) {
          broken.push(`${doc.name} 「${claim.line}」 → ${mods.length} ${claim.stat} modifiers, want exactly 1`);
          continue;
        }
        const mod = mods[0]!;
        if (mod.op !== claim.op) {
          broken.push(`${doc.name} 「${claim.line}」 → ${claim.stat} is ${mod.op}, the text reads as ${claim.op}`);
        } else if (Math.abs(mod.value - claim.value) > 1e-6) {
          broken.push(`${doc.name} 「${claim.line}」 → ${claim.stat} ${mod.value}, text claims ${claim.value}`);
        }
      }
    }
    expect(broken, "a legendary's 效能 block promises what its modifiers do not pay").toEqual([]);
  });

  it("no legendary carries a stat its 效能 block never claims", () => {
    // The direction that matters most for a DRAFT item: an unclaimed modifier
    // is power the player cannot see when choosing, so the 3-choose-1 stops
    // being a decision. It also catches a stat-line whose label drifted (the
    // claim vanishes, the modifier is left orphaned).
    const hidden: string[] = [];
    for (const doc of pool) {
      const claimed = new Set(parseClaims(efficacyLines(doc)).map((c) => c.stat));
      for (const mod of doc.modifiers ?? []) {
        if (!claimed.has(mod.stat)) hidden.push(`${doc.name} (${doc.id}) grants ${mod.stat} ${mod.op} ${mod.value}, unannounced`);
      }
    }
    expect(hidden, "a legendary grants a stat its 效能 block never mentions").toEqual([]);
  });

  it("reads EVERY 「標籤+數值」 line — an unknown stat label is a failure, not a skip", () => {
    // The parser ignores effect prose by design, which is exactly how a NEW
    // stat label (say 移動速度+30) would slip through as "not a claim" and be
    // checked by nothing. Anything shaped like a stat-line must therefore be
    // one the table above knows; genuine effect lines (螺旋擊, 10%機率淨化,
    // 額外17%攻擊力增加) never take this shape.
    const unknown: string[] = [];
    for (const doc of pool) {
      for (const line of efficacyLines(doc)) {
        if (!CLAIM_SHAPE.test(line)) continue;
        if (!CLAIM_RES.some((c) => c.re.test(line))) unknown.push(`${doc.name} (${doc.id}) 「${line}」`);
      }
    }
    expect(unknown, "a 效能 stat-line no rule in STAT_CLAIMS can read — it is checked by nothing").toEqual([]);
  });

  it("the crit legendaries express 「N%機率造成M倍傷害」 as chance + (M − champion base)", () => {
    // Same relation w3x-item-crit-multiplier asserts tree-wide at import time;
    // restated here over the legendary pool because a crit legendary is one a
    // player is DRAFTED into, and because the relation is the one place a
    // legendary's text and its modifier disagree numerically (龍騎士之劍:
    // 2.037 in the text, +0.287 in the doc) — i.e. the one a rescale gets
    // wrong silently.
    const bases = [...new Set(champions.map((c) => c.baseStats.critDamage))];
    expect(bases, "the roster disagrees on the base crit multiplier").toEqual([CRIT_BASE]);

    // Which crit items sit in the pool is curation that moves freely (斬龍刀
    // godie-i06d was dropped when the pool went 25 -> 14), so this pins the
    // INVARIANT, not the membership: at least one crit legendary must be present
    // so the relation below is actually exercised rather than vacuously green.
    const crit = pool.filter((d) => efficacyLines(d).some((l) => CRIT_RE.test(l)));
    expect(crit.length, "no crit legendary in the pool — the relation below never runs").toBeGreaterThanOrEqual(1);
    for (const doc of crit) {
      const line = efficacyLines(doc).find((l) => CRIT_RE.test(l))!;
      const [, chance, multiplier] = CRIT_RE.exec(line)!;
      const val = (stat: Stat) => (doc.modifiers ?? []).find((m) => m.stat === stat)?.value;
      expect(val(Stat.CritChance), `${doc.name} critChance`).toBeCloseTo(Number(chance) / 100, 6);
      expect(val(Stat.CritDamage), `${doc.name} has no critDamage — it would crit for nothing extra`).toBeDefined();
      expect(CRIT_BASE + val(Stat.CritDamage)!, `${doc.name} crit multiplier`).toBeCloseTo(Number(multiplier), 6);
    }
  });
});
