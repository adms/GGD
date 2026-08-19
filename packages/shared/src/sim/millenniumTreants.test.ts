/**
 * 70-04 千年練成 —— **紮根形態那一份**的行為守衛（GH#404）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它為什麼存在
 *
 * 白木卡迪那有**兩具身體**：本體 `godie-e00s` 與紮根形態 `godie-e010`
 *（`transform.role` 一個 base 一個 alternate，入口是天生技 70-00 紮根的
 * `championForm{to:"toggle"}` —— 所以這一張卡玩家真的按得到）。兩具身體各帶一份
 * 70-04 千年練成，而 owner 的新版規格只落在**本體**那一份上。
 *
 * 於是 2026-08-20 之前，紮根形態的 R 是這樣的：
 *
 *   卡面：「在指定範圍內招喚樹精⋯**總共 4 棵樹精**，每棵樹精誕生時造成 180 點傷害」
 *   引擎：`effects: [{ kind: "damage" }]` —— **一發單體傷害**，零棵樹精、零範圍。
 *
 * 第一·五守則的標準形狀：schema 綠、`content:build` 綠、全套測試綠，而卡片上那句
 * 「總共 4 棵」在場上一次都不會發生。⛔ 而且它**不是**兩隻英雄各壞各的 ——
 * 是同一支技能的鏡像漂移，所以修法是讓它跟本體走**同一個機制**（`randomArea`），
 * ⛔ 不是為紮根形態發明一套新東西。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一支問什麼
 *
 * 只問「**這個機制會不會發生**」：一次施放會不會排出**一串分散在不同 tick 的落點**，
 * 而且**不只一個**敵人吃得到。一發單體傷害（重製之前的實作）在兩條上都會紅：
 * 它只在施法那一 tick 打一次，而且只打得到一個人。
 *
 * ⚠️ 被測的是**出貨的那一份文件**（失敗形態⑤）：真的 `ContentLoader` + `registerAll`，
 * ⛔ 沒有任何一個 EffectDef 是這裡手寫的；連「該有幾發」都是從登錄表上那份
 * `randomArea.count` 讀回來的，⛔ 不抄卡面上的 4。
 *
 * ⛔ 斷言裡一個出貨數字都沒有（第二守則：驗機制不驗數字）。180 點、70 秒、
 * 散佈半徑 6 全部是 owner 每週在調的東西。
 *
 * ⚠️ 這一支同時是 `randomAreaSystem` 有沒有**接線**的證據：那支 handler 的檔頭
 * 曾經寫著「接線還沒接（給主控的兩行）」，而排得出來、不會落地正是失敗形態②。
 * 落點是施法那一刻一次抽完的，所以 seed 固定 ⇒ 這一支是決定性的，⛔ 不是擲骰。
 *
 * 突變紀錄：把 `content/abilities/godie-e010.r.json` 的 effects 換回重製前的
 * 單發 `{ kind: "damage" }` → 這一支紅（「只在一個 tick 落地」）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import type { AbilityDef } from "./content/defs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
/** 紮根形態的身體 —— ⛔ 不是本體 `godie-e00s`。 */
const ROOTED = "godie-e010" as ChampionId;
const DUMMY = "godie-e001" as ChampionId;
const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = (): Map<SeatId, IntentFrame> => new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

/** 白木（紮根形態）站中心，四個假人圍成十字 —— 都在散佈圈內。 */
function rig(): { world: SimWorld; caster: EntityId; foes: EntityId[] } {
  const world = new SimWorld(SKELETON_ARENA, 20260820);
  world.combatActive = true;
  const caster = spawnChampion(world, {
    championId: ROOTED,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: 0 },
    zone: 0,
    level: 6,
  });
  const ch = world.health.get(caster)!;
  ch.mana = ch.maxMana = 9999;
  const ring: Array<{ x: number; z: number }> = [
    { x: C.x + 2, z: 0 },
    { x: C.x - 2, z: 0 },
    { x: C.x, z: 2 },
    { x: C.x, z: -2 },
  ];
  const foes = ring.map((p, i) => {
    const id = spawnChampion(world, {
      championId: DUMMY,
      seatId: asSeatId(1 + i),
      teamId: asTeamId(1),
      pos: p,
      zone: 0,
      level: 6,
    });
    const hp = world.health.get(id)!;
    hp.maxHp = 100_000;
    hp.hp = hp.maxHp;
    const sc = world.stats.get(id)!;
    sc.final[Stat.Armor] = 0;
    sc.final[Stat.MagicResist] = 0;
    return id;
  });
  world.rebuildGrid();
  world.abilities.get(caster)!.slots.R.rank = 1;
  world.rebuildGrid();
  return { world, caster, foes };
}

/** 出貨文件自己說這一波該有幾發 —— ⛔ 不抄卡面上的數字。 */
function shippedImpactCount(): number {
  const def = Abilities.tryGet("godie-e010.r" as never) as unknown as AbilityDef | undefined;
  const wave = (def?.effects ?? []).find((e) => e.kind === "randomArea") as
    | { count?: number[] }
    | undefined;
  return wave?.count?.[0] ?? 0;
}

describe("70-04 千年練成 · 紮根形態 (e010-r-treant-burst)", () => {
  it("一次施放排出一串**分散在不同 tick** 的落點，圈內不只一個人吃得到", () => {
    cover("e010-r-treant-burst");
    const { world, caster, foes } = rig();

    // ① 出貨文件真的是一波多發 —— 母體檢查，⛔ 不是斷言本身。
    expect(
      shippedImpactCount(),
      "紮根形態的 70-04 又變回單發了 —— 卡面那句「總共 4 棵樹精」再次落空",
    ).toBeGreaterThan(1);

    expect(castAbility(world, caster, "R", { type: "self" })).toBe("ok");

    // ② 逐 tick 收血量，記下「這一 tick 有人掉血」的 tick 序號。
    //    一發單體傷害只會出現**一個** tick；`randomArea` 是一串排程。
    const hp = (): number[] => foes.map((f) => world.health.get(f)!.hp);
    let prev = hp();
    const hurtTicks: number[] = [];
    const everHurt = new Set<number>();
    for (let t = 0; t < 90; t++) {
      world.step(NO_INTENTS());
      const now = hp();
      let any = false;
      now.forEach((v, i) => {
        if (v < prev[i]!) {
          any = true;
          everHurt.add(i);
        }
      });
      if (any) hurtTicks.push(t);
      prev = now;
    }

    expect(
      hurtTicks.length,
      "整波只在一個 tick 落地 —— 這就是重製前那一發單體傷害的形狀（或 randomAreaSystem 沒接線）",
    ).toBeGreaterThan(1);
    expect(
      everHurt.size,
      "只有一個假人掉血 —— 落點沒有散開，或每一發沒有範圍（卡面寫的是[範圍]傷害）",
    ).toBeGreaterThan(1);
  });
});
