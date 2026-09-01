/** Collection sidebar + doc list (create/duplicate/delete = JSON file ops). */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CollectionName } from "@ggd/shared/content";
import { api, ApiValidationError } from "../api/client";
import { collectionEntry, collectionRegistry } from "../collections";
import { useEditorStore } from "../store";
import { sourceWriteBlockers } from "../sourcePolicy";
import type { EditorDesktopSourceInfo } from "@ggd/shared/editorDesktop";

export function Sidebar({
  active,
  forgeActive,
  vfxForgeActive,
  exportActive,
  onPick,
  onPickForge,
  onPickVfxForge,
  onPickExport,
}: {
  active: CollectionName | null;
  forgeActive?: boolean;
  vfxForgeActive?: boolean;
  exportActive?: boolean;
  onPick(collection: CollectionName): void;
  onPickForge?(): void;
  onPickVfxForge?(): void;
  onPickExport?(): void;
}) {
  return (
    <nav className="sidebar">
      {/* 鑄技工坊 is an authoring FLOW, not a collection — it sits above the
          collection list because the designer starts there, not at a JSON doc.
          (Editing a template@1 doc itself is still available below, since the
          collection registry picks up "ability-templates" automatically.) */}
      {onPickForge ? (
        <button
          type="button"
          className={`sidebar-forge${forgeActive ? " active" : ""}`}
          onClick={onPickForge}
        >
          🔨 鑄技工坊
        </button>
      ) : null}
      {onPickVfxForge ? (
        <button
          type="button"
          className={`sidebar-vfx-forge${vfxForgeActive ? " active" : ""}`}
          onClick={onPickVfxForge}
        >
          ✨ 特效工坊
        </button>
      ) : null}
      {onPickExport ? (
        <button
          type="button"
          className={`sidebar-export${exportActive ? " active" : ""}`}
          onClick={onPickExport}
        >
          📦 匯出中心
        </button>
      ) : null}
      <h2>Collections</h2>
      {collectionRegistry.map((c) => (
        <button
          key={c.name}
          type="button"
          className={active === c.name ? "active" : ""}
          onClick={() => onPick(c.name)}
        >
          {c.label}
        </button>
      ))}
      <DesktopSourceBadge />
    </nav>
  );
}

const SOURCE_LABEL: Record<EditorDesktopSourceInfo["state"], string> = {
  local: "本機專案",
  current: "線上 Base 已同步",
  "local-changes": "有本機修改",
  "merged-with-conflicts": "合併有衝突",
  "offline-cache": "離線快取",
};

function DesktopSourceBadge() {
  const { data, error } = useQuery({
    queryKey: ["desktop-source"],
    queryFn: () => api.desktopSource(),
    refetchInterval: 5_000,
    retry: false,
  });
  if (error || !data) return null;
  const warningCount = data.compatibilityWarnings.length;
  return (
    <section className={`desktop-source desktop-source-${data.state}`} title={data.workspacePath}>
      <b>{data.kind === "remote" ? "🌐" : "💻"} {SOURCE_LABEL[data.state]}</b>
      <span>{data.sourceUrl ?? "本機資料夾"}</span>
      <code>{data.workingContentVersion ?? "版本未知"}</code>
      {data.conflicts.length > 0 ? <em>衝突 {data.conflicts.length}</em> : null}
      {warningCount > 0 ? <em>相容警告 {warningCount}</em> : null}
      <small>{data.message}</small>
    </section>
  );
}

export function DocList({ collection }: { collection: CollectionName }) {
  const qc = useQueryClient();
  const store = useEditorStore();
  const [query, setQuery] = useState("");
  const { data, error } = useQuery({
    queryKey: ["index", collection],
    queryFn: () => api.index(collection),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["index", collection] });
    void qc.invalidateQueries({ queryKey: ["preview-champions"] });
  };

  const open = async (id: string) => {
    const doc = await api.doc(collection, id);
    store.select(collection, id, doc);
  };

  const createDoc = async (template: unknown, id: string | null) => {
    if (!id) return;
    try {
      await api.create(collection, id, template);
      refresh();
      await open(id);
    } catch (e) {
      alert(e instanceof ApiValidationError ? e.issues.map((i) => `${i.path}: ${i.message}`).join("\n") : String(e));
    }
  };

  const entries = data?.entries ?? [];
  const visibleEntries = entries.filter((entry) => docEntryMatchesQuery(entry, query));

  return (
    <div className="doc-list">
      <div className="doc-list-head">
        <h3>{collectionEntry(collection).label}</h3>
        <button
          type="button"
          onClick={() => {
            const id = prompt("new id (lowercase, . _ - allowed):");
            if (!id) return;
            void createDoc(setDocId(collectionEntry(collection).template(id), id), id);
          }}
        >
          + new
        </button>
      </div>
      <label className="doc-search">
        <span className="visually-hidden">搜尋文件</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋 ID 或版本指紋"
          aria-label="搜尋文件"
        />
        <small>{visibleEntries.length}{query.trim() ? ` / ${entries.length}` : ""}</small>
      </label>
      {error ? <p className="error">index unavailable — is content-api running?</p> : null}
      <ul>
        {visibleEntries.map((e) => (
          <li key={e.id} className={store.docId === e.id ? "active" : ""}>
            <button type="button" className="doc-open" onClick={() => void open(e.id)}>
              {e.id} <span className="hash">{e.hash}</span>
            </button>
            <span className="doc-tools">
              <button
                type="button"
                title="duplicate"
                onClick={() => {
                  void (async () => {
                    const id = prompt("duplicate as id:", `${e.id}-copy`);
                    if (!id) return;
                    const src = await api.doc<Record<string, unknown>>(collection, e.id);
                    await createDoc(setDocId(src, id), id);
                  })();
                }}
              >
                ⧉
              </button>
              <button
                type="button"
                title="delete"
                onClick={() => {
                  void (async () => {
                    try {
                      const src = await api.doc<Record<string, unknown>>(collection, e.id);
                      const source = collection === "abilities" || collection === "champions"
                        ? await api.editorSource(collection, e.id)
                        : null;
                      const blockers = sourceWriteBlockers(collection, src, source);
                      if (blockers.length > 0) {
                        alert(`⛔ ${blockers.join("\n")}`);
                        return;
                      }
                      if (!confirm(`delete ${collection}/${e.id}?`)) return;
                      await api.remove(collection, e.id);
                      if (store.docId === e.id) store.clearSelection();
                      refresh();
                    } catch (error) {
                      alert(`⛔ delete blocked: ${String(error)}`);
                    }
                  })();
                }}
              >
                🗑
              </button>
            </span>
          </li>
        ))}
        {!error && data && visibleEntries.length === 0 ? (
          <li className="doc-list-empty">找不到符合的文件。</li>
        ) : null}
      </ul>
    </div>
  );
}

export function docEntryMatchesQuery(entry: { id: string; hash: string }, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  return !query || entry.id.toLocaleLowerCase().includes(query) || entry.hash.toLocaleLowerCase().includes(query);
}

function setDocId(doc: unknown, id: string): unknown {
  const d = { ...(doc as Record<string, unknown>), id };
  return d;
}
