/**
 * ⭐ M2 —— 形態閘（`whileForm`）**改讀狀態**：出貨那一份 `whileForm:"alternate"`
 * 一個字都沒改，而它現在靠一個 tags 帶 "form" 的狀態就成立 ⇒ 變身可以只是
 * 「一個狀態 + 一套視覺」，⛔ 不必換 championId。
 *
 * ⛔ 驗機制不驗數字：斷言只有「比沒有時大」「回到原來那個值」，⛔ 零出貨數字。
 * ⚠️ 讀**最終物件**（`stats.final`），⛔ 不是「來源掛上了沒有」（失敗形態⑦）；
 *    被測的是**出貨那一份**（79-002 虛化 + `content/status-effects/bankai.json`），
 *    ⛔ 沒有任何手寫夾具、⛔ 沒有改任何一份文件（失敗形態⑤）。
 * 突變紀錄：`formGate.ts::inAlternateForm` 拿掉 `hasStatusTag(...)` 那一行
 * （只留身體那一半）→ 紅：「帶著形態狀態時 79-002 的加成要真的進到最終屬性:
 *  expected 47.6 to be greater than 47.6」。
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
import { FORM_STATUS_TAG } from "./formGate";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId, type StatusId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const ZC = SKELETON_ARENA.zones[0]!.center;
/** 79-002 虛化 —— 出貨寫著 `whileForm:"alternate"` 的那 7 個 rank 區塊之一。 */
const ICHIGO = "godie-h01n" as ChampionId;
/** 出貨的卍解狀態，`tags` 自己就帶著 "form"。⛔ 測試不替它加。 */
const BANKAI = "bankai" as StatusId;

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

describe("M2 形態閘改讀狀態（whileForm ← status-effect@1.tags)", () => {
  it("⛔ 這條線的兩端都是出貨資料：文件寫 alternate、狀態文件自己標了 form", () => {
    const ex = JSON.parse(readFileSync(join(CONTENT, "abilities", "godie-h01n.ex.json"), "utf-8")) as {
      passive: { ranks: { whileForm?: string }[] };
    };
    expect(ex.passive.ranks[0]!.whileForm, "出貨文件必須仍是舊語意（⛔ 本批沒有遷移它）").toBe(
      "alternate",
    );
    const st = JSON.parse(readFileSync(join(CONTENT, "status-effects", "bankai.json"), "utf-8")) as {
      tags?: string[];
    };
    expect(st.tags, "「哪些狀態算形態」住 JSON，⛔ 不是程式裡的一個 if").toContain(FORM_STATUS_TAG);
  });

  it("⭐ 狀態掛上 → 形態閘為真；狀態到期 → 為假（⛔ 全程沒有換 championId）", () => {
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
    expect(
      w.stats.get(id)!.final[Stat.AttackDamage],
      "帶著形態狀態時 79-002 的加成要真的進到最終屬性",
    ).toBeGreaterThan(before);

    for (let i = 0; i < 8; i++) w.step(NO_INTENTS);
    expect(w.stats.get(id)!.final[Stat.AttackDamage], "狀態到期後形態閘要回到假").toBe(before);
    expect(w.champion.get(id)!.championId, "⛔ 全程不可以換 championId").toBe(ICHIGO);
    expect(w.championForm.get(id), "⛔ 全程不可以有任何變身發生").toBeUndefined();
  });
});
