/**
 * iconTracking — the admin half of ICON 生成追蹤 (task #102).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN
 * --------------------------------------------
 * No counting. No coverage arithmetic. No prompt text. No pricing table. No
 * provider-readiness interpretation. Every one of those already exists and is
 * consumed from where it was built:
 *
 *   coverage maths      @ggd/shared/codex/codexCoverage              (#97)
 *   the exclusion plan  @ggd/shared/codex/codexPlan                  (#97, reads #72)
 *   icon byte scan      @ggd/shared/codex/codexIcons                 (#97)
 *   style spec / cost / @ggd/shared/assetConsole/assetConsoleData    (#101)
 *   provider readiness  ── ditto, over the platform's /api/v1/ai/readiness
 *
 * A second implementation of "how many icons are missing" would diverge from
 * #97's within a day and both numbers would then be worthless. So the admin
 * pages IMPORT those modules rather than copying them. They were built inside
 * apps/client and imported across the app boundary; now that two apps measure
 * from them they live in packages/shared, which both already depend on, and
 * the client's codex/asset-console pages read the SAME files through the same
 * specifiers. The coupling is intentional and is the safer failure: if #97/#101
 * rename a function, this build BREAKS instead of quietly rendering last week's
 * rules.
 *
 * WHAT IS ACTUALLY NEW HERE is one thing the other tasks could not own, because
 * it only exists once all their feeds sit on a single page: the verdict on
 * whether those feeds AGREE, and therefore whether the page's numbers may be
 * believed at all. `trackingNotes` is that verdict. It invents no measurement —
 * it compares measurements that already exist.
 *
 * SECRETS. Nothing in this module or its page reads, requests, renders, logs or
 * stores an API key. The platform's readiness projection carries booleans and a
 * reason code and no key material whatsoever (apps/platform/internal/ai/
 * readiness.go); the masked hint that the AI 生成設定 page shows is not fetched
 * here at all. The page's remedy for "no provider" is a LINK to that page.
 *
 * Pure: no fetch, no React, no clock. useIconTracking.ts does the I/O.
 */
import type { CoverageEntry, IconCoverage } from "@ggd/shared/codex/codexCoverage";
import type { CodexPlan } from "@ggd/shared/codex/codexPlan";
import {
  digestsAgree,
  type Freshness,
  type ProviderProbe,
  type StyleSpec,
} from "@ggd/shared/assetConsole/assetConsoleData";

/** Where the operator fixes a provider problem — this console's own page. */
export const AI_SETTINGS_PAGE = "AI 生成設定";

/** How the content scan is going. The numbers mean nothing until it is done. */
export type ScanState = "idle" | "loading" | "ready" | "failed";

export interface ScanPhase {
  readonly state: ScanState;
  /** documents read so far */
  readonly loaded: number;
  /** documents the indexes say exist (0 until the indexes land) */
  readonly total: number;
  /** collections whose `_index.json` could not be read this pass */
  readonly missingKinds: readonly string[];
}

export const IDLE_SCAN: ScanPhase = { state: "idle", loaded: 0, total: 0, missingKinds: [] };

// -------------------------------------------------------------- verdict -----

export type NoteLevel = "blocked" | "stale" | "unknown" | "ok";

export interface TrackingNote {
  readonly id: string;
  readonly level: NoteLevel;
  readonly text: string;
  /** the concrete next action; "" when there is nothing to do */
  readonly fix: string;
}

export interface TrackingNotesInput {
  readonly scan: ScanPhase;
  readonly coverage: IconCoverage;
  readonly plan: CodexPlan | null;
  readonly spec: StyleSpec | null;
  readonly freshness: Freshness;
  readonly probe: ProviderProbe;
  /** true once the icon byte scan has run — before that `broken` is unknown */
  readonly bytesScanned: boolean;
}

/**
 * Every reason the numbers on this page might be wrong, in the order an
 * operator should care about them. Empty means every feed agreed.
 *
 * "unknown" is reported as loudly as "stale". A page that cannot verify itself
 * and says nothing is precisely the black box the user objected to; the whole
 * point of consolidating these feeds is that their DISAGREEMENTS become
 * visible instead of each page quietly believing its own copy.
 */
export function trackingNotes(input: TrackingNotesInput): TrackingNote[] {
  const notes: TrackingNote[] = [];
  const { scan, coverage, plan, spec, freshness, probe } = input;

  if (scan.state === "failed") {
    notes.push({
      id: "scan-failed",
      level: "blocked",
      text: "讀不到內容索引，本頁的覆蓋率數字全部不可信。",
      fix: "確認 /content 掛載有在服務（開發時由 admin vite 直接讀 repo）。",
    });
    return notes;
  }
  if (scan.state !== "ready") {
    notes.push({
      id: "scan-running",
      level: "unknown",
      text: `正在讀取內容（${scan.loaded}${scan.total > 0 ? ` / ${scan.total}` : ""} 份文件）—— 數字還在往上補。`,
      fix: "",
    });
  }
  if (scan.missingKinds.length > 0) {
    notes.push({
      id: "scan-partial",
      level: "stale",
      text: `這一輪沒有讀到 ${scan.missingKinds.join("、")} 的索引，該分類沿用上一次的數字。`,
      fix: "按「立即檢查」重試。",
    });
  }

  if (plan === null) {
    notes.push({
      id: "no-plan",
      level: "stale",
      text: "任務 #72 的排除清單尚未發布，所以每一筆缺圖都算「待補」——分母偏大。",
      fix: "執行 python3 tools/icon-gen/src/plan.py --write",
    });
  } else if (coverage.planStale) {
    notes.push({
      id: "plan-stale",
      level: "stale",
      text: `計畫自報 ${coverage.planCounts?.docs ?? 0} 筆內容，本頁實測 ${coverage.all.total} 筆 —— 計畫是在不同的內容上跑的。`,
      fix: "重新執行 python3 tools/icon-gen/src/plan.py --write",
    });
  }

  if (spec === null) {
    notes.push({
      id: "no-spec",
      level: "stale",
      text: "樣式規格尚未發布，本頁無法顯示釘住的美術方向、提示詞或價目表。",
      fix: "執行 python3 tools/icon-console/emit_style_spec.py",
    });
  } else {
    if (freshness.state === "stale") {
      notes.push({
        id: "spec-stale",
        level: "stale",
        text: `樣式規格是舊的：${freshness.drifted.map((d) => d.path).join("、")} 自從快照之後已經變動。`,
        fix: "執行 python3 tools/icon-console/emit_style_spec.py",
      });
    } else if (freshness.state === "unknown") {
      notes.push({ id: "spec-unknown", level: "unknown", text: freshness.note, fix: "" });
    }
    if (!digestsAgree(spec, plan?.contentDigest ?? null)) {
      notes.push({
        id: "digest-mismatch",
        level: "stale",
        text: `樣式規格描述的內容摘要（${spec.contentDigest}）與計畫的（${plan?.contentDigest ?? "?"}）不同 —— 兩份檔案講的不是同一版內容。`,
        fix: "先跑 plan.py --write，再跑 emit_style_spec.py，讓兩者對齊。",
      });
    }
  }

  if (probe.state === "unreachable") {
    // #101 separates these two because their fixes are different; conflating
    // them would send the operator to start a service that is already running.
    const stale404 = probe.status === 404;
    notes.push({
      id: "platform-down",
      level: "unknown",
      text: stale404
        ? "platform 正在執行，但這個組建沒有 /ai/readiness 路由，所以無法得知供應商狀態。"
        : "platform 沒有回應，無法得知供應商狀態 —— 這是「問不到」，不是「沒有供應商」。",
      fix: stale404 ? "重新建置並重新啟動 platform。" : "確認 platform 服務正在執行。",
    });
  }

  if (!input.bytesScanned && coverage.all.covered > 0) {
    notes.push({
      id: "bytes-unscanned",
      level: "unknown",
      text: "還沒有實際抓過圖檔位元組，因此「宣告了 icon 但載不到」的筆數目前一定是 0，不代表沒有壞掉的參照。",
      fix: "按「掃描圖檔」開始背景檢查。",
    });
  }

  if (notes.length === 0) {
    notes.push({
      id: "ok",
      level: "ok",
      text: "所有來源彼此一致：計畫、樣式規格與本頁實測描述的是同一份內容。",
      fix: "",
    });
  }
  return notes;
}

// ------------------------------------------------------------ derivations ---

/**
 * The distinct icon paths declared across the scanned entries — the input to
 * #97's byte scan (`hashIcons`). Sorted so the request order is stable.
 */
export function declaredIconPaths(entries: readonly CoverageEntry[]): string[] {
  const out = new Set<string>();
  for (const e of entries) if (e.icon !== null) out.add(e.icon);
  return [...out].sort();
}

/** zh-Hant labels for the three families, in the order the user named them. */
export const KIND_LABEL: Readonly<Record<string, string>> = {
  champion: "英雄",
  ability: "技能",
  item: "武器道具",
};

/**
 * `tier1` / `tier2` counts for the cost estimate, taken from #72's plan.
 *
 * Falls back to (0, backlog) when there is no plan: an estimate must never
 * quietly bill tier1 work that nobody has classified yet, but the operator
 * still needs to see what the whole backlog would cost.
 */
export function tierCounts(
  plan: CodexPlan | null,
  coverage: IconCoverage,
): { tier1: number; tier2: number } {
  if (plan) return { tier1: plan.counts.tier1, tier2: plan.counts.tier2 };
  return { tier1: 0, tier2: coverage.all.backlog };
}

/** Highest-severity level in a note list, for the page's headline lamp. */
export function worstLevel(notes: readonly TrackingNote[]): NoteLevel {
  if (notes.some((n) => n.level === "blocked")) return "blocked";
  if (notes.some((n) => n.level === "stale")) return "stale";
  if (notes.some((n) => n.level === "unknown")) return "unknown";
  return "ok";
}
