/**
 * 【虛弱】—— 攻速減半 + **造成的傷害**減半（GH#301-4 / owner 2026-08-09）。
 *
 * owner 逐字：「虛弱 => **攻擊速度暫時減半、AP/AD 造成傷害暫時減半**」，
 * 推翻了規範第 7 條原本寫的「沒有專屬機制，是負向屬性增益的一種寫法」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策 1：「造成傷害減半」掛在**傷害封包**那一層，不是把 AD/AP 屬性砍半
 * ─────────────────────────────────────────────────────────────────────────────
 * 兩者不是同一件事，而且差別是玩家感覺得到的：
 *
 * | 寫法 | 普攻 | 吃 AD/AP 係數的技能 | **固定值**傷害 | 面板 |
 * |---|---|---|---|---|
 * | 砍 AD/AP 屬性 | 減半 | 減半 | **一點都不減** | AD/AP 顯示掉一半 |
 * | 砍出去的封包（這一份） | 減半 | 減半 | **也減半** | 屬性不動 |
 *
 * owner 說的是「**造成傷害**減半」不是「AD/AP 減半」，而出貨內容裡有大量
 * 「固定 300 點」型的效果 —— 走屬性那條路，一個被虛弱的人放固定值技能會**完全
 * 不受影響**，那跟「虛弱」這兩個字在畫面上直接矛盾（失敗形態 ④：對的實作與壞掉
 * 的實作在單體純係數技能上一模一樣）。
 *
 * ⚠️ 代價要講清楚：屬性面板**不會**顯示 AD/AP 掉一半，因為它們真的沒掉。
 * 這與 #125「顯示的數字必須是最終值」不衝突 —— 面板顯示的是屬性，而虛弱不是
 * 一條屬性，它是一個掛在身上的減益（HUD 的狀態列才是它該出現的地方）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策 2：攻速那一半是**讀取時**的倍率，不是進屬性管線
 * ─────────────────────────────────────────────────────────────────────────────
 * 進 `statPipeline` 看起來更漂亮（面板會顯示攻速掉一半），但它**做不到**：
 * `recomputeStats` 只在 `sc.dirty` 時跑，而狀態的到期由 `StatusSystem` 清理，
 * 那條路**不會**碰 `sc.dirty` —— 於是虛弱到期之後攻速會永遠停在半速，直到下一次
 * 有人買裝備。要修就得在狀態的掛上與到期兩端各接一次 dirty，那是兩個新的耦合點。
 *
 * 而 repo 自己對「一個狀態縮放一個類屬性的量」已經有答案，而且是同一種：
 *   · `moveSpeedMult` → `sim/movementHold.ts` 讀取時乘
 *   · `missChance`    → `combat/evasion.ts::missChanceOf` 讀取時取 max
 *   · 【重創】三格    → `grievousWounds.ts::woundMult`，三個讀取點各乘一次
 * 這一份是第四個同型的東西，所以它長得跟 `woundMult` 一樣，不是第二套寫法。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策 3：哪一筆狀態**算**虛弱，由 tag 決定 —— 引擎裡沒有寫死的 statusId
 * ─────────────────────────────────────────────────────────────────────────────
 * 第〇·五守則：「看到『為某支技能寫一個 if』就是越線了」。
 * `if (statusId === "weakness")` 正是那個 if。所以引擎問的是**類別**：
 * 「這個身體身上有沒有一筆帶著〔虛弱〕分類的狀態？」——
 * 走的是既有的 `hasStatusTag`（`sim/content/condition.ts`），也就是條件葉
 * `{kind:"status", tag:"weakness"}` **逐字同一個求值器**。同一個問題只有一種問法。
 *
 * ⛔ 因此虛弱是一份**內容文件**（`content/status-effects/*.json`，`tags` 帶
 * `weakness`），一支技能只要 `applyStatus{statusId:<那一份>, duration:N}` 就套得上。
 * 引擎提供的是機制，不是那一支技能。
 *
 * ⚠️ 出貨的 28 份狀態**目前沒有一份帶這個 tag**（`content/status-effects/` 裡沒有
 * 虛弱那一份）—— 所以這個機制今天是**惰性**的，一場比賽裡一次都不會發生。那是
 * 刻意的分工，不是做一半：owner 正在手動重製所有英雄技能與狀態文件，而這一批
 * ⛔ 不動 `content/abilities/`。文件一上架，這裡不用改任何一行就會生效。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策 4：**層數不放大虛弱**（兩筆虛弱 = 一筆虛弱）
 * ─────────────────────────────────────────────────────────────────────────────
 * 與【重創】的 `stackMode` 不同，而差別來自「倍率住在哪」：重創的三格倍率寫在
 * **每一張卡**上（所以「兩發不同的重創」是兩個不同的數字，怎麼合成是一個真的
 * 決策點），虛弱的兩格倍率是**全域定義**的（owner 說「虛弱就是減半」）。
 * 同一個 0.5 疊兩次得到 0.25 不是任何人要過的東西 —— 那會讓兩個人各補一發虛弱
 * 變成近乎繳械。所以：**有沒有虛弱是布林，倍率只乘一次。**
 * 真的要「虛弱越疊越重」的那一天，加的是 config 的一格 `stackMode`（形狀已經在
 * `config.wounds@1` 那邊），不是改這裡的語意。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * purity：純函式。只讀一個實體的 status 陣列 + 登錄表。
 * 無 rng、無時鐘、無三角函式、無 `**`。
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import { hasStatusTag } from "./content/condition";

/** 虛弱打折的兩根軸。 */
export type WeaknessAxis = "attackSpeedMult" | "damageDealtMult";

/**
 * 【虛弱】的全域定義。三格全部是**決策**而不是常數，所以三格都在後台。
 *
 * ⚠️ 兩個倍率的上界是 1：虛弱是減益，一個 >1 的「虛弱」會讓文案與行為直接相反，
 * 而畫面上看不出來（只會覺得那個人怎麼突然變強）。下界 0 = 完全不能出力，
 * 合法但極端 —— 兩端都有界是第一守則的要求（#277：只檢查下界會讓 0.5 打成 5
 * 靜默通過）。
 */
export interface WeaknessRules {
  /**
   * 哪一個**狀態分類**算虛弱（`status-effect@1.tags` 上的一個 tag）。
   *
   * 它是一格而不是寫死的字串，因為 owner 正在重製所有狀態文件，而「這一份叫什麼」
   * 是他的決定。改這一格 = 換一個分類，不用改程式。
   */
  statusTag: string;
  /** 攻速倍率。0.5 = 減半（owner 出貨值）。 */
  attackSpeedMult: number;
  /** **造成**的傷害倍率。0.5 = 減半（owner 出貨值）。 */
  damageDealtMult: number;
}

export const DEFAULT_WEAKNESS_RULES: WeaknessRules = Object.freeze({
  statusTag: "weakness",
  attackSpeedMult: 0.5,
  damageDealtMult: 0.5,
});

/** `content/config/weakness.json` 的文件 id。 */
export const WEAKNESS_DOC_ID = "weakness";

/**
 * 從 `config.weakness@1` 文件讀出來。缺文件 / 認不得的值 = 出貨預設。
 *
 * ⚠️ 三層守衛的**最裡面**一層（同 `woundRulesFromDoc` / `normalizeDispelRules`）：
 * 後台頁擋在前面、Zod 擋在中間，這裡擋的是任何繞過那兩層的來源（手改
 * overlay.json、舊版主機寫下的文件、測試夾具）。
 */
export function weaknessRulesFromDoc(doc: unknown): WeaknessRules {
  const d = doc as
    | { schema?: string; statusTag?: unknown; attackSpeedMult?: unknown; damageDealtMult?: unknown }
    | undefined;
  if (!d || d.schema !== "config.weakness@1") return DEFAULT_WEAKNESS_RULES;
  return {
    statusTag:
      typeof d.statusTag === "string" && d.statusTag.trim().length > 0
        ? d.statusTag
        : DEFAULT_WEAKNESS_RULES.statusTag,
    attackSpeedMult: clamp01(d.attackSpeedMult, DEFAULT_WEAKNESS_RULES.attackSpeedMult),
    damageDealtMult: clamp01(d.damageDealtMult, DEFAULT_WEAKNESS_RULES.damageDealtMult),
  };
}

function clamp01(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * `id` **現在**被虛弱著嗎？
 *
 * 只是 `hasStatusTag` 的一層命名 —— 存在的理由是讓兩個讀取點與守衛問同一句話，
 * 而不是各自寫一次 tag 比對（那就是「到處改改改」的起點）。
 */
export function isWeakened(world: SimWorld, id: EntityId): boolean {
  return hasStatusTag(world, id, world.weaknessRules.statusTag);
}

/**
 * `id` 這一根軸現在的倍率。沒有虛弱時回 `1`（＝不打折）。
 *
 * ⚠️ 回 `1` 而不是 `undefined` 是刻意的（同 `woundMult`）：呼叫端一律無腦乘，
 * 少乘一次就是一個「做一半」的讀取點，而那在畫面上看不出來。
 */
export function weaknessMult(world: SimWorld, id: EntityId, axis: WeaknessAxis): number {
  if (!isWeakened(world, id)) return 1;
  return world.weaknessRules[axis];
}
