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
import { ChampionIdList, useChampionLabelIndex } from "./ChampionIdList";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, getWhitelist, putOverlayDoc } from "../api";
import {
  CRYSTAL_FIELD_BOUNDS,
  RANDOM_PICK_OWNERSHIP_OPTIONS,
  SANE_UNLOCK_COST,
  SHIPPED_CRYSTAL_REWARDS,
  SHIPPED_FREE_CHAMPION_IDS,
  SHIPPED_RANDOM_PICK_OWNERSHIP,
  SHIPPED_UNLOCK_COST,
  STORE_COLLECTION,
  STORE_DOC_ID,
  crystalFieldValue,
  crystalPayoutPreview,
  economySummary,
  extractStore,
  freeListText,
  parseFreeChampionIds,
  parseUnlockCost,
  storeDocFor,
  validateCrystalRewards,
  withCrystalField,
  type CrystalField,
  type CrystalRewards,
  type RandomPickOwnership,
  type StoreEconomy,
} from "../storeEconomy";

/** 表單上的排列順序 —— 基礎值四格在前，三顆倍率旋鈕在後。 */
const CRYSTAL_FIELD_ORDER: readonly CrystalField[] = [
  "place1",
  "place2",
  "place3",
  "place4",
  "minHumans",
  "offset",
  "maxMultiplier",
];

/** 每一格的說明寫「**它影響什麼**」，⛔ 不是複述欄位名。 */
const CRYSTAL_FIELD_HELP: Record<CrystalField, string> = {
  place1: "吃雞（第一名）在只有自己一個真人時實拿多少水晶。其餘名次照同一個倍率放大。",
  place2: "第二名的基礎值。第一名與最後一名的差距就是「名次值不值得拼」。",
  place3: "第三名的基礎值。",
  place4: "最後一名的基礎值 —— 調到 0 就等於「輸了不給」，一直輸的家人會完全賺不到水晶。",
  minHumans: "要幾個真人在場才開始給倍率。出貨 2 = owner 的「兩真人」；設成 1 會讓自己打 bot 也吃倍率。",
  offset: "倍率 = 真人數 + 這個數。出貨 1 = owner 的「(N+1) 倍」。設 0 就是「幾個人幾倍」。",
  maxMultiplier: "倍率的天花板。出貨 13 = 滿場 12 人的 (12+1)，所以實際上不會夾到；調小就會提早封頂。",
};

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function StoreEconomyPage(): JSX.Element {
  const [loaded, setLoaded] = useState<StoreEconomy | null>(null);
  const [costText, setCostText] = useState("");
  const [freeText, setFreeText] = useState("");
  const [randomPick, setRandomPick] = useState<RandomPickOwnership>(SHIPPED_RANDOM_PICK_OWNERSHIP);
  const [crystal, setCrystal] = useState<CrystalRewards>(SHIPPED_CRYSTAL_REWARDS);
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
          setRandomPick(economy.randomPickOwnership);
          setCrystal(economy.crystalRewards);
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

  // ⭐ GH#497：id 旁邊要有名字，變身態要標註（owner 2026-08-21「不然看不出來是誰」）。
  const labels = useChampionLabelIndex(free.ids);

  const crystalErrs = useMemo(() => validateCrystalRewards(crystal), [crystal]);
  const crystalOK = Object.keys(crystalErrs).length === 0;

  const preview: StoreEconomy | null =
    loaded && cost.ok && crystalOK
      ? {
          championUnlockCost: cost.value,
          freeChampionIds: free.ids,
          randomPickOwnership: randomPick,
          crystalRewards: crystal,
          mcoinRewards: loaded.mcoinRewards,
        }
      : null;

  const dirty =
    loaded !== null &&
    (costText.trim() !== String(loaded.championUnlockCost) ||
      free.ids.join("\n") !== freeListText(loaded.freeChampionIds) ||
      randomPick !== loaded.randomPickOwnership ||
      JSON.stringify(crystal) !== JSON.stringify(loaded.crystalRewards));

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
    setRandomPick(SHIPPED_RANDOM_PICK_OWNERSHIP);
    setCrystal(SHIPPED_CRYSTAL_REWARDS);
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
        ⚠️ 這一頁<b style={{ color: GOLD }}>只有解鎖價、免費名單與藍水晶獎勵是即時生效的</b>
        （這三樣平台都是每一次請求／每一場結算現讀）。存檔會連同 <code>mcoinRewards</code>
        （吃雞的 M幣）一起寫回去（不寫會讓那張表消失），但
        <b style={{ color: GOLD }}>結算發 M幣 讀的仍然是開機時載入的出貨值</b>，
        要改 M幣 名次獎勵得<b style={{ color: GOLD }}>重啟 platform</b>（或重新部署）才會生效。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>
        {preview
          ? economySummary(preview, roster?.length ?? null)
          : loaded
            ? "有欄位不合法 —— 下面標紅的地方修好才會重新計算"
            : "讀取中…"}
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

      {/* owner 2026-08-02「隨機選角的時候，只能隨機到自己有解鎖的角色」的決策欄位。
          放在解鎖價下面因為它問的是同一件事：沒付錢的英雄能不能到手。 */}
      <div
        style={{
          padding: "9px 10px",
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 4,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: TEXT_MAIN, minWidth: 130 }}>🎲 讀不到擁有權時</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>randomPickOwnership</code>
          <select
            aria-label="隨機選角在讀不到擁有權時的行為"
            data-field="randomPickOwnership"
            value={randomPick}
            onChange={(e) => setRandomPick(e.target.value as RandomPickOwnership)}
            style={{
              padding: "4px 6px",
              background: "transparent",
              color: TEXT_MAIN,
              border: `1px solid ${PANEL_BORDER}`,
              borderRadius: 3,
            }}
          >
            {RANDOM_PICK_OWNERSHIP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} style={{ color: "#000" }}>
                {o.label}
              </option>
            ))}
          </select>
          <span style={{ color: TEXT_DIM, fontSize: 11 }}>
            出貨值 {RANDOM_PICK_OWNERSHIP_OPTIONS.find((o) => o.value === SHIPPED_RANDOM_PICK_OWNERSHIP)?.label}
          </span>
        </div>
        <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "8px 0 0" }}>
          {RANDOM_PICK_OWNERSHIP_OPTIONS.find((o) => o.value === randomPick)?.help}
        </p>
        <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "6px 0 0" }}>
          ⚠️ 這一欄<b style={{ color: TEXT_MAIN }}>只在平台讀不到玩家錢包時</b>起作用。
          讀得到的時候，🎲 一律只抽該帳號已解鎖的英雄，跟這裡選什麼無關。
        </p>
      </div>

      {/* owner 2026-08-17：「只要有兩真人(N≥2)參加，不論哪個陣營都可以，所有玩家都
          (N+1) 倍，所以最大 13 倍」。放在解鎖價後面因為它是同一個經濟的另一半：
          上面決定英雄要多少水晶，這裡決定水晶多快進得來。 */}
      <div
        style={{
          padding: "9px 10px",
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 4,
          fontSize: 13,
          marginBottom: 12,
        }}
      >
        <div style={{ color: TEXT_MAIN, marginBottom: 4 }}>
          💎 多人比賽水晶獎勵 <code style={{ color: TEXT_DIM, fontSize: 11 }}>crystalRewards</code>
        </div>
        <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 8px" }}>
          場上<b style={{ color: TEXT_MAIN }}>只要有兩個以上真人</b>（
          <b style={{ color: ACCENT }}>不分陣營</b>，敵對兩隊也算），全場所有人的水晶都乘上
          <b style={{ color: TEXT_MAIN }}>（人數 + 倍率加成）</b>，夾在倍率上限。
          一個人打 bot 拿的就是下面的基礎值，<b style={{ color: OK }}>跟今天完全一樣</b>。
          沙發客（同一台機器的 2~4 號玩家）<b style={{ color: TEXT_MAIN }}>算人頭</b>把倍率推高，
          但他們沒有帳號，所以領不到自己那一份。
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CRYSTAL_FIELD_ORDER.map((f) => {
            const bad = crystalErrs[f];
            return (
              <label
                key={f}
                title={CRYSTAL_FIELD_HELP[f]}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
              >
                <span style={{ color: TEXT_MAIN }}>{CRYSTAL_FIELD_BOUNDS[f].label}</span>
                <input
                  aria-label={`${CRYSTAL_FIELD_BOUNDS[f].label}（${CRYSTAL_FIELD_HELP[f]}）`}
                  data-field={`crystalRewards.${f}`}
                  inputMode="numeric"
                  value={String(crystalFieldValue(crystal, f))}
                  onChange={(e) =>
                    setCrystal((c) => withCrystalField(c, f, Number(e.target.value.trim())))
                  }
                  style={{
                    width: 78,
                    padding: "4px 6px",
                    background: "transparent",
                    color: bad ? DANGER : TEXT_MAIN,
                    border: `1px solid ${bad ? DANGER : PANEL_BORDER}`,
                    borderRadius: 3,
                    textAlign: "right",
                  }}
                />
                <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                  {CRYSTAL_FIELD_BOUNDS[f].min}–{CRYSTAL_FIELD_BOUNDS[f].max.toLocaleString()}
                </span>
              </label>
            );
          })}
        </div>

        {Object.entries(crystalErrs).map(([f, msg]) => (
          <div key={f} style={{ color: DANGER, fontSize: 12, marginTop: 6 }}>
            {msg}
          </div>
        ))}

        {/* 唯讀推導列 —— 讓操作者不用心算。算式來自 shared 的 crystalMultiplier，
            跟平台結算走的是同一條規則，所以它不可能跟實際發下去的數字說不一樣的話。 */}
        <p style={{ color: crystalOK ? OK : TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "8px 0 0" }}>
          {crystalOK ? crystalPayoutPreview(crystal, [1, 2, 12]) : "數值超出範圍，先修正上面標紅的欄位。"}
        </p>
        <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "4px 0 0" }}>
          <b style={{ color: OK }}>存檔後下一場結算就生效</b>，不用重啟、玩家也不用重整
          —— 平台是在每一場結算現讀這份覆寫。
        </p>
      </div>

      <div style={{ marginBottom: 6 }}>
        <span style={{ color: TEXT_MAIN, fontSize: 13 }}>免費名單</span>{" "}
        <code style={{ color: TEXT_DIM, fontSize: 11 }}>freeChampionIds</code>{" "}
        <span style={{ color: TEXT_DIM, fontSize: 11 }}>
          一行一個英雄 id（也吃逗號／空白分隔）。目前 {free.ids.length} 位。
          下面會翻成英雄名稱並標出 <b style={{ color: ACCENT }}>[變身態 ← 本體 id]</b>
          —— 十幾組本體／變身態的名字逐字相同，只看名字分不出來。
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
      {/*
        ⭐ GH#497 —— owner 2026-08-21「英雄ID以外還要有英雄名稱 不然看不出來是誰，
        變身態的話也要註明」。⚠️ 免費名單特別需要形態標註：把一個**變身態**放進免費
        名單是一句沒有效果的話（那張卡不能選、商店也不賣），而它的名字常常與本體逐字
        相同，所以只印名字看起來完全正確。
      */}
      <ChampionIdList
        ids={free.ids}
        state={labels}
        emptyText="免費名單是空的 —— 每一位英雄都要付統一價。"
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
        <Btn
          kind="primary"
          disabled={busy || !dirty || !cost.ok || !crystalOK}
          onClick={() => void save()}
        >
          儲存 Save
        </Btn>
        <Btn onClick={resetToShipped} disabled={busy}>
          回到出貨值
        </Btn>
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>
          {!cost.ok
            ? "價格不合法，無法儲存"
            : !crystalOK
              ? "水晶獎勵有欄位超出範圍，無法儲存"
              : "整份文件一起寫入（含 M幣 名次獎勵，但那一段要重啟才生效）"}
        </span>
      </div>
    </Panel>
  );
}
