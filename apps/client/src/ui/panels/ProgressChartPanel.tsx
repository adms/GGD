/**
 * ProgressChartPanel — 「查看戰績變化」, IN PLACE on the settlement screen.
 *
 * owner, 2026-07-27: 「改成看自己+隊友每回合戰績變化（RANK + 傷害 + 殭屍數折線圖）
 * 並給出玩法的進步建議，而非回到排行榜」.
 *
 * WHY THIS COMPONENT EXISTS AT ALL
 * ────────────────────────────────
 * The settlement button used to call `store.viewRankChange()`, which is by
 * construction a NAVIGATION: it sets `lobbyView: "play"` and then awaits
 * `returnToLobby()`. That is the right behaviour for the LOBBY's rank-delta
 * flow and is left completely untouched — but hanging it on the settlement
 * screen put a "leave now" button on the one screen the owner had just asked to
 * STAY on (「戰鬥勝利/失敗 最後結算的時候要停留 不要自動轉到大廳」). This panel
 * replaces the destination, not the button: everything expands where the player
 * already is.
 *
 * PROPS-ONLY, NO STORE. Every input arrives as a prop, so the whole thing
 * renders under `react-dom/server` in the node vitest env — which is how
 * `progressChartRender.test.ts` can assert that the polylines EXIST, that they
 * carry real coordinates, and that those coordinates land inside the viewBox.
 * A component that read the HUD store here could only be tested by screenshot.
 *
 * SVG BY HAND, no chart library: the client ships self-contained and three
 * small line charts do not justify a dependency. All geometry lives in
 * ./progressChartGeometry (pure, unit-tested).
 *
 * MOBILE / LEGIBILITY: the charts sit in a
 * `repeat(auto-fit, minmax(MIN_CHART_COL_PX, 1fr))` grid — two per row on the
 * settlement card, one per row on a 390 px phone. Each `<svg>` is `width: 100%`
 * over a fixed viewBox, so it scales instead of clipping, and the panel scrolls
 * inside its own max-height on a 780×360 landscape handheld where the card has
 * only ~330 px to give.
 *
 * `MIN_CHART_COL_PX` is 280 and NOT smaller for a measured reason. A viewBox
 * scales its TEXT too, so an axis label is `size × columnWidth / viewBoxWidth`
 * real pixels. At a 200 px minimum, THREE charts fitted across the 760 px card
 * and the labels came out at 6.0 CSS px — illegible, and on the DESKTOP rather
 * than the phone (a phone gets one wide column and was always fine). 280 forces
 * two columns and lands the labels at ~10 px everywhere. progressChartRender's
 * legibility test recomputes this and fails if the constant is lowered.
 */
import type { ProgressAdvice, ProgressSeries, SeriesLine } from "./progressChart";
import { NO_ADVICE_LINE } from "./progressChart";
import {
  AXIS_LABEL_SIZE,
  CHART_BOX,
  MIN_CHART_COL_PX,
  axisTicks,
  plotBottom,
  plotLeft,
  plotRight,
  plotTop,
  plotX,
  plotY,
  polylineSegments,
  valueDomain,
} from "./progressChartGeometry";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/**
 * Line colours. The LOCAL player is always {@link GOLD} and always drawn LAST
 * (so it paints over its teammates) at double stroke width with a dot on every
 * sample — 「自己要能一眼認出來」. Teammates take the muted pair below; they are
 * deliberately desaturated so three lines never compete for the eye.
 */
const MATE_COLORS = ["#6fa8ff", "#79d6a8"] as const;

const AXIS_COLOR = "rgba(140,160,200,0.28)";

/** Per-seat colour: gold for me, then the muted palette in seat order. */
function seatColor(line: SeriesLine, mateIndex: number): string {
  return line.isLocal ? GOLD : (MATE_COLORS[mateIndex % MATE_COLORS.length] as string);
}

interface ChartProps {
  title: string;
  /** unit suffix for the axis labels, e.g. "" / " 傷" */
  lines: readonly SeriesLine[];
  rounds: readonly number[];
  min: number;
  max: number;
  /** RANK counts DOWN: 1 is best, so the minimum must sit at the TOP */
  invert?: boolean;
  /** axis tick label formatter */
  fmt: (v: number) => string;
}

/** One line chart: axes, gridlines, round labels and one polyline per seat. */
function LineChart(props: ChartProps): React.JSX.Element {
  const { lines, rounds, min, max, invert = false, fmt } = props;
  const box = CHART_BOX;
  const l = plotLeft(box);
  const r = plotRight(box);
  const t = plotTop(box);
  const b = plotBottom(box);
  const ticks = axisTicks(min, max, 3);
  // local LAST so it paints over the teammates
  const ordered = [...lines].sort((a, c) => Number(a.isLocal) - Number(c.isLocal));
  let mateIdx = 0;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 2, letterSpacing: 0.5 }}>{props.title}</div>
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        width="100%"
        role="img"
        aria-label={props.title}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* gridlines + value labels */}
        {ticks.map((v, i) => {
          const y = plotY(v, min, max, box, invert);
          return (
            <g key={`t${i}`}>
              <line x1={l} y1={y} x2={r} y2={y} stroke={AXIS_COLOR} strokeWidth={0.6} />
              <text x={l - 4} y={y + 3} fontSize={AXIS_LABEL_SIZE} fill={TEXT_DIM} textAnchor="end">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        {/* round labels along the x axis */}
        {rounds.map((rd, i) => (
          <text
            key={`r${rd}`}
            x={plotX(i, rounds.length, box)}
            y={b + 12}
            fontSize={AXIS_LABEL_SIZE}
            fill={TEXT_DIM}
            textAnchor="middle"
          >
            {rd}
          </text>
        ))}
        <line x1={l} y1={t} x2={l} y2={b} stroke={AXIS_COLOR} strokeWidth={0.8} />
        {/* one polyline per contiguous run; a BYE breaks the line rather than
            drawing through a round the player never played */}
        {ordered.map((line) => {
          const color = seatColor(line, line.isLocal ? 0 : mateIdx++);
          const segs = polylineSegments(line.points, min, max, box, invert);
          const w = line.isLocal ? 2.2 : 1.2;
          return (
            <g key={line.seatId} data-seat={line.seatId} data-local={line.isLocal ? "1" : "0"}>
              {segs.map((s, i) => (
                <polyline
                  key={i}
                  points={s.points}
                  fill="none"
                  stroke={color}
                  strokeWidth={w}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={line.isLocal ? 1 : 0.75}
                />
              ))}
              {/* markers: always for me (so a single-round match still shows a
                  point), and for a teammate's isolated sample */}
              {segs.flatMap((s, si) =>
                s.coords
                  .filter(() => line.isLocal || s.coords.length === 1)
                  .map((c, ci) => (
                    <circle key={`${si}-${ci}`} cx={c.x} cy={c.y} r={line.isLocal ? 2.2 : 1.6} fill={color} />
                  )),
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface ProgressChartPanelProps {
  series: ProgressSeries;
  advice: readonly ProgressAdvice[];
  /** display name for a seat, for the legend */
  nameForSeat: (seatId: number) => string;
  /** collapse the panel — the settlement screen stays put either way */
  onClose: () => void;
}

/**
 * The whole 戰績變化 panel: three charts, a legend, and the coaching lines.
 * Renders an explicit empty state when the server sent no per-round history
 * (an older server, or a match that ended before a round settled) rather than
 * drawing an empty pair of axes that looks like a bug.
 */
export function ProgressChartPanel(props: ProgressChartPanelProps): React.JSX.Element {
  const { series, advice } = props;
  // TWO different empty states, because they have different causes and a player
  // who is told the wrong one will go looking for the wrong problem:
  //   · no ROUNDS  — the server sent no per-round history (older build, or the
  //                  match ended before a round settled).
  //   · no LINES   — there are rounds, but no seats to draw: a SPECTATOR, or a
  //                  player who never locked a champion (#130). Falling through
  //                  to the charts here paints three empty pairs of axes, which
  //                  reads as a rendering bug rather than as "you weren't in it".
  const hasRounds = series.rounds.length > 0;
  const hasLines = series.rank.length > 0;
  const hasData = hasRounds && hasLines;
  const dmg = valueDomain(series.damage);
  const mob = valueDomain(series.mobKills);

  return (
    <div
      data-testid="progress-chart-panel"
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        border: PANEL_BORDER,
        background: "rgba(20,26,40,0.6)",
        // the settlement card is min(760px,96vw) with maxHeight 92vh; on a
        // 780×360 handheld that is ~330 px total, so this panel keeps its own
        // scroll rather than pushing the exit buttons off the card.
        maxHeight: "min(56vh, 460px)",
        overflowY: "auto",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: TEXT_MAIN }}>每回合戰績變化</span>
        <span style={{ fontSize: 10, color: TEXT_DIM, flex: 1, minWidth: 0 }}>
          橫軸＝回合 · 金色是你
        </span>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="收起戰績變化"
          style={{
            background: "transparent",
            border: PANEL_BORDER,
            borderRadius: 6,
            color: TEXT_DIM,
            fontSize: 11,
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          收起
        </button>
      </div>

      {!hasData ? (
        <div style={{ fontSize: 12, color: TEXT_DIM, padding: "10px 2px" }}>
          {!hasRounds
            ? "這場沒有逐回合紀錄 —— 伺服器要在每回合結束時留下快照，舊版本的對戰沒有這份資料。"
            : "你這場沒有上場的隊伍 —— 觀戰或沒有選到英雄時，沒有屬於你的每回合曲線可以畫。"}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              // one column on a phone, up to three across on a desktop card
              gridTemplateColumns: `repeat(auto-fit, minmax(${MIN_CHART_COL_PX}px, 1fr))`,
              gap: 10,
            }}
          >
            <LineChart
              title="MVP 排名（1 最好）"
              lines={series.rank}
              rounds={series.rounds}
              min={1}
              max={series.maxRank}
              invert
              fmt={(v) => `${Math.round(v)}`}
            />
            <LineChart
              title="對英雄傷害"
              lines={series.damage}
              rounds={series.rounds}
              min={dmg.min}
              max={dmg.max}
              fmt={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`)}
            />
            <LineChart
              title="殭屍擊殺"
              lines={series.mobKills}
              rounds={series.rounds}
              min={mob.min}
              max={mob.max}
              fmt={(v) => `${Math.round(v)}`}
            />
          </div>

          {/* legend — the only place a seat id becomes a human name */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            {series.rank.map((line, i) => {
              const mateIdx = series.rank.filter((x, j) => j < i && !x.isLocal).length;
              const color = seatColor(line, mateIdx);
              return (
                <span
                  key={line.seatId}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: TEXT_MAIN }}
                >
                  <span
                    style={{
                      width: 14,
                      height: line.isLocal ? 4 : 2,
                      borderRadius: 2,
                      background: color,
                      display: "inline-block",
                    }}
                  />
                  {props.nameForSeat(line.seatId)}
                  {line.isLocal ? <span style={{ color: GOLD, fontWeight: 800 }}>（你）</span> : null}
                </span>
              );
            })}
          </div>
        </>
      )}

      <div
        style={{
          fontSize: 11,
          color: TEXT_DIM,
          letterSpacing: 1,
          textTransform: "uppercase",
          margin: "14px 0 6px",
        }}
      >
        進步建議
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {advice.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>{NO_ADVICE_LINE}</div>
        ) : (
          advice.map((a) => {
            const praise = a.tone === "praise";
            return (
              <div
                key={a.key}
                data-advice-key={a.key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: TEXT_MAIN,
                  background: praise ? "rgba(71,204,106,0.12)" : "rgba(242,198,55,0.10)",
                  border: `1px solid ${praise ? "rgba(71,204,106,0.5)" : "rgba(242,198,55,0.45)"}`,
                }}
              >
                <span aria-hidden>{praise ? "✦" : "◆"}</span>
                <span>{a.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
