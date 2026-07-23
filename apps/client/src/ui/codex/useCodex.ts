/**
 * useCodex — React shell over the live data layer. Deliberately thin: it owns
 * NO content logic (that is codexData / codexSearch / codexIssues, all pure and
 * node-tested), only the load lifecycle.
 *
 *   • ONE load per page session, memoised at module scope, so re-opening the
 *     codex from the lobby or the pause menu is instant.
 *   • `reload()` drops the memo and re-reads /content — the manual proof of the
 *     liveness requirement 「動態即時非寫死」: edit a JSON, press 重新載入, see it.
 *   • the ICON-BYTE scan is ON DEMAND (a button), never automatic. See below.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ICON-BYTE SCAN IS NO LONGER AUTOMATIC
 * ---------------------------------------------------------------------------
 * This hook used to fire `hashIcons(declaredIconPaths(data))` two seconds after
 * the docs landed, on EVERY codex open. Measured against the content on disk
 * today that is 279 distinct icon files = 1,913,613 B (1.83 MB: champions
 * 1,039,910 / items 766,575 / abilities 107,128) downloaded IN FULL — the hash
 * needs the bytes — for one supplementary product: `duplicateIconGroups()`, the
 * duplicate-art report at the bottom of the page. (The old header comment's
 * "113 PNGs / one short HTTP burst" predated the item + ability icon sets.)
 *
 * THE SIDECAR SHORTCUT DOES NOT EXIST. `content/assets/**` holds 874 `.hash`
 * sidecars, but ZERO of them are under `content/assets/icons/` — they are all
 * TTS/audio. And tools/icon-gen/src/generate.py's sidecar is an IDEMPOTENCE
 * hash over the INPUTS (template version + prompt + family + model + quality
 * tier), not a digest of the emitted image, so even where one existed it could
 * not answer "do these two paths hold the same picture?". Byte-identical art
 * from two different prompts is exactly the bug being hunted, and it would be
 * invisible to that hash.
 *
 * So the scan stays a true content hash — and becomes explicit. It runs when
 * the operator presses 掃描圖示位元組 in the broken-data report, which states
 * the cost first. Everything else on the page is unaffected: the duplicate
 * group is simply absent until asked for, exactly as it already was for the
 * first two seconds of every session.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadCodex } from "./codexData";
import { hashIcons, type IconHashes } from "@ggd/shared/codex/codexIcons";
import { loadPlan, type CodexPlan } from "@ggd/shared/codex/codexPlan";
import type { CodexData } from "@ggd/shared/codex/codexTypes";

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
  /** how many distinct icon files `startIconScan()` would download (0 until the
   *  docs land). Shown on the button so the cost is stated before it is paid. */
  iconScanFileCount: number;
  /** run the duplicate-art content hash NOW. No-op while one is in flight. */
  startIconScan: () => void;
  /** null until the plan fetch settles, and permanently null when none exists */
  plan: CodexPlan | null;
  reload: () => void;
}

/** Every distinct icon path declared anywhere in the loaded content. */
export function declaredIconPaths(data: CodexData): string[] {
  const out = new Set<string>();
  for (const c of data.champions) if (c.icon) out.add(c.icon);
  for (const a of data.abilities) if (a.icon) out.add(a.icon);
  for (const i of data.items) if (i.icon) out.add(i.icon);
  return [...out];
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

  // ON-DEMAND pass: content hashes for the duplicate-icon report (see header
  // for why this is no longer automatic — 279 files / 1,913,613 B per open).
  //
  // STILL DELIBERATELY GENTLE when it does run. The rows on screen are loading
  // the very same images through <img>; at full concurrency this scan would
  // race them for the browser's per-host connections and some of those <img>
  // loads would be starved, latching IconImg's fallback glyph for the rest of
  // the session. So it keeps the low concurrency it always had.
  //
  // `alive` is an unmount guard held in a ref, not a per-effect closure: the
  // scan is started by an event handler now, so there is no effect body to
  // scope it to.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const inFlight = useRef(false);
  const startIconScan = useCallback(() => {
    if (!data || inFlight.current) return; // one scan at a time
    inFlight.current = true;
    setIconScan("running");
    const settle = (h: IconHashes | null): void => {
      inFlight.current = false;
      if (!alive.current) return;
      if (h) setIcons(h);
      setIconScan("done");
    };
    hashIcons(declaredIconPaths(data), { concurrency: 4 }).then(settle, () => settle(null));
  }, [data]);

  const reload = useCallback(() => {
    resetCodexCache();
    setData(null);
    setIcons(null);
    setIconScan("idle");
    setPlan(null);
    setEpoch((e) => e + 1);
  }, []);

  return {
    data,
    loading: data === null && error === null,
    error,
    icons,
    iconScan,
    iconScanFileCount: data ? declaredIconPaths(data).length : 0,
    startIconScan,
    plan,
    reload,
  };
}
