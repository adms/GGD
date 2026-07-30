// tools/uptime-probe/src/notify.ts — turning a verdict into a Slack message,
// and the secret hygiene that has to come with it.
//
// ⚠️ GITHUB ACTIONS LOGS ARE RETAINED AND READABLE.
// A Slack incoming webhook is a BEARER URL: whoever holds it can post into the
// owner's channel forever, and it cannot be scoped or expired without rotating
// it. So this module is written on one rule:
//
//     the webhook URL never reaches a log line, an error message, or a summary.
//
// That is not achieved by "remembering not to print it" — Node puts the request
// URL inside `TypeError: fetch failed`'s cause, `undici` puts the host in its
// error text, and a stack trace can carry either. So EVERY string this tool
// emits goes through `redact()` first (see cli.ts), and `notify.test.ts` proves
// it by driving a failing POST with a realistic webhook and asserting the
// secret's own segments appear nowhere in the captured output.
//
// GitHub also masks registered secrets in its own log view, but that masking
// (a) only covers the exact literal and (b) is GitHub's control, not ours. It
// is a second layer, never the first.

import type { NotifyConfig, Severity } from "./config.js";
import type { Notification, TargetOutcome } from "./probe.js";

export interface WebhookResolution {
  url: string;
  /** The env var NAME it came from — safe to log, unlike the value. */
  source: string;
}

/**
 * Finds the webhook in the environment: the probe's own variable first, then
 * the #209 registration channel as a fallback so the owner can reuse the hook
 * he already has instead of minting a second one.
 *
 * Returns null when neither is set — which is NOT an error. A probe with no
 * webhook still runs, still prints its verdict and still exits non-zero on an
 * outage; it just cannot page anyone. The CLI says so loudly rather than
 * pretending it notified.
 */
export function resolveWebhook(
  env: Record<string, string | undefined>,
  cfg: Pick<NotifyConfig, "webhookEnv" | "webhookEnvFallback">,
): WebhookResolution | null {
  for (const name of [cfg.webhookEnv, cfg.webhookEnvFallback]) {
    const v = (env[name] ?? "").trim();
    if (v !== "") return { url: v, source: name };
  }
  return null;
}

/**
 * Builds a redactor for a given secret.
 *
 * Redacts three things, because a leak has three shapes:
 *   1. the whole URL verbatim (the obvious one);
 *   2. each of its path segments (undici error text sometimes carries only the
 *      tail, and a single segment is still enough to reconstruct nothing —
 *      but a token segment on its own IS the credential);
 *   3. any `hooks.slack.com/services/...` URL at all, so a DIFFERENT webhook
 *      that wandered into an error message is caught too.
 *
 * The empty secret is handled: `"".split` would otherwise produce a replace of
 * every empty position and destroy the message.
 */
export function makeRedactor(secret: string | null | undefined): (s: string) => string {
  const parts: string[] = [];
  const clean = (secret ?? "").trim();
  if (clean !== "") {
    parts.push(clean);
    let path = clean;
    const schemeAt = clean.indexOf("://");
    if (schemeAt >= 0) {
      const rest = clean.slice(schemeAt + 3);
      const slashAt = rest.indexOf("/");
      path = slashAt >= 0 ? rest.slice(slashAt + 1) : "";
    }
    for (const seg of path.split("/")) {
      // 6 is short enough to catch a Slack team id (T01ABCDEF) and long enough
      // not to redact the word "services" out of ordinary prose.
      if (seg.length >= 6) parts.push(seg);
    }
  }
  // Longest first, so replacing a segment never eats the full-URL match.
  parts.sort((a, b) => b.length - a.length);

  return (s: string): string => {
    let out = s;
    for (const p of parts) out = out.split(p).join("***");
    out = out.replace(/https?:\/\/hooks\.slack\.com\/\S*/gi, "https://hooks.slack.com/***");
    return out;
  };
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

function humanDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分鐘`;
  const h = Math.floor(m / 60);
  return `${h} 小時 ${m % 60} 分`;
}

export interface MessageMeta {
  /** Where the probe ran from — "GitHub Actions", "laptop", … */
  origin: string;
  /** attempts × delay, spelled out so the reader knows what "down" cost. */
  attempts: number;
  attemptDelayMs: number;
  /** Optional run URL so the owner can open the log. Never a secret. */
  runUrl?: string;
}

export interface SlackPayload {
  username: string;
  text: string;
}

/**
 * One message per run, not one per target. Four dead endpoints during a reboot
 * should be one notification the owner reads, not four he swipes away.
 *
 * `warnings` (severity: "warn") are appended but never cause a message — see
 * `decide()`. That is how #124's third ask (`sim.p99Ms` / `shedEvents`) becomes
 * visible without a slow tick becoming a 3 a.m. phone call.
 */
export function buildMessage(
  notifications: Notification[],
  warnings: TargetOutcome[],
  cfg: NotifyConfig,
  meta: MessageMeta,
): SlackPayload | null {
  if (notifications.length === 0) return null;

  const down = notifications.filter((n) => n.kind === "down");
  const up = notifications.filter((n) => n.kind === "recovered");

  const lines: string[] = [];
  const mention = cfg.mention.trim();
  const head =
    down.length > 0
      ? `🔴 GGD 服務探測失敗（${down.length} 項）`
      : `✅ GGD 服務已恢復（${up.length} 項）`;
  lines.push(mention === "" ? head : `${mention} ${head}`);

  for (const n of down) {
    lines.push(`• *${n.label}* — ${n.detail}`);
    lines.push(`    ${n.url}`);
  }
  for (const n of up) {
    const dur = n.downForMs === undefined ? "" : `（中斷 ${humanDuration(n.downForMs)}）`;
    lines.push(`• *${n.label}* 恢復${dur} — ${n.detail}`);
  }

  if (warnings.length > 0) {
    lines.push(`⚠️ 同時觀察到（不觸發告警）：`);
    for (const w of warnings) lines.push(`• ${w.target.label} — ${w.detail}`);
  }

  const window = `${meta.attempts} 次 × ${Math.round(meta.attemptDelayMs / 1000)} 秒`;
  lines.push(`_探測來源 ${meta.origin}；連續 ${window} 全失敗才算掛_`);
  if (meta.runUrl) lines.push(`_${meta.runUrl}_`);

  return { username: cfg.username, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export interface PostResult {
  ok: boolean;
  status: number;
  /** ALREADY REDACTED. Safe to print. */
  detail: string;
}

export type Poster = (url: string, body: string) => Promise<{ status: number; body: string }>;

/**
 * POSTs the payload. The returned `detail` has already been through `redact`,
 * so a caller cannot leak by printing it — the safe thing is the default,
 * rather than a rule the caller has to remember.
 */
export async function postSlack(
  url: string,
  payload: SlackPayload,
  post: Poster,
  redact: (s: string) => string,
): Promise<PostResult> {
  try {
    const res = await post(url, JSON.stringify(payload));
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      detail: redact(ok ? `slack ${res.status}` : `slack ${res.status}: ${res.body.slice(0, 200)}`),
    };
  } catch (e) {
    const raw = e instanceof Error ? `${e.message}${e.cause ? ` (${String(e.cause)})` : ""}` : String(e);
    return { ok: false, status: 0, detail: redact(`slack post failed: ${raw}`) };
  }
}

/** Console summary line for one outcome. */
export function summarize(o: { target: { id: string; label: string; severity: Severity }; up: boolean; detail: string }): string {
  const mark = o.up ? "OK  " : o.target.severity === "page" ? "DOWN" : "WARN";
  return `${mark}  ${o.target.id.padEnd(18)} ${o.target.label} — ${o.detail}`;
}
