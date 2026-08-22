import { z } from "zod";
import { zId } from "../common";

/**
 * config.model-lod@1 —— 「哪一個畫質等級去抓哪一階模型檔」的對照表
 * (`config/model-lod.json`, task #115)。
 *
 * 為什麼是內容而不是程式裡的 switch:這張表是**平衡/體感決策**,不是事實。
 * 目前量到的變體覆蓋率是 83/167(49.7%),`-small` 平均省掉一半以上的面數與
 * 位元組;但「中畫質到底該吃 mid 還是 small」要看真機發燙與畫面能接受到哪裡,
 * owner 會想改。寫死的話改一格 = 一次 client rebuild + 重新部署;放在
 * `content/` 就是存檔即生效(content/ 是 live bind-mount)。
 *
 *   · `enabled`     總開關。false = 一律載原檔,等於 #115 之前的行為。
 *                   線上如果發現某一階的檔壞了,這一格是止血閥。
 *   · `presetTiers` 四個 preset 各自對到 high/mid/small。
 *
 * ⚠️ `auto` 預設留在 `high` 是**刻意**的,不是漏填:自適應階梯每幾秒就會換一
 * 級,而換模型階 = 丟掉 AssetContainer 再發一次網路請求。讓它跟著階梯跑,就會
 * 在最撐不住的那台機器上、打到一半、反覆下載模型。改這一格之前先讀
 * `apps/client/src/render/modelLod.ts` 的檔頭。
 *
 * 缺的階自動退回:要 small 但只生了 mid → 給 mid;兩個都沒有 → 給原檔。所以
 * 這張表**不可能**因為某個模型沒有變體而 404(`resolveLodPath` 在守)。
 */
export const zModelLodTier = z.enum(["high", "mid", "small"]);

export const zConfigModelLodDoc = z
  .object({
    id: zId,
    schema: z.literal("config.model-lod@1"),
    note: z.string().optional(),
    /** 總開關。false = 每個 preset 都載原檔。 */
    enabled: z.boolean(),
    /** 畫質 preset -> 要抓的模型階。四個都必填,不允許靜默漏掉一個。 */
    presetTiers: z
      .object({
        low: zModelLodTier,
        medium: zModelLodTier,
        high: zModelLodTier,
        auto: zModelLodTier,
      })
      .strict(),
  })
  .strict();
export type ModelLodTierName = z.infer<typeof zModelLodTier>;
export type ConfigModelLodDoc = z.infer<typeof zConfigModelLodDoc>;

/**
 * 出貨預設 —— `content/config/model-lod.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyModelLodPolicy` 回退到的就是這一份,而它必須等於 #115 落地當下的行為:
 * low→small、medium→mid、high/auto→high。
 *
 * ⚠️ 每一格都要和 `content/config/model-lod.json` 一字不差 ——
 * `packages/shared/src/content/modelLodConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 */
export const DEFAULT_MODEL_LOD: ConfigModelLodDoc = {
  id: "model-lod",
  schema: "config.model-lod@1",
  enabled: true,
  presetTiers: { low: "small", medium: "mid", high: "high", auto: "high" },
};
