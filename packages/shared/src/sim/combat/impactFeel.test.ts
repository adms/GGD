/**
 * ⭐⭐ 「一發打起來有多重」的十三個量值 —— ⛔ 在此之前**只有改程式碰得到**。
 *
 * ── 這條守衛問什麼 ──────────────────────────────────────────────────────
 * ⭐ ① **改那格設定，遊戲裡真的會不一樣**（⛔ 不是「那個欄位存在」——
 *    失敗形態⑦：掃屬性代替掃行為）。跑真的 `SimWorld`、真的普攻、
 *    讀真的 `hitImpact` 事件。
 * ⭐ ② 出貨值**逐位元不變** —— 這一次搬家的是**住處**，⛔ 不是行為。
 *    ⚠️ 比對的是**推導出來的**兩份（`combatFeelFromDoc(出貨 JSON)` vs
 *    `DEFAULT_IMPACT_FEEL`），⛔ 不抄字面值 —— 抄一份就是第四個住處，
 *    而它會過期並且用錯誤的訊息紅（CLAUDE.md 記過的前科）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `damage.ts` 的 `deriveTier(…, feel.tierHeavyImpact, feel.tierMediumImpact)`
 *     改回 `deriveTier(impact, crit, guardBreak)` → 🔴（①：兩份設定量到一樣的分級）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { combatFeelFromDoc, DEFAULT_COMBAT_FEEL, type CombatFeelRules } from "../combatFeel";
import { DEFAULT_IMPACT_FEEL } from "./impactFeel";

beforeAll(() => registerSkeletonContent());

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED_DOC = JSON.parse(
  readFileSync(join(HERE, "../../../../../content/config/combat-feel.json"), "utf8"),
) as unknown;

const ZC = SKELETON_ARENA.zones[0]!.center;

/** 一位攻擊者貼身連打一位站樁的受害者，收集每一發的分級與震動幅度。 */
function tiersOf(feel: CombatFeelRules): { hits: number; heavy: number; shake: number } {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  world.combatFeel = feel;
  const victim: EntityId = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: ZC.x, z: ZC.z }, zone: 0,
  });
  const attacker: EntityId = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: ZC.x + 1.2, z: ZC.z }, zone: 0,
  });
  world.stats.get(attacker)!.final[Stat.AttackSpeed] = 4;

  const out = { hits: 0, heavy: 0, shake: 0 };
  for (let i = 0; i < 90; i++) {
    for (const id of [victim, attacker]) {
      const hp = world.health.get(id)!;
      hp.hp = hp.maxHp; // 死了就沒有下一發可量
    }
    world.step(new Map());
    for (const ev of world.events) {
      if (ev.type !== "hitImpact") continue;
      // ⚠️ `profile` 是**平的** —— `shakeMag` 就在它身上，⛔ 不在 `profile.cosmetics`。
      //   （第一版寫成 `p.cosmetics.shakeMag` ⇒ 兩邊都量到 0，而那看起來像「沒接上」。）
      const p = (ev.data as { profile?: { tier?: string; shakeMag?: number } }).profile;
      out.hits += 1;
      if (p?.tier === "heavy") out.heavy += 1;
      out.shake += p?.shakeMag ?? 0;
    }
  }
  return out;
}

describe("⭐ 打擊量值住在設定裡（⛔ 不是模組層常數）", () => {
  it("★ ⭐ 把分級門檻降到 0 ⇒ **每一發都變重擊**（跑真的比賽，⛔ 不是讀欄位）", () => {
    const base = tiersOf(DEFAULT_COMBAT_FEEL);
    const loud: CombatFeelRules = {
      ...DEFAULT_COMBAT_FEEL,
      impactFeel: { ...DEFAULT_IMPACT_FEEL, tierMediumImpact: 0, tierHeavyImpact: 0 },
    };
    const hot = tiersOf(loud);

    // ⚠️ 儀器（失敗形態④）：先證明「真的打到人」—— 否則兩邊都 0 也會綠。
    expect(base.hits, "⛔ 這 90 tick 一發都沒打中 ⇒ 下面量的是空氣").toBeGreaterThan(0);
    expect(hot.hits).toBe(base.hits);

    expect(
      hot.heavy,
      `⛔⛔ 分級門檻降到 0，而重擊數還是 ${hot.heavy}（出貨門檻下 ${base.heavy}）\n` +
        `⇒ ⭐ \`impactFeel.tier*Impact\` **沒有真的接到** \`deriveTier\` 上\n` +
        `⇒ 那一格在後台改得到、存得起來、⛔ 而遊戲裡什麼都不會變（第一·五守則的形狀）。`,
    ).toBeGreaterThan(base.heavy);
    // 分級升高 ⇒ 震動總量一定跟著升（`SHAKE_BY_TIER` 單調）
    expect(hot.shake).toBeGreaterThan(base.shake);
  });

  it("⭐ 出貨值**逐位元不變** —— 搬的是住處，⛔ 不是行為", () => {
    const shipped = combatFeelFromDoc(SHIPPED_DOC).impactFeel;
    expect(
      shipped,
      `⛔ 出貨 JSON 解析出來的十三格與 \`DEFAULT_IMPACT_FEEL\` 不一樣\n` +
        `⇒ ⭐ 這一次搬家**改到了行為** —— 而它應該是逐位元相同的。`,
    ).toEqual(DEFAULT_IMPACT_FEEL);
  });
});
