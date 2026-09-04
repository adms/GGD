import type { CollectionName } from "@ggd/shared/content";

/** Top-level authoring flows. VFX Forge proposes only vfx-scripts; Promote owns live writes. */
export type AppMode =
  | { kind: "collection"; collection: CollectionName | null }
  | { kind: "forge" }
  | { kind: "vfx-forge" }
  | { kind: "export" };

const DEFAULT_MODE: AppMode = { kind: "collection", collection: "champions" };

function normalizedPath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? pathname;
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

/**
 * Resolve the initial screen from a shareable/deep-linked URL. Unknown paths
 * deliberately fall back to the normal collection browser instead of trying
 * to infer a document id from arbitrary path segments.
 */
export function appModeFromPathname(pathname: string): AppMode {
  const path = normalizedPath(pathname);
  if (path.endsWith("/vfx-forge")) return { kind: "vfx-forge" };
  if (path.endsWith("/forge")) return { kind: "forge" };
  if (path.endsWith("/export")) return { kind: "export" };
  return DEFAULT_MODE;
}

/** Build a stable top-level URL under Vite's configured editor base path. */
export function pathnameForAppMode(mode: AppMode, basePath: string): string {
  const normalizedBase = `/${basePath}`.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (mode.kind === "vfx-forge") return `${normalizedBase}/vfx-forge`;
  if (mode.kind === "forge") return `${normalizedBase}/forge`;
  if (mode.kind === "export") return `${normalizedBase}/export`;
  return `${normalizedBase}/`;
}
