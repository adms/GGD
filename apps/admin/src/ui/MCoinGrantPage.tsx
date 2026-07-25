/**
 * M幣 / 藍水晶 發放 · currency grants (tasks #118, #225).
 *
 * Three operator actions on one page, because the owner asked for the crystal
 * grant to live 「在後台 發放M幣的地方」:
 *
 *   1. M幣 to one account — `POST /admin/accounts/{id}/mcoin` (#118, re-pointed
 *      by #214). May be negative to deduct; the server floors the balance at 0,
 *      bounds the magnitude, and AUDITS every adjustment as `mcoin_adjust`.
 *      Until #214 this button called `/wallet/admin/grant-mcoin`, which was
 *      role-checked but wrote no audit line and validated no amount — the one
 *      currency action on this page that left no trail. That route is deleted.
 *   2. 藍水晶 to one account — `POST /admin/accounts/{id}/crystal` (#225).
 *      Positive only, capped, admin-gated AND audited.
 *   3. 一鍵發放所有帳號藍水晶 — `POST /admin/crystals/grant-all` (#225).
 *
 * All three now share one property worth stating plainly: every currency move an
 * operator makes from this page appears in 稽核紀錄.
 *
 * THE BULK ACTION IS ECONOMY-WIDE, so it is deliberately hard to fire by
 * accident. Three independent guards, none of which subsumes the others:
 *   - a ConfirmDialog stating the exact amount AND the real account count,
 *     fetched from the server before the dialog opens (never a guess);
 *   - the `busy` latch every action shares, so a double-click cannot double-grant;
 *   - the button is disabled while busy and while the amount is unparseable, so
 *     it is not even reachable with a value the server would reject.
 * It is REPEATABLE by design (it is not the one-off #204 welcome backfill), which
 * is exactly why the confirmation has to be explicit: running it twice really
 * does grant twice.
 *
 * All parse/validate/submit logic lives in ../mcoinGrant and ../crystalGrant so
 * it is unit-tested without React.
 */
import { useState } from "react";
import { grantCrystal, grantCrystalAll, grantMCoin, searchAccounts } from "../api";
import { formatBalance, submitGrant, type GrantResult } from "../mcoinGrant";
import {
  formatCrystal,
  parseCrystalAmount,
  submitCrystalGrant,
  submitCrystalGrantAll,
  summarizeBulk,
  type CrystalBulkResult,
  type CrystalGrantResult,
} from "../crystalGrant";
import { Btn, ConfirmDialog, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export function MCoinGrantPage(): React.JSX.Element {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrantResult | null>(null);

  // 藍水晶 · crystals (#225)
  const [crystalId, setCrystalId] = useState("");
  const [crystalAmount, setCrystalAmount] = useState("");
  const [crystalReason, setCrystalReason] = useState("");
  const [crystalResult, setCrystalResult] = useState<CrystalGrantResult | null>(null);
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<CrystalBulkResult | null>(null);
  // Non-null only while the confirmation dialog is open; carries the REAL
  // account count the server reported, so the dialog never states a guess.
  const [confirmBulk, setConfirmBulk] = useState<{ amount: number; accounts: number } | null>(null);

  const bulkParsed = parseCrystalAmount(bulkAmount);

  async function apply(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await submitGrant({ accountId, amount }, grantMCoin, reason);
    if (outcome.ok) {
      setResult(outcome.result);
      setAmount(""); // clear the delta; keep the account id for repeated grants
    } else {
      setError(outcome.error);
    }
    setBusy(false);
  }

  async function applyCrystal(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await submitCrystalGrant(
      { accountId: crystalId, amount: crystalAmount },
      grantCrystal,
      crystalReason,
    );
    if (outcome.ok) {
      setCrystalResult(outcome.result);
      setCrystalAmount(""); // keep the id for repeated grants, clear the amount
    } else {
      setError(outcome.error);
    }
    setBusy(false);
  }

  /**
   * Step 1 of the bulk grant: validate, then ASK THE SERVER how many accounts
   * exist and open the confirmation dialog with that number. Nothing is granted
   * here. A failure to read the count aborts before the dialog — an operator must
   * not be asked to confirm "發放給 ? 個帳號".
   */
  async function askBulk(): Promise<void> {
    if (busy) return;
    const parsed = parseCrystalAmount(bulkAmount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const page = await searchAccounts("", 1, 1);
      setConfirmBulk({ amount: parsed.value, accounts: page.total });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "無法取得帳號數量 · failed to count accounts");
    }
    setBusy(false);
  }

  /** Step 2: the operator confirmed. Fire it once. */
  async function applyBulk(): Promise<void> {
    setConfirmBulk(null);
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await submitCrystalGrantAll(bulkAmount, grantCrystalAll, bulkReason);
    if (outcome.ok) {
      setBulkResult(outcome.result);
      setBulkAmount(""); // a repeat must be typed again, never re-fired by Enter
    } else {
      setError(outcome.error);
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="M幣 發放 · Grant M COIN">
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 14 }}>
          M幣（造型幣）改由後台發放，不再開放購買。輸入帳號 ID 與數量後發放；數量可為負數（扣除），伺服器會將餘額下限保護在
          0，因此大額負數是「歸零」而不是「扣那麼多」。每一筆發放都會寫入稽核紀錄。
          <br />
          M COIN is admin-granted (never purchased). Amount may be negative to deduct; the balance floors at 0. Every
          adjustment is audited.
        </div>

        <ErrorBanner text={error} onDismiss={() => setError(null)} />

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>帳號 ID · Account ID</div>
        <TextInput
          value={accountId}
          onChange={(v) => {
            setAccountId(v);
            setResult(null);
          }}
          placeholder="account id (e.g. 01J…)"
          onEnter={() => void apply()}
        />

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>原因 · Reason（選填，寫入稽核）</div>
        <TextInput
          value={reason}
          onChange={setReason}
          placeholder="e.g. 活動獎勵 / 補償"
          onEnter={() => void apply()}
        />

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>數量 · Amount</div>
        <div style={{ display: "flex", gap: 8 }}>
          <TextInput
            value={amount}
            onChange={setAmount}
            placeholder="+500 / -200"
            type="number"
            onEnter={() => void apply()}
          />
          <Btn kind="primary" disabled={busy} onClick={() => void apply()}>
            {busy ? "發放中…" : "發放 Grant"}
          </Btn>
        </div>
      </Panel>

      {result && (
        <Panel title="結果 · Result">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div>
              <div style={{ fontSize: 12, color: TEXT_DIM }}>
                帳號 <span style={{ color: TEXT_MAIN, fontFamily: "monospace" }}>{result.accountId}</span> 目前餘額
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>{formatBalance(result.mcoin)}</div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: OK }}>已更新</span>
          </div>
        </Panel>
      )}

      {/* ---- 藍水晶 · single account (#225) ---- */}
      <Panel title="藍水晶 發放 · Grant Crystals">
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 14 }}>
          藍水晶平常只能「打場賺」，這裡是唯一的後台補發管道。數量為累加，只能是正整數（不支援扣除，因為餘額下限是
          0，負數只會把玩家的水晶歸零而不是扣除）。每一筆發放都會寫入稽核紀錄。
          <br />
          Crystals are otherwise earned by playing. Grants are additive and positive-only; every grant is audited.
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>帳號 ID · Account ID</div>
        <TextInput
          value={crystalId}
          onChange={(v) => {
            setCrystalId(v);
            setCrystalResult(null);
          }}
          placeholder="account id (e.g. 01J…)"
          onEnter={() => void applyCrystal()}
        />

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>水晶數量 · Crystal amount</div>
        <div style={{ display: "flex", gap: 8 }}>
          <TextInput
            value={crystalAmount}
            onChange={setCrystalAmount}
            placeholder="1000"
            type="number"
            onEnter={() => void applyCrystal()}
          />
          <Btn kind="primary" disabled={busy} onClick={() => void applyCrystal()}>
            {busy ? "發放中…" : "發放 Grant"}
          </Btn>
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>原因 · Reason（選填，寫入稽核）</div>
        <TextInput value={crystalReason} onChange={setCrystalReason} placeholder="補償 / 活動…" />
      </Panel>

      {crystalResult && (
        <Panel title="水晶結果 · Crystal result">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✅</span>
            <div>
              <div style={{ fontSize: 12, color: TEXT_DIM }}>
                帳號 <span style={{ color: TEXT_MAIN, fontFamily: "monospace" }}>{crystalResult.accountId}</span> 目前水晶
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>
                {formatCrystal(crystalResult.crystal)}
              </div>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: OK }}>已更新</span>
          </div>
        </Panel>
      )}

      {/* ---- 藍水晶 · 一鍵發放所有帳號 (#225) ---- */}
      <Panel title="一鍵發放所有帳號藍水晶 · Grant crystals to EVERY account">
        <div style={{ fontSize: 12, color: WARN, lineHeight: 1.7, marginBottom: 14 }}>
          ⚠️ 這會動到「所有玩家」的經濟數值。按下後會先跳出確認視窗，顯示發放數量與實際帳號數，確認後才真的發放。
          <br />
          此動作<strong>可重複執行</strong>：跑兩次就是每個人各拿兩份，不會自動跳過已經發過的帳號。
          <br />
          Economy-wide and repeatable. A confirmation showing the amount and the real account count is required.
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>每人發放水晶 · Crystals per account</div>
        <div style={{ display: "flex", gap: 8 }}>
          <TextInput value={bulkAmount} onChange={setBulkAmount} placeholder="1000" type="number" />
          {/* No onEnter anywhere in this panel: an economy-wide action must not
              be reachable from a stray Return keypress. */}
          <Btn kind="danger" disabled={busy || !bulkParsed.ok} onClick={() => void askBulk()}>
            {busy ? "處理中…" : "一鍵發放 Grant all"}
          </Btn>
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, margin: "12px 0 6px" }}>原因 · Reason（選填，寫入稽核）</div>
        <TextInput value={bulkReason} onChange={setBulkReason} placeholder="新春發放 / 補償…" />
      </Panel>

      {bulkResult && (
        <Panel title="批次結果 · Bulk result">
          <div style={{ fontSize: 13, color: TEXT_MAIN }}>{summarizeBulk(bulkResult)}</div>
          {bulkResult.failed > 0 && (
            <div style={{ fontSize: 12, color: WARN, marginTop: 8, lineHeight: 1.6 }}>
              部分帳號失敗，成功的那些<strong>已經發放完成</strong>；重跑會讓他們再拿一份。
              {bulkResult.firstError ? ` 第一個錯誤：${bulkResult.firstError}` : ""}
            </div>
          )}
        </Panel>
      )}

      {confirmBulk && (
        <ConfirmDialog
          title="確認一鍵發放所有帳號藍水晶？"
          danger
          confirmLabel={`確認發放 ${confirmBulk.amount.toLocaleString()} × ${confirmBulk.accounts}`}
          body={
            <span>
              即將對 <strong style={{ color: TEXT_MAIN }}>{confirmBulk.accounts.toLocaleString()}</strong> 個帳號，
              每個發放 <strong style={{ color: ACCENT }}>{formatCrystal(confirmBulk.amount)}</strong>。
              <br />
              <br />
              此動作可重複執行且<strong>不會自動跳過</strong>已經有水晶的帳號，也沒有復原按鈕。
            </span>
          }
          onConfirm={() => void applyBulk()}
          onCancel={() => setConfirmBulk(null)}
        />
      )}
    </div>
  );
}
