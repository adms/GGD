/**
 * ⏱ GH#1033 量測（暫存，⛔ 不是守衛；跑完就刪）—— round 1／2／3 × 開關 1／3 × idle／click，
 * 在**真的** MatchController ＋ 出貨內容上量六個消費端看得到的東西。輸出寫到 scratchpad JSON。
 */
import { describe, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { asSeatId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { FireRingConfig } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { resolveArenaRules, type ArenaRules } from "./arenaRules";
import { HumanDriver } from "../seat/HumanDriver";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../..", "content");
const OUT = "/private/tmp/claude-503/-Users-Takuro-GGD/9fdde660-96a0-4284-a21f-0bf3abe3680c/scratchpad/measure1033.json";
const SABER = "godie-e002" as ChampionId;
const ME = asSeatId(0);

const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: i !== 0,
    championId: i === 0 ? SABER : undefined,
  }));

interface RoundRow {
  knob: number;
  feed: "idle" | "click";
  round: number;
  humanSeatsHasMe: boolean;
  mobRulesNull: boolean;
  autoWaves: boolean | undefined;
  mobsMax: number;
  /** idle 計時器（`lastCommandTick`）在這一回合開打 2 tick 後有沒有值（idle feed：只有 LoL 路會寫） */
  idleTimerArmedAtStart: boolean;
  /** click feed：點地板之後 GH#637 窗口是否武裝（值 > tick） */
  windowArmed: boolean | null;
  /** 這一回合真人握著**自動**目標的 tick 數、以及第一次握到的相對 tick */
  autoHeldTicks: number;
  firstAutoTick: number | null;
  /** 真人普攻命中數／被命中數（damage 事件，origin basic） */
  hitsLanded: number;
  hitsTaken: number;
  ticks: number;
  aliveTicks: number;
}

function runMatch(knob: number, feed: "idle" | "click", base: ArenaRules, env: CombatEnvMultipliers, fr: FireRingConfig): RoundRow[] {
  const rules: ArenaRules = { ...base, humanSeatsFromRound: knob };
  const cfg = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 90 * 30, resolutionTicks: 3 };
  const ctl = new MatchController("m1033-" + knob + feed, 7919, seats(), cfg, undefined, rules, undefined, undefined, env, fr);
  const human = new HumanDriver();
  ctl.seats.get(ME)!.setDriver(human);
  const rows: RoundRow[] = [];
  for (const round of [1, 2, 3]) {
    let n = 0;
    while (!(ctl.phase.phase === "combat" && ctl.phase.round === round) && n++ < 60000) ctl.tick();
    if (ctl.phase.round !== round) break;
    ctl.tick();
    ctl.tick();
    const me = ctl.seats.get(ME)!.entityId as EntityId;
    const row: RoundRow = {
      knob,
      feed,
      round,
      humanSeatsHasMe: ctl.world.mobRules?.humanSeats?.has(ME) === true,
      mobRulesNull: ctl.world.mobRules === null,
      autoWaves: ctl.world.mobRules?.autoWaves,
      mobsMax: 0,
      idleTimerArmedAtStart: ctl.world.lastCommandTick.has(me),
      windowArmed: null,
      autoHeldTicks: 0,
      firstAutoTick: null,
      hitsLanded: 0,
      hitsTaken: 0,
      ticks: 0,
      aliveTicks: 0,
    };
    if (feed === "click") {
      const t = ctl.world.transform.get(me)!;
      const zone = ctl.world.arena.zones[t.zone] ?? ctl.world.arena.zones[0]!;
      const dx = zone.center.x - t.pos.x;
      const dz = zone.center.z - t.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      human.mailbox.push({ order: { kind: "move", point: { x: t.pos.x + (dx / len) * 3, z: t.pos.z + (dz / len) * 3 } } } as never);
      ctl.tick();
      row.ticks++;
      const until = ctl.world.moveOrderNoAggroUntil.get(me);
      row.windowArmed = until !== undefined && ctl.world.tick < until;
    }
    let guard = 0;
    while (ctl.phase.phase === "combat" && ctl.phase.round === round && guard++ < 20000) {
      ctl.tick();
      row.ticks++;
      row.mobsMax = Math.max(row.mobsMax, ctl.world.mob.size);
      const nav = ctl.world.nav.get(me);
      const hp = ctl.world.health.get(me);
      if (hp?.alive) row.aliveTicks++;
      if (nav?.attackTarget != null && nav.attackTargetAuto) {
        row.autoHeldTicks++;
        if (row.firstAutoTick === null) row.firstAutoTick = row.ticks;
      }
      for (const e of ctl.world.events) {
        if (e.type !== "damage") continue;
        const d = e.data as { source?: EntityId; target?: EntityId; origin?: string };
        if (d.origin !== "basic") continue;
        if (d.source === me) row.hitsLanded++;
        if (d.target === me) row.hitsTaken++;
      }
    }
    rows.push(row);
  }
  return rows;
}

describe("GH#1033 量測（暫存）", () => {
  it("round 1／2／3 × 開關 1／3 × idle／click", async () => {
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
    const doc = JSON.parse(readFileSync(join(CONTENT, "config/config.match.json"), "utf8")) as { match: { fireRing: FireRingConfig } };
    const env = normalizeCombatEnv(
      (JSON.parse(readFileSync(join(CONTENT, "config/combat-env.json"), "utf8")) as { multipliers: Record<string, number> }).multipliers,
    );
    const base = resolveArenaRules();
    const rows: RoundRow[] = [];
    for (const knob of [1, 3]) for (const feed of ["idle", "click"] as const) rows.push(...runMatch(knob, feed, base, env, doc.match.fireRing));
    writeFileSync(OUT, JSON.stringify({ shipped: { humanSeatsFromRound: base.humanSeatsFromRound, mobWavesFromRound: base.mobWaves?.fromRound }, rows }, null, 2));
    console.log(JSON.stringify(rows));
  }, 600_000);
});
