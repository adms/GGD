/** RECON ONLY — deleted before commit. Round 2. */
import { beforeAll, describe, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { baseBonusFromDoc, perLevelBonusFromDoc, finalizeStat } from "@ggd/shared/sim/baseBonus";
import { statCapsFromDoc, DEFAULT_STAT_CAPS, capCeiling } from "@ggd/shared/sim/statCaps";
import { bodyScaleRulesFromDoc, attackRangeScaleFactor } from "@ggd/shared/sim/bodyScale";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { predictedMoveSpeed } from "./predictedStats";
import { LocalPrediction } from "./LocalPrediction";
import { TimeSync } from "../net/TimeSync";
import { InterpolationBuffer } from "../net/InterpolationBuffer";
import { TICK_MS, SNAPSHOT_MS, INTERP_DELAY_MS } from "@ggd/shared/constants";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

function shippedEnv() {
  const doc = Configs.tryGet("combat-env") as { multipliers?: Record<string, number> } | undefined;
  return normalizeCombatEnv(doc?.multipliers ?? {});
}
function newWorld() {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatEnv = shippedEnv();
  w.baseBonus = baseBonusFromDoc(Configs.tryGet("base-bonus"));
  w.perLevelBonus = perLevelBonusFromDoc(Configs.tryGet("per-level-bonus"));
  w.caps = statCapsFromDoc(Configs.tryGet("stat-caps"));
  w.bodyScaleRules = bodyScaleRulesFromDoc(Configs.tryGet("body-scale"));
  return w;
}
const C = SKELETON_ARENA.zones[0]!.center;
const LEVEL = 6;

describe("RECON2", () => {
  it("A) 移速不一致的那一位是誰、差在哪", () => {
    const env = shippedEnv();
    const caps = statCapsFromDoc(Configs.tryGet("stat-caps"));
    for (const cid of Champions.ids().map(String)) {
      const w = newWorld();
      const id = spawnChampion(w, {
        championId: cid as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
        pos: { x: C.x, z: C.z }, zone: 0, level: LEVEL,
      });
      w.step(new Map());
      const s = w.stats.get(id)!.final[Stat.MoveSpeed];
      const c = predictedMoveSpeed(cid, [], env);
      if (Math.abs(s - c) > 1e-9) {
        const def = Champions.tryGet(cid as ChampionId)!;
        const subject = { attackType: def.attackType };
        console.log(`\n[A] ${cid} name=${def.name} at=${def.attackType} baseMs=${def.baseStats[Stat.MoveSpeed]}`);
        console.log(`    server=${s}  client=${c}  diff=${(s - c).toFixed(6)} (${(((s - c) / c) * 100).toFixed(1)}%)`);
        console.log(`    ceiling(shipped caps)=${capCeiling(caps, Stat.MoveSpeed, 0, env, subject)}`);
        console.log(`    ceiling(DEFAULT caps)=${capCeiling(DEFAULT_STAT_CAPS, Stat.MoveSpeed, 0, env, subject)}`);
        console.log(`    raw finalize w/ shipped caps=${finalizeStat(def.baseStats[Stat.MoveSpeed]!, Stat.MoveSpeed, { env, subject, caps })}`);
      }
    }
  });

  it("B) 射程差 → 追擊時的位置差（影子 vs 權威）", () => {
    const env = shippedEnv();
    for (const cid of ["godie-o030", "godie-ubal", "godie-umal"]) {
      const def = Champions.tryGet(cid as ChampionId);
      if (!def) continue;
      const w = newWorld();
      const me = asSeatId(0);
      const id = spawnChampion(w, {
        championId: cid as ChampionId, seatId: me, teamId: asTeamId(0),
        pos: { x: C.x - 15, z: C.z }, zone: 0, level: LEVEL,
      });
      const foe = spawnChampion(w, {
        championId: cid as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
        pos: { x: C.x + 5, z: C.z }, zone: 0, level: LEVEL,
      });
      w.step(new Map());
      const sRange = w.stats.get(id)!.final[Stat.AttackRange];
      const cRange = Math.max(0, (def.baseStats[Stat.AttackRange] ?? 0) * env.attackRange);
      const bs = (def as unknown as { bodyScale?: number }).bodyScale ?? 1;
      const rs = attackRangeScaleFactor(bs, bodyScaleRulesFromDoc(Configs.tryGet("body-scale")));
      // 伺服器追到 reach*0.9；影子（若接得到目標）會追到 clientRange*0.9
      const stopS = Math.max(sRange, 0.6 + 0.6 + 0.1) * 0.9;
      const stopC = Math.max(cRange, 0.6 + 0.6 + 0.1) * 0.9;
      console.log(`\n[B] ${cid} bodyScale=${bs} rangeScale=${rs} server=${sRange.toFixed(3)} client=${cRange.toFixed(3)} stopΔ=${(stopS - stopC).toFixed(3)}u`);
      // 伺服器實際跑一趟追擊，看最後停在哪
      const order: Order = { kind: "attack", targetId: foe };
      for (let t = 0; t < 180; t++) {
        const intents = new Map<SeatId, IntentFrame>();
        intents.set(me, t === 0 ? { order, commands: [] } : { commands: [] });
        w.step(intents);
      }
      const a = w.transform.get(id)!.pos, b = w.transform.get(foe)!.pos;
      console.log(`    伺服器追擊後距離=${Math.hypot(a.x - b.x, a.z - b.z).toFixed(3)}u`);
    }
  });

  it("C) 插值墊子餘裕分布（TimeSync + InterpolationBuffer，真實抖動）", () => {
    for (const jitterMs of [0, 5, 15, 30, 60]) {
      let rng = 12345;
      const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      const ts = new TimeSync();
      const buf = new InterpolationBuffer();
      let frozen = 0, frames = 0, minMargin = Infinity;
      let sumMargin = 0;
      const margins: number[] = [];
      let newest = 0;
      // 900 snapshots = 30 秒
      for (let n = 0; n < 900; n++) {
        const sendMs = n * SNAPSHOT_MS;
        const arriveMs = sendMs + rand() * jitterMs;
        ts.noteServerTick(n, arriveMs);
        buf.push(1, { tick: n, x: n * 0.2, z: 0, fx: 1, fz: 0 });
        newest = n;
        // 兩幀 render（60fps）
        for (let f = 0; f < 2; f++) {
          const nowMs = arriveMs + f * (SNAPSHOT_MS / 2);
          const rt = ts.renderTick(nowMs, INTERP_DELAY_MS);
          const margin = newest - rt; // >0 = 還有墊子；<=0 = 夾住＝凍住
          if (n > 60) {
            frames++;
            margins.push(margin);
            sumMargin += margin;
            minMargin = Math.min(minMargin, margin);
            if (margin <= 0) frozen++;
          }
        }
      }
      margins.sort((a, b) => a - b);
      const p = (q: number) => margins[Math.floor(q * (margins.length - 1))]!;
      console.log(
        `[C] jitter=${String(jitterMs).padStart(2)}ms  墊子(tick): min=${minMargin.toFixed(2)} p1=${p(0.01).toFixed(2)} p50=${p(0.5).toFixed(2)} mean=${(sumMargin / frames).toFixed(2)}  凍住幀=${frozen}/${frames} (${((frozen / frames) * 100).toFixed(1)}%)`,
      );
    }
    console.log(`    TICK_MS=${TICK_MS.toFixed(3)} SNAPSHOT_MS=${SNAPSHOT_MS.toFixed(3)} INTERP_DELAY_MS=${INTERP_DELAY_MS} → ${(INTERP_DELAY_MS / SNAPSHOT_MS).toFixed(2)} 個間隔`);
  });

  it("D) 影子在 attack 訂單下會不會跟權威分岔", () => {
    const env = shippedEnv();
    const cid = "godie-o030";
    if (!Champions.tryGet(cid as ChampionId)) return;
    const w = newWorld();
    const me = asSeatId(0);
    const id = spawnChampion(w, {
      championId: cid as ChampionId, seatId: me, teamId: asTeamId(0),
      pos: { x: C.x - 15, z: C.z }, zone: 0, level: LEVEL,
    });
    const foe = spawnChampion(w, {
      championId: cid as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
      pos: { x: C.x + 5, z: C.z }, zone: 0, level: LEVEL,
    });
    w.step(new Map());
    const pred = new LocalPrediction(SKELETON_ARENA);
    pred.spawn({
      seatId: 0, pos: { x: C.x - 15, z: C.z }, zone: 0,
      moveSpeed: predictedMoveSpeed(cid, [], env),
      attackRange: Math.max(0, (Champions.get(cid as ChampionId).baseStats[Stat.AttackRange] ?? 0) * env.attackRange),
      championId: cid,
    });
    const order: Order = { kind: "attack", targetId: foe };
    let maxErr = 0, tp = 0;
    for (let t = 0; t < 180; t++) {
      if (t === 0) pred.recordInput(1, order);
      pred.stepTick();
      const intents = new Map<SeatId, IntentFrame>();
      intents.set(me, t === 0 ? { order, commands: [] } : { commands: [] });
      w.step(intents);
      const st = w.transform.get(id)!.pos, sh = pred.predictedPos!;
      const e = Math.hypot(st.x - sh.x, st.z - sh.z);
      if (e > 6) tp++;
      maxErr = Math.max(maxErr, e);
      pred.reconcile({ x: st.x, z: st.z }, 1);
    }
    console.log(`\n[D] attack 訂單：maxErr=${maxErr.toFixed(3)} teleports=${tp}`);
  });
});
