/**
 * ⭐⭐ GH#650 —— owner **第二次**回報「初號機 AT力場 格擋成功沒出現橘色光盾線條特效」。
 *
 * ── ⛔ 為什麼既有的 `blockVfxReachesWire.test.ts` 不夠 ─────────────────────
 * ⭐ 它證明的是「**機制**通了」：一支**夾具**天生技（`fixture-blockvfx.passive`，
 * `slot: "PASSIVE"` · `chance: 1`）擋中時發得出 `blockVfx`。
 * ⛔ 而 owner 抱怨的是**出貨的那一支**（`godie-e00r.e`，⭐ **E 槽**，`chance: 0.1`）。
 *
 * ⇒ ⭐ 這正是**失敗形態⑤**（被測的不是出貨的那個）的形狀：
 *   夾具綠 ＝ 機制在，⛔ ≠ 那支英雄拿得到。
 *
 * ── ⭐ 這一條只問一件事，⛔ 而且刻意不問「有沒有擋中」──────────────────
 * `chance: 0.1` 讓「擋中」變成隨機事件 ⇒ ⛔ 拿它當斷言會做出一條**靠運氣綠**的
 * 守衛（失敗形態⑩）。⭐ 所以這裡問的是它**上游那一格**：
 *   「出貨的 `godie-e00r.e` 在 rank≥1 時，身上真的掛得上一份**帶 `vfxId` 的**格擋來源嗎？」
 * ⇒ 掛得上 ⇒ 擋中那一刻 `emitBlockVfx` 必然拿得到 id（那一段夾具測試已經證過）。
 * ⇒ 掛不上 ⇒ ⭐ **無論擋中幾次都不會有特效**，而那正是 owner 看到的。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../../..");

/**
 * ⭐ 泛用格擋火花的接觸點尺度（世界單位）—— ⛔ 不是猜的：
 * `VfxSystem` 的 `HitSpark` 畫在接觸點上，視覺半徑約半個身體寬。
 * ⇒ 一個「取代它」的特效若也在這個尺度內且同樣是點狀，玩家分不出來。
 */
const SPARK_REACH_U = 1.0;

/** 出貨的那一份 —— ⛔ 不是我造的夾具。 */
function shippedAbility(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, `content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;
}

describe("GH#650 出貨的 AT力場真的帶著特效軸（owner 回報兩次）", () => {
  it("★ ⭐ `godie-e00r.e` 的**每一個 rank** 都帶著 `vfxId`（⛔ 不是只有 rank1）", () => {
    const doc = shippedAbility("godie-e00r.e");
    const ranks = (doc.passive as { ranks?: { block?: { vfxId?: string } }[] } | undefined)?.ranks ?? [];
    expect(ranks.length, "⛔ 這一支沒有 passive.ranks ⇒ 格擋根本沒有住處").toBeGreaterThan(0);
    const missing = ranks
      .map((r, i) => (r.block && !r.block.vfxId ? i + 1 : 0))
      .filter((n) => n > 0);
    expect(
      missing,
      `⛔ rank ${missing.join("/")} 的格擋**沒有 vfxId** ⇒ 那幾級擋中時 emitBlockVfx 第一行就 return\n` +
        `⇒ ⭐ 玩家在那幾級**永遠**看不到橘色力場，而每一條既有守衛都是綠的。`,
    ).toEqual([]);
  });

  it("⭐ 它宣告的那顆 vfx **真的出貨了**（⛔ 查不到 ⇒ 客戶端 `if (!bdoc) break` 靜默吞掉）", () => {
    const doc = shippedAbility("godie-e00r.e");
    const ranks = (doc.passive as { ranks?: { block?: { vfxId?: string } }[] }).ranks ?? [];
    const ids = [...new Set(ranks.map((r) => r.block?.vfxId).filter(Boolean) as string[])];
    const idx = JSON.parse(readFileSync(resolve(ROOT, "content/vfx/_index.json"), "utf8")) as unknown;
    const known = new Set(
      (Array.isArray(idx) ? idx : ((idx as { entries?: unknown[] }).entries ?? [])).map((e) =>
        typeof e === "string" ? e : (e as { id: string }).id,
      ),
    );
    for (const id of ids) {
      expect(
        known.has(id),
        `⛔ \`${id}\` 不在 content/vfx/_index.json ⇒ 客戶端 \`VfxSystem\` 的 ` +
          `\`const bdoc = this.doc(...); if (!bdoc) break;\` 會**靜默**吞掉它 ——\n` +
          `⭐ 而「壞掉」與「正常」在畫面上長得一模一樣。`,
      ).toBe(true);
    }
  });

  /**
   * ⭐⭐ 這一條是 GH#650 「修了又沒真的修」的**真正答案**，⛔ 也是一族新的判準。
   *
   * ── 為什麼「四段接縫全通」還是看不到 ──────────────────────────────────
   * `blockVfx` 的設計是 **取代**泛用火花（⛔ 不疊加 —— 疊起來像「擋了兩次」）。
   * ⇒ ⭐ 那個設計有一個**沒有人守著的前提**：
   *   **取代品必須與被取代的東西看得出差別。**
   *
   * ⚠️ 2026-09-01 量到它被違反了：
   *   · 被取代的：`HitSpark`（點狀，**260 ms**）
   *   · 內容選的：`fx.fam.burst.physical.s100`（`sphere` burst 48 顆，**160–460 ms**）
   *   ⇒ ⭐⭐ **同一個視覺類別** ⇒ 「機制生效」與「機制沒生效」畫面上**長得一樣**。
   *
   * ⇒ ⛔ 而每一條既有守衛都是綠的（內容宣告在 ✓ · 事件發得出 ✓ · 客戶端消費 ✓）——
   *   ⭐ 這正是**失敗形態⑪**：兩條對的守衛，而它們之間那個「玩家分不分得出來」
   *   的問題**沒有人問**。
   *
   * ── ⭐ 判準（靜態可判，⛔ 不需要 GPU）────────────────────────────────
   * 一個宣告出來要**取代**點狀火花的特效，⛔ 不可以自己也是點狀的：
   * `emitter.shape` 必須**不是** `sphere`（環／柱／面都行），
   * 或者它的**有效半徑**（`radius × vfxScale`）要明顯大過火花的接觸點尺度。
   *
   * MUTATION LOG（落地前跑過）：
   *   · 來源改回 `fx.fam.burst.physical.s100` + `vfxScale 1.6` → 🔴（訊息指名 sphere）
   */
  it("★ ⭐ 它**取代**泛用火花 ⇒ 就要**看得出差別**（⛔ 不可以也是點狀火花）", () => {
    const doc = shippedAbility("godie-e00r.e");
    const ranks = (doc.passive as { ranks?: { block?: { vfxId?: string; vfxScale?: number } }[] }).ranks ?? [];
    for (const [i, r] of ranks.entries()) {
      const b = r.block;
      if (!b?.vfxId) continue;
      const v = JSON.parse(
        readFileSync(resolve(ROOT, `content/vfx/${b.vfxId}.json`), "utf8"),
      ) as { emitter?: { shape?: string; radius?: number } };
      const shape = v.emitter?.shape ?? "?";
      const reach = (v.emitter?.radius ?? 0) * (b.vfxScale ?? 1);
      expect(
        shape !== "sphere" || reach >= SPARK_REACH_U,
        `⛔⛔ rank ${i + 1} 選的 \`${b.vfxId}\` 是 **${shape}**，有效半徑 ${reach.toFixed(2)} 世界單位\n` +
          `⇒ ⭐ 它**取代**的泛用格擋火花也是點狀的（\`HitSpark\`，260 ms）\n` +
          `⇒ ⛔⛔ 「機制生效」與「機制沒生效」在畫面上**長得一模一樣**，\n` +
          `   而那正是 owner 說「修了又沒真的修」的形狀（GH#650，他回報**兩次**）。\n` +
          `⭐ 修法：換一個**不同類別**的 emitter（\`ring\` / \`cone\` / 模型），` +
          `或把有效半徑拉到 ≥ ${SPARK_REACH_U}。`,
      ).toBe(true);
    }
  });
});
