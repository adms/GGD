import { useEffect, useMemo, useState } from "react";
import type { HeroProject, CollectionName } from "@ggd/shared/content";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { uploadedHeroModelPath } from "@ggd/shared/content/modelUpload/heroModelSchema";
import { api } from "../api/client";
import { assetUrl } from "../preview3d/assetUrl";
import { ensurePreviewContentReady } from "../preview/previewContent";
import type { HeroCatalog } from "./catalog";
import type { FrozenHeroPreviewContent } from "./HeroPreview";
import { loadHeroModelBytes } from "./modelAssets";
import { runModelUploadJob, type ModelUploadResult } from "./modelUploadJob";

export function useUploadedHeroModel(project: HeroProject | null, baseCatalog: HeroCatalog) {
  const model = project?.presentation.uploadedModel;
  const key = model ? `${project!.projectId}/${contentSha256(model)}` : null;
  const [loaded, setLoaded] = useState<{ key: string; result: ModelUploadResult; url: string; limits: readonly string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoaded(null); setError(null);
    if (!model || !key) return;
    const abort = new AbortController(); let url: string | undefined;
    void (async () => {
      const bytes = await loadHeroModelBytes(model.sha256);
      const result = await runModelUploadJob({ kind: "verify", bytes, model }, abort.signal);
      const ready = await ensurePreviewContentReady();
      if (abort.signal.aborted) return;
      url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "model/gltf-binary" }));
      setLoaded({ key, result, url, limits: ready.limitWarnings });
    })().catch((reason) => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [key]);
  const current = loaded?.key === key ? loaded : null;
  const catalog = useMemo<HeroCatalog>(() => current && model && project ? { ...baseCatalog, modelIds: [...baseCatalog.modelIds, current.result.document!.id], validatedUploadedModel: { projectId: project.projectId, model } } : baseCatalog, [baseCatalog, current, key]);
  const frozenContent = useMemo<FrozenHeroPreviewContent | undefined>(() => current ? {
    fetchDoc: async <T,>(collection: CollectionName, id: string): Promise<T> => collection === "models" && id === current.result.document!.id ? structuredClone(current.result.document) as T : api.doc<T>(collection, id),
    resolveAssetUrl: (path) => path === uploadedHeroModelPath(current.result.model!) ? current.url : assetUrl(path),
    limitWarnings: [...current.limits, ...current.result.warnings],
  } : undefined, [current]);
  return { catalog, frozenContent, error, ready: !model || !!current };
}
