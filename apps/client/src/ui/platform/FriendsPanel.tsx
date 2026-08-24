/**
 * FriendsPanel — friend list with live presence (WS deltas merged over the
 * REST snapshot), add-by-username, incoming request accept/decline, and
 * "invite to room" when I host an open room.
 */
import { useEffect, useState } from "react";
import { useApp } from "./store";
import { Btn, TextInput, PresenceDot, Panel, OK } from "./widgets";
import { TEXT_DIM, TEXT_MAIN } from "../theme";
import { padFocusLanding } from "../padFocusLanding";
import { orderFriends } from "./friendOrder";
import { DEFAULT_LOBBY_LAYOUT } from "./lobbyLayout";
import { activeLobbyRally } from "./lobbyRally";

/** friend REQUESTS have no WS push (only presence does) — poll lightly */
const FRIENDS_POLL_MS = 10_000;

export function FriendsPanel(): React.JSX.Element {
  const friends = useApp((s) => s.friends);
  const presence = useApp((s) => s.ws.presence);
  const refreshFriends = useApp((s) => s.refreshFriends);
  const addFriend = useApp((s) => s.addFriend);
  const acceptFriend = useApp((s) => s.acceptFriend);
  const declineFriend = useApp((s) => s.declineFriend);
  const createInvite = useApp((s) => s.createInvite);
  const room = useApp((s) => s.room);
  const meId = useApp((s) => s.account?.id);
  const [name, setName] = useState("");
  // ⭐ GH#655 —— owner 2026-08-24:「大廳邀請對象進房間應該要能選擇是**隊友**還是
  // **敵對方**」。⚠️ 讀的是**生效中**的政策(後台 overlay ?? content ?? 出貨值),
  // 所以 `inviteSideChoice` 關掉的那一刻按鈕就退回這張票之前的一顆(完整 rollback)。
  const sideChoice = activeLobbyRally().inviteSideChoice;

  useEffect(() => {
    const t = setInterval(() => void refreshFriends(), FRIENDS_POLL_MS);
    return () => clearInterval(t);
  }, [refreshFriends]);

  // ⭐ GH#537 —— owner 2026-08-22:「朋友清單,有上線的應該會特別排到最上面顯示吧?」
  //
  // ⚠️ 排序吃的是**合併後**的狀態（WS 推播疊在 REST 快照上），⛔ 不是 `f.state`
  //    那一半 —— REST 是 `FRIENDS_POLL_MS = 10_000` 才重抓一次,拿它排等於「綠點
  //    已經亮了,人還在清單底下再待十秒」。決策與排序規則住 `friendOrder.ts`。
  const rows = orderFriends(
    friends?.friends ?? [],
    (f) => presence[f.id] ?? f.state,
    DEFAULT_LOBBY_LAYOUT.friendSort,
  );

  const iAmHost = !!room && room.room.hostId === meId && room.room.status === "open";
  const memberIds = new Set(room?.members.map((m) => m.accountId) ?? []);

  const submitAdd = (): void => {
    const n = name.trim();
    if (!n) return;
    void addFriend(n);
    setName("");
  };

  return (
    <Panel title="Friends" style={{ flex: 1, minHeight: 120 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <TextInput value={name} onChange={setName} placeholder="add by username" onEnter={submitAdd} />
        <Btn small onClick={submitAdd} kind="primary" style={{ flexShrink: 0 }}>
          Add
        </Btn>
      </div>

      {friends && friends.incoming.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: TEXT_DIM, textTransform: "uppercase", marginBottom: 4 }}>
            Requests
          </div>
          {friends.incoming.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
              <span style={{ flex: 1, fontSize: 13, color: TEXT_MAIN }}>{f.username || f.id}</span>
              <Btn small kind="primary" onClick={() => void acceptFriend(f.id)}>
                Accept
              </Btn>
              <Btn small onClick={() => void declineFriend(f.id)}>
                Decline
              </Btn>
            </div>
          ))}
        </div>
      )}

      {/* GH#514 —— 一列只有在「我是房主且對方在線」時才長出 Invite 按鈕，所以
          平常這整塊對手把沒有任何焦點落點 ⇒ 好友一多就捲不下去。 */}
      <div {...padFocusLanding()} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* ⭐ GH#537 ② —— owner:「似乎是**讀取不夠快**」。
            ⚠️ 在此之前這兩件事共用同一句話:清單**還沒到**(`friends === null`)
            跟**真的一個朋友都沒有**都印「No friends yet」。GH#499 之後 owner 的
            帳號有 **198 個**朋友,所以他在載入那一段看到的是一句**假話** ——
            而那正是「讀取不夠快」在畫面上的樣子。
            ⭐ 這條規矩隔壁的 `onlinePlayers.ts` 已經寫著了(「⛔ 永遠不是宣稱名單
            是空的理由」),朋友面板只是沒有照做。 */}
        {friends === null && (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>讀取朋友清單中…</div>
        )}
        {friends !== null && rows.length === 0 && (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>No friends yet — add one by username.</div>
        )}
        {rows.map((f) => {
          const state = presence[f.id] ?? f.state ?? "offline";
          // ⚠️ 「邀得動」比「排在上面」窄:`in-match` 的人亮著燈但正在打,
          //    所以他排在線上那一群的最後,而這裡不長 Invite 按鈕。
          const online = state === "online" || state === "in-lobby";
          return (
            <div key={f.id} style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
              <PresenceDot state={state} />
              <span style={{ flex: 1, fontSize: 13, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis" }}>
                {f.username || f.id}
              </span>
              <span style={{ fontSize: 10, color: state === "in-match" ? "#f2c637" : online ? OK : TEXT_DIM, marginRight: 6 }}>
                {state}
              </span>
              {iAmHost && online && !memberIds.has(f.id) && !sideChoice && (
                <Btn small title="invite to my room" onClick={() => void createInvite(f.id, f.username || f.id)}>
                  Invite
                </Btn>
              )}
              {/* ⭐ GH#655 —— 兩顆按鈕就是那句「選擇是隊友還是敵對方」。
                  ⚠️ 意向是**偏好不是硬性**(owner:「建議偏好(滿了就讓位)」)——
                  想要的那一隊滿了伺服器會落到下一隊,而**房間列表上每個人的隊伍**
                  就是落座那支函式算出來的,所以換邊在開打前就看得見(⛔ 不是靜靜地換)。 */}
              {iAmHost && online && !memberIds.has(f.id) && sideChoice && (
                <>
                  <Btn
                    small
                    kind="primary"
                    title="邀請進我的房間 —— 和我同一隊"
                    onClick={() => void createInvite(f.id, f.username || f.id, "ally")}
                  >
                    同隊
                  </Btn>
                  <Btn
                    small
                    title="邀請進我的房間 —— 坐到對面"
                    onClick={() => void createInvite(f.id, f.username || f.id, "enemy")}
                  >
                    對面
                  </Btn>
                </>
              )}
            </div>
          );
        })}
        {friends && friends.outgoing.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM }}>
            pending sent: {friends.outgoing.map((f) => f.username || f.id).join(", ")}
          </div>
        )}
      </div>
    </Panel>
  );
}
