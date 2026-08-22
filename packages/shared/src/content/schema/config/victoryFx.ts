import { z } from "zod";
import { zId } from "../common";

/**
 * config.victory-fx@1 — 勝利煙火的開關 (#93 / #235).
 *
 * owner 2026-08-02 實戰回饋：「天空的火焰似乎沒有被移除，我懷疑是煙火的時間太長」
 * → 裁決「請你直接取消煙火(變成後台開關)」。**出貨值兩格都是關的。**
 *
 * ⚠️ 程式碼一行都沒有刪。「回合結束要不要放煙火」是一個決策點，不是一個 bug
 * （CLAUDE.md 第一守則）——owner 改主意時是後台打一個勾，不是再改一次程式碼
 * 加重新部署。GH#251 的 `arenaFire` 是同一個形狀，也是同一個理由。
 *
 * ⚠️ **兩格分開，不是一格。** 兩層是刻意不同的效果（`fireworkMath` 的檔頭寫著
 * 「deliberately NOT the same effect at two sizes」），而且成本與頻率差一個
 * 量級：回合小煙火一場放 3–5 次、峰值 +28 個 ParticleSystem、持續約 1.3 秒；
 * 全場結束的烤雞煙火一場放一次、峰值 +8 個 ParticleSystem 加一個自訂 shader 的
 * mesh、持續約 4.3 秒。用一格把兩者綁死，等於下次 owner 想「只留吃雞」時又要
 * 改一次程式。
 *
 * ⚠️ 這一份**不管畫面變灰／變暗**（`render/victoryPresentation` 的 wash）、
 * 也不管勝利的嘲弄語音（`config/victory-taunts.json`）。owner 要拿掉的是**煙火**，
 * 把結算畫面的底色和語音一起關掉會是一個沒有人要求的迴歸。
 */
export const zVictoryFireworkTier = z
  .object({
    /** 這一層煙火要不要放。false = 一個粒子系統都不會被建立。 */
    enabled: z.boolean(),
  })
  .strict();

export const zConfigVictoryFxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.victory-fx@1"),
    note: z.string().optional(),
    /** 每一回合贏的時候，天空那一輪小煙火（#235，約 1.3 秒）。 */
    roundVolley: zVictoryFireworkTier,
    /** 全場結束吃雞時，那隻全螢幕的烤雞煙火（#93，約 4.3 秒）。 */
    matchChicken: zVictoryFireworkTier,
  })
  .strict();
export type VictoryFireworkTier = z.infer<typeof zVictoryFireworkTier>;
export type ConfigVictoryFxDoc = z.infer<typeof zConfigVictoryFxDoc>;
/** 解析後的煙火政策 —— 兩層各自的開關。 */
export interface VictoryFxPolicy {
  roundVolley: VictoryFireworkTier;
  matchChicken: VictoryFireworkTier;
}

/**
 * 出貨預設 —— `content/config/victory-fx.json` 讀不到時（舊部署 / 內容掛掉 /
 * 後台把它清掉）`resolveVictoryFx` 回退到的就是這一份。
 *
 * **兩格都是 false**，因為那是 owner 2026-08-02 的原話：「請你直接取消煙火」。
 * 保險絲必須和出貨值同向 —— 如果回退值是開的，那麼「內容檔載不到」這條路
 * （也就是 2026-08-01 骨架事故的那條路）就會把 owner 明說要拿掉的東西又點回來，
 * 而且是在最沒有人看的那條路上。`DEFAULT_ARENA_FIRE` 為了同一個理由也是關的。
 *
 * ⚠️ 每一格都要和 `content/config/victory-fx.json` 一字不差 ——
 * `apps/client/src/vfx/victoryFxPolicy.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_VICTORY_FX: VictoryFxPolicy = {
  roundVolley: { enabled: false },
  matchChicken: { enabled: false },
};

/**
 * 讀出「這一場的兩層勝利煙火各自要不要放」。文件缺席時回退到
 * `DEFAULT_VICTORY_FX`（也是關的）。
 *
 * 放在 shared 而不是 client 的理由和 `resolveArenaFire` 同源：出貨值（JSON）、
 * 保險絲（上面那份）與讀取規則必須是**同一段**程式，否則「後台關了但畫面上還在
 * 放煙火」會是三份各自正確的程式加起來的結果。
 */
export function resolveVictoryFx(doc: ConfigVictoryFxDoc | null | undefined): VictoryFxPolicy {
  if (!doc) return DEFAULT_VICTORY_FX;
  return { roundVolley: doc.roundVolley, matchChicken: doc.matchChicken };
}
