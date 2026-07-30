/**
 * 一支技能的**特效堆疊**編輯器 (task #205 / #230).
 *
 * 邏輯全在 `../vfxLayers`（測試也在那裡），這個檔只是視圖 —— 和鑄技工坊本體
 * 同一個分工。
 *
 * 這一塊解的是鑄技工坊做不到的那三件事：
 *   ① **選特效**：631 份 `content/vfx/` 模板，可搜尋、可依種類篩，選之前看得到
 *      這份文件真正的參數（形狀／模式／壽命／大小／顏色／混色）。
 *   ② **疊多層**：加、刪、調順序，每層各自的參數覆寫。
 *   ③ **層數上限看得見**：上限來自「特效總表」那一格，畫面上直接寫「還可以加幾層」。
 *
 * ⚠️ 存檔寫的是**技能文件**（`abilities/<id>`），不是上面那張 `config/vfx-families`
 * ——所以它有自己的儲存鈕。底是**線上生效的那一份**（overlay 優先），不是出貨那份：
 * 用出貨的當底會把這支技能上一次的編輯靜靜還原掉（GH#241 的形狀）。
 */
import { useEffect, useMemo, useState } from "react";
import { Btn, TextInput } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, putOverlayDoc } from "../api";
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  ATTACH_OPTIONS,
  LAYER_ABSENT_NOTE,
  LAYER_APPLY_NOTE,
  LAYER_BOUNDS,
  LAYER_FIELDS,
  LAYER_FIELD_HINT,
  LAYER_FIELD_LABEL,
  LAYER_OVERRIDE_NOTE,
  TEMPLATE_KIND_LABEL,
  abilityDocWithLayers,
  addLayer,
  capNoticeText,
  filterTemplates,
  layerDraftsFrom,
  layerSaveErrorText,
  layerSummaryText,
  layersRemaining,
  loadVfxTemplates,
  moveLayer,
  removeLayer,
  shippedVfxKeyOf,
  templateCountText,
  validateLayerDraft,
  type LayerDraft,
  type TemplateKind,
  type VfxTemplate,
} from "../vfxLayers";
import { FIELD_HINT, FIELD_LABEL } from "../vfxForge";

/**
 * 模板目錄抓一次就好 —— 631 份文件，操作者一列一列開的時候不該每次重抓。
 * 匯出重設函式，讓測試之間不互相污染。
 */
let templatesPromise: Promise<VfxTemplate[]> | null = null;

export function loadTemplatesOnce(): Promise<VfxTemplate[]> {
  templatesPromise ??= loadVfxTemplates();
  return templatesPromise;
}

export function __resetTemplateCache(): void {
  templatesPromise = null;
}

const SELECT_STYLE: React.CSSProperties = {
  background: "#10141f",
  color: TEXT_MAIN,
  border: "1px solid #2c3448",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
};

const KIND_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "全部種類" },
  ...(Object.keys(TEMPLATE_KIND_LABEL) as TemplateKind[]).map((k) => ({
    value: k,
    label: TEMPLATE_KIND_LABEL[k],
  })),
];

function labelOf(field: string): string {
  return LAYER_FIELD_LABEL[field] ?? FIELD_LABEL[field] ?? field;
}

function hintOf(field: string): string {
  return LAYER_FIELD_HINT[field] ?? FIELD_HINT[field] ?? "";
}

export function AbilityLayersEditor(props: {
  abilityId: string;
  /** 出貨的技能文件（鑄技工坊載目錄時已經抓過，這裡不再多打一次 /content） */
  shippedDoc: unknown;
  /** 「特效總表」那一格算出來的層數上限 */
  cap: number;
}): React.JSX.Element {
  const { abilityId, shippedDoc, cap } = props;
  const [liveDoc, setLiveDoc] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<LayerDraft[] | null>(null);
  const [templates, setTemplates] = useState<VfxTemplate[]>([]);
  const [tplErr, setTplErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // LIVE FIRST —— overlay 才是玩家真的會載到的那一份。讀不到才退回出貨版。
  useEffect(() => {
    let alive = true;
    void (async () => {
      let base: unknown = shippedDoc;
      try {
        const overlaid = await getOverlayDoc("abilities", abilityId);
        if (overlaid) base = overlaid;
      } catch (e) {
        if (alive) setErr(layerSaveErrorText(e));
      }
      if (!alive) return;
      setLiveDoc(base);
      setDrafts(layerDraftsFrom(base));
    })();
    return () => {
      alive = false;
    };
  }, [abilityId, shippedDoc]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const t = await loadTemplatesOnce();
        if (alive) setTemplates(t);
      } catch (e) {
        if (alive) setTplErr(`讀不到 content/vfx/ 的模板清單：${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const filtered = useMemo(
    () => filterTemplates(templates, { query, kind: kind as TemplateKind | "" }),
    [templates, query, kind],
  );

  const rows: LayerDraft[] = drafts ?? [];
  const errsByRow = useMemo(() => rows.map((d) => validateLayerDraft(d)), [rows]);
  const blocked = errsByRow.some((e) => Object.keys(e).length > 0);
  const shippedKey = shippedVfxKeyOf(liveDoc);

  const setField = (i: number, field: string, value: string): void => {
    setDrafts((d) => (d ? d.map((row, j) => (j === i ? { ...row, [field]: value } : row)) : d));
    setFlash(null);
  };

  const save = async (): Promise<void> => {
    const built = abilityDocWithLayers(liveDoc, rows);
    if (!built.doc) {
      setErr(built.error);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const head = await putOverlayDoc("abilities", abilityId, built.doc);
      setLiveDoc(built.doc);
      setDrafts(layerDraftsFrom(built.doc));
      setFlash(`✓ ${abilityId} 的特效堆疊已寫入覆蓋層（generation ${head.generation}）`);
    } catch (e) {
      setFlash(null);
      setErr(layerSaveErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  /** 選單裡永遠要有「目前這一層選的那一份」，就算它被篩選條件擋掉了。 */
  const optionsFor = (current: string): { value: string; label: string }[] => {
    const opts = filtered.map((t) => ({
      value: t.id,
      label: `${t.id}　${TEMPLATE_KIND_LABEL[t.kind]}`,
    }));
    if (current !== "" && !opts.some((o) => o.value === current)) {
      const t = byId.get(current);
      opts.unshift({
        value: current,
        label: t ? `${current}　${TEMPLATE_KIND_LABEL[t.kind]}` : `${current}　⚠️ 不在 content/vfx/ 裡`,
      });
    }
    return [{ value: "", label: "（還沒選）" }, ...opts];
  };

  return (
    <div
      style={{ border: PANEL_BORDER, borderRadius: 10, padding: 10, marginTop: 8 }}
      data-testid={`layers-editor-${abilityId}`}
    >
      <div style={{ color: GOLD, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        多層特效堆疊（vfxLayers）
      </div>
      <p style={{ color: TEXT_DIM, fontSize: 11, lineHeight: 1.7, margin: "0 0 4px" }}>
        {LAYER_OVERRIDE_NOTE}
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 11, lineHeight: 1.7, margin: "0 0 4px" }}>
        {LAYER_ABSENT_NOTE}
      </p>
      <p style={{ color: WARN, fontSize: 11, lineHeight: 1.7, margin: "0 0 8px" }}>{LAYER_APPLY_NOTE}</p>

      <div style={{ color: TEXT_MAIN, fontSize: 11, marginBottom: 6 }} data-testid={`layers-cap-${abilityId}`}>
        {capNoticeText(rows.length, cap)}
      </div>

      {tplErr && (
        <div style={{ color: DANGER, fontSize: 11, marginBottom: 6 }} data-testid="layers-tpl-error">
          {tplErr}
        </div>
      )}
      {err && (
        <div style={{ color: DANGER, fontSize: 11, marginBottom: 6 }} data-testid="layers-error">
          {err}
        </div>
      )}
      {flash && (
        <div style={{ color: OK, fontSize: 11, marginBottom: 6 }} data-testid="layers-flash">
          {flash}
        </div>
      )}

      {/* ------------------------------------------------------ 模板搜尋／篩選 */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ width: 220 }}>
          <TextInput
            value={query}
            onChange={setQuery}
            dataField="tpl.q"
            placeholder="搜尋模板 id / 種類 / 參數"
            title="在 631 份特效模板裡搜尋"
          />
        </div>
        <select
          data-field="tpl.kind"
          aria-label="模板種類"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={{ ...SELECT_STYLE, width: 200 }}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{ color: TEXT_DIM, fontSize: 11 }} data-testid="layers-tpl-count">
          {templateCountText(templates, filtered.length)}
        </span>
      </div>

      {/* ------------------------------------------------------------- 層清單 */}
      {rows.length === 0 && (
        <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 6 }} data-testid={`layers-empty-${abilityId}`}>
          這支技能目前**沒有**堆疊，施法時播的是單一 vfxKey：
          <span style={{ fontFamily: "ui-monospace, monospace", color: TEXT_MAIN }}>
            {" "}
            {shippedKey ?? "（連 vfxKey 都沒有 —— 施法時畫面上什麼都不會出現）"}
          </span>
        </div>
      )}

      {rows.map((d, i) => {
        const tpl = byId.get(d["vfxKey"] ?? "");
        const rowErrs = errsByRow[i] ?? {};
        return (
          <div
            key={i}
            style={{ border: PANEL_BORDER, borderRadius: 8, padding: 8, marginBottom: 6 }}
            data-testid={`layer-${abilityId}-${i}`}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
              <span style={{ color: ACCENT, fontSize: 11, fontWeight: 600 }}>第 {i + 1} 層</span>
              <span style={{ color: TEXT_DIM, fontSize: 11 }} data-testid={`layer-summary-${abilityId}-${i}`}>
                {layerSummaryText(d, tpl)}
              </span>
              <div style={{ flex: 1 }} />
              <Btn small onClick={() => setDrafts((x) => (x ? moveLayer(x, i, -1) : x))} dataField={`layer.${i}.up`} disabled={i === 0}>
                ↑ 上移
              </Btn>
              <Btn
                small
                onClick={() => setDrafts((x) => (x ? moveLayer(x, i, 1) : x))}
                dataField={`layer.${i}.down`}
                disabled={i === rows.length - 1}
              >
                ↓ 下移
              </Btn>
              <Btn small kind="danger" onClick={() => setDrafts((x) => (x ? removeLayer(x, i) : x))} dataField={`layer.${i}.del`}>
                刪除
              </Btn>
            </div>

            {tpl && (
              <div
                style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}
                data-testid={`layer-preview-${abilityId}-${i}`}
              >
                <span
                  aria-label="這份模板的起始顏色"
                  title={`起始顏色 ${tpl.colorHex}`}
                  style={{
                    display: "inline-block",
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: tpl.colorHex,
                    border: "1px solid #2c3448",
                  }}
                />
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>{tpl.summary}</span>
                {!tpl.playable && (
                  <span style={{ color: DANGER, fontSize: 11 }}>{tpl.unplayableReason}</span>
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
              {LAYER_FIELDS.map((f) => (
                <label key={f} style={{ display: "block" }}>
                  <span style={{ color: TEXT_DIM, fontSize: 10 }} title={hintOf(f)}>
                    {labelOf(f)}
                    {LAYER_BOUNDS[f] ? `（${LAYER_BOUNDS[f]?.min}–${LAYER_BOUNDS[f]?.max}）` : ""}
                  </span>
                  {f === "vfxKey" || f === "enabled" || f === "attachTo" ? (
                    <select
                      data-field={`layer.${i}.${f}`}
                      aria-label={`第 ${i + 1} 層 ${labelOf(f)}`}
                      title={hintOf(f)}
                      value={d[f] ?? ""}
                      onChange={(e) => setField(i, f, e.target.value)}
                      style={{ ...SELECT_STYLE, borderColor: rowErrs[f] ? DANGER : "#2c3448" }}
                    >
                      {(f === "vfxKey"
                        ? optionsFor(d["vfxKey"] ?? "")
                        : f === "attachTo"
                          ? [...ATTACH_OPTIONS]
                          : [
                              { value: "", label: "（播）" },
                              { value: "1", label: "播" },
                              { value: "0", label: "暫時不播" },
                            ]
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <TextInput
                      value={d[f] ?? ""}
                      onChange={(v) => setField(i, f, v)}
                      dataField={`layer.${i}.${f}`}
                      title={hintOf(f)}
                      placeholder="留白＝不覆寫"
                      style={rowErrs[f] ? { border: `1px solid ${DANGER}` } : undefined}
                    />
                  )}
                  {rowErrs[f] && <span style={{ color: DANGER, fontSize: 10 }}>{rowErrs[f]}</span>}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Btn
          small
          onClick={() => setDrafts((x) => addLayer(x ?? [], rows.length === 0 ? (shippedKey ?? "") : ""))}
          dataField={`layer.add.${abilityId}`}
          disabled={layersRemaining(rows.length, cap) === 0 || rows.length >= ABILITY_VFX_LAYER_HARD_CAP}
          title={
            layersRemaining(rows.length, cap) === 0
              ? `已經到達上限 ${cap} 層 —— 要更多層請調「單技能特效層數上限」`
              : "加一層。第一層預設帶著這支技能原本的 vfxKey"
          }
        >
          ＋ 新增一層
        </Btn>
        <Btn
          small
          kind="primary"
          onClick={() => void save()}
          dataField={`layer.save.${abilityId}`}
          disabled={busy || blocked || drafts === null}
          title={blocked ? "有一層還沒填對" : "把這支技能的堆疊寫進覆蓋層"}
        >
          儲存特效堆疊
        </Btn>
        {rows.length > 0 && (
          <Btn small kind="danger" onClick={() => setDrafts([])} dataField={`layer.clear.${abilityId}`}>
            清空堆疊（回到單一 vfxKey）
          </Btn>
        )}
      </div>
    </div>
  );
}
