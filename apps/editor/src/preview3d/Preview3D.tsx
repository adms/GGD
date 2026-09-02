/**
 * Preview3D — collection -> Babylon panel dispatcher. Mounted by PreviewPanel
 * only for collections that have a 3D view (models / vfx / arenas /
 * champions); everything else keeps the existing data-only preview.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  zChampionDoc,
  zModelDoc,
  zSkinDoc,
  type CollectionName,
  type ChampionDoc,
  type SkinDoc,
} from "@ggd/shared/content";
import { resolveAppearance } from "@ggd/shared/content/import/resolvedAppearance";
import { api } from "../api/client";
import { ModelPanel } from "./ModelPanel";
import { VfxPanel } from "./VfxPanel";
import { ArenaPanel } from "./ArenaPanel";
import { MapPanel } from "./MapPanel";
import { effectiveHeroAppearance } from "./heroAppearance";

function useModelDoc(modelKey: string | null) {
  return useQuery({
    queryKey: ["preview3d-model", modelKey],
    queryFn: () => api.doc("models", modelKey!),
    enabled: modelKey !== null,
    retry: false,
    staleTime: 10_000,
  });
}

function modelQueryState(modelKey: string | null, query: ReturnType<typeof useModelDoc>) {
  if (!modelKey) return <p className="preview-note">Set modelKey to see the character.</p>;
  if (query.isError) {
    return <p className="preview-note">No <code>models/{modelKey}</code> doc yet.</p>;
  }
  if (!query.data) return <p className="preview-note">Loading model doc…</p>;
  return null;
}

function useSkinDocs(championId: string | null): SkinDoc[] {
  const query = useQuery({
    queryKey: ["preview3d-skins", championId],
    queryFn: async () => {
      const index = await api.index("skins");
      const docs = await Promise.all(index.entries.map((entry) => api.doc("skins", entry.id)));
      return docs.flatMap((doc) => {
        const parsed = zSkinDoc.safeParse(doc);
        return parsed.success && parsed.data.championId === championId ? [parsed.data] : [];
      });
    },
    enabled: championId !== null,
    staleTime: 10_000,
  });
  return query.data ?? [];
}

/** Champion preview: base body plus every compatible skin, using runtime composition. */
function ChampionModelEmbed({ doc }: { doc: unknown }) {
  const parsed = zChampionDoc.safeParse(doc);
  const champion = parsed.success ? parsed.data : null;
  const skins = useSkinDocs(champion?.id ?? null);
  const [skinId, setSkinId] = useState("");
  const skin = skins.find((entry) => entry.id === skinId) ?? null;
  const modelKey = skin?.modelKey ?? champion?.modelKey ?? null;
  const query = useModelDoc(modelKey);
  const unavailable = modelQueryState(modelKey, query);

  if (!champion) return <p className="preview-note">Fix validation errors to preview the character.</p>;
  if (unavailable) return unavailable;
  const model = zModelDoc.safeParse(query.data);
  if (!model.success) return <p className="preview-note">Fix model validation errors to preview the character.</p>;
  const resolved = resolveAppearance(
    champion.id,
    { id: champion.id, modelKey },
    model.data,
  );
  if (!resolved.ok) return <p className="preview-note">Appearance failed: {resolved.failure.kind}</p>;
  const appearance = effectiveHeroAppearance(champion, skin);
  return (
    <div className="hero-appearance-preview">
      <label>
        外觀
        <select value={skinId} onChange={(event) => setSkinId(event.target.value)}>
          <option value="">本體 · {champion.modelKey}</option>
          {skins.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      <p className="preview-note">
        實際生效：model <code>{modelKey}</code> · 體型 ×{champion.bodyScale ?? 1} ·
        tint {appearance.tint?.join(",") ?? "neutral"} · alpha {appearance.alpha ?? 1}
        {resolved.appearance.isStandIn ? <strong className="preview-warning"> · ⚠ 共用替身，不能當角色外觀驗收證據</strong> : null}
      </p>
      <ModelPanel
        doc={query.data}
        autoPlay="idle"
        appearance={{ ...appearance, normalizeBody: true }}
      />
    </div>
  );
}

/** Skin preview: edited skin overrides its owner champion field by field. */
function SkinModelEmbed({ doc }: { doc: unknown }) {
  const parsed = zSkinDoc.safeParse(doc);
  const skin = parsed.success ? parsed.data : null;
  const championQuery = useQuery({
    queryKey: ["preview3d-skin-champion", skin?.championId],
    queryFn: () => api.doc<ChampionDoc>("champions", skin!.championId),
    enabled: skin !== null,
    retry: false,
  });
  const modelQuery = useModelDoc(skin?.modelKey ?? null);
  const champion = useMemo(() => {
    const result = zChampionDoc.safeParse(championQuery.data);
    return result.success ? result.data : null;
  }, [championQuery.data]);

  if (!skin) return <p className="preview-note">Fix validation errors to preview the skin.</p>;
  const unavailable = modelQueryState(skin.modelKey, modelQuery);
  if (unavailable) return unavailable;
  if (!champion) return <p className="preview-note">Loading owner champion…</p>;
  const model = zModelDoc.safeParse(modelQuery.data);
  if (!model.success) return <p className="preview-note">Fix model validation errors to preview the skin.</p>;
  const resolved = resolveAppearance(
    champion.id,
    { id: champion.id, modelKey: skin.modelKey },
    model.data,
  );
  if (!resolved.ok) return <p className="preview-note">Appearance failed: {resolved.failure.kind}</p>;
  const appearance = effectiveHeroAppearance(champion, skin);
  return (
    <div className="hero-appearance-preview">
      <p className="preview-note">
        {champion.name} + {skin.name}：model <code>{skin.modelKey}</code> ·
        tint {appearance.tint?.join(",") ?? "neutral"} · alpha {appearance.alpha ?? 1}
        {resolved.appearance.isStandIn ? <strong className="preview-warning"> · ⚠ 共用替身，不能當角色外觀驗收證據</strong> : null}
      </p>
      <ModelPanel
        doc={modelQuery.data}
        autoPlay="idle"
        appearance={{ ...appearance, normalizeBody: true }}
      />
    </div>
  );
}

export function Preview3D({ collection, doc }: { collection: CollectionName; doc: unknown }) {
  switch (collection) {
    case "models":
      return <ModelPanel doc={doc} />;
    case "vfx":
      return <VfxPanel doc={doc} />;
    case "arenas":
      return <ArenaPanel doc={doc} />;
    case "maps":
      return <MapPanel doc={doc} />;
    case "champions":
      return <ChampionModelEmbed doc={doc} />;
    case "skins":
      return <SkinModelEmbed doc={doc} />;
    default:
      return null;
  }
}

export default Preview3D;
