/**
 * ⭐⭐ **槽位詞彙表的三個住處逐格相同**（GH#951）。
 *
 * ⛔⛔ 票文說「兩個住處」。⭐ 量到的是**三個**：
 *
 * | 住處 | 是什麼 | 語意 |
 * |---|---|---|
 * | `content/schema/ref.ts` `zCastableSlot` | Zod enum | 「一次施放可以指名的槽位」 |
 * | `content/schema/common.ts` `zChampionAbilitySlot` | Zod enum | 「一個英雄**擁有**的槽位」 |
 * | `sim/intents.ts` `CASTABLE_SLOTS` | `readonly CastableSlot[]` | ⭐ **迭代順序**（HUD／掃描照這個順序走） |
 *
 * ⇒ ⭐ 第〇·四守則：同一組成員有三個住處，⛔ 而它們今天一樣**只是巧合**。
 *
 * ⛔⛔ **而票文的 Scope（「挑一個當唯一住處」）在這裡行不通** —— 逐條理由：
 *
 * ① ⭐ **型別分層是承重的**：`AbilitySlot = CoreAbilitySlot | "EX"`（⛔ **不含** PASSIVE）
 *    ⇒ `intents.ts` 的檔頭逐字說：「ranking the innate is not *guarded at runtime* —
 *    it is **UNTYPEABLE**」。⭐ 把 `CASTABLE_SLOTS` 換成從 Zod enum 推導，
 *    那個保證當場消失（`rankUpAbility` 會變成收得下 `"PASSIVE"`）。
 *
 * ② ⭐ **import 方向是單向的**：`content/schema/**` ⛔ 不可以 import `sim/**`。
 *    而反向（sim → content）雖然合法，⚠️ 它會把 sim 的型別綁進 schema 的載入順序 ——
 *    ⭐ 而 `ref.ts:84` 自己記著那個環**回來過一次**
 *    （`ReferenceError: Cannot access 'zCastableSlot' before initialization`，
 *    整個 `content:build` 在 import 時就炸）。⛔ 第三次不要再試。
 *
 * ③ ⭐ 兩個 Zod enum 的**語意刻意不同**（擁有 vs 可施放）——
 *    `common.ts` 的註解花了 8 行在區分它與 `ability@1.passive` / `champion@1.passive`。
 *    合併會讓那段區分無處可寫。
 *
 * ⇒ ⭐⭐ **正解是第〇·七守則對「一行接線」病開的藥：讓漂移變成一條會紅的閘**，
 * ⛔ 不是把三個名字壓成一個。⭐ 而這一支就是那條閘。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `sim/intents.ts` 的 `CASTABLE_SLOTS` 把 `"PASSIVE"` 拿掉
 *    → 🔴 ①逐字指名「`CASTABLE_SLOTS` 少了：PASSIVE」
 * M2 `ref.ts` 的 `zCastableSlot` 加一格 `"X"`
 *    → 🔴 ①②都紅（三方比對是**全對全**，⛔ 不是鏈式）
 */
import { describe, expect, it } from "vitest";
import { zCastableSlot } from "./schema/ref";
import { zChampionAbilitySlot } from "./schema/common";
import { CASTABLE_SLOTS } from "../sim/intents";

/** ⭐ 三份**實際的值**（⛔ 不是掃原始碼字串 —— 那是失敗形態⑥）。 */
const HOMES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["zCastableSlot (content/schema/ref.ts)", zCastableSlot.options],
  ["zChampionAbilitySlot (content/schema/common.ts)", zChampionAbilitySlot.options],
  ["CASTABLE_SLOTS (sim/intents.ts)", CASTABLE_SLOTS],
];

describe("槽位詞彙表的三個住處（GH#951）", () => {
  it("★★ ⭐⭐ 三處的**成員集合**逐格相同（⛔ 少一格 = 那條路上的槽位靜默消失）", () => {
    const sets = HOMES.map(([name, v]) => [name, new Set(v)] as const);
    const [, ref] = sets[0]!;
    const problems: string[] = [];
    for (const [name, s] of sets.slice(1)) {
      const missing = [...ref].filter((x) => !s.has(x));
      const extra = [...s].filter((x) => !ref.has(x));
      if (missing.length) problems.push(`${name} 少了：${missing.join(", ")}`);
      if (extra.length) problems.push(`${name} 多了：${extra.join(", ")}`);
    }
    expect(
      problems,
      "⛔⛔ 槽位詞彙表漂了。⭐ 三處**刻意**分開（型別分層／語意／import 方向，理由在檔頭），\n" +
        "  ⇒ ⭐ 加一格槽位要**三處一起加**，⛔ 而這條閘就是那個提醒。\n" +
        `  ${problems.join("\n  ")}`,
    ).toEqual([]);
  });

  it("⭐ 迭代順序：`PASSIVE` 排**最後**（⛔ 它是第六顆按鈕，在 EX 之後）", () => {
    expect(
      CASTABLE_SLOTS[CASTABLE_SLOTS.length - 1],
      "⛔ HUD 與掃描照這個順序走 —— PASSIVE 插到中間會把按鈕排錯",
    ).toBe("PASSIVE");
  });

  it("⭐ 反方向：⛔ **沒有一處是空的**（一份空詞彙表會讓上面兩條都假綠）", () => {
    for (const [name, v] of HOMES)
      expect(v.length, `⛔ ${name} 是空的 —— 這一支的結論全部作廢`).toBeGreaterThan(0);
  });
});
