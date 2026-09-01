/**
 * LobbyScreen — the post-auth hub: header (wallet / identity / store /
 * logout), friends panel, room browser or room view, leaderboard, plus the
 * live invite prompts pushed over the lobby WS.
 *
 * ---- TWO COLUMNS, AND THE LEFT ONE IS IN THREE -----------------------------
 * owner 2026-08-02: 「原本排行榜移到朋友列表下半部，各佔左邊排的上下各半」(GH#255)
 * owner 2026-08-03: 「大廳 FRIEND 跟排位榜 中間，多出一個區域顯示所有大廳正在線上
 * 的玩家列表，並且名字旁邊有按鈕可以一鍵加入朋友」
 *
 * The ladder used to own a third 280px column of its own; it now shares the
 * LEFT column with the friends list AND the new 線上玩家 panel, in that order:
 * 朋友列表 / 線上玩家 / 排位榜 at 40% / 30% / 30%. The three slots are flex
 * slots whose ORDER and SIZE both come from ./lobbyLayout — including the
 * split/stack decision on a short viewport and the phone stacking order, which
 * are policy values rather than literals buried in this JSX (see that module's
 * header for why).
 *
 * ---- ONE PLACE TO START A GAME (GH#258) ------------------------------------
 * owner: 「單人 vs BOT 變成 create room 底下預設的一個房間 (意思是這兩個也合併)」.
 * 一鍵開打 was a separate strip sitting above the room browser, so the lobby
 * offered two unrelated-looking ways in. The strip is now the room browser's
 * PINNED FIRST ENTRY — the default room, right under 「Create room」 — passed
 * down as `pinned` so it still renders from this file (it is lobby chrome, not
 * room-browser data) while living inside the list the owner asked for.
 *
 * ⚠️ It presses the SAME `playBotMatch` store action as before. That action is
 * where the #200 first-press fix lives (it awaits the one-time content load
 * BEFORE the platform mints a colyseus seat, so the reservation cannot expire
 * during a cold download and bounce the player back to the lobby). Merging the
 * entry points must never grow a second, hand-rolled start path — that would
 * silently drop the fix. See botMatchPrime.test.ts.
 *
 * TOP-RIGHT SAFE AREA (task #107): the header runs to the right edge, and the
 * persistent audio cluster is <body>-portaled above every screen — so ⚙
 * Settings / Logout used to render UNDERNEATH it. The header now RESERVES the
 * gutter the cluster publishes (`../chromeReserve`) instead of hard-coding a
 * width, and wraps rather than compressing into it.
 */
import { lobbyStoreOpen } from "@ggd/shared/content/schema/config/uiCues";
import { uiCues } from "../uiCuesConfig";
import { useState } from "react";
import { useApp } from "./store";
import { SettingsScreen } from "../SettingsScreen";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { FriendsPanel } from "./FriendsPanel";
import { LobbyAnnouncement } from "./LobbyAnnouncement";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { NemesisPanel } from "./NemesisPanel";
import { OnlinePlayersPanel } from "./OnlinePlayersPanel";
import { RallyConfirmDialog } from "./RallyConfirmDialog";
import { RoomListPanel } from "./RoomListPanel";
import { RoomView } from "./RoomView";
import { StoreScreen } from "./StoreScreen";
import { ValhallaPanel } from "./ValhallaPanel";
import { openCodex } from "../codex/CodexRoute";
import { topRightClear, topRightReserve } from "../chromeReserve";
import { PAD_BACK } from "../padModalScope";
import { Btn, MCoin, Crystal, Panel, CodeBox, ACCENT, OK, DANGER } from "./widgets";
import { useArenaOptions, DEFAULT_MAP_ID } from "./maps";
import {
  DEFAULT_LOBBY_LAYOUT,
  leftColumnSlots,
  leftColumnSlotStyle,
  leftColumnStyle,
  useLeftColumnMode,
} from "./lobbyLayout";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "../theme";

/** The lobby shell's own edge padding — also the header's `outerInset`. */
const LOBBY_PAD = 16;

function InviteToasts(): React.JSX.Element | null {
  const allInvites = useApp((s) => s.ws.invites);
  const joinByCode = useApp((s) => s.joinByCode);
  const dismissInvite = useApp((s) => s.dismissInvite);
  // ⭐ 大廳集合令（GH#492）走的是**確認視窗**（`RallyConfirmDialog`），⛔ 不是這裡
  // 的角落小提示 —— owner 的原話是「都跳出確認視窗」。分流的欄位在伺服器上
  // （`InvitePush.broadcast`），一對一的私人邀請完全沒有變。
  const invites = allInvites.filter((i) => i.broadcast !== true);
  if (invites.length === 0) return null;
  return (
    // right-aligned toasts pass UNDER the audio cluster rather than beside it
    // (they are 280px wide — reserving the gutter would squeeze them), so they
    // consume the published HEIGHT instead of the width.
    <div
      style={{
        position: "absolute",
        right: LOBBY_PAD,
        top: topRightClear({ min: 64, gap: 8 }),
        zIndex: 50,
        width: 280,
        pointerEvents: "auto",
      }}
    >
      {invites.map((inv) => (
        <Panel key={inv.token} style={{ marginBottom: 8, border: `1px solid ${ACCENT}` }}>
          <div style={{ fontSize: 13, color: TEXT_MAIN, marginBottom: 8 }}>
            Room invite: <span style={{ fontWeight: 700 }}>{inv.roomName || inv.roomId}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small kind="primary" onClick={() => void joinByCode(inv.token)}>
              Join
            </Btn>
            <Btn small onClick={() => dismissInvite(inv.token)}>
              Dismiss
            </Btn>
          </div>
        </Panel>
      ))}
    </div>
  );
}

/**
 * 錯誤小提示。
 *
 * ⭐ GH#513 —— 它在此之前是**一整塊 `<div onClick>`**，於是：
 * · 手把關不掉 —— `PadFocusNav` 只走得到 focusable（`<button>` / `<a>` / 表單
 *   元素），一個掛著 onClick 的 div 對它**不存在**，B 也找不到它（`findBackControl`
 *   先找 `data-pad-back`，再掃 focusable 的標籤）。一個純手把玩家因此得看著這行
 *   紅字直到下一個錯誤把它蓋掉。
 * · 鍵盤與讀螢幕器同理：Tab 停不下來，沒有 role、沒有名字。
 * ⇒ 關閉是一顆**真的** `<button>`，並且帶 `data-pad-back` —— 那是契約，
 *   ⛔ 不是 `backControlIndex` 的標籤啟發式（GH#271 就是那條啟發式惹的）。
 *
 * ⚠️ 外層那個 div 的 onClick **留著**：滑鼠玩家「點哪裡都能關」是既有行為，
 * 拿掉它會是一次無聲的退步。按鈕的 click 冒泡上去再呼叫一次 `clearError`
 * 是冪等的（`lastError` 已經是 null）。
 */
export function ErrorToast(): React.JSX.Element | null {
  const lastError = useApp((s) => s.lastError);
  const clearError = useApp((s) => s.clearError);
  if (!lastError) return null;
  return (
    <div
      onClick={clearError}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        position: "absolute",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 60,
        background: "#3a1c1e",
        border: "1px solid #7a3230",
        color: "#f0a0a0",
        fontSize: 12,
        borderRadius: 8,
        padding: "8px 14px",
        cursor: "pointer",
        pointerEvents: "auto",
      }}
    >
      <span>{lastError}</span>
      <button
        type="button"
        aria-label="關閉錯誤訊息"
        onClick={clearError}
        {...PAD_BACK}
        style={{
          flex: "0 0 auto",
          background: "transparent",
          border: "1px solid #7a3230",
          borderRadius: 6,
          color: TEXT_DIM,
          font: "inherit",
          fontSize: 11,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        ✕ 關閉
      </button>
    </div>
  );
}

/**
 * BOT MATCH STRIP (#188) — 「play offline with bot 也要開放給有註冊的玩家在大廳
 * 一鍵開房直接玩」 — and, since GH#258, the room browser's DEFAULT ROOM: it is
 * rendered as the pinned first entry of the Rooms list, directly under
 * 「Create room」, instead of as a separate strip above the browser.
 *
 * That merge is presentation only. The button still calls the store's
 * `playBotMatch`, which is the shipped route (POST /rooms/solo) and the place
 * the #200 first-press fix lives. Nothing here starts a match by itself.
 *
 * TWO BUTTONS THAT LOOK DIFFERENT BECAUSE THEY ARE DIFFERENT:
 *
 *  · 一鍵開打 (primary, oversized, first thing in the play column) →
 *    `playBotMatch` → POST /rooms/solo. The platform creates a private room,
 *    starts it with 11 bots and pushes the seat token over the lobby WS. The
 *    match RECORDS and pays. This is a game mode, and it has to LOOK like one:
 *    a family member opening the lobby must see, without reading, that this is
 *    the button that starts a game.
 *
 *  · dev 直連 (small ghost, parked on the footnote row) → `playOffline` → joins
 *    the game server directly with NO platform match. Nothing settles: no
 *    record, no season points, no 水晶, no ladder row. It stays because the
 *    owner tests with it and the #replay= / offline flows share the launch —
 *    but it is labelled as what it is instead of being the only way to "play
 *    vs bots".
 *
 * ---- WHY THE PAYOUT IS PRINTED ON THE PANEL, NOT IN A TOOLTIP --------------
 * This mode pays LESS than a full human lobby, and the difference is structural
 * (`gamelink/callback.go`), not a bug:
 *   · 水晶 — judged on the EARNER'S OWN TEAM. A bot beside you HALVES the grant
 *     (integer halving, rounds down). That is the anti-farm rule: soloing bots
 *     forever pays at most half rate.
 *   · M幣 — requires an ALL-HUMAN 12-seat lobby. A bot anywhere pays zero, so a
 *     bot match mints none, by construction.
 *   · MMR — unchanged, and that falls out of `ranking/elo.go` rather than the
 *     anti-farm rule: fewer than two teams holding a human is not a rated
 *     contest. Worth saying out loud because it is GOOD news — beating bots
 *     cannot wreck the number that matches you against your family.
 *   · 戰績 / 賽季積分 — ungated. Games, wins and +points all move.
 * A mode that silently pays half is how you lose trust in the economy the first
 * time somebody counts their crystals. So the three deltas are BADGES next to
 * the button, at the moment of the decision — short, and unapologetic: half is
 * still worth playing.
 *
 * ---- LAYOUT (#107 safe-area contract, #151/#159 phone) ---------------------
 * Nothing here is absolutely positioned. The strip is an ordinary Panel in the
 * lobby's centre `.ggd-lobby-col`, so it inherits the column's flow and the
 * header keeps owning the top-right gutter it reserves from `chromeReserve` —
 * no new claim on persistent chrome. Both halves are `flex: 1 1 <basis>` with
 * wrap, so at 390px they stack: info block, then a full-width action row where
 * the primary button grows to the whole column. Buttons are `Btn`, so they
 * carry the shared hover/click SFX (#24) — a raw <button> would be silent.
 */
function RewardBadge(props: { color: string; text: string; title: string }): React.JSX.Element {
  return (
    <span
      title={props.title}
      style={{
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.6,
        color: props.color,
        border: `1px solid ${props.color}66`,
        background: `${props.color}14`,
        borderRadius: 6,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {props.text}
    </span>
  );
}

function BotMatchStrip(props: { mapId: string; onMapId: (id: string) => void }): React.JSX.Element {
  // ⭐ 從 `Arenas` 登錄表推導(GH#324 的七張新圖以前選不到)。
  const arenaOpts = useArenaOptions();
  const playBotMatch = useApp((s) => s.playBotMatch);
  const playOffline = useApp((s) => s.playOffline);
  const busy = useApp((s) => s.botMatchBusy);
  // 肉鴿殭屍模式 (#215) — default ON; only sends `false` to the solo path when
  // unchecked. The empty-body solo default already means ON server-side.
  const [rogueliteMobs, setRogueliteMobs] = useState(true);
  return (
    <Panel
      data-ggd-default-room=""
      style={{
        border: `1px solid ${ACCENT}88`,
        background: `linear-gradient(180deg, ${ACCENT}1f 0%, ${PANEL_BG} 62%)`,
        gap: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        {/* WHAT IT IS + WHAT IT PAYS — one block, so the reward never scrolls
            away from the name of the mode. */}
        <div style={{ flex: "1 1 230px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1, color: TEXT_MAIN }}>
              單人 vs BOT
            </div>
            {/* GH#258: says WHY this row sits above the open rooms — it is not
                somebody's room, it is the one that is always here. */}
            <RewardBadge color={ACCENT} text="預設房間" title="這一格永遠在：不用等人，按下去就開一場對 BOT 的正式比賽" />
          </div>
          <div style={{ fontSize: 12, color: TEXT_DIM, margin: "3px 0 7px" }}>
            一個人也能開打 —— 真的<span style={{ color: GOLD, fontWeight: 700 }}>計分</span>、記戰績、上排行榜
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <RewardBadge color={GOLD} text="水晶 ½" title="隊上有 BOT，水晶減半（無條件捨去）" />
            <RewardBadge color={TEXT_DIM} text="無 M幣" title="M幣要 12 個位置全是真人才會發" />
            <RewardBadge color={TEXT_DIM} text="MMR 不變" title="打 BOT 不列入對戰評分，不會影響你跟家人的配對" />
          </div>
        </div>

        {/* THE DECISION. `flex: 1 1 260px` + wrap ⇒ on a 390px phone this row
            drops below the info block and the button grows to full width. The
            maxWidth is the desktop half of the same contract: without it the
            pair keeps absorbing the whole centre column and a five-option
            arena dropdown ends up 500px wide on a 1600px monitor. */}
        <div
          style={{
            flex: "1 1 260px",
            maxWidth: 440,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <select
            value={props.mapId}
            onChange={(e) => props.onMapId(e.target.value)}
            title="選擇競技場"
            style={{
              flex: "1 1 130px",
              minWidth: 0,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #2c3448",
              background: "#10141f",
              color: TEXT_MAIN,
              fontSize: 12,
            }}
          >
            {arenaOpts.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <label
            title="第3場起喪標麥可喪屍湧入 (預設開啟)"
            style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 100%", fontSize: 12, color: TEXT_MAIN, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={rogueliteMobs}
              onChange={(e) => setRogueliteMobs(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            肉鴿殭屍模式
          </label>
          <Btn
            kind="primary"
            disabled={busy}
            onClick={() => void playBotMatch(props.mapId, rogueliteMobs)}
            title="開一場真正的對 BOT 比賽：記戰績、算賽季積分、發水晶（減半），不發 M幣、不動 MMR"
            style={{
              flex: "1.4 1 160px",
              padding: "13px 22px",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            {/* VS16 on the swords: without it U+2694 falls back to the TEXT
                glyph, which at this size renders as a thin ✕ — a start button
                that looks like a cancel button. */}
            {busy ? "開房中…" : "⚔️ 一鍵開打"}
          </Btn>
        </div>
      </div>

      {/* the honest footnote, and the dev shortcut parked well away from the
          thing the family is meant to press. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          borderTop: "1px solid rgba(120, 140, 190, 0.18)",
          paddingTop: 8,
        }}
      >
        <div style={{ flex: "1 1 220px", fontSize: 11, color: TEXT_DIM, lineHeight: 1.5 }}>
          隊上有 BOT，水晶只發一半；M幣要 12 人全真人。半份也是白賺，想拿滿就揪人。
        </div>
        {/* 練習模式 (GH#343, owner 2026-08-17：「練習模式也開放線上喔，只是完全
            沒有獎勵積分」)。⭐ 場地下拉與肉鴿開關**重用**上面那兩顆，角色照常在
            選角相位挑 —— 那些事本來就有了，這一批缺的只是「這是練習房」那格旗標。

            ⚠️ 它現在走 `playBotMatch(..., practice=true)`，⛔ 不再走 `playOffline`。
            playOffline 是 dev 直連（客戶端自己 joinOrCreate），而正式站的 game
            shard 一定帶 shared secret，`MatchRoom` 會用 createToken 擋下所有非平台
            的建房 —— 也就是說這顆按鈕在線上**從來沒有真的開起來過**。改走平台
            solo reservation 之後它跟一鍵開打是同一條路，只多帶一格旗標。

            `busy` 共用是刻意的：兩顆按鈕最後都是一張座位，一次只能有一張。 */}
        <Btn
          small
          kind="ghost"
          disabled={busy}
          onClick={() => void playBotMatch(props.mapId, rogueliteMobs, true)}
          title="練習模式：進去沒有對手、時間到也不會被踢回商店，可以開測試碼、即時生殭屍。不記錄戰績、不算積分、不發水晶。"
        >
          練習模式
        </Btn>
        <Btn
          small
          kind="ghost"
          onClick={() => playOffline(props.mapId)}
          title="dev 直連（不經平台）：不記錄戰績、不算積分、不發水晶。測試用。"
          style={{ opacity: 0.55 }}
        >
          dev 直連
        </Btn>
      </div>
    </Panel>
  );
}

/**
 * REFERRAL PANEL (task #203) — the player's own single-use invite code, so a
 * family member on an invite-gated deploy can hand a friend a way in. On a
 * non-gated dev platform the account carries no code, so the panel renders
 * nothing (no empty box, no dead copy button). An ordinary Panel in the lobby
 * flow — it claims no persistent chrome (#107 safe-area contract).
 *
 * The auto-approval half of the feature (a consumed code fast-tracks a PENDING
 * inviter) is surfaced at REGISTRATION, where the pending person actually is;
 * a lobby viewer is already approved, so here the message is simply "invite a
 * friend". The code is single-use, which the copy makes honest: it is for one
 * friend, and the server mints the next account its own.
 *
 * ONCE IT IS SPENT, THE PANEL SAYS SO (#237). The code is single-use, and the
 * server now withholds `referralCode` the moment the invite document is burned —
 * before that it kept handing back a string this box printed under「分享給一位
 * 朋友」, so the player kept giving friends a code the gate answered with
 * 「這組邀請碼已經被使用過了」. `referralCodeStatus` survives the withholding, so
 * the panel reports what became of the code instead of silently disappearing:
 * the used state is information the player wants (it means their invite landed),
 * not clutter to hide.
 */
export type ReferralPanelView =
  /** no code on this account at all — render nothing */
  | { kind: "none" }
  /** a live code to share */
  | { kind: "offer"; code: string }
  /** the code is gone; `why` is the sentence explaining what happened to it */
  | { kind: "spent"; why: string };

/**
 * What the panel should show, as a pure decision (testable without React, and
 * without zustand's server-snapshot caveat that keeps the render tests from
 * seeing store state).
 *
 * The ONLY input that may put a code in front of the player is `code` — which
 * the server withholds unless the invite store says it is live — so this cannot
 * re-introduce #237 by, say, falling back to a cached value.
 */
export function referralPanelView(code?: string, status?: string): ReferralPanelView {
  if (code) return { kind: "offer", code };
  if (!status) return { kind: "none" };
  if (status === "redeemed") return { kind: "spent", why: "你的專屬邀請碼已經被朋友使用了 —— 一組只能用一次。" };
  if (status === "expired") return { kind: "spent", why: "你的專屬邀請碼已經過期了。" };
  if (status === "revoked") return { kind: "spent", why: "你的專屬邀請碼已經被管理員撤銷了。" };
  // "unknown" (or anything a newer server invents): the code is not usable, and
  // saying so vaguely is still better than offering it.
  return { kind: "spent", why: "你的專屬邀請碼目前無法使用。" };
}

function ReferralPanel(): React.JSX.Element | null {
  const referralCode = useApp((s) => s.account?.referralCode);
  const status = useApp((s) => s.account?.referralCodeStatus);
  const view = referralPanelView(referralCode, status);
  if (view.kind === "none") return null;
  if (view.kind === "spent") {
    return (
      <Panel title="邀請好友" style={{ gap: 8 }}>
        <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>{view.why}</div>
        <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.5 }}>
          想再邀請其他人，請向管理員索取新的邀請碼。
        </div>
      </Panel>
    );
  }
  const referralCodeToShare = view.code;
  return (
    <Panel title="邀請好友" style={{ gap: 8 }}>
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        把這組<span style={{ color: ACCENT, fontWeight: 700 }}>專屬邀請碼</span>分享給一位朋友，他就能註冊加入去死團。
      </div>
      <CodeBox value={referralCodeToShare} />
      <div style={{ fontSize: 11, color: TEXT_DIM, lineHeight: 1.5 }}>
        限用一次。想邀更多人，可再向管理員索取邀請碼。
      </div>
    </Panel>
  );
}

export function LobbyScreen(): React.JSX.Element {
  const account = useApp((s) => s.account);
  const wallet = useApp((s) => s.wallet);
  const wsStatus = useApp((s) => s.wsStatus);
  const lobbyView = useApp((s) => s.lobbyView);
  // ⭐ GH#911 —— 那一頁裝著**兩種商品、兩種貨幣**：英雄（藍水晶，靠遊玩賺）＋ 造型（M 幣）。
  //   owner：「商店買角色的部分好像被關掉了 **我只要關掉買模組特效的部分**」
  //   ⇒ 按鈕與路由只問「這一頁進不進得去」（任一半開著就進得去），
  //   ⛔ 而**哪一半畫出來**是 StoreScreen 自己的事。
  //   ⚠️ 兩個讀端（按鈕 ＋ 底下的 body）問**同一支函式**，⛔ 不是各自寫一次條件。
  const storeOpen = lobbyStoreOpen(uiCues()).page;
  const setLobbyView = useApp((s) => s.setLobbyView);
  const room = useApp((s) => s.room);
  const doLogout = useApp((s) => s.doLogout);
  // 大廳公告 (#259): the header chip that reopens a dismissed announcement. It
  // exists only while there IS one, so a lobby with no announcement gains no
  // new control at all.
  const announcement = useApp((s) => s.announcement);
  const openAnnouncement = useApp((s) => s.openAnnouncement);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [offlineMap, setOfflineMap] = useState(DEFAULT_MAP_ID);
  // GH#255 — split the left column into halves, or stack them when the column
  // is too short/narrow for two readable halves. The decision is ./lobbyLayout's.
  const leftMode = useLeftColumnMode(DEFAULT_LOBBY_LAYOUT);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
        background: "radial-gradient(ellipse at 50% 0%, #131a2c 0%, #0b0e14 65%)",
        padding: LOBBY_PAD,
        boxSizing: "border-box",
        gap: 12,
      }}
    >
      {/* header — reserves the audio cluster's PUBLISHED gutter (task #107) and
          wraps into a second row instead of sliding underneath it. */}
      <div
        data-ggd-lobby-header=""
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px 14px",
          boxSizing: "border-box",
          paddingRight: topRightReserve({ outerInset: LOBBY_PAD }),
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, color: TEXT_MAIN }}>去死團的逆襲</div>
        <div style={{ fontSize: 11, color: TEXT_DIM }}>
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              borderRadius: "50%",
              marginRight: 5,
              background: wsStatus === "connected" ? OK : wsStatus === "connecting" ? GOLD : DANGER,
            }}
          />
          lobby {wsStatus}
        </div>
        <div style={{ flex: 1 }} />
        <Crystal amount={wallet?.crystal ?? 0} size={15} />
        <MCoin amount={wallet?.mcoin ?? 0} size={15} />
        <div style={{ fontSize: 13, color: TEXT_MAIN }}>
          {account?.username}
          <span style={{ color: TEXT_DIM, fontSize: 11 }}> · MMR {account?.mmr ?? "—"}</span>
        </div>
          {/* ⭐⭐ GH#896 —— owner 2026-09-01：「關閉模組商店(大廳上面可選到的 store)，
              **這個根本還沒做好不開放**」。⛔ 程式碼一行都沒刪 —— 一格開關
              (`config.ui-cues@1` 的 `lobbyStore.enabled`，出貨 false)。 */}
          {storeOpen && (
            <Btn small kind={lobbyView === "store" ? "primary" : "ghost"} onClick={() => setLobbyView(lobbyView === "store" ? "play" : "store")}>
            {lobbyView === "store" ? "Back to lobby" : "Store"}
            </Btn>
          )}
        {announcement && (
          <Btn small onClick={openAnnouncement} title={`最新公告：${announcement.title}`}>
            📢 公告
          </Btn>
        )}
        <Btn small onClick={openCodex} title="內容圖鑑：所有道具 / 英雄 / 技能的完整資料 (#codex)">
          📖 圖鑑
        </Btn>
        <Btn small onClick={() => setSettingsOpen(true)} title="graphics & network settings">
          ⚙ Settings
        </Btn>
        <Btn small onClick={() => setPasswordOpen(true)} title="修改我的登入密碼 · change your own password">
          🔑 密碼
        </Btn>
        <Btn small kind="danger" onClick={() => void doLogout()}>
          Logout
        </Btn>
      </div>
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}

      {/* body */}
        {/* ⭐ GH#896 的第二半 —— ⚠️ 票文自己點出的陷阱：「『關掉入口』與『關掉功能』
            是兩件事 —— 只藏按鈕而路由還在，知道網址的人照樣進得去」。
            ⇒ ⭐ 這裡**也**讀同一格：一份存著 `lobbyView:"store"` 的舊瀏覽器狀態
            會退回大廳，⛔ 而不是繞過那顆藏起來的按鈕。 */}
        {storeOpen && lobbyView === "store" ? (
        <StoreScreen />
      ) : (
        // .ggd-lobby-body / .ggd-lobby-col let platform/ranking.css stack these
        // TWO columns on a narrow viewport (phone portrait) — desktop keeps the
        // inline widths untouched. (Two COLUMNS, since GH#255 moved the ladder
        // into the left one; the stylesheet rule is per-column, so neither that
        // change nor the 線上玩家 panel added inside the left column touched it.)
        <div className="ggd-lobby-body" style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          {/* LEFT COLUMN (GH#255 + owner 2026-08-03 + GH#454) — 朋友列表 /
              線上玩家 / 宿敵榜 / 排位榜. Every slot's ORDER and SIZE comes from
              ./lobbyLayout, so the shares are one set of policy numbers and
              BOTH the desktop order and the phone stacking order are policy
              values rather than the order somebody happened to type here
              (two panels now claim 「between 朋友 and 排位榜」 — see that
              module's header). Each slot scrolls
              inside itself and clips horizontally, which is what keeps a long
              name or a wide ladder row from widening the whole page. */}
          <div
            className="ggd-lobby-col"
            data-ggd-lobby-left=""
            style={leftColumnStyle(DEFAULT_LOBBY_LAYOUT)}
          >
            {leftColumnSlots(leftMode, DEFAULT_LOBBY_LAYOUT).map((slot) => (
              <div
                key={slot}
                data-ggd-lobby-slot={slot}
                style={leftColumnSlotStyle(slot, leftMode, DEFAULT_LOBBY_LAYOUT)}
              >
                {slot === "friends" && (
                  <>
                    <FriendsPanel />
                    {/* 邀請好友 lives with the friend list it is about; it
                        renders null on an account with no code, so on most days
                        the top slot is the friends panel alone. */}
                    <ReferralPanel />
                  </>
                )}
                {slot === "online" && <OnlinePlayersPanel policy={DEFAULT_LOBBY_LAYOUT} />}
                {slot === "nemesis" && <NemesisPanel policy={DEFAULT_LOBBY_LAYOUT} />}
                {slot === "leaderboard" && <LeaderboardPanel />}
              </div>
            ))}
          </div>
          <div className="ggd-lobby-col" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {/* 英靈殿 (#258) — owner: 「大廳中央上面 (單人vsBot 之上)」. It is an
                ordinary Panel in the column's flow, so it inherits the gap and
                claims no persistent chrome (#107); it collapses to one line
                under 520px of viewport height so it can never push 一鍵開打
                off a phone in landscape (#151/#247). Hidden inside a room,
                where the column belongs to the room view. */}
            {!room && <ValhallaPanel />}
            {/* GH#258 — 單人 vs BOT is now the room browser's default room, so
                it is handed DOWN into the Rooms list instead of being its own
                strip above it. Same component, same `playBotMatch` press. */}
            {room ? <RoomView /> : <RoomListPanel pinned={<BotMatchStrip mapId={offlineMap} onMapId={setOfflineMap} />} />}
          </div>
        </div>
      )}

      <InviteToasts />
      {/* ⭐ 大廳集合令的確認視窗（GH#492）。⚠️ 掛在 ErrorToast **之前**只是排版
          順序；它自己是 inset:0 的 overlay，該不該出現由它自己判（有沒有 broadcast
          邀請、倒數到期了沒）。 */}
      <RallyConfirmDialog />
      <ErrorToast />
      {/* 大廳公告 (#259) — 「玩家會在大廳跳出訊息看到」. Self-gating: renders null
          unless the public feed handed us an announcement this browser has not
          already closed, so on an ordinary day the lobby is byte-identical to
          what it was. It is LAST in the tree and `position: fixed`, so it sits
          over the lobby without disturbing any panel's layout — and it stops
          short of the build-stamp band rather than covering it (#66/#107). */}
      <LobbyAnnouncement />
    </div>
  );
}
