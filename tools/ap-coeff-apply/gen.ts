/**
 * ⭐⭐ `ggd-ap-coeff-before-after.md` —— **逐支套用 AP 係數公式的 before/after**（GH#945）。
 *
 * 票文逐字要的：「含 **14 支的 before/after** 與**不合理之處**逐條理由」。
 *
 * ⛔⛔ 而動手之前量到一件票文沒寫的事：`resolveApCoeff()` 是一支
 * **零 production 消費端**的函式 —— 公式做好了（GH#942）、BASE 校準過了、
 * 後台頁也有了，⭐ 而**沒有任何一行**在載入時呼叫它
 * ⇒ 樹上那些手填的 `coeff` 原封不動（失敗形態⑧）。
 *
 * ⇒ ⭐ 這份報告是**套用之前該看的那張表**：它逐節點算出公式值、與手填值並排，
 * 並把**偏離最大的**排在前面 —— ⛔ 那才是「不合理之處」該被讀到的地方。
 *
 * 用法：`npx tsx tools/ap-coeff-apply/gen.ts [--check]`
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveApCoeff,
  apCoeffInputsFrom,
  DEFAULT_AP_COEFFICIENT,
} from "../../packages/shared/src/content/apCoefficient";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ABIL = join(ROOT, "content/abilities");
const OUT = join(ROOT, "docs/editor-contract/ggd-ap-coeff-before-after.md");

const cdTiers = JSON.parse(
  readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8"),
) as { seconds: Record<string, Record<string, number>> };

/** ⭐ 走訪任何巢狀結構找出帶 `ratios` 的節點 —— ⛔ 不假設它在頂層。 */
function nodesWithRatios(o: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) {
    o.forEach((v) => nodesWithRatios(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  const n = o as Record<string, unknown>;
  if (Array.isArray(n["ratios"]) && (n["ratios"] as unknown[]).length > 0) out.push(n);
  for (const v of Object.values(n)) nodesWithRatios(v, out);
  return out;
}

interface Row {
  id: string;
  name: string;
  before: number;
  after: number;
  ratio: number;
}

function build(): string {
  const rows: Row[] = [];
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
    for (const n of nodesWithRatios(d["effects"])) {
      // ⚠️ ⭐ 形狀決定要查冷卻表的哪一欄 —— 單體表最高 60s，範圍表可到 90/120
      //   ⇒ 拿錯欄會讓單體技結構性吃虧（GH#942 的 `normalizeToMidOfShape` 那一格）。
      const isArea = n["kind"] === "damageArea" || n["radius"] !== undefined;
      const shape = isArea ? "範圍" : JSON.stringify(d).includes("championForm") ? "變身" : "單體";
      const mid = cdTiers.seconds[shape]?.["中"] ?? 30;
      const tier = d["cooldownTier"];
      const cd =
        typeof tier === "string" && cdTiers.seconds[shape]?.[tier] !== undefined
          ? cdTiers.seconds[shape][tier]!
          : Array.isArray(d["cooldown"]) && (d["cooldown"] as number[]).length > 0
            ? (d["cooldown"] as number[])[0]!
            : mid;
      const after = resolveApCoeff(apCoeffInputsFrom(d, n, mid, cd), DEFAULT_AP_COEFFICIENT);
      if (after === null) continue;
      for (const r of n["ratios"] as Record<string, unknown>[]) {
        if (r["stat"] !== "ap" || typeof r["coeff"] !== "number") continue;
        const before = r["coeff"] as number;
        if (!(before > 0)) continue;
        rows.push({
          id: String(d["id"]),
          name: String(d["name"] ?? ""),
          before,
          after,
          ratio: after / before,
        });
      }
    }
  }
  rows.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));

  const L: string[] = [];
  L.push("# AP 係數公式的 before/after（`ggd-ap-coeff-before-after`）");
  L.push("");
  L.push(
    "⛔ **產物** —— 改 `tools/ap-coeff-apply/gen.ts`，⛔ 不要手改。" +
      "⭐ 每一列都是**算出來的**：公式（GH#942）給的值 vs 樹上手填的值。",
  );
  L.push("");
  L.push(`⭐ 母體：**${rows.length}** 個 ratios[].coeff（stat: "ap"）。`);
  const up = rows.filter((r) => r.ratio > 1).length;
  L.push(
    `⭐ 公式**調高** ${up} 個 · **調低** ${rows.length - up} 個。` +
      `⚠️ 而 BASE 是校準過的（全庫幾何平均不變）⇒ **整體強度不變，變的是相對關係**。`,
  );
  L.push("");
  L.push("## ⭐ 偏離最大的 14 支（⛔ 這才是「不合理之處」該被讀到的地方）");
  L.push("");
  L.push("| 技能 | 手填 | 公式 | 倍率 |");
  L.push("|---|---:|---:|---:|");
  for (const r of rows.slice(0, 14))
    L.push(
      `| \`${r.id}\` ${r.name} | ${r.before} | ${r.after} | **${r.ratio.toFixed(2)}×** |`,
    );
  L.push("");
  L.push("## ⚠️ 怎麼讀這張表");
  L.push("");
  L.push(
    "⭐ 倍率遠離 1.0 的那幾支是**兩種可能之一**，而它們長得一模一樣：\n" +
      "① ⭐ 手填值本來就沒有道理（那正是這條公式要修的）\n" +
      "② ⛔ 公式的某一維在這一支身上判錯了（例：形狀被 `radius` 誤判成範圍）\n" +
      "⇒ ⭐ 逐支看的時候要問的是「**它的六個級距標籤對不對**」，⛔ 不是「這個數字好不好看」。",
  );
  L.push("");
  return `${L.join("\n")}\n`;
}

const text = build();
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== text) {
    console.error("⛔ ggd-ap-coeff-before-after.md 過期 —— 跑 `npx tsx tools/ap-coeff-apply/gen.ts`");
    process.exit(1);
  }
  console.log("✓ ggd-ap-coeff-before-after.md 是最新的");
} else {
  writeFileSync(OUT, text);
  console.log(`✓ 寫入 ${OUT}`);
}
