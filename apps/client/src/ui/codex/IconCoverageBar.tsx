/**
 * IconCoverageBar — 圖示覆蓋率, the live progress bar (task #97).
 *
 * 「生成必要 英雄、技能、武器道具 icon 是否能給我一個即時的數量進度條，讓我知道你
 * 真的有在作事而不是忘了」. Two things follow from that sentence and drive every
 * choice here:
 *
 *  1. IT IS AN INSTRUMENT, NOT A DECORATION. Its whole job is to be checkable,
 *     so it shows its own working: the denominator, where the exclusion list
 *     came from, when it last looked, and how many documents it re-read. A bar
 *     that just says "13%" asks for the same trust the user is withholding.
 *  2. IT MUST MOVE. The numbers re-poll the content mount (useIconCoverage) and
 *     climb as art lands, without reloading the page or the codex.
 *
 * It sits at the TOP of the codex body, above the three browse sections —
 * the page the user was looking at when they asked, and the first thing on it.
 * (The broken-data table at the bottom stays the reference material it was
 * ruled to be; this is the headline.)
 */
import { useState } from "react";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { Btn } from "../platform/widgets";
import { Tooltip } from "../components/Tooltip";
import { COVERAGE_POLL_MS, useIconCoverage } from "./useIconCoverage";
import { COVERAGE_KINDS, type CoverageBucket } from "@ggd/shared/codex/codexCoverage";
import type { CodexPlan } from "@ggd/shared/codex/codexPlan";
import type { CodexData, CodexKind } from "@ggd/shared/codex/codexTypes";
import type { IconHashes } from "@ggd/shared/codex/codexIcons";

const KIND_LABEL: Record<CodexKind, string> = {
  champion: "英雄 CHAMPIONS",
  ability: "技能 ABILITIES",
  item: "武器道具 ITEMS",
};

const COVERED = "#57c98a";
const BLOCKED = "#a37bd8";
const BROKEN = "#f08c8c";
const TRACK = "#1b2233";

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * One bar. Width is `covered / needed`. A BLOCKED band (the plan's held gate —
 * real content whose art nobody may generate yet) rides at the far right rather
 * than next to the fill: it is not progress and must never look like progress,
 * but hiding it would make the remaining backlog read as larger than the work
 * that is actually available to do.
 */
function Bar({ bucket, height }: { bucket: CoverageBucket; height: number }): React.JSX.Element {
  const denom = Math.max(1, bucket.needed);
  const coveredPct = (bucket.covered / denom) * 100;
  const blockedPct = (bucket.blocked / denom) * 100;
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: height / 2,
        background: TRACK,
        overflow: "hidden",
        border: "1px solid #2c3448",
        flex: 1,
        minWidth: 60,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${coveredPct}%`,
          background: `linear-gradient(90deg, #3f9c6d 0%, ${COVERED} 100%)`,
          transition: "width 420ms ease-out",
        }}
      />
      {bucket.blocked > 0 && (
        <div
          title="版權暫停：真的需要圖示，但現在不能生成"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: `${blockedPct}%`,
            background: `repeating-linear-gradient(135deg, ${BLOCKED}bb 0 5px, ${BLOCKED}44 5px 10px)`,
            transition: "width 420ms ease-out",
          }}
        />
      )}
    </div>
  );
}

function KindRow({ kind, bucket }: { kind: CodexKind; bucket: CoverageBucket }): React.JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
      <div style={{ width: 128, flexShrink: 0, color: TEXT_MAIN }}>{KIND_LABEL[kind]}</div>
      <Bar bucket={bucket} height={10} />
      <div
        style={{
          width: 108,
          flexShrink: 0,
          textAlign: "right",
          fontFamily: "ui-monospace, monospace",
          color: TEXT_MAIN,
        }}
      >
        {bucket.covered} / {bucket.needed}
      </div>
      <div style={{ width: 52, flexShrink: 0, textAlign: "right", color: TEXT_DIM }}>
        {pct(bucket.percent)}
      </div>
      <div style={{ width: 96, flexShrink: 0, textAlign: "right", color: TEXT_DIM }}>
        {bucket.excluded > 0 ? `排除 ${bucket.excluded}` : `共 ${bucket.total}`}
      </div>
    </div>
  );
}

export interface IconCoverageBarProps {
  data: CodexData;
  /** the background icon-byte scan; its `failed` list demotes declared-but-404 */
  icons: IconHashes | null;
}

export function IconCoverageBar({ data, icons }: IconCoverageBarProps): React.JSX.Element {
  const [applyCandidates, setApplyCandidates] = useState(false);
  const failed = icons ? new Set(icons.failed) : undefined;
  const { coverage, plan, lastCheckedAt, checking, pendingReread, rereadTotal, auto, setAuto, checkNow } =
    useIconCoverage(data, failed, applyCandidates);
  const all = coverage.all;

  return (
    <section
      id="codex-icon-coverage"
      style={{
        border: PANEL_BORDER,
        borderRadius: 10,
        background: "linear-gradient(180deg, #131a29 0%, #0e121b 100%)",
        padding: "12px 14px",
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: 1, color: TEXT_MAIN }}>
          圖示覆蓋率
        </h2>
        <Tooltip
          title="這個數字怎麼算的"
          body={
            "分母＝從 /content 讀到的實際筆數（不是寫死的常數）；" +
            "分子＝文件真的宣告了 icon、而且該檔案抓得到。" +
            "「排除」與「版權暫停」只採用任務 #72 發布的 content/config/icon-plan.json，本頁不自己判定。" +
            "每 8 秒重讀三份 _index.json，只有雜湊變動的文件才會重新抓 —— 所以圖示一落地就會看到數字往上跳。"
          }
        >
          <span style={{ fontSize: 11, color: TEXT_DIM, borderBottom: `1px dotted ${TEXT_DIM}` }}>
            算法
          </span>
        </Tooltip>
        <div style={{ flex: 1 }} />
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: TEXT_DIM }}
          title={`每 ${Math.round(COVERAGE_POLL_MS / 1000)} 秒重新檢查一次 /content（只讀索引，變動的文件才重讀）`}
        >
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          自動更新
        </label>
        <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>
          {checking
            ? "檢查中…"
            : lastCheckedAt === null
              ? "尚未檢查"
              : `上次檢查 ${new Date(lastCheckedAt).toLocaleTimeString()}`}
        </span>
        <Btn small onClick={checkNow} title="立刻重新檢查 /content（不重整頁面）">
          ↻ 立即檢查
        </Btn>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Bar bucket={all} height={18} />
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            color: all.percent >= 99.9 ? COVERED : GOLD,
            fontFamily: "ui-monospace, monospace",
            minWidth: 84,
            textAlign: "right",
          }}
        >
          {pct(all.percent)}
        </div>
      </div>

      <div style={{ fontSize: 11, color: TEXT_DIM, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span>
          已完成 <b style={{ color: COVERED }}>{all.covered}</b>
        </span>
        <span title="還沒有圖示，而且沒有被排除">
          待補 <b style={{ color: all.backlog > 0 ? GOLD : COVERED }}>{all.backlog}</b>
        </span>
        {all.blocked > 0 && (
          <span title="計畫把這些標為 blocked：需要圖示，但現在不能生成（第三方版權）">
            版權暫停 <b style={{ color: BLOCKED }}>{all.blocked}</b>
          </span>
        )}
        <span title="內容總筆數 − 計畫排除">
          需要圖示 <b style={{ color: TEXT_MAIN }}>{all.needed}</b>
        </span>
        <span title="計畫判定「不需要圖示」的筆數 —— 不算缺漏，是決定">
          排除 <b style={{ color: TEXT_MAIN }}>{all.excluded}</b>
        </span>
        <span>
          內容總筆數 <b style={{ color: TEXT_MAIN }}>{all.total}</b>
        </span>
        {all.broken > 0 && (
          <span style={{ color: BROKEN }}>宣告了 icon 但載不到 {all.broken}（不計入已完成）</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
        {COVERAGE_KINDS.map((kind) => (
          <KindRow key={kind} kind={kind} bucket={coverage.byKind[kind]} />
        ))}
      </div>

      <ExclusionNote
        source={coverage.exclusionSource}
        candidateTotal={coverage.candidateTotal}
        applyCandidates={applyCandidates}
        onApplyCandidates={setApplyCandidates}
        plan={plan}
      />

      {/* MEASURED vs CLAIMED. The plan states its own totals; this page counted
          them itself. Printing both is the point of the whole feature — if they
          ever disagree, the reader sees it instead of being told a number. */}
      {coverage.planCounts && (
        <div style={{ fontSize: 11, color: coverage.planStale ? "#e0a878" : TEXT_DIM }}>
          {coverage.planStale ? "⚠ " : ""}計畫自報：{coverage.planCounts.docs} 筆內容 · 已有{" "}
          {coverage.planCounts.have} · 排除 {coverage.planCounts.drop} · 版權暫停{" "}
          {coverage.planCounts.blocked} · 待生成 {coverage.planCounts.generate}
          {coverage.planStale
            ? `（本頁實測 ${all.total} 筆 —— 計畫是在不同的內容上跑的，請重跑 plan.py）`
            : "（與本頁實測一致）"}
        </div>
      )}

      <div style={{ fontSize: 10, color: TEXT_DIM }}>
        自上次開啟本頁以來重讀了 {rereadTotal} 份文件
        {pendingReread > 0 ? ` · 還有 ${pendingReread} 份排隊中` : ""} · 資料來自 /content，與遊戲讀的是同一份
      </div>
    </section>
  );
}

function ExclusionNote({
  source,
  candidateTotal,
  applyCandidates,
  onApplyCandidates,
  plan,
}: {
  source: "plan" | "candidate" | "none";
  candidateTotal: number;
  applyCandidates: boolean;
  onApplyCandidates: (v: boolean) => void;
  plan: CodexPlan | null;
}): React.JSX.Element {
  if (source === "plan" && plan) {
    const rules = Object.values(plan.dropped)
      .filter((b) => b.ids.length > 0)
      .map((b) => `${b.label} ${b.ids.length}`)
      .join("、");
    const gates = Object.values(plan.blocked)
      .filter((b) => b.ids.length > 0)
      .map((b) => `${b.label} ${b.ids.length}`)
      .join("、");
    return (
      <div style={{ fontSize: 11, color: TEXT_DIM }}>
        排除依據：任務 #72 的{" "}
        <code style={{ color: TEXT_MAIN }}>content/config/icon-plan.json</code>（
        {plan.templateVersion}）—— 本頁不自行判定。
        {rules ? ` 排除：${rules}。` : ""}
        {gates ? ` 版權暫停：${gates}。` : ""}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 11, color: "#e0a878", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span>
        排除清單尚未發布（任務 #72 的 <code>content/config/icon-plan.json</code> 不存在，跑
        <code> tools/icon-gen/src/plan.py --write</code>）—— 目前每一筆缺圖都算「待補」。
      </span>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TEXT_DIM }}>
        <input
          type="checkbox"
          checked={applyCandidates}
          onChange={(e) => onApplyCandidates(e.target.checked)}
        />
        先用本頁破損資料的候選規則試算（空說明 / 名稱=ID，{candidateTotal} 筆，僅供參考、非 #72 的判定）
      </label>
    </div>
  );
}
