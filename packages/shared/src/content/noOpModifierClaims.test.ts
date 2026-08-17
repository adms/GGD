/**
 * ⛔ **卡片上不可以有任何「說了但不會發生」的字。**
 *
 * owner 2026-08-18：
 *
 * > 「我們的規則應該是**不放任何無效說明**，應該**替換類似效果更新**，
 * >  其他有類似狀況也要記得替換」
 *
 * ── 為什麼這是一條**閘**而不是一句提醒 ─────────────────────────────────────
 * 這一族缺陷是 CLAUDE.md 失敗形態②的**最終形態**：schema 收得下、後台存得起來、
 * 卡片上印著那句話、`content:build` 全綠、全套測試全綠 —— 而遊戲裡什麼都不發生。
 * ⛔ 沒有任何既有的守衛會紅，**因為每一個零件都是對的**，只有它們的組合是空的。
 *
 * 2026-08-18 實測：三件新寶具身上有 **25 處**這種宣稱（`shining-golden-orbs` 22 處、
 * `ultimate-mod-shiranui` 2 處、`odm-gear` 1 處），而它們全部通過了
 * content:build + 3,594 條測試。CLAUDE.md 元規則：**判準治不了，只有閘可以。**
 *
 * ── 這一支現在關掉的兩個口子 ───────────────────────────────────────────────
 *
 * ① **`capRaise` / `capRaisePct` 指向一條沒有解鎖空間的屬性。**
 *    `sim/statCaps.ts::effectiveCap` 會把任何解鎖夾回 `unlocked`，所以當
 *    `unlocked === base` 時，這條 modifier 逐位元等於不存在。
 *    出貨的 13 條上限**只有 `as`（4→10）與 `lifesteal`（0.8→20）有空間**。
 *    ⚠️ 這一支**從 config 推導**那張名單，⛔ 不抄字面值 —— owner 哪天替某一條開了
 *    空間，這條守衛會自動跟著放行，⛔ 不必改測試。
 *
 * ② **`pctMult` 掛在「加成型」屬性上**（`outputDamagePct` / `outputHealingPct` /
 *    `outputShieldPct`）。那三條的 base 是 **0**，而管線是
 *    `(base + Σflat) × (1 + ΣpctAdd) × Π(1 + pctMult)` —— `0 × 任何東西 = 0`。
 *    所以它們**只有 `flat` 動得了**，而「不填 stackKey ＝複利」那條慣例對它們用不上。
 *    ⚠️ 這一條是 2026-08-18 那五個平行工作流其中一個**量**出來的，不是推測。
 *
 * ⚠️ 這一支**不是**在審美。它只問一件事：**這條 modifier 在出貨設定下，
 * 有沒有可能改變任何一個數字？** 答案是「不可能」的才會紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Stat } from "../sim/stats/statTypes";
import { ModOp } from "../sim/stats/modifiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * 這些屬性的 base 是 0 且語意是「加成」，所以乘區對它們恆為 0。
 * ⛔ 加新的加成型 Stat 時要記得補進來 —— 判準是「它的預設值是不是 0，而 0 的意思是
 * 『不動』而不是『歸零』」。
 */
const ADDEND_STATS: readonly Stat[] = [
  Stat.OutputDamagePct,
  Stat.OutputHealingPct,
  Stat.OutputShieldPct,
];

/** 從**出貨的 config** 推導「哪幾條屬性真的解得開」。⛔ 不抄字面值。 */
function raisableStats(): Set<string> {
  const caps = JSON.parse(readFileSync(join(CONTENT, "config/stat-caps.json"), "utf8")) as {
    caps: Record<string, { base: number; unlocked: number }>;
  };
  const out = new Set<string>();
  for (const [stat, c] of Object.entries(caps.caps)) {
    if (Number.isFinite(c.unlocked) && Number.isFinite(c.base) && c.unlocked > c.base) out.add(stat);
  }
  return out;
}

interface Claim {
  doc: string;
  path: string;
  stat: string;
  op: string;
  why: string;
}

function walk(node: unknown, path: string, doc: string, raisable: Set<string>, out: Claim[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, doc, raisable, out));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  const stat = typeof n.stat === "string" ? n.stat : undefined;
  const op = typeof n.op === "string" ? n.op : undefined;
  if (stat !== undefined && op !== undefined) {
    if ((op === ModOp.CapRaise || op === ModOp.CapRaisePct) && !raisable.has(stat)) {
      out.push({
        doc,
        path,
        stat,
        op,
        why: `「${stat}」在 config.stat-caps@1 裡 unlocked === base（沒有解鎖空間）→ effectiveCap 會把它夾回去，這條 modifier 逐位元等於不存在`,
      });
    }
    if (op === ModOp.PercentMult && (ADDEND_STATS as readonly string[]).includes(stat)) {
      out.push({
        doc,
        path,
        stat,
        op,
        why: `「${stat}」是**加成型**（base 0），而管線是 (base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult) → 0×任何東西=0。只有 flat 動得了它`,
      });
    }
  }
  for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`, doc, raisable, out);
}

function scan(): Claim[] {
  const raisable = raisableStats();
  const out: Claim[] = [];
  for (const coll of ["items", "abilities", "augments", "champions"]) {
    let files: string[];
    try {
      files = readdirSync(join(CONTENT, coll));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = `${coll}/${basename(f, ".json")}`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(CONTENT, coll, f), "utf8"));
      } catch {
        continue;
      }
      walk(parsed, "", doc, raisable, out);
    }
  }
  return out;
}

describe("⛔ 卡片上不可以有「說了但不會發生」的字（owner 2026-08-18）", () => {
  it("★ 出貨的內容裡沒有任何**結構上不可能生效**的 modifier", () => {
    const claims = scan();
    const message = [
      "",
      "⛔ 無效宣稱 —— 這些 modifier 在**出貨設定下不可能改變任何一個數字**。",
      "",
      "owner 2026-08-18 的規則：「不放任何無效說明，應該**替換類似效果更新**」。",
      "⛔ 正確的修法是把那一句換成一個**做得到的等效效果**，",
      "⛔ 不是刪掉 modifier 卻把描述留著（那樣卡片還是在說謊）。",
      "",
      ...claims.map((c) => `  ${c.doc}${c.path}\n      ${c.op} ${c.stat} —— ${c.why}`),
      "",
      "兩條出路：",
      "  1. 換成做得到的等效機制（多數情況的正解）",
      "  2. 如果你真的要那條屬性可以被解鎖 → 去 content/config/stat-caps.json",
      "     把它的 unlocked 抬高（那是一個**平衡決定**，屬於 owner）",
      "",
    ].join("\n");
    expect(claims, message).toEqual([]);
  });

  it("⭐ 守衛自己是活的：把一個加成型屬性配上 pctMult 一定被抓到", () => {
    // ⚠️ 這一條在驗**掃描器**，⛔ 不是驗內容 —— 一支永遠回空陣列的掃描器
    // 會讓上面那條測試對「全綠」與「壞掉」給出一樣的答案（失敗形態③）。
    const out: Claim[] = [];
    walk(
      { modifiers: [{ stat: Stat.OutputDamagePct, op: ModOp.PercentMult, value: 0.2 }] },
      "",
      "fake/doc",
      new Set(["as"]),
      out,
    );
    expect(out.map((c) => c.stat)).toEqual([Stat.OutputDamagePct]);
  });

  it("⭐ 而且它讀的是 config，不是寫死的名單", () => {
    const raisable = raisableStats();
    expect(raisable.size, "config.stat-caps@1 一條解鎖空間都沒有 —— 那整族機制是死的").toBeGreaterThan(0);
    // 有空間的那一條配 capRaise **不可以**被判成無效。
    const someRaisable = [...raisable][0]!;
    const out: Claim[] = [];
    walk(
      { modifiers: [{ stat: someRaisable, op: ModOp.CapRaise, value: 99 }] },
      "",
      "fake/doc",
      raisable,
      out,
    );
    expect(out, `${someRaisable} 有解鎖空間卻被判成無效`).toEqual([]);
  });
});
