// tools/uptime-probe/src/config.ts — the probe's tunables, and their validator.
//
// WHY THIS IS A COMMITTED JSON FILE AND NOT AN ADMIN-CONSOLE PAGE
// ---------------------------------------------------------------
// The project rule is "編輯器可調優先" — a decision belongs in the back office,
// not in a constant. This file is the deliberate exception, and the reason is
// the one thing that makes a monitor a monitor:
//
//   ⚠️ THE PROBE MUST NOT DEPEND ON THE THING IT PROBES.
//
// The admin console's durable config lives in the platform's jsonstore behind
// `/api/v1/...` on the very host we are checking. A probe that fetched its
// interval, its thresholds and its alert recipient from ggd.adms.ai would go
// blind at exactly the moment ggd.adms.ai went down — the failure mode this
// ticket exists to close. (#241 is the same shape one layer down: config the
// Go side consumes cannot come through the content overlay.)
//
// So every decision point is still a FIELD, not a constant — it just lives in
// `tools/uptime-probe/probe.config.json`, which is edited and committed like
// any other file, and which the GitHub Actions runner already has a copy of
// before it makes a single network call. The only secret (the Slack webhook)
// is NOT here: it comes from the environment. See notify.ts.
//
// Validation rule inherited from CLAUDE.md: every numeric field gets a MIN AND
// A MAX. `validateField` used to check only `min`, so 50 typed as 500 sailed
// through and was silently clamped downstream (#277). A monitor that silently
// clamped `attempts` to 1 would page the owner on every Wi-Fi hiccup.

/** Comparison operators available to a body assertion. */
export type AssertOp =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "exists"
  | "absent"
  | "contains";

/**
 * One assertion against the parsed JSON body.
 *
 * This is the escape hatch that makes the probe survive a `/healthz` that grows
 * up. Today the platform's `/healthz` answers a constant `{"status":"ok"}` and
 * there is nothing here worth asserting beyond the status code; the day it
 * reports `redis`, `store` or `degraded`, alerting on it is a JSON edit here,
 * not a code change and not a redeploy.
 */
export interface BodyAssertion {
  /** Dot path into the JSON body, e.g. `sim.p99Ms` or `platform.degraded`. */
  path: string;
  op: AssertOp;
  /** Compared value. Ignored by `exists` / `absent`. */
  value?: unknown;
  /** Human sentence used in the alert when this assertion fails. */
  because?: string;
}

/**
 * `page` = wake the owner. `warn` = report in the run summary and the Slack
 * message body, but never on its own reason to alert.
 *
 * This is a decision point, not a number: "is a slow tick an outage?" has no
 * universal answer, so it is a per-target field with the conservative default.
 */
export type Severity = "page" | "warn";

export interface ProbeTarget {
  /** Stable key. Used for alert de-duplication in the state file — renaming it
   *  resets that target's alert history, so treat it as an id, not a label. */
  id: string;
  /** What the owner sees in Slack. */
  label: string;
  url: string;
  /** Turn a target off without deleting it (and without losing its notes). */
  enabled: boolean;
  severity: Severity;
  method?: "GET" | "HEAD";
  /** Exact status code that counts as healthy. */
  expectStatus: number;
  /** Optional substring the raw body must contain. */
  expectBodyContains?: string;
  /** Optional assertions against the parsed JSON body. */
  expectJson?: BodyAssertion[];
  /** Free-text note kept next to the target so the "why" survives the author. */
  note?: string;
}

export interface NotifyConfig {
  /** Environment variable holding the incoming-webhook URL. NEVER the URL. */
  webhookEnv: string;
  /** Fallback env var — lets the probe reuse #209's existing channel. */
  webhookEnvFallback: string;
  /**
   * Who gets pinged. `""` = post quietly, `"<!channel>"` = ping the channel,
   * `"<@U01234ABC>"` = ping one person's phone. THE decision point behind
   * "誰會被吵醒" — deliberately a field, because the answer changes with the
   * hour of day and the owner's patience.
   */
  mention: string;
  /** Bot display name in Slack. */
  username: string;
  /** Send a follow-up when a paging target comes back. */
  notifyOnRecovery: boolean;
}

export interface ScheduleConfig {
  /**
   * The cron entries from `.github/workflows/uptime.yml`, verbatim and in
   * order. GitHub reads that file; a human reads this one. `scheduleDrift.test.ts`
   * fails when they disagree — the same three-places rule the content config
   * lives under, applied here because the schedule has a BILL attached (private
   * repo, whole-minute rounding). See schedule.ts.
   */
  cronUtc: string[];
  /** Must equal what those crons actually produce. The guard recomputes it. */
  estimatedRunsPerDay: number;
  note?: string;
}

export interface ProbeConfig {
  version: number;
  schedule: ScheduleConfig;
  /**
   * How many consecutive failed attempts, INSIDE ONE RUN, before a target is
   * called down. `1` would page on a single dropped packet; this is the
   * anti-blip threshold and the single most important knob in the file.
   */
  attempts: number;
  /** Gap between those attempts. attempts × attemptDelayMs is the window a
   *  blip has to clear in before it becomes an alert. */
  attemptDelayMs: number;
  /** Per-request timeout. A hung request is a failure, not a wait forever. */
  timeoutMs: number;
  /**
   * While a target stays down, re-send the alert at most this often. 0 = alert
   * every run (loud). Requires --state to have any effect; without a state file
   * the probe has no memory and alerts every run BY DESIGN — a monitor that
   * fails silent is worse than one that repeats itself.
   */
  repeatAlertAfterMinutes: number;
  notify: NotifyConfig;
  targets: ProbeTarget[];
}

/** Inclusive [min, max] bounds for every numeric field. Both ends, always. */
const NUM_BOUNDS: Record<string, { min: number; max: number }> = {
  attempts: { min: 2, max: 10 }, // 1 defeats the anti-blip design; see below
  attemptDelayMs: { min: 1_000, max: 300_000 },
  timeoutMs: { min: 1_000, max: 60_000 },
  repeatAlertAfterMinutes: { min: 0, max: 10_080 }, // 0 = every run … 1 week
};

const OPS = new Set<AssertOp>([
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "exists",
  "absent",
  "contains",
]);

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Validates a parsed config object. Returns every problem at once rather than
 * throwing on the first — an operator editing five fields wants five errors.
 *
 * `attempts: 1` is REJECTED, not accepted-and-warned. The whole ticket is "do
 * not wake the owner for one dropped packet"; a config that quietly allowed
 * the threshold to collapse to a single attempt would reintroduce the bug the
 * guard suite exists to prevent, and it would do it through a data file that
 * no test covers.
 */
export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const push = (m: string) => errors.push(m);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["config must be a JSON object"] };
  }
  const c = raw as Record<string, unknown>;

  if (c.version !== 1) push(`version must be 1 (got ${JSON.stringify(c.version)})`);

  for (const [key, bound] of Object.entries(NUM_BOUNDS)) {
    const v = c[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      push(`${key} must be a finite number (got ${JSON.stringify(v)})`);
      continue;
    }
    if (v < bound.min) push(`${key} must be >= ${bound.min} (got ${v})`);
    if (v > bound.max) push(`${key} must be <= ${bound.max} (got ${v})`);
  }

  const s = c.schedule;
  if (typeof s !== "object" || s === null || Array.isArray(s)) {
    push("schedule must be an object");
  } else {
    const ss = s as Record<string, unknown>;
    if (!Array.isArray(ss.cronUtc) || ss.cronUtc.length === 0) {
      push("schedule.cronUtc must be a non-empty array of cron strings");
    } else if (!ss.cronUtc.every((v) => typeof v === "string" && v.trim() !== "")) {
      push("schedule.cronUtc entries must be non-empty strings");
    }
    const runs = ss.estimatedRunsPerDay;
    if (typeof runs !== "number" || !Number.isInteger(runs)) {
      push("schedule.estimatedRunsPerDay must be an integer");
    } else if (runs < 1) {
      push("schedule.estimatedRunsPerDay must be >= 1");
    } else if (runs > 288) {
      // 288 = every 5 minutes, GitHub's own floor. Anything above it is a typo,
      // and on a private repo a typo here is a bill — an upper bound, not just
      // a lower one (the #277 lesson).
      push(`schedule.estimatedRunsPerDay must be <= 288 (got ${runs}) — that is already every 5 minutes`);
    }
  }

  const n = c.notify;
  if (typeof n !== "object" || n === null) {
    push("notify must be an object");
  } else {
    const nn = n as Record<string, unknown>;
    for (const k of ["webhookEnv", "webhookEnvFallback", "mention", "username"]) {
      if (typeof nn[k] !== "string") push(`notify.${k} must be a string`);
    }
    if (typeof nn.notifyOnRecovery !== "boolean") push("notify.notifyOnRecovery must be a boolean");
    // The env var NAMES are config; the VALUES are secrets. A URL here would
    // mean someone pasted the webhook into a committed file.
    for (const k of ["webhookEnv", "webhookEnvFallback"]) {
      const v = nn[k];
      if (typeof v === "string" && /https?:\/\//i.test(v)) {
        push(`notify.${k} must be an ENV VAR NAME, not a URL — the webhook is a secret and must never be committed`);
      }
    }
  }

  if (!Array.isArray(c.targets) || c.targets.length === 0) {
    push("targets must be a non-empty array");
    return { ok: errors.length === 0, errors };
  }

  const seen = new Set<string>();
  (c.targets as unknown[]).forEach((t, i) => {
    const where = `targets[${i}]`;
    if (typeof t !== "object" || t === null) {
      push(`${where} must be an object`);
      return;
    }
    const tt = t as Record<string, unknown>;
    if (typeof tt.id !== "string" || tt.id.trim() === "") push(`${where}.id must be a non-empty string`);
    else if (seen.has(tt.id)) push(`${where}.id "${tt.id}" is duplicated — ids key the alert state`);
    else seen.add(tt.id);

    if (typeof tt.label !== "string" || tt.label.trim() === "") push(`${where}.label must be a non-empty string`);
    if (typeof tt.enabled !== "boolean") push(`${where}.enabled must be a boolean`);
    if (tt.severity !== "page" && tt.severity !== "warn") push(`${where}.severity must be "page" or "warn"`);
    if (tt.method !== undefined && tt.method !== "GET" && tt.method !== "HEAD") {
      push(`${where}.method must be "GET" or "HEAD"`);
    }

    if (typeof tt.url !== "string" || !/^https?:\/\//i.test(tt.url)) {
      push(`${where}.url must be an absolute http(s) URL`);
    } else if (/^http:\/\//i.test(tt.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(tt.url)) {
      // Plain http off-box means the probe's own verdict is spoofable by
      // anything on the path. Localhost is exempt so the tool can be exercised
      // against a dev stack (⛔ never against production — see the README).
      push(`${where}.url must be https:// unless it is localhost`);
    }

    if (typeof tt.expectStatus !== "number" || tt.expectStatus < 100 || tt.expectStatus > 599) {
      push(`${where}.expectStatus must be a status code in [100, 599]`);
    }
    if (tt.expectBodyContains !== undefined && typeof tt.expectBodyContains !== "string") {
      push(`${where}.expectBodyContains must be a string`);
    }
    if (tt.expectJson !== undefined) {
      if (!Array.isArray(tt.expectJson)) {
        push(`${where}.expectJson must be an array`);
      } else {
        tt.expectJson.forEach((a, j) => {
          const aw = `${where}.expectJson[${j}]`;
          if (typeof a !== "object" || a === null) {
            push(`${aw} must be an object`);
            return;
          }
          const aa = a as Record<string, unknown>;
          if (typeof aa.path !== "string" || aa.path.trim() === "") push(`${aw}.path must be a non-empty string`);
          if (typeof aa.op !== "string" || !OPS.has(aa.op as AssertOp)) {
            push(`${aw}.op must be one of ${[...OPS].join(", ")}`);
          }
        });
      }
    }
  });

  return { ok: errors.length === 0, errors };
}

/** Parses + validates, throwing a single readable error listing every problem. */
export function parseConfig(json: string): ProbeConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`probe config is not valid JSON: ${(e as Error).message}`);
  }
  const { ok, errors } = validateConfig(raw);
  if (!ok) throw new Error(`probe config is invalid:\n  - ${errors.join("\n  - ")}`);
  return raw as ProbeConfig;
}
