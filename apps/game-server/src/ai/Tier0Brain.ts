/**
 * Tier-0 AI driver: functional-but-dumb, per the plan.
 * Combat: acquire a target with the SHARED sim rule (sim/targeting.ts — the same
 * comparator a human's auto-attack uses, task #221), attack-move at it,
 * cast any ready ability at it (self-buffs on self). Non-combat: step along the
 * champion's buildPriority (first unowned affordable item), rank abilities per
 * skillOrder, ready-up. Thinks every AI_REPLAN_INTERVAL_TICKS, staggered by
 * seat so 12 brains never spike one tick.
 */
import { AI_REPLAN_INTERVAL_TICKS } from "@ggd/shared/constants";
import type { EntityId, ItemId } from "@ggd/shared/ids";
import type { Command, IntentFrame, Order } from "@ggd/shared/sim/intents";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { bodiesInCircle, resolveAbilityRange } from "@ggd/shared/sim/abilities/abilitySystem";
import {
  LEGENDARY_ORB_ITEM_ID,
  LEGENDARY_ORB_PRICE,
  shopChargeFor,
} from "@ggd/shared/sim/economy/itemTiers";
import { DEFAULT_BOT_SHOP, type BotShopConfig } from "@ggd/shared/content";
import { distSq } from "@ggd/shared/sim/math/vec2";
import { acquireRadius, acquireTarget } from "@ggd/shared/sim/targeting";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { Seat, SeatDriver } from "../seat/Seat";

/**
 * ⭐ GH#722 —— 一發**友方**技能（`targetsEnemies:false`）該打誰：
 * 施法距離內**最近的隊友**，一個都沒有就是**自己**。
 *
 * ⭐ 這條規則是**客戶端那一條的鏡像**，而那是刻意的：`input/allyTargets` 用既有的
 * `PickableUnit.priority` 讓施法者在自動索敵裡讓路（隊友在射程內就贏，沒有隊友時
 * 自己仍然被選上）—— 於是「bot 和玩家站在同一個位置會挑同一個目標」對友方那一側
 * 也成立，⛔ 而不是兩邊各長一條會漂的規則（同一個檔上面那段對**敵方**的說明）。
 *
 * ⭐ 候選走**出貨的** {@link bodiesInCircle}（`side:"allies"`），⛔ 不在這裡自己
 * 掃一遍 `world.team`：那一支已經帶著 zone 閘、`aliveOnly`、隱形閘、以及
 * 「沒有 TeamComp 的花/守護塔不是隊友」，而 sim 的友方分支**明確拒絕**花。
 * ⛔ 自己抄一份 = 第二個住處，而它漂掉的樣子是「bot 一直對花丟治療」。
 *
 * ⚠️ 決定性：`bodiesInCircle` 回 id 遞增，而這裡用嚴格 `<` ⇒ 同距離取**最小 id**。
 * ⚠️ 再驗一次**圓心到圓心**的距離：`bodiesInCircle` 用的是身體圓與圓的重疊
 * （邊緣擦到就算），而 `castAbility` 的射程閘量的是 `distSq(t.pos, tgt.pos)` ——
 * 不補這一行，剛好擦邊的那一位會讓每一次施放都變成一道接近指令。
 */
function nearestAllyOrSelf(world: SimWorld, id: EntityId, castRange: number): EntityId {
  const t = world.transform.get(id);
  if (!t) return id;
  let best = id; // 自己永遠合法：同隊、距離 0、不是花
  let bestD2 = Infinity;
  const maxD2 = castRange * castRange;
  for (const a of bodiesInCircle(world, id, t.pos, castRange, { side: "allies" })) {
    const at = world.transform.get(a);
    if (!at) continue;
    const d2 = distSq(t.pos, at.pos);
    if (d2 <= maxD2 && d2 < bestD2) {
      bestD2 = d2;
      best = a;
    }
  }
  return best;
}

/** Below this HP fraction the bot prefers an in-zone healing flower. */
const FLOWER_SEEK_HP_PCT = 0.65;
/** Max distance (units) at which a flower is worth walking to. */
const FLOWER_SEEK_RANGE = 12;

/**
 * Max distance (units) at which a bot walks to its team's REVIVE CIRCLE
 * (task #84). 18u covers the MAXIMUM measured death-to-nearest-ally distance
 * (17.04u over 406 revivable deaths), so a bot never ignores a circle it could
 * physically have reached inside the 6s lifetime — and never crosses the whole
 * 24u-radius zone for one it could not.
 *
 * Tier-0 is deliberately dumb: no risk assessment, no "am I winning this
 * fight". It walks in and stands there, exactly like the flower rule, and its
 * abilities keep firing at the enemy meanwhile. Without this the mechanic is
 * invisible in every bot match and a human playtesting with bot teammates
 * would never once be revived.
 */
const REVIVE_SEEK_RANGE = 18;

/**
 * KITING (ranged bots only). A ranged bot fights from its ATTACK RANGE and
 * backs off when an enemy closes inside a safety margin, then re-engages once it
 * has restored the gap. A melee bot is unaffected — it keeps closing to contact.
 *
 * The two fractions form a HYSTERESIS band so the bot cannot flip between
 * retreat and hold on consecutive replans (jitter): it STARTS kiting only when
 * the enemy is inside ENGAGE·range, and STOPS only once the distance has
 * recovered past REENGAGE·range. REENGAGE > ENGAGE by a wide margin, so an enemy
 * sitting in the band leaves the state untouched. REENGAGE also sits just below
 * OrderSystem's own hold point (0.9·range), so on re-engage the attackTarget
 * order settles the bot in range without a visible re-approach hop.
 */
const KITE_ENGAGE_FRACTION = 0.6; // enemy within 0.6·range -> start backing off
const KITE_REENGAGE_FRACTION = 0.85; // gap restored past 0.85·range -> hold & fire

/**
 * Ranged-vs-melee classification FALLBACK for a fighter with no champion doc
 * (the deterministic sim-test probes). Real champions are classified by their
 * doc's `attackType` (authoritative, the same field BasicAttackSystem reads);
 * this threshold only applies when no doc exists. Melee reach is ~1.6 and ranged
 * ~6–12 (task #128), so 4 cleanly splits the two.
 */
const RANGED_ATTACK_RANGE = 4;

/**
 * ENGAGE range (units) — the zone-wide fallback scan a bot falls back to when
 * nothing is inside its normal auto-acquire radius. A duel zone has a 24 u
 * radius, so 48 covers any two points inside one; the query is still zone-scoped
 * (`queryOverlap` honours `zone`), so this never reaches across duels.
 *
 * This is a BOT-ONLY behaviour, not a targeting rule: bots must walk across the
 * zone to start a fight, players are driven there by their own hands. The rule
 * that decides WHICH enemy is the shared one either way.
 */
const AI_ENGAGE_RANGE = 48;

/**
 * Ranged if the champion doc says so (authoritative), else inferred from the
 * unit's attack reach. Pure — used by the Tier-0 kiting decision.
 */
export function isRangedAttacker(
  attackType: "melee" | "ranged" | undefined,
  attackRange: number,
): boolean {
  if (attackType === "ranged") return true;
  if (attackType === "melee") return false;
  return attackRange >= RANGED_ATTACK_RANGE;
}

/**
 * Where a kiting ranged bot retreats to: a point one full attack range from the
 * enemy, directly behind the bot (i.e. away from the enemy). Walking there
 * restores the bot to its own attack range. Deterministic — a pure function of
 * the two positions plus the bot's facing (used only as the overlap fallback);
 * no RNG, no time, and Math.sqrt only (matching the sim's math helpers).
 */
export function kiteRetreatTarget(
  self: { x: number; z: number },
  enemy: { x: number; z: number },
  range: number,
  facing: { x: number; z: number },
): { x: number; z: number } {
  let ax = self.x - enemy.x;
  let az = self.z - enemy.z;
  let l = Math.sqrt(ax * ax + az * az);
  if (l < 1e-6) {
    // exactly overlapping: fall back to the bot's facing, then a fixed axis.
    ax = facing.x;
    az = facing.z;
    l = Math.sqrt(ax * ax + az * az);
    if (l < 1e-6) {
      ax = 1;
      az = 0;
      l = 1;
    }
  }
  return { x: enemy.x + (ax / l) * range, z: enemy.z + (az / l) * range };
}

/**
 * The next item to buy off a build path: the first entry we do not already own,
 * can afford, and are actually allowed to buy. Returns null when the build is
 * finished, unaffordable, or the inventory is full.
 *
 * CONTRACT: buildPriority is authored in ASCENDING cost order. The two rules
 * together are what make a bot climb its own ladder — skipping owned entries
 * advances it one step per purchase, and ascending order means "can't afford
 * the next step" makes it SAVE rather than skip ahead to something cheaper.
 * Without the owned-check the loop re-picks entry #1 every replan and the bot
 * finishes the match on one item.
 *
 * `buyable` is the BUILD-TOLERANCE seam (task #70). MatchController drops a
 * `buyItem` command for a non-whitelisted item BEFORE the sim sees it, so a
 * buildPriority entry the operator has not enabled can never be owned — and
 * without this predicate the loop re-picks that same entry on every replan and
 * the bot stalls on it FOREVER, buying nothing else for the rest of the match.
 * That is a live case, not a hypothetical: godie-i003 聖光石 sits in seven of
 * the thirteen demo-starter builds and is excluded from the shop because its
 * whole payload is an unported active (see starter.go gate S3). Skipping such
 * an entry, instead of stopping at it, is the difference between a bot that
 * finishes its ladder and a bot frozen at rung one. Defaults to "everything is
 * buyable", so the no-whitelist path is unchanged.
 */
export function nextBuildPurchase(
  build: readonly ItemId[],
  owned: readonly (ItemId | null)[],
  gold: number,
  costOf: (id: ItemId) => number | null,
  buyable: (id: ItemId) => boolean = () => true,
): ItemId | null {
  if (!owned.includes(null)) return null; // no free slot
  for (const itemId of build) {
    if (owned.includes(itemId)) continue;
    if (!buyable(itemId)) continue; // skip, never stall (see above)
    const cost = costOf(itemId);
    // A 0g rung is a DRAFT/LEGENDARY reward, not a shop entry (task #82): the
    // sim refuses to sell it, so `gold >= 0` would otherwise make the bot
    // re-issue a rejected buy every replan and stall forever — the same
    // never-stall rule as the whitelist skip above.
    if (cost !== null && cost > 0 && gold >= cost) return itemId;
  }
  return null;
}

export class AIDriver implements SeatDriver {
  readonly kind = "ai" as const;
  private plan: { order?: Order; commands: Command[] } = { commands: [] };
  private didReady = false;
  /**
   * Kiting hysteresis latch (ranged bots): true while backing off, false while
   * holding at range. Persisted across replans so the ENGAGE/REENGAGE band works
   * — it is pure sim-state-derived, so a same-seed replay latches identically.
   */
  private kiting = false;

  /**
   * @param buyable optional purchasability predicate (the match's content
   * whitelist). Omitted = everything is buyable, the pre-whitelist behavior.
   */
  constructor(
    private readonly buyable?: (id: ItemId) => boolean,
    /**
     * ⭐ bot 的商店規則（`rules.botShop`）。省略 = 出貨預設（買寶具、半價）——
     * ⚠️ **不是「關掉」**：一個沒傳它的建構點應該落在**設計**上，⛔ 不是落在
     * 「這個功能沒發生」（第〇·六守則：優先權大的更新預設啟動）。
     */
    private readonly botShop: BotShopConfig = DEFAULT_BOT_SHOP,
  ) {}

  onAttach(_seat: Seat): void {
    this.plan = { commands: [] };
    this.kiting = false;
  }

  onDetach(): void {
    this.plan = { commands: [] };
    this.kiting = false;
  }

  produceIntent(seat: Seat, world: SimWorld, tick: number): IntentFrame {
    // staggered re-plan: seat k thinks on ticks where tick % N == k % N
    if (tick % AI_REPLAN_INTERVAL_TICKS === seat.seatId % AI_REPLAN_INTERVAL_TICKS) {
      this.replan(seat, world);
    }
    const frame: IntentFrame = { order: this.plan.order, commands: this.plan.commands };
    this.plan = { order: undefined, commands: [] }; // orders are sticky in the sim; commands consumed
    return frame;
  }

  private replan(seat: Seat, world: SimWorld): void {
    const id = seat.entityId;
    if (id === null) return;
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const commands: Command[] = [];

    if (!t || !hp?.alive) {
      this.plan = { commands };
      return;
    }

    // ----- intermission decisions -----
    if (world.economyOpen) {
      const champ = world.champion.get(id);
      const ab = world.abilities.get(id);
      if (champ && ab) {
        // rank up per skill order
        if (ab.unspentPoints > 0) {
          const def = Champions.tryGet(champ.championId);
          for (const slot of def?.skillOrder ?? ["Q", "W", "E", "R"]) {
            commands.push({ kind: "rankUpAbility", slot });
          }
        }
        // walk the champion's build path one affordable step at a time
        const def = Champions.tryGet(champ.championId);
        const buy = nextBuildPurchase(
          (def?.buildPriority ?? []) as ItemId[],
          champ.items,
          champ.gold,
          (itemId) => Items.tryGet(itemId)?.cost ?? null,
          this.buyable,
        );
        if (buy !== null) {
          commands.push({ kind: "buyItem", itemId: buy });
        } else if (this.botShop.buyWeapons) {
          // ⭐ **bot 花錢買隨機寶具**（owner 2026-08-18：「一樣花錢買隨機寶具，
          // 只是消耗金錢是半價」）。
          //
          // ⛔ 這裡**沒有新機制**：「花錢抽一件隨機寶具」就是**傳說寶玉**，
          // 它已經存在、已經是決定性的（骰子在 `world.rng` 上、在 sim 裡擲）、
          // 已經會開一張三選一卡，而 bot 的自動選卡路徑已經會把它選掉。
          // ⇒ bot 只要送出跟人類一模一樣的那一個 `buyItem` 就好。
          //
          // ⚠️ 半價**不在這裡**：折扣是 `ChampionComp.shopPriceMult`，由
          // MatchController 在開場照座位的 driver 填（`rules.botShop.priceMult`）。
          // 在這裡先扣一半再送出去，sim 會收全額 —— 兩邊各算一次價就是遲早分岔的
          // 兩份價目表。這裡只用它算「買不買得起」。
          //
          // ⭐ GH#474（2026-08-20）——「推薦出裝」整條**退場**了，所以這個 `else`
          // 現在是**每一位** bot 的路徑，⛔ 不再是「沒有梯子的那 66 位」。
          // owner 逐字：「**拔乾淨**，現在 bot 都是**半價購買隨機寶具**，但**隨機三選一
          // 還是會根據自己屬性購買有利的選項**（不會變成法師買近戰暴擊武器）」。
          // ⇒ 出貨內容的 `buildPriority` 一律是 `[]`（守衛：`buildPath.test.ts` 的
          //   「推薦出裝已退場」），於是 `nextBuildPurchase` 必然回 null 而落到這裡。
          // ⚠️ ⛔ 上面那個 `if` **沒有被拿掉**是刻意的：它是骨架註冊表（`skeleton.ts`
          //   的兩位仍帶著兩件）與任何手動塞梯子的除錯路徑仍然走得通的地方 ——
          //   拔掉它會讓「內容全毀退回骨架」那條路上的 bot 一件都不買。
          // ⚠️ owner 同一則還說「**隨機三選一還是會根據自己屬性購買有利的選項**」——
          //   ⛔ **那件事今天沒有發生**（2026-08-20 量到的，第三守則：不要把期望寫成註解）。
          //   bot 從來不送 `pickOffer`，牠拿到的卡一律由 `MatchController.autoPickIndex`
          //   在計時器上自動選掉，而那是 `seed × offerId` 的純雜湊 ——
          //   **一格屬性都沒讀**。⇒ 法師真的會抽到近戰暴擊武器。
          //   這是一條獨立的缺口（要一支「照 champion 的屬性權重挑卡」的比較器），
          //   ⛔ 不在 #474 的範圍內，已在回報中點名。
          const price = shopChargeFor(this.botShop.priceMult, LEGENDARY_ORB_PRICE);
          if (champ.gold >= price) {
            commands.push({ kind: "buyItem", itemId: LEGENDARY_ORB_ITEM_ID });
          }
        }
        if (!this.didReady) {
          commands.push({ kind: "ready" });
          this.didReady = true;
        }
      }
    } else {
      this.didReady = false;
    }

    // ----- combat: THE shared target rule (task #221) -----
    // This used to be the bot's own nearest-living-enemy loop — a SECOND
    // targeting brain, living in the host, that (a) could drift away from what
    // players do and (b) does not replay, because playback reconstructs drivers
    // rather than replaying their decisions. It is now two calls to the one
    // deterministic comparator in `@ggd/shared/sim/targeting`
    // (champion→mob, 威脅→低血→最近, entity id as the final tiebreak):
    //
    //   CLOSE  — the exact radius a human's auto-acquire uses, so a bot and a
    //            player standing in the same spot pick the same enemy. This is
    //            also what keeps mobs (#215) in the fight: a zombie next to me
    //            outranks an enemy hero on the other side of the zone.
    //   ENGAGE — a zone-wide fallback used ONLY when nothing is close. This is
    //            the one thing a bot has that a player does not, and it is not
    //            a targeting rule but a "walk over there and start a fight"
    //            rule; without it a bot would stand at spawn forever.
    const close = acquireTarget(world, id, acquireRadius(world.stats.get(id), t.radius));
    const picked = close ?? acquireTarget(world, id, AI_ENGAGE_RANGE);
    const nearest: EntityId | null = picked ? picked.id : null;
    const nearestD2 = picked ? picked.d2 : Infinity;

    // ----- utility rule: hurt + a healing flower nearby -> harvest it -----
    // (flowers only exist during combat; deterministic: lowest-distance, then
    // lowest id via ascending store iteration)
    let flowerTarget: EntityId | null = null;
    if (hp.maxHp > 0 && hp.hp < hp.maxHp * FLOWER_SEEK_HP_PCT) {
      let bestD2 = FLOWER_SEEK_RANGE * FLOWER_SEEK_RANGE;
      for (const [fid, f] of world.flower) {
        if (f.zone !== t.zone) continue;
        const ft = world.transform.get(fid);
        const fhp = world.health.get(fid);
        if (!ft || !fhp?.alive) continue;
        const d2 = distSq(t.pos, ft.pos);
        if (d2 < bestD2) {
          bestD2 = d2;
          flowerTarget = fid;
        }
      }
    }

    // ----- kiting: ranged bots hold at range and back off when crowded -----
    // Classify by the champion doc's attackType (authoritative; what
    // BasicAttackSystem reads) and fall back to the attack reach for doc-less
    // probes. Then update the retreat/hold hysteresis latch from the live gap.
    const champC = world.champion.get(id);
    const sc = world.stats.get(id);
    const myRange = sc?.final[Stat.AttackRange] ?? 0;
    const myAttackType = champC ? Champions.tryGet(champC.championId)?.attackType : undefined;
    const ranged = isRangedAttacker(myAttackType, myRange);
    if (ranged && nearest !== null && myRange > 0) {
      const d = Math.sqrt(nearestD2);
      if (this.kiting) {
        if (d > myRange * KITE_REENGAGE_FRACTION) this.kiting = false;
      } else if (d < myRange * KITE_ENGAGE_FRACTION) {
        this.kiting = true;
      }
    } else {
      this.kiting = false;
    }

    let order: Order | undefined;
    if (nearest !== null) {
      // KITE (ranged, enemy inside the safety margin): retreat to restore the
      // gap. Otherwise attack-target it — OrderSystem walks a ranged unit up to
      // 0.9·range and holds, so autos/casts already fire from range, not melee.
      const tgtT = world.transform.get(nearest)!;
      order = this.kiting
        ? { kind: "move", point: kiteRetreatTarget(t.pos, tgtT.pos, myRange, t.facing) }
        : { kind: "attackTarget", entity: nearest };
      // cast any ready, learned ability (still fires while kiting: attack from
      // range, keep backing off)
      const ab = world.abilities.get(id);
      if (ab) {
        for (const slot of ["Q", "W", "E", "R"] as const) {
          const inst = ab.slots[slot];
          if (inst.rank <= 0 || inst.cooldownRemainingTicks > 0) continue;
          const abilityDef = Champions.tryGet(world.champion.get(id)!.championId)?.abilities[slot];
          if (!abilityDef) continue;
          const mana = abilityDef.manaCost[inst.rank - 1] ?? 0;
          if ((world.health.get(id)?.mana ?? 0) < mana) continue;

          // ⭐ GH#149 —— 射程一律走 `resolveAbilityRange`，⛔ 不是 `def.range`。
          //
          // `def.range` 是**卡面**的數字；場上真正認的是它乘上 #136 的系統倍率
          // (`world.combatEnv.abilityRange`)，而 `abilitySystem` 的三個消費者
          // （cast 驗證、ground 落點夾取、投射物的 `remainingRange`）全部讀那一份。
          // 在此之前這裡拿的是未乘倍率的原始值，於是 bot 以為自己的射程是實際的
          // 1/倍率 倍，而三種 castType **各自壞在不同的地方**：
          //   · `targeted`  → sim 回 `out-of-range`：不燒魔不上 CD，但每次 replan
          //                   都送出一個必被拒的指令，那一 tick 就沒有別的動作了；
          //   · `skillshot`/`dash` → castAbility 對方向型**完全沒有距離檢查**，
          //                   照扣魔照上 CD，而投射物只飛倍率後的距離 ⇒ **必定射空**；
          //   · `ground`    → 落點被夾回倍率後的距離，AoE 打在半路上。
          // 後兩者會同時汙染命中率、法力曲線與冷卻使用率三組平衡數字，而 bot 正是
          // 那些數字的來源。
          //
          // ⛔ 這裡刻意**不抄 0.8 這個數字**：倍率是 `content/config/combat-env.json`
          // 的一格後台欄位（2026-08-22 是 0.8，開票當時是 0.6），抄下來就是第四個住處。
          // ⚠️ 上一版註解寫著「Exactly the range the sim honours」——那是**半套修正**
          // 留下的謊話（有人拿掉了 1.2 灌水係數，卻沒補上 #136 的倍率），第三守則。
          const castRange = resolveAbilityRange(world, abilityDef.range);
          const inCastRange = nearestD2 <= castRange * castRange;

          // ⭐⭐ GH#722 —— 這一發打**哪一側**，由 `def.targetsEnemies` 決定。
          //
          // ⛔ 在此之前這整個 switch 無條件送 `nearest`（＝最近的**敵人**），
          // 而出貨內容裡有 5 支 `targetsEnemies:false`（4 支 targeted ＋ 1 支 ground）
          // ⇒ bot 每一次施放都被 `abilitySystem` 的友方分支判 `bad-target`
          // （那一段逐字：友方技能「can never target a neutral flower — nor an ENEMY」）
          // ⇒ 不扣魔、不上冷卻、每一次 replan 再送一次 —— **一場都沒放出去過**。
          //
          // ⭐ 側別判準是 `targetsEnemies === false`，與 sim（`abilitySystem`）和
          //   客戶端（`AimResolver.aimsAtAllies`）**同一個預設**（省略 = 敵方）。
          const friendly = abilityDef.targetsEnemies === false;
          const ally = friendly ? nearestAllyOrSelf(world, id, castRange) : null;
          // ⚠️ 友方那一側**不吃 `inCastRange`**：那個布林量的是「離**敵人**多遠」，
          //   而 `nearestAllyOrSelf` 挑的東西本來就已經夾在 `castRange` 裡（最差是自己，距離 0）。
          const canCast = friendly || inCastRange;
          const allyT = ally !== null ? world.transform.get(ally) : undefined;
          switch (abilityDef.castType) {
            case "self":
              commands.push({ kind: "castAbility", slot, target: { type: "self" } });
              break;
            case "targeted":
              if (canCast)
                commands.push({
                  kind: "castAbility",
                  slot,
                  target: { type: "entity", entityId: ally ?? nearest },
                });
              break;
            case "skillshot":
            case "dash": {
              if (inCastRange) {
                // ⚠️ 出貨內容裡**零支**方向型友方技能（量到的：friendly = 4 targeted
                //   ＋ 1 ground）⇒ ⛔ 這裡不寫一條走不到的友方分支（它會假裝自己是閘）。
                const dir = { x: tgtT.pos.x - t.pos.x, z: tgtT.pos.z - t.pos.z };
                commands.push({ kind: "castAbility", slot, target: { type: "dir", dir } });
              }
              break;
            }
            case "ground": {
              // 友方地面 AoE（`godie-o00l.e` 破法對咒）落在**隊友**腳下，
              // ⛔ 不是敵人腳下 —— `groundAoeTargets` 的友方分支是以落點展開的。
              const at = friendly ? (allyT?.pos ?? t.pos) : tgtT.pos;
              if (canCast)
                commands.push({
                  kind: "castAbility",
                  slot,
                  target: { type: "point", point: { x: at.x, z: at.z } },
                });
              break;
            }
          }
        }
      }
    }

    // the flower wins the ORDER slot when hurt (abilities above still fire at
    // the enemy — the bot heals up while continuing the fight)
    if (flowerTarget !== null) {
      order = { kind: "attackTarget", entity: flowerTarget };
    }

    // ----- utility rule: my team dropped a revive circle -> go stand in it ---
    // Outranks the flower: 18% HP is worth less than a whole teammate. A circle
    // is ground area, not a unit, so this is a MOVE order (attackTarget would
    // find nothing to hit); arriving is the channel. Deterministic — the
    // reviveCircle store iterates in ascending id order.
    if (world.reviveRules) {
      const myTeam = world.team.get(id);
      let bestD2 = REVIVE_SEEK_RANGE * REVIVE_SEEK_RANGE;
      let seek: { x: number; z: number } | null = null;
      for (const [cid, rc] of world.reviveCircle) {
        if (rc.zone !== t.zone) continue;
        if (!myTeam || rc.teamId !== myTeam.teamId) continue; // only my own team's
        if (rc.ownerId === id) continue; // cannot channel your own corpse
        const ct = world.transform.get(cid);
        if (!ct) continue;
        const d2 = distSq(t.pos, ct.pos);
        if (d2 < bestD2) {
          bestD2 = d2;
          seek = { x: ct.pos.x, z: ct.pos.z };
        }
      }
      if (seek) order = { kind: "move", point: seek };
    }

    this.plan = { order, commands };
  }
}
