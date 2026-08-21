/**
 * RallyConfirmDialog — 大廳集合令的**確認視窗**（GH#492）。
 *
 * owner 2026-08-21 逐字：
 *
 * > 「創建房間最重要的就是拉人進來，請你將**所有線上在大廳的人都跳出確認視窗**
 * >  是否進入房間一起開始，同意後就一起進入開始遊戲，**最多等 10 秒**」
 *
 * ── 為什麼它是 modal，而角落那個小提示還在 ────────────────────────────────
 * 2026-08-21 之前唯一的邀請是**一對一**的（`createInvite` → 一則角落 toast），
 * 而 owner 要的是「**跳出確認視窗**」。兩者現在並存，靠 push 上的 `broadcast` 分流：
 *
 *   · `broadcast` 缺席 → 私人邀請 → 角落 toast（`InviteToasts`，沒有變）
 *   · `broadcast: true` → 集合令 → **這個視窗**：置中、蓋住畫面、帶倒數
 *
 * 分流的欄位在**伺服器**上（`room.InvitePush.Broadcast`），⛔ 不是靠「收件人多不多」
 * 之類的客戶端猜測 —— 一個人的大廳裡，集合令只送給一個人。
 *
 * ── 倒數的三個規矩 ──────────────────────────────────────────────────────
 * ① **從 `expiresAt` 算，⛔ 不從收到訊息的那一刻起算。** sockets 送達時間不同，
 *    各自起算會讓比賽已經開打而某個人的視窗還寫著「4 秒」。
 * ② **到期就自己關掉。** 一個過期的「加入」按下去只會拿到 404，而 owner 說的是
 *    「最多等 10 秒」—— 十秒之後這個視窗就不該還在螢幕上。
 * ③ **算式在 `lobbyRally.ts` 的 `rallyCountdown()`（純函式）。** 這個檔案只畫。
 *
 * ── ⛔ 它不會打斷比賽 ────────────────────────────────────────────────────
 * 這一點不是靠這個元件只掛在大廳畫面上（那只是第二道），而是靠伺服器**根本不送**
 * 給 `presence.in-match` 的人（`internal/room/rally.go`）。owner 的規則是
 * 「所有線上**在大廳**的人」。
 */
import { useEffect, useState } from "react";
import { useApp } from "./store";
import { Btn, ACCENT, Panel } from "./widgets";
import { rallyCountdown } from "./lobbyRally";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

/** 倒數重畫的節奏。⚠️ 只影響**畫面**；到期的判斷永遠是 `expiresAt` vs `now`。 */
const TICK_MS = 200;

export function RallyConfirmDialog(): React.JSX.Element | null {
  const invites = useApp((s) => s.ws.invites);
  const acceptRally = useApp((s) => s.acceptRally);
  const dismissInvite = useApp((s) => s.dismissInvite);
  const inRoom = useApp((s) => s.room !== null);
  const [now, setNow] = useState(() => Date.now());

  // 最新的一則集合令。⚠️ 兩個主揪同時喊的時候只畫一個 —— 兩個蓋在一起的 modal
  // 是兩個都按不到的 modal。
  const call = invites.filter((i) => i.broadcast === true).at(-1) ?? null;
  const expiresAt = call?.expiresAt ?? 0;

  useEffect(() => {
    if (!call) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [call]);

  // 到期自己收掉（規矩②）。⚠️ 放在 effect 而不是 render 裡 —— render 期間改 store
  // 是 React 的未定義行為。
  useEffect(() => {
    if (!call || expiresAt === 0) return;
    if (now >= expiresAt) dismissInvite(call.token);
  }, [call, expiresAt, now, dismissInvite]);

  if (!call) return null;
  // 已經在房間裡的人不用被自己的畫面攔一次（⚠️ 主揪自己不會收到，這裡擋的是
  // 「我剛好在別的房間裡」那種情況）。
  if (inRoom) return null;
  const cd = rallyCountdown(expiresAt, call.waitSec ?? 0, now);
  if (expiresAt !== 0 && cd.expired) return null;

  const host = call.fromName?.trim() || call.from;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6, 9, 16, 0.62)",
        pointerEvents: "auto",
      }}
    >
      <Panel
        data-testid="rally-confirm"
        style={{ width: 360, maxWidth: "88vw", border: `2px solid ${ACCENT}`, gap: 10 }}
      >
        <div style={{ fontSize: 12, letterSpacing: 2, color: GOLD, fontWeight: 800 }}>
          大廳集合令
        </div>
        <div style={{ fontSize: 15, color: TEXT_MAIN, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 800 }}>{host}</span>
          {/* 主揪的積分。⛔ 0 不畫 —— 「0 分」是一個假的事實，缺席才是誠實的。 */}
          {(call.fromMmr ?? 0) > 0 && (
            <span style={{ color: TEXT_DIM, fontSize: 12 }}> · 積分 {call.fromMmr}</span>
          )}
          <br />
          開了「<span style={{ fontWeight: 700 }}>{call.roomName || call.roomId}</span>
          」，要不要一起打？
        </div>
        {/* 倒數條。到期就開場,不管你有沒有按 —— 所以它必須看得見。 */}
        <div style={{ height: 6, background: "#1b2233", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(cd.fraction * 100)}%`,
              background: ACCENT,
              transition: `width ${TICK_MS}ms linear`,
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: TEXT_DIM }}>
          {cd.secondsLeft} 秒後開始 —— 沒趕上的位子會由 BOT 補上
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="primary" onClick={() => void acceptRally(call.token)} style={{ flex: 1 }}>
            加入
          </Btn>
          <Btn onClick={() => dismissInvite(call.token)}>不了</Btn>
        </div>
      </Panel>
    </div>
  );
}
