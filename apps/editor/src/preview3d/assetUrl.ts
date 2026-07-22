/**
 * Content-relative asset paths ("assets/...") -> URLs served by the dev
 * content-api (proxied by Vite under the same /content-api prefix the JSON
 * endpoints use). Pure string math so it is unit-testable and reusable from
 * both the Babylon panels and tests.
 */

const BASE = "/content-api";

/** "assets/textures/p.png" -> "/content-api/assets/textures/p.png" */
export function assetUrl(contentPath: string): string {
  if (!contentPath.startsWith("assets/")) {
    throw new Error(`asset path must start with "assets/": ${contentPath}`);
  }
  return `${BASE}/${contentPath}`;
}

/**
 * Babylon's SceneLoader wants (rootUrl, fileName). Split a content-relative
 * glb path into those two halves, already mapped through the content-api.
 */
export function glbUrlParts(contentPath: string): { rootUrl: string; fileName: string } {
  const full = assetUrl(contentPath);
  const cut = full.lastIndexOf("/") + 1;
  return { rootUrl: full.slice(0, cut), fileName: full.slice(cut) };
}
