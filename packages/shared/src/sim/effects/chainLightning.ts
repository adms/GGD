/**
 * `chainLightning`（GH#451）——「範圍內的**每一個**單位各觸發一次連鎖閃電」，
 * 而且**逐跳之間有時間差**。
 *
 * owner 2026-08-19：
 * > 「皮卡丘打雷 跟 飛鼠先生天譴 都是運用 JASS 對於**範圍內每個單位施展一次連鎖
 * >  閃電**（周圍敵方單位**逐個傷害遞減**）來達成**越多單位越痛**」
 *
 * ⭐ owner 2026-08-20（**推翻**了第一版的「一格 tick 全結算」）：
 * > 「DECAY 0.9，但這個技能的重點在於**隨機選擇單位遞減時間差的閃電特效與傷害**
 * >  （**每個閃電有極小的時間間隔播放閃電動畫與傷害才到下一個**，剛好可以避免你
 * >  說的計算上限），**有其特殊性與純範圍直接給傷害區別很大**」
 *
 * ⛔ 這支檔案裡**沒有任何一個 if 認得那兩支技能**（第〇·五守則）。它做的是一個
 * 機制：`shape:"circle"` = N 條鏈、`shape:"single"` = 1 條鏈，兩支技能是同一個
 * kind 的兩份參數。原作對照與「為什麼不能用既有零件組」寫在 `effect.ts` 的
 * union 成員上，⛔ 不在這裡重複一份。
 *
 * ── ① 一發閃電 = 一次「到期」，⛔ 不是一個迴圈 ──────────────────────────────
 * 排程的形狀**逐字抄** `delayed.ts` / `randomArea.ts`（第零守則⑨：同型 = 同一個
 * 模板）：一個掛在 `SimWorld` 上的**陣列**佇列 + **絕對 tick** 到期 + 一支排在
 * `combatResolveSystem` **之前**的系統。⛔ 不是遞減計數器（`sim/purity.test.ts`）。
 *
 * 三者的差別只有一句話，而那句話就是各自存在的理由：
 *   · `randomArea` 到期時用**圓心重解**目標；
 *   · `delayed`   到期時用**施放那一刻凍住的名單**；
 *   · `chainLightning` 到期時**從上一個受害者身上重新隨機挑一個**（見③）。
 *
 * ── ② ⭐ 時間差同時是**效能設計**，不是純表演 ────────────────────────────────
 * owner 明說時間差「剛好可以避免你說的計算上限」。成本是 **O(來源數 × 跳數)** 次
 * 空間查詢，而第一版把它們**全部塞在施放那一個 tick**：20 條鏈 × 24 跳 = 480 次
 * 「找下一個」+ 480 筆傷害 = 量到的 **6.83 ms**（100 隻身體），30Hz 一格的 20%。
 *
 * 逐跳之後，一個 tick 的工作量從「480 次」變成「**還活著的鏈各一次**」——
 * 上界是 {@link CHAIN_MAX_LIVE_STRANDS}，而且 `jumpIntervalSec` ≥ 2 tick 時
 * 連那一格都只有一半的 tick 會付款。⚠️ **總工作量沒有變少，變的是分佈** ——
 * 這正是 owner 說的「避免計算上限」：尖峰被攤平，不是被砍掉。
 *
 * ── ③ ⭐ 下一跳是**隨機**挑的（owner 2026-08-20 逐字）───────────────────────
 * 候選 = 「上一個受害者的 `jumpRange` 內 ∧ 這條鏈還沒打過（除非 `revisit`）」，
 * 從裡面**等機率抽一個**，⛔ 不是取最近的那一個。
 * 決定性：候選清單先排成 `(id)` 全序再抽，抽的是 `world.rng`（唯一的亂數來源）；
 * `walked` 是 Set 但**只 `has`/`add`、從不迭代**（同 `DelayedWave.struck`）。
 * ⚠️ 一跳固定花 **1 次 draw**（`canCrit` 另外各一次），所以推進量是輸入的函式。
 *
 * ⛔ 與 `randomArea` 的「施法那一刻抽完全部落點」**刻意不同**：那樣做等於把 480
 * 次空間查詢搬回施放的那一個 tick，也就是把②整條理由丟掉。
 *
 * ── ④ 每一發都要**看得見**（失敗形態②）──────────────────────────────────────
 * 逐跳跨了很多個 tick，所以 `world.emit("chainLightning", …)` 是**一發一次**，
 * ⛔ 不是整段結束才一次 —— 不然玩家看到的是一排血條在不同時間掉、畫面上什麼都
 * 沒有。事件帶的是**這一發真的跳過的那一段**（`segments` 一段），客戶端據此畫弧。
 * ✅ GH#477 已修：`apps/game-server/src/net/eventFanout.ts` 的白名單註解曾經寫著
 * 「CADENCE：一次施放一個事件（⛔ 不是每一跳一個）」——那句話是假的，現在它寫的是
 * 「每一跳一個事件，線路成本 = 跳數」，並帶著量到的預算（出貨兩支各 320 則／次）。
 * ⭐ 事件數**恆等於跳數**，所以 `maxTotalJumps` 同時就是事件預算，
 * ⛔ 不需要第二格「每次施放的事件上限」。
 *
 * ── ⑤ 瞬發（`jumpIntervalSec: 0`）走**同一段**跳躍程式 ──────────────────────
 * 0 是合法值 = 整段在施放的 tick 內跑完。它與逐跳共用 {@link boltOnce}，
 * ⛔ 不是第二份實作 —— 兩份會分岔，而分岔的那一天兩邊看起來都對。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import type { Rng } from "../math/rng";
import type { DamageType, EffectContext, EffectDef, TriggerDamage } from "./effect";
import { resolveScaling } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { Stat } from "../stats/statTypes";
import { enemiesInCircle } from "../abilities/abilitySystem";
import { distSq } from "../math/vec2";
import { casterAttrs, casterDamageStats, casterSlotRank } from "./effectCommon";
import { runOnHitChain } from "./victimFilter";
import { runEffects } from "./effectRunner";
import { rebaseTriggerForDeferred } from "./deferredTrigger";
import { rollAbilityCrit } from "../combat/critStrike";
import { scalingOracle } from "../content/condition";
import {
  CHAIN_MAX_JUMPS,
  CHAIN_MAX_JUMP_INTERVAL_SEC,
  CHAIN_MAX_LIVE_STRANDS,
  CHAIN_MAX_RADIUS,
  CHAIN_MAX_SOURCES,
  CHAIN_MAX_TOTAL_JUMPS,
  CHAIN_MAX_DECAY,
  CHAIN_MIN_DECAY,
  DEFAULT_CHAIN_JUMP_INTERVAL_SEC,
  DEFAULT_CHAIN_MAX_TOTAL_JUMPS,
} from "./kindLimits";

/** 夾一個正整數上界。NaN / 非正 → 0（＝這一段什麼都不做）。 */
function clampCount(v: number | undefined, fallback: number, cap: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  const n = Math.floor(v);
  if (n <= 0) return 0;
  return n > cap ? cap : n;
}

/** 夾一個距離。負/NaN → 0。 */
function clampDist(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v) || v <= 0) return 0;
  return v > CHAIN_MAX_RADIUS ? CHAIN_MAX_RADIUS : v;
}

/**
 * 起始圈的圓心。省略 = `"caster"`，⛔ 不是 `damageArea` 的「受害者優先」——
 * 那兩段 JASS 都是 `GetUnitsInRangeOfLocAll(R, GetUnitLoc(GetTriggerUnit()))`，
 * 也就是**施法者**的位置。做成欄位是因為「以誰為圓心」是一個決策點（第一守則）。
 */
function chainCentre(
  ctx: EffectContext,
  mode: "caster" | "point" | "target",
): { x: number; z: number } | undefined {
  if (mode === "target") {
    const tid = ctx.targets[0];
    const t = tid !== undefined ? ctx.world.transform.get(tid) : undefined;
    if (t) return t.pos;
  }
  if (mode !== "caster" && ctx.point) return ctx.point;
  return ctx.world.transform.get(ctx.caster)?.pos ?? ctx.point;
}

/**
 * 圈內敵人，照 (距離平方, id) 這個 TOTAL ORDER 排序。
 * ⚠️ `enemiesInCircle` 已經保證遞增 id，但 sort 自己必須是全序 —— 少了
 * `a.id - b.id` 那一段，兩個等距目標的先後就交給了 sort 的實作，而上限正好
 * 在那裡切一刀（同 `damageArea.ts` 的同一段註解）。
 *
 * ⚠️ 只有**起始圈**（誰各起一條鏈）還按距離排 —— 那是 `maxSources` 要切的那一刀。
 * 逐跳的下一個目標走 {@link pickNextNode}，那裡是**隨機**的（檔頭③）。
 */
function nearestFirst(
  world: SimWorld,
  caster: EntityId,
  at: { x: number; z: number },
  range: number,
): { id: EntityId; d2: number }[] {
  const out: { id: EntityId; d2: number }[] = [];
  for (const id of enemiesInCircle(world, caster, at, range)) {
    const t = world.transform.get(id);
    if (!t) continue;
    out.push({ id, d2: distSq(at, t.pos) });
  }
  out.sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id));
  return out;
}

/** 一條**還在飛**的鏈。 */
export interface ChainStrand {
  /** 這一發要打誰。 */
  target: EntityId;
  /** 這一發從誰身上射出。undefined = 施法者（＝一條鏈的第一發）。 */
  from?: EntityId;
  /** 這一發的傷害（每跳乘一次 `decay`）。 */
  amount: number;
  /** 這一發到期的**絕對** tick（⛔ 不是剩餘 tick 數）。 */
  atTick: number;
  /** 這條鏈**還剩幾發**（含這一發）。這是保險絲的逐條配額，見 `apply`。 */
  left: number;
  /**
   * 這條鏈走過誰。⛔ 不是全域的 —— 兩條鏈打到同一個人是**應該**的，那正是
   * 「越多單位越痛」；`revisit` 管的是**同一條**鏈裡的來回。
   * ⚠️ 只 `has`/`add`，**從不迭代**（同 `DelayedWave.struck`：迭代順序是 desync）。
   */
  walked: Set<EntityId>;
  /** 走完了（打滿配額 / 跳不到人 / 目標沒了）。 */
  done: boolean;
}

/** 一次施放排出來的全部鏈。 */
export interface ChainLightningCast {
  caster: EntityId;
  rank: number;
  origin: string;
  abilitySlot?: CastableSlot;
  /**
   * 觸發這一次施放的**那一發傷害**，在排程那一刻定基（`deferredTrigger.ts`）。
   * 少了它，掛在 `onHitTargets` 裡的 `damage.incomingPct` 會走 `damage.ts` 的
   * early-return —— 卡片寫著幾倍反彈、場上一發都不發（失敗形態②）。
   */
  incoming?: TriggerDamage;
  /** 這一次施放屬於哪個競技場分區 —— 分區的決鬥結束了就不再放電。 */
  zone: number;
  /** 兩發之間的 tick 數（**≥ 1**；0 的那一格在 `apply` 就跑完了不會進佇列）。 */
  intervalTicks: number;
  jumpRange: number;
  decay: number;
  damageType: DamageType;
  canCrit: boolean;
  /** 暴擊參數在**施放那一刻**凍住，與 `amount` 同一個立場。 */
  critChance: number;
  critDamage: number;
  revisit: boolean;
  strands: ChainStrand[];
  /** 這一次施放**總共**被電到的人（去重），整串跑完才交給 `onHitTargets`。 */
  struck: EntityId[];
  struckSeen: Set<EntityId>;
  /** ⭐ G1 ② 的那三格，整串跑完才付（`runOnHitChain` 的參數形狀）。 */
  onHit: {
    onHitTargets?: EffectDef[];
    runOnEmptyHit?: boolean;
    onHitTargetsMode?: "batch" | "perTarget";
  };
}

/**
 * 這個世界的連鎖佇列 —— **唯一**的存取點（`delayedQueue` / `randomAreaQueue`
 * 的先例：搬家時呼叫端一個字都不用改）。
 */
export function chainLightningQueue(world: SimWorld): ChainLightningCast[] {
  return world.chainLightning;
}

/** 佇列裡**還在飛**的鏈有幾條 —— {@link CHAIN_MAX_LIVE_STRANDS} 的量。 */
function liveStrands(world: SimWorld): number {
  let n = 0;
  for (const cast of chainLightningQueue(world)) {
    for (const s of cast.strands) if (!s.done) n++;
  }
  return n;
}

/**
 * 下一跳：從**上一個受害者**身上，在 `jumpRange` 內、這條鏈還沒打過的人裡
 * **隨機**抽一個（檔頭③）。抽不到人 → `undefined` = 這條鏈結束。
 */
function pickNextNode(
  world: SimWorld,
  cast: ChainLightningCast,
  s: ChainStrand,
  rng: Rng,
): EntityId | undefined {
  if (cast.jumpRange <= 0) return undefined;
  const here = world.transform.get(s.target);
  if (!here) return undefined;
  const cands: EntityId[] = [];
  for (const id of enemiesInCircle(world, cast.caster, here.pos, cast.jumpRange)) {
    if (id === s.target) continue;
    if (!cast.revisit && s.walked.has(id)) continue;
    cands.push(id);
  }
  if (cands.length === 0) return undefined;
  // 全序才抽（`enemiesInCircle` 已經是遞增 id，但**不可以**把決定性掛在別人的
  // 內部保證上 —— 同 `nearestFirst` 那一段註解的理由）。
  cands.sort((a, b) => a - b);
  return cands[rng.int(cands.length)];
}

/**
 * ⭐ **一發**閃電：打這一個人 → 讓玩家看見這一段 → 抽下一個 → 排下一個絕對 tick。
 *
 * 逐跳（`chainLightningSystem`）與瞬發（`apply` 的 0 間隔）共用這一段，
 * ⛔ 不是兩份實作（檔頭⑤）。
 */
function boltOnce(world: SimWorld, cast: ChainLightningCast, s: ChainStrand, rng: Rng): void {
  const hereT = world.transform.get(s.target);
  // 目標在等待的這幾個 tick 之間死掉/離場了 → 這條鏈到此為止，⛔ 不鞭屍
  // （`world.health` 沒有這一格 = 這個身體沒有生命元件，照舊當成可以打）。
  if (!hereT || world.health.get(s.target)?.alive === false) {
    s.done = true;
    return;
  }

  let dealt = s.amount;
  let crit = false;
  let critSources: readonly string[] | undefined;
  if (cast.canCrit) {
    const cr = rollAbilityCrit(world, cast.caster, cast.critChance, cast.critDamage, rng);
    crit = cr.crit;
    if (cr.crit) dealt *= cr.mult;
    critSources = cr.critSources;
  }
  world.damageQueue.push({
    source: cast.caster,
    target: s.target,
    amount: dealt,
    type: cast.damageType,
    crit,
    ...(critSources !== undefined ? { critSources } : {}),
    origin: cast.origin,
  });
  if (!cast.struckSeen.has(s.target)) {
    cast.struckSeen.add(s.target);
    cast.struck.push(s.target);
  }

  // ── 玩家要**看得到這一發**，不是只有掉血（檔頭④）──────────────────────
  // 起點：上一個受害者；一條鏈的第一發從施法者身上射出。
  const fromPos =
    (s.from !== undefined ? world.transform.get(s.from)?.pos : undefined) ??
    world.transform.get(cast.caster)?.pos;
  world.emit("chainLightning", {
    caster: cast.caster,
    chains: 1,
    hits: 1,
    segments:
      fromPos !== undefined
        ? [{ x: fromPos.x, z: fromPos.z, x2: hereT.pos.x, z2: hereT.pos.z }]
        : [],
    origin: cast.origin,
  });

  s.left--;
  if (s.left <= 0) {
    s.done = true;
    return;
  }
  const next = pickNextNode(world, cast, s, rng);
  if (next === undefined) {
    s.done = true;
    return;
  }
  s.from = s.target;
  s.target = next;
  s.walked.add(next);
  // ⛔ 乘一次，不是 `decay ** hop` —— `**` 是 sim 的禁用符號（purity gate）。
  s.amount *= cast.decay;
  // ⭐ 下一發的到期時刻 —— **絕對** tick（`world.tick + 間隔`），
  // ⛔ 不是一個每 tick 減一的計數器。
  s.atTick = world.tick + cast.intervalTicks;
}

/** 整串跑完了才付 `onHitTargets`（⛔ 不是每一跳各付一次）。 */
function payOnHit(world: SimWorld, cast: ChainLightningCast): void {
  if (cast.onHit.onHitTargets === undefined && cast.onHit.runOnEmptyHit !== true) return;
  const ctx: EffectContext = {
    world,
    caster: cast.caster,
    rank: cast.rank,
    targets: [],
    origin: cast.origin,
    ...(cast.abilitySlot !== undefined ? { abilitySlot: cast.abilitySlot } : {}),
    ...(cast.incoming !== undefined ? { incoming: cast.incoming } : {}),
    rng: world.rng,
  };
  runOnHitChain(cast.onHit, cast.struck, ctx, runEffects);
}

export const chainLightningEffect: EffectKindSpec<"chainLightning"> = {
  apply(e, ctx, _bakeList, runList) {
    const { world } = ctx;
    const jumps = clampCount(e.jumps, 1, CHAIN_MAX_JUMPS);
    const jumpRange = clampDist(e.jumpRange);
    const budget = clampCount(
      e.maxTotalJumps,
      DEFAULT_CHAIN_MAX_TOTAL_JUMPS,
      CHAIN_MAX_TOTAL_JUMPS,
    );
    if (jumps <= 0 || budget <= 0) return;
    // 遞減係數：夾在 [0,1]。⛔ 缺席**不是** 1 —— 這個 kind 的身分就是「逐跳遞減」，
    // 所以 schema 把它列為必填；這裡的夾值只是第二層（後台 overlay 路徑不跑 Zod，
    // 見 `spreadLimits.ts` 檔頭的同一段說明）。
    let decay = Number.isFinite(e.decay) ? e.decay : CHAIN_MAX_DECAY;
    if (decay < CHAIN_MIN_DECAY) decay = CHAIN_MIN_DECAY;
    if (decay > CHAIN_MAX_DECAY) decay = CHAIN_MAX_DECAY;
    // ⭐ 逐跳的時間差（owner 2026-08-20）。**缺席 = 出貨預設**，⛔ 不是 0 ——
    // 第〇·六守則：高層級的新裁決**預設啟動**。0 是合法值＝明寫「我要瞬發」。
    const rawInterval = e.jumpIntervalSec;
    const intervalSec =
      rawInterval === undefined || !Number.isFinite(rawInterval)
        ? DEFAULT_CHAIN_JUMP_INTERVAL_SEC
        : Math.max(0, Math.min(CHAIN_MAX_JUMP_INTERVAL_SEC, rawInterval));
    // ⚠️ 夾成**至少 1 tick**：0.001 秒與 0.033 秒在 30Hz 下是同一件事，而一個算出
    // 0 tick 間隔的排程會把整條鏈塞回同一個 tick —— 那正是這一版要修的症狀
    // （同 `randomArea` / `delayed` 的 `intervalTicks` 那一行）。
    const intervalTicks = intervalSec <= 0 ? 0 : Math.max(1, Math.round(intervalSec / world.dt));

    // ── ① 哪些人各起一條鏈 ────────────────────────────────────────────────
    let sources: EntityId[];
    if (e.shape === "circle") {
      const centre = chainCentre(ctx, e.centre ?? "caster");
      const radius = clampDist(e.radius);
      if (!centre || radius <= 0) return;
      const cap = clampCount(e.maxSources, CHAIN_MAX_SOURCES, CHAIN_MAX_SOURCES);
      sources = nearestFirst(world, ctx.caster, centre, radius)
        .slice(0, cap)
        .map((v) => v.id);
    } else {
      sources = [...ctx.targets];
    }

    const stats = casterDamageStats(ctx);
    const base = resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx), scalingOracle(ctx.world, ctx.caster, ctx.targets[0]), casterSlotRank(ctx));
    const t = world.transform.get(ctx.caster);
    const cast: ChainLightningCast = {
      caster: ctx.caster,
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      // 觸發脈絡跟著整串一起凍住。定基是 `resolvePass` 那一格的事（見
      // `deferredTrigger.ts`）—— ⛔ 不可以順手把 `reflectDepth` 歸零。
      ...(ctx.incoming !== undefined ? { incoming: rebaseTriggerForDeferred(ctx.incoming) } : {}),
      zone: t?.zone ?? 0,
      intervalTicks,
      jumpRange,
      decay,
      damageType: e.damageType ?? world.damageRules.defaultAbilityDamageType,
      canCrit: e.canCrit === true,
      critChance: stats[Stat.CritChance] ?? 0,
      critDamage: stats[Stat.CritDamage] || 1.75,
      revisit: e.revisit === true,
      strands: [],
      struck: [],
      struckSeen: new Set<EntityId>(),
      onHit: {
        ...(e.onHitTargets !== undefined ? { onHitTargets: e.onHitTargets } : {}),
        ...(e.runOnEmptyHit !== undefined ? { runOnEmptyHit: e.runOnEmptyHit } : {}),
        ...(e.onHitTargetsMode !== undefined ? { onHitTargetsMode: e.onHitTargetsMode } : {}),
      },
    };

    // ── ② 一條鏈一個 strand，保險絲**在這裡就分配完** ──────────────────────
    // ⭐ `maxTotalJumps` 從「一個跨鏈共用的計數器」變成「逐條的配額」，因為逐跳
    // 之後那個計數器要活在佇列裡跨 tick 被讀寫，而配額是一個**排程時就定案**的
    // 數字。兩者的上界完全相同（Σ 配額 ≤ budget），保險絲一格不鬆。
    //
    // ⭐ 第 i 條鏈的第一發**晚 i 個間隔**（cascade）：owner 說的是「每個閃電有極小
    // 的時間間隔…才到下一個」，而 N 條鏈同時炸開就不是那句話。它同時讓**施放的
    // 那一個 tick** 只剩一發（檔頭②的尖峰）。
    let left = budget;
    for (let i = 0; i < sources.length; i++) {
      if (left <= 0) break;
      const start = sources[i]!;
      const allow = Math.min(jumps, left);
      left -= allow;
      cast.strands.push({
        target: start,
        amount: base,
        atTick: world.tick + i * intervalTicks,
        left: allow,
        walked: new Set<EntityId>([start]),
        done: false,
      });
    }

    // ── ③ 瞬發：`jumpIntervalSec: 0`，或佇列滿了的退路 ────────────────────
    // ⚠️ 佇列滿的時候**照樣把傷害打完**（只是失去時間差），⛔ 不是靜默丟掉幾條鏈
    // —— 一個會安靜少打幾個人的上限是失敗形態②，而這一格擋的是每 tick 的成本。
    const instant =
      intervalTicks === 0 ||
      cast.strands.length === 0 ||
      liveStrands(world) + cast.strands.length > CHAIN_MAX_LIVE_STRANDS;
    if (instant) {
      for (const s of cast.strands) {
        s.atTick = world.tick;
        while (!s.done) boltOnce(world, cast, s, ctx.rng);
      }
      // ⭐ G1 ② —— emit 在前（`boltOnce` 每一發各發一次），再收下游的狀態／傷害。
      runOnHitChain(cast.onHit, cast.struck, ctx, runList);
      return;
    }
    chainLightningQueue(world).push(cast);
  },
  /**
   * `onHitTargets` 現在會在**未來的某個 tick** 才跑，所以它必須在施放那一刻烘焙
   * —— 與 `randomArea.effects` / `leap.onLand` / `spawnProjectile.onHit` 同一個
   * #247 缺陷。⚠️ 這一格是**這一版新增**的：上一版整串在同一 tick 跑完，identity
   * 是對的答案；跨 tick 之後它就不是了。
   */
  bake(e, ctx, bakeList) {
    return e.onHitTargets === undefined
      ? e
      : { ...e, onHitTargets: bakeList(e.onHitTargets, ctx) };
  },
};

/**
 * 付掉這一 tick 到期的那幾發（`SimWorld.step()` 的 7e″）。
 *
 * 位置與 `delayed` / `randomArea` 是**同一個硬約束**：排在 `combatResolveSystem`
 * **之前**，這一 tick 到期的一發才會在同一個 tick 被減傷、被護盾吃、被
 * `recordDamage` 記分、被 `deathSystem` 結算。
 *
 * **STRICT no-op**：佇列空的時候它在碰任何東西之前就回來。
 */
export function chainLightningSystem(world: SimWorld): void {
  const q = chainLightningQueue(world);
  if (q.length === 0) return;

  let anyDone = false;
  // 陣列 = 插入序 = 全序（不迭代 Map）。
  for (const cast of q) {
    // 決鬥已經結束的分區不再放電 —— 與 `dotTick` / `randomArea` / `delayed` 對
    // `settledZones` 的處置逐字相同（#100/#216：回合結束後還在扣血玩家看得見）。
    // ⚠️ 這一條路**不付** `onHitTargets`：那一段是「這次施放打完了」的獎勵，
    // 而這次施放是被回合結束**打斷**的。
    if (world.settledZones.has(cast.zone)) {
      for (const s of cast.strands) s.done = true;
      anyDone = true;
      continue;
    }

    let live = 0;
    for (const s of cast.strands) {
      if (s.done) continue;
      // ⚠️ 一個 tick **最多一發**（⛔ 不是 `while` 追進度）：一發 = 一道閃電 =
      // 一個渲染事件，追進度會把 owner 要的那個時間差在卡頓時吃掉。
      if (s.atTick <= world.tick) boltOnce(world, cast, s, world.rng);
      if (!s.done) live++;
    }
    if (live === 0) {
      payOnHit(world, cast);
      anyDone = true;
    }
  }

  // 跑完的整串移除。只在真的有東西跑完時重建陣列，免得每 tick 配一次記憶體。
  if (anyDone) {
    const alive = q.filter((c) => c.strands.some((s) => !s.done));
    q.length = 0;
    for (const c of alive) q.push(c);
  }
}
