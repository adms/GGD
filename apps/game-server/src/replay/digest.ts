/**
 * The divergence alarm's sensor.
 *
 * `SimWorld.digest()` is a real detector — an rng-order divergence surfaces on
 * the very tick it happens, because `mix(this.rng.state)` is folded in. But it
 * has blind spots, and they were MEASURED on this codebase by perturbing a live
 * match mid-combat at tick 4000 of a 7720-tick match:
 *
 *   +500 gold on one champion              -> NEVER detected (3,720 ticks, none)
 *   +15 cooldown ticks on all 48 slots     -> detected 88 ticks later
 *   +1 champion level                      -> detected 131 ticks later
 *   -1 team life (pure host state)         -> detected 5,220 ticks later, at match end
 *
 * A replay that diverges in gold or inventory would therefore report 「已驗證」.
 * For this feature that is the worst possible outcome: the owner debugs a match
 * that never happened. So playback verifies TWO digests per tick:
 *
 *   worldDigest — `SimWorld.digest()` verbatim, unchanged, so the existing
 *                 "byte-identical sim" test in apps/game-server keeps its exact
 *                 expectations and this feature costs that test nothing;
 *   hostDigest  — everything that one does not hash: per-champion economy and
 *                 progression, ability ranks and cooldowns, status effects, and
 *                 the whole MatchController host state (lives, placements,
 *                 tallies, phase, offers) which lives entirely outside the sim.
 *
 * Reporting both separately is not redundancy, it is DIAGNOSIS: worldDigest
 * first means the sim itself diverged (content or a sim code change);
 * hostDigest first means the sim agreed and the ORCHESTRATOR disagreed (a
 * phase-timing, offer or scoring change).
 *
 * ⚠️ BOTH DIGESTS ARE HAND-WRITTEN LISTS OF `mix(...)` CALLS, so adding a field
 * to the sim and hashing it are two unrelated acts — which is exactly how
 * `ChampionComp.itemAcq` shipped invisible to replay (GH#351 / GH#353), along
 * with five of its neighbours. The link is now a guard:
 * `digestCoverage.ts` + `digestCoverage.test.ts` census EVERY SimWorld field and
 * EVERY ChampionComp field and go red on anything neither hashed nor explicitly
 * classified. ⛔ Adding a field here without going through that guard puts the
 * next silent blind spot back.
 */
import { currentFireRingRadius } from "@ggd/shared/sim/fireRing";
import type { MatchController } from "../match/MatchController";

/** FNV-1a-flavoured 32-bit accumulator, matching SimWorld.digest()'s mixer. */
class Mixer {
  private h = 0x811c9dc5;

  num(n: number): void {
    // quantize floats so the digest is stable against representation noise
    const q = Math.round(n * 4096) | 0;
    this.h ^= q & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
    this.h ^= (q >>> 8) & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
    this.h ^= (q >>> 16) & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
  }

  str(s: string): void {
    for (let i = 0; i < s.length; i++) {
      this.h ^= s.charCodeAt(i) & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
    }
    this.h ^= 0x2e;
    this.h = Math.imul(this.h, 0x01000193);
  }

  value(): number {
    return this.h >>> 0;
  }
}

const CORE_SLOTS = ["Q", "W", "E", "R"] as const;

/**
 * Hash the state `SimWorld.digest()` does not: champion economy/progression,
 * ability ranks + cooldowns, status effects, and MatchController host state.
 */
export function hostDigest(ctl: MatchController): number {
  const m = new Mixer();
  const w = ctl.world;

  // --- per-champion sim state outside the sim digest -------------------------
  for (const [id, c] of w.champion) {
    m.num(id);
    m.str(c.championId);
    m.num(c.level);
    m.num(c.xp);
    m.num(c.gold);
    for (const it of c.items) m.str(it ?? "-");
    // GH#351 / GH#353 —— 逐格取得紀錄。`items` 說得出「哪一格有東西」，⛔ 說不出
    // 「它花了多少」與「是不是隨機拿到的」，而那兩件事直接決定賣出金額（賣價 =
    // 實付 × 退款率），並且是 owner 點名的 [EX理外] 系列會讀的謂詞。少了這一行，
    // 一個 `itemAcq` 分岔的 replica 要等到玩家賣掉那一格才在 `gold` 上說話。
    // `undefined`（前置文件時代的夾具）與「六格都是 null」是**不同的狀態**，
    // 所以前者不折任何東西、後者折六組哨兵 —— 這是刻意的。
    for (const a of c.itemAcq ?? []) {
      m.num(a ? a.paid : -1);
      m.num(a ? (a.random ? 1 : 0) : -1);
    }
    for (const a of c.augments) m.str(a);
    m.num(c.statStacks);
    // 三圍 bought this match (#260)。⚠️ 這一格是**戰力**：`championStatBase` 把它
    // 當成天生三圍加進去，所以一個分岔的 attrBonus = 兩個不同強度的英雄，而
    // `w.stats` 是每 tick 重算的推導值、不進任何 digest —— 少了這三行，這個分岔
    // 在兩支 digest 上都是隱形的，只會表現成「傷害數字對不上」。
    m.num(c.attrBonus.str);
    m.num(c.attrBonus.agi);
    m.num(c.attrBonus.int);
    m.num(c.statCapstonePct);
    m.num(c.pendingOrbSlots);
    // 售價倍率（bot 半價）。`undefined` 與 `1` 折成同一個值是刻意的 ——
    // `shopChargeFor` 就是這樣讀的，兩者確實是同一個狀態。
    m.num(c.shopPriceMult ?? 1);
    // ⚠️ 這裡原本只有 `undoStack.length`，而 undo 的契約是「精確反轉」：長度相同
    // 但 `goldDelta`／`acq` 不同的兩個堆疊，下一次 undo 就會退回不同的金額。
    // 長度是「有幾筆」，⛔ 不是「退多少」。
    m.num(c.undoStack.length);
    for (const t of c.undoStack) {
      m.str(t.kind);
      m.str(t.itemId);
      m.num(t.slot);
      m.num(t.goldDelta);
      m.num(t.statStacksBefore);
      m.num(t.acq ? t.acq.paid : -1);
      m.num(t.acq ? (t.acq.random ? 1 : 0) : -1);
    }
    // 「每 N 次才給一次」的計數（effects/grantAttribute.ts）。它決定下一發到底
    // 給不給屬性，所以分岔的後果是 `attrBonus` 差一格 —— 而那要等到給出去的那
    // 一刻才看得見。KEY 先排序：Record 的迭代順序是插入順序，那是 host 的
    // 施法順序，⛔ 不可以染到 digest（與 SimWorld.digest() 的 marks/dot 同一條規矩）。
    const progress = c.attrGrantProgress;
    if (progress !== undefined) {
      for (const k of Object.keys(progress).sort()) {
        m.str(k);
        m.num(progress[k] ?? 0);
      }
    }
    // 限時三圍（08-00 龍紋記憶）。加成本身已經在 `attrBonus` 裡，這張表只記
    // 「怎麼還回去」—— 一個到期 tick 分岔的 replica 會在**還原**的那一 tick 才
    // 分家。同樣先排序再 hash（`dot` 的先例）。
    const timed = c.attrGrantTimed;
    if (timed !== undefined) {
      for (const g of [...timed].sort(
        (a, b) =>
          a.expiresAtTick - b.expiresAtTick ||
          (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0) ||
          (a.attr < b.attr ? -1 : a.attr > b.attr ? 1 : 0),
      )) {
        m.str(g.attr);
        m.num(g.amount);
        m.num(g.expiresAtTick);
        m.str(g.origin);
      }
    }
  }
  for (const [id, ab] of w.abilities) {
    m.num(id);
    for (const slot of CORE_SLOTS) {
      const s = ab.slots[slot];
      m.num(s.rank);
      m.num(s.cooldownRemainingTicks);
    }
    if (ab.exSlot) {
      m.num(ab.exSlot.rank);
      m.num(ab.exSlot.cooldownRemainingTicks);
    }
    m.num(ab.basicAttackCdTicks);
    m.num(ab.unspentPoints);
    m.num(ab.cast ? 1 : 0);
    m.num(ab.windup ? 1 : 0);
  }
  for (const [id, st] of w.status) {
    m.num(id);
    for (const e of st.effects) {
      m.str(e.statusId);
      m.num(e.expiresAtTick);
      m.num(e.moveSpeedMult ?? 1);
      m.num((e.root ? 1 : 0) + (e.stun ? 2 : 0));
    }
  }
  m.num(w.combatActive ? 1 : 0);
  // PER-ZONE COMBAT LIVENESS (#216). `settledZones` decides whether the fire
  // ring keeps burning a zone and whether mobs keep arriving in it, so a
  // replica that disagrees about which duel already finished changes the sim.
  // Hashed right next to `combatActive` — sorted, so the Set's insertion order
  // (which is a host-iteration artefact) can never colour the digest.
  for (const zone of [...w.settledZones].sort((a, b) => a - b)) m.num(zone);
  m.num(w.settledZones.size);
  m.num(w.economyOpen ? 1 : 0);
  m.num(w.round);
  // FIRE RING (#195). `SimWorld.digest()` quantizes floats at 1/4096, but the
  // ring's safety predicate has ZERO tolerance: a position divergence too small
  // for the world digest to notice can still flip who is inside and who burns.
  // Hashing the ring's own counter AND radius here means the run that diverges
  // says so on the tick it happens, instead of surfacing later as an
  // unexplained HP gap. (`SimWorld.digest()` itself stays verbatim — see the
  // header: worldDigest must keep its exact pre-#195 expectations.)
  m.num(w.fireRingTicks);
  m.num(Math.round(currentFireRingRadius(w) * 4096));

  // --- MatchController host state (entirely outside the sim) ----------------
  m.str(ctl.phase.phase);
  m.num(ctl.phase.round);
  m.num(ctl.phase.ticksLeft);
  m.num(ctl.outcomeDecided ? 1 : 0);
  m.num(ctl.faultCount);
  for (const [teamId, lives] of ctl.lives) {
    m.num(teamId);
    m.num(lives);
    m.num(ctl.placements.get(teamId) ?? 0);
    m.num(ctl.roundOutcome.get(teamId) ?? 0);
    m.num(ctl.roundWins.get(teamId) ?? 0);
  }
  for (const [seatId, seat] of ctl.seats) {
    m.num(seatId);
    m.str(seat.championId);
    m.str(seat.driverKind);
    m.num(seat.ready ? 1 : 0);
    m.num(seat.entityId ?? -1);
    m.num(ctl.kills.get(seatId) ?? 0);
    m.num(ctl.deaths.get(seatId) ?? 0);
    m.num(ctl.roundKills.get(seatId) ?? 0);
    m.num(ctl.roundDeaths.get(seatId) ?? 0);
  }
  // Offers are host state and drive real grants; an offer that opened on one run
  // and not the other must surface here, not three rounds later as a stat gap.
  for (const [offerId, offer] of ctl.offers) {
    m.str(offerId);
    m.num(offer.createdTick);
    m.num(offer.seatId);
    for (const c of offer.choices) m.str(String(c));
    m.num(offer.picked === null ? -1 : 1);
  }
  m.num(ctl.bye ?? -1);
  for (const p of ctl.pairings) {
    m.num(p.zone);
    m.num(p.sideA);
    m.num(p.sideB);
  }
  return m.value();
}
