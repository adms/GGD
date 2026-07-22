/**
 * useModelBudget — the I/O half of 模型預算.
 *
 * Two independent feeds, on purpose:
 *
 *   report   task #99's measurement, probed across BUDGET_CANDIDATE_URLS (or a
 *            URL the operator pinned). This is the ONLY source of triangle
 *            counts, texture sizes, VRAM and usage on the page.
 *   live     /content/models/_index.json — which model documents exist RIGHT
 *            NOW. Content, not a measurement; it is what makes the report's
 *            staleness detectable instead of assumed.
 *
 * Each fails independently and says so. A missing report must not hide the
 * inventory (the operator still needs the work list), and an unreachable
 * content mount must not make an old report look current.
 *
 * The pinned URL lives in localStorage so it survives a reload, and it is a
 * plain string the operator typed — never anything discovered from a response.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUDGET_CANDIDATE_URLS,
  MODEL_INDEX_URL,
  parseBudgetReport,
  parseModelIndex,
  reconcile,
  type BudgetReport,
  type LiveModel,
  type Reconciliation,
} from "./modelBudget";

const PIN_KEY = "ggd.admin.modelBudgetUrl";

export function readPinnedUrl(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writePinnedUrl(url: string): void {
  try {
    if (url === "") localStorage.removeItem(PIN_KEY);
    else localStorage.setItem(PIN_KEY, url);
  } catch {
    /* private mode — the page still works, it just forgets */
  }
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export interface ModelBudgetState {
  readonly report: BudgetReport | null;
  readonly live: readonly LiveModel[];
  readonly recon: Reconciliation;
  readonly indexFailed: boolean;
  readonly tried: readonly string[];
  readonly loading: boolean;
  readonly checkedAt: number | null;
  readonly pinnedUrl: string;
  readonly setPinnedUrl: (url: string) => void;
  readonly reload: () => void;
}

export function useModelBudget(): ModelBudgetState {
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [live, setLive] = useState<readonly LiveModel[]>([]);
  const [indexFailed, setIndexFailed] = useState(false);
  const [tried, setTried] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [pinnedUrl, setPinned] = useState<string>(() => readPinnedUrl());
  const [epoch, setEpoch] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    const candidates = pinnedUrl ? [pinnedUrl, ...BUDGET_CANDIDATE_URLS] : BUDGET_CANDIDATE_URLS;

    const findReport = async (): Promise<{ found: BudgetReport | null; tried: string[] }> => {
      const attempted: string[] = [];
      for (const url of candidates) {
        attempted.push(url);
        const parsed = parseBudgetReport(await getJson(url), url);
        if (parsed) return { found: parsed, tried: attempted };
      }
      return { found: null, tried: attempted };
    };

    void Promise.all([findReport(), getJson(MODEL_INDEX_URL)]).then(([r, idx]) => {
      if (!alive.current) return;
      setReport(r.found);
      setTried(r.tried);
      setIndexFailed(idx === null);
      setLive(idx === null ? [] : parseModelIndex(idx));
      setCheckedAt(Date.now());
      setLoading(false);
    });

    return () => {
      alive.current = false;
    };
  }, [epoch, pinnedUrl]);

  const setPinnedUrl = useCallback((url: string) => {
    const t = url.trim();
    writePinnedUrl(t);
    setPinned(t);
  }, []);

  return {
    report,
    live,
    recon: reconcile(live, report),
    indexFailed,
    tried,
    loading,
    checkedAt,
    pinnedUrl,
    setPinnedUrl,
    reload: useCallback(() => setEpoch((e) => e + 1), []),
  };
}
