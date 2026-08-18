/**
 * standinSizes — the per-champion size multiplier, for the scenes that are NOT
 * a match (GH#368).
 *
 * `content/models/_standin-overrides.json` is a `_`-prefixed sidecar: it is
 * deliberately absent from `models/_index.json`, so the ContentLoader never
 * hydrates it and the shared registries cannot answer for it. Inside a match
 * `ContentDb` fetches it once and `GameApp.modelOverrideFor` hands the entry to
 * the arena. ⚠️ The lobby never constructs a `GameApp` — 英靈殿 / 商店 /
 * 選擇英雄 run with no ContentDb at all — so before GH#368 there was simply no
 * route by which 小叮噹's authored 0.65 could reach the preview stage, and
 * `StorePreview` fell back to the model doc's raw `scale` instead.
 *
 * Same single-flight shape as `blizzardOverlayModels` next door, and the same
 * degradation contract: a missing / malformed / 404 sidecar resolves to "every
 * champion is 1.0", which is the normalized common height — never a throw, and
 * never a size the player can tell apart from "this champion has no exception".
 */
import type { StandinScaleFields } from "@ggd/shared/content/standinScale";
import { bodyRelativeScale } from "./modelSizing";

/** Same content mount `blizzardOverlay` and `ContentDb` fetch under. */
const SIDECAR_PATH = "/content/models/_standin-overrides.json";

/** Schema tag the sidecar must carry — a mismatched file is ignored wholesale. */
const SIDECAR_SCHEMA = "standin-overrides@2";

interface SidecarFile {
  schema?: string;
  overrides?: Record<string, StandinScaleFields>;
}

class StandinSizes {
  private entries: ReadonlyMap<string, StandinScaleFields> = new Map();
  private inflight: Promise<ReadonlyMap<string, StandinScaleFields>> | null = null;

  /**
   * Fetch the sidecar once per session. Cached single-flight and NEVER
   * rejecting — a caller may await it on every preview swap for free.
   */
  load(): Promise<ReadonlyMap<string, StandinScaleFields>> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const res = await fetch(SIDECAR_PATH);
        if (res.ok) {
          const doc = (await res.json()) as SidecarFile;
          if (doc?.schema === SIDECAR_SCHEMA && doc.overrides) {
            this.entries = new Map(Object.entries(doc.overrides));
          }
        }
      } catch {
        /* keep the empty map: every champion renders at the common height */
      }
      return this.entries;
    })();
    return this.inflight;
  }

  /** The raw sidecar entry, or null. Null both before and after a failed load. */
  entryFor(championId: string | null | undefined): StandinScaleFields | null {
    return (championId && this.entries.get(championId)) || null;
  }

  /**
   * The multiplier to apply on top of height normalization for THIS champion
   * wearing THIS mesh — see {@link bodyRelativeScale} for why the mesh, not the
   * champion, decides which of the sidecar's two numbers applies (#77).
   */
  relativeScaleFor(championId: string | null | undefined, glbPath: string): number {
    return bodyRelativeScale(glbPath, this.entryFor(championId));
  }
}

/** Process-wide singleton — one fetch per session, shared by all preview stages. */
export const standinSizes = new StandinSizes();
