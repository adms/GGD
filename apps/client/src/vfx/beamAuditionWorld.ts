/**
 * beamAuditionWorld —— beam-audition 頁的 **sim 那一半**（GH#673 光束砲終端驗收）。
 *
 * ⭐ 與 `chainLightningAuditionWorld` 同一個立場：「**照出貨的樣子**擺一場」——
 * 出貨的 `SimWorld`、出貨的 09-04 龜派氣功（`content/abilities/godie-ogrh.r.json`，
 * 靠 `ensureContentLoaded()` 從真的 `bundle.json` 載進註冊表）、悟空替身在中心、
 * 三個敵人沿施放方向排成一直線。
 *
 * ⛔ **這裡不可以自己造 `modelFxSpawn` payload**。owner 問的是「beam 相關的都修正
 * 完了嗎」，而自己造 payload 只證明 rig 活著（失敗形態⑤ —— 被測的不是出貨的那個）。
 * 09-04 的 spawnModelFx 節點引用 `preset: "tpl-beam-roll"`，欄位（path:"static"、
 * lifeSec:2、scale:2.5、modelKey:imported.netherstrike）在**載入時**由
 * `content/modelFxPreset.ts` 補上 —— 這一頁量到的就是那條出貨鏈。
 */
import { ensureContentLoaded } from "../content/bootContent";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { Abilities } from "@ggd/shared/sim/content/registry";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";

/** 09-04 龜派氣功 —— owner 2026-08-23 點名的四支經典橫放光束砲之一。 */
const KAMEHAMEHA: AbilityId = "godie-ogrh.r" as AbilityId;

export interface BeamAuditionWorld {
  world: SimWorld;
  casterId: EntityId;
  enemyIds: readonly EntityId[];
  /** ⚠️ sim 的座標是**競技場 zone 中心**附近（x≈-37），⛔ 不是原點 —— 替身與相機要用這一份。 */
  casterPos: { x: number; z: number };
  enemyPos: readonly { x: number; z: number }[];
  /** 讓施法者放一次 09-04（⭐ 走出貨的 `castAbility()`，⛔ 不是直接呼叫 effect）。 */
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
  final[Stat.MoveSpeed] = 0; // ⛔ 站著不動 —— 這一頁要看的是光束，不是走位
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

export async function buildBeamAuditionWorld(
  enemyOffsets: readonly { x: number; z: number }[],
): Promise<BeamAuditionWorld> {
  await ensureContentLoaded();
  if (!Abilities.tryGet(KAMEHAMEHA)) {
    throw new Error(
      `出貨內容裡找不到 ${KAMEHAMEHA}（09-04 龜派氣功）—— 內容沒載起來，⛔ 這一頁的結論不算數`,
    );
  }

  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;

  const casterId = spawnFighter(w, 0, 0, { x: c.x, z: c.z }, KAMEHAMEHA);
  const enemyIds = enemyOffsets.map((p, i) =>
    spawnFighter(w, i + 1, 1, { x: c.x + p.x, z: c.z + p.z }, null),
  );

  return {
    world: w,
    casterId,
    enemyIds,
    casterPos: { x: c.x, z: c.z },
    enemyPos: enemyOffsets.map((p) => ({ x: c.x + p.x, z: c.z + p.z })),
    castOnce(): void {
      // ⭐ 走**出貨的施法入口** `castAbility()`。09-04 的 `castType` 是
      //    **skillshot** ⇒ 目標是 `dir`／`point`（`abilitySystem` 的 skillshot 分支）。
      // ⚠️ `castTimeSec: 1.233` ⇒ effects 在 **cast resolve**（≈37 tick 後）才跑 ——
      //    呼叫端要 `step(40)` 左右才看得到 `modelFxSpawn` 事件，那不是缺陷，
      //    是出貨的詠唱條。
      // ⭐ audition 頁要能重播：把 R 的冷卻歸零再放（⛔ 只有這一頁這樣做，
      //    出貨路徑一格都沒動 —— 冷卻是 60 秒，不歸零就只能看一次）。
      const ab = w.abilities.get(casterId);
      if (ab) (ab.slots as { R: { cooldownRemainingTicks: number } }).R.cooldownRemainingTicks = 0;
      const hp = w.health.get(casterId);
      if (hp) hp.mana = hp.maxMana;
      const verdict = castAbility(w, casterId, "R", { type: "dir", dir: { x: 1, z: 0 } });
      if (verdict !== "ok") {
        throw new Error(`castAbility 拒絕了 09-04：${String(verdict)} —— ⛔ 這一頁的結論不算數`);
      }
    },
  };
}
