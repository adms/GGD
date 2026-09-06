/**
 * ⭐ GH#1090 —— 79 黑崎一護「(卍解 [變身] 狀態下傷害額外追加 {{ap3}}% [AP])」的
 * **端到端**承重守衛：卍解中打一發、不在卍解打一發，加成有／無。
 *
 * ── 這張票改了什麼 ────────────────────────────────────────────────────────
 * 三處讀端（`godie-h01n.w` 的 hook、`godie-h01n.e` 的 onHitTargets、以及變身對子
 * 另一半 `godie-h01o.w`）從 `{kind:"status", subject:"self", statusId:"bankai"}`
 * 換成 GH#1070 的形態葉 `{kind:"form", subject:"self", form:"alternate"}`。
 *
 * ⚠️ 舊寫法問的是「我身上有沒有一顆叫 bankai 的狀態」，而那顆狀態的秒數
 * （79-04 的 `applyBuff.duration` 8.0）與**變身秒數**（同一支的
 * `championForm.durationSec` 8.0）是**兩個住處記同一件事** —— 今天兩邊都是 8
 * 所以看不出來，⛔ 而只要有人動其中一個，「我在卍解嗎」就會有兩個答案，
 * **且沒有任何東西會紅**（第〇·四守則；#1070／#1082 的第三個實例）。
 *
 * ── 這一支驗的是**接線**，⛔ 不是那顆葉子 ───────────────────────────────
 * 葉子本身（求值器兩個方向、變回本體同一 tick）由 `conditionForm.test.ts`（#1070）
 * 守著。⛔ 這裡不重寫它 —— 這裡問的是「**出貨的 79 這一格真的掛在形態上**」：
 * 走出貨內容 → 出貨的 `castAbility` → 出貨的 `applyChampionForm` / `revertToBaseForm`。
 *
 * ⛔ 沒有任何出貨數值住在這裡：AP、係數、8 秒一個都沒有進斷言，
 * 每一條都是**同一具身體的兩發相減**（第二守則：驗機制不驗數字）。
 *
 * ── 突變紀錄（承重的一條線，真的跑過）──────────────────────────────────────
 *  · `content/abilities/godie-h01o.w.json` 的那顆條件 `form: "alternate"` → `"base"`
 *    （＝閘掛在錯的形態上）→ ①「卍解中那一發沒有比較大」**紅**。
 *
 * ⚠️⚠️ **`godie-h01n.*` 是 `skillremake:json` 的產物** —— 這張票改的是它的來源
 * `tools/skill-remake/heroes/godie-h01n.py`。本體那一半的 JSON 要等
 * `pnpm skills:sync` 才會跟上；⭐ **這一支在同步前後都綠**，因為兩種寫法在出貨值下
 * 等價（`bankai` 也帶 `form` tag）—— 它守的是**行為**，⛔ 不是那一行的字面。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { shippedContentSource } from "../../content/__fixtures__/shippedContent";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { championFormIndex, revertToBaseForm } from "../systems/ChampionFormSystem";
import { attachSource } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
/** 79 黑崎一護的**本體**（R 是 79-04 卍解 → 變身成 `godie-h01o`）。 */
const ICHIGO = "godie-h01n" as ChampionId;
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

function stage(): { world: SimWorld; hero: EntityId; enemy: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1090);
  world.combatActive = true;
  const mk = (dx: number, seat: number): EntityId =>
    spawnChampion(world, {
      championId: ICHIGO,
      seatId: asSeatId(seat),
      teamId: asTeamId(seat),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const hero = mk(0, 0);
  const enemy = mk(1.5, 1);
  const ab = world.abilities.get(hero)!;
  ab.slots.W.rank = 1;
  ab.slots.R.rank = 1;
  attachSource(world, hero, {
    id: "test:ap",
    kind: "buff",
    modifiers: [
      { stat: Stat.AbilityPower, op: ModOp.Flat, value: 100 },
      { stat: Stat.MaxMana, op: ModOp.Flat, value: 2000 },
    ],
  });
  world.step(new Map());
  return { world, hero, enemy };
}

/** 按一格並把世界推到 `done`（吟唱長度由出貨值決定，上限由 `dt` 推導）。 */
function castUntil(
  world: SimWorld,
  hero: EntityId,
  slot: "W" | "R",
  target: Parameters<typeof castAbility>[3],
  done: () => boolean,
): void {
  const ab = world.abilities.get(hero)!;
  ab.slots[slot].cooldownRemainingTicks = 0;
  const h = world.health.get(hero)!;
  h.mana = h.maxMana;
  expect(castAbility(world, hero, slot, target), `${slot} 按不下去`).toBe("ok");
  for (let i = 0; i < Math.round(4 / world.dt); i++) {
    world.step(new Map());
    if (done()) return;
  }
  throw new Error(`${slot} 在 4 秒內沒有落地`);
}

/** 放一發 W，回傳**這一發整串**打在 enemy 身上的傷害總量（含 hook 的追加）。 */
function castW(world: SimWorld, hero: EntityId, enemy: EntityId): number {
  const eh = world.health.get(enemy)!;
  eh.hp = eh.maxHp;
  const seen = new Set<unknown>();
  let total = 0;
  const collect = (): boolean => {
    for (const e of world.events) {
      if (e.type !== "damage" || e.data["target"] !== enemy) continue;
      if (seen.has(e)) continue;
      seen.add(e);
      total += e.data["amount"] as number;
    }
    return total > 0;
  };
  castUntil(world, hero, "W", { type: "entity", entityId: enemy }, collect);
  // 追加那一發是 hook（`onAbilityHit`），它跟在本體之後 —— 多推幾個 tick 收完。
  for (let i = 0; i < 4; i++) {
    world.step(new Map());
    collect();
  }
  return total;
}

describe("GH#1090 79 一護：卍解增幅掛在**形態**上（⛔ 不是 status:bankai）", () => {
  it("bankai-bonus-is-gated-on-the-form", () => {
    const { world, hero, enemy } = stage();

    // ① 本體（沒卍解）：只有 W 本體那一發。
    const base = castW(world, hero, enemy);
    expect(base, "本體那一發完全沒打到人 —— 夾具沒站好").toBeGreaterThan(0);

    // ② 放 R 進卍解（出貨的 `championForm` effect → `applyChampionForm`）。
    castUntil(world, hero, "R", { type: "self" }, () => championFormIndex(world, hero) === 1);
    const bankai = castW(world, hero, enemy);

    // ③ 卍解整個結束（形態 **與** 那顆具名狀態都到期）之後，增幅要消失。
    //
    // ⚠️⚠️ ⭐ 2026-09-07 量到的一件**沒有寫在任何一張票上**的事：這裡刻意
    //   **不是**「`revertToBaseForm` 之後當場消失」——因為 `bankai.json` 的 `tags`
    //   自己帶著 `form`，而 `sim/formGate.ts::inAlternateForm` 是 **OR**
    //   （換了身體算，**或者**身上帶著一份標成 `form` 的狀態也算）。
    //   ⇒ 強制退回本體但那顆增益還在時，`form` 葉仍然是 true（實測：兩發同值）。
    //   ⭐ 那是出貨的設計（M2/GH 的「形態閘改讀狀態」，`formGateReadsStatus.test.ts`
    //   逐字拿 `bankai.json` 當出貨範例），⛔ 不是這一票造成的 —— 所以這裡量的是
    //   **兩個來源都退場**之後，而 `revertToBaseForm` 只被用來確定身體那一半退了。
    revertToBaseForm(world, hero);
    for (let i = 0; i < Math.round(10 / world.dt); i++) world.step(new Map());
    const after = castW(world, hero, enemy);

    expect(
      bankai,
      "卍解中那一發沒有比本體大 —— 「(卍解狀態下傷害額外追加)」那一句沒有落點（GH#1090）",
    ).toBeGreaterThan(base);
    expect(
      after,
      "卍解退場之後仍吃到增幅 —— 那個閘沒有跟著形態走（它會一直開著）",
    ).toBeLessThan(bankai);
  });
});
