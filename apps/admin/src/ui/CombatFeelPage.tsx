/**
 * 戰鬥手感 —— `config.combat-feel@1` 的後台入口（在這一頁之前它一格都沒有）。
 *
 * 四張子表全部是 owner 口中的**決策點**：擊退、打就站定、面向鎖、卡住就接敵。
 * 邏輯全在 `../combatFeel`（測試也在那裡），這裡只是畫面。
 *
 * ⚠️ 三件這一頁刻意做的事，改掉任何一件都會讓它變成「自我一致地說謊」的後台：
 *
 *   1. **顯示的值是 `combatFeelFromDoc` 讀出來的**，不是文件裡的原始數字。sim
 *      會靜默夾限，照原始 JSON 畫的頁面會顯示一個遊戲裡從來不存在的數字。
 *   2. **儲存永遠寫完整四張表**（`feelDocFrom` 走的是全部欄位）。只寫被改過的
 *      區塊，會讓覆蓋層把其他三張表凍結在今天的預設值上。
 *   3. **畫面上寫著「要重啟 shard」**。這份文件是 game-server 開機時才被讀進
 *      `Configs` 的，`MatchController` 只從那份 registry 讀 —— 沒有任何路徑會在
 *      開賽時重抓 overlay。寫「下一場生效」就是騙人（#278 的形狀）。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import type { DerivedField } from "../configFields";
import {
  COMBAT_FEEL_COLLECTION,
  COMBAT_FEEL_DOC_ID,
  COMBAT_FEEL_GROUPS,
  combatFeelFromDoc,
  decisionSummary,
  feelDocFrom,
  fieldBounds,
  fieldsOfGroup,
  labelFor,
  shippedValues,
  validateFeelValues,
  valuesFromRules,
  type FeelValues,
} from "../combatFeel";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SHIPPED = shippedValues();

export function CombatFeelPage(): JSX.Element {
  // 先畫出貨預設 —— 一份還沒有覆蓋層的主機，sim 用的正是這一組。
  const [values, setValues] = useState<FeelValues>(() => ({ ...SHIPPED }));
  const [source, setSource] = useState<"shipped" | "overlay" | "content">("shipped");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST：覆蓋層才是 shard 開機時真的會載入的東西。
        const overlaid = (await getOverlayDoc(COMBAT_FEEL_COLLECTION, COMBAT_FEEL_DOC_ID)) as unknown;
        if (overlaid) {
          setValues(valuesFromRules(combatFeelFromDoc(overlaid)));
          setSource("overlay");
          return;
        }
        const shipped = await getShippedDoc(COMBAT_FEEL_COLLECTION, COMBAT_FEEL_DOC_ID);
        if (shipped.present && shipped.doc) {
          setValues(valuesFromRules(combatFeelFromDoc(shipped.doc)));
          setSource("content");
        }
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
  }, []);

  const errors = useMemo(() => validateFeelValues(values), [values]);
  const allValid = Object.keys(errors).length === 0;
  const summary = useMemo(() => decisionSummary(values), [values]);

  const edit = (path: string, next: string): void => {
    setValues({ ...values, [path]: next });
    setDirty(true);
  };

  const resetShipped = (): void => {
    setValues({ ...SHIPPED });
    setDirty(true);
    setFlash(null);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(COMBAT_FEEL_COLLECTION, COMBAT_FEEL_DOC_ID, feelDocFrom(values));
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

  const row = (f: DerivedField): JSX.Element => {
    const label = labelFor(f.path);
    const bounds = fieldBounds(f);
    const err = errors[f.path];
    const shown = values[f.path] ?? "";
    const shippedShown = SHIPPED[f.path] ?? "";
    const control =
      f.kind === "boolean" ? (
        <select
          aria-label={label.zh}
          data-field={f.path}
          value={shown}
          onChange={(e) => edit(f.path, e.target.value)}
          style={{
            minWidth: 260,
            padding: "4px 6px",
            background: "transparent",
            color: shown === "true" ? OK : WARN,
            border: PANEL_BORDER,
            borderRadius: 3,
          }}
        >
          <option value="true">{label.decision?.onLabel ?? "開"}</option>
          <option value="false">{label.decision?.offLabel ?? "關"}</option>
        </select>
      ) : (
        <input
          aria-label={label.zh}
          data-field={f.path}
          value={shown}
          inputMode="decimal"
          onChange={(e) => edit(f.path, e.target.value)}
          style={{
            width: 92,
            padding: "4px 6px",
            background: "transparent",
            color: err ? DANGER : TEXT_MAIN,
            border: err ? `1px solid ${DANGER}` : PANEL_BORDER,
            borderRadius: 3,
            textAlign: "right",
          }}
        />
      );

    return (
      <div
        key={f.path}
        data-testid={`feel-row-${f.path}`}
        style={{ border: PANEL_BORDER, borderRadius: 4, padding: "8px 10px", display: "grid", gap: 4 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: TEXT_MAIN, fontSize: 13, minWidth: 190 }}>{label.zh}</span>
          {control}
          <code style={{ color: TEXT_DIM, fontSize: 11 }}>{f.path}</code>
          <span style={{ color: TEXT_DIM, fontSize: 11 }}>
            出貨預設 {f.kind === "boolean" ? (shippedShown === "true" ? "開" : "關") : shippedShown}
            {bounds &&
              ` · 可填 ${bounds.minExclusive ? ">" : ""}${bounds.min} ～ ${bounds.max}` +
                (f.kind === "int" ? "（整數）" : "") +
                (bounds.maxFromConsole ? "（上界由後台補）" : "")}
          </span>
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.65 }}>{label.note}</div>
        {label.decision && (
          <div style={{ color: GOLD, fontSize: 12, lineHeight: 1.65 }}>
            決策點 · 為什麼預設是這一邊：{label.decision.why}
          </div>
        )}
        {err && <div style={{ color: DANGER, fontSize: 12 }}>{err}</div>}
      </div>
    );
  };

  return (
    <Panel title="戰鬥手感">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>
        四張子表：<b style={{ color: TEXT_MAIN }}>擊退</b>、
        <b style={{ color: TEXT_MAIN }}>打就站定</b>、<b style={{ color: TEXT_MAIN }}>面向鎖</b>、
        <b style={{ color: TEXT_MAIN }}>卡住就自動接敵</b>。這一頁每一格都是
        <b style={{ color: ACCENT }}>一條規則的參數</b>（比例門檻 / 身位數 / tick 數 / 開關）——
        不是倍率（那是「戰鬥系統」）、不是加數（那是「基礎加成」）、也不是天花板（那是「屬性上限」）。
      </p>
      <p style={{ color: GOLD, fontSize: 13, lineHeight: 1.7, margin: "0 0 8px" }}>
        ⚠️ 存檔<b>不是下一場就生效</b>：這份文件在 <code>game-server</code> 開機時才被讀進
        <code>Configs</code>，比賽建立時不會重抓，所以要<b>重啟 shard</b> 之後新的手感才會進到比賽裡。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 12px" }}>
        目前顯示的值來自
        {source === "overlay" ? "耐久覆蓋層（操作者存過）" : source === "content" ? "內容檔 content/config" : "出貨預設（還沒有這份文件）"}
        ，而且是<b style={{ color: TEXT_MAIN }}>模擬器自己讀出來的結果</b>
        —— 超出範圍的舊值會被模擬器夾限，這裡顯示的就是夾限後、遊戲裡真的在用的那個數字。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 10 }}>{summary}</div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div style={{ display: "grid", gap: 18 }}>
        {COMBAT_FEEL_GROUPS.map((g) => (
          <div key={g.key} style={{ display: "grid", gap: 8 }}>
            <div style={{ color: GOLD, fontSize: 14 }}>{g.title}</div>
            <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.65 }}>{g.intro}</div>
            {fieldsOfGroup(g.key).map(row)}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <Btn kind="primary" disabled={busy || !dirty || !allValid} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <Btn onClick={resetShipped}>重設為出貨預設</Btn>
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>
          {allValid ? "四張子表一起寫入覆蓋層" : "有欄位超出可填範圍，先修好才存得出去"}
        </span>
      </div>
    </Panel>
  );
}
