/**
 * Dashboard state (zustand). The event-application logic is pure and exported
 * so it can be unit-tested without a browser or a live runner.
 */
import { create } from "zustand";
import { api, subscribeRunEvents } from "./api";
import type {
  CoverageMatrix,
  RunnerEvent,
  RunSnapshot,
  Suite,
  SuiteStatus,
  RunStatus,
  SuitesResponse,
} from "./types";

export const MAX_LOG_LINES = 2000;

/** Pure: fold one SSE event into a run snapshot (immutably). */
export function applyEvent(run: RunSnapshot, ev: RunnerEvent): RunSnapshot {
  switch (ev.type) {
    case "suite-start":
      return {
        ...run,
        suites: run.suites.map((s) =>
          s.suite.id === ev.suiteId ? { ...s, status: "running" as SuiteStatus } : s,
        ),
      };
    case "suite-end":
      return {
        ...run,
        suites: run.suites.map((s) =>
          s.suite.id === ev.suiteId
            ? {
                ...s,
                status: (ev.status ?? "fail") as SuiteStatus,
                exitCode: ev.exitCode,
                durationMs: ev.durationMs ?? s.durationMs,
              }
            : s,
        ),
      };
    case "run-end":
      return {
        ...run,
        status: (ev.status ?? "fail") as RunStatus,
        gate: ev.gate ?? run.gate,
      };
    case "line":
    default:
      return run;
  }
}

/** Pure: append a line event to the per-suite log map (capped). */
export function appendLog(
  logs: Record<string, string[]>,
  ev: RunnerEvent,
  cap: number = MAX_LOG_LINES,
): Record<string, string[]> {
  if (ev.type !== "line" || !ev.suiteId) return logs;
  const prev = logs[ev.suiteId] ?? [];
  const prefix = ev.stream === "stderr" ? "! " : "";
  const next = [...prev, `${prefix}${ev.text ?? ""}`];
  return { ...logs, [ev.suiteId]: next.length > cap ? next.slice(next.length - cap) : next };
}

/**
 * Pure: group suites by category in the fixed execution order. Regression is
 * ALWAYS pinned last (mirrors the runner's hard-coded invariant) even if the
 * server-provided order were ever tampered with.
 */
export function groupByCategory(
  suites: Suite[],
  categoryOrder: string[],
): { category: string; suites: Suite[] }[] {
  const order = [...categoryOrder.filter((c) => c !== "regression"), "regression"];
  const groups: { category: string; suites: Suite[] }[] = [];
  for (const category of order) {
    const inCat = suites.filter((s) => s.category === category);
    if (inCat.length > 0) groups.push({ category, suites: inCat });
  }
  return groups;
}

export interface DashboardState {
  categoryOrder: string[];
  suites: Suite[];
  run: RunSnapshot | null;
  logs: Record<string, string[]>;
  selectedSuite: string | null;
  tab: "runs" | "coverage";
  coverage: CoverageMatrix | null;
  error: string | null;
  connected: boolean;

  init: () => Promise<void>;
  ingest: (ev: RunnerEvent) => void;
  startRun: (body: {
    mode: string;
    category?: string;
    suiteId?: string;
    stepped?: boolean;
  }) => Promise<void>;
  next: () => Promise<void>;
  cancel: () => Promise<void>;
  rerunFailed: () => Promise<void>;
  selectSuite: (id: string | null) => void;
  setTab: (tab: "runs" | "coverage") => void;
  loadCoverage: () => Promise<void>;
}

let unsubscribe: (() => void) | null = null;

export const useStore = create<DashboardState>((set, get) => ({
  categoryOrder: [],
  suites: [],
  run: null,
  logs: {},
  selectedSuite: null,
  tab: "runs",
  coverage: null,
  error: null,
  connected: false,

  init: async () => {
    try {
      const res: SuitesResponse = await api.suites();
      set({ suites: res.suites, categoryOrder: res.categoryOrder, connected: true, error: null });
    } catch (e) {
      set({ connected: false, error: `runner unreachable: ${(e as Error).message}` });
    }
  },

  /** Fold one runner event into the active run (exported for tests via actions). */
  ingest: (ev: RunnerEvent) => {
    const { run, logs } = get();
    if (!run) return;
    const nextRun = applyEvent(run, ev);
    const nextLogs = appendLog(logs, ev);
    const patch: Partial<DashboardState> = { run: nextRun, logs: nextLogs };
    if (ev.type === "suite-start" && ev.suiteId && !get().selectedSuite) {
      patch.selectedSuite = ev.suiteId;
    }
    if (ev.type === "run-end") {
      unsubscribe?.();
      unsubscribe = null;
    }
    set(patch);
  },

  startRun: async (body) => {
    try {
      unsubscribe?.();
      const snap = await api.createRun(body);
      set({ run: snap, logs: {}, error: null, selectedSuite: null, tab: "runs" });
      unsubscribe = subscribeRunEvents(snap.id, (ev) => get().ingest(ev));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  next: async () => {
    const run = get().run;
    if (!run) return;
    try {
      await api.next(run.id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  cancel: async () => {
    const run = get().run;
    if (!run) return;
    try {
      await api.cancel(run.id);
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  rerunFailed: async () => {
    const run = get().run;
    if (!run) return;
    try {
      unsubscribe?.();
      const snap = await api.rerunFailed(run.id);
      set({ run: snap, logs: {}, error: null, selectedSuite: null });
      unsubscribe = subscribeRunEvents(snap.id, (ev) => get().ingest(ev));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  selectSuite: (id) => set({ selectedSuite: id }),
  setTab: (tab) => set({ tab }),

  loadCoverage: async () => {
    try {
      const coverage = await api.coverage();
      set({ coverage, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));
