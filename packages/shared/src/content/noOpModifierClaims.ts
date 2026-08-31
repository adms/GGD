/**
 * ⭐⭐ GH#473 —— **「這條 modifier 在出貨設定下有沒有可能改變任何一個數字」**。
 *
 * ── ⛔ 為什麼這個檔存在（⭐ 它不是重構，是一個缺口）──────────────────────────
 * 這段判準原本**只活在 `noOpModifierClaims.test.ts` 裡**。
 * `tools/review/enable-audit.mjs` 跑起來會逐字說：
 * > 「判準只活在 …test.ts 裡，**沒有匯出的進入點 ⇒ runtime 叫不到**。
 * >  ⭐ 修法：抽成 `noOpModifierClaims.ts`，讓測試與 runtime **import 同一個**
 * >  （⛔ 不是複製一份）」
 *
 * ⇒ ⭐ owner 2026-08-18 要的是「**啟用的時候才做自動跑測試 script**」——
 * ⛔ 而一條叫不到的判準，在「啟用當下」永遠不會跑。
 *
 * ⚠️ ⭐ **⛔ 不可以複製一份到 runtime** —— 那是第〇·四守則的反面：
 * 同一個判準兩個住處，⭐ 而它們一定會漂開，⛔ 且漂開時**兩邊都是綠的**。
 *
 * ── ⭐ 它回答什麼 ──────────────────────────────────────────────────────────
 * 第一·五守則：「卡片上不可以有『說了但不會發生』的字」。
 * ⭐ 兩種**逐位元等於不存在**的宣稱：
 * · `capRaise` / `capRaisePct` 指向一條 `unlocked === base` 的屬性
 * · `pctMult` 掛在**加成型**屬性（base 是 0）⇒ `0 × 任何東西 = 0`
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Stat } from "../sim/stats/statTypes";
import { ModOp } from "../sim/stats/modifiers";

const ADDEND_STATS: readonly Stat[] = [
  Stat.OutputDamagePct,
  Stat.OutputHealingPct,
  Stat.OutputShieldPct,
];

/** 從**出貨的 config** 推導「哪幾條屬性真的解得開」。⛔ 不抄字面值。 */
export function raisableStats(contentDir: string): Set<string> {
  const caps = JSON.parse(readFileSync(join(contentDir, "config/stat-caps.json"), "utf8")) as {
    caps: Record<string, { base: number; unlocked: number }>;
  };
  const out = new Set<string>();
  for (const [stat, c] of Object.entries(caps.caps)) {
    if (Number.isFinite(c.unlocked) && Number.isFinite(c.base) && c.unlocked > c.base) out.add(stat);
  }
  return out;
}

export interface Claim {
  doc: string;
  path: string;
  stat: string;
  op: string;
  why: string;
}

export function walkForNoOpClaims(node: unknown, path: string, doc: string, raisable: Set<string>, out: Claim[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkForNoOpClaims(v, `${path}[${i}]`, doc, raisable, out));
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
  for (const [k, v] of Object.entries(n)) walkForNoOpClaims(v, `${path}.${k}`, doc, raisable, out);
}

/**
 * ⭐ **一份文件**的空宣稱（runtime 的進入點 —— `enable-audit` 叫的就是這一支）。
 * ⛔ 呼叫端自己準備 `raisable`（`raisableStats(contentDir)`），
 * ⭐ 因為那是**整棵樹共用**的一次讀檔，⛔ 不該每一份文件重讀一次。
 */
export function noOpClaimsOf(
  doc: unknown,
  docLabel: string,
  raisable: ReadonlySet<string>,
): Claim[] {
  const out: Claim[] = [];
  walkForNoOpClaims(doc, "", docLabel, raisable as Set<string>, out);
  return out;
}
