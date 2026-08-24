/**
 * ⛔ **一份「整份都是負值」的 `applyBuff` 不可以沒有極性。**（GH#662）
 *
 * ── 它在關什麼口子 ─────────────────────────────────────────────────────────
 * `clearPools.polarityPasses` 採「不知道就不當成是」（⭐ 那是對的規則），
 * 但它把「作者沒填欄位」與「這是一份增益」畫上了等號。⇒ 實測：初號機暴走
 * 宣稱「免疫所有負面」，而移速減速整段暴走都拔不掉。
 *
 * ⭐ 引擎那一半（`config.dispel@1.inferDebuffFromNegativeModifiers`）是**安全網**，
 * ⛔ 不是單一住處 —— 極性仍然應該明寫在文件上（第〇·四守則）。這一支就是那個
 * 「沒寫會紅」的閘。
 *
 * ⚠️ 它讀**檔案樹**而不是 `bundle.json`：作者改的是前者，而 bundle 是產生器的
 * 產物（`content:build` 是全域鎖，併行工作流跑不得）。⇒ 這一支在**編輯發生的
 * 當下**就會響，⛔ 不是等到有人記得重建。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allModifiersDownward } from "../sim/negativePolarity";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const COLLECTIONS = ["items", "abilities", "augments", "champions"] as const;

/**
 * ⛔ 豁免只有一種合法理由：**那份文件我改不動**（產生器擁有它，
 * `scripts/genguard.sh` 會 exit 2 擋下手改）。
 *
 * ⭐ 而且它是**自我到期**的：下面第二條斷言要求被豁免的那一份**現在仍然沒有**
 * 極性 —— 產生器來源修好、文件長出 `polarity` 的那一刻，這一列會紅並要求刪掉。
 * ⇒ ⛔ 這張表不可能腐爛成橡皮圖章。
 */
const EXEMPT: Record<string, string> = {
    };

interface Node {
  kind?: unknown;
  polarity?: unknown;
  modifiers?: unknown;
  perRank?: unknown;
  /** ⭐ 好處住在別處的兩個訊號 —— 見下面 `upsideLivesElsewhere` 的理由。 */
  hooks?: unknown;
  exclusiveGroup?: unknown;
}

/**
 * ⛔⛔ **代價型自我強化不算違規** —— 好處住在 `hooks`／`exclusiveGroup` 上，
 * 而 `modifiers` 只剩那個代價。
 *
 * 這一段與 `sim/effects/applyBuff.ts` 的 `upsideLivesElsewhere` 是**同一句判準**：
 * 引擎不推、這支守衛也不告狀。⛔ 兩邊必須一致，否則會出現「引擎當它是增益、
 * 守衛逼作者標成減益」這種互相矛盾的狀態。
 *
 * 前例：15-03 獄炎煉我（`emfr-form`）—— 唯一的 modifier 是 `ms ×0.5`，
 * 而那 12 秒真正給的是兩條普攻/命中追打 hook。標成 debuff ⇒ 玩家自己的大招型態
 * 變成可以被淨化掉的減益。
 */
function upsideLivesElsewhere(n: Node): boolean {
  return (Array.isArray(n.hooks) && n.hooks.length > 0) || n.exclusiveGroup !== undefined;
}

/** 走訪一份文件，回傳每一個 `applyBuff` 節點。 */
function applyBuffNodes(doc: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(doc)) {
    for (const v of doc) applyBuffNodes(v, out);
  } else if (doc !== null && typeof doc === "object") {
    const n = doc as Node;
    if (n.kind === "applyBuff") out.push(n);
    for (const v of Object.values(doc as Record<string, unknown>)) applyBuffNodes(v, out);
  }
  return out;
}

/** 這一個 `applyBuff` 節點的 modifier 全集（扁平 ＋ 每一階）。 */
function everyModifier(n: Node): { op: string; value: number }[] {
  const out: { op: string; value: number }[] = [];
  const push = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const m of arr) {
      const mm = m as { op?: unknown; value?: unknown };
      if (typeof mm.op === "string" && typeof mm.value === "number") out.push({ op: mm.op, value: mm.value });
    }
  };
  push(n.modifiers);
  if (Array.isArray(n.perRank)) for (const r of n.perRank) push((r as { modifiers?: unknown }).modifiers);
  return out;
}

/** 出貨樹上「整份往下拉卻沒標極性」的節點，逐檔彙總。 */
function offenders(): Map<string, number> {
  const hits = new Map<string, number>();
  for (const col of COLLECTIONS) {
    const dir = join(CONTENT, col);
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc: unknown = JSON.parse(readFileSync(join(dir, f), "utf8"));
      let n = 0;
      for (const node of applyBuffNodes(doc)) {
        if (node.polarity !== undefined) continue;
        if (upsideLivesElsewhere(node)) continue;
        if (!allModifiersDownward(everyModifier(node))) continue;
        n++;
      }
      if (n > 0) hits.set(`${col}/${f}`, n);
    }
  }
  return hits;
}

describe("整份負值的 applyBuff 必須明寫 polarity (GH#662)", () => {
  const hits = offenders();

  it("掃到了整棵樹（guard the guard）", () => {
    // 母體要夠大，否則「零違規」可能只是路徑打錯。
    expect(readdirSync(join(CONTENT, "abilities")).length).toBeGreaterThan(100);
  });

  it("出貨內容沒有未標極性的純減益 applyBuff（豁免除外）", () => {
    const bad = [...hits.keys()].filter((k) => EXEMPT[k] === undefined);
    expect(
      bad,
      "這幾份文件的 applyBuff 每一條 modifier 都是往下拉的，卻沒填 polarity ⇒ " +
        "【淨化】與【免疫】對它們一筆都拔不掉（GH#662）。修法：在那個節點補 " +
        '`"polarity": "debuff"` 與 `"dispellable": true`。⛔ 產生器擁有的文件要改來源。',
    ).toEqual([]);
  });

  it("豁免自我到期：被豁免的文件仍然是未標的（修好了就要刪掉那一列）", () => {
    const stale = Object.keys(EXEMPT).filter((k) => !hits.has(k));
    expect(
      stale,
      "這幾列豁免已經沒有意義（那份文件已經標了極性，或它根本不在樹上）⇒ 刪掉它們。",
    ).toEqual([]);
  });

  it("哨兵：一份自造的純減益節點真的會被抓到（⛔ 不是掃描器整支空轉）", () => {
    const fake = { kind: "applyBuff", modifiers: [{ stat: "ms", op: "pctMult", value: -0.5 }] };
    expect(allModifiersDownward(everyModifier(fake as Node))).toBe(true);
    // ⭐ 而混了方向的代價型自我增益（攻速 +100% 配回血 −10）⛔ 不可以被抓
    // —— 那是出貨 6 個節點的形狀，把它們當減益拔掉才是真的錯。
    const mixed = {
      kind: "applyBuff",
      modifiers: [
        { stat: "as", op: "pctAdd", value: 1.0 },
        { stat: "healthRegen", op: "flat", value: -10 },
      ],
    };
    expect(allModifiersDownward(everyModifier(mixed as Node))).toBe(false);
  });
});
