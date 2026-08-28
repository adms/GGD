/**
 * ⭐⭐ spec Test B —— **按住左搖桿走位時，自動清怪仍然活著**（GH#863 Phase 4）。
 *
 * `docs/controller-combat-spec-v4.md` 逐字：
 *   §50「LS continuously held for 10 seconds … → Auto Farm remains active」
 *   §26「Movement must **NOT** disable Auto Farm」
 *
 * ⚠️ 出貨（v3）**刻意相反** —— GH#652 的 LoL 模型「有指令就聽指令，走位權是玩家的」。
 * ⇒ 這一支同時是**兩件事的證據**：v4 的前提成立，而且 v3 逐位元沒被動到。
 *
 * ⭐ 跑的是真的 `world.step()`（真 OrderSystem），⛔ 不是手餵一個 pass（失敗形態⑤）。
 * ⭐ 秒數從 `DEFAULT_MANUAL_ORDER` 推導，⛔ 不抄字面值（第二守則：驗機制不驗數字）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import { Stat, zeroStats } from "../stats/statTypes";
import { zeroAttrBonus } from "../stats/attributes";
import type { AbilitiesComp } from "../stats/statsComp";
import type { IntentFrame } from "../intents";
import { mobRulesFromConfig, MONSTER_TEAM, type MobWavesConfigLike } from "../mobs";
import { DEFAULT_MANUAL_ORDER, type ManualOrderRules } from "../combatFeel";
import { zConfigControllerSchemeDoc, type ControllerSchemeEntry } from "../../content";
import { TICK_HZ } from "../../constants";
import * as V from "../math/vec2";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const SCHEMES = zConfigControllerSchemeDoc.parse(
  JSON.parse(readFileSync(join(CONTENT, "config/controller-scheme.json"), "utf8")),
).schemes;
const Z0 = SKELETON_ARENA.zones[0]!;
const at = (dx: number, dz = 0): V.Vec2 => ({ x: Z0.center.x + dx, z: Z0.center.z + 12 + dz });

function spawn(w: SimWorld, seat: number, team: number, pos: V.Vec2): EntityId {
  const id = w.spawn();
  w.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  w.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  w.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  w.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 5.8;
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  w.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  w.abilities.set(id, { slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"], exSlot: null, basicAttackCdTicks: 0, unspentPoints: 0 });
  w.champion.set(id, { championId: "probe" as ChampionId, level: 1, xp: 0, gold: 0, items: [], augments: [], statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0, pendingOrbSlots: 0, undoStack: [] });
  return id;
}

/** 一隻**殭屍**（PvE）—— ⭐ 自動清怪的合法目標。 */
function spawnMob(w: SimWorld, pos: V.Vec2): EntityId {
  const id = spawn(w, 99, MONSTER_TEAM, pos);
  w.champion.delete(id); // ⛔ 殭屍不是英雄 —— spec §8 的過濾正是看這個
  w.mob.set(id, { zone: 0, team: MONSTER_TEAM, target: -1 as EntityId, attackCdTicks: 0, spawnTick: 0, kind: "normal" });
  return id;
}

/**
 * 一個真人座位（LoL 模型）＋ 一個站在索敵半徑內的目標。
 *
 * @param foe `"mob"` = 殭屍（PvE）· `"champion"` = 敵方英雄
 *   ⭐ 這個參數本身就是 spec §8 的實驗：v4 只准挑前者。
 */
function world(
  scheme: ControllerSchemeEntry,
  foe: "mob" | "champion" = "mob",
): { w: SimWorld; me: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  const cfg = (JSON.parse(readFileSync(join(CONTENT, "config/arena-rules.json"), "utf8")) as { mobWaves: MobWavesConfigLike }).mobWaves;
  w.mobRules = mobRulesFromConfig(cfg, w.dt, 1, undefined, undefined, new Set([asSeatId(0)]));
  const mo: ManualOrderRules = { ...DEFAULT_MANUAL_ORDER, ...(w.combatFeel.manualOrder ?? {}), lolControlModel: true };
  w.combatFeel = Object.freeze({ ...w.combatFeel, manualOrder: Object.freeze(mo) });
  w.controllerScheme = scheme;
  const me = spawn(w, 0, 0, at(0));
  if (foe === "mob") spawnMob(w, at(3));
  else spawn(w, 1, 1, at(3));
  return { w, me };
}

/** 連續推搖桿：每一 tick 一條 move（⭐ 那正是搖桿流的樣子）。 */
function holdStickFor(w: SimWorld, me: EntityId, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    const p = at(0.02 * i);
    w.step(new Map<SeatId, IntentFrame>([[asSeatId(0), { order: { kind: "move", point: p }, commands: [] }]]));
  }
}

const IDLE_TICKS = Math.round(DEFAULT_MANUAL_ORDER.idleAutoEngageSec * TICK_HZ);

describe("自動清怪 vs 走位 (GH#863 · spec §26/§50)", () => {
  it("⭐ v4：按住搖桿一路走，計時器照跑 ⇒ 仍然索敵", () => {
    const { w, me } = world(SCHEMES.v4 as ControllerSchemeEntry);
    holdStickFor(w, me, IDLE_TICKS * 3);
    expect(w.nav.get(me)?.attackTarget).not.toBeNull();
  });

  it("⭐ v3（出貨）：同樣的操作 ⇒ ⛔ 不索敵（LoL 語意逐位元不變）", () => {
    const { w, me } = world(SCHEMES["v3-shipped"] as ControllerSchemeEntry);
    holdStickFor(w, me, IDLE_TICKS * 3);
    expect(w.nav.get(me)?.attackTarget).toBeNull();
  });

  it("⭐⭐ spec §8：v4 站著不動也**⛔ 不會**自己挑上敵方玩家", () => {
    const { w, me } = world(SCHEMES.v4 as ControllerSchemeEntry, "champion");
    for (let i = 0; i < IDLE_TICKS * 3; i++) w.step(new Map());
    expect(w.nav.get(me)?.attackTarget).toBeNull();
  });

  it("⭐ 而 v3 會（出貨行為，帶著 waiver 刻意保留）", () => {
    // ⚠️ ⛔ 這不是「v3 有缺陷」—— owner 2026-08-28 那句「停頓一段時間就會自動
    //   索敵攻擊」沒有限定對象。把 §8 套到 v3 上等於**偷改出貨行為**。
    const { w, me } = world(SCHEMES["v3-shipped"] as ControllerSchemeEntry, "champion");
    for (let i = 0; i < IDLE_TICKS * 3; i++) w.step(new Map());
    expect(w.nav.get(me)?.attackTarget).not.toBeNull();
  });

  it("兩版**站著不動**都會索敵殭屍 —— ⭐ 差別只在「走位算不算」", () => {
    for (const key of ["v3-shipped", "v4"] as const) {
      const { w, me } = world(SCHEMES[key] as ControllerSchemeEntry);
      for (let i = 0; i < IDLE_TICKS * 3; i++) w.step(new Map());
      expect(w.nav.get(me)?.attackTarget, key).not.toBeNull();
    }
  });
});
