/**
 * StoreScreen — champions + skins from /store/catalog with prices and
 * owned/equipped badges, buy flow (confirm dialog; 402/409 surfaced), equip
 * buttons, and a live Babylon 3D preview of the selected skin's model.
 *
 * ---------------------------------------------------------------------------
 * TASK #227 — THIS SCREEN PRINTED IDS AT PLAYERS
 * ---------------------------------------------------------------------------
 * 「Lobby Store 裡面的東西依然還是 ID 而不是玩家看得懂的名稱及描述」. The champion
 * heading was `{champ.id}` and the buy dialog was handed `name: champ.id`, so a
 * player shopping for 「聖杯黑泥醬 - 喪標麥可」 read `godie-zombiex` twice. Skins
 * were never affected — they had content docs behind them all along — which is
 * why this looked like a Store-wide bug but was only ever the champion half.
 *
 * The names now come from the content bundle through `deriveStoreRows`'s
 * injected `championDisplayFor`, and the id survives ONLY as that lookup's
 * fallback. Two rules hold this fix in place:
 *
 *   • SUBSCRIBE, DON'T SNAPSHOT — `useContentReady()` is in the rows memo's
 *     deps. The registry is empty while the shell paints, and a `[catalog]`-only
 *     memo would freeze an id-only roster (the ChampionMarquee bug).
 *   • NEVER RE-REACH FOR `champ.id` in the markup. It is still there as a React
 *     key and as the wire id in `purchaseBegin`, but no player-visible string
 *     may be built from it — championDisplay already degrades to the id.
 *
 * ---------------------------------------------------------------------------
 * TASK #227 (SECOND HALF) — IT ALSO CHARGED THE WRONG CURRENCY
 * ---------------------------------------------------------------------------
 * The champion rows printed 「Ⓜ 300」. Champions cost 300 藍水晶 (#118: crystals
 * are earned by playing and unlock champions; M幣 is an admin-granted cosmetic
 * currency that is never sold), so a player holding ◆200 / Ⓜ0 was quoted a
 * price in a currency they cannot obtain. Every leg now reads the ROW's
 * `currency` (see currency.ts): the price glyph, the affordability check, the
 * confirm dialog's price AND balance, and the receipt. The platform's
 * `Buy(KindChampion)` was fixed to spend crystals in the same change, so the
 * client is not papering over a server that still debits M幣.
 *
 * Chrome is Chinese, matching the rest of the lobby (LobbyScreen: 計分 / 選擇競技場
 * / 一鍵開打 / 內容圖鑑). These are hardcoded literals on purpose: the project has
 * no i18n layer and #19 owns introducing one — inventing a key/lookup system in
 * one screen would fork it.
 */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./store";
import { deriveStoreRows, storeRowsForWhitelist, type ChampionRow, type SkinRow } from "./catalog";
import type { PurchaseItem } from "./purchase";
import type { Wallet } from "./types";
import { useWhitelist } from "../panels/whitelist";
import { championDisplayFor } from "./championDisplay";
import {
  balanceOf,
  shortfallHint,
  CRYSTAL_EARN_HINT,
  CURRENCY_LABEL,
  MCOIN_GRANT_NOTE,
} from "./currency";
import { useContentReady } from "./ContentGate";
import { StorePreviewCanvas } from "./StorePreviewCanvas";
import { Btn, Panel, Badge, Crystal, MCoin, Price, ACCENT, OK, DANGER } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

/**
 * ⭐ EXPORTED FOR ITS GUARD (#511). `Btn` has an EXPLICIT prop list — it does not
 * `...rest` onto its `<button>` the way `SfxButton` does — so a caller writing
 * `data-pad-back` on a `<Btn>` is dropped silently and a source grep stays green
 * (the very 第一·五守則 shape). The only honest assertion is to render this
 * dialog in each of its four phases and read the attribute back off the markup,
 * and this package's vitest is `environment: "node"`, so it needs the component.
 */
export function PurchaseDialog(): React.JSX.Element | null {
  const purchase = useApp((s) => s.purchase);
  const confirm = useApp((s) => s.purchaseConfirm);
  const cancel = useApp((s) => s.purchaseCancel);
  const wallet = useApp((s) => s.wallet);
  if (purchase.phase === "idle") return null;
  // #227: the dialog quotes the item's OWN currency — 英雄=藍水晶, 造型=M幣.
  // Both the price and the balance below it must come from this one value, or
  // the dialog reports a balance from a wallet it is not spending.
  const currency = purchase.item.currency;

  return (
    <div
      // task #197 — the pad focus layer scopes to the purchase dialog so B / the
      // Cancel/Close button back out and A confirms, without focus escaping to
      // the store grid behind it.
      data-pad-scope="purchase"
      data-pad-scope-priority="45"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4,6,10,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
        pointerEvents: "auto",
      }}
    >
      <Panel style={{ width: 320, textAlign: "center" }}>
        {purchase.phase === "confirm" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              確定購買「{purchase.item.name}」？
            </div>
            <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 14 }}>
              價格 <Price currency={currency} amount={purchase.item.price} /> ·{" "}
              {CURRENCY_LABEL[currency]}餘額{" "}
              <Price currency={currency} amount={balanceOf(wallet, currency)} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <Btn kind="primary" onClick={() => void confirm()}>
                確認購買
              </Btn>
              {/* #511 — B 是**契約**，⛔ 不是 `backControlIndex` 的標籤掃描。
                  「取消」剛好被 BACK_ALLOW_RE 認得，但那是巧合：那條啟發式正是
                  #271（一按 B 就離場）的成因，而它認不認得一句中文完全取決於
                  文案。宣告了它，改文案就不會無聲弄死 B。 */}
              <Btn padBack onClick={cancel}>
                取消
              </Btn>
            </div>
          </>
        )}
        {purchase.phase === "busy" && <div style={{ fontSize: 14, color: TEXT_DIM }}>購買中…</div>}
        {purchase.phase === "done" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: OK, marginBottom: 8 }}>
              已解鎖「{purchase.item.name}」！
            </div>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 12 }}>
              {purchase.item.kind === "skin" ? "已自動裝備 · " : ""}目前{CURRENCY_LABEL[currency]}餘額{" "}
              <Price currency={currency} amount={balanceOf(purchase.wallet, currency)} />
            </div>
            {/* ⭐ #511 的逐點證據就是這一顆。買完之後對話框**只剩這一顆**，
                而「太好了」不含 取消/關閉/收起/返回/back/close/cancel/dismiss/✕
                裡的任何一個字 ⇒ `backControlIndex` 回 -1 ⇒ B 在這個對話框上是
                死鍵，玩家會以為卡住，得先撥方向鍵讓焦點落上去再按 A。 */}
            <Btn padBack kind="primary" onClick={cancel}>
              太好了
            </Btn>
          </>
        )}
        {purchase.phase === "error" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f08c8c", marginBottom: 8 }}>
              {purchase.message}
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12 }}>({purchase.code})</div>
            <Btn padBack onClick={cancel}>
              關閉
            </Btn>
          </>
        )}
      </Panel>
    </div>
  );
}

/**
 * The list pane's scroll box, exported because it is a CONTRACT, not styling.
 *
 * #522 — 「手把在商店只能一列一列爬」. The pad's scroll layer (#505/#506) finds a
 * pane by walking up from the focused control and asking `getComputedStyle`
 * whether `overflow-y` is auto/scroll/overlay and whether it actually overflows
 * (PadFocusNav `overflowsAlong`). So the right stick scrolls this list ONLY for
 * as long as this box keeps that overflow — swap it for `overflow: hidden` plus
 * a transform, or hoist the scrolling to `<body>`, and the pad silently goes
 * back to crawling a row at a time with nothing turning red. The guard reads
 * this object, so that swap fails loudly instead.
 */
export const STORE_LIST_SCROLL: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
  paddingRight: 4,
};

/**
 * ⭐ ONE CHAMPION'S SHELF — and the reason it is a component instead of inline
 * JSX: it is the unit both pad tickets are about, and it renders from PLAIN
 * PROPS, so a guard can render an unaffordable shelf without a live store.
 *
 * ── #516 買不起的整列對手把隱形 ──────────────────────────────────────────────
 * The skin row used to be a NAKED `<div onClick>`: the only focusable child was
 * its buy button, and M幣 is admin-granted (see currency.ts), so for almost
 * every player that button is `disabled`. #505 already removed
 * `:not([disabled])` from `FOCUSABLE_SELECTOR`, which fixed HALF of this — a
 * disabled button is now focusable-but-inert, so the row no longer vanishes and
 * the rows after it no longer shift. The other half is still broken without
 * this change: SELECTING a skin (i.e. previewing it) lives on the naked div's
 * `onClick`, so a pad player could land on the shelf and still never see the
 * model. The row itself is therefore a focusable node (`data-pad-focusable` +
 * tabIndex), and A / Enter / Space select it.
 *
 * The champion HEADING gets the same treatment for a different reason: an
 * already-owned champion renders no button at all, so an owned champion with no
 * skins was a shelf the focus ring could not land on anywhere.
 *
 * ── #517 買不起的原因只掛在 title tooltip ───────────────────────────────────
 * A pad has no hover, so `title={shortfallHint(...)}` was an explanation only a
 * mouse could read. The reason is now DRAWN: a compact 「…不足」 chip on every
 * unaffordable row (the wallet name comes from `CURRENCY_LABEL`, ⛔ not a
 * literal), and the full sentence expands on the row the player has actually
 * selected — 「聚焦時顯示」 as the ticket asks, without stamping the same
 * paragraph onto a hundred shelves.
 */
export function StoreChampionGroup(props: {
  champ: ChampionRow;
  wallet: Wallet | null;
  shownSkinId: string | null;
  onSelect: (sk: SkinRow) => void;
  onBuy: (item: PurchaseItem) => void;
  onEquip: (championId: string, skinId: string | null) => void;
}): React.JSX.Element {
  const { champ, wallet } = props;
  const champShort = balanceOf(wallet, champ.currency) < champ.price;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        data-pad-focusable=""
        tabIndex={0}
        aria-label={champ.title ? `${champ.fullName} ${champ.title}` : champ.fullName}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 4,
          outline: "none",
        }}
      >
        {/* #227: the NAME, never the id. `fullName`/`title` already fall
            back to the id when no content doc is registered. */}
        <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_MAIN }}>{champ.fullName}</span>
        {champ.title && (
          <span style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{champ.title}</span>
        )}
        <div style={{ flex: 1 }} />
        {champ.owned ? (
          <Badge color={OK}>已擁有</Badge>
        ) : (
          <>
            {/* #227: 英雄 = 藍水晶. The glyph comes from the row's own
                currency, so it can never disagree with what is spent. */}
            <Price currency={champ.currency} amount={champ.price} size={12} />
            {/* #517: the reason, DRAWN. The full 「怎麼賺」 sentence for 藍水晶 is
                permanently on screen in this pane's footer, so the chip only has
                to say WHICH wallet is short. */}
            {champShort && <Badge color={DANGER}>{CURRENCY_LABEL[champ.currency]}不足</Badge>}
            <Btn
              small
              kind="primary"
              disabled={champShort}
              title={champShort ? shortfallHint(champ.currency) : `解鎖 ${champ.name}`}
              onClick={() =>
                props.onBuy({
                  kind: "champion",
                  id: champ.id,
                  name: champ.name,
                  price: champ.price,
                  currency: champ.currency,
                })
              }
            >
              解鎖
            </Btn>
          </>
        )}
      </div>
      {/* graceful empty: 13 of 114 champion docs carry no description at
          all, so this must never render an empty box (skin-row pattern). */}
      {champ.blurb && (
        <div
          style={{
            fontSize: 11,
            color: TEXT_DIM,
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {champ.blurb}
        </div>
      )}
      {champ.skins.map((sk) => {
        const isShown = props.shownSkinId === sk.id;
        const short = !sk.owned && balanceOf(wallet, sk.currency) < sk.price;
        return (
          <div
            key={sk.id}
            // #516: the row IS the control — A/Enter/Space preview this skin,
            // whether or not its buy button is pressable.
            data-pad-focusable=""
            tabIndex={0}
            role="button"
            aria-label={sk.description ? `${sk.name} ${sk.description}` : sk.name}
            onClick={() => props.onSelect(sk)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              props.onSelect(sk);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              marginBottom: 4,
              borderRadius: 8,
              cursor: "pointer",
              outline: "none",
              background: isShown ? "rgba(80,100,160,0.25)" : "#141926",
              border: isShown ? `1px solid ${ACCENT}` : "1px solid #232b3d",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{sk.name}</div>
              {sk.description && (
                <div style={{ fontSize: 11, color: TEXT_DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sk.description}
                </div>
              )}
              {/* #517: the selected row spells the shortfall out in full — the
                  hover tooltip a pad player never gets. */}
              {short && isShown && (
                <div style={{ fontSize: 11, color: DANGER, marginTop: 2 }}>
                  {shortfallHint(sk.currency)}
                </div>
              )}
            </div>
            {sk.equipped && <Badge color={GOLD}>已裝備</Badge>}
            {sk.owned && !sk.equipped && <Badge color={OK}>已擁有</Badge>}
            {/* 造型 stay on M幣 — verified against the platform's
                Buy(KindSkin), which really does debit MCoin. */}
            {!sk.owned && <Price currency={sk.currency} amount={sk.price} size={12} />}
            {short && <Badge color={DANGER}>{CURRENCY_LABEL[sk.currency]}不足</Badge>}
            {!sk.owned && (
              <Btn
                small
                kind="primary"
                disabled={short}
                title={short ? shortfallHint(sk.currency) : `購買 ${sk.name}`}
                onClick={() =>
                  props.onBuy({
                    kind: "skin",
                    id: sk.id,
                    name: sk.name,
                    price: sk.price,
                    currency: sk.currency,
                  })
                }
              >
                購買
              </Btn>
            )}
            {sk.owned && !sk.equipped && (
              <Btn small onClick={() => void props.onEquip(sk.championId, sk.id)}>
                裝備
              </Btn>
            )}
            {sk.owned && sk.equipped && (
              <Btn small title="卸下後恢復原本外觀" onClick={() => void props.onEquip(sk.championId, null)}>
                卸下
              </Btn>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StoreScreen(): React.JSX.Element {
  const catalog = useApp((s) => s.catalog);
  const skinDocs = useApp((s) => s.skinDocs);
  const wallet = useApp((s) => s.wallet);
  const purchaseBegin = useApp((s) => s.purchaseBegin);
  const equip = useApp((s) => s.equip);
  const refreshFriends = useApp((s) => s.refreshFriends);
  const [selected, setSelected] = useState<SkinRow | null>(null);
  // `null` = NOBODY HAS TAKEN THE WHEEL. It is not the same as 0: the stage
  // idles on its own slow turntable, and handing it an angle is what stops
  // that. So an untouched slider must send nothing at all.
  const [yawDeg, setYawDeg] = useState<number | null>(null);
  // RULE (see header): the champion registry is EMPTY while the shell paints.
  // This dependency is what makes the names appear instead of the ids.
  const contentReady = useContentReady();

  // The catalog prices EVERY champion in the content tree (the per-hero price
  // map is gone — see catalog.ts `storeRowsForWhitelist`), so the store must
  // cull to what the operator actually enabled or it sells unpickable heroes.
  const { whitelist } = useWhitelist();
  const rows = useMemo(
    () =>
      catalog
        ? storeRowsForWhitelist(deriveStoreRows(catalog, skinDocs, championDisplayFor), whitelist)
        : [],
    [catalog, skinDocs, contentReady, whitelist],
  );
  const allSkins = useMemo(() => rows.flatMap((r) => r.skins), [rows]);
  const shown = selected ?? allSkins[0] ?? null;
  // The preview caption names the champion this skin belongs to. `named:false`
  // (content not loaded / unknown champion) yields "" so the caption drops the
  // clause entirely rather than falling back to printing the id at the player.
  const shownOwner = useMemo(() => {
    if (!shown) return "";
    const d = championDisplayFor(shown.championId);
    return d.named ? d.name : "";
  }, [shown, contentReady]);
  // A new model RE-FRAMES the camera (StorePreview.show resets alpha), so a
  // carried-over angle would describe the previous skin's pose. Hand the wheel
  // back at every change of subject.
  useEffect(() => setYawDeg(null), [shown?.id]);

  // ⭐ GH#537 ② —— owner 2026-08-22：「似乎是**讀取不夠快** 並且**沒有提前在商店
  // 完成讀取**的緣故」。這是那句話的第二半，⛔ 不是排序那一半（`friendOrder.ts`）。
  //
  // ⚠️ 在此之前好友清單只有**兩個**抓取點：登入時的那一趟 fan-out，以及
  // `FriendsPanel` 掛著時每 10 秒一次的輪詢。兩者之間有一個真的洞 ——
  // `store.ts::refreshFriends` 是**靜默 fail**（`catch { /* transient */ }`），
  // 所以登入那一趟只要掉一次，`friends` 就一直是 `null`，而**面板沒被掛起來的
  // 期間沒有任何人會再試一次**。逛商店正是那段期間。
  //
  // ⭐ 商店是正確的時機，跟 `GameApp.warmGroundForNextRound`（GH#536，同一則裁決
  // 的另一半）是同一個理由：**這時候沒有任何東西趕時間**，玩家在逛，而回大廳的
  // 那一刻清單必須已經在手上。⛔ 不是「回大廳時才開始抓」。
  //
  // ⚠️ 只在**進商店那一格**做（空 deps）⛔ 不是每次 re-render —— 逛商店時的即時
  // 上下線由 WS 推播疊在快照上（`FriendsPanel` 的 `presence[f.id] ?? f.state`），
  // 所以這裡不需要第二個輪詢，只需要讓快照存在。
  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  return (
    <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
      {/* catalog list */}
      <Panel title="商店" style={{ flex: 1.3, minWidth: 0, overflow: "hidden" }}>
        <div style={STORE_LIST_SCROLL}>
          {rows.length === 0 && (
            <div style={{ fontSize: 12, color: TEXT_DIM }}>商店目前無法載入 · 請稍後再試</div>
          )}
          {rows.map((champ) => (
            <StoreChampionGroup
              key={champ.id}
              champ={champ}
              wallet={wallet}
              shownSkinId={shown?.id ?? null}
              onSelect={setSelected}
              onBuy={purchaseBegin}
              onEquip={(championId, skinId) => void equip(championId, skinId)}
            />
          ))}
        </div>
        {/* Both wallets, because this screen now spends BOTH: 英雄=藍水晶,
            造型=M幣. Showing only M幣 (as it used to) hid the very balance a
            champion unlock is paid from. */}
        <div style={{ borderTop: "1px solid #2c3448", paddingTop: 8, fontSize: 11, color: TEXT_DIM }}>
          英雄用 <Crystal amount={wallet?.crystal ?? 0} size={11} /> 解鎖 · 造型用{" "}
          <MCoin amount={wallet?.mcoin ?? 0} size={11} /> 購買
          {/* #517: both wallets explain themselves HERE, permanently, because a
              pad has no hover to reveal `title`. 藍水晶 says how to earn it;
              M幣 says the true thing instead — that it cannot be earned. */}
          <div style={{ marginTop: 2 }}>{CRYSTAL_EARN_HINT}</div>
          <div style={{ marginTop: 2 }}>{MCOIN_GRANT_NOTE}</div>
        </div>
      </Panel>

      {/* 3D preview */}
      <Panel title={shown ? `預覽 · ${shown.name}` : "預覽"} style={{ flex: 1, minWidth: 320 }}>
        {/* #263: a skin belongs to a champion, and that champion may carry a
            w3x tint — the shop must show the same colour the arena will. No
            skin doc overrides `tint` today, so this matches the arena's own
            `championTintForId` resolve exactly. */}
        <StorePreviewCanvas
          modelKey={shown?.modelKey ?? null}
          championId={shown?.championId ?? null}
          {...(yawDeg === null ? {} : { yawDeg })}
        />
        {/* ⛔ 「拖曳可旋轉檢視」 WAS A LIE TO A PAD PLAYER (第一·五守則).
            Dragging is a MOUSE verb; the pad focus layer only moves focus and
            clicks, so on a pad that sentence described a gesture that does not
            exist. Rather than shrink the promise, the promise now has a second
            route: a real <input type=range>, which #505 taught the pad to step
            with left/right. Same control, three input devices. */}
        {shown && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              fontSize: 11,
              color: TEXT_DIM,
            }}
          >
            旋轉
            <input
              type="range"
              min={-180}
              max={180}
              step={5}
              value={yawDeg ?? 0}
              aria-label="旋轉檢視"
              onChange={(e) => setYawDeg(Number(e.currentTarget.value))}
              style={{ flex: 1, minWidth: 0 }}
            />
          </label>
        )}
        {/* #227: the caption used to print `modelKey` and `championId` — two
            developer strings — at the player. It says whose skin this is, by
            name, and how to look around. */}
        {shown && (
          <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM }}>
            {shownOwner ? (
              <>
                <span style={{ color: TEXT_MAIN }}>{shownOwner}</span> 的造型 ·{" "}
              </>
            ) : null}
            拖曳或用「旋轉」滑桿檢視
          </div>
        )}
      </Panel>
      <PurchaseDialog />
    </div>
  );
}
