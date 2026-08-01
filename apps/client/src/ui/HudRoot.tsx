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
import { ZombieWaveBar } from "./hud/ZombieWaveBar";
import { MobBossOverlay } from "./hud/MobBossOverlay";
import { BossHealthBar } from "./hud/BossHealthBar";
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
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { hudActions } from "./actions";

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

export function HudRoot(): React.JSX.Element {
  const phase = useHud((s) => s.phase);
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
    <>
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
          {/* #247 —— 殭屍王長血條。掛在 MobBossOverlay **之後**只是 DOM 順序;
              誰蓋誰是 `bossHealthBarSpec` / `mobBossRect` 算出來的矩形決定的,
              兩個都 `position: absolute` + 同一個 z-index(#107)。 */}
          <BossHealthBar />
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
    </>
  );
}
