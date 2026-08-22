/**
 * #549【理想鄉反彈成功 → 七彩閃電爆炸 + 畫面閃爍與震動】的**行為**守衛。
 *
 * owner 2026-08-22（逐字）：「**理想鄉被反彈的敵方單位 身上要有明顯的七彩閃電爆炸
 * 畫面閃爍及震動 不然都不知道發生什麼事情有沒有反擊成功**」。
 *
 * ⭐ 它讀的是**出貨的那一份** `content/abilities/godie-e002.ex.json`
 * （失敗形態⑤：被測的不是出貨的那個）—— 夾具自己手寫一份 hook 的話，把出貨
 * JSON 裡的四個回饋節點整批刪掉它照樣是綠的，而那正是這條守衛要擋的事。
 *
 * ⛔ 顏色 / peakAlpha / amplitude / durationSec **一格都沒有進斷言**
 *（第二守則：驗機制不驗數字）—— 那些是後台與技能編輯器每週在調的東西。
 * 這裡只問三件事：爆炸有沒有長在**被反彈者**身上、閃爍**兩邊**收不收得到、
 * 震動有沒有真的發出去。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— 出貨 JSON 的 `spawnVfx.at: "target"` 改成 `"self"`
 *    （＝七彩爆炸長在施法者身上，而 owner 要的是**被反彈的敵方單位身上**；
 *      畫面上兩者都「有一團特效」，看起來完全正常）
 *      → 紅：「七彩閃電爆炸沒有長在被反彈者身上」
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

const EX_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/abilities/godie-e002.ex.json",
);

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

/** 出貨文件的 `onReflectSuccess` 那一條 hook 的 effects（⛔ 不是夾具手寫的）。 */
function shippedReflectEffects(): EffectDef[] {
  const doc = JSON.parse(readFileSync(EX_PATH, "utf8")) as {
    passive: { ranks: { hooks: { on: string; effects: EffectDef[] }[] }[] };
  };
  const hook = doc.passive.ranks[0]!.hooks.find((h) => h.on === "onReflectSuccess");
  expect(hook, "出貨文件裡沒有 onReflectSuccess —— 這支技能整條反擊鏈都不存在了").toBeDefined();
  return hook!.effects;
}

describe("#549 理想鄉反彈成功的視覺回饋", () => {
  it("反彈成功 → 爆炸長在**被反彈者**身上、閃爍**兩邊**都收得到、震動真的發出去", () => {
    cover("avalon-reflect-success-feedback");
    const world = new SimWorld(SKELETON_ARENA, 54900);
    world.combatActive = true;
    world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
    world.combatFeel = {
      ...world.combatFeel,
      autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false },
    };
    const caster = spawnChampion(world, {
      championId: SELA.id as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0,
    });
    // ⚠️ 站遠，否則施法者與被反彈者的座標分不開 —— 而「長在誰身上」正是這條要驗的。
    const victim = spawnChampion(world, {
      championId: SELA.id as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
      pos: { x: C.x + 12, z: C.z }, zone: 0,
    });
    world.step(new Map());

    const ctx: EffectContext = {
      world, caster, rank: 1, targets: [victim],
      origin: "ability:godie-e002.ex", rng: world.rng,
    };
    runEffects(shippedReflectEffects(), ctx);

    // ⚠️ `world.events` 在下一次 step() 的第一行就被清掉 —— 立刻讀。
    const vfx = world.events.filter((e) => e.type === "vfxSpawn");
    const flashes = world.events.filter((e) => e.type === "screenFlash");
    const shakes = world.events.filter((e) => e.type === "screenShake");

    const vpos = world.transform.get(victim)!.pos;
    const cpos = world.transform.get(caster)!.pos;
    // ⭐ 承重：爆炸的落點是**被反彈者**，⛔ 不是施法者（owner：「被反彈的敵方單位 身上」）。
    expect(
      vfx.some((e) => e.data["x"] === vpos.x && e.data["z"] === vpos.z),
      "七彩閃電爆炸沒有長在被反彈者身上",
    ).toBe(true);
    expect(
      vfx.every((e) => e.data["x"] !== cpos.x || e.data["z"] !== cpos.z),
      "爆炸落在施法者身上 —— 反擊成功的人看到的是自己在爆炸",
    ).toBe(true);

    // ⭐ 承重：**兩邊都要看到**（施法者知道自己反擊成功、被反彈者知道自己被打了）。
    const recipients = flashes.flatMap((e) => [...(e.data["subjects"] as EntityId[])]);
    expect(recipients, "施法者的畫面沒有閃 —— 他不知道自己反擊成功了").toContain(caster);
    expect(recipients, "被反彈者的畫面沒有閃 —— 他不知道自己被反彈打中了").toContain(victim);

    // ⭐ 承重：震動真的過線（JASS 的 CameraSetEQNoiseForPlayer 是發給周圍所有人的）。
    expect(shakes.length, "反擊成功沒有畫面震動").toBeGreaterThan(0);
    expect(shakes.some((e) => e.data["broadcast"] === true), "震動沒有發給全場").toBe(true);
  });
});
