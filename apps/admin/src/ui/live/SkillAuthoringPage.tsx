/**
 * ✍️ 技能撰寫助手（live）—— 左邊寫名稱與說明，右邊即時回建議的 effects JSON 骨架。
 *
 * owner 逐字：「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 * ⇒ 這一頁 **零 build-time 資料**：mount 時 GET `/__live/skill-authoring` 拿參考資料，
 *   打字（防抖 500ms）POST 同一路徑拿建議 —— 邏輯與判斷表全部住
 *   `tools/admin-live/datasets/skill-authoring.mjs`，這裡只負責畫。
 *
 * ⛔ 不寫任何檔：骨架 JSON 給人複製進編輯器，⛔ 這一頁沒有儲存鍵。
 * ⭐ 對白剝除（第〇·六守則②）由 dataset 做；這一頁把被剝掉的 `「…」` 顯示出來，
 *   讓作者看得到「哪幾句被當成台詞忽略了」。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Panel, TextArea, TextInput } from "../widgets";
import { GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const LIVE_URL = "/__live/skill-authoring";

/* ── dataset 回應的形狀（tools/admin-live/datasets/skill-authoring.mjs） ── */

interface LiveStamp {
  computedAt: string;
  ms: number;
}

interface RefData {
  meta: {
    contentVersion: string | null;
    abilityCount: number;
    capsFingerprint: string | null;
    tierNames: string[];
    statusCount: number;
  };
  axes: { axis: string; owner: string; means: string; patterns: string[]; negative: string[] }[];
  textRules: { pattern: string; kind: string; why: string }[];
  tagRules: { tag: string; kind: string | null; field: string | null; why: string }[];
  kindStats: { kind: string; shippedNodes: number; exampleFrom: string | null }[];
  tagVocab: { tag: string; count: number; mapped: boolean }[];
  honest: {
    invalidTextRules: { pattern: string; kind: string }[];
    invalidTagRules: { tag: string; kind: string }[];
    note: string;
  };
  _live?: LiveStamp;
}

interface Evidence {
  from: "tag" | "text";
  text: string;
  matched?: string;
  why: string;
}

interface Suggestion {
  kind: string;
  evidence: Evidence[];
  statusIdCandidates: string[];
  loopHint: boolean;
  shippedNodes: number;
  example: { sourceAbility: string; node: unknown } | null;
}

interface SuggestResult {
  input: { name: string; descriptionChars: number };
  dialogueStripped: string[];
  tags: string[];
  axisClaims: { axis: string; sentence: string; pattern: string; means: string }[];
  suggestions: Suggestion[];
  fieldHints: { from: string; text: string; field: string; why: string }[];
  skeleton: Record<string, unknown>;
  honest: { unknownTags: string[]; claimedAxesWithoutSuggestion: string[]; note: string };
  _live?: LiveStamp;
}

/* ── 小件 ── */

function Th(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "5px 8px",
        textAlign: "left",
        fontSize: 12,
        color: TEXT_DIM,
        borderBottom: PANEL_BORDER,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

function Td(props: { children: React.ReactNode; mono?: boolean; color?: string }): React.JSX.Element {
  return (
    <td
      style={{
        padding: "5px 8px",
        borderTop: PANEL_BORDER,
        fontSize: 12.5,
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        verticalAlign: "top",
      }}
    >
      {props.children}
    </td>
  );
}

function Chip(props: { text: string; color: string }): React.JSX.Element {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        margin: "2px 4px 2px 0",
        borderRadius: 999,
        border: `1px solid ${props.color}`,
        color: props.color,
        fontSize: 12,
        fontFamily: MONO,
      }}
    >
      {props.text}
    </span>
  );
}

function ErrBox(props: { text: string }): React.JSX.Element {
  return (
    <div
      style={{
        border: "1px solid #e5483f",
        background: "#3a1c1e",
        color: "#ffb1ac",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12.5,
        whiteSpace: "pre-wrap",
        fontFamily: MONO,
      }}
    >
      {props.text}
    </div>
  );
}

async function fetchLive<T>(init?: RequestInit): Promise<T> {
  const res = await fetch(LIVE_URL, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}：/__live 回的不是 JSON（dev server 沒掛 admin-live middleware？）`);
  }
  const err = (body as { error?: string } | null)?.error;
  if (!res.ok || err) throw new Error(err ?? `HTTP ${res.status}`);
  return body as T;
}

/* ── 主頁 ── */

export function SkillAuthoringPage(): React.JSX.Element {
  const [ref, setRef] = useState<RefData | null>(null);
  const [refErr, setRefErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [postErr, setPostErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState("");
  const seq = useRef(0);

  const loadRef = () => {
    setRefErr(null);
    fetchLive<RefData>()
      .then(setRef)
      .catch((e) => setRefErr(String(e instanceof Error ? e.message : e)));
  };
  useEffect(loadRef, []);

  // 打字 → 防抖 500ms → POST（過期回應用 seq 丟掉）
  useEffect(() => {
    if (desc.trim() === "" && name.trim() === "") {
      setResult(null);
      setPostErr(null);
      return;
    }
    const mySeq = ++seq.current;
    const t = window.setTimeout(() => {
      setBusy(true);
      fetchLive<SuggestResult>({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc }),
      })
        .then((r) => {
          if (seq.current !== mySeq) return;
          setResult(r);
          setPostErr(null);
        })
        .catch((e) => {
          if (seq.current !== mySeq) return;
          setPostErr(String(e instanceof Error ? e.message : e));
        })
        .finally(() => {
          if (seq.current === mySeq) setBusy(false);
        });
    }, 500);
    return () => window.clearTimeout(t);
  }, [name, desc]);

  const skeletonJson = useMemo(
    () => (result ? JSON.stringify(result.skeleton, null, 2) : ""),
    [result],
  );

  const copySkeleton = () => {
    if (skeletonJson === "") return;
    void navigator.clipboard.writeText(skeletonJson).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  // 參考表的一格過濾
  const needle = q.trim().toLowerCase();
  const hit = (s: string) => needle === "" || s.toLowerCase().includes(needle);
  const kindRows = (ref?.kindStats ?? []).filter((k) => hit(`${k.kind} ${k.exampleFrom ?? ""}`));
  const tagRows = (ref?.tagRules ?? []).filter((r) => hit(`${r.tag} ${r.kind ?? ""} ${r.field ?? ""} ${r.why}`));
  const textRows = (ref?.textRules ?? []).filter((r) => hit(`${r.pattern} ${r.kind} ${r.why}`));
  const vocabRows = (ref?.tagVocab ?? []).filter((v) => hit(v.tag));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280 }}>
      <Panel title="✍️ 技能撰寫助手 —— 名稱＋說明 → 自動建議 effects JSON 骨架">
        <div style={{ fontSize: 12.5, color: TEXT_DIM, lineHeight: 1.7 }}>
          左邊照卡面慣例寫技能說明（<code style={{ fontFamily: MONO }}>[標籤]</code>、
          <code style={{ fontFamily: MONO }}>{"{{dmg}}"}</code> 佔位、<code style={{ fontFamily: MONO }}>「台詞」</code>），
          右邊即時（防抖 0.5 秒）回：宣稱的時序軸、建議的 effect kind（每一筆帶出處句與出貨範例節點）、
          可複製的 ability@1 骨架。⭐ <code style={{ fontFamily: MONO }}>「…」</code> 整段當台詞剝掉不讀機制
          （第〇·六守則②）；級距欄只給級距名選項，⛔ 不烘數字（第〇·四守則）。
          建議是關鍵詞判斷表，⛔ 不是 schema 驗證 —— 複製後要進編輯器驗過才算數。
          {ref && (
            <>
              {" "}
              資料側：{ref.meta.abilityCount} 支出貨技能・{ref.meta.statusCount} 個狀態・capabilities{" "}
              <code style={{ fontFamily: MONO }}>{ref.meta.capsFingerprint}</code>・內容版{" "}
              <code style={{ fontFamily: MONO }}>{ref.meta.contentVersion}</code>。
            </>
          )}
        </div>
        {refErr && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <ErrBox text={`參考資料載入失敗：${refErr}`} />
            <div>
              <Btn small onClick={loadRef}>
                重試
              </Btn>
            </div>
          </div>
        )}
      </Panel>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* 左：編輯 */}
        <Panel title="📝 編輯（⛔ 不存檔 —— 產出讓你複製）" style={{ flex: "1 1 420px", minWidth: 380 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <TextInput value={name} onChange={setName} placeholder="技能名（例：20-03 約束與勝利之劍）" dataField="authoring-name" />
            <TextArea
              value={desc}
              onChange={setDesc}
              rows={16}
              placeholder={
                "[主動][指向][範圍][AP加成]\n{{cd}}秒冷卻 吟唱1秒\n消耗[MP] {{mp}}\n施法距離：{{range}}\n\n「這一句是台詞，機制不讀它」\n對[前方][直線]敵人造成 {{dmg}} + 100% [AP]點傷害，並使目標暈眩1.5秒。"
              }
            />
            <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
              {busy ? "計算中…" : result ? `已算：${result.input.descriptionChars} 字` : "開始打字就會即時建議。"}
            </div>
          </div>
        </Panel>

        {/* 右：建議 */}
        <Panel title="⚡ 即時建議" style={{ flex: "1 1 520px", minWidth: 420 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {postErr && <ErrBox text={`建議計算失敗：${postErr}`} />}
            {!result && !postErr && (
              <div style={{ fontSize: 12.5, color: TEXT_DIM }}>（尚無輸入）</div>
            )}
            {result && (
              <>
                {result.dialogueStripped.length > 0 && (
                  <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
                    🗣️ 剝掉的台詞（不讀機制）：
                    {result.dialogueStripped.map((d, i) => (
                      <div key={i} style={{ fontFamily: MONO, opacity: 0.8 }}>
                        {d}
                      </div>
                    ))}
                  </div>
                )}

                {result.tags.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>讀到的標籤：</div>
                    {result.tags.map((t, i) => (
                      <Chip
                        key={`${t}-${i}`}
                        text={`[${t}]`}
                        color={result.honest.unknownTags.includes(t) ? WARN : GOLD}
                      />
                    ))}
                    {result.honest.unknownTags.length > 0 && (
                      <div style={{ fontSize: 11.5, color: WARN, marginTop: 4 }}>
                        ⚠️ 黃色標籤沒有對應規則（誠實列出，⛔ 不裝懂）：
                        {result.honest.unknownTags.map((t) => `[${t}]`).join(" ")}
                      </div>
                    )}
                  </div>
                )}

                {result.axisClaims.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>
                      說明宣稱的時序軸（shape_axes / prose_markers）：
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <Th>軸</Th>
                          <Th>出處句</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.axisClaims.map((c) => (
                          <tr key={c.axis}>
                            <Td mono color={GOLD}>
                              {c.axis}
                            </Td>
                            <Td>{c.sentence}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>
                    建議的 effect（{result.suggestions.length} 種）：
                  </div>
                  {result.suggestions.length === 0 && (
                    <div style={{ fontSize: 12.5, color: WARN }}>
                      沒有任何關鍵詞命中 —— 這代表判斷表不認得這段寫法，⛔ 不代表技能做不出來。
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {result.suggestions.map((s) => (
                      <div key={s.kind} style={{ border: PANEL_BORDER, borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: MONO, color: GOLD, fontSize: 13.5 }}>{s.kind}</span>
                          <span style={{ fontSize: 11.5, color: TEXT_DIM }}>
                            出貨 {s.shippedNodes} 個節點
                            {s.example ? `・範例抄自 ${s.example.sourceAbility}` : "・⚠️ 出貨內容沒有可抄的節點（引擎有、內容還沒人用）"}
                            {s.loopHint ? "・迴圈：count×intervalSec" : ""}
                          </span>
                        </div>
                        {s.statusIdCandidates.length > 0 && (
                          <div style={{ fontSize: 11.5, color: OK, marginTop: 2 }}>
                            statusId 候選（出貨狀態表）：{s.statusIdCandidates.join("、")}
                          </div>
                        )}
                        {s.evidence.map((e, i) => (
                          <div key={i} style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2, lineHeight: 1.5 }}>
                            <span style={{ color: TEXT_MAIN }}>{e.from === "tag" ? "標籤" : "內文"}</span>：
                            <span style={{ fontFamily: MONO }}>{e.matched ?? e.text}</span>
                            {e.from === "text" && e.matched && <>（{e.text}）</>} — {e.why}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {result.fieldHints.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 4 }}>欄位提示（不是 effect 節點）：</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <Th>出處</Th>
                          <Th>欄位</Th>
                          <Th>為什麼</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.fieldHints.map((h, i) => (
                          <tr key={i}>
                            <Td mono>{h.text}</Td>
                            <Td mono color={GOLD}>
                              {h.field}
                            </Td>
                            <Td color={TEXT_DIM}>{h.why}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 12, color: TEXT_DIM }}>
                      ability@1 骨架（effects 逐字抄自出貨節點 —— 參數自己改；級距欄選一格級距名）：
                    </div>
                    <Btn small onClick={copySkeleton} dataField="copy-skeleton">
                      {copied ? "✅ 已複製" : "📋 複製 JSON"}
                    </Btn>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      background: "#0b0e16",
                      border: PANEL_BORDER,
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontFamily: MONO,
                      color: TEXT_MAIN,
                      overflowX: "auto",
                      maxHeight: 420,
                      overflowY: "auto",
                      whiteSpace: "pre",
                    }}
                  >
                    {skeletonJson}
                  </pre>
                </div>

                {result._live && (
                  <div style={{ fontSize: 11.5, color: TEXT_DIM }}>
                    建議算於 {result._live.computedAt}（{result._live.ms}ms）
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>

      {/* 參考資料（全部從 /__live 來，一格過濾） */}
      <Panel title="📚 參考資料（實時 —— 引擎 capabilities / 出貨內容 / 判斷表）">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TextInput value={q} onChange={setQ} placeholder="過濾：kind / 標籤 / 關鍵詞 / 軸…" dataField="ref-filter" />
          {!ref && !refErr && <div style={{ fontSize: 12.5, color: TEXT_DIM }}>載入中…</div>}
          {ref && (
            <>
              <details open={needle !== ""}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: TEXT_MAIN }}>
                  effect kind（引擎 {ref.kindStats.length} 種・顯示 {kindRows.length}）
                </summary>
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <Th>kind</Th>
                        <Th>出貨節點數</Th>
                        <Th>範例來源</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {kindRows.map((k) => (
                        <tr key={k.kind}>
                          <Td mono color={GOLD}>{k.kind}</Td>
                          <Td mono>{k.shippedNodes}</Td>
                          <Td mono color={k.exampleFrom ? TEXT_MAIN : WARN}>
                            {k.exampleFrom ?? "（出貨內容沒人用）"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details open={needle !== ""}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: TEXT_MAIN }}>
                  [標籤] 規則（{ref.tagRules.length} 條・顯示 {tagRows.length}）＋ 出貨標籤詞彙前 {ref.tagVocab.length}
                </summary>
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <Th>標籤</Th>
                        <Th>建議</Th>
                        <Th>為什麼</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {tagRows.map((r) => (
                        <tr key={r.tag}>
                          <Td mono>[{r.tag}]</Td>
                          <Td mono color={GOLD}>{r.kind ?? r.field}</Td>
                          <Td color={TEXT_DIM}>{r.why}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 6 }}>
                    {vocabRows.map((v) => (
                      <Chip
                        key={v.tag}
                        text={`[${v.tag}]×${v.count}`}
                        color={v.mapped ? TEXT_DIM : WARN}
                      />
                    ))}
                    <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 4 }}>
                      黃色＝出貨說明用了、判斷表還沒對應的標籤（誠實列出）。
                    </div>
                  </div>
                </div>
              </details>

              <details open={needle !== ""}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: TEXT_MAIN }}>
                  內文關鍵詞規則（{ref.textRules.length} 條・顯示 {textRows.length}）
                </summary>
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <Th>正則</Th>
                        <Th>kind</Th>
                        <Th>為什麼</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {textRows.map((r, i) => (
                        <tr key={i}>
                          <Td mono>{r.pattern}</Td>
                          <Td mono color={GOLD}>{r.kind}</Td>
                          <Td color={TEXT_DIM}>{r.why}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>

              <details open={needle !== ""}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: TEXT_MAIN }}>
                  六條時序軸（shape_axes.json ＋ prose_markers.json）
                </summary>
                <div style={{ overflowX: "auto", marginTop: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <Th>軸</Th>
                        <Th>意義</Th>
                        <Th>宣稱側正則</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {ref.axes
                        .filter((a) => hit(`${a.axis} ${a.means}`))
                        .map((a) => (
                          <tr key={a.axis}>
                            <Td mono color={GOLD}>{a.axis}</Td>
                            <Td color={TEXT_DIM}>{a.means}</Td>
                            <Td mono>{a.patterns.join("  ")}</Td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>

              {(ref.honest.invalidTextRules.length > 0 || ref.honest.invalidTagRules.length > 0) && (
                <ErrBox
                  text={`⚠️ 判斷表有 ${
                    ref.honest.invalidTextRules.length + ref.honest.invalidTagRules.length
                  } 條規則指向引擎已不存在的 kind（已自動停用）：${[
                    ...ref.honest.invalidTextRules.map((r) => r.kind),
                    ...ref.honest.invalidTagRules.map((r) => r.kind),
                  ].join("、")}`}
                />
              )}
            </>
          )}
        </div>
      </Panel>

      <div style={{ fontSize: 11.5, color: TEXT_DIM }}>
        {ref?._live
          ? `參考資料算於 ${ref._live.computedAt}（${ref._live.ms}ms）— 來源：shape_axes.json・prose_markers.json・ggd-runtime-capabilities.json・content/（abilities/status-effects/damage-tiers）`
          : "參考資料尚未載入。"}
      </div>
    </div>
  );
}
