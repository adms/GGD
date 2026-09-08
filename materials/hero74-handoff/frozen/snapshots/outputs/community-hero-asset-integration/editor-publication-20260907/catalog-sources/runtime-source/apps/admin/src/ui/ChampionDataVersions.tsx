import { useEffect, useRef, useState } from "react";
import { heroCatalogApi, type CatalogHeroChoice, type CatalogHeroPreview, type CatalogVersionChoice } from "../contentApi";
import { Btn, Panel } from "./widgets";
import { DANGER, TEXT_DIM, TEXT_MAIN } from "./theme";

const selectStyle = { background: "#10141f", color: TEXT_MAIN, border: "1px solid #465064", borderRadius: 6, padding: 8, width: "100%" };
export function ChampionDataVersions(props: { championId: string; document: unknown; disabled: boolean; dirty: boolean; onBusy: (busy: boolean) => void; onSaved: () => void }) {
  const [heroes, setHeroes] = useState<CatalogHeroChoice[]>([]), [versions, setVersions] = useState<CatalogVersionChoice[]>([]);
  const [heroPath, setHeroPath] = useState(`catalog/champions/${props.championId}.json`), [versionId, setVersionId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null), [preview, setPreview] = useState<CatalogHeroPreview | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false), [confirm, setConfirm] = useState(false);
  const alive = useRef(true), request = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  const reload = async () => {
    const results = await Promise.all([heroCatalogApi.heroes(), heroCatalogApi.versions()]);
    if (!alive.current) return;
    if (results[0].data) setHeroes(results[0].data.heroes.filter((hero) => hero.catalog !== "overlay"));
    if (results[1].data) { setVersions(results[1].data.items); setCursor(results[1].data.nextCursor); }
    setError(results[0].error ?? results[1].error);
  };
  useEffect(() => { setPreview(null); setVersionId(""); setConfirm(false); void reload(); }, [props.championId, props.document]);
  useEffect(() => {
    const token = ++request.current; setPreview(null); setConfirm(false);
    if (!versionId) { setLoading(false); return; }
    setLoading(true); setError(null);
    void heroCatalogApi.preview(heroPath, versionId).then((result) => {
      if (!alive.current || token !== request.current) return;
      setPreview(result.data); setError(result.error); setLoading(false);
    });
  }, [heroPath, versionId]);
  const capture = async () => {
    props.onBusy(true); setError(null);
    try {
      const result = await heroCatalogApi.capture();
      if (!alive.current) return;
      if (!result.data) { setError(result.error); return; }
      await reload(); setVersionId(result.data.version.versionId); setNotice("目前完整資料已保存。");
    } finally { if (alive.current) props.onBusy(false); }
  };
  const restore = async () => {
    if (!preview || !confirm) return;
    props.onBusy(true); setError(null);
    const result = await heroCatalogApi.restore(preview);
    if (!alive.current) return;
    props.onBusy(false); setConfirm(false);
    if (!result.data) { setError(result.error); setPreview(null); setVersionId(""); return; }
    setNotice(`已回復 ${preview.hero.name} 的完整資料，回復前版本及歷史紀錄已保留。`);
    setPreview(null); setVersionId(""); await reload(); props.onSaved();
  };
  const locked = props.disabled || props.dirty || loading;
  const blocked = !preview || !preview.changes.length || preview.blockedSources.length > 0 || (preview.hero.catalog !== "legacy" && preview.issues.length > 0);
  return <Panel title="完整英雄版本">
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ margin: 0, color: TEXT_DIM }}>比較與回復包含英雄屬性、技能、機制、特效、音效、模型及動作綁定。歷史英雄仍保留原本的收錄狀態。</p>
      <label>英雄<select aria-label="完整版本的英雄" style={selectStyle} disabled={locked} value={heroPath} onChange={(event) => { setHeroPath(event.target.value); setNotice(""); }}>
        {!heroes.length && <option value={heroPath}>{props.championId}</option>}
        {heroes.map((hero) => <option key={hero.path} value={hero.path}>{hero.name} · {hero.catalog === "legacy" ? "歷史英雄" : "現有英雄"}</option>)}
      </select></label>
      <label>版本<select aria-label="完整英雄資料版本" style={selectStyle} disabled={props.disabled || props.dirty} value={versionId} onChange={(event) => { setVersionId(event.target.value); setNotice(""); }}>
        <option value="">選擇已保存版本並比較</option>
        {versions.map((version) => <option key={version.versionId} value={version.versionId}>{new Date(version.createdAt).toLocaleString()} · {version.versionId.slice(7, 19)}</option>)}
      </select></label>
      {cursor && <Btn small disabled={locked} onClick={() => void heroCatalogApi.versions(cursor).then((result) => { if (alive.current) { if (result.data) { setVersions((rows) => [...rows, ...result.data!.items.filter((item) => !rows.some((row) => row.versionId === item.versionId))]); setCursor(result.data.nextCursor); } setError(result.error); } })}>載入更早版本</Btn>}
      <Btn disabled={locked} onClick={() => void capture()}>保存目前完整版本</Btn>
      {loading && <div role="status">正在讀取完整資料與素材，建立英雄的獨立版本…</div>}
      {preview && <>
        <div>此英雄版本共 {preview.files.length} 份資料；與目前內容有 {preview.changes.length} 份差異。</div>
        {preview.issues.map((issue) => <div key={issue} style={{ color: DANGER }}>{issue}</div>)}
        {preview.blockedSources.length > 0 && <div role="alert">包含產生器管理的來源，須透過來源編輯流程回復：{preview.blockedSources.map((entry) => entry.path).join("、")}</div>}
        {!!preview.generatorSources?.length && <details><summary>已保存的產生器來源</summary><p>以下是此版本保存的原始來源；套用歷史來源前仍須完成重生成與差異檢查。</p>{preview.generatorSources.map((entry) => <details key={entry.productPath}><summary>{entry.productPath} · {entry.generatorVersion?.slice(7,19) ?? "來源尚未取得"}</summary><div>{entry.sourcePath}</div><pre style={{whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12}}>{entry.source ?? "此產生器尚無可保存的來源轉接器。"}</pre></details>)}</details>}
        <details><summary>檢視完整原始資料、技能與綁定</summary>{preview.documents.map((doc) => <details key={doc.path}><summary>{doc.path}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{doc.source}</pre></details>)}</details>
        <details><summary>逐項比較修改內容</summary>{preview.documents.filter((doc) => doc.currentSource !== doc.source).map((doc) => <details key={doc.path}><summary>{doc.path}</summary><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div>目前資料<pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{doc.currentSource ?? "目前沒有此資料"}</pre></div><div>選取版本<pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{doc.source}</pre></div></div></details>)}</details>
        <details open={preview.changes.length > 0}><summary>此次回復的檔案差異</summary><ul>{preview.changes.map((change) => <li key={change.path}>{change.kind === "added" ? "新增" : "還原"} {change.path} · {change.bytes.toLocaleString()} bytes</li>)}</ul></details>
        {preview.changes.length > 0 && <div>此次只回復 {preview.hero.name} 的獨立實例。模板來源與其他英雄的選用設定不會被修改。</div>}
        {!blocked && <label><input aria-label="確認英雄獨立版本還原" type="checkbox" disabled={locked} checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />我已確認此英雄的版本差異</label>}
        <Btn disabled={locked || blocked || !confirm} onClick={() => void restore()}>回復選取的完整版本</Btn>
      </>}
      {props.dirty && <div>請先儲存或放棄目前修改，再操作版本。</div>}
      {error && <div role="alert" style={{ color: DANGER }}>{error}</div>}
      {notice && <div role="status">{notice}</div>}
    </div>
  </Panel>;
}
