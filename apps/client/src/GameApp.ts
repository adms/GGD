/**
 * GameApp — owns the ONE requestAnimationFrame loop, ordered exactly:
 *   drain network → advance interpolation clock → local prediction →
 *   EntityViewRegistry.sync (imperative transforms) → CameraRig → vfx →
 *   scene.render().
 * React/Zustand only ever see discrete-rate data (RoomStore); world-anchored
 * DOM reads the plain mutable frameBus. NO direct @babylonjs imports here —
 * Babylon lives behind render/* and vfx/*.
 */
import { TICK_MS } from "@ggd/shared/constants";
import { SKELETON_ARENA, arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Abilities, Champions, Items, Projectiles } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import {
  DEFAULT_COMBAT_ENV,
  parseCombatEnvJson,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import type { ModelDoc } from "@ggd/shared/content";
import type { AbilityId, ChampionId, ItemId, ProjectileId } from "@ggd/shared/ids";
import type { AbilitySlot } from "@ggd/shared/sim/intents";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

import type { RoomConnection } from "./net/RoomConnection";
import { MultiSession, type SeatTokenEntry } from "./net/MultiSession";
import {
  syncHudFromState,
  recordDeathEvent,
  recordSettlement,
  recordShopEvent,
  isShopEvent,
  resetSettlement,
  hudStore,
  setGamepadIndices,
  setLocalAccounts,
} from "./net/RoomStore";
import type { IntentSender } from "./net/IntentSender";
import { InterpolationBuffer } from "./net/InterpolationBuffer";
import { TimeSync } from "./net/TimeSync";
import { LocalPrediction } from "./predict/LocalPrediction";
import { InputCapture } from "./input/InputCapture";
import { MultiGamepadSystem, BTN } from "./input/GamepadInput";
import { pickUnit, pickNearestUnit, type PickableUnit } from "./input/Picking";
import type { AimAbility } from "./input/AimResolver";
import { isTouchDevice, readTouchEnv } from "./input/mobileDetect";
import {
  TouchController,
  registerTouchController,
  touchFrame,
  type AimIndicatorState,
} from "./input/TouchInput";
import { Renderer } from "./render/Renderer";
import { AimIndicator } from "./render/AimIndicator";
import { setupLighting, type LightingHandle } from "./render/Lighting";
import { buildArena, dressArena, disposeArena, type ArenaHandles } from "./render/ArenaScene";
import { resolveArenaId, type ArenaIdSource } from "./render/arenaSelect";
import { RoundWinnerStage } from "./render/RoundWinnerStage";
// ONE number for how long the round-win beat owns the screen: the stage's grey
// wash, the taunt delay and this trigger window all read the same constant, so
// the window can never be shortened below the taunt delay and silently mute it.
import { ROUND_PRESENT_MS } from "./render/victoryPresentation";
import type { CameraRig } from "./render/CameraRig";
import { ViewportManager } from "./render/ViewportManager";
import { AssetManager } from "./render/AssetManager";
import {
  EntityViewRegistry,
  type EntityViewState,
  type ModelDocOverride,
} from "./render/EntityViewRegistry";
import { blizzardOverlayModels } from "./render/views/blizzardOverlay";
import { championTintForId } from "./render/views/championTint";
import {
  hasOverheadBar,
  anchorColorFor,
  anchorHeightFor,
  KIND_FLOWER,
  KIND_REVIVE_CIRCLE,
} from "./render/overheadAnchors";
import { qualityController, type RenderParams } from "./render/QualityController";
import { VfxSystem } from "./vfx/VfxSystem";
import { AmbientVfx } from "./vfx/AmbientVfx";
import { WhirlwindFx } from "./vfx/WhirlwindFx";
import { CombatPostFx } from "./vfx/CombatPostFx";
import { DeathFocusFx, type DeathFocusFrame } from "./vfx/DeathFocusFx";
import { VictoryFireworks } from "./vfx/VictoryFireworks";
import type { VictoryInput } from "./vfx/victoryTrigger";
import { ContentDb } from "./content/ContentDb";
import {
  frameBus,
  clearCombatText,
  expireCombatText,
  setCombatTextScope,
  setDamageNumberCap,
} from "./frameBus";
import { perfBus } from "./perfBus";
import { ConnectionStats } from "./net/ConnectionStats";
import { CastTracker } from "./CastTracker";
import { registerHudActions } from "./ui/actions";
import { getHeldAbility } from "./ui/abilityHold";
import { envFactor, setDisplayEnvJson } from "./ui/displayFinal";
import { audioSystem } from "./audio";
import { loadChampionVoices, playChampionSelectVoice } from "./audio/championVoice";
import { combatSfxKey } from "./audio/combatSfx";
import { FootstepCadence } from "./audio/footsteps";
import { effectiveQuality, onQualityChange } from "./render/RenderConfig";
import {
  heavyPostFxEnabled,
  cameraShakeScaleFor,
  batchCarriesImpactProfile,
  planCameraReaction,
  EX_PUNCH_DEPTH,
  EX_PUNCH_MS,
} from "./render/combatFeedback";
import { prefersReducedMotion } from "./ui/buttonSfx";
import { SETTLEMENT_EVENT } from "@ggd/shared/protocol/messages";
import type { EventMessage, MatchSettlement } from "@ggd/shared/protocol/messages";
import { roundEndQuoteChampion } from "./ui/panels/settlementModel";

const SLOT_INDEX: Record<AbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3, EX: 4 };
/** authoritative error beyond which we treat the correction as a teleport */
const TELEPORT_EPS = 6;
/** fps-cap slack (ms): run when within ~a rAF of the target interval so a
 *  60Hz vsync doesn't drop a 30/60 cap to half rate on jitter. */
const CAP_SLACK_MS = 3;
/** draw distances at/above this are treated as "no cull" (skip the check). */
const DRAW_DISTANCE_MAX = 300;
/** damage at/above which a hit is "heavy" enough to trigger the ripple post-fx. */
const HEAVY_HIT_DMG = 120;

interface PendingAuth {
  entityId: number;
  x: number;
  z: number;
  zone: number;
  ackSeq: number;
}

export interface GameAppOptions {
  /** platform account id (defaults to a random dev id) */
  accountId?: string;
  /**
   * equipped-skin substitution: base champion modelKey -> skin modelKey.
   * Applied to the LOCAL seat only (client-side visual; the server-
   * authoritative skin field on the seat is future work).
   */
  skinOverrides?: Map<string, string>;
  /**
   * Couch play (dev flow): number of local players (1..4). Player k is
   * driven by the k-th connected pad; player 0 also has mouse/keyboard.
   */
  localPlayers?: number;
  /**
   * Couch play (platform flow): the match_ready seatTokens[] entries —
   * one RoomConnection per entry (owner first, then ":p2".."p4" guests).
   */
  seatTokens?: SeatTokenEntry[];
  /**
   * Offline flow: the arena to create the dev room with (Arenas registry id).
   * Platform flow ignores this — the room's map comes from the server state.
   */
  mapId?: string;
}

export class GameApp {
  private readonly renderer: Renderer;
  private readonly viewports: ViewportManager;
  private readonly views: EntityViewRegistry;
  private readonly vfx: VfxSystem;
  /** ambient per-bone particle/ribbon attachments (lives-with-entity vfx) */
  private readonly ambient: AmbientVfx;
  /**
   * STATE-GATED per-bone attachments (task #59): effects WC3 showed for one
   * animation sequence via GEOSET ANIMATION alpha — data glTF cannot carry, so
   * the geometry shipped always-on and motionless (索隆's whirlwind). Same
   * attach/sweep/tick shape as `ambient`, plus the animation-state gate.
   */
  private readonly whirlwind: WhirlwindFx;
  /** combat post-fx (red vignette + ripple/heat-distortion); tier-gated. */
  private readonly postFx: CombatPostFx;
  /**
   * Death-spectator focus desaturation (task #85), one gate per local
   * viewport: while you are dead IN COMBAT the scene drains to grey except
   * soft pools on your living teammates + your revive circle. All the arming /
   * revert logic is render/deathFocus; this class only holds the Babylon pass.
   */
  private readonly deathFocus: DeathFocusFx;
  /**
   * Victory celebration (task #93): round win → a small firework volley,
   * MATCH win (吃雞) → the full-screen roast-chicken firework. Fired off the
   * pure VictoryGate edge-detector inside VictoryFireworks; the screen tint
   * and the taunt VO are the umbrella task's, wired via its callbacks.
   */
  private readonly victoryFx: VictoryFireworks;
  /**
   * Round-end winner presentation (task #143): stands the round WINNER's
   * champion model centre-screen for a few seconds at each round-end, reusing
   * the champ-select/store model viewer (#129) on its own overlay canvas. The
   * TRIGGER lives in updateRoundWinner (phase edge into `resolution`); this just
   * owns the stage.
   */
  private readonly roundWinner: RoundWinnerStage;
  /** previous phase seen by the round-winner edge detector. */
  private roundWinnerPhase = "";
  /** performance.now() deadline after which the winner model clears. */
  private roundWinnerUntilMs = 0;
  /** local-champion footstep cadence (subtle walk/run cue). */
  private readonly footstep = new FootstepCadence();
  /**
   * OS `prefers-reduced-motion`, read ONCE at construction (it is stable for the
   * life of a match, and the drain path must not touch matchMedia per event).
   * Folded into `shakeScale`, which every camera reaction gates on — so under
   * reduced motion the ring jitter, the directional kick and the EX punch-in all
   * stand down while flash/spark/sfx/hitstop keep playing.
   */
  private readonly reducedMotion = prefersReducedMotion();
  /** camera-shake amplitude multiplier: quality tier × reduced-motion. */
  private shakeScale = 1;
  private offQuality: (() => void) | null = null;
  /**
   * Camera impulses already fired in the CURRENT drained batch — the teamfight
   * crowding index (combatFeedback.shakeCrowdingScale thins the 2nd/3rd and
   * drops the rest, so an AoE frame cannot stack into a screen-quake).
   */
  private frameKicks = 0;
  /**
   * Whether the CURRENT drained batch carries #133 ImpactProfiles. The sim emits
   * `damage` immediately followed by `hitImpact` for the same landed hit, so the
   * batch is scanned ONCE up-front (`damage` arrives first and must already know
   * to stand down) and the legacy scalar shake is suppressed for the whole
   * batch — a profiled hit shakes exactly once, through the directional path.
   */
  private batchProfiled = false;
  /** performance.now() of the last EX punch-in (guards against a restart). */
  private lastExPunchMs = -Infinity;
  /** reused scratch: champion ids seen this frame (ambient sweep) */
  private readonly ambientSeen = new Set<number>();
  private readonly sessions: MultiSession;
  private readonly interp = new InterpolationBuffer();
  private readonly timeSync = new TimeSync();
  private readonly prediction = new LocalPrediction(SKELETON_ARENA);
  private readonly input: InputCapture;
  private readonly gamepads: MultiGamepadSystem;
  /** touch controls (iPhone) — null on mouse/pad machines */
  private readonly touch: TouchController | null = null;
  private readonly aimIndicator: AimIndicator;
  private readonly contentDb = new ContentDb();
  private readonly assets: AssetManager;
  private arenaHandles: ArenaHandles;
  /** last successfully-(re)built map; "" until the first apply */
  private appliedMapId = "";
  /** map id whose (re)build is currently in flight (dedupe/superseding) */
  private applyingMapId: string | null = null;
  private readonly lighting: LightingHandle;
  private readonly connStats = new ConnectionStats();
  /** per-entity ability-cast / attack-windup timing → cast bars */
  private readonly casts = new CastTracker();

  private raf = 0;
  private disposed = false;
  /**
   * Arena DRAW suppressed (task #38). The intermission is its own Babylon scene
   * on its own canvas laid over this one; while it is up the arena is not
   * visible, so painting it burns a second full GPU frame for nothing. Only the
   * `scene.render()` call is skipped — the network drain, prediction, interp and
   * view sync all keep running, so returning to the arena is seamless rather
   * than a resync stutter.
   */
  private renderSuppressed = false;
  private lastFrameMs = 0;
  private predAccumMs = 0;
  private fpsEma = 0;
  private renderParams: RenderParams = qualityController.getParams();
  private offParams: (() => void) | null = null;
  /** reused per-frame entity snapshot pool (zero hot-path allocation). */
  private readonly entityPool: EntityViewState[] = [];
  private readonly entityScratch: EntityViewState[] = [];
  /** reused: champion entity id of each local player (-1 = none) — task #85. */
  private readonly focusLocalEntities: number[] = [];
  /** reused frame envelope handed to the death-focus pass (zero allocation). */
  private readonly focusFrame: DeathFocusFrame = {
    phase: "",
    outcomeDecided: false,
    localEntities: this.focusLocalEntities,
    entities: this.entityScratch,
  };
  /** reused scratch collections for updateFrameBus. */
  private readonly fbSeen = new Set<number>();
  private readonly fbNameBySeat = new Map<number, string>();
  /** seatId → picked champion id, for the minimap's portrait markers. */
  private readonly fbChampBySeat = new Map<number, string>();
  /** pooled camera-eye / hero positions for the decor auto-fade sweep. */
  private readonly fadeCams = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 }));
  private readonly fadeHeroes: { x: number; z: number }[] = [];
  private pendingAuth: PendingAuth | null = null;
  private predictedEntityId: number | null = null;
  /**
   * Active combat-env multiplier table (MatchState.combatEnvJson, parsed once
   * per change). Of all factors ONLY moveSpeed matters client-side: prediction
   * replays just order+movement; every other quantity reaches the client via
   * authoritative snapshots (hp/mana/cooldowns).
   */
  private combatEnvJson = "";
  private combatEnv: CombatEnvMultipliers = DEFAULT_COMBAT_ENV;
  private readonly teamBySeat = new Map<number, number>();
  /** per-player last-observed alive state (death-spectator camera transitions) */
  private readonly aliveByPlayer = new Map<number, boolean>();
  /** per-player champ-select cycling cursor (pad A cycles) */
  private readonly champCursor = new Map<number, number>();

  /** primary connection — the single source of rendered state */
  private get conn(): RoomConnection {
    return this.sessions.primary;
  }

  /** player 0's intent sender (mouse/keyboard + pad 0) */
  private get sender(): IntentSender {
    return this.sessions.senders[0]!;
  }

  /** player 0's camera rig (mouse picking + world anchors) */
  private get cameraRig(): CameraRig {
    return this.viewports.primary;
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: GameAppOptions = {},
  ) {
    registerSkeletonContent();

    // couch player count: platform = one per seat token; dev = opts.localPlayers
    const playerCount = Math.min(
      4,
      Math.max(1, this.opts.seatTokens?.length ?? this.opts.localPlayers ?? 1),
    );

    this.renderer = new Renderer(canvas);
    this.lighting = setupLighting(this.renderer.scene);
    this.lighting.setShadowsEnabled(this.renderParams.shadows);
    setDamageNumberCap(this.renderParams.damageNumberCap);
    setCombatTextScope(this.renderParams.combatTextScope);
    // live settings/adaptive apply: shadows + combat-text density/scope
    // (resolution and particle budgets are applied by the Renderer / VfxSystem
    // subscribers).
    this.offParams = qualityController.subscribe((p) => {
      this.renderParams = p;
      this.lighting.setShadowsEnabled(p.shadows);
      setDamageNumberCap(p.damageNumberCap);
      setCombatTextScope(p.combatTextScope);
    });
    this.arenaHandles = buildArena(this.renderer.scene, SKELETON_ARENA);
    // publish the zone circles for the minimap (replaced once the real map loads)
    frameBus.arenaZones = SKELETON_ARENA.zones.map((z) => ({ x: z.center.x, z: z.center.z, r: z.boundaryRadius }));
    this.viewports = new ViewportManager(this.renderer.scene, SKELETON_ARENA.zones[0]!.center, playerCount);
    this.assets = new AssetManager(this.renderer.scene);
    this.views = new EntityViewRegistry(this.renderer.scene, this.assets, {
      modelDocFor: (key, seatId) => this.modelDocFor(key, seatId),
      projectileVfxFor: (key) => {
        const def = Projectiles.tryGet(key as ProjectileId);
        return def?.vfxKey ? this.contentDb.vfxFor(def.vfxKey) : null;
      },
      projectileMeshShapeFor: (key) => Projectiles.tryGet(key as ProjectileId)?.meshShape ?? null,
      // w3x vertex tint (task #49). The seat table lives in the HUD store, and
      // render/** may not read it (client-08), so the entity → champion step
      // happens here — the same `championIdForSeat` the model resolve uses.
      championTintFor: (e) => championTintForId(this.championIdForSeat(e.seatId)),
      // per-champion model-SIZE override (task #77/#150). SAME entity→championId
      // seam as modelDocFor/championTintFor above — render/** is walled off from
      // the seat table (client-08), so the composition root resolves championId and
      // reads content/models/_standin-overrides.json here; the registry applies its
      // `relativeScale` ON TOP of ChampionView's height-normalization (default 1.0 →
      // the normalized target for the ~105 champions with no override).
      modelOverrideFor: (e) => this.modelOverrideFor(e),
    });
    this.vfx = new VfxSystem(this.renderer.scene, {
      entityPos: (id) => this.views.posOf(id) ?? this.schemaPos(id),
      vfxDoc: (key) => this.contentDb.vfxFor(key),
      // floating combat text (task #92) is coloured by RELATIONSHIP to the
      // local player, so the vfx layer needs the same seat→team table the
      // healthbars use. render/** may not read the HUD store (client-08), which
      // is why the lookup is injected from here rather than done inside vfx/**.
      localEntityId: () => hudStore.getState().localEntityId,
      teamOf: (id) => this.teamOfEntity(id),
    });
    this.ambient = new AmbientVfx(this.renderer.scene, {
      bindingsFor: (key) => this.contentDb.ambientBindingsFor(key),
      vfxDocFor: (id) => this.contentDb.vfxFor(id),
      ribbonDocFor: (id) => this.contentDb.ribbonFor(id),
    });
    this.whirlwind = new WhirlwindFx(this.renderer.scene);

    // Combat post-fx (vignette + ripple) on the LOCAL player's camera. Heavy
    // full-screen pass → quality-tier gated: constructed disabled on mobile/low,
    // and even when enabled it only attaches while an effect is decaying, so the
    // idle steady state costs nothing. Camera-shake scales down (not off) on
    // mobile. Both react live to a quality-tier override.
    this.postFx = new CombatPostFx(this.renderer.scene, () => this.viewports.primary.camera);
    const q0 = effectiveQuality();
    this.shakeScale = cameraShakeScaleFor(q0, this.reducedMotion);
    this.postFx.setEnabled(heavyPostFxEnabled(q0));
    this.offQuality = onQualityChange((q) => {
      this.shakeScale = cameraShakeScaleFor(q, this.reducedMotion);
      this.postFx.setEnabled(heavyPostFxEnabled(q));
    });

    // Death-spectator focus (task #85) — per local viewport, so a dead P2
    // greys out its own quadrant while P1 keeps fighting in colour. NOT
    // tier-gated like the combat post-fx: it is a legibility aid, it only ever
    // runs while its player is dead (i.e. not fighting), it is a single
    // texture fetch, and each pass is sized to its own viewport rect.
    this.deathFocus = new DeathFocusFx(
      this.renderer.scene,
      {
        cameraFor: (p) => this.viewports.rigFor(p).camera,
        posOf: (id) => this.views.posOf(id),
      },
      playerCount,
    );

    // Victory fireworks frame themselves against player 0's camera (the whole
    // table watches player 0's screen at settlement anyway) and cost nothing
    // until a win edge fires. Quality tier scales the point budget, never a
    // truncation — a low-tier bird is still a whole bird.
    this.victoryFx = new VictoryFireworks(this.renderer.scene, {
      cameraFor: () => this.viewports.rigFor(0).camera,
      scale: this.renderParams.particleDensity,
    });

    // Round-end winner stage (task #143): mounts a centred overlay canvas over
    // the arena when a round is won. Lazy — no canvas / WebGL context exists
    // until the first winner is shown — so it costs nothing mid-round.
    this.roundWinner = new RoundWinnerStage({
      host: typeof document !== "undefined" ? document.body : null,
    });

    // authored content (model docs / vfx docs) — async, optional
    void this.contentDb.load();
    // warm the champion select-quip config (cached; 404 → silent no-op)
    void loadChampionVoices();
    // warm the DEV-ONLY Blizzard model overlay probe (no-op in any deployed
    // build; 404 → champions keep their shipped stand-in). Priming it here
    // means the probe has usually settled before the first champion spawns.
    void blizzardOverlayModels.load();
    // (re)build + dress the chosen arena. Offline knows the map up-front;
    // platform learns it from the first state patch (onStatePatch → applyArena).
    this.applyArena(this.opts.mapId ?? SKELETON_ARENA.id);

    const accountIds: (string | undefined)[] = this.opts.seatTokens
      ? this.opts.seatTokens.map((e) => e.accountId)
      : [this.opts.accountId, ...Array<undefined>(playerCount - 1)];
    this.sessions = new MultiSession(accountIds);
    setLocalAccounts(this.sessions.localAccountIds());
    // prediction covers player 0 only; other viewports render authoritative
    this.sender.onSent = (msg) => {
      if (msg.order) this.prediction.recordInput(msg.seq, msg.order);
      // ping estimate: stamp each seq so the ack delta measures RTT
      this.connStats.noteSent(msg.seq, performance.now());
    };

    frameBus.project = (x, y, z) => this.cameraRig.projectToScreen(x, y, z);

    this.input = new InputCapture(canvas, {
      screenToGround: (x, y) => this.cameraRig.screenToGround(x, y),
      getSelfPos: () => this.localSelfPos(),
      getAbility: (slot) => this.localAbility(slot),
      pickEnemy: (ground) => this.pickEnemyAt(ground),
      pickSelf: (ground) => this.pickSelfAt(ground),
      onOrder: (order) => this.sender.setOrder(order),
      onCommand: (cmd) => this.sender.pushCommand(cmd, performance.now()),
      onSelectSelf: () => {
        const champ = this.localChampionId();
        if (champ) void playChampionSelectVoice(champ);
      },
      onZoom: (deltaY) => this.cameraRig.zoomBy(deltaY),
      onToggleFollow: () => this.cameraRig.toggleFollow(),
    });

    registerHudActions({
      sendCommand: (cmd) => this.sender.pushCommand(cmd, performance.now()),
      selectChampion: (championId) => this.conn.sendSelectChampion(championId),
      // dev cheats route to the primary connection (server hard-gates to dev mode)
      sendCheat: (cheat) => this.sessions.sendCheat(cheat),
      // minimap left-click: camera-only peek at a spot (breaks follow-lock like
      // an edge-pan; Space snaps back). Never touches the order path.
      focusWorld: (point) => this.cameraRig.focusOn(point),
      // minimap right-click: the SAME seam an in-world right-click uses, so the
      // order is coalesced/sequenced identically (IntentSender.setOrder).
      sendOrder: (order) => this.sender.setOrder(order),
      // intermission scene mounted/unmounted over the arena canvas (task #38)
      setArenaRenderSuppressed: (suppressed) => {
        this.renderSuppressed = suppressed;
      },
      // the local champion's model, so the intermission market can stand the
      // player's OWN hero at the counter instead of a stand-in
      localChampionModel: () => this.localChampionModel(),
    });

    // iPhone touch controls — virtual joystick + ability buttons feed player
    // 0's IntentSender exactly like mouse/pad (last writer wins)
    this.aimIndicator = new AimIndicator(this.renderer.scene);
    if (isTouchDevice(readTouchEnv())) {
      this.touch = new TouchController({
        ctx: () => ({
          selfPos: this.localSelfPos(),
          facing: this.playerFacing(0),
          ability: (slot) => this.localAbility(slot),
          enemyUnits: () => this.enemyUnitsFor(this.playerTeam(0)),
        }),
        onOrder: (order) => this.sender.setOrder(order),
        onCommand: (cmd) => this.sender.pushCommand(cmd, performance.now()),
        isJoystickArea: (clientX) => {
          const rect = this.canvas.getBoundingClientRect();
          return clientX - rect.left < rect.width / 2;
        },
      });
      registerTouchController(this.touch);
    }

    // couch twin-stick play — pad k drives local player k's OWN IntentSender
    // (player 0 additionally has mouse/keyboard; last writer wins)
    this.gamepads = new MultiGamepadSystem(
      () => this.sessions.count,
      {
        onOrder: (p, order) => this.sessions.senderFor(p)?.setOrder(order),
        onAim: (p, aim) => this.sessions.senderFor(p)?.setAim(aim),
        onCommand: (p, cmd) => this.sessions.senderFor(p)?.pushCommand(cmd, performance.now()),
        onButton: (p, btn) => this.onPadButton(p, btn),
        onPadsChanged: (indices) => setGamepadIndices(indices),
      },
      (player) => ({
        selfPos: this.playerSelfPos(player),
        facing: this.playerFacing(player),
        ability: (slot) => this.playerAbility(player, slot),
        nearestEnemy: (from, maxRange, aimDir) =>
          pickNearestUnit(from, this.enemyUnitsFor(this.playerTeam(player)), maxRange, aimDir),
      }),
    );
  }

  async connect(): Promise<void> {
    const room = await this.sessions.connectDev(this.opts.mapId);
    setLocalAccounts(this.sessions.localAccountIds());
    room.onStateChange((state) => this.onStatePatch(state));
    this.onStatePatch(room.state);
  }

  /** Platform flow: consume the Go-minted seat token(s) — one per couch player. */
  async connectPlatform(endpoint: string, entries: SeatTokenEntry[]): Promise<void> {
    const room = await this.sessions.connectPlatform(endpoint, entries);
    setLocalAccounts(this.sessions.localAccountIds());
    room.onStateChange((state) => this.onStatePatch(state));
    this.onStatePatch(room.state);
  }

  /** Champ-select pad picking: A cycles through the roster for that player. */
  private onPadButton(player: number, button: number): void {
    if (button !== BTN.A) return;
    if (hudStore.getState().phase !== "champSelect") return;
    const ids = Champions.ids();
    if (ids.length === 0) return;
    const cur = (this.champCursor.get(player) ?? -1) + 1;
    this.champCursor.set(player, cur);
    this.sessions.sendSelectChampion(player, String(ids[cur % ids.length]!));
  }

  /**
   * Model doc for an entity view: authored content first, then — on DEV
   * machines only — the LOCAL-ONLY Blizzard overlay for champions that ship
   * with a generic KayKit stand-in (see render/views/blizzardOverlay.ts and
   * content/assets/blizzard-local/README.md). An equipped skin is an explicit
   * cosmetic choice and is never overridden. null = nothing to upgrade to yet;
   * the ChampionView keeps its procedural figure and asks again next frame.
   */
  private modelDocFor(key: string, seatId?: number): ModelDoc | null {
    const resolved = this.resolveModelKey(key, seatId);
    const doc = this.contentDb.modelFor(resolved);
    if (resolved !== key) return doc; // equipped skin wins outright
    return blizzardOverlayModels.resolve(doc, this.championIdForSeat(seatId));
  }

  /** ChampionId seated at `seatId` ("" / null until champ-select confirms). */
  private championIdForSeat(seatId?: number): string | null {
    if (seatId === undefined) return null;
    const seat = hudStore.getState().seats.find((s) => s.seatId === seatId);
    return seat?.championId ? seat.championId : null;
  }

  /** Equipped-skin substitution for the LOCAL seat's champion model. */
  private resolveModelKey(key: string, seatId?: number): string {
    const overrides = this.opts.skinOverrides;
    if (!overrides || overrides.size === 0 || seatId === undefined) return key;
    if (seatId !== hudStore.getState().localSeatId) return key;
    return overrides.get(key) ?? key;
  }

  /**
   * Per-champion model-SIZE override (task #77/#150) for a champion entity — the
   * composition-root seam mdl-64/mdl-150d left to wire. render/**
   * (EntityViewRegistry/ChampionView) is walled off from the seat table
   * (client-08), so — exactly like modelDocFor / championTintFor — the entity →
   * championId step happens here and the override is injected. The map lives in
   * content/models/_standin-overrides.json (schema@2, keyed by championId) and is
   * loaded by ContentDb; the registry applies the override's `relativeScale` ON TOP
   * of ChampionView's height-normalization (never replacing it, PRESERVING #150's
   * normalization + #77's grounding). Returns null for the common case (no
   * override) so the render layer's relativeScaleOf defaults to 1.0 — an unlisted
   * champion keeps the normalized target size (~1.8u), while the 8 curated
   * exceptions (小叮噹 0.65 → ~1.17u … 初號機 1.55 → ~2.79u) reach the renderer.
   */
  private modelOverrideFor(e: EntityViewState): ModelDocOverride | null {
    const championId = this.championIdForSeat(e.seatId);
    if (!championId) return null;
    return this.contentDb.modelOverrideFor(championId);
  }

  start(): void {
    this.input.attach();
    this.touch?.attach(this.canvas);
    this.lastFrameMs = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Full, idempotent teardown. Cancels the rAF loop, unsubscribes settings,
   * drops HUD/touch action sinks, leaves ALL Colyseus rooms (MultiSession),
   * disposes the Babylon engine + scene + vfx + views, and clears the shared
   * frameBus. Safe to call twice (Leave then a late React unmount). Called on
   * Leave AND on Restart (which then constructs a fresh GameApp = new world).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.offParams?.();
    this.offParams = null;
    this.offQuality?.();
    this.offQuality = null;
    registerHudActions(null);
    registerTouchController(null);
    this.input.dispose();
    this.touch?.dispose();
    this.aimIndicator.dispose();
    this.gamepads.dispose();
    this.sessions.dispose(); // leave every room + drop input sinks
    this.vfx.dispose();
    this.ambient.dispose();
    this.whirlwind.dispose();
    this.postFx.dispose();
    this.deathFocus.dispose(); // detaches every viewport's greyscale pass
    this.victoryFx.dispose(); // disposes the chicken mesh + both firework pools
    this.roundWinner.dispose(); // tears down the round-end winner overlay canvas
    this.footstep.reset();
    this.views.dispose();
    this.renderer.dispose(); // stops + disposes the Babylon engine/scene
    this.interp.clear();
    this.prediction.despawn();
    this.aliveByPlayer.clear();
    frameBus.project = null;
    frameBus.champions.clear();
    clearCombatText();
    frameBus.localCast = null;
    frameBus.arenaZones = null;
    frameBus.arenaId = null;
    frameBus.cameraView = null;
    this.casts.clearAll();
    resetSettlement(); // drop the settlement payload so a fresh match starts clean
    perfBus.connection = "offline";
  }

  // --------------------------------------------------------------- arena --

  /**
   * (Re)build the rendered arena for `mapId`. Fetches the arena doc, derives
   * the SAME ArenaDef the server collides against, disposes the previous map's
   * meshes/particles, rebuilds the procedural geometry, then dresses it with
   * decor. Deduped/superseding: a stale in-flight build is dropped if a newer
   * map is requested. A missing/broken doc falls back to the skeleton geometry.
   */
  private applyArena(mapId: string): void {
    if (this.disposed || !mapId) return;
    if (mapId === this.appliedMapId || mapId === this.applyingMapId) return;
    this.applyingMapId = mapId;
    void this.contentDb
      .loadArena(mapId)
      .then((doc) => {
        if (this.disposed || this.applyingMapId !== mapId) return; // superseded
        const def = doc ? arenaDefFromDoc(doc) : SKELETON_ARENA;
        disposeArena(this.renderer.scene, this.arenaHandles);
        // groundStyle picks the floor's PBR texture set (task #80); it lives on
        // the authored doc, not the collision-truth ArenaDef, so it is threaded
        // in here rather than derived inside the builder.
        this.arenaHandles = buildArena(this.renderer.scene, def, doc?.groundStyle);
        // The minimap projects AND bakes its terrain background from the ACTIVE
        // map's collision truth — the same ArenaDef the server collides against,
        // so the picture the player reads can never disagree with the walls they
        // bump into. arenaId is the terrain-cache key.
        frameBus.arenaZones = def.zones.map((z) => ({
          x: z.center.x,
          z: z.center.z,
          r: z.boundaryRadius,
          obstacles: z.obstacles.map((o) =>
            o.kind === "circle"
              ? ({ kind: "circle", x: o.center.x, z: o.center.z, r: o.radius } as const)
              : ({ kind: "segment", ax: o.a.x, az: o.a.z, bx: o.b.x, bz: o.b.z } as const),
          ),
          spawns: z.spawns.map((side) => side.map((s) => ({ x: s.x, z: s.z }))),
        }));
        frameBus.arenaId = def.id;
        this.appliedMapId = mapId;
        this.applyingMapId = null;
        if (doc) void dressArena(this.renderer.scene, this.assets, def, doc, this.arenaHandles);
      })
      .catch(() => {
        if (this.applyingMapId === mapId) this.applyingMapId = null;
      });
  }

  // ------------------------------------------------------------- network --

  /** Runs on every schema patch (~20 Hz): feed clocks/buffers/HUD store. */
  private onStatePatch(state: MatchState): void {
    // reflection-based state may not be materialized before the first patch
    if (!state?.seats || !state.entities) return;
    // the authoritative arena — (re)build the rendered map when it changes. The
    // arena is now per-round (task #145): the sim picks a new arena each round
    // and broadcasts its id, so prefer that per-round id and fall back to the
    // match-level mapId while the sim field is still landing. applyArena dedupes
    // + supersedes, so feeding it every patch only rebuilds on an actual change.
    const arenaId = resolveArenaId(state as unknown as ArenaIdSource);
    if (arenaId) this.applyArena(arenaId);
    const nowMs = performance.now();
    this.connStats.noteSnapshot(nowMs); // snapshot cadence → jitter / gap
    if (state.tick > 0) this.timeSync.noteServerTick(state.tick, nowMs);

    this.teamBySeat.clear();
    state.seats.forEach((ss) => this.teamBySeat.set(ss.seatId, ss.teamId));

    const seen = new Set<number>();
    state.entities.forEach((es) => {
      seen.add(es.id);
      this.interp.push(es.id, { tick: state.tick, x: es.x, z: es.z, fx: es.fx, fz: es.fz });
    });
    this.interp.prune(seen);

    syncHudFromState(state, this.conn.accountId);

    // authoritative sample for the local champion → reconciliation input
    const hud = hudStore.getState();
    if (hud.localSeatId !== null && hud.localEntityId !== null) {
      const seat = state.seats.get(String(hud.localSeatId));
      const es = state.entities.get(String(hud.localEntityId));
      if (seat && es) {
        this.connStats.noteAck(seat.lastAckSeq, nowMs); // RTT from input ack
        this.pendingAuth = {
          entityId: es.id,
          x: es.x,
          z: es.z,
          zone: es.zone,
          ackSeq: seat.lastAckSeq,
        };
      }
    }
  }

  // ---------------------------------------------------------------- loop --

  private readonly frame = (): void => {
    if (this.disposed) return; // teardown raced a scheduled frame — do not reschedule
    this.raf = requestAnimationFrame(this.frame);
    const nowMs = performance.now();

    // fps cap: skip the whole frame body until the target interval elapses.
    // The rAF keeps ticking at display rate; we render on a throttled cadence.
    // (prediction/interp stay time-based off dtMs, so skipping is lossless.)
    const cap = this.renderParams.fpsCap;
    if (cap > 0 && nowMs - this.lastFrameMs < 1000 / cap - CAP_SLACK_MS) return;

    const dtMs = Math.min(Math.max(nowMs - this.lastFrameMs, 1), 100);
    this.lastFrameMs = nowMs;

    const state = this.conn.room?.state ?? null;

    // 1) drain network events (queued by socket callbacks)
    const localId = hudStore.getState().localEntityId;
    const events = this.conn.drainEvents();
    // Camera-wave per-batch state, settled BEFORE anything is dispatched:
    //   • batchProfiled — `damage` arrives before its `hitImpact` twin, so the
    //     legacy scalar shake has to know up-front that the directional kick is
    //     coming and stand down (else one hit shakes twice);
    //   • frameKicks — the teamfight crowding index, reset each batch.
    this.batchProfiled = batchCarriesImpactProfile(events);
    this.frameKicks = 0;
    for (const ev of events) {
      this.vfx.handleEvent(ev, nowMs); // particles + damage numbers
      this.views.handleEvent(ev, nowMs); // anim pulses + hit flash + hitstop
      this.casts.handleEvent(ev, nowMs); // cast/windup timing → cast bars
      this.applyCombatFeedback(ev, localId, nowMs); // camera kick/punch-in + vignette + ripple
      const sfxKey = combatSfxKey(ev); // per-frame combat SFX (fire-and-forget)
      if (sfxKey) audioSystem.playSfx(sfxKey);
      if (ev.type === "death" && state) {
        recordDeathEvent(ev, state);
        // task #85: the ONLY signal that means "you died", as opposed to the
        // four other ways a champion can read `alive === false` (champ-select,
        // the whole intermission, a bye team, the resolution/settlement
        // phases). DeathSystem emits it solely on the hp<=0 crossing, so a
        // seat parked dead by enterCombat never produces one.
        this.deathFocus.noteDeath(Number(ev.data.id));
      }
      // shop outcomes for THIS player — the purchase/sale confirmations and,
      // the point of task #60, every rejection with its reason. The HUD turns
      // them into a readable line + the 効果音ラボ cue (ui/panels/shopFeedback).
      if (isShopEvent(ev.type)) recordShopEvent(ev, localId);
      // victory-settlement scoreboard (arrives once at matchEnd) → settlement UI
      if (ev.type === SETTLEMENT_EVENT) recordSettlement(ev.data as unknown as MatchSettlement);
    }

    // match-outcome freeze: once the server decides the winner it pins every
    // hero idle for the settlement front-view. Mirror it client-side so local
    // prediction + input don't fight the freeze (see step 3 + step 5 below).
    const frozen = state?.outcomeDecided === true;

    // 2) advance the interpolation clock (delay is a live network setting)
    const renderTick = this.timeSync.ready
      ? this.timeSync.renderTick(nowMs, this.renderParams.interpolationDelayMs)
      : 0;

    // 3) local prediction: (re)spawn shadow, reconcile, fixed-step
    if (state) this.ensurePredictionEntity(state);
    if (this.pendingAuth && this.prediction.active) {
      const pa = this.pendingAuth;
      this.pendingAuth = null;
      const authPos: Vec2 = { x: pa.x, z: pa.z };
      if (pa.zone !== this.prediction.zone || this.prediction.errorTo(authPos) > TELEPORT_EPS) {
        this.prediction.teleport(authPos, pa.zone);
      } else {
        this.prediction.reconcile(authPos, pa.ackSeq);
      }
    }
    if (frozen) {
      // settlement freeze: hold the prediction shadow (the server pins the hero);
      // reconcile above still snaps it to the idle authority so it stays put.
      this.predAccumMs = 0;
    } else {
      this.predAccumMs += dtMs;
      while (this.predAccumMs >= TICK_MS) {
        this.prediction.stepTick();
        this.predAccumMs -= TICK_MS;
      }
    }
    // RENDER ALPHA (task #43). The fixed-step loop leaves predAccumMs in
    // [0, TICK_MS): how far the render clock has advanced INTO the tick that
    // has not run yet. That leftover IS the blend factor between the previous
    // and the current tick position. Throwing it away — the old behaviour —
    // renders the local hero at the raw 30 Hz tick, so at 60 fps it jumps a
    // whole tick-step on one frame and stands still on the next (measured 20:1
    // per-frame speed ratio ≈ 13.5 device px of judder every other frame).
    // During the settlement freeze predAccumMs is pinned to 0, so use alpha = 1
    // to hold the hero exactly on the authoritative pose instead of a tick behind.
    const renderAlpha = frozen ? 1 : Math.min(1, Math.max(0, this.predAccumMs / TICK_MS));
    this.gamepads.poll(); // pads → per-player orders/aim/commands before the flush
    if (this.touch) this.touch.poll(); // joystick → move orders + aim state onto touchFrame
    // Ground aim/preview telegraph, both platforms (task #152): a live touch
    // drag-aim wins; otherwise a PRESSED-AND-HELD ability button (touch finger or
    // desktop mouse — the ui/abilityHold seam) shows its dashed range + AoE.
    {
      let indicator: AimIndicatorState = this.touch ? touchFrame.indicator : null;
      if (indicator === null) {
        const held = getHeldAbility();
        if (held !== null) indicator = this.resolveHoldPreview(held);
      }
      this.aimIndicator.update(indicator);
    }
    // freeze mirrors the server: stop flushing intents so a held move order can't
    // steer the frozen hero (the server ignores them anyway — this keeps the
    // still hero in the front-view shot instead of drifting under prediction).
    if (!frozen) this.sessions.update(nowMs); // flush EVERY local player's sender

    // 4) entity views — imperative transform writes
    const localPose = this.prediction.active ? this.prediction.renderPose(dtMs, renderAlpha) : null;
    // subtle footstep cue for the local champion (cooldown-gated in playSfx)
    if (localPose) {
      if (this.footstep.advance(localPose.x, localPose.z)) audioSystem.playSfx("footstep");
    } else {
      this.footstep.reset();
    }
    if (state) {
      const center = localPose ? { x: localPose.x, z: localPose.z } : this.localSelfPos();
      const drawDist = this.renderParams.drawDistance;
      this.views.sync({
        entities: this.collectEntities(state),
        poseFor: (e) => {
          if (e.id === this.predictedEntityId && localPose && e.alive) return localPose;
          return this.interp.sample(e.id, renderTick) ?? { x: e.x, z: e.z, fx: e.fx, fz: e.fz };
        },
        nowMs,
        dtMs,
        // cull champions beyond the draw distance from the followed champion
        cull:
          center && drawDist < DRAW_DISTANCE_MAX
            ? { cx: center.x, cz: center.z, maxDistance: drawDist }
            : undefined,
      });
    }

    // 5) cameras — one per local player, each following its own champion.
    // Mouse edge-pan / key-pan only steer player 0's camera.
    for (let p = 0; p < this.viewports.count; p++) {
      const rig = this.viewports.rigFor(p);
      const pos =
        p === 0
          ? localPose
            ? { x: localPose.x, z: localPose.z }
            : this.localSelfPos()
          : this.playerSelfPos(p);
      if (frozen) {
        // settlement: ease to a cinematic FRONTAL hero shot of the still
        // champion (captured once per rig; input is ignored while frozen).
        if (!rig.inSettlement && pos) rig.setSettlement(pos, this.playerFacing(p));
        rig.update({ dtMs, localPos: null, cursor: null, panKeys: null, viewportWidth: this.canvas.clientWidth, viewportHeight: this.canvas.clientHeight });
        continue;
      }
      if (rig.inSettlement) rig.clearSettlement(); // defensive (won't fire mid-match)
      // death spectator: unlock/re-lock this rig on the player's alive↔dead edge
      if (state) this.updateSpectatorCam(p, rig, state);
      rig.update({
        dtMs,
        localPos: pos,
        cursor: p === 0 ? this.input.cursor : null,
        panKeys: p === 0 ? this.input.panKeys : null,
        viewportWidth: this.canvas.clientWidth,
        viewportHeight: this.canvas.clientHeight,
      });
    }

    // 5a) publish player 0's ground-plane view — the minimap's viewport box is
    // this REAL frustum (target/dolly/pitch/fov/aspect), read back off the
    // camera after the update above, never a stand-in rectangle.
    frameBus.cameraView = this.cameraRig.groundView();

    // 5b) decor auto-fade — ghost tall landmark props (audit #29 "fade") that
    // block any camera→hero sightline; no-op on arenas without fade props.
    this.updateDecorFade(dtMs, state !== null);

    // 6) vfx (one-shots + the ambient lives-with-entity channel + combat post-fx)
    this.vfx.update(nowMs);
    if (state && this.contentDb.ready) this.syncAmbient(nowMs);
    this.ambient.tick(nowMs, dtMs);
    this.whirlwind.tick(nowMs, dtMs);
    this.postFx.update(dtMs); // decays vignette/ripple; detaches the pass when idle
    // death-spectator greyscale (task #85). A null frame (no state) ramps every
    // viewport back to colour and detaches — same as every other revert path.
    this.deathFocus.update(dtMs, state ? this.deathFocusFrame(state) : null);

    // victory fireworks (task #93): the pure VictoryGate inside decides whether
    // THIS frame crosses a round-win or match-win (吃雞) edge for the local
    // team, and fires the matching tier. Costs nothing until an edge fires.
    if (state) this.victoryFx.sync(this.victoryInput(state), nowMs);
    this.victoryFx.update(nowMs);

    // round-end winner presentation (task #143): the round WINNER's champion
    // stands centre-screen for a few seconds at each round-end, then clears.
    this.updateRoundWinner(state, nowMs);

    // 7) world-anchored DOM data + render
    if (state) this.updateFrameBus(state, nowMs);
    if (!this.renderSuppressed) this.renderer.render();

    // 8) perf sampling → adaptive brain + perfBus (read by the overlay @4Hz)
    const workMs = performance.now() - nowMs;
    this.samplePerf(nowMs, dtMs, workMs);
  };

  /** Feed the adaptive manager the frame COST and publish perf stats. */
  private samplePerf(nowMs: number, dtMs: number, workMs: number): void {
    const instFps = 1000 / dtMs;
    this.fpsEma = this.fpsEma === 0 ? instFps : this.fpsEma + (instFps - this.fpsEma) * 0.1;

    // adaptive: workMs is the pre-cap cost → capability signal. May recompute
    // renderParams synchronously (via the qualityController subscription).
    qualityController.sample(workMs, nowMs);
    const stats = qualityController.frameStats();
    const p = this.renderParams;
    const cs = this.connStats.sample(nowMs);
    const rstats = this.renderer.stats();

    perfBus.fps = this.fpsEma;
    perfBus.avgFps = stats.avgFps || this.fpsEma;
    perfBus.minFps = stats.minFps || this.fpsEma;
    perfBus.frameMs = dtMs;
    perfBus.workMs = stats.avgMs || workMs;
    perfBus.pingMs = cs.pingMs;
    perfBus.jitterMs = cs.jitterMs;
    perfBus.snapshotGapMs = cs.snapshotGapMs;
    perfBus.connection = this.connStats.quality(nowMs);
    perfBus.qualityLevel = p.adaptiveLevel;
    perfBus.resolutionScale = p.resolutionScale;
    perfBus.particleDensity = p.particleDensity;
    perfBus.shadows = p.shadows;
    perfBus.adaptiveActive = p.adaptiveActive;
    perfBus.entityCount =
      this.views.championCount + this.views.projectileCount + this.views.flowerCount;
    perfBus.drawCount = rstats.meshes;
    perfBus.particleCount = rstats.particleSystems;
  };

  // ------------------------------------------------------------- helpers --

  /**
   * Collect the authoritative entity set into a REUSED object pool — the hot
   * path allocated a fresh array + one object per entity per frame; pooling
   * drops that to zero steady-state allocation. The registry only reads these
   * fields (never retains the references), so reuse across frames is safe.
   */
  private collectEntities(state: MatchState): EntityViewState[] {
    const scratch = this.entityScratch;
    scratch.length = 0;
    let i = 0;
    state.entities.forEach((es) => {
      let e = this.entityPool[i];
      if (!e) {
        e = { id: 0, kind: 0, seatId: 0, key: "", teamId: 0, x: 0, z: 0, fx: 0, fz: 0, alive: false };
        this.entityPool[i] = e;
      }
      e.id = es.id;
      e.kind = es.kind;
      e.seatId = es.seatId;
      e.key = es.key;
      e.teamId = this.teamBySeat.get(es.seatId) ?? 0;
      e.x = es.x;
      e.z = es.z;
      e.fx = es.fx;
      e.fz = es.fz;
      e.alive = es.alive;
      // revive circles (kind 3) reuse the float slots for their own state —
      // see protocol ENTITY_KIND for the mapping. Decoded once here so the
      // render layer never has to know about the packing.
      if (es.kind === KIND_REVIVE_CIRCLE) {
        const rv = e.revive ?? (e.revive = {
          progress: 0,
          lifeLeft: 1,
          radius: 2,
          channelling: false,
          contested: false,
        });
        rv.progress = es.maxHp > 0 ? Math.min(1, es.hp / es.maxHp) : 0;
        rv.lifeLeft = es.maxMana > 0 ? Math.max(0, Math.min(1, es.mana / es.maxMana)) : 1;
        rv.radius = es.shield > 0 ? es.shield : 2;
        rv.channelling = (es.flags & ENTITY_FLAG.CHANNELLING) !== 0;
        rv.contested = (es.flags & ENTITY_FLAG.CONTESTED) !== 0;
      } else if (e.revive) {
        e.revive = undefined; // pooled slot reused by a different kind
      }
      scratch.push(e);
      i++;
    });
    return scratch;
  }

  /**
   * Ambient vfx attach/detach diff, driven entirely off the PUBLIC
   * EntityViewRegistry surface (getChampionView → view.root): every alive
   * champion with a view gets its modelKey's ambient bindings attached under
   * its root node; dead/vanished champions are swept (WC3 semantics: ambient
   * effects live while the entity lives). Uses the entity scratch pool that
   * `collectEntities` filled for this frame's views.sync.
   */
  private syncAmbient(nowMs: number): void {
    const seen = this.ambientSeen;
    seen.clear();
    for (const e of this.entityScratch) {
      if (e.kind !== 0 || !e.alive) continue;
      const view = this.views.getChampionView(e.id);
      if (!view) continue;
      seen.add(e.id);
      const modelKey = this.resolveModelKey(e.key, e.seatId);
      this.ambient.attach(e.id, modelKey, view.root);
      // task #59: the state-gated channel needs the CURRENT visual anim state,
      // which only the view knows. Bound models only — everything else is a
      // cheap map miss that never allocates.
      if (WhirlwindFx.handles(modelKey)) {
        this.whirlwind.sync(e.id, modelKey, view.root, view.anim.state, nowMs);
      }
    }
    this.whirlwind.sweep(seen);
    this.ambient.sweep(seen);
  }

  /**
   * Feed the arena's DecorFader: every viewport camera eye + every alive
   * champion's rendered position (from the entity scratch pool filled this
   * frame). Pooled slot objects — zero per-frame allocation. When there is no
   * match state the hero list is empty, so any ghosted prop eases back solid.
   */
  private updateDecorFade(dtMs: number, hasState: boolean): void {
    const fader = this.arenaHandles.fader;
    if (fader.size === 0) return;
    let camCount = 0;
    for (let p = 0; p < this.viewports.count && camCount < this.fadeCams.length; p++) {
      const eye = this.viewports.rigFor(p).eye;
      const slot = this.fadeCams[camCount++]!;
      slot.x = eye.x;
      slot.y = eye.y;
      slot.z = eye.z;
    }
    let heroCount = 0;
    if (hasState) {
      for (const e of this.entityScratch) {
        if (e.kind !== 0 || !e.alive) continue;
        let slot = this.fadeHeroes[heroCount];
        if (!slot) {
          slot = { x: 0, z: 0 };
          this.fadeHeroes[heroCount] = slot;
        }
        const pos = this.views.posOf(e.id);
        slot.x = pos?.x ?? e.x;
        slot.z = pos?.z ?? e.z;
        heroCount++;
      }
    }
    fader.update(dtMs, this.fadeCams, camCount, this.fadeHeroes, heroCount);
  }

  private schemaPos(id: number): { x: number; z: number } | null {
    const es = this.conn.room?.state.entities.get(String(id));
    return es ? { x: es.x, z: es.z } : null;
  }

  /**
   * Team of an entity, or null when it has none (neutral flowers, projectiles)
   * or the seat table is not up yet. Floating combat text (task #92) resolves
   * ally-vs-enemy through this; a null deliberately demotes the event to the
   * low-priority third-party band instead of guessing.
   */
  private teamOfEntity(id: number): number | null {
    const es = this.conn.room?.state.entities.get(String(id));
    if (!es) return null;
    return this.teamBySeat.get(es.seatId) ?? null;
  }

  /**
   * Screen-space combat feedback for one drained event.
   *
   * CAMERA (the wave that consumes the #133 ImpactProfile — audit P1). Every
   * event goes through combatFeedback.planCameraReaction, the single authority
   * on what the camera does, and whatever it returns is applied here:
   *   • a profiled `hitImpact` involving the local player → a DIRECTIONAL kick:
   *     CameraRig.addShake(amp, ms, {dir, style, kick}) shoves the eye ALONG the
   *     hit vector on the contact frame, so a blow reads as "it came from THERE"
   *     instead of an undirected rattle. Perspective/quality/reduced-motion and
   *     teamfight crowding are all folded in by the planner.
   *   • the local player's own EX `abilityCast` → CameraRig.exPunchIn, the
   *     cinematic 特寫 push-in. Fired off the CAST (one per super), never off the
   *     EX's damage ticks, and never twice inside EX_PUNCH_MIN_INTERVAL_MS.
   *   • the LEGACY scalar `damage` shake survives only for pre-#133 batches that
   *     carry no profile at all (old replays); `batchProfiled` suppresses it
   *     otherwise, so a profiled hit can never shake twice.
   *
   * POST-FX stays on the rich `damage` payload:
   *   • RED VIGNETTE only when the LOCAL player takes damage, intensity by the
   *     fraction of max-hp lost.
   *   • RIPPLE / heat-distortion on any heavy hit (crit/kill or ≥ HEAVY_HIT_DMG),
   *     matching beams/explosions. All post-fx are tier-gated inside CombatPostFx.
   */
  private applyCombatFeedback(ev: EventMessage, localId: number | null, nowMs: number): void {
    const reaction = planCameraReaction(ev, {
      localId,
      scale: this.shakeScale,
      crowdIndex: this.frameKicks,
      batchProfiled: this.batchProfiled,
      sinceExPunchMs: nowMs - this.lastExPunchMs,
      tickMs: TICK_MS,
    });
    if (reaction.kick) {
      const k = reaction.kick;
      this.frameKicks++; // only a kick that actually fired spends crowd budget
      this.cameraRig.addShake(k.amp, k.durationMs, { dir: k.dir, style: k.style, kick: k.kick });
    }
    if (reaction.exPunch) {
      this.lastExPunchMs = nowMs;
      this.cameraRig.exPunchIn(EX_PUNCH_DEPTH, EX_PUNCH_MS);
    }

    if (ev.type !== "damage") return;
    const amount = typeof ev.data.amount === "number" ? ev.data.amount : 0;
    if (amount <= 0) return;
    const crit = Boolean(ev.data.crit);
    const killingBlow = Boolean(ev.data.killingBlow);
    const target = ev.data.target as number | undefined;
    const taken = localId !== null && target === localId;

    if (taken) {
      const maxHp = this.localMaxHp();
      this.postFx.addVignette(maxHp > 0 ? amount / maxHp : 0);
    }
    if (crit || killingBlow || amount >= HEAVY_HIT_DMG) {
      this.postFx.addRipple({ amount, crit, killingBlow });
    }
  }

  /** Max hp of the local champion (0 when unknown) — vignette hp-loss scaling. */
  private localMaxHp(): number {
    const id = hudStore.getState().localEntityId;
    if (id === null) return 0;
    const es = this.conn.room?.state.entities.get(String(id));
    return es?.maxHp ?? 0;
  }

  private localSelfPos(): Vec2 | null {
    const predicted = this.prediction.predictedPos;
    if (predicted) return predicted;
    const hud = hudStore.getState();
    if (hud.localEntityId === null) return null;
    return this.schemaPos(hud.localEntityId);
  }

  private localAbility(slot: AbilitySlot): AimAbility | null {
    return this.abilityForSeat(hudStore.getState().localSeatId, slot);
  }

  /**
   * Hold-to-preview ground telegraph (task #152): the dashed cast-RANGE ring +
   * AoE disc for a PRESSED-AND-HELD ability button, centred on the local hero.
   * Range AND radius are scaled by the live combat-env `abilityRange` factor
   * (post-#136) so the ring matches the reach the sim will actually cast at.
   * Null when the ability isn't learned/unlocked (localAbility gate) or the hero
   * has no position yet — nothing to draw.
   */
  private resolveHoldPreview(slot: AbilitySlot): AimIndicatorState {
    const ability = this.localAbility(slot);
    const self = this.localSelfPos();
    if (!ability || !self) return null;
    // keep the imperative displayFinal singleton in sync with the live wire table
    // (idempotent — early-returns when the JSON is unchanged) so the multiplier is
    // correct regardless of which React panels happen to be mounted.
    setDisplayEnvJson(hudStore.getState().combatEnvJson);
    const mult = envFactor("abilityRange");
    const range = ability.range * mult;
    const rawRadius = (ability as { radius?: number }).radius ?? 0;
    const radius = rawRadius > 0 ? rawRadius * mult : null;
    if (range <= 0.1 && radius === null) return null;
    return { kind: "range", x: self.x, z: self.z, range, radius };
  }

  private abilityForSeat(seatId: number | null, slot: AbilitySlot): AimAbility | null {
    if (seatId === null) return null;
    const seat = hudStore.getState().seats.find((s) => s.seatId === seatId);
    if (!seat || !seat.championId) return null;
    const def = Champions.tryGet(seat.championId as ChampionId);
    if (!def) return null;
    // EX lives in its own slot (standalone ability doc, unlocked not ranked)
    if (slot === "EX") {
      if (!seat.exAbilityId || seat.exRank <= 0) return null; // no EX / still locked
      return Abilities.tryGet(seat.exAbilityId as AbilityId) ?? null;
    }
    const rank = seat.abilityRanks[SLOT_INDEX[slot]] ?? 0;
    if (rank <= 0) return null; // not learned yet — don't spam the server
    return def.abilities[slot];
  }

  // -------------------------------------------------- couch player views --

  /** HUD projection of couch player k (null before its seat materializes). */
  private playerView(player: number) {
    return hudStore.getState().localPlayers.find((lp) => lp.player === player) ?? null;
  }

  /** Rendered position of couch player k's champion (0 = predicted). */
  private playerSelfPos(player: number): Vec2 | null {
    if (player === 0) return this.localSelfPos();
    const lp = this.playerView(player);
    if (!lp || lp.entityId === null) return null;
    return this.views.posOf(lp.entityId) ?? this.schemaPos(lp.entityId);
  }

  /** Authoritative facing of couch player k (gamepad aim fallback). */
  private playerFacing(player: number): Vec2 | null {
    const lp = this.playerView(player);
    const entityId = player === 0 ? hudStore.getState().localEntityId : (lp?.entityId ?? null);
    if (entityId === null) return null;
    const es = this.conn.room?.state.entities.get(String(entityId));
    if (!es) return null;
    return { x: es.fx, z: es.fz };
  }

  private playerAbility(player: number, slot: AbilitySlot): AimAbility | null {
    if (player === 0) return this.localAbility(slot);
    return this.abilityForSeat(this.playerView(player)?.seatId ?? null, slot);
  }

  private playerTeam(player: number): number {
    if (player === 0) {
      const hud = hudStore.getState();
      return hud.seats.find((s) => s.seatId === hud.localSeatId)?.teamId ?? -1;
    }
    return this.playerView(player)?.teamId ?? -1;
  }

  /** Live enemy champions of a team as pickable circles (view-space). */
  private enemyUnitsFor(myTeam: number): PickableUnit[] {
    const state = this.conn.room?.state;
    if (!state) return [];
    const units: PickableUnit[] = [];
    state.entities.forEach((es) => {
      if (es.kind !== 0 || !es.alive) return;
      if ((this.teamBySeat.get(es.seatId) ?? -1) === myTeam) return;
      const pos = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
      units.push({ id: es.id, x: pos.x, z: pos.z, radius: 0.6 });
    });
    return units;
  }

  private pickEnemyAt(ground: Vec2): number | null {
    return pickUnit(ground, this.enemyUnitsFor(this.playerTeam(0)));
  }

  /**
   * Is the LOCAL player's own champion under the ground point? Same circle
   * model + radius/slack as enemy picking, but against the predicted/rendered
   * self position (what the player actually sees). Dead heroes don't answer.
   */
  private pickSelfAt(ground: Vec2): boolean {
    const id = hudStore.getState().localEntityId;
    const pos = this.localSelfPos();
    if (id === null || !pos) return false;
    const es = this.conn.room?.state.entities.get(String(id));
    if (es && !es.alive) return false; // a corpse has no quips
    return pickUnit(ground, [{ id, x: pos.x, z: pos.z, radius: 0.6 }]) !== null;
  }

  /**
   * The local champion's resolved model — glb path, normalising scale and the
   * model key — for the intermission market to stand at the merchant's counter.
   * Goes through the SAME `modelDocFor` seam the arena's ChampionView uses, so
   * an equipped skin and the dev-only Blizzard overlay both apply, and the hero
   * you shop with is the hero you fight with. Null before champ-select
   * confirms or while the content DB is still loading — the market then simply
   * shows no hero rather than a placeholder.
   */
  private localChampionModel(): { glbPath: string; scale: number; modelKey: string } | null {
    const hud = hudStore.getState();
    const seat = hud.seats.find((s) => s.seatId === hud.localSeatId);
    if (!seat?.championId) return null;
    const def = Champions.tryGet(seat.championId as ChampionId);
    if (!def) return null;
    const doc = this.modelDocFor(def.modelKey, seat.seatId);
    if (!doc) return null;
    return { glbPath: doc.glbPath, scale: doc.scale, modelKey: doc.id };
  }

  /** ChampionId picked by the local seat (null until champ-select confirms). */
  private localChampionId(): string | null {
    const hud = hudStore.getState();
    const seat = hud.seats.find((s) => s.seatId === hud.localSeatId);
    return seat?.championId ? seat.championId : null;
  }

  // ----------------------------------------------- death spectator camera --

  /**
   * Reused envelope for the death-focus greyscale (task #85): the phase gate,
   * this frame's entity pool (already filled by `collectEntities` in step 4),
   * and each local player's champion entity id. Nothing is decided here — who
   * counts as a teammate, whether the effect is armed and how it ramps all
   * live in render/deathFocus, which is Babylon-free and unit-tested. Zero
   * allocation: the object and both arrays are long-lived fields.
   */
  /**
   * Project the authoritative state into the victory-trigger's input for the
   * LOCAL player (player 0). Resolves my team from the local seat, then reads
   * that TeamState's roundWins + placement. Any field that is not yet known
   * degrades to -1/0, which the gate treats as "unresolved" and never fires on.
   */
  private victoryInput(state: MatchState): VictoryInput {
    const myTeam = this.playerTeam(0);
    let myRoundWins = -1;
    let myPlacement = 0;
    if (myTeam >= 0) {
      for (const t of state.teams) {
        if (t.teamId !== myTeam) continue;
        myRoundWins = t.roundWins;
        myPlacement = t.placement;
        break;
      }
    }
    return {
      phase: state.phase,
      outcomeDecided: state.outcomeDecided === true,
      round: state.round,
      myTeamId: myTeam,
      myRoundWins,
      myPlacement,
    };
  }

  /**
   * Round-end winner presentation (task #143). On the phase EDGE into
   * `resolution` — the SAME "Round over" beat the #142 round-end VO fires on —
   * stand the round WINNER's champion model centre-screen for a few seconds,
   * then clear. The winner is the round's rank-1 champion resolved from the SAME
   * authoritative seats/teams the VO uses (roundEndQuoteChampion in
   * ui/panels/settlementModel), so the model on screen and the voice you hear are
   * always the same champion. That selector returns null on the match-DECIDING
   * round, whose beat is the match-win settlement front-view (#93/#25) — so this
   * never double-presents on the final round. Pure presentation: it only reads
   * the discrete HUD projection and hands a model doc to the stage.
   */
  private updateRoundWinner(state: MatchState | null, nowMs: number): void {
    const phase = state?.phase ?? "";
    const prev = this.roundWinnerPhase;
    this.roundWinnerPhase = phase;

    // edge into the round-end phase → present the round winner (if resolvable)
    if (state && phase === "resolution" && prev !== "resolution") {
      const hud = hudStore.getState();
      const champ = roundEndQuoteChampion(hud.seats, hud.teams);
      const doc = champ ? this.roundWinnerModelDoc(champ, hud.seats) : null;
      if (doc) {
        // Forward the resolved winner + round: the stage needs BOTH to pick the
        // taunt deterministically (audio/victoryTaunt hashes championId+round),
        // and with no ctx it silently skips the whole 嘲諷台詞 half of #93.
        this.roundWinner.show(doc, { championId: champ ?? undefined, round: state.round });
        this.roundWinnerUntilMs = nowMs + ROUND_PRESENT_MS;
      }
    }

    // clear when the beat elapses OR as soon as we leave the resolution phase
    if (this.roundWinner.active && (phase !== "resolution" || nowMs >= this.roundWinnerUntilMs)) {
      this.roundWinner.clear();
    }
  }

  /**
   * The round winner's model doc, resolved through the SAME `modelDocFor` seam
   * the arena ChampionView uses — so the dev-only Blizzard overlay and vertex
   * tint apply exactly as they do in-world. null before the content DB has the
   * doc (then the stage simply shows nothing; the VO still plays).
   */
  private roundWinnerModelDoc(
    championId: string,
    seats: readonly { seatId: number; championId: string }[],
  ): ModelDoc | null {
    const def = Champions.tryGet(championId as ChampionId);
    if (!def) return null;
    const seatId = seats.find((s) => s.championId === championId)?.seatId;
    return this.modelDocFor(def.modelKey, seatId);
  }

  private deathFocusFrame(state: MatchState): DeathFocusFrame {
    const f = this.focusFrame;
    f.phase = state.phase;
    f.outcomeDecided = state.outcomeDecided === true;
    f.entities = this.entityScratch;
    const ids = this.focusLocalEntities;
    ids.length = this.viewports.count;
    const localId = hudStore.getState().localEntityId;
    for (let p = 0; p < ids.length; p++) {
      const id = p === 0 ? localId : (this.playerView(p)?.entityId ?? null);
      ids[p] = id ?? -1;
    }
    return f;
  }

  /**
   * Drive rig `player`'s follow-lock off its champion's alive state. On
   * ALIVE→DEAD we unlock so the player can free-pan the whole arena (centered
   * once on the ongoing fight); on DEAD→ALIVE (respawn next round) we re-lock
   * and snap back to the hero. Per-player so a dead P2 spectates in its own
   * viewport while P1 still follows P1. A fresh match (Restart) starts every
   * rig alive → locked automatically.
   */
  private updateSpectatorCam(player: number, rig: CameraRig, state: MatchState): void {
    const entityId =
      player === 0 ? hudStore.getState().localEntityId : (this.playerView(player)?.entityId ?? null);
    if (entityId === null) return; // no champion yet (champ-select) — leave the rig
    const es = state.entities.get(String(entityId));
    if (!es) return;
    const alive = es.alive;
    const prev = this.aliveByPlayer.get(player);
    this.aliveByPlayer.set(player, alive);
    if (prev === undefined || prev === alive) return; // first sample or no edge
    if (!alive) {
      rig.setDead(true, this.spectatorCenter(player, es)); // frame the fight
    } else {
      rig.setDead(false, { x: es.x, z: es.z }); // snap to the respawned hero
    }
  }

  /** Nearest alive ally to the corpse, else the corpse's zone centroid. */
  private spectatorCenter(player: number, dead: { id: number; x: number; z: number; zone: number }): Vec2 {
    const myTeam = this.playerTeam(player);
    const state = this.conn.room?.state;
    let best: Vec2 | null = null;
    let bestD = Infinity;
    state?.entities.forEach((e) => {
      if (e.kind !== 0 || !e.alive || e.id === dead.id) return;
      if ((this.teamBySeat.get(e.seatId) ?? -1) !== myTeam) return;
      const dx = e.x - dead.x;
      const dz = e.z - dead.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = { x: e.x, z: e.z };
      }
    });
    if (best) return best;
    const zone = SKELETON_ARENA.zones[dead.zone] ?? SKELETON_ARENA.zones[0]!;
    return { x: zone.center.x, z: zone.center.z };
  }

  /** Spawn/refresh the prediction shadow to track the local champion. */
  private ensurePredictionEntity(state: MatchState): void {
    const hud = hudStore.getState();
    const entityId = hud.localEntityId;
    if (entityId === null) {
      if (this.prediction.active) this.prediction.despawn();
      this.predictedEntityId = null;
      return;
    }
    const es = state.entities.get(String(entityId));
    if (!es) return;
    // keep the parsed combat-env table in sync with the authoritative snapshot
    if (state.combatEnvJson !== this.combatEnvJson) {
      this.combatEnvJson = state.combatEnvJson;
      this.combatEnv = parseCombatEnvJson(state.combatEnvJson);
    }
    const seat = hud.seats.find((s) => s.seatId === hud.localSeatId);
    const moveSpeed = this.computeMoveSpeed(seat?.championId ?? "", seat?.items ?? []);
    const attackRange = this.computeAttackRange(seat?.championId ?? "", seat?.items ?? []);
    if (this.predictedEntityId !== entityId) {
      this.prediction.spawn({
        seatId: hud.localSeatId ?? 0,
        pos: { x: es.x, z: es.z },
        zone: es.zone,
        moveSpeed,
        attackRange,
      });
      this.predictedEntityId = entityId;
    } else {
      this.prediction.setMoveSpeed(moveSpeed);
      this.prediction.setAttackRange(attackRange);
    }
  }

  /**
   * base + flat item bonuses, mirroring computeMoveSpeed. The chase stop
   * distance derives from Stat.AttackRange, so a shadow without it predicts a
   * walk into body contact while the server holds at range (constant snapping).
   */
  private computeAttackRange(championId: string, items: string[]): number {
    const def = Champions.tryGet(championId as ChampionId);
    let range = def?.baseStats[Stat.AttackRange] ?? 0;
    for (const itemId of items) {
      if (!itemId) continue;
      const item = Items.tryGet(itemId as ItemId);
      for (const mod of item?.modifiers ?? []) {
        if (mod.stat === Stat.AttackRange && mod.op === ModOp.Flat) range += mod.value;
      }
    }
    // SERVER PARITY: recomputeStats scales AttackRange by the combat-env factor.
    return Math.max(0, range * this.combatEnv.attackRange);
  }

  /** base + flat item bonuses (authoritative reconcile absorbs the rest). */
  private computeMoveSpeed(championId: string, items: string[]): number {
    const def = Champions.tryGet(championId as ChampionId);
    let ms = def?.baseStats[Stat.MoveSpeed] ?? 6.6;
    for (const itemId of items) {
      if (!itemId) continue;
      const item = Items.tryGet(itemId as ItemId);
      for (const mod of item?.modifiers ?? []) {
        if (mod.stat === Stat.MoveSpeed && mod.op === ModOp.Flat) ms += mod.value;
      }
    }
    // SERVER PARITY: the sim multiplies Stat.MoveSpeed by the combat-env
    // factor in recomputeStats (before the [2,14] clamp) — mirror both here
    // or prediction diverges the moment an admin sets moveSpeed != 1.
    ms *= this.combatEnv.moveSpeed;
    return Math.max(2, Math.min(14, ms));
  }

  private updateFrameBus(state: MatchState, nowMs: number): void {
    expireCombatText(nowMs);
    const project = frameBus.project;
    if (!project) return;
    const hud = hudStore.getState();
    const nameBySeat = this.fbNameBySeat;
    const champBySeat = this.fbChampBySeat;
    nameBySeat.clear();
    champBySeat.clear();
    for (const s of hud.seats) {
      nameBySeat.set(s.seatId, s.displayName || `Seat ${s.seatId}`);
      champBySeat.set(s.seatId, s.championId);
    }

    const seen = this.fbSeen;
    seen.clear();
    state.entities.forEach((es) => {
      // champions AND neutral healing flowers (kind 2) carry overhead bars
      if (!hasOverheadBar(es.kind)) return;
      const isFlower = es.kind === KIND_FLOWER;
      seen.add(es.id);
      const pos = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
      let anchor = frameBus.champions.get(es.id);
      if (!anchor) {
        anchor = {
          entityId: es.id,
          name: isFlower ? "" : (nameBySeat.get(es.seatId) ?? `#${es.id}`),
          teamId: isFlower ? -1 : (this.teamBySeat.get(es.seatId) ?? 0),
          championId: "",
          isLocal: es.id === this.predictedEntityId,
          alive: es.alive,
          hpPct: 1,
          shieldPct: 0,
          manaPct: 1,
          worldX: pos.x,
          worldZ: pos.z,
          pose: { sx: 0, sy: 0, visible: false },
          cast: null,
          color: anchorColorFor(es.kind),
        };
        frameBus.champions.set(es.id, anchor);
      }
      anchor.alive = es.alive;
      // picks land after the anchor is created (and change between rounds), so
      // the champion id is refreshed rather than frozen at spawn
      anchor.championId = isFlower ? "" : (champBySeat.get(es.seatId) ?? "");
      anchor.hpPct = es.maxHp > 0 ? es.hp / es.maxHp : 0;
      anchor.shieldPct = es.maxHp > 0 ? es.shield / es.maxHp : 0;
      anchor.manaPct = es.maxMana > 0 ? es.mana / es.maxMana : 0;
      anchor.worldX = pos.x;
      anchor.worldZ = pos.z;
      anchor.pose = project(pos.x, anchorHeightFor(es.kind), pos.z);
      // over-head cast bar (hidden while dead)
      const cp = es.alive ? this.casts.progressFor(es.id, nowMs) : null;
      anchor.cast = cp ? { fraction: cp.fraction, kind: cp.kind } : null;
    });

    // ---- revive circles (task #84) -----------------------------------------
    // Their own frameBus list, NOT champion anchors: they carry no HP bar and
    // no name, and nothing that walks `frameBus.champions` should ever see one.
    // The minimap and the spectating owner's HUD banner both read from here.
    const circles = frameBus.reviveCircles;
    circles.length = 0;
    state.entities.forEach((es) => {
      if (es.kind !== KIND_REVIVE_CIRCLE) return;
      const pos = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
      const lifeLeft = es.maxMana > 0 ? Math.max(0, Math.min(1, es.mana / es.maxMana)) : 1;
      circles.push({
        entityId: es.id,
        ownerSeatId: es.seatId,
        teamId: this.teamBySeat.get(es.seatId) ?? -1,
        zone: es.zone,
        worldX: pos.x,
        worldZ: pos.z,
        radius: es.shield > 0 ? es.shield : 2,
        progress: es.maxHp > 0 ? Math.min(1, es.hp / es.maxHp) : 0,
        secondsLeft: (es.mana * TICK_MS) / 1000,
        lifeLeft,
        channelling: (es.flags & ENTITY_FLAG.CHANNELLING) !== 0,
        contested: (es.flags & ENTITY_FLAG.CONTESTED) !== 0,
      });
    });

    // local player's ability-icon fill overlay (imperative, off React state)
    const localId = hud.localEntityId;
    const lc = localId !== null ? this.casts.progressFor(localId, nowMs) : null;
    frameBus.localCast = lc ? { slot: lc.slot, fraction: lc.fraction, kind: lc.kind } : null;
    for (const id of [...frameBus.champions.keys()]) {
      if (!seen.has(id)) frameBus.champions.delete(id);
    }
    // Each category projects from its OWN world height (see ui/combatText):
    // damage over the chest, heals lower, mana lower still. They must clear the
    // health-bar block at y = 2.45 — a number that covers the HP readout is
    // worse than no number — and the split heights are also what keeps 補血 and
    // 補魔 apart when a flower burst fires both on the same body in one tick.
    for (const e of frameBus.combatText) {
      if (e.active) e.pose = project(e.worldX, e.anchorY, e.worldZ);
    }
  }
}
