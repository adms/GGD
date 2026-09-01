/**
 * ⭐⭐ GH#423 —— 千年練成的樹精**真的留下來作戰**。
 *
 * owner 2026-09-01（逐字，這是第二次裁決；第一次在 2026-08-19）：
 * > 「不是 A, B，而是 **C. 生出一個我方單位**，類似場上會攻擊敵人的中立單位就好
 * >  (這個已有)，**不要複雜化盡量重複使用**」
 *
 * ── ⭐ 為什麼它卡了兩週 ─────────────────────────────────────────────────────
 * 產生器的檔頭逐字寫著阻塞：「缺的**不是數值，是一具身體**：`summon.championId`
 * 是 `zRef("champions")`，而 `champion@1.modelKey` 是**硬 ref** ⇒ 要一份新的
 * `model@1` ＋ 一顆 GLB ＋ 一份新的 `champion@1` ＋ 選人畫面／白名單的排除」。
 *
 * ⭐ 而 `body:"self"`（複製施法者）**一份新文件都不用加** —— 那正是 owner 說的
 * 「重複使用」。⇒ 阻塞不是「缺機制」，是**沒有人問過「非得要一具新身體嗎」**。
 *
 * ── ⚠️ 誠實記兩筆落差（⛔ 不是我沒看到）────────────────────────────────────
 * ① 原作 `n00Q` 是 **move_speed 0**（不會走），而 GGD 沒有「不動的召喚物」那一格。
 * ② 攻擊／生命倍率 0.25 **沒有 JASS 出處**（原作是絕對值 100）—— 它是我挑的。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 `summon` 那一段從 `godie-e00s.py` 拿掉並重生成 → 🔴（兩支都沒有 summon）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const read = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(ROOT, "content/abilities", `${id}.json`), "utf8")) as Record<
    string,
    unknown
  >;

/** 走遍 effects 樹找出所有 `summon`。 */
function summons(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) for (const n of node) summons(n, out);
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o["kind"] === "summon") out.push(o);
    for (const v of Object.values(o)) summons(v, out);
  }
  return out;
}

describe("GH#423 千年練成的樹精", () => {
  // ⭐ 本體與紮根形態掛的是**同一個編號 70-04** ⇒ 同一支技能（第〇·六守則的 join key）。
  for (const id of ["godie-e00s.r", "godie-e010.r"]) {
    it(`★ ⭐ ${id} 真的生得出身體（⛔ 不只是爆炸特效）`, () => {
      const doc = read(id);
      const s = summons(doc["effects"]);
      expect(
        s.length,
        `⛔⛔ ${id} 一個 \`summon\` 都沒有 —— ⭐ 卡面說「竄出樹精」而畫面上只有爆炸。\n` +
          `⇒ owner 裁決過**兩次**要生出真的單位（2026-08-19 · 2026-09-01）。`,
      ).toBeGreaterThan(0);
      const sm = s[0]!;
      // ⭐ `body:"self"` 是「不要複雜化盡量重複使用」的落地形狀 —— ⛔ 不新增 champion 文件。
      expect(sm["body"], "⛔ 用了 championId 那條路 ⇒ 要一份新的 champion@1（owner：不要複雜化）").toBe("self");
      // ⭐ `at:"point"` ＝ 每一個 randomArea 落點各生一具，⛔ 不是全部擠在施法者身上。
      expect(sm["at"], "⛔ 全部生在施法者身上 ⇒ 卡面說的「在周圍隨機竄出」是假的").toBe("point");
      expect(sm["team"], "⭐ owner：「生出一個**我方**單位」").toBe("owner");
    });

    it(`⭐ ${id} 的卡面**不再說**它們不會留下來（第一·五守則）`, () => {
      const d = String(read(id)["description"] ?? "");
      expect(
        d.includes("不會留下來作戰"),
        "⛔⛔ 機制改了而卡面沒改 ⇒ 卡面上有一句**說了但不會發生**的話（反過來的形狀：說不會而它會）。",
      ).toBe(false);
    });
  }
});
