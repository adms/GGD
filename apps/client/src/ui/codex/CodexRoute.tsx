/**
 * CodexRoute — how the codex is REACHED.
 *
 * The client has no router; screens are a state machine in ui/platform/store
 * ("boot → auth → lobby → match"). The codex is not one of those screens: it is
 * an overlay that must open from ALL of them — the lobby header, the in-match
 * pause menu, and a plain URL — without touching the screen machine (which two
 * other tasks are editing) and without unmounting a live match.
 *
 * So it hangs off the URL hash: `#codex` opens it, closing restores the URL.
 * That also makes it deep-linkable and screenshot-friendly: a reviewer can open
 * http://localhost:39527/#codex directly, no login and no match required.
 *
 * Mounted ONCE, at the top of AppRoot, next to the audio conductor.
 */
import { useEffect, useState } from "react";
import { CodexPage } from "./CodexPage";

export const CODEX_HASH = "#codex";

function hashIsCodex(): boolean {
  return typeof window !== "undefined" && window.location.hash === CODEX_HASH;
}

/** Open the codex from anywhere (lobby button, pause menu, console). */
export function openCodex(): void {
  if (typeof window === "undefined") return;
  window.location.hash = CODEX_HASH.slice(1);
}

/** Close it and leave the URL clean (no dangling "#"). */
export function closeCodex(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new Event("hashchange"));
}

export function CodexRoute(): React.JSX.Element | null {
  const [open, setOpen] = useState(hashIsCodex);

  useEffect(() => {
    const onHash = (): void => setOpen(hashIsCodex());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return open ? <CodexPage onClose={closeCodex} /> : null;
}
