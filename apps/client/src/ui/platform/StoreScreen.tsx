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
import { useMemo, useState } from "react";
import { useApp } from "./store";
import { deriveStoreRows, type SkinRow } from "./catalog";
import { championDisplayFor } from "./championDisplay";
import { balanceOf, shortfallHint, CRYSTAL_EARN_HINT, CURRENCY_LABEL } from "./currency";
import { useContentReady } from "./ContentGate";
import { StorePreviewCanvas } from "./StorePreviewCanvas";
import { Btn, Panel, Badge, Crystal, MCoin, Price, ACCENT, OK, DANGER } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

function PurchaseDialog(): React.JSX.Element | null {
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
              <Btn onClick={cancel}>取消</Btn>
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
            <Btn kind="primary" onClick={cancel}>
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
            <Btn onClick={cancel}>關閉</Btn>
          </>
        )}
      </Panel>
    </div>
  );
}

export function StoreScreen(): React.JSX.Element {
  const catalog = useApp((s) => s.catalog);
  const skinDocs = useApp((s) => s.skinDocs);
  const wallet = useApp((s) => s.wallet);
  const purchaseBegin = useApp((s) => s.purchaseBegin);
  const equip = useApp((s) => s.equip);
  const [selected, setSelected] = useState<SkinRow | null>(null);
  // RULE (see header): the champion registry is EMPTY while the shell paints.
  // This dependency is what makes the names appear instead of the ids.
  const contentReady = useContentReady();

  const rows = useMemo(
    () => (catalog ? deriveStoreRows(catalog, skinDocs, championDisplayFor) : []),
    [catalog, skinDocs, contentReady],
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

  return (
    <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
      {/* catalog list */}
      <Panel title="商店" style={{ flex: 1.3, minWidth: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
          {rows.length === 0 && (
            <div style={{ fontSize: 12, color: TEXT_DIM }}>商店目前無法載入 · 請稍後再試</div>
          )}
          {rows.map((champ) => (
            <div key={champ.id} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
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
                    <Btn
                      small
                      kind="primary"
                      disabled={balanceOf(wallet, champ.currency) < champ.price}
                      title={
                        balanceOf(wallet, champ.currency) < champ.price
                          ? shortfallHint(champ.currency)
                          : `解鎖 ${champ.name}`
                      }
                      onClick={() =>
                        purchaseBegin({
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
                const isShown = shown?.id === sk.id;
                return (
                  <div
                    key={sk.id}
                    onClick={() => setSelected(sk)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      marginBottom: 4,
                      borderRadius: 8,
                      cursor: "pointer",
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
                    </div>
                    {sk.equipped && <Badge color={GOLD}>已裝備</Badge>}
                    {sk.owned && !sk.equipped && <Badge color={OK}>已擁有</Badge>}
                    {/* 造型 stay on M幣 — verified against the platform's
                        Buy(KindSkin), which really does debit MCoin. */}
                    {!sk.owned && <Price currency={sk.currency} amount={sk.price} size={12} />}
                    {!sk.owned && (
                      <Btn
                        small
                        kind="primary"
                        disabled={balanceOf(wallet, sk.currency) < sk.price}
                        title={
                          balanceOf(wallet, sk.currency) < sk.price ? shortfallHint(sk.currency) : `購買 ${sk.name}`
                        }
                        onClick={() =>
                          purchaseBegin({
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
                      <Btn small onClick={() => void equip(sk.championId, sk.id)}>
                        裝備
                      </Btn>
                    )}
                    {sk.owned && sk.equipped && (
                      <Btn small title="卸下後恢復原本外觀" onClick={() => void equip(sk.championId, null)}>
                        卸下
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Both wallets, because this screen now spends BOTH: 英雄=藍水晶,
            造型=M幣. Showing only M幣 (as it used to) hid the very balance a
            champion unlock is paid from. */}
        <div style={{ borderTop: "1px solid #2c3448", paddingTop: 8, fontSize: 11, color: TEXT_DIM }}>
          英雄用 <Crystal amount={wallet?.crystal ?? 0} size={11} /> 解鎖 · 造型用{" "}
          <MCoin amount={wallet?.mcoin ?? 0} size={11} /> 購買
          <div style={{ marginTop: 2 }}>{CRYSTAL_EARN_HINT}</div>
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
        />
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
            拖曳可旋轉檢視
          </div>
        )}
      </Panel>
      <PurchaseDialog />
    </div>
  );
}
