/**
 * WorldAnchorLayer — world-anchored DOM (healthbars, names, floating combat
 * text). The render loop projects world→screen every frame into the plain
 * mutable frameBus; THIS component runs its own rAF and patches DOM nodes
 * imperatively. Per-frame data NEVER touches React state (client-08) — React
 * only mounts the container once.
 *
 * COMBAT TEXT IS POOLED (task #92, task #33's discipline). One `<div>` per
 * combat-text pool slot is created ONCE on mount and reused forever: no
 * createElement, no remove(), no Map churn in the frame loop. A teamfight
 * spawning 12 numbers a second allocates nothing here — the old code created
 * and destroyed a node per hit, which is exactly how floating text ends up
 * costing frames.
 *
 * The motion and the palette live in the pure ./combatText module so vitest
 * covers them; this file only writes what those functions return.
 *
 * 迴避 (task #92b) is the ONE combat outcome that does not arrive through the
 * frame loop's event fanout, because it produces no damage packet for the fanout
 * to hang off (packages/shared/src/sim/combat/evasion.ts DECISION 3). It is
 * buffered as raw numbers at the network seam and drained HERE, at the top of
 * this rAF, into the same `pushCombatText` admission pipeline as everything
 * else — including the same `combatTextCss` fill, which is what keeps #164's
 * transparent-glyph fix covering the new labels too.
 */
import { useEffect, useRef } from "react";
import { frameBus, pushEvadeText } from "../frameBus";
import { drainEvadeSightings } from "../net/RoomConnection";
import {
  MAX_COMBAT_TEXT,
  chromeAlphaMult,
  combatTextAlpha,
  combatTextCss,
  combatTextDrift,
  combatTextLabel,
  combatTextLane,
  combatTextLift,
  combatTextScale,
  combatTextStyle,
  combatTextStyleKey,
  combatTextWidthPx,
  hudReservedRects,
  type CombatTextStyle,
  type HudRect,
} from "./combatText";
import { teamCss } from "./theme";

const BAR_W = 64;

function makeChampionNode(name: string, color: string, isLocal: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;will-change:transform;";
  el.innerHTML =
    `<div style="position:absolute;left:${-BAR_W / 2}px;top:-14px;width:${BAR_W}px;">` +
    `<div data-role="name" style="text-align:center;font-size:10px;color:${color};` +
    `text-shadow:0 1px 2px #000;margin-bottom:2px;white-space:nowrap;${isLocal ? "font-weight:bold;" : ""}">${name}</div>` +
    `<div style="height:6px;background:rgba(0,0,0,0.65);border:1px solid rgba(0,0,0,0.8);border-radius:2px;overflow:hidden;">` +
    `<div data-role="hp" style="height:100%;width:100%;background:${color};"></div>` +
    `</div>` +
    `<div style="height:2px;margin-top:1px;background:rgba(0,0,0,0.5);border-radius:1px;overflow:hidden;">` +
    `<div data-role="mana" style="height:100%;width:0%;background:#4aa3e8;"></div>` +
    `</div>` +
    // over-head cast bar (hidden until casting)
    `<div data-role="cast-wrap" style="display:none;height:4px;margin-top:2px;background:rgba(0,0,0,0.7);` +
    `border:1px solid rgba(0,0,0,0.85);border-radius:2px;overflow:hidden;">` +
    `<div data-role="cast" style="height:100%;width:0%;background:#54b0f0;"></div>` +
    `</div>` +
    `</div>`;
  return el;
}

const CAST_COLOR = "#54b0f0"; // ability channel — blue
const WINDUP_COLOR = "#f0a840"; // basic-attack wind-up — orange

/**
 * Does `background-clip: text` genuinely PAINT in this renderer — not merely
 * "is the property name recognised"?
 *
 * The old check was `CSS.supports("-webkit-background-clip","text")`. That is a
 * false positive on the exact targets this client runs in: an in-app browser /
 * iOS WKWebView can report the property as supported yet fail to paint the
 * clipped gradient on the actual element. When it does, the combat-text CSS is
 * left with a transparent fill and nothing behind it — only the black outline
 * ring shows, so every damage/heal/mana number reads as BLACK. That false
 * positive is the reported bug.
 *
 * This is a REAL element-level probe, not a capability-string lookup: it stamps
 * the ACTUAL gradient CSS this layer emits onto a throwaway node, hangs it in
 * the document, and reads back the COMPUTED values. The treatment is only taken
 * to have painted when the engine kept all three of it — the background clips to
 * `text`, the text fill resolved to fully transparent, and the background is a
 * gradient. If the engine silently dropped any of them (the WKWebView / in-app
 * case), the probe returns false and combatTextCss uses the solid category hue,
 * which the black ring already makes fully legible (the documented fallback).
 *
 * Any doubt resolves to false → solid: no DOM (SSR / the node unit env), a
 * thrown error, or a value the engine refused. The deps are injectable so both
 * branches are unit-testable where there is no real `document`.
 */
export function probeTextGradientPaints(
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined,
  computeStyle: ((el: Element) => CSSStyleDeclaration) | undefined =
    typeof getComputedStyle !== "undefined" ? getComputedStyle : undefined,
): boolean {
  if (!doc || typeof doc.createElement !== "function" || !computeStyle) return false;
  let probe: HTMLElement | null = null;
  try {
    probe = doc.createElement("span");
    // the EXACT fill the renderer would apply, parked far off-screen
    probe.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;pointer-events:none;" +
      combatTextCss(combatTextStyle("taken"), true);
    probe.textContent = "0";
    (doc.body ?? doc.documentElement)?.appendChild(probe);
    const cs = computeStyle(probe);
    const clip = `${cs.getPropertyValue("-webkit-background-clip")} ${cs.getPropertyValue(
      "background-clip",
    )}`;
    const fillColor = cs.getPropertyValue("-webkit-text-fill-color");
    const bgImage = cs.getPropertyValue("background-image");
    const clipsToText = /(^|\s)text(\s|$)/.test(clip);
    // transparent resolves to rgba(0,0,0,0) in a computed style
    const fillIsTransparent = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/i.test(fillColor);
    const hasGradient = /gradient/i.test(bgImage);
    return clipsToText && fillIsTransparent && hasGradient;
  } catch {
    return false;
  } finally {
    probe?.remove();
  }
}

export function WorldAnchorLayer(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const champNodes = new Map<number, HTMLDivElement>();
    let raf = 0;

    // Anything that piled up in the 迴避 buffer while this layer was UNMOUNTED
    // belongs to a fight nobody was watching. Discard it, or remounting the HUD
    // would fire a burst of stale 「閃避」 in one frame.
    drainEvadeSightings();

    // ---- combat-text node pool: allocated ONCE, reused for the session ----
    // Probe the LIVE renderer once (a real element, not `CSS.supports`): only a
    // proven-painting background-clip:text turns the gradient fill on, so an
    // in-app browser / WKWebView that fakes support falls back to the solid hue
    // instead of rendering black numbers.
    const gradient = probeTextGradientPaints();
    const ctNodes: HTMLDivElement[] = [];
    const ctStyleKey: string[] = [];
    const ctEntryId: number[] = [];
    // resolved style per slot, recomputed ONLY when the slot's category or
    // modifiers change — combatTextStyle returns a fresh object, so calling it
    // per node per frame would allocate ~4k objects/second for nothing
    const ctStyle: (CombatTextStyle | null)[] = [];
    for (let i = 0; i < MAX_COMBAT_TEXT; i++) {
      const n = document.createElement("div");
      n.style.cssText = "position:absolute;left:0;top:0;display:none;pointer-events:none;";
      ctNodes.push(n);
      ctStyleKey.push("");
      ctEntryId.push(-1);
      ctStyle.push(null);
      root.appendChild(n);
    }

    // Reserved HUD chrome rects (task #42's registry). Recomputed only when the
    // viewport changes — the registry is a declaration, not a DOM measurement.
    let chromeRects: HudRect[] = [];
    let chromeW = -1;
    let chromeH = -1;
    const box: HudRect = { x: 0, y: 0, w: 0, h: 0 };

    const frame = (): void => {
      raf = requestAnimationFrame(frame);

      // ---- champion healthbars ----
      for (const [id, anchor] of frameBus.champions) {
        let node = champNodes.get(id);
        if (!node) {
          node = makeChampionNode(anchor.name, teamCss(anchor.teamId), anchor.isLocal);
          champNodes.set(id, node);
          root.appendChild(node);
        }
        const show = anchor.pose.visible && anchor.alive;
        node.style.display = show ? "block" : "none";
        if (show) {
          node.style.transform = `translate(${anchor.pose.sx.toFixed(1)}px, ${anchor.pose.sy.toFixed(1)}px)`;
          const hp = node.querySelector<HTMLDivElement>('[data-role="hp"]');
          if (hp) hp.style.width = `${Math.max(0, Math.min(100, anchor.hpPct * 100)).toFixed(1)}%`;
          const mana = node.querySelector<HTMLDivElement>('[data-role="mana"]');
          if (mana) mana.style.width = `${Math.max(0, Math.min(100, anchor.manaPct * 100)).toFixed(1)}%`;
          // over-head cast bar
          const castWrap = node.querySelector<HTMLDivElement>('[data-role="cast-wrap"]');
          const castFill = node.querySelector<HTMLDivElement>('[data-role="cast"]');
          if (castWrap && castFill) {
            if (anchor.cast) {
              castWrap.style.display = "block";
              castFill.style.width = `${Math.max(0, Math.min(100, anchor.cast.fraction * 100)).toFixed(1)}%`;
              castFill.style.background = anchor.cast.kind === "windup" ? WINDUP_COLOR : CAST_COLOR;
            } else {
              castWrap.style.display = "none";
            }
          }
        }
      }
      for (const [id, node] of champNodes) {
        if (!frameBus.champions.has(id)) {
          node.remove();
          champNodes.delete(id);
        }
      }

      // ---- 迴避 → floating text (task #92b) ----
      // A dodge is the one combat outcome with no damage packet behind it, so
      // it reaches the client on its own buffer (net/RoomConnection.EvadeSighting)
      // rather than through the frame loop's event fanout. Drained here, one
      // frame's worth at a time, and handed straight to the SAME admission
      // pipeline every other number goes through — so a 「閃避」 obeys the scope
      // setting, the density cap, the per-body limit and the priority eviction
      // without a line of its own. `atMs` is the packet's ARRIVAL time, not this
      // frame's: a dodge that landed 8 ms ago is already 8 ms into its life,
      // which is what keeps it in step with the swing that produced it.
      for (const ev of drainEvadeSightings()) {
        pushEvadeText({
          source: ev.source,
          target: ev.target,
          worldX: ev.x,
          worldZ: ev.z,
          nowMs: ev.atMs,
        });
      }

      // ---- floating combat text ----
      const now = performance.now();
      const vw = root.clientWidth;
      const vh = root.clientHeight;
      if (vw !== chromeW || vh !== chromeH) {
        chromeW = vw;
        chromeH = vh;
        chromeRects = hudReservedRects(
          { width: vw, height: vh },
          typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : false,
        );
      }

      for (let i = 0; i < frameBus.combatText.length; i++) {
        const e = frameBus.combatText[i]!;
        const node = ctNodes[i]!;
        const ageMs = now - e.bornMs;
        // `bornMs` may be in the FUTURE: RO releases a multi-hit as a sequence,
        // so a staggered number simply is not on screen yet.
        if (!e.active || !e.pose.visible || ageMs < 0) {
          if (node.style.display !== "none") node.style.display = "none";
          continue;
        }

        const mods = { crit: e.crit, killingBlow: e.killingBlow, dmgType: e.dmgType };
        const key = combatTextStyleKey(e.category, mods);

        // Restyle only when the slot changed category/modifiers — a pooled node
        // holding the same style across its life writes nothing but transform.
        if (ctStyleKey[i] !== key || !ctStyle[i]) {
          const st = combatTextStyle(e.category, mods);
          node.style.cssText = combatTextCss(st, gradient);
          ctStyleKey[i] = key;
          ctStyle[i] = st;
          ctEntryId[i] = -1; // force a text write for the new style
        }
        const style = ctStyle[i]!;
        const label = combatTextLabel(e.category, e.amount);
        if (ctEntryId[i] !== e.id || node.textContent !== label) {
          node.textContent = label;
          ctEntryId[i] = e.id;
        }

        const t = e.lifeMs > 0 ? ageMs / e.lifeMs : 1;
        const sx = e.pose.sx + combatTextDrift(t, style.driftPx) + combatTextLane(e.lane);
        // RO's lob: up for the first third, then down THROUGH the spawn point.
        const sy = e.pose.sy - combatTextLift(t, style.arcPx);
        const scale = combatTextScale(ageMs, style.popScale);

        // A number is drawn centred on its anchor; the old code translated the
        // box's top-left corner, which hung every glyph down-and-right into the
        // model's head and off its centreline.
        node.style.display = "block";
        node.style.transform =
          `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;

        let alpha = combatTextAlpha(t, e.lifeMs) * style.alpha;
        if (chromeRects.length > 0 && alpha > 0) {
          // Width comes from the model, not from `length * 0.62`: the 迴避
          // labels (task #92b) are full-width CJK, so the old digit-advance
          // estimate undercounts 「閃避」 by ~40 % and would leave it undamped
          // while it is genuinely sitting under the minimap.
          const w = Math.max(style.fontSize * 0.62, combatTextWidthPx(label, style.fontSize));
          box.x = sx - w / 2;
          box.y = sy - style.fontSize / 2;
          box.w = w;
          box.h = style.fontSize;
          alpha *= chromeAlphaMult(box, chromeRects);
        }
        node.style.opacity = alpha.toFixed(3);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      for (const n of champNodes.values()) n.remove();
      for (const n of ctNodes) n.remove();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    />
  );
}
