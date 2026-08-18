/**
 * frameBus — a PLAIN shared mutable store bridging the imperative render loop
 * and the DOM world-anchor layer. The render loop writes projected screen
 * coordinates here every frame; ui/WorldAnchorLayer reads them in its own rAF
 * and patches DOM styles imperatively. Nothing here touches React state or
 * Zustand — per-frame data never passes through React (client-08).
 */
import {
  COALESCE_MS,
  MAX_COMBAT_TEXT,
  MAX_STAGGER_STEPS,
  SPAWN_STAGGER_MS,
  combatTextCategory,
  combatTextStyle,
  overflowOnTargetIndex,
  scopeAllows,
  worstEntryIndex,
  type CombatTextCategory,
  type CombatTextKind,
  type CombatTextRelation,
  type CombatTextScope,
} from "./ui/combatText";

export interface AnchorPose {
  sx: number;
  sy: number;
  visible: boolean;
}

/** Over-head cast-bar state (null when the entity isn't casting). */
export interface CastBar {
  /** 0..1 fill */
  fraction: number;
  /** "cast" = ability channel, "windup" = basic-attack wind-up */
  kind: "cast" | "windup";
}

export interface ChampionAnchor {
  entityId: number;
  /**
   * The authoritative `EntityState.kind` this anchor was built from
   * (render/overheadAnchors KIND_*). Optional so a hand-built anchor (tests)
   * stays valid, and because for a CHAMPION — the overwhelming majority — the
   * default of `KIND_CHAMPION` is the truth.
   *
   * It exists because `teamId < 0` was doing this job by accident: it meant
   * "healing flower" back when the flower was the only team-less anchor, and
   * then the neutral GUARDIAN (#89) started encoding seatId -1 as well and
   * silently inherited the flower's minimap pip and the flower's small blob
   * shadow. Reading the kind makes each consumer say which neutral it means.
   */
  kind?: number;
  name: string;
  teamId: number;
  /**
   * Content id of the champion this entity is playing ("" for neutrals and
   * until the seat's pick is known) — the minimap resolves the w3x portrait
   * from it (ui/icons.ts), exactly like the shop/champ-select do.
   */
  championId: string;
  isLocal: boolean;
  alive: boolean;
  hpPct: number;
  shieldPct: number;
  manaPct: number;
  /** planar world position (interpolated), for the minimap overlay */
  worldX: number;
  worldZ: number;
  pose: AnchorPose;
  /** over-head cast bar; null when not casting */
  cast: CastBar | null;
  /**
   * Explicit bar color for NEUTRAL entities (healing flowers, kind 2).
   * Absent for champions — the UI derives their color from teamId
   * (`anchor.color ?? teamCss(anchor.teamId)`).
   */
  color?: string;
}

/**
 * One live floating combat-text node (task #92). POOLED: the array is
 * pre-allocated to `MAX_COMBAT_TEXT` at module load and entries are claimed and
 * released in place — `active` is the only liveness flag. Nothing is ever
 * pushed or spliced at runtime, so a teamfight allocates zero objects here and
 * ui/WorldAnchorLayer can keep one DOM node per slot for the whole session.
 */
export interface CombatTextEntry {
  /** pool slot; stable for the life of the node it drives */
  readonly slot: number;
  /** bumped every time the slot is re-claimed — the renderer's "this is a new number" key */
  id: number;
  active: boolean;
  category: CombatTextCategory;
  /** accumulated amount (a same-tick coalesce adds into this) */
  amount: number;
  crit: boolean;
  killingBlow: boolean;
  /** damage school; undefined for non-damage kinds (heal/mana/evade never set this) */
  dmgType?: "physical" | "magic" | "true";
  /**
   * 覆蓋掉 `combatTextLabel` 算出來的字（GH#278【具名標記】）。
   *
   * ⚠️ 為什麼是覆蓋而不是一個新的 category：標記的字是**內容決定的**
   * （「試煉 ×11」——名字來自那份技能文件，數字來自事件），而 `ui/combatText` 的
   * 每一個 category 都綁著一組出貨過的字級/色相/對比量測。為了一行動態文字新增
   * 一個 category，等於把那整張量測表再攤一次，而它量的東西一個都沒變。
   * 所以標記走既有的「無量值」通道（`kind: "evade"`），只把字換掉 ——
   * 入場政策、同 tick 合併、每體上限、優先admission、多段錯開全部原封不動繼承。
   *
   * undefined = 照舊由 category + amount 決定（絕大多數的數字）。
   */
  label?: string;
  /** entity the number belongs to — drives the per-target cap and coalescing */
  targetId: number;
  /** admission priority, lower = kept (see combatText.worstEntryIndex) */
  rank: number;
  /** lane index on that body, so stacked numbers fan instead of overlapping */
  lane: number;
  worldX: number;
  worldZ: number;
  /** world-space Y this category projects from */
  anchorY: number;
  /** may be in the FUTURE — RO's multi-hit stagger releases numbers in sequence */
  bornMs: number;
  lifeMs: number;
  pose: AnchorPose;
}

/** LOCAL player's current cast, for the ability-icon fill overlay. */
export interface LocalCast {
  /** ability slot index 0..3 (Q/W/E/R); -1 for a basic-attack wind-up */
  slot: number;
  fraction: number;
  kind: "cast" | "windup";
}

/** A blocking obstacle of a zone, flattened to plain numbers for the minimap. */
export type MinimapObstacle =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "segment"; ax: number; az: number; bx: number; bz: number }
  // ⭐ GH#324 —— 有厚度的牆。⛔ 不可以壓成外接圓：24 格寬的牆會變成一顆半徑 24
  // 的大圓圈，小地圖上的地形就跟玩家撞到的牆完全不一樣。
  | { kind: "box"; x: number; z: number; halfW: number; halfD: number };

/**
 * One circular arena zone (planar) plus the STATIC terrain inside it. The
 * minimap paints zone disc + obstacles + spawn pads ONCE into an offscreen
 * canvas and blits that as its base layer, so the per-frame cost stays at
 * "markers only" (see ui/hud/minimapTerrain).
 */
export interface ArenaZoneCircle {
  x: number;
  z: number;
  r: number;
  /** blocking pillars/walls the sim collides against (terrain layer) */
  obstacles?: readonly MinimapObstacle[];
  /** spawn pads by side (0/1), each a list of points (terrain layer) */
  spawns?: readonly (readonly { x: number; z: number }[])[];
  /**
   * ⭐ GH#324 —— 矩形可玩範圍。有值時小地圖畫**矩形**，⛔ 不是半徑 `r` 的圓。
   * `r` 對矩形場地是外接圓（24×18 格 ⇒ 30），畫成圓會讓地形比實際大一圈。
   */
  rect?: { halfW: number; halfD: number };
}

/**
 * The primary camera's ground-plane view, published every frame by
 * render/CameraRig (`groundView()`). The minimap derives its viewport box and
 * its orientation from THESE numbers — never from a hardcoded rectangle or a
 * magic yaw. Null until the first rendered frame.
 */
export interface CameraGroundView {
  /** ground point the camera looks at (world x/z) */
  targetX: number;
  targetZ: number;
  /** eye distance from the target along the sightline (world units) */
  dolly: number;
  /** pitch below horizontal (radians) */
  pitchRad: number;
  /** ground-plane yaw of camera-forward (radians; 0 = looking along +Z) */
  yawRad: number;
  /** vertical field of view (radians) */
  fovRad: number;
  /** viewport aspect (width / height) */
  aspect: number;
}

/**
 * One live revive circle (task #84), published every frame by the game loop.
 *
 * A circle is NOT a champion anchor: it carries no HP bar and no name, and it
 * must not be swept up by anything that iterates `frameBus.champions`. It gets
 * its own list so the minimap and the HUD banner can read it without either of
 * them growing a special case on the anchor type.
 */
export interface ReviveCircleMarker {
  entityId: number;
  /** seat of the DEAD OWNER this circle would bring back */
  ownerSeatId: number;
  /** owning team (already resolved from the seat table) */
  teamId: number;
  /** duel zone — task #67 scopes the minimap to the local player's zone */
  zone: number;
  worldX: number;
  worldZ: number;
  /** ring radius in world units (authoritative, off the wire) */
  radius: number;
  /** channel fill 0..1 */
  progress: number;
  // No lifetime fields: the ring lasts until the round ends (task #196), so
  // there is no countdown for the HUD or the world view to render.
  /** at least one ally is channelling right now */
  channelling: boolean;
  /** an enemy stands inside, holding progress */
  contested: boolean;
}

/**
 * The live 殭屍王 (task #262), published every frame while one is on the field.
 *
 * WHY IT NEEDS ITS OWN CHANNEL. Mobs are `KIND_MOB` and `hasOverheadBar()`
 * excludes them, so no zombie — king included — ever becomes a `ChampionAnchor`.
 * That is correct for the RANK AND FILE: at the round-9 peak there are 50 alive
 * per zone, and 50 pips would turn the minimap into noise. But it also meant the
 * one entity the whole 戰場任務 is about was invisible on the map, while the map
 * this is ported from pinged its own minimap for 3 seconds on the king's spawn
 * (war3map.j:11824 `PingMinimapLocForForce`). One king is not fifty zombies, so
 * it gets one slot — not a relaxation of the mob cull.
 *
 * WHICH ENTITY IS THE KING comes from the `mobBossSpawn` event (RoomStore's
 * `mobBossLive.bossId`), because the wire carries no boss BIT of its own.
 *
 * ⚠️ 這段以前寫著「`ENTITY_FLAG` 還有兩格空的」—— **那句話從 隱形原語 起就是假的**
 * (第三守則)。16384 被 `INVISIBLE` 拿走，最後一格 32768 被
 * {@link ENTITY_FLAG.MOB_ELITE} 拿走，現在**一格都沒有**。
 *
 * 而且那一格**不是**花在王身上：`MOB_ELITE` 說的是「精英小怪」（特殊殭屍或王），
 * 不是「這一隻是王」。所以「哪一隻是王」仍然只有 `mobBossSpawn` 這顆事件知道。
 *
 * ⛔ GH#268 —— **這一格以前讀的是 `hud.mobBoss`，那是一場只有一個槽的欄位**，
 * 而自 #288 起**每一隻特殊殭屍死掉也會發 `mobBossSlain`**
 * （`sim/systems/MobSystem.ts`）。於是任何一區任何一隻精英一死 → 那一格翻成
 * `"slain"` → bossId 變 -1 → 本區那隻**滿血的王**的長血條當場消失
 * （owner 2026-08-03「殭屍王血量在死之前都應該存在 現在玩起來會消失」）。
 *
 * 修法是把「當前活著的王」與「最後一則結算」拆成 `RoomStore` 的**兩個欄位** ——
 * 它們本來就是兩件事。這一格只讀前者（`hud.mobBossLive`），而它只在**同一顆
 * bossId** 的 `mobBossSlain` 到達時才會被清掉。
 * 判準寫在 {@link mobBossMarkerFor}：血條的存續條件只能綁在「那具身體還在不在」，
 * 不能綁在任何比身體短命的東西上。
 *
 * ⚠️ 頭上那條小血條走的是另一條路（{@link FrameBus.mobBars} ← 快照的
 * `ENTITY_FLAG.MOB_ELITE`）。這裡以前寫著「所以它不受影響」—— 在 GH#268 之前
 * **那句話沒有意義**：那條路的讀端整個是死的（`GameApp` 不寫、`HudRoot` 不掛），
 * 一條不存在的血條當然不受影響。兩條路都是 GH#268 才真的接上。
 */
export interface MobBossMarker {
  entityId: number;
  /** duel zone — task #67 scopes the minimap to the local player's zone */
  zone: number;
  worldX: number;
  worldZ: number;
  /** 0..1, so the marker can read as "nearly dead" at a glance */
  hpPct: number;
  /**
   * #247 —— THE RAW NUMBERS, for the 長血條's 「276,944 / 276,944」 readout.
   *
   * ⚠️ NOT derivable from `hpPct`. A percentage is a lossy projection: a king
   * on 0.4% of a 276k pool still has ~1,100 hp, which is several more swings,
   * and a bar that could only say 「0%」 would tell the player the fight is over
   * while it is not. They ride along because the snapshot row they come from is
   * already open right here — no extra wire field, no second lookup.
   */
  hp: number;
  maxHp: number;
}

/**
 * 快照那一列身上，王的長血條需要的全部欄位。刻意是**結構型**而不是 `EntityState`：
 * `frameBus` 不該去 import Colyseus 的 schema 類別，而 `GameApp` 手上那一列剛好就是
 * 這個形狀。
 */
export interface MobBossRow {
  id: number;
  zone: number;
  alive: boolean;
  hp: number;
  maxHp: number;
}

/** `GameApp` 每幀給 {@link mobBossMarkerFor} 的那一列 + 它的內插位置。 */
export interface MobBossLookup {
  row: MobBossRow | undefined;
  world: { x: number; z: number };
}

/**
 * 這一幀的 {@link FrameBus.mobBoss}，或 null —— **`GameApp` 每幀呼叫的就是這個函式**。
 *
 * 為什麼要是一個獨立的純函式，而不是 `GameApp` 裡的四行：`GameApp` 抓 Babylon
 * engine + canvas + socket，headless 起不來，所以寫在那裡的判斷**沒有任何行為測試
 * 搆得到**。GH#268 的長血條就是這樣壞掉又沒有人發現的。切出來之後，
 * 「王還活著的整段期間血條還在不在」變成一條真的可以跑的斷言
 * （`ui/hud/mobHealthBarWiring.test.ts` 的守衛 A）。
 *
 * ⚠️ **存續條件只有兩個，而且兩個都綁在「那具身體」上**：
 *   ① `live` 裡有這一隻（`hud.mobBossLive`，只在**同 id** 的結算到達時才移除）；
 *   ② 那一列還在快照裡而且 `alive`。
 * 不可以再加第三個綁在比身體短命的東西上的條件 —— 一顆事件、一個 aggro 集合、
 * 一個 target 欄位、或「最近有沒有被打」。owner 兩次回報的「殭屍王血量在死之前
 * 就消失」就是長血條綁到了一顆單槽事件上。
 *
 * ⚠️ **`live` 是一個清單，不是一格**：王的每回合上限預設算「每個戰場」
 * （`MobBossRules.maxPerRoundScope` 出貨 `"zone"`），所以四個 duel zone 可以同時
 * 各有一隻王。用一格存就會出現「隔壁區的王一召喚，我這條血條就沒了」——
 * 跟原本的缺陷同一型，只是換一個觸發條件。
 *
 * `preferZone` 是本地玩家自己那一區：同區的王優先，沒有才退回第一隻活著的
 * （小地圖與觀戰仍然拿得到東西，而長血條自己的 zone 閘會擋掉不該畫的）。
 */
export function mobBossMarkerFor(
  live: readonly { bossId: number }[],
  resolve: (bossId: number) => MobBossLookup,
  preferZone: number,
): MobBossMarker | null {
  let fallback: MobBossMarker | null = null;
  for (const l of live) {
    if (l.bossId < 0) continue;
    const { row, world } = resolve(l.bossId);
    if (!row || row.id !== l.bossId || !row.alive) continue;
    const maxHp = Math.max(0, row.maxHp);
    const hp = Math.max(0, Math.min(maxHp, row.hp));
    const marker: MobBossMarker = {
      entityId: row.id,
      zone: row.zone,
      worldX: world.x,
      worldZ: world.z,
      hpPct: maxHp > 0 ? hp / maxHp : 0,
      hp,
      maxHp,
    };
    if (marker.zone === preferZone) return marker;
    if (!fallback) fallback = marker;
  }
  return fallback;
}

/**
 * One 精英小怪 (特殊殭屍 / 殭屍王) that should carry a small over-head health bar
 * — owner 2026-08-03「特殊殭屍 頭上應該要有小血條 顯示即時血量」.
 *
 * A LIST, NOT A `ChampionAnchor`. The champion anchor carries a name, a team
 * colour, a mana strip and a cast bar, and everything that walks
 * `frameBus.champions` (the minimap's pips, #85's death-spectator desaturation,
 * the shadow layer) assumes those mean what they mean for a PLAYER. Fifty
 * zombies a round pouring into that map is exactly the noise `hasOverheadBar`
 * excludes mobs to avoid — so the elites get their own narrow channel, the same
 * way `reviveCircles` and `mobBoss` do.
 *
 * WHICH mobs are in here is decided by {@link ENTITY_FLAG.MOB_ELITE} on the
 * snapshot row (`isEliteMob`), NOT by the `mobBossSpawn` event that
 * {@link MobBossMarker} rides: a row rebuilt from the snapshot every frame lives
 * exactly as long as the body does.
 *
 * ⛔ **這個清單在 v0.9.28 出貨時沒有任何寫入者**（GH#268）—— 伺服器真的把
 * `ENTITY_FLAG.MOB_ELITE` 寫進快照（`net/snapshot.ts`，`mobEliteWire.test.ts` 證明
 * 過線），而 `GameApp` 全檔沒有一個 `mobBars` 參照、`HudRoot` 也沒有掛
 * `MobHealthBars`。整包功能可以從 repo 刪掉、畫面上一個像素都不會變
 * （失敗形態 ③），而且是在已經付掉 `ENTITY_FLAG` 最後一格之後。
 * 寫入者現在是 `GameApp.updateFrameBus` 的每幀掃描（`ui/hud/mobHealthBarModel`
 * 的 `mobBarAnchorFor` / `mobBarAnchorY`），讀取者是 `ui/hud/mobHealthBar.tsx`。
 */
export interface MobBarAnchor {
  entityId: number;
  /** duel zone — the caller culls other zones exactly like the anchor sweep does */
  zone: number;
  /** 0..1 */
  hpPct: number;
  hp: number;
  maxHp: number;
  worldX: number;
  worldZ: number;
  pose: AnchorPose;
}

export interface FrameBus {
  /** per-champion world anchors (healthbars/names), written by the game loop */
  champions: Map<number, ChampionAnchor>;
  /**
   * The 殭屍王 while one is alive (task #262), else null. See
   * {@link MobBossMarker} for why the king is not just another anchor.
   */
  mobBoss: MobBossMarker | null;
  /**
   * 精英小怪 (特殊殭屍 / 殭屍王) with an over-head bar this frame — rebuilt from
   * scratch every frame like {@link FrameBus.reviveCircles}, so a dead elite
   * clears itself with no death handler. See {@link MobBarAnchor}.
   */
  mobBars: MobBarAnchor[];
  /**
   * Floating combat-text pool (task #92) — FIXED LENGTH, never resized.
   * Iterate it and skip `!active`; do not push, splice or filter.
   */
  combatText: CombatTextEntry[];
  /** live revive circles (task #84), rebuilt each frame from the snapshot */
  reviveCircles: ReviveCircleMarker[];
  /** world→screen projection registered by the render layer (CSS px) */
  project: ((x: number, y: number, z: number) => AnchorPose) | null;
  /** local player's active cast (ability-icon overlay); null when idle */
  localCast: LocalCast | null;
  /** circular zones of the ACTIVE arena (written by GameApp.applyArena) */
  arenaZones: ArenaZoneCircle[] | null;
  /**
   * Id of the arena `arenaZones` came from — the minimap's terrain-cache key,
   * so the baked background is rebuilt exactly when the map changes.
   */
  arenaId: string | null;
  /**
   * ⭐ 這張地圖的**顯示名**（「無限城」「希干希納」…），給戰鬥開場的報地名用
   * （owner 2026-08-14）。⚠️ 和 `arenaId` **同一行寫入**，所以不可能出現
   * 「id 是新圖、名字還是上一張」——那種偏差在畫面上會是一個非常難查的謊。
   * 沒有 arena doc（開機前的骨架場地）時是 `null` ＝ 不報。
   */
  arenaName: string | null;
  /** primary camera's ground-plane view (written by the render loop) */
  cameraView: CameraGroundView | null;
  /**
   * Duel zone the primary player is currently SPECTATING (task #208): set when
   * the combat camera is pointed at another zone, else null (follow your own
   * zone). The minimap (#67) reads it so the scoped map follows the fight you
   * are actually watching, not your finished/empty zone.
   *
   * ⚠️ SINCE #269 THIS IS ONLY EVER SET BY AN EXPLICIT PLAYER ACTION
   * (`hudActions.spectateGoTo`). #208 used to write it from the camera's own
   * auto-redirect; the owner's ruling — 「不要跳去看別人的競技場，但可以跳出
   * 按鈕前往/返回」 — makes the jump a button, so nothing in the frame loop
   * moves the camera off your own arena any more.
   */
  spectateZone: number | null;
  /**
   * The duel zone the primary player COULD go and watch right now, or null.
   *
   * This is what is left of #208's auto-redirect after #269 turned it into a
   * button: the same pure decision (`render/spectateFocus.pickSpectateZone` —
   * your own duel is decided AND another zone is still live) is still computed
   * every frame, but its answer is now an OFFER the HUD renders as 「前往觀戰」
   * instead of a camera move. Kept OUT of `spectateZone` deliberately: 「有得看」
   * and 「正在看」 are different states and the banner says different things
   * about each, and conflating them is exactly how the camera would start
   * moving on its own again.
   */
  spectateOffer: number | null;
}

/** Pre-allocated, never resized: the pool IS the store (see CombatTextEntry). */
const combatTextPool: CombatTextEntry[] = Array.from({ length: MAX_COMBAT_TEXT }, (_, slot) => ({
  slot,
  id: 0,
  active: false,
  category: "other" as CombatTextCategory,
  amount: 0,
  crit: false,
  killingBlow: false,
  targetId: -1,
  rank: Number.POSITIVE_INFINITY,
  lane: 0,
  worldX: 0,
  worldZ: 0,
  anchorY: 1.3,
  bornMs: 0,
  lifeMs: 0,
  pose: { sx: 0, sy: 0, visible: false },
  label: undefined as string | undefined,
}));

export const frameBus: FrameBus = {
  champions: new Map(),
  mobBoss: null,
  mobBars: [],
  combatText: combatTextPool,
  reviveCircles: [],
  project: null,
  localCast: null,
  arenaZones: null,
  arenaId: null,
  arenaName: null,
  cameraView: null,
  spectateZone: null,
  spectateOffer: null,
};

let nextCombatTextId = 1;
/** live density cap — a graphics setting; the POOL is always MAX_COMBAT_TEXT. */
let combatTextCap = 48;
/** how much of the fight gets numbered — a graphics setting (see CombatTextScope). */
let combatTextScope: CombatTextScope = "team";

/** Set the max concurrent floating numbers (graphics "damage-number density"). */
export function setDamageNumberCap(cap: number): void {
  combatTextCap = Math.max(4, Math.min(MAX_COMBAT_TEXT, Math.round(cap)));
  // Shrinking mid-fight retires the LEAST IMPORTANT live numbers, not the
  // first ones in the array — same policy as admission.
  for (;;) {
    let live = 0;
    for (const e of combatTextPool) if (e.active) live++;
    if (live <= combatTextCap) break;
    const worst = worstEntryIndex(combatTextPool, -Infinity, performanceNowSafe());
    if (worst < 0) break;
    combatTextPool[worst]!.active = false;
  }
}

/** Set how much of the fight is numbered (graphics "combat text"). */
export function setCombatTextScope(scope: CombatTextScope): void {
  combatTextScope = scope;
  if (scope === "off") for (const e of combatTextPool) e.active = false;
}

/** `performance.now()` where available; the pure fallback keeps node tests happy. */
function performanceNowSafe(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export interface CombatTextInput {
  kind: CombatTextKind;
  amount: number;
  sourceRel: CombatTextRelation;
  targetRel: CombatTextRelation;
  crit: boolean;
  blocked: boolean;
  killingBlow: boolean;
  targetId: number;
  worldX: number;
  worldZ: number;
  nowMs: number;
  /** damage school — only meaningful when kind === "damage" */
  dmgType?: "physical" | "magic" | "true";
  /** 覆蓋掉算出來的字（見 {@link CombatTextEntry.label}） */
  label?: string;
}

/**
 * Admit one combat-text event. Order of operations (each step documented at its
 * definition in ui/combatText):
 *   1. category + scope — drop what this player asked not to see;
 *   2. same-tick coalesce on (target, category) — kills the one-tick AoE spike
 *      without a merge window;
 *   3. per-target overflow — no body carries a pile;
 *   4. free slot, else PRIORITY admission — the newcomer displaces the least
 *      important, most-faded live entry, or is dropped if it is the least
 *      important thing on screen;
 *   5. RO multi-hit stagger — simultaneous spawns on one body are released in
 *      sequence rather than stacked.
 */
export function pushCombatText(input: CombatTextInput): void {
  const category = combatTextCategory({
    kind: input.kind,
    amount: input.amount,
    sourceRel: input.sourceRel,
    targetRel: input.targetRel,
    crit: input.crit,
    blocked: input.blocked,
    killingBlow: input.killingBlow,
  });
  if (!category || combatTextScope === "off") return;
  // With NO local player resolved — spectating, pre-match, or before the seat
  // is known — there is no "you" for anything to be relative to, so every event
  // lands in the third-party band and a self/team scope would blank the screen
  // silently. A spectator wants to see the whole fight anyway, so the scope gate
  // is skipped exactly in that case (and only that case).
  const noLocalPlayer = input.sourceRel === "unknown" && input.targetRel === "unknown";
  if (!noLocalPlayer && !scopeAllows(combatTextScope, category)) return;

  const mods = { crit: input.crit, killingBlow: input.killingBlow, dmgType: input.dmgType };
  const style = combatTextStyle(category, mods);
  const now = input.nowMs;

  // 2) same-tick coalesce. A crit or a killing blow NEVER merges: those are the
  // numbers you most want to see, and burying one inside a running total
  // destroys it.
  if (!input.crit && !input.killingBlow) {
    for (const e of combatTextPool) {
      if (!e.active || e.targetId !== input.targetId || e.category !== category) continue;
      if (e.crit || e.killingBlow) continue;
      // ...and the same damage SCHOOL. Since owner's 2026-08-01 ruling the fill
      // is the school (紅物理/紫魔法/白真實), so folding a 真實 tick into a live
      // 物理 number would paint the sum in the first arrival's colour — one
      // number claiming both hits were physical. Off a damage category both
      // sides are `undefined` and this compares equal, so heal/mana coalescing
      // is untouched.
      if (e.dmgType !== input.dmgType) continue;
      // …以及**同一行字**。標記的浮動文字借用 `evade` 這個 category（見
      // `CombatTextEntry.label`），所以一次免死跟一次真的閃避在這裡長得一樣，
      // 合併起來就會把「試煉 ×11」跟「閃避」揉成同一格 —— 而合併是把 amount
      // 加起來，字卻是先到的那個，於是螢幕上只剩一個。兩邊都 undefined 時
      // 這行比較相等，所有既有的合併行為原封不動。
      if (e.label !== input.label) continue;
      if (now - e.bornMs > COALESCE_MS || now < e.bornMs) continue;
      e.amount += input.amount;
      e.worldX = input.worldX;
      e.worldZ = input.worldZ;
      return;
    }
  }

  // 3) per-target overflow
  let slot = overflowOnTargetIndex(combatTextPool, input.targetId, now);

  // 4) a free slot within the live cap, else priority admission
  if (slot < 0) {
    let live = 0;
    let free = -1;
    for (let i = 0; i < combatTextPool.length; i++) {
      const e = combatTextPool[i]!;
      if (e.active) live++;
      else if (free < 0) free = i;
    }
    slot =
      live < combatTextCap && free >= 0 ? free : worstEntryIndex(combatTextPool, style.rank, now);
  }
  if (slot < 0) return; // every live number outranks this one — drop it

  // 5) RO multi-hit stagger: how many numbers this body already got THIS frame
  let bornThisFrame = 0;
  let lane = 0;
  for (const e of combatTextPool) {
    if (!e.active || e.targetId !== input.targetId || e.slot === slot) continue;
    lane++;
    if (e.bornMs >= now - COALESCE_MS) bornThisFrame++;
  }
  const stagger = Math.min(MAX_STAGGER_STEPS, bornThisFrame) * SPAWN_STAGGER_MS;

  const entry = combatTextPool[slot]!;
  entry.id = nextCombatTextId++;
  entry.active = true;
  entry.category = category;
  entry.amount = input.amount;
  entry.crit = input.crit;
  entry.killingBlow = input.killingBlow;
  entry.dmgType = input.dmgType;
  // 一定要**每次**寫（含 undefined）—— 這是一個被重複認領的池格，漏掉這行的話
  // 一個標記的「試煉 ×11」會黏在下一個接手這格的普通數字上。
  entry.label = input.label;
  entry.targetId = input.targetId;
  entry.rank = style.rank;
  entry.lane = lane;
  entry.worldX = input.worldX;
  entry.worldZ = input.worldZ;
  entry.anchorY = style.anchorY;
  entry.bornMs = now + stagger;
  entry.lifeMs = style.lifeMs;
  entry.pose.visible = false;
}

// ---------------------------------------------------------------------------
// 迴避 (task #92b)
// ---------------------------------------------------------------------------

/**
 * How an entity relates to the LOCAL player, resolved from the champion anchor
 * table this bus already maintains.
 *
 * The other combat-text producer resolves this from injected `localEntityId` /
 * `teamOf` lookups. This one cannot: `evade` is ingested at the network seam,
 * which has no content/seat context. It does not need one — `frameBus.champions`
 * is written every frame with `isLocal` and `teamId` for exactly the entities
 * that can appear on screen, and it is the same table the renderer projects
 * from, so a relation resolved here can never disagree with what is drawn.
 *
 * "unknown" is the honest answer in three real cases and they all matter:
 * before the local seat exists (pre-match / 觀戰), and for a source that is not
 * a champion at all — a guardian's attack has no anchor entry, and it must NOT
 * be mistaken for yours.
 */
export function relationToLocal(entityId: number | undefined): CombatTextRelation {
  if (entityId === undefined) return "unknown";
  const them = frameBus.champions.get(entityId);
  let local: ChampionAnchor | undefined;
  for (const a of frameBus.champions.values()) {
    if (a.isLocal) {
      local = a;
      break;
    }
  }
  if (!local) return "unknown";
  if (local.entityId === entityId) return "self";
  if (!them) return "unknown";
  return them.teamId === local.teamId ? "ally" : "enemy";
}

/**
 * Admit one 迴避 — the defender's stat ate a basic attack whole
 * (packages/shared/src/sim/combat/evasion.ts `rollEvade`).
 *
 * Deliberately a thin adapter over `pushCombatText` rather than a second
 * spawner: the dodge then inherits, for free and by construction, every policy
 * task #92 established — the scope gate, the same-tick coalesce (a champion
 * dodging two attackers on one tick gets ONE 「閃避」, not a stack), the
 * per-target cap, priority admission, the RO multi-hit stagger, the pooled node,
 * the lob, and the runtime-probed gradient fill that fixed #164. An evade has no
 * magnitude, so `amount` is 0 and the label comes from the word table; `crit`
 * and `killingBlow` are false because `rollEvade` returns before any of that is
 * computed (evasion.ts DECISION 3 — a dodge is a total miss, not mitigation).
 *
 * The text is anchored on the DEFENDER's body in both readings. That is the
 * point: 「閃避」 over your own head and "MISS" over theirs is the same fact
 * told from two seats, and the position is what tells you which seat you are in.
 */
export function pushEvadeText(input: {
  /** attacker entity id (may be a non-champion, e.g. a guardian) */
  source: number | undefined;
  /** defender entity id — the body the text is anchored on */
  target: number;
  worldX: number;
  worldZ: number;
  nowMs: number;
  /**
   * 覆蓋要畫的字。缺席 = 「閃避」。⭐ `immune`（無敵 / 型別連擊免疫）走這一格 ——
   * 入場政策、同 tick 合併、每體上限、優先 admission 全部免費繼承，
   * ⛔ 不是第二條浮動文字管線。
   */
  label?: string;
}): void {
  pushCombatText({
    kind: "evade",
    amount: 0,
    sourceRel: relationToLocal(input.source),
    targetRel: relationToLocal(input.target),
    crit: false,
    blocked: false,
    killingBlow: false,
    targetId: input.target,
    worldX: input.worldX,
    worldZ: input.worldZ,
    nowMs: input.nowMs,
    ...(input.label !== undefined ? { label: input.label } : {}),
  });
}

// ---------------------------------------------------------------------------
// 【具名標記】的免死攔截 (GH#278)
// ---------------------------------------------------------------------------

/**
 * 一次免死攔截浮在被救的那具身上：「試煉 ×11」。
 *
 * ⚠️ 這是玩家**唯一**知道剛才發生了什麼的通道。免死是在 sim 的傷害管線裡、
 * 護盾之後扣血之前做掉的（`combat/lethalSave.ts`），沒有快照欄位、沒有
 * `ENTITY_FLAG` 位元 —— 沒有這行字，一次成功的救活在螢幕上長得跟「那一發傷害
 * 算錯了」一模一樣（`immune` / `taunt` 進 eventFanout 用的是同一個理由）。
 *
 * 跟 {@link pushEvadeText} 一樣刻意做成 `pushCombatText` 的薄轉接：入場政策、
 * 同 tick 合併、每體上限、優先 admission、多段錯開、#164 那個漸層填色全部免費
 * 繼承。差別只有一個 —— 字是內容給的，所以走 `label` 覆蓋。
 *
 * ⚠️ **已知限制（誠實寫下來）**：category 由 `combatTextCategory` 從關係推導，
 * 而 `evade` 這個 kind 對「敵方身上」回 null。所以敵人免死時這行字不會畫。
 * 那跟閃避的既有政策一致（別人的無量值事件不進你的畫面），但它是一個選擇，
 * 不是疏漏 —— 要改的話是給標記自己一個 category，不是在這裡繞過去。
 */
export function pushMarkSaveText(input: {
  /** 被救的那具身體 —— 字掛在它身上 */
  target: number;
  /** 已經解析成人看得懂的字（`ui/hud/markModel.markSaveText`） */
  label: string;
  worldX: number;
  worldZ: number;
  nowMs: number;
}): void {
  pushCombatText({
    kind: "evade",
    amount: 0,
    sourceRel: "unknown",
    targetRel: relationToLocal(input.target),
    crit: false,
    blocked: false,
    killingBlow: false,
    targetId: input.target,
    worldX: input.worldX,
    worldZ: input.worldZ,
    nowMs: input.nowMs,
    label: input.label,
  });
}

/** Release every entry whose life has run out. Called once per frame. */
export function expireCombatText(nowMs: number): void {
  for (const e of combatTextPool) {
    if (e.active && nowMs - e.bornMs > e.lifeMs) e.active = false;
  }
}

/** Release everything (match teardown / round reset). */
export function clearCombatText(): void {
  for (const e of combatTextPool) e.active = false;
}

/**
 * Drop every WORLD-ANCHORED datum (task #216) — the frame's way of saying
 * "there is no arena on screen right now".
 *
 * THE BUG. The world-anchored layer (HP bars, names, cast bars, revive rings,
 * floating numbers) is DOM painted at projected world positions, so it only
 * means anything while the arena canvas UNDER it is actually being drawn. The
 * intermission/shop scene suppresses that draw
 * (`hudActions.setArenaRenderSuppressed`) while `GameApp` kept feeding this bus
 * every frame regardless — which is why the owner saw 「戰場上的血條」 hovering
 * over the shop with nothing behind them.
 *
 * `WorldAnchorLayer`'s rAF removes a champion's node the moment its anchor
 * leaves `champions`, and skips a combat-text slot that is not `active`, so
 * emptying the bus IS the teardown. Idempotent and cheap: once cleared, every
 * subsequent suppressed frame is a handful of empty checks.
 *
 * NOT cleared: `project` / `arenaZones` / `arenaId` / `arenaName` / `cameraView` /
 * `spectateZone` are the arena's DESCRIPTION, not per-frame combat state. The
 * minimap and the projection must survive an intermission so the next combat
 * frame has geometry to draw against instead of one blank frame.
 */
export function clearWorldAnchors(): void {
  frameBus.champions.clear();
  // The king is per-frame combat state like every anchor: a teardown that left
  // it set would paint a skull on the intermission map at the last position it
  // held, for as long as nobody started another round.
  frameBus.mobBoss = null;
  // 同理，而且**更容易漏掉**：`mobBars` 是一個原地重用的陣列，不清空的話中場
  // 那幾幀會有一排精英血條掛在商店上（就是 #216「戰場上的血條」那個症狀的小怪版）。
  frameBus.mobBars.length = 0;
  frameBus.reviveCircles.length = 0;
  frameBus.localCast = null;
  clearCombatText();
}
