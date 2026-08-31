import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CollectionIndex } from "@ggd/shared/content";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { api } from "../api/client";
import {
  DEFAULT_TARGET_PROFILE_URL,
  packageModeBlockers,
  rawRuntimeSchemaFor,
  readTargetProfileFacts,
  type PackageMode,
  type TargetProfileFacts,
} from "./exportPolicy";

const PROFILE_URL_KEY = "ggd.editor.targetProfileUrl";
const PACKAGE_MODES: readonly { mode: PackageMode; label: string; description: string }[] = [
  { mode: "bootstrap", label: "完整初始快照", description: "目標尚無 authoring store 時建立第一個完整版本。" },
  { mode: "full", label: "完整覆蓋", description: "以完整 membership 建立新的 immutable version。" },
  { mode: "delta", label: "選取部分更新", description: "只帶選取 root、必要依賴與受影響 closure。" },
];

function savedProfileUrl(): string {
  try {
    return localStorage.getItem(PROFILE_URL_KEY) || DEFAULT_TARGET_PROFILE_URL;
  } catch {
    return DEFAULT_TARGET_PROFILE_URL;
  }
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportCenterPage() {
  const [profileUrl, setProfileUrl] = useState(savedProfileUrl);
  const [profile, setProfile] = useState<TargetProfileFacts | null>(null);
  const [profileStatus, setProfileStatus] = useState("尚未讀取目標 profile");
  const [collection, setCollection] = useState<"abilities" | "items">("abilities");
  const [docId, setDocId] = useState("");
  const [exportStatus, setExportStatus] = useState("選擇一份 Runtime 文件");
  const index = useQuery<CollectionIndex>({
    queryKey: ["index", collection],
    queryFn: () => api.index(collection),
  });

  useEffect(() => {
    const first = index.data?.entries[0]?.id ?? "";
    if (!index.data?.entries.some((entry) => entry.id === docId)) setDocId(first);
  }, [docId, index.data]);

  const loadProfile = async (): Promise<void> => {
    setProfileStatus("讀取中…");
    try {
      const raw = await api.externalTargetProfile(profileUrl.trim());
      const facts = readTargetProfileFacts(raw);
      setProfile(facts);
      setProfileStatus(`已讀取 ${facts.schema}`);
      try { localStorage.setItem(PROFILE_URL_KEY, profileUrl.trim()); } catch { /* optional */ }
    } catch (error) {
      setProfile(null);
      setProfileStatus(`⛔ ${String(error)}`);
    }
  };

  const exportRaw = async (): Promise<void> => {
    if (!docId) return;
    setExportStatus("驗證並準備下載…");
    try {
      const doc = await api.doc<Record<string, unknown>>(collection, docId);
      const expected = rawRuntimeSchemaFor(collection);
      if (doc["schema"] !== expected) {
        throw new Error(`${collection}/${docId} 是 ${String(doc["schema"])}，不是 ${expected}`);
      }
      await api.validate(collection, docId, doc);
      const digest = contentSha256(doc);
      downloadJson(doc, `${docId}.json`);
      setExportStatus(`已下載 ${docId}.json · ${digest}`);
    } catch (error) {
      setExportStatus(`⛔ 匯出失敗：${String(error)}`);
    }
  };

  const modeRows = useMemo(() => PACKAGE_MODES.map((row) => ({
    ...row,
    blockers: profile ? packageModeBlockers(profile, row.mode) : ["先讀取 target profile"],
  })), [profile]);

  return (
    <main className="export-center">
      <header className="export-head">
        <div>
          <h1>📦 匯出中心 <small>Export Center</small></h1>
          <p>單檔 Runtime JSON 現在可用；Package JSON／ZIP 只有在目標契約完整時才會解鎖。</p>
        </div>
      </header>

      <section className="export-panel">
        <h2>1. 目標遊戲 Profile</h2>
        <div className="export-profile-row">
          <input aria-label="Target profile URL" value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} />
          <button type="button" onClick={() => void loadProfile()}>讀取 URL</button>
        </div>
        <p className={profileStatus.startsWith("⛔") ? "error" : "export-status"}>{profileStatus}</p>
        {profile ? (
          <dl className="export-facts">
            <div><dt>Content</dt><dd>{profile.contentVersion ?? "未提供"}</dd></div>
            <div><dt>Capabilities</dt><dd>{profile.capabilityFingerprint ?? "未提供"}</dd></div>
            <div><dt>Profile digest</dt><dd>{profile.profileDigest ?? "未提供"}</dd></div>
            <div><dt>Importer</dt><dd>{profile.implementedStage ?? "靜態 profile"}</dd></div>
            <div><dt>Authoring store</dt><dd>{profile.authoringStoreState ?? "未提供"}</dd></div>
          </dl>
        ) : null}
      </section>

      <section className="export-panel">
        <h2>2. 單檔 Runtime JSON</h2>
        <p>契約允許單獨輸出一份已儲存且已驗證的 <code>ability@1</code> 或 <code>item@1</code>；它是 compiled-only，不冒充可 round-trip 的完整 package。</p>
        <div className="export-runtime-row">
          <select aria-label="Runtime collection" value={collection} onChange={(event) => setCollection(event.target.value as "abilities" | "items")}>
            <option value="abilities">Ability</option>
            <option value="items">Item</option>
          </select>
          <select aria-label="Runtime document" value={docId} onChange={(event) => setDocId(event.target.value)}>
            {(index.data?.entries ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
          </select>
          <button type="button" disabled={!docId || index.isLoading} onClick={() => void exportRaw()}>下載單檔 JSON</button>
        </div>
        <p className={exportStatus.startsWith("⛔") ? "error" : "export-status"}>{exportStatus}</p>
      </section>

      <section className="export-panel">
        <h2>3. Package JSON／ZIP</h2>
        <div className="export-mode-grid">
          {modeRows.map((row) => (
            <article key={row.mode} className={row.blockers.length === 0 ? "ready" : "blocked"}>
              <header><b>{row.label}</b><code>{row.mode}</code></header>
              <p>{row.description}</p>
              {row.blockers.length === 0 ? (
                <p className="ready-text">目標握手條件已齊；建包器尚未在本分支宣告完成。</p>
              ) : (
                <ul>{row.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
              )}
              <button type="button" disabled>建立 Package</button>
            </article>
          ))}
        </div>
        {profile?.unavailable.length ? (
          <details><summary>目標回報的 unavailable 欄位</summary><ul>{profile.unavailable.map((item) => <li key={item}>{item}</li>)}</ul></details>
        ) : null}
      </section>
    </main>
  );
}
