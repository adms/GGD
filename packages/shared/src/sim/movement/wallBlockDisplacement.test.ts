/**
 * ⭐【位移的終點不可以在牆的另一邊】—— owner 2026-08-21：
 * 「我發現**有許多地圖的牆 瞬移過去** 例如**無限城**等」。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這一條要跑**出貨場地**，而不是一個手捏的夾具
 * ---------------------------------------------------------------------------
 * ⚠️ 失敗形態⑤（被測的不是出貨的那個）。這個 repo 每一支既有的 blink / leap 測試
 * 都跑 `SKELETON_ARENA` —— 一個寫死在程式裡、障礙物**全部是圓柱**的場地。
 * 而缺陷只出現在 GH#324 那七張 graybox 圖：它們的牆是 `kind: "box"` 的長條，
 * 而且**只有 2 單位厚**（`halfD: 1`）。牆另一側 1.6 單位外的那個點完全合法 ——
 * 不在任何障礙物裡、在邊界內、`relaxBody` 一格都不動它。
 * ⇒ 圓柱場地上這個缺陷**不可能被觀測到**，所以夾具一定要是出貨資料。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 斷言刻意**不**呼叫 `crossesWalls`（那是被測的那支）
 * ---------------------------------------------------------------------------
 * 斷言問的是一句幾何上獨立的話：**沿著牆的薄軸，落點與起點在同一側**
 * （偏移量同號，而且絕對值 ≥ 半厚）。實作壞掉時它會翻號，⛔ 而一個「拿實作
 * 自己去證明實作」的斷言對兩種實作都會過（失敗形態④）。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（真的做過，見 commit message）
 * ---------------------------------------------------------------------------
 *   · `movement/leap.ts` 的 `resolveDisplacementEnd(...)` 換回
 *     `{ pos: requested }`（＝ 2026-08-21 之前的那一行）→ 這一整份紅
 *   · GH#490：`policyFor(rules, mode, flightIgnoresObstacles(world, flyerId))`
 *     的第三個參數換成 `false`（＝這個閘不認得飛行）→ 飛行那一條紅
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { arenaDefFromDoc, type ObstacleBox, type ZoneDef } from "../world/ArenaDef";
import { spotIsClear } from "../map/bounds";
import { runEffects } from "../effects/effectRunner";
import { leapSystem } from "../systems/LeapSystem";
import { flightSystem, type FlightGrant } from "../flight";
import { zeroStats } from "../stats/statTypes";
import type { EffectDef } from "../effects/effect";
import type { Vec2 } from "../math/vec2";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
/** 英雄的碰撞半徑（`spawnChampion.ts`）。⛔ 不是出貨平衡值，是夾具尺寸。 */
const BODY = 0.6;

function shippedArenas(): { id: string; doc: Record<string, unknown> }[] {
  const dir = join(ROOT, "content/arenas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      id: f.replace(/\.json$/, ""),
      doc: JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>,
    }));
}

interface Probe {
  /** 牆的中心沿薄軸的座標，以及半厚。 */
  mid: number;
  half: number;
  axis: "x" | "z";
  from: Vec2;
  to: Vec2;
}

/** 這個分區裡第一道「兩側都站得下人」的牆。沒有 → null（那個分區跳過）。 */
function probeOf(zone: ZoneDef): Probe | null {
  for (const ob of zone.obstacles) {
    if (ob.kind !== "box") continue;
    const b = ob as ObstacleBox;
    const axis: "x" | "z" = b.halfW <= b.halfD ? "x" : "z";
    const half = axis === "x" ? b.halfW : b.halfD;
    const mid = axis === "x" ? b.center.x : b.center.z;
    const off = half + BODY + 1; // 牆外一個身體再加 1 的餘裕
    const at = (s: number): Vec2 =>
      axis === "x" ? { x: mid + s * off, z: b.center.z } : { x: b.center.x, z: mid + s * off };
    const from = at(-1);
    const to = at(1);
    if (spotIsClear(zone, from, BODY) && spotIsClear(zone, to, BODY)) {
      return { mid, half, axis, from, to };
    }
  }
  return null;
}

function place(world: SimWorld, at: Vec2): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: at.x, z: at.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: BODY,
    zone: 0,
  });
  world.health.set(id, { hp: 500, maxHp: 500, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(0), seatId: asSeatId(0) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  world.rebuildGrid();
  return id;
}

/** 沿薄軸的帶號偏移。同號 = 還在牆的同一側。 */
const side = (p: Vec2, pr: Probe): number => (pr.axis === "x" ? p.x : p.z) - pr.mid;

/** 出貨場地 × 兩種位移，跑真的 sim，回傳落點。 */
function land(doc: Record<string, unknown>, pr: Probe, effect: EffectDef): Vec2 {
  const world = new SimWorld(
    arenaDefFromDoc(doc as unknown as Parameters<typeof arenaDefFromDoc>[0]),
    9,
  );
  const hero = place(world, pr.from);
  runEffects([effect], {
    world,
    caster: hero,
    rank: 1,
    targets: [],
    point: { x: pr.to.x, z: pr.to.z },
    origin: "ability:test.wall-block",
    rng: world.rng,
  });
  // leap 是積分出來的 —— 走完整條弧（blink 沒有 override，這個迴圈是 no-op）。
  for (let i = 0; i < 90 && world.nav.get(hero)!.override !== null; i++) leapSystem(world);
  return world.transform.get(hero)!.pos;
}

describe("位移不可以穿牆 (wall-block)", () => {
  it("blink 與 leap 的終點都留在牆的**這一側** —— 每一張有牆的出貨場地", () => {
    cover("displacement-wall-block");
    const blink: EffectDef = { kind: "blink", shape: "single", to: "point" } as EffectDef;
    const leap: EffectDef = {
      kind: "leap",
      mode: "toPoint",
      apexHeight: 4,
      durationSec: 0.4,
    } as EffectDef;

    const tested: string[] = [];
    /** 穿過去的那些 —— ⛔ 逐條 expect 只會報第一張圖，這樣一次看得到全部。 */
    const crossed: string[] = [];
    for (const { id, doc } of shippedArenas()) {
      const arena = arenaDefFromDoc(doc as unknown as Parameters<typeof arenaDefFromDoc>[0]);
      const zone = arena.zones[0]!;
      const pr = probeOf(zone);
      if (pr === null) continue; // 圓柱場地沒有牆 —— 這個機制對它們是 no-op
      tested.push(id);
      // 起點在負側；⛔ 兩種位移都不可以讓它變成正側。
      expect(side(pr.from, pr)).toBeLessThan(0);
      for (const [what, eff] of [
        ["blink", blink],
        ["leap", leap],
      ] as const) {
        // ⭐ 承重：同號（還在原來那一側），而且身體整個在牆外。
        const s = side(land(doc, pr, eff), pr);
        if (!(s <= -pr.half)) crossed.push(`${id}/${what} → ${s.toFixed(2)}`);
      }
    }
    expect(crossed).toEqual([]);
    // ⛔ 一張都沒跑到 = 這條守衛在保護空氣。owner 點名的那張一定要在裡面。
    expect(tested).toContain("arena.infinity-castle");
    expect(tested.length).toBeGreaterThanOrEqual(5);
  });

  it("`wallBlock.enabled = false` 一鍵 rollback —— 位移又穿得過去了", () => {
    cover("displacement-wall-block");
    const doc = shippedArenas().find((a) => a.id === "arena.infinity-castle")!.doc;
    const arena = arenaDefFromDoc(doc as unknown as Parameters<typeof arenaDefFromDoc>[0]);
    const pr = probeOf(arena.zones[0]!)!;
    const world = new SimWorld(arena, 9);
    world.wallBlock = { ...world.wallBlock, enabled: false };
    const hero = place(world, pr.from);
    runEffects([{ kind: "blink", shape: "single", to: "point" } as EffectDef], {
      world,
      caster: hero,
      rank: 1,
      targets: [],
      point: { x: pr.to.x, z: pr.to.z },
      origin: "ability:test.wall-block",
      rng: world.rng,
    });
    // ⚠️ 這一條**不是**「舊行為也要測」（第〇·六守則：只測預設那一邊）——
    //    它測的是**開關真的接上了**。接不上的開關 = owner 回不了頭。
    expect(side(world.transform.get(hero)!.pos, pr)).toBeGreaterThan(0);
  });

  /**
   * ⭐ GH#490 —— owner 2026-08-21「**翔封界 等飛行效果實作**」。
   *
   * 兩個方向**在同一具身體上**問完，所以它不可能靠「所有人都放行」通過：
   *   ① 飛行中（出貨的 04-00 翔封界 那份授予）→ 跨得過牆
   *   ② 那份授予**到期**之後 → #487 的閘回來，⛔ 再也跨不過去
   *
   * ⚠️ 飛行**不是** `world.flight.set()` 手塞的（失敗形態⑤）：掛一個真的
   * `ModifierSource.flight` 到 `StatsComp.sources`，再跑出貨的 `flightSystem`
   * —— 那正是天生技 / 限時 buff / 道具 / 增益卡四種來源共用的那條路，而 ② 走的
   * 是 `expiresAtTick` 這條真的到期路徑（77-03 GLADIARIA ALAT 的 6/9/12/15 秒）。
   */
  it("★ 飛行是穿牆判定的合法例外，飛行結束後閘就回來 (GH#490)", () => {
    cover("displacement-wall-block");
    const doc = shippedArenas().find((a) => a.id === "arena.infinity-castle")!.doc;
    const arena = arenaDefFromDoc(doc as unknown as Parameters<typeof arenaDefFromDoc>[0]);
    const pr = probeOf(arena.zones[0]!)!;
    const world = new SimWorld(arena, 9);
    const hero = place(world, pr.from);
    // ⛔ 不手寫一份飛行參數 —— 讀出貨的 04-00 翔封界。手寫的夾具只證明「如果有人
    //    這樣授權的話會動」，而這條守衛要證明的是**出貨那支技能**跨得過去。
    const shipped = JSON.parse(
      readFileSync(join(ROOT, "content/abilities/godie-hjai.passive.json"), "utf8"),
    ) as { passive?: { ranks?: { flight?: FlightGrant }[] } };
    const grant = shipped.passive?.ranks?.[0]?.flight;
    expect(grant, "04-00 翔封界 沒有 flight 授予 —— 這條守衛在保護空氣").toBeDefined();
    const EXPIRES_AT = 20;
    world.stats.set(hero, {
      championId: "probe" as ChampionId,
      final: zeroStats(),
      dirty: false,
      sources: [
        { id: "buff:test.flight", kind: "buff", flight: grant!, expiresAtTick: EXPIRES_AT },
      ],
    });

    /** 從牆的負側往正側瞬移一次，回傳落點的帶號偏移。 */
    const blinkAcross = (): number => {
      world.transform.get(hero)!.pos = { x: pr.from.x, z: pr.from.z };
      world.nav.get(hero)!.override = null;
      runEffects([{ kind: "blink", shape: "single", to: "point" } as EffectDef], {
        world,
        caster: hero,
        rank: 1,
        targets: [],
        point: { x: pr.to.x, z: pr.to.z },
        origin: "ability:test.wall-block",
        rng: world.rng,
      });
      return side(world.transform.get(hero)!.pos, pr);
    };

    // ① 飛行中 —— 承重的那一條：她本來就穿得過這道牆（走路也穿得過）。
    flightSystem(world);
    expect(world.flight.get(hero), "出貨授予沒有被 flightSystem 看到").toBeDefined();
    expect(blinkAcross(), "在飛卻被擋在牆前 —— #487 的閘不認得飛行").toBeGreaterThan(0);

    // ② 飛行到期 —— ⛔ 閘一定要回來，否則「加了飛行」等於替所有人開了一道後門。
    world.tick = EXPIRES_AT;
    flightSystem(world);
    expect(world.flight.get(hero), "授予到期了但飛行還在").toBeUndefined();
    expect(blinkAcross(), "不會飛卻穿過去了 —— #487 的閘被飛行機制繞過了").toBeLessThanOrEqual(
      -pr.half,
    );
  });
});
