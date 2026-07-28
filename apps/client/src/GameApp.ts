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
import {
  Abilities,
  Champions,
  Items,
  Projectiles,
  championPassive,
} from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import {
  DEFAULT_COMBAT_ENV,
  parseCombatEnvJson,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import type { ModelDoc } from "@ggd/shared/content";
import type { AbilityId, ChampionId, ItemId, ProjectileId } from "@ggd/shared/ids";
import type { AbilitySlot, CastableSlot } from "@ggd/shared/sim/intents";
import type { Room } from "colyseus.js";
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
  recordKillComboEvent,
  isShopEvent,
  resetSettlement,
  hudStore,
  setGamepadIndices,
  setLocalAccounts,
} from "./net/RoomStore";
import { recordCastEvent } from "./ui/castAnnounce";
import type { IntentSender } from "./net/IntentSender";
import { InterpolationBuffer } from "./net/InterpolationBuffer";
import { TimeSync } from "./net/TimeSync";
import { LocalPrediction } from "./predict/LocalPrediction";
import { InputCapture } from "./input/InputCapture";
import { MultiGamepadSystem, BTN, type GamepadCameraIntent } from "./input/GamepadInput";
import { PadCameraControl } from "./input/padCamera";
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
import { mayGoTo, ownDuelDecided, pickSpectateZone, spectateRelease, type DuelView } from "./render/spectateFocus";
import { ViewportManager } from "./render/ViewportManager";
import { AssetManager } from "./render/AssetManager";
import {
  EntityViewRegistry,
  mobModelSizeOverride,
  type EntityViewState,
  type ModelDocOverride,
} from "./render/EntityViewRegistry";
import { ARCHETYPE_BY_MODEL_KEY, voxelLookFor } from "./render/views/voxelLook";
import { blizzardOverlayModels } from "./render/views/blizzardOverlay";
import { championTintForId } from "./render/views/championTint";
import { voxelSkinForId } from "./render/views/voxelSkinFor";
import {
  hasOverheadBar,
  anchorColorFor,
  anchorHeightFor,
  KIND_CHAMPION,
  KIND_FLOWER,
  KIND_GUARDIAN,
  KIND_REVIVE_CIRCLE,
} from "./render/overheadAnchors";
import { qualityController, type RenderParams } from "./render/QualityController";
import { shouldRenderFrame } from "./render/frameCap";
import { RoundVfxLifecycle } from "./render/roundVfxLifecycle";
import { VfxSystem } from "./vfx/VfxSystem";
import { AmbientVfx } from "./vfx/AmbientVfx";
import { WhirlwindFx } from "./vfx/WhirlwindFx";
import { CombatPostFx } from "./vfx/CombatPostFx";
import { DeathFocusFx, type DeathFocusFrame } from "./vfx/DeathFocusFx";
import { BurnTintFx, type BurnTintFrame } from "./vfx/BurnTintFx";
import { FireRingFx, type FireRingFrame } from "./render/vfx/FireRingFx";
import { VictoryFireworks } from "./vfx/VictoryFireworks";
import type { VictoryInput } from "./vfx/victoryTrigger";
import { ContentDb } from "./content/ContentDb";
import {
  frameBus,
  clearCombatText,
  clearWorldAnchors,
  expireCombatText,
  setCombatTextScope,
  setDamageNumberCap,
} from "./frameBus";
import { perfBus } from "./perfBus";
import { ConnectionStats } from "./net/ConnectionStats";
import { CastTracker } from "./CastTracker";
import { registerHudActions } from "./ui/actions";
import { getHeldAimSlot } from "./ui/abilityHold";
import { envFactor, setDisplayEnvJson } from "./ui/displayFinal";
import { audioSystem } from "./audio";
import { loadChampionVoices, playChampionSelectVoice } from "./audio/championVoice";
import { warmContextualVoice, playContextualVoice } from "./audio/contextualVoice";
import {
  damageVoiceCandidate,
  deathVoiceCandidate,
  orderVoiceCandidates,
  plainVoiceCandidate,
  type VoiceCandidate,
} from "./audio/voiceAudience";
import { voicePlayOptions, voiceSpatialMix } from "./audio/voiceSpatial";
import { combatSfxKey } from "./audio/combatSfx";
import { resolveSpatial } from "./audio/combatSfxSpatial";
import { SpatialSfxQueue } from "./audio/SpatialSfxQueue";
import type { SfxRelation, SpatialListener } from "./audio/spatial";
import { FootstepCadence } from "./audio/footsteps";
import { RemoteFootsteps, type FootstepSample } from "./audio/remoteFootsteps";
import { beatPerformance } from "./beat";
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
import { SETTLEMENT_EVENT, TEAM_SETTLEMENT_EVENT } from "@ggd/shared/protocol/messages";
import type { EventMessage, MatchSettlement } from "@ggd/shared/protocol/messages";
import { roundWinnerTeamChampions } from "./ui/panels/settlementModel";

const SLOT_INDEX: Record<AbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3, EX: 4 };
/** authoritative error beyond which we treat the correction as a teleport */
const TELEPORT_EPS = 6;
// fps 上限規則搬到 render/frameCap（#23/#266）：這裡以前是四份抄寫中的一份，
// 而漏抄的那一份（StorePreview）就這樣一路以面板頻率在跑。
/** draw distances at/above this are treated as "no cull" (skip the check). */
const DRAW_DISTANCE_MAX = 300;

// The heavy/light grunt threshold now lives with the rest of the voice-audience
// policy (audio/voiceAudience.HURT_HEAVY_FRACTION), because #223 measures it
// against the VICTIM'S own max-hp rather than the local hero's.
/** Idle seconds before the "hum" line may roll (the idle latch is the real gate). */
const HUM_IDLE_MS = 10_000;
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
  /**
   * 回合邊界的特效清場 (task #16 / #259). 判斷邏輯故意住在
   * render/roundVfxLifecycle —— GameApp 無法在測試裡被建構，寫在這裡的東西
   * 只能靠掃字串「證明」，而那分不出程式碼與註解。
   */
  private readonly roundVfx: RoundVfxLifecycle;
  /** ambient per-bone particle/ribbon attachments (lives-with-entity vfx) */
  private readonly ambient: AmbientVfx;
  /**
   * STATE-GATED per-bone attachments (task #59): effects WC3 showed for one
   * animation sequence via GEOSET ANIMATION alpha — data glTF cannot carry, so
   * the geometry shipped always-on and motionless (索隆's whirlwind). Same
   * attach/sweep/tick shape as `ambient`, plus the animation-state gate.
   */
  private readonly whirlwind: WhirlwindFx;
  /** combat post-fx (red vignette on local damage); tier-gated. */
  private readonly postFx: CombatPostFx;
  /**
   * Death-spectator focus desaturation (task #85), one gate per local
   * viewport: while you are dead IN COMBAT the scene drains to grey except
   * soft pools on your living teammates + your revive circle. All the arming /
   * revert logic is render/deathFocus; this class only holds the Babylon pass.
   */
  private readonly deathFocus: DeathFocusFx;
  /**
   * THE FIRE RING (task #195). Two halves, deliberately separate objects:
   *   • `fireRing` is the WORLD half — the contracting wall of flame standing
   *     on `MatchState.fireRingRadius` in the local player's duel zone;
   *   • `burnTint` is the SCREEN half — 「角色被火燒到畫面會變半透明紅」, one
   *     pass per local viewport, attached BEFORE `deathFocus` so a dying
   *     burning player greys out rather than reddening over the grey.
   */
  private readonly fireRing: FireRingFx;
  private readonly burnTint: BurnTintFx;
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
   * SPATIAL COMBAT AUDIO (see audio/spatial).
   *
   * `sfxQueue` collects the frame's combat sounds instead of firing them inline,
   * so they can be sorted by what matters BEFORE the SfxGate sees them and so
   * the listener frame is the current one (the drain is step 1, the camera is
   * step 5 — an inline pan would be a frame stale).
   *
   * `remoteSteps` derives a footstep cadence for the OTHER eleven champions,
   * which the sim deliberately emits no event for.
   */
  private readonly sfxQueue = new SpatialSfxQueue();
  private readonly remoteSteps = new RemoteFootsteps();
  /** scratch for the per-frame remote-footstep sampling (no per-frame alloc). */
  private readonly stepSamples: FootstepSample[] = [];
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
  /**
   * Voice lines the CURRENT drained batch wants to speak, scored but not yet
   * played (#223). Flushed best-first once the batch is fully drained — see
   * flushContextualVoices for why the sort is load-bearing. Reused array,
   * truncated (never reallocated) each flush.
   */
  private readonly frameVoices: VoiceCandidate[] = [];
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
  /**
   * Reused: seats that own a LIVE revive circle this frame (task #220). Filled
   * by `collectEntities` in the same pass that decodes kind 3, and handed to
   * `views.sync` so a corpse whose rescue is still claimable does not dissolve.
   * Computed here rather than in the registry because `SyncArgs.entities` is an
   * `Iterable` that a pre-pass would consume. Read-only downstream — nothing
   * about the sim's revive rules is decided here.
   */
  private readonly reviveOwnerSeats = new Set<number>();
  /** entity id → last tick's CC bitmask, for the contextual status-voice edge. */
  private readonly prevEntityFlags = new Map<number, number>();
  /**
   * hum idle latch (voice-binding-design.md §三): the last time the LOCAL player
   * did anything — issued an order (IntentSender.onSent) or took/received a
   * damage/heal event. After HUM_IDLE_MS of silence the frame loop rolls the
   * quiet "hum" line. -Infinity so a fresh match does not hum before any input.
   */
  private lastLocalActivityMs = -Infinity;
  /** reused: champion entity id of each local player (-1 = none) — task #85. */
  private readonly focusLocalEntities: number[] = [];
  /** reused: each local player's OWN duel decided? (task #208 — lifts the #85 wash). */
  private readonly focusOwnDuelDecided: boolean[] = [];
  /** reused frame envelope handed to the death-focus pass (zero allocation). */
  private readonly focusFrame: DeathFocusFrame = {
    phase: "",
    outcomeDecided: false,
    localEntities: this.focusLocalEntities,
    ownDuelDecided: this.focusOwnDuelDecided,
    entities: this.entityScratch,
  };
  /**
   * Per-player live zone the spectator camera has been redirected to (task
   * #208), or absent = following the player's own zone. Keyed edge-state so the
   * jump fires ONCE per newly-chosen live zone and the player keeps free-pan
   * between jumps. Also the flag that a broken follow-lock must be restored when
   * spectating ends.
   */
  private readonly spectateZoneByPlayer = new Map<number, number>();
  /** reused scratch: DuelView[] rebuilt from state.duels each frame (no alloc). */
  private readonly duelScratch: DuelView[] = [];
  /** reused frame envelopes for the fire ring (task #195) — zero allocation. */
  private readonly ringFrame: FireRingFrame = {
    phase: "",
    fireRingTicks: -1,
    fireRingRadius: 0,
    zone: null,
  };
  private readonly burnBurning: boolean[] = [];
  private readonly burnAlive: boolean[] = [];
  private readonly burnRate: number[] = [];
  private readonly burnFrame: BurnTintFrame = {
    phase: "",
    outcomeDecided: false,
    burning: this.burnBurning,
    alive: this.burnAlive,
    rate: this.burnRate,
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
  /**
   * Per-player pad free-pan vector for the frame in flight (task #197). The
   * right-stick pan is continuous, so it is latched here by the pad `onCamera`
   * sink and consumed by that player's CameraRig.update the same frame; the
   * frame loop clears it before each poll, so a centred stick (no pan emitted)
   * leaves it null and the camera holds still. (The rig only applies it while
   * follow is off — L3 is what turns follow off.)
   */
  private readonly padCameraPan: (Vec2 | null)[] = [];
  /** Per-player R3 zoom-notch state (see input/padCamera). */
  private readonly padCamera: PadCameraControl[] = [];

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
      // GENERATED VOXEL SKIN (task #231). Third use of the same entity →
      // championId seam, for the same client-08 reason. The recipe is computed
      // (pure, from the ChampionDef the registry already holds), not fetched;
      // only the optional hand-authored override comes off the content mount.
      voxelSkinFor: (e) => {
        const championId = this.championIdForSeat(e.seatId);
        return voxelSkinForId(championId, this.contentDb.voxelSkinOverrideFor(championId ?? ""));
      },
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
      // #228 CAST TELEGRAPH TIMING. The ground shape fills off the SAME source
      // the overhead cast bar does — CastTracker, fed castBegin/castEnd/
      // castInterrupt/death — instead of a wall clock inside the vfx layer. A
      // locally-timed fill drifts from the sim (CastResolveSystem pauses the
      // wind-up on hitstop/hitstun) and never cancels on an interrupt, so the
      // old ring could pop "it lands HERE" for damage that never landed.
      // Only a `cast` counts: an auto-attack `windup` shares the tracker slot
      // but is not the ability wind-up this telegraph is portraying.
      castProgress: (id, nowMs) => {
        const p = this.casts.progressFor(id, nowMs);
        return p !== null && p.kind === "cast" ? p.fraction : null;
      },
    });
    this.ambient = new AmbientVfx(this.renderer.scene, {
      bindingsFor: (key) => this.contentDb.ambientBindingsFor(key),
      vfxDocFor: (id) => this.contentDb.vfxFor(id),
      ribbonDocFor: (id) => this.contentDb.ribbonFor(id),
    });
    // 回合邊界 → 特效清場 (#16 / #259)。餵它 phase，它在進/出 combat 的那一幀
    // 呼叫 vfx.resetForRound()。見 render/roundVfxLifecycle 的模組註解。
    this.roundVfx = new RoundVfxLifecycle(this.vfx);
    this.whirlwind = new WhirlwindFx(this.renderer.scene);

    // Combat post-fx (red vignette) on the LOCAL player's camera. Heavy
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

    // THE FIRE RING (task #195). The burn tint is constructed FIRST and
    // therefore attaches BEFORE the death focus: post-process order on a
    // Babylon camera is attach order, so a champion who burns to death sees the
    // red washed down to grey rather than a red film over a grey frame.
    this.fireRing = new FireRingFx(this.renderer.scene, {
      vfxDocFor: (id) => this.contentDb.vfxFor(id),
    });
    this.burnTint = new BurnTintFx(
      { cameraFor: (p) => this.viewports.rigFor(p).camera },
      playerCount,
    );

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
    // warm the CONTEXTUAL combat-voice pack cache (same MANIFEST.json single
    // flight) so the first cast/kill/hurt of a match can dispatch synchronously.
    void warmContextualVoice();
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
      // hum idle latch: any issued input means you are NOT idle (voice §三).
      this.noteLocalCombat();
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
        if (!champ) return;
        // click-self quip: 二擇一 (client Math.random) between the select-voice
        // ladder (map-quip / soundset / #139 名言) and the generated pack's own
        // `quote` line, so both channels are exercised but only ONE voice fires
        // per click (anti-pollution 「同一時間一句」; voice-binding-design.md §三).
        // The pack-quote rides playContextualVoice → the shared throttle + the
        // in-flight de-dup; a hero with no `quote` line falls through to nothing,
        // so bias toward the always-available ladder when the coin picks quote
        // but the pack is empty is handled by playContextualVoice returning false.
        if (Math.random() < 0.5 && playContextualVoice(champ, "quote")) return;
        void playChampionSelectVoice(champ);
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
      // #269 前往/返回觀戰 — the two buttons that replaced #208's automatic jump.
      spectateGoTo: (zone) => this.spectateGoTo(zone),
      spectateReturn: () => this.spectateReturn(),
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
        onCamera: (p, cam) => this.applyPadCamera(p, cam),
        onButton: (p, btn) => this.onPadButton(p, btn),
        onPadsChanged: (indices) => setGamepadIndices(indices),
      },
      (player) => ({
        selfPos: this.playerSelfPos(player),
        facing: this.playerFacing(player),
        ability: (slot) => this.playerAbility(player, slot),
        nearestEnemy: (from, maxRange, aimDir) =>
          pickNearestUnit(from, this.enemyUnitsFor(this.playerTeam(player)), maxRange, aimDir),
        // what a LONG PRESS on a skill button does: spend this point, or (with
        // none) show that ability's description (owner's 2026-07-27 pad map)
        skillPoints: this.playerSkillPoints(player),
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

  /**
   * REPLAY flow (task #175): bind the renderer to a "replay" room. The state
   * patch path is IDENTICAL to a live match because the replay room speaks the
   * same schema — this method exists only to open the right room; every frame
   * after that is the ordinary render loop. Returns the room so the replay
   * controls overlay can send transport messages on it.
   */
  async connectReplay(replayId: string, ticket: string): Promise<Room<MatchState>> {
    // task #272: a replay receives snapshots but nobody sends input into it, so
    // no ack ever returns and RTT is unmeasurable BY CONSTRUCTION — not slow,
    // not broken, absent. The ping chip reads this and says 「重播」 rather than
    // sitting on a permanent 「量測中」 or, worse, printing 0 ms.
    perfBus.netMode = "replay";
    const room = await this.sessions.connectReplay(replayId, ticket);
    setLocalAccounts(this.sessions.localAccountIds());
    room.onStateChange((state) => this.onStatePatch(state));
    this.onStatePatch(room.state);
    return room;
  }

  /**
   * Pad camera op for local player `player`. The discrete parts (L3's follow
   * toggle, R3's zoom notch / home) are one-shots handed to `input/padCamera`,
   * which owns the notch counter and is unit-tested against a fake rig; the pan
   * is continuous, so it is latched into `padCameraPan[player]` and the camera
   * update step reads it this same frame (cleared at the top of the next frame).
   */
  private applyPadCamera(player: number, cam: GamepadCameraIntent): void {
    const rig = this.viewports.rigFor(player);
    (this.padCamera[player] ??= new PadCameraControl()).apply(rig, cam);
    if (cam.pan) this.padCameraPan[player] = cam.pan;
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

  /**
   * ChampionId of the entity `entityId` via the seat table (seat.entityId →
   * championId), or null when the entity is not a seated champion (a mob, a
   * projectile, a guardian, or a seat that has not spawned). CLIENT-ONLY, used
   * solely to route the contextual voice line to the right champion's pack.
   */
  private championIdForEntity(entityId: number | null | undefined): string | null {
    if (entityId === null || entityId === undefined) return null;
    const seat = hudStore.getState().seats.find((s) => s.entityId === entityId);
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
    // #262 — A MOB HAS NO SEAT, so the championId hop below returns null and the
    // #150 normalization would render 一般殭屍 / 特殊殭屍 / 殭屍王 at the same
    // 1.8u (all three docs share one .glb; only their `scale` differs, and #150
    // stopped reading `scale`). For a mob the doc's `scale` IS the size ratio,
    // so it is turned into the relative multiplier here — the same seam, one
    // branch earlier. `mobModelSizeOverride` returns null for every non-mob, so
    // champions keep the normalized size exactly as #150 left it.
    const mob = mobModelSizeOverride(e, this.modelDocFor(e.key));
    if (mob) return mob;
    const championId = this.championIdForSeat(e.seatId);
    if (!championId) return null;
    const base = this.contentDb.modelOverrideFor(championId);
    // #226: 44 champions share four generated blocky meshes, so the per-champion
    // LOOK (palette / proportions / props) is seeded from the championId here —
    // the one place that can resolve entity → champion. Only the four stand-in
    // model keys get one; an imported champion wears its own art and must not
    // be repainted. Deterministic, so every client renders the same figure.
    const archetype = ARCHETYPE_BY_MODEL_KEY[e.key];
    if (!archetype) return base;
    return { ...(base ?? {}), voxel: voxelLookFor(championId, archetype) };
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
    this.fireRing.dispose(); // band mesh + rim emitters
    this.burnTint.dispose(); // detaches every viewport's red wash
    this.deathFocus.dispose(); // detaches every viewport's greyscale pass
    this.victoryFx.dispose(); // disposes the chicken mesh + both firework pools
    this.roundWinner.dispose(); // tears down the round-end winner overlay canvas
    this.footstep.reset();
    this.remoteSteps.reset();
    this.sfxQueue.reset(); // drop any un-flushed batch — teardown must be silent
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
    // task #272: and forget the NET readings with it. perfBus is a
    // process-global plain object, so a match that ended would otherwise leave
    // its last ping, its sample counts and an ever-growing snapshot gap sitting
    // there — and the always-on chip, which is on the lobby too, would report
    // 斷線 for a match nobody is in any more.
    this.connStats.reset();
    perfBus.pingMs = 0;
    perfBus.jitterMs = 0;
    perfBus.snapshotGapMs = 0;
    perfBus.pingSamples = 0;
    perfBus.pingAgeMs = Number.POSITIVE_INFINITY;
    perfBus.netSnapshots = 0;
    perfBus.netMode = "live";
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
        // THE PREDICTION SHADOW SWAPS TOO — before any rendering work, so the
        // two can never be one round apart. `def` here is the same value the
        // SERVER built from the same doc via the same `arenaDefFromDoc`, which
        // is what makes this the parity seam rather than a second opinion.
        //
        // Omitting this line is the round-10 jitter (owner, 2026-07-27): the
        // shadow keeps clamping to the previous arena's circle while the server
        // uses the new one, and every snapshot then hard-teleports it back. See
        // LocalPrediction.setArena for the measurements.
        this.prediction.setArena(def);
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

  /** Runs on every schema patch (SNAPSHOT_HZ): feed clocks/buffers/HUD store. */
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
      // #247: fly height interpolates on the same seam as x/z.
      this.interp.push(es.id, {
        tick: state.tick,
        x: es.x,
        z: es.z,
        fx: es.fx,
        fz: es.fz,
        h: es.h,
      });
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
    // 規則本身在 render/frameCap —— 四條 render loop 共用同一份，不再各抄一份。
    if (!shouldRenderFrame(nowMs, this.lastFrameMs, this.renderParams.fpsCap)) return;

    const dtMs = Math.min(Math.max(nowMs - this.lastFrameMs, 1), 100);
    this.lastFrameMs = nowMs;

    const state = this.conn.room?.state ?? null;

    // 0) ROUND BOUNDARY CLEANUP (task #16 / #259). 刻意排在 drain **之前**：
    // 邊界那一幀的事件屬於「新的那一側」—— 進 combat 的第一幀帶的是開場特效，
    // 出 combat 的那一幀帶的是收尾事件。先清再 drain，兩邊都不會被自己清掉。
    this.roundVfx.sync(state?.phase ?? "");

    // Keep the imperative displayFinal singleton current with the live wire
    // combat-env EVERY frame (idempotent — no-ops when the JSON is unchanged),
    // so any imperative reader is correct without a React panel mounted. The
    // ability-cast telegraph (VfxSystem) reads `envFactor("abilityRange")` to
    // draw the AoE at its POST-multiplier radius (#136), and event handling
    // below fires before any hold-preview would otherwise sync it.
    setDisplayEnvJson(hudStore.getState().combatEnvJson);

    // 1) drain network events (queued by socket callbacks)
    const localId = hudStore.getState().localEntityId;
    this.drainNetworkEvents(state, localId, nowMs);
    // (The frame's voice lines were SCORED during the drain and are dispatched
    // in step 5b, next to the SFX flush — see there for why they had to move.)

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
    // Clear last frame's pad free-pan latch BEFORE polling: the pad map only
    // re-emits `pan` while the right stick is deflected, so a released stick must
    // leave these null (camera holds) rather than drifting on a stale vector.
    this.padCameraPan.length = 0;
    this.gamepads.poll(); // pads → per-player orders/aim/commands + camera before the flush
    if (this.touch) this.touch.poll(); // joystick → move orders + aim state onto touchFrame
    // Ground aim/preview telegraph, both platforms (task #152): a live touch
    // drag-aim wins; otherwise a PRESSED-AND-HELD ability button (touch finger or
    // desktop mouse — the ui/abilityHold seam) shows its dashed range + AoE.
    {
      let indicator: AimIndicatorState = this.touch ? touchFrame.indicator : null;
      if (indicator === null) {
        const held = getHeldAimSlot(); // castable slots only — a 天生技 has no cast ring
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
    // Subtle footstep cue for the local champion. Queued CENTRED (source null):
    // it is at the listener, so panning it would be a no-op by construction —
    // but going through the queue gives it the `self` priority band, so your own
    // step beats a stranger's for the shared `footstep` gate slot.
    if (localPose) {
      if (this.footstep.advance(localPose.x, localPose.z)) this.sfxQueue.push("footstep", null);
    } else {
      this.footstep.reset();
    }
    if (state) {
      const center = localPose ? { x: localPose.x, z: localPose.z } : this.localSelfPos();
      const drawDist = this.renderParams.drawDistance;
      const entities = this.collectEntities(state);
      this.views.sync({
        entities,
        poseFor: (e) => {
          if (e.id === this.predictedEntityId && localPose && e.alive) return localPose;
          return this.interp.sample(e.id, renderTick) ?? { x: e.x, z: e.z, fx: e.fx, fz: e.fz };
        },
        nowMs,
        dtMs,
        // #220 corpse-dissolve exemption — filled by collectEntities above, in
        // the same pass, so it is THIS frame's truth (frameBus.reviveCircles is
        // one frame stale here: updateFrameBus runs after views.sync).
        reviveSeats: this.reviveOwnerSeats,
        // cull champions beyond the draw distance from the followed champion
        cull:
          center && drawDist < DRAW_DISTANCE_MAX
            ? { cx: center.x, cz: center.z, maxDistance: drawDist }
            : undefined,
      });

      // 4·五 「四拍令咒」 (#257). AFTER sync, deliberately: the dance is an
      // OFFSET added on top of the authoritative pose ChampionView just wrote,
      // which is what stops it accumulating or dragging the body off its
      // hitbox. No-ops entirely until the #252 kit calls beatPerformance
      // .beatStack()/.empowered() — see apps/client/src/beat/beatPerformance.ts.
      beatPerformance.update(nowMs, (id) => this.views.getChampionView(id)?.root ?? null);

      // 4a) REMOTE FOOTSTEPS. Eleven of the twelve bodies in a fight are silent
      // today: the sim deliberately emits no per-tick footstep event, so the cue
      // has to be derived here, from the RENDERED positions (post-interpolation,
      // post-cull) that the player can actually see. Fed after `views.sync` so
      // `posOf` is this frame's, not last frame's.
      this.stepSamples.length = 0;
      for (const e of entities) {
        if (e.kind !== KIND_CHAMPION || !e.alive) continue;
        // The local champion is excluded here and ONLY here: it has its own
        // cadence above, fed from the prediction pose. Keying the exclusion on
        // the HUD's localEntityId (not predictedEntityId) keeps the two paths
        // mutually exclusive even on the frames where prediction is inactive.
        if (e.id === localId) continue;
        const p = this.views.posOf(e.id);
        if (!p) continue; // culled or not yet spawned — no step this frame
        this.stepSamples.push({ id: e.id, x: p.x, z: p.z });
      }
      if (this.stepSamples.length > 0) {
        // nearest-first is measured from the BODY, like every other level
        // decision — a camera panned away must not re-rank whose steps you hear
        const anchor = localPose ?? this.localSelfPos() ?? this.viewports.primary.audioTarget;
        const steps = this.remoteSteps.step(this.stepSamples, anchor.x, anchor.z, nowMs);
        for (const s of steps) {
          this.sfxQueue.push("footstep", {
            x: s.x,
            z: s.z,
            cls: "texture",
            relation: this.footstepRelation(s.id, localId),
          });
        }
      }

      // 4b) STATUS BODY AURAS (task #39). The authoritative CC bitmask ships on
      // every entity (rooted/stunned/slowed), but until now NOTHING read it —
      // a stunned champion looked identical to a healthy one. Feed each live
      // champion's flags at its RENDERED position; the aura layer pulses on
      // `vfx.update` below and self-prunes on despawn (`statusFx.forget`).
      state.entities.forEach((es) => {
        if (es.kind !== KIND_CHAMPION || !es.alive) return;
        const p = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
        this.vfx.statusFx.set(es.id, es.flags, p.x, p.z, nowMs);
        // CONTEXTUAL VOICE — a CC status line on the 0→1 flag edge (client-side
        // edge detector over the authoritative bitmask; no sim edit). poison/blind
        // have no ENTITY_FLAG bit, so they stay dormant (see manifest).
        this.dispatchStatusVoice(es.id, es.flags, localId, p);
      });
      // hum — the LOCAL champion idles a quiet line after HUM_IDLE_MS of no
      // input / combat. Suppressed during the settlement freeze (the match is
      // over, the hero is pinned for the front-view). Client-only cosmetic.
      if (!frozen) this.maybeHum(nowMs, localId);
    } else {
      this.remoteSteps.reset();
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
      // #208: once THIS player's duel is decided, jump the camera to a zone that
      // is still fighting. Runs AFTER updateSpectatorCam so its live-zone jump
      // wins over the death-edge "center on my (finished) zone" default.
      if (state) this.updateSpectateFollow(p, rig, state);
      rig.update({
        dtMs,
        localPos: pos,
        cursor: p === 0 ? this.input.cursor : null,
        panKeys: p === 0 ? this.input.panKeys : null,
        // pad modifier-layer free-pan for THIS player's own camera (task #197)
        panVec: this.padCameraPan[p] ?? null,
        viewportWidth: this.canvas.clientWidth,
        viewportHeight: this.canvas.clientHeight,
      });
    }

    // 5a) publish player 0's ground-plane view — the minimap's viewport box is
    // this REAL frustum (target/dolly/pitch/fov/aspect), read back off the
    // camera after the update above, never a stand-in rectangle.
    frameBus.cameraView = this.cameraRig.groundView();

    // 5b) FLUSH THE COMBAT SOUND FIELD. Deliberately here and not at the drain:
    // the listener is only current once the camera has moved (just above) and
    // the views have synced (step 4). The cost is up to one frame of added
    // latency on a one-shot — far under the network jitter already in the pipe,
    // and the queue had to exist for the priority sort anyway.
    const listener = this.audioListener(localPose);
    this.sfxQueue.flush(listener, (key, opts) => audioSystem.playSfx(key, opts));
    // 5b-ii) AND THE VOICES, through the SAME listener frame (#259).
    //
    // This used to sit at the end of the drain (step 1), which was fine while a
    // voice was a flat `volume: 1` — and is wrong the moment it has a pan, for
    // exactly the reason SpatialSfxQueue documents: the direction anchor is
    // rig 0's target, and rig 0 does not move until step 5. Dispatching here
    // costs at most one frame of latency on a line whose own throttle is 1200 ms.
    //
    // `spectating` is「the listener has no BODY」, not「no camera」: with no body
    // `voiceAudienceOf` demotes every speaker to `third`, and the relation duck
    // that follows from that is not information — see voiceSpatial.
    this.flushContextualVoices(listener, (localPose ?? this.localSelfPos()) === null);

    // 5c) decor auto-fade — ghost tall landmark props (audit #29 "fade") that
    // block any camera→hero sightline; no-op on arenas without fade props.
    this.updateDecorFade(dtMs, state !== null);

    // 6) vfx (one-shots + the ambient lives-with-entity channel + combat post-fx)
    this.vfx.update(nowMs);
    if (state && this.contentDb.ready) this.syncAmbient(nowMs);
    this.ambient.tick(nowMs, dtMs);
    this.whirlwind.tick(nowMs, dtMs);
    // FIRE RING (#195): the world band follows the REPLICATED radius (so it
    // freezes with the mechanic on settle), and the red wash follows
    // ENTITY_FLAG.BURNING on each seat's own champion. A null frame stops both.
    this.fireRing.tick(nowMs, dtMs, state ? this.fireRingFrame(state) : null);
    this.burnTint.update(dtMs, state ? this.burnTintFrame(state) : null);
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
    //
    // THE ARENA'S DOM OVERLAY FOLLOWS THE ARENA (task #216). The world-anchored
    // layer (HP bars, names, cast bars, revive circles, floating numbers) is DOM
    // painted at projected world positions — it only means anything while the
    // arena canvas underneath it is actually being drawn. The intermission
    // Babylon scene suppresses that draw (`setArenaRenderSuppressed`), and the
    // overlay used to keep updating regardless, which is why the owner saw
    // 「戰場上的血條」 floating over the shop with nothing behind them. Same
    // switch for both now: no arena render ⇒ no world anchors.
    if (state && !this.renderSuppressed) this.updateFrameBus(state, nowMs);
    else clearWorldAnchors();
    if (!this.renderSuppressed) this.renderer.render();

    // 8) perf sampling → adaptive brain + perfBus (read by the overlay @4Hz)
    const workMs = performance.now() - nowMs;
    this.samplePerf(nowMs, dtMs, workMs);
  };

  /**
   * STEP 1 OF THE FRAME: take everything the socket queued and dispatch it.
   *
   * ⚠️ WHY THIS AND `handleDrainedEvent` ARE PROTOTYPE METHODS RATHER THAN
   * INLINE IN `frame`.
   *
   * `frame` is an instance arrow FIELD and GameApp cannot be constructed
   * headlessly (Babylon engine, canvas, sockets), so the drain used to be
   * unreachable from any test. The only "guard" over the recorder calls was a
   * grep of this file — and MEASURED, a grep is not a call: leave
   * `recordKillComboEvent(ev, nowMs)` textually intact but make it unreachable
   * (`if (String(ev.type) === "__never_fires__") …`) and the sim keeps counting
   * perfectly while no screen in the game ever hears about it. That is the
   * repo's 「算出來但沒送到端點」 shape, and it kept 37/37 green.
   *
   * These two methods change NOTHING at runtime — same calls, same order, once
   * per event — and make the drain callable with a stub `this`, so
   * `ui/hud/killCombo.test.ts` runs the real loop over a real batch and asserts
   * the store actually moved.
   *
   * Camera-wave per-batch state is settled BEFORE anything is dispatched:
   *   • batchProfiled — `damage` arrives before its `hitImpact` twin, so the
   *     legacy scalar shake has to know up-front that the directional kick is
   *     coming and stand down (else one hit shakes twice);
   *   • frameKicks — the teamfight crowding index, reset each batch.
   */
  private drainNetworkEvents(
    state: MatchState | null,
    localId: number | null,
    nowMs: number,
  ): void {
    const events = this.conn.drainEvents();
    this.batchProfiled = batchCarriesImpactProfile(events);
    this.frameKicks = 0;
    for (const ev of events) this.handleDrainedEvent(ev, state, localId, nowMs);
  }

  /**
   * ONE drained wire event → every sink that consumes it: vfx, entity views,
   * cast bars, camera feedback, the spatial SFX queue, contextual voice, and the
   * HUD RECORDERS (death / shop / cast / 連殺 combo / settlement). Order is
   * load-bearing; see `drainNetworkEvents` for why this is a prototype method.
   */
  private handleDrainedEvent(
    ev: EventMessage,
    state: MatchState | null,
    localId: number | null,
    nowMs: number,
  ): void {
    this.vfx.handleEvent(ev, nowMs); // particles + damage numbers
    this.views.handleEvent(ev, nowMs); // anim pulses + hit flash + hitstop
    this.casts.handleEvent(ev, nowMs); // cast/windup timing → cast bars
    this.applyCombatFeedback(ev, localId, nowMs); // camera kick/punch-in + vignette
    // Per-frame combat SFX. QUEUED, not played: the listener frame is only
    // current after the camera update (step 5), and the batch has to be sorted
    // by priority before the SfxGate sees it — `abilityCast` admits ONE voice
    // per 1.2 s arena-wide, so without the sort the cast you hear in a twelve
    // body fight is decided by packet order. See audio/SpatialSfxQueue.
    //
    // `resolveSpatial` returning null is NOT "drop it": it means the event is
    // deliberately centred (guardianSlain's gold chime, rankUp, fireRingStart)
    // or its position is not resolvable this frame, and a null source plays
    // exactly as it does today. Only `spatialMix` (inside the flush) decides
    // that something is out of range and must not play at all.
    const sfxKey = combatSfxKey(ev);
    if (sfxKey) {
      this.sfxQueue.push(sfxKey, resolveSpatial(ev, this.audioEntityPos, localId, this.audioTeamOf));
    }
    // CONTEXTUAL VOICE (client-only cosmetic, owner directive 2026-07-25):
    // event → the champion's own cloned line. Rides audioSystem.playClip inside
    // contextualVoice, so all mixer gates + the per-category throttle apply;
    // heroes without a pack no-op. Never touches sim / world.rng.
    this.dispatchContextualVoice(ev, localId);
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
    // cast outcomes for THIS player (playtest P7): `castRejected` becomes the
    // sentence 「冷卻中，還有 3 秒」 + a red shake on the button, and
    // castBegin/abilityCast becomes its confirm rim. Same shape as the shop
    // line above; all the logic lives in ui/castAnnounce.
    recordCastEvent(ev, localId, nowMs);
    // 連殺 combo (owner 2026-07-27). The COUNT was decided in the sim off
    // world.tick and arrives on this event; this is the one line that carries
    // it to the screen. Gated on the local SEAT inside (the number in the
    // middle of your screen has to be your chain, not a teammate's), so a
    // spectator's or an enemy's sweep is dropped here rather than rendered.
    recordKillComboEvent(ev, nowMs);
    // victory-settlement scoreboard (arrives once at matchEnd) → settlement UI.
    // #193: the per-team elimination snapshot (TEAM_SETTLEMENT_EVENT) rides the
    // SAME record path so a knocked-out player's leave-flow already holds their
    // card; the final matchEnd payload overwrites it with the decided board.
    if (ev.type === SETTLEMENT_EVENT || ev.type === TEAM_SETTLEMENT_EVENT) {
      recordSettlement(ev.data as unknown as MatchSettlement);
    }
  }

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
    // task #272 — the always-on ping chip refuses to print a number without
    // these: `pingMs` is 0 before the first ack and frozen while the player
    // issues no input, and both look identical to a flawless connection.
    perfBus.pingSamples = cs.pingSamples;
    perfBus.pingAgeMs = cs.pingAgeMs;
    perfBus.netSnapshots = cs.snapshots;
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
    this.reviveOwnerSeats.clear(); // task #220 — refilled from this frame's kind 3s
    // #268 — the LOCAL champion's entity id, read ONCE per frame. The registry
    // cannot resolve this itself (client-08 walls render/** off from the seat
    // table), so the composition root supplies it, exactly like the #49 tint and
    // #231 voxel-skin seams next to it.
    const localId = hudStore.getState().localEntityId;
    let i = 0;
    state.entities.forEach((es) => {
      let e = this.entityPool[i];
      if (!e) {
        e = { id: 0, kind: 0, seatId: 0, key: "", teamId: 0, x: 0, z: 0, fx: 0, fz: 0, alive: false, flags: 0, h: 0, airborne: false, isLocal: false };
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
      // #268 — 「自己角色更顯眼」. Champions only (kind 0): a projectile or a
      // dropped coin has no owner to BE, and a stale true on a pooled slot that
      // got reused by another kind would put a caret over a flying bolt.
      e.isLocal = es.kind === 0 && localId !== null && es.id === localId;
      // #244 — the authoritative flags word, forwarded verbatim. The registry
      // reads only the two GROWTH bits from it; everything else in this file
      // keeps reading `es.flags` directly, so nothing else changed.
      e.flags = es.flags;
      // #247 airborne channel (champions only in practice; 0/false for everyone else)
      e.h = es.h;
      e.airborne = (es.flags & ENTITY_FLAG.AIRBORNE) !== 0;
      // revive circles (kind 3) reuse the float slots for their own state —
      // see protocol ENTITY_KIND for the mapping. Decoded once here so the
      // render layer never has to know about the packing.
      if (es.kind === KIND_REVIVE_CIRCLE) {
        const rv = e.revive ?? (e.revive = {
          progress: 0,
          radius: 2,
          channelling: false,
          contested: false,
        });
        rv.progress = es.maxHp > 0 ? Math.min(1, es.hp / es.maxHp) : 0;
        rv.radius = es.shield > 0 ? es.shield : 2;
        rv.channelling = (es.flags & ENTITY_FLAG.CHANNELLING) !== 0;
        rv.contested = (es.flags & ENTITY_FLAG.CONTESTED) !== 0;
        // #220: a circle's seatId IS the dead owner's seat (there is no ownerId
        // on the wire), and #196 gave the circle no expiry — so its PRESENCE is
        // exactly "that death is still claimable". The corpse wearing this seat
        // must not dissolve while it is here.
        if (es.seatId >= 0) this.reviveOwnerSeats.add(es.seatId);
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

  // ------------------------------------------------- spatial combat audio --
  //
  // The SAME two accessors the VFX layer is given at construction, so a sound
  // can never end up where the sparks are not. Bound once as fields rather than
  // built per event — the drain runs them for every combat event, every frame.

  private readonly audioEntityPos = (id: number): { x: number; z: number } | null =>
    this.views.posOf(id) ?? this.schemaPos(id);

  private readonly audioTeamOf = (id: number): number | null => this.teamOfEntity(id);

  /**
   * The listener frame: a SPLIT anchor, deliberately.
   *
   *   • LEVEL (volume + priority) = the local champion's own rendered body.
   *     "How much does this matter to me" is a question about where my body is,
   *     so a camera panned across the arena must never quieten the hit landing
   *     on my champion.
   *   • DIRECTION (pan + depth) = camera rig 0's UNSHAKEN target. "Where do I
   *     look" is a question about the frame, so screen-left is always audio-left.
   *
   * Under followLock — all of normal combat — the two are the same point to
   * within the 90 ms follow lerp. They only diverge in free-pan and while dead
   * (spectatorCenter), which are exactly the two states where a single anchor
   * would be wrong. With no living body the level anchor falls back to the
   * camera target rather than going silent.
   *
   * Rig 0 only: there is one AudioContext, so split-screen player 2 hears
   * player 1's field. Stated, accepted — and the same convention `frameBus.project`,
   * the minimap and VictoryFireworks already use.
   *
   * NEVER null: a GameApp always has a camera rig, so the sound field is always
   * buildable. (`SpatialSfxQueue.flush` still accepts null and degrades to
   * centred — that is its own defence for any future caller, not a state this
   * one reaches.)
   */
  private audioListener(localPose: { x: number; z: number } | null): SpatialListener {
    const dir = this.viewports.primary.audioTarget;
    const body = localPose ?? this.localSelfPos();
    if (!body) {
      // dead / spectating / pre-spawn: place the ear at the camera. Combat still
      // sounds directional, it just no longer has a body to be centred on.
      return { levelX: dir.x, levelZ: dir.z, dirX: dir.x, dirZ: dir.z };
    }
    return { levelX: body.x, levelZ: body.z, dirX: dir.x, dirZ: dir.z };
  }

  /**
   * Whose footstep this is. There is no event and therefore no actor/victim —
   * only team membership, which is the whole point: an enemy's step is the
   * one you need to hear over your own team's shuffling.
   */
  private footstepRelation(id: number, localId: number | null): SfxRelation {
    if (localId === null) return "third";
    if (id === localId) return "self";
    const mine = this.teamOfEntity(localId);
    const theirs = this.teamOfEntity(id);
    if (mine === null || theirs === null) return "third";
    return mine === theirs ? "ally" : "enemy";
  }

  /**
   * CONTEXTUAL VOICE dispatch for one drained event (task: voice-lines-utilize;
   * audience widened by #223).
   * Maps combat events to the acting champion's own cloned category clip:
   *   • abilityCast (non-PASSIVE) → skill-name.<slot>, spoken by the CASTER.
   *   • damage with crit         → crit, spoken by the ATTACKER (source).
   *   • damage to ANY champion   → hurt / hurt-heavy, spoken by the VICTIM, by
   *                                the fraction of the VICTIM'S OWN max-hp the
   *                                blow took. #223: this used to be gated to
   *                                `target === localId`, so hitting an enemy
   *                                produced no grunt at all — the arena only
   *                                ever spoke in your voice.
   *   • death of ANY champion    → defeat, spoken by the corpse (#223).
   *   • block / healed / dodge   → still LOCAL-ONLY, deliberately: they are
   *                                answers to YOUR input, and an enemy's parry
   *                                is already carried by the SFX layer.
   * The two widened categories are QUEUED, not played: they are scored by
   * audio/voiceAudience and dispatched best-first after the batch drains, so the
   * arena-wide 1.2 s voice slot is spent on the line that matters most instead
   * of on whichever packet arrived first. The kill-N / first-blood / victory
   * lines live in AudioDirector / the settlement panels (they key off the
   * discrete tally + phase edges, not the per-frame drain). CLIENT-ONLY:
   * contextualVoice picks with a client rng and rides audioSystem.playClip, so
   * this never affects sim/determinism.
   */
  private dispatchContextualVoice(ev: EventMessage, localId: number | null): void {
    const d = ev.data;
    if (ev.type === "abilityCast") {
      const slot = typeof d.slot === "string" ? d.slot : null;
      if (!slot || slot === "PASSIVE") return; // 天生技 does not shout a skill name
      const caster = Number(d.caster);
      // #259 — QUEUED, not played. Twelve champions rotating abilities used to
      // shout twelve skill names dead centre at full level; the shout belongs to
      // the caster's BODY. It has to go through the post-camera flush to be
      // placed at all (the drain is step 1, the camera moves in step 5), and
      // `plainVoiceCandidate` keeps probScale at 1 so how OFTEN it fires is
      // exactly what it was.
      this.queueVoiceCandidate(
        plainVoiceCandidate({
          champId: this.championIdForEntity(caster),
          category: `skill-name.${slot.toLowerCase()}`,
          speaker: caster,
          counterpart: null,
          localId,
          teamOf: this.audioTeamOf,
          ...this.voiceWhere(caster),
        }),
      );
      return;
    }
    if (ev.type === "damage") {
      const source = Number(d.source);
      const target = Number(d.target);
      if (d.crit === true) {
        // No genuine non-crit heavy-swing signal exists, so attack-heavy rides
        // the crit edge: 二擇一 (client Math.random) between the existing "crit"
        // line and "attack-heavy" so a crit fires exactly ONE of them, never both
        // (voice-binding-design.md §三). Own buckets → no shared cooldown.
        // #259: spoken by the ATTACKER, so it is placed on the ATTACKER's body —
        // not on the victim's x/z that the same packet carries.
        this.queueVoiceCandidate(
          plainVoiceCandidate({
            champId: this.championIdForEntity(source),
            category: Math.random() < 0.5 ? "crit" : "attack-heavy",
            speaker: source,
            counterpart: Number.isFinite(target) ? target : null,
            localId,
            teamOf: this.audioTeamOf,
            ...this.voiceWhere(source),
          }),
        );
      }
      // block is gated to the LOCAL defender: a hit you fully/partly warded off.
      if (d.blocked === true && localId !== null && target === localId) {
        const blocker = this.championIdForEntity(target);
        if (blocker) playContextualVoice(blocker, "block");
      }
      // #223 — hurt fans out to EVERY champion, weighted by audience. The
      // damage packet carries the VICTIM's own transform (damage.ts emits
      // world.transform.get(target)), so the listener distance is free and
      // needs no entity lookup and no frame-order-sensitive views.posOf read.
      this.queueVoiceCandidate(
        damageVoiceCandidate({
          champId: this.championIdForEntity(target),
          speaker: target,
          counterpart: Number.isFinite(source) ? source : null,
          localId,
          teamOf: this.audioTeamOf,
          amount: typeof d.amount === "number" ? d.amount : 0,
          victimMaxHp: this.entityMaxHp(target),
          killingBlow: d.killingBlow === true,
          distance: this.listenerDistance(
            typeof d.x === "number" ? d.x : null,
            typeof d.z === "number" ? d.z : null,
          ),
          // #259 — the same packet coordinates, kept RAW this time instead of
          // being folded into probScale and discarded. `damage.ts` emits the
          // victim's own transform, and the victim is who speaks a hurt line.
          pos:
            typeof d.x === "number" && typeof d.z === "number" ? { x: d.x, z: d.z } : null,
        }),
      );
      if (localId !== null && target === localId) {
        this.noteLocalCombat(); // reset the hum idle latch — you are in a fight
      }
      return;
    }
    if (ev.type === "heal") {
      // healed — only when YOUR champion is the one restored (discrete heals only;
      // per-tick regen is never emitted, revive rides reviveComplete elsewhere).
      const target = Number(d.target);
      if (localId !== null && target === localId) {
        const champ = this.championIdForEntity(target);
        if (champ) playContextualVoice(champ, "healed");
        this.noteLocalCombat(); // being healed counts as activity
      }
      return;
    }
    if (ev.type === "evade") {
      // dodge — a total miss on YOUR champion. The `evade` event rides the same
      // queuedEvents drain as damage (RoomConnection.bind pushes it to both the
      // frame queue and the WorldAnchorLayer sighting buffer), so this is the
      // clean seam — no socket-callback fanout, no double-drain of the buffer.
      const target = Number(d.target);
      if (localId !== null && target === localId) {
        const champ = this.championIdForEntity(target);
        if (champ) playContextualVoice(champ, "dodge");
        this.noteLocalCombat(); // dodging is combat activity
      }
      return;
    }
    if (ev.type === "death") {
      // #223 — ANY champion's death cries out (the same id deathFocus.noteDeath
      // consumes). `killer` is what makes "the enemy YOU just killed" its own
      // band: that cry is the confirmation of your kill, so it preempts.
      const id = Number(d.id);
      const killer = typeof d.killer === "number" ? d.killer : null;
      this.queueVoiceCandidate(
        deathVoiceCandidate({
          champId: this.championIdForEntity(id),
          speaker: id,
          counterpart: killer,
          localId,
          teamOf: this.audioTeamOf,
          ...this.voiceWhere(id),
        }),
      );
    }
  }

  /** Park a scored voice line for this frame's best-first flush (#223). */
  private queueVoiceCandidate(c: VoiceCandidate | null): void {
    if (c) this.frameVoices.push(c);
  }

  /**
   * Dispatch the frame's queued voice lines HIGHEST BAND FIRST (#223).
   *
   * This is the piece that makes widening safe rather than merely louder.
   * `contextualVoice` admits one line per 1.2 s arena-wide and is otherwise
   * first-come-first-served in packet-drain order, so without the sort a
   * stranger's grunt drained early in the batch would eat the beat your own
   * grunt needed — the audience would be wider and the result LESS legible.
   * Sorting first is the same fix (and the same band layout) SpatialSfxQueue
   * applies to combat SFX. Everything still goes through playContextualVoice, so
   * the de-dup, the throttle, the mute/unlock gates and the silent
   * fall-through for an unpacked champion all apply untouched.
   */
  private flushContextualVoices(listener: SpatialListener, spectating: boolean): void {
    if (this.frameVoices.length === 0) return;
    for (const c of orderVoiceCandidates(this.frameVoices)) {
      // #259 — the mix, computed HERE because this is the only point in the
      // frame where the listener frame is current (the camera moved in step 5)
      // and the only place that holds both anchors. A null mix is the SFX
      // layer's own out-of-range instruction: do not play at all, so a fight in
      // the other duel zone cannot spend the arena-wide 1.2 s voice slot.
      const mix = voiceSpatialMix(listener, {
        audience: c.audience,
        pos: c.pos,
        spectating,
      });
      if (!mix) continue;
      playContextualVoice(c.champId, c.category, {
        probScale: c.probScale,
        preempt: c.preempt,
        ...voicePlayOptions(mix),
      });
    }
    this.frameVoices.length = 0;
  }

  /** Max hp of ANY entity from the schema (0 when unknown) — the heavy/light split. */
  private entityMaxHp(id: number): number {
    const es = this.conn.room?.state.entities.get(String(id));
    return es?.maxHp ?? 0;
  }

  /** Ground distance from the local listener body to a world point (null = unknown). */
  private listenerDistance(x: number | null, z: number | null): number | null {
    if (x === null || z === null || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const body = this.localSelfPos();
    if (!body) return null; // dead / spectating: no body, so no distance damping
    return Math.hypot(x - body.x, z - body.z);
  }

  /**
   * WHERE a speaker is and HOW FAR (#259), from the AUTHORITATIVE schema tick.
   *
   * Deliberately `schemaPos`, not `audioEntityPos`: this runs in step 1 of the
   * frame and `views.sync` is step 4, so `posOf` would be a frame stale and null
   * for anything culled — which would silently mute (and now also mis-place)
   * distant bodies for a reason that has nothing to do with the audience policy.
   *
   * One lookup, two consumers: `distance` feeds the #223 probability + priority
   * bands (unchanged), `pos` feeds the #259 mix. They must come from the SAME
   * sample or a line can be ranked as near and mixed as far.
   */
  private voiceWhere(id: number): {
    pos: { x: number; z: number } | null;
    distance: number | null;
  } {
    const p = this.schemaPos(id);
    return { pos: p, distance: p ? this.listenerDistance(p.x, p.z) : null };
  }

  /**
   * Fire a CC status line on the 0→1 edge of the STUNNED / SLOWED / ROOTED flag
   * for one entity, diffing against the previous tick's bitmask (client-side; the
   * bitmask itself is authoritative). Only the freshly-SET bit speaks, so a
   * status that lingers across many ticks says its line once, not every frame.
   */
  private dispatchStatusVoice(
    entityId: number,
    flags: number,
    localId: number | null,
    pos: { x: number; z: number } | null,
  ): void {
    const prev = this.prevEntityFlags.get(entityId) ?? 0;
    this.prevEntityFlags.set(entityId, flags);
    const rose = flags & ~prev; // bits newly set this tick
    if (rose === 0) return;
    const champ = this.championIdForEntity(entityId);
    if (!champ) return;
    const isLocal = localId !== null && entityId === localId;
    // #259 — the CC lines fan out to EVERY champion (this edge detector walks
    // every entity), so before this they were the WORST offender in the whole
    // voice channel: a stun in the other duel zone shouted at full level, dead
    // centre, with no audience weighting at all. Queued now, like everything
    // else with a body. probScale stays 1 — the roll rate is untouched.
    const cc = (category: string): void => {
      this.queueVoiceCandidate(
        plainVoiceCandidate({
          champId: champ,
          category,
          speaker: entityId,
          counterpart: null,
          localId,
          teamOf: this.audioTeamOf,
          pos,
          distance: pos ? this.listenerDistance(pos.x, pos.z) : null,
        }),
      );
    };
    // A local hard-CC edge additionally rolls a 怒罵 "curse" — 二擇一 (client
    // Math.random) so a stun never stacks two voices on the same frame
    // (voice-binding-design.md §三).
    if (rose & ENTITY_FLAG.STUNNED) {
      if (isLocal && Math.random() < 0.5) cc("curse");
      else cc("stun");
    }
    if (rose & ENTITY_FLAG.SLOWED) cc("slow");
    if (rose & ENTITY_FLAG.ROOTED) {
      if (isLocal && Math.random() < 0.5) cc("curse");
      else cc("bind");
    }
    // T1 self-only movement/attack lines: only YOUR champion narrates its own
    // basic-attack windup and dash, on the flag's rising edge (never per frame).
    if (isLocal) {
      // attack-light rides its own low-prob/high-cooldown policy so a ~0.7 s auto
      // does NOT shout every swing (owner hard rule).
      if (rose & ENTITY_FLAG.WINDUP) playContextualVoice(champ, "attack-light");
      if (rose & ENTITY_FLAG.DASHING) playContextualVoice(champ, "sprint");
    }
  }

  /** Mark the local player active NOW, resetting the hum idle latch (voice §三). */
  private noteLocalCombat(): void {
    this.lastLocalActivityMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  /**
   * Roll the idle "hum" line once the LOCAL player has been silent for
   * HUM_IDLE_MS. The idle latch is the real gate; the per-category cooldown
   * (20 s) + low prob keep it from chattering between fights. Client-only, and
   * the shared throttle/de-dup layer still applies inside playContextualVoice.
   */
  private maybeHum(nowMs: number, localId: number | null): void {
    if (localId === null) return;
    if (nowMs - this.lastLocalActivityMs < HUM_IDLE_MS) return;
    const champ = this.championIdForEntity(localId);
    if (!champ) return;
    // Re-arm the latch to nowMs whether or not the roll fires, so a blocked roll
    // waits another full idle window instead of retrying every frame.
    this.lastLocalActivityMs = nowMs;
    playContextualVoice(champ, "hum");
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
   *     fraction of max-hp lost. Tier-gated inside CombatPostFx.
   *
   * There is deliberately NO ungated post-fx here any more. The ripple channel
   * used to be armed from this same loop on `crit || killingBlow || amount >=
   * 120` with no `taken` check — and `damage` is an unfiltered broadcast of
   * every duel zone, so hits the player could not even see kept it alive for
   * the whole round. Task #196 removed the effect; the asymmetry with the
   * vignette below is the shape any future channel must NOT repeat.
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
    const target = ev.data.target as number | undefined;
    if (localId === null || target !== localId) return; // only MY damage tints MY screen
    const maxHp = this.localMaxHp();
    this.postFx.addVignette(maxHp > 0 ? amount / maxHp : 0);
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

  private localAbility(slot: CastableSlot): AimAbility | null {
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
  private resolveHoldPreview(slot: CastableSlot): AimIndicatorState {
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

  private abilityForSeat(seatId: number | null, slot: CastableSlot): AimAbility | null {
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
    // 天生技 — the SIXTH slot (the level-1 innate). It is NOT in
    // `champion.abilities` and has no rank on the wire: it is a standalone
    // `<championId>.passive` doc, owned at rank 1 from spawn, so
    // `championPassive` is the whole resolution (same seam ui/passiveSlot uses).
    //
    // Only the ~60 `innateKind: "active"` innates resolve. A permanent 被動
    // innate returns null and therefore issues NO command — the sim would
    // answer "passive" anyway (innateCastBlock), but sending a cast we already
    // know is refused would burn a wire slot and make every 被動 hero's D key
    // look like a laggy ability instead of a tile that was never a button.
    // `ui/castAnnounce` still SAYS so on the press; this only declines to send.
    //
    // The 3 heroes with no NN-00 return null here too, which reads as
    // "not-learned" on the press — the same answer the other five slots give.
    if (slot === "PASSIVE") {
      const innate = championPassive(seat.championId as ChampionId);
      if (!innate || innate.innateKind !== "active") return null;
      return innate;
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

  private playerAbility(player: number, slot: CastableSlot): AimAbility | null {
    if (player === 0) return this.localAbility(slot);
    return this.abilityForSeat(this.playerView(player)?.seatId ?? null, slot);
  }

  /**
   * Unspent skill points held by couch player k — what decides whether a LONG
   * PRESS on A/B/X/Y spends a point or explains the ability (see
   * `input/GamepadInput`'s long-press block). 0 before the seat materialises,
   * which is the safe answer: no seat, nothing to spend.
   */
  private playerSkillPoints(player: number): number {
    const hud = hudStore.getState();
    const seatId = player === 0 ? hud.localSeatId : (this.playerView(player)?.seatId ?? null);
    if (seatId === null) return 0;
    return hud.seats.find((s) => s.seatId === seatId)?.unspentPoints ?? 0;
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
      // Champions AND the neutral objectives (harvest flower, guardian tower)
      // are attackable targets the sim already accepts orders against — a human
      // must be able to click / attack-move / auto-acquire them too, not just
      // bots via direct AI orders. Neutrals carry seatId -1, so the team filter
      // below resolves to -1 and never matches myTeam (they read as "enemy").
      if (
        (es.kind !== KIND_CHAMPION && es.kind !== KIND_GUARDIAN && es.kind !== KIND_FLOWER) ||
        !es.alive
      )
        return;
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
   * stand the winning TEAM's champion models centre-screen for a few seconds,
   * then clear. MVP first, then the rest of that team (owner, 2026-07-27:
   * 「勝利的時候應該秀隊伍三人的模組」 — a 3v3v3v3 round is won by three people,
   * and presenting only the top scorer told the other two they were scenery).
   * The MVP — who owns the taunt — is the round's rank-1 champion resolved from the SAME
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
      // The whole winning TEAM, MVP first (owner: 「勝利的時候應該秀隊伍三人的模組」).
      // A member whose model doc has not loaded is DROPPED rather than allowed to
      // blank a card — three champions with one empty slot reads as a bug, and
      // the beat is still correct with two.
      const team = roundWinnerTeamChampions(hud.seats, hud.teams);
      const members = team
        .map((id) => {
          const doc = this.roundWinnerModelDoc(id, hud.seats);
          return doc ? { doc, championId: id } : null;
        })
        .filter((m): m is { doc: ModelDoc; championId: string } => m !== null);
      if (members.length > 0) {
        // Forward the MVP + round: the stage needs BOTH to pick the taunt
        // deterministically (audio/victoryTaunt hashes championId+round), and
        // with no ctx it silently skips the whole 嘲諷台詞 half of #93. The MVP
        // is `team[0]`, which is also the leftmost card.
        this.roundWinner.showTeam(members, { championId: team[0], round: state.round });
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
   * the arena ChampionView uses, so the dev-only Blizzard overlay picks the
   * same mesh as in-world. null before the content DB has the doc (then the
   * stage simply shows nothing; the VO still plays).
   *
   * The VERTEX TINT does NOT ride on the ModelDoc — `model@1` has no tint field
   * and never did, because `modelKey` is many-to-one (this comment used to
   * claim the tint "applies exactly as in-world", and it was false: the card
   * showed the raw mesh until #263). `RoundWinnerStage.show` gets the
   * `championId` in its ctx and hands it to the previewer, which resolves and
   * paints the colour itself.
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
    const decided = this.focusOwnDuelDecided;
    ids.length = this.viewports.count;
    decided.length = this.viewports.count;
    const localId = hudStore.getState().localEntityId;
    const duels = this.duelViews(state);
    for (let p = 0; p < ids.length; p++) {
      const id = p === 0 ? localId : (this.playerView(p)?.entityId ?? null);
      ids[p] = id ?? -1;
      // #208: while your teammates still fight in YOUR zone the #85 wash stays;
      // it lifts the instant your duel is decided (you're now watching another).
      decided[p] = ownDuelDecided(this.ownZoneOf(p, state), duels);
    }
    return f;
  }

  /**
   * The fire ring's world frame (#195). The zone is the LOCAL player's duel
   * zone: a spectator, a parked bye seat, or a client whose champion has not
   * spawned yet gets `zone: null` and draws no ring at all, rather than
   * guessing at zone 0 and lighting a fire around somebody else's fight.
   */
  private fireRingFrame(state: MatchState): FireRingFrame {
    const f = this.ringFrame;
    f.phase = state.phase;
    f.fireRingTicks = state.fireRingTicks;
    f.fireRingRadius = state.fireRingRadius;
    const localId = hudStore.getState().localEntityId;
    const es = localId !== null ? state.entities.get(String(localId)) : undefined;
    const zones = frameBus.arenaZones;
    const z = es && zones ? zones[es.zone] : undefined;
    f.zone = z ? { x: z.x, z: z.z, r: z.r } : null;
    return f;
  }

  /**
   * The burn tint's frame (#195): per local seat, is that champion carrying
   * ENTITY_FLAG.BURNING right now, and is it alive to feel it.
   *
   * The rate is derived from the ring's shrink progress rather than from a
   * per-tick damage event — `fireRingDamage` is deliberately server-only
   * (360 msg/s), and the wash only needs the RAMP, not the exact number.
   */
  private burnTintFrame(state: MatchState): BurnTintFrame {
    const f = this.burnFrame;
    f.phase = state.phase;
    f.outcomeDecided = state.outcomeDecided === true;
    const zones = frameBus.arenaZones;
    for (let p = 0; p < this.viewports.count; p++) {
      const id = p === 0 ? hudStore.getState().localEntityId : (this.playerView(p)?.entityId ?? null);
      const es = id !== null ? state.entities.get(String(id)) : undefined;
      this.burnBurning[p] = es ? (es.flags & ENTITY_FLAG.BURNING) !== 0 : false;
      this.burnAlive[p] = es ? es.alive : false;
      const zr = es && zones ? (zones[es.zone]?.r ?? 0) : 0;
      // shrink progress 0..1 from the replicated radius, mapped onto the
      // authored 4 %/s → 20 %/s ramp. Same shape as fireRingRatePerSec, from
      // the only two numbers the client actually has.
      const prog = zr > 0 ? Math.min(1, Math.max(0, 1 - state.fireRingRadius / zr)) : 0;
      this.burnRate[p] = 0.04 + (0.2 - 0.04) * prog;
    }
    this.burnBurning.length = this.viewports.count;
    this.burnAlive.length = this.viewports.count;
    this.burnRate.length = this.viewports.count;
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

  // ------------------------------------------ spectator follows live zone --
  // (task #208)

  /**
   * Project this frame's `MatchState.duels` into the pure decision's `DuelView`
   * shape, reusing a pooled array + pooled entries so the per-frame camera pass
   * allocates nothing. A duel is LIVE while its `winner` is still -1.
   */
  private duelViews(state: MatchState): DuelView[] {
    const out = this.duelScratch;
    const n = state.duels.length;
    while (out.length < n) out.push({ zone: 0, live: false });
    out.length = n;
    for (let i = 0; i < n; i++) {
      const d = state.duels[i]!;
      out[i]!.zone = d.zone;
      out[i]!.live = d.winner < 0;
    }
    return out;
  }

  /**
   * The duel zone player `player`'s champion is in — read off its OWN entity so
   * it stays correct while dead (the corpse keeps its zone). Null with no
   * champion resolved yet. This is how #208 knows which duel is "mine".
   */
  private ownZoneOf(player: number, state: MatchState): number | null {
    const entityId =
      player === 0 ? hudStore.getState().localEntityId : (this.playerView(player)?.entityId ?? null);
    if (entityId === null) return null;
    const es = state.entities.get(String(entityId));
    return es ? es.zone : null;
  }

  /** Centre of duel `zone` from the ACTIVE arena (frameBus), else the skeleton. */
  private zoneCenter(zone: number): Vec2 | null {
    const zc = frameBus.arenaZones?.[zone];
    if (zc) return { x: zc.x, z: zc.z };
    const z = SKELETON_ARENA.zones[zone];
    return z ? { x: z.center.x, z: z.center.z } : null;
  }

  /**
   * #269 — THE CAMERA NO LONGER MOVES ITSELF.
   *
   * owner, 2026-07-28: 「不要跳去看別人的競技場，但可以跳出按鈕前往/返回」.
   *
   * #208 shipped the opposite: the instant your own duel was decided the combat
   * camera was teleported to another zone. That is a good thing to be OFFERED
   * and a bad thing to have DONE to you — your hero is still standing there,
   * your corpse is still claimable by a revive circle, and the screen cutting to
   * strangers is indistinguishable from a bug (which is why #208 needed
   * SpectateNotice at all). So the pure decision is kept verbatim and only its
   * CONSUMER changes: `pickSpectateZone` now produces an OFFER published on
   * `frameBus.spectateOffer`, and the actual camera move happens in
   * `spectateGoTo`, called from a button.
   *
   * What is still automatic — and must be — is RETRACTION: a watch whose zone
   * has stopped being a live duel (that fight ended, or combat itself ended) is
   * dropped here, because leaving the camera parked on a finished zone is the
   * very failure #208 existed to prevent and no button press can be expected in
   * time. A dead spectator's follow state is owned by `setDead` (respawn
   * re-locks), so `releaseSpectate` does not touch that rig.
   *
   * Only player 0 gets the offer: the button lives in the single-player HUD, and
   * a couch viewport has no HUD of its own to press it from.
   */
  private updateSpectateFollow(player: number, rig: CameraRig, state: MatchState): void {
    const inCombat = state.phase === "combat";
    const duels = this.duelViews(state);
    const offer = inCombat ? pickSpectateZone(this.ownZoneOf(player, state), duels) : null;
    const watching = this.spectateZoneByPlayer.get(player) ?? null;
    if (spectateRelease(watching, inCombat, duels)) this.releaseSpectate(player, rig);
    if (player === 0) {
      frameBus.spectateZone = this.spectateZoneByPlayer.get(0) ?? null;
      frameBus.spectateOffer = offer;
    }
  }

  /**
   * 前往觀戰 (#269) — the button's implementation for the primary player.
   *
   * Refuses anything that is not the CURRENT offer, so the HUD can never send
   * the camera to a zone the rules do not allow (a stale click after the fight
   * ended, or a zone that was never on offer). The refusal is silent because the
   * button that produced it is gone by then — there is nothing left to explain.
   */
  spectateGoTo(zone: number): void {
    if (!mayGoTo(zone, frameBus.spectateOffer)) return;
    const rig = this.cameraRig;
    this.spectateZoneByPlayer.set(0, zone);
    frameBus.spectateZone = zone;
    const c = this.zoneCenter(zone);
    if (c) rig.focusOn(c); // breaks follow-lock + jumps (no-op in settlement)
  }

  /** 返回自己的競技場 (#269) — drop the watch and re-follow your own hero. */
  spectateReturn(): void {
    const rig = this.cameraRig;
    this.releaseSpectate(0, rig);
    frameBus.spectateZone = null;
    // snap back to the player's own champion immediately rather than waiting for
    // the follow lerp to drag the camera across the map: the button says 「返回」
    // and a two-second glide reads as an unresponsive button.
    const own = this.localSelfPos();
    if (own) rig.jumpTo(own);
  }

  /** Drop player `player`'s live-zone redirect and restore an alive winner's follow-lock. */
  private releaseSpectate(player: number, rig: CameraRig): void {
    this.spectateZoneByPlayer.delete(player);
    // `focusOn` broke follow-lock to peek the other zone; an ALIVE player must
    // re-follow their own hero next round. A DEAD spectator keeps free-pan —
    // updateSpectatorCam re-locks it on respawn — so leave that rig alone.
    if (!rig.spectating) rig.followLock = true;
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
      // champions AND neutral objectives (kind 2 flower, kind 4 guardian) carry
      // overhead bars. A guardian is NEUTRAL (task #89): no name, teamId -1, and
      // an explicit neutral bar colour (anchorColorFor) — never a team tint.
      if (!hasOverheadBar(es.kind)) return;
      const isNeutral = es.kind === KIND_FLOWER || es.kind === KIND_GUARDIAN;
      seen.add(es.id);
      const pos = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
      let anchor = frameBus.champions.get(es.id);
      if (!anchor) {
        anchor = {
          entityId: es.id,
          kind: es.kind,
          name: isNeutral ? "" : (nameBySeat.get(es.seatId) ?? `#${es.id}`),
          teamId: isNeutral ? -1 : (this.teamBySeat.get(es.seatId) ?? 0),
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
      anchor.kind = es.kind; // pooled anchors outlive an entity id; keep it honest
      // picks land after the anchor is created (and change between rounds), so
      // the champion id is refreshed rather than frozen at spawn
      anchor.championId = isNeutral ? "" : (champBySeat.get(es.seatId) ?? "");
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
      circles.push({
        entityId: es.id,
        ownerSeatId: es.seatId,
        teamId: this.teamBySeat.get(es.seatId) ?? -1,
        zone: es.zone,
        worldX: pos.x,
        worldZ: pos.z,
        radius: es.shield > 0 ? es.shield : 2,
        progress: es.maxHp > 0 ? Math.min(1, es.hp / es.maxHp) : 0,
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
