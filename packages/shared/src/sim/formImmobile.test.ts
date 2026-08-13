/**
 * ⭐【70-00 紮根：可攻擊、可施法、**不能移動**】—— owner 2026-08-13 逐字：
 *
 *   「應該是**狀態改變，類似定身**（可攻擊跟施展技能但不能移動），
 *     並非把移動速度調整到 0」
 *
 * ⛔ 這一條不驗任何**數字**（ms 是多少、armor 幾倍都不在這裡）——
 *    那些有三個住處 + drift 測試在守。它驗的是**機制會不會發生**。
 *
 * ⚠️ 量的是**位移**，不是 `movementHold().rooted` 那個布林：後者是屬性掃描
 *    （失敗形態⑦），把 `MovementSystem` 對 `rooted` 的消費整段刪掉它照樣綠。
 *
 * 突變紀錄：把 `movementHold.ts` 的 `immobile` 那一段拿掉 → 第一條紅
 *（「紮根形態不可以移動」量到身體真的走了）。
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
import { dist } from "./math/vec2";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;
/** 白木老樹精 —— 本體會走，紮根形態不會。 */
const WALKING = "godie-e00s" as ChampionId;
const ROOTED = "godie-e010" as ChampionId;

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects"] as const) {
    for (const f of readdirSync(join(CONTENT, c)).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(CONTENT, c, f), "utf-8")) as { id: string };
      store.add(c, doc.id, doc);
    }
  }
  registerAll(store);
});

/** 生一具身體，叫它走去 12 單位外，回報 40 tick 之後它真的走了多遠。 */
function walkedDistance(championId: ChampionId): number {
  const w = new SimWorld(SKELETON_ARENA, 20260813);
  w.combatActive = true;
  const id: EntityId = spawnChampion(w, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: ZC.x, z: ZC.z },
    zone: 0,
  });
  w.step(NO_INTENTS);
  const from = { ...w.transform.get(id)!.pos };
  for (let i = 0; i < 40; i++) {
    w.nav.get(id)!.moveTarget = { x: ZC.x + 12, z: ZC.z };
    w.step(NO_INTENTS);
  }
  return dist(from, w.transform.get(id)!.pos);
}

describe("70-00 紮根：形態閘住的移動封鎖（owner 2026-08-13）", () => {
  it("⭐ 紮根形態叫它走也走不動，而本體同一個指令走得動", () => {
    const rooted = walkedDistance(ROOTED);
    const walking = walkedDistance(WALKING);
    // ⚠️ 對照組先驗：本體真的會走，否則上面那條會因為「兩個都不會走」而假綠。
    expect(walking, "本體必須走得動（對照組）").toBeGreaterThan(1);
    expect(rooted, "紮根形態不可以移動").toBeLessThan(0.05);
  });
});
