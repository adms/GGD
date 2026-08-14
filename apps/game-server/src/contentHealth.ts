/**
 * contentHealth.ts — 「**這個映像的程式，讀不讀得懂它掛著的那份內容**」。
 *
 * ── 為什麼這個檔案存在 (2026-08-02 的生產故障) ────────────────────────────
 *
 * owner 回報 ggd.adms.ai 無法鎖定英雄（「選擇被拒: unknown champion」）、
 * 進場變成體素替身、商店空的。根因是**線上的 `content/` 比線上的映像新**：
 * 四個 config schema tag（`config.roster@1` / `config.boss-intro@1` /
 * `config.item-card@1` / `config.victory-fx@1`）與四組欄位不在已部署 client 的
 * Zod discriminated union 裡，內容載入整份失敗，fail-open 退回骨架（2 隻英雄）。
 *
 * `content/` 是 **live bind-mount**，它跟著 `git pull` 走；映像只在完整部署時重建。
 * 所以「內容」與「能解析它的程式」是**兩個獨立版本化的東西**，而部署正是它們相遇的那一刻。
 *
 * ── 為什麼四項後置條件全部通過而網站不能玩（這才是真正的教訓）─────────────
 *
 * `scripts/host-deploy.sh` 當時驗了四件事，四件全綠：
 *
 *   1. content bundle 的英雄數 → 讀**檔案**，檔案是好的
 *   2. 白名單的英雄數        → 讀**平台 API**，平台是好的
 *   3. 版本身分不是 UNSTAMPED → 讀**映像**，映像是好的
 *   4. 帳號數沒掉            → 讀**資料目錄**，資料是好的
 *
 * **每一項都在驗一個「名詞」，沒有一項在驗兩個名詞之間的「關係」。**
 * 壞掉的東西是「這個映像能解析這份內容」—— 那是一個**配對**的性質，
 * 而配對的性質不可能由分別檢查每一半得到。
 *
 * 這就是這個檔案補的那一項：伺服器**自己的登錄表**就是那個配對的答案 ——
 * 它是「映像裡的 Zod」跑過「bind-mount 上的內容」之後真正得到的東西。
 * 靜態檔案伺服器會很樂意把一份 client 解析不了的 bundle 送出去；登錄表不會說謊。
 *
 * ⚠️ 這裡刻意**不做**第二份驗證邏輯。數字直接來自 `Champions` / `Items` /
 * `Abilities` 這三個出貨登錄表 —— 也就是失敗形態 ⑤ 的反面：被測的就是出貨的那個。
 */
import { Abilities, Champions, Items } from "@ggd/shared/sim/content/registry";
import type { QuarantineEntry } from "@ggd/shared/content";

/**
 * 骨架內容的英雄數。低於或等於這個數字，幾乎可以確定是 fail-open 退回骨架了
 * —— `sim/content/skeleton.ts` 註冊的是 sela 與 thorne 兩隻。
 *
 * ⚠️ 這是**下界不是等於**：一個真的只開兩隻英雄的白名單不會影響這個數字，
 * 因為登錄表裝的是**內容**不是白名單（白名單是另一項後置條件在驗的）。
 */
export const SKELETON_CHAMPION_COUNT = 2;

/**
 * ⭐ GH#326 —— 上一次載入隔離了哪幾份。
 *
 * ⚠️ 這個模組層級的變數存在的理由是 CLAUDE.md「fail-open 沒錯,**靜默**才是缺陷」:
 * 隔離讓「一份壞文件」不再殺掉全站,但如果沒有一個**擋不掉的**地方說得出哪幾份
 * 被隔離,它就變成「壞掉跟正常長得一模一樣」—— 也就是這條規則要修的東西本身。
 *
 * ⛔ 一行 console.warn 不算。這一格會出現在 `/healthz`(機器讀,部署後置條件用)
 *    與後台的重要事件頁(人讀,導覽列帶數字紅點)。
 */
let lastQuarantined: readonly QuarantineEntry[] = [];

export function recordQuarantine(entries: readonly QuarantineEntry[]): void {
  lastQuarantined = entries;
}

export function quarantinedDocs(): readonly QuarantineEntry[] {
  return lastQuarantined;
}

export interface ContentHealthSnapshot {
  /** false = 登錄表小到只可能是骨架，也就是內容載入失敗過。 */
  readonly ok: boolean;
  readonly champions: number;
  readonly items: number;
  readonly abilities: number;
  /** 給操作者看的一句話；`ok` 為 true 時是 null。 */
  readonly reason: string | null;
  /**
   * ⭐ 上一次載入被隔離的文件數。0 = 全乾淨。
   *
   * ⚠️ 它**故意不影響 `ok`**:`ok` 回答的是「內容載入成功了嗎」,隔離的定義就是
   * 「載入成功了,只是少了這幾份」。兩個訊號混在一起會讓部署後置條件沒辦法分辨
   * 「少了三份設定」與「整份跟映像不相容」—— 而那正是 2026-08-02 的故障形態。
   */
  readonly quarantined: number;
  /** 被隔離的每一份(collection/id/原因)。空陣列 = 全乾淨。 */
  readonly quarantinedDocs: readonly {
    collection: string;
    id: string;
    reason: string;
    detail: string;
  }[];
}

export function contentHealth(): ContentHealthSnapshot {
  const champions = Champions.ids().length;
  const items = Items.ids().length;
  const abilities = Abilities.ids().length;
  const degraded = champions <= SKELETON_CHAMPION_COUNT;
  return {
    ok: !degraded,
    champions,
    items,
    abilities,
    quarantined: lastQuarantined.length,
    quarantinedDocs: lastQuarantined.map((q) => ({
      collection: q.collection,
      id: q.id,
      reason: q.reason,
      detail: q.detail,
    })),
    reason: degraded
      ? `登錄表只有 ${champions} 隻英雄 —— 內容載入失敗過，已退回骨架。` +
        `最可能的原因是 content/ 比這個映像新（新的 schema tag 或欄位不在映像的 Zod union 裡）。` +
        `修法：跑完整部署讓映像追上內容，不要用 --content-only。`
      : null,
  };
}
