/**
 * `randomArea` —— **隨機落點排程器**（計畫 §12 G4 的 `scheduler.random-area@1`）。
 *
 * 擋住兩支：
 *   · 13-04 龍星群   「自身[周圍]每 0.2 秒[隨機]地點落下一顆流星，共 10 顆」
 *   · 70-04 千年練成 「在[周圍][範圍]隨機[招喚]樹精，總共 4/6/8 棵」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① ⛔ 為什麼 `random-barrage` 模板不算做完（而這一支是真的）
 *
 * `content/templates/expand.ts` 的 `random-barrage` 把一片轟炸區寫成掛在區域內
 * 每個人身上的一段 `dot`，而它的檔頭自己把代價寫下來了：
 *
 *   「sim 沒有『排程一串未來的空間事件』這種詞彙」
 *   「每一發的隨機落點沒有被模擬：區域內的人是**每一發都吃到**」
 *
 * 也就是說「隨機落點」這四個字在引擎裡從來不存在 —— 玩家站在哪裡完全不影響
 * 他挨幾發。這支補的正是那個缺的詞彙：**一串綁在絕對 tick 上的空間事件**。
 * ⚠️ 這支上線**不會**動到 `random-barrage` 的既有 8 張卡（它們仍然走 `dot`），
 * 那是一次獨立的內容遷移，不是這一批的事。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 決定性：draw 預算是 `2 × count`，而且**只在施法那一刻花掉**
 *
 * 計畫 §13 要求同一顆 seed 的落點／目標／事件／digest 逐位元相同。所以：
 *
 *   · **所有落點在施法 tick 一次抽完**，不是每一發到期時才抽。到期時才抽的話，
 *     「這一波抽了幾次」會取決於它有沒有被回合結束／施法者陣亡打斷，而那兩件事
 *     取決於場上發生了什麼 —— 亂數流就被場況綁架了。
 *   · **每一發固定 2 次 draw**，不做拒絕取樣。拒絕取樣的次數取決於抽到什麼，
 *     雖然仍是「輸入的函式」，但它讓「這一發花了幾次 draw」無法用眼睛算 ——
 *     而 `weightedBranch` 檔頭那一段（「draw 次數不是欄位，是決定性預算」）
 *     的價值就在於它是**看得見的**。
 *
 * 方形 → 圓形用的是 elliptical grid mapping：
 *   `u = x·sqrt(1 − z²/2)`、`v = z·sqrt(1 − x²/2)`，`x, z ∈ [−1, 1]`。
 * ⛔ **不用極座標**（`r·cos θ` / `r·sin θ`）：`sim/**` 禁三角函式
 *（CLAUDE.md 硬性技術約束，`sim/purity.test.ts` 在守）。`Math.sqrt` 沒有被禁。
 * ⚠️ 誠實記一筆：這個映射是雙射但**不是嚴格等面積**，圓心附近的密度略高於
 * 均勻分佈。對「天上掉東西」而言那是可接受的（甚至比較好看），但它不是
 * uniform-on-disc，不要在別處引用它當作均勻取樣。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 排程是**絕對 tick**，不是遞減計數器
 *
 * 第 i 發的到期時刻是 `castTick + i × intervalTicks`（`firstAtCast` 時 i 從 0 起）。
 * ⚠️ `intervalTicks` 夾成**至少 1**：0.2 秒在 30Hz 是 6 tick，但一份寫 0.001 秒
 * 的文件會算出 0，整波塞進同一個 tick —— 那不是「很快」，那是排程器壞了。
 * `firstAtCast` 預設 **true**，理由與 `random-barrage` 的 `tickOnApply` 逐字相同：
 * 原作是「先放一發，再 sleep」（74-03 闇之天使 j:48509-48514 的順序）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ ⚠️ 接線還沒接（給主控的兩行）—— 這一段是**刻意**留著的
 *
 * 佇列今天掛在 `SimWorld` 上的一格 optional 欄位（{@link randomAreaQueue} 是
 * 唯一的存取點），而 `SimWorld.ts` 屬於別的並行路，所以本 lane 不動它。
 * 主控要接的**只有兩行**，位置在回報裡寫明：
 *
 *   1. `SimWorld` 欄位宣告：
 *      `readonly randomArea: import("./effects/randomArea").RandomAreaWave[] = [];`
 *   2. `SimWorld.step()` 的 7c″（`intervalHookSystem` 之後、`combatResolveSystem`
 *      之前）：`randomAreaSystem(this);`
 *      —— 與 `dotTickSystem` 完全同一個理由：這一 tick 到期的落點必須在**同一個
 *      tick** 被減傷、被護盾吃、被 `recordDamage` 記分、被 `deathSystem` 結算。
 *      排在 drain 之後，整波每一發都會晚一個 tick。
 *
 * 在那兩行接上之前，這個 kind 是**排得出來、不會落地**的 —— 這正是失敗形態 ②，
 * 所以它寫在這裡而不是只寫在 commit message 裡。守衛
 * `lane2Kinds.test.ts` 直接呼叫 {@link randomAreaSystem}，並在檔頭誠實標注
 * 「驗的是機制，接線由主控補」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ ⛔ 這個 kind **沒有** `shape` / `radius` / `side` / `maxTargets`（2026-08-10）
 *
 * 它們曾經住在 schema 上，而這支 handler **一格都不讀** —— 對帳者把它列為全 repo
 * 唯一的真孤兒，作者填了完全沒有效果，而畫面上跟「這招就設計成這樣」分不出來。
 *
 * 理由是這個 kind 的定義本身：**它解的是「落點」，不是「受害者」。** 施法時把一波
 * `impacts` 排進佇列，到期時用 `targets: []` + `point: hit.pos` 跑 `wave.effects`，
 * 「打到誰」是**巢狀的 `damageArea` 自己拿 `ctx.point` 當圓心解出來的**（見下面
 * `randomAreaSystem` 裡那一段註解）。所以那四格是同一件事的第二個住處。
 *
 * ⛔ 反方向（把 `shapeTargets` 接上去）是在做 `delayed` 已經做的事：那個 kind 存在
 * 的**唯一**理由就是「施放那一刻凍住的名單」，兩者的差別就是那一句話。
 * ⭐ 作用範圍改由 {@link RandomAreaWave} 的 `scatterRadius` + `who` 講清楚 ——
 * 那正是 E1 要的東西，只是不叫 `shape`（守衛：`content/schema/newKindShape.test.ts`
 * 的 `OWN_GEOMETRY_KINDS`，它**兩個方向一起問**：自己那一格要收得下，`shape` 要收不下）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑥ purity
 *
 * 唯一的隨機來源是 `ctx.rng`；無時鐘、無三角函式、無 `**`。到期是絕對 tick。
 * 佇列是**陣列**（插入序 = 全序），不迭代 Map。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import type { Vec2 } from "../math/vec2";
import type { EffectContext, EffectDef } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import type { Rng } from "../math/rng";
import { runEffects } from "./effectRunner";
import {
  RANDOM_AREA_MAX_COUNT,
  RANDOM_AREA_MAX_INTERVAL_SEC,
  RANDOM_AREA_MAX_SCATTER_RADIUS,
} from "./kindLimits";

/** 一發落點：什麼時候、掉在哪。 */
export interface RandomAreaImpact {
  /** **絕對** tick（不是剩餘 tick 數）。 */
  readonly atTick: number;
  readonly pos: Vec2;
}

/** 一次施放排出來的一整波。 */
export interface RandomAreaWave {
  caster: EntityId;
  rank: number;
  origin: string;
  abilitySlot?: CastableSlot;
  /** 每一發落地時要跑的東西（傷害／召喚／特效都走同一條路）。 */
  effects: EffectDef[];
  /** 施法那一刻就抽完的全部落點，依 `atTick` 遞增。 */
  impacts: RandomAreaImpact[];
  /** 下一個還沒付的落點 index。 */
  next: number;
  /** 施法者陣亡就整波停掉（決策點，見 EffectDef）。 */
  stopOnCasterDeath: boolean;
  /** 這一波屬於哪個競技場分區 —— 分區的決鬥結束了就不再落下。 */
  zone: number;
}

/** `SimWorld` 還沒宣告 `randomArea` 之前的暫時形狀（檔頭 ④）。 */
/**
 * 這個世界的落點佇列 —— **唯一**的存取點。
 *
 * 2026-08-08 接線完成：欄位已經住進 `SimWorld.randomArea`，所以這支退化成一行。
 * ⭐ 留著它而不是讓呼叫端直接讀欄位，是因為它當初就是為了「搬家時呼叫端一個字
 * 都不用改」而存在的 —— 而那件事剛剛真的發生了一次。下一次搬家同理。
 */
export function randomAreaQueue(world: SimWorld): RandomAreaWave[] {
  return world.randomArea;
}

/**
 * 在 `centre` 周圍抽 `count` 個落點。**固定花 `2 × count` 次 `rng.next()`**。
 *
 * 匯出是為了讓守衛可以在不建世界的情況下釘住 draw 預算（檔頭 ②）。
 */
export function rollScatterPoints(
  rng: Rng,
  centre: Vec2,
  scatterRadius: number,
  count: number,
): Vec2[] {
  const r = Math.max(0, Math.min(RANDOM_AREA_MAX_SCATTER_RADIUS, scatterRadius));
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    // 先在 [−1,1]² 取一點，再用 elliptical grid mapping 折進單位圓（無三角函式）。
    const x = rng.next() * 2 - 1;
    const z = rng.next() * 2 - 1;
    const u = x * Math.sqrt(Math.max(0, 1 - (z * z) / 2));
    const v = z * Math.sqrt(Math.max(0, 1 - (x * x) / 2));
    out.push({ x: centre.x + u * r, z: centre.z + v * r });
  }
  return out;
}

export const randomAreaEffect: EffectKindSpec<"randomArea"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // 圓心：`who:"target"` 時是解出來的第一個目標，否則是施法者自己
    // （13-04「自身[周圍]」、70-04「在[周圍]」兩支都是自己）。
    const anchor =
      (e.who ?? "self") === "target" ? (ctx.targets[0] ?? ctx.caster) : ctx.caster;
    const t = world.transform.get(anchor);
    const centre = t?.pos ?? ctx.point;
    if (!centre) return;

    // 逐階發數（70-04 的 4/6/8）。超過最後一階就沿用最高的那一階 —— 與
    // `applyBuff.perRank` 同一句話，不讓 maxRank 超出授權欄位時整招消失。
    const raw = e.count[Math.min(Math.max(1, ctx.rank), e.count.length) - 1] ?? 0;
    const count = Math.max(0, Math.min(RANDOM_AREA_MAX_COUNT, Math.floor(raw)));
    if (count <= 0) return;

    const secs = Math.max(0, Math.min(RANDOM_AREA_MAX_INTERVAL_SEC, e.intervalSec));
    // ⚠️ 至少 1 tick —— 見檔頭 ③。
    const intervalTicks = Math.max(1, Math.round(secs / world.dt));
    const firstOffset = (e.firstAtCast ?? true) ? 0 : intervalTicks;

    const points = rollScatterPoints(ctx.rng, centre, e.scatterRadius, count);
    const impacts: RandomAreaImpact[] = points.map((pos, i) => ({
      atTick: world.tick + firstOffset + i * intervalTicks,
      pos,
    }));

    randomAreaQueue(world).push({
      caster: ctx.caster,
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      effects: e.effects,
      impacts,
      next: 0,
      stopOnCasterDeath: e.stopOnCasterDeath ?? false,
      zone: t?.zone ?? 0,
    });
  },
  /**
   * 落地的 payload 是**延遲**的，所以它必須在施法那一刻烘焙 —— 與
   * `leap.onLand` / `spawnProjectile.onHit` 同一個 #247 缺陷（`effectRunner.ts`
   * 檔頭）。少了這一段，一顆 0.2 秒後才落地的流星會用**落地當下**的
   * `comboBonus` 結算，而卡上寫的是施法時的狀態。
   */
  bake(e, ctx, bakeList) {
    return { ...e, effects: bakeList(e.effects, ctx) };
  },
};

/**
 * 把這一 tick 到期的落點付掉（`SimWorld.step()` 的 7c″，見檔頭 ④）。
 *
 * **STRICT no-op**：佇列空的時候它在碰任何東西之前就回來，所以每一份既有
 * replay 與 digest 逐位元不變。
 */
export function randomAreaSystem(world: SimWorld): void {
  const q = randomAreaQueue(world);
  if (q.length === 0) return;

  let anyDone = false;
  // 陣列 = 插入序 = 全序（不迭代 Map）。
  for (const wave of q) {
    // 決鬥已經結束的分區不再落下 —— 與 `dotTick` 對 `settledZones` 的處置逐字
    // 相同（#100/#216：回合結束後還在扣血是玩家看得見的缺陷）。
    if (world.settledZones.has(wave.zone)) {
      wave.next = wave.impacts.length;
      anyDone = true;
      continue;
    }
    if (wave.stopOnCasterDeath && world.health.get(wave.caster)?.alive !== true) {
      wave.next = wave.impacts.length;
      anyDone = true;
      continue;
    }
    while (wave.next < wave.impacts.length && wave.impacts[wave.next]!.atTick <= world.tick) {
      const hit = wave.impacts[wave.next]!;
      wave.next++;
      // ⚠️ `targets: []` 是刻意的：落點才是圓心。`shapeTargets` 讀的是
      // `targets[0] → ctx.point → 施法者`，所以留空才會用 `point`。
      const ctx: EffectContext = {
        world,
        caster: wave.caster,
        rank: wave.rank,
        targets: [],
        point: hit.pos,
        origin: wave.origin,
        ...(wave.abilitySlot !== undefined ? { abilitySlot: wave.abilitySlot } : {}),
        rng: world.rng,
      };
      runEffects(wave.effects, ctx);
    }
    if (wave.next >= wave.impacts.length) anyDone = true;
  }

  // 付完的整波移除。只在真的有東西付完時重建陣列，免得每 tick 配一次記憶體。
  if (anyDone) {
    const live = q.filter((w) => w.next < w.impacts.length);
    q.length = 0;
    for (const w of live) q.push(w);
  }
}

/** 一次施放會花掉的 rng draw 次數 —— 守衛與文件共用的**同一份**定義。 */
export function randomAreaDrawBudget(count: number): number {
  return 2 * count;
}
