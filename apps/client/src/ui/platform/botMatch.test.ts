/**
 * ONE-CLICK BOT MATCH (task #188) — the client half of 「play offline with bot
 * 也要開放給有註冊的玩家在大廳一鍵開房直接玩」.
 *
 * WHAT THESE TESTS ARE ACTUALLY GUARDING. The lobby has had a "Play vs bots"
 * button for a long time and it was a debug shortcut: it joined the game server
 * directly, so no platform match existed and nothing settled — no record, no
 * MMR, no 水晶, no ladder row. The fix is not a nicer button, it is a different
 * ROUTE (POST /rooms/solo). So the assertions below are about which call the
 * button makes and what it must NOT do, not about how it looks.
 *
 * Node env, like the other store tests: this is plain state plus one fetch seam,
 * and the strip renders to static markup.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";

const startSoloMatch = vi.fn(async () => ({ matchId: "m_test", botFill: 11 }));
// ⭐ GH#492：一鍵開打的**出貨路徑**在 2026-08-21 換了 —— owner 的原話是
// 「最多等 10 秒，**包含 vs bot**」，所以它現在建一間**列在大廳**的房、對全大廳
// 廣播集合令、等倒數，⛔ 不再是「立刻對 11 隻 bot 開場」。這三個 mock 就是那條
// 新路徑的三個關節。
const createRoom = vi.fn(async (settings: { mapId?: string }) => ({
  room: { id: "r_test", name: "一鍵開打 · 等你上車", hostId: "me", status: "open", mapId: settings.mapId },
  members: [{ accountId: "me", ready: false, isHost: true, localPlayers: 1 }],
}));
const rallyRoom = vi.fn(async () => ({
  invited: 2,
  inLobby: 3,
  truncated: false,
  expiresAt: Date.now() + 10_000,
  waitSec: 10,
}));

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return { ...real, startSoloMatch, createRoom, rallyRoom };
});

const { appStore, BOT_MATCH_SEAT_TIMEOUT_MS } = await import("./store");
const { LobbyScreen } = await import("./LobbyScreen");

/** A lobby WS `match_ready` push — the platform's answer to a solo start. */
const seatPush = {
  type: "match_ready",
  matchId: "m_test",
  endpoint: "ws://game.test:2567",
  seatToken: "seat-m_test-me",
};

describe("lobby one-click bot match (#188)", () => {
  beforeEach(() => {
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

  it("goes through the PLATFORM, and (GH#492) through the 大廳集合令 —— 不是直連", async () => {
    cover("solo-bot-client-route");
    await appStore.getState().playBotMatch("arena-lava");

    // ⭐ owner 2026-08-21:「最多等 10 秒，**包含 vs bot**」—— 一鍵開打與建房是
    // **同一條**流程：開一間列在大廳的房 + 對全大廳廣播，⛔ 不是立刻開場。
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(createRoom.mock.calls[0]?.[0]).toMatchObject({ mapId: "arena-lava" });
    expect(rallyRoom).toHaveBeenCalledTimes(1);
    expect(startSoloMatch, "⛔ 立刻開場那條路只留給練習模式與 rollback").not.toHaveBeenCalled();
    // The old button flipped straight to "match" with a mode:"offline" launch.
    // That is exactly the behaviour that settled nowhere, so it must NOT happen
    // here: the screen only changes when the platform's seat token arrives.
    expect(appStore.getState().screen).toBe("lobby");
    expect(appStore.getState().match).toBeNull();
    // 倒數在跑,所以房間是活的 —— 而「沒收到座位」的逾時錯誤⛔ 不可以在等人的
    // 那十秒裡跳出來。
    expect(appStore.getState().rally?.roomId).toBe("r_test");
  });

  it("one click is one match — a second press while pending does nothing", async () => {
    cover("solo-bot-client-route");
    // ⚠️ 練習模式仍然走「不列房、立刻開」那條路（練習房是測試碼的鑰匙,
    // 一間有旁人的練習房就是作弊房）—— 所以一press-一match 的守衛釘在它上面。
    const first = appStore.getState().playBotMatch(undefined, undefined, true);
    await appStore.getState().playBotMatch(undefined, undefined, true);
    await first;
    expect(startSoloMatch).toHaveBeenCalledTimes(1);
  });

  it("enters the match on the seat-token push, as a platform match", async () => {
    cover("solo-bot-client-route");
    await appStore.getState().playBotMatch();
    appStore.getState().onWsMessage(seatPush);

    const st = appStore.getState();
    expect(st.screen).toBe("match");
    expect(st.match?.mode).toBe("platform");
    expect(st.match?.matchId).toBe("m_test");
    expect(st.match?.seatToken).toBe("seat-m_test-me");
    expect(st.botMatchBusy).toBe(false);
  });

  it("says so instead of hanging when the seat token never arrives", async () => {
    cover("solo-bot-client-route");
    vi.useFakeTimers();
    try {
      // 練習模式那條路 —— 它才是「立刻開場、然後等座位推播」的那一條，
      // 也就是這個逾時守衛真正在守的那一條。集合令那條路刻意**沒有**這個逾時：
      // 它本來就要等人（⛔ 不然玩家會在等人的十秒裡看到「沒收到座位」的錯誤）。
      await appStore.getState().playBotMatch(undefined, undefined, true);
      vi.advanceTimersByTime(BOT_MATCH_SEAT_TIMEOUT_MS + 1);
    } finally {
      vi.useRealTimers();
    }
    expect(appStore.getState().botMatchBusy).toBe(false);
    expect(appStore.getState().lastError).toBeTruthy();
  });

  it("surfaces a refused start (e.g. an unapproved account) rather than swallowing it", async () => {
    cover("solo-bot-client-route");
    startSoloMatch.mockRejectedValueOnce(new Error("account is awaiting approval"));
    // 練習模式那條路（同上）—— 被拒絕的原因要說出來,⛔ 不可以靜靜地回到大廳。
    await appStore.getState().playBotMatch(undefined, undefined, true);
    expect(appStore.getState().botMatchBusy).toBe(false);
    expect(appStore.getState().lastError).toContain("approval");
  });

  it("the lobby offers the real mode and keeps the dev direct-join, told apart", () => {
    cover("solo-bot-lobby-affordance");
    const html = renderToStaticMarkup(createElement(LobbyScreen));
    expect(html).toContain("一鍵開打"); // the real, settling mode
    expect(html).toContain("單人 vs BOT");
    expect(html).toContain("計分"); // the payout is stated, not implied
    expect(html).toContain("dev 直連"); // the debug shortcut survives, labelled
  });

  /**
   * THE REWARD MUST BE READABLE WITHOUT HOVERING. A bot match pays half 水晶,
   * no M幣 and moves no MMR; if any of that lived only in a `title=` the mode
   * would read as "free rewards" and the first crystal count would look like a
   * bug. So the assertion is on markup with every title attribute STRIPPED —
   * a tooltip cannot satisfy it, and it also cannot be satisfied on a phone,
   * where hover does not exist at all (#151/#159).
   */
  it("prints the reduced payout as visible text, not as a tooltip", () => {
    cover("solo-bot-lobby-affordance");
    const visible = renderToStaticMarkup(createElement(LobbyScreen)).replace(/\stitle="[^"]*"/g, "");
    expect(visible).toContain("水晶 ½"); // halved: a bot sits on your team
    expect(visible).toContain("無 M幣"); // M幣 needs an all-human 12-seat lobby
    expect(visible).toContain("MMR 不變"); // ranking/elo.go: not a rated contest
  });

  /**
   * WEIGHT (#188 ask: "make it read as a way to PLAY"). The failure this guards
   * is the original state of this feature — a `small` ghost button labelled as a
   * dev tool. The two buttons must not be peers: the mode is a primary Btn, the
   * dev direct-join stays a small ghost.
   */
  it("the mode outranks the dev shortcut visually", () => {
    cover("solo-bot-lobby-affordance");
    // titles stripped first: the dev button's own tooltip STARTS with the
    // string "dev 直連", so searching the raw markup finds the attribute and
    // slices the tag in half.
    const html = renderToStaticMarkup(createElement(LobbyScreen)).replace(/\stitle="[^"]*"/g, "");
    /** The opening <button …> tag of the button whose label is `label`. */
    const tagOf = (label: string): string => {
      const before = html.slice(0, html.indexOf(label));
      return before.slice(before.lastIndexOf("<button"));
    };
    const play = tagOf("一鍵開打");
    const dev = tagOf("dev 直連");
    expect(play).toContain("ggd-btn--primary");
    expect(dev).toContain("ggd-btn--ghost");
    // and it is not the 11px `small` geometry the dev shortcut keeps
    expect(play).toContain("font-size:16px");
    expect(dev).toContain("font-size:11px");
  });

  /**
   * SAFE-AREA CONTRACT (#107): the strip is ordinary flow inside the lobby's
   * centre column. It must never grow its own absolute positioning — that is
   * exactly how lobby chrome ends up painted under the <body>-portaled audio
   * cluster, which #107 exists to stop.
   */
  it("claims no absolute positioning of its own", () => {
    cover("solo-bot-lobby-affordance");
    const src = readFileSync(new URL("./LobbyScreen.tsx", import.meta.url), "utf8");
    const strip = src.slice(
      src.indexOf("function RewardBadge"),
      src.indexOf("export function LobbyScreen"),
    );
    expect(strip).not.toMatch(/position\s*:/);
  });
});
