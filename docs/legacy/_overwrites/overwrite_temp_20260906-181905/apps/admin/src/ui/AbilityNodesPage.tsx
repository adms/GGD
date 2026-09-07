/**
 * 🧩 技能積木 —— 「效果清單 ＋ 每顆積木一張表單 ＋ 試放」（GH#992 Scope 2）。
 *
 * 邏輯全在 `../abilityNodes`（測試也在那裡），這個檔只是視圖 —— 和 特效堆疊 那一頁
 * 同一個分工。三個決策點都是後台可調／可見的，⛔ 沒有藏在程式裡：
 *   · 積木清單來自 `ggd-bricks.json`（#989），畫面上印出清冊版本與顆數；
 *   · 每顆積木的欄位從出貨 Zod 走出來，`@zh`/`@note` 有就用，沒有就印路徑（⛔ 不編一個
 *     看起來像中文的名字 —— 那會讓「缺 @zh」看起來已經還清）；
 *   · 存檔走 `putOverlayDoc`（Zod 閘在那一支函式裡），底是**線上生效的那一份**（overlay 優先）。
 *
 * ⚠️ 試放的是**存檔之後線上生效的那一份**（bundle ⊕ overlay 走 `registerAll`），⛔ 不是草稿
 * —— 理由寫在 `abilityNodes.ts` 檔頭。畫面上的按鈕文字就這樣寫，⛔ 不騙操作者。
 * ⚠️ 「玩家看得到」的那一半（像素）不在這一頁：`editor:accept` 的 framebuffer harness 走
 * 鑄技工坊的 QA 路由，這裡只給連結 ⇒ 鏈路已接上，⛔ 未驗收。
 */
import { useEffect, useMemo, useState } from "react";
import { Btn, ErrorBanner, Panel, TextArea, TextInput } from "./widgets";
import { ACCENT, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import { parseIndex } from "../content";
import { fetchNameIndex, type NameIndex } from "../contentNames";
import { resolveHubLinks, type HubEnv } from "../config";
import {
  EFFECT_BRICKS,
  brickForm,
  brickPalette,
  docWithEffects,
  editorQaUrl,
  effectsOf,
  moveEffect,
  newEffect,
  parseRowInput,
  previewCast,
  rowInputValue,
  setAt,
  summarizeEffect,
  validateAbilityDoc,
  type BrickRow,
  type PreviewSummary,
} from "../abilityNodes";

const SELECT_STYLE: React.CSSProperties = {
  background: "#10141f",
  color: TEXT_MAIN,
  border: "1px solid #2c3448",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function editorBase(): string {
  const raw = import.meta.env as unknown as HubEnv;
  const editor = resolveHubLinks(raw, (raw as { PROD?: boolean }).PROD === true ? "prod" : "dev").find(
    (l) => l.key === "editor",
  );
  return editor?.url ?? "/editor/";
}

export function AbilityNodesPage(): React.JSX.Element {
  const [ids, setIds] = useState<string[]>([]);
  const [names, setNames] = useState<NameIndex | null>(null);
  const [query, setQuery] = useState("");
  const [abilityId, setAbilityId] = useState("");
  const [baseDoc, setBaseDoc] = useState<unknown>(null);
  const [source, setSource] = useState<"overlay" | "shipped" | "none">("none");
  const [effects, setEffects] = useState<Record<string, unknown>[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [addKind, setAddKind] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);

  // 目錄：出貨的 abilities/_index.json ＋ 名稱索引（bundle 一個 GET）。
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const resp = await fetch("/content/abilities/_index.json", { headers: { accept: "application/json" } });
        if (!resp.ok) throw new Error(`GET /content/abilities/_index.json → ${resp.status}`);
        const entries = parseIndex(await resp.json());
        if (alive) setIds(entries.map((e) => e.id).sort());
      } catch (e) {
        if (alive) setErr(`讀不到技能目錄：${errText(e)}`);
      }
      try {
        const idx = await fetchNameIndex();
        if (alive) setNames(idx);
      } catch {
        /* 名稱只是裝飾；沒有就印裸 id。 */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 選了一支 ⇒ 底是線上生效的那一份（overlay ?? 出貨）。
  useEffect(() => {
    if (!abilityId) return;
    let alive = true;
    setBaseDoc(null);
    setEffects([]);
    setOpen(null);
    setDrafts({});
    setPreview(null);
    setFlash(null);
    void (async () => {
      try {
        const overlaid = await getOverlayDoc("abilities", abilityId);
        const shipped = overlaid ? null : await getShippedDoc("abilities", abilityId);
        const doc = overlaid ?? (shipped?.present ? shipped.doc : null);
        if (!alive) return;
        setSource(overlaid ? "overlay" : doc ? "shipped" : "none");
        setBaseDoc(doc);
        setEffects(effectsOf(doc));
      } catch (e) {
        if (alive) setErr(errText(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [abilityId]);

  const palette = useMemo(() => brickPalette(), []);
  const nameOf = (id: string): string => names?.names.abilities.get(id) ?? "";
  const filteredIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter((id) => id.toLowerCase().includes(q) || nameOf(id).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, names, query]);

  const openRows: BrickRow[] = useMemo(
    () => (open === null || !effects[open] ? [] : brickForm(String(effects[open]!.kind))),
    [open, effects],
  );

  const draftKey = (i: number, path: string): string => `${i}:${path}`;
  const shownOf = (i: number, row: BrickRow): string => drafts[draftKey(i, row.path)] ?? rowInputValue(row, effects[i]!);

  /** 逐格解析草稿；有一格壞就回那一格的理由。 */
  const rowErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (open === null || !effects[open]) return out;
    for (const row of openRows) {
      const text = drafts[draftKey(open, row.path)];
      if (text === undefined) continue;
      const r = parseRowInput(row, text);
      if (!r.ok) out[row.path] = r.error;
    }
    return out;
  }, [open, openRows, drafts, effects]);

  /** 把打開的那顆積木的草稿寫回 effects（不可變）。 */
  const applyDrafts = (): Record<string, unknown>[] | null => {
    if (open === null || !effects[open]) return effects;
    let next = effects[open]!;
    for (const row of openRows) {
      const text = drafts[draftKey(open, row.path)];
      if (text === undefined) continue;
      const r = parseRowInput(row, text);
      if (!r.ok) return null;
      next = setAt(next, row.path, r.value);
    }
    return effects.map((e, i) => (i === open ? next : e));
  };

  const commitOpen = (): void => {
    const applied = applyDrafts();
    if (!applied) return;
    setEffects(applied);
    setDrafts({});
  };

  const addBrick = (): void => {
    if (!addKind) return;
    commitOpen();
    setEffects((list) => [...list, newEffect(addKind)]);
    setOpen(effects.length);
    setFlash(null);
  };

  const removeAt = (i: number): void => {
    setEffects((list) => list.filter((_, j) => j !== i));
    setOpen(null);
    setDrafts({});
  };

  const move = (i: number, dir: -1 | 1): void => {
    commitOpen();
    setEffects((list) => moveEffect(list, i, i + dir));
    setOpen(i + dir);
  };

  const builtDoc = (): Record<string, unknown> | null => {
    const applied = applyDrafts();
    if (!applied || !baseDoc) return null;
    return docWithEffects(baseDoc, applied);
  };

  const validation = (): string | null => {
    const doc = builtDoc();
    if (!doc) return "有一格填錯（見紅字）";
    return validateAbilityDoc(abilityId, doc);
  };

  const save = async (): Promise<void> => {
    const doc = builtDoc();
    if (!doc) {
      setErr("有一格填錯（見紅字），沒有寫入");
      return;
    }
    const bad = validateAbilityDoc(abilityId, doc);
    if (bad) {
      setErr(`拒絕寫入：${bad}`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const head = await putOverlayDoc("abilities", abilityId, doc);
      setBaseDoc(doc);
      setEffects(effectsOf(doc));
      setDrafts({});
      setSource("overlay");
      setPreview(null);
      setFlash(`✓ ${abilityId} 已寫入覆蓋層（generation ${head.generation}）—— 試放讀的就是這一份`);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const { ensureRegistries } = await import("../abilityNodes");
      await ensureRegistries(true);
      setPreview(await previewCast(abilityId));
    } catch (e) {
      setErr(`試放失敗：${errText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const dirty = drafts && Object.keys(drafts).length > 0;
  const currentBad = validation();

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel title="🧩 技能積木 —— 效果清單 ＋ 每顆積木一張表單 ＋ 試放">
        <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.6 }}>
          <div>
            owner 2026-09-05：「所有功能都要可JSON操作設定，並且也有 <b>no code 遊戲引擎等級的操作介面</b>」——
            這一頁不用打 JSON：選一支技能，加、刪、排順序、逐格填，存檔走覆蓋層（同 特效綁定 那一頁）。
          </div>
          <div>
            積木清冊：<code>ggd-bricks.json</code>（{EFFECT_BRICKS.length} 顆 effect 積木；清冊過期請跑 <code>pnpm bricks:build</code>）。
            欄位從出貨 Zod 推導；有 <code>@zh</code> 的印中文，沒有的印路徑（⛔ 不編一個看起來像中文的名字）。
          </div>
          <div style={{ color: WARN }}>
            ⚠️ 試放的是<b>存檔之後線上生效的那一份</b>（bundle ⊕ 覆蓋層，與 shard 同一條 registerAll），⛔ 不是草稿。
            回傳的是 SimWorld 排出來的<b>事件</b>；像素證據走 鑄技工坊 QA 路由（editor:accept 的 harness）—— 鏈路已接上，⛔ 未驗收。
          </div>
        </div>
      </Panel>

      <ErrorBanner text={err} onDismiss={() => setErr(null)} />
      {flash && <div style={{ color: OK, fontSize: 12 }}>{flash}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "start" }}>
        <Panel title={`技能（${ids.length}）`}>
          <TextInput value={query} onChange={setQuery} placeholder="搜尋 id 或名稱" dataField="ability-search" />
          <div style={{ maxHeight: 520, overflowY: "auto", marginTop: 8, display: "grid", gap: 2 }}>
            {filteredIds.slice(0, 400).map((id) => (
              <button
                key={id}
                type="button"
                data-field={`ability:${id}`}
                onClick={() => setAbilityId(id)}
                style={{
                  textAlign: "left",
                  background: id === abilityId ? "#1f2a44" : "transparent",
                  color: TEXT_MAIN,
                  border: "1px solid transparent",
                  borderRadius: 6,
                  padding: "4px 6px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <span style={{ color: TEXT_DIM }}>{id}</span>
                {nameOf(id) && <span style={{ marginLeft: 6 }}>{nameOf(id)}</span>}
              </button>
            ))}
            {filteredIds.length > 400 && <div style={{ color: TEXT_DIM, fontSize: 11 }}>…還有 {filteredIds.length - 400} 支，請搜尋</div>}
          </div>
        </Panel>

        <div style={{ display: "grid", gap: 12 }}>
          {!abilityId && <Panel><div style={{ color: TEXT_DIM }}>左邊選一支技能。</div></Panel>}
          {abilityId && (
            <Panel
              title={`${abilityId}${nameOf(abilityId) ? `　${nameOf(abilityId)}` : ""} · 效果清單（${effects.length}）`}
              right={
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  底：{source === "overlay" ? "覆蓋層（線上生效）" : source === "shipped" ? "出貨檔" : "讀不到"}
                </span>
              }
            >
              {baseDoc === null && source !== "none" && <div style={{ color: TEXT_DIM }}>載入中…</div>}
              {source === "none" && baseDoc === null && (
                <div style={{ color: WARN }}>這支技能既不在出貨 bundle 也不在覆蓋層裡 —— 沒有底就不能存。</div>
              )}
              <div style={{ display: "grid", gap: 6 }}>
                {effects.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      border: PANEL_BORDER,
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: open === i ? "#1a2238" : "transparent",
                    }}
                  >
                    <span style={{ color: TEXT_DIM, width: 20, fontSize: 12 }}>{i + 1}</span>
                    <button
                      type="button"
                      data-field={`effect:${i}`}
                      onClick={() => {
                        commitOpen();
                        setOpen(open === i ? null : i);
                      }}
                      style={{ flex: 1, textAlign: "left", background: "transparent", color: TEXT_MAIN, border: "none", cursor: "pointer", fontSize: 13 }}
                    >
                      {summarizeEffect(e)}
                    </button>
                    <Btn small kind="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="往上">↑</Btn>
                    <Btn small kind="ghost" onClick={() => move(i, 1)} disabled={i === effects.length - 1} title="往下">↓</Btn>
                    <Btn small kind="danger" onClick={() => removeAt(i)} dataField={`remove:${i}`} title="刪掉這顆">✕</Btn>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                <select value={addKind} onChange={(e) => setAddKind(e.target.value)} style={SELECT_STYLE} data-field="add-kind">
                  <option value="">（挑一顆積木）</option>
                  {palette.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id}　{b.params} 格　用了 {b.usedBy} 次
                    </option>
                  ))}
                </select>
                <Btn small onClick={addBrick} disabled={!addKind || !baseDoc} dataField="add-brick">＋ 加積木</Btn>
                <span style={{ flex: 1 }} />
                <Btn small kind="primary" onClick={() => void save()} disabled={busy || !baseDoc || currentBad !== null} dataField="save">
                  儲存到覆蓋層
                </Btn>
                <Btn small onClick={() => void runPreview()} disabled={busy || !abilityId || dirty} dataField="preview" title={dirty ? "先儲存，試放讀的是線上生效的那一份" : ""}>
                  試放（線上生效的那一份）
                </Btn>
                <a href={editorQaUrl(editorBase(), abilityId)} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 12 }}>
                  鑄技工坊 QA 擷取 ↗
                </a>
              </div>
              {currentBad && baseDoc && <div style={{ color: WARN, fontSize: 12, marginTop: 6 }}>⛔ {currentBad}</div>}
            </Panel>
          )}

          {abilityId && open !== null && effects[open] && (
            <Panel title={`#${open + 1} ${String(effects[open]!.kind)} —— 表單（從 Zod 推導，${openRows.length} 格）`}>
              <div style={{ display: "grid", gap: 8 }}>
                {openRows.map((row) => {
                  const key = draftKey(open, row.path);
                  const bad = rowErrors[row.path];
                  return (
                    <div key={row.path} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 13 }}>
                          {row.zh || <code style={{ color: TEXT_DIM }}>{row.path}</code>}
                          {row.zh && <code style={{ color: TEXT_DIM, marginLeft: 6, fontSize: 11 }}>{row.path}</code>}
                          {row.optional && <span style={{ color: TEXT_DIM, fontSize: 11, marginLeft: 6 }}>選填</span>}
                        </div>
                        {row.note && <div style={{ color: TEXT_DIM, fontSize: 11, lineHeight: 1.5 }}>{row.note}</div>}
                        {row.kind === "number" && (row.min !== undefined || row.max !== undefined) && (
                          <div style={{ color: TEXT_DIM, fontSize: 11 }}>
                            {row.min !== undefined ? `≥ ${row.min}` : ""} {row.max !== undefined ? `≤ ${row.max}` : ""} {row.int ? "整數" : ""}
                          </div>
                        )}
                      </div>
                      <div>
                        {row.kind === "enum" ? (
                          <select
                            value={shownOf(open, row)}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            style={{ ...SELECT_STYLE, width: "100%" }}
                            data-field={`row:${row.path}`}
                          >
                            <option value="">{row.optional ? "（留白）" : "（必填）"}</option>
                            {row.options?.map((o) => (
                              <option key={o} value={o}>
                                {row.optionLabels?.[o] ? `${o}　${row.optionLabels[o]}` : o}
                              </option>
                            ))}
                          </select>
                        ) : row.kind === "boolean" ? (
                          <select
                            value={shownOf(open, row)}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            style={{ ...SELECT_STYLE, width: "100%" }}
                            data-field={`row:${row.path}`}
                          >
                            <option value="">{row.optional ? "（留白）" : "（必填）"}</option>
                            <option value="true">開</option>
                            <option value="false">關</option>
                          </select>
                        ) : row.kind === "json" ? (
                          <TextArea value={shownOf(open, row)} onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))} rows={4} placeholder="JSON（走訪器歸成分支的東西，誠實地用 JSON 編）" />
                        ) : (
                          <TextInput value={shownOf(open, row)} onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))} dataField={`row:${row.path}`} />
                        )}
                        {bad && <div style={{ color: WARN, fontSize: 11 }}>{bad}</div>}
                      </div>
                    </div>
                  );
                })}
                {openRows.length === 0 && <div style={{ color: TEXT_DIM }}>這一顆在出貨 union 裡沒有表單（清冊與 union 不一致 —— 先跑 pnpm bricks:build）。</div>}
              </div>
            </Panel>
          )}

          {preview && (
            <Panel title="試放結果（SimWorld 事件，⛔ 不是像素）">
              <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                <div>
                  {preview.accepted ? <span style={{ color: OK }}>✓ sim 收下了這一發</span> : <span style={{ color: WARN }}>✗ 被拒：{preview.reason ?? "?"}</span>}
                  <span style={{ color: TEXT_DIM, marginLeft: 8 }}>路徑 {preview.route === "cast" ? "IntentFrame → world.step()" : "被動：真的外部刺激"}</span>
                </div>
                <div style={{ color: TEXT_DIM }}>
                  魔力 {preview.manaBefore} → {preview.manaAfter}　冷卻 {preview.cooldownTicks} tick　事件 {preview.eventCount} 筆
                </div>
                <div>{preview.eventTypes.map((e) => `${e.type}×${e.count}`).join("　")}</div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
