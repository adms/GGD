import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CollectionIndex } from "@ggd/shared/content";
import { SegmentInspector } from "./SegmentInspector";
import { VfxAssetPalette } from "./VfxAssetPalette";
import { assetKey, type AssetSafetyResult } from "./assetSafety";
import type { AssetDrop } from "./model";

function index(collection: "models" | "vfx", ids: readonly string[]): CollectionIndex {
  return {
    collection,
    hash: "000000000000",
    entries: ids.map((id) => ({ id, path: `${collection}/${id}.json`, hash: "000000000000", size: 1 })),
  };
}

function safety(asset: AssetDrop, safe: boolean): AssetSafetyResult {
  return {
    asset,
    safe,
    code: safe ? "SAFE" : "TEXTURE_BACKDROP",
    summary: safe ? "去背通過" : "可見底板",
  };
}

describe("VFX Forge authoring surfaces", () => {
  it("only exposes drag handles after the same asset has a safe receipt", () => {
    const safe: AssetDrop = { collection: "models", id: "model.safe" };
    const unsafe: AssetDrop = { collection: "models", id: "model.unsafe" };
    const markup = renderToStaticMarkup(
      <VfxAssetPalette
        models={index("models", [safe.id, unsafe.id, "model.pending"])}
        vfx={index("vfx", [])}
        onAdd={vi.fn()}
        onProbe={vi.fn()}
        safety={new Map([
          [assetKey(safe), safety(safe, true)],
          [assetKey(unsafe), safety(unsafe, false)],
        ])}
      />,
    );
    expect(markup).toContain("model.safe");
    expect(markup).toContain("去背通過");
    expect(markup).toMatch(/draggable="true" aria-disabled="false" class="vfx-asset safe"/);
    expect(markup).toMatch(/draggable="false" aria-disabled="true" class="vfx-asset unsafe"/);
    expect(markup).toMatch(/draggable="false" aria-disabled="true" class="vfx-asset pending"/);
  });

  it("renders the continuous VFX controls as sliders from shared schema bounds", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <SegmentInspector
          segment={{
            kind: "vfx",
            on: "castEffect",
            vfxId: "fx.safe",
            at: "point",
            durationSec: 1,
            w3xScale: 1,
            alpha: 1,
            tint: [255, 255, 255],
            facingDeg: 0,
            flyHeight: 0,
            timeScale: 1,
          }}
          index={0}
          count={1}
          errors={{}}
          onChange={vi.fn()}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onMove={vi.fn()}
        />
      </QueryClientProvider>,
    );
    for (const label of ["W3x Scale", "Alpha", "Facing Deg", "Fly Height", "Time Scale"]) {
      expect(markup, `${label} 沒有 schema-bounded slider`).toContain(`aria-label="${label} slider"`);
    }
    expect(markup).toContain("128 w3u = 1 個場景單位");
  });
});
