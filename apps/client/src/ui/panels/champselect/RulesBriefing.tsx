/**
 * RulesBriefing — the SILENT 10-second rules overlay shown at the top of
 * champion select (task #76). Four auto-advancing beats a first-timer cannot
 * function without, a persistent 跳過, and progress dots. No SFX: champ select's
 * only voice is the champion-name call-out (#35/#41), and this machine stays
 * silent during playtests (#62).
 *
 * The overlay is layered ABOVE the two-region layout but BELOW the countdown
 * clock, and it never blocks the roster — the panel dismisses it the instant the
 * player touches a champion, so a knowing player reads the roster during these
 * seconds instead of watching beats. Skipping does NOT shorten the phase; the
 * server clock is a fixed 60 s (task #76 part 1) and everyone still gets it.
 */
import { useEffect, useRef, useState } from "react";
import { SfxButton } from "../../SfxButton";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../../theme";
import { BRIEFING_BEATS, BRIEFING_BEAT_MS, activeBeatIndex } from "./briefingContent";

export function RulesBriefing({ onDismiss }: { onDismiss: () => void }): React.JSX.Element {
  const [beat, setBeat] = useState(0);
  const startRef = useRef<number>(Date.now());

  // Auto-advance on a wall clock (not a beat counter) so a re-render never
  // skips or repeats — activeBeatIndex is a pure lookup on elapsed time.
  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setBeat(activeBeatIndex(elapsed));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const current = BRIEFING_BEATS[Math.min(beat, BRIEFING_BEATS.length - 1)]!;

  return (
    <div
      role="dialog"
      aria-label="新手須知"
      style={{
        position: "absolute",
        left: "50%",
        top: 72,
        transform: "translateX(-50%)",
        width: 560,
        maxWidth: "92vw",
        padding: "18px 22px",
        background: "rgba(10, 14, 24, 0.94)",
        border: PANEL_BORDER,
        borderRadius: 14,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        color: TEXT_MAIN,
        pointerEvents: "auto",
        zIndex: 45,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 2, color: GOLD, fontWeight: 700 }}>新手須知 · 開打前 10 秒</div>
        <SfxButton
          onClick={onDismiss}
          title="skip the briefing"
          kind="ghost"
          style={{
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 12,
            background: "transparent",
            border: "1px solid #2c3448",
            color: TEXT_DIM,
            cursor: "pointer",
          }}
        >
          跳過 ✕
        </SfxButton>
      </div>

      <div style={{ minHeight: 66, display: "flex", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{current.zh}</div>
          <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 6, lineHeight: 1.5 }}>
            {current.en}
            <span style={{ margin: "0 8px", opacity: 0.5 }}>·</span>
            {current.ja}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {BRIEFING_BEATS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= beat ? GOLD : "#2c3448",
              transition: "background 200ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
