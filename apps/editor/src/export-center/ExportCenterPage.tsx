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
import {
  buildRuntimePackage,
  buildRuntimePackageZip,
  runtimeDocumentsFromBaseBundle,
  runtimeReferenceKeys,
  type RuntimeAuthoringDocument,
} from "./exportBuilder";

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

function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type });
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

async function mapConcurrent<T, R>(values: readonly T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await fn(values[index]!);
    }
  }));
  return output;
}

export function ExportCenterPage() {
  const [profileUrl, setProfileUrl] = useState(savedProfileUrl);
  const [profile, setProfile] = useState<TargetProfileFacts | null>(null);
  const [profileStatus, setProfileStatus] = useState("尚未讀取目標 profile");
  const [collection, setCollection] = useState<"abilities" | "items">("abilities");
  const [docId, setDocId] = useState("");
  const [exportStatus, setExportStatus] = useState("選擇一份 Runtime 文件");
  const [baseDocuments, setBaseDocuments] = useState<RuntimeAuthoringDocument[] | null>(null);
  const [baseStatus, setBaseStatus] = useState("full／delta 需要載入遊戲端 active runtime bundle；bootstrap 不需要。");
  const [packageStatus, setPackageStatus] = useState("等待目標握手");
  const [packageBusy, setPackageBusy] = useState(false);
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
      setBaseDocuments(null);
      setBaseStatus("full／delta 需要載入與這份 profile 相同版本的 active runtime bundle。");
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
    blockers: profile
      ? [
        ...packageModeBlockers(profile, row.mode),
        ...(row.mode !== "bootstrap" && !baseDocuments ? ["尚未載入 exact base runtime bundle"] : []),
      ]
      : ["先讀取 target profile"],
  })), [baseDocuments, profile]);

  const loadBaseBundle = async (file: File | null): Promise<void> => {
    if (!file || !profile?.contentVersion) return;
    setBaseStatus("驗證 Base bundle 的版本、文件與 collection hashes…");
    try {
      const docs = runtimeDocumentsFromBaseBundle(JSON.parse(await file.text()), profile.contentVersion);
      setBaseDocuments(docs);
      setBaseStatus(`已載入 exact Base：${docs.filter((doc) => doc.collection === "abilities").length} 技能、${docs.filter((doc) => doc.collection === "items").length} 道具。`);
    } catch (error) {
      setBaseDocuments(null);
      setBaseStatus(`⛔ ${String(error)}`);
    }
  };

  const collectDocuments = async (mode: PackageMode): Promise<RuntimeAuthoringDocument[]> => {
    if (mode === "delta") {
      if (!docId) throw new Error("delta 必須選擇一份技能或道具 root");
      const document = await api.doc<Record<string, unknown>>(collection, docId);
      await api.validate(collection, docId, document);
      return [{ collection, id: docId, document }];
    }
    const [abilities, items] = await Promise.all([api.index("abilities"), api.index("items")]);
    const refs = [
      ...abilities.entries.map((entry) => ({ collection: "abilities" as const, id: entry.id })),
      ...items.entries.map((entry) => ({ collection: "items" as const, id: entry.id })),
    ];
    setPackageStatus(`讀取並驗證完整 Runtime corpus：${refs.length} 份…`);
    return mapConcurrent(refs, 12, async (ref) => {
      const document = await api.doc<Record<string, unknown>>(ref.collection, ref.id);
      await api.validate(ref.collection, ref.id, document);
      return { ...ref, document };
    });
  };

  const collectRequires = async (documents: readonly RuntimeAuthoringDocument[]) => {
    const refs = runtimeReferenceKeys(documents);
    setPackageStatus(`固定 ${refs.length} 份未隨包攜帶的 exact dependencies…`);
    return mapConcurrent(refs, 12, async (ref) => {
      const document = await api.doc<Record<string, unknown>>(ref.collection, ref.id);
      return { kind: ref.collection, id: ref.id, contentSha256: contentSha256(document) };
    });
  };

  const exportPackage = async (mode: PackageMode, format: "json" | "zip"): Promise<void> => {
    if (!profile) return;
    setPackageBusy(true);
    setPackageStatus(`建立 ${mode} ${format.toUpperCase()}…`);
    try {
      const documents = await collectDocuments(mode);
      const requires = await collectRequires(documents);
      const built = buildRuntimePackage({
        mode,
        target: profile,
        documents,
        ...(mode === "bootstrap" ? {} : { baseDocuments: baseDocuments ?? undefined }),
        requires,
      });
      if (format === "json") {
        downloadJson(built.package, `${built.filenameStem}.json`);
        setPackageStatus(`已下載 ${built.filenameStem}.json · ${built.package.manifest.packageDigest}`);
      } else {
        const zip = await buildRuntimePackageZip(built);
        downloadBytes(zip.bytes, zip.filename, "application/zip");
        setPackageStatus(`已下載 ${zip.filename} · package ${built.package.manifest.packageDigest} · archive ${zip.archiveSha256}`);
      }
    } catch (error) {
      setPackageStatus(`⛔ 建包失敗：${String(error)}`);
    } finally {
      setPackageBusy(false);
    }
  };

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
            <div><dt>Game revision</dt><dd>{profile.gameRevision ?? "未提供"}</dd></div>
            <div><dt>Migration</dt><dd>{profile.migrationFingerprint ?? "未提供"}</dd></div>
            <div><dt>Authoring accepts</dt><dd>{profile.authoringAccepts.join(" · ") || "未提供"}</dd></div>
          </dl>
        ) : null}
      </section>

      <section className="export-panel">
        <h2>2. 單檔 Runtime JSON</h2>
        <p>契約允許單獨輸出一份已儲存且已驗證的 <code>ability@1</code> 或 <code>item@1</code>；它是獨立 Runtime 文件，不冒充可 apply／rollback 的完整 package。</p>
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
        <p>JSON 與 ZIP 共用同一個 JCS packageDigest；ZIP 使用固定 UTF-8／1980-01-01／STORE policy，輸入相同即 byte-identical。full／delta 的 before hashes 只接受遊戲端 exact active bundle。</p>
        <div className="export-base-row">
          <label>Exact Base runtime bundle <input type="file" accept="application/json,.json" disabled={!profile?.contentVersion || packageBusy} onChange={(event) => void loadBaseBundle(event.target.files?.[0] ?? null)} /></label>
          <span className={baseStatus.startsWith("⛔") ? "error" : "export-status"}>{baseStatus}</span>
        </div>
        <div className="export-mode-grid">
          {modeRows.map((row) => (
            <article key={row.mode} className={row.blockers.length === 0 ? "ready" : "blocked"}>
              <header><b>{row.label}</b><code>{row.mode}</code></header>
              <p>{row.description}</p>
              {row.blockers.length === 0 ? (
                <p className="ready-text">握手、base 與本機建包器都已就緒；建包前會逐份驗 runtime schema、exact refs、JCS digest 與 ZIP safety。</p>
              ) : (
                <ul>{row.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
              )}
              <div className="export-package-actions">
                <button type="button" disabled={packageBusy || row.blockers.length > 0} onClick={() => void exportPackage(row.mode, "json")}>Package JSON</button>
                <button type="button" disabled={packageBusy || row.blockers.length > 0} onClick={() => void exportPackage(row.mode, "zip")}>一鍵 ZIP</button>
              </div>
            </article>
          ))}
        </div>
        <p className={packageStatus.startsWith("⛔") ? "error" : "export-status"}>{packageStatus}</p>
        {profile?.unavailable.length ? (
          <details><summary>目標回報的 unavailable 欄位</summary><ul>{profile.unavailable.map((item) => <li key={item}>{item}</li>)}</ul></details>
        ) : null}
      </section>
    </main>
  );
}
