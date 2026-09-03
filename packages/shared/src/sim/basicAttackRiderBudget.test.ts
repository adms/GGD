/**
 * ⭐⭐ **掛在普攻上的 AP 乘客有多重**（GH#946）。
 *
 * owner 2026-09-02（逐字）：
 * > 「B5 92-04 馬勒戈壁 3.0 → 0.04 ⛔ 收格治不好它⋯⭐ 單獨重設計 **=> ok**」
 *
 * ⛔⛔ **而票文的兩個量測前提今天不成立**（2026-09-03 逐條查證）：
 *
 * | 票文說 | 量到的 |
 * |---|---|
 * | 「係數 **3.0**、分 **4 段** ⇒ 等效 12×AP」 | ⛔ **找不到「4 段」** —— champion 文件沒有任何連段欄位。⭐ 係數是**逐階 1.0 / 2.0 / 3.0**（卡面逐字「100/200/300% [AP]」） |
 * | 「**護甲 +155% · 魔抗 +132%** 的超級坦」 | ⛔ `armor = 2`（基礎）／`1.7478`（成長）—— ⛔ 不是 155% |
 *
 * ⭐⭐ **而「12×AP」的真義是票文自己下一行寫的那個**：
 * 「它的量級來自**觸發頻率 × 段數**」——⭐ 6 秒的致盲窗口裡玩家普攻約 4 次
 * ⇒ 4 × 3.0 = 12×AP。⇒ ⭐ 那**不是**一個內容數字的錯，
 * 是**一個沒有預算上限的 `onBasicAttack` 乘客**。
 *
 * ⭐ 量到的母體（2026-09-03）：全庫 **20 支**技能把 AP 係數掛在普攻上，
 * ⭐ 而 92-04 的 **3.0 是最高的一支，而且沒有內部冷卻**。
 *
 * ⚠️ ⭐ 這一支**不改任何係數**（那要等公式那一批的重算）——
 * 它把「這一族有多重」變成一個**會紅的數字**，⭐ 而那正是下一次動它時需要的東西。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `godie-h02v.r` 的 `condition`（目標要帶 blind）拿掉
 *    → 🔴 ②「最重的那一支變成**常駐**」—— ⭐ 那才是真正會爆的改動
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ABIL = join(__dirname, "../../../../content/abilities");

interface Rider {
  id: string;
  name: string;
  ap: number;
  gated: boolean;
  icd: number | null;
}

/** ⭐ 走訪任何巢狀結構找 `onBasicAttack` 的 hook。 */
function hooks(o: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) {
    o.forEach((v) => hooks(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  const n = o as Record<string, unknown>;
  if (n["on"] === "onBasicAttack") out.push(n);
  for (const v of Object.values(n)) hooks(v, out);
  return out;
}

/** 這個 hook 裡最大的一條 AP 係數（0 ＝ 它不吃 AP）。 */
function maxAp(hook: Record<string, unknown>): number {
  let top = 0;
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const n = o as Record<string, unknown>;
    for (const r of (n["ratios"] as Record<string, unknown>[] | undefined) ?? [])
      if (r["stat"] === "ap" && typeof r["coeff"] === "number") top = Math.max(top, r["coeff"]);
    for (const v of Object.values(n)) walk(v);
  };
  walk(hook["effects"]);
  return top;
}

function census(): Rider[] {
  const out: Rider[] = [];
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
    for (const h of hooks(d)) {
      const ap = maxAp(h);
      if (ap <= 0) continue;
      out.push({
        id: String(d["id"]),
        name: String(d["name"] ?? ""),
        ap,
        gated: h["condition"] !== undefined,
        icd: typeof h["internalCooldown"] === "number" ? h["internalCooldown"] : null,
      });
    }
  }
  return out.sort((a, b) => b.ap - a.ap);
}

/** ⭐ 量到的現況（2026-09-03）—— ⛔ 不是目標，是**上限**。 */
const HEAVIEST_AP = 3.0;

describe("普攻乘客的 AP 預算（GH#946）", () => {
  it("★★ ⭐ 最重的那一支**只准變輕**（棘輪）", () => {
    const rows = census();
    expect(rows.length, "⛔ 一支都沒量到 ⇒ 掃描器瞎了，這一支的結論全部作廢").toBeGreaterThan(10);
    expect(
      rows[0]!.ap,
      `⛔⛔ 掛在普攻上的最大 AP 係數變重了：${rows[0]!.id}（${rows[0]!.name}）= ${rows[0]!.ap}\n` +
        "  ⭐ 這一族的量級是**觸發頻率 × 係數** —— 一個 6 秒窗口內普攻 4 次的技能，\n" +
        "  係數 3.0 就是等效 12×AP，⛔ 而全庫中位是 0.6。",
    ).toBeLessThanOrEqual(HEAVIEST_AP);
  });

  it("★★ ⭐⭐ 只要係數 **> 1**，那個 hook 就必須**有門檻**（條件或內部冷卻）", () => {
    const naked = census().filter((r) => r.ap > 1 && !r.gated && r.icd === null);
    expect(
      naked.map((r) => `${r.id} ${r.name} ap=${r.ap}`),
      "⛔⛔ 一條 **>1×AP** 的乘客掛在普攻上而**沒有任何門檻** ⇒\n" +
        "  ⭐ 它每一次普攻都吃滿，而普攻是這個遊戲裡最高頻的動作。\n" +
        "  ⇒ 要嘛給它 `condition`（例：目標帶某狀態），要嘛給 `internalCooldown`。",
    ).toEqual([]);
  });

  it("⭐ 92-04 的三階係數與卡面**逐字對得上**（100/200/300%）", () => {
    const mine = census().filter((r) => r.id === "godie-h02v.r").map((r) => r.ap).sort();
    expect(mine, "⛔ 92-04 的逐階係數與卡面「100/200/300% [AP]」對不上").toEqual([1, 2, 3]);
    expect(
      census().filter((r) => r.id === "godie-h02v.r").every((r) => r.gated),
      "⛔⛔ 92-04 的額外傷害變成**常駐**了 —— 卡面逐字是「攻擊身上有 [致盲] 標記的敵人」",
    ).toBe(true);
  });
});
