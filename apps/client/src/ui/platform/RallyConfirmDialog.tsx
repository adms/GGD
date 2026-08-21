/**
 * RallyConfirmDialog — 大廳集合令的**確認視窗**（GH#492）。
 *
 * owner 2026-08-21 逐字：
 *
 * > 「創建房間最重要的就是拉人進來，請你將**所有線上在大廳的人都跳出確認視窗**
 * >  是否進入房間一起開始，同意後就一起進入開始遊戲，**最多等 10 秒**」
 *
 * ── ⭐ 2026-08-21 語意反轉：**倒數結束 = 加入** ──────────────────────────────
 * owner 同日逐字（推翻了這個檔案的第一版）：
 *
 * > 「你說的是對的，**預設是加入，五秒是讓人按否定的**」
 *
 * ⇒ 主要按鈕是「**不要**」，⛔ 不是「同意」；**沒有互動就進房**。
 * ⛔ 這不是措辭差異：opt-in 要人**主動點同意** ——
 * opt-in 之下幾乎沒有人來得及按，而這張票的目的是「拉人進來」。
 * 後台一格 `joinMode` 可以切回 opt-in（rollback），⛔ 但預設是 opt-out。
 *
 * ── ⚠️ opt-out 帶來的新問題，與它的答案 ───────────────────────────────────
 * opt-in 之下「沒反應 = 不加入」是安全的；opt-out 之下「沒反應 = **被拉進一場比賽**」。
 * 一個掛機的人被拉進去然後整場不動，對其他九個人**比少一個人更糟**。三道閘：
 *  · **人不在螢幕前就不自動加入**（`rallyIdle`：N 秒沒有輸入、或分頁在背景）——
 *    視窗留著，他回來仍然可以自己按「加入」。⛔ 判斷在瀏覽器，因為平台的 presence
 *    heartbeat 是計時器送的，伺服器分不出「在」和「開著分頁去睡覺」。
 *  · **進去之後出得來**：開場前是房間的「Leave」，開場後是暫停選單的「離開」
 *    （`ui/LeaveConfirmDialog`）。⛔ 那五秒不是唯一的機會。
 *  · **在比賽中／在別的房間裡的人根本收不到**（伺服器端 `internal/room/rally.go`）。
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
 * ── 倒數的四個規矩 ──────────────────────────────────────────────────────
 * ① **從 `expiresAt` 算，⛔ 不從收到訊息的那一刻起算。** sockets 送達時間不同，
 *    各自起算會讓比賽已經開打而某個人的視窗還寫著「4 秒」。
 * ② **到期就自己關掉。** 一個過期的「加入」按下去只會拿到 404，而 owner 說的是
 *    「最多等 10 秒」—— 十秒之後這個視窗就不該還在螢幕上。
 * ③ **算式在 `lobbyRally.ts`（純函式）。** 這個檔案只畫、只送出那一個 request。
 * ④ ⭐ **視窗數到的是「自動加入」那一刻，⛔ 不是主揪按開始那一刻**
 *    （`rallyDeadline`）。自動加入必須**早**一點點：主揪在 `expiresAt` 按下開始，
 *    一間已經開打的房會把同一刻送出的加入請求拒掉 ⇒「預設加入」變成「預設加入失敗」。
 *
 * ── ⛔ 它不會打斷比賽 ────────────────────────────────────────────────────
 * 這一點不是靠這個元件只掛在大廳畫面上（那只是第二道），而是靠伺服器**根本不送**
 * 給 `presence.in-match` 的人（`internal/room/rally.go`）。owner 的規則是
 * 「所有線上**在大廳**的人」。
 */
import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";
import { Btn, ACCENT, Panel } from "./widgets";
import { padModalScope } from "../padModalScope";
import { activeLobbyRally, rallyAutoJoin, rallyCountdown, rallyDeadline } from "./lobbyRally";
import { lastUserInputAt, tabHidden } from "./userIdle";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

/** 倒數重畫的節奏。⚠️ 只影響**畫面**；到期的判斷永遠是 `expiresAt` vs `now`。 */
const TICK_MS = 200;

export function RallyConfirmDialog(): React.JSX.Element | null {
  const invites = useApp((s) => s.ws.invites);
  const acceptRally = useApp((s) => s.acceptRally);
  const dismissInvite = useApp((s) => s.dismissInvite);
  const inRoom = useApp((s) => s.room !== null);
  const [now, setNow] = useState(() => Date.now());
  // 已經替哪一枚 token 自動送出過加入 —— ⛔ 一則集合令只准送一次：倒數每 200ms
  // 重畫一次，少了這一格會變成每秒五個 join request。
  const autoJoined = useRef<string | null>(null);

  const policy = activeLobbyRally();
  // 最新的一則集合令。⚠️ 兩個主揪同時喊的時候只畫一個 —— 兩個蓋在一起的 modal
  // 是兩個都按不到的 modal。
  const call = invites.filter((i) => i.broadcast === true).at(-1) ?? null;
  const expiresAt = call?.expiresAt ?? 0;
  const waitSec = call?.waitSec ?? 0;

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

  // ⭐ **這一段就是「預設是加入」**（owner 2026-08-21）。沒有人按任何東西，
  // 倒數走完，這台瀏覽器自己送出加入 —— 而 `rallyAutoJoin` 是唯一決定「要不要」
  // 的地方（opt-in / 在別的房間 / 掛機 / 過期都在那裡擋掉）。
  const verdict = call
    ? rallyAutoJoin(policy, {
        expiresAt,
        waitSec,
        now,
        lastInputAt: lastUserInputAt(),
        hidden: tabHidden(),
        inRoom,
      })
    : "waiting";
  useEffect(() => {
    if (!call || verdict !== "join") return;
    if (autoJoined.current === call.token) return;
    autoJoined.current = call.token;
    void acceptRally(call.token);
  }, [call, verdict, acceptRally]);

  if (!call) return null;
  // 已經在房間裡的人不用被自己的畫面攔一次（⚠️ 主揪自己不會收到，這裡擋的是
  // 「我剛好在別的房間裡」那種情況）。
  if (inRoom) return null;
  // 視窗上的倒數數到**自動加入**那一刻（opt-in 之下就是期限本身），見規矩④。
  const cd = rallyCountdown(rallyDeadline(policy, expiresAt, waitSec), waitSec, now);
  if (expiresAt !== 0 && now >= expiresAt) return null;
  const optOut = policy.joinMode === "opt-out";
  // ⚠️ 掛機的人看到的是**另一句話**：視窗不會替他進房，⛔ 但也不騙他說會。
  const idle = optOut && verdict === "idle";

  const host = call.fromName?.trim() || call.from;
  return (
    <div
      // GH#504 — 60, 同 LeaveConfirmDialog：這是一個**有期限**的終局選擇。
      // 沒有它的時候 scope 退回 document.body，方向鍵會把焦點移到遮罩底下的
      // 大廳按鈕（建房 / 一鍵開打 / 登出），而 pad 的 A 是 `el.click()` ——
      // scrim 擋得住滑鼠，擋不住手把。
      {...padModalScope("rally-confirm")}
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
        {/* 倒數條。⭐ 到期就**把你送進房**（opt-out），所以它必須看得見。 */}
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
        <div style={{ fontSize: 11, color: idle ? GOLD : TEXT_DIM }} data-testid="rally-hint">
          {idle
            ? "⚠️ 你剛剛不在 —— 這一場需要自己按「加入」"
            : optOut
              ? `${cd.secondsLeft} 秒後自動加入 —— 不想去就按「不要」`
              : `${cd.secondsLeft} 秒後開始 —— 沒趕上的位子會由 BOT 補上`}
        </div>
        {/* ⭐ 按鈕的**順序與強調**跟著 joinMode 走：opt-out 之下要按的是否定，
            所以「不要」是那顆大的；「立刻加入」只是把等待跳過去。
            ⛔ 兩邊都保留 —— 一個只有否定按鈕的視窗會讓想早點進去的人乾等。 */}
        <div style={{ display: "flex", gap: 8 }}>
          {optOut && !idle ? (
            <>
              {/* ⛔「不要」「不了」都不在 backControlIndex 的允許字裡，⛔ 也不可以
                  為了它們去放寬那張表（那正是 #271 的全域誤觸）。padBack 讓 B
                  精準關到這一顆。 */}
              <Btn kind="danger" padBack onClick={() => dismissInvite(call.token)} style={{ flex: 1 }}>
                不要
              </Btn>
              <Btn onClick={() => void acceptRally(call.token)}>立刻加入</Btn>
            </>
          ) : (
            <>
              <Btn kind="primary" onClick={() => void acceptRally(call.token)} style={{ flex: 1 }}>
                加入
              </Btn>
              <Btn padBack onClick={() => dismissInvite(call.token)}>不了</Btn>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
