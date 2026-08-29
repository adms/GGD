/**
 * ⭐【週期領域】模板 → 出貨註冊路徑的**接縫**（GH#648）。
 *
 * ── 失敗形態⑪：兩條對的守衛，組合是空的 ───────────────────────────────────
 * `periodicFieldAnchor.test.ts` 驗**機制**（⛔ 餵自己手寫的夾具＝形態⑤）·
 * `paramsSchema.test.ts` 驗**參數動得了展開結果**（⛔ 只看 `expand()` 的回傳值）。
 * ⇒ 中間那一段沒有人站著，而 2026-08-30 它真的塌過：`shape:"circle"` 少一格字面
 * `radius` ⇒ `expandIfTemplated` 的 `zAbilityDoc.safeParse` 拒收 ⇒ **靜默降級成
 * 空技能**（`radiusTier` 是 `withTiers` 才解析的，跑在 parse **之後**）。
 *
 * ⭐ 三條斷言都驗**關係**，⛔ 沒有技能 id、⛔ 沒有出貨數字。
 *
 * ── 突變紀錄 ───────────────────────────────────────────────────────────────
 *  · `expand.ts` 的 `mult: 1 / ticks` 改成 `mult: 1` → ② 紅（5 ≠ 1，訊息指名它）。
 *    ⭐ 夾具的 `ticks` 是 5 ⇒ 那一行（`ticks > 1`）**確實**被執行到。
 *  · ③ 的 `adopters.length === 0` 改成 `false` → 紅 ⇒ 證明今天 `proseSeesMult`
 *    真的是 false，⛔ 否則③是一條永遠綠的空守衛（不咬的守衛比沒有更糟）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zTemplateDoc } from "./schema/template";
import { zAbilityDoc } from "./schema/ability";
import { expand, mergeExpansion } from "./templates/expand";
import { defaultParamsFor } from "./templates/paramsSchema";
import { abilityQuantities } from "./abilityProse";

const TPL = zTemplateDoc.parse(
  JSON.parse(
    readFileSync(
      join(__dirname, "../../../..", "content/ability-templates/tpl-periodic-field.json"),
      "utf-8",
    ),
  ),
);

const ABILITIES_DIR = join(__dirname, "../../../..", "content/abilities");
const abilityFiles = (): string[] =>
  readdirSync(ABILITIES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

/**
 * 骨架 —— ⭐ **借一份真的出貨模板技能**，⛔ 不是手寫的欄位表（形態⑤：手寫夾具量的
 * 是虛構通道，而它會漏掉出貨文件真正帶的欄位）。展開器擁有的那幾格由
 * `mergeExpansion` 蓋掉，其餘原封不動。
 */
function skeleton(): Record<string, unknown> {
  for (const f of abilityFiles()) {
    const doc = JSON.parse(readFileSync(join(ABILITIES_DIR, f), "utf-8")) as Record<string, unknown>;
    if (doc["template"] !== undefined) return { ...doc, template: { ref: TPL.id, params: {} } };
  }
  throw new Error("⛔ 一份出貨的模板技能都找不到 ⇒ 這支守衛沒有東西可以驗");
}

describe("週期領域模板的出貨接縫 (periodic-field template wiring)", () => {
  it("① 每一組 anchor × applyTo 展開之後都進得了出貨的 zAbilityDoc", () => {
    const anchors = TPL.params["anchor"]?.values ?? [];
    const sides = TPL.params["applyTo"]?.values ?? [];
    expect(anchors.length * sides.length, "母體是空的 ⇒ 這條斷言什麼都沒驗").toBeGreaterThan(0);
    for (const anchor of anchors) {
      for (const applyTo of sides) {
        const params = { ...defaultParamsFor(TPL), anchor, applyTo };
        const merged = mergeExpansion(skeleton(), expand(TPL, params));
        const parsed = zAbilityDoc.safeParse(merged);
        expect(
          parsed.success ? "" : `${anchor}/${applyTo}: ${JSON.stringify(parsed.error.issues[0])}`,
          "⛔ 展開結果被出貨 schema 拒收 ⇒ registerAll 會把它靜默降級成空技能",
        ).toBe("");
      }
    }
  });

  it("② damageTier 是**整段**的預算：一發的倍率 × 發數 == 1", () => {
    const p = defaultParamsFor(TPL);
    const ticks = Math.round((p["durationSec"] as number) / (p["intervalSec"] as number));
    expect(ticks, "夾具只跳一發 ⇒ 突變改不到那一行，這條斷言是假的").toBeGreaterThan(1);
    const wave = expand(TPL, p).effects[0] as unknown as Record<string, unknown>;
    expect(wave["count"], "delayed.count 要等於算出來的發數").toBe(ticks);
    const amount = (wave["effects"] as Record<string, unknown>[])[0]!["amount"] as Record<
      string,
      unknown
    >;
    expect(amount["damageTier"], "級距要留在葉子上（⛔ 不可以在這裡算成數字）").toBe(p["damageTier"]);
    expect(amount["flat"], "⛔ 級距與算好的值不可以同時存在（第〇·四守則）").toBeUndefined();
    expect(
      (amount["mult"] as number) * ticks,
      "⛔ 每發吃滿級距 ⇒ 整片領域是設計預算的 ticks 倍（dot-per-tick 豁免逐字：那把尺量的是單發）",
    ).toBeCloseTo(1, 10);
  });

  /**
   * ③ ⭐ **接內容之前的最後一道**（第一·五守則）。②的 `mult` 讓引擎打對了，⛔ 而卡面
   * 還不會跟著動：`abilityProse.ts:525` 的 `damageRanks` 只讀 `flat`/`perRank` ⇒
   * `{{dmg}}` 印**整段**預算而每發只打 `整段÷發數`，⭐ 而既有的閘全綠
   *（`abilityProse.test.ts` 只問「佔位符綁到葉子沒」，⛔ 不問「綁到的數字對不對」）。
   */
  it("③ 沒有人引用它 ⌄ 或 ⌄ 說明側讀得到 mult —— ⛔ 不可以兩個都不成立", () => {
    const adopters = abilityFiles().filter((f) =>
      readFileSync(join(ABILITIES_DIR, f), "utf-8").includes(`"${TPL.id}"`),
    );
    // 說明側的讀法：餵一個「flat 100 × mult 0.5」的傷害葉，問它印出 50 還是 100。
    const probe = abilityQuantities({
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100, mult: 0.5 } }],
    });
    const proseSeesMult = (probe.dmg[0] ?? "") === "50";
    expect(
      adopters.length === 0 || proseSeesMult,
      `⛔ ${adopters.length} 支引用了 tpl-periodic-field，而 abilityProse 的 damageRanks ` +
        `(abilityProse.ts:525) 仍不讀 Scaling.mult ⇒ 卡面 {{dmg}} 印**整段**預算、每發只打` +
        `整段÷發數。⭐ 修法是讓 damageRanks 乘上 mult，⛔ 不是把 mult 拿掉（那會讓整片` +
        `領域變成預算的 ticks 倍）。\n  ${adopters.join("\n  ")}`,
    ).toBe(true);
  });
});
