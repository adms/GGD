/**
 * 擊退的**所有權**：同一 tick 內兩個來源都要寫 `nav.override` 時，誰贏。
 * (GH#193 lane P4 的整合缺陷 —— 見 `combat/damage.ts` 的 SHOVE ARBITRATION 段。)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  這條缺陷長什麼樣（實測，不是推論）
 * ═══════════════════════════════════════════════════════════════════════════
 * `SimWorld.step()` 的順序是固定的：
 *
 *     castResolve(2b) / command(3)  →  effect 寫 nav.override
 *     leap(4b) / movement(5)        →  身體開始滑
 *     combatResolve(8)              →  才排乾 damageQueue → applyImpact
 *
 * `applyImpact` 過去是**無條件**賦值 `nav.override = {kind:"knockback", …}`，
 * 所以一支「同時造成傷害又擊退」的技能，它自己授權的擊退會被**它自己的傷害**
 * 在同一個 tick 蓋掉。而出貨內容裡要移植的 11 支擊退技能**全部都造成傷害**
 * （見 `content/fieldAdoption.test.ts` 的 knockback 豁免條目所列），所以這根
 * 原語在出貨路徑上是**全滅**的，不是「偶爾被干擾」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  為什麼這裡不斷言 `nav.override.kind === "knockback"`
 * ═══════════════════════════════════════════════════════════════════════════
 * 因為那是**屬性**不是行為（七種失敗形態第 ⑦ 種）：壞掉的實作和修好的實作
 * `kind` 都是 `"knockback"`，兩邊都會過。玩家看到的是**身體滑到哪裡去**，所以
 * 每一條斷言都跑真的 `world.step()`、讀真的 `world.transform.pos`，而且比較的
 * 兩個距離刻意差**一個數量級**（技能授權 ≈ 12 單位 vs 傷害驅動 ≈ 1.4 單位）——
 * 兩個數字太接近的話，斷言對正確與壞掉的實作都會過（第 ④ 種）。
 *
 * 走的是**出貨的**兩條路徑，不是手寫的替身（第 ⑤ 種）：技能經 `Abilities`
 * registry + `castAbility` 發動，位移由出貨的 `movementSystem` / `leapSystem`
 * 積分，傷害由出貨的 `combatResolveSystem` 排乾。
 *
 * ⚠️ 兩具身體**同隊**：敵對的兩具會互相索敵普攻，而普攻本身就會沿著
 * `combat/damage.ts` 打出**另一發**擊退，量到的軌跡就不再是被測的那個。
 * 這條規則不看隊伍，所以同隊不弱化任何一條斷言，只是把污染源拿掉。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { apDamageMult } from "./combat/apDamageScaling";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { Abilities } from "./content/registry";
import { castAbility } from "./abilities/abilitySystem";
import { DEFAULT_COMBAT_FEEL, type KnockbackRules } from "./combatFeel";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";
import * as V from "./math/vec2";

const TAG = "sim-knockback-vs-damage";

const Z0 = SKELETON_ARENA.zones[0]!;
/** 兩具身體的間距。半徑 0.6 + 0.6 = 1.2，所以 2.0 不重疊，也不會被推擠分開。 */
const GAP = 2;
/** 技能授權的擊退：距離 0 時 14 單位，減掉 GAP 之後 = 12。 */
const AUTHORED_DISTANCE = 14;
const AUTHORED_SPEED = 6;
/** 減距離之後技能真正要推的長度（GH#193 的 afterGap）。 */
const AUTHORED_AFTER_GAP = AUTHORED_DISTANCE - GAP;

const SHOVE_HIT = "test.shovehit" as AbilityId;
const SHOVE_LAUNCH = "test.shovelaunch" as AbilityId;
const SHOVE_ONLY = "test.shoveonly" as AbilityId;

/**
 * 傷害佔最大生命的比例。`maxBodies=10 / bodyUnit=1` 之下傷害驅動的 raw 是
 * 10 × 0.35 = 3.5，減掉 GAP 之後 ≈ 1.5 —— 和技能授權的 12 差了八倍，所以
 * 「軌跡符合哪一個」是一個看得出來的問題，不是浮點誤差之爭。
 */
const DAMAGE_PCT = 0.35;

beforeAll(() => {
  registerSkeletonContent();
  const base = {
    slot: "Q" as const,
    castType: "targeted" as const,
    maxRank: 1,
    cooldown: [0.1],
    manaCost: [0],
    range: 12,
    // 同隊互指：把普攻污染拿掉（見檔頭）。
    targetsEnemies: false,
    castTimeSec: 0,
  };
  // ① 同時擊退 + 造成傷害 —— 出貨內容裡每一支要移植的擊退技能都是這個形狀。
  Abilities.register(SHOVE_HIT, {
    ...base,
    id: SHOVE_HIT,
    name: "Shove And Hit",
    effects: [
      { kind: "knockback", distance: AUTHORED_DISTANCE, speed: AUTHORED_SPEED },
      // `true` 傷害：跳過護甲/魔抗，所以 impact 只由這個數字決定，
      // 測試不必去猜受測英雄的減傷。
      { kind: "damage", damageType: "true", amount: { flat: 1 } },
    ],
  });
  // ② 擊飛（#247 拋物線）+ 同一 tick 的傷害。
  Abilities.register(SHOVE_LAUNCH, {
    ...base,
    id: SHOVE_LAUNCH,
    name: "Launch And Hit",
    effects: [
      {
        kind: "knockback",
        distance: AUTHORED_DISTANCE,
        speed: AUTHORED_SPEED,
        launchHeight: 3,
      },
      { kind: "damage", damageType: "true", amount: { flat: 1 } },
    ],
  });
  // ③ 對照組：只擊退不造成傷害 —— 這一支在缺陷版本裡也是好的，
  //    所以它單獨存在不能證明任何事，它是用來量「技能授權的那個距離」的基準。
  Abilities.register(SHOVE_ONLY, {
    ...base,
    id: SHOVE_ONLY,
    name: "Shove Only",
    effects: [{ kind: "knockback", distance: AUTHORED_DISTANCE, speed: AUTHORED_SPEED }],
  });
});

interface Rig {
  world: SimWorld;
  caster: EntityId;
  victim: EntityId;
  start: V.Vec2;
}

function rig(knockback?: Partial<KnockbackRules>): Rig {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  world.combatFeel = {
    ...DEFAULT_COMBAT_FEEL,
    knockback: { ...DEFAULT_COMBAT_FEEL.knockback, ...knockback },
  };
  const c = Z0.center;
  // 兩具都在 z = 0 的走廊上（那一條沒有障礙物），往 +x 推。
  const caster = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 6, z: 0 },
    zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    // 同隊（見檔頭）
    teamId: asTeamId(0),
    pos: { x: c.x - 6 + GAP, z: 0 },
    zone: 0,
  });
  world.rebuildGrid();
  return { world, caster, victim, start: { ...world.transform.get(victim)!.pos } };
}

/** 把技能裝進 Q 格並真的施放，回傳受害者逐 tick 的位置。 */
function castAndRun(r: Rig, abilityId: AbilityId, ticks: number): V.Vec2[] {
  r.world.abilities.get(r.caster)!.slots.Q = { abilityId, rank: 1, cooldownRemainingTicks: 0 };
  expect(castAbility(r.world, r.caster, "Q", { type: "entity", entityId: r.victim })).toBe("ok");
  const path: V.Vec2[] = [];
  for (let i = 0; i < ticks; i++) {
    r.world.step(new Map());
    path.push({ ...r.world.transform.get(r.victim)!.pos });
  }
  return path;
}

/** 起點到終點的直線位移。 */
function travelled(r: Rig, path: V.Vec2[]): number {
  return V.len(V.sub(path[path.length - 1]!, r.start));
}

/**
 * 讓傷害正好打掉 `DAMAGE_PCT` 的最大生命。`flat` 在 effect 裡是 1，這裡直接
 * 改註冊表的數字，因為受測英雄的 maxHp 是由出貨的 spawnChampion 決定的，
 * 硬寫一個數字會在平衡改動的那天悄悄失效。
 */
/**
 * ⚠️ 2026-08-21 —— `flat` 除掉 AP 傷害加成（`combat/apDamageScaling.ts`）。
 *
 * 這支 helper 的**契約**是「這一發**落地時**剛好是最大生命的 DAMAGE_PCT」，
 * 因為底下每一條斷言量的都是「打掉這麼多血會把人推多遠」。技能傷害多了一層
 * 全域乘數之後，⛔ 不除掉的話這個契約就靜默變成「1.7 × DAMAGE_PCT」——
 * 而在 `longerDamageWins` 那一條裡它會直接把人打死（死人不會被推），
 * 於是測試用一個**與缺陷無關**的理由紅（失敗形態④）。
 * ⛔ 除數讀出貨函式，不抄數字。
 */
function armDamage(r: Rig, abilityId: AbilityId): number {
  const maxHp = r.world.health.get(r.victim)!.maxHp;
  const def = Abilities.get(abilityId);
  const apMult = apDamageMult(r.world, r.caster, `ability:${abilityId}`);
  for (const e of def.effects) {
    if (e.kind === "damage") (e.amount as { flat: number }).flat = (maxHp * DAMAGE_PCT) / apMult;
  }
  return maxHp;
}

describe("同一 tick 的傷害不得蓋掉技能授權的擊退", () => {
  it("kbvd-authored-wins — 一支又打又推的技能，軌跡是**技能授權**的那個距離", () => {
    cover(TAG);
    const r = rig();
    armDamage(r, SHOVE_HIT);
    const path = castAndRun(r, SHOVE_HIT, 200);
    const d = travelled(r, path);

    // 技能授權的 12 單位（14 − 2 的距離減法）。一個 tick 的步長是 0.2，
    // 收尾那一格會被 `remaining` 夾住，所以容差給一格半。
    expect(d).toBeGreaterThan(AUTHORED_AFTER_GAP - 0.4);
    expect(d).toBeLessThan(AUTHORED_AFTER_GAP + 0.4);

    // 而且是**滑**過去的，不是瞬移：軌跡中段要有一個既非起點也非終點的位置。
    const mid = path[Math.floor(path.length / 4)]!;
    const fromStart = V.len(V.sub(mid, r.start));
    expect(fromStart).toBeGreaterThan(0.5);
    expect(fromStart).toBeLessThan(AUTHORED_AFTER_GAP - 0.5);
  });

  it("kbvd-damage-shove-is-an-order-of-magnitude-shorter — 兩個數字真的差很多", () => {
    cover(TAG);
    // 缺陷版本的行為 = `authoredWins: false`。這一條同時證明兩件事：
    //   · 那個後台欄位真的有作用（不是死格）
    //   · 被蓋掉之後的位移和技能授權的差了一個數量級，所以上一條斷言分得出來
    const r = rig({ authoredWins: false });
    armDamage(r, SHOVE_HIT);
    const d = travelled(r, castAndRun(r, SHOVE_HIT, 200));
    expect(d).toBeLessThan(AUTHORED_AFTER_GAP / 3);
  });

  it("kbvd-no-damage-baseline — 不造成傷害的同一支技能推的就是那個距離", () => {
    cover(TAG);
    const r = rig();
    const d = travelled(r, castAndRun(r, SHOVE_ONLY, 200));
    expect(d).toBeGreaterThan(AUTHORED_AFTER_GAP - 0.4);
    expect(d).toBeLessThan(AUTHORED_AFTER_GAP + 0.4);
  });

  it("kbvd-longer-damage-wins — `longerDamageWins` 開著時，推得更遠的那個接管", () => {
    cover(TAG);
    // 一擊打掉 100% 生命 → raw = 10 身位，減掉 GAP 之後 8… 仍然小於 12。
    // 所以把技能授權的那個縮到 3（減距離後 1），讓傷害驅動的明顯更長。
    const r = rig({ longerDamageWins: true });
    const maxHp = r.world.health.get(r.victim)!.maxHp;
    const def = Abilities.get(SHOVE_HIT);
    for (const e of def.effects) {
      // ⛔ 除掉 AP 傷害加成，理由與 `armDamage` 逐字相同：這裡要的是「打掉 99%
      //    生命」，⛔ 不是「打死他」—— 一具屍體不會被推。
      if (e.kind === "damage")
        (e.amount as { flat: number }).flat =
          (maxHp * 0.99) / apDamageMult(r.world, r.caster, `ability:${SHOVE_HIT}`);
      if (e.kind === "knockback") e.distance = 3;
    }
    const d = travelled(r, castAndRun(r, SHOVE_HIT, 200));
    // 傷害驅動的 ≈ 10 − 2 = 8（減距離用的是命中當下的距離，身體已經滑開一點，
    // 所以會略小於 8）。斷言只要求它遠遠超過技能授權的 1 單位。
    expect(d).toBeGreaterThan(4);
    // 收拾：註冊表是 beforeAll 建的共用物件。
    for (const e of def.effects) if (e.kind === "knockback") e.distance = AUTHORED_DISTANCE;
  });
});

describe("擊飛（#247 拋物線）在空中被打，不能留下孤兒 airborne", () => {
  it("kbvd-midleap-airborne — 落地後 `world.airborne` 一定被收乾淨", () => {
    cover(TAG);
    const r = rig();
    armDamage(r, SHOVE_LAUNCH);
    castAndRun(r, SHOVE_LAUNCH, 200);
    // 缺陷版本：applyImpact 直接把 LeapOverride 換成 DashOverride，
    // `world.airborne` 那一格沒有人再刪 → digest 一直 hash 它，客戶端把英雄
    // 畫在半空中（失敗形態 ①）。
    expect(r.world.airborne.has(r.victim)).toBe(false);
    expect(r.world.nav.get(r.victim)!.override).toBeNull();
  });

  it("kbvd-midleap-airborne-when-damage-wins — 傷害真的接管時也要先讓身體落地", () => {
    cover(TAG);
    // ⚠️ 這一條的存在理由是**可達性**:出貨預設下技能永遠贏,所以 `cancelLeap`
    // 那一行走不到 —— 把它刪掉上一條測試照樣綠(失敗形態 ③)。操作者只要把
    // 「技能授權的位移贏過傷害擊退」關掉,那一行就是出貨路徑,而它沒有被守。
    const r = rig({ authoredWins: false });
    armDamage(r, SHOVE_LAUNCH);
    castAndRun(r, SHOVE_LAUNCH, 200);
    expect(r.world.airborne.has(r.victim)).toBe(false);
    expect(r.world.nav.get(r.victim)!.override).toBeNull();
  });
});
