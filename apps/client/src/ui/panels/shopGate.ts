/**
 * shopGate — the HUD's mirror of the server's shop rule, plus the Chinese the
 * player actually reads.
 *
 * THE SERVER IS THE AUTHORITY. `packages/shared/src/sim/economy/shopAccess.ts`
 * is consulted by CommandSystem on the authoritative world, so a hand-rolled
 * buy command sent during combat by a living champion is rejected regardless of
 * what any client believed. This module exists so the UI does not have to
 * PRETEND to be open and then eat a rejection: it disables the button with a
 * reason up front. It imports the shared rule rather than restating it — the
 * two can only ever agree.
 *
 * The three states, per the arena design:
 *   intermission (prep) → open to everyone
 *   combat / resolution → open ONLY to a champion already down this round, so
 *                         dying is a head start on the next round rather than
 *                         dead time. Living players get 「戰鬥中無法使用商店」.
 *   anything else       → closed (champ select / match end)
 *
 * ⚠️ #289 — 這份鏡像**曾經在這裡說謊**：上面那一格原本寫「anything else →
 * closed (champ select / RESOLUTION / match end)」，而 owner 2026-08-06 的裁決
 * （「只要我回合被打倒就可以到商店購買，但是被復活就又不行」）早就把 resolution
 * 併進 combat 那一條規則了。判斷式本身沒漏（它呼叫共用的 `shopOpen`），漏的是
 * **標籤**：那一行手抄了一份相位名單。所以下面刻意不再列舉相位名 —— 名單會
 * 過期，推導不會。
 *
 * Pure + node-testable: no React, no DOM.
 */
import { shopOpen, shopPhaseOf, type ShopAccess, type ShopDenyReason } from "@ggd/shared/sim/economy/shopAccess";

/** What the HUD needs to render the shop button and card. */
export interface ShopGateView {
  /** may the player buy/sell right now? */
  readonly open: boolean;
  /**
   * Should the shop SURFACE exist at all this phase? The card and its re-open
   * button are mounted while this is true; when it flips false the panel
   * force-closes. During combat this is true only for the defeated player, so
   * the shop cannot linger over a live duel.
   */
  readonly mounted: boolean;
  /** short label for the re-open button */
  readonly label: string;
  /** why the button is disabled, ready to show — empty when open */
  readonly reason: string;
}

/** Chinese for each server-side denial reason (the string the player sees). */
export const SHOP_DENY_TEXT: Record<ShopDenyReason, string> = {
  "combat-alive": "戰鬥中無法使用商店",
  "phase-closed": "現在不是備戰時間",
  "team-eliminated": "你的隊伍已經出局 — 這場比賽結束了",
  "no-champion": "尚未選擇英雄",
};

export const SHOP_OPEN_LABEL = "商店";
/** the defeated-player case reads differently: it is a consolation, not a phase */
export const SHOP_DOWNED_LABEL = "商店（陣亡中）";

/**
 * Resolve the shop's UI state from the two things the HUD store already
 * publishes: the match phase and whether the local champion is alive.
 */
export function shopGate(
  phase: string,
  alive: boolean,
  hasChampion = true,
  eliminated = false,
): ShopGateView {
  if (!hasChampion) {
    return { open: false, mounted: false, label: SHOP_OPEN_LABEL, reason: SHOP_DENY_TEXT["no-champion"] };
  }
  const shopPhase = shopPhaseOf(phase);
  const access: ShopAccess = shopOpen(shopPhase, alive, eliminated);
  if (access.open) {
    // 「陣亡中」的判準不是**哪一個相位**，而是**為什麼它開著**：拿同一條規則再問
    // 一次「這個相位，活著的人買得到嗎？」—— 買不到而我買得到，就只可能是因為我
    // 倒下了。
    // ⚠️ 這一行原本是 `shopPhase === "combat"`，一份手抄的相位名單；2026-08-06
    // 規則把 `resolution` 併進來之後它沒跟上，於是**結算時陣亡的玩家拿到的是普通
    // 的「商店」標籤**（#289）—— 而 #208「只剩一隊存活就立即宣佈回合勝利」讓那
    // 正好是最常見的一刻。推導版以後多一格相位會自動跟上。
    const downedOnly = !shopOpen(shopPhase, true, eliminated).open;
    return {
      open: true,
      mounted: true,
      label: downedOnly ? SHOP_DOWNED_LABEL : SHOP_OPEN_LABEL,
      reason: "",
    };
  }
  return {
    open: false,
    // 沒有任何一種拒絕會掛出商店表面。combat／resolution 的活人**連按鈕都不該看到**
    // （「戰鬥的時候商店不會出現」）：面板在相位翻頁時 force-close，也沒有一顆按鈕
    // 在那裡誘惑人。（prep 對所有人都開，所以這條路徑根本走不到 prep。）
    mounted: false,
    label: SHOP_OPEN_LABEL,
    reason: SHOP_DENY_TEXT[access.reason],
  };
}

/**
 * Can the shop SURFACE exist in this phase for ANYBODY? The COARSE, render-level
 * gate: `HudRoot` needs it before it knows who the local player is, and the fine
 * gate ({@link shopGate}) then returns `mounted: false` for the seats that must
 * not see it.
 *
 * ⚠️ 這個函式存在的理由就是 #289 的另一半。`HudRoot` 原本自己寫
 * `phase === "intermission" || phase === "combat"` —— **第三份**手抄的相位名單，
 * 而且是決定 `<MerchantShop />` 掛不掛的那一份。所以 2026-08-06 之後，即使
 * `shopGate` 說結算時陣亡者的商店該掛，元件根本沒有被 render，玩家什麼都拿不到
 * （CLAUDE.md 失敗形態 ②：算出來了但從沒送到畫面上）。
 * 判準只有一個且推導自共用規則：**不是 `closed` 的相位，商店就可能存在。**
 */
export function shopPhaseActive(phase: string): boolean {
  return shopPhaseOf(phase) !== "closed";
}

/**
 * Should the shop AUTO-OPEN right now? True exactly on the transition INTO a
 * prep window (LoL-Arena behaviour: the shop is the phase, so it presents
 * itself). Once auto-opened the player may close it and re-open at will — this
 * only fires on the edge, never on a re-render.
 */
export function shouldAutoOpen(prevPhase: string | null, phase: string): boolean {
  return phase === "intermission" && prevPhase !== "intermission";
}
