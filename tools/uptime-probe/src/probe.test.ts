// tools/uptime-probe/src/probe.test.ts — the guards for GH#124.
//
// The two that this whole tool exists for:
//
//   「餵它一個假的『服務掛了』回應，斷言它會通知」   → "a real outage notifies"
//   「餵一次抖動，斷言它不會通知」                   → "a single blip must NOT notify"
//
// MUTATION RECORD (run by hand, 2026-07-30, each reverted afterwards):
//
//   M1  probe.ts, probeTarget: delete the `if (r.ok) return { up: true … }`
//       early-return so every target burns all N attempts and reports the last
//       one.  → "a single blip must NOT notify" FAILS (blip 被當成掛掉),
//          "a real outage notifies" still passes.
//   M2  probe.ts, probeTarget: change the loop bound to `i < 1` — the literal
//       「把『連續 N 次』改成『1 次』」 mutation the ticket asks for.
//       → "a single blip must NOT notify" FAILS,
//          "the anti-blip window is attempts × delay" FAILS.
//   M3  probe.ts, decide: drop the `if (pages && dueAgain)` push.
//       → "a real outage notifies" FAILS.
//   M4  probe.ts, attemptOnce: return `{ ok: true }` whenever the status
//       matches, skipping the expectJson block — the "只看 200 等於沒探測"
//       mutation.  → "a 200 that lies is still an outage" FAILS.
//   M5  probe.ts, decide: treat `warn` like `page`.
//       → "a warn target never alerts on its own" FAILS.
//
// Nothing here scans source strings; every assertion drives the shipped
// functions with injected effects (failure form ⑥).

import { describe, it, expect } from "vitest";
import {
  attemptOnce,
  decide,
  evalAssertion,
  getPath,
  probeTarget,
  runProbe,
  type HttpRequest,
  type HttpResponse,
  type ProbeDeps,
  type ProbeState,
} from "./probe.js";
import type { ProbeConfig, ProbeTarget } from "./config.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const TARGET: ProbeTarget = {
  id: "platform",
  label: "平台 API",
  url: "https://example.invalid/api/v1/healthz",
  enabled: true,
  severity: "page",
  expectStatus: 200,
};

const CFG: ProbeConfig = {
  version: 1,
  schedule: { cronUtc: ["*/15 10-15 * * *"], estimatedRunsPerDay: 24 },
  attempts: 3,
  attemptDelayMs: 20_000,
  timeoutMs: 10_000,
  repeatAlertAfterMinutes: 60,
  notify: {
    webhookEnv: "GGD_UPTIME_WEBHOOK_URL",
    webhookEnvFallback: "GGD_SLACK_WEBHOOK_URL",
    mention: "",
    username: "GGD 探測",
    notifyOnRecovery: true,
  },
  targets: [TARGET],
};

interface Harness {
  deps: ProbeDeps;
  calls: HttpRequest[];
  slept: number[];
  lines: string[];
}

/** `script` is consumed one entry per HTTP call; the last entry repeats. */
function harness(script: Array<HttpResponse | Error>, startMs = 1_000_000): Harness {
  const calls: HttpRequest[] = [];
  const slept: number[] = [];
  const lines: string[] = [];
  let clock = startMs;
  let i = 0;
  const deps: ProbeDeps = {
    http: async (req) => {
      calls.push(req);
      const step = script[Math.min(i, script.length - 1)]!;
      i++;
      if (step instanceof Error) throw step;
      return step;
    },
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms; // a fake clock that advances exactly as the real one would
    },
    now: () => clock,
    log: (l) => lines.push(l),
  };
  return { deps, calls, slept, lines };
}

const OK: HttpResponse = { status: 200, body: '{"status":"ok"}' };
const DEAD = new Error("connect ECONNREFUSED 34.81.104.163:443");
const BAD_GATEWAY: HttpResponse = { status: 502, body: "<html>502 Bad Gateway</html>" };

// ---------------------------------------------------------------------------
// THE TWO THE TICKET ASKS FOR
// ---------------------------------------------------------------------------

describe("GH#124 · 掛了要通知 / 抖動不要吵", () => {
  it("a real outage notifies", async () => {
    const h = harness([DEAD]);
    const run = await runProbe(CFG, {}, h.deps);

    expect(run.allHealthy).toBe(false);
    expect(h.calls).toHaveLength(CFG.attempts); // it really did try N times
    expect(run.outcomes[0]!.up).toBe(false);

    expect(run.notifications).toHaveLength(1);
    expect(run.notifications[0]).toMatchObject({
      kind: "down",
      targetId: "platform",
      label: "平台 API",
    });
    expect(run.notifications[0]!.detail).toMatch(/unreachable/);
  });

  it("a single blip must NOT notify", async () => {
    // Attempt 1 fails, attempts 2+ succeed — one dropped packet, nothing more.
    const h = harness([DEAD, OK]);
    const run = await runProbe(CFG, {}, h.deps);

    expect(run.outcomes[0]!.up).toBe(true);
    expect(run.outcomes[0]!.attemptsMade).toBe(2); // stopped as soon as it recovered
    expect(run.notifications).toEqual([]);
    expect(run.allHealthy).toBe(true);
    // And the state stays empty, so no phantom "recovered" fires next run.
    expect(run.nextState).toEqual({});
  });

  it("the anti-blip window is attempts × delay, not a single request", async () => {
    const h = harness([DEAD]);
    await probeTarget(TARGET, CFG, h.deps);
    expect(h.calls).toHaveLength(3);
    expect(h.slept).toEqual([20_000, 20_000]); // N attempts ⇒ N-1 gaps
  });

  it("a healthy target costs exactly one request and zero sleeps", async () => {
    // The retry budget is for outages, not a tax on the happy path: probing
    // seven targets every ten minutes must not become 21 requests.
    const h = harness([OK]);
    const run = await runProbe(CFG, {}, h.deps);
    expect(run.notifications).toEqual([]);
    expect(h.calls).toHaveLength(1);
    expect(h.slept).toEqual([]);
  });

  it("a 502 storm is an outage as much as a refused connection", async () => {
    // The realistic shape of "the container died but nginx is still up".
    const h = harness([BAD_GATEWAY]);
    const run = await runProbe(CFG, {}, h.deps);
    expect(run.notifications).toHaveLength(1);
    expect(run.notifications[0]!.detail).toBe("HTTP 502, expected 200");
  });
});

// ---------------------------------------------------------------------------
// "200 是不夠的" — the ③ failure form, infrastructure edition
// ---------------------------------------------------------------------------

describe("a 200 that lies is still an outage", () => {
  const manifest: ProbeTarget = {
    id: "content-manifest",
    label: "內容清單",
    url: "https://example.invalid/content/manifest.json",
    enabled: true,
    severity: "page",
    expectStatus: 200,
    expectJson: [{ path: "contentVersion", op: "exists" }],
  };

  it("catches the SPA fallback serving HTML with HTTP 200", async () => {
    // docs/_false-completions.md S17, exactly: the file is gone, vite answers
    // index.html, the status code is a perfect 200.
    const h = harness([{ status: 200, body: "<!doctype html><html><body>…" }]);
    const out = await probeTarget(manifest, CFG, h.deps);
    expect(out.up).toBe(false);
    expect(out.detail).toMatch(/not JSON/);
  });

  it("catches a well-formed JSON body that is missing the field", async () => {
    const h = harness([{ status: 200, body: '{"collections":{}}' }]);
    const out = await probeTarget(manifest, CFG, h.deps);
    expect(out.up).toBe(false);
    expect(out.detail).toMatch(/contentVersion is missing/);
  });

  it("passes when the body is what it should be", async () => {
    const h = harness([{ status: 200, body: '{"contentVersion":"cv_6cd0c7613470"}' }]);
    const out = await probeTarget(manifest, CFG, h.deps);
    expect(out.up).toBe(true);
  });

  it("an empty champion whitelist is an outage even though nothing 500s", async () => {
    // Every endpoint answers 200 and no human can pick a champion. This is the
    // one a status-code monitor can never see.
    const wl: ProbeTarget = {
      id: "platform-store",
      label: "白名單",
      url: "https://example.invalid/api/v1/curation/whitelist",
      enabled: true,
      severity: "page",
      expectStatus: 200,
      expectJson: [
        { path: "version", op: "gte", value: 1 },
        { path: "champions.0", op: "exists", because: "白名單空的話沒有人選得到英雄" },
      ],
    };
    const empty = harness([{ status: 200, body: '{"version":1,"champions":[]}' }]);
    expect((await probeTarget(wl, CFG, empty.deps)).up).toBe(false);

    const full = harness([{ status: 200, body: '{"version":1,"champions":["godie-hblm"]}' }]);
    expect((await probeTarget(wl, CFG, full.deps)).up).toBe(true);
  });

  it("a wrong status is a failure even when the body looks fine", async () => {
    const h = harness([BAD_GATEWAY]);
    const r = await attemptOnce(TARGET, 1000, h.deps);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("HTTP 502, expected 200");
  });

  it("the admin guard treats an UNEXPECTED 200 as the failure", async () => {
    // Lifted from tools/lan-probe.sh:105 — 401 is the healthy answer here.
    const guard: ProbeTarget = { ...TARGET, id: "admin-guard", expectStatus: 401 };
    const open = harness([{ status: 200, body: "[]" }]);
    expect((await attemptOnce(guard, 1000, open.deps)).ok).toBe(false);
    const shut = harness([{ status: 401, body: "{}" }]);
    expect((await attemptOnce(guard, 1000, shut.deps)).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Assertion engine
// ---------------------------------------------------------------------------

describe("evalAssertion / getPath", () => {
  const body = { ok: true, sim: { p99Ms: 41, shedEvents: 0 }, platform: { degraded: false }, ids: ["a", "b"] };

  it("reads nested paths and array indices", () => {
    expect(getPath(body, "sim.p99Ms")).toBe(41);
    expect(getPath(body, "ids.1")).toBe("b");
    expect(getPath(body, "sim.nope")).toBeUndefined();
    expect(getPath(body, "nope.deeper")).toBeUndefined();
  });

  it("holds and breaks in the right directions", () => {
    expect(evalAssertion(body, { path: "sim.p99Ms", op: "lte", value: 45 })).toBeNull();
    expect(evalAssertion(body, { path: "sim.p99Ms", op: "lte", value: 33 })).toMatch(/is 41, expected lte 33/);
    expect(evalAssertion(body, { path: "platform.degraded", op: "eq", value: false })).toBeNull();
    expect(evalAssertion(body, { path: "platform.degraded", op: "eq", value: true })).toMatch(/expected true/);
    expect(evalAssertion(body, { path: "ids", op: "contains", value: "b" })).toBeNull();
    expect(evalAssertion(body, { path: "ids", op: "contains", value: "z" })).toMatch(/does not contain/);
    expect(evalAssertion(body, { path: "sim.shedEvents", op: "absent" })).toMatch(/should be absent/);
  });

  it("a missing number does not silently satisfy a numeric bound", async () => {
    // The trap: `undefined <= 45` is false in JS but `!(undefined > 45)` is
    // true, so a naive implementation reports the endpoint healthy precisely
    // when the field it was watching disappeared.
    expect(evalAssertion(body, { path: "sim.gone", op: "lte", value: 45 })).toMatch(/not a comparable number/);
    expect(evalAssertion(body, { path: "sim.gone", op: "gte", value: 45 })).toMatch(/not a comparable number/);
  });

  it("carries the operator's `because` into the reason", () => {
    const r = evalAssertion(body, { path: "sim.p99Ms", op: "lte", value: 10, because: "30Hz 的預算是 33ms" });
    expect(r).toMatch(/30Hz 的預算是 33ms/);
  });
});

// ---------------------------------------------------------------------------
// Alert state machine
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000;
const down = (t: ProbeTarget = TARGET) => ({
  target: t,
  up: false,
  attemptsMade: 3,
  attemptDetails: [],
  detail: "unreachable: ECONNREFUSED",
});
const upOutcome = (t: ProbeTarget = TARGET) => ({
  target: t,
  up: true,
  attemptsMade: 1,
  attemptDetails: [],
  detail: "HTTP 200 OK",
});

describe("decide — repeat suppression, recovery, severity", () => {
  it("alerts the first time, then goes quiet until repeatAlertAfterMinutes", () => {
    const first = decide([down()], {}, CFG, T0);
    expect(first.notifications).toHaveLength(1);
    expect(first.nextState.platform).toEqual({ failingSinceMs: T0, lastAlertAtMs: T0 });

    // 10 minutes later, still down, repeat window is 60 → silence.
    const soon = decide([down()], first.nextState, CFG, T0 + 10 * 60_000);
    expect(soon.notifications).toEqual([]);
    // …but it remembers WHEN it started failing, not when it last looked.
    expect(soon.nextState.platform!.failingSinceMs).toBe(T0);

    // 61 minutes later, the repeat is due.
    const later = decide([down()], first.nextState, CFG, T0 + 61 * 60_000);
    expect(later.notifications).toHaveLength(1);
    expect(later.nextState.platform!.failingSinceMs).toBe(T0);
  });

  it("repeatAlertAfterMinutes 0 means every run", () => {
    const cfg = { ...CFG, repeatAlertAfterMinutes: 0 };
    const first = decide([down()], {}, cfg, T0);
    const again = decide([down()], first.nextState, cfg, T0 + 1000);
    expect(again.notifications).toHaveLength(1);
  });

  it("announces recovery once and then forgets the target", () => {
    const wasDown: ProbeState = { platform: { failingSinceMs: T0, lastAlertAtMs: T0 } };
    const back = decide([upOutcome()], wasDown, CFG, T0 + 25 * 60_000);
    expect(back.notifications).toHaveLength(1);
    expect(back.notifications[0]!.kind).toBe("recovered");
    expect(back.notifications[0]!.downForMs).toBe(25 * 60_000);
    expect(back.nextState).toEqual({}); // memory cleared

    // Second healthy run says nothing — no recovery spam.
    const quiet = decide([upOutcome()], back.nextState, CFG, T0 + 30 * 60_000);
    expect(quiet.notifications).toEqual([]);
  });

  it("never invents a recovery for a target that was never down", () => {
    expect(decide([upOutcome()], {}, CFG, T0).notifications).toEqual([]);
  });

  it("honours notifyOnRecovery: false", () => {
    const cfg = { ...CFG, notify: { ...CFG.notify, notifyOnRecovery: false } };
    const wasDown: ProbeState = { platform: { failingSinceMs: T0, lastAlertAtMs: T0 } };
    expect(decide([upOutcome()], wasDown, cfg, T0 + 1000).notifications).toEqual([]);
  });

  it("a warn target never alerts on its own, but rides along with one that does", () => {
    const slow: ProbeTarget = { ...TARGET, id: "game-sim", label: "tick 健康度", severity: "warn" };

    const alone = decide([down(slow)], {}, CFG, T0);
    expect(alone.notifications).toEqual([]);
    expect(alone.warnings.map((w) => w.target.id)).toEqual(["game-sim"]);

    const together = decide([down(), down(slow)], {}, CFG, T0);
    expect(together.notifications.map((n) => n.targetId)).toEqual(["platform"]);
    expect(together.warnings.map((w) => w.target.id)).toEqual(["game-sim"]);
  });

  it("no state file ⇒ it alerts (a monitor that loses its memory gets LOUDER)", () => {
    // Same outage, same instant, but the state was wiped: it must speak up
    // rather than assume it already had.
    const withMemory = decide([down()], { platform: { failingSinceMs: T0, lastAlertAtMs: T0 } }, CFG, T0 + 60_000);
    expect(withMemory.notifications).toEqual([]);
    const amnesiac = decide([down()], {}, CFG, T0 + 60_000);
    expect(amnesiac.notifications).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Whole-run wiring
// ---------------------------------------------------------------------------

describe("runProbe", () => {
  it("skips disabled targets entirely — no request, no verdict", async () => {
    const cfg: ProbeConfig = {
      ...CFG,
      targets: [TARGET, { ...TARGET, id: "game-sim", enabled: false }],
    };
    const h = harness([OK]);
    const run = await runProbe(cfg, {}, h.deps);
    expect(run.outcomes.map((o) => o.target.id)).toEqual(["platform"]);
    expect(h.calls.every((c) => c.url === TARGET.url)).toBe(true);
  });

  it("passes the configured timeout down to every request", async () => {
    const h = harness([OK]);
    await runProbe({ ...CFG, timeoutMs: 7777 }, {}, h.deps);
    expect(h.calls[0]!.timeoutMs).toBe(7777);
  });

  it("one dead target does not stop the others from being checked", async () => {
    const cfg: ProbeConfig = { ...CFG, attempts: 2, targets: [TARGET, { ...TARGET, id: "client", url: "https://example.invalid/" }] };
    let n = 0;
    const deps: ProbeDeps = {
      http: async ({ url }) => {
        n++;
        if (url === TARGET.url) throw DEAD;
        return OK;
      },
      sleep: async () => {},
      now: () => T0,
      log: () => {},
    };
    const run = await runProbe(cfg, {}, deps);
    expect(run.outcomes.map((o) => [o.target.id, o.up])).toEqual([
      ["platform", false],
      ["client", true],
    ]);
    expect(n).toBe(3); // 2 failed attempts on platform + 1 success on client
  });
});
