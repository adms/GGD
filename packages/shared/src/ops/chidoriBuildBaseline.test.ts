/**
 * ⭐⭐ **「玩家做不做得出來」的可對照基準**（GH#958）。
 *
 * owner 2026-09-02（逐字）：
 * > 「**玩家要能做的出來**，並且自動化機制檢查合理性及推薦組合」
 *
 * ⭐ 票文自己說得很清楚：「驗收的其餘各層問的是『編輯器**拿不拿得到**積木』——
 * ⛔ 而這一條問的是『一個**不懂 JSON 的人做不做得出來**』。
 * ⭐ 兩者不同，而且 **⛔ 機器驗不到後者**。」
 *
 * ⇒ ⭐⭐ **所以那次量測是 HITL，⛔ 不是 Main 能自動化的東西**（結局③）。
 *
 * ⚠️ ⭐ **而 Main 側做得到一件事**：把那道題目的**分母**量出來 ——
 * ⛔ 否則「卡在哪一步」會變成一句沒有基準的感想。
 *
 * ⭐ 量到的（2026-09-03，`godie-edem.e` 45-03 千鳥）：
 * · 效果節點 **4** 個（⛔ 票文寫 5 —— ⭐ 那個數字要更正）：
 *   `dash` · `damageLine` · `spawnModelFx` × 2
 * · ⭐ 它同時碰到 **4 個五級距欄位**：`radiusTier` · `cooldownTier` · `manaCostTier` · `rangeTier`
 * ⇒ ⭐ 票文挑它的理由（「⭐ 小到一次做得完、而同時碰到**位移 ＋ 沿線傷害 ＋ 五級距**三件事」）
 *   **逐條成立**。
 *
 * ⚠️⚠️ ⭐ **這一支釘住的是「題目沒有被偷偷改簡單」** ——
 * ⛔ 一次量測如果在題目變小之後才做，它量到的「很好做」不代表任何事。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 從 `godie-edem.e` 拿掉一個 `spawnModelFx` → 🔴 ②「題目變小了」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOC = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/abilities/godie-edem.e.json"), "utf8"),
) as Record<string, unknown>;

/** ⭐ 這份文件裡的效果節點（⛔ 不含條件葉 —— 它們帶 `subject`）。 */
function effectKinds(o: unknown, out: string[] = []): string[] {
  if (Array.isArray(o)) {
    o.forEach((v) => effectKinds(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  const n = o as Record<string, unknown>;
  if (typeof n["kind"] === "string" && !("subject" in n)) out.push(n["kind"]);
  for (const v of Object.values(n)) effectKinds(v, out);
  return out;
}

describe("千鳥重建題目的基準（GH#958）", () => {
  it("★★ ⭐ 題目**還是同一支技能**（⛔ 換了題目，量測就對不上）", () => {
    expect(DOC["id"], "⛔ 這不是千鳥").toBe("godie-edem.e");
    expect(String(DOC["name"]), "⛔ 名字變了 —— 回去看是不是換了一支").toContain("千鳥");
  });

  it("★★ ⭐⭐ **題目沒有被偷偷改簡單**（⭐ 4 個效果節點）", () => {
    const kinds = effectKinds(DOC["effects"]);
    expect(
      kinds.length,
      `⛔⛔ 題目變小了（現在 ${kinds.length} 個節點：${kinds.join(", ")}）⇒\n` +
        "  ⭐ 一次量測如果在題目變簡單之後才做，它量到的「很好做」**不代表任何事**。\n" +
        "  ⚠️ 而票文寫的是 **5** 個 —— ⭐ 2026-09-03 實查是 **4**（那個數字要更正）。",
    ).toBeGreaterThanOrEqual(4);
  });

  it("★★ ⭐ 票文挑它的**三個理由逐條成立**（位移 ＋ 沿線傷害 ＋ 五級距）", () => {
    const kinds = new Set(effectKinds(DOC["effects"]));
    expect(kinds.has("dash"), "⛔ 沒有位移 ⇒ 題目不再碰到那一塊積木").toBe(true);
    expect(kinds.has("damageLine"), "⛔ 沒有沿線傷害").toBe(true);
    const tiers = Object.keys(DOC).filter((k) => k.endsWith("Tier"));
    expect(
      tiers.length,
      `⛔ 五級距欄位只剩 ${tiers.length} 個 ⇒ 題目不再碰到「級距要選哪一格」這件事`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("⭐ 反方向：卡面**沒有空宣稱**（⛔ 否則量測者會照著一句假話去做）", () => {
    const desc = String(DOC["description"] ?? "").replace(/「[^」]*」/gu, "");
    const kinds = new Set(effectKinds(DOC["effects"]));
    if (desc.includes("[衝刺]"))
      expect(kinds.has("dash"), "⛔ 卡面寫 [衝刺] 而文件裡沒有位移節點").toBe(true);
    if (desc.includes("{{radius}}"))
      expect(
        Object.keys(DOC).includes("radiusTier") || JSON.stringify(DOC).includes('"radius"'),
        "⛔ 卡面印 {{radius}} 而沒有半徑可以代入",
      ).toBe(true);
  });
});
