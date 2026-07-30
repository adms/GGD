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
  readMatchDoc,
  validateMatchValues,
  type MatchValues,
} from "../matchConfig";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const fieldOf = (path: string): DerivedField | undefined => MATCH_FIELDS.find((f) => f.path === path);

export function MatchConfigPage(): JSX.Element {
  /** 現行文件 —— 存檔的基底。null = 還沒讀到／讀不到，那就不給存。 */
  const [base, setBase] = useState<unknown>(null);
  const [source, setSource] = useState<"none" | "overlay" | "content">("none");
  const [values, setValues] = useState<MatchValues>({});
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
  const crossIssues = useMemo(
    () => (base === null ? [] : matchDocIssues(matchDocFrom(base, values, fireRingOn))),
    [base, values, fireRingOn],
  );
  const canSave =
    base !== null && !busy && dirty && Object.keys(errors).length === 0 && crossIssues.length === 0;

  const edit = (path: string, next: string): void => {
    setValues({ ...values, [path]: next });
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    if (base === null) return;
    setBusy(true);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(MATCH_COLLECTION, MATCH_DOC_ID, matchDocFrom(base, values, fireRingOn));
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
