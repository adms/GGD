/**
 * CreditsRoute — the 版權聲明 page, reached by a link rather than printed over
 * the login artwork (「版權宣告頁應該是一個連結，跳過去詳細列出說明」).
 *
 * Same mechanism as the codex (see codex/CodexRoute.tsx): a `#credits` hash
 * overlay mounted once at the top of AppRoot. That keeps it reachable from the
 * login screen, the lobby and mid-match alike, deep-linkable for a screenshot,
 * and entirely outside the screen state machine that other tasks are editing.
 *
 * Content comes from creditsData.ts, which marks which entries a LICENCE
 * requires. Mandatory ones are rendered distinctly — someone tidying this page
 * later should be able to see at a glance which rows are not theirs to delete.
 */
import { useEffect, useState } from "react";
import { CREDITS, COPYRIGHT_LINE } from "./creditsData";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { SfxButton } from "../SfxButton";

export const CREDITS_HASH = "#credits";

function hashIsCredits(): boolean {
  return typeof window !== "undefined" && window.location.hash === CREDITS_HASH;
}

export function openCredits(): void {
  if (typeof window === "undefined") return;
  window.location.hash = CREDITS_HASH.slice(1);
}

export function closeCredits(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new Event("hashchange"));
}

const LINK: React.CSSProperties = { color: "#a9bcff", textDecoration: "none", fontWeight: 600 };

export function CreditsPage(props: { onClose: () => void }): React.JSX.Element {
  // THE "關閉不掉" BUG: the ✕ button was un-clickable. The AudioToggle is
  // portaled to <body> at z-index 2147483000 (see AudioToggle.tsx Z_TOP), so
  // its invisible top-right box sat OVER a z-60 overlay — right where 關閉 is.
  // A modal must out-rank the persistent chrome, so this dialog goes above it.
  // Belt and braces: Escape closes, and clicking the dark backdrop closes, so
  // the overlay can never trap the user again whatever covers one control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div
      role="dialog"
      aria-label="版權聲明"
      onClick={(e) => {
        // backdrop-only: a click that lands on the overlay itself (not on the
        // inner content) closes. Clicks on links/text inside do not.
        if (e.target === e.currentTarget) props.onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        // THE REAL "關閉不掉" CAUSE: this modal renders inside #hud-root, which is
        // `pointer-events: none` (see index.html), so without re-enabling events
        // the whole overlay — ✕ button AND backdrop — is click-through and every
        // click falls to the login page below (elementFromPoint proved it). The
        // earlier z-index bump only fixed painting order, not hit-testing.
        pointerEvents: "auto",
        // and stays painted above the AudioToggle's Z_TOP (2147483000).
        zIndex: 2147483600,
        overflowY: "auto",
        background: "rgba(8, 10, 20, 0.94)",
        color: TEXT_MAIN,
        padding: "32px 20px 60px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, margin: 0, color: GOLD }}>版權聲明</h1>
          <SfxButton
            kind="ghost"
            onClick={props.onClose}
            title="關閉"
            style={{
              marginLeft: "auto",
              padding: "4px 14px",
              borderRadius: 7,
              border: PANEL_BORDER,
              background: "transparent",
              color: TEXT_DIM,
              fontSize: 14,
            }}
          >
            ✕ 關閉
          </SfxButton>
        </div>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 22 }}>{COPYRIGHT_LINE}</div>

        {CREDITS.map((c) => (
          <section
            key={c.title}
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 9,
              background: PANEL_BG,
              border: c.mandatory ? "1px solid rgba(242,161,60,0.55)" : PANEL_BORDER,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: TEXT_DIM }}>{c.what}</span>
              {c.mandatory && (
                <span style={{ fontSize: 11, color: GOLD, fontWeight: "bold" }}>署名為授權條件</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: "bold", marginTop: 3 }}>
              {c.sourceUrl ? (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
                  {c.title}
                </a>
              ) : (
                c.title
              )}
            </div>
            <div style={{ fontSize: 13, color: "#c3cbdd", marginTop: 2 }}>
              {c.authorUrl ? (
                <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
                  {c.author}
                </a>
              ) : (
                c.author
              )}
              {" · "}
              {c.licenseUrl ? (
                <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
                  {c.license}
                </a>
              ) : (
                c.license
              )}
            </div>
            {c.terms && (
              <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6, lineHeight: 1.6 }}>{c.terms}</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function CreditsRoute(): React.JSX.Element | null {
  const [open, setOpen] = useState(hashIsCredits);

  useEffect(() => {
    const onHash = (): void => setOpen(hashIsCredits());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return open ? <CreditsPage onClose={closeCredits} /> : null;
}
