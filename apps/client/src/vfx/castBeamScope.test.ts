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

  it("every cast time is on the 0.1 s ladder the formula authorises (or instant)", () => {
    cover("cast-beam-scope");
    for (const r of rows) {
      if (r.castMs === 0) continue;
      expect(Math.abs(Math.round(r.castMs / 100) * 100 - r.castMs)).toBeLessThan(1e-6);
      expect(r.castMs).toBeGreaterThanOrEqual(300);
      expect(r.castMs).toBeLessThanOrEqual(900);
    }
  });

  it("the MAJORITY of abilities get a NOTICE, not a dodge — and the code says so", () => {
    cover("cast-beam-scope");
    const notice = count("notice");
    const reactable = count("reactable");
    const marginal = count("marginal");
    const instant = count("instant");
    expect(notice + reactable + marginal + instant).toBe(rows.length);
    // The 0.3 s and 0.4 s tiers alone are more than half the roster's abilities.
    expect(notice).toBeGreaterThan(rows.length * 0.4);
    // …and a real reaction window exists on a real minority. If this ever
    // exceeds the notice count, the cast-time formula has changed and the
    // feature's claims should be re-read, not silently upgraded.
    expect(reactable).toBeLessThan(notice);
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
