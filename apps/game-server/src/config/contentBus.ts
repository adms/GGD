/**
 * The content bus — how an admin edit reaches a RUNNING shard.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────────
 *
 * Three operator-editable documents live on the platform and are read by this
 * process over HTTP: the curation whitelist (後台 content enablement), the
 * combat-env multiplier table (戰鬥系統) and the server-ops knobs (系統運維).
 * Each is cached here behind a short TTL and resolved at MATCH CREATION.
 *
 * That means the only thing that ever dislodged a cached document was somebody
 * starting a match. On a quiet shard — the owner alone in the console, no match
 * running — a change he just saved could sit unapplied indefinitely, and
 * nothing anywhere said so. #48 made a FAILED fetch loud; this makes a
 * SUCCESSFUL edit actually travel.
 *
 * The platform now publishes a tiny invalidation on the Redis channel
 * `chan:content` every time it durably writes one of those documents
 * (apps/platform/internal/data/redisx/contentbus.go). This module subscribes,
 * and on each announcement re-runs THE SAME fetch the shard already uses.
 *
 * ── FOUR RULES THIS MODULE EXISTS TO ENFORCE ──────────────────────────────────
 *
 * 1. ONE INGESTION PATH, NOT TWO. The announcement carries a kind and an etag —
 *    never the document. The shard answers by re-fetching the authoritative
 *    endpoint through `resolvePlatformUrlDetailed()` and the existing cache, so
 *    there is exactly one parser, one validator and one set of fail-safe rules.
 *    A broadcast blob would have been a second, divergent loader.
 *
 * 2. A FAILED REFRESH IS LOUD. It files a degradation in the same registry as a
 *    failed boot fetch and shows up in the same /healthz block. A refresh that
 *    failed silently would recreate the exact bug #48 killed — worse, actually,
 *    because the operator would have watched himself click Save.
 *
 * 3. REDIS IS OPTIONAL. No Redis, unreachable Redis, wrong password, Redis
 *    restarting mid-session: the shard boots, plays, and degrades to precisely
 *    the pre-bus behaviour (TTL pickup). The owner develops on a laptop; the
 *    bus is an accelerator, never a dependency. Nothing awaits it.
 *
 * 4. A LIVE CHANGE NEVER REACHES A MATCH IN PROGRESS. See the next section.
 *
 * ── MID-MATCH SAFETY: THE BOUNDARY IS MATCH CREATION ──────────────────────────
 *
 * THE RULE: a content change applies to matches created AFTER it lands. It
 * never applies to a match that already exists — not to its combat, not to its
 * shop, and not to its champ-select.
 *
 * This is enforced STRUCTURALLY, not by convention. `MatchRoom.onCreate`
 * resolves a `Whitelist` and a combat-env table once and hands them to
 * `MatchController` as readonly fields; `Whitelist` is immutable (its id sets
 * are built in the constructor and never mutated) and the multiplier table is
 * snapshotted into `MatchState.combatEnvJson`. This module only ever replaces
 * the value held by the SHARED CACHE — the object a future onCreate will read.
 * It has no reference to any live room and cannot mutate one.
 *
 * WHY CHAMP-SELECT COUNTS AS "ALREADY RUNNING" TOO. Champ-select happens inside
 * the room, after onCreate, so it uses the same frozen snapshot. That is the
 * deliberate answer: if a shrunk whitelist applied mid-select, a player hovering
 * a champion could have it vanish under the cursor, or — far worse — the
 * server could reject the SELECT_CHAMPION for a champion it offered them five
 * seconds earlier, and there is no good UI for "the thing you picked stopped
 * existing". Worse still would be a shrink landing DURING combat: a champion
 * someone is currently playing is not something to retroactively disallow. The
 * next match gets the new roster; this one finishes on the roster it started
 * with. Same reasoning the combat-env table already used ("NEW MATCHES ONLY",
 * config/combatEnv.ts) — the bus does not change that contract, it just makes
 * "next match" mean seconds instead of "whenever the TTL happens to expire".
 *
 * `maxRooms` is the one knob that is genuinely live, and safely so: it is read
 * inside onCreate before any world exists, so a lowered ceiling refuses the NEXT
 * creation and never evicts a running match (config/serverOps.ts).
 */
import {
  warnOnce,
  clearDegradation,
  PLATFORM_URL,
  PLATFORM_URL_RESOLUTION,
  degradations,
  type PlatformUrlSource,
  type Degradation,
} from "./platformUrl";
import { sharedWhitelistCache } from "../curation/whitelist";
import { sharedCommunityContentCache } from "../curation/communityContent";
import { sharedCombatEnvCache } from "./combatEnv";
import { sharedServerOpsCache } from "./serverOps";
import { RedisSubscriber, type SubscriberState } from "./redisSubscriber";
import { onOverlayAnnounced } from "./contentHotApply";

/**
 * The Redis channel. MUST match redisx.ChanContent() in the Go platform —
 * this string is the wire contract between the two processes.
 */
export const CONTENT_CHANNEL = "chan:content";

/** The document kinds the platform announces. Mirrors redisx.ContentKind*. */
export const CONTENT_KINDS = [
  "curation",
  "combat-env",
  "server-ops",
  // ⭐⭐ GH#736 —— **線上內容編輯全鏈路**的第二段（admin 編 → server 熱載 → client 看得到）。
  //
  // ⚠️ ⭐ 在此之前這個 kind **不在這張表裡**，而 Go 端 `redisx/contentbus.go:64` 的
  //   `ContentKindContentOverlay = "content-overlay"` **早就在 publish**
  //   ⇒ 每一則都掉進 `unknownKinds`（⭐ 好消息：它**不是靜默丟掉**，會上 `/healthz`）。
  //   ⇒ ⛔ 但沒有任何人做事：owner 在後台改一支技能，這一台 shard **到重啟為止**都用舊的。
  "content-overlay",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** The wire payload published on CONTENT_CHANNEL. */
export interface ContentInvalidation {
  kind: string;
  version?: string;
  updatedAt?: string;
}

/** Degradation-registry key for "this shard is not receiving invalidations". */
export const BUS_DEGRADE_KEY = "content-bus-disconnected";
/** Degradation-registry key prefix for a failed bus-driven refresh. */
export const refreshDegradeKey = (kind: ContentKind): string => `content-refresh-${kind}`;

/** Per-document liveness, as reported on /healthz. */
export interface DocumentStatus {
  /** the version the platform last ANNOUNCED (empty until one arrives) */
  announcedVersion: string;
  /** the announced version we last successfully re-fetched for */
  appliedVersion: string;
  /** `updatedAt` from the document, when the endpoint reports one */
  documentUpdatedAt: string | null;
  /** ISO time of the last SUCCESSFUL refresh (boot fetches do not count) */
  lastRefreshAt: string | null;
  /** ISO time of the last refresh ATTEMPT, successful or not */
  lastAttemptAt: string | null;
  lastRefreshOk: boolean | null;
  lastError: string | null;
  refreshes: number;
  failures: number;
  /**
   * The platform told us about a version we have not managed to fetch. This is
   * the field that answers "did my change land on the shard?" — `false` means
   * yes, `true` means the shard knows it is behind and why.
   */
  stale: boolean;
}

interface KindState extends DocumentStatus {
  inflight: boolean;
  rerunRequested: boolean;
}

function blankState(): KindState {
  return {
    announcedVersion: "",
    appliedVersion: "",
    documentUpdatedAt: null,
    lastRefreshAt: null,
    lastAttemptAt: null,
    lastRefreshOk: null,
    lastError: null,
    refreshes: 0,
    failures: 0,
    stale: false,
    inflight: false,
    rerunRequested: false,
  };
}

/** One refreshable document: how to re-fetch it, in the shard's own words. */
interface Refresher {
  /**
   * Re-run the canonical fetch. Resolves ok=false on a fail-safe fallback.
   *
   * ⭐ GH#1025 —— `detail` 是**這一次**的原因（⛔ `consequence` 是靜態的那一半）。
   * 一個「為什麼這一次沒有套用」的答案不可以只活在一行 log 裡。
   */
  run: () => Promise<{ ok: boolean; updatedAt?: string; detail?: string }>;
  /** What the operator loses while this document is stale. */
  consequence: string;
}

const defaultRefreshers: Record<ContentKind, Refresher> = {
  curation: {
    run: async () => {
      const r = await sharedWhitelistCache().refresh();
      return { ok: r.ok, updatedAt: r.updatedAt };
    },
    consequence: "the content whitelist you just edited is NOT what new matches will use",
  },
  "combat-env": {
    run: async () => ({ ok: (await sharedCombatEnvCache().refresh()).ok }),
    consequence: "your 戰鬥系統 multipliers are NOT what new matches will use",
  },
  "server-ops": {
    run: async () => ({ ok: (await sharedServerOpsCache().refresh()).ok }),
    consequence: "your 系統運維 maxRooms / snapshotHz are NOT in force",
  },
  // ⭐⭐ GH#736 —— **內容覆蓋層**（admin 編輯的技能／英雄／道具）。
  //
  // ── ⛔ 為什麼這一支今天 `ok: false`，⭐ 而那是**誠實**不是偷懶 ────────────────
  // 覆蓋層是在 `index.ts` 的 `loadContent()` 裡讀的，⭐ 而那一支**只在開機跑一次**：
  // 它 `registerAll()` 整棵內容樹，而**正在進行的比賽**握著那些定義的參照。
  // ⇒ 熱換整棵樹**不是一次 refresh**，它是一段有自己風險的工程（下一批）。
  //
  // ⭐ 那為什麼還要有這一格？因為在此之前這個 kind **不在 `CONTENT_KINDS` 裡**：
  // 每一則公告都掉進 `unknownKinds` ⇒ ⛔ 讀 `/healthz` 的人看到的是「版本歪了」，
  // 而真相是「**這一台知道有東西變了，而它做不到**」。⭐ 兩者要分得出來。
  //
  // ⚠️ `ok: false` ⇒ 匯流排會把它記成一次失敗並帶著下面那句 `consequence`
  //   —— ⭐ 那正是 fail-loud：⛔ 一行沒有人讀的 log 不算。
  //
  // ⭐⭐ **GH#1025 把這條路接上了**（2026-09-07）。⚠️ 上面那一段講的是它接上**之前**
  //   的樣子；⛔ 不要照著它再寫一次 `ok:false`（那正是「按下發布之後什麼時候生效
  //   量不到」的原因）。⭐ 今天它做的是 `contentHotApply.onOverlayAnnounced()`：
  //   **只註冊新增的文件**，⛔ 已註冊過的 id 一律原封退回開機那一份（連物件參照
  //   都一樣）⇒ 進行中的對局一個位元組都不會動，而下一次開房就選得到新英雄。
  "content-overlay": {
    run: async () => {
      // ⭐⭐ GH#1025 Scope C —— **出身清單先更新**，內容才註冊。
      //
      // ⚠️ 順序是載重的：如果先熱套用、後更新清單，中間那個視窗裡開的房會
      // 拿到「新英雄已註冊、而它還不在社群清單裡」⇒ ⭐ **它會出現在官方房**。
      // ⛔ 反過來的窗（清單先到、內容還沒註冊）是無害的：一個減掉一個
      // 不存在的 id 的白名單，逐位元組等於沒有減。
      const c = await sharedCommunityContentCache().refresh();
      const r = await onOverlayAnnounced();
      // ⭐ fail-loud：清單抓不到 ⇒ 這一台**分不出**哪些是社群內容 ⇒ 官方房會
      //   看得到玩家做的東西。⛔ 那不可以只留一行 log，所以它拉低 `ok`。
      const detail = c.ok
        ? r.reason
        : `社群內容清單抓不到 —— ⭐ 官方房這段時間會看得到玩家發布的內容` +
          `（⛔ 另一個方向會清空整份白名單，那更糟）。` +
          (r.reason !== undefined ? ` 另外：${r.reason}` : "");
      return { ok: r.ok && c.ok, detail };
    },
    consequence:
      "你在後台編輯／批核通過的內容（技能／英雄／道具）**這一台 shard 還沒有套用** —— " +
      "⭐ 新增的內容本來會當場生效（下一次開房就選得到），而這一次沒有；" +
      "⛔ **修改**既有內容一律要等重啟（改掉一份正在被對局使用的定義＝對局中途換版）。",
  },
};

// ---------------------------------------------------------------- the bus ----

export interface ContentBusOptions {
  host?: string;
  port?: number;
  password?: string;
  /** Override the per-kind refresh implementations (tests). */
  refreshers?: Partial<Record<ContentKind, Refresher>>;
  /** Injectable subscriber (tests) — defaults to a real RedisSubscriber. */
  subscriberFactory?: (opts: {
    host: string;
    port: number;
    password?: string;
    channels: string[];
    onMessage: (channel: string, payload: string) => void;
    onState: (state: SubscriberState, detail?: string) => void;
  }) => { start: () => void; stop: () => void; state: SubscriberState; lastError: string | null };
  log?: typeof console.log;
  /** Clock seam (tests). */
  now?: () => Date;
}

export class ContentBus {
  private readonly states = new Map<ContentKind, KindState>();
  private readonly refreshers: Record<ContentKind, Refresher>;
  private subscriber: ReturnType<NonNullable<ContentBusOptions["subscriberFactory"]>> | null = null;
  private _state: SubscriberState = "idle";
  private _lastError: string | null = null;
  private _connectedAt: string | null = null;
  private everConnected = false;
  private readonly now: () => Date;
  private readonly log: typeof console.log;
  /** Messages that named a kind this build does not know about. */
  private unknownKinds = 0;

  constructor(private readonly opts: ContentBusOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? console.log;
    this.refreshers = { ...defaultRefreshers, ...(opts.refreshers ?? {}) } as Record<
      ContentKind,
      Refresher
    >;
    for (const kind of CONTENT_KINDS) this.states.set(kind, blankState());
  }

  get state(): SubscriberState {
    return this._state;
  }

  /** Open the subscription. Never throws; never blocks. */
  start(): void {
    const host = this.opts.host ?? "127.0.0.1";
    const port = this.opts.port ?? 6379;
    const make =
      this.opts.subscriberFactory ??
      ((o) =>
        new RedisSubscriber({
          host: o.host,
          port: o.port,
          password: o.password,
          channels: o.channels,
          onMessage: o.onMessage,
          onState: o.onState,
        }));
    this.subscriber = make({
      host,
      port,
      password: this.opts.password,
      channels: [CONTENT_CHANNEL],
      onMessage: (_channel, payload) => this.onMessage(payload),
      onState: (state, detail) => this.onState(state, detail, host, port),
    });
    this.subscriber.start();
  }

  /** Close the subscription. Idempotent. */
  stop(): void {
    this.subscriber?.stop();
    this.subscriber = null;
    clearDegradation(BUS_DEGRADE_KEY);
  }

  private onState(
    state: SubscriberState,
    detail: string | undefined,
    host: string,
    port: number,
  ): void {
    this._state = state;
    if (state === "subscribed") {
      this._connectedAt = this.now().toISOString();
      this._lastError = null;
      // The bus is live again: retract the "not receiving invalidations"
      // degradation so /healthz describes NOW, not "ever".
      clearDegradation(BUS_DEGRADE_KEY);
      if (!this.everConnected) {
        this.everConnected = true;
        this.log(
          `[content-bus] subscribed to ${CONTENT_CHANNEL} on ${host}:${port} — admin edits to ` +
            `curation / combat-env / server-ops now reach this shard without a restart`,
        );
      }
      return;
    }
    if (state === "retrying") {
      this._lastError = detail ?? null;
      // ONCE per disconnected stretch, by warnOnce's dedup. Deliberately not
      // fatal wording: an owner running the game on a laptop with no Redis
      // must not think something is broken. Nothing here stops a match.
      warnOnce(
        BUS_DEGRADE_KEY,
        `[content-bus] not connected to Redis at ${host}:${port} (${detail ?? "unknown"}). ` +
          `THIS IS NOT FATAL: the shard keeps working and still picks up admin changes on its ` +
          `normal cache TTL at the next match creation. What is lost is INSTANT propagation — ` +
          `an edit you make in the 後台 console while a shard is idle may not be applied until ` +
          `someone starts a match. Set REDIS_ADDR (default 127.0.0.1:6379), or GGD_CONTENT_BUS=0 ` +
          `to disable this subscriber entirely.`,
      );
    }
  }

  /** Handle one raw payload from the channel. Never throws. */
  private onMessage(payload: string): void {
    let msg: ContentInvalidation;
    try {
      msg = JSON.parse(payload) as ContentInvalidation;
    } catch {
      warnOnce(
        "content-bus-malformed",
        `[content-bus] ignoring a non-JSON message on ${CONTENT_CHANNEL}`,
      );
      return;
    }
    const kind = msg?.kind;
    if (!isContentKind(kind)) {
      // A NEWER PLATFORM ANNOUNCING A DOCUMENT THIS BUILD DOES NOT KNOW is a
      // version skew, not corruption: ignore it and count it, so a rolling
      // deploy is visible on /healthz instead of mysterious.
      this.unknownKinds += 1;
      return;
    }
    void this.invalidate(kind, typeof msg.version === "string" ? msg.version : "");
  }

  /**
   * Apply one invalidation: re-fetch the document and record what happened.
   *
   * COALESCED, NOT QUEUED. If an announcement arrives while a refresh for the
   * same kind is in flight, we set a rerun flag instead of starting a second
   * fetch, and the in-flight one loops. That is not just load-shedding — it is
   * correctness: two overlapping fetches can complete out of order, and the
   * loser would stamp an OLDER document with a NEWER announced version, so
   * /healthz would read "converged" while the shard held stale content. One
   * refresh at a time, always started after the newest announcement, cannot.
   */
  async invalidate(kind: ContentKind, version: string): Promise<void> {
    const st = this.states.get(kind);
    if (!st) return;
    st.announcedVersion = version;
    st.stale = version !== "" && version !== st.appliedVersion;
    if (st.inflight) {
      st.rerunRequested = true;
      return;
    }
    st.inflight = true;
    try {
      do {
        st.rerunRequested = false;
        // Capture the target BEFORE the fetch: whatever the platform has
        // announced by now is what this fetch is going to satisfy.
        const target = st.announcedVersion;
        st.lastAttemptAt = this.now().toISOString();
        let ok = false;
        let updatedAt: string | undefined;
        let error: string | null = null;
        try {
          const result = await this.refreshers[kind].run();
          ok = result.ok;
          updatedAt = result.updatedAt;
          // ⭐ GH#1025 —— 這一次的原因（⛔ 不是靜態的 consequence）。
          if (!result.ok && result.detail) error = result.detail;
        } catch (err) {
          // The refreshers are documented never to throw, but a bug in one of
          // them must not kill the subscription for the other two.
          ok = false;
          error = err instanceof Error ? err.message : String(err);
        }
        this.record(kind, st, ok, target, updatedAt, error);
      } while (st.rerunRequested);
    } finally {
      st.inflight = false;
    }
  }

  private record(
    kind: ContentKind,
    st: KindState,
    ok: boolean,
    target: string,
    updatedAt: string | undefined,
    error: string | null,
  ): void {
    const at = this.now().toISOString();
    if (ok) {
      st.refreshes += 1;
      st.lastRefreshAt = at;
      st.lastRefreshOk = true;
      st.lastError = null;
      st.appliedVersion = target;
      if (updatedAt) st.documentUpdatedAt = updatedAt;
      st.stale = false;
      clearDegradation(refreshDegradeKey(kind));
      this.log(
        `[content-bus] ${kind} refreshed at ${at}` + (target ? ` (version ${target})` : ""),
      );
      return;
    }
    st.failures += 1;
    st.lastRefreshOk = false;
    st.lastError = error ?? "platform did not serve a usable document";
    st.stale = true;
    // THE WHOLE POINT OF THIS BRANCH. The operator watched himself click Save,
    // so a silent failure here is worse than the boot-time failure #48 killed.
    // Same registry, same /healthz block, same retraction on recovery.
    warnOnce(
      refreshDegradeKey(kind),
      `[content-bus] ${kind} changed on the platform but this shard COULD NOT RE-FETCH it from ` +
        `${PLATFORM_URL} — ${this.refreshers[kind].consequence}. The last known good values are ` +
        `still in force (nothing was reverted). Fix the platform; the next announcement or cache ` +
        `expiry retries automatically.`,
    );
  }

  /**
   * ⭐ GH#1025 —— 記下一次**在匯流排以外**發生的成功套用。
   *
   * ⚠️ `ugc.publishMode = next-match` 時，公告當下**刻意**回 ok=false（還沒生效），
   * 而真正的套用發生在**下一次開房**（`MatchRoom.buildMatch`）。
   * ⛔ 少了這一支，`/healthz` 會永遠說它是 stale —— 一個從此不會轉綠的警報
   * 等於沒有警報（本 repo 記過的「一個永遠不會綠的閘」）。
   */
  noteApplied(kind: ContentKind, version?: string): void {
    const st = this.states.get(kind);
    if (!st) return;
    this.record(kind, st, true, version ?? st.announcedVersion, undefined, null);
  }

  /** The `content` block served on GET /healthz. */
  status(): ContentBusStatus {
    const documents = {} as Record<ContentKind, DocumentStatus>;
    for (const kind of CONTENT_KINDS) {
      const { inflight: _i, rerunRequested: _r, ...pub } = this.states.get(kind) ?? blankState();
      documents[kind] = pub;
    }
    return {
      enabled: true,
      channel: CONTENT_CHANNEL,
      state: this._state,
      connectedAt: this._connectedAt,
      lastError: this._lastError,
      unknownKinds: this.unknownKinds,
      documents,
    };
  }
}

export interface ContentBusStatus {
  enabled: boolean;
  channel: string;
  state: SubscriberState | "disabled";
  connectedAt: string | null;
  lastError: string | null;
  unknownKinds: number;
  documents: Record<ContentKind, DocumentStatus>;
}

function isContentKind(v: unknown): v is ContentKind {
  return typeof v === "string" && (CONTENT_KINDS as readonly string[]).includes(v);
}

// ------------------------------------------------------- process singleton ---

/**
 * Is the bus configured? Redis is OPTIONAL: `GGD_CONTENT_BUS=0` turns the
 * subscriber off entirely (and says so on /healthz, as a deliberate choice
 * rather than a failure). Everything else defaults it on, pointed at the same
 * REDIS_ADDR the Go platform uses, because on every environment that has a
 * platform there is a Redis next to it.
 */
export function contentBusEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.GGD_CONTENT_BUS ?? "").trim().toLowerCase();
  return !(v === "0" || v === "off" || v === "false" || v === "no");
}

/** Parse REDIS_ADDR (`host:port`, matching the platform's config.LoadStorage). */
export function parseRedisAddr(addr: string | undefined): { host: string; port: number } {
  const raw = (addr ?? "").trim();
  if (raw === "") return { host: "127.0.0.1", port: 6379 };
  const idx = raw.lastIndexOf(":");
  if (idx <= 0) return { host: raw, port: 6379 };
  const port = Number(raw.slice(idx + 1));
  return {
    host: raw.slice(0, idx),
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 6379,
  };
}

let shared: ContentBus | null = null;
let disabledReason: string | null = null;

/**
 * Start the process-wide bus. Called once from the boot sequence, AFTER the
 * server is listening — nothing may wait on it.
 */
export function startContentBus(env: NodeJS.ProcessEnv = process.env): ContentBus | null {
  if (shared) return shared;
  if (!contentBusEnabled(env)) {
    disabledReason = "GGD_CONTENT_BUS is off";
    console.log(
      "[content-bus] disabled by GGD_CONTENT_BUS — admin changes will be picked up on the normal " +
        "cache TTL at the next match creation (pre-bus behaviour).",
    );
    return null;
  }
  const { host, port } = parseRedisAddr(env.REDIS_ADDR);
  shared = new ContentBus({ host, port, password: env.REDIS_PASSWORD || undefined });
  shared.start();
  return shared;
}

/** Stop and forget the process-wide bus (shutdown / tests). */
export function stopContentBus(): void {
  shared?.stop();
  shared = null;
  disabledReason = null;
}

/** The live bus, if one is running. */
export function contentBus(): ContentBus | null {
  return shared;
}

/**
 * ⭐ GH#1025 —— 開房那一刻套用成功時把 `/healthz` 轉綠（`next-match` 那條路）。
 * ⛔ 沒有匯流排（本機無 Redis）時是 no-op。
 */
export function noteContentApplied(kind: ContentKind, version?: string): void {
  shared?.noteApplied(kind, version);
}

/**
 * The `content` block of GET /healthz — the answer to "did my change land on
 * the shard?". It reports, per document, the version the platform last
 * announced, the version this shard actually re-fetched, and when.
 */
export function contentBusStatus(): ContentBusStatus {
  if (shared) return shared.status();
  const documents = {} as Record<ContentKind, DocumentStatus>;
  for (const kind of CONTENT_KINDS) documents[kind] = blankState();
  return {
    enabled: false,
    channel: CONTENT_CHANNEL,
    state: "disabled",
    connectedAt: null,
    lastError: disabledReason,
    unknownKinds: 0,
    documents,
  };
}

/**
 * The full `platform` block for GET /healthz: the #48 URL-resolution fields
 * plus the live-propagation fields this module adds.
 *
 * It is one block on purpose. "Which platform am I talking to", "is any
 * fail-safe currently in force" and "is that platform's latest edit actually
 * applied here" are three halves of the same question, and an operator
 * debugging "my tuning did nothing" should not have to know which of them to
 * ask first.
 */
export function platformStatusWithContent(): {
  url: string;
  source: PlatformUrlSource;
  reason: string;
  degraded: boolean;
  degradations: Degradation[];
  content: ContentBusStatus;
} {
  const active = degradations();
  return {
    url: PLATFORM_URL,
    source: PLATFORM_URL_RESOLUTION.source,
    reason: PLATFORM_URL_RESOLUTION.reason,
    degraded: active.length > 0,
    degradations: active,
    content: contentBusStatus(),
  };
}
