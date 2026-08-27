/**
 * audio/combatSfx — the PURE event → SFX-key mapping for the per-frame combat
 * sound layer. The GameApp drains MSG.EVENT each frame and calls
 * `audioSystem.playSfx(combatSfxKey(ev))`; this function is the whole decision.
 *
 * Design:
 *   • The rich `damage` event drives the type-differentiated HIT voice —
 *     物理 (hit) / 魔法 (hitMagic) / true (hitTrue) — and the special reactions
 *     防禦 (block, a shield/DR-absorbed hit) and crit. This is the single hit
 *     voice, so `basicAttackHit` (a duplicate of the same moment) maps to
 *     nothing — no double-thud. The ONE exception is a tracked bow arrow (see
 *     `arrowPierce` below).
 *     ⭐ GH#763 —— 普通物理命中那**一條**分支移到了它的雙生事件 `hitImpact`
 *     上，因為**打擊重量只在那一顆身上**（`profile.tier`）。一次命中仍然恰好
 *     一發：`damage` 讓位的時候 `hitImpact` 才出聲。見 {@link hitWeightKey}。
 *   • 破防 (guardBreak), knockdown and whiff each get their own distinct clip.
 *   • PER-WEAPON / PER-ELEMENT ROUTING (全用). A `basicAttack` plays its
 *     WEAPON-class voice (sword / greatsword / katana / bow / gun / magic /
 *     thrown) derived from
 *     the `weaponClass` the sim now stamps on the event (BasicAttackSystem); an
 *     `abilityCast` plays its ELEMENT whoosh (fire / ice / lightning) derived
 *     from the ability `vfxKey` the sim now forwards (fx.prim.<element>.<shape>).
 *     Both ALWAYS fall back to the generic `basicAttack` / `abilityCast` clip
 *     when the routing data is absent or unrecognised — never silence, never a
 *     crash on a malformed payload.
 *   • PER-ABILITY WC3 CAST VOICE (owner directive: ability ports include 音效).
 *     An ability doc may carry `sfxKey` — the cast sound the SOURCE MAP itself
 *     bound to that ability (w3x gg_snd → imported mp3) — which the sim
 *     forwards on `abilityCast`. It outranks the element whoosh: specific beats
 *     generic, and the WC3 clip is the authentic sound where the element is our
 *     invention. Only cues declared in `content/audio-manifests/ability-sfx-cues.json`
 *     are honoured (see `./abilitySfxCues`), so
 *     a junk payload degrades to the element/generic route, never to a missed
 *     audio-map lookup. It rides `abilityCast` and NOT `castBegin` because
 *     castBegin only exists for casts with a wind-up — an instant cast (裝可愛)
 *     would never sound there — and `abilityCast` is a SUBSTITUTION on an event
 *     that already sounds, so the cast still makes exactly one identity voice.
 *   • The other pre-hit + utility events pass through by name (windup/swing/
 *     launch/cast/flower/heal) — the audio map already owns those keys.
 *   • ARCHERY + 魔法陣 (the three shipped 効果音ラボ clips that had no emit site).
 *     All three are SUBSTITUTIONS on an event that already sounds, never a new
 *     voice: `arrowRelease` replaces the generic `projectileSpawn` launch for a
 *     bow auto's missile, `castCircle` replaces the generic `castBegin` tick for
 *     a LONG wind-up, and `arrowPierce` is the one added layer (a quiet transient
 *     under the thud that already plays). See ARROW TRACKING and
 *     {@link CAST_CIRCLE_MIN_SEC} below.
 *   • `rankUp` (a skill point spent, QWER/EX rank raised) renames to the map's
 *     `abilityRankUp` cue: the sim event and the audio key disagree, so it is a
 *     rename rather than a passthrough. Wired off #51's staged `ability-rank-up`
 *     clip (task-#51 ledger, previously authored-but-silent).
 *     ⭐ AND it is **本人限定** ({@link rankUpKey}): the event is broadcast and
 *     names people by ENTITY id, so without a gate every one of the other five
 *     champions' skill points rang your own progression chime. Back-office
 *     rollback lives in `config.audio-map@1.rankUpAudience`.
 *   • `fireRingStart` (#132) renames to the `fireRingLoop` closing-ring bed: the
 *     FireRingSystem emits the event once as the ring begins to tighten, and the
 *     long crackle-burn clip plays under the accelerating finish. (No true SFX
 *     loop exists on the client, so the ~60 s clip is fired as one long one-shot
 *     at the start edge — see also reviveChannel/arenaAmbience.)
 *   • The death→revive→respawn flow (#84): `reviveChannel` fires when a teammate
 *     first begins channelling a revive circle, `reviveComplete` on the resurrect
 *     itself (both are sim events with the same name as their clip → passthrough).
 *     `respawn` (round re-entry) and `arenaAmbience` are DISCRETE, local/phase
 *     edges owned by the AudioDirector, not this per-frame path.
 *   • `buffApply` (a stat buff / status-up applied) and `explosion` (a ground
 *     AoE detonating at a point) had a map entry but no emit source until the sim
 *     began firing them; they pass through by name.
 *   • `heal` (HP actually restored — flower / ability / lifesteal / item) plays
 *     the staged `magic-heal` cue. Deliberately quiet (map gain 0.41, 400 ms
 *     cooldown) because it can fire often; the flower's own spawn/burst chimes
 *     are a separate moment.
 *   • NEUTRAL GUARDIAN (#89, per-arena faces 樹人/石頭人/巨獸人 in #105). The
 *     tower's telegraphed AoE punish LANDS as `guardianImpact` (one per resolved
 *     mark, all on the same tick), which renames to the heavy stone-shatter
 *     `guardianSlam`. The pre-land `guardianMark` telegraph stays SILENT — it is
 *     the dodge window the VfxSystem draws, and sounding it would pre-announce
 *     the same beat twice. `guardianWake` / `guardianSleep` / `guardianSpawn` /
 *     `guardianHeirPulse` are likewise unmapped (no clip authored for them).
 *   • `guardianSlain` → `guardianLastHit` is the ONE seat-gated decision in this
 *     file. The event is fanned out to every client (eventFanout), so mapping it
 *     unconditionally would ring the gold chime in all six players' ears for a
 *     bounty exactly one of them was paid. It therefore resolves through
 *     `guardianRewardKey(ev, seatId)` against the local seat the AudioDirector
 *     publishes here (see `setCombatSfxSeat`) — once per kill, for the last
 *     hitter only, and never on the void payout (killerSeatId -1 / gold 0).
 *   • `death` / `levelUp` are intentionally NOT mapped: the AudioDirector fires
 *     those off the discrete K/D / level tally, so mapping them here too would
 *     double the sound.
 */
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { hudStore, localDuelZone as storeLocalDuelZone } from "../net/RoomStore";
import { noteFireRingIgnition } from "./fireRingWindow";
import { COMBAT_PHASE, gateCombatBed } from "./combatBedGate";
import { abilitySfxCueAllowed, abilitySfxCueForAbility } from "./abilitySfxCues";

/** Events that keep their own name as the SFX key (already in the audio map). */
const PASSTHROUGH = new Set<string>([
  "attackWindup",
  // `projectileSpawn` and `castBegin` are NOT here: both now have their own
  // case in the switch, because each can resolve to either its generic clip or
  // an archery / 魔法陣 substitute. Their generic key is still the event name.
  "projectileHit",
  "castEnd",
  "castInterrupt",
  "flowerSpawn",
  "flowerBurst",
  "heal", // 回復 — HP actually restored (map key == event name); #51 magic-heal
  // Previously map-only, now fired by the sim (their key == the event name):
  "buffApply", // 增益/狀態提升 — a stat buff was attached to a target
  "explosion", // AoE 爆裂 — a ground-targeted ability detonated at a point
  // Death→revive→respawn flow (#84). Both are sim events named like their clip.
  "reviveChannel", // 復活詠唱進行中 — a teammate began channelling a revive circle
  "reviveComplete", // 復活完成 — the resurrect landed
]);

/**
 * The generic swing (`assets/audio/sfx/fx/swing.mp3`) — a neutral whoosh with no
 * material in it. It is BOTH the fallback for an unrecognised class and the
 * deliberate answer for `thrown`; see WEAPON_SFX.
 */
const GENERIC_SWING = "basicAttack";

/**
 * WEAPON class → basic-attack clip. The class rides on the `basicAttack` event's
 * `weaponClass` field (stamped by BasicAttackSystem from the champion's data).
 * `sword` owns TWO clips: the heavier `attackSword2` doubles as the crit swing,
 * so both authored slashes are used and the pick stays fully deterministic
 * (keyed on the event's own `crit` flag — no rng, no wall clock).
 *
 * EVERY member of `sim/systems/BasicAttackSystem.WEAPON_TAGS` must appear here
 * (`sword` via the branch below). That is the point of the two-file contract
 * written up in that file: a class with no row falls back to the generic swing
 * by ACCIDENT, and the whole reason `magic` had to be added is that the wrong
 * fallback is indistinguishable from a decision when nothing states the decision.
 *
 *   • `magic` → `magicBolt`, the 効果音ラボ 気弾 (energy-bolt) clip. Until
 *     2026-07-24 there was no caster class at all, so all 22 of the roster's
 *     conjuring champions defaulted to `bow` and answered a spell with a
 *     BOWSTRING CREAK. One class covers all of them on purpose: the WC3 missile
 *     art distinguishes the bolt's ELEMENT (fireball / farseer / shadow-hunter /
 *     serpent-ward), not the implement, so splitting into staff/orb/beam would be
 *     inventing a distinction the source does not make — and each split would
 *     need its own clip to not be an empty class.
 *   • `thrown` → the generic swing, ON PURPOSE and stated rather than defaulted.
 *     The two hurled-object heroes (Warden glaive, Brewmaster keg) have no
 *     bespoke clip in the pack, and the honest sound for a hurled object is the
 *     neutral whoosh — NOT a bow draw, which is what they got before. If a
 *     dedicated 投擲 clip is ever acquired, this row is where it lands.
 */
const WEAPON_SFX: Readonly<Record<string, string>> = {
  greatsword: "attackGreatsword",
  katana: "attackKatana",
  bow: "bowDraw",
  gun: "gunshot",
  magic: "magicBolt",
  thrown: GENERIC_SWING,
};

/**
 * The clip for a basic attack, or null to fall back to the generic swing.
 * `sword` resolves to attackSword1 / attackSword2 (crit); every other known
 * class maps straight through; anything else (or a non-string) → null.
 */
export function weaponAttackKey(weaponClass: unknown, crit: unknown): string | null {
  if (typeof weaponClass !== "string") return null;
  if (weaponClass === "sword") return crit === true ? "attackSword2" : "attackSword1";
  return WEAPON_SFX[weaponClass] ?? null;
}

/** ELEMENT (the `<element>` of a `fx.prim.<element>.<shape>` vfxKey) → cast whoosh. */
const ELEMENT_SFX: Readonly<Record<string, string>> = {
  fire: "magicFire",
  ice: "magicIce",
  lightning: "magicLightning",
};

/**
 * ⭐ GH#529 —— 這裡**曾經**住著 `WC3_ABILITY_SFX`：一個 52 個字面值的 TypeScript
 * `Set`，外加 52 行註解記著哪一支技能用哪一個 cue。
 *
 * owner 2026-08-20 逐字：「⋯包含⋯**特效音效綁定**⋯都請整理更新到 **JSON**」。
 * 那份宣告現在住 `content/audio-manifests/ability-sfx-cues.json`
 * （出處 gg_snd、來源 stock-mpq / map-import、以及**掃到了但沒接上**的 19 列理由），
 * 註冊表在 `./abilitySfxCues`。
 *
 * ⚠️ 差別不是整潔：**client 是 build 時烘進映像的**，所以一個住在這裡的 cue 名單
 * 改一格 = 一次完整部署；而那 52 行註解是 prose，沒有任何東西在守它。
 * ⭐ `sfxReachability` 那 52 列的 `site` 也一起指到那份 JSON —— 於是「這個 cue
 * 存在」由那個檔決定（同 `VFX_SOUND_SITE` 已經做過的事）。
 */

/**
 * The WC3 source-map cast voice for an ability cast, or null to fall through to
 * the element/generic route. Total on junk: only a declared cue key passes.
 *
 * ⭐ GH#402 之後**沒有 build 開關**：宣告過的 cue 檔案全部由正式 bundle 供應
 * （`content/assets/audio/{sfx,wc3}/`）。⛔ 曾經有一個 `overlayEnabled` 參數把其中
 * 49 個擋在 `config/fullAssets` 後面，而檔案搬進版控之後它就變成「正式站靜音」
 * 的唯一原因 —— 兩個名詞（宣告集合 × bundle 供不供應）之間的關係由
 * `combatSfx.test.ts` **讀 audio-map** 守著，⛔ 不是再抄一份名單。
 *
 * ⭐ GH#529 —— 名單本身搬進 `content/audio-manifests/ability-sfx-cues.json`，
 * 這一支只剩「問註冊表」。
 */
export function wc3CastKey(sfxKey: unknown): string | null {
  return abilitySfxCueAllowed(sfxKey);
}

/**
 * The element whoosh for an ability cast, or null to fall back to the generic
 * cast. Reads the element out of an `fx.prim.<element>.<shape>` vfxKey; a vfxKey
 * in any other shape, an unrouted element, or a non-string all yield null.
 */
export function castElementKey(vfxKey: unknown): string | null {
  if (typeof vfxKey !== "string") return null;
  const parts = vfxKey.split(".");
  const element = parts[2];
  if (parts[0] !== "fx" || parts[1] !== "prim" || element === undefined) return null;
  return ELEMENT_SFX[element] ?? null;
}

// ---------------------------------------------------------------------------
// ARROW TRACKING — 放箭 / 箭矢命中, entirely client-side
// ---------------------------------------------------------------------------
/**
 * WHY THERE IS STATE HERE AT ALL. The two archery clips need to know that a
 * given projectile is an ARROW, and the sim never says so: `projectileSpawn`
 * ships `{ id, owner, projectileId }` and `basicAttackHit` ships
 * `{ id, owner, target, crit, projectileId }` — neither carries `weaponClass`.
 * The information IS already on the wire, one event earlier: BasicAttackSystem
 * emits `basicAttack { source, ranged: true, weaponClass }` and then, with no
 * other emit in between, `projectileSpawn { id, owner: source }` for the very
 * same shot. So the client can join them itself. That is why this is NOT a
 * request for a new sim field or a fan-out whitelist entry — it costs zero
 * bytes on the wire and depends on nothing another lane has to ship.
 *
 * The join is deliberately narrow:
 *   • ONE pending slot, not a map. The two emits are adjacent by construction
 *     (BasicAttackSystem `return`s immediately after the pair), and the slot is
 *     only consumed when `owner` matches the `source` that armed it — so an
 *     interleaving we did not predict makes the arrow fall back to the generic
 *     launch, never mis-fires on someone else's projectile.
 *   • The in-flight id set is a bounded FIFO. A basic-attack arrow that expires
 *     at max range emits NO hit event, so entries would otherwise leak for the
 *     whole match; past {@link ARROW_TRACK_CAP} the oldest id is evicted. An
 *     arrow lives well under a second and 12 champions cannot have 64 autos in
 *     the air, so eviction never reaches a live shot.
 */
const ARROW_TRACK_CAP = 64;

/** `basicAttack.source` of a bow auto awaiting its `projectileSpawn`, or null. */
let pendingBowShot: number | null = null;
/** Entity ids of bow-auto missiles currently in flight (insertion-ordered). */
const arrowIds: number[] = [];
const arrowInFlight = new Set<number>();

/** Remember a missile as an arrow, evicting the oldest once the cap is hit. */
function noteArrow(id: number): void {
  if (arrowInFlight.has(id)) return;
  arrowInFlight.add(id);
  arrowIds.push(id);
  while (arrowIds.length > ARROW_TRACK_CAP) {
    const evicted = arrowIds.shift();
    if (evicted !== undefined) arrowInFlight.delete(evicted);
  }
}

/** Consume a tracked arrow id (true = this missile was a bow auto). */
function takeArrow(id: unknown): boolean {
  if (typeof id !== "number" || !arrowInFlight.has(id)) return false;
  arrowInFlight.delete(id);
  const at = arrowIds.indexOf(id);
  if (at >= 0) arrowIds.splice(at, 1);
  return true;
}

/** Number of missiles currently tracked as arrows (test/debug read-back). */
export function arrowsInFlight(): number {
  return arrowInFlight.size;
}

/** Drop all arrow/cast tracking. Called on match teardown, and by every test. */
export function resetProjectileSfx(): void {
  pendingBowShot = null;
  arrowIds.length = 0;
  arrowInFlight.clear();
}

/**
 * 詠唱起手 (#181's cast-feedback beat, heard): the cast wind-up long enough to
 * deserve the 魔法陣 whoosh instead of the generic `castBegin` tick.
 *
 * `castBegin` is ONLY emitted when the ability has a real cast time (an instant
 * cast never fires it at all), and it is the same authoritative window the
 * client's 0.6 s cast-telegraph light pillar rides — so this sound lands exactly
 * on the visual telegraph the victim is supposed to react to.
 *
 * The line sits at 0.5 s because that is where the content actually splits: of
 * the authored `castTimeSec` values, 0.3/0.4 s are the common snappy casts (417
 * of 584) and 0.5 s+ are the committed ones (167). So roughly the top quarter of
 * casts — the ones worth a "something big is winding up" — get the circle, and
 * the clip (~1 s) is never longer than the window it decorates by much. Short
 * casts keep the dry tick they have today.
 */
export const CAST_CIRCLE_MIN_SEC = 0.5;

/** The wind-up key for a `castBegin`: the 魔法陣 whoosh, or the generic tick. */
export function castTelegraphKey(castTimeSec: unknown): string {
  return typeof castTimeSec === "number" && castTimeSec >= CAST_CIRCLE_MIN_SEC
    ? "castCircle"
    : "castBegin";
}

/**
 * WHO AM I — the local seat id, published by the AudioDirector (the one place
 * that already subscribes to `hudStore.localSeatId`) and read back by the
 * per-frame drain.
 *
 * WHY A REGISTERED VALUE RATHER THAN A PARAMETER. `guardianSlain` is broadcast
 * to every client, but its reward chime belongs to exactly one of them, so the
 * mapping needs to know which seat is listening. The per-frame caller (GameApp)
 * is a hot loop with no business reaching into the HUD store for audio, and the
 * decision itself must stay unit-testable without a store — so the pure rule
 * lives in `guardianRewardKey(ev, seatId)` and this holder is only how the
 * conductor hands it the answer. Null (no seat yet / AudioDirector unmounted) is
 * a legal state and simply keeps the chime silent.
 */
let localSeatId: number | null = null;

/**
 * Publish the local seat id for the seat-gated cues (AudioDirector owns this).
 *
 * A CHANGED seat also re-baselines the arrow tracking, exactly as `sfxEdges`
 * re-baselines its tally on a seat change: entity ids restart with each match,
 * so an arrow still "in flight" from the previous one could otherwise collide
 * with a fresh id and put a pierce under someone else's melee swing.
 */
export function setCombatSfxSeat(seatId: number | null): void {
  if (seatId !== localSeatId) resetProjectileSfx();
  localSeatId = seatId;
}

/** The seat id currently published (test/debug read-back). */
export function combatSfxSeat(): number | null {
  return localSeatId;
}

/**
 * 守衛塔最後一擊的金幣獎勵 (#89): the `guardianLastHit` reward chime, or null.
 *
 * Fires ONLY for the seat that landed the killing blow and was actually paid.
 * A void payout (the killer died / left the zone in the same tick) ships
 * `killerSeatId: -1, gold: 0` and must stay silent — nobody got the gold.
 * Total on a malformed payload.
 */
export function guardianRewardKey(ev: EventMessage, seatId: number | null): string | null {
  if (seatId === null || seatId < 0) return null;
  const killer = ev.data.killerSeatId;
  if (typeof killer !== "number" || killer !== seatId) return null;
  const gold = ev.data.gold;
  if (typeof gold === "number" && gold <= 0) return null; // void payout
  return "guardianLastHit";
}

/**
 * 撿到金幣 (#191): the `coinPickup` jingle, or null.
 *
 * Copies {@link guardianRewardKey}'s shape for the same reason: `coinPickedUp`
 * is broadcast to every client, but exactly one champion banked the money, and
 * ringing the LOUD pickup jingle in all six players' ears for someone else's
 * 100 gold is the same defect that gating fixed for the guardian bounty. A
 * worthless coin (`value <= 0`, which the sim cannot currently produce) stays
 * silent rather than celebrating nothing. Total on a malformed payload.
 */
export function coinRewardKey(ev: EventMessage, seatId: number | null): string | null {
  if (seatId === null || seatId < 0) return null;
  const collector = ev.data.seatId;
  if (typeof collector !== "number" || collector !== seatId) return null;
  const value = ev.data.value;
  if (typeof value === "number" && value <= 0) return null;
  return "coinPickup";
}

/**
 * WHICH DUEL ZONE AM I IN — for the 殭屍王 cues, and only for them.
 *
 * `mobBossSpawn` is broadcast to EVERY client in the match, but a king is
 * summoned into ONE duel zone. Playing a 4.4 s horror drone in the ears of the
 * six players in the other arena — who cannot see it, cannot fight it and will
 * never be paid by it — is the same defect `guardianRewardKey` fixed for the
 * bounty chime, one axis over: there the wrong SEAT heard it, here the wrong
 * ARENA would.
 *
 * `SeatView.zone` is the duel zone of the seat's champion entity and is -1 when
 * the seat has no live entity. UNRESOLVABLE MEANS PLAY: a headline cue must
 * never be silenced by a missing lookup, so the gate only ever rejects a
 * DEFINITE mismatch (both zones known and different).
 */
export function localDuelZone(): number {
  // Re-exported rather than re-implemented: `ui/hud/MobBossOverlay` asks the
  // SAME question to decide whether to paint the 降臨 banner, and two copies of
  // this lookup is exactly how the sound ended up gated while the screen was
  // not. See net/RoomStore.localDuelZone.
  return storeLocalDuelZone();
}

/**
 * 殭屍王降臨的恐怖音效 (owner: 「要播放恐怖音效3~5秒」), or null.
 *
 * Zone-gated per {@link localDuelZone}, NOT seat-gated: the king belongs to the
 * whole duel, not to the player whose 100 kills summoned it — the other five
 * champions in that arena are about to be hit by it and deserve the warning.
 * Total on a malformed payload.
 */
export function bossHorrorKey(ev: EventMessage, zone: number): string | null {
  const evZone = ev.data.zone;
  if (typeof evZone === "number" && zone >= 0 && evZone !== zone) return null;
  return "bossHorror";
}

/**
 * 殭屍王分紅的中獎慶祝音效 (owner: 「打贏要播放中獎慶祝音效5~7秒」), or null.
 *
 * Gated on BEING PAID rather than on the zone, and that is the stricter, more
 * honest test: `shares[]` is exactly the list of champions the sim handed gold
 * to, so 「你中獎了」 plays for people who actually won something. A player in
 * the same arena who never touched the king hears nothing, which is correct —
 * a jackpot fanfare for a prize you did not get is worse than silence.
 * Total on a malformed payload; a zero-gold sheet (the king drowned in the fire
 * ring and paid nobody) stays silent.
 */
export function bossJackpotKey(ev: EventMessage, seatId: number | null): string | null {
  if (seatId === null || seatId < 0) return null;
  const shares = ev.data.shares;
  if (!Array.isArray(shares)) return null;
  for (const raw of shares as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (s.seatId !== seatId) continue;
    const gold = typeof s.gold === "number" ? s.gold : 0;
    const xp = typeof s.xp === "number" ? s.xp : 0;
    if (gold > 0 || xp > 0) return "bossJackpot";
  }
  return null;
}

/**
 * 技能升級鈴（`rankUp`）**播誰的** —— `config.audio-map@1.rankUpAudience`。
 *
 * `"self"`（出貨）＝ 只有本人升級才響；`"all"` ＝ 逐位元回到夾之前（全場都響）。
 * ⛔ 沒有第三個值：見 schema 那一段（今天沒有 per-event 音量的縫，所以「別人的
 * 播小聲一點」收進來會是一個設定得起來、遊戲裡什麼都不發生的值）。
 */
export type RankUpAudience = "self" | "all";

/**
 * ⭐ 出貨預設 —— 這是**我挑的**（owner 2026-08-23 常設指令：「沒做完以前別問我了
 * 自己判斷 但是留後台開關可以簡易 rollback」），⛔ 不是他說過的數字。
 *
 * 挑 `"self"` 的三個理由，⛔ 都不是偏好：
 *  ① `eventFanout.ts` 的 `rankUp` 那一列**自己寫著**「`id` 是 ENTITY 不是 seat，
 *     所以只該替本地英雄響的提示**必須自己夾**（就像 guardianRewardKey 夾賞金）」
 *     —— 那句話從第一天就在，只是沒有人做那個夾。
 *  ② `combatSfxSpatial.CENTRED_EVENTS` 也寫著它是「你自己的進度 UI」，而它一直
 *     替**六個人**響 ⇒ 兩份宣告都是半句謊話（第一·五守則）。
 *  ③ 同一族（`guardianSlain` 賞金鈴 / `coinPickedUp` 撿錢 / `mobBossSlain` 中獎）
 *     全部是 seat-gated 的 HUD 節拍 —— 升級鈴不夾才是那一族裡的例外。
 */
export const DEFAULT_RANK_UP_AUDIENCE: RankUpAudience = "self";

let rankUpAudience: RankUpAudience = DEFAULT_RANK_UP_AUDIENCE;

/**
 * 發布後台那一格（`AudioSystem.setMap` 擁有這個呼叫，同 `setCombatSfxSeat`）。
 * ⚠️ 未知值／缺值一律降級成出貨預設，⛔ 不是丟例外：一份存了一半的 override
 * 不可以讓升級鈴變成未定義行為。
 */
export function setRankUpAudience(v: unknown): void {
  rankUpAudience = v === "all" ? "all" : DEFAULT_RANK_UP_AUDIENCE;
}

/** 現在生效的那一格（測試/除錯讀回用）。 */
export function rankUpAudienceNow(): RankUpAudience {
  return rankUpAudience;
}

/**
 * 技能升級鈴 (#51)，或 null。
 *
 * `rankUp` 廣播給全場，而它的酬載只用 **entity id** 指人（`{ id, slot, rank }`），
 * 所以這裡比對的是 `localEntityId` 而**不是** seat —— 與 `guardianRewardKey` 是
 * 同一條規矩、不同的軸。⚠️ **認不出自己就播**（`localEntityId` 還沒到／已經死了）：
 * 一個進度提示寧可多響一次，也不該被一次查表失敗吃掉。
 */
export function rankUpKey(ev: EventMessage, localEntityId: number | null): string | null {
  if (rankUpAudience === "all") return "abilityRankUp";
  if (localEntityId === null) return "abilityRankUp";
  const who = ev.data.id;
  if (typeof who !== "number") return "abilityRankUp";
  return who === localEntityId ? "abilityRankUp" : null;
}

// ───────────────────── 打擊重量 → 打擊音 (GH#763) ────────────────────────────
/**
 * 12 點的刺拳與 400 點的大絕在此之前播**同一顆 `hit`** —— 音效是唯一完全不隨
 * 打擊重量變化的頻道（震動 / 火花 / 閃光 / 鏡頭 kick 早就全部讀 `ImpactTier`）。
 *
 * ⭐ **重量從 sim 來，⛔ 不在這裡重推。** `ImpactTier` 由
 * `sim/combat/damage.ts` 的 `deriveTier()` 解出，騎在 `hitImpact.data.profile.tier`
 * 上。客戶端自己拿 `damage.amount` 去比一次門檻 = 把 `TIER_MEDIUM_IMPACT` /
 * `TIER_HEAVY_IMPACT` 抄成**第二個住處**（第〇·四守則），而那一份必然過期 ——
 * 而且它會用「音效跟震動對不起來」這種**認不出來的**方式過期。
 *
 * ⚠️ 所以**發聲的事件換了一顆**：sim 對同一次命中送「`damage` 先到、`hitImpact`
 * 隨後」的雙生事件（`applyImpact` 就在 `emit("damage")` 的下一行，⭐ 而且它
 * **永遠**發 `hitImpact`），而重量只在後面那一顆身上。於是：
 *   · `damage`    —— 仍然擁有 block / crit / 魔法 / 真傷 四條**識別**路；
 *                    只有「普通物理命中」那一條讓位（回 null）。
 *   · `hitImpact` —— 只在那一條讓位時發聲，回 `hit-light` / `hit-medium` /
 *                    `hit-heavy`。
 * ⇒ 一次命中仍然**恰好一發**（⛔ 沒有 double-thud —— 與 `basicAttackHit` 那一列
 *   刻意被遮蔽是同一條規矩）。
 *
 * ── ⭐ 一鍵 rollback，而且它是**資料**不是旗標 ───────────────────────────────
 * 分層只在出貨的音效表**三顆 key 都在**的時候啟用（{@link setHitTierKeys}，由
 * `AudioSystem.setMap` 從 `config.audio-map@1.sfx` 推）。把 `hit-light` /
 * `hit-medium` / `hit-heavy` 任何一顆從 audio-map 拿掉 ⇒ 分層整條關閉、`damage`
 * 立刻回到 `"hit"`，⭐ **逐位元等於今天的行為**（`content/` 是 live bind-mount，
 * ⛔ 不必重建映像）。
 * ⚠️ 這裡刻意**沒有第二個布林旗標**：「開著但 key 不在」那個組合就是靜音，而
 * 那正是失敗形態⑧（三個零件都對，組合是空的）。⇒ 讓「**播得出來嗎**」與
 * 「**要不要播**」是同一個問題，兩者結構上不可能不同步。
 */
const HIT_TIER_KEY: Readonly<Record<string, string>> = {
  light: "hit-light",
  medium: "hit-medium",
  heavy: "hit-heavy",
};

/** 出貨音效表帶齊那三顆分層 key 了嗎（＝分層開著嗎）。 */
let hitTiersMapped = false;

/**
 * 由 `AudioSystem.setMap` 餵：出貨 `audio-map` 的 `sfx` 表。
 * ⛔ 這裡不持有音效表本身 —— 只記「三顆 key 在不在」這**一個位元**（與
 * `setRankUpAudience` 同一個形狀：純規則住這裡，⛔ 它不去讀狀態）。
 */
export function setHitTierKeys(sfx: unknown): void {
  const rec = sfx && typeof sfx === "object" ? (sfx as Record<string, unknown>) : {};
  hitTiersMapped = Object.values(HIT_TIER_KEY).every((k) => rec[k] !== undefined);
}

/** 分層打擊音是否啟用。 */
export function hitTieringActive(): boolean {
  return hitTiersMapped;
}

/**
 * `hitImpact.data.profile` → 分層打擊音的 key。
 *
 * ⚠️ 認不出重量就回 `"hit"`（⛔ 不是 null）：`damage` 那一條已經讓位了，這裡
 * 再靜音就會讓「舊 server + 新 client」整場沒有打擊音。fail-open 的代價是**舊
 * 的那顆聲音**，⛔ 不是沉默。
 */
export function hitWeightKey(profile: unknown): string {
  const tier =
    profile && typeof profile === "object" ? (profile as { tier?: unknown }).tier : undefined;
  return (typeof tier === "string" ? HIT_TIER_KEY[tier] : undefined) ?? "hit";
}

/**
 * The SFX-map key an event should play, or null for silence. Reads the enriched
 * `damage` payload names from the contract (dmgType/blocked/crit/killingBlow),
 * falling back to the sim's raw `type` field if `dmgType` is absent.
 *
 * `seatId` defaults to the seat the AudioDirector published, so the hot-path
 * caller keeps its one-argument shape; tests pass it explicitly.
 *
 * PHASE GATE (#238). The result passes through `gateCombatBed`, which drops a
 * SUSTAINED combat bed (`fireRingLoop`, `reviveChannel`, `arenaAmbience`) unless
 * the match is actually in `combat` RIGHT NOW. #216 gave those beds a stop path
 * hung on the `isCombatEnd` React edge, but this mapper runs on the GameApp's
 * requestAnimationFrame drain — a different clock — so a `fireRingStart` still
 * sitting in the event queue when the phase committed would start a ~60 s
 * burning-fire bed AFTER the teardown edge had already fired, and nothing would
 * stop it until the next round. That is the shop the owner heard the ring in.
 * `phase` is defaulted (not passed by the hot-path caller) so tests can pin it;
 * production reads the live store.
 */
export function combatSfxKey(
  ev: EventMessage,
  seatId: number | null = localSeatId,
  phase: string = hudStore.getState().phase,
  // `rankUp` 只用 entity id 指人（seat 認不出它），所以升級鈴要的是這一格。
  // 與 `phase` 同一個形狀：hot-path 呼叫端不傳，測試可以釘。
  localEntityId: number | null = hudStore.getState().localEntityId,
): string | null {
  return gateCombatBed(combatSfxKeyUngated(ev, seatId, phase, localEntityId), phase);
}

/**
 * The raw event → SFX-key mapping, BEFORE the #238 phase gate. Split out only so
 * `combatSfxKey` has one place to apply the gate instead of one per `return`.
 * Not exported: every caller must go through the gated form.
 */
function combatSfxKeyUngated(
  ev: EventMessage,
  seatId: number | null,
  phase: string,
  localEntityId: number | null,
): string | null {
  const d = ev.data;
  switch (ev.type) {
    case "damage": {
      if (d.blocked) return "block"; // 防禦 — shield / damage-reduction absorbed
      if (d.crit || d.killingBlow) return "crit";
      const t = (d.dmgType ?? d.type) as string | undefined;
      if (t === "magic") return "hitMagic"; // 魔法
      if (t === "true") return "hitTrue";
      // 物理 (default) —— ⭐ GH#763：分層開著的時候這一條**讓位**給雙生的
      // `hitImpact`（重量只在那一顆身上）。關著就逐位元回到今天的 `"hit"`。
      return hitTieringActive() ? null : "hit";
    }
    case "hitImpact": {
      // ⭐ GH#763 —— 打擊重量的發聲點（12 點的刺拳 ≠ 400 點的大絕）。
      // ⛔ 分層關著時它逐位元回到「純計時事件」——**沒有第二條路**。
      if (!hitTieringActive()) return null;
      // 四條**識別**路仍然歸先到的 `damage`（它已經發過聲了）——
      // 這裡再發一次就是 double-thud。
      if (d.blocked) return null; // `damage` 已經播了 block
      if (d.crit || d.killingBlow) return null; // …已經播了 crit
      const t = (d.dmgType ?? d.type) as string | undefined;
      if (t === "magic" || t === "true") return null; // …已經播了 hitMagic / hitTrue
      return hitWeightKey(d.profile); // hit-light / hit-medium / hit-heavy
    }
    case "basicAttack":
      // ARM the archery join: a RANGED bow auto is about to emit its
      // `projectileSpawn` with no weapon information of its own. Any other
      // basic attack disarms it, so the slot never survives to a later shot.
      pendingBowShot =
        d.ranged === true && d.weaponClass === "bow" && typeof d.source === "number"
          ? d.source
          : null;
      // per-weapon slash, generic swing when the class is unknown/malformed
      return weaponAttackKey(d.weaponClass, d.crit) ?? "basicAttack";
    case "projectileSpawn": {
      // 放箭 — the missile leaving the bow. REPLACES the generic launch clip for
      // this one shot (it is not layered on top of it), so a ranged auto still
      // makes exactly the two sounds it makes today: the draw and the release.
      const owner = d.owner;
      const armed = pendingBowShot !== null && owner === pendingBowShot;
      pendingBowShot = null;
      if (!armed || d.projectileId !== "basic-attack") return "projectileSpawn";
      if (typeof d.id === "number") noteArrow(d.id);
      return "arrowRelease";
    }
    case "basicAttackHit": {
      // 箭矢命中 — the ranged auto's arrival. `basicAttackHit` is otherwise
      // SILENT on purpose (the `damage` event owns the hit voice, and sounding
      // both would double-thud), and that stays true for every other weapon:
      // only a tracked ARROW speaks here, and the map keeps it quiet and
      // narrow (gain 0.34, maxConcurrent 2) so it reads as a transient on top
      // of the existing thud — "that thud was an arrow" — not a second event.
      // A dodged shot emits no `basicAttackHit` at all, so a miss stays silent;
      // the id simply ages out of the FIFO.
      return takeArrow(d.id) ? "arrowPierce" : null;
    }
    case "castBegin":
      // 魔法陣展開 — long wind-ups get the circle, short ones the dry tick
      return castTelegraphKey(d.castTimeSec);
    case "abilityCast":
      // the ability's own WC3 cast voice first (specific beats generic), then
      // the per-element whoosh, then the generic cast clip
      // ⭐ GH#529 —— 覆蓋層先問（`ability-sfx-cues.json` 的 `bindings`：給文件上
      // 沒有 `sfxKey` 的技能一個原作音，⛔ 不必動 420 份 ability JSON），
      // 再問技能文件自己宣告的 cue，再退到元素風聲，最後才是通用施法音。
      return (
        abilitySfxCueForAbility(d.abilityId) ??
        wc3CastKey(d.sfxKey) ??
        castElementKey(d.vfxKey) ??
        "abilityCast"
      );
    case "guardBreak":
      return "guardBreak"; // 破防 — shield broke this frame
    case "knockdown":
      return "knockdown";
    case "whiff":
      return "whiff";
    case "rankUp":
      // 技能升級 — sim event ≠ map key, so a rename. ⭐ 而且是**本人限定**
      // （`rankUpKey`；`config.audio-map@1.rankUpAudience` 一格改回 `"all"`）。
      return rankUpKey(ev, localEntityId);
    case "fireRingStart":
      // 火環收縮 (#132) — sim event ≠ map key, so a rename.
      //
      // ALSO the S3 tripwire, and the ONE side effect in this otherwise pure
      // mapper. This event is the authority telling us the exact instant the
      // ring began to burn; `audio/fireRingWindow` has independently DERIVED
      // that instant from config.match@1 to drive the tension bed and the
      // minimap danger rim. If the two ever disagree again — they were 30 s
      // apart from #132 landing until 2026-07-24 — the very first round played
      // prints both numbers. Deleting this call restores the silence that let
      // the drift live for months. See fireRingWindow.noteFireRingIgnition.
      //
      // GATED ON THE PHASE (#238), for the tripwire's sake as much as the bed's.
      // Outside `combat` the event is a straggler drained after the bell, and
      // `phaseSecondsLeft` is then the SHOP clock — comparing that against the
      // combat-clock derivation would print a drift alarm about a drift that
      // does not exist. `gateCombatBed` would drop the returned key anyway; this
      // keeps the side effect from running past it. A real ignition is always in
      // combat, so nothing genuine is suppressed.
      if (phase !== COMBAT_PHASE) return null;
      noteFireRingIgnition(hudStore.getState().phaseSecondsLeft);
      return "fireRingLoop";
    case "guardianImpact":
      // 守衛塔範圍重擊 (#89/#105) — the telegraphed volley LANDS. One event per
      // resolved mark, all on the same tick, so the map's 300 ms cooldown /
      // maxConcurrent 2 collapse a multi-mark volley into a single slam.
      return "guardianSlam";
    case "guardianSlain":
      // 最後一擊的金幣獎勵 — the only seat-gated cue here (see guardianRewardKey)
      return guardianRewardKey(ev, seatId);
    case "mobBossSpawn":
      // 殭屍王降臨 (#262 / GH #190) — the owner's 3-5 s horror cue, zone-gated
      // so the other arena is not haunted by a monster it cannot see.
      return bossHorrorKey(ev, localDuelZone());
    case "mobBossSlain":
      // …and the 5-7 s 中獎 fanfare, gated on the local seat actually appearing
      // on the payout sheet with something on it (bossJackpotKey).
      return bossJackpotKey(ev, seatId);
    case "coinDropped":
      // 陣亡投幣 (#191): a coin hits the arena floor. Unconditional — it is a
      // WORLD event everyone in the duel should hear, wherever it landed.
      return "coinDrop";
    case "coinPickedUp":
      // …and the collector's own LOUD reward jingle, seat-gated (coinRewardKey).
      return coinRewardKey(ev, seatId);
    // ⭐ GH#406 —— 交換筆記本（44-002）落地的那一刻。
    //
    // ⚠️ 它**借用**既有的 `buffApply` 剪輯，⛔ 不是新開一個 key，而理由是
    // `sfxReachability` 的合約：這份登錄表的列必須與 `content/config/audio-map.json`
    // 的 key 集合**完全相等**，所以一個新 key 等於一支新音檔 + 一列版權聲明 ——
    // 那是內容側的工作，不是這條接線的。`buffApply`（增益/狀態提升）是既有剪輯裡
    // 語意最近的一個：「一個非傷害的魔法效果剛剛落在某人身上」。
    //
    // ⛔ 刻意**不**用 `heal`：交換不是治療（sim/effects/swapResource.ts 檔頭），
    // 而聲音跟浮動文字必須講同一件事。
    case "resourceSwap":
      return "buffApply";
    case "coinDropRejected":
      // The refusal rides the wire so the HUD can SAY why (P7), but it is a UI
      // beat, not a combat one: `ui/castFeedback` already owns the 拒絕 cue and
      // sounding it here too would double it.
      return null;

    default:
      return PASSTHROUGH.has(ev.type) ? ev.type : null;
  }
}
