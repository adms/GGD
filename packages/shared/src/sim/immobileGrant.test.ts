/**
 * ⭐ M5 —— 【紮根】與【主屬性覆寫】兩格授予，**不必換一整份英雄卡**就拿得到。
 * owner 2026-08-13：「應該是**狀態改變，類似定身**（可攻擊跟施展技能但不能移動）」
 * ⇒ ⛔ 不可以借【定身】(`root`)：那一個是 CC（可淨化／被免控擋／計進 CC 帳）。
 * ⚠️ 量的是**位移**與**最終屬性**，⛔ 不是 `rooted` 布林或「來源掛上了沒有」（失敗形態⑦）。
 * 突變紀錄：`movementHold.ts` 的 `src.immobile` 那一行改成永遠 continue → 第一條紅
 *（量到身體真的走了 7.8）。
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
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { dist } from "./math/vec2";
import type { ModifierSource } from "./stats/modifiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;
/** 白木老樹精的**行走**本體 —— 70-00 紮根今天靠換成 `godie-e010` 才不能動。 */
const WALKING = "godie-e00s" as ChampionId;

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

const spawn = (w: SimWorld): EntityId =>
  spawnChampion(w, {
    championId: WALKING, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: { x: ZC.x, z: ZC.z }, zone: 0,
  });

/** 叫他走去 12 單位外，回報 40 tick 之後真的走了多遠。 */
function walked(grant?: Partial<ModifierSource>): number {
  const w = new SimWorld(SKELETON_ARENA, 20260823);
  w.combatActive = true;
  const id = spawn(w);
  if (grant) attachSource(w, id, { id: "test:grant", kind: "buff", ...grant });
  w.step(NO_INTENTS);
  const from = { ...w.transform.get(id)!.pos };
  for (let i = 0; i < 40; i++) {
    w.nav.get(id)!.moveTarget = { x: ZC.x + 12, z: ZC.z };
    w.step(NO_INTENTS);
  }
  return dist(from, w.transform.get(id)!.pos);
}

describe("M5 紮根 / 主屬性覆寫（來源授予，⛔ 不換英雄卡）", () => {
  it("⭐ 掛著 immobile 的來源就走不動，而同一具身體沒掛它就走得動", () => {
    expect(walked(), "對照組：本體必須走得動").toBeGreaterThan(1);
    expect(walked({ immobile: true }), "掛著紮根授予就不可以移動").toBeLessThan(0.05);
  });

  it("⭐ primaryAttribute 覆寫掉英雄卡上的主屬性（每級加成因此換邊）", () => {
    const w = new SimWorld(SKELETON_ARENA, 20260823);
    // 出貨的每級加成是 `appliesTo:"all"`（誰都給），那一格讀不到主屬性 ——
    // 所以夾具把它切到 `primary`，也就是這一格**唯一**的消費端。
    w.perLevelBonus = { [Stat.AbilityPower]: { amount: 5, appliesTo: "primary" } };
    const id = spawn(w);
    w.champion.get(id)!.level = 5;
    w.stats.get(id)!.dirty = true;
    w.step(NO_INTENTS);
    const asStr = w.stats.get(id)!.final[Stat.AbilityPower];
    attachSource(w, id, { id: "test:primary", kind: "buff", primaryAttribute: "INT" });
    w.step(NO_INTENTS);
    const asInt = w.stats.get(id)!.final[Stat.AbilityPower];
    expect(asInt, "主屬性改成智力之後，每級智力加成要真的加到法強上").toBeGreaterThan(asStr);
  });
});
