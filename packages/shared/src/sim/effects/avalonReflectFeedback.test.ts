/**
 * #549【理想鄉反彈成功 → 七彩閃電爆炸 + 畫面閃爍與震動】的**行為**守衛。
 *
 * owner 2026-08-22（逐字）：「**理想鄉被反彈的敵方單位 身上要有明顯的七彩閃電爆炸
 * 畫面閃爍及震動 不然都不知道發生什麼事情有沒有反擊成功**」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 回饋掛在**反彈**身上，⛔ 不是掛在反彈之後那一支追打技能身上
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-23 之前四個回饋節點全部住在 `godie-e002.**ex**`（20-002 解放.約束勝利劍MAX）——
 * 而**反彈是 R（20-04 永恆的理想鄉）做的**，EX 只是「反彈成功時」的追打。
 * ⇒ **EX 沒解鎖的那一整場**，反彈成功與失敗在畫面上仍然一模一樣，
 *   也就是 owner 抱怨的那句話**逐字還在**（失敗形態②的一個變體：
 *   做了、測過、出貨，而玩家在解鎖之前拿不到）。
 *
 * ⭐ 所以這條守衛**刻意一個 EX 都不註冊**：它跑的是「只點了 R」的那一場。
 * ⛔ 夾具也不手寫 hook —— 它 `runEffects()` 跑**出貨的** `godie-e002.r.json`
 *   的 `effects`（失敗形態⑤：被測的不是出貨的那個），然後打一發真的魔法傷害、
 *   走真的 `combatResolveSystem` + `reflectHookSystem`，讀真的事件流。
 *
 * ⛔ 顏色 / peakAlpha / amplitude / durationSec **一格都沒有進斷言**
 *（第二守則：驗機制不驗數字）—— 那些是後台與技能編輯器每週在調的東西。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— 出貨 `godie-e002.r.json` 的 Avalon buff 上那條
 *    `onReflectSuccess` hook 整條拿掉（＝回到 2026-08-23 之前「回饋只住 EX」
 *     的形狀；反彈**照樣會反彈**、傷害數字一格不差，畫面上只是沒有東西發生）
 *      → 紅：「反彈成功了，而畫面上什麼都沒有發生」
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
import { combatResolveSystem } from "../combat/damage";
import { reflectHookSystem } from "../systems/ReflectHookSystem";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { DEFAULT_AUTO_ENGAGE } from "../combatFeel";

const R_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/abilities/godie-e002.r.json",
);

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

/** 出貨的 20-04 永恆的理想鄉的 `effects`（⛔ 不是夾具手寫的 buff）。 */
function shippedAvalonEffects(): EffectDef[] {
  const doc = JSON.parse(readFileSync(R_PATH, "utf8")) as { effects: EffectDef[] };
  return doc.effects;
}

describe("#549 理想鄉反彈成功的視覺回饋", () => {
  it("★ 只點 R（⛔ 沒有 EX）反彈成功 → 爆炸長在**被反彈者**身上、兩邊都閃、全場震", () => {
    cover("avalon-reflect-success-feedback");
    const world = new SimWorld(SKELETON_ARENA, 54900);
    world.combatActive = true;
    world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
    world.combatFeel = {
      ...world.combatFeel,
      autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false },
    };
    const avalon = spawnChampion(world, {
      championId: SELA.id as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0,
    });
    // ⚠️ 站遠，否則反彈者與被反彈者的座標分不開 —— 而「長在誰身上」正是這條要驗的。
    const attacker = spawnChampion(world, {
      championId: SELA.id as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
      pos: { x: C.x + 12, z: C.z }, zone: 0,
    });
    world.step(new Map());

    // ① 施放 20-04 永恆的理想鄉（出貨 JSON，自身 buff）。
    const ctx: EffectContext = {
      world, caster: avalon, rank: 1, targets: [avalon],
      origin: "ability:godie-e002.r", rng: world.rng,
    };
    runEffects(shippedAvalonEffects(), ctx);

    // ② 敵人打一發**魔法**傷害（hook 的 damageType 過濾）→ 反彈封包落地。
    const attackerHpBefore = world.health.get(attacker)!.hp;
    world.damageQueue.push({
      source: attacker, target: avalon, amount: 200,
      type: "magic", crit: false, origin: "ability:enemy",
    });
    combatResolveSystem(world);
    // ⭐ 對照組:反彈**真的成功了**。⛔ 少了這一條,下面每一條都可能是在驗
    //    「一個從來沒有觸發過的 hook 安靜地什麼都沒做」。
    expect(
      attackerHpBefore - world.health.get(attacker)!.hp,
      "反彈根本沒有打到攻擊者 —— 下面驗的回饋是空的",
    ).toBeGreaterThan(0);

    // ③ `onReflectSuccess` 的派發（出貨在 `world.step()` 的 8b）。
    reflectHookSystem(world);

    const vfx = world.events.filter((e) => e.type === "vfxSpawn");
    const flashes = world.events.filter((e) => e.type === "screenFlash");
    const shakes = world.events.filter((e) => e.type === "screenShake");
    expect(
      vfx.length + flashes.length + shakes.length,
      "反彈成功了，而畫面上什麼都沒有發生",
    ).toBeGreaterThan(0);

    const apos = world.transform.get(attacker)!.pos;
    const rpos = world.transform.get(avalon)!.pos;
    // ⭐ 承重：爆炸的落點是**被反彈者**，⛔ 不是反彈的人（owner:「被反彈的敵方單位 身上」）。
    expect(
      vfx.some((e) => e.data["x"] === apos.x && e.data["z"] === apos.z),
      "七彩閃電爆炸沒有長在被反彈者身上",
    ).toBe(true);
    expect(
      vfx.every((e) => e.data["x"] !== rpos.x || e.data["z"] !== rpos.z),
      "爆炸落在反彈者身上 —— 反擊成功的人看到的是自己在爆炸",
    ).toBe(true);

    // ⭐ 承重：**兩邊都要看到**（反彈的人知道自己反擊成功、被反彈者知道自己被打了）。
    const recipients = flashes.flatMap((e) => [...(e.data["subjects"] as EntityId[])]);
    expect(recipients, "反彈的人畫面沒有閃 —— 他不知道自己反擊成功了").toContain(avalon);
    expect(recipients, "被反彈者畫面沒有閃 —— 他不知道自己被反彈打中了").toContain(attacker);

    // ⭐ 承重：震動真的過線（JASS 的 CameraSetEQNoiseForPlayer 是發給周圍所有人的）。
    expect(shakes.some((e) => e.data["broadcast"] === true), "反擊成功沒有全場震動").toBe(true);
  });
});
