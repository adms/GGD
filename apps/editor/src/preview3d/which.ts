/**
 * Which collections have a Babylon 3D panel. Kept in a tiny Babylon-free
 * module so PreviewPanel can decide WITHOUT pulling the (lazy-loaded) engine
 * chunk into the base bundle.
 */
import type { CollectionName } from "@ggd/shared/content";

export const COLLECTIONS_WITH_3D: readonly CollectionName[] = [
  "models",
  "vfx",
  "arenas",
  "champions",
  // GH#324 —— 地圖版面：整條產生器流程（編譯 + 九項驗證 + 背景）就地跑。
  "maps",
];

export function has3DPreview(collection: CollectionName): boolean {
  return COLLECTIONS_WITH_3D.includes(collection);
}
