/**
 * statPreview — "what would my stats be if I owned this", answered by the REAL
 * shared pipeline and nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CANNOT BE A UI RE-DERIVATION
 * ---------------------------------------------------------------------------
 * The sim's stat model is LAYERED and clamped and then scaled by task #28's
 * global combat-env table (an operator can change it live):
 *
 *     final = clamp_ENV( (base + Σflat) · (1 + ΣpctAdd) · Π pctMult ,  env )
 *
 * so a percentage item's real `+N` depends on the champion's CURRENT base+flat
 * (it changes as they buy other items), two flat items do not simply add when a
 * clamp bites, and the same item previews differently under different env
 * settings. Echoing the raw modifier value is wrong for every one of those
 * cases — and those are exactly the cases where a player is making a real
 * decision. So the preview is computed by SPAWNING a scratch champion in a
 * throwaway `SimWorld`, attaching the reconstructed inventory (plus the
 * hypothetical item), and running the SAME `recomputeStats` the server runs.
 * statPreview.test.ts pins this against the real sim so the two can never drift.
 *
 * ---------------------------------------------------------------------------
 * RECONSTRUCTION, AND THE ONE THING IT CANNOT SEE
 * ---------------------------------------------------------------------------
 * The client never receives the champion's `sc.sources` — only a `SeatView`.
 * Every source is rebuilt from it against the content registries:
 *   champion passive       ← Champions.get(championId).passive
 *   ability passives Q/W/E/R/EX ← SeatView.abilityRanks + exAbilityId/exRank
 *   items                  ← SeatView.items
 *   augments               ← SeatView.augments
 *   capstone (傳說·萬象強化) ← capstoneModifiers(SeatView.statCapstonePct)
 *   三圍 bought (能力屬性強化)  ← SeatView.attrBonus, written onto the scratch
 *                              champion's own `attrBonus` (#260)
 *
 * The bought attributes are NOT a modifier source: `championStatBase` folds them
 * into the champion's BASE exactly as it folds in an innate 三圍 point, so the
 * reconstruction sets the same field the server sets rather than inventing an
 * equivalent stat modifier that would go stale the moment an operator retunes a
 * coefficient (see sim/stats/attributes.ts).
 *
 * `previewExactness` still compares the reconstructed maxHealth / maxMana with
 * the authoritative values the wire carries anyway (EntityState hp) and reports
 * whether the panel can be trusted to the last point — a genuine end-to-end
 * guard that catches ANY future source going missing from this reconstruction,
 * whether or not someone remembered to add a flag for it.
 */
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { syncAbilityPassives } from "@ggd/shared/sim/abilities/abilityPassives";
import { attachSource, recomputeStats } from "@ggd/shared/sim/stats/statPipeline";
import { Champions, Items, Augments } from "@ggd/shared/sim/content/registry";
import { capstoneModifiers } from "@ggd/shared/sim/economy/itemTiers";
import { attachItemSource } from "@ggd/shared/sim/economy/itemSource";
import { attrBonusFromArray } from "@ggd/shared/sim/economy/statPath";
import { ALL_STATS, Stat, type StatBlock } from "@ggd/shared/sim/stats/statTypes";
import {
  DEFAULT_COMBAT_ENV,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import { DEFAULT_BASE_BONUS, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { DEFAULT_STAT_CAPS, type StatCapTable } from "@ggd/shared/sim/statCaps";
import {
  asSeatId,
  asTeamId,
  type AugmentId,
  type ChampionId,
  type EntityId,
  type ItemId,
} from "@ggd/shared/ids";

/** Everything the pipeline needs about the local champion, from a SeatView. */
export interface ChampionStatContext {
  championId: string;
  level: number;
  /** Q W E R ranks (SeatView.abilityRanks). Missing entries read as 0. */
  abilityRanks: readonly number[];
  exAbilityId?: string;
  exRank?: number;
  /** 6 inventory slots ("" = empty), SeatView.items. */
  items: readonly string[];
  augments: readonly string[];
  statCapstonePct: number;
  /**
   * SeatView.attrBonus — the three 三圍 totals bought this match (#260), in
   * `ATTR_KEYS` order. Written below onto the scratch champion's OWN
   * `attrBonus`, i.e. the exact field the server writes, so the shared
   * `championStatBase` folds it in identically on both sides. Without it the
   * panel silently under-reports every champion who has ever bought a tick.
   */
  attrBonus?: readonly number[];
  /** live combat-env table; defaults to neutral if absent. */
  env?: CombatEnvMultipliers;
  /**
   * live 基礎加成 table (`MatchState.baseBonusJson` → useDisplayBaseBonus).
   * Absent = the SHIPPED default, not an empty table.
   *
   * ⚠️ 只有 maxHealth/maxMana 兩列在面板上是伺服器權威值(`authMaxHp`/
   * `authMaxMana`),其餘每一列都是這個 scratch world 算出來的。少了這個欄位,
   * 操作者在後台給「攻擊力 +50」之後,商店會少報 50 而血量那一列照樣正確 ——
   * 一個只在部分欄位發生、因此更難發現的謊。
   */
  baseBonus?: BaseBonusTable;
  /**
   * live 屬性上限表 (`MatchState.statCapsJson` → useDisplayStatCaps, GH#286).
   * 缺 = **出貨預設**,不是空表。
   *
   * ⚠️ 這是預覽會說謊的第三種方式,而且最安靜:一件 +150% 攻速的裝備在解鎖了
   * 上限的英雄身上真的會超過 4.0,少了這張表的 scratch world 會把它夾在 4.0,
   * 於是商店顯示的增益比玩家真正買到的少 —— 一個「看起來完全合理」的數字。
   */
  statCaps?: StatCapTable;
  /**
   * 現場的**資源比例** 0..1 —— 這個 scratch world 的英雄要 spawn 在幾成血/魔。
   * 省略 = `1` = 滿血滿魔,也就是這個欄位出現之前 `spawnChampion` 一直做的事,
   * 所以每一個既有呼叫端的數字逐位元不變。
   *
   * ⚠️ 為什麼它存在,而且為什麼它是**第四種**「預覽會說謊」的方式。
   * 光魔杖 (godie-i027) 的 「AP+ (目前MP的 5%)」 是全遊戲第一條**會隨資源浮動**
   * 的 modifier(`ModOp.PercentOf` + `fromResource`,見
   * `sim/stats/resourceStats.ts`)。一個滿魔的 scratch 英雄會把它算成**上限值**,
   * 於是半魔的玩家在面板上看到的 AP 是他實際拿到的兩倍 —— 而其他每一列都正確,
   * 這正是 #106 「a live stat preview that must not lie」 要擋的那種、只在部分
   * 欄位發生因此更難發現的謊。
   *
   * ⚠️ 餵不餵是**呼叫端的決定**,而它有代價:魔量幾乎每 tick 都在動,把原始值
   * 接進 React 的 memo key 會讓整張面板每一幀重算(`computeStatBlock` spawn 一
   * 個完整的 SimWorld)。要接的呼叫端應該先**量化**(例如取到小數一位),讓重算
   * 次數被「魔條動了 10%」而不是「時間過了一幀」決定。
   */
  hpPct?: number;
  manaPct?: number;
}

const ZERO_ITEMS: readonly string[] = ["", "", "", "", "", ""];

/**
 * 0..1 夾取。缺值 / 非有限數 → `1`(滿資源),也就是這個欄位出現之前的行為 ——
 * **不是** 0:一個把 NaN 讀成 0 的預覽會把整條 AP 報成沒有,那是比不夠精準更糟的
 * 一種謊。真的傳 0 進來(空魔)照樣是 0。
 */
function clampPct(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 1;
  if (v <= 0) return 0;
  return v > 1 ? 1 : v;
}

/**
 * Spawn a scratch champion and attach the reconstructed inventory. Uses the
 * REAL sim entry points (spawnChampion / syncAbilityPassives / attachSource /
 * recomputeStats) so there is no second implementation to keep in sync.
 * Returns null when the champion is not in the registry (champ-select, an
 * un-whitelisted hero) — the caller renders no panel rather than a wrong one.
 */
function buildWorld(ctx: ChampionStatContext): { world: SimWorld; id: EntityId } | null {
  if (!Champions.tryGet(ctx.championId as ChampionId)) return null;

  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatEnv = ctx.env ?? DEFAULT_COMBAT_ENV;
  world.baseBonus = ctx.baseBonus ?? DEFAULT_BASE_BONUS;
  world.statCaps = ctx.statCaps ?? DEFAULT_STAT_CAPS;
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: ctx.championId as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
    level: Math.max(1, Math.floor(ctx.level) || 1),
  });

  // ability ranks → ability-passive sources (spawn left Q at rank 1)
  const ab = world.abilities.get(id);
  if (ab) {
    ab.slots.Q.rank = ctx.abilityRanks[0] ?? ab.slots.Q.rank;
    ab.slots.W.rank = ctx.abilityRanks[1] ?? 0;
    ab.slots.E.rank = ctx.abilityRanks[2] ?? 0;
    ab.slots.R.rank = ctx.abilityRanks[3] ?? 0;
    if (ab.exSlot && (ctx.exRank ?? 0) > 0) ab.exSlot.rank = ctx.exRank!;
    syncAbilityPassives(world, id);
  }

  // items (owned) into their reported slots, attached exactly as buyItem does
  const champ = world.champion.get(id);
  if (champ) {
    // 能力屬性強化 三選一 picks (#260) — written onto the champion's OWN
    // attrBonus, the same field `applyAttrPick` writes on the server, so
    // `recomputeStats` → `championStatBase` folds them in through one shared
    // definition. This is the whole reason a bought 力/敏/智 moves the panel.
    const bonus = attrBonusFromArray(ctx.attrBonus);
    champ.attrBonus.str = bonus.str;
    champ.attrBonus.agi = bonus.agi;
    champ.attrBonus.int = bonus.int;
    const items = ctx.items.length > 0 ? ctx.items : ZERO_ITEMS;
    items.forEach((itemId, slot) => {
      if (!itemId || slot >= champ.items.length) return;
      const def = Items.tryGet(itemId as ItemId);
      if (!def) return;
      champ.items[slot] = itemId as ItemId;
      // THROUGH THE SHARED BUILDER, not a hand-written literal (#106 「a live
      // stat preview that must not lie」). `attachItemSource` is the same call
      // the three `economy/shop.ts` sites make, so the 職業限定閘 on a gated
      // modifier — 貫雷槍's 「近戰攻擊距離+4；遠戰攻擊距離+2」 — resolves against
      // THIS champion here exactly as it does on the server. A literal would
      // have handed a ranged hero the melee row and shown a +4 he never gets.
      attachItemSource(world, id, itemId as ItemId, slot, def);
    });
  }

  // augments (as draft.ts attaches them)
  for (const augId of ctx.augments) {
    const def = Augments.tryGet(augId as AugmentId);
    if (!def) continue;
    attachSource(world, id, {
      id: `aug:${augId}`,
      kind: "augment",
      modifiers: def.modifiers,
      hooks: def.hooks,
    });
  }

  // capstone (statPath.ts grantCapstone) — rebuilt from its rolled magnitude
  if (ctx.statCapstonePct > 0) {
    attachSource(world, id, {
      id: "stat:capstone",
      kind: "augment",
      modifiers: capstoneModifiers(ctx.statCapstonePct),
    });
  }

  recomputeStats(world, id);

  // 資源比例 —— 套在 `recomputeStats` **之後**,而且必須再算一次。
  //
  // 順序是載重的,兩邊都是:`spawnChampion` 把 hp/mana 設到 spawn 值,而
  // `recomputeStats` 自己會在 maxHealth/maxMana 變動時**按比例重寫** hp/mana
  // (「Preserve hp/mana RATIO when maxima change」)。所以在第一次重算之前寫
  // 比例會被那段邏輯洗掉;寫在之後、再重算一次,第二趟的 maxima 已經穩定,
  // 比例就留得住,而 `fromResource` 的第二趟才讀得到正確的當下魔量。
  const hpc = world.health.get(id);
  if (hpc && (ctx.hpPct !== undefined || ctx.manaPct !== undefined)) {
    hpc.hp = hpc.maxHp * clampPct(ctx.hpPct);
    hpc.mana = hpc.maxMana * clampPct(ctx.manaPct);
    recomputeStats(world, id);
  }
  return { world, id };
}

/** Snapshot a StatBlock (the pipeline's cache is a live object). */
function copyBlock(b: StatBlock): StatBlock {
  const out = {} as StatBlock;
  for (const s of ALL_STATS) out[s] = b[s];
  return out;
}

/**
 * The champion's CURRENT stat block, resolved through the pipeline. null when
 * the champion is not reconstructable (see buildWorld).
 */
export function computeStatBlock(ctx: ChampionStatContext): StatBlock | null {
  const built = buildWorld(ctx);
  if (!built) return null;
  return copyBlock(built.world.stats.get(built.id)!.final);
}

/**
 * The champion STRIPPED of everything it acquired — same champion, same level,
 * no items, no augments, no capstone, no stat ticks. Subtracting this from
 * {@link computeStatBlock} is what the shop's `(+xxx)` means: 「這場我變強了多少」.
 *
 * LEVEL IS KEPT deliberately. Level growth is not something you shop for, and
 * folding it into the bonus would make a champion who has bought nothing at all
 * show a fat green `(+…)` on every row — a number that answers no question the
 * player is asking. The panel prints the level separately, right in the header.
 */
export function computeBaseStatBlock(ctx: ChampionStatContext): StatBlock | null {
  return computeStatBlock({
    championId: ctx.championId,
    level: ctx.level,
    abilityRanks: ctx.abilityRanks,
    exAbilityId: ctx.exAbilityId,
    exRank: ctx.exRank,
    items: ZERO_ITEMS,
    augments: [],
    statCapstonePct: 0,
    attrBonus: undefined,
    env: ctx.env,
    // 天花板要跟著走,否則「空 build」和「現在的 build」用不同的上限夾,兩者相減
    // 出來的 (+xxx) 會是一個沒有任何實作對應的數字。
    statCaps: ctx.statCaps,
    // 資源比例同理,而且理由更直接:被減數在半魔、減數在滿魔,兩者相減出來的
    // 「這場我變強了多少」會把一條**根本沒有買到**的 AP 差額算進去。
    hpPct: ctx.hpPct,
    manaPct: ctx.manaPct,
  });
}

export interface ItemPreview {
  /** false when the sim would refuse the buy for a reason the panel can see. */
  buyable: boolean;
  reason?: "slot-full" | "unknown-item";
  before: StatBlock;
  after: StatBlock;
  /** after − before, only the stats that actually moved. */
  deltas: Partial<Record<Stat, number>>;
}

/**
 * Preview owning `itemId` ON TOP of the champion's current inventory: attach it
 * into the next free slot and re-run the pipeline. The delta is the exact change
 * the server will produce (same code, same env, same clamps). `slot-full`
 * mirrors the sim's `no-slot`, so the panel and the server agree on refusal.
 */
export function previewItem(ctx: ChampionStatContext, itemId: string): ItemPreview | null {
  const built = buildWorld(ctx);
  if (!built) return null;
  const { world, id } = built;
  const before = copyBlock(world.stats.get(id)!.final);

  const def = Items.tryGet(itemId as ItemId);
  if (!def) return { buyable: false, reason: "unknown-item", before, after: before, deltas: {} };

  const champ = world.champion.get(id)!;
  const slot = champ.items.findIndex((s) => s === null);
  if (slot < 0) return { buyable: false, reason: "slot-full", before, after: before, deltas: {} };

  champ.items[slot] = itemId as ItemId;
  attachItemSource(world, id, itemId as ItemId, slot, def); // see buildWorld
  recomputeStats(world, id);
  const after = copyBlock(world.stats.get(id)!.final);

  const deltas: Partial<Record<Stat, number>> = {};
  for (const s of ALL_STATS) {
    const d = after[s] - before[s];
    if (d !== 0) deltas[s] = d;
  }
  return { buyable: true, before, after, deltas };
}

export interface Exactness {
  /** true when the reconstruction accounts for every source the server has. */
  exact: boolean;
  /** why not, for the panel's disclosure line. */
  reason?: "hidden-stat-ticks";
}

/**
 * Can the panel be trusted to the last point?
 *
 * `statStacks > 0` USED to be an automatic no: the rolls were not on the wire,
 * so any champion mid-streak was reconstructed short by every tick it had
 * bought, and the panel had to hedge. `SeatState.attrBonus` now carries
 * them, `buildWorld` reattaches them, and a streak on its own proves nothing
 * about accuracy — so that tell is gone, and with it the permanent 「≈」 every
 * stat-path player used to read.
 *
 * The RECONCILIATION tell stays, and is now the whole check: compare the
 * reconstructed maxHealth / maxMana against the authoritative values the wire
 * carries anyway (EntityState hp/mana). It is a genuine end-to-end guard —
 * if any future source goes missing from the reconstruction the panel will say
 * so, whether or not anyone remembered to add a flag for it.
 */
export function previewExactness(
  reconBlock: StatBlock,
  opts: {
    /**
     * Kept in the signature though no longer decisive: callers pass it, and a
     * silent parameter removal would read as "the streak is irrelevant" rather
     * than "the streak is now RECONSTRUCTED". See the doc comment above.
     */
    statStacks?: number;
    authMaxHp?: number;
    authMaxMana?: number;
  },
): Exactness {
  const agrees = (recon: number, auth?: number): boolean => {
    if (auth === undefined || auth <= 0) return true; // nothing to check against
    return Math.abs(recon - auth) <= Math.max(1.5, auth * 0.01);
  };
  if (!agrees(reconBlock[Stat.MaxHealth], opts.authMaxHp)) {
    return { exact: false, reason: "hidden-stat-ticks" };
  }
  if (!agrees(reconBlock[Stat.MaxMana], opts.authMaxMana)) {
    return { exact: false, reason: "hidden-stat-ticks" };
  }
  return { exact: true };
}

/** Build a stat context straight off the SeatView-shaped fields the HUD holds. */
export function statContextFromSeat(
  seat: {
    championId: string;
    level: number;
    abilityRanks: readonly number[];
    exAbilityId: string;
    exRank: number;
    items: readonly string[];
    augments: readonly string[];
    statCapstonePct: number;
    attrBonus?: readonly number[];
    /**
     * 現場的血/魔比例 0..1,給會隨資源浮動的 modifier 用(光魔杖
     * 「AP+ (目前MP的 5%)」)。座位視圖今天**沒有**帶這兩個數字,所以省略 = 1 =
     * 滿資源 —— 面板顯示的是那條加成的上限值。接的人請先量化,理由見
     * {@link ChampionStatContext.manaPct}。
     */
    hpPct?: number;
    manaPct?: number;
  },
  env?: CombatEnvMultipliers,
  baseBonus?: BaseBonusTable,
  statCaps?: StatCapTable,
): ChampionStatContext {
  return {
    hpPct: seat.hpPct,
    manaPct: seat.manaPct,
    championId: seat.championId,
    level: seat.level,
    abilityRanks: seat.abilityRanks,
    exAbilityId: seat.exAbilityId,
    exRank: seat.exRank,
    items: seat.items,
    augments: seat.augments,
    statCapstonePct: seat.statCapstonePct,
    attrBonus: seat.attrBonus,
    env,
    baseBonus,
    statCaps,
  };
}
