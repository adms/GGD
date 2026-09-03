/**
 * merchantTips — what the 旅行商人 says while you shop (task #148, widened by GH#971).
 *
 * During the intermission the merchant cycles a rotating message box: a game
 * RULE, a play TIP, or an 出裝 (build) recommendation, one at a time, so a new
 * player learns the game just by standing at the counter. This file is the pure,
 * node-testable half — the tip DATA plus the "which tip next" rule — with no
 * React and no Babylon; the box that shows it is ui/MerchantTipBox.tsx and the
 * rotation cadence lives there.
 *
 * ⭐ WHY THIS FILE MATTERS MORE THAN ITS SIZE SUGGESTS (owner 2026-09-02):
 *   > 「商店提示攻略 是**商人每隔一段時間會隨機講攻略提示 幫助玩家了解遊戲**」
 *   > 「請你**更新並擴大 遊戲玩法的提示**，**許多人並不知道整體玩法 跟如何玩得更好**」
 * This rotation is the ONLY place in the game that actively teaches the format,
 * so a gap here is a mechanic nobody finds out about.
 *
 * ⛔⛔ TWO RULES THIS TABLE OBEYS, BOTH ENFORCED BY merchantTips.test.ts:
 *
 *   ①  **⛔ NO LITERAL NUMBER MAY APPEAR IN A TEMPLATE.** (CLAUDE.md 第〇·四守則
 *      —— a value must not have a second home.) Every quantity is a `{{placeholder}}`
 *      resolved at module load from the SHIPPED shared table it belongs to, so
 *      when the owner turns `statTickTarget` the merchant's line turns with it.
 *      The guard rejects any ASCII digit inside a template's `text`.
 *
 *   ②  **⛔ NO TIP MAY DESCRIBE SOMETHING THAT DOES NOT HAPPEN.** (第一·五守則.)
 *      Every row carries a `source` naming the config field / module the claim
 *      is read off. The guard cannot check that a sentence is TRUE, but it can
 *      check that its author had to name where the mechanic lives — and the
 *      review that produced this table (GH#971) did exactly that, line by line.
 *
 * WHY A DEDICATED PICKER. "Random, but never the same tip twice in a row" is the
 * one rule with a sharp edge — a naïve `floor(random()*n)` repeats ~1/n of the
 * time, which reads as a bug ("it froze"). `nextTipIndex` draws uniformly from
 * the OTHER indices instead, so an immediate repeat is impossible BY
 * CONSTRUCTION rather than by re-rolling, and that guarantee is what the test
 * pins.
 *
 * ⭐ AND WHY THE FIRST PICK IS NOT UNIFORM (GH#971 Known risks). An intermission
 * is ~25 s at a 5 s cadence ⇒ a player sees ~5 lines out of {@link MERCHANT_TIPS}.
 * With the pool widened past thirty, pure uniform rotation means a new player can
 * finish a whole match without ever being told that the fire ring kills them.
 * So the FIRST line of a session is drawn from the {@link PRIORITY_TIP_COUNT}
 * survival-critical rules at the head of the table; everything after that is the
 * old uniform no-repeat draw.
 */
import { TEAM_COUNT, TEAM_SIZE, TICK_HZ } from "@ggd/shared/constants";
import { INVENTORY_SLOTS, SELL_REFUND } from "@ggd/shared/sim/economy/shop";
import {
  CAPSTONE_MAX_PCT,
  CAPSTONE_MIN_PCT,
  LEGENDARY_ORB_PRICE,
  STAT_TICK_PRICE,
  STAT_TICK_TARGET,
} from "@ggd/shared/sim/economy/itemTiers";
import { DEFAULT_ECONOMY } from "@ggd/shared/sim/economy/economyRules";
import { DEFAULT_FIRE_RING_CONFIG } from "@ggd/shared/content/schema/config/match";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config/arenaRules.mobWaves";
import {
  DEFAULT_FINAL_ROUND,
  DEFAULT_FLOWER_CONFIG,
  DEFAULT_GUARDIAN_TOWER_CONFIG,
  DEFAULT_REVIVE_CIRCLE_CONFIG,
} from "@ggd/shared/content/schema/config/arenaRules";

/** A tip's kind — drives the little coloured tag the box shows. */
export type MerchantTipKind = "rule" | "tip" | "build";

/**
 * ⭐ What the line is ABOUT. This is the coverage axis GH#971 exists for: the
 * old 12-line pool had `kind` but no `topic`, so "zero lines mention the zombie
 * waves" was invisible to every guard. The test asserts every topic below is
 * represented, which turns "we forgot to teach X" into a red test.
 */
export type MerchantTipTopic =
  | "format" // 賽制:四隊兩場同時開打、幾回合、不會被淘汰
  | "round" // 回合節奏:中場、Ready、回合表
  | "mobs" // 殭屍波次 —— 每回合的主要收入
  | "boss" // 殭屍王 / 特殊殭屍
  | "firering" // 火圈(收縮) —— 會直接殺死玩家
  | "draft" // 隨機能力三選一
  | "grail" // 寶具 / EX 解放
  | "revive" // 復活圈
  | "grade" // 回合評分 / 結算
  | "objective" // 守護塔 · 花 · 掉落金幣
  | "shop" // 商店操作:預覽、復原、格數、賣出
  | "statpath" // 連續屬性強化 → 傳說級頂點
  | "skills" // 技能冷卻五級距
  | "team"; // 隊友協作:助攻、拉人

/** Every topic that MUST have at least one line (the guard reads this list). */
export const MERCHANT_TIP_TOPICS: readonly MerchantTipTopic[] = [
  "format",
  "round",
  "mobs",
  "boss",
  "firering",
  "draft",
  "grail",
  "revive",
  "grade",
  "objective",
  "shop",
  "statpath",
  "skills",
  "team",
];

/** An authored row: the template BEFORE placeholders are resolved. */
export interface MerchantTipTemplate {
  readonly kind: MerchantTipKind;
  readonly topic: MerchantTipTopic;
  /** ⛔ Digits are forbidden here — use a `{{placeholder}}` from TIP_VALUES. */
  readonly text: string;
  /** Where the mechanic this line describes actually lives. ⛔ Never empty. */
  readonly source: string;
}

/** A resolved row, as the box consumes it. */
export interface MerchantTip {
  readonly kind: MerchantTipKind;
  readonly topic: MerchantTipTopic;
  readonly text: string;
}

/** Human label + accent for each kind (the box reads these, never hard-codes). */
export const TIP_KIND_META: Record<MerchantTipKind, { label: string; accent: string }> = {
  rule: { label: "規則", accent: "#7fb2ff" },
  tip: { label: "提示", accent: "#7fe0a0" },
  build: { label: "出裝建議", accent: "#f2a13c" },
};

/**
 * ⭐ THE ONE PLACE A NUMBER MAY BE READ. Each entry points at the shipped
 * table that owns the value — ⛔ nothing here is a literal the merchant would
 * keep repeating after the owner turned the knob. A value that resolves to
 * `undefined` (an optional block emptied out upstream) is NOT silently papered
 * over with a fallback: the line that needs it is dropped from the pool and the
 * guard goes red naming the placeholder.
 */
export const TIP_VALUES: Readonly<Record<string, number | string | undefined>> = {
  teamCount: TEAM_COUNT,
  teamSize: TEAM_SIZE,
  // 一場房間把 TEAM_COUNT 支隊伍兩兩配對成同時開打的對戰分區（PairedDuels）。
  duelCount: Math.max(1, Math.floor(TEAM_COUNT / 2)),
  finalRound: DEFAULT_FINAL_ROUND,
  mobFromRound: DEFAULT_MOB_WAVES_CONFIG.fromRound,
  mobXpMultiplier: DEFAULT_MOB_WAVES_CONFIG.reward?.xpMultiplier,
  bossKillThreshold: DEFAULT_MOB_WAVES_CONFIG.boss?.killThreshold,
  fireRingStartSec: DEFAULT_FIRE_RING_CONFIG.startSec,
  reviveChannelSec: DEFAULT_REVIVE_CIRCLE_CONFIG.channelSec,
  revivesPerTeamPerRound: DEFAULT_REVIVE_CIRCLE_CONFIG.revivesPerTeamPerRound,
  reviveHpPct: Math.round(DEFAULT_REVIVE_CIRCLE_CONFIG.reviveHpPctMax * 100),
  flowerHealPct: Math.round(DEFAULT_FLOWER_CONFIG.healPctMax * 100),
  towerBuffSec: DEFAULT_GUARDIAN_TOWER_CONFIG.buffDurationSec,
  inventorySlots: INVENTORY_SLOTS,
  sellRefundPct: Math.round(SELL_REFUND * 100),
  legendaryOrbPrice: LEGENDARY_ORB_PRICE,
  statTickTarget: STAT_TICK_TARGET,
  statTickPrice: STAT_TICK_PRICE,
  statPathTotalGold: STAT_TICK_PRICE * STAT_TICK_TARGET,
  capstoneRoundGate: DEFAULT_ECONOMY.capstoneRoundGate,
  capstoneMinPct: CAPSTONE_MIN_PCT,
  capstoneMaxPct: CAPSTONE_MAX_PCT,
  assistWindowSec: Math.round(DEFAULT_ECONOMY.assistWindowTicks / TICK_HZ),
};

/**
 * ⭐ The survival-critical head of the table. The first line of a session is
 * drawn from these, because a player who never learns them loses rounds to
 * mechanics they did not know existed. Keep them at indices 0..N−1 — the
 * constant IS the slice length, and the guard pins that every one of them is a
 * `rule`.
 */
export const PRIORITY_TIP_COUNT = 6;

/**
 * The rotation pool. Traditional Chinese to match the game's UI.
 *
 * ⭐ Each line was re-verified against shipping content on 2026-09-03 (GH#971);
 * `source` is where it was read. Keep every line short enough to read inside 5 s.
 */
export const MERCHANT_TIP_TEMPLATES: readonly MerchantTipTemplate[] = [
  // ── 0..5 一定要先講的（PRIORITY_TIP_COUNT）────────────────────────────
  {
    kind: "rule",
    topic: "firering",
    text: "戰鬥拖久了場邊會燒起火圈並一路收縮——圈外持續掉血，而且**免死效果救不了你**。",
    source: "config.match@1 match.fireRing.burnCurve / lethalSaveApplies=false",
  },
  {
    kind: "rule",
    topic: "revive",
    text: "陣亡不代表出局：屍體會留下復活圈，隊友站進去引導 {{reviveChannelSec}} 秒就能把你拉起來。",
    source: "config.arena-rules@1 reviveCircles.channelSec",
  },
  {
    kind: "rule",
    topic: "mobs",
    text: "第 {{mobFromRound}} 回合起場上開始湧出殭屍——打它們拿經驗與金幣，那是每回合的主要收入。",
    source: "config.arena-rules@1 mobWaves.fromRound / mobWaves.reward",
  },
  {
    kind: "rule",
    topic: "format",
    text: "{{teamCount}} 支隊伍拆成 {{duelCount}} 場 {{teamSize}}v{{teamSize}} 同時開打，你只管眼前這一場。",
    source: "packages/shared/src/constants.ts TEAM_COUNT / TEAM_SIZE",
  },
  {
    kind: "rule",
    topic: "format",
    text: "隊伍血條被扣光**不會讓你出局**——最多打到第 {{finalRound}} 回合，隨時翻得回來。",
    source: "config.arena-rules@1 finalRound（maxRounds 只會更短）；match.ts 取消淘汰（owner 2026-07-27）",
  },
  {
    kind: "rule",
    topic: "round",
    text: "**全員都按 Ready** 才會提前開打；沒按滿，時間到也會自動開始。",
    source: "MatchController.allSeatsReady（每一個已生成的座位都要 ready）",
  },

  // ── 其餘規則 ───────────────────────────────────────────────────────
  {
    kind: "rule",
    topic: "round",
    text: "中場是安全的整備時間，戰鬥不會在這裡開打。",
    source: "config.match@1 match.intermissionSec 階段",
  },
  {
    kind: "rule",
    topic: "boss",
    text: "你自己累積打倒 {{bossKillThreshold}} 隻殭屍，就會召喚出**殭屍王**——很肥很痛，賞金也最高。",
    source: "config.arena-rules@1 mobWaves.boss.killThreshold / bountyGold",
  },
  {
    kind: "rule",
    topic: "boss",
    text: "偶爾會混進**特殊殭屍**：更大、更慢、打得更痛，而賞金高得多。",
    source: "config.arena-rules@1 mobWaves.special（sizeMult/moveSpeedMult/damageMult/rewardMult）",
  },
  {
    kind: "rule",
    topic: "draft",
    text: "每回合開場發**三選一**強化卡，品質隨回合升級：白銀 → 黃金 → 稜彩。",
    source: "config.arena-rules@1 rounds[].augmentTier",
  },
  {
    kind: "rule",
    topic: "grail",
    text: "**寶具**（武器卡）只在特定回合發，而且不保證出現——看到了就好好挑。",
    source: "config.arena-rules@1 rounds[].weaponLootTable / weaponDraftPct",
  },
  {
    kind: "rule",
    topic: "grail",
    text: "最終回合的寶具池會換成 **EX 解放**——那是一場裡最強的一批卡。",
    source: "config.arena-rules@1 rounds 最終回合 weaponLootTable=ex-release-weapons",
  },
  {
    kind: "rule",
    topic: "grade",
    text: "回合評分不只看擊殺：傷害、承傷、生存、輔助、目標與命中率都各佔一份。",
    source: "config.round-grade@1 grade.weights",
  },
  {
    kind: "rule",
    topic: "objective",
    text: "場中的**守護塔**會定期轟炸，但打倒它會給金幣、補滿血魔，還留下 {{towerBuffSec}} 秒增益。",
    source: "config.arena-rules@1 guardianTower.rewardGold / restoreHpPct / buffDurationSec",
  },

  // ── 提示 ─────────────────────────────────────────────────────────
  {
    kind: "tip",
    topic: "firering",
    text: "最快在戰鬥第 {{fireRingStartSec}} 秒火圈就點燃——之前沒解決的架，之後只會更難打。",
    source: "config.match@1 match.fireRing.startSec",
  },
  {
    kind: "tip",
    topic: "firering",
    text: "火圈的灼燒**會越燒越痛**——早一秒回到圈內，就少掉一大截血。",
    source: "config.match@1 match.fireRing.burnCurve（pctPerSec 隨秒數升高）",
  },
  {
    kind: "tip",
    topic: "mobs",
    text: "殭屍給的經驗有 {{mobXpMultiplier}} 倍加成，落後的時候清殭屍是最快的追分方式。",
    source: "config.arena-rules@1 mobWaves.reward.xpMultiplier",
  },
  {
    kind: "tip",
    topic: "mobs",
    text: "殭屍一波接一波湧出，別讓它們在你背後疊成一大群才回頭處理。",
    source: "config.arena-rules@1 mobWaves.waveIntervalSec / maxAlivePerZone",
  },
  {
    kind: "tip",
    topic: "mobs",
    text: "後面的回合殭屍會越來越多也越來越強，清場的效率比單挑更決定勝負。",
    source: "config.arena-rules@1 mobWaves.schedule / mob.levelCurve",
  },
  {
    kind: "tip",
    topic: "objective",
    text: "場邊的花打破會噴出治療：回 {{flowerHealPct}}% 最大生命與魔力，撐不住時先繞過去。",
    source: "config.arena-rules@1 flowers.healPctMax / manaPctMax",
  },
  {
    kind: "tip",
    topic: "objective",
    text: "地上掉的金幣是白撿的裝備錢，走位順路撿掉別留給對面。",
    source: "config.arena-rules@1 goldDrop.coinsPerRound / pickupRadius",
  },
  {
    kind: "tip",
    topic: "revive",
    text: "復活圈**被打不會中斷，被控場才會**——拉人之前先確認沒人能定住你。",
    source: "config.arena-rules@1 reviveCircles.damageInterrupts=false / ccInterrupts=true",
  },
  {
    kind: "tip",
    topic: "revive",
    text: "每隊每回合只救得起 {{revivesPerTeamPerRound}} 次，而且被拉起來只有 {{reviveHpPct}}% 血魔。",
    source: "config.arena-rules@1 reviveCircles.revivesPerTeamPerRound / reviveHpPctMax",
  },
  {
    kind: "tip",
    topic: "skills",
    text: "本作冷卻已大幅縮短，別吝嗇，多放技能。",
    source: "config.combat-env@1 multipliers.cooldown（owner 2026-08-23「冷卻時間0.3」）",
  },
  {
    kind: "tip",
    topic: "skills",
    text: "冷卻分極小/小/中/大/極大五級：範圍技一定比同級的單體技久，開大招前先想清楚。",
    source: "config.cooldown-tiers@1 seconds.單體 / seconds.範圍",
  },
  {
    kind: "tip",
    topic: "team",
    text: "沒搶到人頭也有錢：擊殺前 {{assistWindowSec}} 秒內出過手就算助攻。",
    source: "config.match@1 economy.assistWindowTicks / assistGold",
  },
  {
    kind: "tip",
    topic: "team",
    text: "{{duelCount}} 場對戰是分開的，但商店與強化是你自己的——別為了看熱鬧丟掉整備時間。",
    source: "packages/shared/src/constants.ts TEAM_COUNT（一場房間兩個對戰分區）",
  },
  {
    kind: "tip",
    topic: "shop",
    text: "屬性面板會即時預覽「裝上這件後」的數值變化。",
    source: "apps/client/src/ui/panels/MerchantShop.tsx 「預覽中 · +為裝上此道具後」",
  },
  {
    kind: "tip",
    topic: "shop",
    text: "買錯了？點『↩ 復原上一步』就能還原這一手。",
    source: "apps/client/src/ui/panels/MerchantShop.tsx 復原上一步",
  },
  {
    kind: "tip",
    topic: "shop",
    text: "裝備欄只有 {{inventorySlots}} 格，湊齊核心那幾件再考慮換裝。",
    source: "packages/shared/src/sim/economy/shop.ts INVENTORY_SLOTS",
  },
  {
    kind: "tip",
    topic: "grade",
    text: "結算會照你這回合的實際數據列出幾條建議——照著改，比硬記數字有用。",
    source: "config.round-grade@1 grade.adviceCount / adviceCeiling",
  },
  {
    kind: "tip",
    topic: "statpath",
    text: "連續買**能力屬性強化**累積到 {{statTickTarget}} 次會解鎖傳說級頂點，中途買任何道具都會**歸零**。",
    source: "packages/shared/src/sim/economy/statPath.ts（buyItem 重置 statStacks）",
  },
  {
    kind: "tip",
    topic: "statpath",
    text: "頂點第 {{capstoneRoundGate}} 回合起才開得了，而且要 {{statPathTotalGold}} 金——決定走它就別再碰商店。",
    source: "config.match@1 economy.capstoneRoundGate / statTickPrice × statTickTarget",
  },
  {
    kind: "tip",
    topic: "statpath",
    text: "頂點會抽 {{capstoneMinPct}}~{{capstoneMaxPct}}% 的全屬性強化：期望值贏過買裝，賭的是整場的彈性。",
    source: "packages/shared/src/sim/economy/itemTiers.ts CAPSTONE_MIN_PCT / CAPSTONE_MAX_PCT",
  },

  // ── 出裝建議 ──────────────────────────────────────────────────────
  {
    kind: "build",
    topic: "shop",
    text: "爆擊流開局先買「武聖手鐲」，便宜又補爆擊。",
    source: "content/items/godie-i002.json（tier 1，爆擊）",
  },
  {
    kind: "build",
    topic: "shop",
    text: "錢不夠時，先收便宜的小件，之後再合成大裝。",
    source: "packages/shared/src/sim/economy/itemTiers.ts 分階價目",
  },
  {
    kind: "build",
    topic: "shop",
    text: "賣出只退回 {{sellRefundPct}}% 金幣，換裝前先想清楚。",
    source: "packages/shared/src/sim/economy/shop.ts SELL_REFUND",
  },
  {
    kind: "build",
    topic: "shop",
    text: "**傳說寶玉** {{legendaryOrbPrice}} 金抽一件傳說武器——沒有想要的裝時的出路。",
    source: "packages/shared/src/sim/economy/itemTiers.ts LEGENDARY_ORB_PRICE",
  },
  {
    kind: "build",
    topic: "draft",
    text: "三選一給的卡是免費的，不算「買道具」，也不會打斷你的屬性強化連段。",
    source: "packages/shared/src/sim/economy/statPath.ts（grantItemFree 不重置）",
  },
  {
    kind: "build",
    topic: "statpath",
    text: "一次能力屬性強化 {{statTickPrice}} 金，開了頭就是一條路——半途買裝等於把前面全丟掉。",
    source: "config.match@1 economy.statTickPrice",
  },
];

/** `{{placeholder}}` — the only shape a number may enter a tip through. */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Substitute `{{key}}` from `values`. Returns `null` when ANY placeholder is
 * unresolved, so an emptied-out upstream block drops the line instead of showing
 * a player raw `{{braces}}` — and the guard turns that same condition red.
 */
export function resolveTipText(
  text: string,
  values: Readonly<Record<string, number | string | undefined>> = TIP_VALUES,
): string | null {
  let missing = false;
  const out = text.replace(PLACEHOLDER, (_m, key: string) => {
    const v = values[key];
    if (v === undefined) {
      missing = true;
      return "";
    }
    return String(v);
  });
  return missing ? null : out;
}

/** Every placeholder name a template asks for (the guard walks these). */
export function tipPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

/**
 * The pool the box rotates — templates resolved against the shipped tables.
 * Same `{ kind, text }` shape it has always had, so MerchantTipBox needs no
 * change; `topic` rides along for the coverage guard.
 */
export const MERCHANT_TIPS: readonly MerchantTip[] = MERCHANT_TIP_TEMPLATES.flatMap((t) => {
  const text = resolveTipText(t.text);
  return text === null ? [] : [{ kind: t.kind, topic: t.topic, text }];
});

/**
 * The index of the tip to show NEXT, given the one showing now.
 *
 * Guarantees (pinned by merchantTips.test.ts):
 *   • the result is always a valid index in [0, count);
 *   • it is NEVER equal to `current` when there is more than one tip (no
 *     immediate repeat), because we draw from the (count − 1) OTHER indices;
 *   • from a fresh start (`current < 0` or out of range) it lands inside the
 *     PRIORITY_TIP_COUNT head of the table — the survival-critical rules — so a
 *     player who only sees a handful of lines per intermission is guaranteed to
 *     have been told one of them.
 *
 * `rand` is injectable so the rotation is deterministic under test; it defaults
 * to Math.random. The `Math.min` clamps guard the rand()===1 edge.
 */
export function nextTipIndex(current: number, count: number, rand: () => number = Math.random): number {
  if (count <= 1) return 0;
  if (current < 0 || current >= count) {
    const lead = Math.max(1, Math.min(PRIORITY_TIP_COUNT, count));
    return Math.min(lead - 1, Math.floor(rand() * lead));
  }
  // draw one of the OTHER count-1 indices, then skip over `current`
  const r = Math.min(count - 2, Math.floor(rand() * (count - 1)));
  return r >= current ? r + 1 : r;
}
