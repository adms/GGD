import type { CollectionName } from "@ggd/shared/content";

/** Top-level authoring flows. VFX Forge proposes only vfx-scripts; Promote owns live writes. */
export type AppMode =
  | { kind: "collection"; collection: CollectionName | null }
  | { kind: "forge" }
  | { kind: "vfx-forge" }
  | { kind: "works" }
  | { kind: "hero" }
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
/**
 * ⭐⭐ GH#1270 —— **玩家版**只有兩個畫面：創作英雄與我的作品。
 *
 * ⚠️ 這不是「把按鈕藏起來」：`VITE_GGD_PLAYER_EDITOR=1` 的那一份 bundle 連
 * 路由都不認得內部流程（集合瀏覽／鑄技工坊／特效工坊／匯出中心）——
 * ⛔ 直接打 `/editor/forge` 也只會回到英雄工坊，⭐ 而那幾支頁面在這一份 build 裡
 * **連位元組都沒有**（`App.tsx` 的 `PLAYER_ONLY ? null : lazy(...)` ⇒ rollup 不產那些 chunk）。
 * ⛔ 它**不是**授權機制：正式站的寫入仍然只走需要登入的 `/api/v1/hero-*`。
 */
export const PLAYER_ONLY: boolean = import.meta.env.VITE_GGD_PLAYER_EDITOR === "1";

/** 玩家版的預設畫面 ＝ 創作英雄（⛔ 不是集合瀏覽器，那一頁在這份 build 裡不存在）。 */
const PLAYER_DEFAULT_MODE: AppMode = { kind: "hero" };

export function appModeFromPathname(pathname: string): AppMode {
  const path = normalizedPath(pathname);
  if (PLAYER_ONLY) {
    if (path.endsWith("/works")) return { kind: "works" };
    return PLAYER_DEFAULT_MODE;
  }
  if (path.endsWith("/works")) return { kind: "works" };
  if (path.endsWith("/hero-forge")) return { kind: "hero" };
  if (path.endsWith("/vfx-forge")) return { kind: "vfx-forge" };
  if (path.endsWith("/forge")) return { kind: "forge" };
  if (path.endsWith("/export")) return { kind: "export" };
  return DEFAULT_MODE;
}

/** Build a stable top-level URL under Vite's configured editor base path. */
export function pathnameForAppMode(mode: AppMode, basePath: string): string {
  const normalizedBase = `/${basePath}`.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (mode.kind === "works") return `${normalizedBase}/works`;
  if (mode.kind === "hero") return `${normalizedBase}/hero-forge`;
  if (mode.kind === "vfx-forge") return `${normalizedBase}/vfx-forge`;
  if (mode.kind === "forge") return `${normalizedBase}/forge`;
  if (mode.kind === "export") return `${normalizedBase}/export`;
  return `${normalizedBase}/`;
}
