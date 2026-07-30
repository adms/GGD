// tools/uptime-probe/src/probe.ts — the decision core. No I/O, no secrets, no
// globals: every effect (HTTP, clock, sleep, log) arrives as an injected dep so
// the guard suite can drive a real outage and a real blip through the SAME code
// that runs in CI. (Failure form ⑤ — "被測的不是出貨的那個" — is the reason this
// file has no `fetch` import of its own.)

import type { BodyAssertion, ProbeConfig, ProbeTarget } from "./config.js";

// ---------------------------------------------------------------------------
// Injected effects
// ---------------------------------------------------------------------------

export interface HttpResponse {
  status: number;
  body: string;
}

export interface HttpRequest {
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
}

export interface ProbeDeps {
  /** Resolves with a response, or REJECTS on transport failure/timeout. */
  http: (req: HttpRequest) => Promise<HttpResponse>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface AttemptResult {
  ok: boolean;
  /** One-line human reason. Never contains a secret — see notify.redact. */
  detail: string;
}

export interface TargetOutcome {
  target: ProbeTarget;
  up: boolean;
  attemptsMade: number;
  attemptDetails: string[];
  /** Reason of the LAST attempt — the one worth putting in the alert. */
  detail: string;
}

export type NotificationKind = "down" | "recovered";

export interface Notification {
  kind: NotificationKind;
  targetId: string;
  label: string;
  url: string;
  detail: string;
  /** How long it had been failing, for a recovery message. */
  downForMs?: number;
}

/** Per-target alert memory. Absent entry = "believed healthy". */
export interface TargetState {
  failingSinceMs: number;
  lastAlertAtMs: number;
}

export type ProbeState = Record<string, TargetState>;

export interface ProbeRun {
  outcomes: TargetOutcome[];
  /** What must be sent. Empty = nothing to say. */
  notifications: Notification[];
  /** Failing `warn` targets — reported alongside an alert, never the cause. */
  warnings: TargetOutcome[];
  nextState: ProbeState;
  /** True when every enabled target answered as expected. */
  allHealthy: boolean;
}

// ---------------------------------------------------------------------------
// JSON assertions
// ---------------------------------------------------------------------------

/** Dot-path lookup. Returns `undefined` for any missing hop. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function describe(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Evaluates one assertion. Returns null when it holds, a reason when it does not. */
export function evalAssertion(body: unknown, a: BodyAssertion): string | null {
  const actual = getPath(body, a.path);
  const suffix = a.because ? ` — ${a.because}` : "";
  const fail = (msg: string) => `${a.path} ${msg}${suffix}`;

  switch (a.op) {
    case "exists":
      return actual === undefined ? fail("is missing") : null;
    case "absent":
      return actual === undefined ? null : fail(`should be absent but is ${describe(actual)}`);
    case "eq":
      return actual === a.value ? null : fail(`is ${describe(actual)}, expected ${describe(a.value)}`);
    case "neq":
      return actual !== a.value ? null : fail(`is ${describe(actual)}, expected anything else`);
    case "contains": {
      if (typeof actual === "string" && typeof a.value === "string") {
        return actual.includes(a.value) ? null : fail(`does not contain ${describe(a.value)}`);
      }
      if (Array.isArray(actual)) {
        return actual.includes(a.value) ? null : fail(`does not contain ${describe(a.value)}`);
      }
      return fail(`is ${describe(actual)}, which cannot contain ${describe(a.value)}`);
    }
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      if (typeof actual !== "number" || !Number.isFinite(actual)) {
        return fail(`is ${describe(actual)}, which is not a comparable number`);
      }
      const bound = a.value;
      if (typeof bound !== "number") return fail(`cannot be compared against ${describe(bound)}`);
      const held =
        a.op === "lt" ? actual < bound
        : a.op === "lte" ? actual <= bound
        : a.op === "gt" ? actual > bound
        : actual >= bound;
      return held ? null : fail(`is ${actual}, expected ${a.op} ${bound}`);
    }
  }
}

// ---------------------------------------------------------------------------
// One attempt
// ---------------------------------------------------------------------------

/**
 * A single request + every declared assertion against it.
 *
 * A transport error, a wrong status, a missing substring and a violated JSON
 * assertion are ALL failures — deliberately. "The socket opened" is not health;
 * that conflation is exactly why a `{"status":"ok"}` endpoint can be probed
 * green while the store behind it is unwritable.
 */
export async function attemptOnce(
  target: ProbeTarget,
  timeoutMs: number,
  deps: Pick<ProbeDeps, "http">,
): Promise<AttemptResult> {
  const method = target.method ?? "GET";
  let res: HttpResponse;
  try {
    res = await deps.http({ url: target.url, method, timeoutMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: `unreachable: ${msg}` };
  }

  if (res.status !== target.expectStatus) {
    return { ok: false, detail: `HTTP ${res.status}, expected ${target.expectStatus}` };
  }

  if (target.expectBodyContains !== undefined && !res.body.includes(target.expectBodyContains)) {
    return {
      ok: false,
      detail: `HTTP ${res.status} but the body does not contain ${describe(target.expectBodyContains)}`,
    };
  }

  if (target.expectJson && target.expectJson.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch {
      return { ok: false, detail: `HTTP ${res.status} but the body is not JSON` };
    }
    const broken = target.expectJson
      .map((a) => evalAssertion(parsed, a))
      .filter((r): r is string => r !== null);
    if (broken.length > 0) {
      return { ok: false, detail: `HTTP ${res.status} but ${broken.join("; ")}` };
    }
  }

  return { ok: true, detail: `HTTP ${res.status} OK` };
}

// ---------------------------------------------------------------------------
// N consecutive attempts — the anti-blip rule
// ---------------------------------------------------------------------------

/**
 * Probes one target up to `cfg.attempts` times, sleeping `cfg.attemptDelayMs`
 * between tries, and calls it DOWN only when EVERY attempt failed.
 *
 * ⚠️ THE LOAD-BEARING LINE IS THE `if (r.ok) ... return { up: true }` BELOW.
 * It is what turns "one dropped packet" into "nothing happened". Delete it (or
 * change the loop bound to 1) and `probe.test.ts › a single blip must NOT
 * notify` goes red — that is the mutation this file is written to be caught by.
 *
 * Why the threshold lives INSIDE one run rather than across runs: a GitHub
 * Actions job is stateless and its schedule is best-effort, so "N consecutive
 * scheduled runs" is not a quantity anyone can reason about. `attempts ×
 * attemptDelayMs` is a window measured in seconds that means the same thing
 * every time, and it needs no durable storage to be correct.
 */
export async function probeTarget(
  target: ProbeTarget,
  cfg: Pick<ProbeConfig, "attempts" | "attemptDelayMs" | "timeoutMs">,
  deps: ProbeDeps,
): Promise<TargetOutcome> {
  const details: string[] = [];
  // `last` is the bare reason, without the "#n " bookkeeping prefix: it is what
  // goes into the Slack message, where an attempt number is noise.
  let last = "no attempt was made";
  for (let i = 0; i < cfg.attempts; i++) {
    if (i > 0) await deps.sleep(cfg.attemptDelayMs);
    const r = await attemptOnce(target, cfg.timeoutMs, deps);
    details.push(`#${i + 1} ${r.detail}`);
    last = r.detail;
    deps.log(`  [${target.id}] attempt ${i + 1}/${cfg.attempts}: ${r.ok ? "ok" : "FAIL"} — ${r.detail}`);
    if (r.ok) {
      // ⚠️ MUTATION ANCHOR — any success clears the target. See the doc above.
      return { target, up: true, attemptsMade: i + 1, attemptDetails: details, detail: last };
    }
  }
  return { target, up: false, attemptsMade: cfg.attempts, attemptDetails: details, detail: last };
}

// ---------------------------------------------------------------------------
// State machine: outcome + memory → what to send
// ---------------------------------------------------------------------------

/**
 * Pure. Given this run's outcomes and the previous state, decides what to send
 * and what to remember.
 *
 * - A `warn` target NEVER produces a notification. It is carried in `warnings`
 *   so an alert can say "and by the way, the tick p99 is also over budget",
 *   which is #124's third ask without turning a slow tick into a 3 a.m. ping.
 * - No state file ⇒ empty state ⇒ every down target alerts. That is the SAFE
 *   direction: a monitor that loses its memory should get louder, not quieter.
 */
export function decide(
  outcomes: TargetOutcome[],
  prev: ProbeState,
  cfg: Pick<ProbeConfig, "repeatAlertAfterMinutes" | "notify">,
  nowMs: number,
): { notifications: Notification[]; warnings: TargetOutcome[]; nextState: ProbeState } {
  const notifications: Notification[] = [];
  const warnings: TargetOutcome[] = [];
  const nextState: ProbeState = {};

  for (const o of outcomes) {
    const id = o.target.id;
    const before = prev[id];
    const pages = o.target.severity === "page";

    if (!o.up) {
      if (!pages) warnings.push(o);
      const failingSinceMs = before?.failingSinceMs ?? nowMs;
      const repeatMs = cfg.repeatAlertAfterMinutes * 60_000;
      const dueAgain =
        before === undefined || repeatMs === 0 || nowMs - before.lastAlertAtMs >= repeatMs;

      if (pages && dueAgain) {
        notifications.push({
          kind: "down",
          targetId: id,
          label: o.target.label,
          url: o.target.url,
          detail: o.detail,
        });
        nextState[id] = { failingSinceMs, lastAlertAtMs: nowMs };
      } else {
        nextState[id] = { failingSinceMs, lastAlertAtMs: before?.lastAlertAtMs ?? nowMs };
      }
      continue;
    }

    // Healthy now. If we had been alerting on it, say so and forget it.
    if (before !== undefined && pages && cfg.notify.notifyOnRecovery) {
      notifications.push({
        kind: "recovered",
        targetId: id,
        label: o.target.label,
        url: o.target.url,
        detail: o.detail,
        downForMs: Math.max(0, nowMs - before.failingSinceMs),
      });
    }
    // Entry intentionally NOT copied into nextState — recovery clears memory.
  }

  return { notifications, warnings, nextState };
}

/** Full run: probe every enabled target, then decide. */
export async function runProbe(
  cfg: ProbeConfig,
  prev: ProbeState,
  deps: ProbeDeps,
): Promise<ProbeRun> {
  const enabled = cfg.targets.filter((t) => t.enabled);
  const outcomes: TargetOutcome[] = [];
  for (const t of enabled) {
    deps.log(`[probe] ${t.id} — ${t.label}`);
    outcomes.push(await probeTarget(t, cfg, deps));
  }
  const { notifications, warnings, nextState } = decide(outcomes, prev, cfg, deps.now());
  return {
    outcomes,
    notifications,
    warnings,
    nextState,
    allHealthy: outcomes.every((o) => o.up),
  };
}
