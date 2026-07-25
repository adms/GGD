/**
 * 引擎支援度 badge — design §2.3 step 1 / §2.4.
 *
 * The score is READ OFF THE TEMPLATE DOC (`gapScore`), which is itself seeded
 * from docs/ability-templates.csv's 實作落差分 (tools/ability-templates/
 * score_gap.py). The UI never re-derives a score, so the card and the CSV stay
 * same-source: re-running score_gap.py refreshes the docs, and the badge follows.
 */
export type BadgeTone = "green" | "amber" | "red";

export interface Badge {
  tone: BadgeTone;
  label: string;
  /** the honest sentence under the pill */
  note: string;
}

/** 綠 ≥7 / 黃 4-6 / 紅 ≤3 — the thresholds the design fixes. */
export function badgeFor(gapScore: number): Badge {
  if (gapScore >= 7) {
    return { tone: "green", label: `引擎支援度 ${gapScore}/10`, note: "詞彙齊全，可直接落地" };
  }
  if (gapScore >= 4) {
    return { tone: "amber", label: `引擎支援度 ${gapScore}/10`, note: "部分行為需降級近似" };
  }
  return { tone: "red", label: `引擎支援度 ${gapScore}/10`, note: "核心詞彙缺席，落差大" };
}
