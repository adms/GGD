/**
 * AssetConsoleRoute — how 資產主控台 is REACHED (#assets).
 *
 * Same mechanism as #codex and #credits, and deliberately so: the client has no
 * router, screens are a state machine, and this page must open from the lobby,
 * from a live match, and from a bare URL without touching that machine or
 * unmounting a match. Hanging it off the URL hash also makes it deep-linkable
 * and screenshot-friendly — a reviewer opens
 * http://localhost:39527/#assets directly, no login and no match required.
 *
 * THIS IS THE THIRD AND LAST ASSET ROUTE, not a fourth report. Tasks #97
 * (icon coverage), #99 (model budget) and #101 (icon style + provider + cost)
 * were all converging on one question — "what is the real state of the assets?"
 * — and three sibling routes answering it separately would have been worse than
 * one console with sections. #97's bar is imported into this page rather than
 * copied; #99 has a declared, empty section waiting for it.
 *
 * Mounted ONCE, at the top of AppRoot, next to CodexRoute and CreditsRoute.
 */
import { useEffect, useState } from "react";
import { AssetConsolePage } from "./AssetConsolePage";

export const ASSETS_HASH = "#assets";

function hashIsAssets(): boolean {
  return typeof window !== "undefined" && window.location.hash === ASSETS_HASH;
}

/** Open the asset console from anywhere (lobby button, pause menu, console). */
export function openAssetConsole(): void {
  if (typeof window === "undefined") return;
  window.location.hash = ASSETS_HASH.slice(1);
}

/** Close it and leave the URL clean (no dangling "#"). */
export function closeAssetConsole(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new Event("hashchange"));
}

export function AssetConsoleRoute(): React.JSX.Element | null {
  const [open, setOpen] = useState(hashIsAssets);

  useEffect(() => {
    const onHash = (): void => setOpen(hashIsAssets());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return open ? <AssetConsolePage onClose={closeAssetConsole} /> : null;
}
