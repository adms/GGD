/**
 * 大廳公告 — the client half of the operator announcement feed (task #259).
 *
 * ---- WHY THIS FILE EXISTS AT ALL -------------------------------------------
 * The platform has shipped `GET /api/v1/announcements` since the admin console
 * grew its authoring form: `internal/admin/announcements.go` stores them,
 * `PublicFeed` projects the ACTIVE ones, and `handlers.go:62 MountPublic`
 * mounts the route on the UNAUTHENTICATED router. The admin type's own comment
 * says "Active announcements are exposed to all clients via the public feed".
 *
 * Nothing in apps/client ever called it. `grep -rl announcement apps/client/src`
 * returned two files, both the in-combat cast announcer — an unrelated system.
 * So the owner wrote release notes, ticked 「Active (shown to players)」, and his
 * family saw nothing: the only surface those words ever reached was a GitHub
 * release page they do not read. That is failure shape **S6** in
 * docs/_false-completions.md — "後端做完、前端沒有入口". ⚠️ An all-route
 * reader-reconciliation guard does NOT exist yet (the once-named
 * publicFeedReaders.test.ts never landed — GH#706); today's only guards are
 * the two in ./announcements.test.ts (the URL really gets requested, and the
 * real LobbyScreen renders the text).
 *
 * ---- THE CONTRACT, AS READ OUT OF THE GO SOURCE (not assumed) --------------
 *   GET /api/v1/announcements                (no Authorization header needed —
 *     registered on the public router, above `pr.Use(s.Auth.Middleware)`)
 *   200 {"announcements": [{id, title, body, createdAt}, ...]}
 *
 *   • `PublicAnnouncement` is a PROJECTION: `active` and `updatedAt` are
 *     stripped, so "is this one live?" is not a client decision — the server
 *     already filtered on it. An empty feed is `[]`, never null.
 *   • Order is newest-first (`ListAnnouncements` sorts on CreatedAt desc), but
 *     `currentAnnouncement` re-sorts anyway: the ordering of a feed is not a
 *     thing this client should depend on the server to keep doing.
 *   • `body` is PLAIN TEXT WITH NEWLINES. The admin form is a `<TextArea>`
 *     capped at 4000 chars with a `white-space: pre-wrap` preview — there is no
 *     markdown, no HTML, and no rich editor anywhere in the authoring path. So
 *     the renderer preserves line breaks and nothing else. (React escapes the
 *     text it renders, so a `<script>` an operator types is shown, not run.)
 *
 * ---- DISMISSAL: PER-ANNOUNCEMENT, REMEMBERED LOCALLY -----------------------
 * The owner asked for 「跳出訊息」, so this is a popup rather than a banner. A
 * popup that reappears on every visit is nagware and gets closed unread; a
 * banner nobody has to touch gets ignored forever. The middle is: pop up ONCE
 * PER ANNOUNCEMENT ID, remember the dismissal in localStorage, and pop up again
 * the moment the operator publishes a DIFFERENT one. So "he posted something
 * new" is the only thing that can interrupt you.
 *
 * The store is a bounded list of ids (`DISMISS_CAP`, newest-last). Bounded
 * because it is unbounded operator input otherwise; ids are opaque server
 * strings, so nothing here parses or trusts their shape. Every storage access
 * is wrapped: Safari private mode throws on `localStorage`, and a lobby that
 * cannot show an announcement must still be a working lobby.
 */

/** One entry of the public feed — mirrors Go's `admin.PublicAnnouncement`. */
export interface PublicAnnouncement {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** RFC3339 from the server clock seam. Kept as a string; only compared. */
  readonly createdAt: string;
}

/** localStorage key holding the ids this browser has already dismissed. */
export const DISMISSED_KEY = "ggd.announcements.dismissed.v1";

/**
 * How many dismissed ids to remember. The list only has to outlive the window
 * in which an old announcement could still be the newest ACTIVE one — the
 * operator retires them, so a couple of dozen is generously past that, and the
 * cap is what stops a localStorage entry from growing without bound.
 */
export const DISMISS_CAP = 32;

/** Anything with the two `Storage` methods this module uses. */
export interface DismissStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * PURE + TOTAL: raw JSON body → the entries this client is willing to show.
 *
 * Deliberately paranoid rather than trusting, because the failure it prevents
 * is "the lobby throws and the player sees a blank screen because an operator
 * saved something odd". Anything that is not an object with a usable id and
 * title is dropped; `body` is optional (the admin form allows a title-only
 * announcement) and coerced to "".
 */
export function parseAnnouncementFeed(raw: unknown): PublicAnnouncement[] {
  const list = (raw as { announcements?: unknown } | null | undefined)?.announcements;
  if (!Array.isArray(list)) return [];
  const out: PublicAnnouncement[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (!isNonEmptyString(e.id) || !isNonEmptyString(e.title)) continue;
    out.push({
      id: e.id,
      title: e.title,
      body: typeof e.body === "string" ? e.body : "",
      createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
    });
  }
  return out;
}

/**
 * PURE: the one announcement a player should be shown — the newest.
 *
 * Newest-first is re-derived here instead of inherited from the response order:
 * `createdAt` descending, and for the pathological tie (two announcements minted
 * inside one clock tick, which the test clock in the Go suite really does) the
 * id breaks it, so the choice is deterministic rather than arbitrary.
 */
export function currentAnnouncement(feed: readonly PublicAnnouncement[]): PublicAnnouncement | null {
  let best: PublicAnnouncement | null = null;
  for (const a of feed) {
    if (best === null) {
      best = a;
      continue;
    }
    if (a.createdAt > best.createdAt || (a.createdAt === best.createdAt && a.id > best.id)) best = a;
  }
  return best;
}

/** PURE: has this browser already closed that announcement? */
export function isDismissed(dismissed: readonly string[], id: string): boolean {
  return dismissed.includes(id);
}

/**
 * PURE: append an id, de-duplicated, capped to the newest `DISMISS_CAP`.
 * Returns a new array — callers persist the result.
 */
export function markDismissed(dismissed: readonly string[], id: string): string[] {
  const kept = dismissed.filter((x) => x !== id);
  kept.push(id);
  return kept.slice(Math.max(0, kept.length - DISMISS_CAP));
}

/** Read the dismissed-id list. NEVER throws: no storage ⇒ nothing dismissed. */
export function readDismissed(storage: DismissStorage | null | undefined): string[] {
  try {
    const raw = storage?.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNonEmptyString);
  } catch {
    return []; // private mode / corrupt value — worst case the popup shows again
  }
}

/** Persist the dismissed-id list. NEVER throws (see readDismissed). */
export function writeDismissed(storage: DismissStorage | null | undefined, ids: readonly string[]): void {
  try {
    storage?.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — the popup will simply be shown again next visit */
  }
}

/** The browser's localStorage, or null where there is none (node tests, SSR). */
export function browserDismissStorage(): DismissStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** What the lobby should hold after a feed read. */
export interface AnnouncementView {
  /**
   * The newest announcement the operator has published, or null. Kept even
   * once dismissed, so the 📢 公告 chip can reopen it — "I closed it" must not
   * mean "the text is gone".
   */
  readonly current: PublicAnnouncement | null;
  /** Should it INTERRUPT this player right now? (i.e. pop up unprompted) */
  readonly open: boolean;
}

/**
 * PURE: feed + what this browser has already closed → the whole lobby-side
 * decision, in one place so the store and the tests cannot drift.
 *
 * `{current: null, open: false}` is the ordinary case — nothing published, or
 * the feed was unreachable — and it is exactly the state the lobby has today.
 */
export function announcementView(
  feed: readonly PublicAnnouncement[],
  dismissed: readonly string[],
): AnnouncementView {
  const current = currentAnnouncement(feed);
  return { current, open: current !== null && !isDismissed(dismissed, current.id) };
}

/**
 * PURE: an announcement body → the lines to paint.
 *
 * CRLF is normalised (the operator may paste from anywhere), and a run of blank
 * lines collapses to at most one so a stray double-return does not open a hole
 * in the middle of the card. Trailing blank lines are dropped entirely. The
 * result is rendered as separate elements rather than via `white-space:
 * pre-wrap` on one blob, because each line then wraps and scrolls on its own —
 * which is what keeps a long paste readable on a 390px phone.
 */
export function announcementLines(body: string): string[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmedEnd = line.replace(/\s+$/, "");
    if (trimmedEnd === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(trimmedEnd);
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * PURE: `createdAt` → the short date shown under the title, or "" when the
 * server sent something unparseable. Locale-independent (yyyy/mm/dd) so the
 * string a test asserts is the string a player sees, in every timezone this
 * family plays in — the date is rendered in UTC, which is the clock the
 * platform stamps with.
 */
export function announcementDate(createdAt: string): string {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}/${mm}/${dd}`;
}
