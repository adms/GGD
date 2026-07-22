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
 */
import { useEffect, useRef } from "react";
import { frameBus } from "../frameBus";
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
 * Does this browser support `background-clip: text`? Without it the gradient
 * fill would leave `color: transparent` on a plain element — an invisible
 * number, which is the worst possible failure for a legibility feature — so the
 * pure CSS builder falls back to the gradient's own bottom stop.
 */
function supportsTextGradient(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  return (
    CSS.supports("-webkit-background-clip", "text") || CSS.supports("background-clip", "text")
  );
}

export function WorldAnchorLayer(): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const champNodes = new Map<number, HTMLDivElement>();
    let raf = 0;

    // ---- combat-text node pool: allocated ONCE, reused for the session ----
    const gradient = supportsTextGradient();
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

        const key = combatTextStyleKey(e.category, { crit: e.crit, killingBlow: e.killingBlow });

        // Restyle only when the slot changed category/modifiers — a pooled node
        // holding the same style across its life writes nothing but transform.
        if (ctStyleKey[i] !== key || !ctStyle[i]) {
          const st = combatTextStyle(e.category, { crit: e.crit, killingBlow: e.killingBlow });
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
          const w = style.fontSize * 0.62 * Math.max(1, label.length);
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
