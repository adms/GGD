import { useState } from "react";
import { importHeroHandoffBatch } from "@ggd/shared/content";
import { createLocalDraft, type LocalDraft } from "../drafts/repository";
import { recoverDraft } from "../drafts/session";
import { useHeroStore, type HeroDraftPayload } from "./store";
import { MODEL_UPLOAD_LIMITS } from "@ggd/shared/content/modelUpload/glb";
import { HERO_MODEL_STATES } from "@ggd/shared/content/modelUpload/heroModelSchema";
import { modelDraftFingerprint, saveHeroModelBytes, type HeroModelDraft } from "./modelAssets";
import { runModelUploadJob } from "./modelUploadJob";

export function HeroHandoffImportPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [imported, setImported] = useState<LocalDraft[]>([]);
  const importFolder = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setImported([]); let saved = 0;
    try {
      const indexes = files.filter((file) => file.name === "index.json").sort((a, b) => a.webkitRelativePath.split("/").length - b.webkitRelativePath.split("/").length);
      const index = indexes[0];
      if (!index || index.size > 1024 * 1024) throw new Error("請選取含有英雄 index.json、projects 與 recipes 的交接資料夾。");
      const root = index.webkitRelativePath.slice(0, -index.name.length);
      const selected = files.filter((file) => file.webkitRelativePath.startsWith(root) && /\.(hero-project|upload-recipe)\.json$/.test(file.name));
      if (selected.length > 200 || selected.some((file) => file.size > 4 * 1024 * 1024) || selected.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) throw new Error("交接資料最多 100 名英雄，每檔 4 MiB、合計 64 MiB。");
      setMessage("正在配對英雄、六槽技能與完整原稿…");
      const read = await Promise.allSettled(selected.map(async (file) => [file.webkitRelativePath.slice(root.length), await file.text()] as const));
      const values = read.map((result) => { if (result.status === "rejected") throw result.reason; return result.value; });
      if (new Set(values.map(([path]) => path)).size !== values.length) throw new Error("交接資料有重複的檔案路徑。");
      const projects = importHeroHandoffBatch(await index.text(), new Map(values));
      const modelFiles = new Map<string, File>();
      for (const file of files.filter((item) => item.webkitRelativePath.startsWith(`${root}models/`))) {
        const path = file.webkitRelativePath.slice(root.length);
        if (modelFiles.has(path)) throw new Error("模型資料有重複路徑。");
        modelFiles.set(path, file);
      }
      const requiredModels = new Map(projects.flatMap((project) => project.presentation.uploadedModel ? [[project.presentation.uploadedModel.sha256, project.presentation.uploadedModel] as const] : []));
      if ([...requiredModels.values()].reduce((sum, model) => sum + model.byteSize, 0) > 512 * 1024 * 1024) throw new Error("此批模型合計超過 512 MiB，請分批匯入。");
      for (const model of requiredModels.values()) {
        const file = modelFiles.get(`models/${model.sha256}.glb`);
        if (!file || file.size !== model.byteSize || file.size > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error(`缺少模型 ${model.sha256.slice(0, 12)} 的完整 GLB，請使用含模型的交接資料夾。`);
      }
      const modelDrafts = new Map<string, HeroModelDraft>();
      // Check received bytes and all six bindings before creating any hero draft.
      // Sequential workers bound memory; content-addressed files can be shared.
      for (const project of projects) {
        const model = project.presentation.uploadedModel;
        if (!model) continue;
        setMessage(`正在驗證 ${project.brief.name} 的模型與六項動作…`);
        const file = modelFiles.get(`models/${model.sha256}.glb`)!;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const checked = await runModelUploadJob({ kind: "verify", bytes, model });
        if (checked.document!.id !== project.presentation.modelKey) throw new Error(`${project.brief.name} 的模型設定與 GLB 不一致。`);
        const ref = await saveHeroModelBytes(bytes, file.name);
        const draft: HeroModelDraft = { active: true, originals: [ref], working: ref, yawOffsetDeg: model.yawOffsetDeg,
          selections: Object.fromEntries(HERO_MODEL_STATES.map((state) => [state, checked.summary.clips.findIndex((clip) => clip.name === model.clipMap[state])])) as HeroModelDraft["selections"] };
        modelDrafts.set(project.projectId, { ...draft, appliedFingerprint: modelDraftFingerprint(draft) });
      }
      const copies: LocalDraft[] = [];
      for (const project of projects) {
        const payload: HeroDraftPayload = { project, rawInputs: {}, mode: "visual", origin: project.acceptedPlan!.origin, modelDraft: modelDrafts.get(project.projectId) };
        const copy = await recoverDraft(createLocalDraft(`hero/${project.projectId}`, "hero", project.revision, payload));
        copies.push(copy); saved++; setImported([...copies]); setMessage(`已保存 ${saved} / ${projects.length} 名英雄…`);
      }
      setMessage(`已匯入 ${saved} 名英雄、${saved * 6} 槽技能與原始待補項，綁定 ${modelDrafts.size} 名英雄的隨附模型。選擇角色繼續調整，完成後再建立當前版本的 ZIP 並送審。`);
    } catch (error) { setMessage(`${saved ? `已保存 ${saved} 名英雄；` : ""}匯入未完成：${String(error)}`); }
    finally { setBusy(false); }
  };
  return <section aria-label="批次匯入英雄交接">
    <h3>批次匯入英雄交接</h3>
    <p>選取交接資料夾，自動配對英雄、六槽模板、微調、隨附模型及動作，將每位角色保存為新的本機作品。</p>
    <label className="local-icon-file">選擇交接資料夾<input type="file" multiple ref={(element) => element?.setAttribute("webkitdirectory", "")} disabled={busy} onChange={(event) => { void importFolder(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /></label>
    {message ? <p role="status">{message}</p> : null}
    {imported.length ? <div className="hero-actions">{imported.map((draft) => <button type="button" key={draft.key} disabled={busy} onClick={() => useHeroStore.getState().open(draft)}>{(draft.payload as HeroDraftPayload).project.brief.name}</button>)}</div> : null}
  </section>;
}
