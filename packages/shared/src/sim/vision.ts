/**
 * 👁 VISION —— 「這張地圖看得到多遠」是**一組規則**，⛔ 不是散在兩處的 if。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  owner 2026-08-23（逐字）
 * ═══════════════════════════════════════════════════════════════════════════
 * > 「理論上這個地圖是**全視野，就算牆後也看得到**，不然現在很奇怪，
 * >   看到 **bot 瘋狂隔牆打空氣敵人**，但**我卻看不到也打不到**」
 *
 * ⭐ 他描述的是一個**不對稱**，而它是量到的，⛔ 不是猜的 —— 三件事各自是對的，
 * 只有它們的組合造出那個畫面：
 *
 * | # | 在哪 | 做什麼 | 對誰 |
 * |---|---|---|---|
 * | ① | `sim/targeting.ts::isAutoTargetable` | **一格視線檢查都沒有**（只有隱形的 `canSee`） | bot 與玩家**同一支** |
 * | ② | `sim/systems/BasicAttackSystem.ts::seesTarget`（GH#324） | 牆擋**普攻** | bot 與玩家**同一支** |
 * | ③ | `apps/client/src/render/occlusionZone.ts`（GH#324） | 牆後的**敵人不畫** | ⭐ **只有玩家** |
 *
 * ⇒ bot 隔著牆索敵到人（①）→ 丟**技能**（`ProjectileSystem` 從來不呼叫 ②，
 * 那是 GH#324 的裁決「不擋技能」）→ 玩家看不到那個敵人（③）⇒ 畫面上就是
 * 「bot 對著空氣瘋狂丟招」。而玩家自己**看不到**（③）所以點不到，
 * **普攻也打不出去**（②）。⭐ 根因是 ②③ 兩個都有，⛔ 不是只有一個。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 隱形**不在這條規則裡** —— 兩者刻意分開
 * ═══════════════════════════════════════════════════════════════════════════
 * 「牆擋不擋視線」是**地圖規則**；「這個人有沒有隱身」是**技能機制**
 * （`sim/stealth.ts` 的 `canSee` + `config/stealth.json` 的三格）。
 * ⛔ 全視野打開**一格都不鬆**隱形：`isAutoTargetable` 的 `canSee` 那一行
 * 與這個檔案沒有任何交集，守衛 `sim/fullVision.test.ts` 把**兩個方向一起讀**
 * （牆後的拿得到 ✅ · 隱形的仍然拿不到 ✅）—— 只驗一邊的話，一個把 `canSee`
 * 也拿掉的實作會照樣全綠。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  決策點 ⇒ 欄位（第一守則），預設值＝ owner 說的那一邊（第〇·六守則）
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-08-23 的常設指令：「沒做完以前別問我了自己判斷 **但是留後台開關
 * 可以簡易 rollback**」。所以兩個決策各一格，出貨值就是 2026-08-23 那句話：
 *
 * | 欄位 | 出貨 | 關掉會回到 |
 * |---|---|---|
 * | `fullVision` | **true** | GH#324 的視野遮蔽（牆後的敵人不畫） |
 * | `wallBlocksBasicAttack` | **false** | GH#324 的普攻視線閘 |
 *
 * ⚠️ `wallBlocksBasicAttack` 出貨 `false` **推翻**了一句更早的 owner 原話
 * （2026-08-14「擋普攻 不然會風箏到死 但不擋技能」）。照第〇·六守則的階梯，
 * **新的贏**，而且理由不只是日期：那道閘的原始註解自己寫著
 * 「語意天然一致：**走出視線 ＝ 走出射程**」—— 它是**從視野模型推導出來的**。
 * owner 在 2026-08-23 換掉了視野模型（全視野），那個推導就不再成立。
 * ⭐ 而「風箏到死」那個顧慮沒有消失，它變成**一格可以翻回去的開關**。
 *
 * purity：⛔ 無 rng / 時鐘 / 三角函式 / `**`。
 */
import type { SimWorld } from "./SimWorld";

/** 一張地圖的視野規則。 */
export interface VisionRules {
  /**
   * ⭐ **全視野** —— 牆後也看得到（owner 2026-08-23）。
   * true = 客戶端**不做**任何視線遮蔽，每一個實體都畫。
   * false = 回到 GH#324：站在牆後的**敵人**不畫（隊友與自己永遠畫）。
   */
  fullVision: boolean;
  /**
   * 牆擋不擋**普攻**（GH#324）。false（出貨）= 不擋，牆後照打。
   * true = 回到 2026-08-14 的「走出視線 ＝ 走出射程」。
   * ⛔ 兩種值都不影響**技能** —— 技能從 GH#324 起就穿牆，那是裁決不是遺漏。
   */
  wallBlocksBasicAttack: boolean;
}

/**
 * 出貨值 —— 第一守則三個住處裡的「Zod `DEFAULT_*`」那一份的來源。
 * ⛔ `content/config/arena-rules.json` 的 `vision` 區塊要逐格對得上，
 * ⛔ 不可以有第四份手打的常數。
 */
export const DEFAULT_VISION_RULES: VisionRules = Object.freeze({
  fullVision: true,
  wallBlocksBasicAttack: false,
});

/**
 * 一份 `config.arena-rules@1` 文件的 `vision` 區塊 → 規則表。
 * 認不得 / 缺欄位 → **出貨值**（⛔ 不是關掉：空表等於 owner 抱怨的那個畫面回來）。
 *
 * ⚠️ 逐格 `typeof`，⛔ 不整份 Zod parse —— 與 `wallBlockFromDoc` 同一個理由：
 * arena-rules 是全 repo 最大的一份 config，整份 parse 會讓**任何一個別的區塊**
 * 的手滑把全視野整個關掉。
 */
export function visionRulesFromDoc(doc: unknown): VisionRules {
  const d = doc as { schema?: string; vision?: Record<string, unknown> } | undefined;
  if (d?.schema !== "config.arena-rules@1") return DEFAULT_VISION_RULES;
  const v = d.vision;
  if (v === undefined || v === null || typeof v !== "object") return DEFAULT_VISION_RULES;
  return Object.freeze({
    fullVision: typeof v.fullVision === "boolean" ? v.fullVision : DEFAULT_VISION_RULES.fullVision,
    wallBlocksBasicAttack:
      typeof v.wallBlocksBasicAttack === "boolean"
        ? v.wallBlocksBasicAttack
        : DEFAULT_VISION_RULES.wallBlocksBasicAttack,
  });
}

/**
 * 這一場的視野規則。
 *
 * ⚠️ **`SimWorld` 上還沒有 `visionRules` 這一格** —— 那個檔案在 2026-08-23
 * 屬於另一條 lane，這條 lane 的柵欄明著禁止動它。所以這裡讀一格「可能不存在」
 * 的屬性，讀不到就回出貨值。
 *
 * ⭐ 於是**出貨行為今天就是對的**（出貨值＝ owner 要的那一邊），而那一格一旦
 * 落地（見 `docs/_reports/full-vision_temp_*.md` 的兩行補丁），後台就自動接上，
 * ⛔ 這支不用再改一個字。
 */
export function visionRulesOf(world: SimWorld): VisionRules {
  return (world as SimWorld & { visionRules?: VisionRules }).visionRules ?? DEFAULT_VISION_RULES;
}
