/**
 * @vitest-environment jsdom
 *
 * 線上玩家 GUARDS — owner 2026-08-03:「多出一個區域顯示所有大廳正在線上的玩家
 * 列表，並且名字旁邊有按鈕可以一鍵加入朋友」.
 *
 * ---- WHY NOTHING HERE ASSERTS "THE BUTTON EXISTS" ---------------------------
 * 「有按鈕可以一鍵加入朋友」 is a claim about what PRESSING it does. A test that
 * counts buttons passes on a panel whose buttons are decorative — CLAUDE.md
 * failure form ⑦ (掃屬性代替掃行為). So the assertions below CLICK the shipped
 * <Btn> inside the shipped panel and read the REQUEST THAT LEAVES THE PROCESS:
 * `fetch` is the seam, so what is checked is the method, the URL and the JSON
 * body the platform would actually receive.
 *
 * That also closes failure form ⑤ (被測的不是出貨的那個): nothing here
 * re-implements the call. `OnlinePlayersPanel` → `./onlinePlayers` → the app's
 * real `ApiClient` → `fetch` is the whole shipped chain, and only the last link
 * is replaced.
 *
 * ---- THE INERT CASE IS THE ONE THAT MATTERS ---------------------------------
 * 「已經是朋友的人按不下去」 cannot be shown by a `disabled` attribute either: an
 * attribute is a property, and React re-renders can drop one. So the friend row
 * is CLICKED and the assertion is that the wire stayed silent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cover } from "@ggd/shared/testkit/cover";

const { OnlinePlayersPanel } = await import("./OnlinePlayersPanel");
const { addButtonFor, visibleRows } = await import("./onlinePlayers");
const { DEFAULT_LOBBY_LAYOUT } = await import("./lobbyLayout");
const { api } = await import("./api");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAG = "lobby-online-players";

interface Sent {
  method: string;
  url: string;
  body: unknown;
}

let container: HTMLDivElement;
let root: Root;
let sent: Sent[];
let roster: { players: unknown[]; total: number; truncated: boolean };
let realFetch: typeof globalThis.fetch;

/** A row as the platform reports it (apps/platform/internal/friend/online.go). */
function player(id: string, username: string, relation: string, state = "in-lobby"): unknown {
  return { id, username, state, relation };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Every request the panel made to a path, in order. */
function requestsTo(path: string): Sent[] {
  return sent.filter((s) => s.url.endsWith(path));
}

/** The button in the row for `id`. */
function rowButton(id: string): HTMLButtonElement {
  const row = container.querySelector<HTMLElement>(`[data-ggd-online-row="${id}"]`);
  expect(row, `no row rendered for ${id}`).not.toBeNull();
  const btn = row!.querySelector("button");
  expect(btn).not.toBeNull();
  return btn as HTMLButtonElement;
}

async function mountPanel(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(OnlinePlayersPanel));
  });
  // let the initial GET settle
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  sent = [];
  roster = { players: [], total: 0, truncated: false };
  // A live session, so the client attaches a Bearer header exactly as it would
  // in the lobby (and so a 401-retry path cannot be what we accidentally test).
  api.setTokens({ accessToken: "test-access", refreshToken: "test-refresh", expiresIn: 900 });
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    sent.push({ method, url, body });
    if (url.endsWith("/lobby/online")) return jsonResponse(roster);
    if (url.endsWith("/friends/requests")) return jsonResponse({ status: "ok" });
    return new Response("{}", { status: 404 });
  }) as typeof globalThis.fetch;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
  globalThis.fetch = realFetch;
  api.setTokens(null);
  vi.useRealTimers();
});

describe("線上玩家 — the roster the panel actually fetches", () => {
  it("asks the platform for the lobby roster and renders every row it gets", async () => {
    cover(TAG);
    roster = {
      players: [player("acc_b", "bob", "none"), player("acc_c", "carol", "friend", "in-match")],
      total: 2,
      truncated: false,
    };
    await mountPanel();

    // The endpoint, on the wire — not "some function was called".
    const gets = requestsTo("/lobby/online");
    expect(gets).toHaveLength(1);
    expect(gets[0]!.method).toBe("GET");
    expect(gets[0]!.url).toContain("/api/v1/lobby/online");

    expect(container.textContent ?? "").toContain("bob");
    expect(container.textContent ?? "").toContain("carol");
  });

  it("with no session it asks NOTHING, and still does not claim the lobby is empty", async () => {
    cover(TAG);
    api.setTokens(null);
    await mountPanel();
    // A 401 the panel could have predicted is not worth a round trip…
    expect(requestsTo("/lobby/online")).toHaveLength(0);
    // …but skipping the call must not turn into 「沒有人在線上」.
    expect(container.querySelector("[data-ggd-online-error]")).not.toBeNull();
    expect(container.textContent ?? "").not.toContain("目前沒有其他玩家在線上");
  });

  it("a roster it cannot read says so — it does not render 「沒有人在線上」", async () => {
    cover(TAG);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: "internal" } }), {
        status: 500,
      })) as typeof globalThis.fetch;
    await mountPanel();
    // 「沒有人在線上」 and 「我讀不到誰在線上」 are different facts and only one of
    // them is a reason to stop waiting for a game.
    expect(container.querySelector("[data-ggd-online-error]")).not.toBeNull();
    expect(container.textContent ?? "").not.toContain("目前沒有其他玩家在線上");
  });
});

describe("一鍵加入朋友 — what pressing the button DOES", () => {
  it("sends POST /friends/requests with that row's accountId", async () => {
    cover(TAG);
    roster = { players: [player("acc_b", "bob", "none")], total: 1, truncated: false };
    await mountPanel();

    await act(async () => {
      rowButton("acc_b").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const posts = requestsTo("/friends/requests");
    expect(posts, "pressing 加好友 must reach the platform").toHaveLength(1);
    expect(posts[0]!.method).toBe("POST");
    // BY ID, not by the displayed name: two accounts can look identical to the
    // eye and 「一鍵」 must not befriend the wrong one.
    expect(posts[0]!.body).toEqual({ accountId: "acc_b" });
  });

  it("re-reads the roster after a successful add, so the row updates itself", async () => {
    cover(TAG);
    roster = { players: [player("acc_b", "bob", "none")], total: 1, truncated: false };
    await mountPanel();
    expect(requestsTo("/lobby/online")).toHaveLength(1);

    await act(async () => {
      rowButton("acc_b").click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(requestsTo("/lobby/online").length).toBeGreaterThan(1);
  });

  it("an ALREADY-FRIEND row is inert: clicking it sends nothing", async () => {
    cover(TAG);
    roster = { players: [player("acc_c", "carol", "friend")], total: 1, truncated: false };
    await mountPanel();

    const btn = rowButton("acc_c");
    expect(btn.textContent ?? "").toContain("已加入");

    await act(async () => {
      btn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // THE assertion: the wire stayed silent. `disabled` being set is a property;
    // this is the behaviour.
    expect(requestsTo("/friends/requests")).toHaveLength(0);
  });

  it("a row I already asked is inert too — no double request", async () => {
    cover(TAG);
    roster = { players: [player("acc_b", "bob", "none")], total: 1, truncated: false };
    await mountPanel();

    await act(async () => {
      rowButton("acc_b").click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Second press, same row, before any poll could have refreshed `relation`.
    await act(async () => {
      rowButton("acc_b").click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(requestsTo("/friends/requests")).toHaveLength(1);
  });
});

describe("已經是朋友的人怎麼顯示 — the policy field, both branches", () => {
  it("ships as 「按鈕變灰底 + 留在列表上」 (owner's default)", async () => {
    cover(TAG);
    expect(DEFAULT_LOBBY_LAYOUT.alreadyFriendMode).toBe("greyed-button");
    roster = {
      players: [player("acc_c", "carol", "friend"), player("acc_b", "bob", "none")],
      total: 2,
      truncated: false,
    };
    await mountPanel();
    // owner's reason, asserted: a friend who VANISHES from 線上玩家 looks
    // exactly like a friend who went offline.
    expect(container.querySelector('[data-ggd-online-row="acc_c"]')).not.toBeNull();
    expect(container.textContent ?? "").toContain("carol");
  });

  it("the other branch really is a different list (so the field is not decorative)", () => {
    cover(TAG);
    const rows = [player("acc_c", "carol", "friend"), player("acc_b", "bob", "none")] as never;
    expect(visibleRows(rows, "greyed-button")).toHaveLength(2);
    expect(visibleRows(rows, "hide-row")).toHaveLength(1);
    expect(visibleRows(rows, "hide-row")[0]!.username).toBe("bob");
  });

  it("every relation the platform can report has a defined button", () => {
    cover(TAG);
    // The four values friend/online.go can put on the wire. A relation with no
    // case here would render a live 加好友 on somebody it should not.
    const p = (relation: string): never => player("x", "x", relation) as never;
    expect(addButtonFor(p("none")).inert).toBe(false);
    expect(addButtonFor(p("friend")).inert).toBe(true);
    expect(addButtonFor(p("outgoing")).inert).toBe(true);
    expect(addButtonFor(p("incoming")).inert).toBe(true);
    // …and the local optimistic set makes an otherwise-live button inert.
    expect(addButtonFor(p("none"), new Set(["x"])).inert).toBe(true);
  });
});
