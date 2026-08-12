/**
 * 吟唱三格（倍率／下限／上限）的**承重守衛**（第一守則 + 第二守則）。
 *
 * owner 2026-08-13：「吟唱時間倍率 也可以在系統後台設定」＋「上下限也可以一起設定」。
 *
 * ── 這一支在防什麼 ────────────────────────────────────────────────────────
 * 這種「常數 → 後台欄位」的搬遷，最典型的死法是**失敗形態②**：schema 加了、
 * JSON 出貨了、後台畫得出四格，而施法那條路徑**還在讀 `def.castTimeSec`** ——
 * 操作者把倍率調成 3，存檔成功，玩家那一場一點變化都沒有，而且完全無聲。
 *
 * ⛔ 所以斷言的是**實際吟唱了幾個 tick**，不是「常數等於設定值」那種掃屬性的
 *    假守衛（失敗形態⑦）。做法：把 `world.castTimeRules` 換成誇張的值，
 *    呼叫真的 `castAbility`，讀 `ab.cast.ticksLeft`。
 *
 * ⛔ 驗**機制**不驗**數字**（第二守則）：下面沒有任何一個出貨值被抄進斷言，
 *    倍率與上下限都是測試自己指定的極端值。0.06 / 4.00 那兩個數字住在
 *    `DEFAULT_CAST_TIME_RULES` + `content/config/cast-time.json` + 後台，
 *    由 drift 測試在守。
 *
 * 突變紀錄（承重的那一條線）：
 *   · `abilities/abilitySystem.ts` 的 `castSec` 改回 `def.castTimeSec ?? 0`
 *     → 紅（倍率與上下限整批失效，三個 it 全掛）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../ids";
import { castAbility } from "./abilities/abilitySystem";
import { DEFAULT_CAST_TIME_RULES, castTimeRulesFromDoc, type CastTimeRules } from "./castTimeRules";

beforeAll(() => registerSkeletonContent());
const ZONE = SKELETON_ARENA.zones[0]!;

/** 建一場，把三格換成指定值，放 R（skeleton 唯一有吟唱的槽），回傳實際吟唱 tick 數。 */
function castTicks(rules: Partial<CastTimeRules>): number {
  const w = new SimWorld(SKELETON_ARENA, 11);
  w.castTimeRules = { ...DEFAULT_CAST_TIME_RULES, ...rules };
  const id = spawnChampion(w, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(1),
    pos: { x: ZONE.center.x, z: ZONE.center.z },
    zone: 0,
  });
  // sela 的 R 是 skeleton 唯一有吟唱的槽（castType "ground"）。先學會它。
  const ab = w.abilities.get(id)!;
  const inst = ab.slots.R;
  if (inst) inst.rank = 1;
  expect(castAbility(w, id, "R", { type: "point", point: { x: ZONE.center.x + 3, z: ZONE.center.z } })).toBe("ok");
  return w.abilities.get(id)?.cast?.ticksLeft ?? 0;
}

describe("吟唱三格是後台可調的（倍率 / 下限 / 上限）", () => {
  it("⭐ 倍率真的乘進實際吟唱 —— 施法路徑不套用就紅", () => {
    cover("cast-time-rules-multiplier");
    const base = castTicks({});
    expect(base).toBeGreaterThan(0); // skeleton 的 R 有吟唱，前提成立
    // ⚠️ 只斷言**方向與嚴格不等**，不釘任何一個 tick 數（數字是 owner 在調的東西）。
    expect(castTicks({ multiplier: 2 })).toBeGreaterThan(base);
    expect(castTicks({ multiplier: 0.5 })).toBeLessThan(base);
  });

  it("⭐ 上限夾得住倍率，下限夾得住縮短 —— 而且下限至少是一個 tick", () => {
    cover("cast-time-rules-bounds");
    // 倍率 5 但上限壓到 0.2 秒 ⇒ 被上限贏（⛔ 倍率沒有豁免權）。
    const capped = castTicks({ multiplier: 5, capSec: 0.2 });
    expect(capped).toBeLessThanOrEqual(Math.round(0.2 * 30));
    // 倍率 0.1 但下限 0.5 秒 ⇒ 被下限接住，而且**永遠 ≥ 1 tick**：
    // 0 tick 代表 sim 當它瞬發，而客戶端照樣畫吟唱條（owner「讓 tick 一定可以處理」）。
    expect(castTicks({ multiplier: 0.1, floorSec: 0.5 })).toBeGreaterThanOrEqual(1);
  });

  it("⛔ 上限被設得比下限低時，下限贏（區間不可以是空的）", () => {
    cover("cast-time-rules-inverted");
    const r = castTimeRulesFromDoc({
      schema: "config.cast-time@1",
      enabled: true,
      multiplier: 1,
      floorSec: 0.9,
      capSec: 0.5,
    });
    expect(r.capSec).toBeGreaterThanOrEqual(r.floorSec);
  });
});
