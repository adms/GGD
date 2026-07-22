/**
 * GLB loading through the content-api asset route. Registers the glTF loader
 * plugin (side-effect import) exactly once for the whole preview3d module.
 */
import "@babylonjs/loaders/glTF";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { assetUrl } from "./assetUrl";

/** Load a content-relative .glb ("assets/models/...") into an AssetContainer. */
export function loadGlbContainer(scene: Scene, contentPath: string): Promise<AssetContainer> {
  return LoadAssetContainerAsync(assetUrl(contentPath), scene, {
    pluginExtension: ".glb",
  });
}
