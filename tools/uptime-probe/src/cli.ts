#!/usr/bin/env tsx
// tools/uptime-probe/src/cli.ts — wiring only. Every decision lives in
// probe.ts (verdicts) or probe.config.json (thresholds); this file owns the
// process: argv, files, real sockets, exit code.
//
// Usage:
//   pnpm --filter @ggd/uptime-probe probe -- --state /tmp/ggd-uptime-state.json
//   pnpm --filter @ggd/uptime-probe probe:dry            # never POSTs anything
//
// ⛔ Point it at production ONLY from the scheduled workflow. When exercising
//    it by hand, use --dry-run, or a config whose targets are localhost. The
//    project rule is "測試一律在 localhost 或暫存目錄" and a probe is still a
//    test client.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseConfig, type ProbeConfig } from "./config.js";
import { runProbe, type ProbeDeps, type ProbeState } from "./probe.js";
import {
  buildMessage,
  makeRedactor,
  postSlack,
  resolveWebhook,
  summarize,
  type Poster,
} from "./notify.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The process-wide redactor. Starts as identity and is REPLACED the moment the
 * webhook is resolved, so the crash handler at the bottom of this file cannot
 * print a stack trace containing the secret. A `let` rather than a parameter
 * because the one code path that most needs redaction — an unexpected throw —
 * is the one that never receives arguments.
 */
let redactAll: (s: string) => string = (s) => s;

interface Args {
  configPath: string;
  statePath: string | null;
  dryRun: boolean;
  origin: string;
  runUrl: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    configPath: resolve(get("--config") ?? resolve(HERE, "..", "probe.config.json")),
    statePath: get("--state") ? resolve(get("--state")!) : null,
    dryRun: argv.includes("--dry-run"),
    origin: get("--origin") ?? (process.env.GITHUB_ACTIONS === "true" ? "GitHub Actions" : "手動"),
    runUrl: get("--run-url") ?? githubRunUrl(),
  };
}

function githubRunUrl(): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return undefined;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

/** A missing/corrupt state file is EMPTY state, never a crash: the probe must
 *  still run (and, having no memory, must alert — the loud direction). */
function loadState(path: string | null, warn: (s: string) => void): ProbeState {
  if (!path) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      warn(`[state] ${path} is not an object — starting from empty`);
      return {};
    }
    return parsed as ProbeState;
  } catch {
    warn(`[state] no usable state at ${path} — starting from empty (will alert if anything is down)`);
    return {};
  }
}

function saveState(path: string | null, state: ProbeState, warn: (s: string) => void): void {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch (e) {
    warn(`[state] could not write ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const httpImpl: ProbeDeps["http"] = async ({ url, method, timeoutMs }) => {
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    headers: {
      // So the owner can pick probe traffic out of the nginx access log.
      "user-agent": "ggd-uptime-probe/1 (+GH#124)",
      "cache-control": "no-cache",
      accept: "*/*",
    },
  });
  const body = method === "HEAD" ? "" : await res.text();
  return { status: res.status, body };
};

const posterImpl: Poster = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
};

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  let cfg: ProbeConfig;
  try {
    cfg = parseConfig(readFileSync(args.configPath, "utf8"));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }

  // Resolve the secret BEFORE anything can print, so the redactor is installed
  // on the very first line. `hook` holds the value; only `hook.source` (the env
  // var NAME) is ever shown.
  const hook = resolveWebhook(process.env, cfg.notify);
  const redact = makeRedactor(hook?.url);
  redactAll = redact;
  const say = (line: string) => console.log(redact(line));
  const warn = (line: string) => console.warn(redact(line));

  say(`[probe] config ${args.configPath}`);
  say(`[probe] ${cfg.attempts} attempts × ${cfg.attemptDelayMs}ms, timeout ${cfg.timeoutMs}ms`);
  say(hook ? `[probe] webhook from $${hook.source}` : `[probe] NO WEBHOOK — nothing can be notified`);
  if (args.dryRun) say(`[probe] --dry-run: no Slack POST will be made`);

  const prev = loadState(args.statePath, warn);

  const deps: ProbeDeps = {
    http: httpImpl,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    log: say,
  };

  const run = await runProbe(cfg, prev, deps);

  say("");
  say("─── 探測結果 ───");
  for (const o of run.outcomes) say(summarize(o));

  const payload = buildMessage(run.notifications, run.warnings, cfg.notify, {
    origin: args.origin,
    attempts: cfg.attempts,
    attemptDelayMs: cfg.attemptDelayMs,
    runUrl: args.runUrl,
  });

  if (payload === null) {
    say("");
    say("[probe] nothing to notify");
  } else if (args.dryRun) {
    say("");
    say("[probe] --dry-run, would have sent:");
    say(payload.text);
  } else if (!hook) {
    warn("");
    warn(`[probe] ⚠️ AN ALERT WAS DUE AND COULD NOT BE SENT — set $${cfg.notify.webhookEnv} (or $${cfg.notify.webhookEnvFallback})`);
    warn(payload.text);
  } else {
    const r = await postSlack(hook.url, payload, posterImpl, redact);
    say(`[probe] notify: ${r.detail}`);
    if (!r.ok) {
      // The notification is the product. Failing to send it is a failure of the
      // run even when every endpoint was fine (a recovery notice counts).
      warn("[probe] ⚠️ the alert did NOT reach Slack — the message text follows so it is at least in the log:");
      warn(payload.text);
      saveState(args.statePath, prev, warn); // do not record an alert we never sent
      return 1;
    }
  }

  saveState(args.statePath, run.nextState, warn);

  const paging = run.outcomes.filter((o) => !o.up && o.target.severity === "page");
  if (paging.length > 0) {
    warn(`[probe] ${paging.length} paging target(s) DOWN`);
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    // Through redactAll: a stack trace from inside undici carries the request
    // URL, and the Slack POST is a request whose URL is the credential.
    console.error(redactAll(`[probe] crashed: ${e instanceof Error ? e.stack : String(e)}`));
    process.exit(2);
  },
);
