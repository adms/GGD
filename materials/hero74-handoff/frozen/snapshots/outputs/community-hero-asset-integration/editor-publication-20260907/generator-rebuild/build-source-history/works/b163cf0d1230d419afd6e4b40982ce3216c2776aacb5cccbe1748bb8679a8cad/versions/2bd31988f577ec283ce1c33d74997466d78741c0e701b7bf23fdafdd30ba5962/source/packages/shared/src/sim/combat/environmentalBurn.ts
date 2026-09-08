/**
 * 環境燒傷 —— **沒有攻擊者**的 %HP 真實傷害，唯一合法的「不走傷害佇列」出口。
 * (GH#287)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼火圈不能直接 `hp.hp -= dmg`
 *
 * 一年來火圈是這樣寫的，代價是**所有掛在佇列上的攔截對它一律無效，而且靜默**：
 * 無敵（`invulnerable.ts` 的 `blocksTrueDamage` 明說要擋真實傷害）、免死
 * （十二道試煉）都攔不到。玩家買了、卡片上寫了、圈一縮就直接死 —— CLAUDE.md
 * 失敗形態②（卡片上寫了，遊戲裡不存在）。
 *
 * ⚠️ 修法早就寫在 `effects/invulnerable.ts` 檔頭⑤ 裡（連行號都寫了），
 * 一年沒有人加，因為**一份沒有守衛的備忘不會紅**。這個檔存在的意義是把那段散文
 * 變成一個**只有一個實作**的函式，外加一條會紅的行為守衛。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② ⭐ 為什麼是這個函式，而不是「把火圈改成 `damageQueue.push`」
 *
 * issue #287 的首選是走佇列。實際讀完 `combat/damage.ts` 之後那條路的代價是
 * **整條下游**，而下游沒有一項是火圈要的：
 *
 *   · `emit("damage")` → 每個燒傷中的身體**每 tick** 一個浮動傷害數字。
 *     （`net/eventFanout.ts` 為了同一個理由把 `fireRingDamage` 列進
 *      SERVER_ONLY：「one message PER LIVING CHAMPION per tick (~360/s)」。）
 *   · `applyImpact()` → 硬直/擊退/擊倒。殭屍王 ~276,944 HP 的每 tick 燒傷是
 *     369 點，直接跨過 HEAVY 門檻 → **每 tick 一次擊倒**，而火圈沒有方向可以
 *     擊退（沒有攻擊者）。
 *   · 吸血 / MP 回收 / 反彈 / `noteAbilityConnect` / 擊殺歸屬 —— 全部需要一個
 *     `source`，而環境傷害的正確答案是**沒有**（`death.killerId === null`
 *     是既有守衛在釘的東西）。
 *
 * 所以這裡只接**攔截層**（refuse / save），不接表現層與歸屬層。
 * ⛔ 這是一個刻意的「第二條路」，它的風險（跟佇列漂掉）由兩件事壓住：
 *   (a) 三個燒傷站點只准經過**這一個**函式 —— 新增一種攔截改一個地方，
 *       不是 CLAUDE.md 第零守則⑨ 罵的「到處改改改」；
 *   (b) 每一道閘都直接呼叫佇列**自己在用的那個判定函式**（`refusesDamage`、
 *       `lethalSaveFor`），不重寫規則 —— 沒有第二份語意可以腐爛。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 刻意**不**接的三樣，以及為什麼（免得下一個人以為是漏了）
 *
 *   · **護甲 / 魔抗** —— 火圈是 `true`，佇列的 `mitigate()` 對 true 也是直通。
 *   · **`combatEnv.damageDealt` 全域倍率** —— #132/#270 明講火圈不吃它，
 *     否則後台把輸出調低就能讓「保底結束回合」失效。
 *   · **護盾池** —— 今天不吃（三處註解都這樣寫），改了就是動平衡。
 *     要改的話這裡是唯一的一個地方，而且應該先變成一個後台欄位。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 純度與 ZERO GUARANTEE
 *
 * 沒有 rng、沒有時鐘、沒有三角函式、沒有 `**`。`refusesDamage` 是兩次 Map 查詢
 * 加一個絕對 tick 比較。`lethalSaveFor` 只在 `lethalSaveApplies` 開著**而且**
 * 受害者身上真的有一張帶 `lethal` 的標記時才可能碰任何東西 —— 出貨預設是關的，
 * 所以每一份既有錄影與 digest 逐位元不變。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { refusesDamage } from "../effects/invulnerable";
import { lethalSaveFor } from "./lethalSave";

/** 一道環境燒傷要不要被免死攔下來。呼叫端從自己的規則物件裡取。 */
export interface EnvironmentalBurnRules {
  /**
   * 免死（帶 `lethal` 規則的具名標記，例：十二道試煉）擋不擋這一道燒傷。
   *
   * ⚠️ 這是一個**設計決策點**，不是技術問題：火圈的用途是強制結束回合，而一個
   * 帶 12 層試煉的人如果免死擋得住火圈，他可以在圈外站 12 次。出貨值是
   * **false（＝今天的行為，火圈無視免死）**，等 owner 裁決 —— CLAUDE.md 第一
   * 守則：拿不定主意的決策做成欄位，預設選「保留今天行為」的那一個。
   */
  readonly lethalSaveApplies: boolean;
}

/**
 * 對 `victim` 施加一道環境燒傷，**先過攔截層**再扣血。
 *
 * @param amount 這一 tick 打算燒掉的量（呼叫端已經算好，通常是 maxHp × 速率 × dt）
 * @returns 真的從血條扣掉的量。**0 = 被攔下來了**，呼叫端據此決定要不要發事件。
 *
 * ⚠️ 回傳實際值而不是 void：呼叫端的 `fireRingDamage` 事件是客戶端火焰表現與
 * 錄影分析讀的那個數字，報「打算燒多少」而不是「真的燒掉多少」就是失敗形態②
 * （面板與實際不一致）的同一個形狀。
 *
 * ⛔ 被無敵攔下來時**不發任何事件**。`immune` 是會 fan-out 到客戶端的
 * （`net/eventFanout.ts` 的白名單），而這條路是每 tick 每個身體一次 ——
 * 那正是同一個檔把 `fireRingDamage` 關進 SERVER_ONLY 的理由。玩家看得到的證據
 * 是血條不掉 + 無敵本身的表現，不是一秒 30 發的封包。
 */
export function applyEnvironmentalBurn(
  world: SimWorld,
  victim: EntityId,
  amount: number,
  rules: EnvironmentalBurnRules,
): number {
  if (!(amount > 0)) return 0;
  const hp = world.health.get(victim);
  if (hp === undefined || !hp.alive) return 0;

  // ── 無敵 / 免疫 ────────────────────────────────────────────────────────────
  // 佇列問的是同一個問題（`combat/damage.ts` 的 `refusesDamage(world, target,
  // type)`），所以「哪一根軸擋 true」只有一個答案。內容側的開關是
  // `invulnerable` 的 `blocksTrueDamage`（省略時跟著 `blocksDamage: "all"`），
  // 也就是「這支技能擋不擋火圈」本來就已經是編輯器卡片上的一格。
  if (refusesDamage(world, victim, "true")) return 0;

  let dmg = amount;

  // ── 免死 ───────────────────────────────────────────────────────────────────
  // 位置與佇列一致：扣血的**前一行**，而且 `dmg` 已經是真的要進血條的那一份
  // （火圈不吃護盾，所以這裡兩者相等）。`lethalSaveFor` 自帶 ZERO GUARANTEE。
  if (rules.lethalSaveApplies) {
    const floor = lethalSaveFor(world, victim, "true", dmg, hp.hp);
    // 削到「剛好留下 floor」，不是歸零 —— 血條被打到底再被拉住才是免死該有的
    // 畫面，理由與 `combat/damage.ts` 同一段逐字相同。
    if (floor !== undefined) dmg = Math.max(0, hp.hp - floor);
  }

  if (!(dmg > 0)) return 0;
  hp.hp -= dmg;
  return dmg;
}
