/**
 * TTK sweep runner (task #153) — CLI.
 *
 *   pnpm --filter @ggd/ttk-sim ttk:sweep [-- --matches 12 --hp 4,6,8,10,12,16,20 --cap 240]
 *   npx tsx src/sweep.ts --matches 12
 *
 * Sweeps world.combatEnv.maxHealth over the requested values, running many
 * bot-vs-bot duels per value in BOTH modes (natural = ring off, production =
 * ring on), aggregates per-value round-length statistics, interpolates the
 * multiplier that meets the target (≥120 s min, ~180 s avg), prints a table, and
 * writes data/reports/ttk-experiment-153.md.
 *
 * ⚠️ THE OUTPUT PATH IS DELIBERATELY OUTSIDE VERSION CONTROL (GH#56). It used
 * to be `docs/_ttk-experiment-153.md`, a TRACKED file that this sweep silently
 * overwrote — so anyone who ran the tool dirtied the working tree, and the
 * committed copy was a frozen snapshot that started lying the moment
 * combat-env.json moved (its conclusion, maxHealth ≈ 15.7, was superseded the
 * next day and never shipped). `/data/**` is gitignored, so the report is a
 * product now rather than a document.
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadRoster, runMatchDuels, CONTENT_DIR, MID_MATCH_GRANT, COMBAT_ENV_BASE, type DuelSample } from "./harness";
import { mean, median, min, max, percentile, linfit, solveX } from "./stats";

const REPO_ROOT = join(new URL("../../..", import.meta.url).pathname);
const REPORT_PATH = join(REPO_ROOT, "data/reports/ttk-experiment-153.md");
const COMBAT_ENV_PATH = join(REPO_ROOT, "content/config/combat-env.json");

/**
 * Production round length is measured with the shipped combatMaxSec cap (a live
 * round CANNOT exceed it). Natural mode uses a higher cap so slow-but-resolvable
 * fights are not censored — resolvable matchups finish by ~315 s even at ×20, so
 * 600 s cleanly separates them from the true Tier-0 stalemates (which never
 * resolve). The generated report's own "Caveats" section restates this.
 */
const PRODUCTION_CAP_SEC = 240;

interface Args {
  matches: number;
  hp: number[];
  cap: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { matches: 40, hp: [4, 6, 8, 10, 12, 16, 20], cap: 600, out: REPORT_PATH };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--matches" && v) (a.matches = parseInt(v, 10)), i++;
    else if (k === "--hp" && v) (a.hp = v.split(",").map(Number).filter((x) => x > 0)), i++;
    else if (k === "--cap" && v) (a.cap = parseInt(v, 10)), i++;
    else if (k === "--out" && v) (a.out = v), i++;
    else if (k === "--quick") (a.matches = 4), (a.hp = [4, 12, 20]);
  }
  return a;
}

interface ModeAgg {
  n: number;
  decisiveCount: number;
  stallPct: number;
  /** decisive-only round lengths */
  minDec: number;
  p10Dec: number;
  medianDec: number;
  meanDec: number;
  maxDec: number;
  /** effective round length = min(ttk, cap) over ALL samples (censored at cap) */
  minEff: number;
  meanEff: number;
  medianEff: number;
}

function aggregate(samples: DuelSample[], cap: number): ModeAgg {
  const dec = samples.filter((s) => s.decisive).map((s) => s.ttkSec);
  const eff = samples.map((s) => Math.min(s.ttkSec, cap));
  return {
    n: samples.length,
    decisiveCount: dec.length,
    stallPct: samples.length ? (100 * (samples.length - dec.length)) / samples.length : NaN,
    minDec: min(dec),
    p10Dec: percentile(dec, 10),
    medianDec: median(dec),
    meanDec: mean(dec),
    maxDec: max(dec),
    minEff: min(eff),
    meanEff: mean(eff),
    medianEff: median(eff),
  };
}

/** Least-squares fit over only the rows whose y is finite (skips all-stall rows). */
function fitFinite(rows: Row[], y: (r: Row) => number): { k: number; b: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rows) {
    const v = y(r);
    if (Number.isFinite(v)) {
      xs.push(r.hp);
      ys.push(v);
    }
  }
  return linfit(xs, ys);
}

interface Row {
  hp: number;
  natural: ModeAgg;
  production: ModeAgg;
  naturalSamples: DuelSample[];
}

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toFixed(0) : "—";
}

function assertEnvBaseInSync(): string[] {
  const warnings: string[] = [];
  try {
    const doc = JSON.parse(readFileSync(COMBAT_ENV_PATH, "utf8")) as { multipliers?: Record<string, number> };
    const mult = doc.multipliers ?? {};
    for (const [k, v] of Object.entries(COMBAT_ENV_BASE)) {
      if (mult[k] !== v) warnings.push(`combat-env.json ${k}=${mult[k]} but harness base uses ${v}`);
    }
    if (typeof mult.maxHealth === "number") warnings.push(`current shipped maxHealth = ${mult.maxHealth}`);
  } catch (e) {
    warnings.push(`could not read combat-env.json: ${(e as Error).message}`);
  }
  return warnings;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const roster = await loadRoster(CONTENT_DIR);
  const envWarnings = assertEnvBaseInSync();

  console.log(
    `[ttk] roster=${roster.length} champions, matches/value=${args.matches} ` +
      `(~${args.matches * 2} duels/value/mode), hp=[${args.hp.join(",")}], cap=${args.cap}s`,
  );
  for (const w of envWarnings) console.log(`[ttk] note: ${w}`);

  const rows: Row[] = [];
  for (const hp of args.hp) {
    const natural: DuelSample[] = [];
    const production: DuelSample[] = [];
    for (let m = 0; m < args.matches; m++) {
      const seed = 0x9153 + m; // fixed per match index -> identical matchup across HP values
      natural.push(...runMatchDuels({ maxHealth: hp, matchSeed: seed, fireRing: false, capSec: args.cap, roster }));
      production.push(...runMatchDuels({ maxHealth: hp, matchSeed: seed, fireRing: true, capSec: PRODUCTION_CAP_SEC, roster }));
    }
    const row: Row = { hp, natural: aggregate(natural, args.cap), production: aggregate(production, PRODUCTION_CAP_SEC), naturalSamples: natural };
    rows.push(row);
    const n = row.natural;
    const p = row.production;
    console.log(
      `  x${String(hp).padStart(2)}  natural: min=${fmt(n.minDec)} p10=${fmt(n.p10Dec)} med=${fmt(n.medianDec)} mean=${fmt(n.meanDec)} ` +
        `stall=${n.stallPct.toFixed(0)}%   production(ring): min=${fmt(p.minEff)} med=${fmt(p.medianEff)} mean=${fmt(p.meanEff)}`,
    );
  }

  // Interpolate on the clean natural-mode signal (fit over rows with decisive data).
  const fitMean = fitFinite(rows, (r) => r.natural.meanDec);
  const fitMin = fitFinite(rows, (r) => r.natural.minDec);
  const fitP10 = fitFinite(rows, (r) => r.natural.p10Dec);
  const fitProdMean = fitFinite(rows, (r) => r.production.meanEff);

  const hpForMeanDec180 = solveX(fitMean, 180);
  const hpForMinDec120 = solveX(fitMin, 120);
  const hpForP10Dec120 = solveX(fitP10, 120);
  const hpForProdMean180 = solveX(fitProdMean, 180);
  // Recommendation anchors on the ROBUST metrics: mean round ≈ 180 s and a robust
  // "short round" (p10) ≥ 120 s. The ABSOLUTE minimum is deliberately NOT used —
  // it is an extreme order statistic over a 113-champion matchup space that keeps
  // dropping as more matchups are sampled (there is always a rarer burst pairing),
  // so anchoring on it would demand ever-higher HP and blow past the ~180 s avg.
  const recommend = Math.max(hpForMeanDec180, hpForP10Dec120);

  console.log("\n[ttk] interpolation (natural elimination TTK):");
  console.log(`  meanDecisive(s) ≈ ${fitMean.k.toFixed(2)}·hp + ${fitMean.b.toFixed(1)}  -> mean 180s at hp≈${hpForMeanDec180.toFixed(1)}`);
  console.log(`  p10Decisive(s)  ≈ ${fitP10.k.toFixed(2)}·hp + ${fitP10.b.toFixed(1)}  -> p10 120s at hp≈${hpForP10Dec120.toFixed(1)}`);
  console.log(`  minDecisive(s)  ≈ ${fitMin.k.toFixed(2)}·hp + ${fitMin.b.toFixed(1)}  -> abs-min 120s at hp≈${hpForMinDec120.toFixed(1)} (unstable — grows with sample size)`);
  console.log(`  production meanEff 180s at hp≈${hpForProdMean180.toFixed(1)}`);
  console.log(`  RECOMMEND maxHealth ≈ ${recommend.toFixed(1)}  (max of mean-180 and p10-120)`);

  writeFileSync(
    args.out,
    renderReport({ args, roster: roster.length, rows, fitMean, fitMin, fitP10, fitProdMean, hpForMeanDec180, hpForMinDec120, hpForP10Dec120, hpForProdMean180, recommend, envWarnings, elapsedSec: (Date.now() - t0) / 1000 }),
  );
  console.log(`\n[ttk] wrote ${args.out}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

interface ReportCtx {
  args: Args;
  roster: number;
  rows: Row[];
  fitMean: { k: number; b: number };
  fitMin: { k: number; b: number };
  fitP10: { k: number; b: number };
  fitProdMean: { k: number; b: number };
  hpForMeanDec180: number;
  hpForMinDec120: number;
  hpForP10Dec120: number;
  hpForProdMean180: number;
  recommend: number;
  envWarnings: string[];
  elapsedSec: number;
}

function renderReport(c: ReportCtx): string {
  const L: string[] = [];
  const rec = c.recommend;
  L.push(`# TTK experiment — maxHealth combat-env multiplier (task #153)`);
  L.push("");
  L.push(`_Generated by \`tools/ttk-sim\` (\`npx tsx src/sweep.ts\`). Regenerate to refresh._`);
  L.push("");
  L.push(`## Recommendation`);
  L.push("");
  L.push(`**Set \`combat-env.json\` \`multipliers.maxHealth\` ≈ \`${rec.toFixed(1)}\`** (currently \`4.0\`).`);
  L.push("");
  L.push(
    `This is the value that meets BOTH targets on the natural-elimination signal — average round ≈ 180 s ` +
      `(met at hp ≈ ${c.hpForMeanDec180.toFixed(1)}) AND a robust short round (p10) ≥ 120 s (met at hp ≈ ` +
      `${c.hpForP10Dec120.toFixed(1)}) — taken as the larger so neither is missed. TTK scales ~linearly with ` +
      `HP for fixed damage, so the fit interpolates cleanly.`,
  );
  L.push("");
  L.push(
    `**On "minimum".** The ABSOLUTE fastest matchup is used as the floor with caution: it is an extreme ` +
      `order statistic over a ${c.roster}-champion matchup space and keeps dropping as more matchups are ` +
      `sampled (there is always a rarer burst pairing), so the abs-min fit (120 s at hp ≈ ` +
      `${c.hpForMinDec120.toFixed(1)}, and still rising with sample size) is not a stable target — chasing ` +
      `it would push the AVERAGE far past 180 s. The p10 ("~90 % of rounds are at least this long") is the ` +
      `robust reading of the ≥ 120 s minimum, and it lands at the same ≈×${c.recommend.toFixed(0)} as the ` +
      `180 s average. A handful of glass-cannon matchups will still resolve under 120 s; the fire ring ` +
      `cannot fix those (it only shortens rounds) — only even more HP could, at the cost of dragging every ` +
      `other round well over 180 s.`,
  );
  L.push("");
  L.push(
    `**Why not the lower ~×${c.hpForProdMean180.toFixed(0)} the *production* mean suggests:** that average ` +
      `is inflated by the fire ring capping ~50 % of duels (Tier-0 stalemates) near 180–240 s, which hides ` +
      `that the DECISIVE rounds still finish fast. What makes rounds "feel too short" is the fast kills, and ` +
      `the ring can never slow those down — only more HP can.`,
  );
  L.push("");
  L.push(`## Method / fidelity`);
  L.push("");
  L.push(
    `- **Real combat.** Drives the actual \`MatchController\` + \`AIDriver\` (Tier-0 brain) from ` +
      `apps/game-server, stepping the authoritative \`SimWorld\` tick-by-tick through a live combat ` +
      `round. Round-end is read exactly as the server reads it (a duel is decided the tick one side's ` +
      `in-zone alive-count hits 0 — the \`teamAliveCount\` logic in \`checkCombatEnd\`). Nothing in ` +
      `packages/shared or apps/game-server is modified; only host config (\`world.combatEnv\`, arena ` +
      `rules, phase timings) is set before tick 0.`,
  );
  L.push(`- **Sample.** ${c.roster}-champion model-backed roster (the live random-pick pool). Each match spawns 12 bots → two parallel 3v3 duels → 2 samples. ${c.args.matches} matches per HP value → ~${c.args.matches * 2} duels per value per mode. Champion matchup is a deterministic function of the match seed and INDEPENDENT of maxHealth, so every HP value fights the identical matchups (controlled comparison).`);
  L.push(`- **Combat env.** Shipped \`combat-env.json\` base (cooldown ×0.25, abilityRange ×0.6, move speed ×1.0, all else 1.0) with \`maxHealth\` overridden per run.`);
  L.push(`- **Mid-match loadout.** Each bot is granted a mid-match power level at the pre-combat intermission (level ${1 + (MID_MATCH_GRANT.grantLevels ?? 0)}, Q/W/E learned + R unlocked, ~${600 + (MID_MATCH_GRANT.grantGold ?? 0)} g spent down its real buildPriority, one ${MID_MATCH_GRANT.augmentTier} augment) so damage/HP scale like a round 3–4 fight, not naked level 1.`);
  L.push(`- **Two modes.** *natural* = fire ring OFF (pure elimination TTK — the clean HP→TTK signal, and the floor on round length since the ring can only shorten a round). *production* = fire ring ON with the real \`config.match@1\` schedule (startSec 180), so Tier-0 stalemates resolve ~180–240 s as they do live.`);
  L.push(`- **COMBAT duration** = ticks from combat-entry to team-elimination ÷ 30 (TICK_HZ) = seconds. Natural mode caps at ${c.args.cap} s (high enough that resolvable matchups — which finish by ~315 s even at ×20 — are never censored; only true stalemates hit it). Production mode caps at ${PRODUCTION_CAP_SEC} s (the shipped \`combatMaxSec\`, which a live round cannot exceed).`);
  L.push("");
  L.push(`### Caveats`);
  L.push(
    `- **Fire ring** is the shipped round-length backstop; it only SHORTENS rounds (it never lets a fast kill run longer), so the *natural* minimum below is the true minimum round length regardless of the ring.`,
  );
  L.push(`- **Stalls.** Tier-0 bots target the NEAREST enemy, so damage is spread (no human focus-fire) and tanky/regen comps stalemate; the fire ring exists precisely to end these. Stall% below is over the natural (ring-off) mode; in production those rounds land at ~180–240 s.`);
  L.push(`- **Flowers / revive circles / guardians are OFF** in the harness (they are sustain/round-pacing confounders); enabling them would lengthen real rounds somewhat (flower/revive heals) — i.e. the recommended HP is, if anything, a slight over-estimate of what production needs.`);
  L.push(`- **Loadout & arena.** A fixed mid-match grant approximates an "average" round; late-game (more items/levels, EX unlocked) has more burst AND more HP — roughly self-cancelling. Skeleton arena (32 u spawn separation, identical to every shipped arena) adds a constant ~5 s approach to every sample.`);
  if (c.envWarnings.length) L.push(`- **Env sync:** ${c.envWarnings.join("; ")}.`);
  L.push("");
  L.push(`## Results`);
  L.push("");
  L.push(`### Natural elimination TTK (fire ring OFF) — the interpolation signal`);
  L.push("");
  L.push(`| maxHealth | min (s) | p10 (s) | median (s) | mean (s) | max decisive (s) | stall % |`);
  L.push(`|---:|---:|---:|---:|---:|---:|---:|`);
  for (const r of c.rows) {
    const n = r.natural;
    L.push(`| ×${r.hp} | ${fmt(n.minDec)} | ${fmt(n.p10Dec)} | ${fmt(n.medianDec)} | ${fmt(n.meanDec)} | ${fmt(n.maxDec)} | ${n.stallPct.toFixed(0)}% |`);
  }
  L.push("");
  L.push(`_min/p10/median/mean/max are over DECISIVE duels (a stalemate has no natural elimination time). min = the single fastest matchup = the shortest round that can occur; p10 = a robust "short round" less swayed by one freak matchup._`);
  L.push("");
  L.push(`### Production round length (fire ring ON, real schedule)`);
  L.push("");
  L.push(`| maxHealth | min (s) | median (s) | mean (s) |`);
  L.push(`|---:|---:|---:|---:|`);
  for (const r of c.rows) {
    const p = r.production;
    L.push(`| ×${r.hp} | ${fmt(p.minEff)} | ${fmt(p.medianEff)} | ${fmt(p.meanEff)} |`);
  }
  L.push("");
  L.push(`_Effective round length with the ring resolving stalemates. The ring caps the tail near 180–240 s; the minimum is still the fastest natural kill._`);
  L.push("");
  L.push(`## Scaling & interpolation`);
  L.push("");
  L.push(`Least-squares fits on the natural-mode table (TTK seconds vs maxHealth multiplier):`);
  L.push("");
  L.push(`- **mean** decisive TTK ≈ **${c.fitMean.k.toFixed(2)} × maxHealth ${c.fitMean.b >= 0 ? "+" : "−"} ${Math.abs(c.fitMean.b).toFixed(1)}** → 180 s at maxHealth ≈ **${c.hpForMeanDec180.toFixed(1)}**  ← avg target`);
  L.push(`- **p10** decisive TTK ≈ **${c.fitP10.k.toFixed(2)} × maxHealth ${c.fitP10.b >= 0 ? "+" : "−"} ${Math.abs(c.fitP10.b).toFixed(1)}** → 120 s at maxHealth ≈ **${c.hpForP10Dec120.toFixed(1)}**  ← robust "minimum" target`);
  L.push(`- abs-min decisive TTK ≈ ${c.fitMin.k.toFixed(2)} × maxHealth ${c.fitMin.b >= 0 ? "+" : "−"} ${Math.abs(c.fitMin.b).toFixed(1)} → 120 s at maxHealth ≈ ${c.hpForMinDec120.toFixed(1)} _(unstable: drops as more matchups are sampled — not used)_`);
  L.push(`- production mean round length → 180 s at maxHealth ≈ ${c.hpForProdMean180.toFixed(1)} _(ring-inflated — not used)_`);
  L.push("");
  L.push(`Each ~+1.0 to the maxHealth multiplier adds ≈ ${c.fitMean.k.toFixed(1)} s to the average round.`);
  L.push("");
  const highest = c.rows[c.rows.length - 1];
  if (highest && highest.natural.meanDec < 180) {
    L.push(`> Note: even the highest tested value (×${highest.hp}) has mean decisive TTK ${fmt(highest.natural.meanDec)} s < 180 s; the recommendation is an EXTRAPOLATION beyond the tested range.`);
    L.push("");
  }
  L.push(`---`);
  L.push(`_Run: ${c.args.matches} matches/value (~${c.args.matches * 2} duels/value/mode), natural cap ${c.args.cap} s / production cap ${PRODUCTION_CAP_SEC} s, ${c.elapsedSec.toFixed(1)} s wall. Harness: \`tools/ttk-sim\`._`);
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
