/**
 * bossIntroModel —— 殭屍王出場演出 (owner 2026-08-02).
 *
 * owner 2026-08-02：
 *   「殭屍王出場 會音效+大字講該英雄的名言，然後跳出該英雄的描述及攻略注意
 *     要點及弱點等提示，五秒後提示淡出消失」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ① 「該英雄」不是固定的一個人 —— 這是做這條線之前必須先查清楚的事
 * ════════════════════════════════════════════════════════════════════════════
 * 直覺答案是喪標麥可（`godie-zombiex`，#215/#217/#244），而它是錯的。
 * `content/config/arena-rules.json` 的 `mobWaves.boss.championSource` 出貨值是
 * **`"random"`**（owner 2026-07-29：「殭屍 特殊殭屍 殭屍王 除了選特定英雄也可以
 * 隨機選項，特殊殭屍 殭屍王 預設是隨機」），而抽籤在 arm time 由
 * `sim/mobs.mobKindChampion` 走 `world.rng` 做掉 —— 所以王每一次上場借的是**當回合
 * 抽到的那一位英雄**的臉、模型與（經過 `heroHpMult` / `heroDamageMult` 的）數值。
 * 固定 `championId` 只是 owner 可以在後台選的另一條分支，不是出貨行為。
 *
 * 三個連帶後果，這個檔的形狀就是它們決定的：
 *   1. **身分必須過線。** `EntityState.key` 帶的是**模型**文件 id，不是角色；
 *      兩位英雄可以共用一個 mesh，而 `boss.modelKey` 還能整個蓋掉它。所以
 *      `MobBossRules.championId` 是新加的，並隨 `mobBossSpawn` 送出。
 *   2. **缺文案是常態不是例外。** 可能出場的是 120 位裡的任何一位，逐英雄的
 *      名言／要點／弱點不可能寫滿。所以 {@link bossIntroContent} 的契約是
 *      **只吐存在的段落**，一段都沒有就回 `null`（＝什麼都不畫）。
 *   3. **不可以在程式裡寫死喪標麥可的文案。** 那會讓抽到別人時畫面上出現一份
 *      跟眼前這隻完全無關的弱點表 —— 比不畫還糟。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ② 名言：**今天沒有這份資料，而我們沒有編造它**
 * ════════════════════════════════════════════════════════════════════════════
 * 每位英雄的名言是 GH#139 / #142，兩張都還是 pending。`champion@1` 沒有 `quote`
 * 欄位；`config/victory-taunts.json` 裡的是**對輸家講的原創嘲弄**（那份文件自己
 * 的 note 寫著「never a reproduced quote」），拿來當名言是張冠李戴。
 *
 * 所以：欄位（`config.boss-intro@1` 的 `champions[id].quote`）做出來、**出貨值
 * 一律空**、由 owner 或 #139 填。空的時候大字整段不畫 —— 不是一個空框、也不是
 * 一句我們自己寫的台詞。**把缺資料偽裝成功能，比缺一段畫面糟得多。**
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ③ 這一段演出**不是模態**（#107 安全區契約）
 * ════════════════════════════════════════════════════════════════════════════
 * 王一出場戰鬥就開始，所以這面板全程 `pointer-events: none`，而且它的矩形是
 * **從既有的障礙物清單推導**出來的，不是挑一個位置：`mobBossObstacles` 已經是
 * 「常駐槽位 + 技能列 + 版本徽章帶 + 第一回合控制圖例」的唯一來源，這裡直接重用，
 * 所以那份清單長出新東西時這一面板會自己讓開，而不是等人來同步第二份副本。
 *
 * 垂直上它從 **降臨橫幅底下**起算（`BOSS_BANNER_H`），因為那條橫幅在同一段時間
 * 也在畫；擠不下就一段一段丟（見 {@link bossIntroLayout}），真的一段都放不下就
 * 回 `null` ＝ 什麼都不畫，而不是「照樣畫在 0,0」。
 */
import { Configs } from "@ggd/shared/content";
import {
  DEFAULT_BOSS_INTRO,
  bossIntroFromDoc,
  type ConfigBossIntroDoc,
} from "@ggd/shared/content";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { HUD_GAP, hudRectsOverlap, type HudRect, type HudViewport } from "./hudLayout";
import { ABILITY_CLUSTER_H, TOP_CENTRE_BAND_END } from "../controlLegendModel";
import { legendObstacleRects } from "./killComboModel";
import { BOSS_BANNER_H, mobBossObstacles, type BossPlacementOpts } from "./mobBossModel";
import type { MobBossView } from "../../net/RoomStore";

export const BOSS_INTRO_DOC_ID = "boss-intro";

/**
 * 生效中的出場演出設定 —— 後台 overlay ?? `content/config/boss-intro.json` ??
 * {@link DEFAULT_BOSS_INTRO}。
 *
 * 走 `Configs`（開機時 bootContent 灌進去的那一份）而不是自己 fetch：同一份
 * bundle 已經在記憶體裡，多一次 HTTP 只會多一種「兩邊不一致」的方式。
 */
export function bossIntroRules(): ConfigBossIntroDoc {
  return bossIntroFromDoc(Configs.tryGet(BOSS_INTRO_DOC_ID));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ① 內容（純函式）
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 一段出場提示，已經套過上限、截過長度，可以直接畫。 */
export interface BossIntroContent {
  championId: string;
  /** 那位英雄的顯示名。查不到 champion doc 時是空字串。 */
  name: string;
  /** 大字名言。**沒有資料時是 `null`，那一段整段不畫。** */
  quote: string | null;
  /** 描述，已截到 `descriptionMaxChars`。沒有時 `null`。 */
  description: string | null;
  /** 攻略注意要點，已截到 `maxTips` 條。 */
  tips: string[];
  /** 弱點，已截到 `maxWeaknesses` 條。 */
  weaknesses: string[];
}

/** 中文全形省略號 —— 截斷過的描述一定要看得出來被截過。 */
export const BOSS_INTRO_ELLIPSIS = "…";

/**
 * PURE：這一隻王要顯示哪三段。**只吐存在的部分**，一段都沒有就 `null`。
 *
 * ⚠️ `null` 與「空的 content」是兩件不同的事，而且差別是可觀察的：`null` 代表
 * 這一隻沒有任何可講的東西（`enabled` 關掉、身分不明、或那位英雄既沒有描述也
 * 沒有文案），呼叫端就整段不畫；一個 `quote: null` 但有描述的 content 代表
 * 「名言那一格今天沒有資料」——這是**出貨當下的常態**（見檔頭②），面板要照畫
 * 剩下的部分。把兩者合併成「有沒有東西」會讓後者變成前者，也就是名言資料還沒
 * 進來之前，整個演出從來不會出現，而所有測試都會過。
 *
 * `lookup` 是注入的，不是直接打 `Champions`：這樣測試不必先把一份假英雄註冊進
 * 全域 registry（註冊是有殘留的，跨檔會互相汙染），而**出貨的呼叫端仍然走真的
 * registry**（見 {@link bossIntroContentFor}）。
 */
export function bossIntroContent(
  championId: string,
  rules: ConfigBossIntroDoc,
  lookup: (id: string) => { name?: string; description?: string } | undefined,
): BossIntroContent | null {
  if (!rules.enabled) return null;
  if (typeof championId !== "string" || championId === "") return null;
  const def = lookup(championId);
  const entry = rules.champions[championId];

  // 名言：空字串（出貨值）與缺席一樣算「沒有資料」。trim 過才判斷，否則一格
  // 只有空白的文案會畫出一條看不見的大字。
  const rawQuote = typeof entry?.quote === "string" ? entry.quote.trim() : "";
  const quote = rawQuote === "" ? null : rawQuote;

  const maxDesc = Math.max(0, Math.trunc(rules.descriptionMaxChars));
  const rawDesc = typeof def?.description === "string" ? def.description.trim() : "";
  // 描述是完整故事（喪標麥可那一份 400 字以上），戰鬥中只給開頭那一截。
  //
  // ⚠️ **不是「取第一段」**，而那不是風格問題是一個實測到的缺陷：出貨的英雄文件
  // 幾乎都以一行標籤開頭（`"故事：\n黑化聖杯溢出的…"`），取第一段的結果是畫面上
  // 只出現「故事：」三個字 —— 一個看起來有在運作、實際上一個字的內容都沒有的面板。
  // 所以把非空行接起來再截：截斷是可見的（省略號），少講幾個字不會變成沒講。
  const flat = rawDesc
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join(" ");
  const description =
    maxDesc === 0 || flat === ""
      ? null
      : flat.length > maxDesc
        ? `${flat.slice(0, maxDesc)}${BOSS_INTRO_ELLIPSIS}`
        : flat;

  const take = (xs: readonly string[] | undefined, n: number): string[] =>
    (xs ?? []).map((s) => s.trim()).filter((s) => s !== "").slice(0, Math.max(0, Math.trunc(n)));
  const tips = take(entry?.tips, rules.maxTips);
  const weaknesses = take(entry?.weaknesses, rules.maxWeaknesses);

  const name = typeof def?.name === "string" ? def.name : "";
  // 一句話都沒有就不要開一個空框。名字自己不算內容 —— 「殭屍王降臨」橫幅已經
  // 在講這件事了。
  if (quote === null && description === null && tips.length === 0 && weaknesses.length === 0) {
    return null;
  }
  return { championId, name, quote, description, tips, weaknesses };
}

/**
 * 出貨的呼叫端：真的去 `Champions` registry 查那位英雄。
 *
 * ⚠️ 分成兩支是為了失敗形態⑤（被測的不是出貨的那個）：所有內容規則的斷言都寫在
 * 上面那支純函式上，而畫面上那個元件呼叫的是**這一支**，它多做的事只有一件 ——
 * 把 registry 接上去。這一行如果接錯，`bossIntro.test.ts` 的 registry 那一條會紅。
 */
export function bossIntroContentFor(
  championId: string,
  rules: ConfigBossIntroDoc,
): BossIntroContent | null {
  return bossIntroContent(championId, rules, (id) => Champions.tryGet(id as ChampionId));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ② 時序
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface BossIntroLifetime {
  /** `"live"` = 停留中；`"out"` = 淡出中 */
  phase: "live" | "out";
  /** 0..1 —— 停留期間恆 1，淡出期間線性掉到 0 */
  opacity: number;
}

/**
 * PURE：這一段提示現在還在不在畫面上，以及淡到哪裡。`null` ＝ 不畫。
 *
 * ⚠️ **`introHoldSec` 是欄位不是常數**，而這支函式是那件事唯一會被觀察到的地方：
 * 把出貨的 5 改成 2，同一個 `nowMs` 就必須從 `"live"` 變成 `null`。
 * `bossIntro.test.ts` 的斷言寫在**這個轉換**上，不是寫在「欄位等於 5」上（失敗
 * 形態⑦：掃屬性代替掃行為）。
 *
 * 只認 `spawn`：分紅結算是另一段演出（`mobBossModel`），它不介紹任何人。
 * 時鐘倒退（OS 校時）一律回 `null`，永遠不會卡住一個不會消失的提示。
 */
export function bossIntroLifetime(
  view: MobBossView | null,
  nowMs: number,
  rules: ConfigBossIntroDoc,
): BossIntroLifetime | null {
  if (!view || view.kind !== "spawn") return null;
  if (!rules.enabled) return null;
  const age = nowMs - view.atMs;
  if (age < 0) return null;
  const hold = Math.max(0, rules.introHoldSec) * 1000;
  const fade = Math.max(0, rules.fadeSec) * 1000;
  if (age > hold + fade) return null;
  if (age <= hold) return { phase: "live", opacity: 1 };
  // fade 為 0 時上面那條已經把它擋掉了（age > hold + 0），所以這裡除數不會是 0。
  const t = (age - hold) / fade;
  return { phase: "out", opacity: Math.max(0, Math.min(1, 1 - t)) };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ 版面
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 大字名言那一行 */
export const BOSS_INTRO_QUOTE_H = 42;
/** 英雄名那一行（永遠在，用來說「這是誰」） */
export const BOSS_INTRO_NAME_H = 20;
/** 描述（兩行） */
export const BOSS_INTRO_DESC_H = 34;
/** 一個段落標題（「攻略要點」／「弱點」） */
export const BOSS_INTRO_HEAD_H = 16;
/** 一條列點 */
export const BOSS_INTRO_ROW_H = 17;
/** 外框上下留白 */
export const BOSS_INTRO_PAD_H = 14;

export const BOSS_INTRO_PREF_W = 460;
export const BOSS_INTRO_MIN_W = 240;

/** 哪幾段真的畫得下，以及畫下來要多高。 */
export interface BossIntroLayout {
  quote: string | null;
  name: string;
  description: string | null;
  tips: string[];
  weaknesses: string[];
  height: number;
  /** 因為高度不夠而被丟掉的段落名（給測試與除錯看的） */
  dropped: string[];
}

function heightOf(l: Omit<BossIntroLayout, "height" | "dropped">): number {
  let h = BOSS_INTRO_PAD_H + BOSS_INTRO_NAME_H;
  if (l.quote !== null) h += BOSS_INTRO_QUOTE_H;
  if (l.description !== null) h += BOSS_INTRO_DESC_H;
  if (l.tips.length > 0) h += BOSS_INTRO_HEAD_H + l.tips.length * BOSS_INTRO_ROW_H;
  if (l.weaknesses.length > 0) h += BOSS_INTRO_HEAD_H + l.weaknesses.length * BOSS_INTRO_ROW_H;
  return h;
}

/**
 * PURE：`availableH` 這麼高的走廊，這份內容要畫哪幾段。
 *
 * **丟棄順序是一個決定，不是一個意外**：描述 → 攻略要點 → 弱點。
 * 描述先丟，因為它是身世故事 —— 在一場正在打的戰鬥裡，它是三段裡唯一不會影響
 * 玩家下一秒動作的東西；弱點最後丟，因為那是「現在要怎麼打」的答案。名言不丟，
 * 它是 owner 指名的主角（而且它只有在真的有資料時才存在）。
 *
 * `null` ＝ 連最精簡的版本都放不下 ⇒ 什麼都不畫（#107：寧可不畫也不要蓋住玩家
 * 自己的血條）。
 */
export function bossIntroLayout(
  content: BossIntroContent,
  availableH: number,
): BossIntroLayout | null {
  const dropped: string[] = [];
  let cur = {
    quote: content.quote,
    name: content.name,
    description: content.description,
    tips: [...content.tips],
    weaknesses: [...content.weaknesses],
  };
  const steps: { label: string; apply: () => void }[] = [
    { label: "description", apply: () => (cur = { ...cur, description: null }) },
    { label: "tips", apply: () => (cur = { ...cur, tips: [] }) },
    { label: "weaknesses", apply: () => (cur = { ...cur, weaknesses: [] }) },
  ];
  for (;;) {
    const h = heightOf(cur);
    if (h <= availableH) return { ...cur, height: h, dropped };
    const next = steps.shift();
    if (!next) return null; // 名言 + 名字都放不下 ⇒ 不畫
    // 只有真的丟掉東西才記一筆 —— 本來就沒有的段落不算「被丟掉」。
    const had =
      next.label === "description"
        ? cur.description !== null
        : next.label === "tips"
          ? cur.tips.length > 0
          : cur.weaknesses.length > 0;
    next.apply();
    if (had) dropped.push(next.label);
  }
}

/**
 * 這面板可以畫在哪 —— 中央走廊，**降臨橫幅底下**，或 `null`。
 *
 * 障礙物清單直接重用 {@link mobBossObstacles}：常駐槽位、技能列、版本徽章帶
 * （#66 的底部 10px）、第一回合控制圖例。多寫一份副本就是多一份會 drift 的
 * 「HUD 上有什麼」的知識，而它的分歧會以「新面板蓋住玩家血條」的形態出現。
 */
export function bossIntroRect(
  viewport: HudViewport,
  opts: BossPlacementOpts,
): HudRect | null {
  const mid = viewport.width / 2;
  // 降臨橫幅在同一段時間也在畫（`BOSS_BANNER_MS` 4.6s vs 這裡的 5s + 淡出），
  // 所以從它的**下緣**起算，而不是跟它搶同一條 y。
  let top = TOP_CENTRE_BAND_END + HUD_GAP + BOSS_BANNER_H + HUD_GAP;
  let bottom = viewport.height - ABILITY_CLUSTER_H - HUD_GAP;

  for (const legend of legendObstacleRects(viewport, {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
  })) {
    if (legend.x < mid && legend.x + legend.w > mid) {
      top = Math.max(top, legend.y + legend.h + HUD_GAP);
    }
  }
  if (opts.barRect) {
    const b = opts.barRect;
    if (b.x < mid && b.x + b.w > mid) {
      if (b.y + b.h <= (top + bottom) / 2) top = Math.max(top, b.y + b.h + HUD_GAP);
      else bottom = Math.min(bottom, b.y - HUD_GAP);
    }
  }

  const corridor = bottom - top;
  if (corridor < opts.minH) return null;
  const h = Math.min(opts.wantH, corridor);
  if (h < opts.minH) return null;
  const y = top;

  let left = 0;
  let right = 0;
  for (const { rect: r } of mobBossObstacles(viewport, opts)) {
    if (r.y >= y + h || r.y + r.h <= y) continue;
    // 橫跨中線的東西＝這一條 y 帶根本沒有置中的空隙，說出來而不是畫上去。
    if (r.x < mid && r.x + r.w > mid) return null;
    if (r.x + r.w <= mid) left = Math.max(left, r.x + r.w);
    else right = Math.max(right, viewport.width - r.x);
  }
  const halfFree = Math.min(mid - left, mid - right) - HUD_GAP;
  const w = Math.min(BOSS_INTRO_PREF_W, halfFree * 2);
  if (w < BOSS_INTRO_MIN_W) return null;

  return { x: Math.round((viewport.width - w) / 2), y: Math.round(y), w: Math.round(w), h };
}

/**
 * 解出來的矩形有沒有壓到任何常駐 chrome —— **空陣列是唯一及格的答案**。
 *
 * ⚠️ 刻意**不是**用 {@link mobBossObstacles} 建的（和 `mobBossCollisions` 同一個
 * 理由）：拿擺放時參考的同一份清單去驗擺放結果是套套邏輯 —— 從那份清單裡漏掉
 * 一個槽位，面板會蓋上去，而這支函式讀著同一份縮短的清單照樣回報「乾淨」。
 * 重複本身就是守衛。
 */
export function bossIntroCollisions(viewport: HudViewport, opts: BossPlacementOpts): string[] {
  const rect = bossIntroRect(viewport, opts);
  if (!rect) return [];
  const hits: string[] = [];
  for (const o of mobBossObstacles(viewport, opts)) {
    if (hudRectsOverlap(rect, o.rect)) hits.push(o.id);
  }
  return hits.sort();
}

/**
 * 一個入口：這一則 spawn 事件現在要畫的矩形 + 版面，或 `null`。
 *
 * 先算內容 → 用內容要的高度去要一個矩形 → 用**真的拿到的**高度重新決定畫哪幾段。
 * 順序是重點：拿不到那麼高的走廊時，砍掉的是段落，不是把六行擠進三行的高度裡。
 */
export function bossIntroPlacement(
  content: BossIntroContent,
  viewport: HudViewport,
  opts: { touch: boolean; legendUp: boolean; couchPlayers?: number; barRect?: HudRect | null },
): { rect: HudRect; layout: BossIntroLayout } | null {
  const full = bossIntroLayout(content, Number.POSITIVE_INFINITY);
  if (!full) return null;
  // 最低要求＝「名言 + 名字」那一版的高度：走廊給不出這麼多就整段不畫。
  // 不用 0 —— 0 高的矩形是一個看不見的面板，那是失敗形態①而不是一個 fallback。
  const minH =
    BOSS_INTRO_PAD_H + BOSS_INTRO_NAME_H + (content.quote === null ? 0 : BOSS_INTRO_QUOTE_H);
  const base = {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
    barRect: opts.barRect,
  };
  const rect = bossIntroRect(viewport, { ...base, wantH: full.height, minH });
  if (!rect) return null;
  const layout = bossIntroLayout(content, rect.h);
  if (!layout) return null;
  return { rect, layout };
}
