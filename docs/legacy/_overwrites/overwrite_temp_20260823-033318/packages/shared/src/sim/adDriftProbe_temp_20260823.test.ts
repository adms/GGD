/** 一次性量尺 —— 量完就刪。⛔ 不是守衛。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { Stat } from "./stats/statTypes";
import { normalizeBaseBonus, DEFAULT_BASE_BONUS } from "./baseBonus";

beforeAll(() => registerSkeletonContent());

const OPEN_ARENA: ArenaDef = {
  id: "arena.balance-open",
  name: "probe",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;
let nextSeat = 0;
function champ(w: SimWorld, id: string, x: number, z: number, team = 1): EntityId {
  return spawnChampion(w, {
    championId: id as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

function realAttacksPerSec(sheetAs: number, adGift: number | null): number {
  const w = new SimWorld(OPEN_ARENA, 31);
  if (adGift !== null) {
    w.baseBonus = normalizeBaseBonus({ ...DEFAULT_BASE_BONUS, ad: adGift });
  }
  w.combatActive = true;
  const me = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z + 12);
  const bag = champ(w, "thorne", ZONE0.center.x + 1.0, ZONE0.center.z + 12, 2);
  const sc = w.stats.get(me)!;
  const bagHp = w.health.get(bag)!;
  const bagSc = w.stats.get(bag)!;
  let hits = 0;
  for (let i = 0; i < 300; i++) {
    sc.final[Stat.AttackSpeed] = sheetAs;
    bagHp.hp = bagHp.maxHp;
    bagSc.final[Stat.MoveSpeed] = 0;
    w.step(new Map());
    for (const ev of w.events) {
      const d = ev.data as { source?: EntityId; origin?: string };
      if (ev.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return hits / 10;
}

describe("probe", () => {
  it("measures", () => {
    for (const gift of [0, 32] as const) {
      const line: string[] = [];
      for (const sheet of [2.0, 3.0, 4.0]) line.push(`as${sheet}=${realAttacksPerSec(sheet, gift)}`);
      // eslint-disable-next-line no-console
      console.log(`AD gift ${gift}: ${line.join("  ")}`);
    }
    // one-shot AD readout
    const w = new SimWorld(OPEN_ARENA, 5);
    const t = champ(w, "thorne", ZONE0.center.x, ZONE0.center.z);
    // eslint-disable-next-line no-console
    console.log("thorne final AD =", w.stats.get(t)!.final[Stat.AttackDamage]);
    expect(true).toBe(true);
  });
});
