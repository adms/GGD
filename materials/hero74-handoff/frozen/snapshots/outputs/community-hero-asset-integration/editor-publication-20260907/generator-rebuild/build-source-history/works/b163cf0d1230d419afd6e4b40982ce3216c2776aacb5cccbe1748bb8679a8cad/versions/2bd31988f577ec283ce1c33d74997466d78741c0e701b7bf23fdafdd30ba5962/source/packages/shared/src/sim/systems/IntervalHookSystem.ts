/**
 * 週期觸發 —— `HookEvent: "onInterval"` 的發射器。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 它補的洞
 *
 * `HookEvent` 在這之前的八個成員**全部**要有人動手:攻擊、施法、造成傷害、
 * 受到傷害、擊殺、升級、被暈眩。於是「每 N 秒自動發生一次」這一整族 —— WC3 裡
 * 最常見的天生技形狀之一 —— 完全沒有辦法被誠實地寫出來:
 *
 *   43-00 觀音大士的守護「每 10 秒生成一個生命 10% 的護盾」
 *   03-00 相轉移裝甲「因為科技世界產物所以魔法免疫」(常駐 = 每 tick 續期)
 *   52-00 十二道試煉「每秒鐘損失 0.12% 生命」
 *
 * 在它之前這三支只能被改寫成「**被打的時候**才生效」(`onDamageTaken`),而那
 * 不是同一支技能 —— 那是 CLAUDE.md 失敗形態 ②(卡片上寫了,遊戲裡是另一件事)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決策 1 —— 節奏是 `internalCooldown`,這個 system 每 tick 無條件發射
 *
 * 這個 system **不知道**「每 10 秒」這件事,它每一 tick 都發。真正的節奏閘是
 * `HookDef.internalCooldown`,而那個欄位早就存在、早就在編輯器上、早就是絕對
 * tick 比較(`effects/hooks.ts`)。
 *
 * 為什麼不在事件裡塞一個 `everySec`:那會是**第二個**冷卻概念,和
 * `internalCooldown` 平行、語意重疊、而且兩個都可以被填。一個 hook 同時寫
 * 「每 10 秒發射」與「內部冷卻 3 秒」時哪一個贏?任何答案都是要靠註解解釋的
 * 答案。重用既有欄位之後,「10」只有一個地方可以填,而且它和其它所有 proc 的
 * 冷卻是同一套語意(失敗的一次不燒冷卻、道具來源吃 `combatEnv.itemCooldown`)。
 *
 * ⚠️ 因此**沒有** `internalCooldown` 的 `onInterval` hook = 每秒 30 次。那是
 * 合法而且必要的(03-00 的常駐魔免就要每 tick 續期),但作者要知道自己在寫
 * 什麼:帶 `chance` 或 `condition` 的話,rng 會每 tick 被抽。
 *
 * ⭐ 決策 2 —— 只在 `world.combatActive` 時發射
 *
 * 和 `autoAcquirePass` / MobSystem / fireRing / coins 同一條規矩,理由也一樣:
 *   1. `combatActive` 預設 false,所以**每一個既有測試與既有錄影的 digest 逐位元
 *      不變** —— 這個 system 存在本身不改變任何一場已經跑過的比賽;
 *   2. #128 的施法普查用 NO_INTENTS 步進,一個每 tick 都在打自己的 DoT 會讓
 *      毫無作用的技能被判成 PASS;
 *   3. #100 的回合結算凍結必須維持凍結 —— 一個「每 10 秒補盾」的天生技在回合
 *      已經分出勝負之後還在補盾,就是 #216 那份回報的形狀。
 *
 * ⭐ 決策 3 —— 掃 `world.stats`,但**明確排序**
 *
 * `fireHooks` 需要一個帶 `StatsComp` 的持有者,所以候選集合就是 `world.stats`。
 * 它是 Map,原生順序是**插入順序** —— 也就是生成順序這個意外,而不是規則。
 * 死掉的單位重生、召喚物出場、殭屍波進場都會改變它。所以這裡明確排成遞增
 * entity id 再跑,否則兩個 replica 只要生成順序差一次,`onInterval` 的 rng 抽取
 * 順序就會分家(`aura.ts` DETERMINISM 段落同一課)。
 *
 * ⚠️ 活著才發。`fireHooks` 自己也會擋死人,這裡先擋一次是為了**不要**替一具
 * 屍體付出整條 sources 掃描的成本 —— 這個 system 每 tick 對每個單位跑一次,
 * 是全 sim 裡呼叫最頻繁的 hook 入口。
 *
 * ── 排程位置 ──────────────────────────────────────────────────────────────
 * 排在 `dotTickSystem`(7c)之後、`combatResolveSystem`(8)之前。那個窗口是
 * 「這一 tick 所有傷害都已經排進佇列、但還沒有結算」的最後一刻,所以:
 *   · 一個 `onInterval` 產生的護盾**趕得上**擋下同一 tick 的傷害(43-00);
 *   · 一個 `onInterval` 產生的傷害(52-00 的流失)和 DoT 走同一個佇列、同一輪
 *     結算,不會多欠一 tick;
 *   · 一個 `onInterval` 續期的免疫(03-00)在 `refusesDamage` 被問到之前就已經
 *     寫好了。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 自己不抽 rng、不看時鐘、沒有三角函式、沒有 `**`。它唯一的隨機性來自它呼叫的
 * hook(`chance` / `condition`),而那些抽取順序由上面的排序保證固定。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { fireHooks } from "../effects/hooks";

export function intervalHookSystem(world: SimWorld): void {
  // 決策 2 —— 這一行讓整個 system 在既有測試/錄影裡是逐位元的 no-op。
  if (!world.combatActive) return;

  // 決策 3 —— Map 的插入順序不是規則,明確排序。
  const ids: EntityId[] = [...world.stats.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const hp = world.health.get(id);
    // `hp === undefined` 的單位(沒有生命元件)照樣可以帶 hook,所以只擋
    // 「有生命而且已經死了」,不是「沒有生命」。
    if (hp !== undefined && !hp.alive) continue;
    // 沒有 target:`onInterval` 不是關於任何一個對手的事件,所以每一個
    // `subject: "target"` 的條件葉子都讀作 false(condition.ts DECISION 2),
    // 而 `hook.target` 省略時 `fireHooks` 會把效果解到持有者自己身上。
    fireHooks(world, id, "onInterval");
  }
}
