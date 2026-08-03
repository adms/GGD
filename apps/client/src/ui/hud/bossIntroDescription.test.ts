/**
 * #291 —— 「殭屍王出場的描述框 不夠大 描述還有很多沒顯示完」(owner 2026-08-03).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼「把 `descriptionMaxChars` 調大」不是修法（而測試很容易假裝它是）
 * ════════════════════════════════════════════════════════════════════════════
 * 有**三層**各自獨立在吃字，而只有第一層在後台：
 *   ① `descriptionMaxChars`（出貨 120）—— 唯一可調的那一格；
 *   ② `bossIntroModel` 的版面：`BOSS_INTRO_DESC_H = 34`，**寫死兩行**，
 *      `heightOf()` 不管字多長都只算 34；
 *   ③ `BossIntroOverlay.tsx` 描述那個 `<span>` 的 `overflow: hidden`。
 * 所以把 ① 調到 300，②③ 會把多出來的字剪掉，畫面**一個 px 都不會變**。
 *
 * ⚠️ 因此這個檔**不**斷言「`descriptionMaxChars` 變大了」——那是屬性不是行為
 * （失敗形態⑦），而且對只改了 ① 的實作照樣會過。它斷言的是兩件事：
 *   A. 畫面上**看得到**的描述字數 > 120（owner 的抱怨本身）；
 *   B. 版面**真的給了足夠的高度** —— 用元件自己的 CSS（12px 字、行高 1.35、
 *      左右各 12px 留白）獨立算出「這麼多字瀏覽器要幾行」，再去看畫出來的那個
 *      盒子扣掉其他段落之後，留給描述的還剩幾 px。
 *
 * B 那一條是關鍵：只有它會在「把 ② 改回 34」的時候紅。A 單獨存在時不會 ——
 * 字串還是 300 個字，只是有一半畫在框外（失敗形態①）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_BOSS_INTRO, bossIntroFromDoc, type ConfigBossIntroDoc } from "@ggd/shared/content";
import { Configs } from "@ggd/shared/content";
import { Champions } from "@ggd/shared/sim/content/registry";
import { MOB_BOSS_SPAWN_EVENT } from "@ggd/shared/sim/mobBoss";
import {
  bossIntroContent,
  bossIntroDescriptionHeight,
  bossIntroLayout,
  bossIntroLayoutRules,
  bossIntroPlacement,
  bossIntroRules,
} from "./bossIntroModel";
import { BOSS_INTRO_TIPS_HEAD, BOSS_INTRO_WEAK_HEAD } from "./BossIntroOverlay";
import { HudRoot } from "../HudRoot";
import {
  comboNowMs,
  hudStore,
  recordMobBossEvent,
  resetHudStore,
  type HudState,
  type LocalPlayerView,
} from "../../net/RoomStore";

const TAG = "boss-intro";
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const CHAMP = "godie-zombiex";

/** 出貨的那一份設定 —— 被測的是出貨的那個（失敗形態⑤）。 */
const SHIPPED_DOC = JSON.parse(
  readFileSync(join(REPO, "content/config/boss-intro.json"), "utf8"),
) as ConfigBossIntroDoc;

/**
 * 一段 320 字的描述。長度是刻意的：出貨的 `descriptionMaxChars` 是 300，所以這一段
 * 會被截到 300 + 省略號 —— 也就是**真的用滿**那一格，而不是剛好比它短。
 */
const LONG_DESC = `故事：\n${"黑泥從裂縫裡溢出來的那一天沒有人記得日期，只記得味道。".repeat(12)}`;

/** 只留瀏覽器會畫出來的字：標籤連同屬性一起剝掉，所以 aria-label 無法代打。 */
function visibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** `<span data-boss-intro="description" …>…</span>` 的文字內容。 */
function descriptionOnScreen(html: string): string {
  const m = /<span data-boss-intro="description"[^>]*>([\s\S]*?)<\/span>/.exec(html);
  return m ? visibleText(m[1]!) : "";
}

/** 那一個 span 的 style 字串（要證明它沒有在剪字）。 */
function descriptionStyle(html: string): string {
  const m = /<span data-boss-intro="description" style="([^"]*)"/.exec(html);
  return m ? m[1]! : "";
}

/** 出場面板外框的 `height` / `width`，px。找不到就 -1。 */
function panelBox(html: string): { w: number; h: number } {
  const m = /<div data-boss-intro="panel"[^>]*style="([^"]*)"/.exec(html);
  if (!m) return { w: -1, h: -1 };
  const w = /width:(\d+(?:\.\d+)?)px/.exec(m[1]!);
  const h = /height:(\d+(?:\.\d+)?)px/.exec(m[1]!);
  return { w: w ? Number(w[1]) : -1, h: h ? Number(h[1]) : -1 };
}

const localPlayer = (seatId: number): LocalPlayerView => ({
  player: 0,
  accountId: `acct-${seatId}`,
  seatId,
  entityId: null,
  teamId: 1,
  displayName: "me",
  hp: 92,
  maxHp: 100,
  mana: 0,
  maxMana: 0,
  shield: 0,
});

function inCombat(over: Partial<HudState> = {}): void {
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    round: 3,
    localSeatId: 2,
    localMaxHp: 100,
    localHp: 92,
    localAlive: true,
    localPlayers: [localPlayer(2)],
    ...over,
  });
}

/** 王剛剛出場（`comboNowMs()` 而不是 0 —— node 下 0 早就過期了）。 */
function bossJustArrived(): void {
  inCombat();
  recordMobBossEvent(
    {
      type: MOB_BOSS_SPAWN_EVENT,
      tick: 900,
      data: {
        id: 77,
        zone: 0,
        x: 0,
        z: 0,
        maxHp: 12000,
        summoner: 102,
        summonerSeatId: 2,
        kills: 100,
        championId: CHAMP,
      },
    },
    comboNowMs(),
  );
}

/* ── 元件自己的字型度量（獨立於被測的版面設定） ───────────────────────────
 * `BossIntroOverlay.tsx` 描述那一段是 `fontSize: 12, lineHeight: 1.35`，
 * 外框 `padding: "6px 12px"`。所以一行的高度是 12 × 1.35 = 16.2px，可用寬度是
 * 面板寬度 − 24px，而一個中文字在 12px 字級下大約就是 12px 寬。
 *
 * ⚠️ 這幾個數字**刻意不從 `boss-intro.json` 的 `layout` 讀** —— 那份設定正是被測
 * 的對象。從 CSS 這一側獨立算一次，兩邊對不上才有意義。 */
const CSS_FONT_PX = 12;
const CSS_LINE_HEIGHT = 1.35;
const CSS_SIDE_PADDING = 24;

function browserLinesFor(chars: number, panelWidth: number): number {
  const usable = Math.max(1, panelWidth - CSS_SIDE_PADDING);
  const perLine = Math.max(1, Math.floor(usable / CSS_FONT_PX));
  return Math.max(1, Math.ceil(chars / perLine));
}

function browserHeightFor(chars: number, panelWidth: number): number {
  return browserLinesFor(chars, panelWidth) * Math.ceil(CSS_FONT_PX * CSS_LINE_HEIGHT);
}

describe("#291 描述框要真的裝得下描述", () => {
  beforeEach(() => {
    Configs.register(SHIPPED_DOC as never);
    Champions.register(CHAMP as never, {
      id: CHAMP,
      name: "喪標麥可",
      description: LONG_DESC,
    } as never);
  });

  it("出貨設定與程式常數沒有漂移（layout 是設定的，不是猜的）", () => {
    cover(TAG);
    // DEFAULT_* 是保險絲，`content/` 那一份才是出貨值 —— 兩份純量必須一致。
    expect(SHIPPED_DOC.descriptionMaxChars).toBe(DEFAULT_BOSS_INTRO.descriptionMaxChars);
    expect(SHIPPED_DOC.layout).toEqual(DEFAULT_BOSS_INTRO.layout);
    expect(SHIPPED_DOC.dropOrder).toEqual(DEFAULT_BOSS_INTRO.dropOrder);
    // 而且它真的過得了自己的 schema（overlay 寫入路徑今天不驗，#283）。
    expect(bossIntroFromDoc(SHIPPED_DOC).layout).toEqual(SHIPPED_DOC.layout);
    // 元件讀的是剛註冊的那一份，不是常數。
    expect(bossIntroRules().descriptionMaxChars).toBe(SHIPPED_DOC.descriptionMaxChars);
  });

  it("★ 畫面上看得到的描述字數 > 120（owner 的抱怨本身）", () => {
    cover(TAG);
    bossJustArrived();
    const html = renderToStaticMarkup(createElement(HudRoot));
    const shown = descriptionOnScreen(html);
    expect(shown.length, "出場面板根本沒畫描述（元件沒掛進渲染樹？）").toBeGreaterThan(0);
    expect(shown.length, "描述還是被截在舊的 120 字").toBeGreaterThan(120);
  });

  it("★ 版面真的給了那麼多行的高度 —— 改回固定 34px 這一條就紅", () => {
    cover(TAG);
    bossJustArrived();
    const html = renderToStaticMarkup(createElement(HudRoot));
    const shown = descriptionOnScreen(html);
    const box = panelBox(html);
    expect(box.h, "面板沒有畫出來").toBeGreaterThan(0);

    // 這一段之外，畫面上還有什麼 —— 從**畫出來的 DOM** 數，不是從設定推。
    const tipCount = (html.match(/data-boss-intro="tip"/g) ?? []).length;
    const weakCount = (html.match(/data-boss-intro="weakness"/g) ?? []).length;
    const heads =
      (visibleText(html).includes(BOSS_INTRO_TIPS_HEAD) ? 1 : 0) +
      (visibleText(html).includes(BOSS_INTRO_WEAK_HEAD) ? 1 : 0);
    const l = SHIPPED_DOC.layout!;
    const otherH = l.padH + l.nameH + heads * l.headH + (tipCount + weakCount) * l.rowH;

    // 盒子扣掉其他段落之後，留給描述的 px。
    const allottedForDescription = box.h - otherH;
    // 瀏覽器實際需要的 px（從元件的 CSS 獨立算，見上面的常數）。
    const needed = browserHeightFor(shown.length, box.w);

    expect(
      allottedForDescription,
      `描述有 ${shown.length} 字、需要約 ${needed}px，版面只給了 ${allottedForDescription}px —— ` +
        "多出來的字會被外框的 overflow 吃掉，這正是 owner 看到的「顯示不完」",
    ).toBeGreaterThanOrEqual(needed);
  });

  it("★ 畫面讀的是**設定**裡的 layout，不是程式裡的保險絲", () => {
    cover(TAG);
    // 出貨值和 `DEFAULT_BOSS_INTRO` 一模一樣（上面那條在守），所以「元件有沒有把
    // 設定接進去」用出貨值是**測不出來**的 —— 兩邊答案相同。這裡故意存一份不一樣
    // 的：描述只准佔一行，於是同一段 300 字的描述**在畫面上必須不一樣**。
    Configs.register({
      ...SHIPPED_DOC,
      layout: { ...SHIPPED_DOC.layout!, descMaxLines: 1, descCharsPerLine: 8 },
    } as never);
    bossJustArrived();
    const html = renderToStaticMarkup(createElement(HudRoot));
    const box = panelBox(html);
    expect(box.h, "面板沒有畫出來").toBeGreaterThan(0);

    // 同一份內容、同一個視窗，換回出貨的 layout。
    Configs.register(SHIPPED_DOC as never);
    bossJustArrived();
    const shippedBox = panelBox(renderToStaticMarkup(createElement(HudRoot)));
    expect(
      shippedBox.h,
      "改了 layout.descMaxLines，畫出來的盒子卻一樣高 —— 元件沒有把設定接上去",
    ).toBeGreaterThan(box.h);
  });

  it("★ 描述那個 span 自己不再剪字（第三層）", () => {
    cover(TAG);
    bossJustArrived();
    const style = descriptionStyle(renderToStaticMarkup(createElement(HudRoot)));
    expect(style, "描述那一段沒有畫出來").not.toBe("");
    // 讀的是**畫出來的**那個元素的 style，不是原始碼字串：這一個宣告會真的剪字。
    expect(style, "描述 span 還帶著 overflow:hidden —— 版面再高也一樣看不到").not.toContain(
      "overflow:hidden",
    );
  });

  it("descMaxLines 是上限，不是建議 —— 超長描述不會把要點與弱點擠掉", () => {
    cover(TAG);
    const rules = bossIntroLayoutRules(bossIntroFromDoc(SHIPPED_DOC));
    const capped = bossIntroDescriptionHeight(100_000, rules);
    expect(capped).toBe(rules.descMaxLines * rules.descLineH);
    // 而且它會隨字數成長（不是常數 —— 常數就是缺陷本身）。
    expect(bossIntroDescriptionHeight(rules.descCharsPerLine, rules)).toBe(rules.descLineH);
    expect(bossIntroDescriptionHeight(rules.descCharsPerLine * 3, rules)).toBe(rules.descLineH * 3);
  });

  it("dropOrder 是設定：改成先丟弱點，描述就活下來（走廊不夠高時）", () => {
    cover(TAG);
    const content = bossIntroContent(CHAMP, bossIntroFromDoc(SHIPPED_DOC), () => ({
      name: "喪標麥可",
      description: LONG_DESC,
    }))!;
    const shipped = bossIntroLayoutRules(bossIntroFromDoc(SHIPPED_DOC));
    const full = bossIntroLayout(content, Number.POSITIVE_INFINITY, shipped)!;
    // 一個只夠丟掉一段的高度。
    const tight = full.height - 1;

    const withShipped = bossIntroLayout(content, tight, shipped)!;
    expect(withShipped.dropped[0], "出貨順序應該先丟描述").toBe("description");
    expect(withShipped.description).toBeNull();
    expect(withShipped.weaknesses.length).toBeGreaterThan(0);

    const flipped = bossIntroLayoutRules({
      ...bossIntroFromDoc(SHIPPED_DOC),
      dropOrder: ["weaknesses", "tips", "description"],
    });
    const withFlipped = bossIntroLayout(content, tight, flipped)!;
    expect(withFlipped.dropped[0], "dropOrder 沒有生效").toBe("weaknesses");
    expect(withFlipped.description, "改了順序之後描述應該活下來").not.toBeNull();
  });

  it("dropOrder 只寫一段也不會把面板弄不見（缺的補在最後）", () => {
    cover(TAG);
    const rules = bossIntroLayoutRules({
      ...bossIntroFromDoc(SHIPPED_DOC),
      dropOrder: ["tips"],
    });
    expect(rules.dropOrder).toEqual(["tips", "description", "weaknesses"]);
  });

  it("桌機視窗真的擺得下這一面（不是只有模型算得出來）", () => {
    cover(TAG);
    const content = bossIntroContent(CHAMP, bossIntroFromDoc(SHIPPED_DOC), () => ({
      name: "喪標麥可",
      description: LONG_DESC,
    }))!;
    const rules = bossIntroLayoutRules(bossIntroFromDoc(SHIPPED_DOC));
    for (const vp of [
      { width: 1280, height: 800 },
      { width: 1920, height: 1080 },
    ]) {
      const placed = bossIntroPlacement(content, vp, { touch: false, legendUp: false }, rules);
      expect(placed, `${vp.width}x${vp.height} 擺不下`).not.toBeNull();
      expect(placed!.layout.description, `${vp.width}x${vp.height} 把描述丟掉了`).not.toBeNull();
      expect(placed!.rect.h).toBeGreaterThanOrEqual(placed!.layout.height);
    }
  });
});
