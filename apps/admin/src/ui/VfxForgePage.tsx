/**
 * 鑄技工坊 —— 特效家族原型 + per-invocation 參數的編輯介面
 * (task #205 / #230 / #272)。
 *
 * 所有邏輯在 `../vfxForge`（測試也在那裡），這個檔只是視圖。
 *
 * ⚠️ 這一頁存在的理由，一句話：646 支技能真的畫得出東西，但其中 595 支畫的是
 * **依技能中文名猜**出來的合成原型。所以「原作」那一欄比其他每一欄都重要 ——
 * owner 要能一眼看出「這支現在畫的是猜的，原作其實是 WarStompCaster」，然後在
 * 同一列把它換成衝擊波環家族、放大、染色。
 *
 * 兩張表，因為它們是兩個不同的問題：
 *   · **家族原型**（21 列）—— 「衝擊波環該長什麼樣」。改一列 = 整批技能一起變。
 *   · **技能綁定**（每支一列）—— 「這一招用哪個家族 + 原圖給它的那組參數」。
 *
 * ⚠️ 留白 ≠ 0。per-ability 的空格代表「原圖沒說，用家族預設」，存檔時整個欄位
 * 不會寫進去（`abilityBindingFromDraft`）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn, TextInput, Badge } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc, revertOverlayDoc } from "../api";
import {
  ABILITY_BOUNDS,
  ABILITY_FIELDS,
  ABSENT_NOTE,
  APPLY_NOTE,
  ELEMENT_IDS,
  ELEMENT_LABEL_ZH,
  FAMILY_BOUNDS,
  FAMILY_FIELDS,
  FAMILY_HINT,
  FAMILY_IDS,
  FAMILY_MODELS,
  FIELD_HINT,
  FIELD_LABEL,
  GLOBAL_BOUNDS,
  GLOBAL_FIELDS,
  ORIGIN_LABEL,
  PRIMITIVE_KINDS,
  PROVENANCE_LABEL,
  PROVENANCE_NOTE,
  VFX_FAMILIES_COLLECTION,
  VFX_FAMILIES_DOC_ID,
  abilityBindingFromDraft,
  abilityDraftFrom,
  clearAbilityBinding,
  extractFamiliesDoc,
  familiesDocFor,
  familyCensusCounts,
  familyDraftFrom,
  familyLabel,
  familyTuningFromDraft,
  forgeRows,
  forgeSummary,
  forgeSummaryText,
  loadErrorText,
  loadForgeCatalog,
  saveErrorText,
  setAbilityBinding,
  setFamilyTuning,
  validateAbilityDraft,
  validateFamilyDraft,
  validateGlobalField,
  type AbilityDraft,
  type AbilityField,
  type FamilyDraft,
  type FamilyField,
  type ForgeCatalog,
  type ForgeRow,
  type GlobalField,
} from "../vfxForge";
import type { ConfigVfxFamiliesDoc, W3xFamilyId } from "@ggd/shared/content/schema/vfx";

const EMPTY_CATALOG: ForgeCatalog = { abilities: [], vfxIds: new Set<string>(), census: new Map() };

const ORIGIN_COLOR: Record<string, string> = {
  none: DANGER,
  guessed: WARN,
  family: OK,
  w3x: OK,
  authored: ACCENT,
};

type FilterMode = "rebindable" | "guessed" | "bound" | "all";

const FILTER_LABEL: Record<FilterMode, string> = {
  rebindable: "原作有證據、可以重綁的",
  guessed: "現在畫的是猜的",
  bound: "已經在這一頁改過的",
  all: "全部",
};

/** 一次最多畫幾列 —— 696 列全畫會把瀏覽器拖垮，而且沒有人一次看得完。 */
const PAGE_SIZE = 60;

const SELECT_STYLE: React.CSSProperties = {
  background: "#10141f",
  color: TEXT_MAIN,
  border: "1px solid #2c3448",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};

function Select(props: {
  field: string;
  value: string;
  label: string;
  hint: string;
  invalid?: boolean;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <select
      data-field={props.field}
      aria-label={props.label}
      title={props.hint}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      style={{ ...SELECT_STYLE, borderColor: props.invalid ? DANGER : "#2c3448", width: "100%" }}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function VfxForgePage(): React.JSX.Element {
  const [catalog, setCatalog] = useState<ForgeCatalog>(EMPTY_CATALOG);
  const [doc, setDoc] = useState<ConfigVfxFamiliesDoc | null>(null);
  const [globals, setGlobals] = useState<Record<string, string> | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [famDrafts, setFamDrafts] = useState<Record<string, FamilyDraft>>({});
  const [abDrafts, setAbDrafts] = useState<Record<string, AbilityDraft>>({});
  const [removals, setRemovals] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FilterMode>("rebindable");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    try {
      // LIVE FIRST —— overlay 才是 shard 真的在讀的東西。
      const overlaid = (await getOverlayDoc(VFX_FAMILIES_COLLECTION, VFX_FAMILIES_DOC_ID)) as unknown;
      let full: unknown = overlaid ?? null;
      if (!full) {
        const shipped = await getShippedDoc(VFX_FAMILIES_COLLECTION, VFX_FAMILIES_DOC_ID);
        if (shipped.present && shipped.doc) full = shipped.doc;
      }
      const parsed = extractFamiliesDoc(full);
      setDoc(parsed);
      if (parsed) {
        setEnabled(parsed.enabled);
        setGlobals({
          scaleGain: String(parsed.scaleGain),
          scaleMin: String(parsed.scaleMin),
          scaleMax: String(parsed.scaleMax),
        });
      }
    } catch (err) {
      setApiErr(saveErrorText(err));
    }
    try {
      setCatalog(await loadForgeCatalog());
    } catch (err) {
      setLoadErr(loadErrorText(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(
    () => forgeRows(catalog.abilities, catalog.vfxIds, catalog.census, doc),
    [catalog, doc],
  );
  const summary = useMemo(() => forgeSummary(rows), [rows]);
  const censusCounts = useMemo(() => familyCensusCounts(catalog.census), [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (mode === "rebindable" && !r.suggested) return false;
      if (mode === "guessed" && r.origin !== "guessed") return false;
      if (mode === "bound" && !r.binding && abDrafts[r.abilityId] === undefined) return false;
      if (q === "") return true;
      return (
        r.abilityId.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.originalArt.some((a) => a.stem.includes(q))
      );
    });
  }, [rows, mode, query, abDrafts]);

  const shown = filtered.slice(0, PAGE_SIZE);

  const setGlobal = (field: GlobalField, value: string): void => {
    setGlobals((g) => (g ? { ...g, [field]: value } : g));
  };

  const setFamField = (family: string, field: FamilyField, value: string, base: FamilyDraft): void => {
    setFamDrafts((d) => ({ ...d, [family]: { ...(d[family] ?? base), [field]: value } }));
  };

  const setAbField = (id: string, field: AbilityField, value: string, base: AbilityDraft): void => {
    setAbDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? base), [field]: value } }));
    setRemovals((r) => r.filter((x) => x !== id));
  };

  const dropAbility = (id: string, hasBinding: boolean): void => {
    setAbDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    if (hasBinding) setRemovals((r) => (r.includes(id) ? r : [...r, id]));
  };

  /** 壞掉的一列（含跨欄的顏色三格規則）。有任何一列壞掉就不准存。 */
  const problems = useMemo(() => {
    const bad: string[] = [];
    for (const f of GLOBAL_FIELDS) {
      if (globals && validateGlobalField(f, globals[f] ?? "")) bad.push(FIELD_LABEL[f] ?? f);
    }
    for (const [fam, d] of Object.entries(famDrafts)) {
      if (Object.keys(validateFamilyDraft(d)).length > 0) bad.push(familyLabel(fam));
    }
    for (const [id, d] of Object.entries(abDrafts)) {
      if (Object.keys(validateAbilityDraft(d)).length > 0) bad.push(id);
    }
    return bad;
  }, [globals, famDrafts, abDrafts]);

  /** 要 PUT 的整張表。**整張**，不是只有被改的那一列。 */
  const pending = useMemo((): ConfigVfxFamiliesDoc | null => {
    if (!doc || !globals) return null;
    let next: ConfigVfxFamiliesDoc = {
      ...doc,
      enabled,
      scaleGain: Number(globals["scaleGain"]),
      scaleMin: Number(globals["scaleMin"]),
      scaleMax: Number(globals["scaleMax"]),
      families: { ...doc.families },
      abilities: { ...doc.abilities },
    };
    for (const [fam, d] of Object.entries(famDrafts)) {
      const t = familyTuningFromDraft(d);
      if (t) next = setFamilyTuning(next, fam as W3xFamilyId, t);
    }
    for (const id of removals) next = clearAbilityBinding(next, id);
    for (const [id, d] of Object.entries(abDrafts)) {
      const b = abilityBindingFromDraft(d);
      // 每一格都清空 → 這筆綁定不再說任何事，等同移除（絕不寫一堆 0 進去）
      next = b ? setAbilityBinding(next, id, b) : clearAbilityBinding(next, id);
    }
    return familiesDocFor(next);
  }, [doc, globals, enabled, famDrafts, abDrafts, removals]);

  const dirty = useMemo(
    () => (doc && pending ? JSON.stringify(pending) !== JSON.stringify(familiesDocFor(doc)) : false),
    [pending, doc],
  );

  const save = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(
        VFX_FAMILIES_COLLECTION,
        VFX_FAMILIES_DOC_ID,
        pending as unknown as Record<string, unknown>,
      );
      setDoc(pending);
      setFamDrafts({});
      setAbDrafts({});
      setRemovals([]);
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const revertAll = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const head = await revertOverlayDoc(VFX_FAMILIES_COLLECTION, VFX_FAMILIES_DOC_ID);
      setFamDrafts({});
      setAbDrafts({});
      setRemovals([]);
      await load();
      setFlash(`✓ 已還原出貨版（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="鑄技工坊 · 特效綁定">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.8, margin: "0 0 8px" }}>
        原作把同一個模型<strong style={{ color: TEXT_MAIN }}>放大縮小、改色、改透明度</strong>
        重複用在幾十支技能上，所以這一頁調的是<strong style={{ color: TEXT_MAIN }}>家族原型</strong>
        ，不是單一特效。「原作」那一欄告訴你這支技能在原始地圖裡真正畫的是哪個模型 ——
        現在畫的多半是依技能名猜出來的替身。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 4px" }}>{PROVENANCE_NOTE}</p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 4px" }}>{ABSENT_NOTE}</p>
      <p style={{ color: WARN, fontSize: 12, lineHeight: 1.7, margin: "0 0 12px" }}>{APPLY_NOTE}</p>

      <div
        style={{ border: PANEL_BORDER, borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12, color: TEXT_MAIN }}
        data-testid="forge-summary"
      >
        {forgeSummaryText(summary)}
      </div>

      {loadErr && (
        <div style={{ color: DANGER, fontSize: 12, marginBottom: 10 }} data-testid="forge-load-error">
          {loadErr}
        </div>
      )}
      {apiErr && (
        <div style={{ color: DANGER, fontSize: 12, marginBottom: 10 }} data-testid="forge-api-error">
          {apiErr}
        </div>
      )}
      {flash && (
        <div style={{ color: OK, fontSize: 12, marginBottom: 10 }} data-testid="forge-flash">
          {flash}
        </div>
      )}
      {doc === null && !loadErr && (
        <div style={{ color: WARN, fontSize: 12, marginBottom: 10 }} data-testid="forge-no-doc">
          讀不到 config/vfx-families 這份文件，這一頁沒有東西可以編輯
        </div>
      )}

      {/* ---------------------------------------------------------- 全域控制列 */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: TEXT_DIM }}>
          總開關
          <Select
            field="enabled"
            value={enabled ? "1" : "0"}
            label="總開關"
            hint="關掉之後整層家族覆寫都不生效，技能回到依名字猜出來的 fx.prim.*"
            options={[
              { value: "1", label: "開（家族綁定生效）" },
              { value: "0", label: "關（全部回到猜的分類）" },
            ]}
            onChange={(v) => setEnabled(v === "1")}
          />
        </label>
        {GLOBAL_FIELDS.map((f) => {
          const b = GLOBAL_BOUNDS[f];
          const err = globals ? validateGlobalField(f, globals[f] ?? "") : "";
          return (
            <label key={f} style={{ fontSize: 11, color: TEXT_DIM, width: 150 }}>
              <span title={FIELD_HINT[f]}>
                {FIELD_LABEL[f]}（{b?.min}–{b?.max}）
              </span>
              <TextInput
                value={globals?.[f] ?? ""}
                onChange={(v) => setGlobal(f, v)}
                dataField={`g.${f}`}
                title={FIELD_HINT[f]}
                disabled={globals === null}
                style={err ? { border: `1px solid ${DANGER}` } : undefined}
              />
              {err && <span style={{ color: DANGER, fontSize: 10 }}>{err}</span>}
            </label>
          );
        })}

        <div style={{ flex: 1 }} />

        <Btn
          kind="primary"
          onClick={() => void save()}
          disabled={busy || !dirty || problems.length > 0}
          title={problems.length > 0 ? `有 ${problems.length} 處填錯，先修好` : dirty ? "" : "沒有任何改動"}
        >
          儲存 Save
        </Btn>
        <Btn kind="danger" onClick={() => void revertAll()} disabled={busy}>
          還原出貨版
        </Btn>
      </div>

      {problems.length > 0 && (
        <div style={{ color: DANGER, fontSize: 12, marginBottom: 10 }} data-testid="forge-blocked">
          有 {problems.length} 處還不能存：{problems.join("、")}
        </div>
      )}

      {/* ------------------------------------------------------------ 家族原型 */}
      <div style={{ color: TEXT_DIM, fontSize: 11, margin: "16px 0 6px" }}>
        家族原型（{FAMILY_IDS.length} 個）。括號內是這個家族的原圖模型在出貨的 w3x
        考古檔裡被引用幾次，檢視時現算。改一列 = 用這個家族的技能全部一起變。
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {FAMILY_IDS.map((fam) => {
              const shipped = doc?.families[fam];
              if (!shipped) return null;
              const draft = famDrafts[fam] ?? familyDraftFrom(shipped);
              const errs = validateFamilyDraft(draft);
              const open = openFamily === fam;
              return (
                <tr key={fam} style={{ borderTop: PANEL_BORDER, verticalAlign: "top" }} data-testid={`family-row-${fam}`}>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => setOpenFamily(open ? null : fam)}
                      data-field={`famopen.${fam}`}
                      title={`${FAMILY_HINT[fam] ?? ""}\n原作模型：${(FAMILY_MODELS[fam] ?? []).join(" / ")}`}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: ACCENT,
                        fontSize: 12,
                      }}
                    >
                      {familyLabel(fam)}
                    </button>{" "}
                    <span style={{ color: GOLD, fontSize: 11 }}>{censusCounts.get(fam) ?? 0}</span>
                  </td>
                  <td style={{ padding: "6px 8px", color: TEXT_DIM, fontSize: 11 }}>
                    {(FAMILY_MODELS[fam] ?? []).join(" / ")}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {!open && (
                      <span style={{ color: TEXT_MAIN, fontSize: 11 }}>
                        {draft.enabled === "1" ? "" : "（停用）"}
                        {draft.primitive} · {draft.element} · 大小 {draft.scale} · 透明 {draft.alpha} · 時間{" "}
                        {draft.timeScale} · 高度 {draft.heightY}
                      </span>
                    )}
                    {open && (
                      <div
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}
                        data-testid={`family-editor-${fam}`}
                      >
                        {FAMILY_FIELDS.map((f) => (
                          <label key={f} style={{ display: "block" }}>
                            <span style={{ color: TEXT_DIM, fontSize: 10 }} title={FIELD_HINT[f]}>
                              {FIELD_LABEL[f]}
                              {FAMILY_BOUNDS[f] ? `（${FAMILY_BOUNDS[f]?.min}–${FAMILY_BOUNDS[f]?.max}）` : ""}
                            </span>
                            {f === "enabled" || f === "primitive" || f === "element" ? (
                              <Select
                                field={`fam.${f}`}
                                value={draft[f]}
                                label={`${familyLabel(fam)} ${FIELD_LABEL[f]}`}
                                hint={FIELD_HINT[f] ?? ""}
                                invalid={Boolean(errs[f])}
                                options={
                                  f === "enabled"
                                    ? [
                                        { value: "1", label: "開" },
                                        { value: "0", label: "關" },
                                      ]
                                    : f === "primitive"
                                      ? PRIMITIVE_KINDS.map((p) => ({ value: p, label: p }))
                                      : ELEMENT_IDS.map((e) => ({
                                          value: e,
                                          label: ELEMENT_LABEL_ZH[e] ?? e,
                                        }))
                                }
                                onChange={(v) => setFamField(fam, f, v, draft)}
                              />
                            ) : (
                              <TextInput
                                value={draft[f]}
                                onChange={(v) => setFamField(fam, f, v, draft)}
                                dataField={`fam.${f}`}
                                title={FIELD_HINT[f]}
                                style={errs[f] ? { border: `1px solid ${DANGER}` } : undefined}
                              />
                            )}
                            {errs[f] && <span style={{ color: DANGER, fontSize: 10 }}>{errs[f]}</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ 技能綁定 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "20px 0 8px" }}>
        <label style={{ fontSize: 12, color: TEXT_DIM }}>只看</label>
        <select
          data-field="filter.mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as FilterMode)}
          style={SELECT_STYLE}
        >
          {(Object.keys(FILTER_LABEL) as FilterMode[]).map((m) => (
            <option key={m} value={m}>
              {FILTER_LABEL[m]}
            </option>
          ))}
        </select>
        <div style={{ width: 240 }}>
          <TextInput value={query} onChange={setQuery} dataField="filter.q" placeholder="搜尋技能名 / id / 原作模型名" />
        </div>
        <span style={{ color: TEXT_DIM, fontSize: 11 }} data-testid="forge-count">
          符合 {filtered.length} 列{filtered.length > PAGE_SIZE ? `，先顯示前 ${PAGE_SIZE} 列` : ""}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>技能（點 id 編輯）</th>
              <th style={{ padding: "6px 8px" }}>現在畫的是什麼</th>
              <th style={{ padding: "6px 8px" }}>原作用的是哪個模型</th>
              <th style={{ padding: "6px 8px" }}>這一頁的綁定</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <RowView
                key={r.abilityId}
                row={r}
                draft={abDrafts[r.abilityId] ?? null}
                editing={editing === r.abilityId}
                onOpen={() => setEditing((cur) => (cur === r.abilityId ? null : r.abilityId))}
                onField={(f, v, base) => setAbField(r.abilityId, f, v, base)}
                onDrop={() => dropAbility(r.abilityId, r.binding !== null)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function RowView(props: {
  row: ForgeRow;
  draft: AbilityDraft | null;
  editing: boolean;
  onOpen: () => void;
  onField: (field: AbilityField, value: string, base: AbilityDraft) => void;
  onDrop: () => void;
}): React.JSX.Element {
  const { row, draft, editing } = props;
  /**
   * 編輯器顯示的草稿：操作者改過的 → 已存的綁定 → 空白（不是原作建議的家族，
   * 因為那一格留白的語意就是「沿用出貨綁定」；建議另外用一顆按鈕套用）。
   * 它只是**顯示**，沒有進 `abDrafts`，所以打開一列來看不會弄髒表單。
   */
  const shown: AbilityDraft = draft ?? abilityDraftFrom(row.binding);
  const errs = validateAbilityDraft(shown);

  return (
    <tr data-testid={`forge-row-${row.abilityId}`} style={{ borderTop: PANEL_BORDER, verticalAlign: "top" }}>
      <td style={{ padding: "6px 8px" }}>
        <div style={{ color: TEXT_MAIN }}>{row.name}</div>
        <button
          onClick={props.onOpen}
          data-field={`open.${row.abilityId}`}
          title="編輯這一列"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: ACCENT,
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {row.abilityId}
        </button>
      </td>

      <td style={{ padding: "6px 8px" }}>
        <Badge color={ORIGIN_COLOR[row.origin] ?? TEXT_DIM}>{ORIGIN_LABEL[row.origin]}</Badge>
        <div style={{ color: TEXT_DIM, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
          {row.shippedResolvedId ?? row.shippedVfxKey ?? "—"}
          {row.shippedVfxKey !== null && row.shippedResolvedId === null && (
            <span style={{ color: DANGER }}> ← 指向一份不存在的特效文件</span>
          )}
        </div>
      </td>

      <td style={{ padding: "6px 8px" }} data-testid={`forge-original-${row.abilityId}`}>
        {row.originalArt.length === 0 && (
          <span style={{ color: TEXT_DIM, fontSize: 11 }}>普查裡沒有這支技能的美術紀錄</span>
        )}
        {row.originalArt.slice(0, 3).map((a) => (
          <div key={`${a.channel}:${a.stem}`} style={{ marginBottom: 2 }}>
            <span style={{ color: TEXT_MAIN, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{a.stem}</span>{" "}
            <span style={{ color: TEXT_DIM, fontSize: 10 }} title={PROVENANCE_LABEL[a.provenance] ?? a.provenance}>
              {a.channel} · {a.provenance}
            </span>
          </div>
        ))}
        {row.suggested && (
          <div style={{ color: GOLD, fontSize: 11 }}>→ 建議家族：{familyLabel(row.suggested.family)}</div>
        )}
      </td>

      <td style={{ padding: "6px 8px", minWidth: 280 }}>
        {!editing && (
          <span style={{ color: TEXT_MAIN, fontSize: 11 }}>
            {row.binding
              ? `${row.binding.family ? familyLabel(row.binding.family) : "（沿用出貨綁定）"}${
                  row.binding.w3xScale !== undefined ? ` · 原圖縮放 ${row.binding.w3xScale}` : ""
                }${row.binding.tint ? ` · tint ${row.binding.tint.join(",")}` : ""}`
              : "未綁定（維持出貨特效）"}
          </span>
        )}
        {editing && (
          <div style={{ border: PANEL_BORDER, borderRadius: 10, padding: 8 }} data-testid={`forge-editor-${row.abilityId}`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
              {ABILITY_FIELDS.map((f) => (
                <label key={f} style={{ display: "block" }}>
                  <span style={{ color: TEXT_DIM, fontSize: 10 }} title={FIELD_HINT[f]}>
                    {FIELD_LABEL[f]}
                    {ABILITY_BOUNDS[f] ? `（${ABILITY_BOUNDS[f]?.min}–${ABILITY_BOUNDS[f]?.max}）` : ""}
                  </span>
                  {f === "family" || f === "enabled" ? (
                    <Select
                      field={`f.${f}`}
                      value={shown[f]}
                      label={`${row.abilityId} ${FIELD_LABEL[f]}`}
                      hint={FIELD_HINT[f] ?? ""}
                      invalid={Boolean(errs[f])}
                      options={
                        f === "family"
                          ? [
                              { value: "", label: "（沿用出貨綁定）" },
                              ...FAMILY_IDS.map((k) => ({ value: k, label: familyLabel(k) })),
                            ]
                          : [
                              { value: "", label: "（沿用家族開關）" },
                              { value: "1", label: "開" },
                              { value: "0", label: "關" },
                            ]
                      }
                      onChange={(v) => props.onField(f, v, shown)}
                    />
                  ) : (
                    <TextInput
                      value={shown[f]}
                      onChange={(v) => props.onField(f, v, shown)}
                      dataField={`f.${f}`}
                      title={FIELD_HINT[f]}
                      placeholder="留白＝原圖沒說"
                      style={errs[f] ? { border: `1px solid ${DANGER}` } : undefined}
                    />
                  )}
                  {errs[f] && <span style={{ color: DANGER, fontSize: 10 }}>{errs[f]}</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
              {row.suggested && (
                <Btn
                  small
                  onClick={() => props.onField("family", row.suggested!.family, shown)}
                  dataField={`apply.${row.abilityId}`}
                  title={`普查說原作用的是 ${row.suggested.art.stem}`}
                >
                  套用原作建議（{familyLabel(row.suggested.family)}）
                </Btn>
              )}
              <Btn small kind="danger" onClick={props.onDrop} dataField={`drop.${row.abilityId}`}>
                移除這一列的綁定
              </Btn>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
