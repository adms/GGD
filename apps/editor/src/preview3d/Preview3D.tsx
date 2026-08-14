/**
 * Preview3D — collection -> Babylon panel dispatcher. Mounted by PreviewPanel
 * only for collections that have a 3D view (models / vfx / arenas /
 * champions); everything else keeps the existing data-only preview.
 */
import { useQuery } from "@tanstack/react-query";
import type { CollectionName } from "@ggd/shared/content";
import { api } from "../api/client";
import { ModelPanel } from "./ModelPanel";
import { VfxPanel } from "./VfxPanel";
import { ArenaPanel } from "./ArenaPanel";
import { MapPanel } from "./MapPanel";

/** champions embed: resolve champion.modelKey -> models/<key> doc -> GLB */
function ChampionModelEmbed({ doc }: { doc: unknown }) {
  const modelKey =
    typeof doc === "object" && doc !== null && typeof (doc as { modelKey?: unknown }).modelKey === "string"
      ? (doc as { modelKey: string }).modelKey
      : null;

  const query = useQuery({
    queryKey: ["preview3d-model", modelKey],
    queryFn: () => api.doc("models", modelKey!),
    enabled: modelKey !== null,
    retry: false,
    staleTime: 10_000,
  });

  if (!modelKey) return <p className="preview-note">Set modelKey to see the character.</p>;
  if (query.isError) {
    return (
      <p className="preview-note">
        No <code>models/{modelKey}</code> doc yet — author it to see the character here.
      </p>
    );
  }
  if (!query.data) return <p className="preview-note">Loading model doc…</p>;
  return <ModelPanel doc={query.data} autoPlay="idle" />;
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
    default:
      return null;
  }
}

export default Preview3D;
