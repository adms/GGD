/**
 * ⭐⭐ **站在共用替身網格上的英雄，只准變少。**
 *
 * ── ⛔ 為什麼這需要一條棘輪 ─────────────────────────────────────────────
 * 一位英雄站在共用替身上時，畫面**看起來是正常的** —— ⛔ 它只是**別人**。
 * ⇒ ⭐ 沒有任何東西會紅，⛔ 而它會一直這樣下去。
 *
 * ⚠️ ⭐ 而 2026-09-02 查到 `godie-e00r`（初號機）的**正確答案已經確定**：
 * w3x 原始資料 `heroes.E00R.model = units\creeps\SatyrTrickster\SatyrTrickster.mdl`
 * ⇒ ⛔ 卡的只有「抽出那顆內建模型」（需要 WC3 的 MPQ，repo 裡零命中）。
 *
 * ⇒ ⭐ 這條棘輪讓那件事**不會被忘記**：
 *   · 抽到了、指過去了 ⇒ 數字變小 ⇒ ⭐ **要把 CEIL 調小**（進步要被記錄）
 *   · 又多一位英雄落到替身上 ⇒ **紅**，並指名那一位
 *
 * ⚠️ ⭐ 它刻意**不**斷言「零位」—— 那會讓這條測試在今天就是紅的，
 * ⛔ 而一條永遠紅的閘等於沒有閘（失敗形態⑨）。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · CEIL 調成 3 → 🔴（指名第 4 位）
 *   · `isStandIn` 改成永遠 false → 🔴（儀器那一條）
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isStandInModel } from "./championIdentity";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * ⭐ 2026-09-02 量到的真值。⛔ 調大之前先問「這是進步還是退步」。
 *
 * ── ⛔⛔ 而這個數字更正過一次，值得記著 ──────────────────────────────────
 * 我先前逐次回報「**4 位**」——⛔ 那是用 `champ.skin.` 這個**較窄**的前綴數的。
 * ⭐ 而**出貨的** `isStandInModel` 用的是 `champ.`（`championIdentity.ts` 的
 * `STAND_IN_MODEL_PREFIX`）⇒ 真值是 **18 位**。
 *
 * ⚠️ ⭐ 差別在**九位英雄共用 `champ.sela`** ＋ 幾位共用 `champ.thorne` ——
 * 它們是**起始英雄自己的模型**，⛔ 而九個人長同一張臉一樣是「它只是別人」。
 * ⇒ ⭐ 這正是這份 repo 記過的形狀：**用自己的判準去數，而出貨的判準是另一個。**
 *
 * ── 今天的 18 位（⭐ 分成三群）────────────────────────────────────────
 *  · `champ.sela` ×9 · `champ.thorne` ×n · `champ.skin.*` ×4
 *  · 其中 `godie-e00r`（初號機）的**正解已知**：SatyrTrickster（GH#933）
 */
const STAND_IN_CEIL = 18;

describe("共用替身英雄（只准變少）", () => {
  const champs = readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as {
          id: string;
          name?: string;
          modelKey?: string;
        },
    );

  it("★★ ⭐ 數量只准變少（⛔ 而每一位都指名）", () => {
    const standIns = champs
      .filter((c) => isStandInModel(c.modelKey))
      .map((c) => `${c.id}（${c.name ?? "?"}）→ ${c.modelKey}`)
      .sort();
    expect(champs.length, "儀器：一位英雄都沒讀到 ⇒ 下面在量空氣").toBeGreaterThan(50);
    expect(
      standIns.length,
      "⛔⛔ 站在**共用替身網格**上的英雄變多了：\n" +
        standIns.map((s) => `   · ${s}`).join("\n") +
        "\n" +
        "   ⭐ 這種情況畫面**看起來是正常的** —— ⛔ 它只是**別人**。\n" +
        "   ⇒ 給那一位一顆自己的模型；⛔ 而如果是**刻意**的，把 CEIL 調大並寫下為什麼。",
    ).toBeLessThanOrEqual(STAND_IN_CEIL);
  });

  it("★ ⭐ 儀器：今天**真的**有替身英雄（⛔ 否則上面那條在量空氣）", () => {
    const n = champs.filter((c) => isStandInModel(c.modelKey)).length;
    expect(
      n,
      "⛔ 一位替身英雄都沒量到 ⇒ ⭐ 那不是「都修好了」（CEIL 會跟著調小），\n" +
        "   ⛔ 而是 `isStandInModel` 壞了。",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐ `godie-e00r` 的**正解已知** —— ⛔ 而它還沒被指過去", () => {
    const e00r = champs.find((c) => c.id === "godie-e00r");
    expect(e00r, "儀器：初號機不在出貨樹裡").toBeDefined();
    // ⭐ 這一條在**修好的那一天**會紅 —— ⚠️ 而那正是它該紅的時候：
    //   ⇒ 提醒去把 CEIL 調小、把這條改成「⭐ 已修好」。
    if (!isStandInModel(e00r!.modelKey)) {
      expect(
        e00r!.modelKey,
        "⭐⭐ 初號機不再是替身了 —— ⛔ 而這條測試還停在舊的世界。\n" +
          "   ⇒ 把 `STAND_IN_CEIL` 調成 3，並把這一條改成斷言新的 modelKey。",
      ).toBe("（把這裡換成新的 modelKey）");
    }
    // ⭐ 而正解**寫在這裡**（⛔ 不是只在票上）：下一輪讀到這個檔的人不必再查一次。
    //   w3x `heroes.E00R.model = units\creeps\SatyrTrickster\SatyrTrickster.mdl`
    //   ⇒ 抽那顆內建模型 → `w3x.stock.satyrtrickster` → 指過去（GH#933）。
    expect(e00r!.modelKey).toBe("champ.skin.rogue");
  });
});
