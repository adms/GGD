/**
 * HeroReactionBubble — the PLAYER'S hero says what HE thinks on a purchase.
 *
 * Owner ask: 「購買完 玩家英雄應該要根據個性特色回應自己的想法 不只是擺出攻擊
 * 動作而已」. Buying used to only play an ANIMATION on the hero. This bubble adds
 * the in-character LINE, so the buy reads as the character reacting to his new
 * gear rather than a mute attack pose.
 *
 * It mirrors MerchantTipBox, but anchored over the PLAYER hero — who stands at
 * the RIGHT of the counter (task #146) — with its tail on the lower-RIGHT
 * pointing down at him, so it reads as HIS thought, not the merchant's. It is
 * DISPLAY-ONLY (`pointerEvents: none`), pops on a completed purchase, and fades
 * after ~3.4 s.
 *
 * The lines come from `content/config/_purchase-lines.json` — the leading
 * underscore is deliberate: fsStore skips `_` files, so it never enters the
 * content bundle — (a plain static
 * asset fetched ONCE, single-flight, 404-tolerant — NOT routed through the
 * content manifest). The parse, the per-champion lookup and the "random, never
 * an immediate repeat" pick are the pure, node-tested
 * render/intermission/purchaseLines module; this file is only the DOM box and
 * the fade timer. A champion with no authored entry (or a config that never
 * loaded) degrades to a generic in-voice line — never blank, never a crash.
 */
import { useEffect, useRef, useState } from "react";
import {
  FALLBACK_REACTION,
  pickPurchaseReaction,
  purchaseLinesFromDoc,
  reactionsFor,
  type PurchaseLinesMap,
} from "../render/intermission/purchaseLines";

/** The static asset, served straight off the /content mount (nginx in prod). */
// `_`-prefixed so the content indexer (packages/shared fsStore) SKIPS it — it is
// a keyed MAP, not an {id}-doc, so it must not be treated as a collection doc.
// Still served verbatim as a static asset under /content in dev AND the deploy.
export const PURCHASE_LINES_URL = "/content/config/_purchase-lines.json";

/** Warm market palette — same family as MerchantTipBox, cooler hero-side accent. */
const BOX_BG = "rgba(18, 22, 30, 0.92)";
const BOX_BORDER = "rgba(120, 190, 255, 0.55)";
const LINE_TEXT = "#eaf2ff";
const HERO_ACCENT = "#7fc4ff";

/** How long the line lingers before fading (owner: ~3-4 s). */
const DEFAULT_HOLD_MS = 3400;

export interface HeroReactionBubbleProps {
  /** the LOCAL seat's championId — whose personality to voice */
  championId: string;
  /** a COMPLETED-purchase counter; each increase pops a fresh line */
  purchaseSeq: number;
  /** injectable RNG for the no-immediate-repeat pick (defaults to Math.random) */
  rand?: () => number;
  /** how long the bubble stays before fading (ms) */
  holdMs?: number;
  /** injectable fetch (tests) */
  fetchFn?: (url: string) => Promise<Response>;
  /** inject the lines directly, skipping the fetch (tests) */
  linesOverride?: PurchaseLinesMap;
}

export function HeroReactionBubble({
  championId,
  purchaseSeq,
  rand = Math.random,
  holdMs = DEFAULT_HOLD_MS,
  fetchFn,
  linesOverride,
}: HeroReactionBubbleProps): React.JSX.Element | null {
  const [lines, setLines] = useState<PurchaseLinesMap | null>(linesOverride ?? null);
  // the line currently shown, keyed by the purchase seq that produced it
  const [shown, setShown] = useState<{ seq: number; text: string } | null>(null);
  const [visible, setVisible] = useState(false);

  // refs so the purchase effect can read the latest champ/lines/index without
  // re-firing on a champ swap — only a genuine purchase-seq increase pops a line
  const championRef = useRef(championId);
  championRef.current = championId;
  const linesRef = useRef<PurchaseLinesMap | null>(lines);
  linesRef.current = lines;
  const pickIndexRef = useRef<number>(-1); // last picked index (per champion)
  const pickChampRef = useRef<string>(championId); // whose index that was
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- fetch the lines once (single-flight, 404-tolerant) -----------------
  useEffect(() => {
    if (linesOverride) return; // tests inject directly
    let alive = true;
    const doFetch = fetchFn ?? ((url: string) => fetch(url));
    doFetch(PURCHASE_LINES_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (alive) setLines(purchaseLinesFromDoc(doc));
      })
      .catch(() => {
        // missing / bad JSON — the fallback line still carries the beat
        if (alive) setLines({});
      });
    return () => {
      alive = false;
    };
  }, [fetchFn, linesOverride]);

  // ---- pop a fresh line on each completed purchase -------------------------
  useEffect(() => {
    if (purchaseSeq <= 0) return;
    const champ = championRef.current;
    // reset the no-repeat cursor when the hero at the counter changed
    if (pickChampRef.current !== champ) {
      pickChampRef.current = champ;
      pickIndexRef.current = -1;
    }
    const reactions = reactionsFor(linesRef.current, champ);
    const pick = pickPurchaseReaction(reactions, pickIndexRef.current, rand);
    pickIndexRef.current = pick.index;
    setShown({ seq: purchaseSeq, text: pick.text || FALLBACK_REACTION });
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), holdMs);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [purchaseSeq, holdMs, rand]);

  if (!shown) return null;
  return <HeroReactionBubbleView text={shown.text} seq={shown.seq} visible={visible} />;
}

/**
 * The presentational box — pure, so it renders under react-dom/server and is
 * node-testable (the client vitest runs in a `node` env; effects don't fire
 * there, so the container's fetch/timer logic can't be exercised, but this view
 * can). `seq` keys the entrance animation; `visible` drives the fade.
 */
export function HeroReactionBubbleView({
  text,
  seq,
  visible,
}: {
  text: string;
  seq: number;
  visible: boolean;
}): React.JSX.Element {
  return (
    <div
      aria-hidden
      data-ggd-hero-reaction
      style={{
        position: "absolute",
        top: "20%",
        right: "6%",
        maxWidth: "min(34vw, 360px)",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(-4px)",
        transition: "opacity 420ms ease-out, transform 420ms ease-out",
        filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.45))",
      }}
    >
      <style>{
        "@keyframes ggdHeroReactIn{from{opacity:0;transform:translateY(-4px) scale(0.96)}60%{opacity:1}to{opacity:1;transform:none}}" +
        "@keyframes ggdHeroQuoteIn{from{opacity:0;transform:translateY(3px) scale(0.7)}60%{opacity:1}to{opacity:0.9;transform:none}}" +
        "@media (prefers-reduced-motion: reduce){.ggd-hero-react-anim{animation:none !important}}"
      }</style>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "9px 14px",
          borderRadius: 12,
          background: BOX_BG,
          border: `1px solid ${BOX_BORDER}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: "bold", color: HERO_ACCENT }}>我的英雄</span>
            {/* a speech cue: a quote mark that rises in with each new line */}
            <span
              key={seq}
              className="ggd-hero-react-anim"
              aria-hidden
              style={{
                fontSize: 13,
                fontWeight: "bold",
                color: `${HERO_ACCENT}cc`,
                lineHeight: 1,
                animation: "ggdHeroQuoteIn 400ms ease-out",
              }}
            >
              〞
            </span>
          </div>
          {/* keyed by seq so each new line re-mounts and plays the pop-in */}
          <div
            key={seq}
            className="ggd-hero-react-anim"
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              fontWeight: 600,
              color: LINE_TEXT,
              animation: "ggdHeroReactIn 380ms ease-out",
            }}
          >
            {text}
          </div>
        </div>
      </div>
      {/* speech tail: a rotated square on the lower-RIGHT, pointing down at the
          hero (who stands at the right of the counter, task #146) so the box
          reads as HIS thought, not the merchant's */}
      <div
        style={{
          position: "absolute",
          right: 34,
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
