/**
 * OnlinePlayersPanel — 線上玩家, the lobby's third left-column panel.
 *
 * owner 2026-08-03:「大廳 FRIEND 跟排位榜 中間，多出一個區域顯示所有大廳正在線上
 * 的玩家列表，並且名字旁邊有按鈕可以一鍵加入朋友」
 *
 * ---- WHAT THIS COMPONENT DELIBERATELY DOES NOT DO ---------------------------
 * It holds no policy. Which rows render, what each button says and whether
 * pressing it does anything all come from ./onlinePlayers (pure) and
 * ./lobbyLayout (the policy values) — so those decisions are testable without a
 * DOM, and the one that is a genuine A-or-B (`alreadyFriendMode`) is a field
 * with a default rather than an `if` defended in a comment.
 *
 * It also keeps NO copy of the friends list. The relation on each row comes
 * from the same response as the row itself, so an add button can never be live
 * on somebody who is already a friend just because two polls disagreed.
 *
 * ---- FAILING LOUDLY ---------------------------------------------------------
 * A roster that cannot be read renders an error line, not an empty list.
 * 「沒有人在線上」 and 「我讀不到誰在線上」 look identical otherwise, and only one
 * of them is a reason to stop waiting for a game (CLAUDE.md: fail-open is fine,
 * failing SILENTLY is the defect).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Panel, PresenceDot } from "./widgets";
import { TEXT_DIM, TEXT_MAIN } from "../theme";
import { padFocusLanding } from "../padFocusLanding";
import { DEFAULT_LOBBY_LAYOUT } from "./lobbyLayout";
import type { LobbyLayoutPolicy } from "./lobbyLayout";
import {
  addButtonFor,
  addFriendById,
  canReadRoster,
  listOnlinePlayers,
  visibleRows,
} from "./onlinePlayers";
import type { OnlinePlayer } from "./onlinePlayers";

/**
 * Presence has a heartbeat TTL on the server, so this list ages. 10s matches
 * FriendsPanel's own poll — the two panels sit one above the other and a
 * different cadence would show the same person online in one and not the other.
 */
const ONLINE_POLL_MS = 10_000;

export function OnlinePlayersPanel(props: {
  policy?: LobbyLayoutPolicy;
}): React.JSX.Element {
  const policy = props.policy ?? DEFAULT_LOBBY_LAYOUT;
  const [players, setPlayers] = useState<OnlinePlayer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);
  // Ids this session has already asked. The server's `relation` only catches up
  // on the next poll, and a button that stays live for ten seconds after a
  // successful press reads as "nothing happened".
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const alive = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    // No session ⇒ nothing to ask with. Report the same 「讀不到」 as any other
    // failure rather than an empty roster: they are different facts.
    if (!canReadRoster()) {
      setFailed(true);
      return;
    }
    try {
      const resp = await listOnlinePlayers();
      if (!alive.current) return;
      setPlayers(resp.players);
      setTruncated(resp.truncated);
      setFailed(false);
    } catch {
      if (!alive.current) return;
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => void refresh(), ONLINE_POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  const add = (id: string): void => {
    setPending((prev) => new Set(prev).add(id));
    void addFriendById(id)
      .then(() => refresh())
      .catch(() => {
        // The request did not land — put the button back rather than leaving a
        // permanent 「邀請已送出」 that never became one.
        if (!alive.current) return;
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  const rows = players === null ? [] : visibleRows(players, policy.alreadyFriendMode);

  return (
    <Panel title="線上玩家" style={{ flex: 1, minHeight: 120 }} data-ggd-online-panel="">
      {/* GH#514 —— 有列的時候「加朋友」鈕本身就是落點，但**空清單／讀取中／
          讀不到**這三種狀態一個可聚焦元素都沒有，而那正是手把最需要能站進來
          讀說明的時候。落點掛在容器上，三種狀態都在。 */}
      <div {...padFocusLanding()} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {failed && (
          <div data-ggd-online-error="" style={{ fontSize: 12, color: "#e5a13f" }}>
            線上名單暫時讀不到 —— 這不代表沒有人在線上。
          </div>
        )}
        {!failed && players === null && (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>讀取中…</div>
        )}
        {!failed && players !== null && rows.length === 0 && (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>目前沒有其他玩家在線上。</div>
        )}
        {rows.map((p) => {
          const btn = addButtonFor(p, pending);
          return (
            <div
              key={p.id}
              data-ggd-online-row={p.id}
              style={{ display: "flex", alignItems: "center", padding: "4px 0", gap: 6 }}
            >
              <PresenceDot state={p.state} />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: TEXT_MAIN,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.username || p.id}
              </span>
              <Btn
                small
                kind={btn.inert ? "ghost" : "primary"}
                disabled={btn.inert}
                title={btn.title}
                onClick={() => add(p.id)}
              >
                {btn.label}
              </Btn>
            </div>
          );
        })}
        {truncated && (
          <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM }}>
            線上人數太多，只顯示前面一部分。
          </div>
        )}
      </div>
    </Panel>
  );
}
