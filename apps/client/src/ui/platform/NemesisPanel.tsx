/**
 * NemesisPanel — 宿敵榜, the lobby left column's `nemesis` slot (GH#454).
 *
 * owner 2026-08-19:「大廳新增 **宿敵排行榜**，把**最多輸贏的宿敵**列在**朋友列表
 * 跟積分排行榜之間**」
 *
 * Each row is 頭像 · 名稱 · 交手 N 場 · W-L · 勝率 · 最近一次交手, which is more
 * than fits on one 280px line, so a row is two lines: identity on top, the
 * numbers underneath. Nothing is dropped — the numbers ARE the board.
 *
 * ---- WHAT THIS COMPONENT DELIBERATELY DOES NOT DO ---------------------------
 * It holds no policy and no formatting. The sort comes from ./lobbyLayout
 * (`nemesisSort`, a field because owner did not pick one of the three), the
 * copy and the number formatting come from ./nemesis (pure), and the ranking
 * itself happens on the server against the real match record. This file is the
 * JSX + fetch shell.
 *
 * ---- 頭像 -------------------------------------------------------------------
 * Accounts carry no avatar field (apps/platform/internal/account/account.go),
 * so the portrait is <GlyphTile> seeded on the ACCOUNT ID — the same component
 * the ladder and the shop use for a missing icon. Seeded on the id and not the
 * name, so a rename does not recolour somebody's face.
 *
 * ---- SAFE-AREA CONTRACT (#107) ---------------------------------------------
 * Flow layout only: the panel fills the slot ./lobbyLayout hands it and scrolls
 * inside itself. Nothing here is absolutely positioned, so it cannot cover the
 * persistent chrome.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ACCENT, Panel } from "./widgets";
import { GlyphTile } from "../components/GlyphTile";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";
import { DEFAULT_LOBBY_LAYOUT } from "./lobbyLayout";
import type { LobbyLayoutPolicy } from "./lobbyLayout";
import {
  canReadNemesis,
  fetchNemesis,
  formatLastSeen,
  formatRecord,
  formatWinRate,
  nemesisEmptyReason,
  rivalName,
} from "./nemesis";
import type { NemesisEmptyState, NemesisRow } from "./nemesis";

/**
 * The record only changes when a match ENDS, so this polls far more slowly than
 * the presence-driven panels above it (10s each). A stale rival count costs
 * nothing; ten requests a minute for a board that moves once an hour does.
 */
const NEMESIS_POLL_MS = 60_000;

/** How many rivals the lobby slot asks for. The server clamps its own maximum. */
const NEMESIS_LIMIT = 10;

function RivalRow(props: { row: NemesisRow; now: number }): React.JSX.Element {
  const { row, now } = props;
  const name = rivalName(row);
  return (
    <div
      data-ggd-nemesis-row={row.accountId}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", minWidth: 0 }}
    >
      <GlyphTile seed={row.accountId} label={name} size={28} radius={6} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: TEXT_MAIN,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 10, color: TEXT_DIM, whiteSpace: "nowrap" }}>
          <span data-ggd-nemesis-record="">
            {row.wins >= row.losses ? (
              <span style={{ color: GOLD }}>{formatRecord(row)}</span>
            ) : (
              <span style={{ color: ACCENT }}>{formatRecord(row)}</span>
            )}
          </span>
          {" · "}
          {formatWinRate(row)}
          {" · "}
          {formatLastSeen(row.lastAt, now)}
        </div>
      </div>
      <div
        data-ggd-nemesis-played=""
        style={{ fontSize: 12, color: TEXT_MAIN, fontWeight: 700, flexShrink: 0 }}
        title="交手場次"
      >
        {row.played} 場
      </div>
    </div>
  );
}

export function NemesisPanel(props: { policy?: LobbyLayoutPolicy }): React.JSX.Element {
  const policy = props.policy ?? DEFAULT_LOBBY_LAYOUT;
  const [rivals, setRivals] = useState<NemesisRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    // No session ⇒ nothing to ask with. Report 「讀不到」, never 「沒有宿敵」:
    // they are different facts (see ./nemesis).
    if (!canReadNemesis()) {
      setFailed(true);
      return;
    }
    try {
      const resp = await fetchNemesis(policy.nemesisSort, NEMESIS_LIMIT);
      if (!alive.current) return;
      setRivals(resp.rivals ?? []);
      setFailed(false);
    } catch {
      if (!alive.current) return;
      setFailed(true);
    }
  }, [policy.nemesisSort]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => void refresh(), NEMESIS_POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  const rows = rivals ?? [];
  const emptyState: NemesisEmptyState = failed ? "failed" : rivals === null ? "loading" : "empty";

  return (
    <Panel title="宿敵榜" style={{ flex: 1, minHeight: 120 }} data-ggd-nemesis-panel="">
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {rows.length === 0 ? (
          <div
            data-ggd-nemesis-empty={emptyState}
            style={{ fontSize: 12, color: failed ? "#e5a13f" : TEXT_DIM }}
          >
            {nemesisEmptyReason(emptyState)}
          </div>
        ) : (
          rows.map((row) => <RivalRow key={row.accountId} row={row} now={Date.now()} />)
        )}
      </div>
    </Panel>
  );
}
