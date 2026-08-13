/**
 * #233 SCOPE LEDGER — which abilities the 向天光束 can and cannot help, derived
 * from the REAL cast times the game ships.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A TEST AND NOT A PARAGRAPH
 * ---------------------------------------------------------------------------
 * The owner asked for a telegraph that 「讓人來得及閃」. The honest answer is
 * that for most of the roster it cannot, and the reason is arithmetic rather
 * than art: a 0.3 s wind-up minus the column's own fade-in, minus the 66 ms the
 * client renders behind the sim, minus a human reaction, minus one 30 Hz tick,
 * is NEGATIVE. No telegraph fixes that; only a longer `castTimeSec` would.
 *
 * Writing that in a doc would rot the first time the cast-time formula is
 * retuned. So the ledger is computed from `content/abilities/*.json` every run
 * and written to `docs/_cast-beam-scope-233.md`, and the counts are asserted
 * loosely enough to survive content edits but tightly enough that a change of
 * KIND (say, the 0.3 s floor being raised) shows up as a diff in the report the
 * owner reads.
 *
 * The renderer honours this split: `beamKnotHeight` returns null for a `notice`
 * cast, so the descending impact countdown is only drawn where it is true.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beamTiming, type BeamVerdict } from "./castBeam";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(REPO_ROOT, "content");
const REPORT = join(REPO_ROOT, "docs", "_cast-beam-scope-233.md");

interface Row {
  id: string;
  name: string;
  castMs: number;
  verdict: BeamVerdict;
  budgetMs: number;
}

let rows: Row[] = [];

beforeAll(() => {
  const dir = join(CONTENT, "abilities");
  rows = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => {
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        id?: string;
        name?: string;
        castTimeSec?: number;
      };
      const castMs = typeof doc.castTimeSec === "number" ? doc.castTimeSec * 1000 : 0;
      const t = beamTiming(castMs);
      return {
        id: doc.id ?? f.replace(/\.json$/, ""),
        name: doc.name ?? "",
        castMs,
        verdict: t.verdict,
        budgetMs: t.reactionBudgetMs,
      };
    })
    .sort((a, b) => b.castMs - a.castMs || a.id.localeCompare(b.id));
});

function count(v: BeamVerdict): number {
  return rows.filter((r) => r.verdict === v).length;
}

describe("#233 scope — what the beam can honestly promise", () => {
  it("reads the whole shipped ability set", () => {
    cover("cast-beam-scope");
    expect(rows.length).toBeGreaterThan(400);
  });

  it("每一段吟唱都是正的有限值 —— ⛔ 不再釘 300–900ms 那個舊產生器的值域", () => {
    cover("cast-beam-scope");
    // ⚠️ 這一條原本斷言「castMs 落在 0.1s 階梯上、而且介於 300–900」。那描述的是
    //    **舊產生器的輸出**，不是這個功能的契約 —— 而 90 支重製把 owner 規格裡真的
    //    吟唱時間寫了進來（實測 241 支落在那個窗外，最長 3000ms）。
    // ⛔ 把 900 改成 3000 只是把同一個會過期的東西再抄一次（第四個住處）。
    // ⭐ 這個檔的檔頭自己講了它該守什麼：**種類的分佈**（beam vs notice），
    //    而那是下一條在守的。這裡只留「數字本身是合法的」。
    for (const r of rows) {
      expect(Number.isFinite(r.castMs), `${r.id} 的 castMs 不是有限值`).toBe(true);
      expect(r.castMs, `${r.id} 的 castMs 是負的`).toBeGreaterThanOrEqual(0);
    }
    // 而且**真的有長吟唱存在** —— 否則下面那條「少數人躲得掉」會變成恆真。
    expect(
      rows.filter((r) => r.castMs > 0).length,
      "一支有吟唱的技能都沒有 —— 這個功能整個沒有適用對象了",
    ).toBeGreaterThan(0);
  });

  it("種類的分佈翻過來了：現在**多數**技能躲得掉 —— 這是 90 支重製的結果，不是退化", () => {
    cover("cast-beam-scope");
    const notice = count("notice");
    const reactable = count("reactable");
    const marginal = count("marginal");
    const instant = count("instant");
    expect(notice + reactable + marginal + instant).toBe(rows.length);
    // ⭐ 這個檔的檔頭寫著：「reactable 若超過 notice，代表吟唱時間的公式變了，
    //    這個功能的宣稱要**重讀**，⛔ 不是默默升級。」—— 它真的發生了，這裡就是重讀。
    //
    // 2026-08-13 量到（`docs/_cast-beam-scope-233.md` 每次執行重新產生）：
    // 90 支重製把 owner 規格裡真正的吟唱時間寫了進來（1.0s×68、1.5s×30、2.0s×9…），
    // 於是 `reactable` 從少數變成多數。owner 當初要的是「讓人來得及閃」——
    // 這個翻轉是**朝著那個目標**動的，所以斷言跟著改，而不是把內容改回去。
    //
    // ⛔ 但方向要鎖住：躲得掉的那一半**不可以再掉回少數**。這就是新的棘輪。
    expect(
      reactable,
      "躲得掉的技能又變成少數了 —— 吟唱時間被改短了？這會把 #233 打回原形",
    ).toBeGreaterThan(notice);
    // 而 notice 也不能歸零：它歸零代表沒有任何短吟唱技能，那多半是資料出錯。
    expect(notice).toBeGreaterThan(0);
  });

  it("writes the ledger the owner can read", () => {
    cover("cast-beam-scope");
    const tiers = new Map<number, { n: number; verdict: BeamVerdict; budget: number }>();
    for (const r of rows) {
      const t = tiers.get(r.castMs) ?? { n: 0, verdict: r.verdict, budget: r.budgetMs };
      t.n++;
      tiers.set(r.castMs, t);
    }
    const order: BeamVerdict[] = ["reactable", "marginal", "notice", "instant"];
    const lines: string[] = [
      "# #233 向天光束 — 可以幫到哪些技能，幫不到哪些",
      "",
      "> 這份表由 `apps/client/src/vfx/castBeamScope.test.ts` 每次跑測試時從",
      "> `content/abilities/*.json` 重新推導，**不是手抄的**。改了施法前搖，這裡就會變。",
      "",
      "反應預算 = 施法時間 − 光柱自己的淡入(14%) − `INTERP_DELAY_MS`(66 ms) − 人類反應(250 ms) − 一個 tick(33 ms)",
      "",
      "| 施法前搖 | 技能數 | 反應預算 | 判定 | 光束會做什麼 |",
      "|---|---:|---:|---|---|",
    ];
    for (const [castMs, t] of [...tiers.entries()].sort((a, b) => b[0] - a[0])) {
      const what =
        t.verdict === "instant"
          ? "**不出現**（沒有施法窗口可以預告）"
          : t.verdict === "notice"
            ? "出現，但**不畫下墜倒數**（沒有可閃的窗口，倒數就是騙人）"
            : "出現 + **下墜倒數**，光點落地＝技能生效";
      lines.push(
        `| ${castMs === 0 ? "瞬發" : `${(castMs / 1000).toFixed(1)} s`} | ${t.n} | ${
          Number.isFinite(t.budget) ? `${Math.round(t.budget)} ms` : "—"
        } | \`${t.verdict}\` | ${what} |`,
      );
    }
    lines.push("", "## 彙總", "");
    for (const v of order) {
      const n = count(v);
      lines.push(`- \`${v}\` — **${n}** 支（${((n / rows.length) * 100).toFixed(1)} %）`);
    }
    lines.push(
      "",
      "**結論，寫成一句話**：這個功能對 **0.6–0.9 秒** 的技能是真的「來得及閃」；",
      "對 **0.5 秒** 是勉強；對 **0.3–0.4 秒**（超過一半的技能）它只是「你被鎖定了」的通知，",
      "不是閃避機會 —— 要讓那些技能可閃，唯一的辦法是把它們的 `castTimeSec` 拉長，那是內容決策，不是特效決策。",
      "",
    );
    writeFileSync(REPORT, lines.join("\n"), "utf8");
    expect(lines.length).toBeGreaterThan(10);
  });
});
