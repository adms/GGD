// tools/uptime-probe/src/notify.test.ts — the message, and the secret.
//
// MUTATION RECORD (run by hand, 2026-07-30, each reverted afterwards):
//
//   M6  notify.ts, makeRedactor: `return (s) => s` (identity).
//       → "the webhook never appears in anything the probe emits" FAILS on
//          both the full-URL case and the failed-POST case.
//   M7  notify.ts, makeRedactor: drop the per-segment loop, keep only the
//       whole-URL replace — the plausible-looking half-fix.
//       → "a partial leak (just the token segment) is redacted too" FAILS.
//   M8  notify.ts, postSlack: return `detail: raw` instead of `redact(raw)`.
//       → "a failed POST cannot leak the webhook through its error" FAILS.
//   M9  notify.ts, buildMessage: `if (notifications.length === 0) return {…}`
//       (build a message anyway).
//       → "a clean run produces NO message" FAILS.
//  M10  notify.ts, buildMessage: append `warnings` into `down`.
//       → "a warn-only run stays silent" FAILS.

import { describe, it, expect } from "vitest";
import {
  buildMessage,
  makeRedactor,
  postSlack,
  resolveWebhook,
  summarize,
  type MessageMeta,
} from "./notify.js";
import type { NotifyConfig } from "./config.js";
import type { Notification, TargetOutcome } from "./probe.js";

// A realistic-shaped webhook. NOT a real one — the shape is what matters, and
// the point of the test is that even a fake must not survive into the output.
const HOOK = "https://hooks.slack.com/services/T0AB1CD2EF/B0GH3IJ4KL/mnOPqrST7uvWXyz8AbCdEfGh";
const TOKEN = "mnOPqrST7uvWXyz8AbCdEfGh";

const NOTIFY: NotifyConfig = {
  webhookEnv: "GGD_UPTIME_WEBHOOK_URL",
  webhookEnvFallback: "GGD_SLACK_WEBHOOK_URL",
  mention: "",
  username: "GGD 探測",
  notifyOnRecovery: true,
};

const META: MessageMeta = { origin: "GitHub Actions", attempts: 3, attemptDelayMs: 20_000 };

const downNote: Notification = {
  kind: "down",
  targetId: "platform",
  label: "平台 API",
  url: "https://ggd.adms.ai/api/v1/healthz",
  detail: "unreachable: connect ECONNREFUSED",
};

// ---------------------------------------------------------------------------
// 「探測腳本自己不能把 secret 印出來」
// ---------------------------------------------------------------------------

describe("secret hygiene — GitHub Actions logs are retained", () => {
  it("the webhook never appears in anything the probe emits", () => {
    const redact = makeRedactor(HOOK);
    const emitted = [
      redact(`[probe] posting to ${HOOK}`),
      redact(`Error: request to ${HOOK} failed`),
      redact(`{"url":"${HOOK}"}`),
    ].join("\n");
    expect(emitted).not.toContain(HOOK);
    expect(emitted).not.toContain(TOKEN);
    expect(emitted).toContain("***");
  });

  it("a partial leak (just the token segment) is redacted too", () => {
    // undici error text sometimes carries only a fragment. A redactor that
    // only matched the whole URL would pass this string through untouched —
    // and the token segment alone IS the credential.
    const redact = makeRedactor(HOOK);
    const out = redact(`failed at .../services/T0AB1CD2EF/B0GH3IJ4KL/${TOKEN}`);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain("T0AB1CD2EF");
  });

  it("catches a DIFFERENT slack webhook that wandered into a message", () => {
    const redact = makeRedactor(HOOK);
    const other = "https://hooks.slack.com/services/TZZ/BZZ/someOtherSecretValue";
    expect(redact(`stack: ${other}`)).not.toContain("someOtherSecretValue");
  });

  it("a failed POST cannot leak the webhook through its error", async () => {
    const redact = makeRedactor(HOOK);
    const r = await postSlack(
      HOOK,
      { username: "x", text: "y" },
      async () => {
        // Exactly the shape Node produces: the URL rides inside the cause.
        const e = new Error("fetch failed");
        (e as Error & { cause?: unknown }).cause = `connect ETIMEDOUT for ${HOOK}`;
        throw e;
      },
      redact,
    );
    expect(r.ok).toBe(false);
    expect(r.detail).not.toContain(HOOK);
    expect(r.detail).not.toContain(TOKEN);
  });

  it("a non-2xx response body is redacted before it is reported", async () => {
    const redact = makeRedactor(HOOK);
    const r = await postSlack(
      HOOK,
      { username: "x", text: "y" },
      async () => ({ status: 403, body: `invalid_token for ${HOOK}` }),
      redact,
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.detail).not.toContain(TOKEN);
  });

  it("an empty/absent secret does not turn the redactor into a shredder", () => {
    // `"".split("")` would splice "***" between every character.
    for (const s of [null, undefined, "", "   "]) {
      expect(makeRedactor(s)("平台 API is down")).toBe("平台 API is down");
    }
  });
});

describe("resolveWebhook", () => {
  it("prefers the probe's own variable", () => {
    const r = resolveWebhook(
      { GGD_UPTIME_WEBHOOK_URL: HOOK, GGD_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/other" },
      NOTIFY,
    );
    expect(r).toEqual({ url: HOOK, source: "GGD_UPTIME_WEBHOOK_URL" });
  });

  it("falls back to the #209 registration channel so one hook can serve both", () => {
    const r = resolveWebhook({ GGD_SLACK_WEBHOOK_URL: HOOK }, NOTIFY);
    expect(r).toEqual({ url: HOOK, source: "GGD_SLACK_WEBHOOK_URL" });
  });

  it("treats whitespace-only as unset (an empty GH secret expands to '')", () => {
    expect(resolveWebhook({ GGD_UPTIME_WEBHOOK_URL: "   " }, NOTIFY)).toBeNull();
    expect(resolveWebhook({}, NOTIFY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

describe("buildMessage", () => {
  it("a clean run produces NO message", () => {
    expect(buildMessage([], [], NOTIFY, META)).toBeNull();
  });

  it("a warn-only run stays silent", () => {
    // `warnings` is context for an alert, never a reason to send one.
    const warn: TargetOutcome = {
      target: {
        id: "game-sim",
        label: "tick 健康度",
        url: "https://ggd.adms.ai/game-healthz",
        enabled: true,
        severity: "warn",
        expectStatus: 200,
      },
      up: false,
      attemptsMade: 3,
      attemptDetails: [],
      detail: "sim.p99Ms is 71, expected lte 45",
    };
    expect(buildMessage([], [warn], NOTIFY, META)).toBeNull();

    // …but the same warning rides along when something real is down.
    const msg = buildMessage([downNote], [warn], NOTIFY, META)!;
    expect(msg.text).toContain("平台 API");
    expect(msg.text).toContain("sim.p99Ms is 71");

    // …AS A WARNING, not as a second outage. The count in the headline is the
    // number of things that are actually broken; folding `warnings` into it
    // would tell the owner two services died when one did.
    expect(msg.text).toContain("🔴 GGD 服務探測失敗（1 項）");
    expect(msg.text).toContain("⚠️ 同時觀察到");
    // And it is mentioned exactly once — not once per section.
    expect(msg.text.split("tick 健康度").length - 1).toBe(1);
  });

  it("names the target, the reason and the URL", () => {
    const msg = buildMessage([downNote], [], NOTIFY, META)!;
    expect(msg.username).toBe("GGD 探測");
    expect(msg.text).toContain("平台 API");
    expect(msg.text).toContain("ECONNREFUSED");
    expect(msg.text).toContain("https://ggd.adms.ai/api/v1/healthz");
    // The window is spelled out, so "down" has a defined meaning in the message.
    expect(msg.text).toContain("3 次 × 20 秒");
  });

  it("batches a multi-service outage into ONE message", () => {
    const msg = buildMessage(
      [downNote, { ...downNote, targetId: "client", label: "遊戲前端" }],
      [],
      NOTIFY,
      META,
    )!;
    expect(msg.text).toContain("2 項");
    expect(msg.text).toContain("平台 API");
    expect(msg.text).toContain("遊戲前端");
  });

  it("only prefixes the mention when one is configured", () => {
    expect(buildMessage([downNote], [], NOTIFY, META)!.text.startsWith("🔴")).toBe(true);
    const pinged = buildMessage([downNote], [], { ...NOTIFY, mention: "<!channel>" }, META)!;
    expect(pinged.text.startsWith("<!channel> 🔴")).toBe(true);
  });

  it("a recovery message reads as recovery and states the duration", () => {
    const msg = buildMessage(
      [{ ...downNote, kind: "recovered", detail: "HTTP 200 OK", downForMs: 25 * 60_000 }],
      [],
      NOTIFY,
      META,
    )!;
    expect(msg.text).toContain("✅");
    expect(msg.text).toContain("恢復");
    expect(msg.text).toContain("25 分鐘");
  });

  it("includes the run URL when GitHub supplies one", () => {
    const msg = buildMessage([downNote], [], NOTIFY, { ...META, runUrl: "https://github.com/adms/GGD/actions/runs/1" })!;
    expect(msg.text).toContain("actions/runs/1");
  });
});

describe("summarize", () => {
  it("distinguishes OK / DOWN / WARN", () => {
    const t = (severity: "page" | "warn") => ({ id: "x", label: "L", severity });
    expect(summarize({ target: t("page"), up: true, detail: "HTTP 200 OK" })).toMatch(/^OK  /);
    expect(summarize({ target: t("page"), up: false, detail: "nope" })).toMatch(/^DOWN/);
    expect(summarize({ target: t("warn"), up: false, detail: "slow" })).toMatch(/^WARN/);
  });
});
