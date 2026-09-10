/**
 * ObjectiveSystem —— 戰場任務「**陣營所屬目標物**」（GH#752，owner 的 mini dota）。
 *
 * > owner（#20 原引）：「2. mini dota, **拆掉對面塔就會立即輸掉**，生命為 **100,000**」
 *
 * ── ⭐ 這一支做的是**機制**，⛔ 不是一張任務 ────────────────────────────────
 * 第〇·五守則：引擎做機制、內容做任務。所以這裡沒有任何一行寫著「mini dota」——
 * 它提供的是一個可重用的形狀：
 *
 *     「一個**屬於某一隊**的目標物，血量歸零 ⇒ **該區立即分出勝負**」
 *
 * mini dota 只是它的第一組參數（每區兩座、100,000 血、拆掉的那一方輸）。
 * 下一個「守住祭壇」「搶佔中立石碑」任務換一組 {@link ObjectiveRules} 就好，
 * ⛔ 不是在 `checkCombatEnd` 裡再加一個 if。
 *
 * ── ⛔⛔ 為什麼**不是**改 `GuardianSystem` ────────────────────────────────
 * `GuardianSystem` 的檔頭有一份 NEUTRALITY CONTRACT：守護塔**沒有陣營**，
 * 而「team lives / placement / scoreboard 對它一律失明」是 **BY CONSTRUCTION**。
 * ⇒ 它結構上做不出「拆掉**對面**的塔就輸」，⛔ 也不可以順手把陣營塞進去
 *   （每一個讀它的地方都假設了中立）。
 *
 * ⭐ 但兩者**共用同一個載體** `world.structure`（`StructureComp.kind` 分辨），
 * 而那是刻意的 —— 那一格 Map 已經在 11 個地方被正確處理：
 *   · `combat/damage.ts::mitigateStructure`（armor/MR/單發上限）
 *   · `MovementSystem` 的靜態碰撞（塔擋路、塔不被推走）· `stuckEscape`
 *   · `stats/matchStats.ts` 的 `guardianDamage`（⭐ 打塔傷害自動進計分板，GH#729）
 *   · `SimWorld.digest()` 的摺疊（權威世界狀態）· `SimWorld.destroy()` 的清理
 *   · `content/condition.ts` 的「目標是建築」條件葉
 * ⇒ 另開一個 Map 等於把上面每一條**再寫第二遍**，而第二遍會各自腐爛。
 *
 * ── DETERMINISM ────────────────────────────────────────────────────────────
 * 全部是世界狀態的純函式：⛔ 無 rng、⛔ 無時鐘、⛔ 無三角函式。擺位是
 * `zone.spawns[side]` 的**質心**沿著「圓心 → 質心」那條線外推（純加減乘除 + sqrt），
 * 所以同 seed 的重播擺在同一個位置。
 *
 * ── ⭐ 死掉的塔**不despawn** ───────────────────────────────────────────────
 * 守護塔死了會 `world.destroy(id)`（付款之後就沒事了）；⛔ 這裡刻意**留著屍體**，
 * 因為「這一區誰的塔倒了」就是**勝負判定要讀的那個事實**。留在 `world.structure`
 * 裡（`health.alive === false`）讓它：① 進 digest（replica 不一致會紅）
 * ② 主機每一 tick 讀得到 ③ 客戶端看得到一座廢墟，⛔ 不是「憑空消失」。
 */
import type { EntityId, TeamId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ZoneDef } from "../world/ArenaDef";

/**
 * 一座陣營塔的出貨參數。**秒 → tick 的轉換不在這裡**（這一支沒有任何排程），
 * 所以 rules 與 config 的欄位是一對一的。
 */
export interface ObjectiveRules {
  /**
   * 總開關。`false` ⇒ {@link beginCombatObjectives} 一座都不生，
   * 而 {@link duelLoserFromObjectives} 永遠回 `null` ⇒ 逐位元回到這條機制之前的比賽。
   * ⭐ 這就是 owner 的一鍵 rollback（第一守則的常設令）。
   */
  enabled: boolean;
  /**
   * 哪幾張場地跑這個任務（`arena@1` 的 id）。**空陣列 = 每一張都跑**。
   * ⭐ 出貨只點名 `arena.dota` —— 這是一個**戰場任務**，⛔ 不是全域規則改寫。
   */
  arenas: readonly string[];
  /** 塔的血量（owner 明說的 100,000） */
  hp: number;
  /** 護甲 / 魔抗 —— 塔沒有 `StatsComp`，這兩格**就是**它的減傷（`mitigateStructure`） */
  armor: number;
  magicResist: number;
  /**
   * 單發傷害上限（佔最大生命的比例）。`0 = 沒有上限`（⛔ 不是上限 0%）——
   * 與守護塔那一格共用「`> 0` 才生效」這條語意。
   * ⭐ 出貨 0：那一格存在的理由是「⛔ 不可以一顆按鈕刪掉 1,450 血的守護塔」，
   * 而一座 100,000 血的塔本來就一發打不掉；留著它只會靜靜地砍掉攻城流派。
   */
  maxHitPctMaxHp: number;
  /** 碰撞 / 命中半徑 */
  radius: number;
  /**
   * 塔站在「圓心 → 我方出生點質心」那條線上的**幾倍**距離。
   * `1.0` = 正好站在出生點中間（⛔ 會擠到人）；出貨 `1.25` = **站在自家背後**，
   * 也就是 dota 的基地位置。結果會被夾在場地邊界內（見 {@link objectivePos}）。
   */
  spawnPushPct: number;
  /** `EntityState.key` —— 客戶端解析 .glb 用的模型 doc id */
  modelKey: string;
  /**
   * ⭐ **決策點**（第一守則）：塔被拆掉的時候要發生什麼。
   *   · `"lose"`  —— 拆掉的那一方**立即落敗**（owner 的原話，出貨預設）
   *   · `"none"` —— 只留演出與計分，勝負照常打
   * ⛔ 這一格存在的理由是 rollback：想把塔留在場上但**不要**讓它決定勝負時，
   *    改這一格，⛔ 不是把整個任務關掉。
   */
  onDestroyed: "lose" | "none";
}

/**
 * ⭐ 出貨值的**唯一住處**（第〇·四守則）。
 *
 * ⚠️ 為什麼在 sim 而不是 `content/config/`：這正是 `sim/fireRing.ts` 的
 * `DEFAULT_BURN_CURVE` 立下的形狀 —— 值定義在 sim，Zod schema `import` 它接上
 * `.default()`，於是「沒填的話是多少」只有一個答案。
 * ⛔ 這一格**不是**「寫死」：{@link objectiveRulesFromConfig} 已經接好了，
 *    後台那一頁一落地（見票 #752 的接線清單）它就變成三住處的旋鈕。
 */
export const DEFAULT_OBJECTIVE_RULES: ObjectiveRules = {
  enabled: true,
  // ⭐ mini dota 是**戰場任務**：只在 dota 那張圖跑。⛔ 不是每一場。
  arenas: ["arena.dota"],
  hp: 100_000, // owner 2026-07-26 逐字：「生命為 100,000」
  armor: 0,
  magicResist: 0,
  maxHitPctMaxHp: 0, // 0 = 沒有單發上限（見欄位說明）
  radius: 2.5,
  spawnPushPct: 1.25,
  modelKey: "prop.guardian",
  onDestroyed: "lose",
};

/** 後台 config 那一份的形狀（欄位全 optional —— 缺席一律退回出貨值）。 */
export interface ObjectiveConfigLike {
  enabled?: boolean;
  arenas?: readonly string[];
  hp?: number;
  armor?: number;
  magicResist?: number;
  maxHitPctMaxHp?: number;
  radius?: number;
  spawnPushPct?: number;
  modelKey?: string;
  onDestroyed?: "lose" | "none";
}

/**
 * config → rules。⚠️ **缺席 ≠ 關掉**：缺席退回 {@link DEFAULT_OBJECTIVE_RULES}，
 * 而關掉是 `enabled: false` 這個**明講出來的**選擇。
 * （⛔ 與 flowers/revives/guardians 的「absent = OFF」不同，理由是那三個的出貨
 *  config 早就存在；這一格的 config 還沒落地，「缺席 = 關掉」會讓這條機制
 *  在後台那一頁接上之前**一個玩家都碰不到** —— 失敗形態②。）
 */
export function objectiveRulesFromConfig(cfg: ObjectiveConfigLike | undefined): ObjectiveRules {
  const d = DEFAULT_OBJECTIVE_RULES;
  if (cfg === undefined) return d;
  return {
    enabled: cfg.enabled ?? d.enabled,
    arenas: cfg.arenas ?? d.arenas,
    hp: cfg.hp ?? d.hp,
    armor: cfg.armor ?? d.armor,
    magicResist: cfg.magicResist ?? d.magicResist,
    maxHitPctMaxHp: cfg.maxHitPctMaxHp ?? d.maxHitPctMaxHp,
    radius: cfg.radius ?? d.radius,
    spawnPushPct: cfg.spawnPushPct ?? d.spawnPushPct,
    modelKey: cfg.modelKey ?? d.modelKey,
    onDestroyed: cfg.onDestroyed ?? d.onDestroyed,
  };
}

/** 這張場地跑不跑這個任務。空的 `arenas` = 每一張都跑。 */
export function objectiveEnabledForArena(rules: ObjectiveRules, arenaId: string): boolean {
  if (!rules.enabled) return false;
  return rules.arenas.length === 0 || rules.arenas.includes(arenaId);
}

/**
 * 一側的塔站哪裡：`zone.spawns[side]` 的**質心**，沿「圓心 → 質心」外推
 * `spawnPushPct` 倍，再夾進場地邊界（留一個塔的身體 + 0.5 的餘裕）。
 *
 * ⚠️ 為什麼要外推：質心正好是三個出生點的中間，塔站在那裡會**擠到自己人**
 * （塔是靜態碰撞體，被擠的是人）。外推 25% 之後它站在自家背後 —— 也就是
 * dota 的基地位置，敵人要走過來拆，而那正是這個任務要的動線。
 *
 * ⚠️ 質心與圓心重合（一個退化的場地文件）時回質心本身，⛔ 不除以 0。
 */
export function objectivePos(
  zone: ZoneDef,
  side: number,
  pushPct: number,
  radius: number,
): { x: number; z: number } {
  const row = zone.spawns[side] ?? zone.spawns[0] ?? [];
  if (row.length === 0) return { x: zone.center.x, z: zone.center.z };
  let cx = 0;
  let cz = 0;
  for (const p of row) {
    cx += p.x;
    cz += p.z;
  }
  cx /= row.length;
  cz /= row.length;
  const dx = cx - zone.center.x;
  const dz = cz - zone.center.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist <= 0) return { x: cx, z: cz };
  // 夾在邊界內：塔的身體要整個在場地裡，否則它會卡在牆上（或被地形吃掉）。
  const maxDist = zone.boundaryRadius - radius - 0.5;
  const want = dist * pushPct;
  const use = want > maxDist ? maxDist : want;
  const k = use / dist;
  return { x: zone.center.x + dx * k, z: zone.center.z + dz * k };
}

/** 一場決鬥的兩側 —— 主機的 `DuelPairing` 只取這三格。 */
export interface ObjectiveSide {
  zone: number;
  sideA: TeamId;
  sideB: TeamId;
}

/**
 * 生一座塔。`teamId` 是**擁有者**（⛔ 不是 `world.team` —— 那一格會讓
 * `sim/revive.ts::teamAliveInZone` 把一座塔數成一個活著的隊友）。
 */
export function spawnObjective(
  world: SimWorld,
  zone: number,
  teamId: TeamId,
  side: number,
  rules: ObjectiveRules,
  round: number,
): EntityId {
  const zoneDef = world.arena.zones[zone] ?? world.arena.zones[0]!;
  const at = objectivePos(zoneDef, side, rules.spawnPushPct, rules.radius);
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: at.x, z: at.z },
    vel: { x: 0, z: 0 },
    // 面向場地中央 —— 塔看著它要守的方向。純呈現，⛔ 沒有任何判定讀它。
    facing: { x: zoneDef.center.x - at.x, z: zoneDef.center.z - at.z },
    radius: rules.radius,
    zone,
  });
  world.health.set(id, {
    hp: rules.hp,
    maxHp: rules.hp,
    mana: 0,
    maxMana: 0,
    alive: true,
    shields: [],
  });
  world.structure.set(id, {
    kind: "objective",
    teamId,
    zone,
    round,
    modelKey: rules.modelKey,
    armor: rules.armor,
    magicResist: rules.magicResist,
    maxHitPctMaxHp: rules.maxHitPctMaxHp,
    lastDamagedTick: -1,
    wakeTick: -1,
    nextVolleyTick: -1,
    volleysFired: 0,
    threat: new Map(),
    marks: [],
  });
  // 任務提示的**唯一**來源（owner：「任務提示要明顯」）。客戶端 HUD 從這一則
  // 事件立起任務條與塔的血條，⛔ 不是自己去猜場上有沒有塔。
  world.emit("objectiveSpawn", {
    id,
    zone,
    teamId,
    x: at.x,
    z: at.z,
    maxHp: rules.hp,
    onDestroyed: rules.onDestroyed,
  });
  return id;
}

/**
 * 戰鬥入場：武裝這條機制並在**每一場決鬥的兩側**各生一座塔。
 * Idempotent（先清掉上一回合的殘骸）。
 */
export function beginCombatObjectives(
  world: SimWorld,
  rules: ObjectiveRules,
  sides: readonly ObjectiveSide[],
  round: number,
): void {
  endCombatObjectives(world);
  if (!objectiveEnabledForArena(rules, world.arena.id)) return;
  world.objectiveRules = rules;
  for (const s of sides) {
    spawnObjective(world, s.zone, s.sideA, 0, rules, round);
    spawnObjective(world, s.zone, s.sideB, 1, rules, round);
  }
}

/**
 * 戰鬥離場：每一座塔（含屍體）靜靜地消失。與 `endCombatGuardians` 同一個理由 ——
 * 回合結束之後不可以還有人在拆塔。Idempotent。
 */
export function endCombatObjectives(world: SimWorld): void {
  for (const [id, sc] of [...world.structure]) {
    if (sc.kind === "objective") world.destroy(id);
  }
  world.objectiveRules = null;
}

/**
 * 每 tick：把**這一 tick 剛倒下**的塔喊出來。
 *
 * ⛔ 它不 despawn、不決定勝負、不發獎 —— 勝負是主機的事（`checkCombatEnd`），
 *    而這裡只負責「那個瞬間」有一則事件，讓演出與 HUD 對得上時間。
 * ⭐ 用 `death` 事件（⛔ 不是每 tick 掃 `alive`）：`deathSystem` 每一具屍體只發
 *    一次，所以這一則也只會發一次 —— 掃 `alive` 會每 tick 重播同一場崩塌。
 */
export function objectiveSystem(world: SimWorld): void {
  if (!world.objectiveRules) return;
  for (const ev of world.events) {
    if (ev.type !== "death") continue;
    const id = ev.data.id as EntityId;
    const sc = world.structure.get(id);
    if (!sc || sc.kind !== "objective" || sc.teamId === undefined) continue;
    const t = world.transform.get(id);
    world.emit("objectiveDestroyed", {
      id,
      zone: sc.zone,
      teamId: sc.teamId,
      x: t?.pos.x ?? 0,
      z: t?.pos.z ?? 0,
      killerSeatId: world.team.get((ev.data.killer as EntityId | null) ?? (-1 as EntityId))?.seatId ?? -1,
    });
  }
}

/**
 * 這一區有哪幾隊的塔倒了（升冪，⛔ 依 teamId 排序而不是 Map 迭代序 —— 決定性）。
 * 沒有武裝 / 沒倒 ⇒ 空陣列。
 */
export function destroyedObjectiveTeams(world: SimWorld, zone: number): TeamId[] {
  const out: TeamId[] = [];
  if (!world.objectiveRules) return out;
  for (const [id, sc] of world.structure) {
    if (sc.kind !== "objective" || sc.zone !== zone || sc.teamId === undefined) continue;
    if (world.health.get(id)?.alive === false) out.push(sc.teamId);
  }
  return out.sort((a, b) => a - b);
}

/**
 * ⭐ **這條機制的整個重點**：這一區的勝負是不是已經被「塔倒了」決定了。
 *
 * 回傳**贏家**（塔沒倒的那一邊），或 `null` = 這一區照常打。
 *
 * ⚠️ 兩座**同時**倒（同一 tick 的雙殺）⇒ 回 `null`：那不是「誰贏」，是
 * **平手**，而平手該由主機既有的那一條路裁（雙方全滅的擲幣 / 時間到比血量）。
 * ⛔ 在這裡自己擲一次幣等於發明第二套裁決，而它只在這條機制下跑、沒有人在測。
 */
export function duelLoserFromObjectives(
  world: SimWorld,
  side: ObjectiveSide,
): TeamId | null {
  const rules = world.objectiveRules;
  if (!rules || rules.onDestroyed !== "lose") return null;
  const down = destroyedObjectiveTeams(world, side.zone);
  if (down.length === 0) return null;
  const aDown = down.includes(side.sideA);
  const bDown = down.includes(side.sideB);
  if (aDown && bDown) return null; // 兩邊都倒 → 交給主機既有的平手裁決
  if (aDown) return side.sideB;
  if (bDown) return side.sideA;
  return null;
}
