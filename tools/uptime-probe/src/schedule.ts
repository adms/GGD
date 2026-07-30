// tools/uptime-probe/src/schedule.ts — how often the probe actually runs.
//
// This exists for ONE reason: on a private repo, GitHub Actions minutes are
// billed and every job is rounded up to a whole minute, so the cron expression
// in .github/workflows/uptime.yml is a MONEY decision wearing the clothes of a
// timing decision. `*/15` → `*/5` looks like a one-character tightening and
// triples the bill.
//
// So the schedule is declared in TWO places on purpose — the workflow (which
// GitHub reads) and probe.config.json (which a human reads) — and
// `scheduleDrift.test.ts` fails when they disagree, or when the stated
// runs-per-day stops matching the crons. That is the same three-places rule the
// content config lives under, applied to the one number that has a bill
// attached.
//
// Only the subset a monitoring cron needs is supported; anything else throws
// rather than guessing, because a silently-wrong estimate is worse than none.

/** Expands one cron field into the explicit values it matches. */
export function expandField(spec: string, min: number, max: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (p === "") throw new Error(`empty cron field segment in "${spec}"`);

    const stepAt = p.indexOf("/");
    const base = stepAt >= 0 ? p.slice(0, stepAt) : p;
    const stepRaw = stepAt >= 0 ? p.slice(stepAt + 1) : "1";
    const step = Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad cron step "/${stepRaw}" in "${spec}"`);

    let lo: number;
    let hi: number;
    if (base === "*") {
      lo = min;
      hi = max;
    } else if (base.includes("-")) {
      const [a, b] = base.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(base);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`cron field "${p}" is out of range [${min}, ${max}]`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Runs per day for a 5-field cron. Day-of-month / month / day-of-week must all
 * be `*` — a monitor that only watches on Tuesdays is not a monitor, and
 * supporting it would mean this function could no longer answer "per day" with
 * a single number.
 */
export function countRunsPerDay(cron: string): number {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) throw new Error(`cron "${cron}" must have 5 fields, got ${f.length}`);
  const [minute, hour, dom, mon, dow] = f as [string, string, string, string, string];
  for (const [name, v] of [["day-of-month", dom], ["month", mon], ["day-of-week", dow]] as const) {
    if (v !== "*") throw new Error(`cron "${cron}": ${name} must be "*" for a per-day count (got "${v}")`);
  }
  return expandField(minute, 0, 59).length * expandField(hour, 0, 23).length;
}

/** Total across every schedule entry. */
export function totalRunsPerDay(crons: readonly string[]): number {
  return crons.reduce((n, c) => n + countRunsPerDay(c), 0);
}

/**
 * Billed minutes for a 30-day month, at GitHub's whole-minute rounding.
 * A healthy run takes ~20 s; a run with an outage takes attempts × delay longer
 * and can cross into a second minute, so this is a FLOOR, not an estimate —
 * which is the right direction for a budget.
 */
export function minMonthlyMinutes(crons: readonly string[], daysPerMonth = 30): number {
  return totalRunsPerDay(crons) * daysPerMonth;
}

/** Pulls the `- cron: "…"` values out of a workflow file, in order. */
export function parseWorkflowCrons(yaml: string): string[] {
  const out: string[] = [];
  for (const line of yaml.split("\n")) {
    const m = /^\s*-\s*cron:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    out.push(m[1]!.trim().replace(/^["']|["']$/g, ""));
  }
  return out;
}
