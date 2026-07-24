/**
 * adminui-voice-api — the /voice-api client is inert outside a dev build (every
 *                        writer short-circuits before touching the network),
 *                        never builds a clip path that could escape a champion
 *                        directory, and reports a missing daemon as a DEGRADED
 *                        read-only mode rather than as "no work done yet".
 * adminui-voice-gate — the page and its write path are dev-only by
 *                        CONSTRUCTION (a bare `import.meta.env.DEV` guard above
 *                        a static dynamic import in App.tsx), the vite proxy
 *                        that reaches the daemon exists, and nothing in the
 *                        eagerly-loaded shell carries the page's label.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import * as api from "./voiceApi";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
/** Strip comments so prose in a doc block cannot satisfy a check. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const APP_SRC = read("apps/admin/src/ui/App.tsx");
const ADMIN_VITE = read("apps/admin/vite.config.ts");
const API_SRC = read("apps/admin/src/voice/voiceApi.ts");
const PAGE_SRC = read("apps/admin/src/ui/VoiceGenPage.tsx");

describe("the client is inert outside a dev build", () => {
  it("reads the DEV flag through the guarded shape — a boolean, never a throw", () => {
    cover("adminui-voice-api");
    // vitest runs this module under vite's own `DEV: true`, so the gate is ON
    // here and the behavioural tests below exercise the real paths. What the
    // guarded read must guarantee is that it yields a BOOLEAN rather than
    // throwing on an environment with no `import.meta.env` at all — the source
    // shape is pinned structurally in the gate suite below.
    expect(typeof api.VOICE_API.enabled).toBe("boolean");
    expect(api.VOICE_API.offMessage).toContain("60721");
    // with the gate on, reachability is the only remaining question
    expect(api.serviceMode(true)).toBe(api.VOICE_API.enabled ? "live" : "off");
    expect(api.serviceMode(false)).toBe(api.VOICE_API.enabled ? "readonly" : "off");
  });

  it("uses the repo's guarded import.meta.env.DEV shape, and gates on it once", () => {
    cover("adminui-voice-gate");
    const src = code(API_SRC);
    expect(src).toMatch(/function isDevBuild\(\)\s*:\s*boolean\s*\{/);
    expect(src).toMatch(/import\.meta as unknown as \{ env\?: \{ DEV\?: boolean \} \}/);
    expect(src).toMatch(/catch\s*\{\s*return false;\s*\}/);
    expect(src).toMatch(/const ENABLED = isDevBuild\(\);/);
    // no runtime hostname / storage sniffing anywhere in the client
    expect(src).not.toMatch(/location\.hostname|window\.location|localStorage/);
  });

  it("EVERY exported writer short-circuits on the gate as its first branch", () => {
    cover("adminui-voice-gate");
    const src = code(API_SRC);
    const writers = [
      "setLineText",
      "enqueue",
      "cancelJob",
      "promoteTake",
      "reviewLine",
      "selectReference",
      "uploadReference",
      "deleteReference",
    ];
    for (const name of writers) {
      const at = src.indexOf(`export function ${name}(`);
      expect(at, `${name} must exist`).toBeGreaterThan(0);
      const next = src.indexOf("\nexport ", at + 1);
      const body = src.slice(at, next < 0 ? src.length : next);
      const firstIf = body.indexOf("if (");
      expect(firstIf, `${name} must have a guard`).toBeGreaterThan(0);
      expect(body.slice(firstIf, firstIf + 24), `${name} must open with the gate`).toMatch(
        /^if \(!ENABLED\)/,
      );
      const firstNetwork = body.search(/\bmutate\(|\bdoFetch\(|\bfetch\(/);
      if (firstNetwork >= 0) {
        expect(firstNetwork, `${name} must not reach the network before the gate`).toBeGreaterThan(firstIf);
      }
    }
  });

  it("sends a mutating verb with a JSON body, and surfaces the daemon's refusal verbatim", async () => {
    cover("adminui-voice-api");
    const calls: { url: string; method: string; body: unknown }[] = [];
    api.setVoiceFetch((async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      });
      // the 409 the daemon returns for the one thing that must never succeed
      return new Response(JSON.stringify({ error: "stub clip cannot be approved" }), {
        status: 409,
        headers: { "x-voice-engine": "stub" },
      });
    }) as unknown as typeof fetch);
    try {
      const r = await api.reviewLine("godie-e001", "quote", "approved", "ok?");
      expect(r.ok).toBe(false);
      // the reason is the SERVER's, not a generic "something went wrong"
      expect(r.error).toBe("stub clip cannot be approved");
      expect(r.status).toBe(409);
      expect(r.engineHeader).toBe("stub");
      expect(calls[0]?.method).toBe("POST");
      expect(calls[0]?.url).toBe("/voice-api/lines/godie-e001/quote/review");
      expect(calls[0]?.body).toEqual({ decision: "approved", note: "ok?" });
    } finally {
      api.setVoiceFetch(null);
    }
  });

  it("reports a dead daemon as an error rather than as a silent success", async () => {
    cover("adminui-voice-api");
    api.setVoiceFetch((async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8788");
    }) as unknown as typeof fetch);
    try {
      const h = await api.health();
      expect(h.ok).toBe(false);
      expect(h.error).toContain("8788");
      const r = await api.roster();
      expect(r.ok).toBe(false);
      expect(r.data).toBeNull();
    } finally {
      api.setVoiceFetch(null);
    }
  });

  it("refuses to build a request for an unsafe lineId, before any transport", async () => {
    cover("adminui-voice-api");
    let called = 0;
    api.setVoiceFetch((async () => {
      called++;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);
    try {
      for (const bad of ["../../etc/passwd", "a/b"]) {
        expect((await api.promoteTake("a", bad, 1)).ok).toBe(false);
        expect((await api.setLineText("a", bad, { text: "x", textSource: "authored" })).ok).toBe(false);
        expect((await api.reviewLine("a", bad, "approved")).ok).toBe(false);
      }
      expect(called).toBe(0);
    } finally {
      api.setVoiceFetch(null);
    }
  });

  it("refuses an unlicensed upload before the request is even built", async () => {
    cover("adminui-voice-api");
    const r = await api.uploadReference("a", {
      base64: "AAA",
      filename: "x.wav",
      sourceKind: "upload",
      licence: "   ",
    });
    expect(r.ok).toBe(false);
  });
});

describe("clip URLs cannot escape the champion directory", () => {
  it("builds a normal clip URL, with and without a take", () => {
    cover("adminui-voice-api");
    expect(api.clipUrl("godie-e001", "skill-name.q")).toBe(
      "/voice-api/clip/godie-e001/skill-name.q",
    );
    expect(api.clipUrl("godie-e001", "quote", 3)).toBe("/voice-api/clip/godie-e001/quote?take=3");
    expect(api.referenceUrl("godie-e001")).toBe("/voice-api/reference/godie-e001");
    expect(api.eventsUrl()).toBe("/voice-api/events");
  });

  it("returns null — not an encoded path — for an unsafe lineId", () => {
    cover("adminui-voice-api");
    for (const bad of ["../../etc/passwd", "a/b", "a.b.c", ""]) {
      expect(api.clipUrl("godie-e001", bad), bad).toBeNull();
    }
  });

  it("percent-encodes a champion id rather than interpolating it raw", () => {
    cover("adminui-voice-api");
    expect(api.clipUrl("a/b", "quote")).toBe("/voice-api/clip/a%2Fb/quote");
  });
});

describe("a missing daemon degrades honestly", () => {
  it("falls back to the published ROSTER.json off the content mount", async () => {
    cover("adminui-voice-api");
    api.setVoiceFetch((async (url: string) => {
      if (String(url).includes("ROSTER.json")) {
        return new Response(
          JSON.stringify({ champions: [{ championId: "a", counts: { total: 46 } }] }),
          { status: 200 },
        );
      }
      throw new Error("connection refused");
    }) as unknown as typeof fetch);
    try {
      const r = await api.publishedRoster();
      expect(r?.champions).toHaveLength(1);
      // …and the roster the fallback produced still names its engine as STUB,
      // because a file with no engine block cannot vouch for real output
      expect(r?.engine.stub).toBe(true);
    } finally {
      api.setVoiceFetch(null);
    }
  });

  it("returns null (not an empty roster) when there is nothing published either", async () => {
    cover("adminui-voice-api");
    api.setVoiceFetch((async () => new Response("nope", { status: 404 })) as typeof fetch);
    try {
      expect(await api.publishedRoster()).toBeNull();
      expect(await api.categories(null)).toBeNull();
    } finally {
      api.setVoiceFetch(null);
    }
  });

  it("names the exact command that starts the service", () => {
    cover("adminui-voice-api");
    expect(api.NO_DAEMON_MESSAGE).toContain("tools/voice-gen/src/serve.mjs");
  });
});

describe("the page is dev-only by construction", () => {
  it("guards the dynamic import with a BARE import.meta.env.DEV early return", () => {
    cover("adminui-voice-gate");
    const src = code(APP_SRC);
    const at = src.indexOf('import("./VoiceGenPage")');
    expect(at, "App must load ./VoiceGenPage dynamically").toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 400), at);
    // statically substitutable — NOT a runtime hostname / env / storage lookup
    expect(before).toMatch(/if \(!import\.meta\.env\.DEV\) return;/);
    expect(before).not.toMatch(/location\.hostname|window\.location|localStorage/);
  });

  it("nothing in the eagerly-loaded shell imports the page or names it", () => {
    cover("adminui-voice-gate");
    const src = code(APP_SRC);
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)[^;]*?from\s+["']\.\/VoiceGenPage["']/m);
    expect(src).not.toMatch(/from\s+["']\.\.\/voice\//);
    // the LABEL travels with the chunk, so a prod bundle lacks even the string
    expect(src).not.toContain("角色語音生成");
    expect(src).toContain("m.VOICE_NAV");
    expect(code(PAGE_SRC)).toContain('label: "角色語音生成"');
  });

  it("the admin server proxies /voice-api to the loopback daemon", () => {
    cover("adminui-voice-gate");
    const src = code(ADMIN_VITE);
    expect(src).toMatch(/["']\/voice-api["']\s*:\s*\{/);
    expect(src).toContain("127.0.0.1:8788");
    // the bind that makes the proxy safe is still in place and still first
    expect(src).toMatch(/plugins:\s*\[\s*loopbackOnly\(\)/);
    expect(src).toMatch(/host:\s*"127\.0\.0\.1"/);
  });

  it("the voice client is the only module in the console that writes to /voice-api", () => {
    cover("adminui-voice-gate");
    // The page must go through the gated client, never build its own request.
    const page = code(PAGE_SRC);
    expect(page).not.toMatch(/fetch\s*\(/);
    expect(page).not.toMatch(/new EventSource/);
    expect(page).not.toMatch(/"\/voice-api/);
  });

  /**
   * THE test that actually proves the claim, opt-in because it runs a real
   * production build (the same switch contentGate.test.ts uses):
   *
   *   GGD_BUILD_GATE=1 pnpm --filter @ggd/admin test
   */
  it.runIf(Boolean(process.env.GGD_BUILD_GATE))(
    "a real production build emits no voice page and no /voice-api path",
    () => {
      cover("adminui-voice-gate");
      const out = mkdtempSync(join(tmpdir(), "ggd-admin-voice-build-"));
      try {
        execFileSync(
          "npx",
          ["vite", "build", "--outDir", out, "--emptyOutDir", "--mode", "production"],
          {
            cwd: join(REPO, "apps/admin"),
            stdio: "pipe",
            env: { ...process.env, NODE_ENV: "production" },
          },
        );
        const files: string[] = [];
        const walk = (dir: string): void => {
          for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else files.push(p);
          }
        };
        walk(out);
        expect(files.length).toBeGreaterThan(0);
        expect(files.filter((f) => /VoiceGen|voiceApi|voiceModel/i.test(f))).toEqual([]);

        const bundled = files
          .filter((f) => /\.(js|mjs|css|html)$/.test(f))
          .map((f) => readFileSync(f, "utf8"))
          .join("\n");
        // no request to the daemon can be CONSTRUCTED: its mount path is absent
        expect(bundled).not.toContain("/voice-api");
        expect(bundled).not.toContain("8788");
        // nor can the page be recognised by its own strings
        expect(bundled).not.toContain("角色語音生成");
        expect(bundled).not.toContain("STUB 假音");
        expect(bundled).not.toContain("參考語音");
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it("names how to run the build gate when it is skipped", () => {
    cover("adminui-voice-gate");
    expect(readFileSync(new URL(import.meta.url), "utf8")).toContain("GGD_BUILD_GATE=1");
  });

  it("the page never hardcodes the clip count — it renders what it computed", () => {
    cover("adminui-voice-gate");
    const page = code(PAGE_SRC);
    // 2016 (his estimate) and 2208 (the real number) must both be DERIVED
    expect(page).not.toMatch(/\b2016\b/);
    expect(page).not.toMatch(/\b2208\b/);
    expect(page).toContain("expectedClips");
  });
});
