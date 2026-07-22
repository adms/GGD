/**
 * useIconTracking — the I/O half of ICON 生成追蹤.
 *
 * It reads the content mount and hands every byte it gets to task #97's
 * functions. It contains NO counting of its own:
 *
 *   parseIndexRows       #97 — read a collection's `_index.json`
 *   coverageEntryFromDoc #97 — reduce one raw doc to a coverage entry
 *   diffScan / mergeDocs #97 — the cheap live re-poll (index hash → re-read)
 *   computeIconCoverage  #97 — every number the page prints
 *   hashIcons            #97 — the icon-byte scan (broken refs + duplicates)
 *   loadPlan             #97 — #72's exclusion plan, through #72's own reader
 *
 * WHY THE ADMIN NEEDS ITS OWN LOADER AT ALL. #97's `useIconCoverage` starts
 * from a fully loaded codex (`CodexData`), which only the client's 內容圖鑑 has.
 * The admin console has no codex, so this walks the same three `_index.json`
 * files and reads the docs itself — and then defers, without exception, to the
 * functions above. The fetching is plumbing; the arithmetic is #97's.
 *
 * LIVE, AND HONEST WHEN IT IS NOT. The first pass reads every document once
 * (that is the only expensive pass there is); afterwards each tick re-reads the
 * three indexes and only the documents whose hash actually moved. A failed
 * request leaves the previous numbers standing and reports the collection as
 * missing this round, so a network blip can never read as "every icon vanished".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COVERAGE_COLLECTION,
  COVERAGE_KINDS,
  computeIconCoverage,
  coverageEntryFromDoc,
  diffScan,
  mergeDocs,
  parseIndexRows,
  type CoverageScan,
  type IconCoverage,
  type IndexRow,
} from "@ggd/shared/codex/codexCoverage";
import { loadPlan, type CodexPlan } from "@ggd/shared/codex/codexPlan";
import {
  duplicateIconGroups,
  hashIcons,
  type IconHashes,
} from "@ggd/shared/codex/codexIcons";
import type { CodexKind } from "@ggd/shared/codex/codexTypes";
import { declaredIconPaths, IDLE_SCAN, type ScanPhase } from "./iconTracking";

/** Content mount — same origin in dev (admin vite serves it) and in prod (nginx). */
export const CONTENT_BASE = "/content";
/** How often the page re-checks the content mount. Matches #97's codex bar. */
export const POLL_MS = 8000;
/** Parallel document reads. The curation page already uses 16 against this mount. */
const CONCURRENCY = 16;
/** Documents re-read per poll tick once the first pass is done. */
const MAX_REREAD_PER_TICK = 48;

const EMPTY_SCAN: CoverageScan = { entries: [], hashes: new Map() };

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function pooled<I, O>(
  inputs: readonly I[],
  limit: number,
  work: (i: I) => Promise<O>,
  onEach?: () => void,
): Promise<O[]> {
  const out = new Array<O>(inputs.length);
  let next = 0;
  const size = Math.max(1, Math.min(limit, inputs.length));
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (;;) {
        const i = next++;
        if (i >= inputs.length) return;
        out[i] = await work(inputs[i] as I);
        onEach?.();
      }
    }),
  );
  return out;
}

export interface IconTrackingState {
  readonly coverage: IconCoverage;
  readonly plan: CodexPlan | null;
  readonly scan: ScanPhase;
  readonly lastCheckedAt: number | null;
  readonly checking: boolean;
  readonly rereadTotal: number;
  readonly pendingReread: number;
  readonly auto: boolean;
  readonly setAuto: (v: boolean) => void;
  readonly checkNow: () => void;
  /** null until the byte scan has run at least once */
  readonly icons: IconHashes | null;
  readonly duplicates: ReadonlyMap<string, string[]>;
  readonly scanningBytes: boolean;
  readonly scanBytes: () => void;
}

export function useIconTracking(applyCandidates: boolean): IconTrackingState {
  const scanRef = useRef<CoverageScan>(EMPTY_SCAN);
  const busy = useRef(false);
  const [version, setVersion] = useState(0);
  const [plan, setPlan] = useState<CodexPlan | null>(null);
  const [phase, setPhase] = useState<ScanPhase>(IDLE_SCAN);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [rereadTotal, setRereadTotal] = useState(0);
  const [pendingReread, setPendingReread] = useState(0);
  const [auto, setAuto] = useState(true);
  const [icons, setIcons] = useState<IconHashes | null>(null);
  const [scanningBytes, setScanningBytes] = useState(false);

  /** Fetch the three indexes. A collection that fails is reported, not zeroed. */
  const readIndexes = useCallback(async (): Promise<{
    rows: IndexRow[];
    seen: CodexKind[];
    missing: string[];
  }> => {
    const raws = await Promise.all(
      COVERAGE_KINDS.map((k) => getJson(`${CONTENT_BASE}/${COVERAGE_COLLECTION[k]}/_index.json`)),
    );
    const rows: IndexRow[] = [];
    const seen: CodexKind[] = [];
    const missing: string[] = [];
    COVERAGE_KINDS.forEach((kind, i) => {
      const parsed = raws[i] === null ? [] : parseIndexRows(kind, raws[i]);
      if (parsed.length === 0) {
        missing.push(COVERAGE_COLLECTION[kind]);
        return;
      }
      seen.push(kind);
      rows.push(...parsed);
    });
    return { rows, seen, missing };
  }, []);

  /** First pass: read every document once. Everything after this is a delta. */
  const fullLoad = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPhase({ state: "loading", loaded: 0, total: 0, missingKinds: [] });
    try {
      const { rows, missing } = await readIndexes();
      if (rows.length === 0) {
        setPhase({ state: "failed", loaded: 0, total: 0, missingKinds: missing });
        return;
      }
      let loaded = 0;
      setPhase({ state: "loading", loaded: 0, total: rows.length, missingKinds: missing });
      const docs = await pooled(
        rows,
        CONCURRENCY,
        (r) => getJson(`${CONTENT_BASE}/${r.path}`),
        () => {
          loaded++;
          if (loaded % 32 === 0) {
            setPhase({ state: "loading", loaded, total: rows.length, missingKinds: missing });
          }
        },
      );
      scanRef.current = {
        entries: rows.map((r, i) => coverageEntryFromDoc(r.kind, r.id, docs[i])),
        hashes: new Map(rows.map((r) => [`${r.kind}/${r.id}`, r.hash])),
      };
      setPhase({ state: "ready", loaded: rows.length, total: rows.length, missingKinds: missing });
      setLastCheckedAt(Date.now());
      setVersion((v) => v + 1);
    } finally {
      busy.current = false;
    }
  }, [readIndexes]);

  /** A poll tick: re-read the indexes, then only the documents that moved. */
  const check = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    if (scanRef.current.entries.length === 0) {
      void fullLoad();
      return;
    }
    busy.current = true;
    setChecking(true);
    try {
      const planPromise = loadPlan();
      const { rows, seen, missing } = await readIndexes();
      setPlan(await planPromise);
      const { scan: pruned, stale } = diffScan(scanRef.current, rows, seen);
      const take = stale.slice(0, MAX_REREAD_PER_TICK);
      const docs =
        take.length > 0
          ? await pooled(take, CONCURRENCY, (r) => getJson(`${CONTENT_BASE}/${r.path}`))
          : [];
      scanRef.current = mergeDocs(
        pruned,
        take.map((row, i) => ({ row, doc: docs[i] })),
      );
      setPendingReread(stale.length - take.length);
      if (take.length > 0) setRereadTotal((n) => n + take.length);
      setPhase((p) => ({ ...p, state: "ready", missingKinds: missing }));
      setLastCheckedAt(Date.now());
      setVersion((v) => v + 1);
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [fullLoad, readIndexes]);

  // first pass on mount, then the poll
  useEffect(() => {
    void fullLoad().then(() => loadPlan().then(setPlan));
  }, [fullLoad]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [auto, check]);

  /**
   * The byte scan is OPT-IN and manual. It fetches every declared icon file, so
   * unlike the index poll it is not something to leave running on a timer; the
   * page states plainly that until it has run, "declared but unfetchable" is
   * unknown rather than zero.
   */
  const scanBytes = useCallback(() => {
    if (scanningBytes) return;
    const paths = declaredIconPaths(scanRef.current.entries);
    if (paths.length === 0) return;
    setScanningBytes(true);
    void hashIcons(paths, { base: CONTENT_BASE })
      .then((h) => {
        setIcons(h);
        setVersion((v) => v + 1);
      })
      .finally(() => setScanningBytes(false));
  }, [scanningBytes]);

  const failed = icons ? new Set(icons.failed) : undefined;
  const coverage = computeIconCoverage({
    entries: scanRef.current.entries,
    plan,
    applyCandidates,
    ...(failed ? { failedIcons: failed } : {}),
  });
  // `version` is the mutation beacon for the scan ref: touching it here keeps
  // the recompute honest without pretending the ref is reactive state.
  void version;

  return {
    coverage,
    plan,
    scan: phase,
    lastCheckedAt,
    checking,
    rereadTotal,
    pendingReread,
    auto,
    setAuto,
    checkNow: useCallback(() => void check(), [check]),
    icons,
    duplicates: icons ? duplicateIconGroups(icons.hashes) : new Map(),
    scanningBytes,
    scanBytes,
  };
}
