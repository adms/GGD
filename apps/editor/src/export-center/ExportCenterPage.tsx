import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CollectionIndex } from "@ggd/shared/content";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { resolveIconUpload, zConfigIconUploadDoc } from "@ggd/shared/content/schema/config/iconUpload";
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
  readEditorContractIndex,
  representationContract,
  type EditorContractIndex,
} from "./editorContractIndex";
import {
  binarySha256,
  buildRuntimePackage,
  buildRuntimePackageZip,
  resolveDeltaRuntimeClosure,
  runtimeBaseSnapshotFromBundle,
  runtimeReferenceKeys,
  type RuntimeBaseSnapshot,
  type RuntimeAuthoringDocument,
  type RuntimePackageBinaryAsset,
} from "./exportBuilder";
import { buildLocalIconBundleZip } from "../local-icons/bundle";
import {
  listStagedLocalIcons,
  LOCAL_ICON_CHANGED_EVENT,
} from "../local-icons/storage";
import type { StagedLocalIcon } from "../local-icons/model";

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
  const [contractIndex, setContractIndex] = useState<EditorContractIndex | null>(null);
  const [profileStatus, setProfileStatus] = useState("尚未讀取目標 profile");
  const [collection, setCollection] = useState<"abilities" | "items">("abilities");
  const [docId, setDocId] = useState("");
  const [exportStatus, setExportStatus] = useState("選擇一份 Runtime 文件");
  const [baseSnapshot, setBaseSnapshot] = useState<RuntimeBaseSnapshot | null>(null);
  const [baseStatus, setBaseStatus] = useState("full／delta 需要載入遊戲端 active runtime bundle；bootstrap 不需要。");
  const [packageStatus, setPackageStatus] = useState("等待目標握手");
  const [packageBusy, setPackageBusy] = useState(false);
  const [stagedIcons, setStagedIcons] = useState<StagedLocalIcon[]>([]);
  const [iconStatus, setIconStatus] = useState("尚無本機暫存 Icon。");
  const index = useQuery<CollectionIndex>({
    queryKey: ["index", collection],
    queryFn: () => api.index(collection),
  });

  useEffect(() => {
    let live = true;
    const load = () => void listStagedLocalIcons()
      .then((icons) => { if (live) { setStagedIcons(icons); setIconStatus(icons.length ? `本機暫存 ${icons.length} 張；尚未上傳或寫入遊戲 content。` : "尚無本機暫存 Icon。"); } })
      .catch((error) => { if (live) setIconStatus(`⛔ ${String(error)}`); });
    load();
    globalThis.addEventListener?.(LOCAL_ICON_CHANGED_EVENT, load);
    return () => { live = false; globalThis.removeEventListener?.(LOCAL_ICON_CHANGED_EVENT, load); };
  }, []);

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
      setContractIndex(null);
      setBaseSnapshot(null);
      setBaseStatus("full／delta 需要載入與這份 profile 相同版本的 active runtime bundle。");
      if (!facts.contractIndexHref || !facts.contractIndexDigest) {
        setProfileStatus(`⚠️ 已讀取 ${facts.schema}，但缺少 contractIndex.href／digest；Package 維持封鎖`);
      } else {
        const rawIndex = await api.externalContractIndex(profileUrl.trim(), facts.contractIndexHref);
        const verifiedIndex = readEditorContractIndex(rawIndex, facts.contractIndexDigest);
        setContractIndex(verifiedIndex);
        setProfileStatus(`已讀取 ${facts.schema} · contract ${verifiedIndex.digest}`);
      }
      try { localStorage.setItem(PROFILE_URL_KEY, profileUrl.trim()); } catch { /* optional */ }
    } catch (error) {
      setProfile(null);
      setContractIndex(null);
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
        ...packageModeBlockers(profile, row.mode, contractIndex),
        ...(row.mode !== "bootstrap" && !baseSnapshot ? ["尚未載入 exact base runtime bundle"] : []),
      ]
      : ["先讀取 target profile"],
  })), [baseSnapshot, contractIndex, profile]);

  const loadBaseBundle = async (file: File | null): Promise<void> => {
    if (!file || !profile?.contentVersion) return;
    setBaseStatus("驗證 Base bundle 的版本、文件與 collection hashes…");
    try {
      const snapshot = runtimeBaseSnapshotFromBundle(
        JSON.parse(await file.text()),
        profile.contentVersion,
        profile.activationDigest,
      );
      setBaseSnapshot(snapshot);
      setBaseStatus(`已載入 exact ACTIVE Base：${snapshot.runtimeDocuments.filter((doc) => doc.collection === "abilities").length} 技能、${snapshot.runtimeDocuments.filter((doc) => doc.collection === "items").length} 道具、${snapshot.documents.length} 份完整依賴快照 · ${snapshot.activationDigest.slice(0, 19)}…`);
    } catch (error) {
      setBaseSnapshot(null);
      setBaseStatus(`⛔ ${String(error)}`);
    }
  };

  const collectRuntimeCorpus = async (validateAll: boolean): Promise<RuntimeAuthoringDocument[]> => {
    const [abilities, items] = await Promise.all([api.index("abilities"), api.index("items")]);
    const refs = [
      ...abilities.entries.map((entry) => ({ collection: "abilities" as const, id: entry.id })),
      ...items.entries.map((entry) => ({ collection: "items" as const, id: entry.id })),
    ];
    setPackageStatus(`${validateAll ? "讀取並驗證" : "掃描"} Runtime corpus：${refs.length} 份…`);
    return mapConcurrent(refs, 12, async (ref) => {
      const document = await api.doc<Record<string, unknown>>(ref.collection, ref.id);
      if (validateAll) await api.validate(ref.collection, ref.id, document);
      return { ...ref, document };
    });
  };

  const collectDocuments = async (mode: PackageMode): Promise<{
    documents: RuntimeAuthoringDocument[];
    selectionRoots: RuntimeAuthoringDocument[];
    addedDependencies: RuntimeAuthoringDocument[];
  }> => {
    const corpus = await collectRuntimeCorpus(mode !== "delta");
    if (mode !== "delta") {
      return { documents: corpus, selectionRoots: corpus, addedDependencies: [] };
    }
    if (!docId) throw new Error("delta 必須選擇一份技能或道具 root");
    if (!baseSnapshot) throw new Error("delta 必須先載入 exact Base runtime bundle");
    const closure = resolveDeltaRuntimeClosure(
      corpus,
      baseSnapshot.runtimeDocuments,
      [{ collection, id: docId }],
    );
    const validated = new Set<string>();
    for (const document of [...closure.selectionRoots, ...closure.documents]) {
      const key = `${document.collection}/${document.id}`;
      if (validated.has(key)) continue;
      validated.add(key);
      await api.validate(document.collection, document.id, document.document);
    }
    if (closure.addedDependencies.length > 0) {
      setPackageStatus(`選取 root 需要自動加入 ${closure.addedDependencies.length} 份 changed forward dependencies：${closure.addedDependencies.map((doc) => `${doc.collection}/${doc.id}`).join("、")}`);
    }
    return {
      documents: [...closure.documents],
      selectionRoots: [...closure.selectionRoots],
      addedDependencies: [...closure.addedDependencies],
    };
  };

  const collectRequires = async (
    documents: readonly RuntimeAuthoringDocument[],
    exactBase: RuntimeBaseSnapshot | null,
  ) => {
    const refs = runtimeReferenceKeys(documents);
    setPackageStatus(`固定 ${refs.length} 份未隨包攜帶的 exact dependencies…`);
    const base = exactBase
      ? new Map(exactBase.documents.map((doc) => [`${doc.collection}/${doc.id}`, doc]))
      : null;
    return mapConcurrent(refs, 12, async (ref) => {
      const document = await api.doc<Record<string, unknown>>(ref.collection, ref.id);
      await api.validate(ref.collection, ref.id, document);
      const currentHash = contentSha256(document);
      if (!base) return { kind: ref.collection, id: ref.id, contentSha256: currentHash };
      const exact = base.get(`${ref.collection}/${ref.id}`);
      if (!exact) throw new Error(`EXACT_BASE_DEPENDENCY_MISSING：${ref.collection}/${ref.id}`);
      if (exact.contentSha256 !== currentHash) {
        throw new Error(`BASE_DEPENDENCY_DRIFT：${ref.collection}/${ref.id} 的本機版本不等於 exact Base；請把它納入支援的 authoring closure，或先同步 Base。`);
      }
      return { kind: ref.collection, id: ref.id, contentSha256: exact.contentSha256 };
    });
  };

  const exportPackage = async (mode: PackageMode, format: "json" | "zip"): Promise<void> => {
    if (!profile) return;
    setPackageBusy(true);
    setPackageStatus(`建立 ${mode} ${format.toUpperCase()}…`);
    try {
      const collected = await collectDocuments(mode);
      const referencedStagedIcons = stagedIcons.filter((icon) => [...collected.documents, ...collected.selectionRoots]
        .some((doc) => doc.collection === icon.kind && doc.id === icon.docId && doc.document["icon"] === icon.contentPath));
      const assets: RuntimePackageBinaryAsset[] = [];
      if (referencedStagedIcons.length > 0) {
        if (format !== "zip") {
          throw new Error("BINARY_ASSET_ZIP_REQUIRED：含 Icon 的正式 Package 只能匯出 ZIP，JSON 通道不承載二進位圖片");
        }
        const iconContract = representationContract(contractIndex, "icon-asset@1");
        if (!iconContract || iconContract.state !== "supported" || iconContract.packageKind !== "binary-asset" ||
          !iconContract.modes.includes(mode) || iconContract.promotionPolicy !== "review-required") {
          throw new Error(`ICON_ASSET_CONTRACT_BLOCKED：Main contract-index 未宣告 ${mode} 的 review-required icon-asset@1`);
        }
        const policyDoc = zConfigIconUploadDoc.safeParse(await api.doc("config", "icon-upload"));
        if (!policyDoc.success) throw new Error("目標遊戲的 config.icon-upload@1 無效");
        const iconPolicy = resolveIconUpload(policyDoc.data);
        if (!iconPolicy.enabled) throw new Error("目標遊戲目前關閉 Icon 資產匯入");
        for (const icon of referencedStagedIcons) {
          if (icon.width > iconPolicy.maxSourceEdge || icon.height > iconPolicy.maxSourceEdge) {
            throw new Error(`${icon.sourcePath} 超過目標遊戲目前的圖片邊長上限 ${iconPolicy.maxSourceEdge}`);
          }
          const bytes = new Uint8Array(await icon.blob.arrayBuffer());
          if (bytes.length > contractIndex!.maxEntryUncompressedBytes) {
            throw new Error(`${icon.sourcePath} 超過 Main contract-index 的單檔上限 ${contractIndex!.maxEntryUncompressedBytes}`);
          }
          const digest = await binarySha256(bytes);
          if (bytes.length !== icon.bytes || digest !== icon.contentSha256) {
            throw new Error(`${icon.sourcePath} 的本機 bytes／hash 已漂移`);
          }
          assets.push({
            path: icon.sourcePath,
            collection: icon.kind,
            id: icon.docId,
            mime: icon.mimeType,
            targetField: "icon",
            contentSha256: digest,
            contentSize: bytes.length,
            bytes,
            ...(mode === "bootstrap" ? {} : { baseSha256: icon.baseSha256 }),
          });
        }
      }
      // An unchanged selected root can still lead to a changed forward
      // dependency. Keep the root in reference analysis even when it is not a
      // package entry; selectionRoots already pins its own exact hash.
      const requires = await collectRequires(
        [...collected.documents, ...collected.selectionRoots],
        mode === "bootstrap" ? null : baseSnapshot,
      );
      const built = buildRuntimePackage({
        mode,
        target: profile,
        documents: collected.documents,
        selectionRoots: collected.selectionRoots,
        ...(mode === "bootstrap" ? {} : { baseDocuments: baseSnapshot?.runtimeDocuments }),
        requires,
        assets,
      });
      if (format === "json") {
        downloadJson(built.package, `${built.filenameStem}.json`);
        setPackageStatus(`已下載 ${built.filenameStem}.json · ${built.package.manifest.packageDigest}${collected.addedDependencies.length > 0 ? ` · 自動閉包 ${collected.addedDependencies.length} 份依賴` : ""}`);
      } else {
        const zip = await buildRuntimePackageZip(built);
        downloadBytes(zip.bytes, zip.filename, "application/zip");
        setPackageStatus(`已下載 ${zip.filename} · package ${built.package.manifest.packageDigest} · archive ${zip.archiveSha256}${assets.length > 0 ? ` · Icon ${assets.length} 張（待後台審閱）` : ""}${collected.addedDependencies.length > 0 ? ` · 自動閉包 ${collected.addedDependencies.length} 份依賴` : ""}`);
      }
    } catch (error) {
      setPackageStatus(`⛔ 建包失敗：${String(error)}`);
    } finally {
      setPackageBusy(false);
    }
  };

  const exportIconBundle = async (): Promise<void> => {
    setPackageBusy(true);
    setIconStatus("驗證本機 Icon bytes／hash 並建立工作包…");
    try {
      const bundle = await buildLocalIconBundleZip(stagedIcons);
      downloadBytes(bundle.bytes, bundle.filename, "application/zip");
      setIconStatus(`已下載 ${bundle.filename} · ${bundle.count} 張 · ${bundle.bundleSha256} · archive ${bundle.archiveSha256}`);
    } catch (error) {
      setIconStatus(`⛔ ${String(error)}`);
    } finally {
      setPackageBusy(false);
    }
  };

  return (
    <main className="export-center">
      <header className="export-head">
        <div>
          <h1>📦 匯出中心 <small>Export Center</small></h1>
          <p>單檔 Runtime JSON 現在可用；正式 Icon 會與文件一起進 ZIP，由 Main 唯一轉檔並列入後台審閱。</p>
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
            <div><dt>Contract index</dt><dd>{contractIndex?.digest ?? profile.contractIndexDigest ?? "未提供"}</dd></div>
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
          <button data-field="export.single.json" type="button" disabled={!docId || index.isLoading} onClick={() => void exportRaw()}>下載單檔 JSON</button>
        </div>
        <p className={exportStatus.startsWith("⛔") ? "error" : "export-status"}>{exportStatus}</p>
      </section>

      <section className="export-panel">
        <h2>3. Package JSON／ZIP</h2>
        <p>JSON 與 ZIP 共用同一個 JCS packageDigest；ZIP 使用固定 UTF-8／1980-01-01／STORE policy，輸入相同即 byte-identical。full／delta 的 before hashes 只接受遊戲端 <code>ggd-content-runtime-bundle@1</code>，並重算逐文件、集合與 contentVersion。</p>
        <div className="export-base-row">
          <label>Exact Base runtime bundle <input type="file" accept="application/json,.json" disabled={!profile?.contentVersion || packageBusy} onChange={(event) => void loadBaseBundle(event.target.files?.[0] ?? null)} /></label>
          <span className={baseStatus.startsWith("⛔") ? "error" : "export-status"}>{baseStatus}</span>
        </div>
        <div className="export-mode-grid">
          {modeRows.map((row) => (
            <article data-field={`export.mode.${row.mode}`} key={row.mode} className={row.blockers.length === 0 ? "ready" : "blocked"}>
              <header><b>{row.label}</b><code>{row.mode}</code></header>
              <p>{row.description}</p>
              {row.blockers.length === 0 ? (
                <p className="ready-text">握手、base 與本機建包器都已就緒；建包前會逐份驗 runtime schema、exact refs、JCS digest 與 ZIP safety。</p>
              ) : (
                <ul>{row.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
              )}
              <div className="export-package-actions">
                <button data-field={`export.mode.${row.mode}.json`} type="button" disabled={packageBusy || row.blockers.length > 0} onClick={() => void exportPackage(row.mode, "json")}>Package JSON</button>
                <button data-field={`export.mode.${row.mode}.zip`} type="button" disabled={packageBusy || row.blockers.length > 0} onClick={() => void exportPackage(row.mode, "zip")}>一鍵 ZIP</button>
              </div>
            </article>
          ))}
        </div>
        <p className={packageStatus.startsWith("⛔") ? "error" : "export-status"}>{packageStatus}</p>
        {profile?.unavailable.length ? (
          <details><summary>目標回報的 unavailable 欄位</summary><ul>{profile.unavailable.map((item) => <li key={item}>{item}</li>)}</ul></details>
        ) : null}
      </section>

      <section className="export-panel">
        <h2>4. 本機 Icon 素材</h2>
        <p>編輯頁選圖後只存於這台電腦的 IndexedDB。Editor 保留原圖；正式 ZIP 由 Main 唯一轉成遊戲 WebP，並以逐圖 CAS 防止覆蓋較新的圖片。</p>
        <button type="button" disabled={packageBusy || stagedIcons.length === 0} onClick={() => void exportIconBundle()}>
          下載 Icon 原圖工作備份（{stagedIcons.length}）
        </button>
        <p className={iconStatus.startsWith("⛔") ? "error" : "export-status"}>{iconStatus}</p>
      </section>
    </main>
  );
}
