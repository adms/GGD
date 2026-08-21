/**
 * 一鍵開打 FIRST-PRESS RACE (task #200) — the client half of the fix for
 * 「按第一下會退回大廳…按第二次以後就會正常」.
 *
 * THE BUG THIS PINS. A colyseus seat reservation begins its expiry clock the
 * instant the platform mints it — which happens inside `startSoloMatch` (POST
 * /rooms/solo). But the client cannot CONSUME that seat until the one-time
 * content load has settled (main.tsx's `startMatch` no-ops on
 * `!isContentReady()`). On a COLD first press that download outlasts the
 * reservation window, so the join arrives after the seat has expired and bounces
 * back to the lobby; the now-warm cache makes every later press win the race —
 * exactly the first-press-only, self-healing report.
 *
 * THE FIX these tests guard: `playBotMatch` AWAITS the (single-flight) content
 * load BEFORE it asks the platform for a seat, so the reservation is never
 * minted until the client can consume it at once — there is no window to lose.
 *
 * DETERMINISM. We replace only `ensureContentLoaded` with a promise we resolve
 * by hand on a later tick (the "lazy init that finishes as a side effect of the
 * first attempt"). Everything else in content/bootContent stays real.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

/** Hand-controlled stand-in for the one-time content load. */
const gate = vi.hoisted(() => {
  let resolveFn: (() => void) | null = null;
  let promise!: Promise<{ ok: boolean; championCount: number }>;
  const arm = (): void => {
    promise = new Promise((res) => {
      resolveFn = () => res({ ok: true, championCount: 93 });
    });
  };
  arm();
  return {
    arm,
    promise: (): Promise<{ ok: boolean; championCount: number }> => promise,
    resolve: (): void => resolveFn?.(),
  };
});

const startSoloMatch = vi.fn(async () => ({ matchId: "m_test", botFill: 11 }));
// ⭐ GH#492：一鍵開打的出貨路徑 2026-08-21 起是**大廳集合令**（建房 → 廣播 → 等
// 倒數）。#200 的守衛跟著搬到那條路上：要釘的仍然是「內容還沒載完之前，⛔ 不可以
// 去跟平台要任何東西」，只是「要的那個東西」從座位變成了房間。
const createRoom = vi.fn(async (settings: { mapId?: string }) => ({
  room: { id: "r_test", name: "一鍵開打 · 等你上車", hostId: "me", status: "open", mapId: settings.mapId },
  members: [{ accountId: "me", ready: false, isHost: true, localPlayers: 1 }],
}));
const rallyRoom = vi.fn(async () => ({
  invited: 0,
  inLobby: 1,
  truncated: false,
  expiresAt: Date.now() + 10_000,
  waitSec: 10,
}));

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return { ...real, startSoloMatch, createRoom, rallyRoom };
});

// Keep the real module (isContentReady, CONTENT_BASE_URL, the snapshot observable
// …) and override ONLY the load promise, so nothing else in the graph breaks.
vi.mock("../../content/bootContent", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../content/bootContent")>();
  return { ...real, ensureContentLoaded: () => gate.promise() };
});

const { appStore } = await import("./store");

/** The platform's seat-token push for the solo start. */
const seatPush = {
  type: "match_ready",
  matchId: "m_test",
  endpoint: "ws://game.test:2567",
  seatToken: "seat-m_test-me",
};

describe("一鍵開打 first-press content race (#200)", () => {
  beforeEach(() => {
    gate.arm();
    startSoloMatch.mockClear();
    createRoom.mockClear();
    rallyRoom.mockClear();
    appStore.setState({
      screen: "lobby",
      account: { id: "me", username: "owner", mmr: 1000 } as never,
      room: null,
      match: null,
      botMatchBusy: false,
      lastError: null,
    });
  });

  it("does NOT mint the seat until the one-time content init has settled", async () => {
    cover("solo-bot-client-route");
    // Cold session: content has not loaded. Fire the press but do NOT await it —
    // this is the exact tick on which the pre-fix code POSTed /rooms/solo and
    // started the reservation clock racing the still-pending download.
    const press = appStore.getState().playBotMatch("arena-lava");
    await Promise.resolve(); // flush microtasks up to the content await

    // The reservation is NOT minted yet: with the fix the client waits for the
    // init instead of asking for a seat it cannot yet consume. The press is
    // still pending — it did not bounce, it did not error.
    expect(createRoom, "⛔ 內容還沒載完就先跟平台開房 = 座位在下載期間空轉").not.toHaveBeenCalled();
    expect(startSoloMatch).not.toHaveBeenCalled();
    expect(appStore.getState().botMatchBusy).toBe(true);
    expect(appStore.getState().screen).toBe("lobby");
    expect(appStore.getState().lastError).toBeNull();

    // The one-time init resolves on a later tick (warming the cache as a side
    // effect — the very thing that makes every later press succeed).
    gate.resolve();
    await press;

    // NOW — and only now — the platform is asked for anything at all.
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(createRoom.mock.calls[0]?.[0]).toMatchObject({ mapId: "arena-lava" });
    expect(rallyRoom).toHaveBeenCalledTimes(1);
  });

  it("enters the match cleanly on the seat push once content is ready (no bounce)", async () => {
    cover("solo-bot-client-route");
    // 練習模式那條路（不列房、立刻開場）—— 它才是「按下去就鑄座位」的那一條,
    // 也就是這個 no-bounce 守衛真正在守的那一條。
    const press = appStore.getState().playBotMatch(undefined, undefined, true);
    gate.resolve();
    await press;

    expect(startSoloMatch).toHaveBeenCalledTimes(1);
    // The seat token arrives after a warm start → the join can be consumed
    // immediately, so entering the match sticks instead of bouncing to lobby.
    appStore.getState().onWsMessage(seatPush);
    const st = appStore.getState();
    expect(st.screen).toBe("match");
    expect(st.match?.mode).toBe("platform");
    expect(st.match?.matchId).toBe("m_test");
    expect(st.botMatchBusy).toBe(false);
  });

  it("abandons the press without minting a seat if the lobby is left while content loads", async () => {
    cover("solo-bot-client-route");
    const press = appStore.getState().playBotMatch();
    await Promise.resolve();
    // The player navigated away (logout) while the cold load was still running.
    appStore.setState({ screen: "auth", botMatchBusy: false });
    gate.resolve();
    await press;
    // No seat was minted for a press nobody is waiting on.
    expect(startSoloMatch).not.toHaveBeenCalled();
  });
});
