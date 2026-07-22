/**
 * cursor/cursorSettings — the persisted cursor-size preference.
 *
 * Same shape as audio/audioSettings and settings/SettingsStore: a versioned
 * localStorage blob under its OWN key, read through a forward-merging clamp, and
 * exposed as plain pub/sub over an immutable snapshot (NOT Zustand — per the
 * client architecture gate, Zustand is confined to the HUD store; ui/useCursor
 * adapts this to React via useSyncExternalStore).
 *
 * Its own key rather than a field on the graphics Settings object, for the same
 * reason the mixer has one: the cursor has no render coupling, and a corrupt
 * graphics blob must never be able to take the pointer with it.
 */
import { DEFAULT_CURSOR_SIZE, isCursorSize, type CursorSize } from "./cursorTheme";

/** localStorage key for the persisted cursor blob. */
export const CURSOR_STORAGE_KEY = "ggd.cursor";

/** Bump when the persisted shape changes; `readCursorPrefs` merges forward. */
export const CURSOR_SETTINGS_VERSION = 1;

export interface CursorPrefs {
  size: CursorSize;
}

export const DEFAULT_CURSOR_PREFS: CursorPrefs = { size: DEFAULT_CURSOR_SIZE };

interface PersistedCursor extends CursorPrefs {
  version: number;
}

/**
 * Normalize any persisted (or partial, or garbage, or future-version) blob into
 * a valid CursorPrefs. Unknown keys are dropped and an unrecognised size falls
 * back to the default, so a blob written by a newer build that adds an "xxl"
 * step degrades to M instead of leaving the player with no cursor at all.
 */
export function clampCursorPrefs(raw: unknown): CursorPrefs {
  const o = (raw ?? {}) as Partial<CursorPrefs>;
  return { size: isCursorSize(o.size) ? o.size : DEFAULT_CURSOR_PREFS.size };
}

type Persist = Pick<Storage, "getItem" | "setItem">;

function safeLocalStorage(): Persist | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // WKWebView private mode throws on access
  }
}

export class CursorSettingsStore {
  private prefs: CursorPrefs;
  private readonly listeners = new Set<(p: CursorPrefs) => void>();

  constructor(private storage: Persist | null = safeLocalStorage()) {
    this.prefs = this.read();
  }

  private read(): CursorPrefs {
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(CURSOR_STORAGE_KEY) ?? null;
    } catch {
      raw = null;
    }
    if (!raw) return { ...DEFAULT_CURSOR_PREFS };
    try {
      return clampCursorPrefs(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_CURSOR_PREFS };
    }
  }

  private commit(next: CursorPrefs): void {
    this.prefs = next;
    const blob: PersistedCursor = { version: CURSOR_SETTINGS_VERSION, ...next };
    try {
      this.storage?.setItem(CURSOR_STORAGE_KEY, JSON.stringify(blob));
    } catch {
      /* quota / private mode — keep the in-memory value, never throw */
    }
    for (const fn of this.listeners) fn(next);
  }

  get(): CursorPrefs {
    return this.prefs;
  }

  /** Current size step. */
  getSize(): CursorSize {
    return this.prefs.size;
  }

  /** Subscribe to any cursor-pref change; returns an unsubscriber. */
  subscribe(fn: (p: CursorPrefs) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Select a size step. A no-op when the size is unchanged, so a picker may
   * fire on every render/drag without churning localStorage or re-notifying.
   */
  setSize(size: CursorSize): void {
    const next = clampCursorPrefs({ size });
    if (next.size === this.prefs.size) return;
    this.commit(next);
  }

  reset(): void {
    this.commit({ ...DEFAULT_CURSOR_PREFS });
  }
}

/** Process-wide cursor preference — read by applyCursor and the settings UI. */
export const cursorSettings = new CursorSettingsStore();
