/**
 * ⭐⭐ GH#902 —— 「卡片上寫了但遊戲裡不會發生」的**棘輪閘**。
 *
 * ── ⛔⛔ 票文的母體 **72 是算錯的**（2026-09-01 逐份重量）────────────────
 * 票文自己警告過「這個數字重量了三次才定案：147 → 137 → 72」，⭐ 而它**仍然錯**。
 * 三個獨立的誤算，每一個都把母體灌大：
 *
 * | 誤算 | 灌大了多少 | 為什麼 |
 * |---|---:|---|
 * | 把 `template` 當成「沒有實作」 | **63** | ⭐ `template` **就是**實作（第〇·五守則：技能＝模板組合）。實測 **71 支全部展得出 effects**（`expandStack` 跑過，⛔ 不是推測） |
 * | 把 `marks` 當成「沒有實作」 | **1** | 52-00 十二道試煉的 `marks.perStackLost` 就是它的機制 |
 * | passive 只查 `aura`（**單數**） | **7** | ⭐ 真正的欄位名是 **`auras`**（複數）⇒ 七支有真實作的被數進去 |
 *
 * ⇒ ⭐ **真母體 = 1**（`godie-emns.w` 44-02 死神的規則）。
 * ⚠️ 這正是 CLAUDE.md 記過的「**一個被 glob 灌大的統計，讀起來跟真的一模一樣**」。
 *
 * ── ⭐ 這條閘問什麼 ──────────────────────────────────────────────────
 * 「這支技能的描述承諾了事情，⛔ 而它在**任何一個住處**都沒有實作嗎？」
 * 住處有**五個**（⛔ 少查一個就會灌大母體）：
 *   `effects` · `template` · `marks` · `passive.ranks[].*` · `augment`
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 `template` 從住處清單拿掉 → 🔴（母體 1 → 64，訊息指名棘輪）
 *   · sentinel：自造一份必定違規的文件 ⇒ 檢查器抓得到它（第 ② 條）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/**
 * ⭐ 棘輪基準線 —— **只能變小**。
 * 2026-09-01 出貨當下逐份量到的真值（⛔ 不是票文的 72）。
 */
const BASELINE = 1;

/** 描述短於這個字數的多半是佔位，⛔ 不是謊言（票文的判準，逐字沿用）。 */
const DESC_MIN = 40;

/** 一個 rank 可以帶的**每一種**授予 —— ⛔ 少列一個就會把有實作的算成空的。 */
const RANK_PAYLOADS = [
  "hooks", "block", "modifiers", "auras", "aura",
  "vision", "flight", "critStrike", "typeStreakImmunity",
  // ⭐ GH#1020 —— `attributes`（三圍加成）是 `SOURCE_GRANT_SHAPE` 的真 payload（w3x `Aamk`
  //    那一族：小傑 06-03 山形修煉-強「每階永久 +7 力量」）。在此之前這張表漏了它 ⇒
  //    一支只靠 attributes 實作的純被動會被數成「五個住處都沒有」。
  "attributes",
] as const;

type Doc = Record<string, unknown>;

/** ⭐ 這份文件有沒有**任何**實作？五個住處都問過才回 false。 */
export function hasAnyImplementation(d: Doc): boolean {
  if (Array.isArray(d.effects) && d.effects.length > 0) return true;
  if (d.template) return true;
  if (Array.isArray(d.marks) && d.marks.length > 0) return true;
  if (d.augment) return true;
  const ranks = (d.passive as { ranks?: Doc[] } | undefined)?.ranks ?? [];
  for (const r of ranks) if (RANK_PAYLOADS.some((k) => r[k])) return true;
  return false;
}

function shippedAbilities(): { id: string; doc: Doc }[] {
  const dir = resolve(ROOT, "content/abilities");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({ id: f.slice(0, -5), doc: JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Doc }));
}

/**
 * ⭐ GH#1020 —— 第六個住處：**同一位英雄的別支技能用 `learned` 葉閘在這一格上**。
 *
 * 原作的 EX 系統是一面旗標（`udg_EX_Mode`），而 GGD 的翻譯是條件葉
 * `{kind:"learned", subject:"self", slot:"EX"}`：小傑 06-002 殺意的「解鎖後猜猜拳追加⋯」
 * **全部住在猜猜拳那份文件裡**（三個變體各自的 EX 段），殺意本身只是那把鑰匙。
 * 少了這一格，這種「旗標型」EX 會被數成「五個住處都沒有」—— 而它的承諾**真的會發生**
 * （`gonGuessPunch.test.ts` ③ 用出貨內容驗過：解鎖前沒有減速、解鎖後有）。
 *
 * 判準是**關係**（誰在讀這一格），⛔ 不是「描述裡有沒有『解鎖』兩個字」。
 */
function learnedSlotsByHero(all: { id: string; doc: Doc }[]): Set<string> {
  const out = new Set<string>();
  const walk = (hero: string, node: unknown): void => {
    if (Array.isArray(node)) { for (const v of node) walk(hero, v); return; }
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "learned" && typeof rec["slot"] === "string") out.add(`${hero}|${rec["slot"]}`);
    for (const v of Object.values(rec)) walk(hero, v);
  };
  for (const { id, doc } of all) {
    const dot = id.lastIndexOf(".");
    if (dot > 0) walk(id.slice(0, dot), doc);
  }
  return out;
}

function offenders(): string[] {
  const all = shippedAbilities();
  const gated = learnedSlotsByHero(all);
  const gatedElsewhere = (id: string, doc: Doc): boolean => {
    const dot = id.lastIndexOf(".");
    return dot > 0 && typeof doc.slot === "string" && gated.has(`${id.slice(0, dot)}|${doc.slot}`);
  };
  return all
    .filter(
      ({ id, doc }) =>
        ((doc.description as string) ?? "").length > DESC_MIN &&
        !hasAnyImplementation(doc) &&
        !gatedElsewhere(id, doc),
    )
    .map(({ id }) => id);
}

describe("GH#902 卡面在說謊 —— 棘輪（母體只能變小）", () => {
  it("★ ⭐ 「描述有承諾、五個住處都沒有實作」的技能**不可以變多**", () => {
    const bad = offenders();
    expect(
      bad.length,
      `⛔ 母體從 ${BASELINE} 變成 ${bad.length} —— 這幾支的卡面在承諾一件**不會發生**的事：\n` +
        bad.map((i) => `  · ${i}`).join("\n") +
        `\n⭐ 修法是**替換成做得到的等效機制**，⛔ 不是把描述刪短（那只會讓母體變小而卡面照樣空的）。` +
        `\n⚠️ 母體變小了 ⇒ 把上面的 BASELINE 改成新的數字（棘輪只准往下）。`,
    ).toBeLessThanOrEqual(BASELINE);
  });

  it("⭐ sentinel：自造一份必定違規的文件，檢查器要抓得到它（⛔ 否則這條閘是瞎的）", () => {
    const liar: Doc = { id: "sentinel.liar", description: "x".repeat(DESC_MIN + 1), effects: [] };
    expect(hasAnyImplementation(liar), "⛔ 檢查器連一份**明顯**空的都放行 ⇒ 它抓不到任何東西").toBe(false);
    // ⭐ 反方向：五個住處各自都要**單獨**足以讓它過（⛔ 少一個就會灌大母體）
    for (const [k, v] of [
      ["effects", [{ kind: "damage" }]],
      ["template", { ref: "tpl-x" }],
      ["marks", [{ markId: "m" }]],
      ["augment", { targetAbilityId: "x" }],
      ["passive", { ranks: [{ auras: [{}] }] }],
    ] as const) {
      expect(hasAnyImplementation({ ...liar, [k]: v }), `⛔ \`${k}\` 是實作，而檢查器沒認出來`).toBe(true);
    }
  });
});
