/**
 * StoreScreen — champions + skins from /store/catalog with prices and
 * owned/equipped badges, buy flow (confirm dialog; 402/409 surfaced), equip
 * buttons, and a live Babylon 3D preview of the selected skin's model.
 */
import { useMemo, useState } from "react";
import { useApp } from "./store";
import { deriveStoreRows, type SkinRow } from "./catalog";
import { StorePreviewCanvas } from "./StorePreviewCanvas";
import { Btn, Panel, Badge, MCoin, ACCENT, OK, DANGER } from "./widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../theme";

function PurchaseDialog(): React.JSX.Element | null {
  const purchase = useApp((s) => s.purchase);
  const confirm = useApp((s) => s.purchaseConfirm);
  const cancel = useApp((s) => s.purchaseCancel);
  const wallet = useApp((s) => s.wallet);
  if (purchase.phase === "idle") return null;

  return (
    <div
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
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Buy {purchase.item.name}?</div>
            <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 14 }}>
              Price <MCoin amount={purchase.item.price} /> · balance{" "}
              <MCoin amount={wallet?.mcoin ?? 0} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <Btn kind="primary" onClick={() => void confirm()}>
                Confirm purchase
              </Btn>
              <Btn onClick={cancel}>Cancel</Btn>
            </div>
          </>
        )}
        {purchase.phase === "busy" && <div style={{ fontSize: 14, color: TEXT_DIM }}>Purchasing…</div>}
        {purchase.phase === "done" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: OK, marginBottom: 8 }}>
              {purchase.item.name} unlocked!
            </div>
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 12 }}>
              {purchase.item.kind === "skin" ? "auto-equipped · " : ""}new balance{" "}
              <MCoin amount={purchase.wallet.mcoin} />
            </div>
            <Btn kind="primary" onClick={cancel}>
              Nice
            </Btn>
          </>
        )}
        {purchase.phase === "error" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f08c8c", marginBottom: 8 }}>
              {purchase.message}
            </div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 12 }}>({purchase.code})</div>
            <Btn onClick={cancel}>Close</Btn>
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

  const rows = useMemo(
    () => (catalog ? deriveStoreRows(catalog, skinDocs) : []),
    [catalog, skinDocs],
  );
  const allSkins = useMemo(() => rows.flatMap((r) => r.skins), [rows]);
  const shown = selected ?? allSkins[0] ?? null;

  return (
    <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
      {/* catalog list */}
      <Panel title="Store" style={{ flex: 1.3, minWidth: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
          {rows.length === 0 && (
            <div style={{ fontSize: 12, color: TEXT_DIM }}>
              Store catalog unavailable — is the platform running with CONTENT_DIR mounted?
            </div>
          )}
          {rows.map((champ) => (
            <div key={champ.id} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_MAIN, textTransform: "capitalize" }}>
                  {champ.id}
                </span>
                {champ.owned ? (
                  <Badge color={OK}>owned</Badge>
                ) : (
                  <>
                    <MCoin amount={champ.price} size={12} />
                    <Btn
                      small
                      kind="primary"
                      onClick={() =>
                        purchaseBegin({ kind: "champion", id: champ.id, name: champ.id, price: champ.price })
                      }
                    >
                      Buy
                    </Btn>
                  </>
                )}
              </div>
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
                    {sk.equipped && <Badge color={GOLD}>equipped</Badge>}
                    {sk.owned && !sk.equipped && <Badge color={OK}>owned</Badge>}
                    {!sk.owned && <MCoin amount={sk.price} size={12} />}
                    {!sk.owned && (
                      <Btn
                        small
                        kind="primary"
                        onClick={() => purchaseBegin({ kind: "skin", id: sk.id, name: sk.name, price: sk.price })}
                      >
                        Buy
                      </Btn>
                    )}
                    {sk.owned && !sk.equipped && (
                      <Btn small onClick={() => void equip(sk.championId, sk.id)}>
                        Equip
                      </Btn>
                    )}
                    {sk.owned && sk.equipped && (
                      <Btn small title="unequip (back to default look)" onClick={() => void equip(sk.championId, null)}>
                        Unequip
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #2c3448", paddingTop: 8, fontSize: 11, color: TEXT_DIM }}>
          earn M COIN by finishing platform matches (placement rewards) · balance{" "}
          <MCoin amount={wallet?.mcoin ?? 0} size={11} />
        </div>
      </Panel>

      {/* 3D preview */}
      <Panel title={shown ? `Preview · ${shown.name}` : "Preview"} style={{ flex: 1, minWidth: 320 }}>
        <StorePreviewCanvas modelKey={shown?.modelKey ?? null} />
        {shown && (
          <div style={{ marginTop: 8, fontSize: 11, color: TEXT_DIM }}>
            {shown.modelKey} · drag to orbit · for <span style={{ color: TEXT_MAIN }}>{shown.championId}</span>
          </div>
        )}
      </Panel>
      <PurchaseDialog />
    </div>
  );
}
