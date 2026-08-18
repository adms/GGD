/**
 * ⭐ GH#393【沿向量分段推進】的**行為**守衛 —— `delayed.advance` +
 * `hitOncePerTarget`（`delayed.ts` 檔頭⑤），從 34-04 蒼龍破的 JASS 重建而來。
 *
 * owner 2026-08-19：「34-04 **JASS 應該有安排位置移動播放的多次特效搭配傷害**」
 *
 * ── 這裡驗的是「機制」不是「數字」（第二守則）──────────────────────────────
 * ⛔ 12 / 67 / 0.13 / 350 這四個出貨值一個都沒有進斷言 —— 它們住在
 * `content/abilities/godie-osam.r.json`。這裡跑的是**操作者在鑄技工坊開一張
 * `tpl-traveling-wave` 直接存檔**會得到的那一份展開（`defaultParamsFor` →
 * `expand`），也就是**出貨的那一個入口**（失敗形態⑤：被測的不是出貨的那個），
 * 而每一條斷言比的都是**同一次執行的兩半**（近的 vs 遠的 / 一次 vs N 次）。
 *
 * ⚠️ `terminalBurst` 被拿掉，理由與 `chargePush.test.ts` 的 `shoveDelta` 逐字
 * 相同：終點爆發是**另一個** effect，它會在最後一段對遠端那個身體再打一次，
 * 把「一人只吃一次」那條斷言變成在量兩個機制的和。
 *
 * ⚠️ **「掉了幾次血」不等於「這支技能打了幾次」** —— 實測（同一個夾具，
 * `runEffects` 整個不跑）：近端那個身體在 tick 9 照樣掉 35。所以這裡**沒有**
 * 任何一條斷言寫成「等於 1」，每一條都是 A/B/C 三臂相減 —— 同一顆種子、同一個
 * 幾何，那份環境掉血在每一臂都一樣，會從差值裡消掉。
 *
 * ── 突變紀錄（承重的一條線，真的跑過）──────────────────────────────────────
 *  · ⭐ 承重線 —— `effects/delayed.ts` `delayedSystem` 裡那一段
 *      `wave.point + dir × (start + index × step)`
 *    改回 `const point = wave.point`（＝退回這一格出現以前：整串原地落下）
 *      → 紅（訊息逐字抄在任務回報裡）。
 *    ⚠️ 這一條同時擋住「advance 整格沒接上」與「接上了但每一發落點一樣」兩種
 *      壞法，而後者正是這個機制存在的**全部理由**。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { normalizeCombatEnv } from "../combatEnv";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { zTemplateDoc } from "../../content/schema/template";
import { zEffectDefUnion } from "../../content/schema/effect";
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

/** 操作者開卡直接存檔會得到的那一份 —— ⛔ 不是手寫的 EffectDef。 */
function shippedWave(): EffectDef[] {
  const t = zTemplateDoc.parse(
    JSON.parse(readFileSync(join(TEMPLATES, "tpl-traveling-wave.json"), "utf8")),
  );
  const params = { ...defaultParamsFor(t) };
  delete params["terminalBurst"];
  return expand(t, params).effects;
}

/** 施法者在圓心**面向 +x**，兩個敵人一近一遠地站在那條線上。 */
function stage(): { world: SimWorld; caster: EntityId; near: EntityId; far: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 39312);
  world.combatActive = true;
  world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
  // ⛔ 關掉自動索敵：一場真的互毆會在同樣的 tick 上製造掉血，而這裡量的正是
  // 「哪一個 tick 掉血」。
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
  const near = body(2, 1);
  const far = body(12, 2);
  world.step(new Map());
  // 線往哪指 = 施放那一刻的面向（`advance.dir: "facing"`，原作只讀一次 facing）。
  world.transform.get(caster)!.facing = { x: 1, z: 0 };
  return { world, caster, near, far };
}

/** 跑一臂：`drop` 指定要從展開結果拿掉哪一格（＝那個機制出現以前的行為）。 */
function arm(drop?: "advance" | "hitOncePerTarget"): { near: number[]; far: number[] } {
  const wave = { ...(shippedWave()[0] as unknown as Record<string, unknown>) };
  if (drop) delete wave[drop];
  const effects = [wave] as unknown as EffectDef[];
  const s = stage();
  runEffects(effects, {
    world: s.world,
    caster: s.caster,
    rank: 1,
    targets: [],
    origin: "ability:test.traveling-wave",
    rng: s.world.rng,
  } satisfies EffectContext);
  const hp = { near: s.world.health.get(s.near)!, far: s.world.health.get(s.far)! };
  const out = { near: [] as number[], far: [] as number[] };
  for (let i = 0; i < 40; i++) {
    const bn = hp.near.hp;
    const bf = hp.far.hp;
    s.world.step(new Map());
    if (bn - hp.near.hp > 1e-6) out.near.push(i);
    if (bf - hp.far.hp > 1e-6) out.far.push(i);
  }
  return out;
}

describe("行進波動：傷害點沿線逐段推進，每段各結算一次", () => {
  it("wave-advances-and-hits-once", () => {
    cover("traveling-wave-advance");
    // 內容 schema 收得下，不只 TypeScript —— 這是文件進 registry 的那一關。
    for (const e of shippedWave()) expect(() => zEffectDefUnion.parse(e)).not.toThrow();

    const shipped = arm();
    const noAdvance = arm("advance");
    const noDedup = arm("hitOncePerTarget");

    // ① ⭐ 承重：這條線真的**走到遠端去**。拿掉 `advance` 就是這一格出現以前的
    //    行為 —— 整串 20 發全部落在施法者腳下，遠端那個人一次都不會挨打。
    expect(
      shipped.far.length,
      "線沒有往前走：站在遠端的人整串一次都沒挨打",
    ).toBeGreaterThan(noAdvance.far.length);
    expect(noAdvance.far.length, "沒有推進卻打到了遠端 —— 這一臂量到的不是這支技能").toBe(0);
    // ② 近的先中、遠的後中。這是「逐段推進」與「一次鋪滿同一條線」的**唯一**
    //    可觀測差別 —— 命中集合兩者相同，時序不同。
    expect(
      shipped.far[0]!,
      "遠端與近端在同一個 tick 中招 —— 那是一次鋪滿的線，不是一條走過去的波",
    ).toBeGreaterThan(shipped.near[0]!);
    // ③ 一人只吃一次。一個站在線上的人會落在**很多**段的判定圓裡，而卡片寫的是
    //    **一次**的傷害；拿掉 `hitOncePerTarget` 的那一臂就是「被逐段重複結算」。
    expect(
      shipped.near.length,
      "同一個人被逐段重複結算 —— 去重表沒有生效",
    ).toBeLessThan(noDedup.near.length);
  });
});
