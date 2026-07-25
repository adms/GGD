/**
 * currency — WHICH wallet pays for WHAT, in one place (task #227).
 *
 * ---------------------------------------------------------------------------
 * THE OWNER'S RULE (#118, re-confirmed 2026-07-26 from a live screenshot)
 * ---------------------------------------------------------------------------
 *   英雄解鎖 = 藍水晶 (crystal, 🔷) — earned by PLAYING, the free progression
 *              currency. 300 per champion (content/config/store.json).
 *   造型/skin = M幣 (mcoin, Ⓜ)      — an admin-GRANTED cosmetic currency that
 *              is deliberately never sold and barely ever minted (1 per 吃雞).
 *
 * The lobby store had these swapped for champions: it printed 「Ⓜ 300」 and
 * POSTed to the M COIN endpoint, so the store charged M幣 for the exact thing
 * champ-select charges crystals for — a player holding ◆200 / Ⓜ0 saw a price
 * in a currency they can only receive as a gift. Both halves are fixed (this
 * module + `Buy(KindChampion)` on the platform, which now delegates to the
 * crystal unlock), so there is no currency-swapped path left to fall into.
 *
 * These two constants are the single source of that mapping. Rows, price
 * glyphs, affordability checks and the confirm dialog all read them instead of
 * each hardcoding a widget — which is how the price glyph and the endpoint
 * drifted apart in the first place.
 */

/** The two player wallets. Nothing in the store may invent a third. */
export type StoreCurrency = "crystal" | "mcoin";

/** 英雄解鎖 = 藍水晶. Mirrors the platform's `UnlockChampion` (crystal) path. */
export const CHAMPION_CURRENCY: StoreCurrency = "crystal";

/** 造型 = M幣. Mirrors the platform's `Buy(KindSkin)` (M COIN) path. */
export const SKIN_CURRENCY: StoreCurrency = "mcoin";

/** Player-facing name of each wallet, for prose (the glyphs live in widgets). */
export const CURRENCY_LABEL: Record<StoreCurrency, string> = {
  crystal: "藍水晶",
  mcoin: "M幣",
};

/**
 * The hint shown when a player cannot afford a champion — it tells them HOW to
 * earn 藍水晶 instead of a dead end (task #213).
 *
 * Every clause is TRUE against the server's crystal model (internal/wallet/meta.go):
 *   • 「打場就能賺藍水晶」 — crystals are granted per match; the ONLY earn path is
 *     match settlement (there is deliberately no client-side earn route).
 *   • 「戰鬥結束後發放」 — the grant runs on the settlement callback, after the
 *     match ends (CrystalRewardFor, applied in gamelink/callback.go).
 *   • 「第一名翻倍」 — 1st place (吃雞) is doubled: CrystalPlace1 = 120 ×
 *     CrystalWinMultiplier(2) = 240, versus 90 / 70 / 60 for 2nd–4th.
 *
 * It lives HERE rather than in champ-select's walletMeta (its original home)
 * because the lobby store now shows it too, and purchase.ts is a pure module
 * that must not pull a React hook module into its import graph. walletMeta
 * re-exports it, so the champ-select callers are unchanged.
 */
export const CRYSTAL_EARN_HINT = "打場就能賺藍水晶，戰鬥結束後發放，第一名翻倍";

/**
 * Why an M幣 shortfall has no "go earn some" advice: by #118 M幣 is granted by
 * an admin (and 1 per 吃雞), never purchased. Telling a player to grind for it
 * would be a lie, so the message says what is actually true instead.
 */
export const MCOIN_GRANT_NOTE = "M幣由管理員發放，無法購買";

/** The one sentence shown when a player cannot afford something, per wallet. */
export function shortfallHint(currency: StoreCurrency): string {
  return currency === "crystal"
    ? `${CURRENCY_LABEL.crystal}不足。${CRYSTAL_EARN_HINT}`
    : `${CURRENCY_LABEL.mcoin}不足。${MCOIN_GRANT_NOTE}`;
}

/** The balance a purchase in `currency` is actually paid from. */
export function balanceOf(
  wallet: { mcoin?: number; crystal?: number } | null | undefined,
  currency: StoreCurrency,
): number {
  if (!wallet) return 0;
  return (currency === "crystal" ? wallet.crystal : wallet.mcoin) ?? 0;
}
