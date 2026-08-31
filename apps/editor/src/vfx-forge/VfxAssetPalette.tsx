import { useMemo, useState } from "react";
import type { CollectionIndex } from "@ggd/shared/content";
import { encodeAssetDrag, type AssetDrop } from "./model";

export function VfxAssetPalette({
  models,
  vfx,
  onAdd,
}: {
  models?: CollectionIndex;
  vfx?: CollectionIndex;
  onAdd(asset: AssetDrop): void;
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
          return (
            <button
              type="button"
              draggable
              className="vfx-asset"
              key={entry.id}
              title={entry.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-ggd-vfx-asset", encodeAssetDrag(asset));
              }}
              onDoubleClick={() => onAdd(asset)}
            >
              <span>{tab === "models" ? "◆" : "✦"}</span>
              <code>{entry.id}</code>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
