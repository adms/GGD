/**
 * 每級加成 — 後台編輯 `config/per-level-bonus.json`（GH#790）。
 *
 * owner 2026-08-13：「我追加一個設定，英雄每等級都會 +1 AP，這個參數一樣可在後台設定」。
 * owner 2026-08-27：「後台 每級加成 這頁無法顯示」—— `perLevelBonus` 在 NAV / store /
 * session-gate 三處都有，⛔ 但 `CONFIG_DOC_SPECS` 沒有 spec ⇒ `specForPage` 回 null ⇒
 * 右欄什麼都不畫（App.tsx 的註解自己寫著這個行為）。
 *
 * ⚠️ 為什麼是專頁而不是通用引擎：這份文件的 `perLevel` 是 **`z.record`**（鍵＝屬性 id），
 * 通用表單引擎只走得動固定形狀的葉節點 —— 它列不出「有哪些鍵」。和 stat-caps 同一個
 * 引擎缺口、同一個解法（專頁，姿勢照 StatCapsPage）。
 *
 * 語意（`packages/shared/src/sim/baseBonus.ts` 的 `perLevelBonusFor`）：
 * `+amount × (等級 − 1)`，套在**環境倍率之後、夾限之前** —— 和基礎加成同一層。
 * `appliesTo` 用主屬性分流（all / primary / nonPrimary）；⭐ `nonPrimary` 存在是因為
 * 扁平加成會壓平定位差距（實測 +1 AP/級讓法師/坦克的 AP 比從 1.74 掉到 1.48）。
 *
 * ⚠️ 只有**一顆**儲存鈕，送的是**整張表**（同 StatCapsPage 的理由）：文件裡缺鍵＝
 * 那條屬性沒有每級加成 —— 一顆「只存這一列」的按鈕會安靜地把其他列刪掉。
 */
import { useEffect, useState } from "react";
import { Panel, Btn } from "./widgets";
import { DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import { ALL_STATS, type Stat } from "@ggd/shared/sim/stats/statTypes";
import {
  DEFAULT_PER_LEVEL_BONUS,
  PER_LEVEL_BONUS_MAX,
  PER_LEVEL_BONUS_MIN,
  STAT_LABEL_ZH,
  perLevelBonusFor,
  perLevelBonusFromDoc,
  type PerLevelBonus,
  type PerLevelBonusTable,
} from "@ggd/shared/sim/baseBonus";

export const PLB_COLLECTION = "config";
export const PLB_DOC_ID = "per-level-bonus";
export const PLB_SCHEMA = "config.per-level-bonus@1";

export type PlbAppliesTo = PerLevelBonus["appliesTo"];
export interface PlbDraftRow {
  /** 字串，打到一半也存得住；界檢查在 `plbAmountIssue`。 */
  amount: string;
  appliesTo: PlbAppliesTo;
}

/** 顯示用的中文；語意的唯一住處是 schema 的 enum，這裡只是標籤。 */
export const APPLIES_LABEL: Readonly<Record<PlbAppliesTo, string>> = Object.freeze({
  all: "每一位",
  primary: "只給主屬性英雄",
  nonPrimary: "只給非主屬性英雄",
});

/** 把一份正規化表攤成可編輯草稿。 */
export function plbDraftFor(table: PerLevelBonusTable): Record<string, PlbDraftRow> {
  const out: Record<string, PlbDraftRow> = {};
  for (const [k, e] of Object.entries(table)) {
    if (e) out[k] = { amount: String(e.amount), appliesTo: e.appliesTo };
  }
  return out;
}

/** amount 欄的界 —— 直接引 `PER_LEVEL_BONUS_MIN/MAX`，sim 夾的同一對數字（⛔ 不抄字面值）。 */
export function plbAmountIssue(text: string): string | null {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) return "每級加多少要是一個數字";
  if (n < PER_LEVEL_BONUS_MIN || n > PER_LEVEL_BONUS_MAX)
    return `可填 ${PER_LEVEL_BONUS_MIN}–${PER_LEVEL_BONUS_MAX}（上界是保險絲：L99 就是 ×98）`;
  return null;
}

/**
 * ⭐ 第一·五守則：⛔ 不放任何「說了但不會發生」的設定。
 * `primary`/`nonPrimary` 靠三圍推導主屬性，而不是每條屬性都有三圍來源。判準⛔不抄
 * 那張推導表（`ATTR_OF_STAT` 沒 export，抄一份就是第二個住處）—— 改拿**出貨的**
 * `perLevelBonusFor` 對三種主屬性各探一發：三發全 0 ＝ 這個組合永遠不生效。
 */
export function plbNeverApplies(stat: string, appliesTo: PlbAppliesTo): boolean {
  if (appliesTo === "all") return false;
  const probe = { [stat]: { amount: 1, appliesTo } } as PerLevelBonusTable;
  return (["str", "agi", "int"] as const).every(
    (p) => perLevelBonusFor(probe, stat as Stat, 2, p) === 0,
  );
}

/** 這一列現在填得對不對（含「永遠不會生效」的兩種死組合 —— 擋在存檔前，⛔ 不是存進去再說）。 */
export function plbRowIssue(stat: string, row: PlbDraftRow): string | null {
  const a = plbAmountIssue(row.amount);
  if (a !== null) return a;
  if (!(ALL_STATS as readonly string[]).includes(stat))
    return `「${stat}」不在屬性名單裡 —— 引擎永遠不會讀這個鍵，請刪掉這一列`;
  if (plbNeverApplies(stat, row.appliesTo))
    return "這條屬性不由三圍推導，主/非主屬性判不出來（引擎 fail-safe 回 0）—— 這一列永遠不會生效，請改回「每一位」或換一條屬性";
  return null;
}

/** 整份要寫進 overlay 的文件。鍵排序＝決定性輸出；`note` 原樣帶回（⛔ 不無聲弄丟）。 */
export function plbDocFor(
  draft: Record<string, PlbDraftRow>,
  note?: string,
): Record<string, unknown> {
  const perLevel: Record<string, { amount: number; appliesTo: PlbAppliesTo }> = {};
  for (const k of Object.keys(draft).sort()) {
    const r = draft[k]!;
    perLevel[k] = { amount: Number(r.amount), appliesTo: r.appliesTo };
  }
  return { id: PLB_DOC_ID, schema: PLB_SCHEMA, ...(note !== undefined ? { note } : {}), perLevel };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const inputStyle = (bad: boolean): React.CSSProperties => ({
  padding: "4px 6px",
  background: "transparent",
  color: bad ? DANGER : TEXT_MAIN,
  border: `1px solid ${bad ? DANGER : PANEL_BORDER}`,
  borderRadius: 3,
});

export function PerLevelBonusPage(): React.JSX.Element {
  // null = 還沒讀到（和「讀到一份空表」是不同的狀態 —— 空表是「全部關閉」）。
  const [draft, setDraft] = useState<Record<string, PlbDraftRow> | null>(null);
  const [note, setNote] = useState<string | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [addStat, setAddStat] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST — overlay 是 shard 真的載的那一份；沒有才退回出貨檔。
        let full: unknown = await getOverlayDoc(PLB_COLLECTION, PLB_DOC_ID);
        if (!full) {
          const shipped = await getShippedDoc(PLB_COLLECTION, PLB_DOC_ID);
          if (shipped.present && shipped.doc) full = shipped.doc;
        }
        // `perLevelBonusFromDoc` 是 sim 在用的同一支萃取器：認不得 → 出貨預設，
        // ⛔ 不是空表 —— 「缺文件 = 預設」和「空表 = 全部關閉」在這頁要分得出來。
        setDraft(plbDraftFor(perLevelBonusFromDoc(full)));
        const n = (full as Record<string, unknown> | null)?.["note"];
        setNote(typeof n === "string" ? n : undefined);
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
  }, []);

  const rows = draft === null ? [] : Object.keys(draft).sort();
  const issues = new Map(rows.map((s) => [s, plbRowIssue(s, draft![s]!)]));
  const allValid = [...issues.values()].every((v) => v === null);
  const addable = ALL_STATS.filter((s) => draft !== null && !(s in draft));

  const edit = (stat: string, patch: Partial<PlbDraftRow>): void => {
    setDraft({ ...draft, [stat]: { ...draft![stat]!, ...patch } });
    setDirty(true);
  };
  const remove = (stat: string): void => {
    const next = { ...draft };
    delete next[stat];
    setDraft(next);
    setDirty(true);
  };

  const save = async (): Promise<void> => {
    if (draft === null) return;
    setBusy(true);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(
        PLB_COLLECTION,
        PLB_DOC_ID,
        plbDocFor(draft, note),
      );
      setDirty(false);
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const shippedOf = (stat: string): PerLevelBonus | undefined =>
    (DEFAULT_PER_LEVEL_BONUS as Record<string, PerLevelBonus | undefined>)[stat];

  return (
    <Panel title="每級加成">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        每升一級，這條屬性<b style={{ color: TEXT_MAIN }}>加多少</b>、
        <b style={{ color: TEXT_MAIN }}>給誰</b>。實際套用是{" "}
        <code>+每級加多少 × (等級 − 1)</code>，落在
        <b style={{ color: TEXT_MAIN }}>環境倍率之後、屬性上限之前</b> ——
        和「基礎加成」同一層，差別只有乘上等級。出貨預設：
        <b style={{ color: GOLD }}>法術強度 每級 +1、給每一位</b>
        （owner 2026-08-13「英雄每等級都會 +1 AP」）。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 表裡<b style={{ color: TEXT_MAIN }}>沒有的屬性＝沒有每級加成</b>；
        整張表清空存檔＝全部關閉（⛔ <b style={{ color: TEXT_MAIN }}>不是</b>回到出貨預設；
        要回預設請到「內容覆蓋層」還原這份文件）。扁平加成會壓平定位差距 ——
        「只給非主屬性英雄」那一格就是為了補償非法師而不壓平法師。
      </p>
      {/* 和 屬性上限 同一條已知限制：這份文件在 game-server 開機時被讀進 Configs，
          MatchController 只從已載入的 registry 讀（MatchController.ts 自己註明
          「後台改了要重啟 shard」）。⛔ 不要寫「下一場生效」。 */}
      <p style={{ color: GOLD, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 存檔<b>不是下一場就生效</b>：要<b>重啟 shard</b> 之後新的每級加成才會進到比賽裡。
      </p>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}
      {draft === null && apiErr === null && (
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>載入中…</div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((stat) => {
          const r = draft![stat]!;
          const issue = issues.get(stat) ?? null;
          const shipped = shippedOf(stat);
          const n = Number(r.amount);
          return (
            <div
              key={stat}
              data-testid={`plb-row-${stat}`}
              style={{
                padding: "7px 10px",
                border: `1px solid ${issue === null ? PANEL_BORDER : DANGER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: TEXT_MAIN, minWidth: 130 }}>
                  {(STAT_LABEL_ZH as Record<string, string>)[stat] ?? stat}
                </span>
                <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 70 }}>{stat}</code>
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>每級 +</span>
                <input
                  aria-label={`${stat} 每級加多少`}
                  data-field={`plb-amount-${stat}`}
                  value={r.amount}
                  inputMode="decimal"
                  onChange={(e) => edit(stat, { amount: e.target.value })}
                  style={{ ...inputStyle(issue !== null), width: 70, textAlign: "right" }}
                />
                <select
                  aria-label={`${stat} 給誰`}
                  data-field={`plb-applies-${stat}`}
                  value={r.appliesTo}
                  onChange={(e) => edit(stat, { appliesTo: e.target.value as PlbAppliesTo })}
                  style={{ ...inputStyle(false), background: "#10141f", fontSize: 13 }}
                >
                  {(Object.keys(APPLIES_LABEL) as PlbAppliesTo[]).map((k) => (
                    <option key={k} value={k}>
                      {APPLIES_LABEL[k]}
                    </option>
                  ))}
                </select>
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  {Number.isFinite(n) && `L99 ＝ +${Math.round(n * 98 * 100) / 100}`}
                  {shipped
                    ? ` · 出貨預設 +${shipped.amount}（${APPLIES_LABEL[shipped.appliesTo]}）`
                    : " · 出貨預設無此列"}
                </span>
                <Btn small kind="danger" dataField={`plb-del-${stat}`} onClick={() => remove(stat)}>
                  刪除
                </Btn>
              </div>
              {issue !== null && (
                <div style={{ color: DANGER, fontSize: 11, marginTop: 4 }}>{issue}</div>
              )}
            </div>
          );
        })}
      </div>

      {draft !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <select
            aria-label="要新增每級加成的屬性"
            data-field="plb-add-stat"
            value={addStat}
            onChange={(e) => setAddStat(e.target.value)}
            style={{ ...inputStyle(false), background: "#10141f", fontSize: 13, minWidth: 190 }}
          >
            <option value="">— 選一條屬性 —</option>
            {addable.map((s) => (
              <option key={s} value={s}>
                {STAT_LABEL_ZH[s]}（{s}）
              </option>
            ))}
          </select>
          <Btn
            small
            dataField="plb-add"
            disabled={addStat === ""}
            onClick={() => {
              // 新列預設 +1／每一位 —— 出貨那一列的形狀；存檔前都改得到。
              edit(addStat, { amount: "1", appliesTo: "all" });
              setAddStat("");
            }}
          >
            新增一列
          </Btn>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Btn kind="primary" disabled={busy || !dirty || !allValid} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <span style={{ color: allValid ? TEXT_DIM : DANGER, fontSize: 12 }}>
          {allValid
            ? "整張表一起寫入耐久覆蓋層（撐得過重新部署）"
            : [...issues.values()].find((v) => v !== null)}
        </span>
      </div>
    </Panel>
  );
}
