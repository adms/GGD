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

function spawn(w: SimWorld, seat: number, team: number, pos: V.Vec2, attackRange = 1.6): EntityId {
  const id = w.spawn();
  w.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  w.health.set(id, { hp: 5000, maxHp: 5000, mana: 100, maxMana: 100, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  w.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  w.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 5.8;
  final[Stat.AttackRange] = attackRange;
  final[Stat.AttackSpeed] = 0.5;
  final[Stat.AttackDamage] = 5;
  w.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = () => ({ abilityId: "probe.none" as AbilityId, rank: 0, cooldownRemainingTicks: 0 });
  w.abilities.set(id, { slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"], exSlot: null, basicAttackCdTicks: 0, unspentPoints: 0 });
  w.champion.set(id, { championId: "probe" as ChampionId, level: 1, xp: 0, gold: 0, items: [], augments: [], statStacks: 0, attrBonus: zeroAttrBonus(), statCapstonePct: 0, pendingOrbSlots: 0, undoStack: [] });
  return id;
}

/**
 * 一隻**殭屍**（PvE）—— ⭐ 自動清怪的合法目標。
 *
 * ⚠️ **移動速度 0**，而那是這一支測試能成立的前提：會走路的殭屍**自己就走進了
 * 射程**，於是「英雄沒有追」與「英雄不准追」量起來一模一樣。
 * ⭐ 靶要固定，量的才是**英雄的決策**。
 */
function spawnMob(w: SimWorld, pos: V.Vec2): EntityId {
  const id = spawn(w, 99, MONSTER_TEAM, pos);
  const sc = w.stats.get(id);
  if (sc) sc.final[Stat.MoveSpeed] = 0;
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
  opts: { attackRange?: number; foeAt?: number } = {},
): { w: SimWorld; me: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.combatActive = true;
  const cfg = (JSON.parse(readFileSync(join(CONTENT, "config/arena-rules.json"), "utf8")) as { mobWaves: MobWavesConfigLike }).mobWaves;
  w.mobRules = mobRulesFromConfig(cfg, w.dt, 1, undefined, undefined, new Set([asSeatId(0)]));
  const mo: ManualOrderRules = { ...DEFAULT_MANUAL_ORDER, ...(w.combatFeel.manualOrder ?? {}), lolControlModel: true };
  w.combatFeel = Object.freeze({ ...w.combatFeel, manualOrder: Object.freeze(mo) });
  w.controllerScheme = scheme;
  const me = spawn(w, 0, 0, at(0), opts.attackRange ?? 1.6);
  const fx = opts.foeAt ?? 3;
  if (foe === "mob") spawnMob(w, at(fx));
  else spawn(w, 1, 1, at(fx));
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

/**
 * 站著不動放 N tick，回傳「⭐ 追擊**曾經**被允許過嗎」（任何一 tick 拿到 moveTarget）。
 *
 * ⚠️ 前兩版量尺都錯過，留著當紀錄：
 *   ① 量「最後一 tick 有沒有 moveTarget」⇒ 跑完英雄**已經走到**，它被清成 null
 *      ⇒「追了而且到了」與「從來沒追」量起來一樣。（v3 那一條抓到的。）
 *   ② 量「身體移動了多少」⇒ ⛔ **殭屍自己會走過來** ⇒ 英雄沒動也可能是被服務到了。
 * ⭐ 直接量那個決策本身（`nav.moveTarget` 有沒有被指派過）就沒有這兩個洞。
 */
function chaseWasAllowed(
  scheme: ControllerSchemeEntry,
  opts: { attackRange?: number; foeAt?: number; foe?: "mob" | "champion" } = {},
): boolean {
  const { w, me } = world(scheme, opts.foe ?? "mob", opts);
  for (let i = 0; i < IDLE_TICKS * 3; i++) {
    w.step(new Map());
    if (w.nav.get(me)?.moveTarget != null) return true;
  }
  return false;
}

describe("自動貼近 (GH#863 · spec §25/§29/§31)", () => {
  const V4 = SCHEMES.v4 as ControllerSchemeEntry;
  const V3 = SCHEMES["v3-shipped"] as ControllerSchemeEntry;

  // ⭐ 用 spec §29 自己的數字：`attackRange = 1.8` / `autoApproachRange = 3.0`。
  //   `reachTo = max(射程, 半徑和+0.1) = 1.8` ⇒ 追擊在 d > 1.62 觸發、
  //   貼近上限 `min(1.8×1.67, 3.0) = 3.0` ⇒ **貼近帶 = 1.62 … 3.0**。
  it("⭐ 近戰：殭屍在貼近帶內（2.5u，射程 1.8）⇒ 會貼近", () => {
    expect(chaseWasAllowed(V4, { attackRange: 1.8, foeAt: 2.5 })).toBe(true);
  });

  it("⭐ 近戰：**超過**貼近帶（3.5u）⇒ ⛔ 不追（那是 auto chase，spec §28 禁止）", () => {
    expect(chaseWasAllowed(V4, { attackRange: 1.8, foeAt: 3.5 })).toBe(false);
  });

  it("⭐⭐ 遠程（射程 8）：⛔ **永遠不追** —— 而程式裡一個職業判斷都沒有", () => {
    // 追擊在 `d > 射程×0.9` 觸發、貼近在 `d ≤ 3.0` 才准 ⇒ 兩個區間不相交。
    // ⚠️ 12u 的殭屍在射程外，遠程仍然⛔不走過去（spec §25）。
    expect(chaseWasAllowed(V4, { attackRange: 8, foeAt: 12 })).toBe(false);
  });

  it("⭐ 近戰對**敵方玩家**也⛔不追（spec §31，這一條沒有例外）", () => {
    expect(chaseWasAllowed(V4, { attackRange: 1.8, foeAt: 2.5, foe: "champion" })).toBe(false);
  });

  it("v3：這一整段逐位元不存在（enabled:false ⇒ 追擊照舊）", () => {
    expect(chaseWasAllowed(V3, { attackRange: 8, foeAt: 12 })).toBe(true);
  });
});
