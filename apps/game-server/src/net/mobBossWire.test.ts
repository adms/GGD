/**
 * 殭屍王 ON THE WIRE (task #262) — the failure-shape-② guard.
 *
 * The sim can summon a king, run its damage ledger and split a 3,000g bounty
 * perfectly, and a player will still see NOTHING unless two separate wires
 * carry it:
 *
 *   1. THE ENTITY. `EntityState` has no radius, no scale and no kind sub-type —
 *      `key` (the model doc id) is the ONE field that distinguishes a king from
 *      a zombie on screen. If `snapshot.ts` resolves the wave's model key for
 *      every mob (which it did before #262), a 6,000 hp king renders as an
 *      ordinary zombie and 「它要看得出來」 is silently false.
 *   2. THE EVENTS. `FANNED_OUT_EVENT_TYPES` is a hard allowlist and the only
 *      path from a sim emit to a socket. A name missing from it fails SILENTLY:
 *      the sim emits, the client has a handler, nothing errors, and the feature
 *      never happens in a real match (docs/_false-completions.md).
 *
 * `eventFanout.test.ts` already proves every emit is CLASSIFIED. It cannot
 * prove a given event was classified the RIGHT way — a `mobBossSlain` parked in
 * `SERVER_ONLY_EVENT_TYPES` passes that suite and ships a dead feature. This
 * file names the two events and demands they be FANNED OUT.
 */
import { describe, expect, it } from "vitest";
import { Encoder, Decoder } from "@colyseus/schema";
import { fullStateBytes } from "../testkit/wireFullState";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { MatchState, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import {
  mobRulesFromConfig,
  summonMobBoss,
  spawnMob,
  mobModelKeyFor,
  mobSizeMultFor,
  parseMobVisualJson,
} from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import { isFannedOutEvent, FANNED_OUT_EVENT_TYPES, SERVER_ONLY_EVENT_TYPES } from "./eventFanout";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;

describe("殭屍王 events reach a socket", () => {
  it("mobBossSpawn + mobBossSlain are FANNED OUT, not parked as server-only", () => {
    cover("mob-boss-fanout");
    for (const name of ["mobBossSpawn", "mobBossSlain"]) {
      // through the REAL predicate the room calls, with a real event shape —
      // not just a set lookup, so a future gate added inside it is covered too
      const ev = { type: name, tick: 0, data: {} };
      expect(isFannedOutEvent(ev), `${name} would never reach a client`).toBe(true);
      expect(FANNED_OUT_EVENT_TYPES.has(name)).toBe(true);
      // …and NOT also in the server-only set, which would make the two lists
      // disagree about the same name.
      expect(SERVER_ONLY_EVENT_TYPES.has(name)).toBe(false);
    }
  });
});

describe("特殊殭屍分紅 reaches a socket (#288)", () => {
  it("★ a 特殊殭屍 kill emits a FANNED-OUT settlement carrying kind:\"special\"", () => {
    cover("mob-special-wire");
    // WHY THIS LIVES HERE AND NOT IN packages/shared: the shared package cannot
    // import the fanout allowlist, so its own suite can prove the payout is
    // CORRECT but never that it LEAVES THE SERVER. This is the other half.
    const ctl = new MatchController(
      "special-wire",
      3,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    ctl.tick();

    const w = ctl.world;
    const base = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    // chance 1 = every spawn is special; maxHp 400 keeps the kill to one packet.
    const rules = { ...base, special: { ...base.special!, chance: 1, maxHp: 400 } };
    const zone = 0;
    beginCombatMobs(w, rules, [zone]);
    const hero = [...w.champion.keys()].find((id) => w.transform.get(id)?.zone === zone)!;
    const special = spawnMob(w, zone, rules, 1, 0);
    expect(w.mob.get(special)!.kind).toBe("special");

    w.damageQueue.push({
      source: hero,
      target: special,
      amount: 400,
      type: "true",
      crit: false,
      origin: "ability",
    });
    w.step(new Map());

    const ev = w.events.find((e) => e.type === "mobBossSlain");
    expect(ev, "特殊殭屍死了卻沒有發出結算事件").toBeDefined();
    // Through the REAL predicate the room calls — a name in neither list, or in
    // the server-only list, means the 分紅 sheet never reaches a player.
    expect(isFannedOutEvent(ev!), "特殊殭屍的分紅結算過不了 fanout 這一關").toBe(true);
    // `kind` is what lets the client say 特殊殭屍 instead of 殭屍王 without a
    // second event name (see the note in MobSystem.payMobBounty).
    expect(ev!.data.kind).toBe("special");
    expect(ev!.data.zone).toBe(zone);
    const shares = ev!.data.shares as { gold: number }[];
    expect(shares).toHaveLength(1);
    expect(shares[0]!.gold).toBe(DEFAULT_MOB_WAVES_CONFIG.special!.bountyGold);
  });
});

describe("殭屍王 / 特殊殭屍 are visually distinct on the wire", () => {
  it("the snapshot sends a DIFFERENT model key per mob kind", () => {
    cover("mob-boss-wire");
    const ctl = new MatchController(
      "boss-wire",
      3,
      Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
      FAST,
    );
    while (ctl.phase.phase !== "combat") ctl.tick();
    ctl.tick();

    // Arm with the SHIPPED block (failure shape ⑤: test the thing that ships),
    // forcing every wave spawn to be a 特殊殭屍 so all three kinds are present.
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    const w = ctl.world;
    const zone = 0;
    beginCombatMobs(w, { ...rules, special: { ...rules.special!, chance: 0 } }, [zone]);
    const normal = spawnMob(w, zone, { ...rules, special: { ...rules.special!, chance: 0 } }, 1, 0);
    const special = spawnMob(w, zone, { ...rules, special: { ...rules.special!, chance: 1 } }, 1, 1);
    const king = summonMobBoss(w, zone, rules, normal, 100)!;
    w.mobRules = rules;
    expect(w.mob.get(normal)!.kind).toBe("normal");
    expect(w.mob.get(special)!.kind).toBe("special");
    expect(w.mob.get(king)!.kind).toBe("boss");

    const state = new MatchState();
    const encoder = new Encoder(state);
    projectSnapshot(ctl, state, new Map());
    const decoded = new MatchState();
    new Decoder(decoded).decode(fullStateBytes(encoder, state), { offset: 1 });

    const key = (id: number): string => {
      const es = decoded.entities.get(String(id));
      expect(es, `entity ${id} never reached the wire`).toBeDefined();
      expect(es!.kind).toBe(ENTITY_KIND.MOB);
      return es!.key;
    };
    const keys = [key(normal), key(special), key(king)];
    // Each key is the one the sim's own resolver names, so the wire and the sim
    // cannot drift apart. On the SHIPPED block all three are now the CHAMPION's
    // mesh (GH#192 「選什麼英雄就會讀取什麼 3d modal」) — which is exactly why the
    // #262 assertion 「three DIFFERENT keys」 had to move to the size channel
    // below: on a correct build these three strings are equal.
    expect(keys).toEqual([
      mobModelKeyFor(rules, "normal"),
      mobModelKeyFor(rules, "special"),
      mobModelKeyFor(rules, "boss"),
    ]);

    // ── GH#192: THE SIZE REACHES THE CLIENT (failure shape ②) ───────────────
    // 體型倍率 rides the mob's unused `mana` slot. THE ASSERTION THAT
    // DISTINGUISHES THE TWO IMPLEMENTATIONS: an encoder that never wrote it
    // leaves all three at 0 and this set has size 1, so a king that is 10× in
    // the rules and 1× on screen fails here rather than in a playtest.
    const size = (id: number): number => decoded.entities.get(String(id))!.mana;
    const sizes = [size(normal), size(special), size(king)];
    expect(new Set(sizes).size).toBe(3);
    // toBeCloseTo, not toEqual: the slot is a `float32` on the wire and
    // 0.68 × 1.8 does not survive the narrowing exactly. 6 decimals is far
    // tighter than any wrong-by-a-factor bug and far looser than float32 noise.
    const want = [
      mobSizeMultFor(rules, "normal"),
      mobSizeMultFor(rules, "special"),
      mobSizeMultFor(rules, "boss"),
    ];
    for (let i = 0; i < 3; i++) expect(sizes[i]!).toBeCloseTo(want[i]!, 6);
    // owner GH#192 「modal 大小是10倍」 → GH#206 「體型 30 倍」 → back to 10 on
    // 2026-07-29 after a playtest (30 × 0.68 × 1.8u = 36.72u tall in a zone
    // whose radius is 24u — the king filled the camera) → owner 2026-08-02
    // 「殭屍王體型可以減半」= 5。
    // ⚠️ 比值**讀出貨設定**,不寫死。這個數字已經改過四次,每一次寫死都讓這條
    // 紅著跟過一個版本,而它紅的時候看起來像「線路上的體型壞了」。這條要驗的是
    // **後台那一格真的走到線路上**,加一個「一眼看得出來」的下界擋掉同義反覆。
    // Precision 5, not 6: the ratio is computed from two `float32` round-trips
    // and the residual is larger than a 1e-6 tolerance, while still being orders
    // of magnitude tighter than any wrong-by-a-factor bug this line exists to catch.
    const shippedRatio = want[2]! / want[0]!;
    expect(sizes[2]! / sizes[0]!).toBeCloseTo(shippedRatio, 5);
    expect(shippedRatio).toBeGreaterThanOrEqual(3);
    // …and `maxMana` MUST stay 0, or the HUD divides by it and paints a mana bar
    // out of the size number (`manaPct = maxMana > 0 ? mana / maxMana : 0`).
    for (const id of [normal, special, king]) {
      expect(decoded.entities.get(String(id))!.maxMana).toBe(0);
    }

    // ── 染黑 (GH#192): the match-wide tint table REACHES the client ─────────
    //
    // MUTATION SURVIVOR FIX. Asserting only `parseMobVisualJson(...) === 0.65`
    // proved nothing: `parseMobVisualJson("")` degrades to the shipped 0.65 by
    // design, so an encoder that NEVER WROTE THE FIELD passed. That is failure
    // shape ④ exactly. Two assertions that do separate the implementations:
    //   1. the field is a non-empty JSON payload — 「有送」;
    //   2. re-armed with a NON-DEFAULT strength, the wire carries THAT number,
    //      which an unwritten field cannot produce.
    expect(decoded.mobVisualJson, "mobVisualJson never left the server").not.toBe("");
    expect(parseMobVisualJson(decoded.mobVisualJson).tintStrength).toBe(rules.tintStrength);
    expect(rules.tintStrength).toBe(0.65);

    const dim = mobRulesFromConfig(
      { ...DEFAULT_MOB_WAVES_CONFIG, mob: { ...DEFAULT_MOB_WAVES_CONFIG.mob, tintStrength: 0.2 } },
      DT,
      3,
    );
    w.mobRules = dim;
    const state2 = new MatchState();
    const enc2 = new Encoder(state2);
    projectSnapshot(ctl, state2, new Map());
    const dec2 = new MatchState();
    new Decoder(dec2).decode(fullStateBytes(enc2, state2), { offset: 1 });
    expect(parseMobVisualJson(dec2.mobVisualJson).tintStrength).toBe(0.2);
    w.mobRules = rules;

    // The king's HP also rides along, so a neutral health bar can render 6,000
    // rather than a zombie's 200 — the other half of 「看得出來這是王」.
    expect(decoded.entities.get(String(king))!.maxHp).toBe(rules.boss!.maxHp);
    expect(decoded.entities.get(String(king))!.maxHp).toBeGreaterThan(
      decoded.entities.get(String(normal))!.maxHp,
    );
  });
});
