/**
 * Champ-select meta chrome (task #118) — the small pieces the ChampSelectPanel
 * roster renders when the platform wallet is reachable:
 *
 *   • <CrystalBadge> — the player's 水晶 balance, shown in the roster header.
 *   • <ChampMetaOverlay> — per-card controls: a 喜愛置頂 favourite star (any
 *     champion) and, for a LOCKED (priced, not-owned) champion, a
 *     「解鎖 (N 水晶)」button that spends crystals to unlock it.
 *
 * All of it is gated on `meta.available`, so when the platform is unreachable
 * the panel renders nothing extra and the existing champ-select is untouched.
 */
import { SfxButton } from "../../SfxButton";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../../theme";
import { CRYSTAL_EARN_HINT, CRYSTAL_UNLOCK_COST, canAfford, lockStateOf, type WalletMetaHook } from "./walletMeta";

/** The 水晶 balance chip for the roster header. */
export function CrystalBadge({ crystal }: { crystal: number }): React.JSX.Element {
  return (
    <span
      title="水晶 — 每場對戰免費獲得，可用來解鎖英雄"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: "bold",
        color: TEXT_MAIN,
        background: "rgba(120, 200, 255, 0.12)",
        border: "1px solid rgba(120, 200, 255, 0.45)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ color: "#8fd4ff" }}>💎</span>
      {crystal.toLocaleString()}
      <span style={{ color: TEXT_DIM, fontWeight: "normal" }}>水晶</span>
    </span>
  );
}

/**
 * Per-card overlay: the favourite star (absolutely positioned over the card's
 * top-right) plus, when the champion is locked, an in-flow unlock button below
 * the card. Renders nothing when the wallet is unavailable.
 */
export function ChampMetaOverlay({
  meta,
  championId,
}: {
  meta: WalletMetaHook;
  championId: string;
}): React.JSX.Element | null {
  if (!meta.available) return null;

  const lock = lockStateOf(championId, meta.prices, meta.owned);
  const favourited = meta.favourites.has(championId);
  const busy = meta.busyId === championId;
  const affordable = canAfford(meta.crystal);

  return (
    <>
      {/* favourite star — floats over the card corner, works for any champion */}
      <SfxButton
        pressScale={1}
        disabled={busy}
        onClick={() => meta.toggleFavourite(championId)}
        title={favourited ? "取消喜愛置頂" : "喜愛置頂（置於最上方）"}
        aria-label={favourited ? "unfavourite champion" : "favourite champion"}
        aria-pressed={favourited}
        style={{
          position: "absolute",
          top: 3,
          right: 3,
          width: 26,
          height: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          borderRadius: 6,
          fontSize: 15,
          lineHeight: 1,
          cursor: busy ? "default" : "pointer",
          color: favourited ? GOLD : TEXT_DIM,
          background: "rgba(10, 14, 22, 0.72)",
          border: favourited ? `1px solid ${GOLD}` : "1px solid #2c3448",
        }}
      >
        {favourited ? "★" : "☆"}
      </SfxButton>

      {/* unlock button — only for a priced, not-owned champion.
          When the player can't afford it the button stays CLICKABLE (dim, not
          disabled): tapping it surfaces the 藍水晶 earn hint (task #213) rather
          than doing nothing. Only an in-flight mutation truly disables it. */}
      {lock === "locked" && (
        <SfxButton
          pressScale={1}
          disabled={busy}
          onClick={() => meta.unlock(championId)}
          aria-label={
            affordable
              ? `解鎖英雄，需要 ${CRYSTAL_UNLOCK_COST} 水晶`
              : `水晶不足，無法解鎖。${CRYSTAL_EARN_HINT}`
          }
          title={
            affordable
              ? `解鎖此英雄需要 ${CRYSTAL_UNLOCK_COST} 水晶`
              : `水晶不足 — 解鎖需要 ${CRYSTAL_UNLOCK_COST} 水晶。${CRYSTAL_EARN_HINT}`
          }
          style={{
            width: "100%",
            minHeight: 30,
            padding: "5px 8px",
            borderRadius: 8,
            boxSizing: "border-box",
            fontSize: 12,
            fontWeight: "bold",
            cursor: busy ? "default" : "pointer",
            color: affordable ? TEXT_MAIN : TEXT_DIM,
            background: affordable ? "rgba(120, 200, 255, 0.14)" : "rgba(40, 48, 66, 0.6)",
            border: affordable ? "1px solid rgba(120, 200, 255, 0.55)" : "1px solid #2c3448",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "解鎖中…" : `🔓 解鎖 (${CRYSTAL_UNLOCK_COST} 水晶)`}
        </SfxButton>
      )}
    </>
  );
}
