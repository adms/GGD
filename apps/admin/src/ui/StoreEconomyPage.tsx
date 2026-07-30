/**
 * 商店經濟 — 英雄解鎖的統一價 + 免費名單 (`config/store.json`).
 *
 * owner, 2026-07-30:「所有英雄藍水晶都是統一價，新上架預設也是一樣價格」，免費
 * 名單維持現在那 12 位，「他隨時可以清空變成完全統一」。
 *
 * ⚠️ 這一頁補的是一個**完全不存在的入口**。在它之前，`config/store.json` 是
 * 唯一沒有任何後台頁面的 config 文件：改英雄解鎖價要編 content、rebuild 映像、
 * 重啟容器，而且 Go (`wallet.CrystalUnlockCost`) 與 client
 * (`CRYSTAL_UNLOCK_COST`) 各自還寫死一份 300。那兩個常數現在都降級成 fallback。
 *
 * ⚠️⚠️ **這一頁第一版是 write-only 的（#241）。** 它存進覆蓋層
 * (`data/content-overlay/overlay.json`)，而 Go 的 `wallet.LoadCatalog` 開機時
 * 讀的是 `content/config/store.json` —— 兩條管線從來沒有交會。存 111 會回
 *「✓ 已寫入」，重整還看得到 111（這一頁讀值時覆蓋層優先），玩家那邊照收 900。
 * 修法是讓 `wallet` 在**每一次請求**去讀覆蓋層那一份
 * (`apps/platform/internal/wallet/economy.go`)。
 *
 * 所以這一頁上面寫的每一句「生效」都必須跟 Go 那邊對得起來：**解鎖價與免費名單
 * 是即時的，`mcoinRewards` 不是**（結算發 M幣 讀的是 gamelink 開機時拿到的
 * catalog 副本）。
 *
 * All logic is in `../storeEconomy`, which is where the tests live. This is the
 * view.
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, getWhitelist, putOverlayDoc } from "../api";
import {
  SANE_UNLOCK_COST,
  SHIPPED_FREE_CHAMPION_IDS,
  SHIPPED_UNLOCK_COST,
  STORE_COLLECTION,
  STORE_DOC_ID,
  economySummary,
  extractStore,
  freeListText,
  parseFreeChampionIds,
  parseUnlockCost,
  storeDocFor,
  type StoreEconomy,
} from "../storeEconomy";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function StoreEconomyPage(): JSX.Element {
  const [loaded, setLoaded] = useState<StoreEconomy | null>(null);
  const [costText, setCostText] = useState("");
  const [freeText, setFreeText] = useState("");
  const [roster, setRoster] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST — the overlay is what the platform actually loads.
        const overlaid = (await getOverlayDoc(STORE_COLLECTION, STORE_DOC_ID)) as unknown;
        let full: unknown = overlaid ?? null;
        if (!full) {
          const shipped = await getShippedDoc(STORE_COLLECTION, STORE_DOC_ID);
          if (shipped.present && shipped.doc) full = shipped.doc;
        }
        const economy = extractStore(full);
        if (economy) {
          setLoaded(economy);
          setCostText(String(economy.championUnlockCost));
          setFreeText(freeListText(economy.freeChampionIds));
        }
      } catch (err) {
        setApiErr(errText(err));
      }
      try {
        // The whitelist is the set of champions this deploy actually offers —
        // the only list against which "is this free id a typo?" is answerable.
        // A failure here is NOT fatal: the page still saves, it just cannot
        // flag typos, and `parseFreeChampionIds` is written so an empty set
        // means "unknown", not "everything is wrong".
        const wl = await getWhitelist();
        setRoster(wl.champions ?? []);
      } catch {
        setRoster(null);
      }
    })();
  }, []);

  const known = useMemo(() => new Set(roster ?? []), [roster]);
  const cost = useMemo(() => parseUnlockCost(costText), [costText]);
  const free = useMemo(() => parseFreeChampionIds(freeText, known), [freeText, known]);

  const preview: StoreEconomy | null =
    loaded && cost.ok
      ? { championUnlockCost: cost.value, freeChampionIds: free.ids, mcoinRewards: loaded.mcoinRewards }
      : null;

  const dirty =
    loaded !== null &&
    (costText.trim() !== String(loaded.championUnlockCost) ||
      free.ids.join("\n") !== freeListText(loaded.freeChampionIds));

  const save = async (): Promise<void> => {
    if (!preview) return;
    setBusy(true);
    setApiErr(null);
    try {
      // ⚠️ storeDocFor writes the WHOLE doc, mcoinRewards included. A partial
      // write would leave an overlay store doc without the required reward
      // table — see ../storeEconomy.
      const head = await putOverlayDoc(STORE_COLLECTION, STORE_DOC_ID, storeDocFor(preview));
      setLoaded(preview);
      setFreeText(freeListText(preview.freeChampionIds));
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const resetToShipped = (): void => {
    setCostText(String(SHIPPED_UNLOCK_COST));
    setFreeText(freeListText(SHIPPED_FREE_CHAMPION_IDS));
    setFlash(null);
  };

  return (
    <Panel title="商店經濟">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        英雄解鎖的<b style={{ color: TEXT_MAIN }}>統一價</b>與
        <b style={{ color: GOLD }}>免費名單</b>。出貨值是
        <b style={{ color: GOLD }}>300 藍水晶 · 12 位免費</b>。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        <b style={{ color: ACCENT }}>不在免費名單上的英雄，一律是統一價</b>
        —— 包含之後才上架的新英雄。這一點就是這個形狀存在的理由：以前是一位英雄
        一行價格，<b style={{ color: TEXT_MAIN }}>漏一行就等於免費送出去</b>。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        設定寫進耐久覆蓋層，<b style={{ color: OK }}>撐得過重新部署</b>，而且
        <b style={{ color: OK }}>存檔就生效</b> —— 不用重啟 platform，玩家也不用重整。
        平台是在<b style={{ color: TEXT_MAIN }}>每一次請求</b>把這份覆寫疊在出貨值上，
        價格跟著 <code>GET /wallet</code> 一起送到畫面上。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        <b style={{ color: OK }}>已經解鎖過的玩家不受影響。</b>
        所有權存在帳號自己的 <code>ownedChampions</code>，跟價格無關；改價只會影響
        <b style={{ color: TEXT_MAIN }}>還沒解鎖的人下一次要付多少</b>。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ 這一頁<b style={{ color: GOLD }}>只有解鎖價與免費名單是即時生效的</b>。
        存檔會連同 <code>mcoinRewards</code>（吃雞的 M幣）一起寫回去（不寫會讓那張表消失），
        但<b style={{ color: GOLD }}>結算發 M幣 讀的仍然是開機時載入的出貨值</b>，
        要改名次獎勵目前還是得重新部署。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>
        {preview ? economySummary(preview, roster?.length ?? null) : "讀取中…"}
      </div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 10px",
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 4,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <span style={{ color: TEXT_MAIN, minWidth: 130 }}>統一解鎖價</span>
        <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>championUnlockCost</code>
        <input
          aria-label="統一解鎖價（藍水晶）"
          data-field="championUnlockCost"
          value={costText}
          inputMode="numeric"
          onChange={(e) => setCostText(e.target.value)}
          style={{
            width: 110,
            padding: "4px 6px",
            background: "transparent",
            color: cost.ok ? TEXT_MAIN : DANGER,
            border: `1px solid ${cost.ok ? PANEL_BORDER : DANGER}`,
            borderRadius: 3,
            textAlign: "right",
          }}
        />
        <span style={{ color: TEXT_DIM, fontSize: 11 }}>藍水晶 · 出貨值 {SHIPPED_UNLOCK_COST}</span>
      </div>

      {!cost.ok && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{cost.error}</div>}
      {cost.ok && cost.value > SANE_UNLOCK_COST && (
        <div style={{ color: GOLD, fontSize: 13, marginBottom: 10 }}>
          ⚠️ {cost.value} 高於新帳號的見面禮（{SANE_UNLOCK_COST} 藍水晶）——
          新玩家一開始<b>一位英雄都解不開</b>，只能靠免費名單開打。
        </div>
      )}

      <div style={{ marginBottom: 6 }}>
        <span style={{ color: TEXT_MAIN, fontSize: 13 }}>免費名單</span>{" "}
        <code style={{ color: TEXT_DIM, fontSize: 11 }}>freeChampionIds</code>{" "}
        <span style={{ color: TEXT_DIM, fontSize: 11 }}>
          一行一個英雄 id（也吃逗號／空白分隔）。目前 {free.ids.length} 位。
        </span>
      </div>
      <textarea
        aria-label="免費英雄名單"
        data-field="freeChampionIds"
        value={freeText}
        rows={14}
        onChange={(e) => setFreeText(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "6px 8px",
          background: "transparent",
          color: TEXT_MAIN,
          border: `1px solid ${free.unknown.length > 0 ? GOLD : PANEL_BORDER}`,
          borderRadius: 3,
          fontFamily: "monospace",
          fontSize: 12,
        }}
      />

      {free.unknown.length > 0 && (
        <div style={{ color: GOLD, fontSize: 13, marginTop: 8 }}>
          ⚠️ 這些 id 不在目前的開放名單裡：<code>{free.unknown.join("、")}</code>。
          打錯字的話，它<b>不會讓任何人免費</b>，而你本來想放行的那位英雄會
          <b>照樣收 {cost.ok ? cost.value : SHIPPED_UNLOCK_COST} 水晶</b> —— 兩邊都不會有錯誤訊息。
        </div>
      )}
      {free.duplicates.length > 0 && (
        <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 6 }}>
          重複的 id 已自動合併：<code>{free.duplicates.join("、")}</code>
        </div>
      )}
      {free.ids.length === 0 && (
        <div style={{ color: GOLD, fontSize: 13, marginTop: 8 }}>
          ⚠️ 免費名單是空的 —— 新帳號<b>一位英雄都沒有</b>。這是合法設定（完全統一價），
          但要確認見面禮的藍水晶至少夠解一位，否則新玩家第一次登入沒有角色可打。
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <Btn kind="primary" disabled={busy || !dirty || !cost.ok} onClick={() => void save()}>
          儲存 Save
        </Btn>
        <Btn onClick={resetToShipped} disabled={busy}>
          回到出貨值
        </Btn>
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>
          {cost.ok
            ? "整份文件一起寫入（含 M幣 名次獎勵，但那一段要重啟才生效）"
            : "價格不合法，無法儲存"}
        </span>
      </div>
    </Panel>
  );
}
