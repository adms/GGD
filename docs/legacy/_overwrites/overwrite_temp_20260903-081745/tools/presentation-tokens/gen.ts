/**
 * ⭐⭐ `ggd-presentation-token-manifest@1` —— **說明 token 的七色分群**（GH#935）。
 *
 * ⛔⛔ 量到的（2026-09-03）：`descriptionTokens.ts` 的 `PALETTE_OF` 是
 * **26 筆手抄**，而出貨說明裡有 **297 個**不重複 token（2,650 次出現）
 * ⇒ ⭐ 涵蓋率 **9%**，⛔ 其餘 271 個一律落到 `default`。
 *
 * ⚠️ ⭐ 而票文說的「零消費端」只對了一半 —— ⭐ 真缺口是**那張手抄表**：
 * 它是第〇·四守則的形狀（一份算得出來的對照表被烘成 26 行常數），
 * 而它會隨著內容長出新 token 而**靜靜地愈來愈不準**。
 *
 * ⭐⭐ **七群用規則推導，⛔ 不是 297 列手抄**（N 同型 ＝ K 模板）：
 *
 * | group | 它回答什麼 | 色碼 |
 * |---|---|---|
 * | `activation` | 這一招**怎麼觸發** | `#7030A0` |
 * | `cast` | 施放的**形狀／指向** | `#1565C0` |
 * | `effect` | 命中之後**發生什麼** | `#D84315` |
 * | `event` | 掛在**哪一個時機** | `#546E7A` |
 * | `condition` | **什麼情況下**才算數 | `#9A6700` |
 * | `movement` | **位移**相關 | `#008C95` |
 * | `scaling` | **吃哪一條係數** | `#BF8F00` |
 *
 * ⚠️ ⭐ **剝台詞是硬性的**（第〇·六守則）：`「…」` 裡面是角色對白，
 * ⛔ 而它裡面的 `[…]` 不是機制（「不，還不能笑…**在35秒後**宣布勝利吧」）。
 *
 * 用法：`npx tsx tools/presentation-tokens/gen.ts [--check]`
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/editor-contract/ggd-presentation-token-manifest.json");

/** ⭐ 七群與它們的色碼 —— 票文逐字給的那張表（⛔ 不是我挑的）。 */
const PALETTE = {
  activation: "#7030A0",
  cast: "#1565C0",
  effect: "#D84315",
  event: "#546E7A",
  condition: "#9A6700",
  movement: "#008C95",
  scaling: "#BF8F00",
} as const;
type Group = keyof typeof PALETTE;

/**
 * ⭐ 規則表 —— **有序**，第一個命中的贏。
 * ⚠️ ⭐ 每一條都是「**整個 token** 的判斷」，⛔ 不搜尋子字串
 *   （票文逐字：`GLADIARIA` 不得被切成 `[AD]`）—— 子字串比對只在
 *   **已經切出來的 token 內部**做，而那與「在正文裡找 `[AD]`」是兩件事。
 */
const RULES: ReadonlyArray<readonly [Group, RegExp]> = [
  // ⭐ scaling 排最前面：`AP加成` 同時含「加成」與「AP」，而它是係數。
  ["scaling", /^(AP|AD|MP|EX|AP加成|AD加成|傷害加成|.*加成|.*係數|.*成長|.*轉換)$/u],
  ["scaling", /^(最大生命|力量|敏捷|智力|攻擊力|法術強度|移動速度|攻擊速度|魔法抗性|護甲)$/u],
  ["event", /^(.*時|週期|.*期間|.*之後|.*後|.*前)$/u],
  ["condition", /^(機率|.*門檻|.*條件|.*狀態下|層數累積|疊層|.*以上|.*以下|.*未滿)$/u],
  ["movement", /^(衝刺|位移|.*突進|.*跳躍|閃現|.*瞬移|擊退|拉近|.*擊飛|.*推開)$/u],
  ["cast", /^(指向|指定|範圍|小範圍|大範圍|周圍|直線|前方|範圍內|攻擊距離|.*形|扇形|錐形)$/u],
  ["activation", /^(被動|主動|主動攻擊|輔助|變身|.*解放|.*發動|天生)$/u],
  // ⭐ effect 是**兜底**：一個 token 若不屬於上面六群，它描述的就是「發生什麼」。
  ["effect", /^.+$/u],
];

/**
 * ⭐ 例外表 —— ⛔ 規則判錯的那幾個。
 * ⚠️ 每一列都要說得出**為什麼規則判錯**，⛔ 不是「我覺得應該是」。
 */
const OVERRIDES: Readonly<Record<string, Group>> = {
  // 「主動傷害」被 activation 的 `主動` 吃掉，⭐ 而它講的是傷害的來源分類。
  主動傷害: "effect",
  // 「反彈」不是位移 —— 它是命中之後發生的事。
  反彈: "effect",
  // 「屬性門檻」的規則命中 condition ✅，這裡只是把它釘住當範例（⛔ 不改群）。
  屬性門檻: "condition",
};

/** ⭐ 剝掉角色台詞 —— 第〇·六守則，⛔ 這一步是硬性的。 */
function stripQuotes(s: string): string {
  return s.replace(/「[^」]*」/gu, "");
}

/** ⭐ 一個合法 token 的字元集 —— 與 `descriptionTokens.ts` 同一個判準。 */
const TOKEN_OK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9＋+\-％%·．（）]+$/u;

function collectDescriptions(o: unknown, out: string[] = []): string[] {
  if (Array.isArray(o)) {
    o.forEach((v) => collectDescriptions(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if ((k === "description" || k === "authoringNote") && typeof v === "string") out.push(v);
    else collectDescriptions(v, out);
  }
  return out;
}

function groupOf(token: string): Group {
  const o = OVERRIDES[token];
  if (o !== undefined) return o;
  for (const [g, re] of RULES) if (re.test(token)) return g;
  return "effect";
}

function build(): string {
  const counts = new Map<string, number>();
  for (const dir of ["abilities", "items", "augments", "champions"]) {
    const base = join(ROOT, "content", dir);
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base)) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      for (const raw of collectDescriptions(JSON.parse(readFileSync(join(base, f), "utf8")))) {
        for (const m of stripQuotes(raw).matchAll(/\[([^[\]\n]{1,12})\]/gu)) {
          const t = m[1]!;
          // ⛔ 純數字不是 token（`[0]` 是佔位符殘留），⛔ 不合字元集的也不是。
          if (/^[0-9.]+$/u.test(t) || !TOKEN_OK.test(t)) continue;
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
  }
  const tokens = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token, uses]) => ({ token, uses, group: groupOf(token) }));

  const byGroup: Record<string, number> = {};
  for (const t of tokens) byGroup[t.group] = (byGroup[t.group] ?? 0) + 1;

  const body = {
    schema: "ggd-presentation-token-manifest@1",
    note:
      "⛔ **產物** —— 改 `tools/presentation-tokens/gen.ts`，⛔ 不要手改。" +
      "⭐ 每個出貨說明 token **恰好一群**；群由規則推導（⛔ 不是逐列手抄），" +
      "例外在產生器的 `OVERRIDES` 並各自帶理由。" +
      "⚠️ 掃描前**剝掉 `「…」` 角色台詞**（第〇·六守則）。",
    palette: PALETTE,
    totals: { distinct: tokens.length, uses: tokens.reduce((s, t) => s + t.uses, 0), byGroup },
    tokens,
  };
  const json = JSON.stringify(body, null, 2);
  const digest = createHash("sha256").update(json).digest("hex").slice(0, 16);
  return `${JSON.stringify({ ...body, digest }, null, 2)}\n`;
}

const text = build();
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== text) {
    console.error("⛔ ggd-presentation-token-manifest.json 過期 —— 跑 `pnpm ptokens:build`");
    process.exit(1);
  }
  console.log("✓ ggd-presentation-token-manifest.json 是最新的");
} else {
  writeFileSync(OUT, text);
  const n = (JSON.parse(text) as { totals: { distinct: number; byGroup: Record<string, number> } })
    .totals;
  console.log(`✓ 寫入 ${OUT}`);
  console.log(`  ⭐ ${n.distinct} 個 token：`, JSON.stringify(n.byGroup));
}
