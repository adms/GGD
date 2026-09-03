import { useEffect, useMemo, useState } from "react";
import type { IconKind } from "../ai/prompt";
import { useEditorStore } from "../store";
import { formatBytes, localIconAssetPath, stageLocalIcon, type StagedLocalIcon } from "./model";
import {
  deleteStagedLocalIcon,
  getStagedLocalIcon,
  LOCAL_ICON_CHANGED_EVENT,
  putStagedLocalIcon,
} from "./storage";

export function LocalIconUploadPanel({ kind, docId }: { kind: IconKind; docId: string }) {
  const update = useEditorStore((state) => state.update);
  const [icon, setIcon] = useState<StagedLocalIcon | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("選擇圖片後才會留在這台電腦；不會立即上傳或寫入 content。");
  const previewUrl = useMemo(() => icon ? URL.createObjectURL(icon.blob) : null, [icon]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    let live = true;
    const load = () => void getStagedLocalIcon({ kind, docId }).then((value) => { if (live) setIcon(value); });
    load();
    globalThis.addEventListener?.(LOCAL_ICON_CHANGED_EVENT, load);
    return () => { live = false; globalThis.removeEventListener?.(LOCAL_ICON_CHANGED_EVENT, load); };
  }, [docId, kind]);

  const choose = async (file: File | null): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setStatus("本機縮圖與 WebP 轉檔中…");
    try {
      const staged = await stageLocalIcon(kind, docId, file);
      await putStagedLocalIcon(staged);
      update("icon", staged.contentPath);
      setIcon(staged);
      setStatus(`已暫存 ${staged.width}×${staged.height} WebP · ${formatBytes(staged.bytes)} · ${staged.contentSha256.slice(0, 19)}…`);
    } catch (error) {
      setStatus(`⛔ ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    try {
      await deleteStagedLocalIcon({ kind, docId });
      if (useEditorStore.getState().draft &&
        (useEditorStore.getState().draft as Record<string, unknown>)["icon"] === localIconAssetPath(kind, docId)) {
        update("icon", undefined);
      }
      setIcon(null);
      setStatus("已移除本機暫存；尚未對遊戲端做任何寫入。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="local-icon" aria-label="本機 Icon 圖片">
      <header>
        <h3>本機 Icon 圖片</h3>
        <code>{localIconAssetPath(kind, docId)}</code>
      </header>
      <div className="local-icon-row">
        {previewUrl ? <img src={previewUrl} alt={`${docId} 本機 icon 預覽`} width={96} height={96} /> : <div className="local-icon-empty">尚未選圖</div>}
        <div>
          <label className="local-icon-file">
            {busy ? "處理中…" : icon ? "更換圖片" : "選擇圖片"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={(event) => { void choose(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }}
            />
          </label>
          {icon ? <button type="button" disabled={busy} onClick={() => void remove()}>移除暫存</button> : null}
          <p className={status.startsWith("⛔") ? "error" : "local-icon-status"}>{status}</p>
          {icon ? <small>來源：{icon.sourceName} · {formatBytes(icon.sourceBytes)}；匯出中心會檢查文件是否仍引用這份圖。</small> : null}
        </div>
      </div>
    </section>
  );
}
