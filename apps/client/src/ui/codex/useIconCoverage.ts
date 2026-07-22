/**
 * useIconCoverage — the I/O half of the 圖示覆蓋率 bar (task #97).
 *
 * The user's ask was 「即時」— live. Not "the number as of whenever you opened
 * the page". So this polls, and it does so cheaply enough to leave running:
 *
 *   every tick  → task #72's icon plan, through ITS OWN reader (codexPlan.ts)
 *               → GET the three <collection>/_index.json
 *   only then   → re-read the DOCS whose index hash actually moved
 *
 * The index hash is a stable hash of the parsed document (fsStore.hashDoc), so
 * writing an `icon` field moves it and a reformat does not. Steady state is
 * therefore 4 small requests per tick; during a generation run it is 4 plus the
 * handful of docs that changed. A full re-read of every document — which is
 * what the initial codex load already paid for — never happens again.
 *
 * IT NEVER CALLS `fetch` ITSELF. `codexLive.test.ts` pins the loader (and the
 * icon scanner) as the only modules in this directory allowed to fetch, so all
 * I/O here goes through codexData's `fetchContentJson`/`fetchContentJsonMany`.
 * That gate is the reason the bar cannot be fed by a baked snapshot.
 *
 * REQUIREMENT: the poll must never make the page worse. It is capped, it skips
 * a tick that is still in flight, it stops when the caller turns it off, and a
 * failed request leaves the previous numbers standing rather than zeroing them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchContentJson, fetchContentJsonMany } from "./codexData";
import { loadPlan, type CodexPlan } from "@ggd/shared/codex/codexPlan";
import {
  COVERAGE_COLLECTION,
  COVERAGE_KINDS,
  computeIconCoverage,
  coverageEntries,
  diffScan,
  mergeDocs,
  parseIndexRows,
  scanFromEntries,
  type CoverageScan,
  type IconCoverage,
  type IndexRow,
} from "@ggd/shared/codex/codexCoverage";
import type { CodexData, CodexKind } from "@ggd/shared/codex/codexTypes";

/** How often the bar re-checks the content mount. */
export const COVERAGE_POLL_MS = 8000;
/** First check after the codex load settles (the icon <img> tiles go first). */
const FIRST_CHECK_MS = 1000;
/**
 * Documents re-read per tick. A batch run lands a few icons per tick, so this
 * is generous; the cap only matters after something rewrites the whole tree
 * (a re-import), where the backlog drains over the following ticks instead of
 * firing hundreds of requests at once.
 */
const MAX_REREAD_PER_TICK = 48;

const EMPTY_SCAN: CoverageScan = { entries: [], hashes: new Map() };

export interface IconCoverageState {
  readonly coverage: IconCoverage;
  /** task #72's published classification, null until it exists */
  readonly plan: CodexPlan | null;
  /** epoch ms of the last completed check; null before the first one */
  readonly lastCheckedAt: number | null;
  readonly checking: boolean;
  /** docs known to have changed but not yet re-read (drains next tick) */
  readonly pendingReread: number;
  /** docs re-read since the page opened — proof the poll is doing something */
  readonly rereadTotal: number;
  readonly auto: boolean;
  readonly setAuto: (v: boolean) => void;
  readonly checkNow: () => void;
}

export function useIconCoverage(
  data: CodexData | null,
  failedIcons: ReadonlySet<string> | undefined,
  applyCandidates: boolean,
): IconCoverageState {
  const scan = useRef<CoverageScan>(EMPTY_SCAN);
  const busy = useRef(false);
  const [version, setVersion] = useState(0);
  const [plan, setPlan] = useState<CodexPlan | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [pendingReread, setPendingReread] = useState(0);
  const [rereadTotal, setRereadTotal] = useState(0);
  const [auto, setAuto] = useState(true);

  // A fresh codex load (first mount, or 重新載入) is the authoritative baseline:
  // every doc was just read, so the scan starts from it with zero extra cost.
  useEffect(() => {
    scan.current = data ? scanFromEntries(coverageEntries(data)) : EMPTY_SCAN;
    setPendingReread(0);
    setVersion((v) => v + 1);
  }, [data]);

  const check = useCallback(async (): Promise<void> => {
    if (busy.current || scan.current.entries.length === 0) return;
    busy.current = true;
    setChecking(true);
    try {
      const planPromise = loadPlan();
      const indexPromise = Promise.all(
        COVERAGE_KINDS.map((k) => fetchContentJson(`${COVERAGE_COLLECTION[k]}/_index.json`)),
      );
      setPlan(await planPromise);
      const indexDocs = await indexPromise;

      const rows: IndexRow[] = [];
      const seen: CodexKind[] = [];
      COVERAGE_KINDS.forEach((kind, i) => {
        const raw = indexDocs[i];
        if (raw === null || raw === undefined) return; // blip: leave this kind alone
        const parsed = parseIndexRows(kind, raw);
        if (parsed.length === 0) return;
        seen.push(kind);
        rows.push(...parsed);
      });

      const { scan: pruned, stale } = diffScan(scan.current, rows, seen);
      const take = stale.slice(0, MAX_REREAD_PER_TICK);
      const docs = take.length > 0 ? await fetchContentJsonMany(take.map((r) => r.path)) : [];
      scan.current = mergeDocs(
        pruned,
        take.map((row, i) => ({ row, doc: docs[i] })),
      );
      setPendingReread(stale.length - take.length);
      if (take.length > 0) setRereadTotal((n) => n + take.length);
      setLastCheckedAt(Date.now());
      setVersion((v) => v + 1);
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    const run = (): void => {
      if (alive) void check();
    };
    const first = setTimeout(run, FIRST_CHECK_MS);
    const timer = auto ? setInterval(run, COVERAGE_POLL_MS) : null;
    return () => {
      alive = false;
      clearTimeout(first);
      if (timer !== null) clearInterval(timer);
    };
  }, [data, auto, check]);

  const coverage = useMemo(
    () =>
      computeIconCoverage({
        entries: scan.current.entries,
        plan,
        applyCandidates,
        ...(failedIcons ? { failedIcons } : {}),
      }),
    // `version` is the mutation beacon for the scan ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, plan, applyCandidates, failedIcons],
  );

  const checkNow = useCallback(() => {
    void check();
  }, [check]);

  return {
    coverage,
    plan,
    lastCheckedAt,
    checking,
    pendingReread,
    rereadTotal,
    auto,
    setAuto,
    checkNow,
  };
}
