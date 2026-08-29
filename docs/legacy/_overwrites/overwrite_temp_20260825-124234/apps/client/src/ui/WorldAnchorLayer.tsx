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
import { floatingTextLayers } from "../vfx/FloatingTextFx";
import {
  COMBAT_TEXT_FONT,
  MAX_COMBAT_TEXT,
  chromeAlphaMult,
  combatTextAlpha,
  combatTextCss,
  combatTextDrift,
  combatTextLabel,
  combatTextLane,
  combatTextLift,
  combatTextScale,
  combatTextShadow,
  combatTextStyle,
  combatTextStyleKey,
  combatTextWidthPx,
  hudReservedRects,
  type CombatTextStyle,
  type HudRect,
} from "./combatText";
import { teamCss } from "./theme";

const BAR_W = 64;

/**
 * 技能浮字的**基準字級**（`sizeScale` 乘在它上面；後台的 `floatingTextScale`
 * 已經在 `FloatingTextFx` 那一層乘進 `sizeScale` 了 —— 一個值一個住處）。
 * ⛔ 不是一格後台：它只有「讀得到」與「擋住畫面」兩種值，跟 {@link BAR_W} 同一族。
 */
const FLOATING_TEXT_BASE_PX = 20;

const byte = (n: number): number => Math.max(0, Math.min(255, Math.round(n) || 0));

/**
 * 一段技能浮字的完整 inline style（PURE —— 給守衛逐格讀得到）。
 *
 * ⭐ 刻意與傷害數字**共用同一支字體與同一份外框配方**（`COMBAT_TEXT_FONT` /
 * `combatTextShadow`）：它們是同一塊畫布上的兩種字，字體不一樣會讀成兩套 HUD。
 * ⛔ 但它**不走** `combatTextCss` —— 那一支的每一格（類別色、band、halo、暴擊斜體）
 * 都綁在「誰打誰、打多少」上，而浮字沒有類別也沒有數字（見 `vfx/FloatingTextFx`
 * 檔頭：硬塞進去要在 `CombatTextCategory` 上開一個「其他」分支）。
 */
export function floatingTextCss(r: number, g: number, b: number, fontSizePx: number): string {
  // 外框要跟著字長大，⛔ 否則大字讀起來像沒有描邊（同 `combatTextStyle` 的那一行）
  const outlinePx = fontSizePx >= 24 ? 2 : 1.5;
  return (
    "position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;" +
    "will-change:transform,opacity;transform-origin:50% 50%;" +
    `font-family:${COMBAT_TEXT_FONT};font-weight:700;letter-spacing:0.02em;` +
    `font-size:${fontSizePx}px;color:rgb(${byte(r)},${byte(g)},${byte(b)});` +
    `text-shadow:${combatTextShadow(outlinePx, outlinePx * 2)};`
  );
}

/** 一顆有樣式（可選 `data-role`）的 `<div>`。⛔ 這裡是全檔唯一建節點的地方。 */
function barDiv(cssText: string, role?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = cssText;
  if (role !== undefined) d.setAttribute("data-role", role);
  return d;
}

/**
 * 頭頂血條的骨架 —— ⛔ **玩家的名字一個位元組都不進 HTML**（GH#80／稽核 F-06）。
 *
 * 在此之前這裡是 `el.innerHTML = … ${name} …`：一個玩家自己取的顯示名被當成
 * 標記解析。它今天打不穿，靠的是**這個 sink 之外**的一層伺服器權威清洗
 * （`apps/game-server/src/net/sanitizeText.ts::sanitizeDisplayName`，剝掉
 * `< > & " ' \` \` 與 C0/DEL）—— 那支檔的檔頭自己寫著它是「for the client's
 * innerHTML sink」的 backstop。
 *
 * ⚠️ 那一層是**黑名單**（列舉字元），⛔ 不是輸出端跳脫，而且它是**逐接縫**套上去的
 * （`MatchRoom.onJoin` / `MatchRoom` 內部賽 / `index.ts` 的 HMAC 路徑各一次 ——
 * F-19 點名的正是「新開一條接縫忘了複製那一行」）。⇒ 放寬一個字元、或新增一條沒套
 * sanitizer 的接縫，這個 sink 立刻回到可打穿，而**上面每一層看起來都完全正常**。
 * ⭐ 正解是這裡**不接受標記**：那樣上游怎麼變都與這一格無關。
 *
 * ⛔ 不要為了少幾行把任何一格改回字串樣板 —— `WorldAnchorLayer.nameSink.test.ts`
 * 直接餵一段 `<img onerror=…>` 給這支函式（⛔ 刻意不走 `RoomConnection`：那一層會
 * 先把 payload 吃掉，於是測到的是 sanitizer 而不是 sink 本身）。
 *
 * `color` 來自內部的 `teamCss(teamId)`，不受攻擊者控制，但它一樣改走
 * `element.style` —— 兩個來源共用一條路，才不會有人下次挑「安全的那一個」貼回字串。
 */
export function makeChampionNode(name: string, color: string, isLocal: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;will-change:transform;";

  const stack = barDiv(`position:absolute;left:${-BAR_W / 2}px;top:-14px;width:${BAR_W}px;`);

  const nameEl = barDiv(
    "text-align:center;font-size:10px;text-shadow:0 1px 2px #000;margin-bottom:2px;white-space:nowrap;",
    "name",
  );
  nameEl.style.color = color;
  if (isLocal) nameEl.style.fontWeight = "bold";
  nameEl.textContent = name;

  const hpTrack = barDiv(
    "height:6px;background:rgba(0,0,0,0.65);border:1px solid rgba(0,0,0,0.8);border-radius:2px;overflow:hidden;",
  );
  const hpFill = barDiv("height:100%;width:100%;", "hp");
  hpFill.style.background = color;
  hpTrack.appendChild(hpFill);

  const manaTrack = barDiv(
    "height:2px;margin-top:1px;background:rgba(0,0,0,0.5);border-radius:1px;overflow:hidden;",
  );
  manaTrack.appendChild(barDiv("height:100%;width:0%;background:#4aa3e8;", "mana"));

  // over-head cast bar (hidden until casting)
  const castWrap = barDiv(
    "display:none;height:4px;margin-top:2px;background:rgba(0,0,0,0.7);" +
      "border:1px solid rgba(0,0,0,0.85);border-radius:2px;overflow:hidden;",
    "cast-wrap",
  );
  castWrap.appendChild(barDiv("height:100%;width:0%;background:#54b0f0;", "cast"));

  stack.appendChild(nameEl);
  stack.appendChild(hpTrack);
  stack.appendChild(manaTrack);
  stack.appendChild(castWrap);
  el.appendChild(stack);
  return el;
}

/**
 * `EvadeSighting.label` 是一個 **token**，不是文案 —— 這張表是它唯一的翻譯點。
 *
 * ⚠️ 這一層的分工是 `net/*` 自己的檔頭寫的、`net/evadeSightings.test.ts` 在守的：
 * socket callback 不擁有任何要畫在螢幕上的字。2026-08-18 接 `immune` 的時候
 * 那串字一度被寫在 `RoomConnection` 裡（守衛只掃另一個詞，所以它是綠的）——
 * 這張表把它搬回來。⛔ 認不得的 token 一律當成「沒有覆寫」，走預設字。
 */
const EVADE_LABELS: Readonly<Record<string, string>> = { immune: "免疫" };

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
          // 缺席 = `pushEvadeText` 自己的預設字。`immune` 帶著一個 **token**
          // 走同一條管線，文案在這一側（見 EVADE_LABELS）—— net 層不擁有 UI 文案。
          ...(ev.label !== undefined && EVADE_LABELS[ev.label] !== undefined
            ? { label: EVADE_LABELS[ev.label] as string }
            : {}),
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
        // owner 2026-08-02「暴擊的時候，傷害數值後面會帶 ! 驚嘆號」。`e.crit` 就是
        // 上面 `mods` 用來放大字級的同一格,所以驚嘆號與放大不可能各講各的。
        // GH#278：`e.label` 是內容給的字（「試煉 ×11」）。它只在標記那條路上被
        // 設定，其餘一律 undefined，所以這裡是一個純粹的加法。
        const label = e.label ?? combatTextLabel(e.category, e.amount, e.crit);
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

      // ---- 技能浮字（GH#701） ----
      // ⛔⛔ 在這一段出現之前，`floatingText` 這條事件路**沒有任何渲染消費端**：
      //    sim 發、`VfxSystem` 收、`FloatingTextFx` 池裡是 active 的，而畫面上
      //    **一個像素都沒有**（克勞德的「1Hit…7Hit」那一族從來沒出現過）。
      // ⭐ 它與傷害數字**共用這一層**（同一個 rAF、同一顆容器、同一套 pooled node
      //    紀律），⛔ 不是第二套浮字系統 —— 那正是 GH#701 明文的 known risk。
      // ⚠️ 座標是**這一發出生時的世界快照 + 目前抬升**（原作的字也不跟著單位走），
      //    投影用的是渲染層每幀註冊的同一支 `frameBus.project`。
      const project = frameBus.project;
      let ftUsed = 0;
      if (project) {
        for (const layer of floatingTextLayers) {
          for (const e of layer.entries) {
            // alpha 0 = 還在錯開的等待中（`delayMs`）或已經淡完 ⇒ 不佔節點
            if (!e.active || e.alpha <= 0) continue;
            const pose = project(e.x, e.y + e.lift, e.z);
            if (!pose.visible) continue;
            let node = ftNodes[ftUsed];
            if (!node) {
              node = document.createElement("div");
              node.style.cssText = "display:none;";
              root.appendChild(node);
              ftNodes.push(node);
              ftKeys.push("");
            }
            const fontSize = Math.max(1, Math.round(FLOATING_TEXT_BASE_PX * e.sizeScale));
            // 一個節點會被不同的字輪流用 ⇒ key 帶 `slot:gen`，換人才重寫樣式與文字
            const key = `${e.slot}:${e.gen}:${fontSize}:${e.r},${e.g},${e.b}`;
            if (ftKeys[ftUsed] !== key) {
              node.style.cssText = floatingTextCss(e.r, e.g, e.b, fontSize);
              node.textContent = e.text;
              ftKeys[ftUsed] = key;
            }
            node.style.display = "block";
            node.style.transform =
              `translate(${(pose.sx + combatTextLane(e.lane)).toFixed(1)}px, ${pose.sy.toFixed(1)}px)` +
              " translate(-50%, -50%)";
            node.style.opacity = e.alpha.toFixed(3);
            ftUsed++;
          }
        }
      }
      for (let i = ftUsed; i < ftNodes.length; i++) {
        const n = ftNodes[i]!;
        if (n.style.display !== "none") n.style.display = "none";
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
