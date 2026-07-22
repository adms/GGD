/**
 * The "Accept" orchestration for a generated icon, kept pure (no React) so the
 * flow is unit-testable with a mocked content-api. Two effects, in order:
 *   1. write the PNG to content/assets/icons/<kind>/<docId>.png via the
 *      content-api asset-write path,
 *   2. set the doc's top-level `icon` field to that content-relative path
 *      (marks the draft dirty — the user then Saves the doc as usual).
 */
import { iconAssetPath, iconKindFor } from "./prompt";
import { toRawBase64 } from "./client";

export interface AcceptIconDeps {
  /** save the PNG to content/<contentPath> (e.g. api.putAsset). */
  putAsset(contentPath: string, base64: string): Promise<unknown>;
  /** set a field on the current draft (e.g. the store's `update`). */
  setField(dataPath: string, value: unknown): void;
}

export interface AcceptIconArgs {
  collection: string;
  docId: string;
  /** raw base64 or a data URL — normalized before storage. */
  pngBase64: string;
  deps: AcceptIconDeps;
}

/** The doc field the icon path is written to (top-level on all icon kinds). */
export const ICON_FIELD = "icon";

export async function acceptIcon(args: AcceptIconArgs): Promise<{ assetPath: string }> {
  const kind = iconKindFor(args.collection);
  if (!kind) throw new Error(`collection "${args.collection}" has no icon field`);
  const assetPath = iconAssetPath(kind, args.docId);
  await args.deps.putAsset(assetPath, toRawBase64(args.pngBase64));
  args.deps.setField(ICON_FIELD, assetPath);
  return { assetPath };
}
