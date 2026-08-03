/**
 * 對戰設定 —— `config.match@1` 的後台入口（在這一頁之前它也是零入口）。
 *
 * 邏輯全在 `../matchConfig`（測試也在那裡）。這裡只是畫面，但有三件事是它自己
 * 的責任，改掉任何一件都會讓這一頁開始說謊：
 *
 *   1. **沒有消費端的格子是唯讀的**（19 格）。做成可編輯 = 操作者存下一個永遠
 *      不會生效的值，重整後還看得到它。
 *   2. **讀不到現行文件就不給存**。這一頁的存檔是「現行文件 + 我改的幾格」，
 *      沒有基底就只能用猜的文件覆蓋線上。
 *   3. **存檔前跑一次 loader 的 schema**，因為火圈那兩條跨欄位規則（圈要在硬
 *      底線之前收完）單格的上下界擋不住，而 loader 對驗不過的文件是**整份丟掉**。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import type { DerivedField } from "../configFields";
import {
  BURN_CURVE_SPEC,
  burnCurvePreview,
  FIRE_RING_BLOCK,
  MATCH_COLLECTION,
  MATCH_DOC_ID,
  MATCH_FIELDS,
  MATCH_GROUPS,
  isEditable,
  matchDocFrom,
  matchDocIssues,
  matchFieldBounds,
  matchInfoFor,
  MATCH_BOOL_LABELS,
  readMatchDoc,
  validateBurnCurve,
  validateMatchValues,
  type MatchValues,
} from "../matchConfig";
import {
  addCurveRow,
  curveRowsFrom,
  removeCurveRow,
  setCurveCell,
  type CurveRowDraft,
} from "../configCurve";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const fieldOf = (path: string): DerivedField | undefined => MATCH_FIELDS.find((f) => f.path === path);

export function MatchConfigPage(): JSX.Element {
  /** 現行文件 —— 存檔的基底。null = 還沒讀到／讀不到，那就不給存。 */
  const [base, setBase] = useState<unknown>(null);
  const [source, setSource] = useState<"none" | "overlay" | "content">("none");
  const [values, setValues] = useState<MatchValues>({});
  const [burnRows, setBurnRows] = useState<CurveRowDraft[]>([]);
  const [fireRingOn, setFireRingOn] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const overlaid = (await getOverlayDoc(MATCH_COLLECTION, MATCH_DOC_ID)) as unknown;
        if (overlaid) {
          const read = readMatchDoc(overlaid);
          setBase(overlaid);
          setValues(read.values);
          setBurnRows(curveRowsFrom(overlaid, BURN_CURVE_SPEC));
          setFireRingOn(read.fireRingOn);
          setParseError(read.parseError);
          setSource("overlay");
          return;
        }
        const shipped = await getShippedDoc(MATCH_COLLECTION, MATCH_DOC_ID);
        if (shipped.present && shipped.doc) {
          const read = readMatchDoc(shipped.doc);
          setBase(shipped.doc);
          setValues(read.values);
          setBurnRows(curveRowsFrom(shipped.doc, BURN_CURVE_SPEC));
          setFireRingOn(read.fireRingOn);
          setParseError(read.parseError);
          setSource("content");
        }
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
  }, []);

  const errors = useMemo(() => validateMatchValues(values, fireRingOn), [values, fireRingOn]);
  const burnVerdict = useMemo(() => validateBurnCurve(burnRows, fireRingOn), [burnRows, fireRingOn]);
  const crossIssues = useMemo(
    () => (base === null ? [] : matchDocIssues(matchDocFrom(base, values, fireRingOn, burnRows))),
    [base, values, fireRingOn, burnRows],
  );
  /**
   * 「這條曲線實際上怎麼燒人」。⚠️ 用出貨的 `fireRingRulesFromConfig` +
   * `fireRingRatePerSec` 算，不是這一頁自己內插一遍。
   */
  const burnPreview = useMemo(
    () =>
      burnCurvePreview(
        burnVerdict.points,
        Number(values["match.fireRing.startSec"] ?? "0"),
        (values["match.fireRing.maxPctPerSec"] ?? "").trim() === ""
          ? undefined
          : Number(values["match.fireRing.maxPctPerSec"]),
      ),
    [burnVerdict.points, values],
  );
  const canSave =
    base !== null &&
    !busy &&
    dirty &&
    Object.keys(errors).length === 0 &&
    crossIssues.length === 0 &&
    burnVerdict.points !== null;

  const edit = (path: string, next: string): void => {
    setValues({ ...values, [path]: next });
    setDirty(true);
  };

  const editCurve = (next: CurveRowDraft[]): void => {
    setBurnRows(next);
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    if (base === null) return;
    setBusy(true);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(
        MATCH_COLLECTION,
        MATCH_DOC_ID,
        matchDocFrom(base, values, fireRingOn, burnRows),
      );
      setDirty(false);
      setSource("overlay");
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const row = (path: string): JSX.Element => {
    const f = fieldOf(path);
    const info = matchInfoFor(path);
    const editable = isEditable(path);
    const bounds = f ? matchFieldBounds(f) : null;
    const err = errors[path];
    const inRing = path.startsWith(`${FIRE_RING_BLOCK}.`);
    const disabled = !editable || (inRing && !fireRingOn);
    return (
      <div
        key={path}
        data-testid={`match-row-${path}`}
        style={{
          border: PANEL_BORDER,
          borderRadius: 4,
          padding: "8px 10px",
          display: "grid",
          gap: 4,
          opacity: disabled ? 0.72 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: TEXT_MAIN, fontSize: 13, minWidth: 220 }}>{info.zh}</span>
          {/*
            ⚠️ 布林**不能**走上面那個文字框。存檔那一側是 `Number(raw)`，而
            `Number("true")` 是 NaN，所以一個畫成輸入框的開關會永遠寫不進文件 ——
            半套的可調欄位比寫死更糟：它看起來可以調，實際上不生效。
            原始的 "true"/"false" 也不上螢幕：一個裸的布林在控制台上不可讀。
          */}
          {f?.kind === "boolean" ? (
            <select
              aria-label={info.zh}
              data-field={path}
              value={values[path] ?? ""}
              disabled={disabled}
              onChange={(e) => edit(path, e.target.value)}
              style={{
                minWidth: 220,
                padding: "4px 6px",
                background: "transparent",
                color: err ? DANGER : editable ? TEXT_MAIN : TEXT_DIM,
                border: err ? `1px solid ${DANGER}` : PANEL_BORDER,
                borderRadius: 3,
              }}
            >
              {f.optional && <option value="">（不設定 · 用出貨預設）</option>}
              <option value="true">{MATCH_BOOL_LABELS[path]?.on ?? "開"}</option>
              <option value="false">{MATCH_BOOL_LABELS[path]?.off ?? "關"}</option>
            </select>
          ) : (
            <input
              aria-label={info.zh}
              data-field={path}
              value={values[path] ?? ""}
              disabled={disabled}
              inputMode="decimal"
              onChange={(e) => edit(path, e.target.value)}
              style={{
                width: 100,
                padding: "4px 6px",
                background: "transparent",
                color: err ? DANGER : editable ? TEXT_MAIN : TEXT_DIM,
                border: err ? `1px solid ${DANGER}` : PANEL_BORDER,
                borderRadius: 3,
                textAlign: "right",
              }}
            />
          )}
          <code style={{ color: TEXT_DIM, fontSize: 11 }}>{path}</code>
          {bounds && (
            <span style={{ color: TEXT_DIM, fontSize: 11 }}>
              可填 {bounds.minExclusive ? ">" : ""}
              {bounds.min} ～ {bounds.max}
              {f?.kind === "int" ? "（整數）" : ""}
              {bounds.maxFromConsole ? "（上界由後台補，schema 沒有）" : ""}
              {f?.optional ? " · 可留白" : ""}
            </span>
          )}
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.65 }}>{info.note}</div>
        {editable ? (
          <div style={{ color: TEXT_DIM, fontSize: 11 }}>讀這一格的是：{info.live}</div>
        ) : (
          <div style={{ color: WARN, fontSize: 12 }}>
            ⚠️ 唯讀 —— 執行期沒有任何程式讀這一格。真正在用的數字在：{info.realHome}
          </div>
        )}
        {err && <div style={{ color: DANGER, fontSize: 12 }}>{err}</div>}
      </div>
    );
  };

  /**
   * 灼燒曲線的斷點表 —— 「可以加/刪列」的兩欄表 + 一段用**出貨函式**算出來的預覽。
   *
   * 這張表不是 `MATCH_FIELDS` 的一格（它是陣列，`deriveFields` 走不進去），所以
   * 它有自己的 draft state、自己的驗證、和自己的存檔路徑。
   */
  const burnCurveTable = (): JSX.Element => {
    const disabled = !fireRingOn;
    return (
      <div
        data-testid="match-burn-curve"
        style={{
          border: PANEL_BORDER,
          borderRadius: 4,
          padding: "10px 12px",
          display: "grid",
          gap: 8,
          opacity: disabled ? 0.72 : 1,
        }}
      >
        <div style={{ color: GOLD, fontSize: 13 }}>{BURN_CURVE_SPEC.title}</div>
        {BURN_CURVE_SPEC.intro.map((line) => (
          <div key={line} style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7 }}>
            {line}
          </div>
        ))}
        <div style={{ color: TEXT_DIM, fontSize: 11 }}>
          讀這張表的是：{matchInfoFor("match.fireRing.minRadius").live}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {burnRows.map((r, i) => {
            const e = burnVerdict.rows[i] ?? {};
            const startSec = Number(values["match.fireRing.startSec"] ?? "0");
            const secNum = Number(r.x.trim());
            const roundSec = Number.isFinite(secNum) && r.x.trim() !== "" ? startSec + secNum : null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: TEXT_DIM, fontSize: 11, minWidth: 34 }}>#{i + 1}</span>
                <input
                  aria-label={`${BURN_CURVE_SPEC.x.zh} 第 ${i + 1} 列`}
                  data-field={`burnCurve.${i}.sec`}
                  value={r.x}
                  disabled={disabled}
                  inputMode="decimal"
                  onChange={(ev) => editCurve(setCurveCell(burnRows, i, "x", ev.target.value))}
                  style={{
                    width: 90,
                    padding: "4px 6px",
                    background: "transparent",
                    color: e.x ? DANGER : TEXT_MAIN,
                    border: e.x ? `1px solid ${DANGER}` : PANEL_BORDER,
                    borderRadius: 3,
                    textAlign: "right",
                  }}
                />
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  秒（點燃後）
                  {roundSec === null ? "" : ` · 回合第 ${roundSec} 秒`}
                </span>
                <input
                  aria-label={`${BURN_CURVE_SPEC.y.zh} 第 ${i + 1} 列`}
                  data-field={`burnCurve.${i}.pctPerSec`}
                  value={r.y}
                  disabled={disabled}
                  inputMode="decimal"
                  onChange={(ev) => editCurve(setCurveCell(burnRows, i, "y", ev.target.value))}
                  style={{
                    width: 90,
                    padding: "4px 6px",
                    background: "transparent",
                    color: e.y ? DANGER : TEXT_MAIN,
                    border: e.y ? `1px solid ${DANGER}` : PANEL_BORDER,
                    borderRadius: 3,
                    textAlign: "right",
                  }}
                />
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  /秒（1 = 100 % = 一秒必死）
                </span>
                <Btn
                  disabled={disabled || burnRows.length <= BURN_CURVE_SPEC.minRows}
                  onClick={() => editCurve(removeCurveRow(burnRows, i))}
                >
                  刪除
                </Btn>
                {(e.x ?? e.y) && (
                  <span style={{ color: DANGER, fontSize: 12 }}>{e.x ?? e.y}</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn
            disabled={disabled || burnRows.length >= BURN_CURVE_SPEC.maxRows}
            onClick={() => editCurve(addCurveRow(burnRows))}
          >
            ＋ 加一列
          </Btn>
          <span style={{ color: TEXT_DIM, fontSize: 11 }}>
            {BURN_CURVE_SPEC.minRows}～{BURN_CURVE_SPEC.maxRows} 列
          </span>
        </div>
        {burnVerdict.table && (
          <div style={{ color: DANGER, fontSize: 12 }}>{burnVerdict.table}</div>
        )}

        {burnPreview.length > 0 && (
          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
            <div style={{ color: TEXT_MAIN, fontSize: 12 }}>
              這條曲線實際上怎麼燒人（用伺服器出貨的那支函式算的，不是這一頁自己內插）
            </div>
            {burnPreview.map((p) => (
              <div key={p.sinceIgniteSec} style={{ color: TEXT_DIM, fontSize: 12 }}>
                點燃後 {p.sinceIgniteSec} 秒（回合第 {p.roundSec} 秒）→ 每秒燒{" "}
                <b style={{ color: TEXT_MAIN }}>{(p.pctPerSec * 100).toFixed(1)} %</b>
                ；從這一刻起站在圈外不回來，
                {p.secondsToDeath === null ? (
                  <b style={{ color: WARN }}>燒不死</b>
                ) : (
                  <>
                    <b style={{ color: TEXT_MAIN }}>{p.secondsToDeath.toFixed(2)} 秒</b>後滿血死亡
                  </>
                )}
              </div>
            ))}
            <div style={{ color: WARN, fontSize: 12, lineHeight: 1.7 }}>
              ⚠️ 曲線尾巴今天<b>打不到任何人</b>：「收完後的半徑」（0.5）比角色碰撞半徑（0.6）小，
              所以收圈完成後全場沒有安全位置，實測最後一個人在點燃後約 24 秒就死透了。
              要讓 100 %/秒那一格真的被玩家經歷到，得把「收完後的半徑」抬到 0.6 以上（留一個站得住的口袋），
              或把「收圈耗時」拉長 —— 那兩格都在上面。
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Panel title="對戰設定">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>
        <code>config.match@1</code> —— 回合時鐘（選角／中場／戰鬥／結算秒數、起始隊伍生命）與
        <b style={{ color: TEXT_MAIN }}>火圈</b>。這一頁調的是
        <b style={{ color: ACCENT }}>一場對戰的節奏與長度</b>，不是任何一種戰鬥數值。
      </p>
      <p style={{ color: WARN, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>
        ⚠️ 這份文件裡有 <b>19 格沒有任何消費端</b>（起始金錢、經驗、背包格數、隊伍數、模擬頻率…）。
        它們在下面是<b>唯讀</b>的，每一格都寫著真正的數字住在哪個檔 ——
        做成可編輯就等於請操作者存一個永遠不會生效的值。
      </p>
      <p style={{ color: GOLD, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>
        ⚠️ 存檔<b>不是下一場就生效</b>：這份文件在 <code>game-server</code> 開機時才被讀進
        <code>Configs</code>，<code>MatchRoom</code> 只在建立比賽時從那份已載入的 registry 讀，
        所以要<b>重啟 shard</b>。另外平台的「系統運維」頁推導的對戰長度讀的是
        <b>磁碟上的內容檔</b>而不是覆蓋層，所以在這裡存檔之後那一頁不會跟著變。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 12px" }}>
        現行文件來自
        {source === "overlay" ? "耐久覆蓋層（操作者存過）" : source === "content" ? "內容檔 content/config" : "（還沒讀到）"}
        。存檔寫的是<b style={{ color: TEXT_MAIN }}>現行文件 + 這一頁改動的格子</b>，
        所以頁面沒有畫出來的欄位（例如 <code>draft.tierSchedule</code>）不會被清掉。
      </p>

      {base === null && (
        <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>
          讀不到現行的 <code>config.match</code> 文件 —— 這一頁<b>不會</b>用猜出來的內容覆蓋線上，
          所以儲存是關的。
        </div>
      )}
      {parseError && (
        <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>
          ⚠️ 現行文件<b>過不了 schema</b>（{parseError}）—— game-server 的載入器對驗不過的文件是
          <b>整份丟掉</b>，所以遊戲現在跑的是編譯內建值，不是這份文件。
        </div>
      )}
      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}
      {crossIssues.length > 0 && (
        <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>
          跨欄位規則沒過：{crossIssues.join("；")}
        </div>
      )}

      <div style={{ display: "grid", gap: 18 }}>
        {MATCH_GROUPS.map((g) => (
          <div key={g.key} style={{ display: "grid", gap: 8 }}>
            <div style={{ color: g.key === "dead" ? WARN : GOLD, fontSize: 14 }}>{g.title}</div>
            <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.65 }}>{g.intro}</div>
            {g.key === "fireRing" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: TEXT_MAIN, fontSize: 13 }}>火圈</span>
                <select
                  aria-label="火圈啟用"
                  data-field={FIRE_RING_BLOCK}
                  value={fireRingOn ? "true" : "false"}
                  onChange={(e) => {
                    setFireRingOn(e.target.value === "true");
                    setDirty(true);
                  }}
                  style={{
                    minWidth: 280,
                    padding: "4px 6px",
                    background: "transparent",
                    color: fireRingOn ? OK : WARN,
                    border: PANEL_BORDER,
                    borderRadius: 3,
                  }}
                >
                  <option value="true">啟用 · 回合會被收圈逼出結果（出貨預設）</option>
                  <option value="false">停用 · 回合一路打到硬底線，僵局沒有破口</option>
                </select>
              </div>
            )}
            {g.paths.map(row)}
            {g.key === "fireRing" && burnCurveTable()}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Btn kind="primary" disabled={!canSave} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>
          {base === null
            ? "沒有現行文件當基底，不給存"
            : Object.keys(errors).length > 0 || crossIssues.length > 0
              ? "有欄位不合法，先修好才存得出去"
              : "現行文件 + 這一頁的改動一起寫入覆蓋層"}
        </span>
      </div>
    </Panel>
  );
}
