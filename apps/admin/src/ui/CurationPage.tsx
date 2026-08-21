/**
 * 內容白名單 (content whitelist) page — the ONLY place content becomes
 * playable. The imported map is far too large to ship wholesale, so every
 * whitelist starts EMPTY and an operator enables what the game may use here.
 *
 * Three tabs (英雄 / 道具 / 技能) list every authored doc with its w3x icon,
 * a search box, an enabled/disabled filter, multi-select (click, shift-range,
 * select-all-filtered), bulk enable/disable, a live 已啟用/共 counter and a Save
 * that re-reads the doc and verifies it before reporting success.
 *
 * TWO DOORS LEAD TO THE SAME VERSION-CONTROLLED STARTER BUNDLE, and the
 * difference between them is the whole safety story:
 *
 *   ⭐ 啟用示範組合   UNION — merges the bundle into the draft, removes nothing.
 *                      Safe by construction; a fresh install is never dead.
 *   ⚠️ 回到原廠設定   REPLACE — makes the selected kinds EQUAL the bundle, so
 *                      anything enabled that the bundle does not carry is turned
 *                      OFF. Lives in the collapsed 危險操作 section with two
 *                      different confirmations and a pre-change snapshot; the
 *                      write itself is a server-side plan
 *                      (POST /curation/whitelist/reset), not a draft merge.
 *
 * All list/selection/counter/starter/diff logic lives in ../curation.ts and the
 * reset plan in ../curationReset.ts as pure functions (unit-tested); this file
 * is presentation + wiring only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStarterSet, getWhitelist, saveWhitelist } from "../api";
import { contentAssetUrl, loadCollection } from "../content";
import {
  EMPTY_SELECTION,
  FILTER_LABEL,
  KINDS,
  KIND_LABEL,
  clickRow,
  countKind,
  describeDiff,
  diffDoc,
  disableAll,
  emptyWhitelist,
  enableAll,
  enabledSet,
  filterRows,
  mergeStarter,
  pruneSelection,
  setEnabled,
  toggleId,
  toggleSelectAll,
  type ContentRow,
  type EnabledFilter,
  type Kind,
  type Selection,
  type WhitelistDoc,
} from "../curation";
import { CurationResetPanel } from "./CurationResetPanel";
import { CurationTransformPanel } from "./CurationTransformPanel";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

type RowsByKind = Record<Kind, ContentRow[]>;

const NO_ROWS: RowsByKind = { champions: [], items: [], abilities: [] };

/** w3x icon thumbnail; renders nothing when the doc has no icon or it 404s. */
function Thumb(props: { icon?: string; alt: string; size?: number }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const size = props.size ?? 28;
  const src = failed ? null : contentAssetUrl(props.icon);
  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          flex: "0 0 auto",
          borderRadius: 5,
          border: "1px dashed #2c3448",
          opacity: 0.5,
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={props.alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, flex: "0 0 auto", borderRadius: 5, objectFit: "cover" }}
    />
  );
}

export function CurationPage(): React.JSX.Element {
  const [tab, setTab] = useState<Kind>("champions");
  const [rows, setRows] = useState<RowsByKind>(NO_ROWS);
  const [loadingKind, setLoadingKind] = useState<Kind | null>(null);
  const [contentErr, setContentErr] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<string | null>(null);

  const [server, setServer] = useState<WhitelistDoc>(emptyWhitelist());
  const [draft, setDraft] = useState<WhitelistDoc>(emptyWhitelist());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EnabledFilter>("all");
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  // keep the loaded-collection cache out of the render loop
  const loaded = useRef<Set<Kind>>(new Set());

  const ensureLoaded = useCallback(async (kind: Kind): Promise<ContentRow[]> => {
    if (loaded.current.has(kind)) return rows[kind];
    setLoadingKind(kind);
    try {
      const out = await loadCollection(kind, {
        onProgress: (partial) => setRows((prev) => ({ ...prev, [kind]: partial })),
      });
      loaded.current.add(kind);
      setRows((prev) => ({ ...prev, [kind]: out }));
      return out;
    } catch (err) {
      setContentErr(
        `無法讀取 /content/${kind}/_index.json（${err instanceof Error ? err.message : String(err)}）— ` +
          "清單改以純文字/id 顯示。dev 請確認 admin vite 的 /content 掛載，prod 請確認 nginx。",
      );
      return [];
    } finally {
      setLoadingKind(null);
    }
  }, [rows]);

  // boot: whitelist doc + the first tab's collection
  useEffect(() => {
    void (async () => {
      try {
        const doc = await getWhitelist();
        setServer(doc);
        setDraft(doc);
      } catch (err) {
        setApiErr(
          `讀取白名單失敗：${err instanceof Error ? err.message : String(err)}（平台 API 尚未提供 /curation/whitelist？）`,
        );
      }
      await ensureLoaded("champions");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTab = (kind: Kind): void => {
    setTab(kind);
    setQuery("");
    setFilter("all");
    setSel(EMPTY_SELECTION);
    void ensureLoaded(kind);
  };

  const kindRows = rows[tab];
  const enabled = useMemo(() => enabledSet(draft, tab), [draft, tab]);
  const shown = useMemo(
    () => filterRows(kindRows, query, filter, enabled),
    [kindRows, query, filter, enabled],
  );
  const visibleIds = useMemo(() => shown.map((r) => r.id), [shown]);
  const counts = useMemo(() => countKind(kindRows, enabled, shown), [kindRows, enabled, shown]);
  const diffs = useMemo(() => diffDoc(server, draft), [server, draft]);
  const dirty = diffs.length > 0;
  const selectedVisible = useMemo(() => pruneSelection(sel, visibleIds).ids, [sel, visibleIds]);

  const bulk = (enable: boolean): void => {
    if (selectedVisible.length === 0) return;
    setDraft((d) => setEnabled(d, tab, selectedVisible, enable));
    setFlash(null);
  };

  /**
   * ⭐ 啟用示範組合 — preview the PLATFORM's demo starter bundle into the draft.
   *
   * The bundle is server-owned (apps/platform/internal/curation/starter.go) and
   * fetched from GET /curation/whitelist/starter, so the console, the
   * `seed -starter` binary and `make seed-demo` all install the exact same
   * hand-picked, content-verified set. (This used to be a local first-10-by-id
   * heuristic, which quietly produced a DIFFERENT set than the platform's.)
   *
   * Merging into the draft rather than POSTing keeps the existing review flow:
   * the operator sees the diff and presses 儲存 to commit.
   */
  const onStarter = async (): Promise<void> => {
    setBusy(true);
    setFlash(null);
    setApiErr(null);
    try {
      const starter = await getStarterSet();
      if (starter.champions.length === 0) {
        setFlash({ ok: false, text: "平台回傳的示範組合是空的 — 請確認 platform 版本。" });
        return;
      }
      setDraft((d) => mergeStarter(d, starter));
      setFlash({
        ok: true,
        text: `已加入示範組合：英雄 ${starter.champions.length}、道具 ${starter.items.length}、技能 ${starter.abilities.length} — 請按「儲存」寫入。`,
      });
    } catch (err) {
      setApiErr(
        `讀取示範組合失敗：${err instanceof Error ? err.message : String(err)}` +
          "（GET /api/v1/curation/whitelist/starter）",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * BREAK-GLASS recovery: enable every authored id. Not a default and not the
   * starter set — it turns on unvetted content wholesale, so it is behind a
   * confirm and still requires 儲存.
   */
  const onEnableAll = async (): Promise<void> => {
    if (
      !window.confirm(
        "啟用全部內容？\n\n" +
          "這會開啟所有未經審核的內容（含測試英雄、無貼圖模型、0g 道具）。\n" +
          "這是「不小心把自己鎖在外面」時的救援手段，不是預設值。\n" +
          "若只是想讓新安裝可玩，請改用「⭐ 啟用示範組合」。",
      )
    ) {
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const [champions, items, abilities] = await Promise.all([
        ensureLoaded("champions"),
        ensureLoaded("items"),
        ensureLoaded("abilities"),
      ]);
      setDraft((d) => enableAll(d, { champions, items, abilities }));
      setFlash({
        ok: true,
        text: `已選取全部：英雄 ${champions.length}、道具 ${items.length}、技能 ${abilities.length} — 請按「儲存」寫入。`,
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Back to the documented default: nothing enabled.
   *
   * The second sentence is not decoration. This button and 回到原廠設定 sit next
   * to each other now, and 「停用全部」 is the one an operator reaches for when
   * they mean 「重設」 — which would leave them with an empty champ-select
   * instead of the shipped roster.
   */
  const onDisableAll = (): void => {
    if (
      !window.confirm(
        "停用全部內容？白名單將回到「全新安裝」的空狀態 — 沒有任何英雄可選。\n\n" +
          "想回到出貨的預設組合，請用「回到原廠設定」，不要用這個。",
      )
    ) {
      return;
    }
    setDraft((d) => disableAll(d));
    setFlash({ ok: true, text: "已清空草稿 — 請按「儲存」寫入。" });
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const { doc, verify, via } = await saveWhitelist(server, draft);
      setServer(doc);
      setDraft(doc);
      setSel(EMPTY_SELECTION);
      if (verify.ok) {
        setFlash({
          ok: true,
          text: `✓ 已儲存並回讀驗證（${via === "bulk" ? "bulk" : "replace"}）：英雄 ${doc.champions.length}、道具 ${doc.items.length}、技能 ${doc.abilities.length}`,
        });
      } else {
        const detail = verify.mismatches
          .map((m) => `${KIND_LABEL[m.kind]} 缺 ${m.missing.length} / 多 ${m.extra.length}`)
          .join("、");
        setFlash({ ok: false, text: `⚠ 儲存後回讀不一致：${detail}` });
      }
    } catch (err) {
      setFlash(null);
      setApiErr(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedVisible.includes(id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>內容白名單 · Content whitelist</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4 }}>
          移植內容太龐大，白名單預設全部為空 — 只有在這裡選取並儲存後，英雄/道具/技能才會出現在遊戲中。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />
      <ErrorBanner text={contentErr} onDismiss={() => setContentErr(null)} />

      {/* ACTIONABLE empty-state: zero enabled champions means champ-select is
          dead for every player. Say exactly which button fixes it. */}
      {server.champions.length === 0 && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.7,
            color: TEXT_MAIN,
            background: "#2a2213",
            border: `1px solid ${GOLD}`,
          }}
        >
          <b style={{ color: GOLD }}>目前沒有啟用任何英雄 — 玩家無法選角。</b>
          <br />
          {/* No counts in this sentence ON PURPOSE. It used to promise
              「12 名英雄、30 件道具」; the bundle has been 53 champions and 104
              items since task #138/#82, so the number was a lie for weeks in the
              one place a stuck operator reads most carefully. */}
          最快的修法：按下方的 <b>「⭐ 啟用示範組合」</b> 再按 <b>「儲存」</b>，即可載入平台內建的起始組合
          （英雄 + 道具 + 對應技能，實際數量以按下時伺服器回傳的為準）。
          <br />
          也可以用指令：<code>make seed-demo</code>（等同 <code>POST /api/v1/curation/whitelist/starter</code>）。
        </div>
      )}

      {/* tabs — each carries its own enabled/total counter */}
      <div style={{ display: "flex", gap: 8 }}>
        {KINDS.map((k) => {
          const active = k === tab;
          const kindEnabled = enabledSet(draft, k);
          const c = countKind(rows[k], kindEnabled, rows[k]);
          return (
            <button
              key={k}
              onClick={() => switchTab(k)}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                color: active ? TEXT_MAIN : TEXT_DIM,
                background: active ? "#1b2338" : "#141a28",
                border: active ? `1px solid ${ACCENT}` : PANEL_BORDER,
              }}
            >
              {KIND_LABEL[k]}
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: c.enabled > 0 ? OK : TEXT_DIM }}>
                {c.enabled} / {c.total || "…"}
              </span>
            </button>
          );
        })}
      </div>

      <Panel
        title={`${KIND_LABEL[tab]} · ${counts.enabled} / ${counts.total} 已啟用`}
        right={
          <span style={{ fontSize: 11, color: TEXT_DIM }}>
            顯示 {counts.shown}（其中已啟用 {counts.shownEnabled}）
            {counts.unknown > 0 && (
              <span style={{ color: WARN, marginLeft: 8 }}>· {counts.unknown} 個白名單 id 已無對應內容</span>
            )}
          </span>
        }
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <div style={{ flex: "1 1 240px", minWidth: 200 }}>
            <TextInput value={query} onChange={setQuery} placeholder="搜尋 id / 名稱… search" />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as EnabledFilter)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #2c3448",
              background: "#10141f",
              color: TEXT_MAIN,
              fontSize: 13,
            }}
          >
            {(["all", "enabled", "disabled"] as EnabledFilter[]).map((f) => (
              <option key={f} value={f}>
                {FILTER_LABEL[f]}
              </option>
            ))}
          </select>
          <Btn small onClick={() => setSel(toggleSelectAll(sel, visibleIds))} disabled={visibleIds.length === 0}>
            {allVisibleSelected ? "取消全選" : `全選篩選結果 (${visibleIds.length})`}
          </Btn>
          <Btn small kind="primary" onClick={() => bulk(true)} disabled={selectedVisible.length === 0}>
            啟用所選 ({selectedVisible.length})
          </Btn>
          <Btn small kind="danger" onClick={() => bulk(false)} disabled={selectedVisible.length === 0}>
            停用所選
          </Btn>
          <Btn
            small
            kind="primary"
            onClick={() => void onStarter()}
            disabled={busy}
            title="平台內建的起始組合（apps/platform/internal/curation/starter.go）。這是聯集：只會加入，永遠不會停用你已經開過的東西。要「取代成原廠」請用下方的危險操作。"
          >
            ⭐ 啟用示範組合
          </Btn>
          <Btn small onClick={() => void onEnableAll()} disabled={busy} title="救援用：開啟全部未審核內容">
            啟用全部
          </Btn>
          {/* 全部停用 moved into the collapsed 危險操作 section below, next to
              回到原廠設定 — the two removing actions belong together and behind
              one extra click, not in the same row as 全選篩選結果. */}
        </div>

        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8 }}>
          點一列切換選取 · 按住 <b>Shift</b> 點選可選範圍 · 右側開關直接切換啟用狀態
          {loadingKind === tab && <span style={{ color: WARN, marginLeft: 8 }}>載入中…</span>}
        </div>

        <div style={{ maxHeight: "56vh", overflowY: "auto", border: PANEL_BORDER, borderRadius: 8 }}>
          {shown.length === 0 && (
            <div style={{ padding: 20, fontSize: 12, color: TEXT_DIM, textAlign: "center" }}>
              {kindRows.length === 0 ? "尚未載入任何內容。" : "沒有符合條件的項目。"}
            </div>
          )}
          {shown.map((r, i) => {
            const isEnabled = enabled.has(r.id);
            const isSelected = selectedVisible.includes(r.id);
            return (
              <div
                key={r.id}
                onClick={(e) => setSel((s) => clickRow(s, visibleIds, i, e.shiftKey))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  userSelect: "none",
                  borderBottom: "1px solid #1b2233",
                  background: isSelected ? "#1b2338" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  tabIndex={-1}
                  style={{ pointerEvents: "none", accentColor: ACCENT }}
                />
                <Thumb icon={r.icon} alt={r.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 10, color: TEXT_DIM }}>
                    {r.id}
                    {r.role ? ` · ${r.role}` : ""}
                    {r.tier !== undefined ? ` · T${r.tier}` : ""}
                    {r.cost !== undefined ? ` · ${r.cost}g` : ""}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDraft((d) => toggleId(d, tab, r.id));
                    setFlash(null);
                  }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    color: isEnabled ? "#0b0e16" : TEXT_DIM,
                    background: isEnabled ? OK : "#171d2b",
                    border: `1px solid ${isEnabled ? OK : "#2c3448"}`,
                  }}
                >
                  {isEnabled ? "已啟用" : "未啟用"}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* save bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: 10,
          border: PANEL_BORDER,
          background: "#141a28",
        }}
      >
        <div style={{ flex: 1, minWidth: 240, fontSize: 12, color: dirty ? GOLD : TEXT_DIM }}>
          {dirty ? `未儲存變更：${describeDiff(diffs)}` : "已與伺服器同步"}
          {server.updatedAt && (
            <span style={{ color: TEXT_DIM, marginLeft: 10 }}>最後更新 {server.updatedAt}</span>
          )}
        </div>
        {flash && (
          <div style={{ fontSize: 12, color: flash.ok ? OK : WARN, maxWidth: 520 }}>{flash.text}</div>
        )}
        <Btn small onClick={() => { setDraft(server); setSel(EMPTY_SELECTION); setFlash(null); }} disabled={!dirty || busy}>
          放棄變更
        </Btn>
        <Btn kind="primary" onClick={() => void onSave()} disabled={!dirty || busy}>
          {busy ? "儲存中…" : "儲存 Save"}
        </Btn>
      </div>

      {/* 🧹 一鍵清理變身態 (owner 2026-08-21). ABOVE 危險操作 on purpose: this one
          only removes ids the game already refuses to serve, so it is a cleanup,
          not a decision — but it still writes straight to the server, hence the
          preview + the undo snapshot it takes. */}
      <CurationTransformPanel
        server={server}
        championRows={rows.champions}
        busy={busy}
        dirty={dirty}
        onApplied={(doc) => {
          setServer(doc);
          setDraft(doc);
          setSel(EMPTY_SELECTION);
          setFlash(null);
        }}
      />

      <CurationResetPanel
        dirty={dirty}
        busy={busy}
        onDisableAll={onDisableAll}
        onApplied={(doc) => {
          // The reset/restore writes SERVER-SIDE, so both copies move to the
          // document the platform actually returned — not to a locally
          // predicted one, which is how a "saved" tick can lie.
          setServer(doc);
          setDraft(doc);
          setSel(EMPTY_SELECTION);
          setFlash(null);
        }}
      />
    </div>
  );
}
