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
import { SKELETON_ARENA, arenaDefFromDoc, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import {
  Abilities,
  Champions,
  Items,
  Projectiles,
  championPassive,
} from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { predictedMoveSpeed } from "./predict/predictedStats";
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
import { ENTITY_FLAG, teamOverrideFromFlags } from "@ggd/shared/protocol/schema";
import { stealthVisualFor } from "./render/stealthVisual";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import {
  facingModePredictsLocally,
  facingModeSnapsFromAuthority,
} from "@ggd/shared/sim/facingLock";
import { localFacingMode } from "./predict/localFacingMode";
import { predictionHoldFlagMask } from "./predict/predictionHold";
import { localRenderPose } from "./predict/localRenderPose";

import type { RoomConnection } from "./net/RoomConnection";
import { MultiSession, type SeatTokenEntry } from "./net/MultiSession";
import {
  syncHudFromState,
  recordDeathEvent,
  recordSettlement,
  recordShopEvent,
  recordKillComboEvent,
  recordMobBossEvent,
  recordMarkEvent,
  isShopEvent,
  isMobBossEvent,
  isMarkEvent,
  resetSettlement,
  hudStore,
  localDuelZone,
  setGamepadIndices,
  setLocalAccounts,
} from "./net/RoomStore";
import { recordCastEvent } from "./ui/castAnnounce";
import { recordCoinEvent } from "./ui/coinThrow";
import type { IntentSender } from "./net/IntentSender";
import { InterpolationBuffer } from "./net/InterpolationBuffer";
import { TimeSync } from "./net/TimeSync";
import { VisibleZones, ingestZonedTransforms } from "./net/zoneVisibility";
import { LocalPrediction } from "./predict/LocalPrediction";
import { InputCapture } from "./input/InputCapture";
import { IntentClock } from "./input/IntentClock";
import { MultiGamepadSystem, BTN, type GamepadCameraIntent } from "./input/GamepadInput";
import { PadCameraControl } from "./input/padCamera";
import {
  cycleCouchChampion,
  primeWhitelist,
  shippedCouchPickableIds,
} from "./input/couchChampSelect";
import { aimAssistMobPenalty } from "./ui/displayAimAssist";
import { pickUnit, pickNearestUnit, type PickableUnit } from "./input/Picking";
import { resolveAoeCenter, type AimAbility } from "./input/AimResolver";
import { isTouchDevice, readTouchEnv } from "./input/mobileDetect";
import {
  TouchController,
  registerTouchController,
  touchFrame,
  type AimIndicatorState,
} from "./input/TouchInput";
import { Renderer } from "./render/Renderer";
import { AimIndicator } from "./render/AimIndicator";
import { resolvePadTargetMarker } from "./render/views/targetMarker";
import type { TelegraphRelation } from "./vfx/telegraphChannel";
import { setupLighting, type LightingHandle } from "./render/Lighting";
import { buildArena, dressArena, disposeArena, type ArenaHandles } from "./render/ArenaScene";
import { setWeatherMatchSeed } from "./render/weather";
import { groundTextureSet } from "./render/groundMaterials";
import { warmGroundTextures } from "./render/groundTextureCache";
import { resolveArenaId, type ArenaIdSource } from "./render/arenaSelect";
import { RoundWinnerStage, planRoundWinnerShow, victoryPodiumPolicy } from "./render/RoundWinnerStage";
// ONE number for how long the round-win beat owns the screen: the stage's grey
// wash, the taunt delay and this trigger window all read the same constant, so
// the window can never be shortened below the taunt delay and silently mute it.
import type { CameraRig } from "./render/CameraRig";
import { mayGoTo, ownDuelDecided, pickSpectateZone, spectateRelease, type DuelView } from "./render/spectateFocus";
import { ViewportManager } from "./render/ViewportManager";
// 🖥️🖥️ GH#612 —— 分割畫面的螢幕演出：每一格自己一份。組裝在 `installScreenCues()`。
import { cssRects } from "./render/viewportRects";
import {
  dispatchScreenCue,
  installSplitScreenCueRouter,
  screenCuePolicyFromContent,
} from "./render/screenFx";
import { ScreenFxLayer } from "./vfx/ScreenFxLayer";
import { AssetManager } from "./render/AssetManager";
import {
  EntityViewRegistry,
  type EntityViewState,
} from "./render/EntityViewRegistry";
import { blizzardOverlayModels } from "./render/views/blizzardOverlay";
import {
  championBodyHooks,
  type ChampionBodyDeps,
  type ChampionBodyHooks,
} from "./render/views/championBody";
import { formAttachmentSpecFor, wornAttachmentSpec } from "./render/views/formVisual";
// GH#392 —— `attachment@1`(穿在骨頭上的模型)的解析層。純函式,住在 shared,
// 所以後台預覽/守衛/客戶端讀到的是同一條規則。
import { wornFromAttachmentDoc } from "@ggd/shared/content";
import type { FormAttachmentSpec } from "./render/views/ChampionView";
import { bodyRelativeScale } from "./render/views/modelSizing";
import { entityTintFor } from "./render/views/mobTint";
import { mobRingDiameterFor } from "./render/views/mobGroundRing";
import { mobShadowSuppressedFor } from "./render/views/mobShadow";
import { modelFxDocFor } from "./render/modelFxRig";
import { persistentVfxKeysFor } from "./render/views/persistentVfx";
import {
  MOB_VISUAL_DEFAULT,
  parseMobVisualJson,
  type MobVisualTable,
} from "@ggd/shared/sim/mobs";
import {
  hasOverheadBar,
  anchorColorFor,
  anchorHeightFor,
  KIND_CHAMPION,
  KIND_FLOWER,
  KIND_GUARDIAN,
  KIND_MOB,
  KIND_REVIVE_CIRCLE,
  KIND_NIGHT_FLAG,
} from "./render/overheadAnchors";
import { anchorDrawable } from "./render/anchorBounds";
import { occludeArgsFor } from "./render/occlusionZone";
import { qualityController, type RenderParams } from "./render/QualityController";
import { feedAdaptiveFrame } from "./render/AdaptiveQuality";
import { driveFrame, FrameDelta, type FrameWork } from "./render/frameCap";
import { FrameRateMeter } from "./render/fpsMeter";
import { RoundVfxLifecycle } from "./render/roundVfxLifecycle";
// GH#337 —— 場景型 FX 的**唯一組裝點**。⛔ 不要在這個檔案裡再 new 一個。
import { createRoundFx } from "./render/roundFxRegistry";
import type { VfxSystem } from "./vfx/VfxSystem";
import type { AmbientVfx } from "./vfx/AmbientVfx";
// ⚠️ 值匯入（不是 type-only）：`WhirlwindFx.handles()` 是 static，syncAmbient 用它
// 先過濾 modelKey。實例本身仍由 `createRoundFx` 建。
import { WhirlwindFx } from "./vfx/WhirlwindFx";
import { CombatPostFx } from "./vfx/CombatPostFx";
import { DeathFocusFx, type DeathFocusFrame } from "./vfx/DeathFocusFx";
import { BurnTintFx, type BurnTintFrame } from "./vfx/BurnTintFx";
import type { FireRingFx, FireRingFrame } from "./render/vfx/FireRingFx";
import type { VictoryFireworks } from "./vfx/VictoryFireworks";
import type { VictoryInput } from "./vfx/victoryTrigger";
import { ContentDb } from "./content/ContentDb";
import {
  frameBus,
  clearCombatText,
  clearWorldAnchors,
  expireCombatText,
  mobBossMarkerFor,
  setCombatTextScope,
  setDamageNumberCap,
  pushMarkSaveText,
} from "./frameBus";
// GH#268 —— 精英小怪頭上那條小血條的**模型**（純 TS，沒有 React，符合 client-08
// 的「React 只在 ui/*」）。判斷「哪一隻算精英」與「血條該從哪個世界高度投影」
// 只有這一份實作,不在這裡重寫（失敗形態 ⑤）。
import {
  SHIPPED_MOB_HEALTH_BAR,
  mobBarAnchorFor,
  mobBarAnchorY,
  mobHealthBarConfigFrom,
  type MobHealthBarConfig,
} from "./ui/hud/mobHealthBarModel";
// GH#278 —— 標記的名字要從它借身分的那份文件上拿（純 TS，沒有 React）。
import { markSaveText } from "./ui/hud/markModel";
import { perfBus } from "./perfBus";
import { ConnectionStats } from "./net/ConnectionStats";
import { CastTracker } from "./CastTracker";
import { registerHudActions } from "./ui/actions";
// GH#596 —— 非預期斷線唯一的出路（讀 `getState()` 呼叫一支 action，
// ⛔ 沒有 `.setState(`，架構閘 client-08 第 3 條照樣綠）。
import { appStore } from "./ui/platform/store";
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
import { vfxLoopPushes, vfxSoundCues, vfxSoundLayer } from "./audio/vfxSound";
import { cueEventZone, spatialSourceFor, zoneAllowsCue } from "./audio/spatialPolicy";
import { zoneCueIsolationOn } from "./vfx/worldCues";
import type { SpatialSource } from "./audio/spatial";
import { abilityIdOfOrigin } from "@ggd/shared/sim/combat/damage";
import { fullAssetsEnabled } from "./config/fullAssets";
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
import { installInputGuard, shouldRelockFollow, type InputGuard } from "./input/inputGuard";
import { settingsStore } from "./settings";
import { SETTLEMENT_EVENT, TEAM_SETTLEMENT_EVENT } from "@ggd/shared/protocol/messages";
import type { EventMessage, MatchSettlement } from "@ggd/shared/protocol/messages";

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
  /**
   * 權威面向 (GH#281 (a) 校正路徑). 在此之前這個 interface 只有位置 ——
   * 也就是說**自己的英雄的權威面向從來沒有被取樣過**，`poseFor` 又把整個權威
   * pose 換成預測 pose，所以那兩個 float 一路從 wire 走到 client 然後被丟掉。
   * 站定出手時影子沒有任何一行寫 facing，身體就凍在最後一次走路的方向。
   */
  fx: number;
  fz: number;
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
  /**
   * Offline flow: 開成**練習房**（GH#343）—— 單人沙盒，沒有敵隊、不結算、測試碼
   * 可用、可以即時生殭屍。Platform flow ignores this，同 `mapId`。
   */
  practice?: boolean;
}

/** ⭐ M1（GH#599）—— 沒有狀態時共用的空清單,⛔ 不要每幀 new 一個。 */
const EMPTY_STATUS_IDS: readonly string[] = [];

/**
 * ⭐ M1（GH#599）—— **`statusIdsForSeat` 在這個組裝點是必填的。**
 *
 * `ChampionBodyDeps.statusIdsForSeat` 本身是 `?`（`render/**` 對 HUD store 是
 * 封閉的，所以那個模組必須能在沒有座位表的測試裡建構）。而**出貨的組裝點只有
 * 這一個**，漏掉它的後果是：`statusIdsForSeat` 恆 `undefined` ⇒ 狀態外觀那一半
 * 整個是死的，⛔ 而畫面上跟「這幾對本來就沒有變身外觀」一模一樣
 * （第二守則失敗形態③：整行可以刪掉而測試全綠）。
 *
 * ⇒ 這個別名讓 **`tsc` 擋住忘記**，⛔ 不是寫一條「要記得注入」的散文 ——
 * 與 `render/roundFxRegistry.ts` 的 `RoundFxDeps.ambientToggleMask`
 * （同一天、同一族、同一個修法）逐字同一個做法。
 *
 * ⚠️ 它寫在這裡而不是把 `ChampionBodyDeps` 上的 `?` 直接拿掉，是因為
 * `render/views/championBody.ts` 這一輪在另一條 lane 的檔案柵欄裡。
 * 那個 `?` 拿掉之後，這個別名就可以整段刪除（它會變成 `ChampionBodyDeps` 本身）。
 */
type SeatedChampionBodyDeps = ChampionBodyDeps &
  Required<Pick<ChampionBodyDeps, "statusIdsForSeat">>;

export class GameApp {
  private readonly renderer: Renderer;
  private readonly viewports: ViewportManager;
  /**
   * 🖥️🖥️ GH#612 —— **每一格 viewport 自己一層**螢幕閃爍。
   *
   * ⛔ 在此之前只有一層 `position:fixed;inset:0` 的全螢幕 overlay（住 `VfxSystem`），
   * 於是指名 player 0 的那一發**蓋住全部四格**；而觀眾判定只拿 player 0 的 entity，
   * 於是指名沙發玩家 2/3/4 的那一發**整發丟掉**。⭐ 兩個方向同一個根因：
   * 沙發模式的「本機觀眾」是一個**集合**。
   */
  private readonly cueLayers: ScreenFxLayer[] = [];
  /** 逐格 overlay 的容器（`contain:paint` ⇒ 子層的 `position:fixed` 被夾在這一格裡）。 */
  private cueHost: HTMLDivElement | null = null;
  /** 上一幀的 phase —— 換回合就把每一格的殘留閃爍收乾淨。 */
  private cuePhase = "";
  private readonly views: EntityViewRegistry;
  /**
   * #223 —— 「這個 entity 現在穿的是哪一具身體」以及由它決定的三條渲染縫。
   * 住在 `render/views/championBody.ts`，因為 GameApp 建構不出來 ⇒ 寫在這裡的
   * 決策沒有守衛。見那個檔案的檔頭。
   */
  private readonly championBody: ChampionBodyHooks;
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
  /** previous phase seen by the ground-texture warm edge detector (GH#536). */
  private warmedPhase = "";

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
  /** GH#324 —— 目前這張場地的碰撞真相；視野遮蔽從它讀牆。 */
  private arenaDef: ArenaDef = SKELETON_ARENA;
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
   * ⭐ GH#591 —— **具名**的 state-patch 訂閱者。
   *
   * colyseus.js 0.16.22 的 `onStateChange(cb)` 回傳的是 **EventEmitter 本身**
   *（`core/signal.js::createSignal`），⛔ 不是一支 unsubscribe fn ⇒ 唯一的退訂
   * 路徑是 `room.onStateChange.remove(cb)`，而那需要一個留得住參照的 cb。
   * 三個 `connect*()` 在此之前掛的都是 inline arrow ⇒ ⛔ 沒有人 remove 得掉。
   */
  private readonly onPatch = (state: MatchState): void => this.onStatePatch(state);
  /** `onPatch` 掛在哪一間房 —— `dispose()` 要跟它退訂。 */
  private boundRoom: Room<MatchState> | null = null;
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
  /**
   * 畫面上那顆 fps pill 的分母。
   *
   * ⚠️ **不可以用 `lastFrameMs`。** 那一格是 `driveFrame` 的**節流累加器** ——
   * 它記的是「上一次**被允許**畫的理想時刻」而不是「上一張真的畫出來的時刻」,
   * 兩者在 cap 生效時差一個餘數。拿它當 dt 會讓真的 30 fps 被報成 25(GH#271),
   * 也就是 owner 回報的「會在 25-26fps 跳動」。
   *
   * `FrameDelta` 記的是**牆上時間**,所以它答的是「這一張離上一張多久」。
   * 守衛:`render/frameCap.test.ts` 的「出貨的 GameApp.renderFrame 真的用 FrameDelta」
   * —— 它掃原始碼(失敗形態 ⑥),因為 `GameApp` 抓 Babylon engine / canvas / socket,
   * headless 建構不起來;這個檔案的既有做法就是這樣,理由寫在
   * `GameApp.frameWiring.test.ts` 的檔頭。
   */
  private readonly frameDelta = new FrameDelta();
  private predAccumMs = 0;
  /**
   * 送出去的幀率計 (GH#271). 餵它的是**兩次真的繪製之間的間隔**;它同時是
   * `perfBus` 那五個 fps 欄位的唯一作者。以前這裡是一個裸的 `fpsEma` 數字,
   * 而它算對了卻沒有人讀 —— pill 讀的是被 adaptive 的 workMs 視窗覆寫的 avgFps。
   */
  private readonly frameRate = new FrameRateMeter();
  private renderParams: RenderParams = qualityController.getParams();
  private offParams: (() => void) | null = null;
  /**
   * 誤觸防護（owner 2026-08-14：「滑鼠右鍵 WIN鍵等按鍵要鎖住」）。
   * ⚠️ 它掛在 **document** 不是畫布 —— 畫布的右鍵早就被 `InputCapture` 吃掉了
   * （右鍵 = 移動/攻擊指令），漏的是 HUD 那一半，而 HUD 佔畫面下緣一整條。
   */
  private inputGuard: InputGuard | null = null;
  /** 每個本地玩家「上一幀是不是在 combat」—— 只給 relockFollowOnRoundStart 用。 */
  private readonly wasInCombat = new Map<number, boolean>();
  /**
   * intent 的節拍器 (task #282). **與 rAF 是兩個時鐘** —— rAF 只是餵它時刻,
   * 拍點是從時間算出來的,所以 30 fps 的手機每秒仍然剛好 `intentHz` 拍。
   * 速率走 `renderParams.intentHz`(玩家設定,不是寫死),live 生效。
   */
  private readonly intentClock = new IntentClock(
    {
      sample: () => this.sampleInput(),
      beat: (beatMs) => this.transmitIntents(beatMs),
    },
    this.renderParams.intentHz,
  );
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
  /**
   * L3 —— 這個客戶端**要渲染**的 duel zone 集合 (net/zoneVisibility.ts)。
   * 每個本地玩家貢獻兩個來源：自己英雄所在的 zone，加上 #269 觀戰按鈕把鏡頭
   * 送去的那個 zone。重算在 `refreshVisibleZones`，消費在四個地方 ——
   * `onStatePatch`(插值緩衝)、`collectEntities`(view 同步/腳步/光環)、
   * 那一圈 statusFx/語音、以及 `updateFrameBus`(血條錨點 + 復活圈)。
   */
  private readonly visibleZones = new VisibleZones();
  /** reused: ids fed into the interpolation buffer this snapshot (prune input). */
  private readonly interpSeen = new Set<number>();
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
   * 玩家自己下的 `attackTarget` 訂單指到的實體 (GH#281 (b) 跟手路徑).
   *
   * 為什麼這一筆要在 client 自己記一份，而不是問影子的 `nav.attackTarget`：
   * `orderSystem` 每一 tick 都會把一個「transform 查不到」的攻擊目標清成 null
   * （systems/OrderSystem.ts 的 chase 解析），而影子世界裡除了自己一具身體之外
   * **什麼都沒有** —— 所以那個欄位在影子裡結構上永遠是 null，問不到。
   *
   * 這一筆是玩家自己按下去的，所以它是**零延遲**的（不必等 ack、不必等快照），
   * 這正是 (b) 存在的理由。伺服器自動索敵 (#221) 挑的目標不會走這裡，那一半由
   * (a) 校正路徑補上 —— 兩條路互補。
   */
  private attackOrderTargetId: number | null = null;
  /**
   * `LocalFacingMode.authoritative` 的 render pose —— 預測位置 + 權威面向。
   * 每幀重複使用同一個物件（`poseFor` 一秒被呼叫上千次，per-frame 配置在這條
   * 路徑上是量得到的 GC 壓力）。
   */
  private readonly localAuthPose = { x: 0, z: 0, fx: 1, fz: 0 };
  /**
   * Active combat-env multiplier table (MatchState.combatEnvJson, parsed once
   * per change). Of all factors ONLY moveSpeed matters client-side: prediction
   * replays just order+movement; every other quantity reaches the client via
   * authoritative snapshots (hp/mana/cooldowns).
   */
  private combatEnvJson = "";
  private combatEnv: CombatEnvMultipliers = DEFAULT_COMBAT_ENV;
  /**
   * 殭屍外觀 (GH#192, MatchState.mobVisualJson), parsed once per change — the
   * same shape and the same reason as `combatEnvJson` above. Seeded with the
   * SHIPPED table, not with 「no tint」: a mob that appears before the first
   * patch lands must already be dark, or the very first wave of a match renders
   * as a crowd of un-tinted champions.
   */
  private mobVisualJson = "";
  private mobVisual: MobVisualTable = MOB_VISUAL_DEFAULT;
  /**
   * 精英小怪血條的四格 (GH#268)，從 `mobVisual` 抽出來並且**跟著它一起**重算。
   * 快取的理由跟上面同一個：`updateFrameBus` 每一幀都要用它算投影高度，而
   * `mobHealthBarConfigFrom` 每次都配一個新物件。
   */
  private mobBarCfg: MobHealthBarConfig = SHIPPED_MOB_HEALTH_BAR;
  private readonly teamBySeat = new Map<number, number>();
  /** per-player last-observed alive state (death-spectator camera transitions) */
  private readonly aliveByPlayer = new Map<number, boolean>();
  // ⛔ GH#518 —— per-player champ-select 游標**搬去** `input/couchChampSelect`：
  // 那裡記的是英雄 **id** 而不是索引，因為白名單是非同步回來的，清單長度會在
  // 一場之內變一次（`NO_FILTER` → 營運勾選的那幾隻），而存索引會讓每個人手上的
  // 英雄在那一刻無聲跳掉。
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
      // #282: 玩家在設定裡改送出率,這一場就生效 —— 不用重開一場(同
      // interpolationDelayMs 的待遇)。setHz 自己會夾範圍並重新對拍。
      this.intentClock.setHz(p.intentHz);
    });
    this.arenaHandles = buildArena(this.renderer.scene, SKELETON_ARENA);
    // publish the zone circles for the minimap (replaced once the real map loads)
    frameBus.arenaZones = SKELETON_ARENA.zones.map((z) => ({ x: z.center.x, z: z.center.z, r: z.boundaryRadius }));
    this.viewports = new ViewportManager(this.renderer.scene, SKELETON_ARENA.zones[0]!.center, playerCount);
    this.assets = new AssetManager(this.renderer.scene);
    // #223 —— 三條形態感知的縫（`modelDocFor` / `voxelSkinFor` /
    // `modelOverrideFor`）住在 `render/views/championBody.ts`，不住在這裡。
    // GameApp 在測試裡建構不出來（`new Engine(canvas)` 要真的 WebGL），所以寫
    // 在這個檔案裡的決策**沒有守衛**：上一輪就是這樣讓
    // `modelDocFor: (key, seatId) => …` 這個兩參數的箭頭函式把 registry 傳來的
    // 第三個引數 `formIndex` 靜靜吃掉 —— 修法整條是死的，4504 條測試零紅。
    // 現在這裡只剩資料來源；決策與其守衛在 championBody.ts /
    // formAwareModelResolve.test.ts。
    this.championBody = championBodyHooks({
      championIdForSeat: (seatId) => this.championIdForSeat(seatId),
      // ⭐ M1（GH#599）—— 變身外觀掛在**狀態**上的那一半。
      // ⚠️ ⛔ 少了這一行,`statusIdsForSeat` 恆 `undefined` ⇒ M1 在客戶端是**死的**
      //    （失敗形態③:整條可以刪掉而測試全綠）—— 今天已經抓到六次這個形狀。
      // ⭐ 所以它現在**刪掉會 tsc 紅**:上面那個 `satisfies SeatedChampionBodyDeps`
      //    把這一格變成必填(⛔ 不是一條「要記得注入」的散文)。
      // ⭐ 座位的 `statusIds` 是**全座位都送的**（`net/snapshot.ts` 的座位迴圈跑
      //    `ctl.seats` 全部,而 `MatchState.seats` 沒有任何 Colyseus filter）,
      //    所以這一行 ⛔ 不需要任何新的線路欄位、⛔ 不需要新的 `ENTITY_FLAG` bit
      //    （那一格是不可逆的,剩 11 顆）、⛔ 也不需要動 `apps/game-server/**`。
      statusIdsForSeat: (seatId) =>
        seatId === undefined
          ? EMPTY_STATUS_IDS
          : (hudStore.getState().seats.find((s) => s.seatId === seatId)?.statusIds ??
            EMPTY_STATUS_IDS),
      resolveModelKey: (key, seatId) => this.resolveModelKey(key, seatId),
      overlay: blizzardOverlayModels,
      content: {
        modelFor: (modelKey) => this.contentDb.modelFor(modelKey),
        standinOverrideFor: (championId) => this.contentDb.modelOverrideFor(championId),
        voxelSkinOverrideFor: (championId) => this.contentDb.voxelSkinOverrideFor(championId),
        formVisualFor: (championId) => this.contentDb.formVisualFor(championId),
      },
      // ⭐ `satisfies` 而不是型別註記：物件字面值的推論型別要原封不動交給
      //    `championBodyHooks`，同時 `statusIdsForSeat` 少一行就 tsc 紅。
    } satisfies SeatedChampionBodyDeps);
    this.views = new EntityViewRegistry(this.renderer.scene, this.assets, {
      // THE THREE FORM-AWARE HOOKS, taken WHOLE from the factory — never
      // re-wrapped in an arrow here. A wrapper is exactly how the arity bug
      // above got in, and it would also put a decision back in the one file no
      // test can construct.
      modelDocFor: this.championBody.modelDocFor,
      modelOverrideFor: this.championBody.modelOverrideFor,
      voxelSkinFor: this.championBody.voxelSkinFor,
      projectileVfxFor: (key) => {
        const def = Projectiles.tryGet(key as ProjectileId);
        return def?.vfxKey ? this.contentDb.vfxFor(def.vfxKey) : null;
      },
      projectileMeshShapeFor: (key) => Projectiles.tryGet(key as ProjectileId)?.meshShape ?? null,
      // #251 —— 打得到多寬要看得見。同一份 `projectile@1` 文件,同一個 registry,
      // 所以畫面上的體積和 sim 真的用的 `hitRadius` 不可能漂開。
      projectileHitRadiusFor: (key) => Projectiles.tryGet(key as ProjectileId)?.hitRadius ?? null,
      // #394 —— 飛行姿態走**同一份** `projectile@1` 文件、同一個 registry,所以
      // 「畫面上的姿態」和「sim 真的在飛的那一發」不可能指到兩顆不同的子彈。
      projectileFlightFor: (key) => Projectiles.tryGet(key as ProjectileId)?.flight ?? null,
      // w3x vertex tint (task #49). The seat table lives in the HUD store, and
      // render/** may not read it (client-08), so the entity → champion step
      // happens here — the same `championIdForSeat` the model resolve uses.
      // GH#192 殭屍染黑 rides the SAME seam, one branch earlier. It has to: a
      // mob has `seatId === -1`, so `championIdForSeat` returns null and
      // `championTintForId` answers `undefined` — 「not resolvable yet」 — which
      // the registry retries forever and never paints. That is precisely why a
      // mob wearing a champion's mesh would otherwise render in the champion's
      // own colours, indistinguishable from a player who picked them.
      // #249 GH#288 —— 變身色疊在英雄自己的 w3x tint 上(相乘,見
      // render/views/formVisual.ts)。`composeFormTint` 會把 `undefined`
      // (「seat 表還沒好」)原樣傳回去,所以重試語意沒有被吃掉。
      //
      // #223 2026-07-30 —— 「問哪一隻」這個決定搬進 `championBody` 了。這裡
      // 以前寫的是 `championTintForId(this.championIdForSeat(e.seatId))`,
      // 也就是**第四條形態盲的縫**,而本檔與 formVisual.ts 的註解當時都已經
      // 宣稱它是形態感知的。實測 26 對只有 #06 傑·富力士 兩半顏色不同,所以
      // 它變身之後那具 herobiggon.glb 被漆成本體的綠色。
      // 剩在這裡的只有 mob 那一支 —— 它要讀 `this.mobVisual`(後台可調的即時
      // 設定),不是決策。
      championTintFor: (e) =>
        entityTintFor(e, this.mobVisual.tintStrength, () => this.championBody.championTintFor(e)),
      // #247 「殭屍王底下圈圈會比較大」 —— same seam, same reason as the tint one
      // directly above: `this.mobVisual` is the LIVE 後台 table off
      // `MatchState.mobVisualJson`, and render/** cannot reach the net layer.
      // MOBS ONLY: a champion keeps `ChampionView`'s own ring, which is the
      // team-identity affordance #231 flags as the highest-risk surface to touch.
      groundRingDiameterFor: (e) => mobRingDiameterFor(e, this.mobVisual),
      // GH#647 「普通殭屍不必畫血條跟陰影 節省效能」—— same seam, same reason.
      // 後台開關 `mobWaves.normalMobShadow` 騎在 `this.mobVisual` 上(出貨 false)。
      mobShadowSuppressedFor: (e) => mobShadowSuppressedFor(e, this.mobVisual),
      // #249 GH#288 —— 變身球體掛件(悟空的超三頭)。同一條 entity → championId
      // 縫,經由 championBody 的 `formVisualFor`(它自己就是形態感知的)。
      // #249 GH#288 變身球體掛件 + ⭐ GH#392 **內容驅動的骨頭掛件**。
      //
      // 兩個來源合成一張清單,而它們在 shared 就折成同一個型別了
      // (`WornAttachment`),所以這裡沒有第二份 follow/anim 規則:
      //   ① `config.form-visuals@1` —— 變身態的球體(悟空的超三頭)
      //   ② `attachment@1` 文件,綁在 `config.ambient-vfx@1.bindings`
      //
      // ⚠️ ② 的鍵**查兩次**,而那不是保險是必要的:`godie-ogrh` 與 `godie-o00x`
      // 共用 `imported.goku`,所以 modelKey **分不出超三**。只有 championId
      // (形態感知,`bodyChampionIdFor`)分得出來。反過來,一張綁在 modelKey 上的
      // 掛件對「所有穿這具身體的人」都成立(替身/小怪也算),那也是要的。
      formAttachmentFor: (e) => {
        const glbPathOf = (modelKey: string): string | null =>
          this.contentDb.modelFor(modelKey)?.glbPath ?? null;
        const out: FormAttachmentSpec[] = [];
        const fromForm = formAttachmentSpecFor(this.championBody.formVisualFor(e), glbPathOf);
        if (fromForm) out.push(fromForm);
        const keys = [this.resolveModelKey(e.key, e.seatId), this.championBody.bodyChampionIdFor(e)];
        for (const key of keys) {
          if (!key) continue;
          for (const binding of this.contentDb.ambientBindingsFor(key)) {
            const doc = this.contentDb.attachmentFor(binding.vfx);
            if (!doc) continue; // 粒子/緞帶綁定 —— AmbientVfx 那一條路在管
            for (const worn of wornFromAttachmentDoc(doc)) {
              const spec = wornAttachmentSpec(worn, glbPathOf);
              if (spec) out.push(spec);
            }
          }
        }
        // ⭐ GH#539 —— 常駐特效的 **glb** 那一半（原作的魔法陣是一個帶動畫的 mdx,
        // ⛔ 不是粒子）。同一份 `persistentVfx`,兩條算繪路:指到 `attachment@1`
        // 走這裡,指到 `vfx@1`/`ribbon@1` 走 AmbientVfx。⛔ 少了這一段,莉娜腳下
        // 那個圈就是一份填了沒人讀的欄位。
        // ⚠️ GH#603 —— 這一條路也要吃**同一個**學習閘。⛔ 少了 `e.seatId`,
        // 粒子那一半等到 EX 解鎖才出現、而模型那一半從出生就掛著（同一份宣告
        // 兩個時機 = 一個看得見卻查不出來的錯）。
        for (const id of this.persistentVfxFor(e.key, e.seatId) ?? []) {
          const doc = this.contentDb.attachmentFor(id);
          if (!doc) continue;
          for (const worn of wornFromAttachmentDoc(doc)) {
            const spec = wornAttachmentSpec(worn, glbPathOf);
            if (spec) out.push(spec);
          }
        }
        return out;
      },
    });
    // ⭐ GH#337 —— 場景型 FX 只有**一個組裝點**（render/roundFxRegistry）。
    //    這裡以前是五段各自 new 的程式碼，而回合邊界只認得其中一個（`this.vfx`），
    //    另外四個從第一天起就沒有被清過。⛔ 加新的場景型 FX 要加在 createRoundFx
    //    裡並註冊，否則 `GameApp.roundFxWiring.test.ts` 會紅。
    const roundFx = createRoundFx(this.renderer.scene, {
      vfx: {
        // ⭐ 出口的閘（owner 2026-08-19）——「特效定位」那一半。⚠️ 這是
        // **唯一**的接縫：`VfxSystem` 每一條路都是先 `entityPos()` 再
        // `isFinitePos()`，null 就什麼都不生（它自己的 FIX #131 已經如此），
        // 所以在這裡回 null 就等於「界外的施法特效不播」，⛔ 不必動 vfx/**，
        // 也⛔ 不會延後任何一個界內的特效。
        entityPos: (id) => {
          const p = this.views.posOf(id) ?? this.schemaPos(id);
          if (p && !anchorDrawable(frameBus.arenaZones, p.x, p.z, `vfx #${id}`)) return null;
          return p;
        },
        vfxDoc: (key) => this.contentDb.vfxFor(key),
        // ⭐ GH#551/#543 —— 移動中的**模型**特效要的兩個接縫（翻滾光束／圓周冰塊／
        //    直線火球）。⚠️ 它們是**注入**的,理由與上面 `vfxDoc` 一字不差：
        //    特效層知道「要播什麼」,⛔ 不知道「內容從哪來」。
        // ⛔ 少了這兩行,`VfxSystem` 的 `modelFx` 永遠是 null ⇒ 四支技能的
        //    JSON 有 `spawnModelFx`、傷害照樣掉血、⛔ 而畫面上一條光束都沒有
        //    （失敗形態②,而且它看起來完全正常）。
        // ⛔⛔ GH#607 —— 這四行以前**手挑欄位**（`{ glbPath, scale }`），於是
        //    `fxLongAxis` / `fxSpawnHeight` 在這一步就被丟掉 ⇒ owner 要的
        //    「**90 度橫放的 beam**」軸修正**從來沒有生效過**，移動模型一律貼地
        //    y=0。⚠️ `modelFxRig` 兩格都讀了、`model@1` 兩格都存了、
        //    `modelFxAxis.test.ts` 也綠著 —— 缺的只有**這一段的中間**。
        // ⭐ 修法不是「把兩格補進那個字面值」（下一格照樣會漏），是**不要投影**：
        //    `modelFxDocFor` 整份文件走過去，rig 讀得到哪幾格由 rig 自己說了算。
        modelDocFor: (modelKey) => modelFxDocFor(this.contentDb.modelFor(modelKey)),
        loadModelContainer: (glbPath) => this.assets.load(glbPath),
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
        // ⭐ GH#494 —— 金幣被吸進身體那一下的**輕**音效（連段音階由 `semitones` 帶）。
        // 走 `audioSystem.playSfx` 而不是 `sfxQueue`：這一發刻意**不空間化**，
        // 它講的是「錢進了**你的**口袋」，那件事不在場上某個座標上發生。
        // 音量／靜音／SfxGate 的冷卻與同時發聲數仍然全部適用（那是 playSfx 給的）。
        playSfx: (event, opts) => audioSystem.playSfx(event, opts),
      },
      ambient: {
        bindingsFor: (key) => this.contentDb.ambientBindingsFor(key),
        vfxDocFor: (id) => this.contentDb.vfxFor(id),
        ribbonDocFor: (id) => this.contentDb.ribbonFor(id),
      },
      // ⭐ GH#546 —— 風王結界那一族「開著的時候手上要有跟隨特效」的閘。
      // ⛔ 這一行**只能住這裡**：`architecture.test.ts` 的 client-08 禁止
      // `render/**` 與 `vfx/**` import `RoomStore`（逐幀資料不可以穿過
      // React state），而 `GameApp` 在那兩層之外。少了它 ⇒ 一律回 0 ⇒
      // 那幾列不掛（fail-closed，⛔ 不是崩潰）。
      // ⚠️ 用 `entityId` 找座位（`SeatView.entityId`），⛔ 不是 seatId ——
      // `attach()` 只拿得到實體；小怪／替身找不到座位 ⇒ 0。
      ambientToggleMask: (entityId) =>
        hudStore.getState().seats.find((s) => s.entityId === entityId)?.toggleMask ?? 0,
      // THE FIRE RING (task #195). ⚠️ 它現在在這裡建，比 `burnTint` 早 —— 那個
      // 「burnTint 先建所以先掛」的順序講的是**同一台相機上的 post-process 掛載
      // 順序**（burnTint 之於 deathFocus），火圈不是 post-process，不在那條線上。
      fireRing: { vfxDocFor: (id) => this.contentDb.vfxFor(id) },
      // Victory fireworks frame themselves against player 0's camera (the whole
      // table watches player 0's screen at settlement anyway) and cost nothing
      // until a win edge fires. Quality tier scales the point budget, never a
      // truncation — a low-tier bird is still a whole bird.
      victory: {
        cameraFor: () => this.viewports.rigFor(0).camera,
        scale: this.renderParams.particleDensity,
      },
      // ⭐ GH#580 —— 出貨的那一個特效循環音登記表。⚠️ 在此之前它**只**被
      //    `dispose()`（＝離開房間）清過,回合邊界完全碰不到 ⇒ 上一回合的循環音
      //    跟著進商店。餵進去而不是讓 registry 自己 import,守衛量到的才是出貨接線。
      sound: vfxSoundLayer,
    });
    this.vfx = roundFx.vfx;
    // ⭐ GH#549 —— 螢幕震動的出口。owner:「畫面閃爍**及震動** 不然都不知道
    //    發生什麼事情有沒有反擊成功」。
    // ⚠️ ⛔ **不在這裡直接呼叫 `cameraRig.addShake`** —— `combatCameraWiring.test.ts`
    //    要求 GameApp 裡**只能有一個** addShake 呼叫點（防「同一次命中震兩下」）。
    //    ⭐ 走同一個漏斗才是對的:作者寫的 `screenShake` 也應該吃到那條路上的
    //    人群預算（`frameKicks`）與 EX 抑制,⛔ 不是繞過它們自己震一次。
    //    ⚠️ 這一條是**全螢幕那一層**的出口（單人/沒安裝逐格路由時才會響）——
    //    分割畫面走 `installScreenCues()` 建的逐格 sink，見那裡。
    this.vfx.installShakeSink((amp, ms) => this.queueAuthoredShake(0, amp, ms));
    // 🖥️🖥️ GH#612 —— 逐格螢幕演出。⛔ 必須在 `this.vfx` 之後（它要同一份上界）。
    this.installScreenCues(playerCount);
    this.ambient = roundFx.ambient;
    this.whirlwind = roundFx.whirlwind;
    this.fireRing = roundFx.fireRing;
    this.victoryFx = roundFx.victoryFx;
    // 回合邊界 → 特效清場 (#16 / #259 / GH#337)。餵它 phase，它在進/出 combat 的
    // 那一幀對**整張註冊表**扇出。⛔ 這裡以前寫的是 `new RoundVfxLifecycle(this.vfx)`
    // ——「只有一個 target」正是 owner 看到的殘留的根因。
    this.roundVfx = new RoundVfxLifecycle(roundFx.registry);

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

    // The burn tint is constructed BEFORE the death focus: post-process order on
    // a Babylon camera is attach order, so a champion who burns to death sees the
    // red washed down to grey rather than a red film over a grey frame.
    // (THE FIRE RING, task #195, moved to `createRoundFx` — GH#337. It is not a
    // post-process, so it was never part of this ordering constraint.)
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

    // (Victory fireworks moved to `createRoundFx` — GH#337. They are the one FX
    // that must NOT be cleared on the `leave` edge: the round volley fires on
    // exactly that frame.)

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
    // ⭐ GH#596 —— 非預期斷線在此之前**沒有一條回大廳的出路**（`onDisconnect`
    //    全 repo 零指派點）⇒ 伺服器掉了，玩家留在一個永遠不再更新的畫面上。
    //    ⚠️ `RoomConnection.leave()` 會把它清成 null，所以**自己走掉**的那一條
    //    ⛔ 不會進來（那不是斷線）。
    for (const c of this.sessions.connections) {
      c.onDisconnect = (code) => appStore.getState().matchDisconnected(code);
    }
    setLocalAccounts(this.sessions.localAccountIds());
    // prediction covers player 0 only; other viewports render authoritative
    this.sender.onSent = (msg) => {
      // BOTH halves (task #281). `msg.aim` used to be dropped here, so the
      // shadow world replayed movement with no aim at all and the local hero's
      // facing was decided by its move direction until the authority caught up
      // — one full RTT of wrong facing on the champion the player is watching.
      if (msg.order || msg.aim) this.prediction.recordInput(msg.seq, msg.order, msg.aim);
      // GH#281 (b): remember WHO the player just told this hero to attack. Any
      // other navigation order releases it — the same thing `orderSystem` does
      // server-side (`if (!nav.attackTargetAuto) nav.attackTarget = null` on a
      // move), so the shadow and the authority let go at the same moment.
      if (msg.order) {
        this.attackOrderTargetId =
          msg.order.kind === "attackTarget" && msg.order.entity !== undefined
            ? msg.order.entity
            : null;
      }
      // ping estimate: stamp each seq so the ack delta measures RTT
      this.connStats.noteSent(msg.seq, performance.now());
      // hum idle latch: any issued input means you are NOT idle (voice §三).
      this.noteLocalCombat();
    };

    frameBus.project = (x, y, z) => this.cameraRig.projectToScreen(x, y, z);

    // ⭐ 誤觸防護：一進到比賽就裝上，`dispose()` 拆掉。
    // ⚠️ `confirmOnLeave` **在這裡才打開** —— 那個「你確定要離開嗎」的框在大廳
    //    是純騷擾，只有「正在打」的時候它才擋得住真正的損失（那一場沒了）。
    //    這就是為什麼 `DEFAULT_INPUT_GUARD` 把它預設關掉：預設值屬於模組，
    //    ⛔ 場景差異屬於呼叫端。
    this.inputGuard = installInputGuard(document, window, {
      ...settingsStore.get().input,
      confirmOnLeave: true,
    });

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
          pickNearestUnit(
            from,
            this.enemyUnitsFor(this.playerTeam(player)),
            maxRange,
            aimDir,
            // GH#315：小怪讓路幅度現在住在 `config.combat-feel@1`（後台可調），
            // ⛔ 不是客戶端常數。每次呼叫都讀，這樣後台改完重新載入就生效。
            aimAssistMobPenalty(),
          ),
        // what a LONG PRESS on a skill button does: spend this point, or (with
        // none) show that ability's description (owner's 2026-07-27 pad map)
        skillPoints: this.playerSkillPoints(player),
      }),
    );
  }

  async connect(): Promise<void> {
    const room = await this.sessions.connectDev(this.opts.mapId, this.opts.practice);
    // ⭐ GH#570 —— `bind()` 那道閘擋不住這三行:它們拿的是 `connectDev()` 的
    // **回傳值**,⛔ 不是 `conn.room`。離開落在上面那個 await 裡時,這裡照樣
    // 會把一間幽靈房接上 `onStateChange` → `onStatePatch` → **模組層全域** hudStore。
    if (this.disposed) {
      this.sessions.dispose();
      return;
    }
    setLocalAccounts(this.sessions.localAccountIds());
    this.boundRoom = room;
    room.onStateChange(this.onPatch);
    this.onStatePatch(room.state);
  }

  /** Platform flow: consume the Go-minted seat token(s) — one per couch player. */
  async connectPlatform(endpoint: string, entries: SeatTokenEntry[]): Promise<void> {
    const room = await this.sessions.connectPlatform(endpoint, entries);
    // ⭐ GH#570 —— `bind()` 那道閘擋不住這三行:它們拿的是 `connectDev()` 的
    // **回傳值**,⛔ 不是 `conn.room`。離開落在上面那個 await 裡時,這裡照樣
    // 會把一間幽靈房接上 `onStateChange` → `onStatePatch` → **模組層全域** hudStore。
    if (this.disposed) {
      this.sessions.dispose();
      return;
    }
    setLocalAccounts(this.sessions.localAccountIds());
    this.boundRoom = room;
    room.onStateChange(this.onPatch);
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
    // ⭐ GH#570 —— `bind()` 那道閘擋不住這三行:它們拿的是 `connectDev()` 的
    // **回傳值**,⛔ 不是 `conn.room`。離開落在上面那個 await 裡時,這裡照樣
    // 會把一間幽靈房接上 `onStateChange` → `onStatePatch` → **模組層全域** hudStore。
    if (this.disposed) {
      this.sessions.dispose();
      // ⚠️ 回放這一條要回一個 Room。⛔ 不要在這裡丟一個會跳「連線失敗」toast 的
      //    例外 —— 使用者是**自己**離開的,那不是錯誤。把已經退掉的 room 原封
      //    交回去:呼叫端只用它送 transport 訊息,而它已經 leave 了 ⇒ 無害。
      return room;
    }
    setLocalAccounts(this.sessions.localAccountIds());
    this.boundRoom = room;
    room.onStateChange(this.onPatch);
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

  /**
   * Champ-select pad picking: A cycles FORWARD through that player's roster,
   * B cycles BACK (GH#518 — 一個沙發玩家按過頭之後沒有回頭路).
   *
   * ⭐ 清單來自 `input/couchChampSelect`，它讀的是**後台白名單**（外加下架／
   * 隱藏／變身態三層內容事實），⛔ 不是 `Champions.ids()` 那份整份登錄表 ——
   * 那份裡面有一半是伺服器會拒絕的 id，而按下去畫面上看不出任何事情發生。
   * 游標與 `ChampSelectPanel` 的格子共用同一支 `whitelistedChampionIds`，
   * ⛔ 不是第二套規則。
   */
  private onPadButton(player: number, button: number): void {
    if (button !== BTN.A && button !== BTN.B) return;
    const hud = hudStore.getState();
    if (hud.phase !== "champSelect") return;
    // 一場一次的 memo；champ-select 期間第一次按鍵把白名單拉進快照。
    primeWhitelist(hud.matchId);
    const id = cycleCouchChampion(player, button === BTN.A ? 1 : -1, shippedCouchPickableIds());
    if (id === null) return;
    this.sessions.sendSelectChampion(player, id);
  }

  /**
   * Model doc for an entity view — a THIN FORWARD to
   * `render/views/championBody.ts` for the call sites that have no entity (the
   * mob size probe, the champ-select preview, the round-winner podium).
   *
   * The resolution itself (authored content → equipped skin → the LOCAL-ONLY
   * Blizzard overlay, asked about the body that is ACTUALLY on screen) lives in
   * that module and NOT here, because nothing can construct a GameApp in a test
   * — see the #223 note at the `championBodyHooks(...)` call in the ctor.
   */
  private modelDocFor(key: string, seatId?: number, formIndex = 0): ModelDoc | null {
    return this.championBody.modelDocFor(key, seatId, formIndex);
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

  start(): void {
    this.input.attach();
    this.touch?.attach(this.canvas);
    this.lastFrameMs = performance.now();
    // 忘掉上一場的最後一張,否則這一場第一張的 dt 是 FRAME_DELTA_MAX。
    this.frameDelta.reset();
    // #282 —— **兩個時鐘**。rAF 是主要來源;IntentClock 的 watchdog 計時器是
    // 第二個,只有在 rAF 停擺(切到背景手勢、發熱降到個位數 fps、Babylon 卡在
    // 一次大載入)時才接手。rAF 健康時 watchdog 是純 no-op,見 IntentClock.wake。
    this.intentClock.reset();
    this.intentClock.start();
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
    this.intentClock.stop(); // 第二個時鐘也要停,否則離場後還在 poll 手把
    this.offParams?.();
    this.offParams = null;
    // ⚠️ 一定要拆：`beforeunload` 與 keyboard lock 都是**全域**的，留著會讓
    //    離開比賽之後的大廳還在跳「你確定要離開嗎」，而且 Esc 也還被吃掉。
    this.inputGuard?.dispose();
    this.inputGuard = null;
    this.offQuality?.();
    this.offQuality = null;
    registerHudActions(null);
    registerTouchController(null);
    this.input.dispose();
    this.touch?.dispose();
    this.aimIndicator.dispose();
    this.gamepads.dispose();
    // ⭐ GH#591 —— 訂閱不退，那個閉包就把已 dispose 的 GameApp（含整棵 Babylon
    //    scene）釘在 heap 上。GH#570 已經讓**寫端**無害（`onStatePatch` 第一行的
    //    disposed 閘），⛔ 但一份無害的訂閱仍然是一份不會被回收的參照。
    this.boundRoom?.onStateChange.remove(this.onPatch);
    this.boundRoom = null;
    this.sessions.dispose(); // leave every room + drop input sinks
    // ⭐ GH#560 —— **出口**也走**同一份**清單（owner 2026-08-22:「不管是**出口**
    //    還是入口還是每回合進商店前」「寧願多次清理乾淨 也不要漏清到」）。
    //    ⚠️ 它必須在下面那一長串 `dispose()` **之前**：那些是釋放,而這一行是把
    //    共用池子與 module 單例（`vfxSoundLayer` 的循環音登記表）先還回去 ——
    //    倒過來的話這一行拿到的是一堆已經 dispose 的物件。
    this.roundVfx.exit();
    this.vfx.dispose();
    // 🖥️🖥️ GH#612 —— 逐格 overlay 與它的路由旗標一起收（⛔ 留著旗標 = 下一場
    //    全螢幕那一層也被關掉,而逐格那一層已經不在了 ⇒ 畫面上一發都沒有）。
    installSplitScreenCueRouter(false);
    for (const l of this.cueLayers) l.dispose();
    this.cueLayers.length = 0;
    this.cueHost?.remove();
    this.cueHost = null;
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
    vfxSoundLayer.reset(); // GH#390 —— 循環音的登記表也要清,否則殘留聲音跨場景
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
  /**
   * 伺服器現在握著**本機英雄**這具身體嗎？(GH#370)
   *
   * ⭐ 這是一個 method 而不是 frame 裡的一段閉包，理由是**可測**：
   * `predictionHoldWiring.test.ts` 用 `GameApp.prototype` 直接呼叫它
   * （同 `predictionArenaParity.test.ts` 的判例）。第一版把邏輯抄進測試裡，
   * 突變驗證**沒有紅** —— 那條守衛是空的（失敗形態⑤：被測的不是出貨的那個）。
   */
  private predictionHeldByServer(state: MatchState | null | undefined): boolean {
    const mask = predictionHoldFlagMask();
    if (mask === 0) return false;
    const lid = hudStore.getState().localEntityId;
    if (lid === null || !state?.entities) return false;
    const es = state.entities.get(String(lid));
    // ⚠️ `!== 0` 不是 `> 0` —— flags 是 uint32，高半部 `&` 出來是負數。
    return es !== undefined && (es.flags & mask) !== 0;
  }

  /**
   * 固定步長推進預測影子。`held` = 這一幀**不要**推進。
   *
   * ⭐ 兩個來源共用同一條路：結算凍結 (`outcomeDecided`) 與伺服器扣留 (GH#370)。
   * `reconcile` 仍然照跑，所以身體會對齊權威 —— 沒有爬出去，就沒有東西要被拉回來，
   * 也就沒有 owner 看到的那個「放完技能之後原地小步來回」。
   */
  private advancePrediction(dtMs: number, held: boolean): void {
    if (held) {
      this.predAccumMs = 0;
      return;
    }
    this.predAccumMs += dtMs;
    while (this.predAccumMs >= TICK_MS) {
      this.prediction.stepTick();
      this.predAccumMs -= TICK_MS;
    }
  }

  /**
   * ⭐ GH#536 —— 在**中場（商店）**把每一種地面貼圖先抓好。
   *
   * owner 2026-08-22：「福利連地圖地板全黑了」/「大混戰也是 似乎是**讀取不夠快**
   * 並且**沒有提前在商店完成讀取**的緣故」—— 他的診斷是對的。地圖每回合換
   * （task #145），而在此之前四張地面 PNG 是**戰鬥開始那一刻**才開始抓的，
   * 抓完之前 babylon 讓整片地板材質 not-ready ⇒ **那片 mesh 整片不畫** ⇒
   * 露出 `scene.clearColor`＝這張圖的 `palette.void`（芙莉蓮 `#060a12`、
   * 大混戰 `#05060d`）＝**全黑**。
   *
   * 中場是正確的時機，理由是**這時候沒有任何東西趕時間**：玩家在逛商店，
   * 而下一回合要用的貼圖在這幾十秒裡可以慢慢抓完。
   *
   * ⚠️ 只在**進入**中場那一格做（`phase` 的邊緣），⛔ 不是每一個快照都做 ——
   * 雖然 `warmGroundTextures` 本身是冪等的（命中就是一次 map 查找），
   * 但每秒 20 次的無謂呼叫仍然是白花的。
   */
  private warmGroundForNextRound(phase: string): void {
    if (phase === this.warmedPhase) return;
    this.warmedPhase = phase;
    if (phase !== "intermission") return;
    for (const { style, radius } of this.contentDb.arenaGroundWarmList()) {
      warmGroundTextures(this.renderer.scene, [groundTextureSet(style)], radius);
    }
  }

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
        this.arenaDef = def;
        disposeArena(this.renderer.scene, this.arenaHandles);
        // groundStyle picks the floor's PBR texture set (task #80); it lives on
        // the authored doc, not the collision-truth ArenaDef, so it is threaded
        // in here rather than derived inside the builder.
        // ⭐ GH#337 —— 這一趟建出來的 handles 也留一份在區域變數裡。下面
        // `dressArena` 的 staleness 判準要比對的正是**這一顆物件**跟
        // `this.arenaHandles` 現在是不是同一顆。
        // ⭐ GH#362 —— 第 4 個參數是這張場地的視覺身分（配色）。少了它，13 張圖
        // 又回到共用同一組灰石板＋同一顆不會動的太陽，而後台的 scenery 政策
        // 一格都調不到（第②號故障：後台存了，場上一輩子讀不到）。
        const sceneryPolicy = this.contentDb.arenaScenery();
        const scenery = sceneryPolicy.enabled ? doc?.scenery : undefined;
        const handles = buildArena(this.renderer.scene, def, doc?.groundStyle, scenery);
        this.arenaHandles = handles;
        // 燈是**場景層級**的（整個 scene 兩盞），所以它不住在 arenaHandles 裡，
        // 而是換場地時重新套用一次。⚠️ 政策關掉動畫時仍然套用顏色與角度 ——
        // 「不要閃」跟「不要有場景特色」是兩件事。
        this.lighting.applyScenery(scenery, sceneryPolicy.animateLights);
        // The minimap projects AND bakes its terrain background from the ACTIVE
        // map's collision truth — the same ArenaDef the server collides against,
        // so the picture the player reads can never disagree with the walls they
        // bump into. arenaId is the terrain-cache key.
        frameBus.arenaZones = def.zones.map((z) => ({
          x: z.center.x,
          z: z.center.z,
          r: z.boundaryRadius,
          ...(z.bounds !== undefined && z.bounds.kind === "rect"
            ? { rect: { halfW: z.bounds.halfW, halfD: z.bounds.halfD } }
            : {}),
          obstacles: z.obstacles.map((o) =>
            o.kind === "circle"
              ? ({ kind: "circle", x: o.center.x, z: o.center.z, r: o.radius } as const)
              : o.kind === "box"
                ? // ⭐ GH#324 —— 盒原樣送過去。⛔ 不再壓成外接圓：一面 24 格寬的牆
                  // 會變成半徑 24 的大圓圈，小地圖上的地形就跟玩家撞到的牆完全不一樣。
                  ({
                    kind: "box",
                    x: o.center.x,
                    z: o.center.z,
                    halfW: o.halfW,
                    halfD: o.halfD,
                  } as const)
                : ({ kind: "segment", ax: o.a.x, az: o.a.z, bx: o.b.x, bz: o.b.z } as const),
          ),
          spawns: z.spawns.map((side) => side.map((s) => ({ x: s.x, z: s.z }))),
        }));
        frameBus.arenaId = def.id;
        // ⚠️ 名字和 id **同一行**寫 —— 分開寫遲早會出現「id 換了名字沒換」，
        // 而那在畫面上是一個報錯地名的提示，比不報還糟（owner 2026-08-14）。
        frameBus.arenaName = doc?.name ?? null;
        this.appliedMapId = mapId;
        this.applyingMapId = null;
        // 第 6 個參數是 GH#251 的場地環境火焰政策。少了它 `dressArena` 會退回
        // `DEFAULT_ARENA_FIRE`(也是關的),但後台就永遠調不動這一格 ——
        // 那正是第②號故障:後台存了,場上一輩子讀不到。
        if (doc)
          void dressArena(
            this.renderer.scene,
            this.assets,
            def,
            doc,
            this.arenaHandles,
            this.contentDb.arenaFire(),
            // 第 7 個參數是 GH#324 的圓盤外背景政策。同一條縫、同一個理由:
            // 少了它後台的「畫幾層 / 要不要開」永遠調不動(第②號故障)。
            this.contentDb.arenaBackdrop(),
            // ⭐ 第 8 個是 GH#337 的 staleness 判準（in-flight 孤兒）。地圖每回合換，
            // 而 dressArena 的 .glb 載入是 async：醒來時這一趟很可能早就被
            // `disposeArena` 拆掉了。比對的是 `handles` **物件同一性**，
            // ⛔ 不是 mapId 字串 —— 隨機輪替連續抽到同一張圖時字串會相等。
            () => this.disposed || this.arenaHandles !== handles,
            // ⭐ 第 9 個是 GH#362 的場景特色政策。同一條縫、同一個理由：少了它，
            // 後台的「總開關 / 每區最多幾件」永遠調不動（第②號故障）。
            sceneryPolicy,
          );
      })
      .catch((err: unknown) => {
        // ⚠️ 這裡本來是**完全靜默**的 —— 而這一整段 `.then()` 裡任何一個
        // `this.contentDb.xxx()` 拋例外（例如新增了一個方法而某個呼叫端的
        // ContentDb 還沒有它），結果就是**整張場地沒套上**：沒有地形、
        // 小地圖空的、預測影子還鎖在上一張圖的圓 —— 而畫面上跟正常一模一樣。
        // 2026-08-18 GH#362 加 `arenaScenery()` 時就真的踩到了，⛔ 而在此之前
        // 它連一行 log 都沒有。第二守則：fail-open 沒錯，**靜默**才是缺陷。
        console.error(`[client] applyArena("${mapId}") 失敗 —— 這張場地沒有套上`, err);
        if (this.applyingMapId === mapId) this.applyingMapId = null;
      });
  }

  // ------------------------------------------------------------- network --

  /** Runs on every schema patch (SNAPSHOT_HZ): feed clocks/buffers/HUD store. */
  private onStatePatch(state: MatchState): void {
    // ⭐ GH#570 —— 這一行把 `frame()` 與 `applyArena()` **已經有的**那道閘補到
    // **第三條路**。現況是「畫面那一半關死了、狀態那一半整個敞開」——
    // 而 owner 看到的正是「**還在動但畫不出來**」（隱形的英雄在攻擊我）。
    if (this.disposed) return;
    // reflection-based state may not be materialized before the first patch
    if (!state?.seats || !state.entities) return;
    // the authoritative arena — (re)build the rendered map when it changes. The
    // arena is now per-round (task #145): the sim picks a new arena each round
    // and broadcasts its id, so prefer that per-round id and fall back to the
    // match-level mapId while the sim field is still landing. applyArena dedupes
    // + supersedes, so feeding it every patch only rebuilds on an actual change.
    // 🌧️ GH#676 —— 「這一場下不下雨」是 matchSeed 的決定性擲骰（同 seed 同結果，
    // 四個玩家/回放/觀戰一致）。seed 由 MatchRoom.onCreate 寫一次、整場不變；
    // 要在 applyArena **之前**進 store —— 雨在 buildArena 的當下決定建不建。
    // setWeatherMatchSeed 自己去重，20Hz 快照不會造成每秒 20 次 recompute。
    if (state.seed) setWeatherMatchSeed(state.seed);
    const arenaId = resolveArenaId(state as unknown as ArenaIdSource);
    if (arenaId) this.applyArena(arenaId);
    this.warmGroundForNextRound(state.phase);
    const nowMs = performance.now();
    this.connStats.noteSnapshot(nowMs); // snapshot cadence → jitter / gap
    if (state.tick > 0) this.timeSync.noteServerTick(state.tick, nowMs);

    this.teamBySeat.clear();
    state.seats.forEach((ss) => this.teamBySeat.set(ss.seatId, ss.teamId));

    // ORDER MATTERS (L3). `syncHudFromState` is what refreshes
    // `hudStore.localEntityId`, and `refreshVisibleZones` resolves player 0's own
    // duel zone THROUGH that id — so the HUD sync has to run first or the zone
    // set is one snapshot stale across a round boundary (new round = new entity
    // ids). Nothing between here and there reads the HUD store, and the
    // interpolation ingest below never did, so hoisting it changes nothing else.
    syncHudFromState(state, this.conn.accountId);

    // L3 —— 這一份快照裡「我要渲染的」duel zone。必須在 ingest 之前重算：
    // 它就是下面那一行剔除的依據。
    this.refreshVisibleZones(state);
    // 別區的實體連插值緩衝都不進(連同它們的 ring buffer 一起被 prune 掉)。
    // 剔除那一行在 net/zoneVisibility.ts 的 `ingestZonedTransforms` 裡。
    ingestZonedTransforms(state.entities, this.visibleZones, state.tick, this.interp, this.interpSeen);

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
          fx: es.fx,
          fz: es.fz,
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
    // WHAT A FRAME DOES lives in render/frameCap.driveFrame (task #282): the
    // input pump runs on EVERY animation frame, only the draw is fps-capped.
    // 規則本身在 render/frameCap —— 四條 render loop 共用同一份，不再各抄一份。
    this.lastFrameMs = driveFrame(nowMs, this.lastFrameMs, this.renderParams.fpsCap, this.frameWork);
  };

  /**
   * The two halves of a frame, as one stable object (never re-allocated per
   * frame). `pump` is deliberately tiny and render-free — see driveFrame.
   */
  private readonly frameWork: FrameWork = {
    pump: (nowMs: number) => this.pumpInput(nowMs),
    render: (nowMs: number) => this.renderFrame(nowMs),
  };

  /**
   * INPUT SAMPLING + INTENT TRANSMISSION (task #282). Runs on every animation
   * frame, BEFORE the fps gate, because none of it draws anything:
   *
   *   · pad/touch polling is how an analog stick becomes an `Order`/`aim` at all
   *     (mouse/keyboard are event-driven and never needed a frame),
   *   · `intentClock.tick` is what lets each IntentSender actually fire.
   *
   * Capping these at the render rate is what pinned a 30 fps phone to ~15.6
   * intents/second: the sender was ready to send and was simply never asked.
   *
   * ⚠️ 第二段 (#282 L2):`this.intentClock.tick(nowMs)` **不是**
   * `this.sessions.update(nowMs)` 的別名。rAF 只是餵時鐘一個牆上時刻;真正
   * 決定「這一刻要不要送」的是 `input/IntentClock` 的絕對拍點,而拍點的節奏
   * 與這一幀什麼時候到、一秒到幾次都無關。把這一行換回 `sessions.update(nowMs)`
   * 送出率就會掉回量到的 19.6–23.2/s(見 `input/IntentClock.test.ts`)。
   */
  private pumpInput(nowMs: number): void {
    this.sampleInput();
    this.intentClock.tick(nowMs);
  }

  /**
   * 取樣類比輸入 —— 把搖桿的當下位置變成 pending 的 order/aim。純取樣,不送出。
   * rAF 每一幀跑一次(畫面越順,搖桿讀得越新);rAF 停擺時由 IntentClock 的
   * watchdog 代跑,否則那一拍送出去的會是上一拍的舊方向。
   */
  private sampleInput(): void {
    // Clear last frame's pad free-pan latch BEFORE polling: the pad map only
    // re-emits `pan` while the right stick is deflected, so a released stick must
    // leave these null (camera holds) rather than drifting on a stale vector.
    this.padCameraPan.length = 0;
    this.gamepads.poll(); // pads → per-player orders/aim/commands + camera
    if (this.touch) this.touch.poll(); // joystick → move orders + aim state onto touchFrame
  }

  /**
   * 一拍 —— 把 coalesce 好的 intent 送出去。`beatMs` 是**拍點時刻**,不是
   * `performance.now()`:IntentSender 的節流拿它來比,拍子才不會被幀的抖動打散
   * (整個 #282 就是這件事)。
   */
  private transmitIntents(beatMs: number): void {
    // freeze mirrors the server: stop flushing intents so a held move order can't
    // steer the frozen hero (the server ignores them anyway — this keeps the
    // still hero in the front-view shot instead of drifting under prediction).
    if (this.conn.room?.state?.outcomeDecided !== true) {
      this.sessions.update(beatMs); // flush EVERY local player's sender
    }
  }

  private renderFrame(nowMs: number): void {
    const dtMs = this.frameDelta.take(nowMs);

    const state = this.conn.room?.state ?? null;

    // 0) ROUND BOUNDARY CLEANUP (task #16 / #259). 刻意排在 drain **之前**：
    // 邊界那一幀的事件屬於「新的那一側」—— 進 combat 的第一幀帶的是開場特效，
    // 出 combat 的那一幀帶的是收尾事件。先清再 drain，兩邊都不會被自己清掉。
    this.roundVfx.sync(state?.phase ?? "");
    // 🖥️🖥️ GH#612 —— 逐格閃爍的推進與回合清場（⛔ 不留一層淡紅到下一回合）。
    this.tickScreenCues(dtMs, state?.phase ?? "");

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
    // ⭐ GH#370 —— 伺服器正握著這具身體時，**別讓影子往前爬**。
    // 根因不在 sim（伺服器座標 180 tick 反轉 0 次）：`LocalPrediction` 的影子世界
    // 沒有 `abilities` 元件 ⇒ `movementHold` 看不到施法鎖 ⇒ 影子在那 26 個 tick
    // 爬到領先權威 2.14 單位，然後每 50 ms 被 reconcile 拉回 —— 66 次微幅前後
    // 就是那個抽搐，而且**只有施法的那個玩家看得到**。
    const heldByServer = this.predictionHeldByServer(state);

    // 2) advance the interpolation clock (delay is a live network setting)
    const renderTick = this.timeSync.ready
      ? this.timeSync.renderTick(nowMs, this.renderParams.interpolationDelayMs)
      : 0;

    // 3) local prediction: (re)spawn shadow, reconcile, fixed-step
    if (state) this.ensurePredictionEntity(state);
    // 自己英雄的面向來源 (GH#281) —— 決策點，`config.combat-feel@1` 的
    // `facing.localMode`，出貨 `hybrid` = (b) 為主 + (a) 校正。
    const facingMode = localFacingMode();
    if (this.pendingAuth && this.prediction.active) {
      const pa = this.pendingAuth;
      this.pendingAuth = null;
      const authPos: Vec2 = { x: pa.x, z: pa.z };
      // (a) 校正路徑：`predicted` 那一側不交面向，其餘兩側交。
      const authFacing = facingModeSnapsFromAuthority(facingMode)
        ? { x: pa.fx, z: pa.fz }
        : undefined;
      if (pa.zone !== this.prediction.zone || this.prediction.errorTo(authPos) > TELEPORT_EPS) {
        // ⚠️ teleport = 權威把我搬到別的地方（換 zone、或位置差超過 TELEPORT_EPS）。
        // 實際上這就是「新回合重生」那一刻。在此之前這裡**不清** attackOrderTargetId，
        // 而它只在「目標死掉/離開快照」時才被清（:2371）—— 於是上一回合的對手如果是
        // 活著結束回合的（時間到、或他那一邊贏），這個 id 會原樣跨過回合邊界，
        // 新回合一開場影子就朝著一個在別處的人轉身。伺服器那一側是清的
        // （MatchController 的 resetRoundTallies），只有客戶端漏了。
        this.attackOrderTargetId = null;
        this.prediction.teleport(authPos, pa.zone, authFacing);
      } else {
        this.prediction.reconcile(authPos, pa.ackSeq, authFacing);
      }
    }
    // (b) 跟手路徑：把「我正在打的那個東西在哪」餵給影子，讓它站定時自己轉身
    // （否則影子那幾 tick 一行 facing 都不寫，身體凍在最後一次走路方向）。
    // `authoritative` 那一側刻意不裝這條通道 —— 那個模式的定義就是「面向只由
    // 伺服器決定」，裝了就不是那個模式了。
    this.prediction.setCombatFacingTarget(
      facingModePredictsLocally(facingMode) ? this.combatFacingTargetPos(state, renderTick) : null,
    );
    this.advancePrediction(dtMs, frozen || heldByServer);
    // RENDER ALPHA (task #43). The fixed-step loop leaves predAccumMs in
    // [0, TICK_MS): how far the render clock has advanced INTO the tick that
    // has not run yet. That leftover IS the blend factor between the previous
    // and the current tick position. Throwing it away — the old behaviour —
    // renders the local hero at the raw 30 Hz tick, so at 60 fps it jumps a
    // whole tick-step on one frame and stands still on the next (measured 20:1
    // per-frame speed ratio ≈ 13.5 device px of judder every other frame).
    // During the settlement freeze predAccumMs is pinned to 0, so use alpha = 1
    // to hold the hero exactly on the authoritative pose instead of a tick behind.
    // ⚠️ `heldByServer` 也走 alpha = 1：`predAccumMs` 被釘在 0，用它算出來的 alpha 會是 0，
    // 那等於把渲染姿勢固定在**上一個** tick，扣留一結束就跳一格。
    const renderAlpha =
      frozen || heldByServer ? 1 : Math.min(1, Math.max(0, this.predAccumMs / TICK_MS));
    // (Pad/touch polling + the intent flush happened in `pumpInput`, BEFORE the
    // fps gate — task #282. `touchFrame` below is therefore this frame's.)
    // Ground aim/preview telegraph, both platforms (task #152): a live touch
    // drag-aim wins; otherwise a PRESSED-AND-HELD ability button (touch finger or
    // desktop mouse — the ui/abilityHold seam) shows its dashed range + AoE.
    {
      let indicator: AimIndicatorState = this.touch ? touchFrame.indicator : null;
      if (indicator === null) {
        const held = getHeldAimSlot(); // castable slots only — a 天生技 has no cast ring
        if (held !== null) indicator = this.resolveHoldPreview(held);
      }
      // ⭐ GH#519 ——「這一發會打**誰**」。⛔ 這裡不挑目標：手把每幀 publish 它
      // **真的會送出去**的那一個（`GamepadIntent.describeTarget` → `setCursorlessTarget`），
      // 這一行只是把它解成一個環。⇒ 高亮的人與 command 鎖住的人不可能分岔。
      // 放開技能鍵 → 暫存器清空 → 回 null → 環自己收掉；滑鼠/觸控玩家永遠是 null。
      this.aimIndicator.update(
        indicator,
        resolvePadTargetMarker(
          (id) => this.entityPos(id),
          (id) => this.padTargetRelation(id),
        ),
      );
    }

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
          if (e.id === this.predictedEntityId && localPose && e.alive) {
            // GH#281：在此之前這條 return 把權威的 `fx/fz` 連同整個 pose 一起
            // 丟掉，所以自己的英雄從來看不到任何伺服器算出來的面向。規則本身
            // （位置永遠走預測、面向依模式）在 predict/localRenderPose.ts，
            // 那裡守得到；這裡只是接線。
            return localRenderPose(facingMode, localPose, e, this.localAuthPose);
          }
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
        // ⭐ GH#324 —— 視野遮蔽。⚠️ 只在**觀看者自己那一區**真的有牆時才啟用：
        // 既有 6 張圓形場地只有幾根柱子，遮蔽會讓人在柱子後面閃來閃去而不是
        // 「躲起來」—— 那是雜訊不是機制。⇒ 用 `bounds.kind === "rect"` 當判準
        // （產生器出來的圖才有），⛔ 不是寫死地圖 id。
        // ⚠️ GH#421 —— 第二個參數是**這雙眼睛在哪一區**。⛔ 不可以省略成
        // 「第一個矩形 zone」：那是 zone 1 半場遮蔽整個失效的那一行。
        occlude: this.occludeArgs(center, this.ownZoneOf(0, state)),
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
        // L3 ZONE CULL —— 別區的英雄沒有 view，`posOf` 會落到 schema 座標，
        // 於是狀態光環會被畫在一個看不到的地方，而 CC 語音會照樣搶語音檔位。
        // 刻意排在 kind/alive 那一行**之前**：`GameApp.batch1Wiring.test.ts` 的
        // #39 守衛盯的是「kind/alive 檢查緊接著 posOf」這一組相鄰關係，插在
        // 中間會把那條守衛一起打壞 —— 守衛被自己的新功能撞紅，是要改功能的
        // 擺放位置，不是改守衛。
        if (!this.visibleZones.has(es.zone)) return;
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
      // ⭐ owner 2026-08-14：「戰鬥回合開始記得把視角拉回自己操作的英雄，
      //    我剛剛有幾場沒有拉回來」。
      //
      // ⚠️ 「有幾場」是關鍵線索 —— 不是每場都壞，所以不是「功能沒接」，
      //    是**狀態跨回合殘留**：`focusOn`（小地圖左鍵窺視）與邊緣平移都會把
      //    `followLock` 設成 false，而在此之前**只有** Space 與復活（`setDead`）
      //    會把它扣回來。上一回合（或商店裡）看過小地圖一眼，這一回合開打時
      //    鏡頭就還停在那裡。
      // ⭐ 修法是在**進入 combat 的那一個 edge** 重新扣上並跳到自己身上 ——
      //    ⛔ 不是每幀都扣（那會讓玩家整場都不能平移，比原缺陷更糟）。
      if (state) this.relockFollowOnRoundStart(p, rig, state, pos);
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
    // GH#390 —— 循環音的**回收**跑在 flush 之前:到期的那一發在這裡被刪掉並換成
    // 消散音。⛔ 少了這一行,`soundLoop` 會是一個開始了就停不下來的東西(#259)。
    // ⚠️ 這兩行必須在 `update()` 之前:音效層要靠**載入的 audio map** 判斷
    // 「這個 build 供不供應這個 clip」,map 還沒到就會把每一發都判成取不到。
    // 兩個都是等冪賦值,⛔ 沒有 per-frame 配置。
    vfxSoundLayer.setAudioMap(audioSystem.sfxMap);
    vfxSoundLayer.overlayEnabled = fullAssetsEnabled();
    for (const p of vfxLoopPushes(vfxSoundLayer, nowMs, (id) => this.vfxSoundSource(id, localId))) {
      this.sfxQueue.push(p.key, p.source, p.gain, p.loop);
    }
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

    // 5d) ⭐ GH#362 —— 會動的場地打光。owner 2026-08-18：「不是靜態不會變動的光」。
    // ⚠️ 吃的是**絕對秒數**不是 delta：波形是 t 的純函式，所以掉幀 / 分頁切走
    // 回來都不會讓相位漂掉（遞減計數器會，見 sim 的絕對 tick 慣例）。
    // 波形是 `none` 或後台關掉動畫時它自己第一行就 return。
    this.lighting.animate(nowMs / 1000);

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
    // 🖥️🖥️ GH#612 —— 螢幕演出**逐格**派送。⛔ 必須在 `applyCombatFeedback` 之前:
    //    它把這一格的震動排進 `authoredShake[p]`，而那個漏斗在下面第四行收走。
    //    K3 GH#638 —— zone 判準是**逐格**的（觀戰格跟著觀看目標），在 routeScreenCue 裡。
    if (ev.type === "screenFlash" || ev.type === "screenShake") this.routeScreenCue(ev, state);
    // K3 GH#638 —— 另一場地的演出不可外漏（owner：「另外一個場地的聲音、語音、
    // 震動、閃爍等畫面不應該影響到目前場地」）。事件歸得了戶（payload 的 `zone`
    // 或空間表的實體欄位）而那個 zone 不在本地觀看集合 ⇒ 音效／特效音／語音三條
    // 全部丟棄。⭐ `visibleZones` 跟著 #269 的觀戰目標走（⛔ 不是寫死本地），
    // 歸不了戶 = 放行（fail-open：最壞情況是照舊，⛔ 不是資訊不見）。
    const zoneOk =
      !zoneCueIsolationOn() ||
      zoneAllowsCue(cueEventZone(ev.type, ev.data, this.zoneOfEntity), this.visibleZones);
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
    const sfxKey = zoneOk ? combatSfxKey(ev) : null;
    if (sfxKey) {
      // GH#440 —— 連這一條也走政策表。這裡它幾乎總是恆等式（combatSfxKey 的 key
      // 與事件是一對一的），⛔ 但「幾乎」不是守衛：入口只有一個，才不會有第二條路。
      this.sfxQueue.push(
        sfxKey,
        spatialSourceFor(sfxKey, resolveSpatial(ev, this.audioEntityPos, localId, this.audioTeamOf)),
      );
    }
    // GH#390 —— **特效自帶的音效**。四個時機裡的兩個由事件驅動(發射 / 命中),
    // 另外兩個(循環 / 消散)由 `vfxSoundLayer` 自己的登記表在 5b 收掉。
    // ⛔ 它不是 `combatSfxKey` 的一個分支:那一支回的是「這顆事件本身叫什麼」,
    // 而這裡問的是「這一招的**特效**帶了什麼聲音」—— 兩者是不同的軸,同一顆
    // `abilityCast` 兩邊都會出聲(一個是技能身分,一個是特效自己那一份)。
    if (zoneOk) this.pushVfxSound(ev, localId, nowMs);
    // CONTEXTUAL VOICE (client-only cosmetic, owner directive 2026-07-25):
    // event → the champion's own cloned line. Rides audioSystem.playClip inside
    // contextualVoice, so all mixer gates + the per-category throttle apply;
    // heroes without a pack no-op. Never touches sim / world.rng.
    // K3 GH#638 —— 另一場地的語音同樣丟棄（狀態語音走實體迴圈，L3 cull 已經擋掉）。
    if (zoneOk) this.dispatchContextualVoice(ev, localId);
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
    // ⭐ 陣亡投幣被拒 —— 同一句話的最後一個缺口。`coinDropRejected` 逐座位私訊了
    // 很久，而 `eventFanout` 自己的註解逐字寫著「this event currently has NO
    // client consumer」：於是金幣不足時按鈕照亮、照可點、每一次都被 sim 拒掉，
    // 而畫面上**一個字都沒有**。這一行就是那個消費端（ui/coinThrow）。
    // ⚠️ 它讀的是 SEAT 不是 entity（payload 是 `{seatId, reason}`，因為
    // `no-champion` 也是它的一個原因），所以⛔ 不能沿用上面那個 `localId`。
    recordCoinEvent(ev);
    // 連殺 combo (owner 2026-07-27). The COUNT was decided in the sim off
    // world.tick and arrives on this event; this is the one line that carries
    // it to the screen. Gated on the local SEAT inside (the number in the
    // middle of your screen has to be your chain, not a teammate's), so a
    // spectator's or an enemy's sweep is dropped here rather than rendered.
    recordKillComboEvent(ev, nowMs);
    // 殭屍王 (task #262 / GH #190). v0.9.11 fanned `mobBossSpawn`/`mobBossSlain`
    // out to every client and NOTHING read them, so 100 zombie kills produced a
    // monster with no announcement and a ~3,000 gold jump with no explanation.
    // This is the one line that carries both beats to the HUD. NOT seat-gated
    // (unlike the combo above): a king is a WORLD event and the payout sheet
    // belongs to everyone on it — `parseMobBossEvent` records who summoned it
    // and who was paid, and the overlay decides the wording from that.
    if (isMobBossEvent(ev.type)) recordMobBossEvent(ev, nowMs);
    // 【具名標記】(GH#278)。兩顆事件、兩個去處,而且兩個都是「玩家拿不拿得到」
    // 的唯一通道 —— 標記完全不在 MatchState 上。
    //   ① 層數 → HUD（自己那一列;`recordMarkEvent` 內部用 localEntityId 過濾）
    //   ② 免死那一刻 → 身上的浮動文字（名字查文件,不是裸 id,見 #202）
    if (isMarkEvent(ev.type)) {
      recordMarkEvent(ev, localId, nowMs);
      if (ev.type === "lethalSaved") this.pushMarkSaveFloat(ev, nowMs);
    }
    // victory-settlement scoreboard (arrives once at matchEnd) → settlement UI.
    // #193: the per-team elimination snapshot (TEAM_SETTLEMENT_EVENT) rides the
    // SAME record path so a knocked-out player's leave-flow already holds their
    // card; the final matchEnd payload overwrites it with the decided board.
    if (ev.type === SETTLEMENT_EVENT || ev.type === TEAM_SETTLEMENT_EVENT) {
      recordSettlement(ev.data as unknown as MatchSettlement);
    }
  }

  /**
   * 一次免死攔截 → 被救的那具身上的浮動文字（GH#278）。
   *
   * ⚠️ 位置從**渲染出來的身體**拿（`audioEntityPos` = `views.posOf` 退回
   * schema），不是從事件裡拿：`lethalSaved` 沒有帶 x/z，因為救活的當下那具身體
   * 一定還活著（免死的定義就是它沒死），跟 `coinPickedUp` 必須自帶座標的情況
   * 相反。查不到位置就不畫 —— 一行飄在原點的字比沒有字更糟。
   */
  private pushMarkSaveFloat(ev: EventMessage, nowMs: number): void {
    const id = Number(ev.data.id);
    const markId = ev.data.markId;
    const remaining = ev.data.remaining;
    if (!Number.isFinite(id) || typeof markId !== "string" || typeof remaining !== "number") return;
    const pos = this.audioEntityPos(id);
    if (!pos) return;
    pushMarkSaveText({
      target: id,
      label: markSaveText(markId, remaining),
      worldX: pos.x,
      worldZ: pos.z,
      nowMs,
    });
  }

  /** Feed the adaptive manager the frame COST and publish perf stats. */
  private samplePerf(nowMs: number, dtMs: number, workMs: number): void {
    // GH#271 —— 這一幀真的畫出去了,所以它的**間隔**進幀率計。
    // ⚠️ `dtMs`(間隔)與 `workMs`(成本)是兩件事,而這一行以前不存在:fps 欄位
    // 全部由下面那個 adaptive 視窗(裝的是 workMs)供應,於是 60 fps 上限之下
    // 一顆 4.4 ms 的幀在 pill 上寫成「228 fps」。見 render/fpsMeter.ts 檔頭。
    this.frameRate.sample(dtMs);

    // ⭐ 階梯吃的是**整幀**成本,⛔ 不是 rAF 自己頭尾相減的 workMs
    //（見 render/AdaptiveQuality.ts 檔頭)。只讀 workMs 的時候,瀏覽器合成 /
    // reflow / GC / shader 編譯 / React reconcile 這一段**再大階梯也不會降**,
    // 而那正是「fps 儀表很好看卻很卡」的形狀。
    // ⚠️ `feed.work` 是**誠實的 workMs 視窗**,與階梯的視窗刻意分開 ——
    // `perfBus.workMs` / `capabilityFps` 回答的是「這台機器畫得動幾張」,
    // 而 perf/diag.ts 的 `unaccountedMs` 是拿它相減出來的。
    const feed = feedAdaptiveFrame(workMs, dtMs, this.renderParams.fpsCap);
    // May recompute renderParams synchronously (via the qualityController
    // subscription), so `this.renderParams` is read AFTER this line.
    qualityController.sample(feed.costMs, nowMs);
    const stats = feed.work;
    const p = this.renderParams;
    const cs = this.connStats.sample(nowMs);
    const rstats = this.renderer.stats();

    // fps / avgFps / minFps / capabilityFps / fpsCap 一起寫,住在 FrameRateMeter
    // ——那是唯一可以被守衛打到的地方(samplePerf 本身在測試裡建構不出來)。
    this.frameRate.publish(perfBus, stats, p.fpsCap);
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
    // ⭐ 誠實的名字（見 perfBus.ts）：這兩個是**場景上有幾個**,⛔ 不是
    // 「畫了幾次」也⛔ 不是「幾顆粒子」。舊名字 drawCount / particleCount
    // 現在是同一個數字的 getter,所以⛔ 不可能有第二份會漂走的副本。
    perfBus.sceneMeshes = rstats.meshes;
    perfBus.particleSystems = rstats.particleSystems;
  }

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
    // 隱形原語 —— the VIEWER's team, read once per frame from the same store and
    // for the same client-08 reason as `localId` above. It is the SEAT's team,
    // not the entity's: a dead or spectating player still has a seat and must
    // keep seeing his own team's hidden bodies (`localEntityId` is null then, so
    // an entity-derived team would silently turn every teammate into an enemy
    // the moment you died). null = no seat at all → everyone reads as an enemy,
    // which is the conservative answer for a pure observer.
    const localSeat = hudStore.getState().localSeatId;
    const localTeam = localSeat === null ? null : (this.teamBySeat.get(localSeat) ?? null);
    // GH#192 — re-parse the 殭屍外觀 table when (and only when) it changes.
    // HERE and not in `ensurePredictionEntity`, where the combat-env table is
    // refreshed: that method early-returns for a spectating/dead player with no
    // local entity, and a spectator still has to see the zombies painted right.
    if (state.mobVisualJson !== this.mobVisualJson) {
      this.mobVisualJson = state.mobVisualJson;
      this.mobVisual = parseMobVisualJson(state.mobVisualJson);
      // GH#268 —— 同一張表的另外五格（開關/寬/高/離頭頂/門檻）。逐欄位降級,
      // 所以跑在舊 shard 前面的客戶端拿到的是出貨值,不是一張歸零的表。
      this.mobBarCfg = mobHealthBarConfigFrom(this.mobVisual);
    }
    let i = 0;
    state.entities.forEach((es) => {
      // L3 ZONE CULL —— 別區的實體不建 view、不做插值取樣、不掛環境特效、
      // 不產生遠端腳步聲。`visibleZones` 由 `refreshVisibleZones` 在每一份
      // 快照重算，並且跟著 #269 的觀戰目標走(不是寫死本地 zone)。
      if (!this.visibleZones.has(es.zone)) return;
      let e = this.entityPool[i];
      if (!e) {
        e = { id: 0, kind: 0, seatId: 0, key: "", teamId: 0, x: 0, z: 0, fx: 0, fz: 0, alive: false, flags: 0, h: 0, airborne: false, isLocal: false };
        this.entityPool[i] = e;
      }
      e.id = es.id;
      e.kind = es.kind;
      e.seatId = es.seatId;
      e.key = es.key;
      // ⭐ [陣營轉換]（[EX∅ 根源]）—— **全客戶端 `teamId` 的唯一擴散點**。
      // 隊伍色、小地圖圖示、#85 死亡觀戰的去飽和三個都是從這裡分出去的，所以
      // 覆寫下在這一行就是三個地方一起對；下在任何一個消費端都會漏掉另外兩個。
      //
      // ⛔ 覆寫**贏過** `teamBySeat`：`seatId` 刻意不變（英雄名字/血條/技能欄
      // 全靠它），所以座位表回答的是「他原本屬於誰」，而畫面要畫的是「他現在
      // 替誰打」。⚠️ 小怪的 `seatId` 是 -1，`teamBySeat` 對它一律回 undefined
      // → 0，這一行是它們**唯一**拿得到隊伍色的途徑。
      const teamOverride = teamOverrideFromFlags(es.flags);
      e.teamId = teamOverride ?? this.teamBySeat.get(es.seatId) ?? 0;
      e.x = es.x;
      e.z = es.z;
      e.fx = es.fx;
      e.fz = es.fz;
      e.alive = es.alive;
      // #268 — 「自己角色更顯眼」. Champions only (kind 0): a projectile or a
      // dropped coin has no owner to BE, and a stale true on a pooled slot that
      // got reused by another kind would put a caret over a flying bolt.
      e.isLocal = es.kind === 0 && localId !== null && es.id === localId;
      // 隱形原語 —— 「這具身體跟我同隊嗎」. Resolved HERE for the same reason
      // `isLocal` is: the entity → local-team hop needs the HUD store that
      // render/** is walled off from (client-08). Champions only; a projectile
      // or a coin has no team to share, and a stale `true` on a pooled slot
      // reused by another kind would leave an enemy's hidden body半透明可見.
      // ⚠️ 同一個覆寫要**同時**用在這裡：一具被我方捕獲的身體既然畫成我方顏色，
      // 隱形/去飽和那一族的「同隊嗎」就必須給同一個答案，⛔ 否則畫面上會出現
      // 「我方顏色但被當成敵人淡出」這種沒有人能歸因的組合。
      e.friendly =
        es.kind === 0 &&
        localTeam !== null &&
        (teamOverride ?? this.teamBySeat.get(es.seatId) ?? -1) === localTeam;
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
      // GH#192 — a MOB's 體型倍率 rides the free `mana` slot (protocol
      // ENTITY_KIND MOB). Decoded here, next to the revive circle's packing, so
      // render/** never has to know about the slot reuse. Cleared for every
      // other kind: a pooled slot reused by a champion must not carry a
      // 10× scale over from the king that had this array index last frame.
      e.mobScale = es.kind === KIND_MOB ? es.mana : undefined;
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
      // 暗夜旗 (kind 7, 71-00 暗夜契約) reuses `shield` for the POST-abilityRange
      // aura radius and `mana` for the owning team — protocol ENTITY_KIND
      // .NIGHT_FLAG. Decoded here beside the revive circle's packing for the
      // same reason: render/** must never have to know about slot reuse. And
      // cleared for every other kind, because a pooled scratch slot reused by a
      // champion next frame must not carry a stale ring radius.
      if (es.kind === KIND_NIGHT_FLAG) {
        const nf = e.nightFlag ?? (e.nightFlag = { radius: 0, teamId: -1 });
        nf.radius = es.shield;
        nf.teamId = es.mana;
      } else if (e.nightFlag) {
        e.nightFlag = undefined;
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
      // ⭐ GH#539 —— 常駐特效（`ability@1.persistentVfx`）。原作的粉紫魔法陣
      // (`MidchilderNanohaAura.mdx`) 掛在 `"origin"` 而**從來沒有 DestroyEffect**,
      // 所以它與 ambient 綁定是同一件事:活著就播、死了就收。⛔ 少了這一行,
      // `persistentVfx` 是一格填了沒人讀的欄位（失敗形態③:整條可以刪掉而測試全綠）。
      this.ambient.attach(e.id, modelKey, view.root, this.persistentVfxFor(e.key, e.seatId));
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
   * 一位英雄現在該掛著的**常駐特效** vfx id（GH#539）。
   *
   * ⚠️ 今天只解析 `when` **缺席**的那一批 —— 那等於原作的
   * `GetUnitAbilityLevel(u, id) > 0`（「這支技能在身上就掛著」）。帶條件的那些需要
   * `SimWorld` 才求得了值(條件葉住在 sim 那一側),⛔ 而我不在這裡重寫一份會跟 sim
   * 漂開的求值器（那正是第二守則失敗形態⑤:被測的不是出貨的那個）。
   * ⭐ 閘在 `persistentVfxClientCoverage.test.ts`:出貨內容一旦出現客戶端求不了值的
   * `when`,它就紅 —— ⛔ 不是靜靜不掛（那會讓「條件沒成立」與「引擎不支援」長得一樣）。
   *
   * ⭐ GH#603 —— 「`when` 缺席」**不是恆真**：它逐字是
   * `GetUnitAbilityLevel(u,id) > 0`（「這支技能**學到了沒**」）。整段判斷住在
   * `render/views/persistentVfx.ts::persistentVfxKeysFor`（純函式、守衛讀得到出貨內容），
   * ⛔ 這裡只負責把兩個注入點接上：註冊表與**這位英雄的 seat**。
   */
  private persistentVfxFor(
    championKey: string,
    seatId?: number,
  ): readonly string[] | undefined {
    const doc = Champions.tryGet(championKey as never) as unknown;
    if (!doc) return undefined;
    // ⚠️ 小怪的 `seatId` 是 -1 ⇒ 找不到 seat ⇒ `null` ⇒ 只有天生技那一格會掛。
    const seat =
      seatId === undefined ? undefined : hudStore.getState().seats.find((s) => s.seatId === seatId);
    return persistentVfxKeysFor(
      doc,
      (id) => Abilities.tryGet(id as never) as unknown,
      seat ? { abilityRanks: seat.abilityRanks, exRank: seat.exRank } : null,
    );
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

  /**
   * GH#390 —— 一顆事件帶來的**特效自帶音效**（發射 / 命中兩個時機）。
   *
   * ⚠️ 它與上面那一行 `combatSfxKey` 是**不同的軸**，⛔ 不是它的一個分支：
   * `combatSfxKey` 回答「這顆事件叫什麼」（一顆事件一發聲音），這裡回答
   * 「這一招的**特效**自己帶了什麼聲音」。同一顆 `abilityCast` 兩邊都會出聲，
   * 而那正是原作的樣子（技能身分音 + 特效自己那一份）。
   *
   * 循環 / 消散**不在這裡** —— 它們沒有對應的事件，由 `vfxSoundLayer` 自己的
   * 登記表在 `renderFrame` 的 5b 收掉（含回收，見 #259）。
   */
  private pushVfxSound(ev: EventMessage, localId: number | null, nowMs: number): void {
    // ⭐ GH#440 —— 決定「播什麼 / 放在哪」的是 `audio/vfxSound.vfxSoundCues`，
    // ⛔ 不是這裡。那一支會把每一發交給**空間音場政策表**（`spatialSourceFor`），
    // 而這一段以前是把 `resolveSpatial(ev)`（按**事件型別**算的位置）無條件當成
    // 特效音的位置 —— 於是 `fireRingLoop` 這種宣告過 flat 的 key 被跟著施法者 pan。
    for (const p of vfxSoundCues(
      vfxSoundLayer,
      ev,
      resolveSpatial(ev, this.audioEntityPos, localId, this.audioTeamOf),
      nowMs,
    )) {
      this.sfxQueue.push(p.key, p.source, p.gain, p.loop);
    }
  }

  /** 循環音的空間來源 —— 施法者的**渲染位置**，拿不到就置中（⛔ 不是丟掉）。 */
  private vfxSoundSource(entityId: number | undefined, localId: number | null): SpatialSource | null {
    if (entityId === undefined) return null;
    const pos = this.audioEntityPos(entityId);
    if (!pos) return null;
    return {
      x: pos.x,
      z: pos.z,
      cls: "texture",
      relation: entityId === localId ? "self" : "third",
    };
  }

  private readonly audioEntityPos = (id: number): { x: number; z: number } | null =>
    this.views.posOf(id) ?? this.schemaPos(id);

  /**
   * K3 GH#638 —— 這個實體現在站在哪個 duel zone。歸不了戶（實體已消失／zone
   * 是負數）= null = 放行，與 `VisibleZones` 同一個安全的失效方向。
   */
  private readonly zoneOfEntity = (id: number): number | null => {
    const es = this.conn.room?.state.entities.get(String(id));
    return es && Number.isInteger(es.zone) && es.zone >= 0 ? es.zone : null;
  };

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
    // ⭐ `immune`（無敵 / 型別連擊免疫）走**同一個分支**：從玩家的角度這兩件事
    // 一模一樣（「那一發沒有讓我掉血」），而語音與「這算戰鬥活動」的判定也一樣。
    // ⛔ 不要為它另開一段 —— 兩段會分岔，而分岔的那一天只有其中一種會發聲。
    if (ev.type === "evade" || ev.type === "immune") {
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
    // ⭐ GH#441 —— `knockdown` 的觸發點。語音包 51 位英雄都有這一格，而在這之前
    // **沒有任何地方叫它**（政策表自己寫著 `dispatched: false`）。事件本來就在線上
    // （`EVENT_SPATIAL.knockdown` + `FANNED_OUT_EVENT_TYPES`），說話的是**被放倒的
    // 那一個**，⛔ 不是把他放倒的人。
    if (ev.type === "knockdown") {
      const floored = Number(d.target);
      if (Number.isFinite(floored)) {
        this.queueVoiceCandidate(
          plainVoiceCandidate({
            champId: this.championIdForEntity(floored),
            category: "knockdown",
            speaker: floored,
            counterpart: typeof d.source === "number" ? d.source : null,
            localId,
            teamOf: this.audioTeamOf,
            ...this.voiceWhere(floored),
          }),
        );
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
        // GH#441 —— 類別交給政策表（`VOICE_CATEGORY_POLICY`）。少了它，那份表
        // 全 repo 沒有任何出貨呼叫端（失敗形態③）。
        category: c.category,
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
    // ⭐ GH#441 —— `jump` 的觸發點。#247 的 leap 在飛的那一刻就是 AIRBORNE 的上升緣，
    // 而這一格語音在這之前**沒有任何地方叫它**。它屬於一具身體 ⇒ 政策 world。
    if (rose & ENTITY_FLAG.AIRBORNE) cc("jump");
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
  /**
   * ⭐ GH#549 —— 作者寫的 `screenShake` 的暫存格。
   *
   * ⚠️ 只留**一發**（取最大）：一次施法可能同時發好幾個 cue，而相機只有一個。
   * ⛔ 不排隊 —— 一個遲到的震動比沒有更糟（它會在事情結束之後才抖）。
   */
  /**
   * ⭐ GH#612 —— **一格一發**（⛔ 不是全域一發）。
   *
   * ⛔ 在此之前這是一個純量,而它與「震動只進 `viewports.primary`」是同一個缺陷的
   * 兩半:一發指名沙發玩家 2 的震動,不只走錯了格子 —— 它會在**第一格**抖起來,
   * 而第一格的玩家沒有被打到。
   */
  private readonly authoredShake: ({ amp: number; durationMs: number } | null)[] = [];

  private queueAuthoredShake(player: number, amp: number, durationMs: number): void {
    if (!(amp > 0) || !(durationMs > 0)) return;
    const p = Math.max(0, Math.min(player | 0, this.viewports.count - 1));
    const cur = this.authoredShake[p];
    if (!cur || amp > cur.amp) this.authoredShake[p] = { amp, durationMs };
  }

  private drainAuthoredShake(player: number): { amp: number; durationMs: number } | null {
    const s = this.authoredShake[player] ?? null;
    this.authoredShake[player] = null;
    return s;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  🖥️🖥️ GH#612 —— 分割畫面的螢幕演出（閃爍 + 震動），**每一格各自解算**
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 逐格 overlay 與逐格 sink 的組裝點。
   *
   * ⚠️ ⭐ **為什麼 `contain: paint`**：`ScreenFxLayer` 的 overlay 是
   * `position:fixed; inset:0`（那是對的 —— 單畫面時它就該是整個螢幕）。
   * `contain:paint` 讓這一格的容器成為 fixed 子孫的**包含塊**並夾住溢出，
   * ⇒ 同一個圖層類別在分割畫面下只畫**自己那一格**，⛔ 不必抄一份合成邏輯。
   *
   * ⚠️ 上界（`config.screen-fx@1`）在**載入時**解析一次（第〇·四守則），
   * ⛔ 不是每一發特效都去查一次登錄表 —— 與 `VfxSystem` 同一份政策。
   */
  private installScreenCues(playerCount: number): void {
    const limits = screenCuePolicyFromContent().limits;
    const doc = typeof document !== "undefined" ? document : null;
    if (doc) {
      const host = doc.createElement("div");
      host.className = "ggd-screen-cues";
      host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60";
      doc.body.appendChild(host);
      this.cueHost = host;
    }
    const rects = cssRects(playerCount);
    for (let p = 0; p < rects.length; p++) {
      const r = rects[p]!;
      let cell: HTMLDivElement | null = null;
      if (doc && this.cueHost) {
        cell = doc.createElement("div");
        cell.style.cssText =
          `position:absolute;left:${r.left}%;top:${r.top}%;width:${r.w}%;height:${r.h}%;` +
          // ⛔ 兩個都要:`contain:paint` 是主力,`transform` 是它落地前的舊瀏覽器保險
          //    —— 兩者都會建立 fixed 子孫的包含塊。
          "overflow:hidden;pointer-events:none;contain:paint;transform:translateZ(0)";
        this.cueHost.appendChild(cell);
      }
      const layer = new ScreenFxLayer({
        host: cell,
        limits,
        // ⭐ 震動走**這一格自己的**相機,⛔ 不是 `viewports.primary`。
        //    它仍然匯進 `applyCombatFeedback` 的單一漏斗（人群預算 + 防震兩下）。
        addShake: (amp, ms) => this.queueAuthoredShake(p, amp, ms),
      });
      this.cueLayers.push(layer);
    }
    // ⭐ 裝上之後,全螢幕那一層就沒有觀眾了（`screenCueIsForViewer` 一律 false）。
    //    ⛔ 少了這一行 = 同一發演出出現兩次(全螢幕一次 + 這一格一次)。
    installSplitScreenCueRouter(this.cueLayers.length > 0);
  }

  /**
   * 每一格**現在的主角** —— 沒有主角的那一格是 `null`（還在選人／已離席）。
   *
   * ⚠️ 逐格解析與 `burnTintFrame` / `updateSpectatorCam` 用的是同一條規則
   *（player 0 走 HUD store，其餘走 `localPlayers`），⛔ 不是第二份座位真相。
   */
  private screenCueViewers(): (number | null)[] {
    const out: (number | null)[] = [];
    for (let p = 0; p < this.cueLayers.length; p++) {
      out.push(p === 0 ? hudStore.getState().localEntityId : (this.playerView(p)?.entityId ?? null));
    }
    return out;
  }

  /**
   * 一發 `screenFlash` / `screenShake` → 逐格派送。
   *
   * ⛔ 派送迴圈本身住 `render/screenFx.ts`（`dispatchScreenCue`）——
   * GameApp 在測試裡建構不出來,寫在這裡的決策沒有守衛（見這個檔案 #223 那一段）。
   */
  private routeScreenCue(ev: EventMessage, state: MatchState | null): void {
    if (this.cueLayers.length === 0) return;
    dispatchScreenCue(
      ev.type as "screenFlash" | "screenShake",
      ev.data as unknown as { broadcast: boolean; subjects: readonly number[] } & Record<string, unknown>,
      this.screenCueViewers(),
      this.cueLayers,
      // 開關關掉 ⇒ 不傳 viewerZones ＝ 舊行為（#638 之前，跨 zone 全放行）。
      zoneCueIsolationOn() ? this.screenCueViewerZones(state) : undefined,
    );
  }

  /**
   * K3 GH#638 —— 每一格**正在觀看**的 zone：#269 觀戰把鏡頭送去的那一區優先
   * （⭐ 觀戰模式 = 跟著觀看的 zone，⛔ 不是寫死本地），沒在觀戰才是自己英雄
   * 站的那一區。算不出來（還沒選角／快照未到）= null = 放行。
   */
  private screenCueViewerZones(state: MatchState | null): (number | null)[] {
    const out: (number | null)[] = [];
    for (let p = 0; p < this.cueLayers.length; p++) {
      out.push(this.spectateZoneByPlayer.get(p) ?? (state ? this.ownZoneOf(p, state) : null));
    }
    return out;
  }

  /** 每幀推進每一格的閃爍；換 phase 就把殘留收乾淨（⛔ 不留一層淡紅到下一回合）。 */
  private tickScreenCues(dtMs: number, phase: string): void {
    if (phase !== this.cuePhase) {
      this.cuePhase = phase;
      for (const l of this.cueLayers) l.resetForRound();
    }
    for (const l of this.cueLayers) l.tick(dtMs);
  }

  private applyCombatFeedback(ev: EventMessage, localId: number | null, nowMs: number): void {
    const reaction = planCameraReaction(ev, {
      localId,
      scale: this.shakeScale,
      crowdIndex: this.frameKicks,
      batchProfiled: this.batchProfiled,
      sinceExPunchMs: nowMs - this.lastExPunchMs,
      tickMs: TICK_MS,
    });
    // ⭐ GH#549 —— 作者寫的 `screenShake` 先排進佇列,在**這裡**與命中反應合流:
    //    取兩者較大的那一發（⛔ 不是各震一次 —— 那正是這條線在防的「震兩下」）。
    // ⭐ GH#612 —— 每一格各自收自己的那一發：第一格與命中反應合流（取較大的一發），
    //    其餘各格照它自己的 cue 抖。⛔ 全部倒進 `viewports.primary` 是舊行為。
    const omni = (a: { amp: number; durationMs: number }) =>
      // ⚠️ 作者寫的 cue **沒有方向**（它是螢幕層的提示，⛔ 不是某一次命中的反衝）
      //    ⇒ `dir: undefined` ⇒ `CameraRig` 走 omni（全向抖）那一條路。
      ({ amp: a.amp, durationMs: a.durationMs, dir: undefined, style: "omni" as const, kick: 0 });
    const authored = this.drainAuthoredShake(0);
    const kick =
      reaction.kick && (!authored || reaction.kick.amp >= authored.amp)
        ? reaction.kick
        : authored
          ? omni(authored)
          : null;
    // ⛔ **只能有一個 `.addShake(` 呼叫點**（`combatCameraWiring.test.ts` 在守，
    //    防「同一次命中震兩下」）⇒ 逐格的那幾發也走這一個迴圈。
    for (let p = 0; p < Math.max(1, this.viewports.count); p++) {
      const cue = p === 0 ? null : this.drainAuthoredShake(p);
      const k = p === 0 ? kick : cue ? omni(cue) : null;
      if (!k) continue;
      // crowd budget 是**第一格**的概念（planCameraReaction 只替 player 0 排隊）
      if (p === 0) this.frameKicks++;
      const cameraRig = this.viewports.rigFor(p);
      cameraRig.addShake(k.amp, k.durationMs, { dir: k.dir, style: k.style, kick: k.kick });
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

  /**
   * GH#281 (b) 跟手路徑 —— 「我這一刻正在打的那個東西」在哪，或 null。
   *
   * 讀的是**畫面上**的位置（`interp.sample`，也就是遠端實體真正被畫在哪），
   * 而不是快照的原始座標：身體要轉向的是玩家看得到的那個目標，不是一個
   * INTERP_DELAY_MS 之後才會被畫出來的位置。取樣不到才退回快照座標。
   *
   * 目標死了 / 離開快照 → 連同記憶中的 id 一起清掉，否則身體會一直朝著一具已經
   * 消失的屍體（或它最後停下來的地方）站著。
   */
  private combatFacingTargetPos(state: MatchState | null, renderTick: number): Vec2 | null {
    const id = this.attackOrderTargetId;
    if (id === null || !state) return null;
    const es = state.entities.get(String(id));
    if (!es || !es.alive) {
      this.attackOrderTargetId = null;
      return null;
    }
    const p = this.interp.sample(id, renderTick);
    return p ? { x: p.x, z: p.z } : { x: es.x, z: es.z };
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

    // ⭐ GH#415 —— AoE 圈的圓心是**落點**，⛔ 不是施法者。
    // owner 2026-08-19:「技能範圍指示應該是在我的滑鼠上，⛔ 不是以英雄自身座標
    // 為圓心（施法距離才是）」。
    //
    // ⚠️ 圓心走 `resolveAoeCenter`，而那支是從 `resolveCastTarget` 推導的 ——
    // 也就是**跟送出去的指令用同一個夾取**。⛔ 不在這裡自己寫一次
    // `clampLen(..., range)`：兩份夾取遲早會分岔，而分岔的樣子是「指示圈畫在 A、
    // 技能落在 B」，兩邊看起來都對（失敗形態⑤）。
    //
    // ⚠️ 餵給它的 `range` 是**乘過 `abilityRange` 的**那一個，因為畫在地上的圈
    // 就是玩家真的打得到的距離；餵卡面值會讓夾取比實際射程寬 25%。
    const cursor = this.input.cursor;
    const ground = cursor.inside ? this.cameraRig.screenToGround(cursor.x, cursor.y) : null;
    const cursorGround = ground ?? self;
    const aoeAt = resolveAoeCenter(
      { castType: ability.castType, range },
      { selfPos: self, cursorGround, hoveredEntityId: this.pickEnemyAt(cursorGround) },
      (id) => this.entityPos(id),
    );
    return {
      kind: "range",
      x: self.x,
      z: self.z,
      range,
      radius,
      aoeX: aoeAt?.x ?? null,
      aoeZ: aoeAt?.z ?? null,
    };
  }

  /**
   * 一個實體現在在哪（`targeted` 的 AoE 圓心用）。
   * ⚠️ 查不到 → null，⛔ 不退回施法者腳下 —— 那正是 GH#415 在修的那個謊。
   * ⭐ 讀的是**權威狀態**（同 `pickSelfAt`），⛔ 不是渲染插值：圓心要對得上
   *   伺服器會拿來結算的那個位置。
   */
  private entityPos(id: number): Vec2 | null {
    const e = this.conn.room?.state.entities.get(String(id));
    return e ? { x: e.x, z: e.z } : null;
  }

  /**
   * 手把軟鎖定目標對本地玩家是敵/友/自己（GH#519）—— 決定那個環的**顏色**。
   *
   * ⭐ 走的是 `teamOfEntity`，跟 `footstepRelation` / `VfxSystem.relationOf` 同一個
   * 原始資料，⛔ 不是第二份隊伍判定。
   * ⚠️ 隊伍還沒接上時回 `"unknown"`，而 `telegraphChannel` 刻意把 unknown 畫成
   * **敵方**通道 —— 把一個還不知道是誰的目標畫成友善的，比畫成危險的貴得多。
   */
  private padTargetRelation(id: number): TelegraphRelation {
    const localId = hudStore.getState().localEntityId;
    if (localId === null) return "unknown";
    if (id === localId) return "self";
    const mine = this.teamOfEntity(localId);
    const theirs = this.teamOfEntity(id);
    if (mine === null || theirs === null) return "unknown";
    return mine === theirs ? "ally" : "enemy";
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
      // ZONE CULL — the FIFTH consumption point (the other four are
      // onStatePatch / collectEntities / renderFrame / updateFrameBus).
      // Without it this list carries the other duel zone's champions and its
      // guardian, i.e. units the player cannot see: they have no view, so
      // `posOf` below misses and the raw snapshot x/z is used instead. That
      // makes them silently targetable by the GAMEPAD aim assist
      // (`pickNearestUnit`, GameApp.ts ~815) and by touch auto-acquire. The
      // 80u zone separation makes it hard to reach today, but "hard to reach"
      // is a geometry accident, not an invariant — the invariant is that
      // nothing the player cannot see is a target. Also strictly less work per
      // pick.
      if (!this.visibleZones.has(es.zone)) return;
      // Champions AND the neutral objectives (harvest flower, guardian tower)
      // are attackable targets the sim already accepts orders against — a human
      // must be able to click / attack-move / auto-acquire them too, not just
      // bots via direct AI orders. Neutrals carry seatId -1, so the team filter
      // below resolves to -1 and never matches myTeam (they read as "enemy").
      // ── 🔴 GH#315：小怪（殭屍）以前**不在這張清單裡** ──────────────────────
      // owner 2026-08-11 線上實測：「我無法點選敵方單位攻擊，然後固定會一直攻擊」。
      // 根因就在這一行：#215 的殭屍波是在這個過濾器之後才上架的，而這裡只列了
      // 英雄／守衛塔／花。第 3 回合起場上最多 60 隻殭屍，**一隻都點不到**。
      //
      // ⭐ 而且三條輸入路徑共用這一份清單 —— 滑鼠右鍵（pickEnemyAt）、
      //    手把瞄準輔助與觸控自動取得（pickNearestUnit，GameApp ~911）——
      //    所以「點不到」不是滑鼠的問題，是**任何裝置都指不到殭屍**。
      //
      // 第二個症狀是同一個根因的另一面：指不到 → `attackTarget` 永遠發不出去 →
      // 目標只能由 `autoAcquirePass` 決定，而它有 leash/swap 遲滯而且比較器的
      // key 是「血量低的優先」，於是它鎖住一隻就不放 —— 玩家看到的正是
      // 「固定會一直攻擊」，而且身上不會有嘲諷/混亂/暴走，因為根本沒有狀態介入。
      if (
        (es.kind !== KIND_CHAMPION &&
          es.kind !== KIND_GUARDIAN &&
          es.kind !== KIND_FLOWER &&
          es.kind !== KIND_MOB) ||
        !es.alive
      )
        return;
      if ((this.teamBySeat.get(es.seatId) ?? -1) === myTeam) return;
      const pos = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
      // `priority: 1` = 只在**自動**索敵（手把/觸控）裡讓路給英雄，滑鼠直接點
      // 不讀它（見 Picking.ts 的 PickableUnit.priority）。少了這一格，一堆貼臉
      // 的殭屍會把手把的瞄準從敵方英雄身上搶走 —— 那是把一個缺陷換成另一個。
      units.push({
        id: es.id,
        x: pos.x,
        z: pos.z,
        radius: 0.6,
        priority: es.kind === KIND_MOB ? 1 : 0,
      });
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
   * doc's own facing correction — for the intermission market to stand at the merchant's counter.
   * Goes through the SAME `modelDocFor` seam the arena's ChampionView uses, so
   * an equipped skin and the dev-only Blizzard overlay both apply, and the hero
   * you shop with is the hero you fight with. Null before champ-select
   * confirms or while the content DB is still loading — the market then simply
   * shows no hero rather than a placeholder.
   */
  private localChampionModel(): {
    glbPath: string;
    scale: number;
    yawOffsetDeg?: number;
    relativeScale?: number;
    hiddenPrimitives?: readonly number[];
  } | null {
    const hud = hudStore.getState();
    const seat = hud.seats.find((s) => s.seatId === hud.localSeatId);
    if (!seat?.championId) return null;
    const def = Champions.tryGet(seat.championId as ChampionId);
    if (!def) return null;
    const doc = this.modelDocFor(def.modelKey, seat.seatId);
    if (!doc) return null;
    // GH#368 —— 尺寸倍率跟著模型一起送出去。市場攤位以前只拿到 glbPath + doc.scale，
    // 而 doc.scale **不是尺寸**（overlay 文件一律是 1），所以「跟你並肩作戰的那一隻」
    // 走進補給站就換了一個大小。⚠️ 讀 `seat.championId` 而不是形態感知的那條縫是
    // 刻意的：補給站是回合之間的畫面，下一回合一律以基本型重生，而且 `bodyChampionIdFor`
    // 需要一個 EntityViewState —— 這裡沒有 entity，只有座位。
    const override = this.contentDb.modelOverrideFor(seat.championId);
    return {
      glbPath: doc.glbPath,
      scale: doc.scale,
      yawOffsetDeg: doc.yawOffsetDeg,
      relativeScale: bodyRelativeScale(doc.glbPath, override),
      // GH#368 —— 血泥宣告也一起送。攤位讀不到它的話，16 隻 overlay 英雄會拖著
      // 一片屍體站在櫃台前（而且那片屍體會把他墊高）。
      hiddenPrimitives: doc.hiddenPrimitives,
    };
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
      // The whole winning TEAM (owner 2026-07-27: 「勝利的時候應該秀隊伍三人的模組」),
      // ordered by 存活順序 with 金/銀/銅 crowns (GH#257, owner:「只顯示最後活下來
      // 順序的三位」). WHO stands where, WHICH models get dropped when a doc has not
      // loaded, and WHOSE taunt plays all live in `planRoundWinnerShow`
      // (render/RoundWinnerStage) — a pure function, so `roundWinnerPlan.test.ts`
      // can drive the real hudStore → real stage path headlessly. Inlining it back
      // here is what let the whole podium be deleted with 1292 tests still green.
      //
      // GH#265 —— **哪一隊上台不推導,讀伺服器記下的那一格。** `hud.duels` 是
      // `MatchState.duels` 的投影,`localDuelZone` 是「我這一場在哪一區」的**唯一**
      // 定義(音效閘與殭屍王橫幅讀的也是它)。之前這裡只交出 seats/teams,於是
      // 頒獎台自己再猜一次「誰贏」,而 4 隊 2 區時兩隊都是 WON,它挑的是戰績最好
      // 的那一隊 —— owner 2026-08-03:「為什麼我最後活著 勝利的還是顯示別的隊伍」。
      //
      // ⚠️ **「演哪一區」是一個決策點,不是一個常數**(第一守則)。#269 的
      // 「前往觀戰」按鈕讓「我的英雄在 A 區、我的鏡頭在 B 區」是真的會發生的
      // 狀態,而兩個答案都說得通。所以它是 `config.victory-podium@1` 的
      // `podiumZoneSource`:出貨 `localSeat`(永遠演你自己那一場,owner 的原話),
      // `spectated` 演你正在看的那一區。純函式 `authoritativeRoundWinner` 一行
      // 都沒被動到 —— 這裡決定的只是餵給它的 `zone` 從哪裡來。
      const zone =
        victoryPodiumPolicy().podiumZoneSource === "spectated"
          ? (this.spectateZoneByPlayer.get(0) ?? localDuelZone(hud))
          : localDuelZone(hud);
      const plan = planRoundWinnerShow(
        hud.seats,
        hud.teams,
        state.round,
        (id) => this.roundWinnerModelDoc(id, hud.seats),
        { duels: hud.duels, zone },
        undefined,
        // GH#368 —— 卡片上的大小＝剛剛場上的大小。少了這一行，小叮噹在頒獎台上
        // 跟初號機一樣高（兩者都被正規化到 1.8u，而刻意的例外整張表都消失）。
        (id) => bodyRelativeScale(this.roundWinnerModelDoc(id, hud.seats)?.glbPath, this.contentDb.modelOverrideFor(id)),
      );
      if (plan) {
        this.roundWinner.showTeam(plan.members, plan.ctx);
        // ⚠️ 台上停多久是**欄位不是常數**（owner 2026-08-14）。寫死的
        // `ROUND_PRESENT_MS = 3600` 只留作讀不到設定時的保險絲。
        this.roundWinnerUntilMs =
          nowMs + victoryPodiumPolicy().roundPresentSec * 1000;
      }
    }

    // clear when the beat elapses OR as soon as we leave the resolution phase.
    // ⚠️ 這兩個條件都是**畫面**的節拍（台上停多久、相位換到商店），⛔ 沒有一個
    // 是「這句話講完了」。收畫面的同時把嘴按住就是 owner 2026-08-14 聽到的截斷
    // （實測 59/60 支嘲諷被切在一半）。`clear()` 現在**預設不按停**，所以這裡
    // 什麼都不用傳 —— 安全的那一邊是預設值，⛔ 不是靠這個呼叫端記得。
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
    // ⭐ GH#364 —— 矩形分區把半寬半深一起帶下去。sim 對 rect 分區判的是
    // **矩形**火圈（`fireRingSafeAt`），這裡少帶這一格，畫面就會在短軸上
    // 多畫 `halfW/halfD` 倍的假安全區（出貨 24×18 ⇒ 多 33%）。
    f.zone = z ? { x: z.x, z: z.z, r: z.r, ...(z.rect ? { rect: z.rect } : {}) } : null;
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

  /**
   * L3 —— 重算「這個客戶端要渲染哪幾個 duel zone」。
   *
   * 每個本地玩家(分割畫面也算)貢獻**兩個**來源：
   *   1. `ownZoneOf` —— 他英雄站的那一區。讀的是實體自己的 zone，所以死掉之後
   *      也還是對的(屍體保留 zone)，這正是 #208 判斷「哪一場是我的」的方式。
   *   2. `spectateZoneByPlayer` —— #269 的「前往觀戰」按鈕把鏡頭送去的那一區。
   *
   * 兩者**並存**而不是後者取代前者，理由寫在 net/zoneVisibility.ts 的檔頭：
   * 小地圖的 zone 推導、復活圈橫幅、結算正面特寫都還需要自己那一區。
   *
   * 兩個來源都算不出來(還沒選角、純觀眾、快照還沒到)時 `end()` 會封成
   * 「全部可見」= 今天的行為，剔除只在確定知道要看哪裡時才發生。
   */
  private refreshVisibleZones(state: MatchState): void {
    const zones = this.visibleZones;
    zones.begin();
    for (let p = 0; p < this.viewports.count; p++) {
      zones.add(this.ownZoneOf(p, state));
      zones.add(this.spectateZoneByPlayer.get(p));
    }
    zones.end();
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
  /**
   * ⭐ 進入 combat 的那一個 edge：把跟隨鎖扣回來並跳到自己身上。
   *
   * owner 2026-08-14：「戰鬥回合開始記得把視角拉回自己操作的英雄，
   * 我剛剛**有幾場**沒有拉回來」。
   *
   * ⚠️ 「有幾場」＝ 不是每場，所以不是功能沒接，是**狀態跨回合殘留**：
   *    `CameraRig.focusOn()`（小地圖左鍵窺視）與邊緣平移都會把 `followLock`
   *    設成 false，而在此之前只有 Space（`toggleFollow`）與復活（`setDead`）
   *    會把它扣回來 —— 上一回合看過一眼小地圖，這一回合開打鏡頭就留在那裡。
   *
   * ⛔ 只在 edge 做，不是每幀：每幀扣的話玩家整場都不能平移，那比原缺陷更糟。
   * ⛔ 也不碰觀戰（`rig.spectating`）—— 死掉時的自由視角是 #85 刻意給的，
   *    它的回復由 `setDead` 擁有。
   */
  private relockFollowOnRoundStart(
    player: number,
    rig: CameraRig,
    state: MatchState,
    selfPos: { x: number; z: number } | null,
  ): void {
    const inCombat = state.phase === "combat";
    const was = this.wasInCombat.get(player) ?? false;
    this.wasInCombat.set(player, inCombat);
    if (!shouldRelockFollow(inCombat, was, rig.spectating)) return;
    rig.followLock = true;
    if (selfPos) rig.jumpTo(selfPos);
  }

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
        // GH#321 —— 影子要知道它是哪一具身體，`movementHold` 才查得到 `immobile`。
        championId: seat?.championId ?? "",
      });
      this.predictedEntityId = entityId;
    } else {
      this.prediction.setMoveSpeed(moveSpeed);
      this.prediction.setAttackRange(attackRange);
      // ⚠️ 變身**不換 entityId**（同一個座位換一張卡），所以這一行必須在 else 分支：
      //    寫在 spawn 裡的話紮根之後影子還帶著本體的卡，`immobile` 永遠看不到。
      this.prediction.setChampionId(seat?.championId ?? "");
      // ⭐ GH#607 —— **道具／增益／變身**取得的飛行也要餵給影子。
      //
      // ⛔ 在此之前只有**天生技**的飛行預測得到（`predict/localFlight.ts` 的檔頭
      // 逐字列了涵蓋範圍表），於是 77-03 有翼劍士那一族每一步都在拉扯:
      // 影子撞牆停住、伺服器飛過去 ⇒ 每一次修正把角色拉回去
      // ＝ owner 說的「**循環來回拉扯**」。
      //
      // ⭐ 判準用**快照上的懸浮高度**,⛔ 不是在客戶端重算一份「他身上掛了什麼」——
      // 那會是第二個住處,而它與伺服器漂開的那天沒有東西會紅（失敗形態⑤）。
      // ⚠️ `h > 0 && !airborne` 與 `ChampionView.applyAirborne` **同一個判準**:
      // 飛行**刻意不點** `AIRBORNE`（那一格是跳躍的），所以兩者分得開。
      const flying = es.h > 0 && (es.flags & ENTITY_FLAG.AIRBORNE) === 0;
      this.prediction.setFlight(flying ? { hoverHeight: es.h } : null);
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
  /**
   * ⭐ 影子的移速。⛔ **本體抽到 `predict/predictedStats.ts`** —— 唯一的理由是
   * 「守衛要跑得到出貨的那一支」：`GameApp` 沒辦法 headless 建，於是任何
   * 守衛都只能自己重寫一份（失敗形態⑤）。⚠️ 2026-08-23 我就這樣寫過一條
   * **假的**守衛：把出貨路徑改回錯的版本，它照樣綠。
   */
  private computeMoveSpeed(championId: string, items: string[]): number {
    return predictedMoveSpeed(championId, items, this.combatEnv);
  }

  /**
   * ⭐ GH#324 視野遮蔽的參數 —— 規則本身在 `render/occlusionZone.ts`，這裡只是接線。
   *
   * ⚠️ GH#421：這裡以前是 `zones.find((z) => z.bounds?.kind === "rect")`，
   * ⇒ **永遠回 zone 0**，而 zone 1 的場地整個平移在 x＝+72
   * ⇒ 那半場玩家的視線是拿 48 單位外的牆算的（＝遮蔽在 zone 1 等於不存在，
   * 而且是**單向**的資訊優勢）。改成拿**觀看者自己那一區**，
   * 與伺服器 `BasicAttackSystem.seesTarget` 的取牆規則逐字相同。
   *
   * `viewerZone` 讀的是玩家英雄自己的實體 zone（`ownZoneOf`，#67 小地圖同一個來源），
   * 與 `center` 是**同一個英雄** —— 兩者不可以各自算，否則又會出現「牆在 A 區、
   * 眼睛在 B 區」的同型缺陷。
   */
  private occludeArgs(
    center: { x: number; z: number } | null,
    viewerZone: number | null,
  ): { cx: number; cz: number; blocked: (x: number, z: number) => boolean } | undefined {
    return occludeArgsFor(this.arenaDef.zones, viewerZone, center);
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

    // 隱形原語 —— the viewer's team, resolved once for this frame's anchor sweep
    // exactly as the entity pool does it (same store, same client-08 reason).
    const localTeam =
      hud.localSeatId === null ? null : (this.teamBySeat.get(hud.localSeatId) ?? null);
    const isFriendlyEntity = (seatId: number): boolean =>
      localTeam !== null && (this.teamBySeat.get(seatId) ?? -1) === localTeam;

    const seen = this.fbSeen;
    seen.clear();
    // ---- 精英小怪頭上的小血條 (GH#268) --------------------------------------
    // REBUILT FROM SCRATCH EVERY FRAME, like `reviveCircles` below: 一條血條的
    // 存續條件就是「那一列還在快照裡」,所以屍體與離場的怪自己就消失了,不需要
    // 任何 death handler。
    //
    // ⚠️ v0.9.28 出貨時**這個迴圈不存在** —— 伺服器把 `ENTITY_FLAG.MOB_ELITE`
    // 寫上線(付掉最後一格,不可逆),客戶端一個字都沒讀,整包功能可以刪掉而畫面
    // 不變(失敗形態 ③)。守衛:`ui/hud/mobHealthBarWiring.test.ts`。
    const bars = frameBus.mobBars;
    bars.length = 0;
    const barCfg = this.mobBarCfg;
    state.entities.forEach((es) => {
      if (es.kind === KIND_MOB) {
        // ⭐ GH#575 —— **在任何 return 之前**記下這一具身體。`mobSlain` 的 payload
        // 沒有 x/z，而殭屍在事件到達時通常已經從快照裡消失（sim 同一個 tick 就
        // `destroyAfterHooks`）⇒ 少了這一行，金幣不生、音效與音階都不播。
        // ⚠️ 刻意放在**分區剔除與界外閘之前**：金幣的歸屬與音階是**擊殺者**的回饋，
        //    ⛔ 與「這一隻的血條有沒有畫在螢幕上」無關。
        this.vfx.noteGoldBody(es.id, es.x, es.z);
        // L3 ZONE CULL —— 別區的小怪血條沒有消費者(`MobHealthBars` 只畫投影到
        // 螢幕上的),而波峰時一區 50 隻,少跑一次 `project()` 是真的省。
        if (!this.visibleZones.has(es.zone)) return;
        const mp = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
        // ⭐ 出口的閘（owner 2026-08-19「在牆外也不應該是顯示在那邊」）。見
        // `render/anchorBounds.ts`：⛔ 不夾回界內，不畫，而且會被數到。
        if (!anchorDrawable(frameBus.arenaZones, mp.x, mp.z, `mob bar #${es.id}`)) return;
        // ⚠️ `es.mana` 是體型倍率(GH#192),不是法力 —— 一般殭屍 0.68 / 特殊 2 /
        // 王 5。不餵它的話 `yOffset` 就是一個寫了沒人讀的欄位,而王的血條會掛在
        // 牠膝蓋上(失敗形態 ①)。
        const bar = mobBarAnchorFor(es, project(mp.x, mobBarAnchorY(es.mana, barCfg), mp.z), mp);
        if (bar) bars.push(bar);
        return;
      }
      // champions AND neutral objectives (kind 2 flower, kind 4 guardian) carry
      // overhead bars. A guardian is NEUTRAL (task #89): no name, teamId -1, and
      // an explicit neutral bar colour (anchorColorFor) — never a team tint.
      if (!hasOverheadBar(es.kind)) return;
      // 隱形原語 —— NO BAR FOR A HIDDEN ENEMY. This is a SECOND decision, not a
      // consequence of the model fade: `enemyAlpha` is a field, so an operator
      // who picks a 「半透明鬼影」 look (0.15) would otherwise still get a crisp
      // health bar floating over the ghost — a perfect position readout, i.e.
      // exactly the thing being hidden. `stealthVisualFor` owns both answers so
      // they cannot drift; `friendly` is the seat's team (see the entity pool).
      // Returning BEFORE `seen.add` is what deletes an already-pooled anchor:
      // the sweep at the bottom of this method drops every id it did not see,
      // so a bar that was on screen when the hero faded really goes away.
      if (
        es.kind === KIND_CHAMPION &&
        !stealthVisualFor((es.flags & ENTITY_FLAG.INVISIBLE) !== 0, isFriendlyEntity(es.seatId)).healthBar
      )
        return;
      // ⭐ GH#324 視野遮蔽的**另一半**：牆後的敵人身體不畫，那條血條就不可以留著。
      // 理由與上面那一段隱形的逐字相同 —— 一條浮在牆後、底下沒有身體的血條是一份
      // 完美的位置讀數，也就是遮蔽這條機制本來要藏的那個東西。⛔ 繪製距離剔除
      // **不**走這條（那是畫質設定，遠處的血條照樣要看得到）。
      // 跟隱形那一條一樣寫在 `seen.add` **之前**：已經在畫的錨點會被下面的掃描
      // 真的刪掉，而不是凍在原地。
      if (es.kind === KIND_CHAMPION && this.views.isOccluded(es.id)) return;
      // L3 ZONE CULL —— 別區的血條沒有任何消費者：`WorldAnchorLayer` 只畫
      // 螢幕內的錨點，而 #67 的小地圖本來就只畫一個 zone。省掉的是每個實體
      // 每幀一次的 `project()` 3D→2D 投影 + 一個 DOM 節點的更新。
      if (!this.visibleZones.has(es.zone)) return;
      const isNeutral = es.kind === KIND_FLOWER || es.kind === KIND_GUARDIAN;
      const pos = this.views.posOf(es.id) ?? { x: es.x, z: es.z };
      // ⭐ 出口的閘（owner 2026-08-19）。⚠️ 寫在 `seen.add` **之前**：已經在畫的
      // 錨點要被下面的掃描真的**刪掉**，⛔ 不是凍在最後那個界外座標上 ——
      // 凍住正是 owner 看到的那個畫面。同 `stealthVisualFor` 那一條的擺法。
      if (!anchorDrawable(frameBus.arenaZones, pos.x, pos.z, `bar #${es.id}`)) return;
      seen.add(es.id);
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

    // ---- 殭屍王 minimap marker (task #262) ---------------------------------
    // The king is a KIND_MOB, so the `hasOverheadBar` cull above skipped it with
    // the other 50 zombies — correct for the rank and file, wrong for the one
    // entity the 戰場任務 is about. It gets its own bus slot (frameBus.mobBoss);
    // ui/hud/minimapBossMarker turns it into the map ping the source map's
    // war3map.j:11824 `PingMinimapLocForForce` did.
    //
    // WHICH entity is the king comes from `mobBossSpawn` — the wire has no boss
    // bit. Rebuilt from scratch every frame, so a king that died (no live entity
    // with that id) clears itself with no death handler.
    //
    // ⛔ GH#268 —— 這裡以前讀的是 `hud.mobBoss`（「最後一則王的消息」），也就是一顆
    // **一場只有一個槽**的欄位；而自 #288 起每一隻特殊殭屍死掉也發 `mobBossSlain`,
    // 所以任何一區任何一隻精英一死就把 bossId 打成 -1,本區那隻**滿血的王**的長
    // 血條當場消失（owner 回報兩次）。現在讀的是 `hud.mobBossLive`（「現在場上有沒有
    // 王」），它只被同一顆 bossId 的結算清掉。決策本身在 `mobBossMarkerFor` ——
    // `GameApp` headless 起不來,寫在這裡的判斷沒有任何行為測試搆得到。
    frameBus.mobBoss = mobBossMarkerFor(
      hud.mobBossLive,
      (bossId) => {
        const row = state.entities.get(String(bossId));
        return {
          row,
          world: row ? (this.views.posOf(row.id) ?? { x: row.x, z: row.z }) : { x: 0, z: 0 },
        };
      },
      localDuelZone(hud),
    );

    // ---- revive circles (task #84) -----------------------------------------
    // Their own frameBus list, NOT champion anchors: they carry no HP bar and
    // no name, and nothing that walks `frameBus.champions` should ever see one.
    // The minimap and the spectating owner's HUD banner both read from here.
    const circles = frameBus.reviveCircles;
    circles.length = 0;
    state.entities.forEach((es) => {
      if (es.kind !== KIND_REVIVE_CIRCLE) return;
      // L3 ZONE CULL —— 兩個消費者(小地圖 #67、ReviveBanner)都只看得到本區的
      // 圈圈；自己那一區永遠在可見集合裡，所以自己的復活圈不受影響。
      if (!this.visibleZones.has(es.zone)) return;
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
      if (!e.active) continue;
      // ⭐ 出口的閘（owner 2026-08-19）—— 飄字與血條同一條規則。⛔ 不夾回界內：
      // `pose.visible = false` 就是「不畫」，而 `WorldAnchorLayer` 已經在讀它。
      if (!anchorDrawable(frameBus.arenaZones, e.worldX, e.worldZ, "combat text")) {
        e.pose = { sx: 0, sy: 0, visible: false };
        continue;
      }
      e.pose = project(e.worldX, e.anchorY, e.worldZ);
    }
  }
}
