/**
 * L3 —— 「場上有殭屍 → 不提前結束（除非玩家全滅）」的 SIM 側查詢守衛。
 *
 * owner 2026-07-30:「如果場上還有沒消滅的各種殭屍,就算場上只剩同一隊伍也不會
 * 結束,除非玩家全滅」。
 *
 * 這一檔守的是 `anyMobsAlive` / `mobsAliveInZone` / `isMobAlive` 這個**事實查詢**
 * —— 「宣佈回合勝利」的決策點在 `apps/game-server/src/match/MatchController.ts`
 * (`checkCombatEnd` / `checkRoyaleEnd`),不在這個 package,見檔尾的接線說明。
 *
 * ── 每一條斷言是對著哪一種失敗形態寫的 ──────────────────────────────────
 *
 * ⑦ 「掃屬性代替掃行為」。這裡沒有一條斷言去讀 `world.mob.size`。size 是屬性,
 *    而規則講的是「**沒消滅的**殭屍」—— 一具躺在地上、hp 0 的屍體仍然佔著
 *    `world.mob` 的一格。所以每一條都讀 `anyMobsAlive`,而且**同時**斷言屍體
 *    確實還在 `world.mob` 裡(`corpseStillOnField`),否則這條測試會退化成
 *    「東西被刪掉了嗎」,而那個問題本來就會過。
 *
 * ④ 「斷言方向跟缺陷無關」。分辨得出來的實作只有一種:
 *      · `world.mob.has(id)` → 屍體那三條紅;
 *      · 只看 `hp.alive`、不看 `hp.hp > 0` → 「傷害已結算、deathSystem 還沒跑」
 *        那條紅;
 *      · 不看 zone → 跨場那條紅;
 *      · 把英雄也算成殭屍 → 「只有英雄」那條紅(而且它會讓整個規則永遠不結束)。
 *
 * ⑤ 「被測的不是出貨的」。殭屍一律用出貨的 `spawnMob` / `summonMobBoss` 生成
 *    (不是手寫 `world.mob.set`),清屍體一律走出貨的 `world.step()` →
 *    deathSystem → mobSystem,規則一律由 `mobRulesFromConfig(DEFAULT_MOB_WAVES_
 *    CONFIG, …)` 建 —— 和 host 呼叫的是同一條。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  anyMobsAlive,
  isMobAlive,
  mobsAliveInZone,
  mobRulesFromConfig,
  spawnMob,
  summonMobBoss,
  type MobRules,
} from "./mobs";
import { beginCombatMobs, endCombatMobs } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

/**
 * Rules off the SHIPPED mobWaves block, with the wave schedule pushed out of
 * reach (`firstWaveTicks` is a huge tick index) so that stepping the world never
 * spawns a zombie behind the test's back. Every zombie below is placed by the
 * test, on purpose, with the real `spawnMob`/`summonMobBoss`.
 *
 * `special.chance` is the ONE knob that forks 一般 vs 特殊 (`rollMobKind`), so it
 * is set per-fixture to 0 or 1 rather than left to an rng draw — a probabilistic
 * fixture would make 「特殊殭屍活著」 a flaky claim instead of a guard.
 */
function rules(specialChance: 0 | 1): MobRules {
  const base = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
  return {
    ...base,
    firstWaveTicks: 1_000_000,
    special: base.special === null ? null : { ...base.special, chance: specialChance },
  };
}

/** An armed combat world with `heroes` living champions in zone 0. */
function world(specialChance: 0 | 1 = 0, heroes = 2): { w: SimWorld; rules: MobRules; heroes: EntityId[] } {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatActive = true;
  const r = rules(specialChance);
  beginCombatMobs(w, r, [0, 1]);
  const ids: EntityId[] = [];
  for (let i = 0; i < heroes; i++) {
    ids.push(
      spawnChampion(w, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(i),
        teamId: asTeamId(i),
        pos: { x: -40 + i * 2, z: 0 },
        zone: 0,
      }),
    );
  }
  return { w, rules: r, heroes: ids };
}

/**
 * Kill `id` THE WAY THE GAME KILLS IT: an un-mitigated packet through the same
 * `damageQueue` every auto/ability drains into, resolved by a real `world.step()`
 * (combatResolveSystem → deathSystem → mobSystem).
 *
 * NOT a hand-written `health.alive = false`: that is failure shape ⑤ — it would
 * test a state the shipping code never produces, and it would skip the very pass
 * (`mobSystem`'s payout/cleanup) whose timing this whole file is about.
 */
function slay(w: SimWorld, killer: EntityId, id: EntityId): void {
  w.damageQueue.push({ source: killer, target: id, amount: 9_999_999, type: "true", crit: false, origin: "ability" });
  w.step(new Map());
}

/** Is the body STILL in `world.mob` — i.e. is this genuinely the corpse case? */
const corpseStillOnField = (w: SimWorld, id: EntityId): boolean => w.mob.has(id);

describe("L3 anyMobsAlive —— 場上還有沒有沒消滅的殭屍", () => {
  describe("活著的殭屍 → 真 (三種都要)", () => {
    it("一般殭屍", () => {
      const { w, rules: r } = world(0);
      const id = spawnMob(w, 0, r, 1, 0);
      expect(w.mob.get(id)!.kind).toBe("normal");
      expect(anyMobsAlive(w, 0)).toBe(true);
      expect(mobsAliveInZone(w, 0)).toBe(1);
      expect(isMobAlive(w, id)).toBe(true);
    });

    it("特殊殭屍", () => {
      const { w, rules: r } = world(1);
      const id = spawnMob(w, 0, r, 1, 0);
      expect(w.mob.get(id)!.kind).toBe("special");
      expect(anyMobsAlive(w, 0)).toBe(true);
      expect(mobsAliveInZone(w, 0)).toBe(1);
      expect(isMobAlive(w, id)).toBe(true);
    });

    it("殭屍王", () => {
      const { w, rules: r, heroes } = world(0);
      const id = summonMobBoss(w, 0, r, heroes[0]!, 100);
      expect(id).not.toBeNull();
      expect(w.mob.get(id!)!.kind).toBe("boss");
      expect(anyMobsAlive(w, 0)).toBe(true);
      expect(mobsAliveInZone(w, 0)).toBe(1);
      expect(isMobAlive(w, id!)).toBe(true);
    });
  });

  describe("⚠️ 死掉但屍體還在場上的殭屍 → 不算活著", () => {
    /**
     * 屍體真的會在 `world.mob` 裡待著:`mobSystem` 第一行就會在
     * `combatActive === false` 時整支跳過,而 `deathSystem`(slot 9)是無條件跑的。
     * 所以「戰鬥剛被凍結的那一 tick 死掉的殭屍」會以 `alive === false` 留在
     * `world.mob` 裡,直到 `endCombatMobs`。
     *
     * 一個只看 `world.mob.has(id)` 的回合結束判定會在這裡永遠看到一場「還有殭屍」
     * 的戰鬥 —— 回合再也不會結束。
     */
    it.each([
      ["一般殭屍", 0 as const],
      ["特殊殭屍", 1 as const],
    ])("%s 的屍體不算 —— 而且屍體確實還在場上", (_label, chance) => {
      const { w, rules: r, heroes } = world(chance);
      const id = spawnMob(w, 0, r, 1, 0);
      expect(anyMobsAlive(w, 0)).toBe(true);

      // 戰鬥凍結 ⇒ mobSystem 整支 no-op ⇒ 沒有人來收屍
      w.combatActive = false;
      slay(w, heroes[0]!, id);

      expect(corpseStillOnField(w, id), "這條測試沒測到東西:屍體已經被清掉了").toBe(true);
      expect(w.health.get(id)!.alive).toBe(false);
      expect(isMobAlive(w, id)).toBe(false);
      expect(anyMobsAlive(w, 0)).toBe(false);
      expect(mobsAliveInZone(w, 0)).toBe(0);
    });

    it("殭屍王的屍體不算", () => {
      const { w, rules: r, heroes } = world(0);
      const id = summonMobBoss(w, 0, r, heroes[0]!, 100)!;
      expect(anyMobsAlive(w, 0)).toBe(true);

      w.combatActive = false;
      slay(w, heroes[0]!, id);

      expect(corpseStillOnField(w, id), "這條測試沒測到東西:屍體已經被清掉了").toBe(true);
      expect(isMobAlive(w, id)).toBe(false);
      expect(anyMobsAlive(w, 0)).toBe(false);
    });

    /**
     * TICK 內的那一格窗:傷害在 slot 8 結算,`deathSystem` 在 slot 9 才把
     * `alive` 翻掉。中間那一瞬間殭屍是 `hp === 0 && alive === true`。
     * `alive` 與 `hp` 是兩個不同的寫入者,所以兩個都要看。
     */
    it("hp 已歸零、alive 還沒被翻掉(tick 內窗口)也不算", () => {
      const { w, rules: r } = world(0);
      const id = spawnMob(w, 0, r, 1, 0);
      const hp = w.health.get(id)!;
      hp.hp = 0; // 傷害結算完、deathSystem 還沒跑
      expect(hp.alive).toBe(true);
      expect(isMobAlive(w, id)).toBe(false);
      expect(anyMobsAlive(w, 0)).toBe(false);
      // 波次上限那一支也必須看到同一個答案 —— 兩支查詢共用 `isMobAlive` 就是為了
      // 這一格,一份自己 inline 的 `?.alive` 會在這裡分岔。
      expect(mobsAliveInZone(w, 0)).toBe(0);
    });
  });

  describe("清空 → 假", () => {
    it("三種混編:每殺一隻仍為真,殺光最後一隻才變假", () => {
      const { w, rules: r, heroes } = world(0);
      const normal = spawnMob(w, 0, r, 1, 0);
      const special = spawnMob(w, 0, rules(1), 1, 1);
      const boss = summonMobBoss(w, 0, r, heroes[0]!, 100)!;
      expect(w.mob.get(normal)!.kind).toBe("normal");
      expect(w.mob.get(special)!.kind).toBe("special");
      expect(w.mob.get(boss)!.kind).toBe("boss");
      expect(mobsAliveInZone(w, 0)).toBe(3);

      slay(w, heroes[0]!, normal);
      expect(anyMobsAlive(w, 0), "還有兩隻沒消滅,不該回報清空").toBe(true);
      slay(w, heroes[0]!, special);
      expect(anyMobsAlive(w, 0), "殭屍王還在,不該回報清空").toBe(true);
      slay(w, heroes[0]!, boss);

      expect(anyMobsAlive(w, 0)).toBe(false);
      expect(mobsAliveInZone(w, 0)).toBe(0);
    });

    it("回合結束的 endCombatMobs 之後也是假", () => {
      const { w, rules: r } = world(0);
      spawnMob(w, 0, r, 1, 0);
      spawnMob(w, 0, r, 1, 1);
      expect(anyMobsAlive(w, 0)).toBe(true);
      endCombatMobs(w);
      expect(anyMobsAlive(w, 0)).toBe(false);
    });

    it("場上只有活著的英雄 → 假(英雄不是殭屍)", () => {
      const { w, heroes } = world(0, 3);
      for (const h of heroes) expect(w.health.get(h)!.alive).toBe(true);
      expect(anyMobsAlive(w, 0)).toBe(false);
      for (const h of heroes) expect(isMobAlive(w, h), "英雄被當成殭屍,回合永遠不會結束").toBe(false);
    });
  });

  describe("分場 (zone)", () => {
    it("另一場的殭屍不會讓這一場「還有殭屍」", () => {
      const { w, rules: r } = world(0);
      const other = spawnMob(w, 1, r, 1, 0);
      expect(isMobAlive(w, other)).toBe(true);
      expect(anyMobsAlive(w, 1)).toBe(true);
      expect(anyMobsAlive(w, 0), "zone 沒有被過濾 —— 一場的殭屍會卡死另一場的回合").toBe(false);
      expect(mobsAliveInZone(w, 0)).toBe(0);
    });
  });

  describe("兩支查詢不准漂移", () => {
    /**
     * 波次上限讀 `mobsAliveInZone`,回合結束閘讀 `anyMobsAlive`。兩邊各寫一份
     * 「什麼叫活著」,就是「上限說滿了、閘說清空了」的來源。它們共用同一個
     * `isMobAlive`,這條把共用釘住。
     */
    it("anyMobsAlive === (mobsAliveInZone > 0),在每一個中間狀態都成立", () => {
      const { w, rules: r, heroes } = world(0);
      const ids = [spawnMob(w, 0, r, 1, 0), spawnMob(w, 0, rules(1), 1, 1), summonMobBoss(w, 0, r, heroes[0]!, 100)!];
      const seen: boolean[] = [];
      for (let k = 0; k <= ids.length; k++) {
        seen.push(anyMobsAlive(w, 0));
        expect(anyMobsAlive(w, 0)).toBe(mobsAliveInZone(w, 0) > 0);
        if (k < ids.length) slay(w, heroes[0]!, ids[k]!);
      }
      expect(seen).toEqual([true, true, true, false]);
    });
  });

  describe("決定性", () => {
    it("答案與 world.mob 的插入順序無關", () => {
      // 同一組「兩具屍體 + 一隻活的」,三種不同的生成順序,答案必須一樣。
      for (const aliveIdx of [0, 1, 2]) {
        const { w, rules: r, heroes } = world(0);
        const ids = [spawnMob(w, 0, r, 1, 0), spawnMob(w, 0, r, 1, 1), spawnMob(w, 0, r, 1, 2)];
        w.combatActive = false; // 屍體留在場上,順序才有機會影響答案
        ids.forEach((id, i) => {
          if (i !== aliveIdx) slay(w, heroes[0]!, id);
        });
        expect(w.mob.size, "屍體被清掉了,這條就沒有在測順序").toBe(3);
        expect(anyMobsAlive(w, 0), `唯一活著的是第 ${aliveIdx} 隻`).toBe(true);
        expect(mobsAliveInZone(w, 0)).toBe(1);
      }
    });

    it("是純讀取:不抽 rng、不改狀態、可重複呼叫", () => {
      const { w, rules: r } = world(0);
      spawnMob(w, 0, r, 1, 0);
      const rngBefore = w.rng.state;
      const digestBefore = w.digest();
      const answers = [anyMobsAlive(w, 0), anyMobsAlive(w, 0), anyMobsAlive(w, 0)];
      expect(answers).toEqual([true, true, true]);
      expect(w.rng.state, "查詢動到了共用 rng —— replay 會分岔").toBe(rngBefore);
      expect(w.digest()).toBe(digestBefore);
    });
  });
});
