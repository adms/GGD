/**
 * ⭐⭐ GH#899 —— owner 逐字：「Berserker 12試煉 **復活12次沒有加12次攻擊力與生命力**」。
 *
 * ── ⭐ 為什麼這一條要走**出貨內容**（⛔ 不是夾具）─────────────────────────
 * 十二道試煉的機制住在 `marks`，而 `marks` 要穿過**五段**才會變成玩家看得到的數字：
 *   ① 內容宣告 `marks[].perStackLost`
 *   ② `expandStandalone` → `Abilities.register`（⛔ 這一段掉了 `marks` 就全死）
 *   ③ `installMarksForChampion` 走 `passiveAbility`（⛔ 走不到就一層都沒有）
 *   ④ `lethalSaveFor` 消耗一層並累加 `spent`
 *   ⑤ `syncPerStackSource` 把 `spent` 乘進 modifier 掛上 `StatsComp`
 * ⇒ ⭐ 任何一段斷掉，卡面照樣寫著「永久提升 10%」而玩家量不到 —— 而且**全綠**。
 *
 * ⚠️ 一支夾具技能證明得了②–⑤，⛔ 證明不了「**出貨的那一支**接得上」（失敗形態⑤）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `markInstall.ts` 的 `byId(def.passiveAbility)` 拿掉 → 第 ① 條紅（0 層）
 *   · `lethalSave.ts` 的 `syncPerStackSource(...)` 那一行拿掉 → 第 ② 條紅（掛不上來源）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { shippedDocs } from "./__fixtures__/shippedContent";
import type { CollectionName } from "./schema/index";
import { ContentStore } from "./store";
import { registerAll } from "./registries";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { markCount } from "../sim/marks";
import { recomputeStats } from "../sim/stats/statPipeline";
import { Stat } from "../sim/stats/statTypes";
import { lethalSaveFor } from "../sim/combat/lethalSave";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type MarkId } from "../ids";

const BERSERKER = "godie-hapm" as ChampionId;
const TRIAL = "trial" as MarkId;
const Z0 = SKELETON_ARENA.zones[0]!;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects"] as const) {
    for (const doc of shippedDocs<Record<string, unknown>>(c as CollectionName)) {
      store.add(c, doc.id as string, doc);
    }
  }
  registerAll(store);
});

function spawnBerserker(world: SimWorld): EntityId {
  return spawnChampion(world, {
    championId: BERSERKER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x + 12, z: Z0.center.z + 4 },
    zone: 0,
  });
}

describe("GH#899 十二道試煉：失一層 ⇒ 真的加 AD 與最大生命", () => {
  it("★ ① 生出來就**帶著 12 層**（⛔ 一層都沒有 = 免死與加成全部是死的）", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260901);
    const id = spawnBerserker(world);
    expect(
      markCount(world, id, TRIAL),
      "⛔ 出貨的 `godie-hapm.passive` 宣告了 `marks[].initial: 12`，而生出來一層都沒有\n" +
        "⇒ ⭐ 卡面寫「初始擁有十二層試煉」而遊戲裡零層（第一·五守則）。",
    ).toBe(12);
  });

  it("★ ② 挨一發致命傷害 ⇒ 燒一層**而且** AD／最大生命的來源真的掛上來", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260901);
    const id = spawnBerserker(world);
    const before = markCount(world, id, TRIAL);
    const hp = world.health.get(id)!;
    // ⭐ 走**出貨的**免死路徑（`combat/damage.ts` 用的就是這一支），⛔ 不是自己造一個。
    const saved = lethalSaveFor(world, id, "physical", hp.hp + 9999, hp.hp);
    expect(saved, "⛔ 致命傷害沒有觸發免死 ⇒ 十二道試煉整支是死的").toBeDefined();
    expect(markCount(world, id, TRIAL), "⛔ 沒有燒層").toBe(before - 1);

    const src = world.stats.get(id)!.sources.find((s) => s.id === `mark:${TRIAL}`);
    expect(
      src,
      "⛔⛔ 燒了一層而 `StatsComp` 上**沒有** `mark:trial` 這份來源\n" +
        "⇒ ⭐ 這正是 owner 說的「復活了但沒有加攻擊力與生命力」——\n" +
        "   宣告在（`perStackLost`）、燒層也發生了，⛔ 而它從來沒有變成一個數字。",
    ).toBeDefined();
    const stats = (src!.modifiers ?? []).map((m) => String((m as { stat?: unknown }).stat));
    expect(stats.sort(), `⛔ 掛上來的不是 AD 與最大生命，而是 ${stats.join("/")}`).toEqual(
      ["ad", "maxHealth"].sort(),
    );
  });

  it("★ ③ ⭐ **有效屬性真的變了** —— ⛔ 掛上一份來源 ≠ 玩家量得到", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260901);
    const id = spawnBerserker(world);
    recomputeStats(world, id);
    const adBefore = world.stats.get(id)!.final[Stat.AttackDamage] ?? 0;
    const hpBefore = world.stats.get(id)!.final[Stat.MaxHealth] ?? 0;

    const hp = world.health.get(id)!;
    lethalSaveFor(world, id, "physical", hp.hp + 9999, hp.hp);
    recomputeStats(world, id);
    const adAfter = world.stats.get(id)!.final[Stat.AttackDamage] ?? 0;
    const hpAfter = world.stats.get(id)!.final[Stat.MaxHealth] ?? 0;

    expect(
      adAfter,
      `⛔⛔ 燒了一層試煉而 **AD 一點都沒變**（${adBefore} → ${adAfter}）\n` +
        `⇒ ⭐ 這正是 owner 說的「復活了沒有加攻擊力」——\n` +
        `   來源掛上去了、\`spent\` 也累加了，⛔ 而它**沒有進到最終數字**（失敗形態②）。`,
    ).toBeGreaterThan(adBefore);
    expect(
      hpAfter,
      `⛔⛔ 燒了一層試煉而 **最大生命一點都沒變**（${hpBefore} → ${hpAfter}）`,
    ).toBeGreaterThan(hpBefore);
  });

  it("★ ④ ⭐ **血條上的最大生命**真的變大 —— ⛔ 這是玩家唯一看得到的那個數字", () => {
    const world = new SimWorld(SKELETON_ARENA, 20260901);
    const id = spawnBerserker(world);
    world.step(new Map());
    const maxBefore = world.health.get(id)!.maxHp;

    const hp = world.health.get(id)!;
    lethalSaveFor(world, id, "physical", hp.hp + 9999, hp.hp);
    world.step(new Map());
    const maxAfter = world.health.get(id)!.maxHp;

    expect(
      maxAfter,
      `⛔⛔ 燒了一層試煉，屬性管線算出了新的最大生命，⛔ 而**血條上的 maxHp 沒有動**` +
        `（${maxBefore} → ${maxAfter}）\n` +
        `⇒ ⭐ 這是**失敗形態②**（算出來了但從沒送到）的最後一段：\n` +
        `   \`StatsComp.final\` 變了，而 \`HealthComp.maxHp\` 是另一份 —— 玩家看的是後者。`,
    ).toBeGreaterThan(maxBefore);
  });
});
