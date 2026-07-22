/**
 * minimapIcons — champion portraits for the minimap's canvas markers.
 *
 * The HUD/shop/champ-select draw w3x icons through <IconImg>, which is a React
 * <img> with a graceful null fallback (task #21/#33). A canvas cannot use that,
 * so this module is the same rule expressed as an image cache: resolve the URL
 * with the SHARED `championIconUrl` helper, load it once, and expose it as a
 * drawable. Champions whose WC3 art was Blizzard stock have no `icon` field and
 * champions whose PNG 404s both settle in `failed`, and the minimap falls back
 * to a team-coloured dot — never a blank marker, never a broken image.
 *
 * The loader is injectable so the state machine is testable in node.
 */
import { championIconUrl } from "../icons";

/** What the canvas can draw (an <img>); null = use the caller's fallback. */
export type PortraitImage = CanvasImageSource & { width: number; height: number };

type Entry = { state: "loading" } | { state: "ready"; image: PortraitImage } | { state: "failed" };

export interface PortraitLoader {
  (url: string, onLoad: (image: PortraitImage) => void, onError: () => void): void;
}

/** Default loader: a plain detached <img>. No-op outside the browser. */
const domLoader: PortraitLoader = (url, onLoad, onError) => {
  if (typeof Image === "undefined") {
    onError();
    return;
  }
  const img = new Image();
  img.decoding = "async";
  img.onload = () => onLoad(img as unknown as PortraitImage);
  img.onerror = onError;
  img.src = url;
};

/**
 * Process-wide portrait cache. One entry per champion id; a champion with no
 * icon, or whose icon failed, is remembered as `failed` so the minimap never
 * retries it 12 times a second.
 */
export class PortraitCache {
  private readonly entries = new Map<string, Entry>();
  /** load attempts started — the fallback test asserts we never re-request. */
  requests = 0;

  constructor(private readonly load: PortraitLoader = domLoader) {}

  /**
   * The drawable portrait for a champion, or null while it loads / when it has
   * no icon at all. Starts the load on first ask; safe to call every frame.
   */
  portraitFor(championId: string | null | undefined): PortraitImage | null {
    if (!championId) return null;
    const hit = this.entries.get(championId);
    if (hit) return hit.state === "ready" ? hit.image : null;
    const url = championIconUrl(championId);
    if (!url) {
      // no w3x art for this champion — settle immediately, fall back to a dot
      this.entries.set(championId, { state: "failed" });
      return null;
    }
    this.entries.set(championId, { state: "loading" });
    this.requests++;
    this.load(
      url,
      (image) => this.entries.set(championId, { state: "ready", image }),
      () => this.entries.set(championId, { state: "failed" }),
    );
    return null;
  }

  /** Cache state for a champion — "missing" until first asked. */
  stateOf(championId: string): "missing" | "loading" | "ready" | "failed" {
    return this.entries.get(championId)?.state ?? "missing";
  }

  clear(): void {
    this.entries.clear();
    this.requests = 0;
  }
}

/** The minimap's shared cache (portraits survive map swaps and remounts). */
export const portraitCache = new PortraitCache();
