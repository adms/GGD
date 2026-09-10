/**
 * ⭐ GH#1222 —— 出貨的級距表 vs **從母體推導**的預設：⛔ 同一個值不可以有兩個住處（第〇·四守則）。
 *
 * ## ⚠️ 為什麼在此之前沒有人叫
 *
 * 這幾張表**兩邊都存在**：`content/config/<x>-tiers.json` 是出貨值，
 * `DEFAULT_*_TIERS` 是**從英雄母體推導**的（例：耗魔 = `manaTiersFromPool(medianFinalMana(30))`）。
 * ⇒ 母體一變（2026-09-10 上架 81 名新英雄，68 → 130），推導值就動，⛔ 而 config 是上一次的快照。
 *
 * 📏 量到的（2026-09-11）：耗魔差 **2.8%**（小 144 vs 148）。
 * ⭐ 而它被抓到的方式是**間接**的：`tierRawParity` 比對的是「技能 ↔ 級距」，⛔ 不是「兩份級距表彼此」
 *   ⇒ 症狀出現在 **402 個技能節點**上，而錯誤訊息叫人跑 `apply_tiers.py`
 *   —— ⛔ **跑了沒用**（正規化器讀 config，閘讀 Zod，兩邊各自都是自洽的）。
 *   ⚠️ 那正是 CLAUDE.md 記過的「修法指令治不好它指出的病」（形態⑨第三變形）。
 *
 * ## ⭐ 這一條問的是兩份表**彼此**
 *
 * ⛔ 它不驗那些數字是多少（母體會長，公式會自己給新答案）——
 * ⭐ 它驗的是「出貨的那一份 == 公式今天的答案」，⇒ 母體一動就當場紅，並指名哪一軸哪一格。
 *
 * MUTATION（落地前跑過）：把 `mana-tiers.json` 的「小」改回 144 ⇒ 紅並指名
 * 「mana-tiers.json 的 小：144，而公式今天算出 148」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { DEFAULT_MANA_TIERS } from "./manaTiers";
import { DEFAULT_COOLDOWN_TIERS } from "./cooldownTiers";
import { DEFAULT_RANGE_TIERS } from "./rangeTiers";
import { DEFAULT_AOE_TIERS } from "./aoeTiers";
import { DEFAULT_MOVE_SPEED_TIERS } from "./moveSpeedTiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** [檔名, 推導出來的那一份, 要比的那一格] —— ⭐ 每一軸都要在這裡，⛔ 少一軸就是少一道閘。 */
const AXES: readonly (readonly [string, Record<string, unknown>, string])[] = [
  ["mana-tiers.json", DEFAULT_MANA_TIERS as unknown as Record<string, unknown>, "manaCost"],
  ["cooldown-tiers.json", DEFAULT_COOLDOWN_TIERS as unknown as Record<string, unknown>, "seconds"],
  ["range-tiers.json", DEFAULT_RANGE_TIERS as unknown as Record<string, unknown>, "range"],
  ["aoe-tiers.json", DEFAULT_AOE_TIERS as unknown as Record<string, unknown>, "radius"],
  ["move-speed-tiers.json", DEFAULT_MOVE_SPEED_TIERS as unknown as Record<string, unknown>, "bonus"],
];

describe("級距表的兩個住處（GH#1222）", () => {
  it("★ 出貨的每一張級距表 == 公式今天算出來的那一份", () => {
    cover("tier-config-matches-derived");
    const drift: string[] = [];
    let compared = 0;
    for (const [file, derived, key] of AXES) {
      let shipped: Record<string, unknown>;
      try {
        shipped = JSON.parse(readFileSync(join(CONTENT, "config", file), "utf8")) as Record<string, unknown>;
      } catch {
        drift.push(`  ${file} 讀不到 —— ⛔ 這一軸的閘等於不存在`);
        continue;
      }
      const a = shipped[key] as Record<string, number> | undefined;
      const b = derived[key] as Record<string, number> | undefined;
      if (a === undefined || b === undefined) {
        drift.push(`  ${file} 沒有 \`${key}\` 這一格（出貨=${a === undefined}，推導=${b === undefined}）`);
        continue;
      }
      // ⚠️ 冷卻那一軸是**巢狀**的（單體／範圍／變身各一組五級距）⇒ 逐層下探，
      //   ⛔ 不是拿物件去比 `!==`（那會印出一排 `[object Object]` 而說不出差在哪一格）。
      const walk = (x: unknown, y: unknown, path: string): void => {
        if (typeof x === "object" && x !== null && typeof y === "object" && y !== null) {
          const xo = x as Record<string, unknown>;
          const yo = y as Record<string, unknown>;
          for (const k of new Set([...Object.keys(xo), ...Object.keys(yo)])) walk(xo[k], yo[k], `${path}.${k}`);
          return;
        }
        compared++;
        if (x !== y) drift.push(`  ${file} 的 ${path}：${String(x)}，而公式今天算出 ${String(y)}`);
      };
      for (const tier of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk(a[tier], b[tier], tier);
      }
    }
    // ⭐ 反空轉：比不到任何一格就代表這條閘是空跑的（失敗形態③）。
    expect(compared, "⛔ 一格都沒比到 —— 這條閘空轉了").toBeGreaterThan(15);
    expect(
      drift,
      "⛔⛔ 出貨的級距表與公式今天的答案不一致 ⇒ **同一個值有兩個住處**（第〇·四守則）：\n" +
        drift.join("\n") +
        "\n⇒ ⭐ 母體一長（上架新英雄），推導值就會動 —— 把 config 更新成公式的答案，" +
        "\n  然後跑 `bash scripts/genrun.sh tiers:apply` 讓技能節點跟上。" +
        "\n⛔ 不要改這條測試：它問的是**兩份表彼此**，⛔ 不是那些數字是多少。",
    ).toEqual([]);
  });
});
