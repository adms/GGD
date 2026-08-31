/**
 * audio/spatialPolicy — the ONE list that says which sounds are allowed to move
 * and which must stay dead centre (task #259).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A TABLE AND NOT A JUDGEMENT AT EACH CALL SITE
 * ═══════════════════════════════════════════════════════════════════════════
 * The boundary is not obvious and it is not local. `coinPickedUp` carries a
 * world x/z and must NEVER be panned (it is the 「你拿到錢了」 scoreboard beat);
 * `crowdCheer` is a world event with no direction at all (the stand is AROUND
 * you); a shop button has a position ON SCREEN which is not a world coordinate.
 * Spread that reasoning across forty call sites and the next UI sound someone
 * adds gets panned by accident — silently, because nothing goes red.
 *
 * So the boundary is DECLARED here, one row per sound, with the reason on the
 * row, and `spatialPolicy.test.ts` proves the table is EXHAUSTIVE against two
 * generated inventories that nobody maintains by hand:
 *   • `sfxReachability.SFX_REACHABILITY` — one row per audio-map SFX key, itself
 *     already pinned to the map's key set by `sfxReachability.test.ts`;
 *   • the champion voice pack manifest's own category list (46 of them).
 * A new sound in either inventory is UNCLASSIFIED and the suite goes red until
 * somebody writes down which side of the line it is on.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TEST, IN ONE QUESTION
 * ═══════════════════════════════════════════════════════════════════════════
 *   → Does this sound have a place IN THE WORLD that the player should hunt for
 *     with their ears?
 * BOTH halves are required. A coordinate alone is not enough — that is exactly
 * what `guardianSlain` and `coinPickedUp` prove — and the owner's own rule is
 * the other end of it: 「只有自己的才是全播放」, so anything that is YOURS (your
 * score, your gold, your cooldown, your interface, the ambience wrapped around
 * you) is centred no matter where its coordinate says it happened.
 */
import { CENTRED_EVENTS, EVENT_SPATIAL } from "./combatSfxSpatial";
import { SFX_REACH_BY_KEY } from "./sfxReachability";
import type { SpatialSource } from "./spatial";

/**
 * Where a sound is allowed to be placed.
 *
 * `screen` is a real third state, not a hedge: the login dragons are panned from
 * their NDC position on screen (`render/menu/procedural/math.panFromScreenX`)
 * because the login scene has no world listener and the dragon IS a visible
 * object in the frame. It obeys a different law from combat and must not be
 * migrated onto the world engine — nor removed for being "not flat".
 */
export type SpatialPolicy =
  /** placed by world geometry: volume + pan + depth low-pass via audio/spatial. */
  | "world"
  /** the local player's own voice or clock: full level, dead centre, never moved. */
  | "self"
  /** panned by SCREEN position (login scene only — no world listener exists there). */
  | "screen"
  /** chrome / HUD / announcer / ambience: no placement, ever. */
  | "flat";

export interface PolicyRow {
  readonly policy: SpatialPolicy;
  /** why — in one line, and it must survive being read out loud to the owner. */
  readonly reason: string;
}

/**
 * SFX keys that reach `playSfx` from a CLIENT module (UI, HUD, phase edges,
 * tallies) — i.e. everything `sfxReachability` marks `kind: "client"`.
 *
 * Combat-driven keys are NOT in here: they are classified per EVENT TYPE in
 * `combatSfxSpatial` (`EVENT_SPATIAL` = placed, `CENTRED_EVENTS` = deliberately
 * centred, each with its own reason), and the test below checks that side too so
 * the two tables cannot drift into disagreeing.
 */
export const CLIENT_SFX_POLICY: Readonly<Record<string, PolicyRow>> = {
  // ── the one client-side key that IS a world sound ────────────────────────
  footstep: {
    policy: "world",
    reason: "eleven other bodies walk around you; your own step is pushed centred (source null)",
  },

  // ── login scene: screen-space, deliberately its own law ──────────────────
  dragonRoar: { policy: "screen", reason: "login boss is a VISIBLE object; pan from NDC (no world listener on that scene)" },
  dragonRoarBig: { policy: "screen", reason: "the same login dragon law — near/far roar pair" },

  // ── your score / your body / your clock: HUD beats ───────────────────────
  kill: { policy: "flat", reason: "YOUR kill tally — a scoreboard beat, not a place" },
  multiKill: { policy: "flat", reason: "YOUR multi-kill tally — a scoreboard beat" },
  death: { policy: "flat", reason: "YOUR death — the most centred thing that can happen" },
  allySlain: { policy: "flat", reason: "your team's scoreboard, not the corpse's location" },
  levelUp: { policy: "flat", reason: "your own progression, not an event in the world" },
  levelUpJingle: { policy: "flat", reason: "your own progression sting" },
  exUnlock: { policy: "flat", reason: "your own EX becoming available to press" },
  exUnlockSting: { policy: "flat", reason: "your own EX unlock sting" },
  lowHealth: { policy: "flat", reason: "your own hp state — a warning to YOU" },
  respawn: { policy: "flat", reason: "you are back on your feet — the sound is about you" },

  // ── surrounds you / has no direction by nature ───────────────────────────
  crowdCheer: { policy: "flat", reason: "#234 「周圍觀眾歡呼」 — the stand is AROUND you; panning it puts the whole crowd in one ear" },
  crowdCheerBig: { policy: "flat", reason: "the same surrounding crowd, bigger moment" },
  arenaAmbience: { policy: "flat", reason: "arena room tone — it IS the room around you" },
  merchantAmbience: { policy: "flat", reason: "intermission room tone — the shop is around you" },

  // ── broadcast / announcer (the JP system voice) ──────────────────────────
  matchStart: { policy: "flat", reason: "announcer — spoken to you, from nowhere" },
  matchStartGong: { policy: "flat", reason: "broadcast stinger over the whole arena" },
  roundStart: { policy: "flat", reason: "announcer — spoken to you, from nowhere" },
  vsReveal: { policy: "flat", reason: "broadcast presentation, before anyone has a position" },
  matchEndGong: { policy: "flat", reason: "broadcast stinger over the whole arena" },
  champSelectConfirm: { policy: "flat", reason: "champ-select confirm — there is no arena yet" },
  settlementReveal: { policy: "flat", reason: "settlement presentation — the match is already over" },

  // ── countdown ────────────────────────────────────────────────────────────
  countTick: { policy: "flat", reason: "a countdown clock, and the clock is yours" },
  countFinal: { policy: "flat", reason: "the same clock, on its last beat" },

  // ── chrome: buttons, shop, draft ─────────────────────────────────────────
  uiClick: { policy: "flat", reason: "UI has screen position, not world position — judgement test fails at step one" },
  uiHover: { policy: "flat", reason: "UI focus tick — it follows the cursor, not a body" },
  uiHoverCyber: { policy: "flat", reason: "UI focus tick, cyber variant — same argument" },
  uiTabSwitch: { policy: "flat", reason: "UI navigation — a panel change, not a place" },
  uiToggle: { policy: "flat", reason: "UI switch — an answer to YOUR press" },
  uiType: { policy: "flat", reason: "keystroke tick — it happens under your fingers" },
  uiDenied: { policy: "flat", reason: "UI refusal — an answer to YOUR press" },
  uiCancel: { policy: "flat", reason: "UI dismissal — an answer to YOUR press" },
  panelOpen: { policy: "flat", reason: "a panel opening on screen, not in the arena" },
  shopPurchase: { policy: "flat", reason: "shop cards live on screen; a moving buy sound is the fastest way to ruin this feature" },
  goldGain: { policy: "flat", reason: "your wallet ticking up — a HUD beat" },
  draftConfirm: { policy: "flat", reason: "draft UI — the card is on screen, not on the ground" },
  draftCardReveal: { policy: "flat", reason: "draft card flip — screen position is not world position" },
  legendaryRoll: { policy: "flat", reason: "legendary orb roll — a ceremony about your wallet" },
  legendaryWin: { policy: "flat", reason: "legendary orb payout — your reward, centred" },
};

/**
 * Every category in the champion voice pack (`content/assets/audio/voices/
 * champions/MANIFEST.json`), classified.
 *
 * `dispatched: false` means NOTHING in the client fires it today (the dormant
 * half of voice-binding-design.md). Those rows still carry a policy on purpose:
 * the day one of them is wired, the decision is already written down and the
 * wiring cannot quietly default to centre — which is precisely how the whole
 * voice channel ended up unspatialised in the first place.
 */
/**
 * ⭐ GH#441 —— 一格休眠語音**卡在哪一種東西**上。owner 2026-08-22：「補阿」。
 *
 * ⚠️ 「沒有觸發點」有**兩種**，而它們的修法完全不同 —— 把兩種混成一句
 * 「dormant」，下一個人就得把整條路重查一遍才知道自己要做的是哪一件事：
 *
 * | | 意思 | 補它要做什麼 |
 * |---|---|---|
 * | `no-signal` | 遊戲裡**根本沒有這件事**（沒有狀態文件、沒有事件、沒有輸入通道） | 先做一個**機制**。⛔ 不是接一條線 |
 * | `no-wiring` | 訊號**今天就在線上**，只是沒有人讀它的上升緣 | 一個 edge detector，跟 `stun`/`slow`/`bind` **逐字同一個模板** |
 *
 * ⭐ `no-wiring` 的宣稱是**可以被反駁的**：`statusIds` 逐個都必須真的是
 * `content/status-effects/<id>.json`，而 `spatialPolicy.test.ts` 去讀那個目錄。
 * 所以「訊號已經出貨」這句話沒有辦法慢慢腐爛成假的（第三守則）。
 */
export type DormantCause = "no-signal" | "no-wiring";

export interface DormantVerdict {
  readonly cause: DormantCause;
  /** 一行：為什麼是這個結論。⛔ 不要只複述 cause。 */
  readonly note: string;
}

export interface VoicePolicyRow extends PolicyRow {
  /** does any client code path fire this category today? */
  readonly dispatched: boolean;
  /** ⛔ 只有 `dispatched: false` 才有；⭐ 而那時候它是**必填**（見守衛）。 */
  readonly dormant?: DormantVerdict;
  /**
   * ⭐ GH#743 —— **今天真的出貨**的 `content/status-effects/<id>.json`，這一格語音
   * 就是替它們說話的。
   *
   * ⚠️ 它住在**列上**而不是 `dormant` 裡，⛔ 這不是排版偏好：`dormant` 在接線那一天
   * 會整塊消失（守衛：`dispatched: true` 的列不可以帶 dormant），而「哪幾個狀態
   * 對到這一句」在那一天**只會變得更重要** —— 它正是接線要讀的那張表。
   * 把它埋在 dormant 裡等於保證接線的人得先把它抄到第二個住處（第〇·四守則）。
   *
   * ⭐ 它是**可以被反駁**的宣稱：`spatialPolicy.test.ts` 逐個回去讀
   * `content/status-effects/`，改名或撤掉一個 ⇒ 紅，⛔ 不是靜默腐爛。
   *
   * ⭐⭐ 而載具問題（GH#743 票文寫「ENTITY_FLAG FREE_BITS 只剩 5 格，四類佔 4 格
   * 太奢侈」）**在 2026-08-27 量掉了**：`SeatState.statusIds` 是
   * `apps/game-server/src/net/snapshot.ts` 的座位迴圈**逐座位全送**的
   * （`MatchState.seats` 沒有任何 Colyseus filter），而 `EntityState.seatId` 也在
   * 線上 ⇒ 任何一具身體都查得到它此刻身上的狀態 id。
   * ⇒ ⛔ **不需要新的 ENTITY_FLAG bit、不需要動協定、不需要動 game-server。**
   * 缺的只是上升緣（`statusVoiceEdges.ts`）與一個呼叫端。
   */
  readonly statusIds?: readonly string[];
}

/** `skill-name.<slot>` is one policy for all five slots (matched by prefix). */
export const SKILL_NAME_PREFIX = "skill-name.";

export const VOICE_CATEGORY_POLICY: Readonly<Record<string, VoicePolicyRow>> = {
  // ── placed: ANY champion may speak these, so they carry a body ───────────
  "hurt": { policy: "world", reason: "#223 fans it out to every victim — 「誰在痛」 is the information", dispatched: true },
  "hurt-heavy": { policy: "world", reason: "same, at the heavy threshold", dispatched: true },
  "defeat": { policy: "world", reason: "#223 — 「誰死了」, and where", dispatched: true },
  "crit": { policy: "world", reason: "spoken by the ATTACKER, who may be anyone on the field", dispatched: true },
  "attack-heavy": { policy: "world", reason: "二擇一 with crit at the same call site, same speaker", dispatched: true },
  "skill-name.q": { policy: "world", reason: "any caster shouts it — twelve of these is the loudest hole in the old build", dispatched: true },
  "skill-name.w": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "skill-name.e": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "skill-name.r": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "skill-name.ex": { policy: "world", reason: "see skill-name.q", dispatched: true },
  "stun": { policy: "world", reason: "the CC edge fires for every champion, including the other duel", dispatched: true },
  "slow": { policy: "world", reason: "same CC edge detector, same fan-out as stun", dispatched: true },
  "bind": { policy: "world", reason: "same CC edge detector, same fan-out as stun", dispatched: true },

  // ── yours: full level, dead centre (owner: 只有自己的才是全播放) ──────────
  "curse": { policy: "self", reason: "LOCAL hard-CC 怒罵 — 二擇一 with stun/bind, only ever your own hero", dispatched: true },
  "block": { policy: "self", reason: "an answer to YOUR guard", dispatched: true },
  "dodge": { policy: "self", reason: "an answer to YOUR evade", dispatched: true },
  "healed": { policy: "self", reason: "your own restore", dispatched: true },
  "attack-light": { policy: "self", reason: "your own windup (owner hard rule: local only)", dispatched: true },
  "sprint": { policy: "self", reason: "your own dash", dispatched: true },
  "hum": { policy: "self", reason: "your own idle", dispatched: true },
  "quote": { policy: "self", reason: "you clicked your own hero / your own settlement card", dispatched: true },
  "select": { policy: "self", reason: "champ-select click — no arena exists yet", dispatched: true },
  "victory": { policy: "self", reason: "your round/match win", dispatched: true },
  "first-blood": { policy: "self", reason: "YOUR first blood (AudioDirector reads your own tally)", dispatched: true },
  "kill-1": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-2": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-3": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-4": { policy: "self", reason: "your kill streak", dispatched: true },
  "kill-5": { policy: "self", reason: "your kill streak", dispatched: true },
  "unstoppable": { policy: "self", reason: "your streak", dispatched: true },

  // ── dormant: no dispatch site yet; the decision is pre-made ──────────────
  "knockdown": { policy: "world", reason: "GH#441 —— 由 `knockdown` 事件的受害者說（GameApp.dispatchContextualVoice）", dispatched: true },
  "taunt": { policy: "world", reason: "GH#441 —— shopPerformVoice 早就在播它（celebrate/spell/attack 三種表演）；商店場景沒有 world listener ⇒ 那條路置中，戰鬥若接上仍走 world", dispatched: true },
  "charge": { policy: "world", reason: "GH#441 —— shopPerformVoice 的 spell/attack 表演已在播；商店無 world listener ⇒ 置中，戰鬥若接上仍走 world", dispatched: true },
  "jump": { policy: "world", reason: "GH#441 —— 由 ENTITY_FLAG.AIRBORNE 的上升緣說（#247 的 leap 在飛）；它屬於一具身體", dispatched: true },
  "poison": {
    policy: "world",
    reason: "status line — same family as stun/slow/bind",
    dispatched: true,
    statusIds: ["poison"],
  },
  "blind": {
    policy: "world",
    reason: "status line",
    dispatched: true,
    statusIds: ["blind"],
  },
  "paralyzed": {
    policy: "world",
    reason: "status line",
    dispatched: true,
    statusIds: ["paralysis", "numbness"],
  },
  "confused": {
    policy: "world",
    reason: "status line",
    dispatched: true,
    statusIds: ["confusion"],
  },
  "retreat": {
    policy: "self",
    reason: "a call YOU make",
    dispatched: true,
  },
  "free-move": { policy: "self", reason: "GH#441 —— shopPerformVoice 的 pose 表演已在播；你自己的英雄，置中", dispatched: true },
  "love": {
    policy: "self",
    reason: "emote — yours",
    dispatched: true,
  },
  "puzzled": {
    policy: "self",
    reason: "emote — yours",
    dispatched: true,
  },
  "thanks": { policy: "self", reason: "GH#441 —— shopPerformVoice 的 talk/nod 表演已在播；你自己的英雄，置中", dispatched: true },
  "thumbs-up": { policy: "self", reason: "GH#441 —— shopPerformVoice 的 celebrate 表演已在播；你自己的英雄，置中", dispatched: true },
  "watch": { policy: "self", reason: "GH#441 —— shopPerformVoice 的 pose 表演已在播；你自己的英雄，置中", dispatched: true },
  "respond.ok": {
    policy: "self",
    reason: "ping response — yours",
    dispatched: true,
  },
  "respond.no": {
    policy: "self",
    reason: "ping response — yours",
    dispatched: false,
    dormant: {
      cause: "no-signal",
      note: "同 respond.ok",
    },
  },
};

/**
 * ⭐ GH#441 —— 今天**沒有任何呼叫端**的語音格，以及各自卡在哪一種東西上。
 *
 * ⚠️ 出貨的 51 個語音包每一位英雄都錄了這幾句，所以每一格休眠 = 51 個真的躺在
 * `content/assets/audio/voices/lines/` 的 mp3。⭐ 其中 `no-wiring` 那三格
 * （致盲／癱瘓／混亂）的訊號**今天就在線上**，補它們是一個 edge detector，
 * 跟 `GameApp.dispatchStatusVoice` 已經在做的 stun/slow/bind 逐字同一個模板。
 */
export function dormantVoiceCategories(): readonly (readonly [string, DormantVerdict])[] {
  const out: (readonly [string, DormantVerdict])[] = [];
  for (const [cat, row] of Object.entries(VOICE_CATEGORY_POLICY)) {
    if (!row.dispatched && row.dormant) out.push([cat, row.dormant] as const);
  }
  return out;
}

/** Policy for a voice category (skill-name.* collapses to one rule). */
export function voicePolicyFor(category: string): VoicePolicyRow | null {
  return VOICE_CATEGORY_POLICY[category] ?? null;
}

/** Is this voice category placed in the world? (false ⇒ centred + full level.) */
export function isWorldVoice(category: string): boolean {
  return voicePolicyFor(category)?.policy === "world";
}

/**
 * Combat SFX event types classified as PLACED, from the table that actually
 * drives the mixer — re-exported here only so the boundary can be enumerated in
 * one place. `combatSfxSpatial` stays the authority.
 */
export function combatEventPolicy(eventType: string): SpatialPolicy | null {
  if (EVENT_SPATIAL[eventType]) return "world";
  if (CENTRED_EVENTS[eventType]) return "flat";
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// GH#440 —— 政策表的**單一入口**（在這之前它一個出貨呼叫端都沒有，見 GH#441）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 一個 SFX **key** 的空間政策，⛔ 不是「觸發它的那顆事件」的政策。
 *
 * ⚠️ 這個區別就是 GH#440 的整個缺陷。`combatSfxSpatial` 是按 **`ev.type`** 分類的
 * （一顆事件一發聲音的世界裡那是對的），而 GH#390 的特效自帶音效打破了那個假設：
 * 同一顆 `abilityCast` 現在會播**別的 key**（家族的 `soundLaunch` / `soundLoop`）。
 * 於是 `fireRingLoop`（政策 flat，理由「火圈包住你，非方向性」）被 tornado /
 * flamePillar / breath 當成循環音掛在施法者身上 —— **被 pan 掉，而兩張表都沒有反對過**，
 * 因為沒有人問過 key 自己的政策。
 *
 * ⭐ 推導，⛔ 不是第四張手寫表（第一守則：一個事實一個住處）：
 *   • client 播的 key → {@link CLIENT_SFX_POLICY} 那一列（explicit）
 *   • combat 播的 key → 它**自己那一列**登記的事件，經 {@link combatEventPolicy}
 *     （任何一顆事件是刻意置中的 ⇒ 整個 key 置中，⛔ 保守那一邊）
 *   • 兩邊都沒有 → **null**。呼叫端一律置中（fail-safe：沒宣告過的東西不准被 pan），
 *     而 `sfxPolicyGate.test.ts` 會**紅**，⛔ 不是靜默吃掉。
 */
export function sfxKeyPolicy(key: string): SpatialPolicy | null {
  const client = CLIENT_SFX_POLICY[key];
  if (client) return client.policy;
  const row = SFX_REACH_BY_KEY.get(key);
  const events = row?.kind === "combat" ? (row.events ?? []) : [];
  if (events.length === 0) return null;
  let sawWorld = false;
  for (const ev of events) {
    const p = combatEventPolicy(ev);
    if (p === null) return null; // 事件本身沒分類 ⇒ 這個 key 也沒有
    if (p !== "world") return "flat"; // 保守：任何一顆刻意置中 ⇒ 整個 key 置中
    sawWorld = true;
  }
  return sawWorld ? "world" : null;
}

/**
 * ⭐ **每一發送進 `SpatialSfxQueue` 的聲音都要先經過這裡。**
 *
 * 回傳呼叫端提出的那個位置，或 **null**（＝置中播放，⛔ 不是不播）。null 有三個
 * 來源，呼叫端**不需要**分辨：政策說 flat／政策說 self／這個 key 根本沒有政策。
 * 三種的正解都一樣 —— 置中。
 *
 * ⛔ 它不會把 null 變成一個位置：政策只會**拿掉**位置，永遠不會憑空給一個。
 */
export function spatialSourceFor(key: string, source: SpatialSource | null): SpatialSource | null {
  if (!source) return null;
  return sfxKeyPolicy(key) === "world" ? source : null;
}

// ───────────────────────────────────────────────────────────────────────────
// K3 GH#638 —— 另一場地的演出不可外漏（owner：「另外一個場地的聲音、語音、震動、
// 閃爍等畫面不應該影響到目前場地」）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 這一顆事件發生在哪個 duel zone。
 *
 * 順序：payload 自帶的 `zone`（sim 的 `screenFlash`/`screenShake` 真的送這一格，
 * `sim/effects/clientCues.ts` 的 `ScreenCueRecipients`；GH#678 起 `death` 也送 ——
 * `sim/systems/DeathSystem.ts` 的 `DeathEvent`，因為 defeat 語音喊的那一刻
 * 實體可能已出快照，客戶端歸不了戶）→ 空間表
 * （{@link EVENT_SPATIAL}）登記的實體欄位逐一問 `zoneOfEntity`。
 *
 * ⭐ 刻意**不**做泛用欄位猜測：不在空間表上的事件（`guardianSlain` / `rankUp` /
 * `coinPickedUp` 那一族）是 seat-gated 的 HUD 節拍，本來就只屬於本地玩家 ——
 * 替它們猜 zone 只會把「你分到了金幣」錯丟掉。
 *
 * null = 歸不了戶 ⇒ 呼叫端**放行**（fail-open，與 `VisibleZones` 同一個失效方向：
 * 最壞情況是照舊多播一聲，⛔ 不是資訊不見）。
 */
export function cueEventZone(
  type: string,
  data: Record<string, unknown>,
  zoneOfEntity: (id: number) => number | null,
): number | null {
  const z = data["zone"];
  if (typeof z === "number" && Number.isInteger(z) && z >= 0) return z;
  const spec = EVENT_SPATIAL[type];
  if (!spec) return null;
  for (const field of spec.entityFallback) {
    const id = data[field];
    if (typeof id !== "number" || !Number.isFinite(id)) continue;
    const ez = zoneOfEntity(id);
    if (ez !== null) return ez;
  }
  return null;
}

/**
 * 這一發（音效／語音／震動／閃爍）輪不輪得到本地聽或看。
 *
 * `viewing` = 本地正在觀看的 zone 集合 —— ⭐ 觀戰時它**跟著觀看目標走**
 * （`GameApp.refreshVisibleZones` 把 #269 的觀戰 zone 一起加進去），
 * ⛔ 不是寫死本地。歸不了戶（null）= 放行。
 */
export function zoneAllowsCue(
  eventZone: number | null,
  viewing: { has(zone: number): boolean },
): boolean {
  return eventZone === null || viewing.has(eventZone);
}
