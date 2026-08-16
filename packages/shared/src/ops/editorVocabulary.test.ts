/**
 * ⭐【內容詞彙表 —— 外部編輯器填得出「解析得到」的 id】
 *
 * owner 2026-08-16：「技能對應 技能標籤 效果 機制 **特效** 跟**傳說武器道具**
 * 對應 效果與特效 也是」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼 `runtimeCapabilities` 擋不住這一類
 * ─────────────────────────────────────────────────────────────────────────────
 * 能力清單回答「引擎**做得到**什麼」（37 個 effect kind / 19 個 hook / 17 個模板家族），
 * ⛔ 但它一個 **id** 都沒有。而編輯器要填的是 id：
 *
 *   · `vfxKey` —— `content/vfx/` 有 **632** 份文件，技能實際綁得到的只有 **140** 個。
 *     ⛔ 對方沒有辦法知道哪些是給技能用的。
 *   · 傳說武器池 —— 49 個 `itemId`，指到不存在的道具就是「那一格抽出來是空的」。
 *
 * 🔴 這兩種錯**都不會報錯**：技能照樣放得出來、照樣造成傷害，只是畫面上什麼都沒有
 * （失敗形態①：算出來但沒有畫出來）。抽獎照樣抽，只是抽到空氣。
 *
 * ⇒ 詞彙表把「合法的 id」變成資料；這條測試把「出貨內容自己有沒有壞掉的綁定」
 *   變成一個**會紅的數字**。
 *
 * ⚠️ ⛔ 這條**不釘數量**（140 / 632 / 49 會隨內容變，釘了就是第四個住處）。
 *    它釘的是**關係**：每一個被引用的 id 都要解析得到。
 *
 * 突變紀錄（跑過）：把某支技能的 `vfxKey` 改成一個不存在的 id
 *   → `danglingKeys` 不再是空的 → 紅並印出那個 key。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { buildEditorTargetProfile } from "../../scripts/buildEditorTargetProfile";

const profile = buildEditorTargetProfile({ generatedAt: "1970-01-01T00:00:00.000Z" });
const vocab = profile["contentVocabulary"] as {
  ability: { count: number; fromTemplate: number; templates: { id: string; status: string | null; params: Record<string, unknown> }[] };
  vfx: { keys: string[]; danglingKeys: string[]; boundAbilities: number; docCount: number };
  item: { craftRoles: string[]; modifierOps: string[] };
  legendaryWeapons: { itemIds: string[]; missingItemIds: string[] };
};

describe("外部編輯器的內容詞彙表", () => {
  it("🔴 技能引用的每一個特效 id 都解析得到（⛔ 不釘數量，釘關係）", () => {
    cover("editor-vocabulary");
    // ⚠️ 訊息帶上那幾個 key —— 「長度不是 0」的斷言在紅的時候什麼都沒說。
    expect(`dangling=${vocab.vfx.danglingKeys.join(",")}`).toBe("dangling=");
    // ⛔ 而且詞彙表不可以是空的：讀不到 `content/abilities/` 時上面那條**也會綠**
    //    （空集合沒有 dangling），那正是失敗形態⑤ —— 被測的不是出貨的那個。
    expect(vocab.vfx.keys.length).toBeGreaterThan(0);
    expect(vocab.vfx.boundAbilities).toBeGreaterThan(0);
  });

  it("🔴 傳說武器池裡的每一件都真的存在", () => {
    cover("editor-vocabulary");
    expect(`missing=${vocab.legendaryWeapons.missingItemIds.join(",")}`).toBe("missing=");
    expect(vocab.legendaryWeapons.itemIds.length).toBeGreaterThan(0);
  });

  it("⭐ 可用的模板都帶得出參數 —— ⛔ 空的參數表等於一個填不了的模板", () => {
    cover("editor-vocabulary");
    // `draft` 的參數本來就是空的（它們還不能用）；`enabled` 的空著就是缺陷 ——
    // 編輯器會把它列成可選，然後使用者發現沒有任何一格可以填。
    const brokenEnabled = vocab.ability.templates
      .filter((t) => t.status === "enabled" && Object.keys(t.params).length === 0)
      .map((t) => t.id);
    expect(`enabled 但沒有參數: ${brokenEnabled.join(",")}`).toBe("enabled 但沒有參數: ");
  });

  it("⛔ 道具詞彙不是空的 —— 少了它編輯器只能猜 craftRole / op", () => {
    cover("editor-vocabulary");
    expect(vocab.item.craftRoles.length).toBeGreaterThan(0);
    expect(vocab.item.modifierOps.length).toBeGreaterThan(0);
  });
});
