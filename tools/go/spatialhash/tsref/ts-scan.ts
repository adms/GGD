/**
 * TS mirror of tools/go/spatialhash/teamscan.go — the mob target scan.
 * Three variants, same answer, so "language" and "data structure" stay orthogonal:
 *   mapAll   — iterate the whole Map<EntityId, TeamComp>   (⭐ the shipped shape)
 *   arrAll   — iterate the whole thing as a flat array      (= Go's ScanAll)
 *   indexed  — iterate only the hostile index               (= Go's ScanIndexed)
 */
import { performance } from "node:perf_hooks";

interface Unit {
  id: number;
  teamId: number;
  zone: number;
  x: number;
  z: number;
  alive: boolean;
}
const MONSTER = -1;

function build(nMobs: number, nHeroes: number): {
  mobs: Unit[];
  teamMap: Map<number, Unit>;
  teamArr: Unit[];
  hostiles: Unit[];
} {
  const mobs: Unit[] = [];
  const teamArr: Unit[] = [];
  const hostiles: Unit[] = [];
  const teamMap = new Map<number, Unit>();
  for (let i = 0; i < nHeroes; i++) {
    const u: Unit = {
      id: i,
      teamId: i % 2,
      zone: i % 2,
      x: -40 + 80 * (i % 2) + (i % 7) - 3,
      z: (i % 9) - 4,
      alive: true,
    };
    teamArr.push(u);
    teamMap.set(u.id, u);
    hostiles.push(u);
  }
  // decoys: sitting on top of the mobs but flagged into the OTHER zone, so the
  // zone predicate is load-bearing (mirrors BuildScanWorld in teamscan.go)
  for (let i = 0; i < nHeroes; i++) {
    const u: Unit = {
      id: nHeroes + i,
      teamId: i % 2,
      zone: 1 - (i % 2),
      x: -40 + 80 * (i % 2) + (i % 3) * 0.1,
      z: (i % 3) * 0.1,
      alive: true,
    };
    teamArr.push(u);
    teamMap.set(u.id, u);
    hostiles.push(u);
  }
  for (let i = 0; i < nMobs; i++) {
    const u: Unit = {
      id: nHeroes * 2 + i,
      teamId: MONSTER,
      zone: i % 2,
      x: -40 + 80 * (i % 2) + (i % 17) * 0.7 - 6,
      z: (i % 23) * 0.7 - 8,
      alive: true,
    };
    mobs.push(u);
    teamArr.push(u);
    teamMap.set(u.id, u);
  }
  return { mobs, teamMap, teamArr, hostiles };
}

function mapAll(mobs: Unit[], team: Map<number, Unit>, out: number[]): void {
  out.length = 0;
  for (const m of mobs) {
    let best = -1;
    let target = -1;
    for (const [, c] of team) {
      if (c.teamId === m.teamId) continue;
      if (!c.alive || c.zone !== m.zone) continue;
      const dx = m.x - c.x;
      const dz = m.z - c.z;
      const d = dx * dx + dz * dz;
      if (best < 0 || d < best) {
        best = d;
        target = c.id;
      }
    }
    out.push(target);
  }
}

function scanArr(mobs: Unit[], team: Unit[], out: number[]): void {
  out.length = 0;
  for (const m of mobs) {
    let best = -1;
    let target = -1;
    for (let j = 0; j < team.length; j++) {
      const c = team[j];
      if (c.teamId === m.teamId) continue;
      if (!c.alive || c.zone !== m.zone) continue;
      const dx = m.x - c.x;
      const dz = m.z - c.z;
      const d = dx * dx + dz * dz;
      if (best < 0 || d < best) {
        best = d;
        target = c.id;
      }
    }
    out.push(target);
  }
}

function main(): void {
  const n = Number(process.env.N ?? 1000);
  const reps = Number(process.env.REPS ?? 300);
  const { mobs, teamMap, teamArr, hostiles } = build(n, 12);

  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  mapAll(mobs, teamMap, a);
  scanArr(mobs, teamArr, b);
  scanArr(mobs, hostiles, c);
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i] || a[i] !== c[i]) throw new Error(`mismatch @${i}: ${a[i]} ${b[i]} ${c[i]}`);
  console.log(`ok: three variants agree on ${a.length} targets (n=${n})`);

  const time = (f: () => void): number => {
    for (let i = 0; i < 20; i++) f();
    const t = performance.now();
    for (let i = 0; i < reps; i++) f();
    return (performance.now() - t) / reps;
  };
  const best = (f: () => void): number => Math.min(time(f), time(f), time(f));

  const tMap = best(() => mapAll(mobs, teamMap, a));
  const tArr = best(() => scanArr(mobs, teamArr, b));
  const tIdx = best(() => scanArr(mobs, hostiles, c));
  console.log(
    JSON.stringify({
      n,
      ts_mapAll_ms_per_tick: +tMap.toFixed(4),
      ts_arrAll_ms_per_tick: +tArr.toFixed(4),
      ts_indexed_ms_per_tick: +tIdx.toFixed(4),
      indexed_speedup_vs_shipped_shape: +(tMap / tIdx).toFixed(1),
    }),
  );
}

main();
