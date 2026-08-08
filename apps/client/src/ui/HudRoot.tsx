/**
 * HudRoot — the React DOM overlay. Panel visibility switches on match.phase
 * (discrete, from the Zustand RoomStore). NO @babylonjs imports anywhere
 * under ui/ — world-anchored elements read the frameBus written by render/.
 */
import { useHud } from "../net/RoomStore";
import { isTouchDevice, readTouchEnv, showTouchControls } from "../input/mobileDetect";
import { WorldAnchorLayer } from "./WorldAnchorLayer";
import { TouchControls } from "./TouchControls";
import { hudTouch } from "./hud/HudSlot";
import { hudSlotHeight, hudSlotStyle } from "./hud/hudLayout";
import { useHudSlotHidden } from "./hud/useHudPanels";
import { RoundOverPill } from "./hud/RoundOverPill";
import { EquipmentBar } from "./hud/EquipmentBar";
import { ControlLegend } from "./ControlLegend";
import { CouchHudGrid } from "./components/CouchHudGrid";
import { AbilityBar } from "./components/AbilityBar";
import { AbilityDescriptionOverlay } from "./AbilityDescriptionOverlay";
import { CastNoticeLine } from "./components/CastNotice";
import { BottomCluster } from "./hud/BottomCluster";
import { ExUnlockToast } from "./components/ExUnlockToast";
import { ResourceBars } from "./components/ResourceBars";
import { EnemyTeamPanel } from "./components/EnemyTeamPanel";
import { GoldLevel } from "./components/GoldLevel";
import { PhaseTimer } from "./components/PhaseTimer";
import { TeamLivesBar } from "./components/TeamLivesBar";
import { SpectateNotice } from "./hud/SpectateNotice";
import { NoChampionNotice } from "./hud/NoChampionNotice";
import { KillCombo } from "./hud/KillCombo";
import { SelfStatusBar } from "./hud/SelfStatusBar";
import { MarkBar } from "./hud/MarkBar";
import { StatsHoverPanel } from "./hud/StatsHoverPanel";
import { ZombieWaveBar } from "./hud/ZombieWaveBar";
import { MobBossOverlay } from "./hud/MobBossOverlay";
import { BossIntroOverlay } from "./hud/BossIntroOverlay";
import { BossHealthBar } from "./hud/BossHealthBar";
import { MobHealthBars } from "./hud/mobHealthBar";
import { ReviveBanner } from "./components/ReviveBanner";
import { Scoreboard } from "./components/Scoreboard";
import { ChampSelectPanel } from "./panels/ChampSelectPanel";
import { AugmentDraftPanel } from "./panels/AugmentDraftPanel";
import { MerchantShop } from "./panels/MerchantShop";
import { BattlefieldIntelRecorder } from "./panels/useBattlefieldIntel";
import { PrepClock } from "./panels/PrepClock";
import { ReadyButton } from "./panels/ReadyButton";
import { MatchEndPanel } from "./panels/MatchEndPanel";
import { RoundVictoryPanel } from "./panels/RoundVictoryPanel";
import { IntermissionStage } from "./IntermissionStage";
import { RoundEndVoice } from "./RoundEndVoice";
import { VfxDebugPanel } from "./VfxDebugPanel";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { hudActions } from "./actions";
import { HudBoundaryGroup, type HudBoundaryLabels } from "./HudBoundaryGroup";

/** The 陣亡投幣 cap, mirrored from `config.arena-rules@1 goldDrop.coinsPerRound`. */
const COINS_PER_ROUND = 10;

/**
 * Death-spectator hint — shown while the LOCAL champion is dead (its camera
 * unlocks to free-pan the fight; it re-locks + snaps back on respawn next
 * round). Classic single-player only; couch viewports spectate independently.
 */
function SpectatorHint(): React.JSX.Element | null {
  const alive = useHud((s) => s.localAlive);
  const hasChampion = useHud((s) => s.localMaxHp > 0);
  const phase = useHud((s) => s.phase);
  const coinsLeft = useHud((s) =>
    s.localSeatId === null ? 0 : (s.seats.find((v) => v.seatId === s.localSeatId)?.coinsLeft ?? 0),
  );
  if (alive || !hasChampion) return null;
  // 陣亡投幣 (task #191): the dead player's one action, offered exactly when the
  // server would accept it — combat, dead, throws left. Gating on `!alive` alone
  // would also light it up for a seat that never picked a champion or drew the
  // bye, whose every press comes back `not-in-round`.
  const canThrow = phase === "combat" && coinsLeft > 0;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 64,
        transform: "translateX(-50%)",
        padding: "6px 16px",
        background: "rgba(20,24,36,0.82)",
        border: "1px solid #3a2c48",
        borderRadius: 999,
        color: "#e6d6f0",
        fontSize: 13,
        // the banner itself stays click-through; only the button below opts in
        pointerEvents: "none",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>☠ 觀戰中 — 下一輪復活</span>
      {canThrow && (
        <button
          type="button"
          onClick={() => hudActions.sendCommand({ kind: "dropCoin" })}
          style={{
            pointerEvents: "auto",
            padding: "3px 12px",
            background: "rgba(58, 46, 18, 0.9)",
            border: "1px solid #d9b64e",
            borderRadius: 999,
            color: "#f0d78a",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          丟 100金 (G) {coinsLeft}/{COINS_PER_ROUND}
        </button>
      )}
    </div>
  );
}

/** Discrete-rate gamepad indicator (set on connect/disconnect only). */
function GamepadIndicator(): React.JSX.Element | null {
  const pads = useHud((s) => s.gamepadIndices);
  const touch = hudTouch();
  // dev telemetry chip, bottom-left: hides under a left-docked panel (task #107)
  const covered = useHudSlotHidden("gamepad", touch);
  if (pads.length === 0 || covered) return null;
  return (
    <div
      data-hud-slot="gamepad"
      style={{
        ...hudSlotStyle("gamepad", touch),
        boxSizing: "border-box",
        minHeight: hudSlotHeight("gamepad", touch),
        padding: "4px 10px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        color: TEXT_DIM,
        fontSize: 11,
        pointerEvents: "none",
      }}
    >
      🎮 {pads.length > 1 ? `${pads.length} connected` : "connected"}
    </div>
  );
}

/**
 * 每一個 HUD 成員壞掉時，要在玩家眼前顯示的**位置名**。
 *
 * ⚠️ 為什麼是一張手寫的表而不是 `type.name`：我 grep 過出貨的 bundle
 * （`apps/client/dist/assets/index-*.js`），`MerchantShop` / `PhaseTimer` /
 * `ZombieWaveBar` / `BossHealthBar` 出現次數**都是 0** —— esbuild 預設壓縮把
 * top-level 函式名改掉了。用 `type.name` 的話正式站上會顯示「介面 a 顯示不出來」，
 * 那等於沒說（又一次靜默降級）。
 *
 * ⚠️ 表放在這裡而不是集中到 `HudBoundaryGroup`：這些元件在這個檔案裡**本來就
 * 已經 import 過了**。集中就要再維護一份 35 行的 import 清單，而那份清單自己會
 * drift。`hudBoundaryCoverage.test.ts` 掃這個檔的 JSX 標籤 ↔ 這張表，漏一個就紅。
 *
 * 寫的是**玩家看得懂的位置**（「商店」），不是元件名（「MerchantShop」）——
 * 這行字是給正在打的人看的，不是給我看的。
 */
const HUD_LABELS: HudBoundaryLabels = new Map<unknown, string>([
  [WorldAnchorLayer, "血條與傷害數字"],
  [RoundEndVoice, "回合結束語音"],
  [BattlefieldIntelRecorder, "戰況記錄"],
  [PhaseTimer, "階段倒數"],
  [SpectateNotice, "觀戰提示"],
  [NoChampionNotice, "未選英雄提示"],
  [TeamLivesBar, "隊伍生命數"],
  [ReviveBanner, "復活提示"],
  [Scoreboard, "計分板"],
  [GamepadIndicator, "手把指示"],
  [ControlLegend, "操作說明"],
  [AbilityDescriptionOverlay, "技能說明"],
  [CastNoticeLine, "施法提示"],
  [BottomCluster, "血條與技能列"],
  [EnemyTeamPanel, "敵隊面板"],
  [GoldLevel, "金錢與等級"],
  [StatsHoverPanel, "屬性懸停面板"],
  [EquipmentBar, "裝備欄"],
  [SpectatorHint, "陣亡觀戰提示"],
  [KillCombo, "連殺提示"],
  [SelfStatusBar, "自身狀態"],
  [MarkBar, "標記層數"],
  [ZombieWaveBar, "殭屍來襲提示"],
  [MobBossOverlay, "殭屍王"],
  [BossIntroOverlay, "殭屍王出場演出"],
  [BossHealthBar, "殭屍王血條"],
  [MobHealthBars, "精英小怪血條"],
  [ExUnlockToast, "EX 解鎖提示"],
  [TouchControls, "觸控操作"],
  [CouchHudGrid, "分割畫面介面"],
  [ChampSelectPanel, "選角畫面"],
  [IntermissionStage, "中場畫面"],
  [MerchantShop, "商店"],
  [AugmentDraftPanel, "三選一"],
  [PrepClock, "商店倒數"],
  [ReadyButton, "準備按鈕"],
  [RoundOverPill, "回合結束提示"],
  [RoundVictoryPanel, "回合勝利畫面"],
  [MatchEndPanel, "結算畫面"],
  [VfxDebugPanel, "特效發射器診斷"],
]);

export function HudRoot(): React.JSX.Element {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const connected = useHud((s) => s.connected);
  // couch play: >1 local player = split-screen per-viewport mini-HUDs
  const couch = useHud((s) => s.localPlayers.length > 1);
  // the shop's own gate decides when it mounts (prep, or combat while down), so
  // HudRoot renders it in BOTH phases and lets MerchantShop return null.
  const shopPhase = phase === "intermission" || phase === "combat";

  if (!connected) {
    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          padding: "14px 28px",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 10,
          color: TEXT_MAIN,
        }}
      >
        Connecting to match…
        {/* The "start the dev server" hint is for the ONE person who can act on
            it. Shipping it to ggd.adms.ai told a family member to run a pnpm
            command, which is both useless and alarming — vite folds
            import.meta.env.DEV to false in the production build, so the whole
            line disappears there. */}
        {import.meta.env.DEV && (
          <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6 }}>
            run: pnpm --filter @ggd/game-server dev
          </div>
        )}
      </div>
    );
  }

  const inGame = phase !== "champSelect" && phase !== "matchEnd";
  // touch layout: joystick + ability arc replace the desktop AbilityBar
  const touch = isTouchDevice(readTouchEnv());
  const touchControls = showTouchControls({ touch, inGame, couch });

  return (
    // ⚠️ 每一個成員各自一層 boundary（`HudBoundaryGroup` 會遞迴穿透下面那些
    // Fragment 群組）。在此之前唯一的 boundary 包的是整個 <MatchOverlay />，
    // 獵兇工作流實測讓 `PhaseTimer` 丟例外之後 `#hud-root` 子節點 13 → 1 ——
    // 玩家看到的仍然是「所有介面一起消失」。現在只會少掉炸掉的那一塊。
    //
    // resetKey 帶 phase+round：相位切換或進下一回合就重試一次壞掉的那些
    // （上限 HUD_BOUNDARY_RETRY_CAP 次，之後改叫玩家重新整理）。
    //
    // ⚠️ 2026-08-02：這個包裝**曾經只存在於上面這段註解裡** —— import 有、
    // HUD_LABELS 表有、註解言之鑿鑿，而 JSX 開的是一個裸 `<>`。結果是 37 個成員
    // 一個都沒被包，`PhaseTimer` 炸掉照樣帶走整個 HUD，也就是 owner 回報四次的
    // 那個症狀原封不動。`hudBoundaryCoverage.test.ts` 與 `hudBoundaryGroup.test.ts`
    // 當時正紅著，而回報寫「4939 passed / 0 failed」。
    // CLAUDE.md 第三守則的教科書案例：**註解說有，程式碼沒有。**
    // ⚠️ `pnpm typecheck` 對這種漂移完全隱形（import 了沒用到，`noUnusedLocals`
    // 沒開，EXIT=0）—— 不可以拿 typecheck 當「接線接上了」的證據。
    <HudBoundaryGroup labels={HUD_LABELS} resetKey={`${phase}:${round}`} retryScope="round">
      <WorldAnchorLayer />
      {/* task #139 — round-end (moment 3) champion-quote VO trigger (headless) */}
      <RoundEndVoice />
      {/* GH#220 全場戰況 —— 無畫面的記錄器。掛在這裡而不是掛在商店裡：活著的玩家
          在 combat 期間 MerchantShop 整個 return null（shopGate），掛在商店裡就變成
          「只有陣亡的人會記錄敵方封存」。 */}
      <BattlefieldIntelRecorder />
      <PhaseTimer />
      {/* 「等待並觀戰別的競技場晉級戰鬥中」 — the camera jumps to another zone the
          moment your own duel is decided (#208), and until now it did so in
          total silence. */}
      <SpectateNotice />
      {/* 沒有英雄的那一場，說出來 (2026-08-02)。`hasChampion === false` 會讓
          shopGate 回 mounted:false、useHudPanels 整批面板不啟用、也不會有任何
          戰鬥數字 —— 在這之前玩家看到的是介面憑空消失，沒有一個字解釋。
          shopGate 其實早就算出了「尚未選擇英雄」然後在同一個 return 裡丟掉它
          （失敗形態 ②）。這個告示是純加法，一個既有的閘都沒有動。 */}
      <NoChampionNotice />
      <TeamLivesBar />
      {/* revive circles (task #84): mounted for LIVING and DEAD players alike —
          the spectating owner is the person who most needs to see it. */}
      <ReviveBanner />
      {!couch && <Scoreboard />}
      <GamepadIndicator />
      {/* First-round 操作說明 (task #187). Mounted OUTSIDE the `!couch` group and
          outside the touch branch on purpose: it is the one piece of chrome
          every input tree and every seat count needs, and it owns its own gate
          (combat + round<=1 + not dismissed + no covering panel) plus its own
          placement (left flank on desktop, top-gutter strip on touch/couch).
          ONE legend in couch play, never one per viewport: the bindings are
          identical for all four seats, so four copies would be four times the
          ink on an already-quartered screen for no extra information. */}
      <ControlLegend />
      {/* GH#270 特效發射器診斷（設定 → Network → 特效發射器診斷，預設關）。
          掛在 `inGame && !couch` 群組**外面**是刻意的：owner 要在戰鬥、商店、
          回合切換的**任何一刻**都能打開它去比對「第一場沒有、第二場才有」，
          而跨回合殘留正好會發生在相位邊界上。它自己的閘只有那個設定，
          關著的時候整支 return null（連 interval 都不建）。 */}
      <VfxDebugPanel />
      {inGame && !couch && (
        <>
          {/* 「HP&MP 條應該是跟技能格子緊鄰但不重疊」 (owner 2026-07-30). ONE box
              owns the pair now — the plate and the bar are flex rows with a
              `gap`, so their distance is a field with bounds instead of the
              difference between two hard-pinned `bottom:`s in two files. See
              hud/hudBottomCluster for the measured 27 px this replaces and for
              why the column also has to dodge the bottom corners.

              The two ABILITY OVERLAYS are siblings, never children: both are
              positioned boxes (one `fixed`, one `absolute`) and the cluster is
              a positioned ancestor, so nesting them would re-anchor them to it.
              They own their own gates and render null when idle. */}
          {/* BOTH pointer modes. They used to live inside AbilityBar's fragment,
              which HudRoot mounts only when the desktop bar is up — so on a
              phone a refused Q/W/E/R press was computed, phrased, and thrown
              away (surfaceParity's shape-S9 guard names this exactly). Each
              owns its own gate and renders null when idle. */}
          <AbilityDescriptionOverlay />
          <CastNoticeLine />
          <BottomCluster
            resources={<ResourceBars />}
            abilities={!touchControls && <AbilityBar />}
          />
          {/* top-left panel: the current duel's 3 enemies (HP/MP + level). Claims
              the "enemy-team" slot (ui/hud/hudLayout); self-gates to combat. */}
          <EnemyTeamPanel />
          <GoldLevel />
          {/* owner「戰鬥場景 滑鼠移到右下角 角色頭圖等級金幣區域時 可以顯示全部
              屬性能力出來」。⚠️ 它**不是** GoldLevel 的子節點,也不是新的 HUD
              槽位:那一欄在 780×360 只剩約 12px 的餘裕(hudBottomCluster.test.ts),
              撐開它就會把裝備列推出畫面。它是一個從 gold-level 槽位展開的抽屜
              (hudLayout.hudSlotPanelStyle),z 在 HUD_Z.expanded,而且
              pointerEvents 永遠是 none —— 右下角那一格若被一層透明的接收層蓋住,
              整場比賽在那裡按右鍵都不會移動。開關由 window 的 mousemove 對槽位
              矩形做命中測試決定,見該檔檔頭 ②。 */}
          <StatsHoverPanel />
          {/* persistent equipment bar (task #44): claims the "equipment" HUD
              slot (bottom-right desktop / top-right touch, task #107). */}
          <EquipmentBar />
          <SpectatorHint />
          {/* 連殺 combo (owner 2026-07-27). Mounted inside the in-game,
              non-couch group beside the other personal readouts; it owns its
              own combat gate and its own placement (hud/killComboModel), and
              returns null when the corridor has no room. */}
          <KillCombo />
          <SelfStatusBar />
          {/* 【具名標記】層數 (GH#278)。52-00【十二道試煉】的 12 層是 12 條命,
              而它不在 MatchState 上 —— `markChanged` 這顆事件是它到螢幕的唯一
              通道。自己管戰鬥階段閘,沒有標記就回 null。 */}
          <MarkBar />
          {/* 殭屍來襲 + 即時已擊殺數 (task #258). The roguelite waves have
              shipped since #215 and the word 殭屍 appeared NOWHERE in combat;
              the kill tally was not even on the wire. Owns its own gate
              (combat + something to say) and its own derived placement. */}
          <ZombieWaveBar />
          {/* 殭屍王 (task #262 / GH #190). v0.9.11 put mobBossSpawn /
              mobBossSlain on the wire with NO client consumer at all, so 100
              zombie kills produced an unexplained ~3,000 gold jump. This is the
              降臨 banner + the 分紅結算 sheet that says WHY each player got what
              they got — including that 補刀 is a damage WEIGHT, not a post-hoc
              doubling. Owns its own combat gate and placement
              (hud/mobBossModel), and returns null when there is no room. */}
          <MobBossOverlay />
          {/* 殭屍王出場演出 (owner 2026-08-02「殭屍王出場 會音效+大字講該英雄的
              名言，然後跳出該英雄的描述及攻略注意要點及弱點等提示，五秒後提示淡出
              消失」)。⚠️ 音效不在這個元件裡 —— `mobBossSpawn` 早就對到
              audio/combatSfx 的恐怖音效，這裡再播一次會變成兩層疊音。
              自己的閘（戰鬥階段 / 非同機多人 / 自己那個競技場）與自己的擺放
              （hud/bossIntroModel，從降臨橫幅下緣起算），放不下就回 null。 */}
          <BossIntroOverlay />
          {/* #247 —— 殭屍王長血條。掛在 MobBossOverlay **之後**只是 DOM 順序;
              誰蓋誰是 `bossHealthBarSpec` / `mobBossRect` 算出來的矩形決定的,
              兩個都 `position: absolute` + 同一個 z-index(#107)。 */}
          <BossHealthBar />
          {/* GH#268 —— 特殊殭屍/殭屍王頭上那條小血條（owner 2026-08-03「特殊殭屍
              頭上應該要有小血條 顯示即時血量」）。⚠️ v0.9.28 出貨時**這一行不存在**：
              伺服器付掉 `ENTITY_FLAG` 最後一格把 `MOB_ELITE` 送過線，`mobHealthBar.tsx`
              也寫好了，而沒有人掛它 —— 整包功能可以從 repo 刪掉而畫面不變（失敗形態 ③）。
              它自己每幀取樣 `frameBus.mobBars`（`GameApp` 每幀從快照重建），沒有精英
              就回 null，所以一場沒有殭屍波的比賽它一次都不會重畫。 */}
          <MobHealthBars />
          <ExUnlockToast />
        </>
      )}
      {touchControls && <TouchControls />}
      {inGame && couch && <CouchHudGrid />}
      {phase === "champSelect" && <ChampSelectPanel />}
      {/* 中場 is its own Babylon scene laid over the arena — the phase change
          IS the phase signal the HUD used to be missing (task #38). */}
      {phase === "intermission" && <IntermissionStage />}
      {/* Centre-stage shop. Mounted through combat too, because a champion
          DEFEATED this round keeps shopping until the round resolves; the gate
          inside returns null for everyone else. */}
      {!couch && shopPhase && <MerchantShop />}
      {phase === "intermission" && (
        <>
          <AugmentDraftPanel />
          {/* The shop window's countdown (task #95). A SIBLING of MerchantShop,
              never a child: the card is closable, and a clock that lives inside
              a closable card is invisible exactly when it matters. It sits
              directly above ReadyButton because the clock and Ready are one
              decision — spend the time, or end it early. */}
          <PrepClock />
          <ReadyButton />
        </>
      )}
      {phase === "resolution" && (
        <>
          <RoundOverPill />
          {/* 回合勝利畫面的文字半邊 (task #212). 3D 模型列是
              render/RoundWinnerStage(#143)在畫的,這一片是 owner 那句話裡
              模型以外的兩件事:評價+建議(走 sim 的 gradeRound,#232 的商店卡
              也是同一支)、以及跨回合的團隊累積積分。貼右側,中央整條留給模型
              —— 一張蓋住模型的卡片就是「做了但玩家看不到」。 */}
          <RoundVictoryPanel />
        </>
      )}
      {phase === "matchEnd" && <MatchEndPanel />}
    </HudBoundaryGroup>
  );
}
