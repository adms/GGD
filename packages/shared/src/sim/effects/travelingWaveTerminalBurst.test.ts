/**
 * ⭐ GH#1094【行進波動的終點爆發】—— 「沿途命中**之外**，終點再追加一次傷害」
 * 這句話對**最後一段才首次命中**的那個人也要成立。
 *
 * ── 缺陷長什麼樣（2026-09-07 量到，⛔ 不是推測）────────────────────────────
 * `delayedSystem` 跑 `finalEffects` 時**沿用最後一段自己的命中名單**當 `ctx.targets`
 * （`delayed.ts:483`：`runEffects(wave.finalEffects, ctx)` 用的是同一個 `ctx`），
 * 而 `damageArea` 的預設語意是「**震央那個人不再吃一次**」
 * （`damageArea.ts:54`：`epicentre = e.includeOrigin === true ? null : new Set(ctx.targets)`）。
 *
 * ⇒ ⭐ 兩者相乘的結果是**不對稱**的：
 *   · 早段就被掃到的人 → ⛔ **不在**最後一段的 `ctx.targets` 裡 ⇒ 吃得到終點爆發；
 *   · 最後一段才首次命中的人 → ⭐ **在** `ctx.targets` 裡 ⇒ **被排除**，終點爆發跳過他。
 *
 * ⚠️ 而卡面（`tpl-traveling-wave.description`）逐字寫著「可帶**終點爆發**」——
 * 站在爆炸正中心的那個人反而沒吃到，是第一·五守則的鏡像：說了但不會發生。
 *
 * ── 修法（⛔ 不是為某支技能寫 if）────────────────────────────────────────
 * `content/templates/expand.ts` 的 `traveling-wave` 家族在終點那顆 `damageArea`
 * 上補 `includeOrigin: true` —— ⭐ 與**同一個檔**裡 `modelFxFamily` 的落點大爆炸
 * （`expand.ts:675`「爆炸要打到站在落點上的那個人」）**同一個決定、同一個理由**。
 * ⛔ 刻意**不動** `damageArea` 的全域預設排除語意：那一格是給「一擊打在 A 身上、
 * 濺到旁邊的 B」用的，改掉它會讓每一支近戰擴散多打震央一次。
 *
 * ── 這裡驗的是「機制」不是「數字」（第二守則）────────────────────────────
 * ⛔ 200 / 450 / 0.03 這些出貨值一個都沒有進斷言。每一條都是**同一次幾何的兩臂相減**
 * （帶終點爆發 vs 拿掉終點爆發），所以沿途那一發在兩臂裡一樣多、會從差值裡消掉。
 * 量的是 `world.damageQueue` 上**這支技能 origin** 的封包，⛔ 不是血條 ——
 * 血條還帶著 `combatActive` 的環境掉血（`travelingWaveAdvance.test.ts` 檔頭量過）。
 *
 * ── 突變紀錄（承重的一條線，真的跑過）──────────────────────────────────────
 *  · `content/templates/expand.ts` 的 `traveling-wave` 終點 `damageArea` 拿掉
 *    `includeOrigin: true`（＝這一票修好以前的出貨行為）
 *    → ②「最後一段才首次命中的人吃不到終點爆發」**紅**。
 *    ⚠️ 而①（早段已命中的人）在兩邊都是綠的 —— 那正是這個缺陷難發現的原因：
 *      一半是對的。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { zEffectDefUnion } from "../../content/schema/effect";
import { zTemplateDoc } from "../../content/schema/template";
import { defaultParamsFor } from "../../content/templates/paramsSchema";
import { expand } from "../../content/templates/expand";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

const TEMPLATES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
const ORIGIN = "ability:test.traveling-wave-terminal";

/**
 * ⭐ 一組**刻意稀疏**的覆寫（⛔ 不是家族預設）：預設的 `aoePerStep` 200 wc3u ≈ 3.67 u
 * 讓每一段的圓互相重疊到「站在線上的人第一段就中」，那樣就分不出「早段命中」與
 * 「最後一段才首次命中」這兩種人 —— 而它們正是這張票的兩半。
 *
 * 換算是 `expand.ts::GGD_PER_WC3 = 11/600`：
 *   步距 200 wc3u → 3.67 u ⇒ 四段的圓心在施法者 +0 / +3.67 / +7.34 / +11.01
 *   每段半徑 50 wc3u → 0.92 u（⛔ 兩個圓不相交）
 *   終點爆發 200 wc3u → 3.67 u（涵蓋 +8.0 與 +11.0 兩個身體）
 */
const SPARSE: Record<string, unknown> = {
  stepSize: 200,
  stepCount: 4,
  stepIntervalSec: 0.1,
  aoePerStep: 50,
  terminalBurst: 200,
  // ⛔ 真傷：護甲／魔抗在兩臂裡一樣，但真傷讓「多吃一發」與「同一發被算兩次」
  //    在封包上分得開，⛔ 不必去猜減傷公式。
  damageType: "true",
};

/** 操作者在鑄技工坊開一張 `tpl-traveling-wave` 存檔會得到的那一份展開。 */
function shippedWave(opts: { terminal: boolean }): EffectDef[] {
  const t = zTemplateDoc.parse(
    JSON.parse(readFileSync(join(TEMPLATES, "tpl-traveling-wave.json"), "utf8")),
  );
  const params = { ...defaultParamsFor(t), ...SPARSE };
  // ⛔ 負控制：`terminalBurst` 是 optional，拿掉它 = 展開結果**沒有** `finalEffects`。
  if (!opts.terminal) delete params["terminalBurst"];
  return expand(t, params).effects;
}

/** 一臂：跑完整串，回傳每個身體吃到的**這支技能**的傷害總量。 */
function arm(terminal: boolean): { early: number; last: number } {
  const world = new SimWorld(SKELETON_ARENA, 39312);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  // ⛔ 關掉自動索敵：一場真的互毆會在同樣的 tick 上製造傷害封包。
  world.combatFeel = {
    ...world.combatFeel,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false },
  };
  const body = (dx: number, seat: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(seat === 0 ? 0 : 1),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const caster = body(0, 0);
  // ⭐ 早段就被掃到（第三段圓心 +7.34，半徑 0.92）**而且**站在終點爆發圈內。
  const early = body(8.0, 1);
  // ⭐ 最後一段（圓心 +11.01）才**首次**命中 —— 這張票的那個人。
  const last = body(11.0, 2);
  world.step(new Map());
  world.transform.get(caster)!.facing = { x: 1, z: 0 };

  // ⭐ 量的是 runner 真的寫出去的封包，而且**只認這支技能的 origin** ——
  //    `combatActive` 的環境掉血不帶這個 origin，於是它結構上進不了這個數字。
  const tally = new Map<EntityId, number>();
  const q = world.damageQueue as unknown as {
    push: (p: { target: EntityId; amount: number; origin?: string }) => number;
  };
  const push = q.push.bind(world.damageQueue);
  q.push = (p) => {
    if (p.origin === ORIGIN) tally.set(p.target, (tally.get(p.target) ?? 0) + p.amount);
    return push(p);
  };

  runEffects(shippedWave({ terminal }), {
    world,
    caster,
    rank: 1,
    targets: [],
    origin: ORIGIN,
    rng: world.rng,
  } satisfies EffectContext);
  for (let i = 0; i < 25; i++) world.step(new Map());
  return { early: tally.get(early) ?? 0, last: tally.get(last) ?? 0 };
}

describe("行進波動：終點爆發是**追加**，對最後一段才首次命中的人也要發生", () => {
  it("terminal-burst-reaches-the-last-segments-first-hit", () => {
    // 內容 schema 收得下 —— 這是文件進 registry 的那一關。
    for (const e of shippedWave({ terminal: true })) {
      expect(() => zEffectDefUnion.parse(e)).not.toThrow();
    }

    const withBurst = arm(true);
    const noBurst = arm(false);

    // ⓪ 前提：這個幾何真的有把兩個人**都**掃到（否則下面兩條在量空氣）。
    expect(noBurst.early, "早段那個身體整串一次都沒被掃到 —— 夾具的幾何跑掉了").toBeGreaterThan(0);
    expect(noBurst.last, "終點那個身體整串一次都沒被掃到 —— 夾具的幾何跑掉了").toBeGreaterThan(0);

    // ① 早段已命中的人吃得到終點爆發。⭐ 這一半在修好之前就是綠的，留著是為了
    //    擋「修過頭」：把整個 `struck` 集合拿去排除會讓這一條變紅。
    expect(
      withBurst.early,
      "早段已命中的人沒有吃到終點爆發 —— 終點爆發整格沒接上",
    ).toBeGreaterThan(noBurst.early);

    // ② ⭐ 承重：最後一段才首次命中的人**也**要吃到終點爆發。
    expect(
      withBurst.last,
      "最後一段才首次命中的人吃不到終點爆發 —— " +
        "`damageArea` 把他當成震央排除掉了（GH#1094）",
    ).toBeGreaterThan(noBurst.last);

    // ③ ⭐ 兩個人拿到的**追加量**同級：終點爆發是一個以落點為圓心的圓，
    //    ⛔ 不是「先前有沒有被掃到」的函數。⚠️ 只比**有沒有**同一個量級
    //    （距離衰減讓它們不相等），⛔ 不釘任何一個數字。
    const extraEarly = withBurst.early - noBurst.early;
    const extraLast = withBurst.last - noBurst.last;
    expect(
      Math.min(extraEarly, extraLast) * 4,
      "兩個人的終點追加量差了 4 倍以上 —— 那不是同一個圓打的",
    ).toBeGreaterThan(Math.max(extraEarly, extraLast));
  });
});
