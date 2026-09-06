import { useEffect, useMemo, useState } from "react";
import type { HeroWork } from "@ggd/shared/content/communityHero";
import { HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import type { HeroDraftPayload } from "./store";
import { heroEditFingerprint } from "./communityDrafts";
import { heroIconOwners, heroTransferDraft, type HeroTransferDraft } from "./draftAssets";
import type { HeroConflictChoice } from "./conflictResolution";

export interface HeroDraftDifference { path: string; local: unknown; remote: unknown }
function comparable(value: Partial<HeroDraftPayload> | null | undefined) {
  return { project: value?.project, rawInputs: value?.rawInputs ?? {}, mode: value?.mode, origin: value?.origin, originalIconRefs: value?.originalIconRefs ?? {}, source: value?.source };
}
export function compareHeroDrafts(local: HeroDraftPayload, remote: unknown): HeroDraftDifference[] {
  const rows: HeroDraftDifference[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (Object.is(a, b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
      const left = a as Record<string, unknown>; const right = b as Record<string, unknown>;
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) walk(left[key], right[key], path ? `${path}.${key}` : key);
    } else rows.push({ path, local: a, remote: b });
  };
  walk(comparable(local), comparable(remote as Partial<HeroDraftPayload>), "");
  return rows;
}
function fieldName(path: string): string {
  const names: Record<string, string> = { "project.brief.name": "英雄名稱", "project.brief.concept": "角色概念與原文", "project.brief.moveNames": "招式名稱", "project.acceptedPlan.slots": "技能", "project.presentation.slots": "技能演出", "project.presentation.championIcon": "英雄肖像", "project.sourceLock": "原作來源", rawInputs: "未完成輸入", originalIconRefs: "原圖版本", source: "署名改作來源", mode: "編輯深度", origin: "出身" };
  const prefix = Object.keys(names).find((key) => path === key || path.startsWith(`${key}.`));
  return prefix ? names[prefix] + path.slice(prefix.length).replaceAll(".", " / ") : path.replace(/^project\./, "英雄 / ").replaceAll(".", " / ");
}
function text(value: unknown): string {
  if (value === undefined) return "未設定";
  if (value === null) return "空值";
  if (Object.is(value, -0)) return "-0";
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}
function images(value: Partial<HeroTransferDraft> | null) {
  if (!value?.project?.presentation?.slots || HERO_SLOTS.some((slot) => !value.project!.presentation.slots[slot])) return [];
  return heroIconOwners(value.project).flatMap((owner, index) => {
    const original = Array.isArray(value.originalIcons) ? value.originalIcons.find((icon) => icon?.contentPath === owner.path) : undefined;
    const normalized = Array.isArray(value.normalizedIcons) ? value.normalizedIcons.find((icon) => icon?.path === owner.path) : undefined;
    const base64 = original?.base64 ?? normalized?.base64;
    const mime = original?.mimeType ?? "image/webp";
    return typeof base64 === "string" && base64.length <= 28 * 1024 * 1024 && ["image/png", "image/jpeg", "image/webp"].includes(mime)
      ? [{ label: index === 0 ? "英雄肖像" : owner.docId.split(".").at(-1)!.toUpperCase(), src: `data:${mime};base64,${base64}` }] : [];
  });
}

export function HeroDraftComparison({ local, remote, remoteLabel, emptyMessage = "作品內容相同。" }: {
  local: HeroDraftPayload; remote: unknown; remoteLabel: string; emptyMessage?: string;
}) {
  const fingerprint = heroEditFingerprint(local);
  const rows = useMemo(() => compareHeroDrafts(local, remote), [fingerprint, remote]);
  const [page, setPage] = useState(0);
  const [snapshot, setSnapshot] = useState<HeroTransferDraft | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false; setPage(0); setSnapshot(null); setImageError(null);
    void heroTransferDraft(local).then((value) => { if (!cancelled) setSnapshot(value); }).catch((error: unknown) => { if (!cancelled) setImageError(String(error)); });
    return () => { cancelled = true; };
  }, [fingerprint, remote]);
  const lastPage = Math.max(0, Math.ceil(rows.length / 50) - 1); const currentPage = Math.min(page, lastPage);
  return <section className="hero-draft-conflict" aria-label={`比較本機與${remoteLabel}`}>
    {rows.length ? <><p>共 {rows.length} 個欄位不同 · 第 {currentPage + 1}／{lastPage + 1} 頁</p>
      <table><thead><tr><th scope="col">欄位</th><th scope="col">本機</th><th scope="col">{remoteLabel}</th></tr></thead>
        <tbody>{rows.slice(currentPage * 50, currentPage * 50 + 50).map((row) => <tr key={row.path}><th scope="row">{fieldName(row.path)}</th><td><pre>{text(row.local)}</pre></td><td><pre>{text(row.remote)}</pre></td></tr>)}</tbody></table>
      {lastPage > 0 ? <div className="hero-actions"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁差異</button><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>下一頁差異</button></div> : null}
    </> : <p>{emptyMessage}</p>}
    <div className="hero-conflict-images">{[["本機圖片", snapshot], [`${remoteLabel}圖片`, remote]] .map(([label, value]) => <div key={String(label)}><h5>{String(label)}</h5>{images(value as HeroTransferDraft).map((icon) => <figure key={icon.label}><img src={icon.src} alt={`${label} · ${icon.label}`} width={80} height={80} /><figcaption>{icon.label}</figcaption></figure>)}</div>)}</div>
    {imageError ? <p role="alert">本機圖片未能完整讀取：{imageError}</p> : null}
  </section>;
}

export function HeroDraftConflictView({ local, remote, busy, onChoose }: {
  local: HeroDraftPayload; remote: HeroWork; busy: boolean; onChoose(choice: HeroConflictChoice): void;
}) {
  return <section aria-label="雲端草稿衝突">
    <h4>雲端已有第 {remote.draftRevision} 版</h4>
    <p>兩份原稿會先保存為本機副本。採本機只更新下表比較的雲端版本；若雲端再有變更，會重新要求比較。</p>
    <HeroDraftComparison local={local} remote={remote.draft} remoteLabel={`雲端第 ${remote.draftRevision} 版`} emptyMessage="作品內容相同，雲端保存版本不同。" />
    <div className="hero-actions">
      <button type="button" disabled={busy} onClick={() => onChoose("local")}>採本機並同步</button>
      <button type="button" disabled={busy} onClick={() => onChoose("remote")}>採遠端並開啟</button>
      <button type="button" disabled={busy} onClick={() => onChoose("new-work")}>本機另存新作</button>
    </div>
    <p>另存新作會建立新的作品身分，保留原文、鎖定與圖片。之後可單獨同步新作。</p>
  </section>;
}
