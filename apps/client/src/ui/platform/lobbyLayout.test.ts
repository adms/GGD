/**
 * @vitest-environment jsdom
 *
 * LOBBY LAYOUT GUARDS — GH#255 (排行榜移到朋友列表下半部) + GH#258 (單人 vs BOT
 * 變成 create room 底下預設的一個房間).
 *
 * ---- WHY THIS FILE MOUNTS THE REAL SCREEN ----------------------------------
 * Both requirements are about WHERE something is and WHAT PRESSING IT DOES, and
 * both have an obvious way to be tested into meaninglessness:
 *
 *  · 「排行榜在左排下半」 is not "LobbyScreen.tsx contains the string
 *    LeaderboardPanel". A source scan (failure form ⑥) passes just as happily
 *    when the ladder is back in a third column. So the assertions below walk the
 *    rendered element tree and ask the DOM which container the ladder's slot is
 *    actually inside, and read the slot's own resolved style for the split.
 *
 *  · 「按下去直接開打」 is not "some handler we wrote in the test calls
 *    playBotMatch" (failure form ⑤ — the thing tested is not the thing shipped).
 *    So the default room's button is CLICKED, through the shipped <Btn> (SFX
 *    wrapper included) and the shipped store action, and the assertion is on the
 *    platform call at the far end: POST /rooms/solo. The only seams are the
 *    network (`./api`) and the one-time content load — the two things a unit
 *    test may not really perform.
 *
 * ---- THE #200 FIX IS THE REASON THE CLICK TEST EXISTS ----------------------
 * `playBotMatch` awaits the one-time content load BEFORE the platform mints a
 * colyseus seat, because a seat minted during a cold download expires before the
 * client can consume it and bounces the player back to the lobby — the original
 * 「第一次按會彈回大廳」. Merging 一鍵開打 into the room list is exactly the kind
 * of change that quietly grows a second start path and drops that fix, so the
 * guard presses the merged entry and checks the seat is NOT requested until the
 * content gate resolves. botMatchPrime.test.ts owns the store-level proof; this
 * one owns "the button the owner asked for is wired to that same action".
 *
 * jsdom has no layout engine, so nothing here claims to have measured pixels.
 * What it reads is the layout MODEL the browser would lay out: containment in
 * the real element tree, and the flex sizing each slot declares. The two halves
 * are equal because they declare the same grow against `flex-basis: 0` inside
 * one column — that is the property a reviewer can check, and it is the one that
 * breaks if somebody re-splits the column 70/30 or moves a panel out.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cover } from "@ggd/shared/testkit/cover";

/** The platform seam. Everything else in ./api is stubbed so no test fetches. */
const startSoloMatch = vi.fn(async () => ({ matchId: "m_test", botFill: 11 }));

vi.mock("./api", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api")>();
  return {
    ...real,
    startSoloMatch,
    listOpenRooms: async () => ({ rooms: [] }),
    listFriends: async () => ({ friends: [], incoming: [], outgoing: [] }),
    leaderboard: async () => ({ rows: [], page: 1, pageSize: 20, total: 0 }),
    rankingMe: async () => null,
    playerBoard: async () => [],
    playerMe: async () => null,
    championBoard: async () => [],
    myChampions: async () => [],
  };
});

/** Hand-controlled stand-in for the one-time content load (same seam as #200). */
const gate = vi.hoisted(() => {
  let resolveFn: (() => void) | null = null;
  let promise!: Promise<{ ok: boolean; championCount: number }>;
  const arm = (): void => {
    promise = new Promise((res) => {
      resolveFn = () => res({ ok: true, championCount: 93 });
    });
  };
  arm();
  return { arm, promise: () => promise, resolve: (): void => resolveFn?.() };
});

vi.mock("../../content/bootContent", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../content/bootContent")>();
  return { ...real, ensureContentLoaded: () => gate.promise() };
});

const { appStore } = await import("./store");
const { LobbyScreen } = await import("./LobbyScreen");
const { RoomListPanel } = await import("./RoomListPanel");
const { ARENA_OPTIONS, DEFAULT_MAP_ID } = await import("./maps");
const {
  DEFAULT_LOBBY_LAYOUT,
  leftColumnSlotStyle,
  resolveLeftColumnMode,
} = await import("./lobbyLayout");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** Resize the jsdom window and let the resize listener re-resolve the mode. */
async function setViewport(width: number, height: number): Promise<void> {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
}

async function mountLobby(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LobbyScreen));
  });
}

/**
 * The `max-width` of the ranking.css media block that makes `.ggd-lobby-col`
 * full-width — READ OUT OF THE SHIPPED STYLESHEET, not retyped here.
 *
 * Comments are stripped first (the file talks about the lobby columns in prose,
 * and prose must not be able to satisfy a structural assertion), then each
 * `@media (max-width: Npx)` block's body is brace-matched and searched for a
 * `.ggd-lobby-col` SELECTOR. Exactly one block must claim it: two would mean the
 * breakpoint this policy mirrors is ambiguous, and zero means the stylesheet no
 * longer stacks the columns at all — in which case `stackBelowWidthPx` is
 * mirroring nothing and the reader deserves a failure, not a green tick.
 */
function lobbyColStackBreakpointFromStylesheet(): number {
  // `__dirname`, not `new URL(..., import.meta.url)`: under the jsdom
  // environment vite-node hands modules an http: url and readFileSync rejects
  // it ("The URL must be of scheme file"). ranking.test.ts reads the same
  // stylesheet the same way.
  const css = readFileSync(join(__dirname, "ranking.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const opener = /@media[^{]*\(\s*max-width:\s*(\d+)px\s*\)[^{]*\{/g;
  const found: number[] = [];
  for (let m = opener.exec(css); m !== null; m = opener.exec(css)) {
    let depth = 1;
    let i = opener.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    // `.ggd-lobby-col` followed by `{` or `,` = it is a selector in this block,
    // not a substring of some longer class name.
    if (/\.ggd-lobby-col\s*[,{]/.test(css.slice(opener.lastIndex, i - 1))) found.push(Number(m[1]));
  }
  expect(found.length).toBe(1);
  return found[0]!;
}

/** The one element carrying `data-ggd-lobby-slot="<name>"`. */
function slot(name: "friends" | "leaderboard"): HTMLElement {
  const found = container.querySelectorAll<HTMLElement>(`[data-ggd-lobby-slot="${name}"]`);
  expect(found.length).toBe(1); // exactly one home for each panel
  return found[0]!;
}

beforeEach(async () => {
  gate.arm();
  startSoloMatch.mockClear();
  appStore.setState({
    screen: "lobby",
    lobbyView: "play",
    account: { id: "me", username: "owner", mmr: 1000 } as never,
    room: null,
    rooms: [],
    match: null,
    botMatchBusy: false,
    lastError: null,
  });
  await setViewport(1440, 900); // desktop before every mount
  await mountLobby();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("lobby left column — 朋友列表 上半 / 排行榜 下半 (GH#255)", () => {
  it("puts BOTH panels in the left column, and nowhere else", () => {
    cover("lobby-left-column-split");
    const left = container.querySelector<HTMLElement>("[data-ggd-lobby-left]");
    expect(left).not.toBeNull();

    // Containment read off the real tree: the ladder is a descendant of the
    // LEFT column. Moving it back to a column of its own fails here.
    expect(left!.contains(slot("friends"))).toBe(true);
    expect(left!.contains(slot("leaderboard"))).toBe(true);

    // …and it really is the ladder, not an empty slot: the panel's own heading
    // ("排位榜…") renders inside it.
    expect(slot("leaderboard").textContent ?? "").toContain("排位榜");
    expect(slot("friends").textContent ?? "").toContain("Friends");

    // 上半 / 下半 — friends comes FIRST in document order inside the column.
    const order = [...left!.querySelectorAll<HTMLElement>("[data-ggd-lobby-slot]")].map(
      (el) => el.dataset["ggdLobbySlot"],
    );
    expect(order).toEqual(["friends", "leaderboard"]);
  });

  it("splits the column into equal halves that each scroll on their own", () => {
    cover("lobby-left-column-split");
    const f = slot("friends").style;
    const l = slot("leaderboard").style;

    // 各半: same grow against a zero basis inside one flex column ⇒ equal
    // heights whatever the column measures. This is the assertion that fails
    // if somebody re-weights the split.
    expect(f.flexGrow).toBe(l.flexGrow);
    expect(f.flexBasis).toBe("0px");
    expect(l.flexBasis).toBe("0px");
    expect(Number(f.flexGrow)).toBeCloseTo(DEFAULT_LOBBY_LAYOUT.friendsShare, 5);

    // 各自內部捲動 + never widen the page (both halves of the ask).
    for (const s of [f, l]) {
      expect(s.overflowY).toBe("auto");
      expect(s.overflowX).toBe("hidden");
      expect(s.minHeight).toBe("0px"); // or the panels' own min-heights push out
      expect(s.minWidth).toBe("0px");
    }
  });

  it("stops splitting when a half would be unreadable (#151 phone landscape)", async () => {
    cover("lobby-left-column-split");
    // iPhone in landscape: 844 wide clears ranking.css's 720px stack rule, so
    // WITHOUT this policy the column would still be halved — into two ~170px
    // slivers. The policy stacks instead and gives each panel a floor.
    await setViewport(844, 390);
    for (const name of ["friends", "leaderboard"] as const) {
      const s = slot(name).style;
      expect(s.flexGrow).toBe("0");
      expect(s.minHeight).toBe(`${DEFAULT_LOBBY_LAYOUT.minSlotHeightPx}px`);
    }

    // …and it goes back when there is room again, so a rotated phone or a
    // resized desktop window is not stranded in the fallback.
    await setViewport(1440, 900);
    expect(slot("friends").style.flexGrow).toBe(String(DEFAULT_LOBBY_LAYOUT.friendsShare));
  });

  it("the rendered slots are the policy's output, not hand-written literals", () => {
    cover("lobby-left-column-split");
    // Ties the screen to the module: if the JSX ever stops calling the policy,
    // the phone branch above silently dies while everything still looks right
    // on a desktop (failure form ③ — deletable without turning anything red).
    for (const name of ["friends", "leaderboard"] as const) {
      const expected = leftColumnSlotStyle(name, "split", DEFAULT_LOBBY_LAYOUT);
      const s = slot(name).style;
      expect(Number(s.flexGrow)).toBeCloseTo(Number(expected.flexGrow), 5);
      expect(s.overflowY).toBe(expected.overflowY);
    }
  });
});

describe("left-column split policy (pure)", () => {
  it("splits on a desktop, stacks on a short or narrow viewport", () => {
    cover("lobby-left-column-split");
    expect(resolveLeftColumnMode({ width: 1440, height: 900 })).toBe("split");
    expect(resolveLeftColumnMode({ width: 844, height: 390 })).toBe("stack"); // iPhone landscape
    expect(resolveLeftColumnMode({ width: 390, height: 844 })).toBe("stack"); // iPhone portrait
    expect(resolveLeftColumnMode({ width: 1024, height: 768 })).toBe("split"); // iPad landscape
    // No window at all (SSR / node tests) → the owner's layout, not the phone one.
    expect(resolveLeftColumnMode(null)).toBe("split");
  });

  it("keeps its own stack width in step with ranking.css's column breakpoint", () => {
    cover("lobby-left-column-split");
    // ranking.css already makes .ggd-lobby-col full-width below its breakpoint;
    // halving a full-width band by height there is meaningless, so this policy's
    // number has to BE that breakpoint.
    //
    // ⚠️ This assertion used to be `expect(...stackBelowWidthPx).toBe(720)` —
    // a literal against a literal, which is no guard at all: the reviewer
    // changed the stylesheet to 640 and it stayed green. It now reads the real
    // breakpoint out of the shipped stylesheet, so moving EITHER number alone
    // is red. (Mutation-verified: ranking.css 720 → 640 fails this test with
    // `expected 640 to be 720`.)
    const bp = lobbyColStackBreakpointFromStylesheet();
    expect(bp).toBe(DEFAULT_LOBBY_LAYOUT.stackBelowWidthPx);

    // …and the policy actually switches AT that width, so the two are tied by
    // behaviour and not merely by being the same integer.
    //
    // KNOWN 1px OVERLAP, recorded rather than papered over: CSS `max-width: N`
    // matches width ≤ N, while this policy stacks at width < N. So at EXACTLY
    // 720px the columns are already full-width while the left column still
    // splits by height. Nothing breaks there (a full-width band split into two
    // scrolling halves is ugly, not broken), and closing it would mean changing
    // shipped behaviour, which is not what this repair is for — but the next
    // reader should know the boundary below is the current behaviour and not a
    // proof that the two rules agree on every integer.
    expect(resolveLeftColumnMode({ width: bp - 1, height: 900 })).toBe("stack");
    expect(resolveLeftColumnMode({ width: bp, height: 900 })).toBe("split");
  });
});

describe("單人 vs BOT is the room browser's default room (GH#258)", () => {
  it("lives INSIDE the rooms list, under 「Create room」 — not as a separate strip", () => {
    cover("lobby-default-room-merge");
    const card = container.querySelector<HTMLElement>("[data-ggd-default-room]");
    expect(card).not.toBeNull();
    const list = container.querySelector<HTMLElement>("[data-ggd-room-list]");
    expect(list).not.toBeNull();
    // The merge, read off the tree: the entry is a child of the room list, and
    // the room list is inside the panel whose header button is Create room.
    expect(list!.contains(card!)).toBe(true);
    expect(card!.textContent ?? "").toContain("單人 vs BOT");
    expect(card!.textContent ?? "").toContain("預設房間");

    // It is the FIRST entry — a default room buried under six open rooms is not
    // the thing the owner asked for.
    expect(list!.firstElementChild).toBe(card);
  });

  it("pressing it goes through the SHIPPED bot-match path (POST /rooms/solo)", async () => {
    cover("lobby-default-room-merge");
    const card = container.querySelector<HTMLElement>("[data-ggd-default-room]")!;
    const play = [...card.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("一鍵開打"),
    );
    expect(play).toBeDefined();

    await act(async () => {
      play!.click();
    });
    // #200: the seat is NOT minted while the one-time content load is pending —
    // the merged entry inherits the fix because it presses the same action.
    expect(startSoloMatch).not.toHaveBeenCalled();
    expect(appStore.getState().botMatchBusy).toBe(true);
    expect(appStore.getState().screen).toBe("lobby");

    await act(async () => {
      gate.resolve();
      await Promise.resolve();
    });
    // Only now, and with the arena the card's own selector is showing.
    expect(startSoloMatch).toHaveBeenCalledWith({ mapId: DEFAULT_MAP_ID });
  });

  it("sends the arena the player PICKED on the card, not the default", async () => {
    cover("lobby-default-room-merge");
    // The test above never touches the <select>, so it passes just as happily
    // against `mapId={DEFAULT_MAP_ID}` hard-coded into the JSX — failure form
    // ④, an assertion unrelated to the claim 「帶著卡片自己的 arena」. This one
    // changes the selection first, so the wire from the card's own dropdown
    // through the store to POST /rooms/solo is what is being read.
    const card = container.querySelector<HTMLElement>("[data-ggd-default-room]")!;
    const arena = card.querySelector<HTMLSelectElement>("select")!;

    // A real, non-default option — and it must genuinely differ, or the
    // assertion below would be satisfied by the bug it is hunting.
    const picked = ARENA_OPTIONS.map((a) => a.id).find((id) => id !== DEFAULT_MAP_ID)!;
    expect(picked).not.toBe(DEFAULT_MAP_ID);
    expect(arena.value).toBe(DEFAULT_MAP_ID); // the card opens on the default

    await act(async () => {
      arena.value = picked;
      arena.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(arena.value).toBe(picked); // React kept the choice (controlled input)

    const play = [...card.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("一鍵開打"),
    )!;
    await act(async () => {
      play.click();
    });
    await act(async () => {
      gate.resolve();
      await Promise.resolve();
    });
    expect(startSoloMatch).toHaveBeenCalledWith({ mapId: picked });
  });

  it("`pinned` is purely additive — a caller that passes nothing still renders", async () => {
    cover("lobby-default-room-merge");
    // GH#258 grew a new prop on a component that is rendered from exactly one
    // place today. The cheap way to break it is to start treating `pinned` as
    // present — an early return, a wrapper that assumes a child, a required
    // type. Nothing else in the tree would notice, because nothing else in the
    // tree calls RoomListPanel WITHOUT it. So this mounts the shipped component
    // with NO props at all and reads the browser back off the DOM.
    const solo = document.createElement("div");
    document.body.appendChild(solo);
    const soloRoot = createRoot(solo);
    try {
      await act(async () => {
        soloRoot.render(createElement(RoomListPanel));
      });
      // the browser is fully there…
      const list = solo.querySelector<HTMLElement>("[data-ggd-room-list]");
      expect(list).not.toBeNull();
      expect(solo.textContent ?? "").toContain("Create room");
      expect(solo.textContent ?? "").toContain("No open rooms");
      // …and nothing invented a default room out of thin air.
      expect(solo.querySelector("[data-ggd-default-room]")).toBeNull();
    } finally {
      await act(async () => {
        soloRoot.unmount();
      });
      solo.remove();
    }
  });

  it("the merged entry reports the shipped busy state, so it cannot be a stub", async () => {
    cover("lobby-default-room-merge");
    // A hand-rolled local handler would not know about `botMatchBusy`; this card
    // is driven by the same store slice the real flow writes.
    await act(async () => {
      appStore.setState({ botMatchBusy: true });
    });
    const card = container.querySelector<HTMLElement>("[data-ggd-default-room]")!;
    expect(card.textContent ?? "").toContain("開房中…");
  });
});
