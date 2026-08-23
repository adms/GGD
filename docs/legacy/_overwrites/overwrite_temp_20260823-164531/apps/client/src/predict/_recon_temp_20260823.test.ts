/** RECON ONLY — deleted before commit. Measures client↔server movement parity. */
import { beforeAll, describe, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { arenaDefFromDoc, SKELETON_ARENA, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { baseBonusFromDoc, perLevelBonusFromDoc } from "@ggd/shared/sim/baseBonus";
import { statCapsFromDoc } from "@ggd/shared/sim/statCaps";
import { bodyScaleRulesFromDoc } from "@ggd/shared/sim/bodyScale";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { ModOp } from "@ggd/shared/sim/stats/modifiers";
import { predictedMoveSpeed } from "./predictedStats";
import { LocalPrediction } from "./LocalPrediction";
import { asSeatId, asTeamId, type ChampionId, type ItemId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(ROOT, "content");

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

function shippedEnv() {
  const doc = Configs.tryGet("combat-env") as { multipliers?: Record<string, number> } | undefined;
  return normalizeCombatEnv(doc?.multipliers ?? {});
}

/** exactly GameApp.computeAttackRange */
function clientRange(championId: string, env: ReturnType<typeof shippedEnv>): number {
  const def = Champions.tryGet(championId as ChampionId);
  let range = def?.baseStats[Stat.AttackRange] ?? 0;
  return Math.max(0, range * env.attackRange);
}

function newWorld(arena: ArenaDef): SimWorld {
  const w = new SimWorld(arena, 1);
  w.combatEnv = shippedEnv();
  w.baseBonus = baseBonusFromDoc(Configs.tryGet("base-bonus"));
  w.perLevelBonus = perLevelBonusFromDoc(Configs.tryGet("per-level-bonus"));
  w.caps = statCapsFromDoc(Configs.tryGet("stat-caps"));
  w.bodyScaleRules = bodyScaleRulesFromDoc(Configs.tryGet("body-scale"));
  return w;
}

const LEVEL = 6;

describe("RECON", () => {
  it("A) 每一位英雄：客戶端預測 vs 伺服器真值（移速 / 射程）", () => {
    const env = shippedEnv();
    const rows: string[] = [];
    let msBad = 0, rangeBad = 0;
    for (const cid of Champions.ids().map(String)) {
      const w = newWorld(SKELETON_ARENA);
      const c = SKELETON_ARENA.zones[0]!.center;
      const id = spawnChampion(w, {
        championId: cid as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
        pos: { x: c.x, z: c.z }, zone: 0, level: LEVEL,
      });
      w.step(new Map());
      const sMs = w.stats.get(id)!.final[Stat.MoveSpeed];
      const sRg = w.stats.get(id)!.final[Stat.AttackRange];
      const cMs = predictedMoveSpeed(cid, [], env);
      const cRg = clientRange(cid, env);
      const def = Champions.tryGet(cid as ChampionId)!;
      if (Math.abs(sMs - cMs) > 1e-9) msBad++;
      if (Math.abs(sRg - cRg) > 1e-9) {
        rangeBad++;
        rows.push(`  RANGE ${cid} bodyScale=${(def as any).bodyScale ?? 1} at=${def.attackType} server=${sRg.toFixed(4)} client=${cRg.toFixed(4)} ratio=${(sRg / (cRg || 1)).toFixed(4)}`);
      }
    }
    console.log(`\n[A] champions=${Champions.ids().length} moveSpeed mismatches=${msBad} attackRange mismatches=${rangeBad}`);
    console.log(rows.slice(0, 30).join("\n"));
  });

  it("B) 每一張出貨場地：影子 vs 權威 走一趟全場", () => {
    const env = shippedEnv();
    const files = readdirSync(join(CONTENT, "arenas")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    const cid = Champions.ids().map(String).find((c) => Champions.tryGet(c as ChampionId)?.attackType === "melee")!;
    const out: string[] = [];
    for (const f of files) {
      const doc = JSON.parse(readFileSync(join(CONTENT, "arenas", f), "utf8"));
      const arena = arenaDefFromDoc(doc);
      for (let zi = 0; zi < arena.zones.length; zi++) {
        const z = arena.zones[zi]!;
        const spawn = z.spawns[0][0]!;
        const target = z.spawns[1][0] ?? { x: z.center.x, z: z.center.z };
        const w = newWorld(arena);
        const seat = asSeatId(0);
        const id = spawnChampion(w, {
          championId: cid as ChampionId, seatId: seat, teamId: asTeamId(0),
          pos: { x: spawn.x, z: spawn.z }, zone: zi, level: LEVEL,
        });
        w.step(new Map());
        const pred = new LocalPrediction(SKELETON_ARENA);
        pred.setArena(arena);
        pred.spawn({
          seatId: 0, pos: { x: spawn.x, z: spawn.z }, zone: zi,
          moveSpeed: predictedMoveSpeed(cid, [], env),
          attackRange: clientRange(cid, env),
          championId: cid,
        });
        const order: Order = { kind: "move", point: { x: target.x, z: target.z } };
        let maxErr = 0, teleports = 0, errAtEnd = 0;
        let maxErrNoRecon = 0;
        // (i) with per-tick reconcile, like the shipped loop
        for (let t = 0; t < 240; t++) {
          if (t === 0) pred.recordInput(1, order);
          pred.stepTick();
          const sh = pred.predictedPos!;
          const intents = new Map<SeatId, IntentFrame>();
          intents.set(seat, t === 0 ? { order, commands: [] } : { commands: [] });
          w.step(intents);
          const st = w.transform.get(id)!.pos;
          const e = Math.hypot(st.x - sh.x, st.z - sh.z);
          if (e > 6) teleports++;
          maxErr = Math.max(maxErr, e);
          errAtEnd = e;
          pred.reconcile({ x: st.x, z: st.z }, 1);
        }
        // (ii) free-running divergence (no reconcile) — shows raw formula gap
        {
          const w2 = newWorld(arena);
          const id2 = spawnChampion(w2, {
            championId: cid as ChampionId, seatId: seat, teamId: asTeamId(0),
            pos: { x: spawn.x, z: spawn.z }, zone: zi, level: LEVEL,
          });
          w2.step(new Map());
          const p2 = new LocalPrediction(SKELETON_ARENA);
          p2.setArena(arena);
          p2.spawn({
            seatId: 0, pos: { x: spawn.x, z: spawn.z }, zone: zi,
            moveSpeed: predictedMoveSpeed(cid, [], env),
            attackRange: clientRange(cid, env), championId: cid,
          });
          for (let t = 0; t < 240; t++) {
            if (t === 0) p2.recordInput(1, order);
            p2.stepTick();
            const intents = new Map<SeatId, IntentFrame>();
            intents.set(seat, t === 0 ? { order, commands: [] } : { commands: [] });
            w2.step(intents);
            const st = w2.transform.get(id2)!.pos;
            const sh = p2.predictedPos!;
            maxErrNoRecon = Math.max(maxErrNoRecon, Math.hypot(st.x - sh.x, st.z - sh.z));
          }
        }
        out.push(
          `  ${f.replace("arena.", "").replace(".json", "").padEnd(18)} z${zi} nav=${z.nav ? "Y" : "n"} boxes=${z.obstacles.filter((o) => o.kind === "box").length} r=${z.boundaryRadius} bounds=${z.bounds?.kind ?? "disc"} | maxErr=${maxErr.toFixed(3)} tp=${teleports} end=${errAtEnd.toFixed(3)} | freeRun=${maxErrNoRecon.toFixed(3)}`,
        );
      }
    }
    console.log("\n[B] 影子 vs 權威（走一趟全場，240 tick = 8 秒）");
    console.log(out.join("\n"));
  });
});
