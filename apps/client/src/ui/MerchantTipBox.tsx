/**
 * MerchantTipBox — the 旅行商人's rotating advice box (task #148), and the home
 * of his HEAD ICON (task #146).
 *
 * While you shop the merchant cycles a game RULE / play TIP / 出裝 recommendation
 * every ~5 s so a new player learns the format just by standing at the counter.
 * The pool and the "random, never an immediate repeat" rule are the pure,
 * node-tested `render/intermission/merchantTips` module; this file is only the
 * DOM box that shows it and the 5 s cadence.
 *
 * It is mounted inside IntermissionStage's canvas overlay (above the market,
 * below the HUD) and is DISPLAY-ONLY — `pointerEvents: none`, so it never eats a
 * click meant for the shop card. It anchors upper-centre, over the now-centred
 * merchant and clear of the LEFT shop card, with a little tail pointing down at
 * him so it reads as HIS speech. The portrait rides the left of the box: it uses
 * the shared GlyphTile, so until the placeholder PNG at MERCHANT_PORTRAIT is
 * generated it simply shows a seeded glyph — the same "img over glyph" contract
 * the shop hero portrait uses.
 */
import { useEffect, useState } from "react";
import { GlyphTile } from "./components/GlyphTile";
import { MERCHANT_PORTRAIT } from "../render/intermission/layout";
import { MERCHANT_TIPS, TIP_KIND_META, nextTipIndex } from "../render/intermission/merchantTips";

/** Warm market palette — the anti-arena tone the whole intermission uses. */
const BOX_BG = "rgba(26, 19, 12, 0.92)";
const BOX_BORDER = "rgba(242, 161, 60, 0.55)";
const TIP_TEXT = "#f3ead9";
const MERCHANT_ACCENT = "#f2a13c";

export interface MerchantTipBoxProps {
  /** rotation cadence; defaults to 5 s (task #148). */
  intervalMs?: number;
  /** injectable RNG for the no-immediate-repeat pick (defaults to Math.random). */
  rand?: () => number;
}

export function MerchantTipBox({ intervalMs = 5000, rand = Math.random }: MerchantTipBoxProps = {}): React.JSX.Element | null {
  const count = MERCHANT_TIPS.length;
  const [index, setIndex] = useState(() => nextTipIndex(-1, count, rand));

  useEffect(() => {
    if (count <= 1 || intervalMs <= 0) return;
    // functional updater ⇒ the effect never depends on `index`, so the interval
    // is created ONCE and torn down on unmount — no per-tick reset, no leak.
    const id = setInterval(() => setIndex((i) => nextTipIndex(i, count, rand)), intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, rand]);

  if (count === 0) return null;
  const tip = MERCHANT_TIPS[index] ?? MERCHANT_TIPS[0]!;
  const meta = TIP_KIND_META[tip.kind];

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: "10%",
        left: "46%",
        maxWidth: "min(38vw, 420px)",
        pointerEvents: "none",
        filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.45))",
      }}
    >
      <style>{"@keyframes ggdTipIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}"}</style>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 12,
          background: BOX_BG,
          border: `1px solid ${BOX_BORDER}`,
        }}
      >
        <GlyphTile
          seed="traveling-merchant"
          icon={MERCHANT_PORTRAIT}
          label="旅行商人"
          size={46}
          accent={MERCHANT_ACCENT}
          radius={9}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 12, fontWeight: "bold", color: MERCHANT_ACCENT }}>旅行商人</span>
            <span
              style={{
                fontSize: 9,
                color: meta.accent,
                border: `1px solid ${meta.accent}77`,
                borderRadius: 4,
                padding: "0 5px",
                lineHeight: 1.5,
              }}
            >
              {meta.label}
            </span>
          </div>
          {/* keyed by index so each new tip re-mounts and plays the gentle fade */}
          <div
            key={index}
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: TIP_TEXT,
              animation: "ggdTipIn 350ms ease-out",
            }}
          >
            {tip.text}
          </div>
        </div>
      </div>
      {/* speech tail: a rotated square hanging off the lower-left, pointing down
          toward the merchant so the box reads as HIS line, not a floating banner */}
      <div
        style={{
          position: "absolute",
          left: 34,
          bottom: -6,
          width: 12,
          height: 12,
          background: BOX_BG,
          borderRight: `1px solid ${BOX_BORDER}`,
          borderBottom: `1px solid ${BOX_BORDER}`,
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}
