/**
 * LeaderboardPanel — the ranked ladder (task #37). TWO boards keyed off
 * cumulative season points (hidden MMR stays for matchmaking only):
 *   玩家  — the player board (one row per account) + a pinned "you" row.
 *   英雄  — a champion board (pick a champion → its board) plus 我的英雄, the
 *           caller's per-champion tiers sorted by points.
 * Every standing renders through <TierBadge> (EXACT Chinese labels + LoL crest).
 * All non-trivial logic lives in ./ranking + ../components/tier (unit-tested);
 * this file is the JSX + data-fetch shell, matching the store/api conventions.
 *
 * Post-match (task #36): when the settlement flow jumps here for 查看戰績變化 the
 * 玩家 board auto-scrolls from the top down to the caller's own row and pulses it
 * — the same hold → ease → pulse rules as the settlement board (../scroll/
 * autoScroll), just with a longer duration cap since this page can be very long.
 * Any manual scroll cancels it, and it runs at most once per visit.
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import { useApp } from "./store";
import { championBoard, myChampions as fetchMyChampions } from "./api";
import {
  appendPage,
  buildChampionOptions,
  championInitial,
  computeRankDelta,
  formatPointsDelta,
  hasMore,
  initialRankPanelState,
  isMeRow,
  loadChampionBoard,
  rankPanelReducer,
  sortMyChampions,
  PAGE_SIZE,
  type ChampOption,
  type MyChampionRow,
  type RankLadderRow,
  type RankPanelAction,
  type RankPanelState,
} from "./ranking";
import { LEADERBOARD_MAX_DURATION_MS } from "../scroll/autoScroll";
import {
  AUTO_SCROLL_HIGHLIGHT_CSS,
  highlightClass,
  useAutoScrollToRow,
  type RowHighlight,
} from "../scroll/useAutoScrollToRow";
import { TierBadge } from "../components/TierBadge";
import { formatRank } from "../components/tier";
import { GlyphTile } from "../components/GlyphTile";
import { iconSrc } from "../icons";
import { SfxButton } from "../SfxButton";
import { Panel, Btn, ACCENT, OK, DANGER } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";
// touch/narrow-viewport layer (crest scaling, thumb-sized rows, 1-col picker)
import "./ranking.css";

// ---------------------------------------------------------------- small parts

/**
 * One board row: rank · name · tier crest · points. Highlights the caller.
 * `innerRef` / `highlight` are only ever set on the caller's own row — they are
 * how the post-match auto-scroll (task #36) finds and pulses it.
 */
function LadderRow(props: {
  row: RankLadderRow;
  me: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
  highlight?: RowHighlight;
}): React.JSX.Element {
  const { row, me } = props;
  return (
    <div
      ref={props.innerRef}
      className={`ggd-rank-row ${highlightClass(props.highlight ?? "none")}`.trim()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 4px",
        fontSize: 12,
        borderRadius: 6,
        background: me ? "rgba(80,100,160,0.3)" : "transparent",
      }}
    >
      <span style={{ width: 26, color: row.rank <= 3 ? GOLD : TEXT_DIM, fontWeight: 700 }}>#{row.rank}</span>
      <span style={{ flex: 1, minWidth: 0, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {me ? "你 · " : ""}
        {row.username || row.accountId}
      </span>
      {/* dense row: crest only (names need the width) — the Chinese label rides
          the tooltip, and the pinned "you" row below spells it out in full. */}
      <TierBadge
        tier={row.tier}
        division={row.division}
        size="sm"
        showLabel={false}
        title={formatRank(row.tier, row.division)}
      />
      <span style={{ color: ACCENT, fontWeight: 600, width: 44, textAlign: "right" }}>{row.points.toLocaleString()}</span>
    </div>
  );
}

function Hint(props: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ fontSize: 12, color: TEXT_DIM, padding: "6px 2px" }}>{props.children}</div>;
}

function LoadMore(props: { show: boolean; busy: boolean; onClick: () => void }): React.JSX.Element | null {
  if (!props.show) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
      <Btn small disabled={props.busy} onClick={props.onClick}>
        {props.busy ? "載入中…" : "載入更多"}
      </Btn>
    </div>
  );
}

const TABS: { key: "player" | "champion"; label: string }[] = [
  { key: "player", label: "玩家" },
  { key: "champion", label: "英雄" },
];

function TabBar(props: {
  value: string;
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
}): React.JSX.Element {
  return (
    <div className="ggd-rank-tabs" style={{ display: "flex", gap: 4, marginBottom: 10 }}>
      {props.options.map((o) => {
        const active = o.key === props.value;
        return (
          <SfxButton
            key={o.key}
            onClick={() => props.onSelect(o.key)}
            style={{
              flex: 1,
              padding: "6px 8px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              borderRadius: 8,
              color: active ? TEXT_MAIN : TEXT_DIM,
              background: active ? "#2c3f6b" : "#171d2b",
              border: active ? `1px solid ${ACCENT}` : "1px solid #2c3448",
            }}
          >
            {o.label}
          </SfxButton>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- champion picker

function ChampionPicker(props: {
  options: ChampOption[];
  onPick: (championId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q === "" ? props.options : props.options.filter((o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        background: "rgba(9,12,20,0.97)",
        border: `1px solid ${ACCENT}`,
        borderRadius: 10,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="搜尋英雄…"
          aria-label="搜尋英雄"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 16,
            borderRadius: 8,
            background: "#0f1420",
            border: "1px solid #2c3448",
            color: TEXT_MAIN,
            minWidth: 0,
          }}
        />
        <Btn small onClick={props.onClose}>
          ✕
        </Btn>
      </div>
      <div
        className="ggd-rank-picker-grid"
        style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, minHeight: 0 }}
      >
        {shown.map((o) => (
          <SfxButton
            key={o.id}
            onClick={() => props.onPick(o.id)}
            title={o.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              background: "#171d2b",
              border: "1px solid #2c3448",
              color: TEXT_MAIN,
              minWidth: 0,
            }}
          >
            <ChampGlyph id={o.id} icon={o.icon} name={o.name} size={22} />
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
          </SfxButton>
        ))}
        {shown.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 12, color: TEXT_DIM, padding: 10 }}>找不到「{query}」。</div>
        )}
      </div>
    </div>
  );
}

/**
 * Champion icon, or the shared procedural tile when the w3x art is absent
 * (stock-art heroes). Seeded on the champion id, so every row in a long ladder
 * is visually distinct instead of a column of identical grey boxes.
 */
function ChampGlyph(props: { id?: string; icon: string | null; name: string; size: number }): React.JSX.Element {
  return (
    <GlyphTile
      seed={props.id ?? props.name}
      src={iconSrc(props.icon ?? undefined)}
      label={championInitial(props.name)}
      size={props.size}
      radius={4}
    />
  );
}

// ---------------------------------------------------------------- champion tab

interface BoardState {
  rows: RankLadderRow[];
  more: boolean;
  loading: boolean;
  error: boolean;
  busy: boolean;
}
const EMPTY_BOARD: BoardState = { rows: [], more: false, loading: false, error: false, busy: false };

function ChampionTab(props: {
  state: RankPanelState;
  dispatch: React.Dispatch<RankPanelAction>;
  options: ChampOption[];
  optionsById: Map<string, ChampOption>;
  meId: string | null;
  loggedIn: boolean;
}): React.JSX.Element {
  const view = props.state.championView;
  const selected = props.state.selectedChampionId;
  const pickerOpen = props.state.pickerOpen;
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const [mine, setMine] = useState<{ rows: MyChampionRow[]; loading: boolean; error: boolean; loaded: boolean }>({
    rows: [],
    loading: false,
    error: false,
    loaded: false,
  });

  // fetch the selected champion's board (first page)
  useEffect(() => {
    if (view !== "board" || !selected) return;
    let cancelled = false;
    setBoard({ ...EMPTY_BOARD, loading: true });
    loadChampionBoard(selected, {}, championBoard)
      .then((r) => {
        if (!cancelled) setBoard({ rows: r.rows, more: r.hasMore, loading: false, error: false, busy: false });
      })
      .catch(() => {
        if (!cancelled) setBoard({ ...EMPTY_BOARD, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [selected, view]);

  // fetch my per-champion standings once when 我的英雄 first opens
  useEffect(() => {
    if (view !== "mine" || !props.loggedIn || mine.loaded) return;
    let cancelled = false;
    setMine((m) => ({ ...m, loading: true, error: false }));
    fetchMyChampions()
      .then((rows) => {
        if (!cancelled) setMine({ rows: sortMyChampions(rows), loading: false, error: false, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setMine({ rows: [], loading: false, error: true, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [view, props.loggedIn, mine.loaded]);

  const loadMoreChampBoard = (): void => {
    if (!selected || board.busy || !board.more) return;
    setBoard((b) => ({ ...b, busy: true }));
    championBoard(selected, PAGE_SIZE, board.rows.length)
      .then((rows) => setBoard((b) => ({ ...b, rows: appendPage(b.rows, rows), more: hasMore(rows.length), busy: false })))
      .catch(() => setBoard((b) => ({ ...b, busy: false })));
  };

  const pick = (id: string): void => props.dispatch({ type: "selectChampion", championId: id });

  const selectedOpt = selected ? props.optionsById.get(selected) : undefined;

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TabBar
        value={view}
        options={[
          { key: "board", label: "英雄榜" },
          { key: "mine", label: "我的英雄" },
        ]}
        onSelect={(k) => props.dispatch({ type: "setChampionView", view: k as "board" | "mine" })}
      />

      {view === "board" ? (
        <>
          <SfxButton
            className="ggd-rank-pick"
            onClick={() => props.dispatch({ type: "setPicker", open: true })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              marginBottom: 8,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              background: "#171d2b",
              border: `1px solid ${selected ? ACCENT : "#2c3448"}`,
              color: TEXT_MAIN,
            }}
          >
            {selectedOpt ? (
              <>
                <ChampGlyph id={selectedOpt.id} icon={selectedOpt.icon} name={selectedOpt.name} size={24} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{selectedOpt.name}</span>
              </>
            ) : (
              <span style={{ flex: 1, fontSize: 13, color: TEXT_DIM }}>選擇英雄查看排行…</span>
            )}
            <span style={{ color: TEXT_DIM, fontSize: 11 }}>▾</span>
          </SfxButton>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {!selected && <Hint>挑一位英雄，看看誰在這個英雄上分數最高。</Hint>}
            {board.loading && <Hint>載入中…</Hint>}
            {board.error && <Hint>載入失敗，稍後再試。</Hint>}
            {selected && !board.loading && !board.error && board.rows.length === 0 && (
              <Hint>這個英雄還沒有排位分數。</Hint>
            )}
            {board.rows.map((r) => (
              <LadderRow key={r.accountId} row={r} me={isMeRow(r, props.meId)} />
            ))}
            <LoadMore show={board.more} busy={board.busy} onClick={loadMoreChampBoard} />
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {!props.loggedIn && <Hint>登入後即可查看你每位英雄的排位。</Hint>}
          {props.loggedIn && mine.loading && <Hint>載入中…</Hint>}
          {props.loggedIn && mine.error && <Hint>載入失敗，稍後再試。</Hint>}
          {props.loggedIn && !mine.loading && !mine.error && mine.rows.length === 0 && (
            <Hint>打幾場排位，累積英雄分數吧。</Hint>
          )}
          {mine.rows.map((r) => {
            const opt = props.optionsById.get(r.championId);
            return (
              <div
                key={r.championId}
                className="ggd-rank-row"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px", fontSize: 12 }}
              >
                <span style={{ width: 22, color: TEXT_DIM, textAlign: "right" }}>#{r.rank}</span>
                <ChampGlyph id={r.championId} icon={opt?.icon ?? null} name={opt?.name ?? r.championId} size={24} />
                <span style={{ flex: 1, minWidth: 0, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {opt?.name ?? r.championId}
                </span>
                <TierBadge
                  tier={r.tier}
                  division={r.division}
                  size="sm"
                  showLabel={false}
                  title={formatRank(r.tier, r.division)}
                />
                <span style={{ color: ACCENT, fontWeight: 600, width: 44, textAlign: "right" }}>{r.points.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <ChampionPicker options={props.options} onPick={pick} onClose={() => props.dispatch({ type: "setPicker", open: false })} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- player tab

function PlayerTab(props: { meId: string | null }): React.JSX.Element {
  const playerBoard = useApp((s) => s.playerBoard);
  const playerBoardMore = useApp((s) => s.playerBoardMore);
  const playerBoardBusy = useApp((s) => s.playerBoardBusy);
  const myStanding = useApp((s) => s.myStanding);
  const loadMorePlayers = useApp((s) => s.loadMorePlayers);
  // arriving from the settlement screen ⇒ this is the post-match visit
  const fromSettlement = useApp((s) => s.showRankChange);

  const rows = playerBoard ?? [];
  const meShown = props.meId ? rows.some((r) => r.accountId === props.meId) : false;

  // Post-match: walk the ladder down from the top to the caller's own row
  // (task #36) — same hold → ease → pulse as the settlement board, with a 3 s
  // cap because this page is long. Armed only once the row is actually on
  // screen; deeper standings keep the pinned "你 #N" summary below instead.
  const scroll = useAutoScrollToRow<HTMLDivElement, HTMLDivElement>({
    runKey: fromSettlement && meShown ? `ladder-${props.meId ?? "me"}` : null,
    maxDurationMs: LEADERBOARD_MAX_DURATION_MS,
  });

  return (
    <>
      <style>{AUTO_SCROLL_HIGHLIGHT_CSS}</style>
      <div ref={scroll.listRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {playerBoard === null && <Hint>載入中…</Hint>}
        {playerBoard !== null && rows.length === 0 && <Hint>還沒有排位玩家 — 打一場排位賽取得定級。</Hint>}
        {rows.map((r) => {
          const me = isMeRow(r, props.meId);
          return (
            <LadderRow
              key={r.accountId}
              row={r}
              me={me}
              {...(me ? { innerRef: scroll.rowRef, highlight: scroll.highlight } : {})}
            />
          );
        })}
        <LoadMore show={playerBoardMore} busy={playerBoardBusy} onClick={() => void loadMorePlayers()} />
      </div>

      <div style={{ borderTop: "1px solid #2c3448", marginTop: 8, paddingTop: 8 }}>
        {myStanding ? (
          <div className="ggd-rank-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>你 #{myStanding.rank}</span>
            <TierBadge tier={myStanding.tier} division={myStanding.division} size="sm" />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: ACCENT, fontWeight: 700 }}>{myStanding.points.toLocaleString()} 分</span>
            {typeof myStanding.percentile === "number" && (
              <span style={{ fontSize: 11, color: TEXT_DIM }}>前 {myStanding.percentile.toFixed(1)}%</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            {meShown ? "" : "未定級 — 打一場平台排位賽。"}
          </span>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------ post-match rank delta

/**
 * The victory-settlement "查看戰績變化" banner: shown at the top of the ladder
 * after a match, diffing the caller's freshly-refreshed standing against the
 * snapshot taken when the match launched (store.rankBefore). Offline / unplaced
 * players see a neutral note. Dismissable.
 */
function RankChangeBanner(): React.JSX.Element | null {
  const show = useApp((s) => s.showRankChange);
  const before = useApp((s) => s.rankBefore);
  const after = useApp((s) => s.myStanding);
  const dismiss = useApp((s) => s.dismissRankChange);
  if (!show) return null;

  const delta = computeRankDelta(before, after);
  const gain = delta.pointsGain;
  const gainColor = gain === null || gain === 0 ? TEXT_DIM : gain > 0 ? OK : DANGER;

  return (
    <div
      style={{
        marginBottom: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(80,100,160,0.18)",
        border: `1px solid ${ACCENT}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: after ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN }}>本場戰績變化</span>
        <span style={{ flex: 1 }} />
        <Btn small title="關閉" onClick={dismiss} style={{ padding: "2px 8px" }}>
          ✕
        </Btn>
      </div>
      {after ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {delta.tierChanged && before ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <TierBadge tier={before.tier} division={before.division} size="sm" showLabel={false} />
              <span style={{ color: TEXT_DIM }}>→</span>
              <TierBadge tier={after.tier} division={after.division} size="sm" showLabel={false} title={formatRank(after.tier, after.division)} />
            </span>
          ) : (
            <TierBadge tier={after.tier} division={after.division} size="sm" title={formatRank(after.tier, after.division)} />
          )}
          <span style={{ fontSize: 13, color: ACCENT, fontWeight: 700 }}>{after.points.toLocaleString()} 分</span>
          <span style={{ fontSize: 13, color: gainColor, fontWeight: 800 }}>{formatPointsDelta(gain)}</span>
          {delta.rankGain !== null && delta.rankGain !== 0 && (
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              名次 {delta.rankGain > 0 ? `↑${delta.rankGain}` : `↓${-delta.rankGain}`}
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: TEXT_DIM }}>本場為練習賽或尚未定級，暫無排位分變化。</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- panel

export function LeaderboardPanel(): React.JSX.Element {
  const meId = useApp((s) => s.account?.id ?? null);
  const loggedIn = useApp((s) => !!s.account);
  const season = useApp((s) => s.leaderboard?.season ?? s.myRank?.season ?? null);
  const [panel, dispatch] = useReducer(rankPanelReducer, initialRankPanelState);

  // roster snapshot (static after boot) → picker options + id→option lookup
  const options = useMemo<ChampOption[]>(
    () => buildChampionOptions(Champions.all().map((c) => ({ id: c.id, name: c.name, ...(c.icon !== undefined ? { icon: c.icon } : {}) }))),
    [],
  );
  const optionsById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  return (
    <Panel title={`排位榜${season ? ` · ${season}` : ""}`} style={{ flex: 1, minHeight: 160 }}>
      <RankChangeBanner />
      <TabBar value={panel.tab} options={TABS} onSelect={(k) => dispatch({ type: "setTab", tab: k as "player" | "champion" })} />
      {panel.tab === "player" ? (
        <PlayerTab meId={meId} />
      ) : (
        <ChampionTab
          state={panel}
          dispatch={dispatch}
          options={options}
          optionsById={optionsById}
          meId={meId}
          loggedIn={loggedIn}
        />
      )}
    </Panel>
  );
}
