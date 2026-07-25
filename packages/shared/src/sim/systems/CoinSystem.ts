/**
 * CoinSystem (task #191) — the PICKUP half of 陣亡投幣. The throw happens in
 * `commandSystem` (pipeline slot 3); this runs at slot 9e, after guardians and
 * before regen, so this tick's deaths, revives and guardian payouts have all
 * settled and `hp.alive` is final before anyone is paid.
 *
 * SAME-TICK PICKUP IS LEGAL, and follows from that ordering: slot 3 precedes
 * slot 9e, so a coin thrown onto a living champion who is ALREADY standing on
 * the landing slot is banked on the throw tick. That is the correct reading of
 * 「經過的玩家」 — a coin tossed at someone's feet is caught — and it stays
 * deterministic because both slots are fixed.
 *
 * WHO GETS IT: the first LIVING champion in ascending entity id within
 * `pickupRadius`, in the coin's own zone. Ties break to the lowest entity id
 * (the ReviveSystem precedent), and each champion may bank at most ONE coin per
 * tick, so a champion standing on a pile drinks it one coin at a time and the
 * outcome never depends on iteration luck.
 *
 * FRIEND OR FOE. The owner said 「經過的玩家」 with no qualifier, and the
 * ambiguity is the drama: your last 100 gold may fund the enemy who killed you.
 * There is deliberately no team check here.
 *
 * WHY IT CANNOT BE DOUBLE-COLLECTED: the sim is single-threaded and
 * server-authoritative, the gold is added and the entity destroyed in the same
 * statement pair, and no client banks anything — the schema's gold arrives from
 * the next snapshot.
 *
 * NOT `grantGold`. The pickup adds inline and scores its own
 * `matchStats.coinsCollected`. Routing it through `grantGold` would inflate
 * `goldEarned` by 100 per coin for gold that was already counted as earned when
 * the thrower first got it, letting a pair of players pump the settlement rating
 * by 1000 a round for money that never entered the economy.
 */
import type { SimWorld } from "../SimWorld";
import { distSq } from "../math/vec2";

export function coinSystem(world: SimWorld): void {
  const rules = world.coinRules;
  if (!rules) return;
  if (world.coin.size === 0) return;

  const r2 = rules.pickupRadius * rules.pickupRadius;
  /** one coin per champion per tick — see the module doc */
  const paid = new Set<number>();

  for (const [coinId, coin] of world.coin) {
    const ct = world.transform.get(coinId);
    if (!ct) continue;
    for (const [champId] of world.champion) {
      if (paid.has(champId)) continue;
      const hp = world.health.get(champId);
      if (!hp?.alive) continue;
      const t = world.transform.get(champId);
      if (!t || t.zone !== coin.zone) continue;
      if (distSq(t.pos, ct.pos) > r2) continue;
      const champ = world.champion.get(champId)!;
      champ.gold += coin.value;
      const stats = world.matchStats.get(champId);
      if (stats) stats.coinsCollected += 1;
      paid.add(champId);
      world.destroy(coinId);
      world.emit("coinPickedUp", {
        id: coinId,
        entity: champId,
        seatId: world.team.get(champId)?.seatId ?? -1,
        x: ct.pos.x,
        z: ct.pos.z,
        value: coin.value,
        gold: champ.gold,
      });
      break; // this coin is gone; move to the next one
    }
  }
}
