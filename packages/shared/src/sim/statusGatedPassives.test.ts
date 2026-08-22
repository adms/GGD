/**
 * ⭐ M2 —— 被動 rank 的**狀態閘**（`whileStatus`）真的會掛上、也真的會卸下。
 * ⛔ 驗機制不驗數字：斷言只有「比沒有時大」「回到原來那個值」，⛔ 零出貨數字。
 * ⚠️ 讀**最終物件**（`stats.final`），⛔ 不是「來源掛上了沒有」（失敗形態⑦）；
 *    被測的是**出貨那一份**（79-002 虛化）只換掉閘那一格，⛔ 不是手寫夾具（失敗形態⑤）。
 * 突變紀錄：拿掉 `statusGatedPassives.ts` 的 `if (resync) syncAbilityPassives(...)`
 * → 紅（狀態掛上去了而 AD 一格都沒動：47.6 vs 47.6）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId, type StatusId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;
/** 79-002 虛化 —— 出貨就寫著「只在卍解狀態下」的那一支，今天用形態閘。 */
const ICHIGO = "godie-h01n" as ChampionId;
const BANKAI = "bankai" as StatusId;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects"] as const) {
    for (const f of readdirSync(join(CONTENT, c)).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(CONTENT, c, f), "utf-8")) as { id: string };
      store.add(c, doc.id, doc);
    }
  }
  // 出貨那一份，只換掉閘那一格：形態閘 → 狀態閘。⭐ 79-04 卍解**今天已經**
  // 同時掛 `championForm` 與 `statusId:"bankai"`，所以這正是「變身態退場之後」
  // 那份文件會長的樣子。
  const ex = JSON.parse(readFileSync(join(CONTENT, "abilities", "godie-h01n.ex.json"), "utf-8")) as {
    id: string;
    passive: { ranks: Record<string, unknown>[] };
  };
  delete ex.passive.ranks[0]!["whileForm"];
  ex.passive.ranks[0]!["whileStatus"] = BANKAI;
  store.add("abilities", ex.id, ex);
  registerAll(store);
});

describe("M2 狀態閘住的被動 rank（whileStatus）", () => {
  it("⭐ 狀態掛上 → 這一階生效；狀態到期 → 它自己卸下（⛔ 全程沒有變身）", () => {
    const w = new SimWorld(SKELETON_ARENA, 20260823);
    w.combatActive = true;
    const id: EntityId = spawnChampion(w, {
      championId: ICHIGO,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: ZC.x, z: ZC.z },
      zone: 0,
    });
    w.abilities.get(id)!.exSlot!.rank = 1; // EX 解鎖
    w.step(NO_INTENTS);
    const before = w.stats.get(id)!.final[Stat.AttackDamage];

    w.status.set(id, {
      effects: [{ statusId: BANKAI, sourceId: "test", expiresAtTick: w.tick + 6 }],
    });
    w.step(NO_INTENTS);
    const during = w.stats.get(id)!.final[Stat.AttackDamage];
    expect(during, "帶著卍解狀態時 79-002 的加成要真的進到最終屬性").toBeGreaterThan(before);

    for (let i = 0; i < 8; i++) w.step(NO_INTENTS);
    expect(w.stats.get(id)!.final[Stat.AttackDamage], "狀態到期後要自己卸下").toBe(before);
    expect(w.championForm.get(id), "⛔ 全程不可以有任何變身發生").toBeUndefined();
  });
});
