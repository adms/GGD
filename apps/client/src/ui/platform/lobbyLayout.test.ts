/**
 * @vitest-environment jsdom
 *
 * LOBBY LAYOUT GUARDS — GH#255 (排行榜移到朋友列表下半部), the 2026-08-03
 * 線上玩家 panel wedged between them, and GH#258 (單人 vs BOT 變成 create room
 * 底下預設的一個房間).
 *
 * ---- 2026-08-03: THE COLUMN WENT FROM TWO SLOTS TO THREE --------------------
 * owner:「大廳 FRIEND 跟排位榜 中間，多出一個區域顯示所有大廳正在線上的玩家列表」.
 * The 「各半」 assertions below USED to read `f.flexGrow === l.flexGrow`, which
 * is the right guard for two equal halves and exactly the wrong one for three
 * unequal thirds — it would have gone green on a column that dropped the middle
 * panel entirely. They now parse all three slots' declared shares off the DOM
 * and check the set: three slots, in the owner's order, summing to 100%.
 * (Mutation-verified: deleting the `online` slot from LobbyScreen.tsx fails
 * both 「三段」 tests.)
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

/**
 * The 線上玩家 panel's own network seam. ONLY the two request functions are
 * replaced — `visibleRows` / `addButtonFor` stay real, so the slot this file
 * asserts about still renders through the shipped decision code. The roster's
 * own behaviour (what pressing 加好友 does) is guarded in onlinePlayers.test.ts.
 */
vi.mock("./onlinePlayers", async (importOriginal) => {
  const real = await importOriginal<typeof import("./onlinePlayers")>();
  return {
    ...real,
    listOnlinePlayers: async () => ({ players: [], total: 0, truncated: false }),
    addFriendById: async () => ({ status: "ok" }),
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
  LOBBY_LAYOUT_BOUNDS,
  leftColumnSlots,
  leftColumnSlotStyle,
  lobbyLayoutProblems,
  resolveLeftColumnMode,
} = await import("./lobbyLayout");
type Slot = "friends" | "online" | "leaderboard";

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
function slot(name: Slot): HTMLElement {
  const found = container.querySelectorAll<HTMLElement>(`[data-ggd-lobby-slot="${name}"]`);
  expect(found.length).toBe(1); // exactly one home for each panel
  return found[0]!;
}

/** Slot names in DOM order inside the left column. */
function renderedOrder(): string[] {
  const left = container.querySelector<HTMLElement>("[data-ggd-lobby-left]")!;
  return [...left.querySelectorAll<HTMLElement>("[data-ggd-lobby-slot]")].map(
    (el) => el.dataset["ggdLobbySlot"]!,
  );
}

/**
 * The share each rendered slot DECLARES, parsed back off the DOM in document
 * order. This is the reading the browser would lay out: three `flex-grow`
 * values against `flex-basis: 0` inside one flex column ARE the three
 * percentages of the column's height.
 */
function renderedShares(): number[] {
  const left = container.querySelector<HTMLElement>("[data-ggd-lobby-left]")!;
  return [...left.querySelectorAll<HTMLElement>("[data-ggd-lobby-slot]")].map((el) =>
    Number(el.style.flexGrow),
  );
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

describe("lobby left column — 朋友列表 / 線上玩家 / 排位榜, three segments", () => {
  it("puts ALL THREE panels in the left column, in the owner's order", () => {
    cover("lobby-left-column-split");
    const left = container.querySelector<HTMLElement>("[data-ggd-lobby-left]");
    expect(left).not.toBeNull();

    // Containment read off the real tree: each panel is a descendant of the
    // LEFT column. Moving the ladder back to a column of its own fails here.
    for (const name of ["friends", "online", "leaderboard"] as const) {
      expect(left!.contains(slot(name))).toBe(true);
    }

    // …and they really are the panels, not empty slots: each renders its own
    // heading. 線上玩家 is checked the same way as the other two — a slot that
    // exists but renders nothing is precisely the shape of failure form ③.
    expect(slot("leaderboard").textContent ?? "").toContain("排位榜");
    expect(slot("friends").textContent ?? "").toContain("Friends");
    expect(slot("online").textContent ?? "").toContain("線上玩家");

    // owner:「FRIEND 跟排位榜 中間」 — 線上玩家 is BETWEEN them, in document
    // order, not merely present somewhere in the column.
    expect(renderedOrder()).toEqual(["friends", "online", "leaderboard"]);
  });

  it("divides the column into three shares that add up to 100%", () => {
    cover("lobby-left-column-split");
    const shares = renderedShares();

    // 三段, not two and not four. The old two-panel version of this test read
    // `friends.flexGrow === leaderboard.flexGrow`, which stays green on a
    // column that lost the middle panel — this one cannot.
    expect(shares).toHaveLength(3);
    // Every share is a real slice of the column…
    for (const s of shares) expect(s).toBeGreaterThan(0);
    // …and together they are the whole column: the numbers in the policy are
    // PERCENTAGES, and flexbox would happily lay out 0.5/0.5/0.5 while the
    // document claimed 50/50/50.
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    // ⚠️ 這裡原本寫死 `[0.4, 0.3, 0.3]` 並附註「朋友最常用給最大，biggest first」。
    // 兩件事在 2026-08-04 都失效了：owner 把比例改成 **3:2:5**（排位榜最大），
    // 所以「最大的在最前面」也不再成立。CLAUDE.md 第二守則：**守衛驗機制，不驗數字**。
    // 數字是 owner 會反覆調的東西，抄進斷言就是第四個住處（content/config + Zod
    // DEFAULT + 客戶端常數之外），而第四個沒有 drift 守衛 —— 必過期，而且紅的時候
    // 說的是與真相無關的話。
    //
    // 真正該守的機制是「**畫面上的比例 == 政策裡的比例**」，那個由下面這一行守：
    expect(shares).toEqual([
      DEFAULT_LOBBY_LAYOUT.friendsShare,
      DEFAULT_LOBBY_LAYOUT.onlineShare,
      DEFAULT_LOBBY_LAYOUT.leaderboardShare,
    ]);
    // 每一段都要是「看得到的一塊」而不是被壓成一條線 —— 這是上下界在守的東西，
    // 這裡再確認一次它真的到了畫面上。
    for (const s of shares) expect(s).toBeGreaterThanOrEqual(LOBBY_LAYOUT_BOUNDS.friendsShare.min);

    // 各自內部捲動 + never widen the page (both halves of the original ask).
    for (const name of ["friends", "online", "leaderboard"] as const) {
      const s = slot(name).style;
      expect(s.flexBasis).toBe("0px");
      expect(s.overflowY).toBe("auto");
      expect(s.overflowX).toBe("hidden");
      expect(s.minHeight).toBe("0px"); // or the panels' own min-heights push out
      expect(s.minWidth).toBe("0px");
    }
  });

  it("the shipped policy is self-consistent (sum, bounds, stack order)", () => {
    cover("lobby-left-column-split");
    // The same contract stated against the POLICY rather than the DOM, so a
    // future edit to the numbers is caught even before anything renders — and
    // this is the check whose bounds the Zod document will mirror.
    expect(lobbyLayoutProblems(DEFAULT_LOBBY_LAYOUT)).toEqual([]);
    // Reverse control: the checker is not a function that always returns [].
    expect(
      lobbyLayoutProblems({ ...DEFAULT_LOBBY_LAYOUT, onlineShare: 0.5 }).join(" "),
    ).toContain("100%");
  });

  it("stops splitting when a slice would be unreadable (#151 phone landscape)", async () => {
    cover("lobby-left-column-split");
    // iPhone in landscape: 844 wide clears ranking.css's 720px stack rule, so
    // WITHOUT this policy the column would still be divided — now into THREE
    // ~110px slivers, worse than the two ~170px ones this threshold was
    // originally chosen for. The policy stacks instead and gives each panel a
    // floor.
    await setViewport(844, 390);
    for (const name of ["friends", "online", "leaderboard"] as const) {
      const s = slot(name).style;
      expect(s.flexGrow).toBe("0");
      expect(s.minHeight).toBe(`${DEFAULT_LOBBY_LAYOUT.minSlotHeightPx}px`);
    }
    // All three survive the stack — stacking must not be a way to lose a panel.
    expect(renderedOrder()).toEqual([...DEFAULT_LOBBY_LAYOUT.stackOrder]);

    // …and it goes back when there is room again, so a rotated phone or a
    // resized desktop window is not stranded in the fallback.
    await setViewport(1440, 900);
    // 同上：從政策推導，不抄字面值（owner 2026-08-04 把比例改成 3:2:5）。
    expect(renderedShares()).toEqual([
      DEFAULT_LOBBY_LAYOUT.friendsShare,
      DEFAULT_LOBBY_LAYOUT.onlineShare,
      DEFAULT_LOBBY_LAYOUT.leaderboardShare,
    ]);
  });

  it("the rendered slots are the policy's output, not hand-written literals", () => {
    cover("lobby-left-column-split");
    // Ties the screen to the module: if the JSX ever stops calling the policy,
    // the phone branch above silently dies while everything still looks right
    // on a desktop (failure form ③ — deletable without turning anything red).
    for (const name of ["friends", "online", "leaderboard"] as const) {
      const expected = leftColumnSlotStyle(name, "split", DEFAULT_LOBBY_LAYOUT);
      const s = slot(name).style;
      expect(Number(s.flexGrow)).toBeCloseTo(Number(expected.flexGrow), 5);
      expect(s.overflowY).toBe(expected.overflowY);
    }
    // …and the ORDER comes from the module too, in both modes.
    expect(renderedOrder()).toEqual(leftColumnSlots("split", DEFAULT_LOBBY_LAYOUT));
  });
});

describe("stack order is read from the policy, not from the JSX", () => {
  it("a re-ordered policy re-orders the column (and a broken one does not lose a panel)", () => {
    cover("lobby-left-column-split");
    // The shipped stackOrder happens to EQUAL the desktop order, so asserting
    // the rendered phone order against the shipped values proves nothing about
    // where that order came from (failure form ④). Scramble the policy and
    // watch the pure function follow it.
    const scrambled = {
      ...DEFAULT_LOBBY_LAYOUT,
      stackOrder: ["leaderboard", "friends", "online"] as Slot[],
    };
    expect(leftColumnSlots("stack", scrambled)).toEqual(["leaderboard", "friends", "online"]);
    // Split is deliberately NOT configurable — the owner placed 線上玩家
    // between the two by name.
    expect(leftColumnSlots("split", scrambled)).toEqual(["friends", "online", "leaderboard"]);

    // A hand-edited policy that drops a panel falls back to all three rather
    // than rendering a lobby with no friends list, and says so out loud.
    const broken = { ...DEFAULT_LOBBY_LAYOUT, stackOrder: ["friends", "friends"] as Slot[] };
    expect(leftColumnSlots("stack", broken)).toEqual(["friends", "online", "leaderboard"]);
    expect(lobbyLayoutProblems(broken).join(" ")).toContain("stackOrder");
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
