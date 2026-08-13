/**
 * ⭐【紮根的玩家自己不會看到橡皮筋】—— GH#321 的閘。
 *
 * 70-00 紮根在伺服器端是對的（`sim/formImmobile.test.ts` 量位移、突變驗過），
 * 但**客戶端預測的影子**原本 `championId: ""`，所以 `movementHold` 查不到
 * 英雄卡的 `immobile` ⇒ 影子照常走出去、伺服器每個 snapshot 把他 snap 回來
 * ⇒ **按下紮根的那個玩家自己**看到橡皮筋。⚠️ 別人看他是正常的。
 *
 * ⛔ 這一條量的是**影子真的有沒有位移**，⛔ 不是「championId 有沒有被設定」
 *    （那是屬性掃描、失敗形態⑦，把 movementHold 的那一段刪掉它照樣綠）。
 *
 * 突變紀錄：把 `LocalPrediction.spawn()` 的 `setup.championId ?? ""` 改回
 * 寫死 `""` → 第一條紅（影子走了）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "@ggd/shared/content/store";
import { registerAll } from "@ggd/shared/content/registries";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { LocalPrediction } from "./LocalPrediction";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
/** 白木老樹精：本體會走（`godie-e00s`），紮根形態不會（`godie-e010`）。 */
const WALKING = "godie-e00s";
const ROOTED = "godie-e010";

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

/** 叫影子走去 10 單位外，回報 40 tick 之後它真的走了多遠。 */
function shadowWalked(championId: string): number {
  const z = SKELETON_ARENA.zones[0]!.center;
  const p = new LocalPrediction(SKELETON_ARENA);
  p.spawn({ seatId: 0, pos: { x: z.x, z: z.z }, zone: 0, moveSpeed: 6, attackRange: 1, championId });
  const from = { ...p.predictedPos! };
  // 出貨的輸入路徑：記一筆 move 指令，然後跑影子自己的 tick。
  p.recordInput(1, { kind: "move", point: { x: z.x + 10, z: z.z } });
  for (let i = 0; i < 40; i++) p.stepTick();
  const to = p.predictedPos!;
  return Math.hypot(to.x - from.x, to.z - from.z);
}

describe("70-00 紮根：客戶端預測也知道走不動（GH#321）", () => {
  it("⭐ 紮根形態的影子走不動，而本體形態的影子走得動", () => {
    const walking = shadowWalked(WALKING);
    const rooted = shadowWalked(ROOTED);
    // ⚠️ 對照組先驗：本體真的會走，否則「兩個都不會走」會假綠。
    expect(walking, "本體形態的影子必須走得動（對照組）").toBeGreaterThan(1);
    expect(rooted, "紮根形態的影子不可以移動（否則玩家自己看到橡皮筋）").toBeLessThan(0.05);
  });
});
