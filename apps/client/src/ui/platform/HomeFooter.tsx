/**
 * HomeFooter — the login page's home-page footer, rendered over the dark
 * boss-battle scene. Carries the © notice, the community 「討論區」 link, and
 * the one MANDATORY attribution this page still owes: the CC-BY 4.0 dragon.
 *
 * IT USED TO CREDIT 魔王魂. That credit is gone, and deliberately: no 魔王魂
 * music ships any more — all eleven BGM tracks are rendered from tools/bgm-gen
 * and `bgm/MANIFEST.json` lists `generator.stillThirdParty` as empty. Crediting
 * a licence you no longer rely on is not harmless; it misstates provenance.
 *
 * THE DRAGON'S CREDIT IS A LINK, NOT A PARAGRAPH. The dragon soaring behind
 * this footer — `dragon2.glb` by LasquetiSpice — is CC-BY 4.0, so attribution
 * is a licence obligation. It was briefly spelled out inline here and read as a
 * wall of text over the artwork: 「版權宣告頁應該是一個連結，跳過去詳細列出說明，
 * 而非直接在登入頁直接列出來一長串」. CC-BY 4.0 asks for attribution "in any
 * reasonable manner" for the medium, and a clearly-labelled link to a page
 * carrying the full credit is the ordinary way to satisfy that on a screen
 * meant to be looked at rather than read. The page is `#credits`
 * (platform/CreditsRoute.tsx), sourced from platform/creditsData.ts.
 *
 * So the footer stays three short items, and the obligation is discharged one
 * click away rather than in 11px type over a dragon.
 *
 * It is deliberately a tiny, dependency-free component (React only) so it can
 * be unit-tested with react-dom/server without dragging in the platform store /
 * settings singleton. The container is `pointer-events:none` so it never blocks
 * the login form; only its links re-enable pointer events. Mobile-safe: it
 * wraps and respects the bottom safe-area inset.
 */
import type React from "react";
import { CREDITS_HASH } from "./CreditsRoute";
import { CREDITS_LINK_LABEL } from "./creditsData";

const LINK: React.CSSProperties = {
  color: "#a9bcff",
  textDecoration: "none",
  pointerEvents: "auto",
  fontWeight: 600,
};

export function HomeFooter(): React.JSX.Element {
  return (
    <footer
      aria-label="site credits"
      // ggd-login-footer: on a short viewport (landscape phone, ~375px tall —
      // task #151) mobile.css folds this into the scroll flow (position:static)
      // instead of pinning it over the offline row / version badge.
      className="ggd-login-footer"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "max(10px, env(safe-area-inset-bottom, 0px))",
        zIndex: 1,
        pointerEvents: "none",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "4px 12px",
        padding: "0 14px",
        textAlign: "center",
        fontSize: 11,
        lineHeight: 1.5,
        color: "#9aa6c2",
        textShadow: "0 1px 6px rgba(0,0,0,0.9)",
      }}
    >
      <span>© 2026 Moriyamouse/Adms 糟糕騎士團</span>
      <span aria-hidden style={{ opacity: 0.5 }}>
        ·
      </span>
      <a href="https://www.facebook.com/groups/142111353010" target="_blank" rel="noopener noreferrer" style={LINK}>
        「討論區」
      </a>
      <span aria-hidden style={{ opacity: 0.5 }}>
        ·
      </span>
      {/* Same-page overlay, so this is a real href (deep-linkable, middle-clickable)
          rather than a button that only works if JS has booted. */}
      <a href={CREDITS_HASH} style={LINK}>
        {CREDITS_LINK_LABEL}
      </a>
    </footer>
  );
}
