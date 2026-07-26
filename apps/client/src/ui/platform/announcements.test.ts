/**
 * 大廳公告 (task #259) — the tests that have to be more than "the component
 * renders when given a prop".
 *
 * ---- WHY THAT MATTERS HERE MORE THAN USUAL --------------------------------
 * The announcement BACKEND has existed for releases. `internal/admin` stored
 * them, `PublicFeed` projected the active ones, `MountPublic` put them on an
 * unauthenticated route, and the admin console had an authoring form with an
 * 「Active (shown to players)」 toggle and a live "player feed" preview. Every
 * piece was implemented and tested. `grep -rl announcement apps/client/src`
 * returned two files, both the unrelated in-combat cast announcer. The owner
 * ticked Active, the family saw nothing, and no test anywhere went red.
 *
 * That is the fourth time in this codebase (#93's firework, #247's leap,
 * 蒼月潮's combo) that something shipped, passed, and was never encountered by
 * a player. So the assertions below are deliberately anchored at the two joints
 * where those failures actually live:
 *
 *   1. DOES THE LOBBY ASK? — the whole `doLogin → enterLobby` fan-out is run
 *      against a stub platform and the REQUESTED URLS are asserted. Delete the
 *      `refreshAnnouncement()` line from enterLobby and this goes red, which is
 *      precisely the state main was in before this change.
 *   2. DOES A PLAYER SEE IT? — the REAL `LobbyScreen` is rendered (not the
 *      popup in isolation) and the operator's own words are looked for in the
 *      markup. Unmount the popup from the lobby tree and this goes red even
 *      though every unit test on the popup keeps passing.
 *
 * Then the behaviour that makes a popup tolerable: dismissal STICKS across a
 * reload, and a SECOND, different announcement pops again.
 *
 * The generalisation of failure (1) — a public server route with no client
 * reader at all — is guarded for every route, not just this one, by
 * ./publicFeedReaders.test.ts.
 *
 * ---- HOW THE LOBBY IS RENDERED WITHOUT A DOM ------------------------------
 * The client's vitest env is `node`; the repo's convention is
 * `renderToStaticMarkup` (see HomeFooter/botMatch tests). For a store-driven
 * element that only works because `useApp` feeds the LIVE store state to
 * React's server snapshot — see the docblock on `useApp` in ./store, which is
 * part of this change: zustand's default hands `getInitialState` to SSR, so
 * before that fix every `setState`-then-render test in this repo was asserting
 * against the store as it looked at module load.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  announcementDate,
  announcementLines,
  announcementView,
  currentAnnouncement,
  DISMISSED_KEY,
  DISMISS_CAP,
  markDismissed,
  parseAnnouncementFeed,
  readDismissed,
  writeDismissed,
} from "./announcements";
import {
  bottomChromeClear,
  bottomChromeClearPx,
  BOTTOM_CHROME_FALLBACK_H,
  LobbyAnnouncementCard,
} from "./LobbyAnnouncement";

// ---------------------------------------------------------------------------
// A stub platform. Only the shapes the lobby landing actually consumes; the
// announcement body is the real Go response envelope, keys included.
// ---------------------------------------------------------------------------

const V050 = {
  id: "an_050",
  title: "v0.5.0 開放測試",
  body: "歡迎回來！",
  createdAt: "2026-06-01T09:00:00Z",
};
const V0522 = {
  id: "an_0522",
  title: "v0.5.22 更新",
  body: "所有素材全部開放。\n\n火圈的燒灼聲終於停了。",
  createdAt: "2026-07-26T09:00:00Z",
};

/** URLs the stub platform was asked for during a test. */
let requested: string[] = [];
/** What GET /announcements answers with, per test. */
let feed: unknown = { announcements: [] };
/** When true the feed rejects, exactly as an unreachable platform would. */
let feedDown = false;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function stubFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  requested.push(url);
  if (url.endsWith("/api/v1/announcements")) {
    if (feedDown) throw new TypeError("Failed to fetch");
    return jsonResponse(feed);
  }
  if (url.endsWith("/auth/login")) {
    return jsonResponse({
      tokens: { accessToken: "at", refreshToken: "rt" },
      account: { id: "kid", username: "小明", mmr: 1000 },
    });
  }
  if (url.endsWith("/auth/me") || url.endsWith("/me")) {
    return jsonResponse({ account: { id: "kid", username: "小明", mmr: 1000 } });
  }
  if (url.includes("/friends")) return jsonResponse({ friends: [], incoming: [], outgoing: [] });
  if (url.includes("/rooms")) return jsonResponse({ rooms: [] });
  if (url.includes("/wallet")) return jsonResponse({ mcoin: 0, crystal: 0, ownedChampions: [], ownedSkins: [], equipped: {} });
  if (url.includes("/store/catalog")) return jsonResponse({ champions: [], skins: [] });
  if (url.includes("/leaderboard")) return jsonResponse({ rows: [], page: 1, pageSize: 20, total: 0 });
  // Everything else (ranking boards, content index, …) answers empty; every
  // caller of those is already fail-quiet, which is not what is under test.
  return jsonResponse({});
}

/** In-memory localStorage: dismissal has to survive a "reload" within a test. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/** The lobby WS is not under test; keep it from throwing on `new WebSocket`. */
class SilentWebSocket {
  static readonly OPEN = 1;
  readonly readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close(): void {}
  send(): void {}
}

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

const { appStore } = await import("./store");
const { LobbyScreen } = await import("./LobbyScreen");

/** The lobby as a player would see it, with tooltips stripped (a `title=` is
 *  not "seeing" it — on a phone hover does not exist at all). */
function lobbyMarkup(): string {
  return renderToStaticMarkup(createElement(LobbyScreen)).replace(/\stitle="[^"]*"/g, "");
}

beforeEach(() => {
  for (const k of ["fetch", "localStorage", "WebSocket", "location"]) saved[k] = g[k];
  requested = [];
  feed = { announcements: [] };
  feedDown = false;
  g.fetch = vi.fn(stubFetch);
  g.localStorage = memoryStorage();
  g.WebSocket = SilentWebSocket;
  g.location = { protocol: "http:", host: "localhost:39527" };
  appStore.setState({
    screen: "lobby",
    account: { id: "kid", username: "小明", mmr: 1000 } as never,
    room: null,
    match: null,
    announcement: null,
    announcementOpen: false,
    lastError: null,
  });
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) g[k] = v;
});

// ---------------------------------------------------------------------------
// 1. The wire contract, read defensively.
// ---------------------------------------------------------------------------

describe("public feed parsing (#259)", () => {
  it("reads the real Go envelope — {announcements:[{id,title,body,createdAt}]}", () => {
    cover("lobby-announcement-feed");
    const parsed = parseAnnouncementFeed({ announcements: [V0522] });
    expect(parsed).toEqual([V0522]);
  });

  it("an empty or absent feed is [] and never an exception", () => {
    cover("lobby-announcement-feed");
    expect(parseAnnouncementFeed({ announcements: [] })).toEqual([]);
    expect(parseAnnouncementFeed({})).toEqual([]);
    expect(parseAnnouncementFeed(null)).toEqual([]);
    expect(parseAnnouncementFeed("nope")).toEqual([]);
    expect(parseAnnouncementFeed({ announcements: {} })).toEqual([]);
  });

  it("drops unusable entries instead of rendering holes", () => {
    cover("lobby-announcement-feed");
    const parsed = parseAnnouncementFeed({
      announcements: [null, 7, { id: "x" }, { title: "no id" }, { id: "ok", title: "有標題" }, V0522],
    });
    expect(parsed.map((a) => a.id)).toEqual(["ok", "an_0522"]);
    // a title-only announcement is legal (the admin form allows an empty body)
    expect(parsed[0]?.body).toBe("");
  });

  it("picks the NEWEST regardless of the order the server sent them in", () => {
    cover("lobby-announcement-feed");
    expect(currentAnnouncement([V050, V0522])?.id).toBe("an_0522");
    expect(currentAnnouncement([V0522, V050])?.id).toBe("an_0522");
    expect(currentAnnouncement([])).toBeNull();
    // same-instant tie (the Go test clock really does mint these): deterministic
    const tie = [
      { ...V050, id: "b", createdAt: "2026-07-26T09:00:00Z" },
      { ...V050, id: "a", createdAt: "2026-07-26T09:00:00Z" },
    ];
    expect(currentAnnouncement(tie)?.id).toBe("b");
    expect(currentAnnouncement([...tie].reverse())?.id).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// 2. Legibility — what the operator types is what a player reads.
// ---------------------------------------------------------------------------

describe("announcement text rendering (#259)", () => {
  it("preserves the operator's line breaks (the admin form is a plain textarea)", () => {
    cover("lobby-announcement-readable");
    expect(announcementLines("一\n二\n三")).toEqual(["一", "二", "三"]);
    expect(announcementLines("一\r\n二")).toEqual(["一", "二"]);
  });

  it("keeps ONE blank line as a paragraph break and drops the rest", () => {
    cover("lobby-announcement-readable");
    expect(announcementLines("一\n\n\n\n二\n\n\n")).toEqual(["一", "", "二"]);
    expect(announcementLines("")).toEqual([]);
    expect(announcementLines("\n\n")).toEqual([]);
  });

  it("dates render identically in every timezone the family plays in", () => {
    cover("lobby-announcement-readable");
    expect(announcementDate("2026-07-26T23:30:00Z")).toBe("2026/07/26");
    expect(announcementDate("")).toBe("");
    expect(announcementDate("not a date")).toBe("");
  });

  it("operator text is ESCAPED, never executed", () => {
    cover("lobby-announcement-readable");
    const html = renderToStaticMarkup(
      createElement(LobbyAnnouncementCard, {
        announcement: { ...V0522, title: "<script>alert(1)</script>", body: "<b>粗體</b>" },
        onDismiss: () => {},
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>粗體</b>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ---------------------------------------------------------------------------
// 3. Chrome contracts — the popup must not cover the build stamp (#66/#107).
// ---------------------------------------------------------------------------

describe("announcement popup respects the persistent chrome (#66/#107)", () => {
  it("reserves a bottom band instead of covering the viewport edge", () => {
    cover("lobby-announcement-chrome");
    const html = renderToStaticMarkup(
      createElement(LobbyAnnouncementCard, { announcement: V0522, onDismiss: () => {} }),
    );
    // NOT `inset:0` / `bottom:0` — the build stamp lives in that strip and the
    // entire point of #66 is that a screenshot stays traceable.
    expect(html).toContain("position:fixed");
    expect(html).not.toMatch(/bottom:0[;"]/);
    expect(html).toContain("--ggd-chrome-bottom-h");
    expect(html).toContain("safe-area-inset-bottom");
  });

  it("the reserve is at least the badge's own height, published or not", () => {
    cover("lobby-announcement-chrome");
    // nobody publishes the variable today → the derived fallback applies
    expect(bottomChromeClearPx(null)).toBe(BOTTOM_CHROME_FALLBACK_H);
    // the badge is a single 10px line at bottom:2 — the fallback must clear it
    expect(BOTTOM_CHROME_FALLBACK_H).toBeGreaterThanOrEqual(12);
    // a phone's home indicator is added, not substituted for
    expect(bottomChromeClearPx(null, 34)).toBe(BOTTOM_CHROME_FALLBACK_H + 34);
    // and if the bottom chrome ever publishes a real height, it WINS
    expect(bottomChromeClearPx(40)).toBe(40);
    expect(bottomChromeClear()).toContain(`${BOTTOM_CHROME_FALLBACK_H}px`);
  });

  it("the card can shrink on a 390px-tall phone instead of overflowing (#151)", () => {
    cover("lobby-announcement-chrome");
    const html = renderToStaticMarkup(
      createElement(LobbyAnnouncementCard, { announcement: V0522, onDismiss: () => {} }),
    );
    // the body is its own scroll area, and `min-height:0` is what actually lets
    // a flex column shrink — without it the card grows past a short viewport
    expect(html).toContain("overflow-y:auto");
    expect(html).toContain("min-height:0");
    expect(html).toContain("max-height:100%");
  });
});

// ---------------------------------------------------------------------------
// 4. Dismissal bookkeeping.
// ---------------------------------------------------------------------------

describe("dismissal is per-announcement and bounded (#259)", () => {
  it("closing one announcement does not close the next one", () => {
    cover("lobby-announcement-dismiss");
    const dismissed = markDismissed([], V050.id);
    // dismissed: still KNOWN (so 📢 公告 can reopen it), just not interrupting
    expect(announcementView([V050], dismissed)).toEqual({ current: V050, open: false });
    // a newer one interrupts again
    expect(announcementView([V050, V0522], dismissed).open).toBe(true);
    expect(announcementView([V050, V0522], dismissed).current?.id).toBe("an_0522");
    // nothing published at all ⇒ the lobby has nothing extra to render
    expect(announcementView([], dismissed)).toEqual({ current: null, open: false });
  });

  it("the remembered list is de-duplicated and capped", () => {
    cover("lobby-announcement-dismiss");
    expect(markDismissed(["a", "b"], "a")).toEqual(["b", "a"]);
    let ids: string[] = [];
    for (let i = 0; i < DISMISS_CAP + 10; i++) ids = markDismissed(ids, `an_${i}`);
    expect(ids).toHaveLength(DISMISS_CAP);
    expect(ids[ids.length - 1]).toBe(`an_${DISMISS_CAP + 9}`);
  });

  it("storage that throws (Safari private mode) degrades to 'nothing dismissed'", () => {
    cover("lobby-announcement-dismiss");
    const hostile = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
    };
    expect(readDismissed(hostile)).toEqual([]);
    expect(() => writeDismissed(hostile, ["a"])).not.toThrow();
    expect(readDismissed(null)).toEqual([]);
    // corrupt values are survivable too
    const s = memoryStorage();
    s.setItem(DISMISSED_KEY, "{not json");
    expect(readDismissed(s)).toEqual([]);
    s.setItem(DISMISSED_KEY, JSON.stringify(["ok", 7, null]));
    expect(readDismissed(s)).toEqual(["ok"]);
  });
});

// ---------------------------------------------------------------------------
// 5. THE ONE THAT MATTERS — the real lobby, end to end.
// ---------------------------------------------------------------------------

describe("a player arriving in the lobby SEES the announcement (#259)", () => {
  it("lobby entry asks the platform for the public feed", async () => {
    cover("lobby-announcement-visible");
    feed = { announcements: [V0522] };
    await appStore.getState().doLogin("小明", "pw");
    // The exact defect this feature fixes: before this change, NOTHING in
    // apps/client ever requested this URL.
    expect(requested).toContain("/api/v1/announcements");
    expect(appStore.getState().announcement?.id).toBe("an_0522");
  });

  it("...and the REAL LobbyScreen paints the operator's words", async () => {
    cover("lobby-announcement-visible");
    feed = { announcements: [V050, V0522] };
    await appStore.getState().doLogin("小明", "pw");

    const html = lobbyMarkup();
    expect(html).toContain("v0.5.22 更新"); // the title
    expect(html).toContain("所有素材全部開放。"); // a body line
    expect(html).toContain("火圈的燒灼聲終於停了。"); // the line after a blank one
    expect(html).toContain("知道了"); // and a way out of it
    expect(html).toContain("2026/07/26");
    // the older one is not shown — a player meets the current announcement,
    // not an archive
    expect(html).not.toContain("v0.5.0 開放測試");
  });

  it("dismissing it sticks across a reload — it does not nag", async () => {
    cover("lobby-announcement-dismiss");
    feed = { announcements: [V0522] };
    await appStore.getState().doLogin("小明", "pw");
    expect(lobbyMarkup()).toContain("v0.5.22 更新");

    appStore.getState().dismissAnnouncement();
    expect(lobbyMarkup()).not.toContain("知道了");
    // but the text is recoverable: 📢 公告 stays in the header
    expect(lobbyMarkup()).toContain("📢 公告");
    appStore.getState().openAnnouncement();
    expect(lobbyMarkup()).toContain("v0.5.22 更新");
    appStore.getState().dismissAnnouncement();

    // "reload": fresh store state, same browser storage, same feed
    appStore.setState({ announcement: null, announcementOpen: false });
    await appStore.getState().refreshAnnouncement();
    expect(appStore.getState().announcementOpen).toBe(false);
    const reloaded = lobbyMarkup();
    expect(reloaded).not.toContain("v0.5.22 更新"); // it does not pop again
    // ...but it is still RECOVERABLE. Dismissing means "stop interrupting me",
    // not "destroy the text": the chip survives the reload, so a player who
    // closed the popup before reading it can still get back to it.
    expect(reloaded).toContain("📢 公告");
  });

  it("a SECOND, different announcement pops again", async () => {
    cover("lobby-announcement-dismiss");
    feed = { announcements: [V050] };
    await appStore.getState().doLogin("小明", "pw");
    expect(lobbyMarkup()).toContain("v0.5.0 開放測試");
    appStore.getState().dismissAnnouncement();
    expect(lobbyMarkup()).not.toContain("知道了");

    // the owner publishes the next one and ticks Active
    feed = { announcements: [V050, V0522] };
    await appStore.getState().refreshAnnouncement();

    const html = lobbyMarkup();
    expect(html).toContain("v0.5.22 更新");
    expect(html).toContain("知道了");
    expect(appStore.getState().announcementOpen).toBe(true);
  });

  it("an unreachable feed leaves the lobby EXACTLY as it is today", async () => {
    cover("lobby-announcement-failquiet");
    // baseline: a lobby that has no announcement at all
    await appStore.getState().doLogin("小明", "pw");
    const quiet = lobbyMarkup();

    feedDown = true;
    appStore.setState({ announcement: null, announcementOpen: false });
    await expect(appStore.getState().refreshAnnouncement()).resolves.toBeUndefined();

    expect(appStore.getState().announcement).toBeNull();
    // nothing shown, nothing broken, and NOT a word to the player about it
    expect(appStore.getState().lastError).toBeNull();
    expect(lobbyMarkup()).toBe(quiet);
  });

  it("a feed serving garbage is treated as an empty feed, not a crash", async () => {
    cover("lobby-announcement-failquiet");
    await appStore.getState().doLogin("小明", "pw");
    const quiet = lobbyMarkup();

    feed = { announcements: [{ nope: true }, "???"] };
    await appStore.getState().refreshAnnouncement();
    expect(appStore.getState().announcement).toBeNull();
    expect(lobbyMarkup()).toBe(quiet);
  });

  it("a lobby with no announcement grows no new controls", async () => {
    cover("lobby-announcement-failquiet");
    await appStore.getState().doLogin("小明", "pw");
    const html = lobbyMarkup();
    expect(html).not.toContain("📢");
    expect(html).not.toContain("最新公告");
    // and the rest of the lobby is untouched
    expect(html).toContain("一鍵開打");
  });
});

// ---------------------------------------------------------------------------
// 6. The projection is the SERVER's decision, not the client's.
// ---------------------------------------------------------------------------

describe("'active' is decided server-side (#259)", () => {
  it("the client has no active flag to get wrong", () => {
    cover("lobby-announcement-feed");
    // `PublicAnnouncement` in Go strips `active`/`updatedAt`; if a future
    // response carried them anyway, the client still must not start filtering
    // on its own — the feed IS the active set.
    const withExtras = parseAnnouncementFeed({
      announcements: [{ ...V0522, active: false, updatedAt: "2026-07-26T10:00:00Z" }],
    });
    expect(withExtras).toHaveLength(1);
    expect(announcementView(withExtras, []).current?.id).toBe("an_0522");
    expect(Object.keys(withExtras[0] ?? {}).sort()).toEqual(["body", "createdAt", "id", "title"]);
  });
});
