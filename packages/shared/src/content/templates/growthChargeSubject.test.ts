/**
 * ⭐ GH#1048 —— 成長蓄能的擊殺計數與屬性增益要落在**擊殺者**身上，⛔ 不是受害者。
 *
 * ── 量到的（2026-09-06，主線 14098b7c）────────────────────────────────────
 * `tpl-growth-charge.attr.origin` 逐字：j:14225 `ModifyHeroStat( bj_HEROSTAT_AGI,
 * **GetKillingUnitBJ()**, … )`。⛔ 而展開的 `onKill` hook 沒填 `target: "self"`，
 * `DeathSystem.ts:111` 是 `fireHooks(world, killer, "onKill", 受害者)`，
 * `hooks.ts:516` 對「未指定 self 且有事件目標」解成 `[受害者]` ⇒
 * `grantAttribute` 逐一讀 `ctx.targets` ⇒ 計數器與 +1 全落在**被殺的人**身上。
 * 八個不同受害者各一次：擊殺者 +0、每個受害者各有進度 1（票裡的實測）。
 *
 * ── 這條守衛跑的是什麼 ─────────────────────────────────────────────────────
 * 出貨模板 → `expand()` → **展開結果裡的那條 hook** → `attachSource` 掛上擊殺者 →
 * ① 真的 `fireHooks(world, killer, "onKill", victim)`（與 DeathSystem 同一個入口的
 *    同一個參數順序）跨 8 個不同受害者；② 真的死亡：damageQueue 打死一名敵方英雄，
 *    讓 `DeathSystem` 自己去 fire。兩條路都問同一題：**誰的 agi 動了**。
 *
 * MUTATION（落地前真的跑過）：expand.ts 的 hook 拿掉 `target: "self"`
 * → 🔴（擊殺者 +0、受害者 +1）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { defaultParamsFor } from "./paramsSchema";
import { expand } from "./expand";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "../../sim/content/skeleton";
import { spawnChampion } from "../../sim/spawnChampion";
import { attachSource } from "../../sim/stats/statPipeline";
import { fireHooks } from "../../sim/effects/hooks";
import { asSeatId, asTeamId, type EntityId } from "../../ids";

const TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates/tpl-growth-charge.json",
);
const loadTemplate = (): TemplateDoc =>
  zTemplateDoc.parse(JSON.parse(readFileSync(TEMPLATE, "utf8")));

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function stage(victims: number): { world: SimWorld; killer: EntityId; victims: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 3);
  world.combatActive = true;
  const killer = spawnChampion(world, {
    championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  const vs: EntityId[] = [];
  for (let i = 0; i < victims; i++) {
    vs.push(
      spawnChampion(world, {
        championId: THORNE.id, seatId: asSeatId(1 + i), teamId: asTeamId(1),
        pos: { x: C.x + 1 + i * 0.5, z: C.z }, zone: 0,
      }),
    );
  }
  return { world, killer, victims: vs };
}

const agi = (w: SimWorld, id: EntityId): number => w.champion.get(id)!.attrBonus.agi;

/** 展開出貨模板（可覆寫參數），把那條 hook 掛上擊殺者。 */
function arm(world: SimWorld, killer: EntityId, over: Record<string, unknown> = {}): void {
  const t = loadTemplate();
  const ex = expand(t, { ...defaultParamsFor(t), ...over });
  const hook = ex.passive?.ranks[0]?.hooks?.[0];
  expect(hook, "growth-charge 展開後必須有一條 onKill hook").toBeTruthy();
  attachSource(world, killer, { id: "growth-charge-probe", kind: "item", hooks: [hook!] });
}

describe("tpl-growth-charge —— 收益與計數器都歸擊殺者（GH#1048）", () => {
  it("★ 預設 everyNth=8：八個不同受害者，第七殺沒有增量、第八殺只加擊殺者", () => {
    const s = stage(8);
    arm(s.world, s.killer);
    const before = agi(s.world, s.killer);
    for (let i = 0; i < 7; i++) fireHooks(s.world, s.killer, "onKill", s.victims[i]!);
    expect(agi(s.world, s.killer) - before, "第七殺不可以有增量").toBe(0);
    fireHooks(s.world, s.killer, "onKill", s.victims[7]!);
    // ⭐ 方向，⛔ 不是數字：加多少是 `amount` 那一格（owner 的旋鈕）。
    expect(agi(s.world, s.killer) - before, "第八殺要加在擊殺者身上").toBeGreaterThan(0);
    for (const v of s.victims) {
      const c = s.world.champion.get(v)!;
      expect(c.attrBonus.agi, "受害者不可以拿到增益").toBe(0);
      expect(c.attrGrantProgress ?? {}, "受害者身上不可以有計數器").toEqual({});
    }
    // 計數器住在擊殺者身上，而且第八殺之後歸零（grantAttribute 的 modulo 語意）。
    const progress = Object.values(s.world.champion.get(s.killer)!.attrGrantProgress ?? {});
    expect(progress.length, "擊殺者身上要有這條 hook 的計數器").toBeGreaterThan(0);
    expect(progress.every((n) => n === 0), "第八殺之後計數器歸零").toBe(true);
  });

  it("★ 真的死亡入口（DeathSystem → fireHooks）：everyNth=1，打死一名敵方英雄，擊殺者 +agi", () => {
    const s = stage(1);
    arm(s.world, s.killer, { everyNth: 1 });
    const victim = s.victims[0]!;
    const before = agi(s.world, s.killer);
    s.world.damageQueue.push({
      source: s.killer, target: victim, amount: s.world.health.get(victim)!.maxHp * 10,
      type: "true", crit: false, origin: "test:growth-charge",
    });
    s.world.step(new Map());
    expect(agi(s.world, s.killer) - before, "擊殺者要拿到增益").toBeGreaterThan(0);
    expect(agi(s.world, victim), "死掉的受害者不可以拿到增益").toBe(0);
  });
});
