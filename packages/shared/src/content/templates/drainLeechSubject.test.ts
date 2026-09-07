/**
 * ⭐ GH#1046 —— 汲取模板的回血**受詞**：回施法者，⛔ 不是回被點的敵人。
 *
 * ── 量到的（2026-09-06，主線 4793eaaaf）────────────────────────────────────
 * `tpl-drain-leech.leechFlat.origin` 逐字：j:26608 `SetUnitLifeBJ( udg_Frog_Hero, … + 50 )`
 * —— 回的是**施法者**。⛔ 而展開器輸出的 `heal` 節點**沒有 `applyTo`**，
 * `sim/effects/heal.ts:21` 的省略語意是 `ctx.targets` ⇒ 回的是**被點選的敵人**。
 * 兩名都缺血時：施法者 421→421、敵人 421→471（票裡的實測）。
 *
 * ── 這條守衛跑的是什麼 ─────────────────────────────────────────────────────
 * 出貨模板 → `expand()` → **展開結果裡的那個 heal 節點** → 出貨 Zod union →
 * 真的 `runEffects` → 真的 `SimWorld` 上兩具真的身體的 hp。
 * ⛔ 不是 effects deep-equal（那對「有沒有 applyTo」是瞎的 —— 票文逐字）。
 *
 * ⚠️ 只跑 heal 節點而不是整串：`damage`／`dot` 走**級距**（`damageTier`）在載入時
 * 解析，這裡沒有那一步；而受詞錯的是 heal 這一個節點，其餘兩個的受詞（敵人）本來就對。
 *
 * MUTATION（落地前真的跑過）：expand.ts 的 heal 節點拿掉 `applyTo: "self"`
 * → 🔴（施法者 +0、敵人 +N）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { zEffectDefUnion } from "../schema/effect";
import type { EffectDef } from "../../sim/effects/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand } from "./expand";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "../../sim/content/skeleton";
import { spawnChampion } from "../../sim/spawnChampion";
import { runEffects } from "../../sim/effects/effectRunner";
import { asSeatId, asTeamId, type EntityId } from "../../ids";

const TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates/tpl-drain-leech.json",
);
const loadTemplate = (): TemplateDoc =>
  zTemplateDoc.parse(JSON.parse(readFileSync(TEMPLATE, "utf8")));

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** 兩具都先扣掉這麼多血 —— 「回誰」要在**兩邊都有空間**時才讀得出來。 */
const MISSING_HP = 300;

function stage(): { world: SimWorld; caster: EntityId; enemy: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const caster = spawnChampion(world, {
    championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  const enemy = spawnChampion(world, {
    championId: THORNE.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: C.x + 1, z: C.z }, zone: 0,
  });
  for (const id of [caster, enemy]) {
    const h = world.health.get(id)!;
    h.hp = h.maxHp - MISSING_HP;
  }
  return { world, caster, enemy };
}
const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

describe("tpl-drain-leech —— 回血的受詞是施法者（GH#1046）", () => {
  it("★ 展開出來的 heal 節點跑在真 sim 上：施法者回血、被點的敵人一滴都沒有", () => {
    const t = loadTemplate();
    const ex = expand(t, defaultParamsFor(t));
    const healNode = ex.effects.find((e) => e.kind === "heal");
    expect(healNode, "drain-leech 展開後必須有一個 heal 節點").toBeTruthy();
    // 出貨的 Zod union 先過一次 —— 一個遊戲載不進去的節點不可以讓這條綠。
    const heal = zEffectDefUnion.parse(healNode) as EffectDef;

    const s = stage();
    const casterBefore = hp(s.world, s.caster);
    const enemyBefore = hp(s.world, s.enemy);
    runEffects([heal], {
      world: s.world, caster: s.caster, rank: 1, targets: [s.enemy],
      origin: "ability:tpl-drain-leech-probe", rng: s.world.rng,
    });
    // ⭐ 方向，⛔ 不是數字：回多少由 leechFlat × combatEnv.healing 決定（owner 的旋鈕）。
    expect(hp(s.world, s.caster), "施法者要被回血").toBeGreaterThan(casterBefore);
    expect(hp(s.world, s.enemy), "被點的敵人不可以被這個 heal 補血").toBe(enemyBefore);
  });
});
