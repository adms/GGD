/**
 * MerchantShop — the 中場 shop, LEFT-docked (task #38/#94), rebuilt for #106:
 * inline descriptions, a visible 6-slot cap, and a live stat preview that must
 * not lie.
 *
 * ---------------------------------------------------------------------------
 * THE PHASE (unchanged from #38)
 * ---------------------------------------------------------------------------
 * The shop IS the intermission. It auto-opens on entering prep, docks LEFT
 * (layout.ts mirrors the scene so the card never covers the hero — see #38's
 * note), owns ~45 % of the screen, and is closable + re-openable via `shopGate`
 * (the HUD mirror of the server's `shopAccess` rule). The prep countdown shows
 * in BOTH card states.
 *
 * ---------------------------------------------------------------------------
 * WHAT #106 ADDED, AND THE ONE RULE THAT GOVERNS IT
 * ---------------------------------------------------------------------------
 * A stat PANEL (英雄全屬性狀態: all 15 stats, fixed 2-column grid) and a per-row
 * PREVIEW of "what would my stats be if I owned this". Both are resolved through
 * the SHARED statPipeline in `statPreview.ts` — never a UI re-derivation — so a
 * percentage item scales off the champion's real base, two flat items respect a
 * clamp, and a non-neutral combat-env is honoured. The catalogue ROWS, by
 * contrast, show AUTHORED numbers (`itemStats.ts`): build-independent, so the
 * list never renumbers itself after a purchase. Two questions, two places:
 *   ROW   = what the item IS (authored, stable, comparable across rows)
 *   PANEL = what it DOES FOR ME right now (resolved, changes as I equip)
 *
 * When the champion carries stat-tick rolls the wire never sent, `statPreview`
 * says so and the panel wears a `≈`; it never presents a number it cannot vouch
 * for as though it were exact.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { SELL_REFUND, INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { itemHasEffect, isShopService, shopServicePrice } from "@ggd/shared/sim/economy/itemTiers";
import { parseCombatEnvJson } from "@ggd/shared/sim/combatEnv";
import { Stat, type StatBlock } from "@ggd/shared/sim/stats/statTypes";
import type { Command } from "@ggd/shared/sim/intents";
import type { ChampionId, ItemId } from "@ggd/shared/ids";
import { useHud, type SeatView } from "../../net/RoomStore";
import { isTouchDevice, readTouchEnv } from "../../input/mobileDetect";
import { SHOP_CARD_SIDE } from "../../render/intermission/layout";
import { audioSystem } from "../../audio";
import { hudActions } from "../actions";
import { GlyphTile } from "../components/GlyphTile";
import { MerchantHeadIcon } from "../components/MerchantHeadIcon";
import { championIconUrl } from "../icons";
import { SfxButton } from "../SfxButton";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { shopCatalogue } from "./champSelectFilter";
import { useWhitelist } from "./whitelist";
import { shopGate, shouldAutoOpen } from "./shopGate";
import { INTERMISSION_Z } from "./intermissionLayout";
import { shopClockChip } from "./prepCountdown";
import { groupCatalogue, type Shelf, type ShelfItem } from "./shopGrouping";
import { skillRows, slotLabel } from "./skillDetails";
import { innateCastNote, innateKindLabel, PASSIVE_ACCENT } from "../passiveSlot";
import { displayFinalText, useDisplayEnv } from "../displayFinal";
import { STAT_META, formatStatValue, formatStatDelta, isVisibleDelta } from "./statDisplay";
import { buildItemRow, type RowItem } from "./itemStats";
import { Tooltip } from "../components/Tooltip";
import { rescaleAbilityProse, WC3_PROSE_CAPTION } from "../components/abilityText";
import {
  computeStatBlock,
  previewItem,
  previewExactness,
  statContextFromSeat,
  type ItemPreview,
} from "./statPreview";
import {
  CLOSE_SFX,
  OPEN_SFX,
  TOAST_TTL_MS,
  boughtToast,
  rejectToast,
  soldToast,
  undoneToast,
  type ShopToast,
} from "./shopFeedback";

/** The card owns the LEFT 45 % of the screen — the market keeps the right 55 %. */
const CARD_WIDTH = "min(45vw, 560px)";
const ACCENT = "#f2a13c";
const GOOD = "#7fe0a0";

/**
 * Which screen edge the shop card hugs (task #94). Read STRAIGHT from the
 * intermission scene's `SHOP_CARD_SIDE` — the same constant `layout.ts` mirrors
 * the whole 3D market around — so the card and the merchant/店員 stage can never
 * disagree about which half is the card's and which is the free stage: flip
 * `SHOP_CARD_SIDE` and BOTH the panel and the mirrored scene move together.
 * Today that is the LEFT edge, so the market (and the clerk the #103 sightline
 * test keeps un-occluded) plays out in the free RIGHT 55 %.
 */
export const SHOP_DOCK_SIDE: "left" | "right" = SHOP_CARD_SIDE;

/**
 * ── UNDO (task #121, UI half) ───────────────────────────────────────────────
 * The kind string of the "undo the last buy/sell" command. The COMMAND itself
 * and the no-arbitrage gold reversal (賣出退 40% → undo 必須精準反向沖回, and
 * 反覆 買→賣→undo 不能刷錢) are the SIM half's job — shared `intents.ts` + the
 * economy. This UI half only DISPATCHES it and shows the button when a step is
 * undoable, and NEVER touches the gold math. The kind is the contract between
 * the two halves; when the shared `Command` union gains it, the single cast at
 * the dispatch site below collapses to a plain literal.
 */
export const UNDO_SHOP_COMMAND_KIND = "undoLastShopStep";

/** Dispatch the undo command through the same seam every shop command uses. */
function sendUndoLastStep(): void {
  // cast: the kind is owned by the parallel SIM half and not yet in the shared
  // `Command` union in this working tree (see UNDO_SHOP_COMMAND_KIND).
  hudActions.sendCommand({ kind: UNDO_SHOP_COMMAND_KIND } as unknown as Command);
}

/**
 * Whether the prominent undo button should show (task #121: 「只在有可還原時顯示」).
 *
 * ── IT READS THE SERVER'S OWN DEPTH, NOT THE LAST EVENT ─────────────────────
 * This used to be `lastEvent.kind === "bought" || "sold"` — a heuristic off the
 * most recent shop TOAST — and it was wrong in both directions:
 *
 *   too permissive  after undoing everything, the last event was still a
 *                   `bought`/`sold`, so the button stayed lit and the next
 *                   press was a silent no-op. Observed live: a third click did
 *                   nothing, with the button still glowing.
 *   too restrictive any later shop event of another kind (a rejected buy —
 *                   "金幣不足" is a click away at all times) replaced the last
 *                   event and HID a step that was still perfectly undoable.
 *
 * `SeatState.undoDepth` — `champ.undoStack.length`, projected every snapshot
 * since the undo landed and read by nobody until now — is the exact answer. It
 * goes to 0 when the stack empties, when a stat tick or a 傳說寶玉 commits the
 * session, and when combat commits the round, so the button disappears in every
 * case where pressing it would do nothing. `shopOpen` keeps it off screen once
 * the shop closes, mirroring the server's own `shopAccess` re-gate on the
 * command (CommandSystem) so the HUD and the sim refuse in the same breath.
 */
export function canUndoShopStep(undoDepth: number, shopOpen: boolean): boolean {
  return shopOpen && undoDepth > 0;
}

/** The card's dock anchoring for the open panel and the collapsed rail. */
export interface ShopDock {
  /** the screen edge the card hugs */
  side: "left" | "right";
  /** px inset from that edge — 0 flush for the open card, 18 for the rail */
  offset: number;
  /** the panel border rides its INNER edge (away from the screen edge) */
  borderSide: "borderLeft" | "borderRight";
}

/**
 * Pure dock geometry, so "the shop is left-anchored" is a testable fact rather
 * than a literal buried in a style object (task #94). `open` picks the flush
 * card (0) vs the collapsed rail (18); everything is derived from
 * {@link SHOP_DOCK_SIDE}.
 */
export function shopDockAnchor(open: boolean): ShopDock {
  return {
    side: SHOP_DOCK_SIDE,
    offset: open ? 0 : 18,
    borderSide: SHOP_DOCK_SIDE === "left" ? "borderRight" : "borderLeft",
  };
}

type Tab = "goods" | "skills";
type Density = "detail" | "compact";
const DENSITY_KEY = "ggd.shop.density";

/** Min interactive target on coarse pointers (Apple HIG) — shop rows/buttons. */
const TOUCH_TARGET = 44;

/**
 * Whether the goods body scrolls as ONE column (attributes → inventory →
 * catalogue) instead of pinning a fixed summary above an independently-scrolling
 * catalogue.
 *
 * THE BUG (mobile): the full-height card is only ~390px on a phone-landscape
 * viewport. The fixed 15-stat panel + 6-slot inventory + header/tabs consumed
 * almost the whole card, so the catalogue — a `flex:1 minHeight:0 overflowY:auto`
 * child — collapsed to a sliver and the buyable items were effectively invisible.
 * On phones / very short viewports the whole body scrolls together so every item
 * is reachable. Desktop keeps the two-region layout (fixed summary + scrolling
 * catalogue) unchanged. Pure, so the breakpoint is a testable fact.
 */
export function shopGoodsSingleScroll(opts: { touch: boolean; viewportHeight: number }): boolean {
  return opts.touch || opts.viewportHeight < 560;
}

/**
 * Shop tabs (#122). The LEAD tab is the hero's 屬性 (attribute) panel: it is
 * default-selected, so opening the shop answers "what am I right now" before
 * "what's for sale". 技能 keeps the per-slot skill detail. Only the LABEL moved
 * 商品→屬性 — the tab KEY stays "goods" because the attribute panel has always
 * led that view (the catalogue simply sits below it), so none of the `goods`
 * content wiring has to change.
 */
export const SHOP_TABS: readonly [{ key: Tab; label: string }, { key: Tab; label: string }] = [
  { key: "goods", label: "屬性" },
  { key: "skills", label: "技能" },
];
/** The tab the shop opens on — the lead (屬性) tab. */
export const DEFAULT_SHOP_TAB: Tab = SHOP_TABS[0].key;

export function MerchantShop(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const alive = useHud((s) => s.localAlive);
  const hasChampion = useHud((s) => s.localMaxHp > 0);
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const shopEvent = useHud((s) => s.shopEvent);
  const secondsLeft = useHud((s) => s.phaseSecondsLeft);
  const combatEnvJson = useHud((s) => s.combatEnvJson);
  const localMaxHp = useHud((s) => s.localMaxHp);
  const localMaxMana = useHud((s) => s.localMaxMana);
  const { whitelist } = useWhitelist();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(DEFAULT_SHOP_TAB);
  const [toast, setToast] = useState<ShopToast | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>(() => readDensity());
  const prevPhase = useRef<string | null>(null);
  const lastToastSeq = useRef(0);

  const gate = shopGate(phase, alive, hasChampion);

  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (shouldAutoOpen(prev, phase)) {
      setOpen(true);
      setTab(DEFAULT_SHOP_TAB);
      setFocused(null);
      audioSystem.playSfx(OPEN_SFX);
    }
  }, [phase]);

  useEffect(() => {
    if (!gate.mounted && open) setOpen(false);
  }, [gate.mounted, open]);

  useEffect(() => {
    if (!shopEvent || shopEvent.seq === lastToastSeq.current) return;
    lastToastSeq.current = shopEvent.seq;
    const name = shopEvent.itemId
      ? (Items.tryGet(shopEvent.itemId as ItemId)?.name ?? shopEvent.itemId)
      : "";
    const next =
      shopEvent.kind === "bought"
        ? boughtToast(name)
        : shopEvent.kind === "sold"
          ? soldToast(name, refundOf(shopEvent.itemId))
          : shopEvent.kind === "undone"
            ? undoneToast(shopEvent.undoneKind, name, shopEvent.gold)
            : rejectToast(shopEvent.reason, name);
    setToast(next);
    if (next.sfx) audioSystem.playSfx(next.sfx);
    const timer = setTimeout(() => setToast(null), TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, [shopEvent]);

  const setDensityPersist = (d: Density): void => {
    setDensity(d);
    try {
      window.localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* private mode / no storage — density just won't persist */
    }
  };

  if (!seat || !gate.mounted) return null;

  const toggle = (): void => {
    audioSystem.playSfx(open ? CLOSE_SFX : OPEN_SFX);
    setOpen(!open);
  };

  const clock = shopClockChip({ phase, secondsLeft, ready: seat.ready });

  if (!open) {
    const rail = shopDockAnchor(false);
    return (
      <div
        style={{
          position: "absolute",
          // Same band as the open card: `useHudPanels` treats the shop as
          // COVERING the left corners for its whole mounted window (rail
          // included, deliberately), so the rail has to out-rank the chrome
          // that yielded to it — otherwise the one control that brings the
          // card back paints under a slot at HUD_Z.slot.
          zIndex: INTERMISSION_Z.panel,
          ...(rail.side === "left" ? { left: rail.offset } : { right: rail.offset }),
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            border: `1px solid ${clock.color}55`,
            background: "rgba(30, 22, 12, 0.92)",
            color: clock.color,
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {clock.text}
        </div>
        <SfxButton
          kind="primary"
          onClick={toggle}
          disabled={!gate.open}
          title={gate.open ? "開啟商店" : gate.reason}
          style={{
            padding: "14px 20px",
            borderRadius: 12,
            border: `1px solid ${ACCENT}`,
            background: "rgba(30, 22, 12, 0.92)",
            color: gate.open ? ACCENT : TEXT_DIM,
            fontSize: 15,
            fontWeight: "bold",
            writingMode: "vertical-rl",
            letterSpacing: 4,
            cursor: gate.open ? "pointer" : "not-allowed",
          }}
        >
          🛒 {gate.label}
        </SfxButton>
      </div>
    );
  }

  const items = shopCatalogue(Items.all(), whitelist);
  const whitelistEmptied = whitelist.enforced && items.length === 0;

  // Mobile: scroll the goods body as one column + grow the buy/row tap targets.
  const touch = isTouchDevice(readTouchEnv());
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const singleScroll = shopGoodsSingleScroll({ touch, viewportHeight });

  // The hero you're shopping FOR — its portrait rides the tab row (#122).
  const champName = Champions.tryGet(seat.championId as ChampionId)?.name ?? seat.displayName ?? seat.championId;

  const dock = shopDockAnchor(true);
  return (
    <div
      style={{
        position: "absolute",
        // #107/#106: the registry row for "shop" declares `z: HUD_Z.screen`.
        // It is declared HERE too, from the shared band, because the guard
        // proves rectangles — it cannot see paint order — and every managed
        // corner slot really does carry `zIndex: HUD_Z.slot` (25) via
        // `hudSlotStyle`. Without this the card painted UNDER the very chrome
        // its `covers` list claims, and only `displaced: "hide"` hid the bug.
        zIndex: INTERMISSION_Z.panel,
        top: 0,
        bottom: 0,
        width: CARD_WIDTH,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: "14px 16px",
        background: PANEL_BG,
        color: TEXT_MAIN,
        pointerEvents: "auto",
        fontSize: 13,
        ...(dock.side === "left"
          ? { left: dock.offset, borderRight: PANEL_BORDER }
          : { right: dock.offset, borderLeft: PANEL_BORDER }),
      }}
    >
      {/* ---- header ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* the 店員's own 頭圖 (task #146): the card is HIS counter, and until
            now the only face on it was the player's hero portrait in the tab
            row (#122) — the merchant was a bare string. */}
        <MerchantHeadIcon size={26} radius={7} accent={ACCENT} />
        <div style={{ fontSize: 18, fontWeight: "bold", color: ACCENT }}>旅行商人</div>
        <div style={{ fontSize: 11, color: clock.color, fontVariantNumeric: "tabular-nums" }}>{clock.text}</div>
        <div style={{ marginLeft: "auto", color: GOLD, fontWeight: "bold" }}>{seat.gold} g</div>
        <SfxButton
          kind="ghost"
          onClick={toggle}
          title="關閉商店"
          style={{
            padding: "2px 10px",
            borderRadius: 6,
            border: PANEL_BORDER,
            background: "transparent",
            color: TEXT_DIM,
            fontSize: 14,
          }}
        >
          ✕
        </SfxButton>
      </div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
        {phase === "intermission"
          ? "戰鬥尚未開始 · 買完按 Ready 可提前開打"
          : "本回合已陣亡 · 回合結束前仍可採購"}
      </div>

      {/* ---- prominent UNDO (task #121): shown exactly when the SERVER says a
              step is reversible (`seat.undoDepth > 0`), so it disappears the
              moment the stack empties instead of staying lit over a no-op. The
              command + the exact gold reversal are the sim half's job; this
              button just makes 復原 obvious and dispatches it. ---- */}
      {canUndoShopStep(seat.undoDepth, gate.open) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <SfxButton
            kind="primary"
            onClick={sendUndoLastStep}
            title={`還原上一筆買賣（金幣精準沖回）· 還可復原 ${seat.undoDepth} 步`}
            style={{
              flex: 1,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #ffcf7a",
              background: "#f2a13c",
              color: "#201509",
              fontSize: 14,
              fontWeight: "bold",
              letterSpacing: 1,
              boxShadow: "0 0 0 1px rgba(242,161,60,0.35), 0 2px 8px rgba(0,0,0,0.35)",
              cursor: "pointer",
            }}
          >
            ↩ 復原上一步{seat.undoDepth > 1 ? `（還有 ${seat.undoDepth} 步）` : ""}
          </SfxButton>
        </div>
      )}

      {/* ---- hero portrait + tabs (#122) ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 8px" }}>
        <ShopHeroPortrait championId={seat.championId} name={champName} />
        <div style={{ display: "flex", gap: 6 }}>
          {SHOP_TABS.map(({ key, label }) => (
            <SfxButton
              key={key}
              kind="subdued"
              sfxVolume={0.5}
              clickSfx="uiTabSwitch"
              onClick={() => setTab(key)}
              style={{
                padding: "5px 16px",
                borderRadius: 7,
                border: `1px solid ${tab === key ? ACCENT : "#2a3040"}`,
                background: tab === key ? "rgba(60, 42, 18, 0.9)" : "transparent",
                color: tab === key ? ACCENT : TEXT_DIM,
                fontSize: 13,
              }}
            >
              {label}
            </SfxButton>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {tab === "goods" ? (
          <GoodsTab
            catalogue={items}
            seat={seat}
            emptied={whitelistEmptied}
            canBuy={gate.open}
            combatEnvJson={combatEnvJson}
            localMaxHp={localMaxHp}
            localMaxMana={localMaxMana}
            density={density}
            onDensity={setDensityPersist}
            focused={focused}
            onFocus={setFocused}
            singleScroll={singleScroll}
            touch={touch}
          />
        ) : (
          <SkillsTab seat={seat} />
        )}
      </div>

      {/* ---- feedback line ---- */}
      <div style={{ minHeight: 22, marginTop: 8 }}>
        {toast && (
          <div
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              background: toast.tone === "deny" ? "rgba(90, 26, 26, 0.85)" : "rgba(24, 62, 34, 0.85)",
              border: `1px solid ${toast.tone === "deny" ? "#8d3c3c" : "#3c8d52"}`,
              color: toast.tone === "deny" ? "#ffbcbc" : "#bcffcd",
            }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The champion's portrait, shown beside the shop tabs (#122). Reuses the shared
 * GlyphTile so a hero whose WC3 art was Blizzard-stock still gets a seeded glyph;
 * when the champion HAS an extracted icon, a real <img> renders over it — the
 * same "img over glyph" contract the codex and ability bar already rely on.
 */
export function ShopHeroPortrait(props: {
  championId: string;
  name: string;
  size?: number;
}): React.JSX.Element {
  const { championId, name, size = 34 } = props;
  return (
    <GlyphTile
      seed={championId || name}
      src={championIconUrl(championId)}
      label={name}
      size={size}
      accent={ACCENT}
      radius={8}
    />
  );
}

/** Density default: compact on short viewports, else detail. Persisted. */
function readDensity(): Density {
  try {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    if (stored === "detail" || stored === "compact") return stored;
  } catch {
    /* no storage */
  }
  return typeof window !== "undefined" && window.innerHeight < 780 ? "compact" : "detail";
}

/** Sell refund for an item id (matches the sim's SELL_REFUND exactly). */
function refundOf(itemId: string): number {
  const def = itemId ? Items.tryGet(itemId as ItemId) : undefined;
  return def ? Math.floor(def.cost * SELL_REFUND) : 0;
}

/** Effective purchase price — services are priced by the sim, not the doc. */
function priceOf(item: { id: string; cost: number }): number {
  return shopServicePrice(item.id) ?? item.cost;
}

// ---------------------------------------------------------------------------
// 商品
// ---------------------------------------------------------------------------

type CatItem = ReturnType<typeof Items.all>[number];

interface GoodsProps {
  catalogue: CatItem[];
  seat: SeatView;
  emptied: boolean;
  canBuy: boolean;
  combatEnvJson: string;
  localMaxHp: number;
  localMaxMana: number;
  density: Density;
  onDensity: (d: Density) => void;
  focused: string | null;
  onFocus: (id: string | null) => void;
  /** phone/short viewport: scroll the whole body as one column (see shopGoodsSingleScroll). */
  singleScroll: boolean;
  /** coarse pointer: grow row + buy-button tap targets to >=44px. */
  touch: boolean;
}

function GoodsTab(props: GoodsProps): React.JSX.Element {
  const { catalogue, seat, emptied, canBuy, density, onDensity, focused, onFocus, singleScroll, touch } = props;

  // A stable signature of everything the pipeline reads, so the (world-building)
  // stat computes only re-run when the champion or the env actually changes.
  const sig = useMemo(
    () =>
      JSON.stringify([
        seat.championId,
        seat.level,
        seat.abilityRanks,
        seat.exAbilityId,
        seat.exRank,
        seat.items,
        seat.augments,
        seat.statCapstonePct,
        props.combatEnvJson,
      ]),
    [seat, props.combatEnvJson],
  );

  const env = useMemo(() => parseCombatEnvJson(props.combatEnvJson), [props.combatEnvJson]);
  const ctx = useMemo(() => statContextFromSeat(seat, env), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelBlock = useMemo(() => computeStatBlock(ctx), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(
    () => (focused ? previewItem(ctx, focused) : null),
    [sig, focused], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const exact = useMemo(
    () =>
      panelBlock
        ? previewExactness(panelBlock, {
            statStacks: seat.statStacks,
            authMaxHp: props.localMaxHp,
            authMaxMana: props.localMaxMana,
          })
        : { exact: true },
    [panelBlock, seat.statStacks, props.localMaxHp, props.localMaxMana],
  );

  const shelves = groupCatalogue(catalogue as unknown as ShelfItem[]);
  const filled = seat.items.filter((s) => s !== "").length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        flex: 1,
        // phone: the whole body scrolls together, so the catalogue is never
        // squeezed to nothing by the fixed attribute panel + inventory above it.
        ...(singleScroll
          ? { overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }
          : {}),
      }}
    >
      {/* ===== stat panel — persistent, never reorders, never changes height ===== */}
      {panelBlock && (
        <StatPanel
          block={panelBlock}
          preview={preview}
          exact={exact.exact}
          authMaxHp={props.localMaxHp}
          authMaxMana={props.localMaxMana}
        />
      )}

      {/* ===== the 6-slot inventory, always drawn as six cells ===== */}
      <InventoryGrid seat={seat} filled={filled} />

      {/* ===== density toggle ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 4px" }}>
        <span style={{ fontSize: 10, color: TEXT_DIM, marginRight: "auto" }}>
          商品 <span style={{ fontVariantNumeric: "tabular-nums" }}>{catalogue.length}</span>
        </span>
        {(["detail", "compact"] as const).map((d) => (
          <SfxButton
            key={d}
            kind="subdued"
            sfxVolume={0.4}
            onClick={() => onDensity(d)}
            style={{
              padding: "2px 10px",
              borderRadius: 6,
              border: `1px solid ${density === d ? ACCENT : "#2a3040"}`,
              background: density === d ? "rgba(60,42,18,0.9)" : "transparent",
              color: density === d ? ACCENT : TEXT_DIM,
              fontSize: 11,
            }}
          >
            {d === "detail" ? "詳細" : "精簡"}
          </SfxButton>
        ))}
      </div>

      {/* ===== the catalogue: shelves, cheapest first ===== */}
      {/* phone: flow at natural height (outer body scrolls); desktop: the
          catalogue is its own scroll region under the fixed summary. */}
      <div style={singleScroll ? { paddingRight: 4 } : { flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {emptied && (
          <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 8, lineHeight: 1.6 }}>
            尚未啟用任何道具（後台白名單為空）。
            <br />
            管理員請至 <b style={{ color: TEXT_MAIN }}>/admin/ → 內容白名單 → ⭐ 啟用示範組合 → 儲存</b>
            ，或執行 <b style={{ color: TEXT_MAIN }}>make seed-demo</b>。
          </div>
        )}
        {shelves.map((shelf) => (
          <ShelfBlock
            key={shelf.id}
            shelf={shelf}
            seat={seat}
            canBuy={canBuy}
            density={density}
            focused={focused}
            onFocus={onFocus}
            preview={preview}
            touch={touch}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// stat panel — all 15, fixed 2-column grid, resolved through the pipeline
// ---------------------------------------------------------------------------

function StatPanel(props: {
  block: StatBlock;
  preview: ItemPreview | null;
  exact: boolean;
  authMaxHp: number;
  authMaxMana: number;
}): React.JSX.Element {
  const { block, preview, exact } = props;
  const colA = STAT_META.filter((m) => m.column === 0);
  const colB = STAT_META.filter((m) => m.column === 1);

  // The two stats the wire carries authoritatively; pin them so hidden
  // stat-ticks never make the panel's HP/mana read wrong.
  const shown = (stat: Stat): number => {
    if (stat === Stat.MaxHealth && props.authMaxHp > 0) return props.authMaxHp;
    if (stat === Stat.MaxMana && props.authMaxMana > 0) return props.authMaxMana;
    return block[stat];
  };

  const cell = (meta: (typeof STAT_META)[number]): React.JSX.Element => {
    const delta = preview?.deltas[meta.stat];
    const showDelta = delta !== undefined && isVisibleDelta(meta.stat, delta);
    return (
      <div
        key={meta.stat}
        style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "1px 0", minWidth: 0 }}
      >
        <span style={{ fontSize: 10, color: TEXT_DIM, width: 56, flexShrink: 0 }}>{meta.label}</span>
        <span
          style={{
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            color: TEXT_MAIN,
            marginLeft: "auto",
            textAlign: "right",
          }}
        >
          {formatStatValue(meta.stat, shown(meta.stat))}
        </span>
        <span
          style={{
            fontSize: 10,
            fontVariantNumeric: "tabular-nums",
            color: showDelta ? (delta! > 0 ? GOOD : "#e08a8a") : "transparent",
            width: 48,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {showDelta ? formatStatDelta(meta.stat, delta!) : "·"}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        border: "1px solid rgba(242,161,60,0.22)",
        borderRadius: 8,
        padding: "6px 10px",
        background: "rgba(20,16,10,0.5)",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: "bold", color: ACCENT }}>英雄全屬性狀態</span>
        {!exact && (
          <span style={{ fontSize: 9, color: "#d9b26a" }} title="已購買屬性強化，部分數值僅供參考">
            ≈ 屬性強化未同步，實際以戰鬥面板為準
          </span>
        )}
        {preview && (
          <span style={{ marginLeft: "auto", fontSize: 9, color: GOOD }}>預覽中 · +為裝上此道具後</span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14 }}>
        <div>{colA.map(cell)}</div>
        <div>{colB.map(cell)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// inventory — always six cells, so the cap is a thing you can SEE
// ---------------------------------------------------------------------------

function InventoryGrid(props: { seat: SeatView; filled: number }): React.JSX.Element {
  const { seat, filled } = props;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: "bold", color: ACCENT }}>裝備欄</span>
        <span style={{ fontSize: 10, color: filled >= INVENTORY_SLOTS ? "#e08a8a" : TEXT_DIM, fontVariantNumeric: "tabular-nums" }}>
          {filled} / {INVENTORY_SLOTS}
        </span>
        <span style={{ fontSize: 9, color: TEXT_DIM }}>（點擊賣出）</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5 }}>
        {Array.from({ length: INVENTORY_SLOTS }, (_, slot) => {
          const itemId = seat.items[slot] ?? "";
          if (!itemId) {
            return (
              <div
                key={slot}
                style={{
                  aspectRatio: "1",
                  borderRadius: 7,
                  border: "1px dashed rgba(120,140,190,0.28)",
                  background: "rgba(255,255,255,0.02)",
                }}
              />
            );
          }
          const def = Items.tryGet(itemId as ItemId);
          // #140: an equipped slot shows the FULL item detail on hover — the same
          // ✦ effect line + WC3 claim lines + lore the shop shelf shows (buildItemRow),
          // not just the name+refund the native title used to carry.
          const row = def ? buildItemRow(def as unknown as RowItem, null) : null;
          const detailBody = [
            row?.effect ? `✦ ${row.effect}` : "",
            row?.claims && row.claims.length > 0 ? row.claims.join(" · ") : "",
            row?.lore ?? "",
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <Tooltip
              key={slot}
              title={def?.name ?? itemId}
              body={detailBody || undefined}
              meta={[{ label: "點擊賣出", value: `+${refundOf(itemId)} g` }]}
              style={{ display: "block" }}
            >
              {/* #24: a SELL is a real, gold-moving gameplay action — the one
                  the owner already asked for an undo on (#121) because it gets
                  mis-clicked. It was the last raw <button> on this card, so it
                  alone answered a click with silence and no press feedback.
                  `sfxVolume` matches the in-match HUD voice used by the tab
                  row above; `pressScale` stays at the default because the tile
                  uses no transform for layout. */}
              <SfxButton
                // `subdued`, not the base skin: base adds the notched 45° corner
                // clip-path + colour-cycling bloom, which would slice the corners
                // off a square 38px item icon and put six animated rainbow rings
                // in the inventory row. `subdued` drops the notch, the bloom and
                // the sheen and leaves a 1px hairline — the tile keeps its own
                // brown border and reads as itself. Same kind the density
                // toggles on this card already use.
                kind="subdued"
                sfxVolume={0.4}
                onClick={() => hudActions.sendCommand({ kind: "sellItem", itemSlot: slot })}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 7,
                  border: "1px solid #63463a",
                  background: "#2b2018",
                  padding: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                <GlyphTile seed={itemId} icon={def?.icon ?? null} label={def?.name ?? itemId} size={38} />
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 2,
                    fontSize: 8,
                    color: "#e0a878",
                    fontVariantNumeric: "tabular-nums",
                    textShadow: "0 0 3px #000",
                  }}
                >
                  {refundOf(itemId)}g
                </span>
              </SfxButton>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// one shelf + its rows
// ---------------------------------------------------------------------------

function ShelfBlock(props: {
  shelf: Shelf;
  seat: SeatView;
  canBuy: boolean;
  density: Density;
  focused: string | null;
  onFocus: (id: string | null) => void;
  preview: ItemPreview | null;
  touch: boolean;
}): React.JSX.Element {
  const { shelf, seat, canBuy, density, focused, onFocus, preview, touch } = props;
  const full = seat.items.every((s) => s !== "");
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          margin: "6px 0 3px",
          paddingBottom: 3,
          borderBottom: "1px solid rgba(242,161,60,0.28)",
        }}
      >
        <span style={{ fontWeight: "bold", color: ACCENT, fontSize: 13 }}>{shelf.label}</span>
        <span style={{ fontSize: 10, color: TEXT_DIM }}>{shelf.hint}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: TEXT_DIM }}>{shelf.items.length}</span>
      </div>
      {shelf.items.map((shelved) => {
        const item = shelved as unknown as CatItem;
        return (
          <CatalogueRow
            key={item.id}
            item={item}
            anchorStat={shelf.anchorStat}
            seat={seat}
            full={full}
            canBuy={canBuy}
            density={density}
            expanded={focused === item.id}
            onToggle={() => onFocus(focused === item.id ? null : item.id)}
            preview={focused === item.id ? preview : null}
            touch={touch}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// one catalogue row
// ---------------------------------------------------------------------------

function CatalogueRow(props: {
  item: CatItem;
  anchorStat: string | null;
  seat: SeatView;
  full: boolean;
  canBuy: boolean;
  density: Density;
  expanded: boolean;
  onToggle: () => void;
  preview: ItemPreview | null;
  touch: boolean;
}): React.JSX.Element {
  const { item, anchorStat, seat, full, canBuy, density, expanded, onToggle, preview, touch } = props;

  const price = priceOf(item);
  const service = isShopService(item.id);
  const inert = !service && !itemHasEffect(item as { modifiers?: unknown[]; passive?: unknown[] });
  const affordable = seat.gold >= price;
  const uniqueOwned = !!item.unique && seat.items.includes(item.id);

  const row = useMemo(
    () => buildItemRow(item as unknown as RowItem, anchorStat as Stat | null),
    [item, anchorStat],
  );

  const blocked = inert
    ? "此道具無數值效果（資料待補）"
    : uniqueOwned
      ? "已擁有（唯一道具）"
      : !canBuy
        ? "戰鬥中無法使用商店"
        : !affordable
          ? "金幣不足"
          : full && !service
            ? "道具欄已滿"
            : "";

  return (
    <div
      style={{
        borderRadius: 7,
        background: expanded ? "rgba(60,42,18,0.35)" : "transparent",
        opacity: inert ? 0.5 : 1,
      }}
    >
      {/* --- the collapsed track: [icon] [name+chips] [anchor] [price] --- */}
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "30px 1fr 56px 72px",
          alignItems: "center",
          gap: 8,
          padding: touch ? "8px 4px" : "4px 4px",
          minHeight: touch ? TOUCH_TARGET : undefined, // >=44px finger target
          cursor: "pointer",
        }}
      >
        <GlyphTile seed={item.id} icon={item.icon} label={item.name} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
            {row.rarity && (
              <span
                style={{
                  fontSize: 9,
                  color: ACCENT,
                  border: `1px solid ${ACCENT}66`,
                  borderRadius: 4,
                  padding: "0 3px",
                  flexShrink: 0,
                }}
              >
                {row.rarity}
              </span>
            )}
          </div>
          {row.secondary.length > 0 && (
            <div style={{ fontSize: 10, color: "#b7c0d4", marginTop: 1, display: "flex", flexWrap: "wrap", gap: "0 8px" }}>
              {row.secondary.map((chip, i) => (
                <span key={i} style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {chip}
                </span>
              ))}
            </div>
          )}
          {density === "detail" && row.effect && !expanded && (
            <div
              style={{
                fontSize: 10,
                color: "#8fb4d6",
                marginTop: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              ✦ {row.effect}
            </div>
          )}
          {inert && <div style={{ fontSize: 10, color: "#c98a8a", marginTop: 1 }}>無效果</div>}
        </div>
        <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", textAlign: "right", color: row.anchorText ? TEXT_MAIN : TEXT_DIM }}>
          {row.anchorText ?? "—"}
        </span>
        <SfxButton
          onClick={(e?: React.MouseEvent) => {
            e?.stopPropagation();
            if (!blocked) hudActions.sendCommand({ kind: "buyItem", itemId: item.id });
          }}
          disabled={!!blocked}
          title={blocked || `購買 ${item.name}`}
          style={{
            padding: touch ? "10px 6px" : "5px 6px",
            minHeight: touch ? TOUCH_TARGET : undefined, // >=44px finger target
            borderRadius: 6,
            border: `1px solid ${blocked ? "#39405a" : "#6a5a2a"}`,
            background: blocked ? "#151a26" : "#3a2f14",
            color: blocked ? TEXT_DIM : GOLD,
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            cursor: blocked ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {price} g
        </SfxButton>
      </div>

      {/* --- the accordion body (one open at a time) --- */}
      {expanded && <ExpandedRow row={row} preview={preview} />}
    </div>
  );
}

function ExpandedRow(props: {
  row: ReturnType<typeof buildItemRow>;
  preview: ItemPreview | null;
}): React.JSX.Element {
  const { row, preview } = props;
  // the raw 效能 stat claims — WC3 原文, which frequently DISAGREES with the sim
  // (#108). Classified by itemStats (same rule that built the effect line), shown
  // ONLY here and clearly labelled as non-authoritative.
  const claims = row.claims;

  const deltas = preview?.buyable
    ? Object.entries(preview.deltas)
        .filter(([stat, d]) => isVisibleDelta(stat as Stat, d as number))
        .map(([stat, d]) => formatStatDelta(stat as Stat, d as number) + " " + labelFor(stat as Stat))
    : [];

  return (
    <div style={{ padding: "2px 8px 8px 42px", fontSize: 11, lineHeight: 1.55 }}>
      {row.effect && <div style={{ color: "#8fb4d6", marginBottom: 3 }}>✦ {row.effect}</div>}
      {preview && !preview.buyable && (
        <div style={{ color: "#e08a8a", marginBottom: 3 }}>
          {preview.reason === "slot-full" ? "道具欄已滿，無法裝上" : "無法預覽此道具"}
        </div>
      )}
      {deltas.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", marginBottom: 3 }}>
          {deltas.map((d, i) => (
            <span key={i} style={{ color: GOOD, fontVariantNumeric: "tabular-nums" }}>
              {d}
            </span>
          ))}
        </div>
      )}
      {row.lore && <div style={{ color: TEXT_DIM, marginBottom: 3 }}>{row.lore}</div>}
      {claims.length > 0 && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed rgba(120,140,190,0.2)" }}>
          <div style={{ fontSize: 9, color: "#9a8360" }}>原始說明（WC3 原文，非本作數值）</div>
          <div style={{ color: TEXT_DIM, fontSize: 10 }}>{claims.join(" · ")}</div>
        </div>
      )}
    </div>
  );
}

/** Panel label for a stat, for the expanded delta chips. */
function labelFor(stat: Stat): string {
  return STAT_META.find((m) => m.stat === stat)?.label ?? stat;
}

// ---------------------------------------------------------------------------
// 技能 — full per-slot skill detail (unchanged from #38)
// ---------------------------------------------------------------------------

function SkillsTab(props: { seat: Parameters<typeof skillRows>[0] }): React.JSX.Element {
  const rows = skillRows(props.seat);
  const env = useDisplayEnv(); // #125: cooldown shown as post-multiplier final
  if (rows.length === 0) {
    return <div style={{ color: TEXT_DIM, fontSize: 12 }}>尚未選擇英雄</div>;
  }
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
      {rows.map((row) => (
        <div
          key={`${row.slot}-${row.rawName}`}
          style={{
            display: "flex",
            gap: 10,
            padding: "8px 0",
            borderBottom: "1px solid rgba(120,140,190,0.14)",
            opacity: row.learned ? 1 : 0.62,
          }}
        >
          <div style={{ width: 40, textAlign: "center", flexShrink: 0 }}>
            <GlyphTile
              seed={`${row.slot}-${row.rawName}`}
              icon={row.icon}
              label={row.name}
              size={36}
              accent={row.slot === "EX" ? ACCENT : row.slot === "PASSIVE" ? PASSIVE_ACCENT : undefined}
            />
            <div
              style={{
                fontSize: 11,
                fontWeight: "bold",
                color: row.slot === "EX" ? ACCENT : row.slot === "PASSIVE" ? PASSIVE_ACCENT : TEXT_DIM,
              }}
            >
              {slotLabel(row.slot)}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: "bold" }}>{row.name}</span>
              {/* the SIXTH slot: 被動/主動 + the fact it was never learned */}
              {row.slot === "PASSIVE" && (
                <span style={{ fontSize: 11, color: PASSIVE_ACCENT }}>
                  {innateKindLabel(row.innateKind ?? "passive")} · {innateCastNote(row.innateKind ?? "passive")}
                </span>
              )}
              {row.maxRank > 1 && (
                <span style={{ fontSize: 11, color: TEXT_DIM }}>
                  等級 {row.rank}/{row.maxRank}
                </span>
              )}
              {!row.learned && <span style={{ fontSize: 11, color: TEXT_DIM }}>尚未學習</span>}
            </div>
            {row.description && (
              <>
                {/* 說明數值最終化: cooldown literals rescaled to the live combat-env final */}
                <div style={{ fontSize: 12, color: "#c3cbdd", marginTop: 3, lineHeight: 1.55 }}>
                  {rescaleAbilityProse(row.description, env)}
                </div>
                <div style={{ fontSize: 9.5, color: "#8b93a6", marginTop: 2 }}>{WC3_PROSE_CAPTION}</div>
              </>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
              {row.castLabel && <span>施法：{row.castLabel}</span>}
              {row.cooldownSec !== undefined && <span>冷卻：{displayFinalText(row.cooldownSec, "cooldown", { env })}s</span>}
              {row.manaCost !== undefined && <span>魔力：{row.manaCost}</span>}
              {row.cooldownLeftSec > 0 && (
                <span style={{ color: "#ffbcbc" }}>剩餘冷卻 {Math.ceil(row.cooldownLeftSec)}s</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
