import { useEffect, useRef, useState } from "react";
import { MODEL_UPLOAD_LIMITS } from "@ggd/shared/content/modelUpload/glb";
import { HERO_MODEL_STATES, HERO_MODEL_STATE_LABELS } from "@ggd/shared/content/modelUpload/heroModelSchema";
import { emptyModelSelections, loadHeroModelBytes, modelDraftFingerprint, saveHeroModelBytes, zHeroModelDraft, type HeroModelDraft } from "./modelAssets";
import { runModelUploadJob, type ModelUploadResult, type ModelUploadSummary } from "./modelUploadJob";

export function HeroModelUploadPanel({ draft, locked, onDraft, onApply }: {
  draft?: HeroModelDraft; locked: boolean; onDraft(draft: HeroModelDraft): void;
  onApply(draft: HeroModelDraft, prepared: ModelUploadResult): void;
}) {
  const [summary, setSummary] = useState<ModelUploadSummary | null>(null);
  const [library, setLibrary] = useState<{ name: string; bytes: Uint8Array; summary: ModelUploadSummary } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const controller = useRef(new AbortController());
  useEffect(() => { const next = new AbortController(); controller.current = next; return () => next.abort(); }, []);
  useEffect(() => {
    if (!draft) { setSummary(null); return; }
    if (summary?.sha256 === draft.working.sha256) return;
    const abort = new AbortController();
    setSummary(null);
    void loadHeroModelBytes(draft.working.sha256).then((bytes) => runModelUploadJob({ kind: "inspect", bytes, assetKind: "model" }, abort.signal))
      .then((result) => { if (!abort.signal.aborted) setSummary(result.summary); })
      .catch((error) => { if (!abort.signal.aborted) setMessage(String(error)); });
    return () => abort.abort();
  }, [draft?.working.sha256]);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await action(); } catch (error) { if (!controller.current.signal.aborted) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (!controller.current.signal.aborted) setBusy(false); }
  };
  const fileBytes = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".glb") || file.size > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error("請選擇最多 32 MiB 的 GLB 檔案。");
    return new Uint8Array(await file.arrayBuffer());
  };
  const importBody = async (file: File) => {
    const bytes = await fileBytes(file);
    const inspected = await runModelUploadJob({ kind: "inspect", bytes, assetKind: "model" }, controller.current.signal);
    const original = await saveHeroModelBytes(bytes, file.name);
    if (controller.current.signal.aborted) return;
    setSummary(inspected.summary); setLibrary(null); setSelected([]);
    onDraft({ active: true, originals: [original], working: original, selections: emptyModelSelections(), yawOffsetDeg: 0 });
    setMessage("模型原檔已保存在本機。請對應六項動作，再套用到英雄。");
  };
  const importLibrary = async (file: File) => {
    const bytes = await fileBytes(file);
    const inspected = await runModelUploadJob({ kind: "inspect", bytes, assetKind: "animations" }, controller.current.signal);
    if (controller.current.signal.aborted) return;
    setLibrary({ name: file.name, bytes, summary: inspected.summary }); setSelected([]);
  };
  const input = (label: string, action: (file: File) => Promise<void>, disabled = false) => <label>{label}<input aria-label={label} type="file" accept=".glb,model/gltf-binary" disabled={disabled} onChange={(event) => {
    const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void perform(() => action(file));
  }} /></label>;
  return <section aria-label="上傳模型與動作庫">
    <h3>上傳模型與動作庫</h3>
    <p>支援內嵌貼圖、骨架與動畫的 GLB。獨立動作庫需使用相同骨架名稱、階層與基準姿勢；FBX 請先轉成 GLB。</p>
    <fieldset disabled={busy || locked}><legend>模型原檔與動作對應</legend>
      {input(draft ? "更換模型 GLB" : "匯入模型 GLB", importBody)}
      {draft ? <>
        <p>{draft.originals[0]!.name} · 原檔 {draft.originals.length} 份{summary ? ` · ${summary.triangles.toLocaleString()} 三角面 · ${summary.clips.length} 段動作` : " · 正在讀取模型…"}</p>
        {input("匯入相容動作庫 GLB", importLibrary, !summary)}
        {library ? <div><h4>{library.name}</h4><p>選擇要加入此英雄的片段（最多 32 段）。</p>
          {library.summary.clips.map((clip) => <label key={clip.index}><input type="checkbox" checked={selected.includes(clip.index)} disabled={!selected.includes(clip.index) && selected.length >= 32} onChange={(event) => setSelected(event.target.checked ? [...selected, clip.index] : selected.filter((index) => index !== clip.index))} />{clip.name} · {clip.duration.toFixed(2)} 秒</label>)}
          <button type="button" disabled={!selected.length || !summary} onClick={() => void perform(async () => {
            const originals = draft.originals.some((file) => file.sha256 === library.summary.sha256) ? draft.originals : [...draft.originals, { name: library.name, bytes: library.bytes.length, sha256: library.summary.sha256 }];
            zHeroModelDraft.parse({ ...draft, originals });
            const result = await runModelUploadJob({ kind: "merge", bytes: await loadHeroModelBytes(draft.working.sha256), library: library.bytes, selected }, controller.current.signal);
            await saveHeroModelBytes(library.bytes, library.name);
            const working = await saveHeroModelBytes(result.bytes!, draft.working.name);
            if (controller.current.signal.aborted) return;
            setSummary(result.summary); onDraft({ ...draft, active: true, originals, working }); setLibrary(null); setSelected([]);
            setMessage("相容動作已加入。原始模型與動作庫均保留，請選擇用途後套用。");
          })}>加入選取的動作</button><button type="button" onClick={() => { setLibrary(null); setSelected([]); }}>取消動作庫</button>
        </div> : null}
        <p>同一段動作可以對應多項用途。Q／W／E／R／EX 共用「施法」動作。</p>
        {HERO_MODEL_STATES.map((state) => <label key={state}>{HERO_MODEL_STATE_LABELS[state]}動作<select aria-label={`${HERO_MODEL_STATE_LABELS[state]}動作`} value={draft.selections[state]} disabled={!summary} onChange={(event) => onDraft({ ...draft, active: true, selections: { ...draft.selections, [state]: Number(event.target.value) } })}>
          <option value={-1}>請選擇片段</option>{summary?.clips.map((clip) => <option key={clip.index} value={clip.index}>{clip.name}（{clip.duration.toFixed(2)} 秒）</option>)}
        </select></label>)}
        <label>模型朝向修正（度）<input aria-label="模型朝向修正" type="number" min={-360} max={360} step={90} value={draft.yawOffsetDeg} onChange={(event) => {
          const next = event.target.valueAsNumber; if (Number.isFinite(next) && Math.abs(next) <= 360) onDraft({ ...draft, active: true, yawOffsetDeg: next });
        }} /></label>
        <button type="button" disabled={!summary || HERO_MODEL_STATES.some((state) => draft.selections[state] < 0)} onClick={() => void perform(async () => {
          const prepared = await runModelUploadJob({ kind: "prepare", bytes: await loadHeroModelBytes(draft.working.sha256), selections: draft.selections, yawOffsetDeg: draft.yawOffsetDeg }, controller.current.signal);
          await saveHeroModelBytes(prepared.bytes!, "hero-body.glb");
          if (controller.current.signal.aborted) return;
          onApply({ ...draft, active: true, appliedFingerprint: modelDraftFingerprint(draft) }, prepared);
          setMessage(["已套用到英雄，可在右側試玩。完整英雄只攜帶已對應的片段，原檔保留在草稿。", ...prepared.warnings].join("\n"));
        })}>套用模型與六項動作</button>
        {draft.active && draft.appliedFingerprint !== modelDraftFingerprint(draft) ? <p role="status">模型或動作對應尚未套用，完成後才能建立完整英雄。</p> : null}
      </> : null}
    </fieldset>
    {busy ? <p role="status">正在檢查模型與動作…</p> : null}
    {message ? <p role="status" style={{ whiteSpace: "pre-line" }}>{message}</p> : null}
  </section>;
}
