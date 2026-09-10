import { afterEach, expect, it } from "vitest";
import { setContentAssetVersion, withContentVersion } from "./assetVersion";
import { setFrozenMatchAssetUrls } from "./frozenAssets";
afterEach(()=>{setContentAssetVersion(null);setFrozenMatchAssetUrls(null);});
it("reads immutable restored models from the platform while an existing match keeps its own pinned bytes",()=>{
  const name="a".repeat(64)+".glb", path="assets/hero-instances/"+name;
  setContentAssetVersion("cv-new");
  expect(withContentVersion("/content/"+path)).toBe("/api/v1/content-overlay/assets/"+name);
  setFrozenMatchAssetUrls(new Map([[path,"blob:old-match-model"]]));
  expect(withContentVersion("/content/"+path)).toBe("blob:old-match-model");
  expect(withContentVersion("/content/assets/models/other.glb")).toBe("/content/assets/models/other.glb?h=cv-new");
});
