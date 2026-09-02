import { useMemo, useState } from "react";
import type { CollectionIndex } from "@ggd/shared/content";
import { encodeAssetDrag, type AssetDrop } from "./model";
import { assetKey, type AssetSafetyResult } from "./assetSafety";

export function VfxAssetPalette({
  models,
  vfx,
  onAdd,
  safety,
  onProbe,
  onProbeAll,
}: {
  models?: CollectionIndex;
  vfx?: CollectionIndex;
  onAdd(asset: AssetDrop): void | Promise<void>;
  safety: ReadonlyMap<string, AssetSafetyResult | "checking">;
  onProbe(asset: AssetDrop): void;
  /** Deterministic bulk scan; assets remain unusable until their own receipt is safe. */
  onProbeAll?(assets: readonly AssetDrop[]): void;
}) {
  const [tab, setTab] = useState<AssetDrop["collection"]>("models");
  const [filter, setFilter] = useState("");
  const entries = useMemo(() => {
    const source = tab === "models" ? models : vfx;
    const q = filter.trim().toLowerCase();
    return (source?.entries ?? []).filter((e) => !q || e.id.toLowerCase().includes(q)).slice(0, 300);
  }, [filter, models, tab, vfx]);
  const safetyCounts = useMemo(() => {
    let safe = 0;
    let unsafe = 0;
    let checking = 0;
    for (const entry of entries) {
      const state = safety.get(assetKey({ collection: tab, id: entry.id }));
      if (state === "checking") checking++;
      else if (state?.safe) safe++;
      else if (state) unsafe++;
    }
    return { safe, unsafe, checking, pending: entries.length - safe - unsafe - checking };
  }, [entries, safety, tab]);

  return (
    <aside className="vfx-assets">
      <h2>資源池</h2>
      <div className="vfx-tabs">
        <button type="button" className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}>3D Model</button>
        <button type="button" className={tab === "vfx" ? "active" : ""} onClick={() => setTab("vfx")}>粒子 VFX</button>
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜尋資源 id" />
      <p className="vfx-help" id="vfx-asset-help">
        先點一下或停留游標執行去背檢查；通過後可拖入預覽／時間軸。雙擊會先檢查，安全才加入。
      </p>
      <p className="vfx-help" role="status">
        本頁 {entries.length} 項 · 去背通過 {safetyCounts.safe} · 檢查中 {safetyCounts.checking} ·
        禁止 {safetyCounts.unsafe} · 待驗證 {safetyCounts.pending}
      </p>
      <button
        type="button"
        className="vfx-asset-scan"
        disabled={safetyCounts.pending === 0 || onProbeAll === undefined}
        onClick={() => onProbeAll?.(entries.map((entry) => ({ collection: tab, id: entry.id })))}
      >
        驗證本頁待驗證素材
      </button>
      <div className="vfx-asset-list">
        {entries.map((entry) => {
          const asset: AssetDrop = { collection: tab, id: entry.id };
          const state = safety.get(assetKey(asset));
          const unsafe = state !== undefined && state !== "checking" && !state.safe;
          const verifiedSafe = state !== undefined && state !== "checking" && state.safe;
          const safetyLabel = state === "checking"
            ? "檢查中"
            : state
              ? state.safe ? "去背通過" : "禁止：底板風險"
              : "待驗證";
          return (
            <button
              type="button"
              draggable={verifiedSafe}
              aria-describedby="vfx-asset-help"
              className={`vfx-asset${unsafe ? " unsafe" : verifiedSafe ? " safe" : " pending"}`}
              key={entry.id}
              title={`${entry.id}\n${state && state !== "checking" ? `${state.summary}${state.detail ? `\n${state.detail}` : ""}` : safetyLabel}`}
              onPointerEnter={() => onProbe(asset)}
              onFocus={() => onProbe(asset)}
              onDragStart={(e) => {
                if (!verifiedSafe) { e.preventDefault(); onProbe(asset); return; }
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-ggd-vfx-asset", encodeAssetDrag(asset));
              }}
              onClick={() => { if (!verifiedSafe) onProbe(asset); }}
              // `onAdd` owns the same fail-closed AssetSafetyGate. Calling it
              // for a pending item makes the promise cache do one verification
              // and then adds only on SAFE; the old branch merely probed and
              // forced the user to double-click a second time despite the help
              // text promising direct add.
              onDoubleClick={() => { void onAdd(asset); }}
            >
              <span>{tab === "models" ? "◆" : "✦"}</span>
              <code>{entry.id}</code>
              <small>{safetyLabel}</small>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
