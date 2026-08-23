/**
 * ⛔ **一張寫著「[主動]」的卡，按下去必須真的跑一段效果。**（GH#563）
 *
 * ⭐ 規則本身住 `abilityPressPayload.ts`，**因為 owner 要的是 build 硬卡關**：
 *
 * > 應該要有空陣列檢查放在 build 裡面硬卡關 => effects 是空陣列的上架技能要在
 * > content:build 就被擋下來，**⛔ 不是一條事後才紅的測試**（owner 2026-08-23）
 *
 * ⇒ `scripts/buildIndexes.ts` 與這一支讀**同一支函式**（`findActiveCardsWithNoPayload`），
 * 所以兩邊不可能分岔。這一支留著的價值是**棘輪的另一半**：build 只擋「多出來的」，
 * 這裡多問一句「{@link KNOWN} 上的修好了沒有」——那條 build 不該擋（修好不是錯）。
 *
 * ⚠️ 為什麼它不能併進既有的三支（判準與豁免的推導寫在 `abilityPressPayload.ts` 檔頭）：
 *
 * | 既有守衛 | 它問的 | 為什麼看不到這一族 |
 * |---|---|---|
 * | `abilityNoOpEffects` | 這支技能**有沒有任何載體**改得動一個數字 | `passive` / `marks` 算載體 ⇒ 一支「主動格裡塞被動」的技能對它是綠的 |
 * | `descriptionClaims` | 卡面的**數字**與效果樹對不對得上 | 它連 `def.passive` 一起攤平 ⇒ 數字都在，只是按鍵讀不到 |
 * | `abilityCastClaims` | 玩家給的**輸入**有沒有人讀 | 它只看 `castType` 與 `[召喚]`，⛔ 不問「按下去跑不跑」 |
 *
 * 突變紀錄：拿掉 `godie-osam.r` 的 `template`（⇒ 展開後 `effects` 真的空了）
 * → 紅，訊息指名 `godie-osam.r|active-card-nothing-on-press`。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../sim/content/registry";
import {
  KNOWN,
  findActiveCardsWithNoPayload,
  unknownPressPayloadHits,
  type PressPayloadHit,
} from "./abilityPressPayload";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

let hits: PressPayloadHit[] = [];

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  hits = findActiveCardsWithNoPayload();
});

describe("一張 [主動] 的卡，按下去必須真的跑一段效果（GH#563）", () => {
  it("⛔ 名單外不可以有新的「按下去什麼都不發生」", () => {
    const fresh = unknownPressPayloadHits(hits);
    expect(
      fresh.map((h) => `${h.key}  ${h.where}\n    ${h.why}`).join("\n"),
      `${fresh.length} 支上架技能的卡面說「主動」而引擎收不到任何效果`,
    ).toBe("");
  });

  it("⛔ 名單只准變短 —— 修好了就要把那一列劃掉", () => {
    const live = new Set(hits.map((h) => h.key));
    const stale = KNOWN.filter((k) => !live.has(k.key)).map((k) => `${k.key}（${k.issue}）`);
    expect(stale.join("\n"), "這幾列已經修好了，把它們從 KNOWN 刪掉").toBe("");
  });
});
