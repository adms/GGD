/**
 * 出貨的 `content/config/combat-env.json` 每一格,後台 戰鬥系統 頁都要**看得到**。
 *
 * 守的是**兩個名詞之間的關係**(內容檔 ↔ 後台表格),不是任何一個數字 —— 出貨值
 * 已有三個住處在守,抄進斷言就是第四個。一個內容檔調過、但後台沒標籤或沒分組的
 * key,對操作者等同**寫死**:看不到、改不了,而畫面上完全沒有異狀(#136
 * abilityRange 事故的形狀;2026-08-10 的三格是同一個形狀的第二次)。
 * 體驗層接線 → 一條薄守衛,不開對抗輪。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { COMBAT_ENV_GROUPS, COMBAT_ENV_KEYS, COMBAT_ENV_LABELS } from "./combatEnv";

describe("出貨的 combat-env 每一格在後台都調得到 (adminui-combatenv)", () => {
  it("內容檔的每個 key 都在引擎 key 清單、有中文標籤與說明、且落在剛好一組", () => {
    cover("adminui-combatenv");
    const path = join(__dirname, "../../../content/config/combat-env.json");
    const doc = JSON.parse(readFileSync(path, "utf8")) as { multipliers: Record<string, number> };
    const keys = Object.keys(doc.multipliers);
    expect(keys.length).toBeGreaterThan(0); // 讀錯路徑要紅,不要無聲通過

    const grouped = COMBAT_ENV_GROUPS.flatMap((g) => g.keys);
    for (const k of keys) {
      expect(COMBAT_ENV_KEYS as readonly string[], `${k} 不在引擎 key 清單`).toContain(k);
      const label = COMBAT_ENV_LABELS[k as (typeof COMBAT_ENV_KEYS)[number]];
      expect(label?.zh, `${k} 沒有中文標籤`).toMatch(/[一-鿿]/);
      expect(label?.note, `${k} 沒有說明`).toBeTruthy();
      expect(grouped.filter((g) => g === k), `${k} 沒有分組或重複分組`).toHaveLength(1);
    }
  });
});
