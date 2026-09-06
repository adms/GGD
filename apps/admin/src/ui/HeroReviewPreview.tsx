import { Component, type ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentStore, registerAll, HERO_SLOTS, type HeroSlot } from "@ggd/shared/content";
import { isCollectionName } from "@ggd/shared/content/schema/index";
import { readPackageZip } from "@ggd/shared/content/import/readPackageZip";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import type { HeroPackageReplay } from "@ggd/shared/content/import/heroPackage";
import type { HeroReviewView } from "@ggd/shared/content/communityHero";
import { HeroPreview, type FrozenHeroPreviewContent } from "../../../editor/src/hero/HeroPreview";
import { applyVfxRuntimeLimits } from "../../../editor/src/vfx-forge/runtimeLimits";
import { readTargetProfileFacts } from "../../../editor/src/export-center/exportPolicy";
import { heroReviewApi } from "../heroReview";
import { api } from "../api";
import "../../../editor/src/styles.css";

const queryClient = new QueryClient();
const ignoreChange = () => {};
type Preview = { review: HeroReviewView; replay: HeroPackageReplay; content: FrozenHeroPreviewContent };
class PreviewBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) { return { error: String(error) }; }
  override render() { return this.state.error ? <p role="alert">固定版本預覽失敗：{this.state.error}。請回到審查頁退回此版本，原始快照仍保留。</p> : this.props.children; }
}

/** A separate browsing context owns the snapshot's registries and asset lifetime. */
export function HeroReviewPreview({ submissionId }: { submissionId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<HeroSlot>("Q");
  useEffect(() => {
    let active = true;
    const urls = new Map<string, string>();
    const load = async () => {
      const [review, target] = await Promise.all([heroReviewApi.read(submissionId), api.request("/hero-import/target-profile")]);
      const facts = readTargetProfileFacts(target); const manifest = review.snapshot.inspection.manifest;
      if (facts.gameRevision !== manifest.base.gameRevision || facts.contentVersion !== manifest.base.contentVersion || facts.migrationFingerprint !== manifest.migrationFingerprint || facts.authoringProcessorFingerprint !== manifest.authoringProcessor.fingerprint) throw new Error("此送審版本與目前遊戲版本不同，請作者更新後重新送審；原始快照仍保留。");
      const response = await heroReviewApi.package(submissionId);
      const pkg = readPackageZip(new Uint8Array(await response.arrayBuffer()));
      if (!active) return;
      const project = review.snapshot.inspection.project;
      const root = pkg.documents.find((entry) => entry.path === `authoring/hero-projects/${project.projectId}.json`);
      if (pkg.manifest.packageDigest !== review.snapshot.version.packageDigest || contentSha256(root?.document) !== contentSha256(project)) throw new Error("預覽套件與送審快照不一致。");
      const evidence = pkg.validation.find((entry) => entry.path === "validation/hero-simulation.json")?.document as { replay?: HeroPackageReplay } | undefined;
      const replay = evidence?.replay;
      if (!replay || replay.revision !== project.revision || replay.errors.length || replay.scenarios.length !== 6 || replay.kit.status !== "accepted") throw new Error("快照缺少可重播的完整英雄驗證紀錄。");
      const documents = new Map<string, unknown>();
      const store = new ContentStore();
      for (const entry of pkg.compiled) {
        const parts = entry.path.split("/");
        const collection = parts[1]; const id = parts[2]?.replace(/\.json$/, "");
        if (!collection || !isCollectionName(collection) || !id) throw new Error("固定遊戲資料的路徑不合法。");
        documents.set(`${collection}/${id}`, entry.document); store.add(collection, id, entry.document);
      }
      if (contentSha256(documents.get(`champions/${project.projectId}`)) !== contentSha256(replay.compiled.champion)) throw new Error("重播英雄與固定遊戲資料不一致。");
      for (const slot of HERO_SLOTS) if (contentSha256(documents.get(`abilities/${replay.compiled.abilityDrafts[slot].id}`)) !== contentSha256(replay.compiled.abilityDrafts[slot])) throw new Error("重播技能與固定遊戲資料不一致。");
      for (const asset of pkg.assets) {
        if (!(asset.bytes instanceof Uint8Array)) throw new Error("固定資產缺少位元組。");
        const entry = pkg.manifest.entries.find((entry) => entry.path === asset.path)!;
        urls.set(asset.path, URL.createObjectURL(new Blob([Uint8Array.from(asset.bytes)], { type: entry.mime })));
      }
      registerAll(store, { onTemplateFailure: "throw", representation: "verified-runtime" });
      applyVfxRuntimeLimits();
      const content: FrozenHeroPreviewContent = {
        limitWarnings: [],
        async fetchDoc<T>(collection: "models" | "vfx", id: string): Promise<T> {
          const doc = documents.get(`${collection}/${id}`);
          if (!doc) throw new Error(`快照缺少 ${collection}/${id}`);
          return doc as T;
        },
        resolveAssetUrl(path: string) {
          const url = urls.get(path);
          if (!url) throw new Error(`快照缺少資產：${path}`);
          return url;
        },
      };
      if (active) setPreview({ review, replay, content });
    };
    void load().catch((cause: unknown) => { if (active) setError(String(cause)); });
    return () => { active = false; for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, [submissionId]);
  return <QueryClientProvider client={queryClient}><main style={{ padding: 12 }}>
    {error ? <p role="alert">{error}</p> : !preview ? <p role="status">正在核對送審快照並載入固定資產…</p> : <>
      <p>第 {preview.review.snapshot.inspection.project.revision} 版的固定模擬紀錄 · {preview.review.snapshot.inspection.project.brief.name}</p>
      <div className="hero-actions" role="group" aria-label="選擇審查技能">{HERO_SLOTS.map((item) => <button key={item} type="button" aria-pressed={item === slot} onClick={() => setSlot(item)}>{item}</button>)}</div>
      <PreviewBoundary key={preview.review.snapshot.id}><HeroPreview project={preview.review.snapshot.inspection.project} slot={slot} result={preview.replay} current editable={false} errors={{}} onChange={ignoreChange} frozenContent={preview.content} /></PreviewBoundary>
    </>}
  </main></QueryClientProvider>;
}
