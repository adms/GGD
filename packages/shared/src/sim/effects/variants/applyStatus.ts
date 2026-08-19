/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { StatusId } from "../../../ids";
import type { RankScalar } from "../../perRank";

export interface ApplyStatusVariant {
  kind: "applyStatus";
  statusId: StatusId;
  /**
   * ⭐ G2 —— 逐階可以是陣列。⛔ 讀它一律走 `sim/perRank.ts::rankScalar`，
   * **不要**寫 `typeof d === "number" ? d : d[rank-1]` —— 那句話已經在這個
   * repo 裡被抄過五次（見那支檔頭）。
   */
  duration: RankScalar;
  /**
   * ⭐ 狀態的**層數**（owner 2026-08-09 / GH#301-5：「狀態除了有無也會是
   * 數字層數」）。
   *
   * 在它之前一筆 status 只有「有 / 沒有」。owner 的修正表第 8 條說層數累積
   * 會連動技能 ID 或狀態疊層，所以〔破甲 3 層〕與〔破甲 1 層〕必須是兩件
   * 不同的事，而條件葉子問得出差別。
   *
   * ABSENT = 1（＝今天的行為，「有這個狀態」）。⛔ 不是 0 —— 0 層等於沒有，
   * 而一份沒寫這一格的舊文件的意思是「有」。
   * 界共用 `sim/markLimits.ts` 的 `MARK_MAX_COUNT`（±999），因為那已經是這個
   * repo 對「一個計數器最多幾層」的答案；抄第二個數字就是第四個住處。
   *
   * ⭐ **負數 = 減層**（GH#304 軸①【隨觸發】／軸②【隨時間】）。整套三條軸
   * 的分工寫在 `sim/marks.ts` 檔頭⑤，這一格是其中兩條唯一需要的新詞彙。
   *
   * ⭐ 送到客戶端的路**已經選好了**（owner 2026-08-09 選①）：
   * `SeatState.counterIds[]` / `counterCounts[]` —— 一份泛型的
   * `(id, 層數)` 清單，標記層數與狀態層數合併成一套送
   *（`apps/game-server/src/net/snapshot.ts` 的 `namedCounters`）。
   * ⚠️ 上一版這裡寫著「未解決，三條路等裁決」，那句話從
   * `counterIds` 落地的那一刻起就是謊話（CLAUDE.md 第三守則）。
   */
  stacks?: number;
  /**
   * 重複施加時要不要把到期時間往後推。省略 = `"extend"` = 舊行為。
   * ⚠️ 減層（`stacks < 0`）一律當 `"keep"`。理由與整段語意見
   * `content/schema/effect.ts` 的同名欄位。
   */
  refresh?: "extend" | "keep";
  /**
   * Who receives it: each resolved target (default), or the CASTER. The
   * self form is how a combo WINDOW is opened — 者、皆、陣 is a
   * unit-targeted strike whose JASS also sets the caster-side marker
   * (j:34438), so without `applyTo` the marker would land on the victim.
   */
  applyTo?: "self" | "target";
  /** ⭐ G2 —— 逐階可以是陣列（`0` = 完全不能動，見 schema 的同名欄位）。 */
  moveSpeedMult?: RankScalar;
  root?: boolean;
  stun?: boolean;
  /**
   * 失手率 0..1 — WC3 `Acrs` 詛咒. THE CARRIER's own basic attacks miss this
   * often, at anybody. It is NOT evasion: evasion protects the body it is
   * on, this one sabotages it. See `components.ts::StatusEffect.missChance`
   * for why the direction matters and why it lives on the status.
   */
  /** ⭐ G2 —— 逐階可以是陣列。 */
  missChance?: RankScalar;
  /**
   * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機 暴走). The carrier loses the
   * wheel: `orderSystem` drops that seat's orders and the body hunts on its
   * own. Model + decisions: `sim/berserk.ts`.
   */
  berserk?: boolean;
  /**
   * 恐懼 —— `berserk` 的鏡像：一樣沒收座位的指令，但身體**遠離**最近的敵人
   * 而且**不攻擊**。模型與三個決策點：`sim/fear.ts`。
   * ⚠️ 它**是** CC（免控擋得掉），也只管腳 —— 要連技能一起封請配 `silenced`。
   */
  feared?: boolean;
  /**
   * C4 睡眠（#278）—— **受傷即提早解除這一筆**。
   * ⛔ 只拔標了它的那幾筆；身上的其他 status 一格不動（`sim/statusBreak.ts`）。
   */
  /** 【沉默】C1（#278）—— 不能施放技能，但走得動、打得到。 */
  silenced?: boolean;
  /**
   * ⭐【繳械】S8（92-01）—— **打不出普通攻擊**。省略 = 打得出來（今天）。
   *
   * ⛔ 它**不是** `missChance` 的包裝（實測：`missChance:1` 的人照樣發
   * `attackWindup` / `basicAttack` 事件、燒攻擊冷卻、破隱，只是傷害 0）。
   * ⛔ 它**不擋技能** —— 要連技能一起封請配 `silenced`。
   * ⚠️ 它**算硬控**（`HARD_CC_FLAGS` + `applyStatus` 的 `isCc`），完整推導見
   * `sim/components.ts` 的同名欄位。
   */
  disarmed?: boolean;
  /** 【混亂】C2（#278）—— 配 `berserk: true` 用：失控之後**不分敵我**。 */
  targetsAllies?: boolean;
  breakOnDamage?: boolean;
  /** 打醒門檻（實際扣掉的傷害）。省略 = 0 = 任何傷害都醒（WC3 沉睡的語意）。 */
  breakOnDamageMin?: number;
  /**
   * 【重創】A6（#278）—— 治療 / 吸血 / 自然回復三格**獨立**倍率。
   * owner 裁決⑥：出貨的重創三格都是 0.5；**禁療 = 三格都填 0 的一份文件**。
   */
  healingTakenMult?: number;
  lifestealMult?: number;
  regenMult?: number;
  /**
   * A4（#278 / GH#295）—— 這一筆狀態可不可以被【淨化】拔掉。
   * 省略 = `world.dispelRules.statusDefaultDispellable`（出貨 true）。
   * 回合重置與復活不看它（`clearForFreshBody` 傳 `requireDispellable: false`）。
   */
  dispellable?: boolean;
}
