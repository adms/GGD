/**
 * GH#221 — 智慧 → 魔抗 0.6, and「每一次 AP 傷害都會減去魔抗計算」.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS ACTUALLY BROKEN (measured before writing a line of code)
 * ---------------------------------------------------------------------------
 * Half of the owner's sentence was ALREADY TRUE and the task brief warned not
 * to assume otherwise. `combat/damage.ts mitigate()` has always read
 * `targetStats.final[Stat.MagicResist]` for every packet whose `type` is not
 * `"physical"` and not `"true"`, through the same `100/(100+resist)` curve as
 * armour — and a census of the shipped content finds ALL 203 damage effects
 * that carry an `ap` ratio (200 in content/abilities, 3 in content/augments)
 * typed `"magic"`, i.e. every one of them already paid 魔抗.
 *
 * What was missing is the OTHER half: 魔抗 had no attribute source. Every
 * champion's mr was `baseStats.mr + growth.mr·(L−1)` and nothing else, so 智慧
 * bought mana, regen and 法強 but not one point of defence — which is why the
 * owner's two sentences arrived together in the「目前玩家太容易死了」batch.
 *
 * ---------------------------------------------------------------------------
 * THE THREE MUTATIONS THESE TESTS EXIST TO CATCH
 * ---------------------------------------------------------------------------
 *  ① Delete `[Stat.MagicResist]` from `ATTR_STAT_SOURCE` (stats/attributes.ts)
 *     → `智慧 +100 gives +60 魔抗` and `the coefficient is the one the operator
 *     set` and `一發 AP 傷害在魔抗高的人身上打得比較少` all go red.
 *  ② Change `mitigate()` so a magic packet reads Armor (or 0) instead of
 *     MagicResist → `一發 AP 傷害…` goes red while the stat tests stay green.
 *     That split is the point: ① is「算出來了」, ② is「送到了戰鬥結算」.
 *  ③ Make `mitigate()` subtract mr from PHYSICAL packets too → the reverse
 *     guard `物理傷害不吃魔抗` goes red. Without it, wiring 智慧→魔抗 into the
 *     wrong branch of `mitigate` would pass every other test in this file.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE READ THE FINAL STAT AND THE REAL DAMAGE QUEUE
 * ---------------------------------------------------------------------------
 * `championStatBase` is not the number a champion fights with: `finalizeStat`
 * still applies `combatEnv.defense`, the 基礎加成 grant and the clamp after it.
 * A test that asserts on `championStatBase` would stay green if any of those
 * three zeroed mr out. So every assertion below reads
 * `world.stats.get(id)!.final[Stat.MagicResist]` — the block `mitigate()`
 * itself reads — and every damage assertion pushes a packet into
 * `world.damageQueue` and runs `world.step()`, i.e. the shipped
 * `combatResolveSystem`, never a hand-rolled copy of the curve.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA, type ArenaDef } from "./world/ArenaDef";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  ATTRIBUTE_ENV_DEFAULTS,
  COMBAT_ENV_KEYS,
  DEFAULT_COMBAT_ENV,
  isAttributeEnvKey,
  normalizeCombatEnv,
} from "./combatEnv";
import { ATTR_STAT_SOURCE } from "./stats/attributes";
import { baseBonusFor } from "./baseBonus";
import { recomputeStats } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import type { DamageType } from "./effects/effect";

beforeAll(() => registerSkeletonContent());

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_ENV = join(HERE, "../../../../content/config/combat-env.json");

/** Skeleton geometry minus the centre pillars — nothing here needs obstacles. */
const OPEN_ARENA: ArenaDef = {
  id: "arena.mr-open",
  name: "MR Test Arena",
  zones: SKELETON_ARENA.zones.map((z) => ({ ...z, obstacles: [] })),
};
const ZONE0 = OPEN_ARENA.zones[0]!;

/**
 * A world whose 每秒回血 is switched OFF via the combat-env knob.
 *
 * ⚠️ NOT cosmetic. `world.step()` runs regen in the same tick as
 * `combatResolveSystem`, and thorne regenerates `0.6 + 0.04×24 = 1.56` hp/s =
 * 0.052 hp/tick — which lands in the SAME order of magnitude as the difference
 * this file is trying to measure would be if the coefficient were small. The
 * first draft of this test asserted on raw hp deltas and failed by exactly
 * 0.052; hiding that behind a looser tolerance would have been the beginning of
 * a guard that no longer distinguishes「魔抗生效了」from「回血抵掉了」.
 * `healthRegen: 0` makes the hp delta EXACTLY the mitigated damage.
 */
function newWorld(env: Record<string, number> = {}): SimWorld {
  const w = new SimWorld(OPEN_ARENA, 11);
  w.combatEnv = normalizeCombatEnv({ healthRegen: 0, ...env });
  return w;
}

let nextSeat = 0;
function champ(w: SimWorld, team = 1): EntityId {
  return spawnChampion(w, {
    championId: THORNE.id as ChampionId,
    seatId: asSeatId(nextSeat++ % 12),
    teamId: asTeamId(team),
    pos: { x: ZONE0.center.x, z: ZONE0.center.z },
    zone: 0,
  });
}

const mrOf = (w: SimWorld, id: EntityId): number => w.stats.get(id)!.final[Stat.MagicResist];

/** Grant 三圍 through the SAME seam the 能力屬性強化 三選一 uses (#260). */
function buyInt(w: SimWorld, id: EntityId, points: number): void {
  w.champion.get(id)!.attrBonus.int += points;
  recomputeStats(w, id);
}

/**
 * Fire ONE packet of `amount` at `id` through the shipped resolve system and
 * report the HP it actually removed. `world.step()` — not a direct call to
 * `mitigate` — because a mitigation that is correct but never reached is this
 * repo's failure mode ②.
 */
function hpLostTo(w: SimWorld, id: EntityId, type: DamageType, amount: number): number {
  const hp = w.health.get(id)!;
  const before = hp.hp;
  w.damageQueue.push({ source: id, target: id, amount, type, crit: false, origin: "test" });
  w.step(new Map());
  return before - w.health.get(id)!.hp;
}

/** The classic `100/(100+resist)` survival fraction `mitigate()` implements. */
const afterResist = (amount: number, resist: number): number => amount * (100 / (100 + resist));

describe("GH#221 智慧 → 魔抗 (the ninth 三圍 coefficient)", () => {
  it("智慧 +100 gives +60 魔抗 on the FINAL stat, not just in the config", () => {
    cover("mr-221-int-to-mr");
    // 🔴 2026-08-16 owner 把**出貨值**改成 0（「把 智慧 增加魔抗 這項拆出來」），
    //   所以這一條改成**明確設定係數**再驗。⭐ 這樣才對：這條測試要證明的是
    //   「這根軸還在、而且照操作者填的數字走」，⛔ 不是「出貨值剛好是 0.6」。
    //   出貨值本身由下面那兩條 drift 斷言負責，兩件事分開才不會一起腐爛。
    const w = newWorld({ intToMagicResist: 0.6 });
    const id = champ(w);

    // thorne ships mr 32 and INT 14, so the 倍率空間 half of his level-1 魔抗 is
    // 32 + 0.6×14 = 40.4 — the innate half of the same axis. On top of it sits
    // 基礎加成 (`content/config/base-bonus.json` 的 `mr`), which `finalizeStat`
    // adds AFTER every multiplier.
    // ⭐ 贈禮**讀出貨表**，⛔ 不抄字面值：owner 2026-08-23 才剛把 `mr` 從 0 開到
    //   25（「初始魔抗+20%」），而抄進來的那一份會用「智慧→魔抗壞了」這個
    //   **錯誤的訊息**紅 —— 真相只是另一頁的一格被調過。
    const gift = baseBonusFor(w.baseBonus, Stat.MagicResist);
    const innate = mrOf(w, id);
    expect(innate).toBeCloseTo(32 + 0.6 * 14 + gift, 9);

    buyInt(w, id, 100);
    // The DELTA is the assertion, so a future 基礎加成 grant or a `defense`
    // retune cannot make this pass or fail for the wrong reason.
    expect(mrOf(w, id) - innate).toBeCloseTo(60, 9);
  });

  it("the coefficient is the one the OPERATOR set, not a 0.6 baked into the sim", () => {
    cover("mr-221-int-to-mr");
    // 第一守則: this has to be a 後台 knob. Hardcoding 0.6 anywhere downstream of
    // the table would pass the test above and fail this one.
    const w = newWorld({ intToMagicResist: 1.5 });
    const id = champ(w);
    const innate = mrOf(w, id);
    buyInt(w, id, 100);
    expect(mrOf(w, id) - innate).toBeCloseTo(150, 9);

    // …and 0 is a legal value meaning「關掉這根軸」, not「用預設」.
    const off = newWorld({ intToMagicResist: 0 });
    const oid = champ(off);
    const before = mrOf(off, oid);
    buyInt(off, oid, 100);
    expect(mrOf(off, oid) - before).toBe(0);
  });

  it("一發 AP(magic) 傷害在魔抗高的人身上打得比較少 —— 走真的傷害佇列", () => {
    cover("mr-221-ap-mitigated");
    // ⚠️ 同上：明確設係數。這一條驗的是 `mitigate()` **有沒有讀魔抗**，
    //   ⛔ 不是出貨值是多少 —— 出貨值改成 0 之後它仍然必須紅在「刪掉那個讀取」。
    const w = newWorld({ intToMagicResist: 0.6 });
    const plain = champ(w);
    const smart = champ(w, 2);
    buyInt(w, smart, 100); // +60 魔抗 via the coefficient, nothing else touched

    const mrPlain = mrOf(w, plain);
    const mrSmart = mrOf(w, smart);
    expect(mrSmart - mrPlain).toBeCloseTo(60, 9);

    const AMOUNT = 400;
    const lostPlain = hpLostTo(w, plain, "magic", AMOUNT);
    const lostSmart = hpLostTo(w, smart, "magic", AMOUNT);

    // ① the numbers really differ (delete the mr read in `mitigate` → equal)
    expect(lostSmart).toBeLessThan(lostPlain);
    // ② …by EXACTLY the shipped curve, so「有差」不能是任何隨機差異
    expect(lostPlain).toBeCloseTo(afterResist(AMOUNT, mrPlain), 6);
    expect(lostSmart).toBeCloseTo(afterResist(AMOUNT, mrSmart), 6);
    // ③ and the gap is EXACTLY 「60 魔抗 買到多少減傷」—— `60/(100+mrSmart)`,
    //    the same curve read from the coefficient's side instead of from two
    //    absolute damage numbers. A coefficient collapse makes it 0 and this
    //    goes red.
    //    ⭐ 這裡原本是一個手挑的下界 `> 0.25`，而那個比例**會隨別頁的旋鈕縮小**：
    //      owner 2026-08-23 把基礎加成的 `mr` 從 0 開到 25，它就從 28.9% 掉到
    //      26.6% —— 再調一次就會用「係數塌了」這個錯誤的訊息紅。⛔ 不留字面值。
    expect((lostPlain - lostSmart) / lostPlain).toBeCloseTo(60 / (100 + mrSmart), 9);
  });

  it("REVERSE GUARD — 物理傷害不吃魔抗", () => {
    cover("mr-221-physical-unaffected");
    const w = newWorld();
    const plain = champ(w);
    const smart = champ(w, 2);
    buyInt(w, smart, 100);

    // INT feeds mr / mana / regen / ap — never armour. Same armour, so a
    // physical packet MUST land identically on both.
    expect(w.stats.get(smart)!.final[Stat.Armor]).toBeCloseTo(
      w.stats.get(plain)!.final[Stat.Armor],
      9,
    );

    const AMOUNT = 400;
    const lostPlain = hpLostTo(w, plain, "physical", AMOUNT);
    const lostSmart = hpLostTo(w, smart, "physical", AMOUNT);
    expect(lostSmart).toBeCloseTo(lostPlain, 9);
    // …and armour is still doing its job, so this is not passing because both
    // sides are unmitigated.
    expect(lostPlain).toBeCloseTo(afterResist(AMOUNT, w.stats.get(plain)!.final[Stat.Armor]), 6);
    expect(lostPlain).toBeLessThan(AMOUNT);

    // true damage keeps bypassing both (the 火圈 contract, #270).
    expect(hpLostTo(w, plain, "true", AMOUNT)).toBeCloseTo(AMOUNT, 9);
  });

  it("the ninth coefficient landed in all three sim-side surfaces", () => {
    cover("mr-221-three-places");
    // 1) the key set the schema + the platform mirror are generated from
    expect(COMBAT_ENV_KEYS).toContain("intToMagicResist");
    // ⚠️ 這裡原本斷言它必須是**最後一個**,理由寫「apps/platform compares its
    // mirror positionally」—— 那句話是假的:keysync_test.go:52 用的是
    // `assert.ElementsMatch`,順序無關。而那條假註解會讓人以為「附加在最後」
    // 就等於平台鏡像已經同步了,實際上 apps/platform 的 `Keys` / `AttrDefaults`
    // 當時根本沒有這個 key —— 平台的 sanitize() 會把它從每一張表丟掉,後台
    // 完全改不到(第一守則的失敗)。真正的守衛在 Go 那一側,不在這裡。
    expect(isAttributeEnvKey("intToMagicResist")).toBe(true);
    // 2) it is a COEFFICIENT, not a ×factor (a factor's neutral is 1.0)
    // 🔴 2026-08-16 owner：出貨值 0.6 → **0**（「把 智慧 增加魔抗 這項拆出來」）。
    //   ⭐ 這裡釘的是**出貨值**，跟上面那幾條「機制還在」是兩件事：
    //     機制的那幾條現在自己設係數，所以出貨值再怎麼調它們都不會誤報。
    //   ⚠️ 0 對 COEFFICIENT 是一個**合法值**（「關掉這根軸」），對 ×factor 才是異常
    //     —— 這也是為什麼下面仍然要驗它是 attribute key 而不是 factor key。
    expect(ATTRIBUTE_ENV_DEFAULTS.intToMagicResist).toBe(0);
    expect(DEFAULT_COMBAT_ENV.intToMagicResist).toBe(0);
    // 3) the derivation table the stat pipeline reads
    expect(ATTR_STAT_SOURCE[Stat.MagicResist]).toEqual({
      attr: "int",
      key: "intToMagicResist",
      mode: "add",
    });
  });

  it("出貨的 content/config/combat-env.json 與程式端的 DEFAULT 是同一個值", () => {
    cover("mr-221-three-places");
    // ⚠️ 這一份才是伺服器真的載入的表;程式端的 DEFAULT 只在讀不到文件時生效。
    // 兩邊不一致的話,後台顯示的和玩家實際拿到的會是兩個數字,而且沒人會說。
    const doc = JSON.parse(readFileSync(CONTENT_ENV, "utf8")) as {
      schema: string;
      multipliers: Record<string, number>;
    };
    expect(doc.schema).toBe("config.combat-env@1");
    // 🔴 2026-08-16 owner 把它拆掉（0.6 → 0）。⛔ 從 `ATTRIBUTE_ENV_DEFAULTS` 推導
    //   而不是再抄一次字面值 —— 抄一次就是第三個住處，而它會自己過期。
    expect(doc.multipliers.intToMagicResist).toBe(ATTRIBUTE_ENV_DEFAULTS.intToMagicResist);
    expect(doc.multipliers.intToMagicResist).toBe(0);
    // ⚠️ 這裡原本還釘住 agiToArmor 與 maxHealth,理由是「同一批決定」。那是錯的:
    // maxHealth 倍率是 owner 反覆推翻過的平衡值(#265 4→3、今天 6→9),把它釘進
    // 一個講「智慧→魔抗」的守衛,結果就是**每一次平衡調整都讓這個檔誤報**,
    // 而誤報的訊息還完全沒提到平衡。它今天就已經以「expected 9 to be 6」紅了。
    // 平衡值的守衛在 balanceTuning.test.ts,那裡改動時看得到上下文。
  });
});
