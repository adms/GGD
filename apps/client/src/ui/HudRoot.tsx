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
import { EquipmentBar } from "./hud/EquipmentBar";
import { ControlLegend } from "./ControlLegend";
import { CouchHudGrid } from "./components/CouchHudGrid";
import { AbilityBar } from "./components/AbilityBar";
import { ExUnlockToast } from "./components/ExUnlockToast";
import { ResourceBars } from "./components/ResourceBars";
import { EnemyTeamPanel } from "./components/EnemyTeamPanel";
import { GoldLevel } from "./components/GoldLevel";
import { PhaseTimer } from "./components/PhaseTimer";
import { TeamLivesBar } from "./components/TeamLivesBar";
import { ReviveBanner } from "./components/ReviveBanner";
import { Scoreboard } from "./components/Scoreboard";
import { ChampSelectPanel } from "./panels/ChampSelectPanel";
import { AugmentDraftPanel } from "./panels/AugmentDraftPanel";
import { MerchantShop } from "./panels/MerchantShop";
import { PrepClock } from "./panels/PrepClock";
import { ReadyButton } from "./panels/ReadyButton";
import { MatchEndPanel } from "./panels/MatchEndPanel";
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
      <PhaseTimer />
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
          {!touchControls && <AbilityBar />}
          <ResourceBars />
          {/* top-left panel: the current duel's 3 enemies (HP/MP + level). Claims
              the "enemy-team" slot (ui/hud/hudLayout); self-gates to combat. */}
          <EnemyTeamPanel />
          <GoldLevel />
          {/* persistent equipment bar (task #44): claims the "equipment" HUD
              slot (bottom-right desktop / top-right touch, task #107). */}
          <EquipmentBar />
          <SpectatorHint />
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
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 120,
            transform: "translateX(-50%)",
            padding: "10px 30px",
            background: PANEL_BG,
            border: PANEL_BORDER,
            borderRadius: 10,
            color: TEXT_MAIN,
            fontSize: 17,
            fontWeight: "bold",
          }}
        >
          Round over
        </div>
      )}
      {phase === "matchEnd" && <MatchEndPanel />}
    </>
  );
}
