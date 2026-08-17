/**
 * ⭐【建房選單列得出每一張出貨的場地】—— GH#324 的七張新圖選不到那個缺陷。
 *
 * owner 2026-08-14：「建立房間那邊也要能選到新的七張地圖」。
 *
 * ⚠️ 這條守的是**推導**（第〇·五守則），不是數字：
 * ⛔ 不斷言「有 13 張」——那是出貨值，加一張圖就過期，而且**它過期的方式是紅**，
 *    也就是用錯誤的訊息紅（CLAUDE.md：數字不可以住在測試裡）。
 * ✅ 斷言的是**關係**：`content/arenas/` 有的，選單就要有。
 *
 * 突變紀錄：把 `maps.ts` 的 `arenaOptions()` 改回一份寫死的五筆清單
 * → 這一條紅，並且逐一列出漏掉的 7 張新圖。改回來即綠。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Arenas } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { arenaOptions, arenaLabel, DEFAULT_MAP_ID } from "./maps";

const ARENA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/arenas");

/** 直接讀出貨的檔案 —— ⛔ 不透過任何會被同一個缺陷影響的中間層。 */
function shippedArenas(): { id: string; name: string }[] {
  return readdirSync(ARENA_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(ARENA_DIR, f), "utf8")) as { id: string; name: string });
}

describe("建房的地圖選單 (GH#324)", () => {
  it("⭐ 每一張出貨的場地都在選單裡 —— ⛔ 不可以再是一份手寫清單", () => {
    const shipped = shippedArenas();
    expect(shipped.length, "content/arenas/ 是空的，這條測不到東西").toBeGreaterThan(0);
    Arenas.clear();
    for (const a of shipped) Arenas.register(a as never);

    const listed = new Set(arenaOptions().map((o) => o.id));
    const missing = shipped.filter((a) => !listed.has(a.id)).map((a) => `${a.id}（${a.name}）`);
    expect(
      missing,
      "這些場地在 content/arenas/ 裡，但建房的下拉選單列不出來 —— " +
        "玩家選不到，就跟它們不存在一樣（失敗形態②）",
    ).toEqual([]);
  });

  it("骨架排第一（它是預設值），標籤用 arena doc 自己的中文名", () => {
    const shipped = shippedArenas();
    Arenas.clear();
    for (const a of shipped) Arenas.register(a as never);

    expect(arenaOptions()[0]?.id).toBe(DEFAULT_MAP_ID);
    const sample = shipped.find((a) => a.id !== DEFAULT_MAP_ID);
    if (sample) expect(arenaLabel(sample.id)).toBe(sample.name);
  });

  it("⚠️ 內容還沒載完時回骨架那一筆，⛔ 不是空陣列（空選單看起來像壞了）", () => {
    Arenas.clear();
    expect(arenaOptions().map((o) => o.id)).toEqual([DEFAULT_MAP_ID]);
  });

  /**
   * GH#341：骨架的名字被寫了三份（arena doc /`SKELETON_ARENA`/ 這個檔案裡一個手寫的
   * `"Skeleton (預設)"`），其中兩份是英文 —— 而選單**無條件**用那個手寫常數，
   * 所以只改 doc 沒有用。這一條把三個方向一起關起來：
   *   ① doc 的 `name` ＝ 內建常數 `SKELETON_ARENA.name`（兩份不可以各說各話）
   *   ② 選單真的去讀那份 doc（換個名字註冊，選單就要跟著變）
   *   ③ 內容還沒載完那一筆也取同一個常數，而且**不含英文字母**
   * ⛔ 不把「新手競技場」寫進斷言 —— 那會變成第四份會過期的抄本。
   */
  it("⭐ 骨架的標籤取自 arena doc／SKELETON_ARENA，而且不是英文 (GH#341)", () => {
    const PROBE = "＿探針場地名＿";
    const shipped = shippedArenas();
    const doc = shipped.find((a) => a.id === DEFAULT_MAP_ID);
    expect(doc, "content/arenas/arena.skeleton.json 不見了，這條測不到東西").toBeDefined();
    expect(doc!.name, "arena.skeleton.json 的 name 與內建的 SKELETON_ARENA.name 對不上").toBe(
      SKELETON_ARENA.name,
    );

    Arenas.clear();
    for (const a of shipped) Arenas.register((a.id === doc!.id ? { ...a, name: PROBE } : a) as never);
    expect(
      arenaOptions().find((o) => o.id === DEFAULT_MAP_ID)?.label,
      "選單用一個手寫常數蓋掉了 arena doc 的 name（GH#341 的原形）",
    ).toBe(PROBE);

    Arenas.clear();
    const fallback = arenaOptions()[0]?.label;
    expect(fallback, "內容還沒載完那一筆又自己手寫了一份標籤").toBe(SKELETON_ARENA.name);
    expect(fallback, `預設場地名還是英文：${fallback}`).not.toMatch(/[A-Za-z]/);
  });
});
