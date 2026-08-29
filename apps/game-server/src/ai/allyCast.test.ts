/**
 * ⭐ GH#722 —— **第四條輸入路徑：AI**。友方指定技能（`targetsEnemies:false`）
 * 對 bot 一直是死的：`Tier0Brain` 的 switch 無條件送 `nearest`（最近的**敵人**），
 * 而 `abilitySystem` 的友方分支逐字「can never target a neutral flower — nor an
 * ENEMY」⇒ 每一次 replan 都送一發必被判 `bad-target` 的指令（不扣魔、不上 CD、
 * 也不做任何事）⇒ 出貨的 5 支友方技能在 bot 身上**一場都沒放出去過**。
 *
 * 基線（2026-08-30 跑出來的）：這一支的 ① 在修之前收到 `entityId = 敵人`，
 * 而 `castAbility` 對它回 `"bad-target"`。
 *
 * 突變（承重那一行）：`Tier0Brain` 的
 *   `const ally = friendly ? nearestAllyOrSelf(world, id, castRange) : null;`
 * 改成 `const ally = null;` → ① 兩條斷言同時紅（收到敵人 ＋ `bad-target`）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent, SELA } from "@ggd/shared/sim/content/skeleton";
import { registerChampion } from "@ggd/shared/sim/content/registry";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { CastTarget } from "@ggd/shared/sim/intents";
import { AIDriver } from "./Tier0Brain";
import { Seat } from "../seat/Seat";

const C = SKELETON_ARENA.zones[0]!.center;
/** SELA ＋ 一格 `targeted` 的 W；`friendly` 決定它打哪一側。 */
function champ(friendly: boolean): ChampionId {
  const id = `sela.ally-${friendly}` as ChampionId;
  registerChampion({
    ...SELA,
    id,
    abilities: {
      ...SELA.abilities,
      W: {
        ...SELA.abilities.W,
        id: `sela.w.ally-${friendly}` as AbilityId,
        castType: "targeted",
        range: 12,
        ...(friendly ? { targetsEnemies: false } : {}),
      },
    },
  });
  return id;
}
beforeAll(() => registerSkeletonContent());

const hero = (w: SimWorld, cid: ChampionId, seat: number, team: number, dx: number): EntityId =>
  spawnChampion(w, {
    championId: cid,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });

/** 一 tick 的 bot：回傳 W 的 target ＋ 隊友/敵人的 id ＋ 那顆世界。 */
function replan(friendly: boolean): {
  target: CastTarget | undefined;
  mate: EntityId;
  foe: EntityId;
  bot: EntityId;
  w: SimWorld;
} {
  const w = new SimWorld(SKELETON_ARENA, 3);
  w.combatActive = true;
  const bot = hero(w, champ(friendly), 0, 0, 0);
  const mate = hero(w, SELA.id as ChampionId, 2, 0, 2); // 隊友，離 bot 2
  const foe = hero(w, SELA.id as ChampionId, 1, 1, 4); // 敵人，離 bot 4（更遠）
  w.step(new Map()); // acquireTarget 讀的是 step 才建起來的空間索引
  w.abilities.get(bot)!.slots.W.rank = 1;
  w.health.get(bot)!.mana = 9999;
  const seat = new Seat(asSeatId(0), asTeamId(0), new AIDriver());
  seat.entityId = bot;
  const cmd = seat
    .produceIntent(w, 0)
    .commands.find((c) => c.kind === "castAbility" && c.slot === "W");
  return { target: cmd?.kind === "castAbility" ? cmd.target : undefined, mate, foe, bot, w };
}

describe("GH#722 第四條路徑：bot 的友方指定技能打得到隊友", () => {
  it("★ ① 友方技能鎖住隊友，而且 sim 真的收下（⛔ 不是每 replan 送一發 bad-target）", () => {
    const { target, mate, bot, w } = replan(true);
    expect(target, "bot 對友方技能仍然送最近的敵人").toEqual({ type: "entity", entityId: mate });
    expect(castAbility(w, bot, "W", target!), "sim 拒收 ⇒ 這一發等於沒按").not.toBe("bad-target");
  });

  it("★ ② 敵方技能一格未動（控制組 —— 沒有它 ① 可能只是 bot 從不施法）", () => {
    const { target, foe } = replan(false);
    expect(target).toEqual({ type: "entity", entityId: foe });
  });
});
