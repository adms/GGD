/**
 * 仙豆 `senzu-bean` 與 歐爾麥特的頭髮 `all-might-hair` —— 兩件 EX 寶具的
 * **方向**守衛（2026-08-18 的結構修正，第一·五守則）。
 *
 * 這兩張卡在修之前都不是「效果弱一點」，是**指錯人**：
 *   · 仙豆：`onAllyDamaged` 的 `target:"event"` 指到的是**攻擊者**
 *     （`WorldHookSystem.ts` 那一列是 `actorKey:"target" / targetKey:"source"`），
 *     所以敵人打殘你的隊友、自己掉到 15%以下時，仙豆替**敵人**補滿血魔。
 *   · 頭髮：`revive` 沒有目標選擇器，只走 `ctx.targets`；掛在 `target:"event"`
 *     的 hook 上時候選人是剛被打中的敵人，而 `side:"ally"` 閘再把他剔掉
 *     ⇒ `revived` 永遠是 0。
 *
 * ⭐ 讀的是**出貨的那份 JSON**（`content/items/*.json`）並走出貨的授予路徑
 * `grantItemFree` —— 自己手寫一份 `passive:[…]` 夾具就是失敗形態⑤：把 hook
 * 改回錯的方向它照樣綠。
 *
 * ⛔ 這裡**不驗數字**（回多少血、幾秒冷卻）—— 那些是後台會調的平衡值
 * （第二守則「驗機制不驗數字」）。驗的只有一件事：**誰被作用到**。
 *
 * 突變紀錄：
 *   · `senzu-bean.json` 的 `senzu-ally.target` 改回 `"event"` → ① 紅（隊友沒被救、
 *     攻擊者被補滿）；改回 `"allies"`。
 *   · `all-might-hair.json` 把 `ofa-return` 整條 hook 刪掉 → ② 紅（屍體沒站起來）；
 *     還原。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../../content/store";
import { registerAll } from "../../content/registries";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { grantItemFree } from "../economy/shop";
import { worldHookSystem } from "../systems/WorldHookSystem";
import { fireHooks } from "./hooks";
// ⭐ 讀狀態用**引擎自己那支**（`condition.ts` 的 statusId 葉子呼叫的同一支）——
// 自己寫一份「掃 world.status」會漏掉 `applyBuff` 寫在 ModifierSource 上的那本帳。
import { hasStatus } from "./effectCommon";
import { asSeatId, asTeamId, type AbilityId, type EntityId, type ItemId, type StatusId } from "../../ids";
import { Stat, zeroStats } from "../stats/statTypes";
import { zeroAttrBonus } from "../stats/attributes";
import type { AbilitiesComp } from "../stats/statsComp";
import * as V from "../math/vec2";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const SENZU = "senzu-bean" as ItemId;
const HAIR = "all-might-hair" as ItemId;
const Z0 = SKELETON_ARENA.zones[0]!;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["items", "status-effects", "projectiles"] as const) {
    for (const f of readdirSync(join(CONTENT_DIR, c)).filter(
      (n) => n.endsWith(".json") && !n.startsWith("_"),
    )) {
      const doc = JSON.parse(readFileSync(join(CONTENT_DIR, c, f), "utf8")) as { id: string };
      store.add(c, doc.id, doc);
    }
  }
  registerAll(store); // ⭐ 嚴格 Zod —— 兩份文件的形狀在這裡就被驗過
  registerSkeletonContent();
});

let seat = 0;
function fighter(world: SimWorld, team: number, dx: number, hpPct = 1): EntityId {
  const id = world.spawn();
  const maxHp = 1000;
  world.transform.set(id, {
    pos: { x: Z0.center.x + dx, z: Z0.center.z },
    vel: V.v2(),
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, {
    hp: maxHp * hpPct,
    maxHp,
    mana: 10,
    maxMana: 100,
    alive: hpPct > 0,
    shields: [],
  });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat++) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 1e-9;
  final[Stat.AttackDamage] = 10;
  world.stats.set(id, { championId: THORNE.id, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.champion.set(id, {
    championId: THORNE.id,
    level: 1,
    xp: 0,
    gold: 0,
    items: [null, null, null, null, null, null],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

function combatWorld(): SimWorld {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  return world;
}

describe("EX 寶具的方向修正（出貨 JSON + 出貨授予路徑）", () => {
  it("① 仙豆救的是**受傷的隊友**，⛔ 不是打他的那個人", () => {
    const world = combatWorld();
    const holder = fighter(world, 1, -2);
    const ally = fighter(world, 1, 0, 0.1); // 剩 10%
    const foe = fighter(world, 2, 4);
    expect(grantItemFree(world, holder, SENZU)).toBeGreaterThanOrEqual(0);

    // `combat/damage.ts` 的 `world.emit("damage", { source, target, … })` ——
    // 這兩格就是 `WorldHookSystem` 那一列讀的 `actorKey`/`targetKey`。
    world.emit("damage", { source: foe, target: ally, amount: 1, type: "physical" });
    worldHookSystem(world);

    const wounded = world.health.get(ally)!;
    const attacker = world.health.get(foe)!;
    expect(wounded.hp).toBe(wounded.maxHp); // 隊友被救起來
    expect(hasStatus(world, ally, "senzu-spent" as StatusId)).toBe(true); // 額度記在受益者頭上
    expect(attacker.hp).toBe(attacker.maxHp * 1); // 攻擊者原本就滿血 —— 沒被「補」
    expect(hasStatus(world, foe, "senzu-spent" as StatusId)).toBe(false); // ⛔ 敵人不是受益者
  });

  it("② 頭髮的復活落在**陣亡隊友**身上（一次都不會發生 → 真的站起來）", () => {
    const world = combatWorld();
    const holder = fighter(world, 1, -2);
    const corpse = fighter(world, 1, 0, 0); // 已經倒了
    const foe = fighter(world, 2, 4);
    expect(grantItemFree(world, holder, HAIR)).toBeGreaterThanOrEqual(0);

    // 隊友陣亡 → 武裝那份增益（`DeathSystem` 的 `emit("death", { id, killer })`）
    world.emit("death", { id: corpse, killer: foe });
    worldHookSystem(world);
    expect(hasStatus(world, holder, "united-states-of-smash" as StatusId)).toBe(true);

    // 20 秒內拿到一顆英雄人頭（`DeathSystem` 的 `fireHooks(world, killer, "onKill", id)`）
    fireHooks(world, holder, "onKill", foe);

    const back = world.health.get(corpse)!;
    expect(back.alive).toBe(true);
    expect(back.hp).toBeGreaterThan(0);
    // ⛔ 被殺的敵人沒有跟著站起來（`side:"ally"` 那道閘還在）
    expect(world.health.get(foe)!.alive).toBe(true);
  });
});
