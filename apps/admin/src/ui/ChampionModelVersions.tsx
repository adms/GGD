import { useEffect, useRef, useState } from "react";
import type { ChampionModelVersionState, ModelVersionCommand, ModelVersionSource } from "@ggd/shared/content/schema/championModelVersions";
import type { ContentEditApi } from "../contentApi";
import { Btn, Panel } from "./widgets";
import { DANGER, TEXT_DIM, TEXT_MAIN } from "./theme";

const KIND_LABELS: Record<ModelVersionSource["kind"], string> = {
  exact: "同一角色", alternate: "同角色其他形態", "style-proxy": "相近風格替代", previous: "原上線版本",
};
const inputStyle = { background: "#10141f", color: TEXT_MAIN, border: "1px solid #465064", borderRadius: 6, padding: 8, width: "100%", boxSizing: "border-box" as const };

export function ChampionModelVersions(props: {
  api: ContentEditApi; championId: string; document: Record<string, unknown>; disabled: boolean; dirty: boolean;
  onBusy: (busy: boolean) => void; onSaved: () => void;
}): React.JSX.Element {
  const { api, championId } = props;
  const [state, setState] = useState<ChampionModelVersionState | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<Record<string, unknown> | null>(null);
  const [sourceModelKey, setSourceModelKey] = useState("");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<ModelVersionSource>({ kind: "exact", character: "", work: "", library: "", reference: "" });
  const alive = useRef(false);
  useEffect(() => {
    let current = true;
    alive.current = true;
    void api.modelVersions.read(championId).then((result) => {
      if (!current) return;
      setState(result.state); setError(result.error); setSelected(result.state?.activeModelKey ?? "");
    });
    return () => { current = false; alive.current = false; };
  }, [api, championId, props.document]);
  useEffect(() => {
    let current = true;
    void api.modelVersions.catalog().then((result) => { if (current) { setModels(result.ids); if (result.error) setError(result.error); } });
    return () => { current = false; };
  }, [api, props.document]);
  useEffect(() => {
    let current = true;
    setModel(null);
    if (selected) void api.fetchDoc("models", selected).then((result) => { if (current) setModel(result.doc); });
    return () => { current = false; };
  }, [api, selected]);

  const apply = async (command: ModelVersionCommand) => {
    props.onBusy(true); setError(null); setNotice("");
    const result = await api.modelVersions.update(championId, command);
    if (!alive.current) return;
    props.onBusy(false);
    if (!result.state) { setError(result.error); return; }
    setState(result.state); setSelected(result.state.activeModelKey);
    setNotice("已套用模型版本，下一場對戰生效。舊版模型與動作設定已保留，可隨時切回。");
    props.onSaved();
  };
  const locked = props.disabled || props.dirty || !state;
  const version = state?.versions.find((entry) => entry.modelKey === selected);
  return <Panel title="上線模型版本">
    <div style={{ display: "grid", gap: 10 }}>
      <label>選擇上線套用的 3D 模型
        <select aria-label="上線模型版本" style={inputStyle} disabled={locked} value={selected} onChange={(event) => setSelected(event.target.value)}>
          {!state?.versions.length && <option value={state?.activeModelKey ?? ""}>目前模型 · {state?.activeModelKey ?? "載入中"}</option>}
          {[...(state?.versions ?? [])].reverse().map((entry, index) => <option key={entry.modelKey} value={entry.modelKey}>
            {entry.label} · {KIND_LABELS[entry.source.kind]}{index === 0 ? " · 最新" : ""}{entry.modelKey === state?.activeModelKey ? " · 使用中" : ""}
          </option>)}
        </select>
      </label>
      {version && <div style={{ color: TEXT_DIM, fontSize: 12 }}>
        素材角色：{version.source.character} · 作品：{version.source.work} · 素材庫：{version.source.library}<br />
        來源：{version.source.reference}<br />
        保存時間：{new Date(version.registeredAt).toLocaleString()}
      </div>}
      {model && <details><summary>檢視此版模型與動作綁定</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify({ 模型: model.glbPath, 尺寸: model.scale, 朝向角度: model.yawOffsetDeg, 動作: model.clipMap }, null, 2)}</pre></details>}
      <Btn disabled={locked || !version || selected === state?.activeModelKey} onClick={() => state && void apply({ action: "activate", modelKey: selected, expectedHash: state.expectedHash })}>套用選取版本</Btn>
      <details><summary>新增已匯入的模型版本</summary>
        <fieldset disabled={locked} style={{ border: 0, padding: "10px 0", display: "grid", gap: 8 }}>
          <label>已匯入模型<input aria-label="新增版本的模型" list={`model-options-${championId}`} style={inputStyle} value={sourceModelKey} onChange={(e) => setSourceModelKey(e.target.value)} /></label>
          <datalist id={`model-options-${championId}`}>{models.map((id) => <option key={id} value={id} />)}</datalist>
          <label>版本名稱<input aria-label="模型版本名稱" maxLength={160} style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          <label>角色對應<select aria-label="模型角色對應" style={inputStyle} value={source.kind} onChange={(e) => setSource({ ...source, kind: e.target.value as ModelVersionSource["kind"] })}>{(["exact", "alternate", "style-proxy"] as const).map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</select></label>
          {([ ["character", "素材角色"], ["work", "原作／作品"], ["library", "素材庫"], ["reference", "來源依據"] ] as const).map(([key, title]) => <label key={key}>{title}<input aria-label={title} maxLength={key === "reference" ? 1000 : 120} style={inputStyle} value={source[key]} onChange={(e) => setSource({ ...source, [key]: e.target.value })} /></label>)}
          <Btn disabled={locked || !sourceModelKey.trim() || !label.trim() || Object.values(source).some((value) => !value.trim())} onClick={() => state && void apply({ action: "register", expectedHash: state.expectedHash, sourceModelKey, label, source })}>新增並預設套用</Btn>
        </fieldset>
        <p style={{ color: TEXT_DIM, fontSize: 12 }}>請先完成模型與動作的畫面驗收。新增時會保存目前版本，並預設套用新模型；英雄名稱與技能保持原設定。</p>
      </details>
      {props.dirty && <div>請先儲存或放棄英雄的其他修改，再切換模型。</div>}
      {error && <div role="alert" style={{ color: DANGER }}>{error}<Btn small disabled={props.disabled} onClick={() => void api.modelVersions.read(championId).then((r) => { if (alive.current) { setState(r.state); setSelected(r.state?.activeModelKey ?? ""); setError(r.error); } })}>重新載入版本</Btn></div>}
      {notice && <div role="status">{notice}</div>}
    </div>
  </Panel>;
}
