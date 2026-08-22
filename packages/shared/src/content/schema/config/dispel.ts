import { z } from "zod";
import { zId } from "../common";

export const zConfigDispelDoc = z
  .object({
    id: zId,
    schema: z.literal("config.dispel@1"),
    note: z.string().optional(),
    /**
     * 止血閥。false = `dispel` 這個 effect kind 整條不作用。
     *
     * ⚠️ 它**只**關掉淨化。復活與回合重置走的是 `clearForFreshBody`，
     * 那兩條不受它影響 —— 它們不是淨化，是重置。
     */
    enabled: z.boolean(),
    /**
     * 沒標 `dispellable` 的 **status** 算不算可拔。出貨 **true**。
     *
     * 14 份 status 文件今天一格都沒標，所以這一格實際上就是「【淨化】拔不拔得到
     * 減速/纏繞/暈眩」。填 false = 上線當天什麼都拔不到，而那看起來跟功能壞掉
     * 一模一樣。
     */
    statusDefaultDispellable: z.boolean(),
    /**
     * 沒標 `dispellable` 的 **DoT** 算不算可拔。出貨 **true**。
     *
     * 單獨一格而不是跟 status 共用，因為 `world.dot` 在 A4 之前**完全沒有
     * 任何移除路徑** —— 把它打開是一次真的能力增加，值得有自己的閥。
     */
    dotDefaultDispellable: z.boolean(),
    /**
     * 沒標 `dispellable` 的 **ModifierSource**（道具被動／增益卡／靈氣投影）
     * 算不算可拔。出貨 **false**。
     *
     * ⛔ 出貨關著的理由：**沒有人預期自己買的裝備效果可以被敵人剝掉**。
     * 打開它會讓「敵方淨化」變成一個能拆對手裝備的機制 —— 那是一個設計決定，
     * 不是一個預設值。
     */
    buffDefaultDispellable: z.boolean(),
    /** 文件沒寫 `pools` 時，預設清不清 status。出貨 true。 */
    defaultPoolStatus: z.boolean(),
    /** 同上，dot。出貨 true。 */
    defaultPoolDot: z.boolean(),
    /**
     * 同上，護盾。出貨 **false** —— 淨化的語意是「拔狀態」，順手把護盾也吃掉
     * 會讓【破盾】(D1) 這件獨立道具失去存在理由。
     */
    defaultPoolShields: z.boolean(),
    /** 同上，buff。出貨 **false**，理由同 `buffDefaultDispellable`。 */
    defaultPoolBuffs: z.boolean(),
    /**
     * 一發淨化每一池最多拔幾層的**全域上限**：文件沒寫 `count` 時用它，
     * **寫了也夾不過它**（一句話管到底，避免出現兩個會分歧的上限）。
     *
     * 兩端都有界（#277）。⭐ 出貨 **50**＝實務上「全部」（owner 2026-08-18 定案
     * 「一律統一到 50 我覺得是可以的」），**上界 60**（同一則的追加：
     * 「上限改成 60, 後台可調」，GH#360）—— ⚠️ 出貨值與上界是兩件事，
     * 抬上界不改變任何一場比賽，只是讓後台那一格調得動。
     * ⚠️ **這個數字不是效能上限** —— 一個單位身上能帶幾個狀態沒有任何上限
     * （`applyStatus` 那一行就是 push），這一格只管「一發淨化拔幾個」。
     * ⛔ 這個上界也不是「26 種可淨化減益 + 邊際」——
     * `applyStatus` 的合併鍵是 status id + 來源，所以一波 30 隻殭屍各給一次
     * 減速就是 30 筆，**筆數沒有種類數的上限**。完整理由在
     * `packages/shared/src/sim/dispelRules.ts` 的 `DISPEL_MAX_COUNT_BOUNDS`。
     * ⚠️ 後台「淨化規則」那一頁的上界是**從這一行的 `.max` 走出來**的
     * （`configForms.ts::readSchema`），所以改這裡就等於改後台 —— 兩處要一起動的
     * 是 `DISPEL_MAX_COUNT_BOUNDS` 與 `dispel.count`，守衛在 `sim/dispelRules.test.ts`。
     */
    maxCountCap: z.number().int().min(1).max(60),
    /**
     * `count` 砍不完時**留下哪幾個**。
     *
     *   newest  先拔最晚掛上的（剛被暈到就解得掉 —— 玩家預期的那一種）
     *   oldest  先拔最早掛上的（優先清快過期的殘渣，實際上比較弱）
     */
    defaultOrder: z.enum(["newest", "oldest"]),
    /**
     * 殭屍身上的狀態吃不吃淨化。出貨 true。
     * 獨立一格的理由與 `tauntRules.appliesToMobs` 一模一樣：第 3 場之後場上
     * 大多數敵人就是殭屍，PvE 與 PvP 的答案不一定相同。
     */
    appliesToMobs: z.boolean(),
  })
  .strict();
