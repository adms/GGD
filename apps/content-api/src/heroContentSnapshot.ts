import { z } from "zod";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { OverlayContentSource, type OverlayBundle } from "@ggd/shared/content/overlay";
import type { ContentFacts } from "@ggd/shared/content/import/targetProfile";
import { ZIP_LIMITS } from "@ggd/shared/content/import/zipSafety";
import { readBoundedBody } from "./externalProfile";

const overlaySchema = z.object({ generation: z.number().int().nonnegative(), docs: z.record(z.unknown()), deleted: z.record(z.boolean()) });
export type HeroOverlayReader = () => Promise<OverlayBundle>;
export class HeroContentUnavailable extends Error { readonly statusCode = 503; }

/** Deployment-owned URL, never a submitted URL. Publication must fail closed on an unavailable overlay. */
export async function readHeroOverlay(platformUrl: string): Promise<OverlayBundle> {
  const url = new URL(`${platformUrl.replace(/\/$/, "")}/api/v1/content-overlay/bundle`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("英雄匯入的 Platform 來源設定不合法。");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(4000), headers: { accept: "application/json", "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`無法取得目前遊戲內容覆蓋層（HTTP ${response.status}）。`);
  return overlaySchema.parse(JSON.parse(new TextDecoder().decode(await readBoundedBody(response, ZIP_LIMITS.maxEntryUncompressedBytes))));
}

/** Same merge and contentVersion as the game. One captured overlay travels with one worker job. */
export async function readHeroContentSnapshot(root: string, readOverlay?: HeroOverlayReader): Promise<{ content: ContentFacts; overlay?: OverlayBundle }> {
  let overlay: OverlayBundle | undefined;
  try { overlay = readOverlay ? overlaySchema.parse(await readOverlay()) : undefined; }
  catch (error) { throw new HeroContentUnavailable(`目前無法確認遊戲內容快照，請稍後重試：${error instanceof Error ? error.message : String(error)}`); }
  const base = new FsContentSource(root);
  const manifest = await (overlay ? new OverlayContentSource(base, overlay) : base).readManifest();
  const collectionHashes: Record<string, string> = {};
  for (const key of Object.keys(manifest.collections).sort()) {
    const entry = manifest.collections[key as keyof typeof manifest.collections];
    if (entry) collectionHashes[key] = entry.hash;
  }
  return { content: { contentVersion: manifest.contentVersion, collectionHashes }, ...(overlay ? { overlay } : {}) };
}
