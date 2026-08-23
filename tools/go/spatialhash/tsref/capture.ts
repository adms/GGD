/**
 * Capture a REAL SpatialHash op-trace out of the shipped sim (read-only: the
 * class is not touched, the *instance* methods are wrapped from outside).
 *
 * Output: /private/tmp/.../trace-<N>.jsonl  — one op per line, in call order.
 *   ["c"]                          clear()
 *   ["i", id, x, z, r]             insertCircle(id, {x,z}, r)
 *   ["b", id, minx, minz, maxx, maxz]  insert(id, aabb)   (raw AABB inserts)
 *   ["q", minx, minz, maxx, maxz, [ids...]]  queryAABB(min,max) -> ids
 */
import path from "node:path";
import fs from "node:fs";
import { ContentLoader } from "../../../../packages/shared/src/content/loader";
import { registerAll, Configs } from "../../../../packages/shared/src/content/registries";
import { FsContentSource } from "../../../../packages/shared/src/content/node/FsContentSource";
import { SimWorld } from "../../../../packages/shared/src/sim/SimWorld";
import { SKELETON_ARENA } from "../../../../packages/shared/src/sim/world/ArenaDef";
import { spawnChampion } from "../../../../packages/shared/src/sim/spawnChampion";
import { mobRulesFromConfig } from "../../../../packages/shared/src/sim/mobs";
import { beginCombatMobs } from "../../../../packages/shared/src/sim/systems/MobSystem";
import { asSeatId, asTeamId, type ChampionId } from "../../../../packages/shared/src/ids";

const REPO = process.env.GGD_REPO ?? path.resolve(__dirname, "../../../..");
const OUT = process.env.OUT ?? "/private/tmp/trace.jsonl";

async function main(): Promise<void> {
  const res = await new ContentLoader(new FsContentSource(path.join(REPO, "content"))).load();
  registerAll(res.store);
  const mobWaves = (Configs.get("arena-rules") as any).mobWaves;

  const cap = Number(process.env.CAP ?? 494);
  const warm = Number(process.env.WARM ?? 200);
  const capture = Number(process.env.CAPTURE ?? 5);

  const w = new SimWorld(SKELETON_ARENA, 12345);
  w.combatActive = true;
  const champs = ["thorne", "sela"];
  let seat = 0;
  for (const zone of [0, 1]) {
    const cx = zone === 0 ? -40 : 40;
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < 3; i++) {
        spawnChampion(w, {
          championId: champs[i % champs.length] as ChampionId,
          seatId: asSeatId(seat++),
          teamId: asTeamId(team),
          pos: { x: cx + (team === 0 ? -14 : 14), z: -4 + i * 4 },
          zone,
        });
      }
    }
  }
  const rules = mobRulesFromConfig(
    {
      ...mobWaves,
      maxAlivePerZone: cap,
      mobsPerWaveCap: cap,
      schedule: [],
      firstWaveSec: 0.1,
      waveIntervalSec: 0.2,
      boss: { ...mobWaves.boss, enabled: false },
      special: { ...mobWaves.special, chancePercent: 0 },
    },
    w.dt,
    cap,
  );
  beginCombatMobs(w, rules, [0, 1]);
  for (let i = 0; i < warm; i++) w.step(new Map());

  // ---- wrap the live instance ----
  const grid = w.grid as any;
  const realClear = grid.clear.bind(grid);
  const realInsert = grid.insert.bind(grid);
  const realInsertCircle = grid.insertCircle.bind(grid);
  const realQuery = grid.queryAABB.bind(grid);
  const lines: string[] = [];
  let on = false;
  grid.clear = (): void => {
    if (on) lines.push('["c"]');
    realClear();
  };
  // ⚠️ insertCircle() calls this.insert() internally → without this guard the
  // trace records BOTH and every replay double-inserts every entity.
  let inCircle = 0;
  grid.insert = (id: number, b: any): void => {
    if (on && inCircle === 0) lines.push(JSON.stringify(["b", id, b.min.x, b.min.z, b.max.x, b.max.z]));
    realInsert(id, b);
  };
  grid.insertCircle = (id: number, c: any, r: number): void => {
    if (on) lines.push(JSON.stringify(["i", id, c.x, c.z, r]));
    inCircle++;
    try {
      realInsertCircle(id, c, r);
    } finally {
      inCircle--;
    }
  };
  grid.queryAABB = (min: any, max: any): number[] => {
    const out = realQuery(min, max);
    if (on) lines.push(JSON.stringify(["q", min.x, min.z, max.x, max.z, out]));
    return out;
  };

  on = true;
  for (let i = 0; i < capture; i++) w.step(new Map());
  on = false;

  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  const q = lines.filter((l) => l.startsWith('["q"'));
  const ins = lines.filter((l) => l.startsWith('["i"') || l.startsWith('["b"'));
  let cand = 0;
  for (const l of q) cand += (JSON.parse(l)[5] as number[]).length;
  console.log(
    `ents=${w.transform.size} mobs=${w.mob.size} ticks=${capture} ops=${lines.length} inserts=${ins.length} queries=${q.length} avgHits=${(cand / Math.max(1, q.length)).toFixed(2)} out=${OUT}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
