/**
 * ⛔⛔ **客戶端預測的移速要與伺服器逐位元相同**（GH#616）。
 *
 * owner 2026-08-23：「客戶端移動還是**非常不順 常常有回溯**的部分 —— 是不是
 * **移動速度客戶端跟伺服器端其實不匹配**？」⭐ 他猜對了。
 *
 * ── 量到的（⛔ 不是推測）──────────────────────────────────────────────────
 * 伺服器那條鏈有**兩格**（`sim/combatEnv.ts` 的 `STAT_ENV_CHAIN`）：
 *   `[ fixed("moveSpeed"), byAttackType(melee:"moveSpeedMelee", ranged:"moveSpeedRanged") ]`
 * 出貨值：`moveSpeed 1` · `moveSpeedMelee 0.8` · `moveSpeedRanged 0.6`
 *
 * ⛔ 而 `GameApp.computeMoveSpeed()` 只乘了**第一格** ⇒ 影子比伺服器
 * **快 25%（近戰）／67%（遠程）**，於是每一張快照都把角色拉回去 ＝「回溯」。
 *
 * ⚠️ ⭐ **而那一行上面的註解逐字寫著**「SERVER PARITY: … mirror **both** here or
 * prediction diverges the moment an admin sets moveSpeed != 1」——
 * 它說了要 mirror 兩格，而它 mirror 了一格。**第三守則：註解會說謊。**
 *
 * ── 這條守衛驗什麼 ─────────────────────────────────────────────────────────
 * ⭐ **兩邊算出同一個 double**，而且對**近戰與遠程都**要成立
 * （⛔ 只驗一種的話，`byAttackType` 那一格漏掉仍然會綠 —— 近戰 0.8 與遠程 0.6
 *  之中只要有一個剛好等於 1 就蒙混過去）。
 * ⛔ 一個出貨數字都沒進斷言：兩邊都從**出貨的** `combat-env` 與英雄卡算。
 *
 * 突變（一條，承重線）：把 `computeMoveSpeed` 的 `finalizeStat(...)` 換回
 * `ms *= env.moveSpeed` ⇒ 紅，而且**遠程那一邊差最多**。
 */
import { beforeAll, describe, expect, it } from "vitest";
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
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { predictedMoveSpeed } from "./predictedStats";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

/** 出貨的 `config.combat-env@1`（⛔ 不是程式預設）。 */
function shippedEnv() {
  const doc = Configs.tryGet("combat-env") as { multipliers?: Record<string, number> } | undefined;
  return normalizeCombatEnv(doc?.multipliers ?? {});
}

/**
 * ⭐ **出貨的那一支** —— `GameApp.computeMoveSpeed()` 逐字轉呼叫它。
 *
 * ⚠️ 這一行是這條守衛能不能活的關鍵：2026-08-23 的第一版在這裡**自己重寫了**
 * 一份 `finalizeStat(...)` 呼叫，於是把出貨路徑改回錯的版本**測試照樣綠**
 * （失敗形態⑤，突變實測 EXIT=0）。⇒ 現在它呼叫的是同一份程式。
 */
function clientPredictedSpeed(championId: string): number {
  return predictedMoveSpeed(championId, [], shippedEnv());
}

/** 伺服器**真的**跑出來的那個值（真 SimWorld + 真 stat pipeline）。 */
function serverSpeed(championId: string): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatEnv = shippedEnv();
  const id = spawnChampion(world, {
    championId: championId as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: C.x, z: C.z }, zone: 0,
  });
  world.step(new Map());
  return world.stats.get(id)!.final[Stat.MoveSpeed];
}

describe("移速預測與伺服器的一致性（GH#616）", () => {
  it("⭐ 近戰與遠程**都**要逐位元相同 —— ⛔ 只對一種成立不算", () => {
    // ⛔ 不寫死英雄 id：從出貨名單各挑一位，⭐ owner 換英雄這條自動涵蓋。
    const ids = Champions.ids().map(String);
    const melee = ids.find((c) => Champions.tryGet(c as ChampionId)?.attackType === "melee");
    const ranged = ids.find((c) => Champions.tryGet(c as ChampionId)?.attackType === "ranged");
    expect(melee, "出貨名單裡找不到近戰英雄 —— 標本失效了").toBeDefined();
    expect(ranged, "出貨名單裡找不到遠程英雄 —— 標本失效了").toBeDefined();

    for (const [kind, id] of [["近戰", melee!], ["遠程", ranged!]] as const) {
      expect(
        clientPredictedSpeed(id),
        `⛔ ${kind}（${id}）預測與伺服器不一致 ⇒ 影子跑在前面，每一張快照把玩家拉回去（「回溯」）`,
      ).toBe(serverSpeed(id));
    }
  });

  it("⭐ 對照組：近戰與遠程的出貨倍率**真的不同** —— 否則上面那條驗不到 byAttackType", () => {
    const env = shippedEnv();
    expect(
      env.moveSpeedMelee,
      "近戰與遠程倍率相同 ⇒ 上面那條對「漏掉第二格」的實作也會綠（失敗形態④）",
    ).not.toBe(env.moveSpeedRanged);
  });
});
