import { useState } from "react";
import { draftFingerprint, createLocalDraft } from "../drafts/repository";
import { enqueueDraft } from "../drafts/session";
import { useHeroStore, type HeroDraftPayload } from "./store";
import { prepareHeroZip, openHeroZip, downloadHeroFile, type HeroPackageInspection } from "./packageClient";
import { heroTransferDraft, restoreHeroDraftAssets } from "./draftAssets";
import { HeroCommunityPanel } from "./HeroCommunityPanel";

export function HeroPackagePanel({ value, valid }: { value: HeroDraftPayload; valid: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{ fingerprint: string; zip: Blob; inspection: HeroPackageInspection } | null>(null);
  const fingerprint = draftFingerprint({ project: value.project, originalIconRefs: value.originalIconRefs ?? {} });
  const current = prepared?.fingerprint === fingerprint ? prepared : null;
  const build = async () => {
    setBusy(true); setMessage("正在固定完整英雄、依賴與圖片，並重跑遊戲模擬…");
    try {
      const result = await prepareHeroZip(value);
      setPrepared({ ...result, fingerprint });
      setMessage("完整英雄檢查通過。以下圖片就是套件內的正規化版本。");
    } catch (error) { setMessage(`無法建立完整英雄：${String(error)}`); }
    finally { setBusy(false); }
  };
  const open = (payload: HeroDraftPayload) => {
    const key = `hero/${payload.project.projectId}/copy-${crypto.randomUUID()}`;
    const draft = createLocalDraft(key, "hero", payload.project.revision, payload);
    useHeroStore.getState().open(draft); enqueueDraft(key, "hero", payload);
    setPrepared(null); setMessage("已開啟為獨立本機副本，原本的草稿仍保留。");
  };
  const importFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error("檔案超過 64 MiB。");
      if (file.name.toLowerCase().endsWith(".zip")) {
        const project = await openHeroZip(file);
        open({ project, rawInputs: {}, mode: "visual", origin: project.acceptedPlan!.origin });
        setMessage("已離線核對 ZIP 並開啟草稿副本。送審前請重新建立完整英雄，確認目前遊戲版本相容。");
      } else {
        const draft = JSON.parse(await file.text()) as { schema?: string; kind?: string; payload?: HeroDraftPayload; token?: string };
        if (draft.schema !== "ggd-local-draft@1" || draft.kind !== "hero" || !draft.payload || draft.token !== draftFingerprint(draft.payload)) throw new Error("草稿備份完整性檢查失敗。");
        open(await restoreHeroDraftAssets(draft.payload));
      }
    } catch (error) { setMessage(`無法開啟：${String(error)}`); }
    finally { setBusy(false); }
  };
  return <section className="hero-package-panel" aria-label="作品備份與完整英雄">
    <h2>保存與分享作品</h2>
    <p>草稿備份可保留未完成的欄位；完整英雄包含六槽技能、演出、固定依賴與圖片。</p>
    <div className="hero-actions">
      <button type="button" onClick={() => void (async () => {
        const payload = JSON.parse(JSON.stringify(await heroTransferDraft(value))) as HeroDraftPayload;
        const draft = createLocalDraft(`hero/${value.project.projectId}`, "hero", value.project.revision, payload);
        const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
        if (blob.size > 64 * 1024 * 1024) throw new Error("草稿與原圖超過單份備份 64 MiB 上限。");
        downloadHeroFile(blob, `${value.project.projectId}-draft.json`);
      })().catch((error: unknown) => setMessage(String(error)))}>下載草稿備份</button>
      <label className="local-icon-file">開啟作品檔<input type="file" accept=".zip,.json" disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label>
      <button type="button" disabled={busy || !valid} onClick={() => void build()}>{busy ? "正在處理…" : "建立完整英雄 ZIP"}</button>
      {current ? <button type="button" onClick={() => downloadHeroFile(current.zip, `${value.project.projectId}-r${value.project.revision}.zip`)}>下載已驗證英雄 ZIP</button> : null}
    </div>
    <p>草稿備份與完整英雄 ZIP 均可離線開啟。建立完整英雄與送審時的遊戲相容檢查需要連線。</p>
    {message ? <p role="status">{message}</p> : null}
    {prepared && !current ? <p>作品已修改，請重新建立完整英雄以納入最新內容。</p> : null}
    {current ? <><div className="hero-package-icons">{current.inspection.icons.map((icon) => <figure key={icon.slot}><img src={`data:${icon.mime};base64,${icon.base64}`} width={96} height={96} alt={`${icon.slot === "hero" ? "英雄" : icon.slot} 發布圖片預覽`} /><figcaption>{icon.slot === "hero" ? "英雄肖像" : `${icon.slot} 技能`}</figcaption></figure>)}</div>
      <p>第 {value.project.revision} 版 · {current.inspection.manifest.expectedCompiled.length} 份遊戲資料 · {current.inspection.manifest.entries.filter((entry) => entry.role === "asset").length} 份資產</p>
      <details><summary>完整英雄驗證資訊</summary><pre>{JSON.stringify({ digest: current.inspection.packageDigest, base: current.inspection.manifest.base, diagnostics: current.inspection.diagnostics }, null, 2)}</pre></details>
    </> : null}
    <HeroCommunityPanel value={value} prepared={current} />
  </section>;
}
