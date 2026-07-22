/**
 * AssetManager — shared .glb loading. Each distinct path under content/
 * (e.g. "assets/models/champions/mage.glb") is fetched ONCE into an
 * AssetContainer and cached; every consumer instantiates from that container
 * (instantiateModelsToScene), so 12 champions on screen cost one GLB parse.
 * load() resolves null on any failure — callers keep their procedural
 * fallback (client-06). The glTF loader plugin is imported lazily inside
 * load() so headless tests never pull it in.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

export class AssetManager {
  private readonly cache = new Map<string, Promise<AssetContainer | null>>();

  constructor(
    private readonly scene: Scene,
    private readonly baseUrl = "/content/",
  ) {}

  /**
   * Resolve an AssetContainer for a glb path relative to content/
   * (e.g. "assets/models/props/pillar.glb"), or null when unavailable.
   */
  load(path: string): Promise<AssetContainer | null> {
    let pending = this.cache.get(path);
    if (!pending) {
      pending = this.loadUncached(path);
      this.cache.set(path, pending);
    }
    return pending;
  }

  private async loadUncached(path: string): Promise<AssetContainer | null> {
    try {
      // register the glTF loader on demand (render/-only Babylon surface)
      await import("@babylonjs/loaders/glTF");
      const url = this.baseUrl + path;
      // probe first so a missing file doesn't spam loader errors
      if (typeof fetch === "function") {
        const head = await fetch(url, { method: "HEAD" }).catch(() => null);
        if (!head || !head.ok) return null;
      }
      return await LoadAssetContainerAsync(url, this.scene);
    } catch {
      return null; // caller keeps its procedural fallback
    }
  }
}
