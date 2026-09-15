import { useEffect, useRef, useState } from "react";
import { MODEL_VERSION_PREFIX, sortModelVersions, type ChampionModelVersion } from "@ggd/shared/content/schema/championModelVersions";
import { SKIN_PRICE_MAX, skinOnSale, type SkinDoc } from "@ggd/shared/content/schema/skin";
import { modelShopApi, type ModelShopApi } from "../contentApi";
import { Btn } from "./widgets";
import { DANGER, OK, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

/**
 * 🛒 GH#1177 模型版本商店 —— owner 2026-09-10（逐字）：「**商店也要能選擇是否上架這個模型被選擇可讓玩家購買動態替換**」。
 *
 * ⭐ 商品沿用 skin@1（⛔ 不做第二套商店）：每個模型版本一列「上架為造型／售價／下架」，
 * 寫 `content/skins/skin.<英雄>.<版本雜湊前 16 碼>.json`（`modelKey` ＝ 那個版本的 `version.body.*`）。
 * 購買、擁有、裝備、進場換模全部走既有的造型那條路（wallet.go Buy/Equip → client buildSkinOverrides）。
 *
 * ⛔ 售價是 owner 的旋鈕：輸入框**沒有預設值**，不填不能上架（出貨內容一件都不預先上架）。
 * ⭐ 下架＝寫 `listed:false`，⛔ 不刪檔（已購玩家的 ownedSkins 仍然指著這個 id，照樣保留）。
 *
 * ⚠️ 寫入走本機 content-api（`ENABLED` 部署閘）⇒ 正式 build 關著時整段收起，只留一句怎麼上架。
 */

export function modelShopSkinId(championId: string, modelKey: string): string {
  return `skin.${championId}.${modelKey.slice(MODEL_VERSION_PREFIX.length, MODEL_VERSION_PREFIX.length + 16)}`;
}

/** 空字串／非整數／超界 ⇒ null（按鈕停用），⛔ 不幫 owner 補數字。上界住 skin.ts（與 Zod 同一個常數）。 */
export function parseSkinPrice(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n <= SKIN_PRICE_MAX ? n : null;
}

/**
 * ⛔ 這個版本為什麼**不能**上架／改價（null＝可以）。判準全部從資料推導，⛔ 不寫死 id：
 *   ① 它就是英雄目前的 `modelKey` ⇒ `apps/client/src/ui/platform/catalog.ts` buildSkinOverrides 遇到
 *      `skin.modelKey === baseKey` 直接跳過 ⇒ 玩家花錢買到一樣的外觀。
 *   ② 同一位英雄已經有**另一份**造型用這個模型（或這個版本的來源模型）⇒ 兩件外觀相同的商品。
 */
export function modelShopBlockReason(
  championId: string, version: Pick<ChampionModelVersion, "modelKey" | "sourceModelKey">, activeModelKey: string, skins: readonly SkinDoc[],
): string | null {
  if (version.modelKey === activeModelKey) return "這個版本是英雄目前啟用中的模型 ⇒ 玩家買了畫面不會變，⛔ 不能上架";
  const ownId = modelShopSkinId(championId, version.modelKey);
  const twin = skins.find((s) => s.id !== ownId && (s.modelKey === version.modelKey || s.modelKey === version.sourceModelKey));
  if (!twin) return null;
  const via = twin.modelKey === version.modelKey ? "同一個模型" : `這個版本的來源模型 ${twin.modelKey}`;
  return `已經有造型 ${twin.id}（${twin.name}）用${via} ⇒ 會變成兩件外觀相同的商品，⛔ 不能上架`;
}

/** 上架／改價／下架之後，玩家看得到之前**一定要走完**的三步（content-api 寫入會刪 bundle.json）。 */
export const MODEL_SHOP_SHIP_STEPS = "① pnpm content:build ② commit（content/skins ＋ bundle／索引產物）③ 完整部署（平台開機時才讀 content/skins）";
/** fieldAdoption 的 `field:skins.listed` 豁免只在「全站沒有任何下架的造型」時成立。 */
export const MODEL_SHOP_FIRST_DELIST = "全站第一次下架時，commit 前要刪掉 packages/shared/src/content/fieldAdoption.exemptions.json 的 field:skins.listed 那一列（否則 fieldAdoption.test.ts「no exemption is STALE」會紅）";

const inputStyle = { background: "#10141f", color: TEXT_MAIN, border: "1px solid #465064", borderRadius: 6, padding: 6 } as const;

export function ChampionModelVersionShop(props: {
  championId: string; activeModelKey: string; versions: readonly ChampionModelVersion[]; disabled: boolean; api?: ModelShopApi;
}): React.JSX.Element {
  const api = props.api ?? modelShopApi;
  const { championId } = props;
  const [docs, setDocs] = useState<SkinDoc[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);
  const alive = useRef(false);
  useEffect(() => {
    let current = true;
    alive.current = true;
    if (api.enabled) void api.listSkins(championId).then((result) => {
      if (!current) return;
      setDocs(result.docs); setError(result.error);
    });
    return () => { current = false; alive.current = false; };
  }, [api, championId, reloads]);

  if (!api.enabled) {
    return <div data-field="model-shop-off" style={{ color: TEXT_DIM, fontSize: 12 }}>
      商店上架（模型版本 → 造型）：正式站不能直接上架 —— 在本機後台上架 → pnpm content:build → commit → 完整部署
    </div>;
  }

  const save = async (doc: SkinDoc, done: string) => {
    setBusy(true); setError(null); setNotice("");
    const result = await api.saveSkin(doc);
    if (!alive.current) return;
    setBusy(false);
    if (!result.ok) { setError(result.error ?? result.issues.map((i) => `${i.path}: ${i.message}`).join("；")); return; }
    const delisted = doc.listed === false ? `；⚠️ ${MODEL_SHOP_FIRST_DELIST}` : "";
    setNotice(`${done}（${doc.id}）。⚠️ 玩家要看得到還差三步：${MODEL_SHOP_SHIP_STEPS}${delisted}`);
    setReloads((n) => n + 1);
  };

  return <details open={docs.length > 0}>
    <summary>商店上架（模型版本 → 造型，M幣購買）</summary>
    <div style={{ display: "grid", gap: 8, paddingTop: 8 }}>
      {sortModelVersions(props.versions).map((version) => {
        const key = version.modelKey;
        const id = modelShopSkinId(championId, key);
        const existing = docs.find((doc) => doc.id === id);
        const blocked = modelShopBlockReason(championId, version, props.activeModelKey, docs);
        const priceText = prices[key] ?? (existing ? String(existing.mcoinPrice) : "");
        const name = (names[key] ?? existing?.name ?? version.label).trim();
        const price = parseSkinPrice(priceText);
        const onSale = existing !== undefined && skinOnSale(existing);
        const status = !existing ? "unlisted" : onSale ? "listed" : "delisted";
        const locked = props.disabled || busy;
        return <div key={key} data-field="model-shop-row" data-model-key={key} data-status={status} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ minWidth: 160 }}>{version.label}</span>
          <span style={{ fontSize: 12, color: status === "listed" ? OK : status === "delisted" ? WARN : TEXT_DIM }}>
            {status === "listed" ? `已上架 · ${existing!.mcoinPrice} M幣` : status === "delisted" ? "已下架（已購玩家保留）" : "未上架"}
          </span>
          <input aria-label={`商品名稱 · ${version.label}`} data-field={`model-shop-name:${key}`} maxLength={80} style={inputStyle} disabled={locked || blocked !== null} value={names[key] ?? existing?.name ?? version.label} onChange={(e) => setNames({ ...names, [key]: e.target.value })} />
          <input aria-label={`售價（M幣）· ${version.label}`} data-field={`model-shop-price:${key}`} type="number" min={0} max={SKIN_PRICE_MAX} step={1} placeholder="售價（必填）" style={{ ...inputStyle, width: 110 }} disabled={locked || blocked !== null} value={priceText} onChange={(e) => setPrices({ ...prices, [key]: e.target.value })} />
          <Btn small dataField={`model-shop-list:${key}`} disabled={locked || blocked !== null || price === null || !name} onClick={() => {
            const next: SkinDoc = { ...existing, id, schema: "skin@1", championId, name, mcoinPrice: price!, modelKey: key };
            delete next.listed; // 缺席＝上架（只有下架的文件帶這一格）
            void save(next, existing ? (onSale ? "已更新售價" : "已重新上架") : "已上架為造型");
          }}>{!existing ? "上架為造型" : onSale ? "更新售價" : "重新上架"}</Btn>
          {onSale && <Btn small kind="danger" dataField={`model-shop-delist:${key}`} disabled={locked} onClick={() => void save({ ...existing!, listed: false }, "已下架")}>下架</Btn>}
          {blocked && <span data-field={`model-shop-block:${key}`} style={{ fontSize: 12, color: WARN, flexBasis: "100%" }}>{blocked}</span>}
        </div>;
      })}
      <div style={{ color: TEXT_DIM, fontSize: 12 }}>
        售價由你決定（0＝免費，上限 {SKIN_PRICE_MAX.toLocaleString()}）；下架不刪檔，已購玩家保留。其他玩家看不看得到你換的模型：⛔ 目前只有自己看得到（與既有造型相同）。<br />
        ⚠️ 上架／改價／下架都只寫進本機 content/skins，玩家要看得到：{MODEL_SHOP_SHIP_STEPS}。<br />
        ⚠️ 下架：{MODEL_SHOP_FIRST_DELIST}。
      </div>
      {error && <div role="alert" style={{ color: DANGER }}>{error}</div>}
      {notice && <div role="status">{notice}</div>}
    </div>
  </details>;
}
