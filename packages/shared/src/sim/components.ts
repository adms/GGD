/**
 * Simulation components — plain POJOs stored in Map<EntityId, T> stores on the
 * World. NOT Colyseus schema objects (those live in protocol/ and are projected
 * from these at snapshot time).
 */
import type { EntityId, SeatId, TeamId, ChampionId, ItemId, AugmentId, ProjectileId, StatusId } from "../ids";
import type { Vec2 } from "./math/vec2";
import type { CastableSlot, Order } from "./intents";
import type { AttrBonus, AttrKey } from "./stats/attributes";
import type { DamageType } from "./effects/effect";

/** Planar transform: position (x,z), unit facing, collision radius. NO y. */
export interface Transform {
  pos: Vec2;
  /** current velocity (units/sec) — written by MovementSystem */
  vel: Vec2;
  /** unit facing direction (no angles) */
  facing: Vec2;
  radius: number;
  /** which arena zone this entity fights in (PairedDuels) */
  zone: number;
  /**
   * acceleration ramp 0..1 (fraction of full move speed) — written by
   * MovementSystem; optional so hand-built transforms (tests) stay valid.
   */
  accel?: number;
}

/**
 * WHICH damage an absorb pool eats (owner 2026-07-30:「護盾的確有分**吸收所有
 * 傷害**跟**吸收 AP 傷害 only**」).
 *
 * ABSENT on a stored pool means `"all"`, which is byte-for-byte the behaviour
 * every shield had before the filter existed — so no shipped shield changed
 * meaning when this landed. See `combat/damage.ts` for the absorb ORDER rule and
 * `effects/shield.ts` for the authoring field.
 */
export type ShieldAbsorb = "all" | DamageType;

export interface Health {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  /**
   * Absorb pools, oldest first. `absorbs` (optional, absent = `"all"`) is the
   * damage-type filter: a `"magic"` pool is invisible to a physical packet — it
   * neither absorbs nor is consumed by it.
   */
  /**
   * ⚠️ `stackKey` 是 GH#299（S1）加的**不疊加政策**的身分欄位，不是顯示用的名字：
   * 兩片 key 相同的盾是「同一片盾」，怎麼合併由 `addShield` 的 `onExisting` 決定。
   * 缺席 = 這一片盾誰也不認得，永遠獨立存在（2026-08-09 之前每一片盾的行為）。
   */
  shields: {
    amount: number;
    expiresAtTick: number;
    sourceId: string;
    absorbs?: ShieldAbsorb;
    stackKey?: string;
  }[];
}

export interface TeamComp {
  teamId: TeamId;
  seatId: SeatId;
}

/** Forced linear displacement integrated by MovementSystem with collision. */
export interface DashOverride {
  kind: "dash" | "knockback";
  dir: Vec2;
  speed: number;
  remaining: number;
  /**
   * PROVENANCE — was this displacement **authored by an ability**, or is it the
   * ambient shove every landed hit produces? ABSENT = false = damage-driven,
   * which is exactly what every pre-existing writer meant.
   *
   * ⚠️ This is not decoration: it is the tiebreak input for the ONE ordering
   * problem this slot has. `SimWorld.step()` runs effects at slot 2b/3 and only
   * drains the damage queue at slot 8, so an ability that BOTH shoves and hurts
   * used to have its own shove overwritten by its own damage, in the same tick,
   * unconditionally (`combat/damage.ts`). Every shipped ability that wants a
   * 擊退 also deals damage, so the primitive was dead on the shipping path.
   * Who wins is now `combatFeel.damageShoveWins`, and this flag is how the
   * arbiter can tell the two writers apart. See `combat/damage.ts`'s
   * SHOVE ARBITRATION section and `sim/knockbackVsDamage.test.ts`.
   *
   * A `LeapOverride` needs no such flag: only `movement/leap.ts#startLeap`
   * writes one and every caller of it is an ability, so a leap is authored by
   * construction.
   */
  authored?: boolean;
}

/**
 * A parabolic LEAP in flight (task #247) — integrated by LeapSystem, which runs
 * immediately before MovementSystem and owns the whole arc (planar position,
 * height, and the landing detonation).
 *
 * Absolute-parametric by design: position and height are pure functions of
 * `(from, to, elapsed, ticks)`, never accumulated, so the arc cannot drift and a
 * hitstop freeze / replay seek resumes on exactly the same curve.
 */
export interface LeapOverride {
  kind: "leap";
  /** takeoff position (snapshotted) */
  from: Vec2;
  /** LEGAL landing point, proved at takeoff (movement/leap.ts) */
  to: Vec2;
  /** apex height in integer MILLI-units (determinism — see movement/leap.ts) */
  apexMilli: number;
  /** integer tick budget, derived once from the content's durationSec */
  ticks: number;
  /** integer ticks elapsed, 0..ticks */
  elapsed: number;
  /** effects run on the LANDING tick, centred on `to` */
  onLand: import("./effects/effect").EffectDef[];
  /** rank of the spawning ability (for scaling in onLand) */
  rank: number;
  /** landing burst radius in GGD units (0 = the flyer alone) */
  landRadius: number;
  /** who owns the landing effects (differs from the flyer for thrown targets) */
  casterId: EntityId;
  /** provenance for the landing damage, e.g. "ability:godie-hpb1.e" */
  origin: string;
  /** slot of the spawning ability (for slot-conditioned hooks) */
  slot?: CastableSlot;
}

/** Navigation state driven by OrderSystem, consumed by MovementSystem. */
export interface Navigation {
  order: Order | null;
  /** resolved current move target (or null when idle/arrived) */
  moveTarget: Vec2 | null;
  /**
   * movement override (dash/knockback/leap) — wins over normal movement.
   *
   * `knockback` is a forced impulse applied by a landed hit (combat/damage.ts):
   * identical integration to a dash (moveWithCollision, so it never clips walls)
   * but tagged so the client can play a hurt-slide instead of a dash animation.
   *
   * `leap` (task #247) is a DIFFERENT INTEGRATOR in the SAME SLOT — see
   * movement/leap.ts for why it is not a dash variant (a dash's per-tick body is
   * `moveWithCollision`, which is precisely the call that stops a body at a
   * wall) and why it nevertheless shares the slot (everything already built
   * around "an override exists" — hitstop, root-immunity, ENTITY_FLAG.DASHING,
   * every death/reset path that nulls the override — stays correct for free,
   * and "dash OR leap, never both" becomes true by construction).
   */
  override: DashOverride | LeapOverride | null;
  /** basic-attack target acquired by attack-move / attackTarget orders */
  attackTarget: EntityId | null;
  /**
   * PROVENANCE of `attackTarget` (task #221): true when the sim's auto-acquire
   * rule chose it, false when the SEAT ordered it (a right-click / A-click /
   * gamepad pick, human or bot).
   *
   * Without this flag the two are indistinguishable, and auto-acquire would
   * re-point or leash-drop a target the player deliberately clicked — exactly
   * the "must not override an explicit player action" constraint. Reset
   * wherever `attackTarget` is written or cleared.
   */
  attackTargetAuto: boolean;
}

export interface ProjectileComp {
  projectileId: ProjectileId;
  ownerId: EntityId;
  dir: Vec2;
  speed: number;
  remainingRange: number;
  hitRadius: number;
  /** ids already hit (pierce support); single-hit projectiles despawn on first */
  pierce: boolean;
  hitSet: Set<EntityId>;
  /** effects executed on each unit hit (caster = owner) */
  onHit: import("./effects/effect").EffectDef[];
  /** rank of the spawning ability (for scaling in onHit) */
  rank: number;
  origin: string;
  /** slot of the spawning ability (for slot-conditioned onAbilityHit hooks) */
  abilitySlot?: CastableSlot;
  /**
   * Basic-attack projectile (ranged auto). On impact it applies `basicDamage`
   * as origin "basic" (feeds lifesteal) and fires `onBasicAttack` item hooks —
   * i.e. the on-hit pipeline resolves at impact, not at the swing.
   */
  basic?: boolean;
  basicDamage?: number;
  crit?: boolean;
  /**
   * [暴擊吸血] (天堂之劍 godie-i01n) — the lifesteal fraction THIS shot procced,
   * rolled at the swing in `systems/BasicAttackSystem.ts` and paid at impact by
   * `combat/damage.ts`. `undefined` = this shot did not proc, which is every
   * shot in the game until an item authors `critStrike`.
   *
   * ⚠️ IT HAS TO RIDE THE MISSILE. The roll happens when the bow is loosed and
   * the payout happens when the arrow lands, possibly seconds later and after
   * the wielder has swung again — so 「was THIS shot the proc」 is knowable only
   * here. Reading the grant again at impact would pay 100 % lifesteal on every
   * arrow in flight. Same two-push-site trap `combat/damageTypeOverride.ts`
   * documents, from the other end.
   */
  critLifesteal?: number;
  /**
   * ⭐ G8 —— 這一箭被**哪幾條** `critStrike` 來源加成了（`ModifierSource.id`）。
   * `undefined` = 沒有任何 grant 參與 = 這個欄位出現之前的每一發。
   *
   * ⚠️ 與 {@link critLifesteal} **同一個理由**騎在飛彈上：骰在放箭那一刻，而
   * `HookDef.critSource: "thisSource"` 在命中那一刻才問。命中時再讀一次身上的
   * grant，會讓飛行中的每一箭都算成「那一條打的」。
   */
  critSources?: readonly string[];
}

/**
 * 一格裝備是**怎麼進來的** —— owner 2026-08-17 的兩句話，一個物件。
 *
 * 「賣價一定是取得價的 40%（後台可設定）」 → {@link paid}
 * 「可註記目前取得的寶具是否為隨機取得」   → {@link random}
 *
 * ⛔ 這兩件事都**推不出來**：`ItemDef.cost` 對 49 把寶具全部是 0，而「免費發的
 * 那一把」與「花 9,600 買的同一把」在 `items[]` 上長得一模一樣。只能記。
 */
export interface ItemAcquisition {
  /**
   * 這一格**實付**了多少金幣。三選一卡／傳說寶玉抽到的 = **0**。
   *
   * ⚠️ 寶玉抽到的記 0 而**不是**寶玉的 2400：那 2400 買的是「抽一次」這件事，
   * 抽到的那一把本身沒有收錢。記 2400 的話，連抽三次的人可以把三把都賣掉，
   * 每一把多退 960 —— 一台一場多印 2,880 金的機器。
   */
  paid: number;
  /**
   * 是不是**隨機**拿到的（三選一卡 / 傳說寶玉 / 任何 `grantItemFree`）。
   * 商店掏錢買的 = `false`。⛔ 它不是 `paid === 0` 的同義詞：未來一定會有
   * 「免費但不是隨機」的發法（活動、劇情、後台送），那時這一格仍然是對的。
   */
  random: boolean;
}

/** Marker/state bags filled in by later steps (stats, abilities, …). */
export interface ChampionComp {
  championId: ChampionId;
  level: number;
  xp: number;
  gold: number;
  items: (ItemId | null)[];
  /**
   * ⭐ 每一格**怎麼拿到的** —— 與 {@link items} **同一個索引**、同一個長度
   * （owner 2026-08-17：「賣價一定是取得價的 40%」「可註記目前取得的寶具是否為
   * 隨機取得」）。空格是 `null`。
   *
   * ⛔ 為什麼不是另一張 map（`Map<ItemId, …>` 或 `Record<itemId, …>`）：
   * 身分是**格子**不是道具。同一把道具可以同時躺在兩格（不 unique 的），一格
   * 用買的一格是三選一發的 —— 用 itemId 當 key 的表只裝得下其中一個答案，
   * 而 undo / 賣掉 / 換裝 會讓那個答案指向錯的那一格。
   *
   * ⚠️ 它是 {@link items} 的**同位**欄位，所以⛔ 任何地方都不要單獨寫
   * `champ.items[slot] = …` —— `economy/shop.ts` 的 `setSlot`/`clearSlot` 是
   * 唯二的寫入口，兩條陣列一起動。漂掉的代價是玩家賣掉一把 9,600 金的寶具
   * 拿回 0（或反過來，一台印鈔機）。
   *
   * OPTIONAL + 由 `spawnChampion` 配置，理由與 `attrGrantProgress` 一字不差：
   * 全 repo 手寫的 `ChampionComp` 夾具不用一個一個改，而讀取一律走
   * `slotAcquisition()`，缺這一格 = 「不知道付了多少」= 退款 0（fail-closed，
   * ⛔ 不會憑空生錢）。
   *
   * SIM state：跟著 seed replay、重連還在、⛔ 不碰 `world.rng`。
   */
  itemAcq?: (ItemAcquisition | null)[];
  augments: AugmentId[];
  /**
   * 能力屬性強化 progress — CONSECUTIVE stat-tick purchases with no item
   * purchase in between (task #82). This single counter IS the whole
   * "bought nothing else" predicate, because the user's reset rule
   * (「第 19 次時買了普通道具會怎樣——歸零」) zeroes it on ANY gold purchase of a
   * real item. A weapon GRANTED by a 3-choose-1 card does not touch it —
   * 「除了隨機三選一給的武器」 — because free grants never run through buyItem.
   *
   * Keeps counting past {@link STAT_TICK_TARGET}: the tick itself is uncapped,
   * only the capstone is once-per-match.
   */
  statStacks: number;
  /**
   * 三圍 BOUGHT this match — the running sum of every 能力屬性強化 三選一 pick
   * (#260). Owner: 「購買能力屬性加成也是三選一 力/敏/智 隨機加點 0.1-2」.
   *
   * It is an ATTRIBUTE total, not a stat total, and `championStatBase` folds it
   * in exactly where a champion's innate 三圍 goes — so +1 STR pays the same
   * maxHealth/regen/ad it pays an innate point, at the operator's LIVE
   * `strToMaxHealth`, and +1 AGI keeps attack speed's multiplicative form.
   * See stats/attributes.ts for why baking it into StatModifiers would be wrong.
   *
   * SURVIVES the 歸零 reset (`resetStatPath`) exactly like the pre-#260 rolls
   * did: buying an item withdraws progress toward the CAPSTONE, it does not
   * confiscate attributes already paid for.
   */
  attrBonus: AttrBonus;
  /**
   * Rolled magnitude of the 傳說·萬象強化 capstone, 10..100 (percent), or 0
   * when it has not been granted. Doubles as the once-only guard.
   */
  statCapstonePct: number;
  /**
   * Inventory slots RESERVED by 傳說寶玉 rolls that have not been picked yet
   * (task #82).
   *
   * The orb's slot check is EAGER (at purchase) but its grant is DEFERRED (at
   * pick), and the shop stays open in between — so without a reservation a
   * player could buy the orb with one slot left, spend that slot on a 300g
   * item, and have the legendary land nowhere: `grantItemFree` returns -1,
   * the offer is dropped, and 2400g bought nothing. This counter closes that
   * window by making {@link buyItem} treat the reserved slots as already
   * occupied. It is SIM state, not host state, so it replays with the seed and
   * a reconnecting client cannot desync on it.
   */
  pendingOrbSlots: number;
  /**
   * ⭐ **這位英雄的售價倍率**（owner 2026-08-18：bot「消耗金錢是半價」）。
   *
   * ⛔ 為什麼是一格倍率而不是 `if (isBot)`：sim 從頭到尾**不知道「bot」這個概念**，
   * 也不該知道 —— 一旦它學會了，第二個、第三個地方就會各自再學一次。host 在
   * 開場照座位的 driver 把 `rules.botShop.priceMult` 填進來，sim 只做乘法。
   * ⇒ owner 哪天要「新手前三場半價」或「劣勢方打折」，那也是同一格。
   *
   * ⭐ **刻意是 optional 的**：`shopChargeFor` 把 undefined 當成 1，所以每一份
   * 既有夾具、每一條既有的路都逐位元不變 —— 加一個必填欄位會逼 30 份測試夾具
   * 各補一行 `shopPriceMult: 1`，而那 30 行沒有一行在表達任何意思。
   */
  shopPriceMult?: number;
  /**
   * The current shopping session's UNDO HISTORY (task #121). A LIFO stack of
   * the exact buy/sell transactions the player made THIS session, newest last;
   * `undoShopAction` pops the top and reverses it precisely (see shop.ts).
   *
   * WHY A STACK, AND WHY IT MUST STORE THE APPLIED DELTA. The sell refund is a
   * floored 40% (`SELL_REFUND`), so an undo that RE-DERIVED the gold to reverse
   * could drift from what was actually applied and leak/burn a coin per cycle —
   * the exact seam a money exploit lives in. Each entry therefore records the
   * gold delta that was really applied and (for a buy) the stat-streak it reset,
   * so the reversal is byte-exact and a buy→sell→undo→undo round-trip returns to
   * the precise starting gold+inventory. An entry is popped when undone, so the
   * same action can never be undone twice; the stack is CLEARED when combat
   * begins (enterCombat), which commits the round's purchases — you cannot undo
   * across a closed shop, so no cycle can ever net positive gold.
   *
   * SIM state (not host state): it replays with the seed, survives reconnects,
   * and is never touched by `world.rng`, so it perturbs no random stream.
   */
  undoStack: ShopTxn[];
  /**
   * 「每 N 次才給一次」 progress for `effects/grantAttribute.ts`, keyed
   * `<origin>|<attr>` and stored MODULO the effect's own `everyNth`.
   *
   * OPTIONAL AND LAZILY CREATED on purpose: every existing `ChampionComp`
   * construction site (spawnChampion, the form-swap rebuild, every test
   * fixture) stays valid untouched, and a champion who carries no counting
   * passive — 118 of the 119 — allocates nothing.
   *
   * Keyed by ORIGIN, not just by attribute: two different abilities that both
   * count toward an AGI grant must not share one tally, or the second one to
   * land would silently steal the first's progress.
   *
   * SIM state, so it replays with the seed and survives a reconnect. It is NOT
   * on the wire and does not need to be — the PAYOUT lands in `attrBonus`,
   * which is already projected to the client (`SeatState.attrBonus`).
   */
  attrGrantProgress?: Record<string, number>;
  /**
   * TIMED 三圍 grants still standing (08-00 龍紋記憶's 3-second ×2), each with
   * the ABSOLUTE tick it comes back off at.
   *
   * The bonus itself is already inside {@link attrBonus} — this array only
   * records how to UNDO it. That split is deliberate: every consumer of a
   * champion's attributes (championStatBase, the shop preview, the champ-select
   * table, `SeatState.attrBonus`) reads `attrBonus` and nothing else, so a
   * temporary attribute is correct on all of them for free, and there is exactly
   * ONE thing that has to remember to reverse it
   * (`effects/grantAttribute.ts::attrGrantExpirySystem`).
   *
   * Optional + lazily created, like `attrGrantProgress`: no construction site
   * changes and 118 champions allocate nothing.
   */
  attrGrantTimed?: { attr: AttrKey; amount: number; expiresAtTick: number; origin: string }[];
}

/**
 * One reversible shop action (task #121). `goldDelta` is the change that was
 * actually applied to `gold` when the action ran — NEGATIVE for a buy (gold
 * spent), POSITIVE for a sell (refund received) — so an undo is always exactly
 * `gold -= goldDelta`, never a re-derived figure that could disagree with what
 * the player was charged/paid.
 */
export interface ShopTxn {
  kind: "buy" | "sell";
  itemId: ItemId;
  /**
   * 這一格被賣掉之前的**取得紀錄**（只有 `kind: "sell"` 會有）。
   *
   * ⚠️ 沒有它，undo 一次賣出會把「當初實付 9,600」還原成「不知道付了多少」，
   * 於是同一把寶具**再賣一次只退 0** —— 玩家白白蒸發 3,840 金，而畫面上
   * 什麼都不會報錯。undo 的契約是「精確反轉」，取得價也在那個契約裡。
   */
  acq?: ItemAcquisition | null;
  /** the inventory slot the item occupied (buy) or vacated (sell) */
  slot: number;
  /** exact gold change applied by the action; undo does `gold -= goldDelta` */
  goldDelta: number;
  /**
   * For a BUY only: the consecutive stat-streak that the purchase reset to 0
   * (a real weapon 歸零s the 能力屬性強化 streak). Undo restores it so the
   * reversal is total. Always 0 for a sell.
   */
  statStacksBefore: number;
}

export interface StatusEffect {
  statusId: StatusId;
  sourceId: string;
  expiresAtTick: number;
  /** movement-speed multiplier while active (1 = none) */
  moveSpeedMult?: number;
  /** hard CC flags */
  root?: boolean;
  stun?: boolean;
  /**
   * 失手率 (WC3 `Acrs` 詛咒 / Curse) — 0..1 chance that a BASIC ATTACK made BY
   * the carrier of this status simply misses.
   *
   * ⚠️ THE DIRECTION IS THE WHOLE POINT, AND IT IS THE OPPOSITE OF
   * `Stat.Evasion`. Evasion is the DEFENDER's dodge ("attacks aimed at me
   * miss"); this is the ATTACKER's fumble ("attacks I make miss, at anybody").
   * Modelling 詛咒 as evasion-on-the-attacker would have been silently wrong:
   * it would make the cursed unit HARDER TO KILL instead of worse at killing.
   *
   * It lives on the STATUS and not on `Stat` on purpose. A curse is a timed,
   * dispellable marker exactly like 減速/纏繞 — those are statuses too — and the
   * stat table is the place for things the panel shows permanently. Keeping it
   * here also means `statusExpirySystem` already owns its teardown, so there is
   * no way to leak a permanent 33 % whiff onto a champion.
   *
   * Read by `combat/evasion.ts::missChanceOf` (MAX over active statuses, never
   * a sum — WC3 miss sources do not stack).
   */
  missChance?: number;
  /**
   * 暴走 (59-00 初號機) —— 「不可控制並自動尋敵」。
   *
   * ⚠️ **不是**第三個硬控旗標。`root` / `stun` 拿走的是身體(走不動、打不了),
   * 這一個拿走的是**方向盤**:身體照走、照追、照打,只是聽的不再是玩家。所以它
   * 不能寫成 `root: true`(那樣暴走的初號機會站在原地被打死,而 owner 要的是
   * 「多一個不受控的攻擊單位」),也不能寫成一條屬性(屬性是常駐的、面板上的,
   * 這個是十秒的、有到期的)。
   *
   * 住在 status 上還有一個現成的好處:`statusExpirySystem` 已經擁有它的清除,
   * 所以「永久失去方向盤」在結構上不可能發生 —— 這正是 `missChance` 選同一個
   * 位置的理由。唯一的讀者是 `sim/berserk.ts`。
   */
  berserk?: boolean;
  /**
   * 恐懼 —— `berserk` 的**鏡像**（`sim/fear.ts`）。
   *
   * ⚠️ 與 `berserk` 一樣**不是**第三個硬控旗標:`root` / `stun` 拿走身體,
   * 這一個拿走方向盤。差別只在方向 —— 暴走自己找最近的敵人打,恐懼自己遠離
   * 最近的敵人而且不打。
   *
   * ⚠️ 與 `berserk` **不一樣**的那一格:它**算 CC**,`refusesControl` 擋得掉。
   * 暴走是自己給自己的增益,恐懼是敵人塞給你的 —— 理由寫在 `sim/fear.ts` 決策 3。
   *
   * 讀者有兩處:`sim/fear.ts`(行為)與 A4b 的條件謂詞(52-04 巨神一擊「若敵人
   * 具有[恐懼]狀態」)。兩邊讀同一個旗標,所以文案說的恐懼與判斷的恐懼是同一件事。
   */
  feared?: boolean;
  /**
   * 這個標記**帶的一個數字** —— 目前唯一的作者是 `spendMana.bankAs`,唯一的
   * 讀者是 `damage.bankedBonus`(effectCommon.ts::bankedAddend)。
   *
   * 存在的理由是一個時間差:owner 2026-07-31 要 13-002 絕。暗殺奧義的追加傷害
   * 等於「**現存 MP 的 20%**」,而那一招做的第一件事就是把法力燒到 0。等到
   * 送傷害的那一發免費牙突真的打中人(hook `onAbilityHit`,可能是幾秒之後),
   * `hp.mana` 已經是 0,任何在那一刻讀法力的公式都只會算出 0 —— 也就是
   * 失敗形態②:算得出來、但玩家永遠拿不到。
   *
   * ⚠️ 它是一個**數字**不是一個 Scaling,因為它記錄的是「當時真的發生了什麼」
   * (實際扣掉的法力),不是一條可以事後重算的公式。事後重算就是上面那個 bug。
   *
   * ⚠️ 住在 status 上而不是一個新元件,理由跟 `missChance` / `berserk` 一樣:
   * `statusExpirySystem` 已經擁有它的清除,所以「一筆永遠不過期的存款」在結構上
   * 不可能發生 —— 燒了魔卻沒放技能,五秒後那筆錢就消失。
   *
   * PURITY: 一個 float,寫入時已經是決定性的(clamp 過的實扣量)。
   */
  magnitude?: number;
  /**
   * ⭐ 這一筆標記**疊了幾層**（owner 2026-08-09 / GH#301-5：「狀態除了有無也會是
   * 數字層數」）。
   *
   * ── 缺席 = 1，⛔ 不是 0 ──────────────────────────────────────────────────
   * 一份沒寫這一格的舊文件的意思是「他身上有這個狀態」，而那是一層。0 層等於
   * 沒有，把缺席讀成 0 會讓出貨的 28 份狀態全部在條件端變成「不存在」。
   * 所以讀取端一律 `s.stacks ?? 1`，而**寫入端只有作者明寫時才寫這一格** ——
   * 見 `effects/applyStatus.ts` 裡「為什麼沒填就不累加」那一段。
   *
   * ── 它跟 `ModifierSource.stacks` 是**兩件事**，不是同一個機制的兩份拷貝 ──
   * | | 住在哪 | 誰讀 | 做什麼 |
   * |---|---|---|---|
   * | `ModifierSource.stacks`（`applyBuff.stackKey`，#244） | `StatsComp.sources` | `statPipeline` | 把 modifier 的**數字乘 N** |
   * | 這一格 | `StatusComp.effects` | 條件葉／技能閘 | 回答**「幾層」**，沒有任何東西被乘 |
   *
   * 合成成一套的代價是致命的：屬性那一套住在 `StatsComp` 上，而**小兵沒有
   * StatsComp**（`stats/statPipeline.ts::recomputeStats` 第一句就 return）。
   * 把層數搬過去 = 第 3 場之後場上大多數敵人身上疊不了層 —— 那正是 GH#301-6
   * 要修的那個洞的形狀。兩個都叫「層」，但一個是乘法的因子，一個是計數器。
   *
   * ── 到期 ────────────────────────────────────────────────────────────────
   * 層數跟著**這一筆**一起到期（`StatusSystem` 清掉整筆），沒有「一秒掉一層」的
   * 半衰期。要那個的話它是另一個機制（每層自己的絕對 tick），不是這一格。
   *
   * ⚠️ **客戶端今天看不到層數。** `ENTITY_FLAG_FREE_BITS` 已經是空的（GH#285）
   * 而 `defineTypes` 是 APPEND-ONLY，所以怎麼送是一個要裁決的決定，不是一個
   * 實作細節。在裁決之前，任何「HUD 顯示第幾層」的文案都是謊話（失敗形態 ②）。
   */
  stacks?: number;
  /**
   * A4(#278) —— 這一筆**可不可以被淨化拔掉**。
   *
   * 缺席 = 讀 `world.dispelRules.statusDefaultDispellable`（出貨 true）。
   * 三值語意（true / false / 缺席）是刻意的:「作者明講不可驅散」與
   * 「作者沒有想過這件事」在後台是兩種不同的狀態,而後者的答案應該是一個
   * **操作者調得到的全域預設**,不是寫死在這裡。
   *
   * ⚠️ 回合重置與復活**不看這一格**(`clearForFreshBody` 傳
   * `requireDispellable: false`)—— 那不是淨化,是重置。
   */
  dispellable?: boolean;
  /**
   * A4(#278) —— 增益還是減益。`clearPools` 的 `polarity` 過濾讀它。
   *
   * ⚠️ **施加的那一刻從 status 文件推導寫下**(`status-effect@1` 的
   * `polarity`,14 份文件 14 份都填了),不是事後從欄位猜。一個
   * `moveSpeedMult: 1.3` 的加速與 `0.7` 的減速在結構上長得一模一樣,
   * 任何啟發式都會在某一張卡上錯。
   */
  polarity?: "buff" | "debuff";
  /**
   * C4 睡眠（#278）—— **受傷即提早解除這一筆**。
   *
   * ⛔ 只拔標了這一格的那幾筆：被打醒的同一發傷害不可以順手解掉身上的減速，
   * 那是淨化不是打醒。實作在 `sim/statusBreak.ts`，呼叫點在 `combat/damage.ts`
   * 的傷害落地處（`world.emit("damage")` 的旁邊）。
   */
  /**
   * 【沉默】（C1，#278）—— 不能施放技能，但**可以走、可以普攻**。
   * ⛔ 與 `stun` 分開的理由：暈眩是硬控（記 ccAppliedTicks、被免控攔），
   * 沉默不是 —— 一個被沉默的人仍然在跑在打，只是按 QWER 沒反應。
   * 閘在 `abilities/abilitySystem.ts`，就在 stun 那一道旁邊。
   */
  silenced?: boolean;
  /**
   * ⭐【繳械】S8（effect.control-restriction@1，92-01「無法移動與攻擊」）——
   * **打不出普通攻擊**。
   *
   * ⛔ 它**不是** `missChance` 的包裝，而這正是它存在的全部理由：實測
   * `{root:true, missChance:1}` 的身體在 90 tick 內照樣發了 6 次 `attackWindup`
   * 與 4 次 `basicAttack`（動畫、音效、破隱、攻擊冷卻全部照跑），只是傷害是 0。
   * 「揮空刀」與「揮不出來」在畫面與聽覺上是兩件事。
   *   · 要做「打得到人但會失手」→ `missChance`。
   *   · 要做「連前搖都開不了」→ 這一格。
   *
   * ⚠️ 它**算硬控**（`HARD_CC_FLAGS` + `applyStatus` 的 `isCc`）：繳械是敵人塞
   * 過來的純減益，與 `feared` 同一列 —— 免控擋得掉、記 `ccAppliedTicks`。
   * ⛔ 它**不擋技能**：92-01 要連技能一起封請配 `silenced`（與 `feared` 的說明
   * 逐字同一條規則）。
   *
   * 住在 status 上而不是新元件，理由與 `missChance` / `berserk` / `feared`
   * 逐字相同：`statusExpirySystem` 已經擁有它的清除，所以「永久打不出普攻」在
   * 結構上不可能發生。
   */
  disarmed?: boolean;
  /**
   * 【混亂】（C2，#278 → ⭐ owner 2026-08-09 改判，GH#299 第 9 條 / GH#301-3）。
   *
   * ⚠️ **這一格的語意換過一次，欄位名沒換。** 2026-08-05 它真的是「不分敵我」
   * （`isAutoTargetable` 的敵我閘旁路），而 owner 明說那是錯的裁決：
   * 「混亂應該是**完全無法指定目標**，並且會**亂走路**，跟恐懼一樣」。
   * 現在它是混亂的**標記旗標**，行為在 `sim/chaos.ts`（丟指令 + 選不到任何
   * 目標 + `world.rng` 抽方向亂走），與 `feared` / `berserk` 同一個形狀。
   *
   * ⛔ 名字沒改是刻意的：它是 `sim/content/condition.ts` 推導【混亂】標籤的
   * join key，也是 223 份既有文件寫的那一格 —— 改名要連 schema、條件葉、
   * fieldAdoption 一起動，而那是一次沒有任何行為收益的大位移。
   *
   * ⚠️ `berserk` 現在是**多餘的**（`{ targetsAllies: true }` 自己就是完整的
   * 混亂）。兩個一起寫時混亂贏，理由見 `chaos.ts` 的決策 3。
   */
  targetsAllies?: boolean;
  breakOnDamage?: boolean;
  /**
   * 打醒門檻：這一發**實際扣掉**的傷害要 ≥ 它才算數。省略 = 0 = 任何傷害都醒
   *（WC3 沉睡的語意）。
   *
   * ⚠️ 它存在的理由是第 3 回合之後場上到處是 DoT：一個「被燃燒每 tick 3 點
   * 打醒」的睡眠等於沒有睡眠，而那是一個**設計決定**不是一個常數。
   */
  breakOnDamageMin?: number;
  /**
   * 【重創】三格獨立倍率（A6，#278）。owner 裁決⑥：**預設全部 0.5**。
   * ⚠️ 禁療不是第二個機制 —— 它是三格都填 0 的一份內容文件。
   * 三個讀取點與「吸血不可以打折兩次」的理由見 `sim/grievousWounds.ts` 檔頭。
   */
  healingTakenMult?: number;
  /** 【重創】吸血**係數**那一步的倍率。⛔ 不在 `healTarget` 那一步套用。 */
  lifestealMult?: number;
  /** 【重創】自然回復（`RegenSystem`）的倍率。⚠️ 它不經過 `healTarget`。 */
  regenMult?: number;
}

export interface StatusComp {
  effects: StatusEffect[];
}

/**
 * Healing-flower marker (LoL-Arena plants). A flower is a NEUTRAL entity:
 * transform + health + this marker only — no seat, no TeamComp, no nav, no
 * stats. It therefore never appears in team/champion iterations (victory,
 * lives, AI perception) by construction. Killed flowers burst HP/MP to the
 * killer's team (FlowerSystem) and are destroyed the same tick.
 */
export interface FlowerComp {
  /** arena zone the flower lives in (duel zone) */
  zone: number;
}

/**
 * Revive-circle marker (task #84 復活小火圈). Dropped where a champion dies;
 * a LIVING TEAMMATE standing inside channels it to bring the owner back once
 * per team per round.
 *
 * Deliberately NOT shaped like a flower: a circle is GROUND AREA, not a unit.
 * It carries transform + this marker and nothing else — **no health component
 * and no TeamComp seat** — so it can never be attacked, never be picked up by
 * an ability query, and can never be counted by `teamAliveCount` / duel
 * resolution. Team ownership rides in `teamId` here instead of a TeamComp
 * precisely so the champion/team iterations stay blind to it.
 *
 * All timing is in ABSOLUTE `world.tick` (not `world.combatTicks`, which only
 * advances while the flower rules are armed — see systems/ReviveSystem.ts).
 */
/**
 * Dropped-gold-coin marker (task #191 陣亡投幣). Thrown by a DEAD player onto
 * the arena floor; the first LIVING champion to walk within `pickupRadius`
 * banks `value` — friend or foe, per the owner's unqualified 「經過的玩家」.
 *
 * Shaped like a revive circle rather than a flower, and for sharper reasons: a
 * coin carries transform + this marker and NOTHING ELSE.
 *   • no {@link TeamComp} — a seat here would put the coin into
 *     `teamAliveInZone` / duel resolution / the alive-champion checks, i.e. a
 *     thrown coin could keep a wiped team "alive". Ownership rides in
 *     `ownerSeatId` instead, purely so the wire can tint/attribute it.
 *   • no {@link Health} — health is what makes an entity attackable AND what
 *     puts hp/mana into `SimWorld.digest()`; a coin is loot, not a target.
 * It is also kept out of the broad-phase grid, `queryOverlap` and both
 * MovementSystem passes, so nothing can target, shove or be shoved by it.
 */
export interface CoinComp {
  /** gold banked by whoever picks it up (== what the thrower paid) */
  value: number;
  /** duel zone; a coin only ever pays a champion fighting in its own zone */
  zone: number;
  /** the DEAD thrower's seat — presentation only (never a team check) */
  ownerSeatId: SeatId;
}

/**
 * Roguelite mob marker + per-round AI state (task #215 聖杯黑泥醬-喪標麥可). One
 * per live mob, stored in `world.mob`. A mob is built from the guardian/flower
 * NEUTRAL-entity blueprint but with TWO genuinely new capabilities layered on:
 *
 *   1. it MOVES — it carries a {@link Navigation} (guardians/flowers do not), so
 *      OrderSystem + MovementSystem walk it toward its target at the fallback
 *      BASE_MOVE_SPEED (it has NO StatsComp, so it inherits that speed);
 *   2. it is MUTUALLY HOSTILE — it carries a {@link TeamComp} on the sentinel
 *      MONSTER team ({@link MONSTER_TEAM}), a team no champion is ever on, so
 *      `differentTeam` makes it an enemy to EVERY champion without a ChampionComp.
 *
 * A spawned mob therefore carries: Transform + Health + this marker + Navigation
 * + TeamComp(MONSTER). Deliberately NO ChampionComp / seat / StatsComp /
 * AbilitiesComp / matchStats entry, so the scoreboard, duel resolution, team
 * lives and placement all stay blind to it BY CONSTRUCTION (the guardian/flower
 * neutrality contract). All fields here are authoritative + deterministic.
 *
 * `modelKey` is NOT stored — it is presentation-only (resolved client-side from
 * ENTITY_KIND.MOB like the guardian/flower), so it stays out of the digest.
 */
/**
 * 一般殭屍 / 特殊殭屍 / 殭屍王 (task #262).
 *
 * DECLARED HERE, not in sim/mobs.ts, purely so `MobComp` stays importable
 * without dragging the mobs module (and through it SimWorld + collision) into
 * anything that only wants the component shapes. `sim/mobs.ts` re-exports it.
 */
export type MobKind = "normal" | "special" | "boss";

export interface MobComp {
  /** duel zone the mob fights in (a mob only ever chases/attacks in its zone) */
  zone: number;
  /** the sentinel MONSTER team id it is on (always {@link MONSTER_TEAM}) */
  team: TeamId;
  /**
   * 一般殭屍 / 特殊殭屍 / 殭屍王 (task #262). Written ONCE at spawn and never
   * mutated. Everything that differs between them — hp, melee damage, walk
   * speed, body radius, the model on the wire, and what dying pays — is derived
   * from this one field through `mobProfile` (sim/mobs.ts), so a king cannot end
   * up hitting for a zombie's damage because one call site read `rules.x` raw.
   *
   * Authoritative sim state, but NOT digested directly: the observable effects
   * (spawn hp, positions, gold) are all already in the digest at their source,
   * exactly like `MobComp.zone` and `spawnTick`.
   */
  kind: MobKind;
  /** current AI target (nearest enemy champion), resolved each tick; -1 = none */
  target: EntityId | -1;
  /** integer melee-cooldown countdown (0 = ready to swing) */
  attackCdTicks: number;
  /** `mobTicks` value at spawn — presentation/debug only, NOT in the digest */
  spawnTick: number;
}

export interface ReviveCircleComp {
  /** the corpse this circle belongs to (revive target) */
  ownerId: EntityId;
  /** owner's seat — projected on the wire so the HUD can name the dead player */
  ownerSeatId: SeatId;
  /** team allowed to channel it (and whose charge it will spend) */
  teamId: TeamId;
  /** duel zone; a circle only ever affects its own zone */
  zone: number;
  /**
   * world.tick the circle was dropped on. Bookkeeping only — there is NO
   * expiry deadline beside it any more (task #196): the ring burns until the
   * round ends, matching LoL Arena, which documents no timeout on the downed
   * zone either. `endCombatRevives` is what despawns it.
   */
  spawnedAtTick: number;
  /** accumulated channel progress in ticks (0 .. rules.channelTicks) */
  progressTicks: number;
  /** entity credited with driving progress this tick (null = nobody) */
  channellerId: EntityId | null;
  /** an enemy stood inside this tick (progress held, not reset) */
  contested: boolean;
}
