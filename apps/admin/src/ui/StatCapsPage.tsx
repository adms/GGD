/**
 * 屬性上限 — 後台設定每條屬性的「一般上限」與「解鎖上限」(GH#286).
 *
 * owner, 2026-07-28:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,
 * 可以解鎖最多到 10.0。這兩個參數也可以放到後台設定」.
 *
 * ⚠️ 只有**一顆**儲存鈕,而且它送的是**整張表**。這不是省事,是語意:
 * `capFor` 對文件裡缺鍵的屬性會退回 `STAT_CLAMPS` 且 `unlocked === base` ——
 * 也就是「那條屬性從此不能被解鎖」。一顆「只存這一列」的按鈕會在操作者調完攻速
 * 之後,安靜地把其他每一條屬性的解鎖關掉,而畫面上完全看不出來。
 *
 * All logic is in `../statCaps`, which is where the tests live. This is the view.
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import type { StatCap } from "@ggd/shared/sim/statCaps";
import {
  CAPS_COLLECTION,
  CAPS_DOC_ID,
  capRowIssue,
  capRows,
  capsDocFor,
  capsSummary,
  extractCaps,
  rowsToCaps,
  type CapRow,
} from "../statCaps";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** ∞ 是「這條屬性本來就沒有上限」,不是一個可以填的數字。 */
function shown(v: number): string {
  return Number.isFinite(v) ? String(v) : "∞";
}

interface Draft {
  base: string;
  unlocked: string;
}

export function StatCapsPage(): JSX.Element {
  // null = 「還沒讀到任何文件」,和「讀到一份空文件」是不同的狀態。見 ../statCaps。
  const [caps, setCapsState] = useState<Record<string, StatCap> | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST — the overlay is what the shard actually loads.
        const overlaid = (await getOverlayDoc(CAPS_COLLECTION, CAPS_DOC_ID)) as unknown;
        let full: unknown = overlaid ?? null;
        if (!full) {
          const shipped = await getShippedDoc(CAPS_COLLECTION, CAPS_DOC_ID);
          if (shipped.present && shipped.doc) full = shipped.doc;
        }
        // ⚠️ `null` ≠ `{}`:null 顯示出貨預設(攻速 4 → 10),`{}` 顯示「每條屬性
        // 都不可解鎖」。壓成 `{}` 的話,一台還沒有這份文件的主機會把面板畫成
        // 「解鎖功能不存在」,而伺服器其實正在給 10.0。
        setCapsState(full ? extractCaps(full) : null);
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
  }, []);

  const rows = useMemo(() => capRows(caps), [caps]);
  const summary = useMemo(() => capsSummary(rows), [rows]);

  /** 畫面上每一列現在的字面值(未編輯的用生效值)。 */
  const shownOf = (r: CapRow): Draft => ({
    base: draft[r.stat]?.base ?? shown(r.effective.base),
    unlocked: draft[r.stat]?.unlocked ?? shown(r.effective.unlocked),
  });

  const editable = (r: CapRow): boolean =>
    Number.isFinite(r.effective.base) && Number.isFinite(r.effective.unlocked);

  /**
   * 這一列現在填得對不對。規則本體在 `../statCaps` 的 `capRowIssue` —— 兩端的界
   * 都在那裡,而且有測試在守。這一層只負責問。
   */
  const rowIssue = (r: CapRow): string | null => {
    if (!editable(r)) return null;
    const d = shownOf(r);
    return capRowIssue(r.stat, d.base, d.unlocked);
  };
  const rowValid = (r: CapRow): boolean => rowIssue(r) === null;

  const allValid = rows.every(rowValid);
  const firstIssue = rows.map(rowIssue).find((m): m is string => m !== null) ?? null;
  const dirty = Object.keys(draft).length > 0;

  /** 每一列,套上操作者現在打進去的字。未編輯的列維持它的生效值。 */
  const draftedRows = (): CapRow[] =>
    rows.map((r) => {
      const d = draft[r.stat];
      if (!d || !editable(r)) return r;
      return { ...r, effective: { base: Number(d.base), unlocked: Number(d.unlocked) } };
    });

  /**
   * 整張表 = **每一列**現在畫面上的值,而不是只有被改過的那幾列。
   * 這一行就是「不會悄悄關掉其他屬性的解鎖」那條規則。
   */
  const tableToSave = (): Record<string, StatCap> => rowsToCaps(draftedRows());

  const save = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const next = tableToSave();
      const head = await putOverlayDoc(
        CAPS_COLLECTION,
        CAPS_DOC_ID,
        capsDocFor(next) as unknown as Record<string, unknown>,
      );
      setCapsState(next);
      setDraft({});
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="屬性上限">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        每條屬性的<b style={{ color: TEXT_MAIN }}>一般上限</b>與
        <b style={{ color: GOLD }}>解鎖上限</b>。出貨預設是
        <b style={{ color: GOLD }}>攻擊速度 4 → 最多解鎖到 10</b>,以及
        <b style={{ color: GOLD }}>法術強度 100000</b>(owner 2026-08-01
        「所以要有這個欄位,但先不要夾」—— 這個數字是量到最強 AP 組合的 24 倍,
        <b style={{ color: TEXT_MAIN }}>今天不會夾到任何人</b>,要開始夾就把它調小)。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 這裡填的是<b style={{ color: ACCENT }}>天花板,不是倍率、也不是加數</b>。
        沒有任何解鎖來源時,屬性被夾在「一般上限」;帶著
        <b style={{ color: TEXT_MAIN }}>解鎖上限</b>效果的技能／道具／三選一／靈氣
        (<code>capRaise</code>)可以把它抬高,但<b style={{ color: TEXT_MAIN }}>最多只到解鎖上限</b>,
        而且多個來源<b style={{ color: TEXT_MAIN }}>取最大值、不疊加</b>。設定寫進耐久覆蓋層,
        <b style={{ color: OK }}>撐得過重新部署</b>。
      </p>
      {/*
        ⚠️ 不要寫「下一場生效」。這份文件是**開機時**被 `fetchOverlayBundle` 拉進
        game-server 的 `Configs`(apps/game-server/src/index.ts `loadContent`),
        而 `MatchController` 只是從那份已載入的 registry 讀 —— 沒有任何路徑會在
        開賽時重新抓 overlay。存檔後不重啟 shard 的話,玩家那一場拿到的還是舊的
        天花板,而操作者看到的是「✓ 已寫入」。這一段話是他唯一的線索。
        (基礎加成頁掛著一模一樣的錯誤說法 —— 那是 issue #278。)
      */}
      <p style={{ color: GOLD, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 存檔<b>不是下一場就生效</b>:這份文件在 <code>game-server</code> 開機時才被讀進去,
        所以要<b>重啟 shard</b> 之後新的上限才會進到比賽裡。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>{summary}</div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r: CapRow) => {
          const d = shownOf(r);
          const ok = rowValid(r);
          const canEdit = editable(r);
          const box = (kind: "base" | "unlocked"): JSX.Element => (
            <input
              aria-label={`${r.label} ${kind === "base" ? "一般上限" : "解鎖上限"}`}
              data-field={`${r.stat}.${kind}`}
              value={d[kind]}
              disabled={!canEdit}
              inputMode="decimal"
              onChange={(e) =>
                setDraft({ ...draft, [r.stat]: { ...d, [kind]: e.target.value } })
              }
              style={{
                width: 84,
                padding: "4px 6px",
                background: "transparent",
                color: !ok ? DANGER : kind === "unlocked" ? GOLD : TEXT_MAIN,
                border: `1px solid ${ok ? PANEL_BORDER : DANGER}`,
                borderRadius: 3,
                textAlign: "right",
              }}
            />
          );
          return (
            <div
              key={r.stat}
              data-testid={`cap-row-${r.stat}`}
              style={{
                padding: "7px 10px",
                border: `1px solid ${ok ? PANEL_BORDER : DANGER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: TEXT_MAIN, minWidth: 130 }}>{r.label}</span>
                <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 90 }}>{r.stat}</code>
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>一般</span>
                {box("base")}
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>解鎖</span>
                {box("unlocked")}
                <span style={{ color: TEXT_DIM, fontSize: 11, minWidth: 190 }}>
                  出貨預設 {shown(r.shipped.base)} / {shown(r.shipped.unlocked)}
                  {r.floor !== null && ` · 地板 ${r.floor}`}
                  {canEdit && ` · 可填 ${r.bounds[0]}–${r.bounds[1]}`}
                </span>
              </div>
              {/*
                ⚠️ 這一行寫的是「夾住它會影響什麼」,不是把欄位名再講一次 ——
                操作者在這一頁要下的是一個平衡決定,而屬性名字本身不含任何資訊。
              */}
              <div
                data-testid={`cap-effect-${r.stat}`}
                style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}
              >
                {r.effect}
              </div>
              {!ok && (
                <div style={{ color: DANGER, fontSize: 11, marginTop: 4 }}>{rowIssue(r)}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Btn kind="primary" disabled={busy || !dirty || !allValid} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <span style={{ color: allValid ? TEXT_DIM : DANGER, fontSize: 12 }}>
          {allValid ? "整張表一起寫入" : firstIssue}
        </span>
      </div>
    </Panel>
  );
}
