// tools/uptime-probe/src/scheduleDrift.test.ts — the guards that read the REAL
// shipped files, not fixtures.
//
// Two things are protected here:
//
//   1. THE SHIPPED probe.config.json ACTUALLY PARSES. A monitor whose config
//      file is malformed does not fail loudly at 3 a.m. — it fails at the first
//      scheduled run and then never runs again, and the symptom is silence,
//      which is the same symptom as "everything is fine". Failure form ⑤: the
//      thing under test must be the thing that ships.
//   2. THE SCHEDULE DOES NOT DRIFT. .github/workflows/uptime.yml is what GitHub
//      obeys; probe.config.json is what a human reads. On a PRIVATE repo, every
//      job is billed rounded up to a whole minute, so `*/15` → `*/5` is a 3×
//      bill wearing the costume of a 3× refresh rate. The guard forces the two
//      files, and the stated runs-per-day, to agree.
//
// MUTATION RECORD (run by hand, 2026-07-30, each reverted afterwards):
//
//  M11  .github/workflows/uptime.yml: change the first cron to "*/5 10-15 * * *".
//       → "the workflow crons and the config agree verbatim" FAILS, and
//          "estimatedRunsPerDay is what the crons really produce" FAILS
//          (42 → 90). This is the money mutation and BOTH guards catch it.
//  M12  probe.config.json: set schedule.estimatedRunsPerDay to 999.
//       → validateConfig rejects it (>288) AND the recompute guard fails.
//  M13  probe.config.json: set attempts to 1 — the ticket's own mutation, at
//       the data layer rather than the code layer.
//       → "the shipped config parses" FAILS with an explicit message.
//  M14  probe.config.json: paste a webhook URL into notify.webhookEnv.
//       → "a webhook URL can never be committed into the config" FAILS.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseConfig, validateConfig } from "./config.js";
import { countRunsPerDay, expandField, minMonthlyMinutes, parseWorkflowCrons, totalRunsPerDay } from "./schedule.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(HERE, "..", "probe.config.json");
const WORKFLOW_PATH = resolve(HERE, "..", "..", "..", ".github", "workflows", "uptime.yml");

const configJson = readFileSync(CONFIG_PATH, "utf8");
const workflowYaml = readFileSync(WORKFLOW_PATH, "utf8");

describe("the SHIPPED probe.config.json", () => {
  it("parses and validates", () => {
    // If this throws, the scheduled probe would die on its very first run and
    // the only symptom would be silence.
    expect(() => parseConfig(configJson)).not.toThrow();
  });

  it("has at least one enabled paging target — otherwise nothing can ever alert", () => {
    const cfg = parseConfig(configJson);
    const paging = cfg.targets.filter((t) => t.enabled && t.severity === "page");
    expect(paging.length).toBeGreaterThan(0);
  });

  it("points every enabled target at https, at the real host", () => {
    const cfg = parseConfig(configJson);
    for (const t of cfg.targets.filter((x) => x.enabled)) {
      expect(t.url.startsWith("https://ggd.adms.ai/"), `${t.id} → ${t.url}`).toBe(true);
    }
  });

  it("never carries the webhook itself — only the env var NAMES", () => {
    // The whole file is committed and readable by anyone with repo access.
    expect(configJson).not.toMatch(/hooks\.slack\.com/);
    expect(configJson).not.toMatch(/xox[baprs]-/); // slack tokens of any kind
  });

  it("keeps a probe for something MORE than a constant 200", () => {
    // The platform's own /healthz answers a hard-coded {"status":"ok"}
    // (server.go:511). Probing only that is failure form ③ in infrastructure
    // clothing: the check cannot fail while the process is alive, however
    // broken the store behind it is. At least one enabled target must assert
    // on a body the SERVICE had to compute.
    const cfg = parseConfig(configJson);
    const substantive = cfg.targets.filter(
      (t) => t.enabled && ((t.expectJson?.length ?? 0) > 0 || t.expectBodyContains !== undefined),
    );
    expect(substantive.map((t) => t.id)).toContain("platform-store");
    expect(substantive.map((t) => t.id)).toContain("content-manifest");
  });
});

describe("schedule drift — workflow vs config vs arithmetic", () => {
  it("the workflow crons and the config agree verbatim", () => {
    const cfg = parseConfig(configJson);
    expect(parseWorkflowCrons(workflowYaml)).toEqual(cfg.schedule.cronUtc);
  });

  it("estimatedRunsPerDay is what the crons really produce", () => {
    const cfg = parseConfig(configJson);
    expect(totalRunsPerDay(cfg.schedule.cronUtc)).toBe(cfg.schedule.estimatedRunsPerDay);
  });

  it("the schedule stays inside the private-repo Free tier with room for ci.yml", () => {
    // 2,000 min/month on the Free plan; ci.yml runs on every push and PR and
    // needs a real share of it. 1,500 is the line where the monitor stops being
    // the cheap option.
    const cfg = parseConfig(configJson);
    const floor = minMonthlyMinutes(cfg.schedule.cronUtc);
    expect(floor).toBe(1260);
    expect(floor).toBeLessThan(1500);
  });

  it("covers the family's evening play window at 15-minute resolution", () => {
    // The whole point of two crons instead of one: detection latency where it
    // is worth paying for. 18:00–23:59 Taipei = 10:00–15:59 UTC.
    const cfg = parseConfig(configJson);
    const dense = cfg.schedule.cronUtc.filter((c) => countRunsPerDay(c) >= 24);
    expect(dense).toHaveLength(1);
    expect(expandField(dense[0]!.split(/\s+/)[1]!, 0, 23)).toEqual([10, 11, 12, 13, 14, 15]);
    expect(expandField(dense[0]!.split(/\s+/)[0]!, 0, 59)).toEqual([0, 15, 30, 45]);
  });
});

describe("cron arithmetic", () => {
  it("counts the shapes a monitoring schedule uses", () => {
    expect(countRunsPerDay("*/15 10-15 * * *")).toBe(24);
    expect(countRunsPerDay("0 16-23,0-9 * * *")).toBe(18);
    expect(countRunsPerDay("*/5 * * * *")).toBe(288);
    expect(countRunsPerDay("0 * * * *")).toBe(24);
    expect(countRunsPerDay("30 3 * * *")).toBe(1);
  });

  it("refuses what it cannot count instead of guessing", () => {
    // A wrong number here is a wrong budget, which is worse than no number.
    expect(() => countRunsPerDay("0 3 * * 1")).toThrow(/day-of-week/);
    expect(() => countRunsPerDay("0 3 1 * *")).toThrow(/day-of-month/);
    expect(() => countRunsPerDay("*/5 * * *")).toThrow(/5 fields/);
    expect(() => countRunsPerDay("0 99 * * *")).toThrow(/out of range/);
  });

  it("parses the cron lines out of a workflow, quoted or not", () => {
    const yaml = ['on:', '  schedule:', '    - cron: "*/15 * * * *"', "    - cron: '0 1 * * *'", "    - cron: 5 2 * * *"].join("\n");
    expect(parseWorkflowCrons(yaml)).toEqual(["*/15 * * * *", "0 1 * * *", "5 2 * * *"]);
  });
});

// ---------------------------------------------------------------------------
// Validator — the bounds are the guard against a config-file mistake
// ---------------------------------------------------------------------------

describe("validateConfig", () => {
  const base = () => JSON.parse(configJson) as Record<string, unknown>;

  it("REJECTS attempts: 1 — the anti-blip threshold cannot be turned off by data", () => {
    // The code guard lives in probe.test.ts; this is the same mutation applied
    // through the config file, where no unit test would otherwise look.
    const c = base();
    c.attempts = 1;
    const r = validateConfig(c);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/attempts must be >= 2/);
  });

  it("enforces an UPPER bound too, not only a lower one", () => {
    // #277's lesson: 50 typed as 500 sails through a min-only validator.
    const c = base();
    c.timeoutMs = 600000;
    expect(validateConfig(c).errors.join()).toMatch(/timeoutMs must be <= 60000/);
    const d = base();
    d.attempts = 500;
    expect(validateConfig(d).errors.join()).toMatch(/attempts must be <= 10/);
  });

  it("a webhook URL can never be committed into the config", () => {
    const c = base();
    (c.notify as Record<string, unknown>).webhookEnv = "https://hooks.slack.com/services/T/B/xyz";
    expect(validateConfig(c).errors.join()).toMatch(/must be an ENV VAR NAME, not a URL/);
  });

  it("rejects plain http against a remote host", () => {
    const c = base();
    (c.targets as Array<Record<string, unknown>>)[0]!.url = "http://ggd.adms.ai/healthz";
    expect(validateConfig(c).errors.join()).toMatch(/must be https/);
  });

  it("rejects duplicate target ids — they key the alert state", () => {
    const c = base();
    const ts = c.targets as Array<Record<string, unknown>>;
    ts[1]!.id = ts[0]!.id;
    expect(validateConfig(c).errors.join()).toMatch(/is duplicated/);
  });

  it("rejects an unknown assertion operator instead of silently passing it", () => {
    const c = base();
    const ts = c.targets as Array<Record<string, unknown>>;
    ts[2]!.expectJson = [{ path: "status", op: "approximately", value: "ok" }];
    expect(validateConfig(c).errors.join()).toMatch(/op must be one of/);
  });

  it("reports every problem at once, not just the first", () => {
    const c = base();
    c.attempts = 1;
    c.timeoutMs = 0;
    expect(validateConfig(c).errors.length).toBeGreaterThanOrEqual(2);
  });
});
