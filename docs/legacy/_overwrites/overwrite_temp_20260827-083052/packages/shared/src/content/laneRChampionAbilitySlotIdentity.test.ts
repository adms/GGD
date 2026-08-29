/**
 * ⭐ GH#635 / GH#764 的閘：**一位英雄的兩格技能不可以是同一支**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這條抓的是什麼（2026-08-27 出貨現況量到的缺陷本身）
 * ─────────────────────────────────────────────────────────────────────────────
 * `godie-h02u`（草泥馬的變身殼）身上 W ＝「92-02 狂草泥馬」、E ＝「92-03 狂草泥馬」——
 * **兩格同一支技能、兩個不同的編號**，而 92-02 在原作是**消化液**（w3x `A0WA`）。
 * 於是消化液在那一殼整個不存在，而它的卡面 `description` 與語音
 * （`skill-name.e.mp3`「消化液！」）都還在講它。
 *
 * ⭐ 根因值得寫下來：`1edf81ec` 跑的是「**照編號配對**同步變身對子」，而**編號本身
 * 已經漂掉了** ⇒ 掛著錯編號的 `h02u.e` 被配到 `h02v.w`，三層整個覆蓋。
 * ⇒ 同步器要先問「**key 本身可信嗎**」，⛔ 不是「兩邊一不一樣」（第〇·六守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼既有的守衛全都放行
 * ─────────────────────────────────────────────────────────────────────────────
 * · `abilityCodeParity` 問「**同編號**的兩份技能值一不一樣」—— 這裡兩格是**不同**編號
 * · `abilityCodeParityForms` 問「兩邊有沒有一起動」—— 覆蓋當下**兩邊都動了**
 * · `abilityMirror` 問「standalone ↔ 內嵌一不一樣」—— 兩份一起錯就一起對
 * ⇒ 每一條問的都是**跨文件**的關係,沒有一條問「**同一張卡自己**說得通嗎」。
 *
 * ⚠️ 界線：這條**不裁決**哪一格是對的（第〇·六守則,那是 owner 的權力）。
 * 它只說「這一位英雄有兩格是同一支技能」。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 直接讀檔，⛔ 不經 ContentLoader —— 這條要在 `content:build` 之前也能跑。 */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/champions");

/** `92-02 消化液` → `["92-02", "消化液"]`；沒有編號的名字回 `[null, 名字]`。 */
function splitCode(name: string): readonly [string | null, string] {
  const m = /^(\d{2}-\d{2,3})\s+(.*)$/.exec(name);
  return m ? [m[1], m[2].trim()] : [null, name.trim()];
}

/** 一位英雄卡面上**看得到**的每一格技能：Q/W/E/R ＋ EX ＋ 天生技。 */
function slotsOf(doc: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  const abilities = (doc.abilities ?? {}) as Record<string, { name?: unknown }>;
  for (const slot of Object.keys(abilities).sort()) {
    const n = abilities[slot]?.name;
    if (typeof n === "string" && n) out.set(slot, n);
  }
  for (const [key, label] of [
    ["exAbility", "EX"],
    ["passiveAbility", "天生"],
  ] as const) {
    const n = (doc[key] as { name?: unknown } | undefined)?.name;
    if (typeof n === "string" && n) out.set(label, n);
  }
  return out;
}

describe("一張英雄卡自己說不說得通", () => {
  const docs = readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, unknown>);

  it("⭐ 同一位英雄不可以有兩格是同一支技能（同技能名／同編號都算）", () => {
    expect(docs.length, "英雄卡一份都沒讀到 ⇒ 這條會安靜地全綠").toBeGreaterThan(50);

    const findings: string[] = [];
    for (const doc of docs) {
      const byName = new Map<string, string[]>();
      const byCode = new Map<string, string[]>();
      for (const [slot, name] of slotsOf(doc)) {
        const [code, bare] = splitCode(name);
        byName.set(bare, [...(byName.get(bare) ?? []), slot]);
        if (code) byCode.set(code, [...(byCode.get(code) ?? []), slot]);
      }
      for (const [bare, slots] of byName) {
        if (slots.length > 1) {
          findings.push(`${doc.id as string}　${slots.join(" 與 ")} 兩格都是「${bare}」`);
        }
      }
      for (const [code, slots] of byCode) {
        if (slots.length > 1) {
          findings.push(`${doc.id as string}　${slots.join(" 與 ")} 兩格都掛編號 ${code}`);
        }
      }
    }

    expect(
      findings.sort().join("\n"),
      "⛔ 這幾位英雄有兩格是同一支技能 —— 玩家看到的是重複的卡面，" +
        "而**被擠掉的那一支整支不存在**（GH#635：草泥馬的消化液就是這樣消失的，" +
        "而它的語音與 description 都還在講它）。\n" +
        "⭐ 編號是 JASS 對照的 join key（綁死）⇒ 回 `tools/w3x-import/out/GoDieEX22s-src/" +
        "OBJECTS.json` 查那兩個編號各自掛哪一支，⛔ 不要猜、⛔ 也不要跑「照編號同步」——" +
        "編號自己漂掉的時候，那個動作會**毀資料**而不是修好它。\n" +
        "⚠️ 有變身的英雄是**兩份文件**，改一邊 ⇒ `abilityCodeParityForms` 會紅。",
    ).toBe("");
  });
});
