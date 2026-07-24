/**
 * Client surfaces for #204 (藍水晶 lobby chip + wallet type) and #203 (personal
 * referral code + the pending-registration card path).
 *
 * Node env like the other store tests. Two seams are exercised directly rather
 * than through a full client render: the store's pending-registration branch
 * (plain state), and the Crystal chip (a pure prop-driven widget). The lobby is
 * additionally rendered to confirm the 藍水晶 chip is mounted in the HUD —
 * asserted on markup that does NOT depend on runtime state, because zustand v5's
 * server snapshot reads the INITIAL state (renderToStaticMarkup can't see
 * setState), which is exactly what the bot-match render tests already rely on.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const register = vi.fn();

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return { ...real, register };
});

const { appStore } = await import("./store");
const { LobbyScreen } = await import("./LobbyScreen");
const { Crystal } = await import("./widgets");

describe("藍水晶 chip (#204)", () => {
  it("renders the balance with locale grouping and its own blue glyph", () => {
    const html = renderToStaticMarkup(createElement(Crystal, { amount: 1000, size: 15 }));
    expect(html).toContain("🔷");
    expect(html).toContain("1,000");
    // Distinct from M幣 gold — the crystal blue is its own colour.
    expect(html).toContain("#4ec3ff");
  });

  it("the lobby HUD mounts a 藍水晶 chip beside M幣", () => {
    const html = renderToStaticMarkup(createElement(LobbyScreen));
    // The chip is present (initial wallet is null → shows 0, which is fine here:
    // the point is the HUD carries a 藍水晶 readout at all).
    expect(html).toContain("🔷");
    expect(html).toContain("藍水晶"); // the chip's own title/label
    expect(html).toContain("Ⓜ"); // …still alongside the M幣 chip
  });
});

describe("pending-registration surface (#126 gate + #203 referral)", () => {
  beforeEach(() => {
    register.mockReset();
    appStore.setState({ screen: "auth", account: null, pendingRegistration: null, authBusy: false });
  });

  it("a PENDING registration (no session) does not enter the lobby — it holds the account + its code", async () => {
    register.mockResolvedValue({
      account: { id: "a1", username: "cousin", mmr: 1000, status: "pending", referralCode: "GGD-AAAA-BBBB" },
      tokens: { accessToken: "", refreshToken: "", expiresIn: 0 },
    });

    await appStore.getState().doRegister("cousin", "c@e.test", "correct-horse-battery", "GGD-CODE-CODE");

    const st = appStore.getState();
    expect(st.screen).toBe("auth"); // NOT flipped to the lobby on an empty session
    expect(st.pendingRegistration?.referralCode).toBe("GGD-AAAA-BBBB");
    expect(st.authBusy).toBe(false);

    // Dismissing returns to the form.
    appStore.getState().clearPendingRegistration();
    expect(appStore.getState().pendingRegistration).toBeNull();
  });

  it("an APPROVED registration (with a token) is NOT held as pending", async () => {
    register.mockResolvedValue({
      account: { id: "a2", username: "owner", mmr: 1000, status: "approved" },
      tokens: { accessToken: "acc", refreshToken: "ref", expiresIn: 900 },
    });
    // enterLobby will try to open the WS etc.; we only assert the pending gate
    // did NOT trip, which is decided before any of that.
    await appStore.getState().doRegister("owner", "o@e.test", "correct-horse-battery").catch(() => undefined);
    expect(appStore.getState().pendingRegistration).toBeNull();
  });
});
