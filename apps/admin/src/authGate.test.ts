/**
 * split-login-gate (task #102 follow-up) — proves the admin console's login gate
 * is SPLIT, not global:
 *
 *   • the content / codex editor (champions / abilities / items, served by the
 *     loopback content-api) is reachable with NO session — opening the console
 *     in dev drops straight into it;
 *   • every page backed by the Go PLATFORM admin API (players, matches,
 *     announcements, curation, ai, combat-env, M幣 grant, audit) still requires a
 *     real operator session and is gated until one exists.
 *
 * The distinction is by BACKEND, never by page name: a page is gated iff its
 * data lives on the platform admin API, which rejects an unauthenticated caller
 * regardless. This test file changes nothing about that server-side gate (the
 * platform is untouched); it pins the console's client-side split around it.
 *
 * Boot's no-session branches are fully synchronous (no session ⇒ no network), so
 * they are asserted directly against the store singleton. `import.meta.env.DEV`
 * is true under vitest, so the dev decision is passed explicitly to exercise
 * both the dev drop-in and the production hard-wall branch deterministically.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { appStore, pageRequiresSession, type Page } from "./store";

const st = () => appStore.getState();

// ---------------------------------------------------------------------------
// A. the classification IS the split
// ---------------------------------------------------------------------------

describe("A: pageRequiresSession splits platform pages from content/local ones", () => {
  it("content editor + hub + local asset consoles need NO session", () => {
    cover("content-admin-gate");
    for (const p of ["content", "hub", "modelBudget", "iconTracking"] as Page[]) {
      expect(pageRequiresSession(p), p).toBe(false);
    }
  });

  it("every Go-platform admin page still requires a session", () => {
    cover("content-admin-gate");
    for (const p of [
      "players",
      "matches",
      "announcements",
      "curation",
      "ai",
      "combatEnv",
      "mcoinGrant",
      "audit",
    ] as Page[]) {
      expect(pageRequiresSession(p), p).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// B. dev drop-in: the console opens on the content editor with no login
// ---------------------------------------------------------------------------

describe("B: dev drop-in reaches the content editor with no session", () => {
  it("boots straight into the console on the content page, account null", async () => {
    cover("content-admin-gate");
    await st().boot({ devDropIn: true });
    expect(st().screen).toBe("console");
    expect(st().page).toBe("content");
    expect(st().account).toBeNull();
    // and the content page is NOT gated — it is served over loopback, not the
    // platform admin API
    expect(pageRequiresSession(st().page)).toBe(false);
  });

  it("a player-ops page is gated (no account) even in the drop-in", async () => {
    cover("content-admin-gate");
    await st().boot({ devDropIn: true });
    st().navigate("mcoinGrant");
    const gated = st().account === null && pageRequiresSession(st().page);
    expect(gated).toBe(true);
  });

  it("sign-out in dev returns to the content editor, not a wall", async () => {
    cover("content-admin-gate");
    await st().boot({ devDropIn: true });
    await st().doLogout();
    expect(st().screen).toBe("console");
    expect(st().page).toBe("content");
    expect(st().account).toBeNull();
  });

  it("showLogin raises the login screen; cancelLogin returns to the console", async () => {
    cover("content-admin-gate");
    await st().boot({ devDropIn: true });
    st().showLogin();
    expect(st().screen).toBe("login");
    st().cancelLogin();
    expect(st().screen).toBe("console");
  });
});

// ---------------------------------------------------------------------------
// C. production build: the hard login wall is preserved
// ---------------------------------------------------------------------------

describe("C: without the dev drop-in the login wall is unchanged", () => {
  it("a session-less boot lands on the login screen", async () => {
    cover("content-admin-gate");
    await st().boot({ devDropIn: false });
    expect(st().screen).toBe("login");
  });

  it("cancelLogin is a no-op with no console behind it (prod wall)", async () => {
    cover("content-admin-gate");
    await st().boot({ devDropIn: false });
    st().cancelLogin();
    // still the wall — there is no content editor to fall back to in prod
    expect(st().screen).toBe("login");
  });
});
