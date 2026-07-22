/**
 * useCodex — React shell over the live data layer. Deliberately thin: it owns
 * NO content logic (that is codexData / codexSearch / codexIssues, all pure and
 * node-tested), only the load lifecycle.
 *
 *   • ONE load per page session, memoised at module scope, so re-opening the
 *     codex from the lobby or the pause menu is instant.
 *   • `reload()` drops the memo and re-reads /content — the manual proof of the
 *     liveness requirement 「動態即時非寫死」: edit a JSON, press 重新載入, see it.
 *   • the ICON-BYTE scan (113 PNGs) runs AFTER the docs land and never blocks
 *     browsing; the broken-data table fills in when it finishes.
 */
import { useCallback, useEffect, useState } from "react";
import { loadCodex } from "./codexData";
import { hashIcons, type IconHashes } from "@ggd/shared/codex/codexIcons";
import { loadPlan, type CodexPlan } from "@ggd/shared/codex/codexPlan";
import type { CodexData } from "@ggd/shared/codex/codexTypes";

/** How long the icon-byte scan yields to the visible <img> tiles (see below). */
const ICON_SCAN_DELAY_MS = 2000;

let cached: Promise<CodexData> | null = null;
let cachedPlan: Promise<CodexPlan | null> | null = null;

function load(): Promise<CodexData> {
  if (!cached) cached = loadCodex();
  return cached;
}

/**
 * The icon plan is a SEPARATE, OPTIONAL fetch that never gates the page: it is
 * one small file that only the bottom broken-data table reads, and a checkout
 * that has never run the planner must still browse normally.
 */
function loadPlanOnce(): Promise<CodexPlan | null> {
  if (!cachedPlan) cachedPlan = loadPlan();
  return cachedPlan;
}

/** Test-only / reload: forget the memo so the next mount re-reads /content. */
export function resetCodexCache(): void {
  cached = null;
  cachedPlan = null;
}

export type IconScanState = "idle" | "running" | "done";

export interface CodexState {
  data: CodexData | null;
  loading: boolean;
  error: string | null;
  icons: IconHashes | null;
  iconScan: IconScanState;
  /** null until the plan fetch settles, and permanently null when none exists */
  plan: CodexPlan | null;
  reload: () => void;
}

/** Every distinct icon path declared anywhere in the loaded content. */
function declaredIconPaths(data: CodexData): string[] {
  const out: string[] = [];
  for (const c of data.champions) if (c.icon) out.push(c.icon);
  for (const a of data.abilities) if (a.icon) out.push(a.icon);
  for (const i of data.items) if (i.icon) out.push(i.icon);
  return out;
}

export function useCodex(): CodexState {
  const [data, setData] = useState<CodexData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<IconHashes | null>(null);
  const [iconScan, setIconScan] = useState<IconScanState>("idle");
  const [plan, setPlan] = useState<CodexPlan | null>(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    load().then(
      (d) => {
        if (alive) setData(d);
      },
      (err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      },
    );
    loadPlanOnce().then((p) => {
      if (alive) setPlan(p);
    });
    return () => {
      alive = false;
    };
  }, [epoch]);

  // Background pass: content hashes for the duplicate-icon report.
  //
  // DELIBERATELY LAST AND SLOW. The rows that just mounted are loading the very
  // same PNGs through <img>; if this scan raced them for the browser's per-host
  // connections some of those <img> loads would be starved and IconImg would
  // latch its fallback glyph for the rest of the session. So it waits for the
  // visible tiles to settle and then trickles (low concurrency) — the report is
  // supplementary, browsing is not.
  useEffect(() => {
    if (!data) return;
    let alive = true;
    setIconScan("running");
    const timer = setTimeout(() => {
      hashIcons(declaredIconPaths(data), { concurrency: 4 }).then(
        (h) => {
          if (!alive) return;
          setIcons(h);
          setIconScan("done");
        },
        () => {
          if (alive) setIconScan("done");
        },
      );
    }, ICON_SCAN_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [data]);

  const reload = useCallback(() => {
    resetCodexCache();
    setData(null);
    setIcons(null);
    setIconScan("idle");
    setPlan(null);
    setEpoch((e) => e + 1);
  }, []);

  return { data, loading: data === null && error === null, error, icons, iconScan, plan, reload };
}
