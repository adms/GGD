import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { ZoneViewSync, type ViewClient } from "./zoneView";
import { MatchState } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import { mobRulesFromConfig, spawnMob } from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

function run(perZone: number) {
  const ctl = new MatchController("m", 3, Array.from({length:12},(_,i)=>({seatId:i,teamId:Math.floor(i/3),isBot:true})), FAST);
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  const zones = ctl.pairings.map(p=>p.zone);
  const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, 1/30, DEFAULT_MOB_WAVES_CONFIG.fromRound);
  ctl.world.mobRules = rules;
  beginCombatMobs(ctl.world, rules, zones);
  for (const z of zones) for (let i=0;i<perZone;i++) spawnMob(ctl.world, z, rules, 1, i);
  const state = new MatchState();
  const enc = new Encoder(state);
  projectSnapshot(ctl, state, new Map());

  // 12 clients: seat i -> zone by its champion's transform
  const clients: ViewClient[] = Array.from({length:12},(_,i)=>({sessionId:`s${i}`}));
  const bySession = new Map<string, number[]>();
  let i = 0;
  for (const [, seat] of ctl.seats) {
    const z = seat.entityId === null ? undefined : ctl.world.transform.get(seat.entityId)?.zone;
    if (z !== undefined) bySession.set(`s${i}`, [z]);
    i++;
  }
  const src = { ownZonesBySession: () => bySession, liveZones: () => zones };

  const cullOff = new ZoneViewSync(false);
  const offStats = cullOff.sync(state, clients.map(c=>({sessionId:c.sessionId})), src);
  Encoder.BUFFER_SIZE = 4*1024*1024;
  const buf = Buffer.allocUnsafe(Encoder.BUFFER_SIZE);
  const shared = { offset: 1 };
  enc.encodeAll(shared, buf);
  // baseline: everything view (= today's wire content)
  const offClients = clients.map(c=>({sessionId:c.sessionId})) as ViewClient[];
  cullOff.sync(state, offClients, src);
  const baseBytes = offClients.map(c => enc.encodeAllView(c.view!, shared.offset, {...shared}, buf).length);

  const cullOn = new ZoneViewSync(true);
  const onStats = cullOn.sync(state, clients, src);
  const cullBytes = clients.map(c => enc.encodeAllView(c.view!, shared.offset, {...shared}, buf).length);

  const sum = (a:number[]) => a.reduce((x,y)=>x+y,0);
  return {
    perZone, entities: onStats.total, zones: zones.length,
    baseTotal: sum(baseBytes), cullTotal: sum(cullBytes),
    entityCull: onStats.culledFraction, offCull: offStats.culledFraction,
  };
}

describe("[量到] #760 步驟 2 剔除率", () => { it("measures", () => {
  const rows = [0, 15, 50, 100, 400].map(run);
  console.log("perZone | entities | Σbytes(全量×12) | Σbytes(剔除×12) | 位元組省下 | 實體剔除率");
  for (const r of rows) {
    console.log(`${r.perZone} | ${r.entities} | ${r.baseTotal} | ${r.cullTotal} | ${((1-r.cullTotal/r.baseTotal)*100).toFixed(1)}% | ${(r.entityCull*100).toFixed(1)}%`);
  }
  expect(rows.every(r=>r.cullTotal <= r.baseTotal)).toBe(true);
}); });
