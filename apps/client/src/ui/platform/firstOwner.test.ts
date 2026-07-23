/**
 * firstOwner (T0 / #180) — the register screen's first-owner (站長) affordance.
 *
 * Two halves, both load-bearing:
 *   A. the pure copy + argument logic (which typed field flows to which register
 *      argument) is correct and the two states are distinct;
 *   B. the wiring is actually present in the SOURCE — api.ts puts bootstrapToken
 *      on the wire, AuthScreen switches on bootstrapNeedsOwner and forwards the
 *      token to doRegister, and the store threads it to api.register. AuthScreen
 *      is Babylon-backed and cannot be rendered in a unit test, so — like admin's
 *      recovery.test.ts — the wiring is asserted against the modules' own source,
 *      where a future refactor that dropped the token would slip past a test that
 *      only exercised exports.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  registerArgs,
  isPlatformRestrictedError,
  OWNER_SETUP_TITLE,
  OWNER_TOKEN_LABEL,
  INVITE_HELP,
  OFFLINE_PLATFORM_NOTE,
  OFFLINE_RESTRICTED_MESSAGE,
} from "./firstOwner";
import { register, bootstrapState } from "./api";

const src = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("registerArgs — one typed field, the right destination", () => {
  it("first-owner mode sends the token as bootstrapToken and NO invite code", () => {
    expect(registerArgs(true, "  abc123token  ")).toEqual({ inviteCode: "", bootstrapToken: "abc123token" });
  });

  it("family mode sends the invite code and NO bootstrap token", () => {
    expect(registerArgs(false, " GGD-AAAA-BBBB ")).toEqual({ inviteCode: "GGD-AAAA-BBBB", bootstrapToken: "" });
  });

  it("never sends both — the owner path can never double as a stranger's invite door", () => {
    for (const firstOwner of [true, false]) {
      const args = registerArgs(firstOwner, "value");
      expect(args.inviteCode === "" || args.bootstrapToken === "").toBe(true);
    }
  });
});

describe("isPlatformRestrictedError", () => {
  it("matches the game-server restriction error", () => {
    expect(isPlatformRestrictedError("match creation is restricted to the platform reservation flow")).toBe(true);
  });
  it("does not match unrelated failures", () => {
    expect(isPlatformRestrictedError("connection failed")).toBe(false);
  });
});

describe("copy — the two register states are visibly different and never a dead-end", () => {
  it("first-owner copy addresses the admin-to-be, not 'ask an admin'", () => {
    expect(OWNER_SETUP_TITLE).toContain("首位管理員");
    expect(OWNER_TOKEN_LABEL).toContain("owner-setup-token");
    // the dead-end phrasing belongs ONLY to the family/invite state
    expect(OWNER_SETUP_TITLE).not.toContain("邀請碼");
    expect(INVITE_HELP).toContain("邀請碼");
  });
  it("the offline note routes a real host to login → lobby", () => {
    expect(OFFLINE_PLATFORM_NOTE).toContain("大廳");
    expect(OFFLINE_RESTRICTED_MESSAGE).toContain("大廳");
  });
});

describe("api.ts wire — the byte the server needs is now sendable", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(): ReturnType<typeof vi.fn> {
    const spy = vi.fn(
      async () =>
        new Response(JSON.stringify({ account: {}, tokens: {} }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("register() puts bootstrapToken on the wire when supplied", async () => {
    const spy = stubFetch();
    await register("founder", "founder@fam.test", "correct-horse", "", "hosttoken123");
    const call = spy.mock.calls[0]!;
    const init = call[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ username: "founder", bootstrapToken: "hosttoken123" });
    expect(body.inviteCode).toBeUndefined();
  });

  it("register() omits bootstrapToken entirely for an ordinary invited signup", async () => {
    const spy = stubFetch();
    await register("sister", "sister@fam.test", "correct-horse", "GGD-AAAA-BBBB");
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.bootstrapToken).toBeUndefined();
    expect(body.inviteCode).toBe("GGD-AAAA-BBBB");
  });

  it("bootstrapState() is an unauthenticated GET on /auth/bootstrap-state", async () => {
    const spy = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ needsOwner: true, requireToken: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", spy);
    const st = await bootstrapState();
    expect(st).toEqual({ needsOwner: true, requireToken: true });
    const call = spy.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(String(call[0])).toContain("/auth/bootstrap-state");
    expect(init.method ?? "GET").toBe("GET");
    expect(init.headers as Record<string, string>).not.toHaveProperty("Authorization");
  });
});

describe("wiring is present in source (AuthScreen is Babylon-backed, not render-testable)", () => {
  it("api.ts register() builds bootstrapToken into the body", () => {
    const s = src("./api.ts");
    expect(s).toMatch(/bootstrapToken/);
    expect(s).toMatch(/body\.bootstrapToken\s*=/);
  });

  it("AuthScreen switches on the first-owner state and forwards the token to doRegister", () => {
    const s = src("./AuthScreen.tsx");
    expect(s).toMatch(/bootstrapNeedsOwner/);
    expect(s).toMatch(/registerArgs\(/);
    expect(s).toMatch(/args\.bootstrapToken/);
  });

  it("the store threads bootstrapToken through doRegister to api.register", () => {
    const s = src("./store.ts");
    expect(s).toMatch(/doRegister\(username, email, password, inviteCode = "", bootstrapToken = ""\)/);
    expect(s).toMatch(/apiFns\.register\(username, email, password, inviteCode, bootstrapToken\)/);
    expect(s).toMatch(/refreshBootstrapState/);
  });
});
