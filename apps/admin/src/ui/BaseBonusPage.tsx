/**
 * 基礎加成 — 後台設定「每位英雄一開始就多拿多少」,而且**不參與倍率計算**。
 *
 * owner, 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台設定
 * 並且不參與倍率計算」.
 *
 * All logic is in `../baseBonus`, which is where the tests live. This is the view.
 *
 * ── 這一頁修過的三件事 ───────────────────────────────────────────────────────
 * #277 每一格都有**區間**,而且是**打字的當下**就擋。舊版只檢查
 *      `Number.isFinite`,所以 -9999 是一個可以按下儲存的值 —— 全 115 位英雄
 *      的最終生命上限變成負數,開場即死。區間來自 `baseBonusBounds`,和 Zod
 *      schema、sim 的 `normalizeBaseBonus` 是同一份數字。
 * #279 「清除」改名 + 兩段確認。它從來就不是「回到出貨預設」—— 它把 key 拿掉,
 *      那一列變 **0**,而旁邊寫著「出貨預設 300」。真正要回到 300 的按鈕是新的
 *      「還原出貨版」,走平台既有的 revert 端點(整份覆蓋層條目移除)。
 * #279 有上限的六個 stat 會在自己那一列說出來:填的數字會被最終值 clamp 吃掉,
 *      而這一頁的文案保證「填 300 就是多 300」。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc, revertOverlayDoc } from "../api";
import {
  BONUS_COLLECTION,
  BONUS_DOC_ID,
  bonusClampNote,
  bonusDocFor,
  bonusRows,
  bonusSummary,
  extractBonus,
  forgetBonus,
  setBonus,
  validateBonusInput,
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
  /** the row whose 歸零 is awaiting confirmation (#279) — null = none */
  const [confirmZero, setConfirmZero] = useState<string | null>(null);
  /** 還原出貨版 is a whole-document operation, so it confirms at page level */
  const [confirmRevert, setConfirmRevert] = useState(false);

  const load = async (): Promise<void> => {
    try {
      // LIVE FIRST — the overlay is what the shard actually loads.
      const overlaid = (await getOverlayDoc(BONUS_COLLECTION, BONUS_DOC_ID)) as unknown;
      let full: unknown = overlaid ?? null;
      if (!full) {
        const shipped = await getShippedDoc(BONUS_COLLECTION, BONUS_DOC_ID);
        if (shipped.present && shipped.doc) full = shipped.doc;
      }
      // ⚠️ `null` ≠ `{}`,而這正是這一頁最貴的一個分別:
      //   null —— 一份文件都沒讀到 → 每一格顯示**出貨預設**(生命 300)
      //   {}   —— 讀到一份真的空的文件 → 每一格是 **0**
      // 壓成 `{}` 的話,一台還沒有這份文件的主機會把面板顯示成「全部 0」,
      // 而伺服器仍然在給 300;操作者存下任何一列,就會把那 300 真的拿掉 ——
      // 一次他從來沒打算做的破壞性編輯。`bonusRows` 早就分得出這兩者,
      // 是這個呼叫端把分別丟掉的(失敗形狀 ⑤:受測的是函式,不是出貨的頁面)。
      setBonusState(full ? extractBonus(full) : null);
    } catch (err) {
      setApiErr(errText(err));
    }
  };

  useEffect(() => {
    void load();
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

  /**
   * 還原出貨版 (#279): drop the whole overlay ENTRY so the merged content tree
   * falls back to the repo's `config/base-bonus.json`. This is the operation an
   * operator means by 「回到預設」 — 「清除」 never was one: it wrote a document
   * that says 「this stat gets nothing」.
   */
  const revertAll = async (): Promise<void> => {
    setBusy("__revert__");
    setApiErr(null);
    try {
      const head = await revertOverlayDoc(BONUS_COLLECTION, BONUS_DOC_ID);
      setDraft({});
      setConfirmRevert(false);
      await load();
      setFlash(`✓ 已還原出貨版（generation ${head.generation}）`);
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
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        ⚠️ 這裡填的是<b style={{ color: ACCENT }}>加數,不是倍率</b>,而且
        <b style={{ color: TEXT_MAIN }}>不參與倍率計算</b>——「生命倍率 3.0」放大的是英雄自己
        的血量,不會把這份加成也乘三倍。填 300 玩家就是多 300(除非那一列標了上限)。
        倍率請到<b style={{ color: TEXT_MAIN }}> 戰鬥系統 </b>頁。設定寫進耐久覆蓋層,
        <b style={{ color: OK }}>撐得過重新部署</b>,並從<b style={{ color: TEXT_MAIN }}>下一場</b>開始生效。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 14px" }}>
        每一格都有合法區間,<b style={{ color: TEXT_MAIN }}>不接受負數</b>——這是全域數值,
        負的生命加成會讓所有英雄一開場就死。要全域<b style={{ color: TEXT_MAIN }}>下修</b>請用
        戰鬥系統的倍率(乘法,不會把誰變成負值)。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>{summary}</div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r: BonusRow) => {
          const shown = draft[r.stat] ?? String(r.effective);
          const parsed = Number(shown);
          const fieldErr = validateBonusInput(shown, r.stat);
          const valid = fieldErr === "";
          const clampNote = bonusClampNote(r);
          const zeroing = confirmZero === r.stat;
          return (
            <div
              key={r.stat}
              data-testid={`bonus-row-${r.stat}`}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                border: `1px solid ${valid ? PANEL_BORDER : DANGER}`,
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{r.label}</span>
              <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 110 }}>{r.stat}</code>
              <input
                aria-label={`${r.label} 基礎加成`}
                data-field={`bonus-${r.stat}`}
                aria-invalid={valid ? undefined : true}
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
              <span style={{ color: TEXT_DIM, fontSize: 11, minWidth: 132 }}>
                範圍 {r.min} ~ {r.max}
              </span>
              <span style={{ color: TEXT_DIM, fontSize: 11, minWidth: 90 }}>
                出貨預設 {r.shipped}
              </span>
              <span style={{ flex: 1 }} />
              <Btn
                dataField={`save-${r.stat}`}
                disabled={busy !== null || !valid || parsed === r.effective}
                onClick={() =>
                  void write(setBonus(bonus ?? {}, r.stat, parsed), r.stat, `${r.label} = ${parsed}`)
                }
              >
                {busy === r.stat ? "…" : "儲存"}
              </Btn>
              {/*
                #279 —— 舊版這顆按鈕叫「清除」,而它做的事是把 key 拿掉,那一列
                因此變成 **0**。旁邊就寫著「出貨預設 300」,所以「清除」讀起來像
                「回到 300」,實際上是「拿走 300」。名字現在說的是它真正做的事,
                而且要按兩下 —— 這是一個對全體英雄生效、沒有 undo 的破壞性編輯。
              */}
              {r.operator !== null &&
                (zeroing ? (
                  <>
                    <span style={{ color: WARN, fontSize: 12 }}>
                      歸零後這一列是 0,不是出貨預設 {r.shipped}。確定?
                    </span>
                    <Btn
                      dataField={`zero-confirm-${r.stat}`}
                      kind="danger"
                      disabled={busy !== null}
                      onClick={() => {
                        const { [r.stat]: _drop, ...rest } = draft;
                        setDraft(rest);
                        setConfirmZero(null);
                        void write(forgetBonus(bonus ?? {}, r.stat), r.stat, `${r.label} 歸零`);
                      }}
                    >
                      確定歸零
                    </Btn>
                    <Btn dataField={`zero-cancel-${r.stat}`} onClick={() => setConfirmZero(null)}>
                      取消
                    </Btn>
                  </>
                ) : (
                  <Btn
                    dataField={`zero-${r.stat}`}
                    disabled={busy !== null}
                    onClick={() => setConfirmZero(r.stat)}
                  >
                    歸零
                  </Btn>
                ))}
              {!valid && (
                <div
                  data-field={`bonus-error-${r.stat}`}
                  style={{ flexBasis: "100%", color: DANGER, fontSize: 12 }}
                >
                  {fieldErr}
                </div>
              )}
              {clampNote && (
                <div
                  data-field={`bonus-clamp-${r.stat}`}
                  style={{ flexBasis: "100%", color: WARN, fontSize: 12 }}
                >
                  {clampNote}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {confirmRevert ? (
          <>
            <span style={{ color: WARN, fontSize: 12 }}>
              移除整份覆蓋層條目,回到 repo 出貨版（生命上限 +300）。確定?
            </span>
            <Btn dataField="revert-confirm" kind="danger" disabled={busy !== null} onClick={() => void revertAll()}>
              確定還原
            </Btn>
            <Btn dataField="revert-cancel" onClick={() => setConfirmRevert(false)}>
              取消
            </Btn>
          </>
        ) : (
          <>
            <Btn dataField="revert" disabled={busy !== null} onClick={() => setConfirmRevert(true)}>
              還原出貨版
            </Btn>
            <span style={{ color: TEXT_DIM, fontSize: 12 }}>
              把這份文件的覆蓋層條目整個移除,讓 repo 出貨版重新生效——這才是「回到預設」。
            </span>
          </>
        )}
      </div>
    </Panel>
  );
}
