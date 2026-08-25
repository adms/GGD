/**
 * #553 —— 飛影 38-03 邪王炎殺黑龍波的**三種演出**在 sim 裡真的各自排得出班表。
 *
 * owner 2026-08-22：「飛影 38-002 究極暴走黑龍波 + 38-03 邪王炎殺黑龍波
 * **三條黑龍+衝擊波+動地剁** 等效果也是經典 JASS 特效技能」。
 *
 * 那句話點名的是**三個不同的演出家族**（原作 A09I 逐行拆在
 * `tools/jass-dragon/out/A09I.staging.json`）：
 *   ① 黑龍本體  h02F `Darkraor.mdl` —— 沿面向推進、穿透、同一個人只碰一次
 *   ② 衝擊波尾流 h02E `BlackHole.mdl` —— 跟著走的第二具模型
 *   ③ 動地剁環  o00Z ×12 —— 半徑 350 每 30° 一個落點
 *
 * ⭐ 讀的是**出貨的那一份**（`ContentLoader` + `registerAll`，級距已解析），
 * ⛔ 不是手寫夾具 —— 失敗形態⑤。三條斷言驗的都是**機制**，⛔ 一個出貨數值都沒抄：
 *   · 「有沒有三具模型各自出場、其中一具是十二個等分實例」（⛔ 不問座標）
 *   · 「onTouch 是**延後**付款的」（⛔ 不問掉幾點血）
 *   · 「onArrive 真的燒到了」（⛔ 不問震幅多大）
 *
 * ⚠️ `world.events` 在 `step()` 的**第一行**就被清空，所以施放事件要在
 * 第一次 `step()` **之前**讀，班表事件要**逐 tick 收**。⛔ 迴圈跑完再讀 = 永遠是空的，
 * 而空陣列讓「沒發生」與「發生了但被清掉」長得一模一樣。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— 把 `content/abilities/godie-u010.e.json`（與 champions 鏡射）
 *    第三段 `spawnModelFx`（動地剁環，`path:"radial" count:12`）整段刪掉
 *      → 紅：「38-03 邪王炎殺黑龍波 少了演出：出場 2 具（要 3 具）
 *        · 等分實例 [1, 1]: expected 2 to be 3」
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/godie-u010.e.json`
 *   · `content/abilities/godie-u010.e.json` 是 **tiers:apply** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh tiers:apply`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     apply_tiers.py 只重算**五級距那幾格**(damageTier/flat · cooldownTier · manaCostTier ·
 *     radiusTier · rangeTier),並把 MIRRORED 欄位**單向**鏡射進 content/champions/ 的內嵌副本;
 *     其餘欄位是**原封寫回** ⇒ 那些手改會留下來 —— ⛔ 但那是繞過隔離區的手改,仍然要走 genrun。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { normalizeCombatEnv } from "../sim/combatEnv";
import { runEffects } from "../sim/effects/effectRunner";
import { DEFAULT_AUTO_ENGAGE } from "../sim/combatFeel";
import type { EffectContext, EffectDef } from "../sim/effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const CASTER: ChampionId = "godie-u010" as ChampionId;
const SUBJECT = "godie-u010.e";

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

interface Cast {
  /** 每一次 `modelFxSpawn` 帶了幾個實例（＝那一種演出出場幾具）。 */
  readonly instanceCounts: number[];
  /** `onArrive` 的螢幕震動是在**第幾個** tick 燒到的（`-1` = 從來沒有）。 */
  readonly shakeTick: number;
  /** 站在路徑上的人**第一次**掉血在第幾個 tick（`-1` 沒掉過、`-2` 施放當下就掉）。 */
  readonly touchTick: number;
}

function cast(ticks: number): Cast {
  const world = new SimWorld(SKELETON_ARENA, 1);
  // ⛔ `combatActive` 留 false + 關掉自動接敵 —— 開著它場上的人會互相普攻，
  //    於是「有人掉血」這條斷言對**壞掉的實作**也會過（失敗形態③，#543 踩過）。
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
  const caster = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  const body = spawnChampion(world, {
    championId: CASTER, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: C.x + 6, z: C.z }, zone: 0,
  });
  world.step(new Map());
  // `path: "forward"` 讀的就是這一格，所以擺在施放的前一刻。
  world.transform.get(caster)!.facing = { x: 1, z: 0 };

  const def = Abilities.tryGet(SUBJECT as AbilityId);
  expect(def, `${SUBJECT} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  const hp = world.health.get(body)!;
  const base = hp.hp;
  runEffects((def!.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [body], origin: `ability:${SUBJECT}`, rng: world.rng,
  } satisfies EffectContext);

  // ⚠️ 施放事件要在第一次 step() **之前**讀（step 的第一行清空 events）。
  const instanceCounts = world.events
    .filter((e) => e.type === "modelFxSpawn")
    .map((e) => ((e.data as { instances?: unknown[] }).instances ?? []).length);

  let touchTick = base - hp.hp > 1e-6 ? -2 : -1;
  let shakeTick = -1;
  for (let t = 0; t < ticks; t++) {
    world.step(new Map());
    if (shakeTick === -1 && world.events.some((e) => e.type === "screenShake")) shakeTick = t;
    if (touchTick === -1 && base - hp.hp > 1e-6) touchTick = t;
  }
  return { instanceCounts, shakeTick, touchTick };
}

describe("#553 邪王炎殺黑龍波的三種演出", () => {
  it("★ 三種演出各自出場，而且動地剁那一種是等分成環的", () => {
    cover("dragon-staging");
    const { instanceCounts } = cast(0);
    expect(
      instanceCounts.length,
      `38-03 邪王炎殺黑龍波 少了演出：出場 ${instanceCounts.length} 具（要 3 具：黑龍本體／衝擊波尾流／動地剁環）· 等分實例 ${JSON.stringify(instanceCounts)}`,
    ).toBe(3);
    // 兩具直線推進的各一個實例，環是等分的多實例 —— ⛔ 不問「幾個」以外的事。
    expect(instanceCounts.filter((n) => n === 1)).toHaveLength(2);
    expect(Math.max(...instanceCounts)).toBeGreaterThan(1);
  });

  it("★ onTouch 是延後付款的，onArrive 真的燒到了", () => {
    cover("dragon-staging");
    const { touchTick, shakeTick } = cast(90);
    expect(touchTick, "路徑上的人一滴血都沒掉 —— onTouch 的班表沒排或沒付款").toBeGreaterThan(-1);
    expect(touchTick, "施放的當下就掉血了 —— 那是沒排班表，模型還沒飛到他身上").not.toBe(-2);
    expect(shakeTick, "onArrive 從來沒燒到 —— 落點那一串沒排或沒付款").toBeGreaterThan(-1);
    // 抵達必然晚於路徑上的第一次碰觸（模型要先飛過他才會到終點）。
    expect(shakeTick).toBeGreaterThan(touchTick);
  });
});
