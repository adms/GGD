/**
 * ⭐ 編輯器按「新增技能」拿到的骨架，要**落在五級距的格點上**。
 *
 * owner 2026-08-19：「技能相關設定正規化成五級距⋯**編輯器 後台設定 都統一**」。
 * ⚠️ 在此之前骨架是 `cooldown: [10, 9, 8, 7, 6]` / `range: 0` —— 每按一次新增，
 * 就多生一支不在格點上的技能，而 `tierSnap` 那條規則正在收的就是這種東西。
 *
 * 兩件事一起驗（⛔ 分開寫就是兩條會分岔的守衛）：
 *   ① 骨架**通得過出貨 Zod**（不然作者第一次存檔才發現）。
 *   ② 骨架的冷卻／距離**逐位元等於出貨 resolver 解析出來的值** ——
 *      也就是「級距開著」與「級距關掉」兩條路給出同一支技能（無縫回退）。
 * 突變：把骨架的 `cooldownTier` 拿掉 → ② 紅（退路值不再等於級距值）。
 */
import { describe, it, expect } from "vitest";
import { resolveCooldownTier, cooldownTiersFromDoc } from "@ggd/shared/content/cooldownTiers";
import { resolveRangeTier, rangeTiersFromDoc } from "@ggd/shared/content/rangeTiers";
import { collectionEntry } from "./collections";

describe("新增技能的骨架落在五級距上", () => {
  it("★ 骨架通得過 ability@1，而且級距解析前後逐位元相同", () => {
    const entry = collectionEntry("abilities");
    const doc = entry.template("tpl-probe") as Record<string, unknown>;
    expect(entry.schema.safeParse(doc).success, "新技能骨架過不了出貨 Zod").toBe(true);

    // ⭐ 級距開著時引擎會寫回什麼？要和骨架自己帶的退路值一模一樣。
    const afterCd = resolveCooldownTier(doc, cooldownTiersFromDoc(undefined));
    expect(afterCd.cooldown, "冷卻退路值不在格點上 —— 級距一關手感就跳").toEqual(doc.cooldown);
    const afterRange = resolveRangeTier(doc, rangeTiersFromDoc(undefined));
    expect(afterRange.range, "施法距離退路值不在格點上").toEqual(doc.range);
    // 級距名真的填了（沒填的話上面兩條在「resolver 原樣返回」下也會過）。
    expect(typeof doc.cooldownTier).toBe("string");
    expect(typeof doc.rangeTier).toBe("string");
  });

  it("★ 英雄骨架的四支技能也一樣（R 走最貴那一格）", () => {
    const champ = collectionEntry("champions").template("tpl-champ") as {
      abilities: Record<string, Record<string, unknown>>;
    };
    expect(collectionEntry("champions").schema.safeParse(champ).success).toBe(true);
    for (const [slot, ab] of Object.entries(champ.abilities)) {
      const after = resolveCooldownTier(ab, cooldownTiersFromDoc(undefined));
      expect(after.cooldown, `${slot} 的冷卻退路值不在格點上`).toEqual(ab.cooldown);
    }
  });
});
