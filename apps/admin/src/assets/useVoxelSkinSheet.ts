/**
 * useVoxelSkinSheet — the I/O half of 體素外觀對照表.
 *
 * One feed: `/content/champions/_index.json` + every champion doc it names,
 * plus the optional L1 override sidecar. Everything else on the page is
 * COMPUTED from those by the shared generator, so there is no report to go
 * stale and nothing to keep in sync.
 *
 * Failures are honest: a missing content mount leaves the page empty and says
 * which URL it could not read, rather than rendering a plausible-looking sheet
 * of zeroes.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CHAMPION_INDEX_URL,
  VOXEL_OVERRIDES_URL,
  buildSheet,
  parseChampionIndex,
  parseOverrides,
  type SkinRow,
  type SkinSheetStats,
} from "./voxelSkinSheet";
import { loadDocsByIds } from "../content";

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export interface SheetState {
  loading: boolean;
  rows: SkinRow[];
  stats: SkinSheetStats | null;
  error: string | null;
  reload: () => void;
}

export function useVoxelSkinSheet(): SheetState {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SkinRow[]>([]);
  const [stats, setStats] = useState<SkinSheetStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [indexRaw, overridesRaw] = await Promise.all([
        getJson(CHAMPION_INDEX_URL),
        getJson(VOXEL_OVERRIDES_URL),
      ]);
      const entries = parseChampionIndex(indexRaw);
      if (entries.length === 0) {
        if (!cancelled) {
          setError(`無法讀取 ${CHAMPION_INDEX_URL} — 內容掛載點不可用，本頁不會猜測數字。`);
          setRows([]);
          setStats(null);
          setLoading(false);
        }
        return;
      }
      const docs = (
        await Promise.all(entries.map((e) => getJson(`/content/${e.path}`)))
      ).filter((d): d is Record<string, unknown> => !!d && typeof d === "object");
      if (cancelled) return;
      // GH#1250 —— 「共用替身」看模型文件的 glb ⇒ 只抓英雄真的指到的那幾份模型文件。
      const modelKeys = [
        ...new Set(docs.map((d) => d["modelKey"]).filter((k): k is string => typeof k === "string")),
      ];
      // ⚠️ 讀不到 ⇒ 那一欄一律「不是替身」而畫面長得完全正常 ⇒ 一定要說出來（fail-open 沒錯，靜默才是缺陷）。
      const modelDocs = await loadDocsByIds("models", modelKeys).catch(() => null);
      if (cancelled) return;
      const missingModels = modelDocs === null ? modelKeys.length : modelKeys.filter((k) => !modelDocs.has(k)).length;
      const built = buildSheet(
        docs as never,
        parseOverrides(overridesRaw),
        modelDocs ?? new Map(),
      );
      setRows(built.rows);
      setStats(built.stats);
      const problems = [
        ...(docs.length < entries.length ? [`${entries.length - docs.length} 份英雄文件讀取失敗，對照表不完整。`] : []),
        ...(missingModels > 0 ? [`${missingModels} 份模型文件讀取失敗，「共用替身」一欄不完整。`] : []),
      ];
      if (problems.length > 0) setError(problems.join(" "));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { loading, rows, stats, error, reload };
}
