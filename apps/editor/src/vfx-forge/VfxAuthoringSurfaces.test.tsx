// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CollectionIndex } from "@ggd/shared/content";
import { SegmentInspector } from "./SegmentInspector";
import { VfxAssetPalette } from "./VfxAssetPalette";
import { assetKey, type AssetSafetyResult } from "./assetSafety";
import type { AssetDrop } from "./model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    expect(markup).toMatch(/draggable="true" aria-describedby="vfx-asset-help" class="vfx-asset safe"/);
    expect(markup).toMatch(/draggable="false" aria-describedby="vfx-asset-help" class="vfx-asset unsafe"/);
    expect(markup).toMatch(/draggable="false" aria-describedby="vfx-asset-help" class="vfx-asset pending"/);
    expect(markup).toContain("雙擊會先檢查，安全才加入");
    expect(markup).toContain("去背通過 1");
    expect(markup).toContain("禁止 1");
    expect(markup).toContain("待驗證 1");
    expect(markup).toContain("驗證本頁待驗證素材");
  });

  it("offers a bounded page scan without making pending assets draggable", () => {
    const pending: AssetDrop = { collection: "models", id: "model.pending" };
    const onProbeAll = vi.fn();
    const markup = renderToStaticMarkup(
      <VfxAssetPalette
        models={index("models", [pending.id])}
        vfx={index("vfx", [])}
        onAdd={vi.fn()}
        onProbe={vi.fn()}
        onProbeAll={onProbeAll}
        safety={new Map()}
      />,
    );
    expect(markup).toContain("驗證本頁待驗證素材");
    expect(markup).toContain('draggable="false"');
  });

  it("does not hide later reusable VFX behind a fixed palette cap", async () => {
    const ids = Array.from({ length: 301 }, (_, i) => `fx.${i}`);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <VfxAssetPalette
          models={index("models", [])}
          vfx={index("vfx", ids)}
          onAdd={vi.fn()}
          onProbe={vi.fn()}
          safety={new Map()}
        />,
      );
    });
    const vfxTab = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "粒子 VFX");
    await act(async () => vfxTab!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("本頁 301 項");
    expect(host.textContent).toContain("fx.300");
    await act(async () => root.unmount());
  });

  it("lets a pending double-click enter the guarded add path on the first attempt", async () => {
    const pending: AssetDrop = { collection: "models", id: "model.pending" };
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <VfxAssetPalette
          models={index("models", [pending.id])}
          vfx={index("vfx", [])}
          onAdd={onAdd}
          onProbe={vi.fn()}
          safety={new Map()}
        />,
      );
    });
    const button = host.querySelector<HTMLButtonElement>("button.vfx-asset");
    expect(button).not.toBeNull();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith(pending);
    await act(async () => root.unmount());
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
