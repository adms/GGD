/**
 * useVfxCensus — the LOAD half of 特效真實引用普查 (#230).
 *
 * Three fetches, all against the same `/content` mount the game itself boots
 * from, so editing a JSON and reopening the page changes what it says:
 *
 *   GET /content/assets/vfx/w3x-ability-provenance.json  the archaeology
 *   GET /content/assets/vfx/w3x-families.json            the 34 fx.w3x families
 *   GET /content/vfx/_index.json                         which docs actually ship
 *
 * They live under `content/assets/**` rather than in `content/vfx/`, alongside
 * `w3x-families.json`, because everything inside `content/vfx/` must be a
 * schema-valid `vfx@1` document — `vfxParticles.test.ts` rejects sidecars there.
 *
 * LAZY BY DESIGN. The provenance file is ~540 kB: it carries every art channel
 * of every ability, including the ~1300 Blizzard-stock paths that are the whole
 * point of the "what is missing" half. Nothing pulls it until the census section
 * is actually opened, so the asset console's other sections cost nothing extra.
 * The fetch is memoised at module scope, so closing and reopening is free.
 *
 * A MISSING SIDECAR IS NOT AN ERROR STATE THAT BLANKS THE PAGE. A checkout that
 * has never run `python3 tools/w3x-import/build_vfx_census.py` still gets the
 * live half — every champion × slot with its current `vfxKey` — and a banner
 * naming the exact command. A census that renders nothing teaches nothing.
 */
import { useEffect, useState } from "react";
import type { FamilyManifest, ProvenanceFile } from "./vfxCensus";

export const PROVENANCE_URL = "/content/assets/vfx/w3x-ability-provenance.json";
export const FAMILIES_URL = "/content/assets/vfx/w3x-families.json";
export const VFX_INDEX_URL = "/content/vfx/_index.json";
export const REGENERATE_COMMAND = "python3 tools/w3x-import/build_vfx_census.py";

export interface VfxCensusSources {
  readonly provenance: ProvenanceFile | null;
  readonly families: FamilyManifest | null;
  readonly vfxDocIds: ReadonlySet<string>;
  /** which of the three fetches failed, by name — never a silent empty page */
  readonly missing: readonly string[];
}

interface VfxIndex {
  entries?: readonly { id?: string }[];
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function loadSources(): Promise<VfxCensusSources> {
  const [provenance, families, index] = await Promise.all([
    getJson<ProvenanceFile>(PROVENANCE_URL),
    getJson<FamilyManifest>(FAMILIES_URL),
    getJson<VfxIndex>(VFX_INDEX_URL),
  ]);
  const missing: string[] = [];
  if (!provenance) missing.push(PROVENANCE_URL);
  if (!families) missing.push(FAMILIES_URL);
  if (!index) missing.push(VFX_INDEX_URL);
  return {
    provenance,
    families,
    vfxDocIds: new Set((index?.entries ?? []).map((e) => e.id).filter((id): id is string => !!id)),
    missing,
  };
}

let cached: Promise<VfxCensusSources> | null = null;

export interface VfxCensusState extends VfxCensusSources {
  readonly loading: boolean;
}

const EMPTY: VfxCensusSources = {
  provenance: null,
  families: null,
  vfxDocIds: new Set(),
  missing: [],
};

/** `enabled` gates the fetch, so the 540 kB sidecar loads only when opened. */
export function useVfxCensusSources(enabled: boolean): VfxCensusState {
  const [state, setState] = useState<VfxCensusSources>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    cached ??= loadSources();
    void cached.then((s) => {
      if (!alive) return;
      setState(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { ...state, loading };
}

/** Drop the memo so the next open re-reads /content (the 動態即時 proof). */
export function resetVfxCensusCache(): void {
  cached = null;
}
