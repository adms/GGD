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
}: {
  models?: CollectionIndex;
  vfx?: CollectionIndex;
  onAdd(asset: AssetDrop): void | Promise<void>;
  safety: ReadonlyMap<string, AssetSafetyResult | "checking">;
  onProbe(asset: AssetDrop): void;
}) {
  const [tab, setTab] = useState<AssetDrop["collection"]>("models");
  const [filter, setFilter] = useState("");
  const entries = useMemo(() => {
    const source = tab === "models" ? models : vfx;
    const q = filter.trim().toLowerCase();
    return (source?.entries ?? []).filter((e) => !q || e.id.toLowerCase().includes(q)).slice(0, 300);
  }, [filter, models, tab, vfx]);

  return (
    <aside className="vfx-assets">
      <h2>資源池</h2>
      <div className="vfx-tabs">
        <button type="button" className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}>3D Model</button>
        <button type="button" className={tab === "vfx" ? "active" : ""} onClick={() => setTab("vfx")}>粒子 VFX</button>
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜尋資源 id" />
      <p className="vfx-help">拖到預覽或時間軸；雙擊可直接加入。</p>
      <div className="vfx-asset-list">
        {entries.map((entry) => {
          const asset: AssetDrop = { collection: tab, id: entry.id };
          const state = safety.get(assetKey(asset));
          const unsafe = state !== undefined && state !== "checking" && !state.safe;
          const safetyLabel = state === "checking"
            ? "檢查中"
            : state
              ? state.safe ? "去背通過" : "禁止：底板風險"
              : "待驗證";
          return (
            <button
              type="button"
              draggable={!unsafe}
              className={`vfx-asset${unsafe ? " unsafe" : state && state !== "checking" ? " safe" : ""}`}
              key={entry.id}
              title={`${entry.id}\n${state && state !== "checking" ? `${state.summary}${state.detail ? `\n${state.detail}` : ""}` : safetyLabel}`}
              onPointerEnter={() => onProbe(asset)}
              onFocus={() => onProbe(asset)}
              onDragStart={(e) => {
                if (unsafe) { e.preventDefault(); return; }
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-ggd-vfx-asset", encodeAssetDrag(asset));
              }}
              onDoubleClick={() => { if (!unsafe) void onAdd(asset); }}
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
