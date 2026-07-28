/**
 * 基礎加成 — 後台設定「每位英雄一開始就多拿多少」,而且**不參與倍率計算**。
 *
 * owner, 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台設定
 * 並且不參與倍率計算」.
 *
 * All logic is in `../baseBonus`, which is where the tests live. This is the view.
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import {
  BONUS_COLLECTION,
  BONUS_DOC_ID,
  bonusDocFor,
  bonusRows,
  bonusSummary,
  extractBonus,
  forgetBonus,
  setBonus,
  type BonusRow,
} from "../baseBonus";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function BaseBonusPage(): JSX.Element {
  // null = 「還沒讀到任何文件」,和「讀到一份空文件」是不同的狀態:前者每一格
  // 顯示出貨預設,後者每一格是 0。見 ../baseBonus bonusRows 的說明。
  const [bonus, setBonusState] = useState<Record<string, number> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST — the overlay is what the shard actually loads.
        const overlaid = (await getOverlayDoc(BONUS_COLLECTION, BONUS_DOC_ID)) as unknown;
        let full: unknown = overlaid ?? null;
        if (!full) {
          const shipped = await getShippedDoc(BONUS_COLLECTION, BONUS_DOC_ID);
          if (shipped.present && shipped.doc) full = shipped.doc;
        }
        setBonusState(full ? extractBonus(full) : {});
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
  }, []);

  const rows = useMemo(() => bonusRows(bonus), [bonus]);
  const summary = useMemo(() => bonusSummary(rows), [rows]);

  const write = async (next: Record<string, number>, id: string, msg: string): Promise<void> => {
    setBusy(id);
    setApiErr(null);
    try {
      const head = await putOverlayDoc(
        BONUS_COLLECTION,
        BONUS_DOC_ID,
        bonusDocFor(next) as unknown as Record<string, unknown>,
      );
      setBonusState(next);
      setFlash(`✓ ${msg}（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="基礎加成">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        每位英雄一開始就多拿的<b style={{ color: TEXT_MAIN }}>固定數值</b>。
        出貨預設是<b style={{ color: GOLD }}>生命上限 +300</b>,其餘為 0。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 這裡填的是<b style={{ color: ACCENT }}>加數,不是倍率</b>,而且
        <b style={{ color: TEXT_MAIN }}>不參與倍率計算</b>——「生命倍率 3.0」放大的是英雄自己
        的血量,不會把這份加成也乘三倍。填 300 玩家就是多 300。倍率請到
        <b style={{ color: TEXT_MAIN }}> 戰鬥系統 </b>頁。設定寫進耐久覆蓋層,
        <b style={{ color: OK }}>撐得過重新部署</b>,並從<b style={{ color: TEXT_MAIN }}>下一場</b>開始生效。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>{summary}</div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r: BonusRow) => {
          const shown = draft[r.stat] ?? String(r.effective);
          const parsed = Number(shown);
          const valid = shown.trim() !== "" && Number.isFinite(parsed);
          return (
            <div
              key={r.stat}
              data-testid={`bonus-row-${r.stat}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{r.label}</span>
              <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 110 }}>{r.stat}</code>
              <input
                aria-label={`${r.label} 基礎加成`}
                value={shown}
                inputMode="decimal"
                onChange={(e) => setDraft({ ...draft, [r.stat]: e.target.value })}
                style={{
                  width: 96,
                  padding: "4px 6px",
                  background: "transparent",
                  color: valid ? TEXT_MAIN : DANGER,
                  border: `1px solid ${valid ? PANEL_BORDER : DANGER}`,
                  borderRadius: 3,
                  textAlign: "right",
                }}
              />
              <span style={{ color: TEXT_DIM, fontSize: 11, minWidth: 90 }}>
                出貨預設 {r.shipped}
              </span>
              <span style={{ flex: 1 }} />
              <Btn
                disabled={busy !== null || !valid || parsed === r.effective}
                onClick={() =>
                  void write(setBonus(bonus ?? {}, r.stat, parsed), r.stat, `${r.label} = ${parsed}`)
                }
              >
                {busy === r.stat ? "…" : "儲存"}
              </Btn>
              {r.operator !== null && (
                <Btn
                  disabled={busy !== null}
                  onClick={() => {
                    const { [r.stat]: _drop, ...rest } = draft;
                    setDraft(rest);
                    void write(forgetBonus(bonus ?? {}, r.stat), r.stat, `${r.label} 清除`);
                  }}
                >
                  清除
                </Btn>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
