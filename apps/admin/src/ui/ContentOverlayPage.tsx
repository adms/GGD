/**
 * 內容覆蓋層 — the page that makes #189 real on the deployed host.
 *
 * Three things live here, and the order is the point:
 *
 *   1. STATE — what is overlaid vs what the repo ships, per doc, with when and
 *      by whom. Requirement 6: the owner cannot debug what he cannot see.
 *   2. EDIT — load the shipped doc, change it, write it to the durable overlay.
 *      Requirement 1's missing producer: the store shipped with nothing that
 *      wrote to it.
 *   3. HISTORY — the generation log, which until now was written by the
 *      platform and read by nothing anywhere in the repo.
 *
 * UNLIKE ui/ContentPage.tsx this file is STATICALLY IMPORTED and ships in the
 * production bundle. That is deliberate and is not a hole in the dev gate: the
 * dev editor is absent from production because its writer targets the
 * loopback-only /content-api, which has no production route. This page's only
 * writer is the platform's admin-JWT + AdminOnly + audited overlay API. Two
 * different authorisation models, so two different pages.
 */
import { useCallback, useEffect, useState } from "react";
import {
  deleteOverlayDoc,
  getOverlayDocVersions,
  getOverlayLog,
  getOverlayStatus,
  getOverlayVersions,
  getShippedDoc,
  putOverlayDoc,
  restoreOverlayDoc,
  restoreOverlayVersion,
  revertOverlayDoc,
  type OverlayVersion,
  type OverlayVersionList,
} from "../api";
import {
  COMMON_COLLECTIONS,
  STATE_HINT,
  STATE_LABEL,
  STATE_TONE,
  emptyStatus,
  filterEntries,
  formatDoc,
  formatWhen,
  parseDocInput,
  shortHash,
  sortEntries,
  summaryLine,
  validateKeyInput,
  type OverlayLogLine,
  type OverlayStatus,
  type OverlayStatusEntry,
} from "../contentOverlay";
import { Badge, Btn, ConfirmDialog, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, DANGER, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

function toneColor(tone: "ok" | "warn" | "info"): string {
  return tone === "warn" ? WARN : tone === "ok" ? OK : TEXT_DIM;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function ContentOverlayPage(): React.JSX.Element {
  const [status, setStatus] = useState<OverlayStatus>(emptyStatus());
  const [log, setLog] = useState<OverlayLogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // editor state
  const [collection, setCollection] = useState("champions");
  const [docId, setDocId] = useState("");
  const [draft, setDraft] = useState("");
  const [shippedHash, setShippedHash] = useState("");
  const [shippedPresent, setShippedPresent] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "revert" | "tombstone"; entry: OverlayStatusEntry } | null
  >(null);

  // GH#326 —— 版本回滾。⚠️ 清單跟著上面那格「文件 id」走：填了就顯示**那一份
  // 真的變過**的版本（否則選單會塞滿一堆「跟現在一樣」的選項），空的就顯示整批。
  const [versions, setVersions] = useState<OverlayVersionList>({ entries: [] });

  const loadVersions = useCallback(async (): Promise<void> => {
    try {
      const key = docId.trim();
      setVersions(
        key === "" || collection.trim() === ""
          ? await getOverlayVersions()
          : await getOverlayDocVersions(collection.trim(), key),
      );
    } catch (err) {
      // ⚠️ 版本清單讀不到**不可以**把整頁擋掉 —— 它是附加能力，不是主功能。
      //    但也⛔不可以靜默:把原因放進 `unavailable`，畫面上會說出來。
      setVersions({ entries: [], unavailable: errText(err) });
    }
  }, [collection, docId]);

  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const [st, lg] = await Promise.all([getOverlayStatus(), getOverlayLog()]);
      setStatus(st);
      setLog(lg);
      setError(null);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  /** 整批還原到某一版。⭐ 伺服器會鑄一個新版本，所以這一步本身也還原得回來。 */
  const doRestoreAll = async (v: OverlayVersion): Promise<void> => {
    setBusy(true);
    try {
      await restoreOverlayVersion(v.hash);
      setNotice(`已把整份覆蓋層還原到 ${v.short}（${v.summary}）—— 這次還原本身是新的一版。`);
      setError(null);
      await refresh();
      await loadVersions();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  /** 只還原一份文件，其餘不動 —— 但一樣鑄一個新的批次版本。 */
  const doRestoreDoc = async (v: OverlayVersion): Promise<void> => {
    const bad = validateKeyInput(collection.trim(), docId.trim());
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    try {
      await restoreOverlayDoc(v.hash, collection.trim(), docId.trim());
      setNotice(`已把 ${collection.trim()}/${docId.trim()} 還原到 ${v.short}，其餘文件沒有動。`);
      setError(null);
      await refresh();
      await loadVersions();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const loadShipped = async (): Promise<void> => {
    const bad = validateKeyInput(collection.trim(), docId.trim());
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    try {
      const r = await getShippedDoc(collection.trim(), docId.trim());
      setShippedPresent(r.present);
      setShippedHash(r.hash);
      setDraft(r.present ? formatDoc(r.doc) : "{\n  \n}");
      setNotice(
        r.present
          ? `已載入出貨版 ${collection.trim()}/${docId.trim()}（hash ${shortHash(r.hash)}）`
          : "出貨版沒有這個 id — 儲存後會是一份「新增」文件",
      );
      setError(null);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const loadOverlaid = async (e: OverlayStatusEntry): Promise<void> => {
    setCollection(e.collection);
    setDocId(e.id);
    setShippedPresent(null);
    setShippedHash(e.shippedHash);
    setNotice(`已選取 ${e.key} — 按「載入出貨版」取得 repo 目前的內容`);
  };

  const save = async (): Promise<void> => {
    const bad = validateKeyInput(collection.trim(), docId.trim());
    if (bad) {
      setError(bad);
      return;
    }
    const parsed = parseDocInput(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const head = await putOverlayDoc(collection.trim(), docId.trim(), parsed.value);
      setNotice(
        `已寫入耐久覆蓋層（generation ${head.generation}）。` +
          "重開容器、重建 image、git pull 都不會消失。",
      );
      setError(null);
      await refresh();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const doConfirmed = async (): Promise<void> => {
    if (!confirm) return;
    const { kind, entry } = confirm;
    setConfirm(null);
    setBusy(true);
    try {
      if (kind === "revert") {
        await revertOverlayDoc(entry.collection, entry.id);
        setNotice(`${entry.key} 已還原為出貨版內容`);
      } else {
        await deleteOverlayDoc(entry.collection, entry.id);
        setNotice(`${entry.key} 已在合併後的內容樹中隱藏`);
      }
      setError(null);
      await refresh();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const rows = sortEntries(filterEntries(status.entries, query));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100 }}>
      <ErrorBanner text={error} onDismiss={() => setError(null)} />

      {/* ── 1. STATE ─────────────────────────────────────────────────────── */}
      <Panel
        title="內容覆蓋層 · 狀態"
        right={
          <Btn small onClick={() => void refresh()} disabled={busy}>
            重新整理
          </Btn>
        }
      >
        {status.degraded && (
          <div
            style={{
              border: `1px solid ${DANGER}`,
              background: "#3a1c1e",
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              fontSize: 12,
              color: "#f6b7b3",
              lineHeight: 1.7,
            }}
          >
            <b>覆蓋層檔案讀不出來，目前只提供出貨版內容。</b>
            <div>平台沒有因此掛掉，玩家玩得到 repo 的內容 — 但你的覆蓋暫時沒有生效。</div>
            <div style={{ fontFamily: MONO, marginTop: 6 }}>
              {status.degraded.reason}（{status.degraded.bytes} bytes）
            </div>
            <div style={{ marginTop: 6 }}>
              原始 bytes 已完整備份在 <code>{status.degraded.quarantine || "（備份失敗）"}</code>，沒有被刪掉。
              下一次成功寫入就會自動修復。
            </div>
          </div>
        )}

        <div style={{ fontSize: 14, color: TEXT_MAIN, marginBottom: 10 }}>{summaryLine(status)}</div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: TEXT_DIM }}>
          <span>generation <b style={{ color: TEXT_MAIN }}>{status.generation}</b></span>
          <span>fingerprint <span style={{ fontFamily: MONO }}>{status.fingerprint || "—"}</span></span>
          <span>最後更新 {formatWhen(status.updatedAt)}</span>
        </div>

        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: PANEL_BORDER,
            fontSize: 11,
            color: TEXT_DIM,
            lineHeight: 1.8,
          }}
        >
          <div>
            耐久檔案：<span style={{ fontFamily: MONO, color: TEXT_MAIN }}>{status.dataPath || "—"}</span>
          </div>
          <div>
            這個路徑在主機上是 <code>&lt;repo&gt;/data</code> 的 bind mount（compose 的{" "}
            <code>../data:/data</code>），不在 image 裡也不在 git 裡 —{" "}
            <b style={{ color: TEXT_MAIN }}>docker compose build &amp;&amp; up -d 與 git pull 都動不到它</b>。
          </div>
          <div>
            出貨內容樹：
            {status.shipped.available ? (
              <span style={{ fontFamily: MONO, color: TEXT_MAIN }}> {status.shipped.dir}</span>
            ) : (
              <span style={{ color: WARN }}>
                {" "}讀不到（{status.shipped.detail || "未設定"}）— 無法判斷任何一筆是否過期
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* ── 2. THE TABLE ─────────────────────────────────────────────────── */}
      <Panel
        title={`覆蓋清單 · ${status.entries.length} 筆`}
        right={
          <div style={{ width: 220 }}>
            <TextInput value={query} onChange={setQuery} placeholder="搜尋 id / 編輯者 / 狀態" />
          </div>
        }
      >
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.8 }}>
            {status.entries.length === 0
              ? "還沒有任何覆蓋。用下面的編輯器改一份文件，它就會寫進 data/ 並在重啟後還在。"
              : "沒有符合搜尋條件的項目。"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                  <th style={{ padding: "6px 8px" }}>文件</th>
                  <th style={{ padding: "6px 8px" }}>狀態</th>
                  <th style={{ padding: "6px 8px" }}>基準 → 出貨版</th>
                  <th style={{ padding: "6px 8px" }}>編輯時間 / 編輯者</th>
                  <th style={{ padding: "6px 8px" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const tone = STATE_TONE[e.state];
                  return (
                    <tr key={e.key} style={{ borderTop: PANEL_BORDER }}>
                      <td style={{ padding: "8px", fontFamily: MONO, color: TEXT_MAIN }}>
                        {e.key}
                        {e.tombstone && <span style={{ color: TEXT_DIM }}> （隱藏）</span>}
                      </td>
                      <td style={{ padding: "8px" }}>
                        <span title={STATE_HINT[e.state]}>
                          <Badge color={toneColor(tone)}>{STATE_LABEL[e.state]}</Badge>
                        </span>
                      </td>
                      <td style={{ padding: "8px", fontFamily: MONO, color: TEXT_DIM }}>
                        {shortHash(e.baseHash)} → {shortHash(e.shippedHash)}
                      </td>
                      <td style={{ padding: "8px", color: TEXT_DIM }}>
                        {formatWhen(e.editedAt)}
                        <div style={{ fontFamily: MONO }}>{e.editedBy || "—"}</div>
                      </td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap", textAlign: "right" }}>
                        <Btn small onClick={() => void loadOverlaid(e)} disabled={busy}>
                          選取
                        </Btn>{" "}
                        <Btn
                          small
                          onClick={() => setConfirm({ kind: "revert", entry: e })}
                          disabled={busy}
                          title="移除這筆覆蓋，改用 repo 出貨版"
                        >
                          還原
                        </Btn>{" "}
                        {!e.tombstone && (
                          <Btn
                            small
                            kind="danger"
                            onClick={() => setConfirm({ kind: "tombstone", entry: e })}
                            disabled={busy}
                            title="從合併後的內容樹隱藏這個 id"
                          >
                            隱藏
                          </Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {status.flaggedCount > 0 && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: PANEL_BORDER,
              fontSize: 11,
              color: TEXT_DIM,
              lineHeight: 1.8,
            }}
          >
            <b style={{ color: WARN }}>被標記的項目仍然生效中。</b>{" "}
            覆蓋層永遠贏過出貨版 — 就算 repo 後來改過同一份文件也一樣，因為悄悄丟掉你的編輯比讓你看到衝突更糟。
            要改用 repo 的版本，按該列的「還原」。
          </div>
        )}
      </Panel>

      {/* ── 3. THE EDITOR (the producer #189 was missing) ─────────────────── */}
      <Panel title="編輯 · 寫進耐久覆蓋層">
        {notice && (
          <div
            style={{
              border: `1px solid ${ACCENT}`,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
              fontSize: 12,
              color: TEXT_MAIN,
            }}
          >
            {notice}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <select
            value={collection}
            onChange={(ev) => setCollection(ev.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #2c3448",
              background: "#10141f",
              color: TEXT_MAIN,
              fontSize: 13,
            }}
          >
            {COMMON_COLLECTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div style={{ width: 260 }}>
            <TextInput value={docId} onChange={setDocId} placeholder="doc id（例：godie-e001.q）" />
          </div>
          <Btn onClick={() => void loadShipped()} disabled={busy}>
            載入出貨版
          </Btn>
          <Btn kind="primary" onClick={() => void save()} disabled={busy || draft.trim() === ""}>
            儲存到覆蓋層
          </Btn>
          {shippedPresent !== null && (
            <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: MONO }}>
              {shippedPresent ? `shipped ${shortHash(shippedHash)}` : "shipped: 無"}
            </span>
          )}
        </div>
        <textarea
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          rows={18}
          spellCheck={false}
          placeholder="按「載入出貨版」取得 repo 目前的內容，改完再儲存。"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #2c3448",
            background: "#10141f",
            color: TEXT_MAIN,
            fontSize: 12,
            fontFamily: MONO,
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>
          儲存不會動到 <code>content/</code>（主機上那是唯讀掛載，也是 git 的檔案）。文件會存進{" "}
          <code>data/content-overlay/</code>，並在啟動時疊在出貨版上。
          平台會在此刻記下出貨版的 hash 作為比對基準，之後 repo 若改了同一份文件，這一列就會變成「出貨版已更新」。
        </div>
      </Panel>

      {/* ── 4. HISTORY ───────────────────────────────────────────────────── */}
      <Panel title={`變更紀錄 · 最近 ${log.length} 筆`}>
        {log.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>近兩週沒有覆蓋層變更。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {log.map((l, i) => (
                  <tr key={`${l.generation}-${i}`} style={{ borderTop: i === 0 ? undefined : PANEL_BORDER }}>
                    <td style={{ padding: "6px 8px", color: TEXT_DIM, whiteSpace: "nowrap" }}>
                      {formatWhen(l.at)}
                    </td>
                    <td style={{ padding: "6px 8px", color: TEXT_MAIN }}>#{l.generation}</td>
                    <td style={{ padding: "6px 8px", color: TEXT_MAIN }}>{l.op}</td>
                    <td style={{ padding: "6px 8px", fontFamily: MONO, color: TEXT_MAIN }}>{l.key}</td>
                    <td style={{ padding: "6px 8px", fontFamily: MONO, color: TEXT_DIM }}>{l.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: TEXT_DIM }}>
          每一筆寫入同時也會留在 Audit log（<code>content-overlay.put / delete / revert</code>）。
        </div>
      </Panel>

      {/* ── 5. 版本回滾（GH#326）────────────────────────────────────────── */}
      <Panel title="版本回滾 · 往前 n 版">
        <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 10 }}>
          每一次儲存都留下一版（go-git，存在 <code>data/content-overlay/.git</code>）。
          <b style={{ color: TEXT_MAIN }}>還原會鑄一個新版本</b>，⛔ 不是把指標倒回去 ——
          所以「線上現在跑的是哪一版」永遠只有一個答案，而且還原本身也還原得回來。
          {docId.trim() !== "" && (
            <>
              {" "}目前輸入的是 <code>{collection}/{docId}</code>，
              下面的清單會只顯示<b style={{ color: TEXT_MAIN }}>那一份文件真的變過</b>的版本。
            </>
          )}
        </div>

        {versions.unavailable !== undefined && versions.unavailable !== "" && (
          <div style={{ fontSize: 12, color: "#E08A5A", marginBottom: 8 }}>
            ⚠️ 版本歷史目前讀不到：{versions.unavailable}
            <br />
            （⛔ 這不等於「沒有歷史」—— 存檔本身仍然成功，只是這次沒留下版本。）
          </div>
        )}

        {versions.entries.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>還沒有任何版本 —— 存一次就會有。</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {versions.entries.map((v, i) => (
                  <tr key={v.hash} style={{ borderTop: i === 0 ? undefined : PANEL_BORDER }}>
                    <td style={{ padding: "6px 8px", color: TEXT_DIM, whiteSpace: "nowrap" }}>
                      {formatWhen(v.at)}
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: MONO, color: TEXT_MAIN }}>
                      {v.short}
                    </td>
                    <td style={{ padding: "6px 8px", color: TEXT_MAIN }}>
                      {v.summary}
                      {v.current && <Badge color={toneColor("ok")}>現行</Badge>}
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: MONO, color: TEXT_DIM }}>{v.by}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {!v.current && (
                        <>
                          <Btn onClick={() => void doRestoreAll(v)} disabled={busy}>
                            整批還原
                          </Btn>
                          {docId.trim() !== "" && (
                            <Btn onClick={() => void doRestoreDoc(v)} disabled={busy}>
                              只還原 {docId}
                            </Btn>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "revert" ? "還原為出貨版？" : "從內容樹隱藏？"}
          body={
            confirm.kind === "revert" ? (
              <>
                <code>{confirm.entry.key}</code> 的覆蓋會被移除，玩家會看到 repo 出貨版的內容。
                這筆編輯不會再生效。
              </>
            ) : (
              <>
                <code>{confirm.entry.key}</code> 會從合併後的內容樹整份消失，
                <b>連 repo 出貨版也會被蓋掉</b>。想改用 repo 版本請按「還原」而不是這個。
              </>
            )
          }
          confirmLabel={confirm.kind === "revert" ? "還原" : "隱藏"}
          danger={confirm.kind === "tombstone"}
          onConfirm={() => void doConfirmed()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
