/**
 * 資料搬遷 — the whole-platform ZIP export/import console (task #243).
 *
 * THE PAGE'S ONE JOB, besides working: telling the truth about what it does.
 * An export is every family member's password hash and every unredeemed invite
 * code; an import can overwrite live accounts. So the header warning is
 * permanent and red, the three-step import flow refuses to skip its dry run,
 * and both dangerous actions ask for the operator's own password again.
 *
 * The prose and the pure helpers live in ../archive so they can be tested
 * without a DOM; this file is layout, state and network.
 */
import { useCallback, useEffect, useState } from "react";

import {
  archiveCommit,
  archiveDeleteBackup,
  archiveDiscardStage,
  archiveExport,
  archivePlan,
  archivePreview,
  archiveStage,
  archiveStatus,
} from "../api";
import {
  BACKUP_WARNING,
  FRESH_HOST_HELP,
  HEADER_WARNING,
  NOT_INCLUDED,
  PLAN_IS_THE_CONTRACT,
  RESOLVE_ADOPT_ARCHIVE,
  SECURITY_DELTA,
  adoptConsequence,
  commitPromise,
  backupSummary,
  deleteBackupConfirm,
  exportBlocker,
  formatBytes,
  importOutcome,
  notableItems,
  outcomeMatchesPlan,
  planTotals,
  retentionLine,
  selectedBytes,
  suggestedFileName,
  unresolvedCollisions,
  type ApplyResp,
  type ArchiveGroup,
  type CollectionPlan,
  type BackupInfo,
  type PlanResp,
  type PreviewResp,
  type StageResp,
  type StatusResp,
} from "../archive";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";

type Tab = "export" | "import" | "status";

// WORDING NOTE, and it is load-bearing: step 3's heading is 「確認匯入」, NOT
// 「確認寫入」. contentGate.test.ts asserts that 「確認寫入」 is absent from a
// production bundle because it belongs to the dev-only content editor; reusing
// it here would turn that guard red for an entirely unrelated reason and send
// the next person hunting a content-editor leak that does not exist.
// (It is also the more accurate label — this confirms an IMPORT.)

const OPTIONAL_GROUPS: ArchiveGroup[] = ["matches", "history", "audit", "replays"];

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function DataMigrationPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("export");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <HeaderWarning />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn kind={tab === "export" ? "primary" : "ghost"} onClick={() => setTab("export")}>
          匯出
        </Btn>
        <Btn kind={tab === "import" ? "primary" : "ghost"} onClick={() => setTab("import")}>
          匯入
        </Btn>
        <Btn kind={tab === "status" ? "primary" : "ghost"} onClick={() => setTab("status")}>
          狀態
        </Btn>
      </div>
      <ErrorBanner text={error} onDismiss={() => setError(null)} />
      {tab === "export" && <ExportTab onError={setError} />}
      {tab === "import" && <ImportTab onError={setError} />}
      {tab === "status" && <StatusTab onError={setError} />}
    </div>
  );
}

function HeaderWarning(): React.JSX.Element {
  return (
    <div
      style={{
        border: `1px solid ${DANGER}`,
        background: "#33161a",
        borderRadius: 12,
        padding: 16,
        color: TEXT_MAIN,
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
        ⚠️ 這是整個後台最危險的一頁
      </div>
      {HEADER_WARNING.slice(1).map((line) => (
        <p key={line} style={{ margin: "6px 0", fontSize: 13 }}>
          {line}
        </p>
      ))}
      <p style={{ margin: "10px 0 0", fontSize: 12, color: GOLD }}>{SECURITY_DELTA}</p>
    </div>
  );
}

// ---------------------------------------------------------------- 匯出 -------

function ExportTab(props: { onError: (m: string | null) => void }): React.JSX.Element {
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [selected, setSelected] = useState<Set<ArchiveGroup>>(new Set());
  const [password, setPassword] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    archivePreview().then(setPreview, (e) => props.onError(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (g: ArchiveGroup): void => {
    const next = new Set(selected);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setSelected(next);
  };

  const blocker = exportBlocker(preview, selected);

  const run = async (): Promise<void> => {
    setBusy(true);
    props.onError(null);
    try {
      const blob = await archiveExport([...selected], password);
      // The browser has to be told to save it; there is no server redirect.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedFileName(location.hostname, new Date());
      a.click();
      URL.revokeObjectURL(url);
      setDone(`已下載 ${a.download}（${formatBytes(blob.size)}）。已寫入稽核紀錄。`);
      setAsking(false);
      setPassword("");
    } catch (e) {
      props.onError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="要帶走什麼">
        {preview === null ? (
          <div style={{ color: TEXT_DIM, fontSize: 13 }}>計算中…</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {preview.groups.map((g) => {
              const core = g.group === "core";
              const on = core || selected.has(g.group);
              return (
                <label
                  key={g.group}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "24px 1fr auto",
                    gap: 10,
                    alignItems: "start",
                    padding: 10,
                    borderRadius: 8,
                    border: PANEL_BORDER,
                    cursor: core ? "default" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={core}
                    onChange={() => !core && toggle(g.group)}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {g.zh}
                      {core && <span style={{ color: TEXT_DIM, fontWeight: 400 }}>（一定帶，無法取消）</span>}
                    </div>
                    {g.note && (
                      <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.6 }}>
                        {g.note}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_DIM, whiteSpace: "nowrap" }}>
                    {g.entries} 檔 · {formatBytes(g.bytes)}
                  </div>
                </label>
              );
            })}
            <div style={{ fontSize: 12, color: TEXT_DIM }}>
              合計約 {formatBytes(selectedBytes(preview, selected))}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="沒有帶走的（刻意的）">
        <div style={{ display: "grid", gap: 8 }}>
          {NOT_INCLUDED.map((row) => (
            <div key={row.name} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10 }}>
              <div style={{ fontSize: 12, color: TEXT_MAIN, fontWeight: 600 }}>{row.name}</div>
              <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>{row.why}</div>
            </div>
          ))}
        </div>
      </Panel>

      {blocker && (
        <div style={{ color: WARN, fontSize: 13, lineHeight: 1.7 }}>{blocker}</div>
      )}

      {!asking ? (
        <div>
          <Btn kind="primary" disabled={blocker !== null || preview === null} onClick={() => setAsking(true)}>
            產生並下載 ZIP
          </Btn>
        </div>
      ) : (
        <Panel title="請輸入你自己的登入密碼確認">
          <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 10, lineHeight: 1.7 }}>
            這一步是刻意的。光有登入狀態不足以匯出全家人的密碼雜湊。
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <TextInput
              value={password}
              onChange={setPassword}
              type="password"
              autoFocus
              placeholder="你的登入密碼"
              style={{ maxWidth: 280 }}
            />
            <Btn kind="danger" disabled={busy || password === ""} onClick={() => void run()}>
              {busy ? "產生中…" : "確認匯出"}
            </Btn>
            <Btn onClick={() => setAsking(false)}>取消</Btn>
          </div>
        </Panel>
      )}

      {done && <div style={{ color: OK, fontSize: 13 }}>{done}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- 匯入 -------

function ImportTab(props: { onError: (m: string | null) => void }): React.JSX.Element {
  const [staged, setStaged] = useState<StageResp | null>(null);
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [adopt, setAdopt] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResp | null>(null);

  const upload = async (file: File): Promise<void> => {
    setBusy("上傳中…");
    props.onError(null);
    setPlan(null);
    setResult(null);
    try {
      setStaged(await archiveStage(file));
    } catch (e) {
      props.onError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const runPlan = useCallback(async (): Promise<void> => {
    if (staged === null) return;
    setBusy("試算中…");
    props.onError(null);
    try {
      setPlan(
        await archivePlan({
          stageId: staged.stage.id,
          allowOverwrite,
          resolveCollisions: adopt ? RESOLVE_ADOPT_ARCHIVE : "",
        }),
      );
    } catch (e) {
      props.onError(errText(e));
    } finally {
      setBusy(null);
    }
  }, [staged, allowOverwrite, adopt, props]);

  useEffect(() => {
    if (staged !== null) void runPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staged, allowOverwrite, adopt]);

  const commit = async (): Promise<void> => {
    if (staged === null || plan === null) return;
    setBusy("匯入中…");
    props.onError(null);
    try {
      const res = await archiveCommit({
        stageId: staged.stage.id,
        allowOverwrite,
        resolveCollisions: adopt ? RESOLVE_ADOPT_ARCHIVE : "",
        planDigest: plan.digest,
        confirmPassword: password,
      });
      setResult(res);
      setPassword("");
    } catch (e) {
      props.onError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="步驟 1／3　上傳封存檔">
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          style={{ color: TEXT_MAIN, fontSize: 13 }}
        />
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 8, lineHeight: 1.7 }}>
          上傳完不會寫入任何東西，只做完整檢查。任何一項不對就整包拒絕 ——
          半匯入的帳號資料比匯入失敗更糟。
        </div>
        {busy === "上傳中…" && <div style={{ color: TEXT_DIM, marginTop: 8 }}>上傳中…</div>}
        {staged && (
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.8, color: OK }}>
            ✅ 這包來自 <b>{staged.manifest.source.host}</b>，匯出於{" "}
            <b>{new Date(staged.manifest.exportedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</b>
            ，內容版本 <b>{staged.manifest.source.contentVersion || "（未標記）"}</b>。
            <br />
            {staged.manifest.totals.entries} 個檔案 ·{" "}
            {formatBytes(staged.manifest.totals.uncompressedBytes)} · 校驗碼相符。
            <br />
            <span style={{ color: TEXT_MAIN }}>目前還沒有寫入任何東西。</span>
          </div>
        )}
      </Panel>

      {plan && (
        <Panel title="步驟 2／3　試算（不會寫入）" right={<Btn small onClick={() => void runPlan()}>重新試算</Btn>}>
          <PlanTable plan={plan} />
          {plan.targetPopulated && (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${WARN}`,
                background: "#2c2110",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.8,
              }}
            >
              <b>⚠️ 這台主機上已經有資料。這不是「換主機」的情境，是「覆蓋現有主機」。</b>
              <br />
              預設不覆蓋任何既有文件 —— 上面「略過」那一欄就是會被保留的東西。
              <br />
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={allowOverwrite}
                  onChange={(e) => setAllowOverwrite(e.target.checked)}
                />
                <span>允許覆蓋既有資料（危險）</span>
              </label>
            </div>
          )}
          {unresolvedCollisions(plan).length > 0 && (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${DANGER}`,
                background: "#33161a",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.8,
              }}
            >
              <b>
                ⚠️ 使用者名稱／email{" "}
                {unresolvedCollisions(plan)
                  .map((c) => c.key)
                  .join("、")}{" "}
                在這台主機上已經被別的帳號佔用。
              </b>
              <br />
              這通常是因為你在新主機上先註冊了一個管理員帳號才來匯入。
              若不處理，匯入會做出「密碼正確、但登進去是空帳號」的結果，所以預設整包拒絕。
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} />
                <span>以封存為準</span>
              </label>
              <div style={{ color: TEXT_DIM, marginTop: 6 }}>
                {adoptConsequence(unresolvedCollisions(plan))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {plan && !plan.blocked && result === null && (
        <Panel title="步驟 3／3　確認匯入">
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <b>{commitPromise(plan)}</b>
            <br />
            寫入前會先自動備份這台主機現有的資料到 <code>data/_migration/backups/</code>。
            <b>備份失敗就不會寫入。</b>
            <br />
            <b style={{ color: WARN }}>
              注意：那一包備份跟匯出檔一樣含全部帳號與密碼雜湊，會留在這台主機上。
            </b>
            匯入完請到「狀態」分頁確認並自行刪除。
            <br />
            這個動作<b>不會刪除任何東西</b> —— 封存只做新增與（你勾選時的）覆蓋。
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 8, lineHeight: 1.8 }}>
            {PLAN_IS_THE_CONTRACT}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <TextInput
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="請再輸入一次你自己的登入密碼"
              style={{ maxWidth: 300 }}
            />
            <Btn kind="danger" disabled={busy !== null || password === ""} onClick={() => void commit()}>
              {busy === "匯入中…" ? "匯入中…" : "我確認，開始匯入"}
            </Btn>
          </div>
        </Panel>
      )}

      {plan?.blocked && (
        <div style={{ color: DANGER, fontSize: 13, lineHeight: 1.8 }}>
          這個試算被擋下，匯入按鈕不會出現。請先處理上面標示的項目。
        </div>
      )}

      {result && <ImportResult res={result} />}

      {staged && (
        <div>
          <Btn
            small
            onClick={() => {
              void archiveDiscardStage(staged.stage.id).then(
                () => {
                  setStaged(null);
                  setPlan(null);
                },
                (e) => props.onError(errText(e)),
              );
            }}
          >
            丟棄這包暫存
          </Btn>
        </div>
      )}

      <Panel title="全新主機該怎麼做？">
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.9 }}>
          {FRESH_HOST_HELP.map((line) =>
            line.startsWith("make ") ? (
              <pre
                key={line}
                style={{
                  background: "#10141f",
                  border: PANEL_BORDER,
                  borderRadius: 8,
                  padding: 10,
                  color: TEXT_MAIN,
                  overflowX: "auto",
                }}
              >
                {line}
              </pre>
            ) : (
              <p key={line} style={{ margin: "6px 0" }}>
                {line}
              </p>
            ),
          )}
        </div>
      </Panel>
    </div>
  );
}

// PlanTable renders the dry run. `items` arrives COMPLETE from the server (it is
// the list the commit executes), so the expansion shows the entries worth
// reading by default and offers the full listing behind a toggle — the operator
// can always see the whole contract, but 169 lines of 「新增」 never bury the one
// account being held back.
function PlanTable(props: { plan: PlanResp }): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const t = planTotals(props.plan);
  const shown = (c: CollectionPlan): { id: string; result: string; detail?: string }[] =>
    showAll ? (c.items ?? []) : notableItems(c);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: TEXT_DIM, textAlign: "right" }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>資料</th>
            <th style={{ padding: "4px 8px" }}>新增</th>
            <th style={{ padding: "4px 8px" }}>覆蓋</th>
            <th style={{ padding: "4px 8px" }}>相同</th>
            <th style={{ padding: "4px 8px" }}>略過</th>
            <th style={{ padding: "4px 8px" }}>擋下</th>
          </tr>
        </thead>
        <tbody>
          {props.plan.collections.map((c) => (
            <tr key={c.collection} style={{ borderTop: PANEL_BORDER, textAlign: "right" }}>
              <td style={{ textAlign: "left", padding: "6px 8px" }}>
                <button
                  onClick={() => setOpen(open === c.collection ? null : c.collection)}
                  style={{
                    background: "none",
                    border: "none",
                    color: shown(c).length > 0 ? ACCENT : TEXT_MAIN,
                    cursor: shown(c).length > 0 ? "pointer" : "default",
                    padding: 0,
                    fontSize: 13,
                  }}
                >
                  {c.zh || c.collection}
                  {shown(c).length > 0 && " ▸"}
                </button>
                {open === c.collection && (
                  <ul style={{ margin: "6px 0 0 12px", color: TEXT_DIM, fontSize: 12 }}>
                    {shown(c).map((it) => (
                      <li key={it.id}>
                        <code>{it.id}</code> — {it.result}
                        {it.detail ? `：${it.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td style={{ padding: "6px 8px" }}>{c.added}</td>
              <td style={{ padding: "6px 8px" }}>{c.written}</td>
              <td style={{ padding: "6px 8px" }}>{c.unchanged}</td>
              <td style={{ padding: "6px 8px", color: c.skipped > 0 ? WARN : undefined }}>{c.skipped}</td>
              <td style={{ padding: "6px 8px", color: c.blocked > 0 ? DANGER : undefined }}>{c.blocked}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 12, color: TEXT_DIM, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>
          合計 新增 {t.added} · 覆蓋 {t.written} · 相同 {t.unchanged} · 略過 {t.skipped} · 擋下 {t.blocked}
        </span>
        <button
          onClick={() => setShowAll(!showAll)}
          style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", padding: 0, fontSize: 12 }}
        >
          {showAll ? "只列出需要注意的項目" : "展開時列出每一筆文件"}
        </button>
      </div>
      {(props.plan.warnings ?? []).map((w) => (
        <div key={w} style={{ color: WARN, fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>
          {w}
        </div>
      ))}
    </div>
  );
}

function ImportResult(props: { res: ApplyResp }): React.JSX.Element {
  const kept = outcomeMatchesPlan(props.res);
  return (
    <Panel title="匯入完成">
      <div style={{ fontSize: 13, lineHeight: 1.9, color: kept ? OK : DANGER }}>
        {importOutcome(props.res)}
      </div>
      {!kept && (
        <div style={{ fontSize: 13, color: DANGER, marginTop: 6, lineHeight: 1.8 }}>
          ⚠️ 實際結果與試算不一致。請把這一頁的內容記下來並檢查
          <code> data/_migration/backups/ </code>
          裡的備份 —— 這代表匯入途中目標主機被改動了。
        </div>
      )}
      {props.res.backup && (
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6 }}>
          備份在 <code>{props.res.backup.path}</code>
        </div>
      )}
      {(props.res.notes ?? []).map((n) => (
        <div key={n} style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
          {n}
        </div>
      ))}
      {(props.res.warnings ?? []).map((w) => (
        <div key={w} style={{ fontSize: 12, color: WARN, marginTop: 6, lineHeight: 1.7 }}>
          {w}
        </div>
      ))}
    </Panel>
  );
}

// ---------------------------------------------------------------- 狀態 -------

function StatusTab(props: { onError: (m: string | null) => void }): React.JSX.Element {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const reload = useCallback(() => {
    archiveStatus().then(setStatus, (e) => props.onError(errText(e)));
  }, [props]);
  useEffect(reload, [reload]);

  if (status === null) return <div style={{ color: TEXT_DIM }}>載入中…</div>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="目前暫存" right={<Btn small onClick={reload}>重新整理</Btn>}>
        {status.stage === null ? (
          <div style={{ color: TEXT_DIM, fontSize: 13 }}>沒有暫存的封存。</div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <code>{status.stage.id.slice(0, 12)}…</code> · {formatBytes(status.stage.bytes)} ·
            上傳於 {new Date(status.stage.uploadedAt).toLocaleString()} ·
            {status.stageTtlHours} 小時後自動清除
            <div style={{ marginTop: 8 }}>
              <Btn
                small
                kind="danger"
                onClick={() =>
                  void archiveDiscardStage(status.stage!.id).then(reload, (e) => props.onError(errText(e)))
                }
              >
                丟棄
              </Btn>
            </div>
          </div>
        )}
      </Panel>

      <BackupsPanel status={status} reload={reload} onError={props.onError} />

      <Panel title="磁碟">
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.8 }}>
          可用空間：{status.freeKnown ? formatBytes(status.freeBytes) : "查不到（本平台會因此拒絕匯入）"}
          <br />
          回放目錄：<code>{status.replayDir}</code>
        </div>
      </Panel>
    </div>
  );
}

/**
 * 既有備份 — the panel blocker 3 exists for.
 *
 * Every import writes a full snapshot of this host, in the SAME format as the
 * export, which means every argon2id hash on the deploy. Before this panel the
 * operator had no way to see that those files existed, no idea how much they
 * held, and no way to remove one; the server now expires them on a policy, but
 * an automatic sweep the owner cannot see is not what he asked for. So: the
 * list, the total, the policy stated in the SERVER's own numbers, and a
 * two-press delete.
 */
function BackupsPanel(props: {
  status: StatusResp;
  reload: () => void;
  onError: (m: string | null) => void;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const backups = props.status.backups ?? [];

  const remove = async (b: BackupInfo): Promise<void> => {
    setBusy(b.stamp);
    props.onError(null);
    try {
      await archiveDeleteBackup(b.stamp);
      setConfirming(null);
      props.reload();
    } catch (e) {
      props.onError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="既有備份（含密碼雜湊）">
      <div
        style={{
          border: `1px solid ${WARN}`,
          background: "#2c2110",
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.8,
          marginBottom: 12,
        }}
      >
        {BACKUP_WARNING.map((line) => (
          <p key={line} style={{ margin: "4px 0" }}>
            {line}
          </p>
        ))}
        <p style={{ margin: "8px 0 0", color: TEXT_DIM }}>
          {retentionLine(props.status.backupRetention)}
        </p>
      </div>

      <div style={{ fontSize: 12, color: TEXT_MAIN, marginBottom: 8 }}>
        {backupSummary(backups, props.status.backupBytes ?? 0)}
      </div>

      {backups.length === 0 ? (
        <div style={{ color: TEXT_DIM, fontSize: 13 }}>還沒有備份。</div>
      ) : (
        <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
          {backups.map((b) => (
            <div key={b.stamp} style={{ borderTop: PANEL_BORDER, paddingTop: 8 }}>
              <div style={{ color: TEXT_MAIN }}>
                {new Date(b.createdAt).toLocaleString()} · {formatBytes(b.bytes)}
                {b.entries > 0 && ` · ${b.entries} 個檔案`}
                {b.empty && "（這台主機當時是空的）"}
              </div>
              {b.reason && (
                <div style={{ color: GOLD, marginTop: 4 }}>{b.reason}</div>
              )}
              <div style={{ color: TEXT_DIM, marginTop: 4 }}>
                <code>{b.path}</code>
              </div>
              <pre
                style={{
                  background: "#10141f",
                  border: PANEL_BORDER,
                  borderRadius: 8,
                  padding: 8,
                  marginTop: 6,
                  overflowX: "auto",
                  color: TEXT_DIM,
                }}
              >
                {`docker compose … exec -T platform /platformarchive apply -in - -data /data -content /srv/content -allow-overwrite < ${b.path}`}
              </pre>
              {confirming === b.stamp ? (
                <div
                  style={{
                    border: `1px solid ${DANGER}`,
                    background: "#33161a",
                    borderRadius: 8,
                    padding: 10,
                    marginTop: 6,
                    lineHeight: 1.8,
                  }}
                >
                  {deleteBackupConfirm(b, backups.length)}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Btn
                      small
                      kind="danger"
                      disabled={busy !== null}
                      onClick={() => void remove(b)}
                    >
                      {busy === b.stamp ? "刪除中…" : "確認刪除"}
                    </Btn>
                    <Btn small onClick={() => setConfirming(null)}>
                      取消
                    </Btn>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <Btn small onClick={() => setConfirming(b.stamp)}>
                    刪除
                  </Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
