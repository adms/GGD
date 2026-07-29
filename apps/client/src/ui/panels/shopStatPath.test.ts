/**
 * shopStatPath — 商店的「N / 20」與屬性面板套用 (#211).
 *
 * owner: 「商店顯示問題：能力屬性強化 N/20 · 屬性面板套用實作」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼這個檔案存在,而 shopStatVisibility.test.ts 不夠
 * ═══════════════════════════════════════════════════════════════════════════
 * `shopStatVisibility` 證明的是「買到的三圍有走進管線」。它證明不了兩件事,而
 * 這兩件事正好是 #211 點名的:
 *
 *  1. **分子分母是不是跟 sim 同一個來源。** `statPathSnapshotOf`
 *     (sim/stats/matchLedger) 的檔頭寫著它把 champion 的兩個欄位交給
 *     「商店面板呼叫的同一支 `statPathView`」—— 在 #211 之前**那句話是假的**:
 *     面板自己 import `STAT_TICK_TARGET` 當分母、自己用 `capstonePct > 0` 判斷
 *     路線還活著,而 `statPathView` 算好的 `remaining` / `atRisk` 在整個 client
 *     **沒有任何消費者**。兩套手寫規則擺在一支共用函式旁邊,就是「商店說 3/20、
 *     報表說 11/20,兩邊都言之鑿鑿」的做法。(形態②)
 *
 *  2. **面板印出來的數字有沒有跟著疊層動。** 既有測試斷言的是
 *     `computeStatBlock` 的回傳值,那是**管線**,不是**畫面**。管線對了而
 *     `StatPanel` 印的是另一份資料,測試照樣全綠 —— 這裡的斷言一律讀
 *     `renderToStaticMarkup` 吐出來的字串。(形態⑤)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 突變驗證(2026-07-30 實際跑過,見回報)
 * ═══════════════════════════════════════════════════════════════════════════
 *   MerchantShop.tsx `statPathView(props.statStacks, props.capstonePct)`
 *     → `statPathView(0, props.capstonePct)`      ⇒ 「分子是座位的層數」紅
 *   statPreview.ts   `champ.attrBonus.str = bonus.str`  刪掉
 *     → 「疊到 N 層,面板的力量與攻擊力都跟著動」紅
 *
 * 客戶端 vitest 跑在 node env,所以渲染走 `react-dom/server`,和
 * shopStatVisibility.test.ts / MerchantShop.test.ts 同一條路。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { championAttribute } from "@ggd/shared/sim/stats/attributes";
import { statPathView } from "@ggd/shared/sim/economy/statPath";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import type { ChampionId } from "@ggd/shared/ids";
import { computeStatBlock, computeBaseStatBlock } from "./statPreview";
import { formatAttrValue, formatStatValue } from "./statDisplay";
import { StatPanel } from "./MerchantShop";

const CHAMP = "thorne";
const LEVEL = 5;

beforeAll(() => {
  registerSkeletonContent();
});

/**
 * A NON-NEUTRAL combat-env. #125's rule is that every displayed number is the
 * post-multiplier FINAL value, so the attribute-applied assertions run under a
 * table that is NOT all-1.0 — under the neutral table a panel that forgot the
 * env would produce byte-identical output and the assertion would prove nothing
 * about #125 at all (形態④).
 */
const HOT_ENV = { ...DEFAULT_COMBAT_ENV, attackDamage: 1.75, maxHealth: 1.4 };

function ctx(attrBonus?: number[], env = HOT_ENV) {
  return {
    championId: CHAMP,
    level: LEVEL,
    abilityRanks: [1, 0, 0, 0],
    items: ["", "", "", "", "", ""],
    augments: [],
    statCapstonePct: 0,
    attrBonus,
    env,
  };
}

/** Render the shop's attribute panel exactly as MerchantShop mounts it. */
function renderPanel(opts: {
  attrBonus?: number[];
  statStacks?: number;
  capstonePct?: number;
  env?: typeof HOT_ENV;
}): string {
  const c = ctx(opts.attrBonus, opts.env ?? HOT_ENV);
  const block = computeStatBlock(c) ?? zeroStats();
  const base = computeBaseStatBlock(c);
  return renderToStaticMarkup(
    createElement(StatPanel, {
      block,
      base,
      preview: null,
      exact: true,
      // 0 / 0 = 「線上沒有權威值」, so `shown()` prints the reconstructed block
      // and the assertions below are about the panel's own arithmetic.
      authMaxHp: 0,
      authMaxMana: 0,
      level: LEVEL,
      statStacks: opts.statStacks ?? 0,
      capstonePct: opts.capstonePct ?? 0,
      championId: CHAMP,
      attrBonus: opts.attrBonus,
    }),
  );
}

// ───────────────────────────────────────────────────────────── #211 · N / 20 ──

describe("N / 20 是 statPathView 算的,不是面板自己算的", () => {
  it("分子是座位的層數,分母是共用函式的 target", () => {
    // 分母從共用函式讀回來,不是打 20。sim 改了 STAT_TICK_TARGET,這條會跟著動
    // 而不是留下一個對不上的畫面。
    const target = statPathView(0, 0).target;
    expect(target).toBeGreaterThan(0);

    for (const stacks of [0, 1, 7, 19]) {
      const html = renderPanel({ statStacks: stacks });
      expect(html, `疊 ${stacks} 層時面板沒印出 ${stacks} / ${target}`).toContain(
        `屬性強化 ${stacks} / ${target} 次`,
      );
    }
  });

  it("疊到 target 仍在路線上時,分子分母相等而不是翻頁", () => {
    // statStacks 到頂但 capstone 還沒發(#104 的 round gate 擋著)是真實狀態,
    // 面板必須照 statPathView 說的 live=true 繼續印 20 / 20,而不是切到
    // 「傳說已達成」——後者會宣告一件伺服器還沒做的事。
    const view = statPathView(20, 0);
    expect(view.live).toBe(true);
    expect(view.remaining).toBe(0);
    const html = renderPanel({ statStacks: 20, capstonePct: 0 });
    expect(html).toContain(`屬性強化 20 / ${view.target} 次`);
    expect(html).not.toContain("傳說已達成");
  });

  it("capstone 落地之後改印已達成,而且 N/20 整條消失", () => {
    const view = statPathView(20, 80);
    expect(view.live).toBe(false);
    expect(view.atRisk).toBe(0); // 已經拿到了,買道具毀不掉任何東西
    const html = renderPanel({ statStacks: 20, capstonePct: 80 });
    expect(html).toContain("傳說已達成 +80%");
    expect(html).not.toContain("/ 20 次");
  });

  it("歸零警告讀的是 statPathView.atRisk / .remaining,不是 statStacks > 0", () => {
    // 這兩個欄位在 #211 之前整個 client 沒有任何消費者。它們是「按下去之前」
    // 才有用的資訊 —— 事後再說就只是通知玩家他已經損失了。
    const html = renderPanel({ statStacks: 19 });
    const view = statPathView(19, 0);
    expect(view.atRisk).toBe(19);
    expect(view.remaining).toBe(1);
    expect(html).toContain(`已購買 ${view.atRisk} 次`);
    expect(html).toContain(`還差 ${view.remaining} 次`);

    // 零層時不該有歸零警告 —— 沒有東西可以被歸零。
    const zero = renderPanel({ statStacks: 0 });
    expect(zero).not.toContain("都會把它歸零");
    expect(zero).toContain(`累積 ${view.target} 次可獲得`);
  });
});

// ────────────────────────────────────────────────── #211 · 屬性面板真的套用 ──

describe("疊到 N 層 → 面板顯示的力量值跟著變", () => {
  /**
   * THE guard the task names. 力量 是 #248 的 STR:它同時餵 生命 / 生命回復 /
   * 攻擊力(`ATTR_STAT_SOURCE`),所以「力量那一格動了但攻擊力沒動」是一個
   * 真實而且安靜的壞法 —— 三圍列自己畫自己的字串,和 15 格屬性表用的是兩條
   * 不同的路。兩邊都斷言,才擋得住只有一邊接上的情形。
   */
  it("三圍列與 15 格屬性表兩邊都跟著疊層走", () => {
    const def = Champions.get(CHAMP as ChampionId);
    const innateStr = championAttribute(def, "str", LEVEL);

    const none = renderPanel({ attrBonus: [0, 0, 0] });
    const six = renderPanel({ attrBonus: [6, 0, 0] });

    // (1) 三圍列:印出來的總值 = 天生 + 買到的,而且兩次渲染不一樣
    expect(none).toContain(formatAttrValue(innateStr));
    expect(six).toContain(formatAttrValue(innateStr + 6));
    expect(six).toContain("(+6.0)");
    expect(none).not.toContain("(+6.0)");

    // (2) 15 格屬性表:攻擊力那一格的**字串**必須跟著動
    const adNone = computeStatBlock(ctx([0, 0, 0]))![Stat.AttackDamage];
    const adSix = computeStatBlock(ctx([6, 0, 0]))![Stat.AttackDamage];
    expect(adSix).toBeGreaterThan(adNone);
    expect(none).toContain(formatStatValue(Stat.AttackDamage, adNone));
    expect(six).toContain(formatStatValue(Stat.AttackDamage, adSix));
    // 方向也要對:兩個字串不能相同,否則「有差異」只是格式化的巧合
    expect(formatStatValue(Stat.AttackDamage, adSix)).not.toBe(
      formatStatValue(Stat.AttackDamage, adNone),
    );
  });

  it("面板印的是 POST-MULTIPLIER 的最終值(#125),不是 base", () => {
    // 同一個英雄、同一份 build,只換 combat-env。面板的攻擊力字串必須跟著換:
    // 一個讀 base 的面板在這裡會印出兩個一模一樣的數字。
    const NEUTRAL = { ...DEFAULT_COMBAT_ENV, attackDamage: 1, maxHealth: 1 };
    const hot = renderPanel({ attrBonus: [6, 0, 0], env: HOT_ENV });
    const cold = renderPanel({ attrBonus: [6, 0, 0], env: NEUTRAL });

    const adHot = computeStatBlock(ctx([6, 0, 0], HOT_ENV))![Stat.AttackDamage];
    const adCold = computeStatBlock(ctx([6, 0, 0], NEUTRAL))![Stat.AttackDamage];
    expect(adHot).toBeGreaterThan(adCold);
    expect(hot).toContain(formatStatValue(Stat.AttackDamage, adHot));
    expect(cold).toContain(formatStatValue(Stat.AttackDamage, adCold));

    // …而三圍**不**跟著 env 動:屬性不是被 env 縮放的東西,係數縮放的是
    // 屬性→屬性值那一步(statDisplay.attributeRows 的檔頭寫了這件事)。
    // 這條在說「上面那個差異來自 env 套用到 STAT,不是套用到屬性」。
    const def = Champions.get(CHAMP as ChampionId);
    const strTotal = formatAttrValue(championAttribute(def, "str", LEVEL) + 6);
    expect(hot).toContain(strTotal);
    expect(cold).toContain(strTotal);
  });

  it("疊層是連續的,不是有沒有買過的開關", () => {
    // 「買了就 +1 格」這種實作在 0→N 的斷言下會全綠。餵三個不同的層數,要求
    // 三個不同的畫面數字。
    const seen = new Set<string>();
    for (const n of [1, 4, 9]) {
      const ad = computeStatBlock(ctx([n, 0, 0]))![Stat.AttackDamage];
      const html = renderPanel({ attrBonus: [n, 0, 0] });
      const text = formatStatValue(Stat.AttackDamage, ad);
      expect(html, `疊 ${n} 點力量時面板沒有印出 ${text}`).toContain(text);
      seen.add(text);
    }
    expect(seen.size, "三個不同的力量疊層產生了同一個攻擊力字串").toBe(3);
  });
});
