/**
 * useVoiceGen — the I/O half of 角色語音生成.
 *
 * ── THE SCALE RULES THIS HOOK EXISTS TO ENFORCE (2,208 clips) ───────────────
 *   • The overview is ONE request: `GET /voice-api/roster`, a ~6 KB rollup of
 *     48 rows. Never 2,208 anything.
 *   • A champion's 46-line detail is fetched ONLY when it is opened, cached,
 *     and invalidated by an SSE `line`/`roster` event for that champion — not
 *     by a timer.
 *   • SSE is primary; a 2 s `GET /voice-api/jobs` poll is the fallback ONLY
 *     while the stream is not open. Nothing ever fans out per-champion
 *     requests on a timer.
 *   • ONE shared `<audio preload="none">` element for the whole page, created
 *     on first play — the `bgm-audition.html` pattern. Opening a second clip
 *     stops the first, so ten clips can never play over each other, and 46
 *     `<audio>` nodes are never mounted.
 *
 * Every number this hook hands to the page comes from voiceModel.ts; it counts
 * nothing itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUNDLED_SCHEMA,
  expandLines,
  type CategorySchema,
  type LineSpec,
} from "./categories";
import {
  parseChampionStatus,
  parseCounts,
  parseJob,
  type ChampionStatus,
  type Job,
  type LineState,
  type VoiceRoster,
} from "./voiceModel";
import * as api from "./voiceApi";
import type { JobLists, ServiceMode, VoiceHealth } from "./voiceApi";
import { QUOTES_URL, demoChampionsFromQuotes, demoWorld } from "./demoData";
import { getWhitelist } from "../api";

/** Job poll interval used ONLY while the SSE stream is not open. */
export const JOB_POLL_MS = 2000;
/** How long after the last SSE frame the stream is treated as dead. */
export const STREAM_IDLE_MS = 45_000;

const NO_JOBS: JobLists = { active: [], recent: [] };

// -------------------------------------------------------------- one player --

export interface PlayerState {
  /** `${championId}/${lineId}` (+ `#take` when auditioning a take), or null */
  readonly nowPlaying: string | null;
  readonly error: string | null;
  /** true when the bytes being played are known to be a STUB */
  readonly stub: boolean;
  readonly play: (key: string, url: string, stub: boolean) => void;
  readonly stop: () => void;
}

/**
 * ONE audio element for the entire page.
 *
 * `preload="none"` and the `src` set only on play: a page listing 46 lines must
 * not put 46 audio elements in the DOM, and must not prefetch a single byte the
 * operator did not ask to hear.
 */
function useOnePlayer(): PlayerState {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stub, setStub] = useState(false);

  const stop = useCallback(() => {
    const el = ref.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setNowPlaying(null);
    setStub(false);
  }, []);

  const play = useCallback(
    (key: string, url: string, isStub: boolean) => {
      if (typeof Audio === "undefined") return;
      let el = ref.current;
      if (el === null) {
        el = new Audio();
        el.preload = "none";
        el.addEventListener("ended", () => setNowPlaying(null));
        el.addEventListener("error", () => {
          setError("這一句的音檔載不到（可能還沒生成，或服務已停止）。");
          setNowPlaying(null);
        });
        ref.current = el;
      }
      // Toggle: pressing the playing row stops it rather than restarting.
      if (nowPlaying === key) {
        stop();
        return;
      }
      el.pause();
      setError(null);
      el.src = url;
      setNowPlaying(key);
      setStub(isStub);
      void el.play().catch(() => {
        setError("瀏覽器拒絕播放（請先與頁面互動一次）。");
        setNowPlaying(null);
      });
    },
    [nowPlaying, stop],
  );

  useEffect(() => {
    return () => {
      const el = ref.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
      }
    };
  }, []);

  return { nowPlaying, error, stub, play, stop };
}

// ----------------------------------------------------------------- the hook --

export interface VoiceGenState {
  readonly mode: ServiceMode;
  readonly health: VoiceHealth | null;
  /** true ⇒ every clip is fake; the page paints its top banner from this */
  readonly stubEngine: boolean;
  readonly schema: CategorySchema;
  /** the 46 expected lines per champion, derived from the schema */
  readonly lines: readonly LineSpec[];

  readonly roster: VoiceRoster | null;
  readonly rosterError: string | null;
  readonly booting: boolean;
  readonly refreshing: boolean;
  readonly refresh: () => void;

  readonly loaded: ReadonlyMap<string, ChampionStatus>;
  readonly loadingChampions: ReadonlySet<string>;
  readonly championErrors: ReadonlyMap<string, string>;
  readonly loadChampion: (championId: string, force?: boolean) => void;

  readonly jobs: JobLists;
  readonly streaming: boolean;
  readonly lastEventAt: number | null;

  /**
   * TRUE ⇒ everything on screen is FABRICATED (see demoData.ts). Off by
   * default, only ever switched on by an explicit click, and while it is on the
   * page shows its own banner and offers no write at all.
   */
  readonly demo: boolean;
  readonly demoBusy: boolean;
  readonly setDemo: (on: boolean) => void;

  readonly player: PlayerState;
  readonly busy: string | null;
  readonly actionError: string | null;
  readonly clearActionError: () => void;
  /** run a write, then reconcile the affected champion + the rollup */
  readonly act: <T>(
    label: string,
    run: () => Promise<api.ApiResult<T>>,
    affected?: string | null,
  ) => Promise<boolean>;
}

export function useVoiceGen(): VoiceGenState {
  const [health, setHealth] = useState<VoiceHealth | null>(null);
  const [daemonUp, setDaemonUp] = useState(false);
  const [schema, setSchema] = useState<CategorySchema>(BUNDLED_SCHEMA);
  const [roster, setRoster] = useState<VoiceRoster | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, ChampionStatus>>(new Map());
  const [loadingChampions, setLoadingChampions] = useState<ReadonlySet<string>>(new Set());
  const [championErrors, setChampionErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [jobs, setJobs] = useState<JobLists>(NO_JOBS);
  const [streaming, setStreaming] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [demo, setDemoOn] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoRoster, setDemoRoster] = useState<VoiceRoster | null>(null);
  const [demoStatuses, setDemoStatuses] = useState<ReadonlyMap<string, ChampionStatus>>(new Map());

  const player = useOnePlayer();
  const inFlight = useRef<Set<string>>(new Set());

  const lines = useMemo(() => expandLines(schema), [schema]);

  // ---- the rollup (the overview's ONLY load) -------------------------------
  const loadRoster = useCallback(async (): Promise<void> => {
    const live = await api.roster();
    if (live.ok && live.data !== null) {
      setRoster(live.data);
      setRosterError(null);
      setDaemonUp(true);
      return;
    }
    // Degraded: the daemon did not answer. Show the last PUBLISHED rollup and
    // say why it is read-only — never an empty page that reads as "no work
    // done yet".
    setDaemonUp(false);
    const published = await api.publishedRoster();
    setRoster(published);
    setRosterError(
      published === null
        ? `${api.NO_DAEMON_MESSAGE}（也還沒有已發布的 ROSTER.json）`
        : api.NO_DAEMON_MESSAGE,
    );
  }, []);

  const loadHealth = useCallback(async (): Promise<VoiceHealth | null> => {
    const res = await api.health();
    if (res.ok && res.data !== null) {
      setHealth(res.data);
      setDaemonUp(true);
      return res.data;
    }
    setHealth(null);
    setDaemonUp(false);
    return null;
  }, []);

  const boot = useCallback(async (): Promise<void> => {
    const h = await loadHealth();
    const s = await api.categories(h?.categoriesSha256 ?? null);
    setSchema(s ?? BUNDLED_SCHEMA);
    await loadRoster();
    const j = await api.jobs();
    if (j.ok && j.data !== null) setJobs(j.data);
    setBooting(false);
  }, [loadHealth, loadRoster]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      await loadHealth();
      await loadRoster();
      const j = await api.jobs();
      if (j.ok && j.data !== null) setJobs(j.data);
      setRefreshing(false);
    })();
  }, [loadHealth, loadRoster]);

  // ---- the lazy unit ------------------------------------------------------
  const loadChampion = useCallback(
    (championId: string, force = false): void => {
      // the demo world is complete in memory; there is nothing to fetch
      if (demo) return;
      if (inFlight.current.has(championId)) return;
      if (!force && loaded.has(championId)) return;
      inFlight.current.add(championId);
      setLoadingChampions((s) => new Set(s).add(championId));
      void api.champion(championId).then((res) => {
        inFlight.current.delete(championId);
        setLoadingChampions((s) => {
          const next = new Set(s);
          next.delete(championId);
          return next;
        });
        if (res.ok && res.data !== null) {
          setLoaded((m) => new Map(m).set(championId, res.data as ChampionStatus));
          setChampionErrors((m) => {
            const next = new Map(m);
            next.delete(championId);
            return next;
          });
        } else {
          setChampionErrors((m) =>
            new Map(m).set(championId, res.error ?? "讀不到這名角色的語音狀態。"),
          );
        }
      });
    },
    [loaded, demo],
  );

  // ---- SSE (primary) ------------------------------------------------------
  useEffect(() => {
    if (!api.VOICE_API.enabled) return;
    if (typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let closed = false;
    try {
      es = new EventSource(api.eventsUrl());
    } catch {
      return;
    }
    const mark = (): void => setLastEventAt(Date.now());

    es.onopen = () => {
      if (!closed) {
        setStreaming(true);
        mark();
      }
    };
    es.onerror = () => setStreaming(false);

    es.addEventListener("job", (ev) => {
      mark();
      const job = parseJob(safeJson((ev as MessageEvent).data));
      if (job === null) return;
      setJobs((prev) => mergeJob(prev, job));
    });

    es.addEventListener("line", (ev) => {
      mark();
      const d = safeJson((ev as MessageEvent).data) as {
        championId?: string;
        lineId?: string;
        state?: string;
        take?: number;
        stub?: boolean;
      } | null;
      if (!d || typeof d.championId !== "string" || typeof d.lineId !== "string") return;
      // Patch the cached champion in place. A whole re-fetch per finished line
      // would be 2,208 requests over a full run.
      setLoaded((m) => {
        const cur = m.get(d.championId as string);
        if (cur === undefined) return m;
        const prev = cur.lines[d.lineId as string];
        if (prev === undefined) return m;
        const next = new Map(m);
        next.set(cur.championId, {
          ...cur,
          lines: {
            ...cur.lines,
            [d.lineId as string]: {
              ...prev,
              state: (d.state as LineState | undefined) ?? prev.state,
            },
          },
        });
        return next;
      });
    });

    es.addEventListener("roster", (ev) => {
      mark();
      const d = safeJson((ev as MessageEvent).data) as
        | { championId?: string; counts?: unknown }
        | null;
      if (!d || typeof d.championId !== "string") return;
      // Take the counts OFF THE EVENT. Never re-poll /roster on a timer while a
      // job is running.
      setRoster((r) =>
        r === null
          ? r
          : {
              ...r,
              champions: r.champions.map((c) =>
                c.championId === d.championId ? { ...c, counts: parseCounts(d.counts) } : c,
              ),
            },
      );
    });

    es.addEventListener("engine", (ev) => {
      mark();
      const d = safeJson((ev as MessageEvent).data) as
        | { stub?: boolean; version?: string; warm?: boolean }
        | null;
      if (!d) return;
      setHealth((h) =>
        h === null
          ? h
          : {
              ...h,
              stub: d.stub === undefined ? h.stub : d.stub === true,
              engine: {
                ...h.engine,
                version: typeof d.version === "string" ? d.version : h.engine.version,
                warm: d.warm === undefined ? h.engine.warm : d.warm === true,
              },
            },
      );
    });

    return () => {
      closed = true;
      setStreaming(false);
      es?.close();
    };
  }, []);

  // ---- job poll (FALLBACK ONLY — never while the stream is open) -----------
  useEffect(() => {
    if (!api.VOICE_API.enabled) return;
    const fresh = (): boolean =>
      streaming && lastEventAt !== null && Date.now() - lastEventAt < STREAM_IDLE_MS;
    if (fresh()) return;
    const tick = (): void => {
      void api.jobs().then((res) => {
        if (res.ok && res.data !== null) {
          setJobs(res.data);
          setDaemonUp(true);
        }
      });
    };
    const timer = setInterval(tick, JOB_POLL_MS);
    return () => clearInterval(timer);
  }, [streaming, lastEventAt]);

  // ---- the demo driver (see demoData.ts) ----------------------------------
  const setDemo = useCallback(
    (on: boolean): void => {
      if (!on) {
        setDemoOn(false);
        return;
      }
      setDemoBusy(true);
      void (async () => {
        // The demo borrows the roster the repo ALREADY has: the curation
        // whitelist for which champions are open, the 名言 pack for their names.
        // It never invents a champion.
        const only = await getWhitelist()
          .then((w) => w.champions)
          .catch(() => null);
        let quotes: unknown = null;
        try {
          const res = await (fetch as typeof fetch)(QUOTES_URL, { cache: "no-store" });
          quotes = res.ok ? await res.json() : null;
        } catch {
          quotes = null;
        }
        const champs = demoChampionsFromQuotes(quotes, only);
        const world = demoWorld(champs, expandLines(schema));
        setDemoRoster(world.roster);
        setDemoStatuses(world.statuses);
        setDemoOn(true);
        setDemoBusy(false);
      })();
    },
    [schema],
  );

  // ---- writes -------------------------------------------------------------
  const act = useCallback(
    async <T,>(
      label: string,
      run: () => Promise<api.ApiResult<T>>,
      affected: string | null = null,
    ): Promise<boolean> => {
      setBusy(label);
      setActionError(null);
      try {
        const res = await run();
        if (!res.ok) {
          const detail = res.issues.map((i) => `${i.path} ${i.message}`).join("；");
          setActionError(`${label} 失敗：${res.error ?? "未知錯誤"}${detail ? `（${detail}）` : ""}`);
          return false;
        }
        if (affected !== null) loadChampion(affected, true);
        await loadRoster();
        return true;
      } finally {
        setBusy(null);
      }
    },
    [loadChampion, loadRoster],
  );

  return {
    mode: api.serviceMode(daemonUp),
    health,
    // No health record ⇒ we cannot claim the engine is real. Default to STUB.
    stubEngine: health === null ? true : health.stub,
    schema,
    lines,
    // While the demo drives the page it REPLACES the real feeds entirely —
    // there is no blending, so a fabricated row can never sit next to a real
    // one and be mistaken for it.
    roster: demo ? demoRoster : roster,
    rosterError: demo ? null : rosterError,
    booting: demo ? false : booting,
    refreshing,
    refresh,
    loaded: demo ? demoStatuses : loaded,
    loadingChampions,
    championErrors,
    loadChampion,
    jobs: demo ? NO_JOBS : jobs,
    streaming,
    lastEventAt,
    demo,
    demoBusy,
    setDemo,
    player,
    busy,
    actionError,
    clearActionError: useCallback(() => setActionError(null), []),
    act,
  };
}

// ------------------------------------------------------------------ helpers --

function safeJson(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Slot an updated job into the right list, newest first, recent capped at 20. */
export function mergeJob(prev: JobLists, job: Job): JobLists {
  const active = prev.active.filter((j) => j.jobId !== job.jobId);
  const recent = prev.recent.filter((j) => j.jobId !== job.jobId);
  if (job.state === "queued" || job.state === "running") {
    return { active: [job, ...active], recent };
  }
  return { active, recent: [job, ...recent].slice(0, 20) };
}

/** Re-export so the page never imports the parser twice. */
export { parseChampionStatus };
