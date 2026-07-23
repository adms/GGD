/**
 * M幣 發放 · M COIN grant (task #118).
 *
 * A minimal operator form: enter a target account id + an amount and grant
 * admin-issued M COIN via `POST /wallet/admin/grant-mcoin` (role-gated
 * server-side — a non-admin caller is rejected 403). The amount may be negative
 * to deduct; the server floors the balance at 0. On success the resulting
 * balance is shown. All parse/validate/submit logic lives in ../mcoinGrant so
 * it is unit-tested without React.
 */
import { useState } from "react";
import { grantMCoin } from "../api";
import { formatBalance, submitGrant, type GrantResult } from "../mcoinGrant";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { GOLD, OK, TEXT_DIM, TEXT_MAIN } from "./theme";

export function MCoinGrantPage(): React.JSX.Element {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GrantResult | null>(null);

  async function apply(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await submitGrant({ accountId, amount }, grantMCoin);
    if (outcome.ok) {
      setResult(outcome.result);
      setAmount(""); // clear the delta; keep the account id for repeated grants
    } else {
      setError(outcome.error);
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="M幣 發放 · Grant M COIN">
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7, marginBottom: 14 }}>
          M幣（造型幣）改由後台發放，不再開放購買。輸入帳號 ID 與數量後發放；數量可為負數（扣除），伺服器會將餘額下限保護在 0。
          <br />
          M COIN is admin-granted (never purchased). Amount may be negative to deduct; the balance floors at 0.
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
    </div>
  );
}
