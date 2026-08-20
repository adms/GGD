/**
 * 15-00 真·不死不滅（`godie-emfr.passive`）—— **門檻**的行為守衛（GH#369）。
 *
 * owner 2026-08-18：「只有在**生命低於 50% 以下**才會觸發」。這裡驗的是那句話
 * 的**機制**：同一具身體、同一段時間，血量在門檻之上時這一跳**不發生**，
 * 在門檻之下時**發生**。
 *
 * ⛔ 2% / 1% / 50% 三個數字**沒有**住在這裡（第二守則）—— 它們住在
 * `content/abilities/godie-emfr.passive.json`（來源是產生器
 * `tools/skill-remake/batch1.py` 的那一列）。抄進斷言就是第四個住處，
 * 而 owner 每週都在改數值。所以斷言是**兩次量測的比較**，不是一個期望值。
 *
 * ⚠️ 讀的是 `ContentLoader` 載進來的**出貨文件**，不是手寫夾具 —— 失敗形態⑤
 * 「被測的不是出貨的那個」：一份手寫的 `{condition: {...}}` 夾具在出貨 JSON 把
 * 那一格弄丟時仍然全綠。
 *
 * 突變（2026-08-18 驗過）：把出貨 JSON 那一格 `condition` 拿掉 → 門檻之上也跳，
 * 兩次量測相等 → 這條紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { DEFAULT_MANA_ECONOMY } from "../manaEconomy";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const NEGI = "godie-emfr" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

/**
 * 讓涅吉在 `hpFrac` 的血量上跑 `seconds` 秒，回報這段時間裡血與魔各動了多少。
 * ⚠️ 兩次呼叫**除了起始血量以外每一格都相同**，所以差異只可能來自門檻。
 */
function run(hpFrac: number, seconds: number): { dHp: number; dMana: number } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  // ⚠️ GH#446 的回魔地板會淹掉這一支自己要量的東西。⭐ owner 2026-08-20 之後
  //    它**預設就是關的**（`enforceFloor: false`，「時間是建議原則」），所以
  //    這一行今天是多餘的 —— 留著是因為它釘的是**這一支要什麼**，⛔ 不是
  //    「出貨預設剛好是什麼」：預設哪天翻回去，這一支也不該跟著變。
  world.manaEconomy = { ...DEFAULT_MANA_ECONOMY, enabled: false };
  world.combatActive = true; // `onInterval` 的閘
  const id = spawnChampion(world, {
    championId: NEGI,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z + 14 },
    zone: 0,
  });
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp * hpFrac;
  const hp0 = hp.hp;
  const mana0 = hp.mana;
  for (let i = 0; i < Math.round(seconds / world.dt); i++) world.step(NO_INTENTS);
  return { dHp: hp.hp - hp0, dMana: hp.mana - mana0 };
}

describe("15-00 真·不死不滅 —— 血量門檻真的擋住了那一跳", () => {
  it("門檻之上不回血也不燒魔；門檻之下兩件事一起發生", () => {
    const innate = Abilities.get(Champions.get(NEGI).passiveAbility!);
    const hook = innate.passive?.ranks[0]?.hooks?.[0];
    // 反向守衛：出貨文件真的還帶著門檻（沒有它，底下兩條會用「兩邊都跳」全綠）
    expect(hook?.condition, "出貨文件的門檻不見了").toBeDefined();

    const seconds = 3;
    const above = run(0.9, seconds); // 明顯在門檻之上
    const below = run(0.2, seconds); // 明顯在門檻之下（兩邊都離血條上下限很遠）

    // ① 回血：門檻之下多回了（差額就是這支技能；共通的自然回復兩邊相同）
    expect(below.dHp).toBeGreaterThan(above.dHp);
    // ② 燒魔：門檻之下的魔力比門檻之上少 —— 同一個 hook 的另一半也被同一格擋住
    expect(below.dMana).toBeLessThan(above.dMana);
  });
});
