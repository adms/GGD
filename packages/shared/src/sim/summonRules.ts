/**
 * summonRules — 召喚物在「誰打得到誰」這件事上的決策點，以及它們的預設值。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * A summon deliberately carries NEITHER `MobComp` NOR `ChampionComp` (the three
 * absences are the whole design — see sim/summons.ts). Both of the sim's
 * automatic target pickers were written as ALLOW-LISTS over exactly those two
 * stores:
 *
 *   targeting.ts    `if (!world.champion.has(c) && !world.mob.has(c)) return false;`
 *   MobSystem.ts    `if (!world.champion.has(cid)) continue;   // champions only`
 *
 * so on the shipped path NOTHING in the game could ever auto-acquire a summon.
 * Measured before this module existed: a summon placed ON TOP of an enemy
 * champion, 300 ticks — `nav.attackTarget` stayed `null` and the body's HP went
 * 1134 → 1134. It hit people; nothing could hit it back. That is not a balance
 * question, it is 一面倒的無敵.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE ARE FIELDS AND NOT A FIX
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-07-30: 「我們所有開發都要以編輯器可以彈性設定為準，**尤其是決策
 * 點**」. Every question below is a place where the 52 「召喚代理」 in
 * docs/ability-templates.md do NOT agree with each other:
 *
 *   · 57-03 複製鏡 / 27-002 霧隱分身之術 are DECOYS — the whole point is that
 *     the enemy wastes attacks on them, so they must draw fire like a hero.
 *   · 37-03 災難之牆 is 9 wall units laid across the approach — in the source
 *     those are scenery you route around, not 9 free kills.
 *   · 18-04 億年樹 is a stationary tree; 91-002 亡靈大軍 is 8 ghouls that brawl.
 *
 * A branch picked in code would be wrong for most of them, so each question is
 * a FIELD on the `summon` effect doc, mirrored onto {@link SummonComp}, resolved
 * here, and read by exactly one system each.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 「缺席 = ?」 —— 這裡跟 #206/#288/#289 的慣例**不一樣**，而且是故意的
 * ─────────────────────────────────────────────────────────────────────────────
 * The house rule for a new optional field is 「缺席 = 今天的行為」. For
 * {@link summonAutoTargetable} that rule would mean 「缺席 = 打不到」, i.e. every
 * already-authored summon doc would KEEP the defect this module exists to
 * remove, and the fix would ship switched off. So absent means the WC3
 * behaviour instead: a summoned unit is an ordinary unit and anything hostile
 * auto-attacks it. The house rule is about not changing behaviour by accident;
 * here the behaviour change IS the deliverable.
 *
 * {@link summonBountyGold} DOES follow the house rule — absent = 0 = exactly
 * what ships today — because it is also the WC3 reading, so the two agree.
 * {@link summonBurnsInFireRing} defaults ON against today's behaviour for a
 * third reason again: the owner's 保底 directive is quoted at that constant.
 *
 * PURITY: pure functions of one comp. No world, no rng, no clock, no Map walk.
 */
import type { SummonComp } from "./effects/summon";

/**
 * 索敵優先級的類別 —— the auto-attack comparator's KEY 1 (see targeting.ts).
 *
 * Champion (0) before summon (1) before mob (2). The gap between 0 and 2 is
 * where a summon has to go and there was previously no room for it:
 *
 *   · NOT with champions — 「附近英雄」 (owner 2026-07-26) means the HERO
 *     outranks his pets, or a hero could hide behind 8 ghouls forever;
 *   · NOT with mobs — a summon is built from a hero doc and swings a hero's
 *     AttackDamage, so ranking it below a 1-HP zombie (key 3 is 低血優先) would
 *     let a wave of chaff pull every auto off the thing actually killing you.
 *
 * Widening 1 → 2 for mobs is behaviour-neutral for every pre-summon world: the
 * comparator only ever asks `a.kind < b.kind`, never for a literal value, and
 * `world.summon.size === 0` makes the middle tier unreachable.
 */
export const TARGET_CLASS = {
  champion: 0,
  summon: 1,
  mob: 2,
} as const;

/** Where a summon sorts in the auto-attack comparator. */
export type SummonTargetPriority = keyof typeof TARGET_CLASS;

/** ABSENT = the WC3 behaviour (an ordinary unit; everything hostile shoots it). */
export const DEFAULT_SUMMON_AUTO_TARGETABLE = true;
/** ABSENT = its own tier, between hero and zombie (see {@link TARGET_CLASS}). */
export const DEFAULT_SUMMON_TARGET_PRIORITY: SummonTargetPriority = "summon";
/** ABSENT = the WC3 behaviour (creeps fight summoned units like anything else). */
export const DEFAULT_SUMMON_MOB_TARGETABLE = true;
/** ABSENT = the WC3 behaviour (a player may right-click a summoned unit). */
export const DEFAULT_SUMMON_MANUAL_TARGETABLE = true;
/**
 * ABSENT = true — owner 2026-07-30, the 保底 directive:
 *
 *   「火圈百分比真實傷害是**所有場上玩家、bot、各種殭屍**都會百分比真實傷害
 *     燒死，所以還是有個保底結果」
 *
 * 召喚物 are not in that enumeration only because they did not exist when it was
 * given; 「所有」 with a 保底 rationale does not admit a body that is immune to
 * the closing ring. The champion half is `fireRingSystem`'s own loop and the
 * zombie half is `fireRingBurnMobs` (added under that same directive); this is
 * the third. It stays a FIELD rather than becoming another un-switchable rule
 * because a summon, unlike a zombie, can legitimately be scenery — 37-03 災難之
 * 牆's wall units are not combatants whose survival could stall anything.
 */
export const DEFAULT_SUMMON_BURNS_IN_FIRE_RING = true;
/**
 * ABSENT = 0 = **exactly what ships today**, and also the WC3 reading: a
 * summoned unit is not a gold-bearing unit, which is precisely what stops
 * 召喚 spam from being a gold farm. A summon has no unspent gold of its own, so
 * the #191 陣亡投幣 coin mechanic has nothing to throw — the honest lever is a
 * flat bounty to whoever lands the killing blow, which is what mobs already use
 * (`mobRules.rewardGold`).
 */
export const DEFAULT_SUMMON_BOUNTY_GOLD = 0;

/** 敵方的**自動**索敵看不看得見它。 */
export function summonAutoTargetable(sm: SummonComp): boolean {
  return sm.autoTargetable ?? DEFAULT_SUMMON_AUTO_TARGETABLE;
}

/** 它在索敵比較器裡排在哪一層。 */
export function summonTargetClass(sm: SummonComp): number {
  return TARGET_CLASS[sm.targetPriority ?? DEFAULT_SUMMON_TARGET_PRIORITY];
}

/** 小怪(#215 喪標麥可)會不會改去咬它。 */
export function summonMobTargetable(sm: SummonComp): boolean {
  return sm.mobTargetable ?? DEFAULT_SUMMON_MOB_TARGETABLE;
}

/** 玩家能不能**手動**點它下攻擊指令。 */
export function summonManualTargetable(sm: SummonComp): boolean {
  return sm.manualTargetable ?? DEFAULT_SUMMON_MANUAL_TARGETABLE;
}

/** 縮圈的火會不會燒它。 */
export function summonBurnsInFireRing(sm: SummonComp): boolean {
  return sm.burnsInFireRing ?? DEFAULT_SUMMON_BURNS_IN_FIRE_RING;
}

/**
 * 打死它給多少金幣。Negative / NaN are floored to 0 rather than trusted: this
 * value reaches `grantGold` directly, and a negative bounty would be a way to
 * DRAIN a killer's wallet, which nothing in the game otherwise does.
 */
export function summonBountyGold(sm: SummonComp): number {
  const g = sm.bountyGold ?? DEFAULT_SUMMON_BOUNTY_GOLD;
  return Number.isFinite(g) && g > 0 ? g : 0;
}
