import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, asTeamId, type TeamId } from "@ggd/shared/ids";
import { Champions } from "@ggd/shared/sim/content/registry";
import { Configs } from "@ggd/shared/content";
import { heroStartLevel } from "@ggd/shared/content/schema/config/match";
import { MatchController, type SeatSpec } from "./MatchController";
import { PhaseMachine } from "./PhaseMachine";
import { pairTeams, livesLost, teamHealthLost, FINAL_ROUND, HIGH_STAKES_REWARD } from "./PairedDuels";
import { MatchState } from "@ggd/shared/protocol/schema";
import { projectSnapshot } from "../net/snapshot";
import { HumanDriver } from "../seat/HumanDriver";
import { AIDriver } from "../ai/Tier0Brain";
import { InputMailbox } from "../seat/InputMailbox";
import { sign, verify, mintTicket, verifyTicket } from "../auth/hmac";

/** Fast phase config so full matches run in a few thousand ticks. */
const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 30,
  combatMaxTicks: 1200,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
  }));

function runToEnd(ctl: MatchController, maxTicks = 60000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < maxTicks) {
    ctl.tick();
    n++;
  }
  return n;
}

describe("PhaseMachine (match-01)", () => {
  it("walks champSelect -> [intermission -> combat -> resolution]* and rounds increment", () => {
    cover("phase-machine-transitions");
    const pm = new PhaseMachine(FAST);
    expect(pm.phase).toBe("champSelect");
    expect(pm.round).toBe(0);
    pm.advance();
    expect(pm.phase).toBe("intermission");
    expect(pm.round).toBe(1);
    pm.advance();
    expect(pm.phase).toBe("combat");
    pm.advance();
    expect(pm.phase).toBe("resolution");
    pm.advance();
    expect(pm.phase).toBe("intermission");
    expect(pm.round).toBe(2);
    pm.end();
    expect(pm.phase).toBe("matchEnd");
  });
});

describe("PairedDuels (match-02, match-03)", () => {
  it("4-team round-robin rotates; 3 teams get a rotating bye; 2 teams single duel", () => {
    cover("paired-duels-pairing");
    const four = [0, 1, 2, 3].map(asTeamId);
    const r1 = pairTeams(four, 1);
    const r2 = pairTeams(four, 2);
    const r3 = pairTeams(four, 3);
    const key = (p: { sideA: TeamId; sideB: TeamId }): string => `${p.sideA}v${p.sideB}`;
    // every team appears exactly once per round
    for (const r of [r1, r2, r3]) {
      const seen = new Set(r.pairings.flatMap((p) => [p.sideA, p.sideB]));
      expect(seen.size).toBe(4);
      expect(r.bye).toBeNull();
    }
    // schedules differ across the 3-round cycle
    expect(new Set([...r1.pairings.map(key), ...r2.pairings.map(key), ...r3.pairings.map(key)]).size).toBe(6);
    // round 4 repeats round 1
    expect(pairTeams(four, 4).pairings.map(key)).toEqual(r1.pairings.map(key));

    const three = [0, 2, 3].map(asTeamId);
    const byes = [1, 2, 3].map((r) => pairTeams(three, r).bye);
    expect(new Set(byes).size).toBe(3); // bye rotates
    for (let r = 1; r <= 3; r++) {
      expect(pairTeams(three, r).pairings).toHaveLength(1);
    }

    const two = [1, 3].map(asTeamId);
    expect(pairTeams(two, 5).pairings).toEqual([{ zone: 0, sideA: 1, sideB: 3 }]);
  });

  it("team health lost escalates by round band", () => {
    cover("paired-duels-lives");
    // Arena's bands, exactly: −2 for rounds 1-3, −4 for 4-6, −6 at 7.
    expect(teamHealthLost(1)).toBe(2);
    expect(teamHealthLost(3)).toBe(2);
    expect(teamHealthLost(4)).toBe(4);
    expect(teamHealthLost(6)).toBe(4);
    expect(teamHealthLost(7)).toBe(6);
    // …and GGD's one addition: it keeps climbing past 7, because at 3 alive
    // teams `pairTeams` hands out a bye and only 1 team in 3 takes damage.
    // Held flat at −6 the tail grinds; see the derivation in PairedDuels.ts.
    expect(teamHealthLost(8)).toBe(9);
    expect(teamHealthLost(9)).toBe(12);
    // The cost MUST eventually exceed the High Stakes reward, or a team that
    // keeps winning gains health faster than losing can take it away and the
    // match has no bound. Crossover is round 11.
    expect(teamHealthLost(10)).toBeLessThanOrEqual(HIGH_STAKES_REWARD);
    expect(teamHealthLost(11)).toBeGreaterThan(HIGH_STAKES_REWARD);
    // `livesLost` is the deprecated alias and must stay pointed at the same fn.
    expect(livesLost).toBe(teamHealthLost);
  });
});

describe("full bot match (match-04, match-09, match-10)", () => {
  it("12 bots run to matchEnd with placements 1-4 and lives decrement", () => {
    cover("match-full-bots");
    cover("combat-resolution");
    const ctl = new MatchController("m1", 1234, allBots(), FAST);
    const ticks = runToEnd(ctl);
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ticks).toBeLessThan(60000);
    expect(ctl.result).not.toBeNull();

    const placements = ctl.result!.teams.map((t) => t.placement).sort();
    expect(placements).toEqual([1, 2, 3, 4]);
    // THE WINNER IS THE FINALE'S SURVIVOR, NOT THE LAST TEAM WITH HEALTH.
    // This assertion used to read "exactly one team still has lives"; since the
    // owner's 2026-07-27 ruling nobody is eliminated, so several teams can (and
    // usually do) finish with health left. Place 1 belongs to whoever survived
    // round FINAL_ROUND — possibly a team on 0 health, which is the design.
    expect(ctl.royaleWinner).not.toBeNull();
    expect(ctl.placements.get(ctl.royaleWinner!)).toBe(1);
    // the match ran the FULL ten rounds and stopped there
    expect(ctl.result!.rounds).toBe(FINAL_ROUND);
    const totalKills = [...ctl.kills.values()].reduce((a, b) => a + b, 0);
    expect(totalKills).toBeGreaterThan(0);
  });

  it("same seed + same specs -> identical result (match-10)", () => {
    cover("match-deterministic");
    const run = (): string => {
      const ctl = new MatchController("m1", 4242, allBots(), FAST);
      runToEnd(ctl);
      return JSON.stringify({
        r: ctl.result?.teams.map((t) => ({ p: t.placement, k: t.members.map((m) => m.kills) })),
        rounds: ctl.result?.rounds,
        digest: ctl.world.digest(),
      });
    };
    expect(run()).toBe(run());
  });
});

describe("round settle freezes combat (#100, match-settle-freeze)", () => {
  it("combat ACTUALLY STOPS at settle — no attacks/casts/damage through resolution + intermission", () => {
    cover("match-settle-freeze");
    // Long combat window so the round only ends when WE settle it (not a wipe or
    // the timer), and a LONG resolution so we can watch the whole frozen scene
    // without the next round's combat re-arming (a fresh enterCombat is the only
    // thing that legitimately un-freezes the fighters).
    const cfg = { champSelectTicks: 1, intermissionTicks: 400, combatMaxTicks: 3000, resolutionTicks: 300 };
    const ctl = new MatchController("settle", 9182, allBots(), cfg);

    // into round-1 combat
    while (ctl.phase.phase !== "combat") ctl.tick();

    const champIds = [...ctl.seats.values()].filter((s) => s.entityId !== null).map((s) => s.entityId!);
    const anyHurt = (): boolean =>
      champIds.some((id) => {
        const hp = ctl.world.health.get(id)!;
        return hp.hp < hp.maxHp;
      });

    // let the duels actually engage: run until a champion has taken damage, so
    // the fighters are adjacent & mid-brawl (a NON-freeze would keep dealing it).
    let guard = 0;
    while (!anyHurt() && ctl.phase.phase === "combat" && guard++ < 8000) ctl.tick();
    expect(ctl.phase.phase).toBe("combat");
    expect(anyHurt()).toBe(true);

    // SETTLE the round with everyone still alive (timer-style HP% decision, no
    // wipe): skipPhase in combat runs checkCombatEnd(true) + concludeCombat +
    // advance. This is the exact seam where, before #100, the phase moved on but
    // the bots kept trading blows for ~65s.
    expect(ctl.applyCheat(asSeatId(0), { kind: "skipPhase" })).toBe(true);
    expect(ctl.phase.phase).toBe("resolution");
    expect(ctl.world.combatActive).toBe(false);

    // freeze latched instantly: nobody is mid-swing / mid-cast / chasing
    for (const id of champIds) {
      const ab = ctl.world.abilities.get(id)!;
      expect(ab.cast).toBeNull();
      expect(ab.windup).toBeNull();
      expect(ctl.world.nav.get(id)!.attackTarget).toBeNull();
    }

    // Watch ~200 ticks (well inside the 300-tick resolution). Combat must never
    // re-arm: no champion may enter a wind-up or a cast or re-acquire a target,
    // and the running damage total must not climb once any in-flight projectile
    // (launched BEFORE the settle) has landed.
    let dmgFloor = -1;
    for (let i = 0; i < 200; i++) {
      ctl.tick();
      expect(ctl.phase.phase).toBe("resolution"); // still the settle beat
      expect(ctl.world.combatActive).toBe(false);
      for (const id of champIds) {
        const ab = ctl.world.abilities.get(id)!;
        expect(ab.windup).toBeNull(); // no new basic attack ever starts
        expect(ab.cast).toBeNull(); //   no new ability cast ever starts
        expect(ctl.world.nav.get(id)!.attackTarget).toBeNull(); // no re-engage
      }
      const dmg = [...ctl.world.matchStats.values()].reduce((a, s) => a + s.damageDealt, 0);
      // after ~2s any projectile still airborne at settle has resolved; from
      // there the total is FROZEN (nothing new is ever fired).
      if (i >= 60) {
        if (dmgFloor < 0) dmgFloor = dmg;
        else expect(dmg).toBe(dmgFloor);
      }
    }
    expect(dmgFloor).toBeGreaterThanOrEqual(0); // the damage-floor assertion ran

    // The intermission that follows also stays frozen — and its shop is LIVE
    // (economy intents were NOT stripped): drive to the next intermission and
    // confirm combat is still off while the economy has re-opened.
    while ((ctl.phase.phase as string) === "resolution") ctl.tick();
    expect(ctl.phase.phase).toBe("intermission");
    expect(ctl.world.combatActive).toBe(false);
    expect(ctl.world.economyOpen).toBe(true);
  });
});

describe("driver seam (match-05, match-06)", () => {
  it("swapping AI->Human->AI at tick boundaries preserves entity state", () => {
    cover("driver-swap-seam");
    const ctl = new MatchController("m2", 99, allBots(), FAST);
    // run into the first combat
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 60; i++) ctl.tick();

    const seat = ctl.seats.get(asSeatId(0))!;
    const entity = seat.entityId!;
    const hpBefore = ctl.world.health.get(entity)!.hp;
    const goldBefore = ctl.world.champion.get(entity)!.gold;
    const posBefore = { ...ctl.world.transform.get(entity)!.pos };

    // human takes over (e.g. reconnect) — swap applies at NEXT tick boundary
    const human = new HumanDriver();
    seat.setDriver(human);
    expect(seat.driverKind).toBe("ai"); // not yet applied mid-tick
    ctl.tick();
    expect(seat.driverKind).toBe("human");
    // entity state untouched by the swap itself
    expect(ctl.world.health.get(entity)!.hp).toBeLessThanOrEqual(hpBefore); // only combat can change it
    expect(ctl.world.champion.get(entity)!.gold).toBe(goldBefore);
    expect(seat.entityId).toBe(entity);

    // hand back to AI: swap applies at the next boundary and the seat keeps
    // the same entity + inventory (nothing to migrate — that's the seam's point)
    void posBefore;
    seat.setDriver(new AIDriver());
    expect(seat.driverKind).toBe("human"); // pending until boundary
    ctl.tick();
    expect(seat.driverKind).toBe("ai");
    expect(seat.entityId).toBe(entity);
    expect(ctl.world.champion.get(entity)!.gold).toBe(goldBefore);
  });

  it("AI makes intermission decisions: ranks abilities, buys items, picks offers, readies (match-06)", () => {
    cover("ai-intermission");
    const ctl = new MatchController("m3", 7, allBots(), FAST);
    // run through round 1 into ROUND 2 combat: by then round rewards + the
    // round-2 item gacha have landed, so economy decisions are observable
    // (500 starting gold can't afford any buildPriority item in round 1).
    let guard = 0;
    while (!(ctl.phase.phase === "combat" && ctl.phase.round >= 2) && guard++ < 20000) ctl.tick();
    expect(ctl.phase.round).toBeGreaterThanOrEqual(2);

    /** 全座位加總：道具數 / 聖杯數 / 已加的技能等級 / 手上還沒花的點 / 總等級。 */
    const tally = (): { items: number; augments: number; ranked: number; unspent: number; levels: number } => {
      const t = { items: 0, augments: 0, ranked: 0, unspent: 0, levels: 0 };
      for (const seat of ctl.seats.values()) {
        const champ = ctl.world.champion.get(seat.entityId!)!;
        t.items += champ.items.filter((i) => i !== null).length;
        t.augments += champ.augments.length;
        t.levels += champ.level;
        const ab = ctl.world.abilities.get(seat.entityId!)!;
        t.ranked += ab.slots.Q.rank + ab.slots.W.rank + ab.slots.E.rank + ab.slots.R.rank;
        t.unspent += ab.unspentPoints;
      }
      return t;
    };

    const at2 = tally();
    expect(at2.items).toBeGreaterThan(0); // round-2 gacha + any affordable buys
    expect(at2.augments).toBeGreaterThan(0); // round-1 silver offers were picked
    // offers consumed at combat start
    expect(ctl.offers.size).toBe(0);

    // ── 加點 ────────────────────────────────────────────────────────────────
    // ⚠️ 這一段 2026-08-23 重寫過（GH#615，owner 把登場等級 1 → **6**）。
    //    舊斷言是 `anyRanked > 12`（12 = 每個座位出生就會的 Q），而它其實在
    //    問「到第 2 回合為止有沒有人升過級」—— 那是**升級曲線**的性質，⛔ 不是
    //    「AI 會不會加點」。登場等級抬高之後 `xpToNext(6)` 也跟著抬高，第 2 回合
    //    誰都還沒升級 ⇒ 它紅了，而 AI 的加點邏輯一行都沒壞。
    //
    // ⭐ 真正要守的機制是**「AI 拿到點就會花掉」**，所以改成從**升了幾級**推導：
    //    每一級發一點（`grantXp`），AI 在中場把點花光 ⇒ 下一次開戰時
    //    `已加的技能等級 == 座位數(出生的 Q) + 升級數`，而且**手上一點都不剩**。
    //    ⛔ 兩個數字都不寫死：座位數從 `ctl.seats` 讀，登場等級從出貨的
    //    `config.match` 解析（`MatchController` 用的同一支）。
    const baseRanks = ctl.seats.size; // Q starts learned at rank 1 on every seat
    const startLevel = heroStartLevel(Configs.tryGet("config.match"));
    const spawnLevels = ctl.seats.size * startLevel;
    // ⭐ GH#622：登場等級 > 1 現在**連技能點一起發**（`spawnChampion`，每級一點，
    //    LV1 的那一點就是出生的 Q）⇒ 開場就有 `座位數 × (登場等級 − 1)` 點在場上。
    const spawnPoints = ctl.seats.size * (startLevel - 1);
    expect(at2.levels).toBeGreaterThanOrEqual(spawnLevels);

    // 跑到**第一次升級真的落地**、再走完那一次中場為止 —— ⛔ 不是跑到某個
    // 寫死的回合（那又會被下一次曲線調整弄紅）。
    let guard2 = 0;
    while (tally().levels === spawnLevels && ctl.phase.phase !== "matchEnd" && guard2++ < 40000) ctl.tick();
    const roundAtFirstLevel = ctl.phase.round;
    while (
      !(ctl.phase.phase === "combat" && ctl.phase.round > roundAtFirstLevel) &&
      ctl.phase.phase !== "matchEnd" &&
      guard2++ < 40000
    )
      ctl.tick();

    const after = tally();
    expect(after.levels, "整場沒有任何人升級 —— 這條在空轉").toBeGreaterThan(spawnLevels);
    expect(after.unspent, "中場過完了還有沒花掉的技能點 —— AI 沒在加點").toBe(0);
    // 守恆律：已加的技能等級 == 出生免費的 Q + 登場等級份的點 + 升級拿到的點。
    expect(after.ranked).toBe(baseRanks + spawnPoints + (after.levels - spawnLevels));
  });
});

describe("no-pick champ-select auto-assign (match-nopick)", () => {
  // #130: letting the champ-select clock run out must NOT strand the player in a
  // dead/spectator state (0 HP, ☠觀戰中). autoPickAndSpawn assigns a random
  // ENABLED, model-backed champion and spawns it ALIVE.
  const oneHumanRestBots = (): SeatSpec[] =>
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: i !== 0 }));

  it("human never picks -> spawns ALIVE with a valid model-backed champion in round 1", () => {
    cover("match-nopick-alive");
    const ctl = new MatchController("nopick", 1234, oneHumanRestBots(), FAST);
    const seat0 = ctl.seats.get(asSeatId(0))!;
    seat0.setDriver(new HumanDriver()); // a real human seat…
    // …that NEVER calls selectChampion: run the champ-select clock to expiry
    while (ctl.phase.phase === "champSelect") ctl.tick();

    // a champion was auto-assigned, and it is a real champion with a model key
    // (not "" / stale). NB: unit tests register skeleton champions but not the
    // Models registry, so model-backing is enforced in-controller via
    // randomChampionPool + isEnabledSpawnablePick; here we assert the champion
    // resolves and carries a modelKey.
    expect(seat0.championId.length).toBeGreaterThan(0);
    const def = Champions.tryGet(seat0.championId as never);
    expect(def).toBeDefined();
    expect(def!.modelKey.length).toBeGreaterThan(0);
    // an entity exists and is alive with real HP (never a 0-HP spectator)
    expect(seat0.entityId).not.toBeNull();
    const hp = ctl.world.health.get(seat0.entityId!)!;
    expect(hp.maxHp).toBeGreaterThan(0);

    // …and it is still alive once round-1 combat actually starts
    while (ctl.phase.phase !== "combat") ctl.tick();
    const hpCombat = ctl.world.health.get(seat0.entityId!)!;
    expect(hpCombat.alive).toBe(true);
    expect(hpCombat.hp).toBeGreaterThan(0);
  });

  it("a stale/invalid pre-set champion is re-rolled, not spawned broken (match-nopick)", () => {
    cover("match-nopick-alive");
    // Under the dev bypass whitelist, allowsChampion() is true for ANY string —
    // so an invalid id must be caught by the model-backed guard, else spawnChampion
    // throws / spawns an un-renderable unit (the 0-HP spectator symptom).
    const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: true,
      ...(i === 0 ? { championId: "godie-not-a-real-champion" } : {}),
    }));
    const ctl = new MatchController("stale", 77, specs, FAST);
    expect(() => {
      while (ctl.phase.phase === "champSelect") ctl.tick();
    }).not.toThrow();
    const seat0 = ctl.seats.get(asSeatId(0))!;
    expect(Champions.tryGet(seat0.championId as never)).toBeDefined();
    expect(seat0.entityId).not.toBeNull();
    expect(ctl.world.health.get(seat0.entityId!)!.maxHp).toBeGreaterThan(0);
  });
});

describe("hmac + tickets (match-07, match-08)", () => {
  it("sign/verify roundtrip; tamper + skew rejected", () => {
    cover("game-hmac");
    const secret = "s3cret";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ a: 1 });
    const auth = sign(secret, ts, body);
    expect(verify(secret, ts, body, auth)).toBe(true);
    expect(verify(secret, ts, body + " ", auth)).toBe(false); // body tamper
    expect(verify("other", ts, body, auth)).toBe(false); // wrong secret
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verify(secret, oldTs, body, sign(secret, oldTs, body))).toBe(false); // skew
  });

  it("seat tickets verify and expire", () => {
    cover("game-ticket");
    const secret = "s3cret";
    const t = mintTicket(secret, "acct_123", 120);
    expect(verifyTicket(secret, t)).toBe("acct_123");
    expect(verifyTicket("other", t)).toBeNull();
    const expired = mintTicket(secret, "acct_123", -10);
    expect(verifyTicket(secret, expired)).toBeNull();
    expect(verifyTicket(secret, "garbage")).toBeNull();
  });
});

describe("input mailbox (match-11)", () => {
  it("drops stale seqs, keeps latest order, queues commands", () => {
    cover("input-mailbox-seq");
    const mb = new InputMailbox();
    mb.push({ seq: 1, order: { kind: "move", point: { x: 1, z: 1 } } });
    mb.push({ seq: 3, order: { kind: "move", point: { x: 3, z: 3 } } });
    mb.push({ seq: 2, order: { kind: "move", point: { x: 2, z: 2 } } }); // stale
    mb.push({ seq: 4, commands: [{ kind: "ready" }] });
    const frame = mb.drain(0);
    expect(frame.order).toEqual({ kind: "move", point: { x: 3, z: 3 } });
    expect(frame.commands).toEqual([{ kind: "ready" }]);
    // drained
    const empty = mb.drain(1);
    expect(empty.order).toBeUndefined();
    expect(empty.commands).toEqual([]);
  });
});

describe("snapshot projection (match-12)", () => {
  it("projects seats/teams/entities into the schema", () => {
    cover("snapshot-projection");
    const ctl = new MatchController("m4", 55, allBots(), FAST);
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 30; i++) ctl.tick();

    const state = new MatchState();
    projectSnapshot(ctl, state, new Map());

    expect(state.phase).toBe("combat");
    expect(state.round).toBe(1);
    expect(state.teams.length).toBe(4);
    expect(state.seats.size).toBe(12);
    // 12 champions projected with model keys + hp
    let champs = 0;
    state.entities.forEach((e) => {
      if (e.kind === 0) {
        champs++;
        expect(e.key.startsWith("champ.")).toBe(true);
        expect(e.maxHp).toBeGreaterThan(0);
      }
    });
    expect(champs).toBe(12);
    // seat projection carries economy
    const seat0 = state.seats.get("0")!;
    expect(seat0.championId.length).toBeGreaterThan(0);
    expect(seat0.gold).toBeGreaterThanOrEqual(0);
    expect(seat0.abilityRanks.length).toBe(4);
  });
});
