/**
 * audio/combatSfx — the PURE event → SFX-key mapping for the per-frame combat
 * sound layer. The GameApp drains MSG.EVENT each frame and calls
 * `audioSystem.playSfx(combatSfxKey(ev))`; this function is the whole decision.
 *
 * Design:
 *   • The rich `damage` event drives the type-differentiated HIT voice —
 *     物理 (hit) / 魔法 (hitMagic) / true (hitTrue) — and the special reactions
 *     防禦 (block, a shield/DR-absorbed hit) and crit. This is the single hit
 *     voice, so `basicAttackHit` (a duplicate of the same moment) and the
 *     timing-only `hitImpact` map to nothing — no double-thud. The ONE
 *     exception is a tracked bow arrow (see `arrowPierce` below).
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
 *     invention. Only keys declared in {@link WC3_ABILITY_SFX} are honoured, so
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
import { fullAssetsEnabled } from "../config/fullAssets";
import { hudStore } from "../net/RoomStore";
import { noteFireRingIgnition } from "./fireRingWindow";

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
 * The WC3 per-ability cast cues shipped so far — the audio-map keys an ability
 * doc's `sfxKey` may name (content `ability@1.sfxKey`, recovered from the
 * source map's gg_snd bindings by tools/w3x-import).
 *
 * A DECLARED SET rather than a pass-through on purpose, for the same reason
 * WEAPON_SFX and ELEMENT_SFX are: `sfxKey` arrives off the wire as untyped
 * event data, and returning an arbitrary string would turn a content typo into
 * a silent audio-map miss instead of the element/generic fallback. It also
 * keeps the sfxReachability contract honest — every playable key must appear
 * as a literal in the file that decides it.
 *
 * These three clips are the MAP-AUTHOR IMPORTS (war3mapImported mp3s) that ship
 * committed under content/assets/audio/sfx/, so they are honoured on every
 * build tier. The stock-MPQ wave lives in {@link WC3_OVERLAY_ABILITY_SFX}.
 */
const WC3_ABILITY_SFX: ReadonlySet<string> = new Set([
  "wc3.moongo", // godie-hpb1.w 者、皆、陣
  "wc3.moonjump", // godie-hpb1.e 列、在、前
  "wc3.nocute", // godie-o00k.passive 裝可愛, godie-u00l.r / godie-umal.r ChangeDNA
]);

/**
 * The STOCK-MPQ per-ability cast cues (the remaining 123 sound refs of the
 * task-#78 音效 port). Same declared-set contract as {@link WC3_ABILITY_SFX},
 * with one difference: the clips are Blizzard-owned and NOT redistributable, so
 * they live in the git-ignored data/blizzard-overlay/ability-sfx/ store (pulled
 * by tools/w3x-import/extract_stock_sfx.py) and their audio-map entries point
 * into the dev-only `assets/blizzard-local/` mount — see
 * content/assets/blizzard-local/README.md, the copyright gate.
 *
 * That is why {@link wc3CastKey} honours this set only when the build asks for
 * the full local asset overlay (config/fullAssets — same switch the Blizzard
 * model/voice overlays gate on). On a public bundle the key resolves to null
 * and the cast falls back to the element whoosh / generic clip it always
 * played; it must NEVER resolve to the map key, because playSfx would fetch a
 * URL prod deliberately does not serve and the cast would be silent instead.
 */
const WC3_OVERLAY_ABILITY_SFX: ReadonlySet<string> = new Set([
  "wc3.akamapissed8", // godie-emfr.w 沉睡之霧
  "wc3.altarofelderswhat1", // godie-n00p.e / godie-nsjs.e 妖狐變化
  "wc3.axemissilelaunch1", // godie-h00l.r 迴旋斬
  "wc3.chickenwhat1", // godie-obla.q 放山雞
  "wc3.darksummoninglaunch1", // godie-e00w.q / godie-e00x.q 百烈櫻華斬, godie-u010.q / godie-uvng.q 邪王炎殺劍
  "wc3.defendcaster", // godie-h01u.w 弒鬼神 / godie-h01u.r 赤兔咆哮, godie-o01z.q / godie-o02v.q Barrel Shot
  "wc3.demonhuntermissilehit3", // godie-u00n.e / godie-u00o.e 伸縮自如的槍亂打
  "wc3.dragonroostwhat1", // godie-u010.r / godie-uvng.r 黑龍波吸收
  "wc3.dragonyes2", // godie-u00h.r 金色的神風, godie-u00v.e 廬山昇龍破, godie-u010.e / godie-uvng.e 邪王炎殺黑龍波
  "wc3.druidofthetalonmissilelaunch2", // godie-h00l.q 科奇利族的迴旋鏢
  "wc3.eggsackdeath1", // godie-huth.w 把你變成餅乾
  "wc3.flaretarget2", // godie-e00k.e / godie-e00z.e 瞬切百殺, godie-u00h.e 無名神風流-蛟龍
  "wc3.flaretarget3", // godie-e008.q 拔焰刀, godie-o01z.w / godie-o02v.w Acxel Shooter
  "wc3.gluescreenmeteorhit1", // godie-obla.e 地道突襲, godie-u00v.w 地走龍牙破
  "wc3.gruntpissed3", // godie-u011.e / godie-u012.e 打屁股風林火豬
  "wc3.gruntyesattack1", // godie-emns.q 死神之眼
  "wc3.gruntyesattack3", // godie-emns.r 心臟麻痺
  "wc3.hcancelbuilding", // godie-u010.w / godie-uvng.w 邪王炎殺煉獄焦
  "wc3.headhunteryes4", // godie-h00l.w 鎖鏈槍, godie-h02s.q / godie-h02z.q 死亡之握, godie-orkn.q 綁架
  "wc3.kaelyesattack3", // godie-emns.ex 交換筆記本
  "wc3.markofchaos", // godie-e00r.r 野戰型陽電子砲, godie-o01z.e / godie-o02v.e Divine Buster
  "wc3.mercenarywhat1", // godie-usyl.e 蛻變
  "wc3.mortarimpact", // godie-h02k.ex 俄羅斯輪盤
  "wc3.mortarteampissed9", // godie-u034 / godie-ucrl 山形修煉 whole kit (猜猜拳 gag)
  "wc3.nazgrelyes2", // godie-opgh.e 閃光龍牙
  "wc3.necropolisupgrade2", // godie-e00t.w 驚駭
  "wc3.pandarenbrewmasterpissed8", // godie-h02k.w 憤怒的菊花
  "wc3.pandarenbrewmasterwarcry1", // godie-h02k.e 憤怒的胸毛
  "wc3.pandarenbrewmasteryes1", // godie-h02k.r 憤怒的簡諧運動
  "wc3.parasite", // godie-e00q.ex 固有結界-黑洞, godie-u00k.e 厄夜靈魂
  "wc3.peasantpissed3", // godie-nbst.ex 來~快點吃吧
  "wc3.peondeath", // godie-e015.q 北斗爆橘拳, godie-u00l.q / godie-umal.q 北斗懺悔拳
  "wc3.rokhanwhat2", // godie-emns.e 火車輾過
  "wc3.sealwhat2", // godie-obla.r 動物拳法
  "wc3.shadowhunterready1", // godie-ubal.r 魔界之王
  "wc3.shamanready1", // godie-nman.r 地獄搖滾
  "wc3.snapdragonmissilelaunch1", // godie-u00j.w 八刀一閃
  "wc3.soulgem", // godie-o01z.r / godie-o02v.r Starlight Breaker Plus
  "wc3.soulpreservation", // godie-e008.r 討滅封絕
  "wc3.spellbreakerpissed4", // godie-n00b.w 複製鏡
  "wc3.spiritofvengeanceyes3", // godie-n00p.w 寄生種子
  "wc3.stampedecaster1", // godie-nman.w 必殺！爆熱神音！
  "wc3.taunt", // godie-h02u.w / godie-h02v.w 狂草泥馬, godie-o00l.r 暴爆咒, godie-u00k.r 萬惡歸宗, godie-udea.e 魔法膨脹
  "wc3.thunderboltmissiledeath", // godie-edem.r 哥哥
  "wc3.thunderclapcaster", // godie-n01c.e / godie-nbbc.e 龍鬥氣砲咒文
  "wc3.treantready1", // godie-e00s.q 伸卡球
  "wc3.trollbatriderpissed2", // godie-ubal.w 災難之牆
  "wc3.trollwoodworkswhat1", // godie-u00n.passive / godie-u00o.passive 二檔
  "wc3.waygatewhat1", // godie-o00l.e 破法對咒, godie-o02s.r 破法對咒
]);

/**
 * The WC3 source-map cast voice for an ability cast, or null to fall through to
 * the element/generic route. Total on junk: only a declared cue key passes.
 *
 * `overlayEnabled` is injectable for tests; production callers take the default
 * — the fullAssets build switch that decides whether this bundle ever asks for
 * the Blizzard overlay (see {@link WC3_OVERLAY_ABILITY_SFX} for why a public
 * bundle must answer null rather than a key whose file is never served).
 */
export function wc3CastKey(
  sfxKey: unknown,
  overlayEnabled: boolean = fullAssetsEnabled(),
): string | null {
  if (typeof sfxKey !== "string") return null;
  if (WC3_ABILITY_SFX.has(sfxKey)) return sfxKey;
  if (overlayEnabled && WC3_OVERLAY_ABILITY_SFX.has(sfxKey)) return sfxKey;
  return null;
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
 * The SFX-map key an event should play, or null for silence. Reads the enriched
 * `damage` payload names from the contract (dmgType/blocked/crit/killingBlow),
 * falling back to the sim's raw `type` field if `dmgType` is absent.
 *
 * `seatId` defaults to the seat the AudioDirector published, so the hot-path
 * caller keeps its one-argument shape; tests pass it explicitly.
 */
export function combatSfxKey(ev: EventMessage, seatId: number | null = localSeatId): string | null {
  const d = ev.data;
  switch (ev.type) {
    case "damage": {
      if (d.blocked) return "block"; // 防禦 — shield / damage-reduction absorbed
      if (d.crit || d.killingBlow) return "crit";
      const t = (d.dmgType ?? d.type) as string | undefined;
      if (t === "magic") return "hitMagic"; // 魔法
      if (t === "true") return "hitTrue";
      return "hit"; // 物理 (default)
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
      return wc3CastKey(d.sfxKey) ?? castElementKey(d.vfxKey) ?? "abilityCast";
    case "guardBreak":
      return "guardBreak"; // 破防 — shield broke this frame
    case "knockdown":
      return "knockdown";
    case "whiff":
      return "whiff";
    case "rankUp":
      return "abilityRankUp"; // 技能升級 — sim event ≠ map key, so a rename
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
    case "coinDropped":
      // 陣亡投幣 (#191): a coin hits the arena floor. Unconditional — it is a
      // WORLD event everyone in the duel should hear, wherever it landed.
      return "coinDrop";
    case "coinPickedUp":
      // …and the collector's own LOUD reward jingle, seat-gated (coinRewardKey).
      return coinRewardKey(ev, seatId);
    case "coinDropRejected":
      // The refusal rides the wire so the HUD can SAY why (P7), but it is a UI
      // beat, not a combat one: `ui/castFeedback` already owns the 拒絕 cue and
      // sounding it here too would double it.
      return null;

    default:
      return PASSTHROUGH.has(ev.type) ? ev.type : null;
  }
}
