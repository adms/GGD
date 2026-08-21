/**
 * RoundReportCard — 中場商店右側的「上一回合戰報」 (task #265, owner's #232:
 * 「每回合進商店：右側顯示 S~D 評價 + 改善建議」).
 *
 * This file is the JSX shell only. Everything that could be wrong lives in two
 * pure modules the tests can drive directly:
 *   {@link buildRoundReport}     — the letter, the numbers and the coaching
 *                                  lines (panels/roundReport.ts)
 *   {@link roundReportPlacement} — where the box may paint (roundReportLayout.ts)
 *
 * ── WHY IT IS A SIBLING OF THE SHOP CARD, NOT A SECTION INSIDE IT ───────────
 * The shop card is CLOSABLE (`MerchantShop` toggles to a vertical 🛒 rail). A
 * report rendered inside the card disappears the moment a player collapses the
 * shop to look at their champion — which is exactly the moment they are most
 * likely to be reading their round back. It is therefore rendered from
 * `MerchantShop`'s return as a SIBLING of both the open card and the collapsed
 * rail, so it survives the toggle, and it is placed on the RIGHT edge, which is
 * outside the card in either state — the owner said 右側, and 右側 is not
 * inside a left-docked card.
 *
 * ── THE BAND ────────────────────────────────────────────────────────────────
 * It paints at `INTERMISSION_Z.panel` — band 3 (PANEL) of the intermission's
 * attention order, the same band as the shop card and Ready up. That is the
 * honest declaration: this is browsable, resumable information, so a 三選一
 * draft's focus scrim must demote and click-block it exactly as it does the
 * shop. It never rides the DEADLINE band; the countdown stays the only thing
 * over a scrim.
 */
import { useMemo } from "react";
import { Items } from "@ggd/shared/sim/content/registry";
import { isShopService, shopServicePrice } from "@ggd/shared/sim/economy/itemTiers";
import { useHud } from "../../net/RoomStore";
import { isTouchDevice, readTouchEnv } from "../../input/mobileDetect";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { shopCatalogue } from "./champSelectFilter";
import { useWhitelist } from "./whitelist";
import { INTERMISSION_Z } from "./intermissionLayout";
import { roundReportPlacement, type RoundReportDensity } from "./roundReportLayout";
import {
  NO_HINT_LINE,
  ROUND_GRADE_BASIS,
  ROUND_GRADE_COLOR,
  buildRoundReport,
  roundReportPhaseShows,
  type RoundReport,
  type RoundReportInput,
} from "./roundReport";

/** Affordability of the live catalogue, for the 「金幣沒花完」 hint. */
export interface AffordableRead {
  cheapest: number | null;
  count: number;
}

/**
 * PURE: how much of the catalogue this gold pile can buy right now. Prices come
 * from the same two sources the shop's own rows use — `shopServicePrice` for
 * the two service entries (屬性強化 / 傳說寶珠) and `cost` for everything else
 * — so the hint can never claim an item the shelf would refuse to sell.
 *
 * ⚠️ CORRECTED 2026-08-22 (GH#274)：這一段散文在此之前是**假的**。呼叫端
 * (`RoundReportCard` 內) 硬給 `shopCatalogue(..., true)`，也就是在正式 UI 裡把
 * GH#261 的下架旗標關掉 —— 於是提示算進 12 支買不到的武器，說「買得起 4 件」
 * 而同一個畫面上只有 1 個按鈕按得下去。⛔ 這支函式本身沒有錯：錯的是餵給它的
 * 那一份目錄。⭐ 現在呼叫端與 `MerchantShop.tsx` 讀**同一組預設參數**，
 * 守衛在 `roundReportAffordable.test.ts`。
 */
export function affordableFrom(
  catalogue: readonly { id: string; cost?: number }[],
  gold: number,
): AffordableRead {
  let cheapest: number | null = null;
  let count = 0;
  for (const item of catalogue) {
    const price = isShopService(item.id) ? shopServicePrice(item.id) : (item.cost ?? null);
    if (price === null || price <= 0) continue;
    if (price <= gold) {
      count += 1;
      if (cheapest === null || price < cheapest) cheapest = price;
    }
  }
  return { cheapest, count };
}

export function RoundReportCard(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const round = useHud((s) => s.round);
  const secondsLeft = useHud((s) => s.phaseSecondsLeft);
  const hasChampion = useHud((s) => s.localMaxHp > 0);
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const outcome = useHud((s) => {
    if (s.localSeatId === null) return 0;
    const teamId = s.seats.find((v) => v.seatId === s.localSeatId)?.teamId;
    if (teamId === undefined) return 0;
    return s.teams.find((t) => t.teamId === teamId)?.roundOutcome ?? 0;
  });
  const { whitelist } = useWhitelist();

  const gold = seat?.gold ?? 0;
  // ⛔ 沒有第三個參數 —— 逐字就是 `MerchantShop.tsx` 自己的那一行。提示能數的
  // 只有玩家**真的按得下去**的那些貨（GH#274）。
  const affordable = useMemo(
    () => affordableFrom(shopCatalogue(Items.all(), whitelist), gold),
    [whitelist, gold],
  );

  // The report is about a FINISHED round. During combat (a defeated player
  // still shopping) the tallies are a live count, not a result — see
  // roundReport.ts §5.
  if (!roundReportPhaseShows(phase) || !seat) return null;

  const input: RoundReportInput = {
    phase,
    round,
    secondsLeft,
    hasChampion,
    facts: {
      outcome,
      kills: seat.roundKills,
      deaths: seat.roundDeaths,
      alive: seat.alive,
    },
    gold,
    unspentPoints: seat.unspentPoints,
    // `SeatState.items` is a FIXED six-slot array whose empty slots are "" —
    // `items.length` is therefore always 6 and「裝備欄還空 N 格」 would read 0
    // for a player carrying nothing. Counted the same way `equipmentCap`
    // (ui/hud/equipmentModel) counts it, so the two readouts always agree.
    itemCount: seat.items.filter((id) => id !== "" && id != null).length,
    statStacks: seat.statStacks,
    statCapstonePct: seat.statCapstonePct,
    pendingOffers: seat.offers.length,
    cheapestAffordable: affordable.cheapest,
    affordableCount: affordable.count,
  };

  const touch = isTouchDevice(readTouchEnv());
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const placement = roundReportPlacement({ width: vw, height: vh }, touch);
  // No honest place to put it on this viewport (portrait phones) — a 4 px
  // sliver of a report is worse than none. See roundReportLayout MIN_RENDER_*.
  if (!placement.visible) return null;

  return (
    <RoundReportView
      report={buildRoundReport(input)}
      density={placement.density}
      style={{
        position: "absolute",
        zIndex: INTERMISSION_Z.panel,
        top: placement.css.top,
        width: placement.css.width,
        maxHeight: placement.css.maxHeight,
        ...(placement.css.right !== undefined
          ? { right: placement.css.right }
          : { left: placement.css.left }),
      }}
    />
  );
}

const TONE_COLOR = { good: "#7fe0a0", bad: "#ff8a8a" } as const;

/**
 * The presentational half — pure props, so it server-renders in the node test
 * env exactly like `ShopHeroPortrait` (MerchantShop.test.ts) and every branch of
 * the card is provable without a browser.
 */
export function RoundReportView({
  report,
  density,
  style,
}: {
  report: RoundReport;
  density: RoundReportDensity;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const graded = report.state === "graded" && report.grade !== null;
  const accent = graded ? ROUND_GRADE_COLOR[report.grade!] : TEXT_DIM;
  return (
    <div
      data-ggd-round-report={report.state}
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 12,
        color: TEXT_MAIN,
        fontSize: 12,
        overflowY: "auto",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {/* ── the letter ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            fontSize: 34,
            lineHeight: 1,
            fontWeight: "bold",
            color: accent,
            minWidth: 34,
            textAlign: "center",
            textShadow: graded ? `0 0 14px ${accent}55` : "none",
          }}
        >
          {graded ? report.grade : "—"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: TEXT_DIM, letterSpacing: "0.04em" }}>
            {report.roundNumber > 0 ? `第 ${report.roundNumber} 回合戰報` : "本場戰報"}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: "bold", color: accent, lineHeight: 1.25 }}>
            {report.headline}
          </div>
        </div>
      </div>

      {/* ── the honesty line: same ladder as the settlement, and what it saw ── */}
      {graded && (
        <div style={{ fontSize: 10, color: TEXT_DIM, lineHeight: 1.35 }}>
          對應結算階梯 <span style={{ color: accent }}>{report.matchGrade}</span> ·{" "}
          {ROUND_GRADE_BASIS}
        </div>
      )}

      {/* ── the numbers the letter was made of ── */}
      {density === "expanded" && report.stats.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
          {report.stats.map((row) => (
            <div key={row.key} style={{ display: "flex", gap: 4, fontSize: 11 }}>
              <span style={{ color: TEXT_DIM }}>{row.label}</span>
              <span
                style={{
                  fontWeight: "bold",
                  fontVariantNumeric: "tabular-nums",
                  color:
                    row.key === "gold"
                      ? GOLD
                      : row.tone
                        ? TONE_COLOR[row.tone]
                        : TEXT_MAIN,
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── the coaching lines ── */}
      {graded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {report.hints.length === 0 ? (
            <div style={{ fontSize: 11, color: TEXT_DIM }}>{NO_HINT_LINE}</div>
          ) : (
            report.hints.map((hint) => (
              <div
                key={hint.key}
                data-ggd-round-hint={hint.key}
                title={hint.evidence}
                style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}
              >
                <span
                  aria-hidden
                  style={{
                    color: hint.tone === "praise" ? TONE_COLOR.good : GOLD,
                    lineHeight: 1.45,
                  }}
                >
                  {hint.tone === "praise" ? "✦" : "▸"}
                </span>
                <span style={{ lineHeight: 1.45, minWidth: 0 }}>{hint.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
