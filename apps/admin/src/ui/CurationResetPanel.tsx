/**
 * ⚠️ 危險操作 — the 內容白名單 page's destructive corner.
 *
 * WHY THE BUTTON LIVES ON THIS PAGE. 內容白名單 is already the page that can
 * remove content: 「全部停用」 (`disableAll` → a real `disable` list on the bulk
 * endpoint) has shipped here since task #4. So 「回到原廠設定」 is the missing
 * cell on a grid this page already owns — 聯集 / 全開 / 清空 / **取代** — and
 * putting it here leaves Quick Approval's UNION-ONLY contract untouched, word
 * for word. Moving it there would have meant rewriting that page's核心保證
 * (「這一頁只會加入，永遠不會替你移除任何已啟用的內容」), which is worth more
 * than the convenience of one shared button.
 *
 * WHY BOTH BUTTONS ARE FOLDED AWAY. 全部停用 sat in the same toolbar row as
 * 全選篩選結果, one `window.confirm` away from emptying the whitelist. Adding a
 * second removing action next to it would have doubled the mis-click surface,
 * so both moved into this collapsed section instead.
 *
 * NOTHING IN THIS FILE IS A HARD-CODED ANSWER. Every count, every name and
 * every red flag is computed in ../curationReset.ts from two live reads taken
 * when the panel opens. On 2026-08-02 the champion delta happened to be ten
 * 變身態 whose base bodies stay enabled, i.e. a visual no-op in champ-select —
 * a fact about today's whitelist, not a property of the button.
 */
import { useCallback, useState } from "react";
import {
  getStarterSet,
  getWhitelist,
  listWhitelistSnapshots,
  resetWhitelist,
  restoreWhitelistSnapshot,
  type WhitelistSnapshot,
} from "../api";
import { CONTENT_BASE, loadDocsByIds } from "../content";
import { KIND_LABEL, type Kind, type WhitelistDoc } from "../curation";
import {
  buildExpect,
  buildResetPlan,
  canProceed,
  confirmSummary,
  defaultSelection,
  halfEnabledAfterReset,
  legendaryItemsOff,
  parseLootTableItemIds,
  requiresTypedConfirm,
  selectedScopes,
  totalOff,
  totalOn,
  typedConfirmOk,
  visibleHeroLosses,
  type ChampionOffRow,
  type ResetKind,
  type ResetPlan,
} from "../curationReset";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { DANGER, GOLD, OK, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

interface Loaded {
  live: WhitelistDoc;
  starter: { champions: string[]; items: string[]; abilities: string[] };
  plan: ResetPlan;
  legendaryPool: string[];
}

interface Applied {
  scopes: string[];
  off: number;
  on: number;
  snapshotId: string;
  doc: WhitelistDoc;
  restored: boolean;
}

const CLASS_LABEL: Record<ChampionOffRow["cls"], string> = {
  "form-base-kept": "變身態（本體仍啟用 — 玩家看不到差別）",
  "form-base-lost": "⛔ 變身態，而它的本體也不在原廠組合裡 — 這名英雄會整個消失",
  "real-hero": "⛔ 本體英雄 — 會從選人畫面消失",
};

function Row(props: { children: React.ReactNode; tone?: "danger" | "warn" | "dim" }): React.JSX.Element {
  const color = props.tone === "danger" ? DANGER : props.tone === "warn" ? WARN : TEXT_DIM;
  return (
    <div style={{ fontSize: 11, color, lineHeight: 1.8, paddingLeft: 14 }}>{props.children}</div>
  );
}

export function CurationResetPanel(props: {
  /** Unsaved draft edits exist — resetting would silently discard them. */
  dirty: boolean;
  /** 全部停用, moved in here from the main toolbar. */
  onDisableAll: () => void;
  /** Called with the server's fresh document after a reset or a restore. */
  onApplied: (doc: WhitelistDoc) => void;
  busy?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<Set<ResetKind>>(defaultSelection());
  const [expand, setExpand] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [working, setWorking] = useState(false);

  /**
   * Recompute from the server. Called on open and by 「重新計算」 — the panel
   * never shows a number it read at page load.
   */
  const recompute = useCallback(async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    try {
      const [live, starter] = await Promise.all([getWhitelist(), getStarterSet()]);
      const plan0 = buildResetPlan({ live, starter });
      // Names for the champions that would be turned off — a few fetches, not
      // the whole 113-doc collection.
      const docs = await loadDocsByIds("champions", plan0.byKind.champions.off);
      const names = new Map<string, string>();
      for (const [id, raw] of docs) {
        const n = (raw as { name?: unknown } | null)?.name;
        if (typeof n === "string" && n !== "") names.set(id, n);
      }
      let legendaryPool: string[] = [];
      try {
        const resp = await fetch(`${CONTENT_BASE}/loot-tables/legendary-weapons.json`);
        if (resp.ok) legendaryPool = parseLootTableItemIds(await resp.json());
      } catch {
        // The legendary cross-check degrades to "unknown"; it never blocks.
      }
      setLoaded({
        live,
        starter,
        plan: buildResetPlan({ live, starter, championNames: names }),
        legendaryPool,
      });
    } catch (e) {
      setErr(`讀取失敗：${e instanceof Error ? e.message : String(e)}（GET /curation/whitelist 與 …/starter）`);
      setLoaded(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const start = (): void => {
    setApplied(null);
    setTyped("");
    setSelected(defaultSelection());
    void recompute();
  };

  const apply = async (): Promise<void> => {
    if (loaded === null) return;
    setWorking(true);
    setErr(null);
    try {
      const scopes = selectedScopes(selected);
      const res = await resetWhitelist({
        scopes,
        expect: buildExpect(loaded.plan, selected),
      });
      setApplied({
        scopes: res.scopes,
        off: totalOff(loaded.plan, selected),
        on: totalOn(loaded.plan, selected),
        snapshotId: res.snapshotId ?? "",
        doc: res.whitelist,
        restored: false,
      });
      props.onApplied(res.whitelist);
      setConfirming(false);
      setLoaded(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(
        msg.includes("confirm_mismatch") || msg.includes("過期")
          ? `${msg}\n（有人在你確認的期間改了白名單。按「重新計算」再看一次。）`
          : `重設失敗：${msg}`,
      );
      setConfirming(false);
      void recompute();
    } finally {
      setWorking(false);
    }
  };

  const undo = async (snapshotId: string): Promise<void> => {
    setWorking(true);
    setErr(null);
    try {
      const { doc } = await restoreWhitelistSnapshot(snapshotId);
      props.onApplied(doc);
      setApplied((a) => (a === null ? a : { ...a, restored: true, doc }));
    } catch (e) {
      setErr(`還原失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setWorking(false);
    }
  };

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            color: TEXT_DIM,
            background: "transparent",
            border: `1px dashed ${DANGER}`,
          }}
        >
          ⚠️ 危險操作（會移除已啟用的內容）▸
        </button>
      </div>
    );
  }

  const plan = loaded?.plan ?? null;
  const heroLosses = plan ? visibleHeroLosses(plan, selected) : [];
  const halfEnabled =
    loaded && plan ? halfEnabledAfterReset(loaded.live, loaded.starter, selected) : [];
  const legendaryOff = loaded && plan ? legendaryItemsOff(plan, loaded.legendaryPool) : [];
  const off = plan ? totalOff(plan, selected) : 0;
  const on = plan ? totalOn(plan, selected) : 0;

  return (
    <Panel
      title="⚠️ 危險操作 · Destructive actions"
      right={
        <button
          onClick={() => setOpen(false)}
          style={{ fontSize: 11, color: TEXT_DIM, background: "none", border: "none", cursor: "pointer" }}
        >
          收合 ▴
        </button>
      }
    >
      <ErrorBanner text={err} onDismiss={() => setErr(null)} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small kind="danger" onClick={props.onDisableAll} disabled={props.busy}>
          全部停用
        </Btn>
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          清成「全新安裝」的空白名單。想回到出貨的預設組合請用右邊那個，不要用這個。
        </span>
        <div style={{ flex: 1 }} />
        <Btn small kind="danger" onClick={start} disabled={props.busy || loading || working}>
          {loading ? "計算中…" : "回到原廠設定…"}
        </Btn>
      </div>

      {props.dirty && (
        <div style={{ marginTop: 10, fontSize: 12, color: WARN, lineHeight: 1.7 }}>
          你有<strong>未儲存的變更</strong>。重設直接寫入伺服器，你的草稿會被覆蓋 — 請先「儲存」或「放棄變更」。
        </div>
      )}

      {applied !== null && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.8,
            color: TEXT_MAIN,
            background: "#14251a",
            border: `1px solid ${OK}`,
          }}
        >
          <b style={{ color: OK }}>
            {applied.restored ? "✓ 已還原到重設前的白名單" : "✓ 已回到原廠設定"}
          </b>
          <br />
          範圍：{applied.scopes.map((s) => KIND_LABEL[s as Kind] ?? s).join("、")}； 關掉 {applied.off} 個、打開{" "}
          {applied.on} 個。
          <br />
          現在的白名單：英雄 {applied.doc.champions.length}、道具 {applied.doc.items.length}、技能{" "}
          {applied.doc.abilities.length}。<b>玩家下一場就吃到；進行中的對戰不受影響。</b>
          {applied.snapshotId !== "" && !applied.restored && (
            <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: TEXT_DIM }}>
                重設前的白名單已存成快照 <code>{applied.snapshotId}</code>。
              </span>
              <Btn small onClick={() => void undo(applied.snapshotId)} disabled={working}>
                ↩ 還原成重設前
              </Btn>
            </div>
          )}
        </div>
      )}

      {plan !== null && plan.refuse !== null && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.8,
            color: TEXT_MAIN,
            background: "#2a1416",
            border: `1px solid ${DANGER}`,
          }}
        >
          <b style={{ color: DANGER }}>
            ⛔ 讀到空的原廠組合（{plan.refuse.kinds.map((k) => KIND_LABEL[k]).join("、")}）。沒有做任何變更。
          </b>
          <br />
          空的原廠組合會把白名單清成 0，選人畫面會整個空掉（2026-08-01 出過這個事故）。
          請先確認 platform 版本，再按「重新計算」。伺服器端也會拒絕執行，這裡只是提早告訴你。
        </div>
      )}

      {plan !== null && plan.refuse === null && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_MAIN, fontWeight: 700 }}>
            回到原廠設定 — 把白名單<strong>取代</strong>成版本控管的 starter 組合（不是聯集）
          </div>

          {(["champions", "items", "abilities"] as ResetKind[]).map((kind) => {
            const k = plan.byKind[kind];
            const checked = selected.has(kind);
            return (
              <div
                key={kind}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: PANEL_BORDER,
                  background: checked ? "#161d2e" : "transparent",
                }}
              >
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (next.has(kind)) next.delete(kind);
                        else next.add(kind);
                        return next;
                      })
                    }
                  />
                  <b style={{ color: TEXT_MAIN }}>{KIND_LABEL[kind]}</b>
                  <span style={{ color: TEXT_DIM, fontSize: 12 }}>
                    {k.liveCount} → {k.starterCount}
                  </span>
                  <span style={{ color: k.off.length > 0 ? WARN : TEXT_DIM, fontSize: 12 }}>
                    關掉 {k.off.length}
                  </span>
                  <span style={{ color: k.on.length > 0 ? OK : TEXT_DIM, fontSize: 12 }}>
                    · 打開 {k.on.length}
                  </span>
                </label>

                {kind === "champions" && k.off.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {plan.championsOff.filter((r) => r.cls === "form-base-kept").length > 0 && (
                      <Row>
                        · 變身態 {plan.championsOff.filter((r) => r.cls === "form-base-kept").length} 隻 —
                        本體都還開著，選人畫面看不到差別{" "}
                        <button
                          onClick={() =>
                            setExpand((s) => {
                              const n = new Set(s);
                              if (n.has("forms")) n.delete("forms");
                              else n.add("forms");
                              return n;
                            })
                          }
                          style={{ fontSize: 11, color: TEXT_DIM, background: "none", border: "none", cursor: "pointer" }}
                        >
                          ▸ 展開
                        </button>
                      </Row>
                    )}
                    {expand.has("forms") &&
                      plan.championsOff
                        .filter((r) => r.cls === "form-base-kept")
                        .map((r) => (
                          <Row key={r.id}>
                            　{r.name} <code>{r.id}</code> → 本體 <code>{r.baseId}</code> ✓仍啟用
                            {!r.named && <span style={{ color: WARN }}>（讀不到名稱）</span>}
                          </Row>
                        ))}
                    {heroLosses.length > 0 ? (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "#2a1416",
                          border: `1px solid ${DANGER}`,
                        }}
                      >
                        <Row tone="danger">
                          <b>⛔ 會從選人畫面消失的英雄：{heroLosses.length} 隻</b>
                        </Row>
                        {heroLosses.map((r) => (
                          <Row key={r.id} tone="danger">
                            　{r.name} <code>{r.id}</code> — {CLASS_LABEL[r.cls]}
                          </Row>
                        ))}
                      </div>
                    ) : (
                      <Row>· 本體英雄 0 隻</Row>
                    )}
                  </div>
                )}

                {kind === "items" && (
                  <div style={{ marginTop: 6 }}>
                    <Row tone="warn">
                      ⚠️ 這一欄會動到你手動開過的道具，而且是<strong>雙向</strong>的（會關掉 {k.off.length}
                      、也會打開 {k.on.length}）。
                    </Row>
                    <Row tone={legendaryOff.length > 0 ? "danger" : undefined}>
                      · 會關掉的裡面，目前傳說池（legendary-weapons.json）成員：
                      <b>{loaded && loaded.legendaryPool.length === 0 ? "讀不到傳說池" : `${legendaryOff.length} 個`}</b>
                      {legendaryOff.length > 0 && <>　{legendaryOff.join("、")}</>}
                    </Row>
                    {k.on.length > 0 && <Row>· 會打開：{k.on.slice(0, 12).join("、")}{k.on.length > 12 ? " …" : ""}</Row>}
                  </div>
                )}

                {kind === "abilities" && (
                  <div style={{ marginTop: 6 }}>
                    {halfEnabled.length > 0 ? (
                      <Row tone="danger">
                        <b>⛔ 重設後會出現半啟用英雄：{halfEnabled.length} 位</b>
                        {halfEnabled.slice(0, 8).map((h) => (
                          <span key={h.id}>
                            <br />　{h.id} 缺 {h.missing.join("、")}
                          </span>
                        ))}
                        {halfEnabled.length > 8 && <br />}
                        {halfEnabled.length > 8 && `　…還有 ${halfEnabled.length - 8} 位`}
                      </Row>
                    ) : (
                      <Row>· 重設後會出現半啟用英雄：0 位</Row>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.7 }}>
            這些數字是<strong>剛剛</strong>跟伺服器要的（<code>GET /curation/whitelist</code> +{" "}
            <code>/curation/whitelist/starter</code>），不是寫死的清單。變身態判定用的是出貨的{" "}
            <code>championForms</code> 表。
            <button
              onClick={() => void recompute()}
              disabled={loading}
              style={{ marginLeft: 8, fontSize: 11, color: GOLD, background: "none", border: "none", cursor: "pointer" }}
            >
              重新計算
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn small onClick={() => setLoaded(null)}>
              取消
            </Btn>
            <Btn
              small
              kind="danger"
              onClick={() => {
                setTyped("");
                setConfirming(true);
              }}
              disabled={!canProceed(plan, selected) || working}
            >
              我看過了，繼續 →
            </Btn>
          </div>
        </div>
      )}

      {confirming && plan !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div
            style={{
              background: PANEL_BG,
              border: `1px solid ${DANGER}`,
              borderRadius: 12,
              padding: 20,
              width: 520,
              maxWidth: "92vw",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: TEXT_MAIN, marginBottom: 10 }}>
              最後確認：把白名單取代成原廠設定
            </div>
            <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.9 }}>
              {confirmSummary(plan, selected)}
              <br />
              其中會從選人畫面消失的英雄：
              <b style={{ color: heroLosses.length > 0 ? DANGER : TEXT_MAIN }}>{heroLosses.length} 隻</b>
              {selected.has("champions") && (
                <>
                  ；另外{" "}
                  {plan.championsOff.filter((r) => r.cls === "form-base-kept").length} 隻是變身態，本體都還開著。
                </>
              )}
              <br />
              重設後會出現半啟用英雄：
              <b style={{ color: halfEnabled.length > 0 ? DANGER : TEXT_MAIN }}>{halfEnabled.length} 位</b>。
              <br />
              <br />
              <b style={{ color: TEXT_MAIN }}>玩家下一場就吃到新的白名單</b>（進行中的對戰不受影響）。
              這個動作<b style={{ color: TEXT_MAIN }}>會覆蓋</b>你在這一頁手動開過、但原廠組合裡沒有的項目；
              重設前的白名單會存成快照，可以一鍵還原。
              {requiresTypedConfirm(plan, selected) ? (
                <>
                  <br />
                  <br />
                  要繼續，請在下面輸入 <b style={{ color: GOLD }}>{off}</b>（上面那個「會關掉的項目數」）：
                  <div style={{ marginTop: 8, maxWidth: 200 }}>
                    <TextInput value={typed} onChange={setTyped} placeholder={String(off)} />
                  </div>
                </>
              ) : (
                <>
                  <br />
                  <br />
                  這個範圍<b style={{ color: OK }}>只會打開 {on} 個</b>、不會關掉任何東西。
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <Btn onClick={() => setConfirming(false)}>取消</Btn>
              <Btn
                kind="danger"
                onClick={() => void apply()}
                disabled={!typedConfirmOk(plan, selected, typed) || working}
              >
                {working
                  ? "執行中…"
                  : off > 0
                    ? `關掉 ${off} 個項目，回到原廠設定`
                    : `打開 ${on} 個項目，回到原廠設定`}
              </Btn>
            </div>
          </div>
        </div>
      )}

      <SnapshotList />
    </Panel>
  );
}

/** The undo points, loaded on demand. */
function SnapshotList(): React.JSX.Element {
  const [rows, setRows] = useState<WhitelistSnapshot[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (rows === null) {
    return (
      <div style={{ marginTop: 12, fontSize: 11 }}>
        <button
          onClick={() => {
            listWhitelistSnapshots()
              .then(setRows)
              .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
          }}
          style={{ fontSize: 11, color: TEXT_DIM, background: "none", border: "none", cursor: "pointer" }}
        >
          ▸ 顯示可還原的快照
        </button>
        {err !== null && <span style={{ color: WARN, marginLeft: 8 }}>{err}</span>}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12, fontSize: 11, color: TEXT_DIM, lineHeight: 1.8 }}>
      <b>可還原的快照（{rows.length}）</b>
      {rows.length === 0 && <div>還沒有任何快照 — 快照只在重設／還原時產生。</div>}
      {rows.map((s) => (
        <div key={s.id}>
          <code>{s.id}</code> · {s.reason} · 英雄 {s.counts["champions"] ?? 0}、道具{" "}
          {s.counts["items"] ?? 0}、技能 {s.counts["abilities"] ?? 0}
        </div>
      ))}
    </div>
  );
}
