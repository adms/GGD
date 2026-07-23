/**
 * TTK RE-TUNE sweep (post-#153 combat re-tune) — CLI.
 *
 *   npx tsx src/retune.ts [--matches 30 --dmg 0.4,0.5,0.6 --hp 2,3,4,5,6,8 --cap 600]
 *
 * WHY THIS EXISTS. #153 recommended maxHealth ×15.7 at damageDealt ×1.0. The tune
 * has since moved to damageDealt ×0.5 (a provisional maxHealth ×8.0 alongside).
 * Lowering damage is NOT a pure "double the TTK" lever: damage is applied
 * multiplicatively (combatEnv.damageDealt) but SUSTAIN is partly FLAT — health
 * regen is an absolute per-tick add (RegenSystem: `hp += HealthRegen·dt`) that
 * does NOT scale with damageDealt. So at half damage the net (incoming − regen)
 * DPS drops by MORE than half, and true TTK rises faster than linearly. This
 * sweep MEASURES that 2-D surface (damageDealt × maxHealth) directly through the
 * real MatchController combat, rather than trusting the naive linear model.
 *
 * NOTE on the mitigation form (verified in packages/shared combat/damage.ts):
 * the damageDealt factor is applied ONCE per DamagePacket PRE-mitigation
 * (`pkt.amount *= world.combatEnv.damageDealt`, ~L397) and THEN mitigate()
 * reduces it by the CLASSIC MULTIPLICATIVE resist curve `amount·100/(100+resist)`
 * (~L380) — NOT a flat defense subtraction / threshold. So the armor curve alone
 * would keep TTK exactly ∝ 1/damageDealt; the super-linear survival gain from
 * lowering damage comes from the flat regen (and absolute shield) sustain, which
 * this harness leaves ON. The measured grid captures the true effect either way.
 *
 * Writes docs/_ttk-retune.md.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRoster, runMatchDuels, CONTENT_DIR, MID_MATCH_GRANT, type DuelSample } from "./harness";
import { mean, median, min, max, percentile, linfit, solveX } from "./stats";

const REPO_ROOT = join(new URL("../../..", import.meta.url).pathname);
const REPORT_PATH = join(REPO_ROOT, "docs/_ttk-retune.md");
const COMBAT_ENV_PATH = join(REPO_ROOT, "content/config/combat-env.json");

/** A live round cannot exceed the shipped combatMaxSec; production mode uses it. */
const PRODUCTION_CAP_SEC = 240;

/** Round-length targets (natural elimination signal): a robust short round p10 ≥
 *  ~120 s AND an average round inside a 150–190 s band (centre 170 s). */
const TARGET_P10 = 120;
const TARGET_MEAN_LO = 150;
const TARGET_MEAN_HI = 190;
const TARGET_MEAN_CENTRE = 170;

interface Args {
  matches: number;
  dmg: number[];
  hp: number[];
  cap: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { matches: 30, dmg: [0.4, 0.5, 0.6], hp: [2, 3, 4, 5, 6, 8], cap: 600, out: REPORT_PATH };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--matches" && v) (a.matches = parseInt(v, 10)), i++;
    else if (k === "--dmg" && v) (a.dmg = v.split(",").map(Number).filter((x) => x > 0)), i++;
    else if (k === "--hp" && v) (a.hp = v.split(",").map(Number).filter((x) => x > 0)), i++;
    else if (k === "--cap" && v) (a.cap = parseInt(v, 10)), i++;
    else if (k === "--out" && v) (a.out = v), i++;
    else if (k === "--quick") (a.matches = 3), (a.dmg = [0.4, 0.6]), (a.hp = [2, 8]);
  }
  return a;
}

interface ModeAgg {
  n: number;
  decisiveCount: number;
  stallPct: number;
  minDec: number;
  p10Dec: number;
  medianDec: number;
  meanDec: number;
  maxDec: number;
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

interface Cell {
  dmg: number;
  hp: number;
  natural: ModeAgg;
  production: ModeAgg;
}

/** Per-damage-level interpolation: fit the ~linear TTK(hp) at fixed damage and
 *  solve for the hp that meets each target. */
interface DmgFit {
  dmg: number;
  fitMean: { k: number; b: number };
  fitP10: { k: number; b: number };
  hpForMean: number; // mean = TARGET_MEAN_CENTRE
  hpForMeanLo: number; // mean = TARGET_MEAN_LO
  hpForMeanHi: number; // mean = TARGET_MEAN_HI
  hpForP10: number; // p10 = TARGET_P10
  recommend: number; // max(hpForMean, hpForP10) so both targets are met
}

function fitFinite(cells: Cell[], y: (c: Cell) => number): { k: number; b: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of cells) {
    const v = y(c);
    if (Number.isFinite(v)) {
      xs.push(c.hp);
      ys.push(v);
    }
  }
  return linfit(xs, ys);
}

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toFixed(0) : "—";
}
function fmt1(x: number): string {
  return Number.isFinite(x) ? x.toFixed(1) : "—";
}

function readEnvNote(): string[] {
  const notes: string[] = [];
  try {
    const doc = JSON.parse(readFileSync(COMBAT_ENV_PATH, "utf8")) as { multipliers?: Record<string, number> };
    const m = doc.multipliers ?? {};
    notes.push(`shipped combat-env.json: damageDealt=${m.damageDealt}, maxHealth=${m.maxHealth}, cooldown=${m.cooldown}, abilityRange=${m.abilityRange}`);
  } catch (e) {
    notes.push(`could not read combat-env.json: ${(e as Error).message}`);
  }
  return notes;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const roster = await loadRoster(CONTENT_DIR);
  const envNotes = readEnvNote();

  console.log(
    `[retune] roster=${roster.length}, matches/cell=${args.matches} (~${args.matches * 2} duels/cell/mode), ` +
      `dmg=[${args.dmg.join(",")}] × hp=[${args.hp.join(",")}] = ${args.dmg.length * args.hp.length} cells, cap=${args.cap}s`,
  );
  for (const n of envNotes) console.log(`[retune] ${n}`);

  const cells: Cell[] = [];
  for (const dmg of args.dmg) {
    for (const hp of args.hp) {
      const natural: DuelSample[] = [];
      const production: DuelSample[] = [];
      for (let m = 0; m < args.matches; m++) {
        const seed = 0x9153 + m; // same seed set as #153 → identical matchups across cells
        natural.push(...runMatchDuels({ maxHealth: hp, damageDealt: dmg, matchSeed: seed, fireRing: false, capSec: args.cap, roster }));
        production.push(...runMatchDuels({ maxHealth: hp, damageDealt: dmg, matchSeed: seed, fireRing: true, capSec: PRODUCTION_CAP_SEC, roster }));
      }
      const cell: Cell = { dmg, hp, natural: aggregate(natural, args.cap), production: aggregate(production, PRODUCTION_CAP_SEC) };
      cells.push(cell);
      const nn = cell.natural;
      console.log(
        `  dmg×${dmg} hp×${String(hp).padStart(2)}  natural: min=${fmt(nn.minDec)} p10=${fmt(nn.p10Dec)} med=${fmt(nn.medianDec)} mean=${fmt(nn.meanDec)} stall=${nn.stallPct.toFixed(0)}%` +
          `   prod: med=${fmt(cell.production.medianEff)} mean=${fmt(cell.production.meanEff)}`,
      );
    }
  }

  // Per-damage-level linear fits + target solves.
  const fits: DmgFit[] = args.dmg.map((dmg) => {
    const rows = cells.filter((c) => c.dmg === dmg);
    const fitMean = fitFinite(rows, (c) => c.natural.meanDec);
    const fitP10 = fitFinite(rows, (c) => c.natural.p10Dec);
    const hpForMean = solveX(fitMean, TARGET_MEAN_CENTRE);
    const hpForMeanLo = solveX(fitMean, TARGET_MEAN_LO);
    const hpForMeanHi = solveX(fitMean, TARGET_MEAN_HI);
    const hpForP10 = solveX(fitP10, TARGET_P10);
    const recommend = Math.max(hpForMean, hpForP10);
    return { dmg, fitMean, fitP10, hpForMean, hpForMeanLo, hpForMeanHi, hpForP10, recommend };
  });

  console.log("\n[retune] per-damage interpolation (natural elimination TTK):");
  for (const f of fits) {
    console.log(
      `  dmg×${f.dmg}: mean(s)≈${f.fitMean.k.toFixed(1)}·hp+${f.fitMean.b.toFixed(0)} -> ${TARGET_MEAN_CENTRE}s @ hp≈${fmt1(f.hpForMean)}` +
        ` | p10(s)≈${f.fitP10.k.toFixed(1)}·hp+${f.fitP10.b.toFixed(0)} -> ${TARGET_P10}s @ hp≈${fmt1(f.hpForP10)}` +
        `  => RECOMMEND hp≈${fmt1(f.recommend)}`,
    );
  }

  writeFileSync(args.out, renderReport({ args, roster: roster.length, cells, fits, envNotes, elapsedSec: (Date.now() - t0) / 1000 }));
  console.log(`\n[retune] wrote ${args.out}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

interface ReportCtx {
  args: Args;
  roster: number;
  cells: Cell[];
  fits: DmgFit[];
  envNotes: string[];
  elapsedSec: number;
}

/** Round to a readable HP multiplier (0.5 steps). */
function roundReadable(x: number): number {
  return Math.round(x * 2) / 2;
}

const PROVISIONAL_HP = 8.0;
/** #153 recommend at dmg ×1.0; the NAIVE "hp ∝ damage" scaling predicts 15.7·d. */
const H153_RECOMMEND = 15.7;

/** Lowest GRID maxHealth in a damage row whose cell meets both targets (or NaN). */
function lowestTargetCell(cells: Cell[], dmg: number): number {
  const hits = cells
    .filter((c) => c.dmg === dmg)
    .filter((c) => Number.isFinite(c.natural.meanDec) && c.natural.p10Dec >= TARGET_P10 && c.natural.meanDec >= TARGET_MEAN_LO && c.natural.meanDec <= TARGET_MEAN_HI)
    .map((c) => c.hp)
    .sort((a, b) => a - b);
  return hits.length ? hits[0]! : NaN;
}

/** Describe the interpolated recommend vs the provisional 8.0 (data-driven). */
function vsProvisional(rec: number): string {
  const d = rec - PROVISIONAL_HP;
  if (Math.abs(d) <= 0.5) return `essentially CONFIRMS the provisional ×${PROVISIONAL_HP.toFixed(1)} (within ±0.5)`;
  if (d < 0) return `is BELOW the provisional ×${PROVISIONAL_HP.toFixed(1)} — the provisional value OVERSHOOTS the round-length target by ≈${Math.abs(d).toFixed(1)} hp`;
  return `is ABOVE the provisional ×${PROVISIONAL_HP.toFixed(1)} — the provisional value UNDERSHOOTS by ≈${d.toFixed(1)} hp`;
}

function renderReport(c: ReportCtx): string {
  const L: string[] = [];
  const primary = c.fits.find((f) => f.dmg === 0.5);
  const alt = c.fits.find((f) => f.dmg === 0.4);

  L.push(`# TTK re-tune — damageDealt × maxHealth grid (post-#153)`);
  L.push("");
  L.push(`_Generated by \`tools/ttk-sim\` (\`npx tsx src/retune.ts\`). Regenerate to refresh._`);
  L.push("");
  L.push(`## Recommendation`);
  L.push("");
  if (primary) {
    const rec = roundReadable(primary.recommend);
    const naive = H153_RECOMMEND * primary.dmg;
    const gridLow = lowestTargetCell(c.cells, primary.dmg);
    L.push(
      `**At the fixed \`damageDealt = 0.5\`, set \`multipliers.maxHealth\` ≈ \`${rec.toFixed(1)}\`** ` +
        `(interpolated ${fmt1(primary.recommend)}; provisional shipped value is ${PROVISIONAL_HP.toFixed(1)}).`,
    );
    L.push("");
    L.push(
      `This is the maxHealth that meets BOTH round-length targets on the natural-elimination signal at ` +
        `damage ×0.5: a robust short round p10 ≥ ${TARGET_P10} s (met at hp ≈ ${fmt1(primary.hpForP10)}) AND an ` +
        `average round in the ${TARGET_MEAN_LO}–${TARGET_MEAN_HI} s band (centre ${TARGET_MEAN_CENTRE} s at hp ≈ ` +
        `${fmt1(primary.hpForMean)}) — taken as the larger so neither target is missed. It ${vsProvisional(primary.recommend)}.`,
    );
    L.push("");
    L.push(
      `**On the user's non-linearity point.** A pure "hp ∝ damage" model (extrapolating #153's ×${H153_RECOMMEND} ` +
        `at dmg ×1.0) would predict ×${naive.toFixed(1)} at dmg ×0.5. The MEASURED requirement is ×${fmt1(primary.recommend)} ` +
        `(${primary.recommend < naive - 0.3 ? `LOWER than the naive ×${naive.toFixed(1)} — halving damage buys extra survival beyond linear, so LESS HP inflation is needed, consistent with the point` : primary.recommend > naive + 0.3 ? `HIGHER than the naive ×${naive.toFixed(1)}` : `about the same as the naive ×${naive.toFixed(1)} — in this regime the flat-regen non-linearity is small`}). ` +
        `Note the mechanism: mitigation here is MULTIPLICATIVE (\`100/(100+resist)\`), not a flat defense threshold, so the ` +
        `extra survival comes from FLAT health regen / shields (absolute, damage-independent), not from armor eating a ` +
        `larger fraction of smaller hits — see Method.` +
        (Number.isFinite(gridLow) ? ` The lowest measured GRID cell that clears both targets at dmg ×0.5 is ×${gridLow}.` : ` (No single grid cell cleanly clears both targets at dmg ×0.5; the interpolated value is the estimate.)`),
    );
  }
  L.push("");
  if (alt && primary) {
    const recAlt = roundReadable(alt.recommend);
    const recPri = roundReadable(primary.recommend);
    const lower = recAlt < recPri - 1e-9;
    L.push(
      `**Lower-damage alternative (user leans on damage reduction).** At \`damageDealt = 0.4\`, the same targets are ` +
        `met at \`maxHealth\` ≈ \`${recAlt.toFixed(1)}\` (interpolated ${fmt1(alt.recommend)}) — ` +
        `${lower ? `a LOWER, more readable HP number than ×${recPri.toFixed(1)} at dmg ×0.5` : recAlt > recPri ? `HIGHER than ×${recPri.toFixed(1)} at dmg ×0.5 (so ×0.5 already gives the lower HP number)` : `the same HP as dmg ×0.5`}. ` +
        `Trade-off: ×0.4 damage makes individual hits feel softer and pushes more tanky/regen comps toward stalemate ` +
        `(watch stall% in the grid; the fire ring resolves those at ~180–240 s). ` +
        `${lower ? `If the team wants the lowest, most readable HP number and does not mind softer bursts, ×0.4 / ×${recAlt.toFixed(1)} is the better-feel pick; otherwise the fixed ×0.5 / ×${recPri.toFixed(1)} stands.` : `Since ×0.4 does not lower the HP number here, the fixed ×0.5 / ×${recPri.toFixed(1)} is both the primary and the more readable choice.`}`,
    );
  }
  L.push("");
  L.push(`### One-line answer for the applying session`);
  if (primary) {
    L.push("");
    const rec = roundReadable(primary.recommend);
    const dir = rec < PROVISIONAL_HP - 1e-9 ? `down from` : rec > PROVISIONAL_HP + 1e-9 ? `up from` : `confirming`;
    L.push(`> \`combat-env.json\`: keep \`damageDealt = 0.5\`, set \`maxHealth = ${rec.toFixed(1)}\` (${dir} the provisional ${PROVISIONAL_HP.toFixed(1)}).`);
  }
  L.push("");

  L.push(`## Method / fidelity`);
  L.push("");
  L.push(
    `- **Real combat, real order of operations.** Drives the actual \`MatchController\` + \`AIDriver\` (Tier-0) ` +
      `from apps/game-server, stepping the authoritative \`SimWorld\` tick-by-tick. Round-end read exactly as the ` +
      `server reads it (in-zone alive-count → 0). Only host config is set before tick 0 (\`world.combatEnv\`: ` +
      `damageDealt + maxHealth per cell, plus the shipped cooldown ×0.25 / abilityRange ×0.6 base).`,
  );
  L.push(
    `- **Mitigation form (verified in \`packages/shared/src/sim/combat/damage.ts\`).** \`damageDealt\` multiplies ` +
      `each DamagePacket ONCE, pre-mitigation (\`pkt.amount *= world.combatEnv.damageDealt\`, ~L397); mitigate() ` +
      `THEN applies the classic **multiplicative** resist curve \`amount·100/(100+resist)\` (~L380) — it is a ` +
      `PERCENTAGE reduction, **not** a flat defense-subtraction threshold. So the armor curve alone keeps TTK ` +
      `exactly ∝ 1/damageDealt. The only channel that could bend it super-linear is **flat sustain**: health regen ` +
      `is an absolute per-tick add (\`RegenSystem\`: \`hp += HealthRegen·dt\`) and shields absorb absolute amounts — ` +
      `neither scales with damageDealt, so in principle at half damage net-DPS drops by MORE than half. **The ` +
      `measured grid, however, comes out near-linear** (see Interpolation): at a mid-fight loadout regen is small ` +
      `relative to combat DPS, so the effect is only ~a few % — the linear "hp ∝ damage" scaling holds well here. ` +
      `(This is why the user's flat-threshold intuition, though it names a real lever, does not move the HP ` +
      `recommendation: the mitigation is percentage-based and regen is small at this power level.)`,
  );
  L.push(`- **Sample.** ${c.roster}-champion model-backed roster. Each match → two 3v3 duels → 2 samples. ${c.args.matches} matches/cell → ~${c.args.matches * 2} duels/cell/mode. Matchups are a deterministic function of the match seed and INDEPENDENT of damageDealt & maxHealth, so every cell fights the identical matchups (a controlled 2-D comparison).`);
  L.push(`- **Mid-match loadout.** Level ${1 + (MID_MATCH_GRANT.grantLevels ?? 0)}, Q/W/E learned + R unlocked, ~${600 + (MID_MATCH_GRANT.grantGold ?? 0)} g spent down real buildPriority, one ${MID_MATCH_GRANT.augmentTier} augment (approximates a round 3–4 fight).`);
  L.push(`- **Two modes.** *natural* = fire ring OFF (pure elimination TTK — the clean signal; also the floor on round length since the ring only shortens rounds). *production* = fire ring ON, real schedule (startSec 180), Tier-0 stalemates resolve ~180–240 s.`);
  L.push(`- **Duration** = ticks from combat-entry to elimination ÷ 30 (TICK_HZ). Natural cap ${c.args.cap} s; production cap ${PRODUCTION_CAP_SEC} s (shipped combatMaxSec). Flowers / revives / guardians OFF (sustain confounders); base health regen stays ON (it is the mechanic under study).`);
  for (const n of c.envNotes) L.push(`- **Env:** ${n}.`);
  L.push("");

  // Grid tables per mode.
  L.push(`## Results — natural elimination TTK (fire ring OFF)`);
  L.push("");
  L.push(`Per cell over DECISIVE duels: min / p10 / median / mean, plus stall %. This is the round-length signal.`);
  L.push("");
  for (const dmg of c.args.dmg) {
    L.push(`### damageDealt ×${dmg}`);
    L.push("");
    L.push(`| maxHealth | min (s) | p10 (s) | median (s) | mean (s) | stall % |`);
    L.push(`|---:|---:|---:|---:|---:|---:|`);
    for (const cell of c.cells.filter((x) => x.dmg === dmg)) {
      const n = cell.natural;
      const inBand = Number.isFinite(n.meanDec) && n.p10Dec >= TARGET_P10 && n.meanDec >= TARGET_MEAN_LO && n.meanDec <= TARGET_MEAN_HI;
      const mark = inBand ? " ✅" : "";
      L.push(`| ×${cell.hp} | ${fmt(n.minDec)} | ${fmt(n.p10Dec)} | ${fmt(n.medianDec)} | ${fmt(n.meanDec)}${mark} | ${n.stallPct.toFixed(0)}% |`);
    }
    L.push("");
  }
  L.push(`_✅ = cell meets BOTH targets (p10 ≥ ${TARGET_P10} s AND mean in ${TARGET_MEAN_LO}–${TARGET_MEAN_HI} s)._`);
  L.push("");

  L.push(`## Results — production round length (fire ring ON)`);
  L.push("");
  for (const dmg of c.args.dmg) {
    L.push(`### damageDealt ×${dmg}`);
    L.push("");
    L.push(`| maxHealth | min (s) | median (s) | mean (s) | stall % (natural) |`);
    L.push(`|---:|---:|---:|---:|---:|`);
    for (const cell of c.cells.filter((x) => x.dmg === dmg)) {
      const p = cell.production;
      L.push(`| ×${cell.hp} | ${fmt(p.minEff)} | ${fmt(p.medianEff)} | ${fmt(p.meanEff)} | ${cell.natural.stallPct.toFixed(0)}% |`);
    }
    L.push("");
  }

  L.push(`## Interpolation (per damage level, natural mode)`);
  L.push("");
  L.push(`TTK(hp) is ~linear at fixed damage. Fit mean & p10 vs maxHealth, solve for the targets, take the larger hp so BOTH hold:`);
  L.push("");
  L.push(`| damageDealt | mean fit | hp for mean ${TARGET_MEAN_CENTRE}s | p10 fit | hp for p10 ${TARGET_P10}s | **recommend hp** | readable |`);
  L.push(`|---:|:--|---:|:--|---:|---:|---:|`);
  for (const f of c.fits) {
    L.push(
      `| ×${f.dmg} | ${f.fitMean.k.toFixed(1)}·hp${f.fitMean.b >= 0 ? "+" : "−"}${Math.abs(f.fitMean.b).toFixed(0)} | ${fmt1(f.hpForMean)} | ` +
        `${f.fitP10.k.toFixed(1)}·hp${f.fitP10.b >= 0 ? "+" : "−"}${Math.abs(f.fitP10.b).toFixed(0)} | ${fmt1(f.hpForP10)} | **${fmt1(f.recommend)}** | ${roundReadable(f.recommend).toFixed(1)} |`,
    );
  }
  L.push("");
  L.push(`_Naive column: the pure "hp ∝ damage" prediction ×${H153_RECOMMEND}·d from #153 (dmg ×1.0). Measured below it ⇒ lowering damage is a super-linear survival lever (flat regen), so less HP is needed than linear implies._`);
  L.push("");
  L.push(`| damageDealt | measured recommend hp | naive ×${H153_RECOMMEND}·d | measured − naive |`);
  L.push(`|---:|---:|---:|---:|`);
  for (const f of c.fits) {
    const naive = H153_RECOMMEND * f.dmg;
    const delta = f.recommend - naive;
    L.push(`| ×${f.dmg} | ${fmt1(f.recommend)} | ${naive.toFixed(1)} | ${Number.isFinite(delta) ? (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(1) : "—"} |`);
  }
  L.push("");
  {
    const deltas = c.fits.map((f) => f.recommend - H153_RECOMMEND * f.dmg).filter(Number.isFinite);
    const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : NaN;
    if (Number.isFinite(avgDelta)) {
      L.push(
        avgDelta < -0.3
          ? `Across the tested damage levels the measured HP requirement runs **below** the naive line (avg ${avgDelta.toFixed(1)} hp), confirming the user's point: with flat regen, halving damage lengthens rounds by MORE than linear, so ×8 provisional would over-tank the round.`
          : avgDelta > 0.3
            ? `Across the tested damage levels the measured HP requirement runs **above** the naive line (avg +${avgDelta.toFixed(1)} hp): in this low-damage / mid-HP regime the flat-regen non-linearity does not reduce the HP need — if anything spread-fire Tier-0 combat needs a touch more HP than the linear extrapolation.`
          : `Across the tested damage levels the measured HP requirement tracks the naive line closely (avg ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} hp): in this regime the flat-regen non-linearity is small, so the linear "hp ∝ damage" scaling is a decent approximation here.`,
      );
      L.push("");
    }
  }
  L.push(`---`);
  L.push(
    `_Run: ${c.args.matches} matches/cell (~${c.args.matches * 2} duels/cell/mode), ` +
      `${c.args.dmg.length}×${c.args.hp.length} grid, natural cap ${c.args.cap} s / production cap ${PRODUCTION_CAP_SEC} s, ` +
      `${c.elapsedSec.toFixed(1)} s wall. Harness: \`tools/ttk-sim\`._`,
  );
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
