/**
 * CodexPage — 內容圖鑑: one page listing EVERY item, champion and ability in the
 * shipped content set, with full detail and cross-links (task #71).
 *
 * WHY IT LIVES IN THE CLIENT APP. It is a route of the game client, not a
 * throwaway static page, for two reasons: (1) it is reachable in-game — the
 * lobby header and the in-match pause menu both open it, and `#codex` in the
 * URL opens it from any screen; (2) it reuses what already exists instead of
 * re-implementing it — the cursor-safe <Tooltip> and the ability-text helpers
 * (task #21), the shop's icon fallback via <IconImg>/iconSrc (task #33), ui/
 * theme, and the task #24 <Btn> skin with its hover/click SFX.
 *
 * WHAT MAKES IT A CODEX AND NOT THREE LISTS: every relation is a link —
 * champion → its 5 abilities, ability → its owner (and the rest of that kit),
 * item → the items it is built from and builds into, item → the champions that
 * recommend it.
 *
 * LIVENESS 「動態即時非寫死」: nothing here is baked. All 879 entries are fetched
 * from the /content mount at runtime (codexData.ts) — edit a JSON, hit 重新載入,
 * and the page changes. codexLive.test.ts fails the build if a snapshot, a JSON
 * import or a copied content string ever appears in this directory.
 *
 * SCALE: every row would be a stutter if mounted; each section virtualises to
 * roughly a viewport of rows (codexSearch.rowWindow).
 *
 * EDITING (task #96) is loaded, never imported. The `import.meta.env.DEV` guard
 * below is BARE on purpose: vite substitutes the flag statically, rollup folds
 * the branch away, and the ./codexEdit chunk is therefore never emitted into a
 * production bundle — the write path is absent, not merely disabled. That is
 * only the client courtesy half; the content-api enforces loopback-only writes
 * independently (apps/content-api/src/guard.ts), and no client check is ever
 * treated as access control.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { HUD_Z } from "../hud/hudLayout";
import { Tooltip } from "../components/Tooltip";
import { Btn } from "../platform/widgets";
import { CodexIcon } from "./CodexIcon";
import { CodexDetail } from "./CodexDetail";
import { CodexIssueTable } from "./CodexIssueTable";
import { IconCoverageBar } from "./IconCoverageBar";
import { collectIssues } from "./codexIssues";
import { bucketLabel, roleLabel, SLOT_COLOR } from "./codexLabels";
import { buildRecipeGraph } from "./codexRecipes";
import { UNKNOWN_WHITELIST } from "./codexData";
import {
  ALL,
  EMPTY_ABILITY_FILTER,
  EMPTY_CHAMPION_FILTER,
  EMPTY_ITEM_FILTER,
  compareAbilities,
  compareChampions,
  compareItems,
  facets,
  filterAbilities,
  filterChampions,
  filterItems,
  heroNumberFacets,
  rowWindow,
  scrollTopForRow,
  type AbilityFilter,
  type ChampionFilter,
  type EnabledFilter,
  type Facet,
  type ItemFilter,
} from "./codexSearch";
import type {
  CodexAbility,
  CodexChampion,
  CodexData,
  CodexEntry,
  CodexItem,
  CodexKind,
  CodexRef,
} from "@ggd/shared/codex/codexTypes";
// TYPE-ONLY: erased at compile time, so naming the dev-only editor here creates
// no runtime import and no chunk. The only value-level reference to it is the
// guarded dynamic import inside CodexPage.
import type { CodexEditSessionProps } from "./CodexEditPanel";
import { useCodex } from "./useCodex";

/** Q→W→E→R→EX for the slot facet (plain string compare would float EX first). */
const SLOT_RANK: readonly string[] = ["Q", "W", "E", "R", "EX"];
const compareSlot = (a: string, b: string): number => SLOT_RANK.indexOf(a) - SLOT_RANK.indexOf(b);

const ROW_H = 46;
const LIST_H = 460;

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid #2c3448",
  background: "#10141f",
  color: TEXT_MAIN,
  fontSize: 12,
  outline: "none",
};

function Select({
  label,
  value,
  options,
  allLabel,
  format,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly Facet[];
  allLabel: string;
  format?: (v: string) => string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: TEXT_DIM }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value={ALL}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {(format ? format(o.value) : o.value) + ` (${o.count})`}
          </option>
        ))}
      </select>
    </label>
  );
}

function EnabledSelect({ value, onChange }: { value: EnabledFilter; onChange: (v: EnabledFilter) => void }): React.JSX.Element {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: TEXT_DIM }}>
      啟用
      <select value={value} onChange={(e) => onChange(e.target.value as EnabledFilter)} style={inputStyle}>
        <option value="all">全部</option>
        <option value="enabled">已啟用</option>
        <option value="disabled">未啟用</option>
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// virtualised list
// ---------------------------------------------------------------------------

function VirtualList<T extends { id: string }>({
  rows,
  renderRow,
  focusId,
  focusSeq,
}: {
  rows: readonly T[];
  renderRow: (row: T) => React.ReactNode;
  focusId: string | null;
  focusSeq: number;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // jump-to-entry (cross-link / broken-data table): scroll the row into view.
  useEffect(() => {
    if (focusSeq === 0 || focusId === null) return;
    const index = rows.findIndex((r) => r.id === focusId);
    if (index < 0) return;
    // INSTANT, not smooth: a smooth scroll animates while this list is
    // re-windowing under it (padTop/padBottom change every frame), which the
    // browser treats as an interrupted scroll and abandons part-way.
    const top = scrollTopForRow(index, ROW_H, rows.length, LIST_H);
    if (ref.current) ref.current.scrollTop = top;
    setScrollTop(top);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  const win = rowWindow(scrollTop, LIST_H, ROW_H, rows.length);
  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{
        height: LIST_H,
        overflowY: "auto",
        border: PANEL_BORDER,
        borderRadius: 8,
        background: "#0e121b",
      }}
    >
      {rows.length === 0 && (
        <div style={{ padding: 14, fontSize: 12, color: TEXT_DIM }}>沒有符合條件的項目。</div>
      )}
      <div style={{ height: win.padTop }} />
      {rows.slice(win.start, win.end).map((row) => (
        <div key={row.id} style={{ height: ROW_H }}>
          {renderRow(row)}
        </div>
      ))}
      <div style={{ height: win.padBottom }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

function rowShell(selected: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: ROW_H,
    boxSizing: "border-box",
    padding: "0 9px",
    width: "100%",
    textAlign: "left",
    background: selected ? "#22304d" : "transparent",
    border: "none",
    borderBottom: "1px solid #161c28",
    color: TEXT_MAIN,
    cursor: "pointer",
    fontSize: 12,
  };
}

function Badge({ text, color }: { text: string; color: string }): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 4,
        padding: "1px 5px",
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}

function RowButton({
  entry,
  selected,
  onSelect,
  children,
}: {
  entry: CodexEntry;
  selected: boolean;
  onSelect: (ref: CodexRef) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tooltip
      title={entry.name}
      body={entry.description ?? undefined}
      meta={[{ label: "id", value: entry.id }]}
      style={{ display: "block" }}
    >
      <button
        onClick={() => onSelect({ kind: entry.kind, id: entry.id })}
        style={rowShell(selected)}
        onMouseEnter={(e) => {
          if (!selected) e.currentTarget.style.background = "#161d2b";
        }}
        onMouseLeave={(e) => {
          if (!selected) e.currentTarget.style.background = "transparent";
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// section
// ---------------------------------------------------------------------------

function SectionShell({
  title,
  shown,
  total,
  controls,
  children,
}: {
  title: string;
  shown: number;
  total: number;
  controls: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: TEXT_MAIN, letterSpacing: 1 }}>{title}</h2>
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          顯示 {shown} / {total}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>{controls}</div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export interface CodexPageProps {
  onClose: () => void;
}

export function CodexPage({ onClose }: CodexPageProps): React.JSX.Element {
  const { data, loading, error, icons, iconScan, plan, reload } = useCodex();
  const [itemF, setItemF] = useState<ItemFilter>(EMPTY_ITEM_FILTER);
  const [champF, setChampF] = useState<ChampionFilter>(EMPTY_CHAMPION_FILTER);
  const [abilF, setAbilF] = useState<AbilityFilter>(EMPTY_ABILITY_FILTER);
  const [selected, setSelected] = useState<CodexRef | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [EditSession, setEditSession] = useState<React.ComponentType<CodexEditSessionProps> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // THE CLIENT GATE. `import.meta.env.DEV` is written BARE and unguarded: vite
  // replaces it with the literal `false` at build time, rollup dead-folds the
  // body, and the ./CodexEditPanel chunk — with everything it pulls in, the
  // write module included — is never emitted. A production bundle does not
  // merely hide the editor, it does not CONTAIN it. Same shape as main.tsx's
  // dev-only hooks. codexEditGate.test.ts pins this, including an opt-in test
  // that runs a real `vite build` and greps dist/.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    void import("./CodexEditPanel").then(
      (m) => {
        // functional set: React would otherwise call the component as an updater
        if (alive) setEditSession(() => m.CodexEditSession);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const sortedItems = useMemo(() => (data ? [...data.items].sort(compareItems) : []), [data]);
  const sortedChampions = useMemo(() => (data ? [...data.champions].sort(compareChampions) : []), [data]);
  const sortedAbilities = useMemo(() => (data ? [...data.abilities].sort(compareAbilities) : []), [data]);
  const recipes = useMemo(() => buildRecipeGraph(sortedItems), [sortedItems]);

  const wl = data?.whitelist ?? UNKNOWN_WHITELIST;
  const shownItems = useMemo(() => filterItems(sortedItems, itemF, wl), [sortedItems, itemF, wl]);
  const shownChampions = useMemo(() => filterChampions(sortedChampions, champF, wl), [sortedChampions, champF, wl]);
  const shownAbilities = useMemo(() => filterAbilities(sortedAbilities, abilF, wl), [sortedAbilities, abilF, wl]);
  const championById = useMemo(() => new Map(sortedChampions.map((c) => [c.id, c])), [sortedChampions]);

  const issues = useMemo(
    () => (data ? collectIssues({ data, iconHashes: icons ?? undefined, recipes, plan }) : []),
    [data, icons, recipes, plan],
  );

  /** plain row click: open the detail pane, leave the caller's filters alone. */
  const select = useCallback((ref: CodexRef) => setSelected(ref), []);

  /**
   * Cross-link / broken-data link: open the entry AND scroll its section to it.
   * The target section's filters are cleared first — otherwise a link could
   * point at a row the current filter hides, and the jump would silently do
   * nothing.
   */
  const jump = useCallback((ref: CodexRef) => {
    if (ref.kind === "item") setItemF(EMPTY_ITEM_FILTER);
    else if (ref.kind === "champion") setChampF(EMPTY_CHAMPION_FILTER);
    else setAbilF(EMPTY_ABILITY_FILTER);
    setSelected(ref);
    setFocusSeq((s) => s + 1);
  }, []);

  const selectedEntry: CodexEntry | null = useMemo(() => {
    if (!data || !selected) return null;
    const pool: readonly CodexEntry[] =
      selected.kind === "item" ? data.items : selected.kind === "champion" ? data.champions : data.abilities;
    return pool.find((e) => e.id === selected.id) ?? null;
  }, [data, selected]);

  const focusIdFor = (kind: CodexKind): string | null =>
    selected && selected.kind === kind ? selected.id : null;

  return (
    <div
      className="ggd-platform"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: HUD_Z.modal,
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(ellipse at 50% 0%, #131a2c 0%, #0b0e14 65%)",
        color: TEXT_MAIN,
        pointerEvents: "auto",
      }}
    >
      <Header
        data={data}
        loading={loading}
        error={error}
        iconScan={iconScan}
        issueCount={issues.reduce((n, g) => n + g.issues.length, 0)}
        onReload={reload}
        onClose={onClose}
      />

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "12px 16px 40px" }}>
          {error && <div style={{ color: "#f08c8c", fontSize: 12 }}>讀取內容失敗：{error}</div>}
          {loading && <div style={{ color: TEXT_DIM, fontSize: 12 }}>正在從 /content 讀取全部內容…</div>}
          {data && (
            <>
              {data.loadErrors.length > 0 && (
                <div style={{ color: "#e0a878", fontSize: 11, marginBottom: 10 }}>
                  載入時有問題：{data.loadErrors.join("；")}
                </div>
              )}
              {/* task #97: the icon-generation progress bar, first thing on the page */}
              <IconCoverageBar data={data} icons={icons} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
                  gap: 18,
                  alignItems: "start",
                }}
              >
                <SectionShell
                  title="道具 ITEMS"
                  shown={shownItems.length}
                  total={sortedItems.length}
                  controls={
                    <>
                      <input
                        value={itemF.query}
                        onChange={(e) => setItemF({ ...itemF, query: e.target.value })}
                        placeholder="搜尋道具 / 說明 / 屬性"
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <Select
                        label="分類"
                        value={itemF.bucket}
                        allLabel="全部"
                        options={facets(sortedItems, (i) => i.bucket)}
                        format={(v) => bucketLabel(v as CodexItem["bucket"])}
                        onChange={(v) => setItemF({ ...itemF, bucket: v })}
                      />
                      <Select
                        label="階級"
                        value={itemF.tier}
                        allLabel="全部"
                        options={facets(sortedItems, (i) => String(i.tier), (a, b) => Number(a) - Number(b))}
                        format={(v) => `T${v}`}
                        onChange={(v) => setItemF({ ...itemF, tier: v })}
                      />
                      <EnabledSelect value={itemF.enabled} onChange={(v) => setItemF({ ...itemF, enabled: v })} />
                    </>
                  }
                >
                  <VirtualList
                    rows={shownItems}
                    focusId={focusIdFor("item")}
                    focusSeq={focusSeq}
                    renderRow={(it: CodexItem) => (
                      <RowButton entry={it} selected={selected?.id === it.id} onSelect={select}>
                        <CodexIcon icon={it.icon} label={it.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.name}
                          </div>
                          <div style={{ fontSize: 10, color: TEXT_DIM }}>{bucketLabel(it.bucket)}</div>
                        </div>
                        <Badge text={`T${it.tier}`} color="#6f8fe0" />
                        <span style={{ color: GOLD, fontSize: 11, width: 52, textAlign: "right", flexShrink: 0 }}>
                          {it.cost} g
                        </span>
                      </RowButton>
                    )}
                  />
                </SectionShell>

                <SectionShell
                  title="英雄 CHAMPIONS"
                  shown={shownChampions.length}
                  total={sortedChampions.length}
                  controls={
                    <>
                      <input
                        value={champF.query}
                        onChange={(e) => setChampF({ ...champF, query: e.target.value })}
                        placeholder="搜尋稱號 / 全名 / 故事"
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <Select
                        label="定位"
                        value={champF.role}
                        allLabel="全部"
                        options={facets(sortedChampions, (c) => c.role)}
                        format={roleLabel}
                        onChange={(v) => setChampF({ ...champF, role: v })}
                      />
                      <Select
                        label="編號"
                        value={champF.heroNumber}
                        allLabel="全部"
                        options={heroNumberFacets(sortedChampions)}
                        onChange={(v) => setChampF({ ...champF, heroNumber: v })}
                      />
                      <EnabledSelect value={champF.enabled} onChange={(v) => setChampF({ ...champF, enabled: v })} />
                    </>
                  }
                >
                  <VirtualList
                    rows={shownChampions}
                    focusId={focusIdFor("champion")}
                    focusSeq={focusSeq}
                    renderRow={(c: CodexChampion) => (
                      <RowButton entry={c} selected={selected?.id === c.id} onSelect={select}>
                        <CodexIcon icon={c.icon} label={c.fullName} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.fullName}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: TEXT_DIM,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.title ?? "（無稱號）"}
                          </div>
                        </div>
                        <Badge text={c.heroNumber ?? "—"} color="#f2c637" />
                        <span style={{ fontSize: 10, color: TEXT_DIM, width: 30, flexShrink: 0, textAlign: "right" }}>
                          {roleLabel(c.role)}
                        </span>
                      </RowButton>
                    )}
                  />
                </SectionShell>

                <SectionShell
                  title="技能 ABILITIES"
                  shown={shownAbilities.length}
                  total={sortedAbilities.length}
                  controls={
                    <>
                      <input
                        value={abilF.query}
                        onChange={(e) => setAbilF({ ...abilF, query: e.target.value })}
                        placeholder="搜尋技能 / 說明"
                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                      />
                      <Select
                        label="欄位"
                        value={abilF.slot}
                        allLabel="全部"
                        options={facets(sortedAbilities, (a) => a.slot, compareSlot)}
                        onChange={(v) => setAbilF({ ...abilF, slot: v })}
                      />
                      <Select
                        label="編號"
                        value={abilF.heroNumber}
                        allLabel="全部"
                        options={heroNumberFacets(sortedAbilities)}
                        onChange={(v) => setAbilF({ ...abilF, heroNumber: v })}
                      />
                      <EnabledSelect value={abilF.enabled} onChange={(v) => setAbilF({ ...abilF, enabled: v })} />
                    </>
                  }
                >
                  <VirtualList
                    rows={shownAbilities}
                    focusId={focusIdFor("ability")}
                    focusSeq={focusSeq}
                    renderRow={(a: CodexAbility) => {
                      const owner = a.championId ? championById.get(a.championId) : undefined;
                      return (
                        <RowButton entry={a} selected={selected?.id === a.id} onSelect={select}>
                          <CodexIcon icon={a.icon} label={a.cleanName} accent={SLOT_COLOR[a.slot]} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.cleanName}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: TEXT_DIM,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {owner?.fullName ?? a.championId ?? "?"}
                            </div>
                          </div>
                          <Badge text={a.slot} color={SLOT_COLOR[a.slot]} />
                          <Badge text={a.heroNumber ?? "—"} color="#f2c637" />
                        </RowButton>
                      );
                    }}
                  />
                </SectionShell>
              </div>

              <CodexIssueTable groups={issues} iconScan={iconScan} onJump={jump} />
            </>
          )}
        </div>

        {data && selectedEntry && (
          <aside
            style={{
              width: 400,
              flexShrink: 0,
              borderLeft: PANEL_BORDER,
              background: PANEL_BG,
              padding: 14,
              overflow: "hidden",
              display: "flex",
            }}
          >
            <CodexDetail
              entry={selectedEntry}
              data={data}
              recipes={recipes}
              onNavigate={jump}
              onClose={() => setSelected(null)}
              EditSession={EditSession}
              onReloadContent={reload}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// header (contentVersion badge — task #66's reasoning: a screenshot must say
// exactly which content it is a screenshot OF)
// ---------------------------------------------------------------------------

function Header({
  data,
  loading,
  error,
  iconScan,
  issueCount,
  onReload,
  onClose,
}: {
  data: CodexData | null;
  loading: boolean;
  error: string | null;
  iconScan: string;
  issueCount: number;
  onReload: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const counts = data?.counts;
  const countText = counts
    ? `道具 ${counts.item.loaded} · 英雄 ${counts.champion.loaded} · 技能 ${counts.ability.loaded}`
    : loading
      ? "載入中…"
      : "—";
  const stale = counts
    ? (["item", "champion", "ability"] as const).some(
        (k) => counts[k].manifest !== null && counts[k].manifest !== counts[k].loaded,
      )
    : false;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        // the global audio cluster + settings corner are portaled to <body> at
        // a z-index above everything (ui/AudioToggle, ui/SettingsCorner); keep
        // the codex's own controls clear of that top-right block.
        padding: "10px 220px 10px 16px",
        borderBottom: PANEL_BORDER,
        background: PANEL_BG,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>內容圖鑑</div>
      <div style={{ fontSize: 11, color: TEXT_DIM }}>{countText}</div>
      <div
        title="content/manifest.json 的 contentVersion — 截圖時就能辨識這是哪一版內容"
        style={{
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: GOLD,
          border: `1px solid ${GOLD}55`,
          borderRadius: 999,
          padding: "2px 9px",
        }}
      >
        {data?.contentVersion ?? "cv_?"}
      </div>
      {stale && (
        <div
          title="manifest.json 記載的數量與實際載入不一致 —— 索引沒有重建（content:build 未執行）"
          style={{ fontSize: 11, color: "#e0a878" }}
        >
          ⚠ manifest 數量與實際不符
        </div>
      )}
      {data && (
        <div style={{ fontSize: 11, color: TEXT_DIM }}>
          讀取於 {new Date(data.loadedAt).toLocaleTimeString()} ·{" "}
          {data.whitelist.enforced ? "已套用後台白名單" : "後台白名單未連線（啟用狀態未知）"}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {issueCount > 0 && (
        <a
          href="#codex-issues"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("codex-issues")?.scrollIntoView({ behavior: "smooth" });
          }}
          style={{ fontSize: 11, color: "#f0b088", textDecoration: "none" }}
        >
          破損資料 {issueCount} 筆 ↓{iconScan !== "done" ? "（掃描中）" : ""}
        </a>
      )}
      <Btn small onClick={onReload} title="重新從 /content 讀取（不需重整整頁）">
        ↻ 重新載入
      </Btn>
      <Btn small kind="danger" onClick={onClose} title="關閉圖鑑 (Esc)">
        關閉
      </Btn>
      {error && <span style={{ color: "#f08c8c", fontSize: 11 }}>{error}</span>}
    </header>
  );
}
