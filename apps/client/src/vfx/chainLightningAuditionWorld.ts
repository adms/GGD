/**
 * chainLightningAuditionWorld —— audition 頁的 **sim 那一半**。
 *
 * ⭐ 它唯一的工作是「**照出貨的樣子**擺一場」：出貨的 `SimWorld`、出貨的
 * 65-04 天譴（`content/abilities/godie-udea.r.json`，靠 `ensureContentLoaded()`
 * 從真的 `bundle.json` 載進註冊表）、飛鼠先生在中心、十個敵人在半徑 6 的環上。
 *
 * ⛔ **這裡不可以自己造 `segments`**。owner 要的是「那一發技能會不會發光」，
 * 而自己造 payload 只證明渲染器活著（失敗形態⑤ —— 被測的不是出貨的那個）。
 */
import { ensureContentLoaded } from "../content/bootContent";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { Abilities } from "@ggd/shared/sim/content/registry";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";

/** 65-04 天譴 —— owner 點名的那一發。 */
const THUNDER: AbilityId = "godie-udea.r" as AbilityId;

export interface AuditionWorld {
  world: SimWorld;
  casterId: EntityId;
  enemyIds: readonly EntityId[];
  /** ⚠️ sim 的座標是**競技場 zone 中心**附近（x≈-37），⛔ 不是原點 —— 替身與相機要用這一份。 */
  casterPos: { x: number; z: number };
  enemyPos: readonly { x: number; z: number }[];
  /** 讓施法者放一次 65-04（⭐ 走出貨的技能系統，⛔ 不是直接呼叫 effect）。 */
  castOnce(): void;
}

function spawnFighter(
  w: SimWorld,
  seat: number,
  team: number,
  pos: { x: number; z: number },
  abilityId: AbilityId | null,
): EntityId {
  const id = w.spawn();
  w.transform.set(id, {
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  w.health.set(id, { hp: 8000, maxHp: 8000, mana: 5000, maxMana: 5000, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  w.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  w.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 0; // ⛔ 站著不動 —— 這一頁要看的是弧，不是走位
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.0001;
  final[Stat.AttackDamage] = 1;
  w.stats.set(id, { championId: "audition" as ChampionId, final, dirty: false, sources: [] });
  const slot = (a: AbilityId | null) => ({
    abilityId: (a ?? ("audition.none" as AbilityId)) as AbilityId,
    rank: a ? 3 : 0,
    cooldownRemainingTicks: 0,
  });
  w.abilities.set(id, {
    slots: { Q: slot(null), W: slot(null), E: slot(null), R: slot(abilityId) } as never,
    exSlot: null,
    basicAttackCdTicks: 999_999,
    unspentPoints: 0,
  });
  w.champion.set(id, {
    championId: "audition" as ChampionId,
    level: 9,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

export async function buildAuditionWorld(
  ring: readonly { x: number; z: number }[],
): Promise<AuditionWorld> {
  await ensureContentLoaded();
  if (!Abilities.tryGet(THUNDER)) {
    throw new Error(
      `出貨內容裡找不到 ${THUNDER}（65-04 天譴）—— 內容沒載起來，⛔ 這一頁的結論不算數`,
    );
  }

  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;

  const casterId = spawnFighter(w, 0, 0, { x: c.x, z: c.z }, THUNDER);
  const enemyIds = ring.map((p, i) =>
    spawnFighter(w, i + 1, 1, { x: c.x + p.x, z: c.z + p.z }, null),
  );

  const casterPos = { x: c.x, z: c.z };
  const enemyPos = ring.map((p) => ({ x: c.x + p.x, z: c.z + p.z }));

  return {
    world: w,
    casterId,
    enemyIds,
    casterPos,
    enemyPos,
    castOnce(): void {
      // ⭐ 走**出貨的施法入口** `castAbility()`（`abilitySystem`）——
      //    與既有 sim 測試按技能的同一支，⛔ 不是直接跑 effect。
      // ⚠️ 65-04 的 `castType` 是 **dash** ⇒ 目標必須是 `point`／`dir`，
      //    ⛔ 不是 `self`（`abilitySystem.ts:684` 直接回 bad-target）。
      //    往 +x 衝一小段，⭐ 十個敵人在半徑 6 的環上，衝完仍然全部在
      //    `chainLightning` 的 radius 8 之內。
      // ⭐ audition 頁要能重播：把 R 的冷卻歸零再放（⛔ 只有這一頁這樣做，
      //    出貨路徑一格都沒動 —— 冷卻是 886 tick，不歸零就只能看一次）。
      const ab = w.abilities.get(casterId);
      if (ab) (ab.slots as { R: { cooldownRemainingTicks: number } }).R.cooldownRemainingTicks = 0;
      const hp = w.health.get(casterId);
      if (hp) hp.mana = hp.maxMana;
      const verdict = castAbility(w, casterId, "R", { type: "dir", dir: { x: 1, z: 0 } });
      if (verdict !== "ok") {
        throw new Error(`castAbility 拒絕了 65-04：${String(verdict)} —— ⛔ 這一頁的結論不算數`);
      }
    },
  };
}
