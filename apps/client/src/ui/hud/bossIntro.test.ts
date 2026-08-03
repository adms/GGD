/**
 * 殭屍王出場演出 —— 從事件到玩家眼睛 (owner 2026-08-02).
 *
 * owner：「殭屍王出場 會音效+大字講該英雄的名言，然後跳出該英雄的描述及攻略注意
 * 要點及弱點等提示，五秒後提示淡出消失」
 *
 * ── 這一組守衛在防的三件事，都不是「函式回傳值對不對」 ────────────────────
 * ① **缺名言不可以變成缺整段演出。** GH#139/#142 還沒做，出貨的 `quote` 全部是空
 *    字串。如果模型把「沒有名言」和「沒有東西可講」合成同一件事，那名言資料進來
 *    之前這整段演出從來不會出現，而所有測試都會過。所以有一條專門的斷言：
 *    **quote 空、其餘照畫**。
 * ② **五秒是欄位不是常數。** 斷言寫在「改了 `introHoldSec` 之後，同一個時刻的
 *    答案會不一樣」這個**行為差異**上，不是寫在「欄位等於 5」（失敗形態⑦）。
 * ③ **元件真的在渲染樹裡。** 這個 repo 犯過八次「從渲染樹刪掉、測試全綠」，所以
 *    最後一節是 `renderToStaticMarkup(<HudRoot />)` 之後去 DOM 的**可見文字**裡
 *    找那幾行字 —— 不是 aria-label，不是 data 屬性。
 *
 * ⚠️ 這個檔**不驗音效**，而那是刻意的：`mobBossSpawn` 早就對到
 * `audio/combatSfx.bossHorrorKey`（`mobBoss.test.ts` 在守），出場演出重用它。
 * 在這裡再寫一條會變成兩份對同一件事的宣稱。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DEFAULT_BOSS_INTRO,
  bossIntroFromDoc,
  zConfigBossIntroDoc,
  type ConfigBossIntroDoc,
} from "@ggd/shared/content";
import { Configs } from "@ggd/shared/content";
import { Champions } from "@ggd/shared/sim/content/registry";
import { MOB_BOSS_SPAWN_EVENT, MOB_BOSS_SLAIN_EVENT } from "@ggd/shared/sim/mobBoss";
import {
  FANNED_OUT_EVENT_TYPES,
  SERVER_ONLY_EVENT_TYPES,
} from "../../../../game-server/src/net/eventFanout";
import {
  BOSS_INTRO_DOC_ID,
  BOSS_INTRO_ELLIPSIS,
  bossIntroCollisions,
  bossIntroContent,
  bossIntroContentFor,
  bossIntroLayout,
  bossIntroLifetime,
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
  type MobBossView,
} from "../../net/RoomStore";

const TAG = "boss-intro";
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));

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

const CHAMP = "godie-zombiex";
const OTHER = "godie-e001";

/** 假的英雄查詢 —— 純函式那幾條用它，不去碰全域 registry。 */
const lookup =
  (defs: Record<string, { name?: string; description?: string }>) =>
  (id: string): { name?: string; description?: string } | undefined =>
    defs[id];

const DEFS = {
  [CHAMP]: { name: "聖杯黑泥醬 - 喪標麥可", description: "故事：\n黑化聖杯溢出的惡意黑泥受肉凝聚。" },
  [OTHER]: { name: "蟬在叫人壞掉 - 龍宮禮奈", description: "" },
};

function rules(over: Partial<ConfigBossIntroDoc> = {}): ConfigBossIntroDoc {
  return {
    ...DEFAULT_BOSS_INTRO,
    champions: {
      [CHAMP]: {
        quote: "",
        tips: ["技能都是地面預放，看到黑泥就走開"],
        weaknesses: ["護甲 −2.4、魔抗 0", "移速只剩五分之一"],
      },
    },
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ① 內容 —— 缺資料是常態，不是崩潰也不是空白
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("內容：只吐存在的段落", () => {
  it("★ 名言是空的（出貨狀態），其餘三段照樣吐出來", () => {
    cover(TAG);
    const c = bossIntroContent(CHAMP, rules(), lookup(DEFS));
    expect(c, "quote 空就把整份內容丟掉 —— 名言資料進來之前演出永遠不會出現").not.toBeNull();
    // 這一行是①的核心：null 代表「這一格沒有資料」，不是「這一隻沒有東西可講」。
    expect(c!.quote).toBeNull();
    // ⚠️ 不是「第一段」：出貨的英雄文件開頭是一行「故事：」標籤，取第一段
    // 會讓面板上只出現那三個字。所以斷言故事**本文**真的到得了畫面上。
    expect(c!.description).toContain("黑化聖杯");
    expect(c!.tips).toHaveLength(1);
    expect(c!.weaknesses).toHaveLength(2);
    expect(c!.name).toBe(DEFS[CHAMP].name);
  });

  it("有名言的時候才吐名言，而且只吃 trim 過非空的字串", () => {
    cover(TAG);
    const withQuote = rules({
      champions: { [CHAMP]: { quote: "咕咕嘎嘎", tips: [], weaknesses: [] } },
    });
    expect(bossIntroContent(CHAMP, withQuote, lookup(DEFS))!.quote).toBe("咕咕嘎嘎");
    const blank = rules({
      champions: { [CHAMP]: { quote: "   ", tips: [], weaknesses: [] } },
    });
    // 只有空白的一格會畫出一條看不見的大字 —— 當成沒有。
    expect(bossIntroContent(CHAMP, blank, lookup(DEFS))!.quote).toBeNull();
  });

  it("★ 抽到沒有任何文案的英雄（王是隨機的，這是常態）→ 只剩描述，不是崩潰", () => {
    cover(TAG);
    const noEntry = bossIntroContent(
      "godie-hpb1",
      rules(),
      lookup({ "godie-hpb1": { name: "某某", description: "一段身世" } }),
    );
    expect(noEntry).not.toBeNull();
    expect(noEntry!.quote).toBeNull();
    expect(noEntry!.tips).toEqual([]);
    expect(noEntry!.weaknesses).toEqual([]);
    expect(noEntry!.description).toBe("一段身世");
  });

  it("一段都沒有（沒文案又沒描述）→ null，不開一個空框", () => {
    cover(TAG);
    expect(bossIntroContent(OTHER, rules(), lookup(DEFS))).toBeNull();
    // 身分不明（舊伺服器 / 壞封包）也是 null。
    expect(bossIntroContent("", rules(), lookup(DEFS))).toBeNull();
  });

  it("總開關關掉 → null（止血閥真的止得住血）", () => {
    cover(TAG);
    expect(bossIntroContent(CHAMP, rules({ enabled: false }), lookup(DEFS))).toBeNull();
  });

  it("descriptionMaxChars 真的截斷並留下省略號；0 = 整段不顯示", () => {
    cover(TAG);
    const long = { [CHAMP]: { name: "王", description: "一".repeat(300) } };
    const cut = bossIntroContent(CHAMP, rules({ descriptionMaxChars: 12 }), lookup(long))!;
    expect(cut.description).toBe(`${"一".repeat(12)}${BOSS_INTRO_ELLIPSIS}`);
    const off = bossIntroContent(CHAMP, rules({ descriptionMaxChars: 0 }), lookup(long))!;
    expect(off.description).toBeNull();
    // 其他段落不受影響 —— 「不顯示描述」不是「不顯示提示」。
    expect(off.weaknesses).toHaveLength(2);
  });

  it("maxTips / maxWeaknesses 是上限而不是建議", () => {
    cover(TAG);
    const many = rules({
      maxTips: 2,
      maxWeaknesses: 1,
      champions: { [CHAMP]: { tips: ["a", "b", "c", "d"], weaknesses: ["x", "y", "z"] } },
    });
    const c = bossIntroContent(CHAMP, many, lookup(DEFS))!;
    expect(c.tips).toEqual(["a", "b"]);
    expect(c.weaknesses).toEqual(["x"]);
  });

  it("★ 出貨的呼叫端真的接上 Champions registry（失敗形態⑤）", () => {
    cover(TAG);
    const id = "boss-intro-fixture-champ";
    Champions.register(id as never, {
      id,
      name: "測試英雄",
      description: "測試描述",
    } as never);
    const c = bossIntroContentFor(id, rules({ champions: {} }));
    expect(c, "bossIntroContentFor 沒有真的去查 registry").not.toBeNull();
    expect(c!.name).toBe("測試英雄");
    expect(c!.description).toBe("測試描述");
  });
});

describe("可達性：事件真的過得了線", () => {
  it("★ `mobBossSpawn` 在 fan-out 名單裡，而且不在 SERVER_ONLY 名單裡", () => {
    cover(TAG);
    // 名單是 **import 進來的**，不是 grep 原始碼字串（失敗形態⑥）。這條看起來
    // 多餘，直到你想起 `fireRingTick` / `fireRingDamage` 就躺在 server-only
    // 名單裡 —— 任何建立在它們之上的客戶端功能都是永遠不會發生的。
    expect(
      FANNED_OUT_EVENT_TYPES.has(MOB_BOSS_SPAWN_EVENT),
      "mobBossSpawn 不在 fan-out 名單裡：出場演出永遠不會被觸發",
    ).toBe(true);
    expect(
      SERVER_ONLY_EVENT_TYPES.has(MOB_BOSS_SPAWN_EVENT),
      "mobBossSpawn 被列成 server-only —— 和 fireRingTick 同一個坑",
    ).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ② 時序 —— 五秒是一個欄位
 * ═══════════════════════════════════════════════════════════════════════════ */

const spawnView = (atMs: number): MobBossView => ({
  kind: "spawn",
  // #291 —— 只有王會 announce 自己（特殊殭屍沒有 `mobBossSpawn`）。
  mobKind: "boss",
  atMs,
  seq: 1,
  summonerSeatId: 2,
  mine: true,
  kills: 100,
  championId: CHAMP,
  shares: [],
  totalGold: 0,
  totalXp: 0,
  totalLevels: 0,
  lastHitMultiplier: 1,
  lastHitMode: "bonus",
  killerSeatId: -1,
  bossId: 77,
  zone: 0,
});

describe("時序：停留 → 淡出 → 消失", () => {
  it("★ 出貨 5 秒：4.9s 還在、5.3s 正在淡出、5.7s 之後不見了", () => {
    cover(TAG);
    const r = rules(); // introHoldSec 5 / fadeSec 0.6
    const v = spawnView(0);
    expect(bossIntroLifetime(v, 4900, r)!.phase).toBe("live");
    const fading = bossIntroLifetime(v, 5300, r)!;
    expect(fading.phase).toBe("out");
    expect(fading.opacity).toBeLessThan(1);
    expect(fading.opacity).toBeGreaterThan(0);
    // ④ 斷言在 NULL 上：不會消失的提示是這一段唯一致命的缺陷。
    expect(bossIntroLifetime(v, 5700, r)).toBeNull();
  });

  it("★ 改 introHoldSec 會改變同一個時刻的答案 —— 這才是「它是欄位」的證據", () => {
    cover(TAG);
    const v = spawnView(0);
    const at = 2900;
    expect(bossIntroLifetime(v, at, rules({ introHoldSec: 5 }))!.phase).toBe("live");
    // 2 秒 + 0.6 秒淡出 = 2.6 秒之後就沒有了，同一個 2.9s 變成 null。
    expect(bossIntroLifetime(v, at, rules({ introHoldSec: 2 }))).toBeNull();
  });

  it("分紅結算（slain）不觸發出場演出；時鐘倒退也不畫", () => {
    cover(TAG);
    const r = rules();
    expect(bossIntroLifetime({ ...spawnView(0), kind: "slain" }, 100, r)).toBeNull();
    expect(bossIntroLifetime(spawnView(1000), 500, r)).toBeNull();
    expect(bossIntroLifetime(null, 0, r)).toBeNull();
    expect(bossIntroLifetime(spawnView(0), 100, rules({ enabled: false }))).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ 版面 —— 擠不下的時候丟段落，不是把六行塞進三行
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("版面：丟棄順序是一個決定", () => {
  const full = () => bossIntroContent(CHAMP, rules(), lookup(DEFS))!;

  it("走廊夠高 → 一段都不丟", () => {
    cover(TAG);
    const l = bossIntroLayout(full(), 10000)!;
    expect(l.dropped).toEqual([]);
    expect(l.weaknesses).toHaveLength(2);
  });

  it("★ 越擠越先丟描述，弱點留到最後 —— 弱點是「現在要怎麼打」的答案", () => {
    cover(TAG);
    const c = full();
    const whole = bossIntroLayout(c, 10000)!.height;
    const noDesc = bossIntroLayout(c, whole - 1)!;
    expect(noDesc.dropped).toEqual(["description"]);
    expect(noDesc.weaknesses).toHaveLength(2);
    const noTips = bossIntroLayout(c, noDesc.height - 1)!;
    expect(noTips.dropped).toEqual(["description", "tips"]);
    expect(noTips.weaknesses, "弱點比攻略要點先被丟掉了").toHaveLength(2);
  });

  it("連名字都放不下 → null（什麼都不畫，不是畫在 0,0）", () => {
    cover(TAG);
    expect(bossIntroLayout(full(), 4)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ④ 安全區 —— 提示不是模態（#107）
 * ═══════════════════════════════════════════════════════════════════════════ */

const VIEWPORTS: readonly { width: number; height: number; touch: boolean }[] = [
  { width: 667, height: 375, touch: true },
  { width: 812, height: 375, touch: true },
  { width: 852, height: 393, touch: true },
  { width: 1280, height: 720, touch: false },
  { width: 1920, height: 1080, touch: false },
];

describe("安全區：畫得出來的每一個視窗，都沒有壓到常駐 chrome", () => {
  it("★ 每個 guard 視窗：不是 null 就是零碰撞", () => {
    cover(TAG);
    let drawnSomewhere = false;
    for (const vp of VIEWPORTS) {
      const placed = bossIntroPlacement(
        bossIntroContent(CHAMP, rules(), lookup(DEFS))!,
        { width: vp.width, height: vp.height },
        { touch: vp.touch, legendUp: false },
      );
      if (!placed) continue;
      drawnSomewhere = true;
      const rect = placed.rect;
      expect(rect.x, `${vp.width}x${vp.height} 畫到畫面外`).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.h, `${vp.width}x${vp.height} 超出下緣`).toBeLessThanOrEqual(vp.height);
      expect(
        bossIntroCollisions({ width: vp.width, height: vp.height }, {
          touch: vp.touch,
          legendUp: false,
          wantH: rect.h,
          minH: rect.h,
        }),
        `${vp.width}x${vp.height} 壓到常駐 chrome`,
      ).toEqual([]);
    }
    // 對照組：如果每個視窗都回 null，上面那圈是空跑的（失敗形態④）。
    expect(drawnSomewhere, "沒有任何一個視窗畫得出來 —— 這一組斷言是空的").toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑤ 出貨資料的現況 —— 名言真的還沒有，而我們沒有編
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("出貨的 content/config/boss-intro.json", () => {
  const shipped = JSON.parse(
    readFileSync(join(REPO, "content/config/boss-intro.json"), "utf8"),
  ) as unknown;

  it("通過嚴格 Zod，而且純量欄位和 DEFAULT_BOSS_INTRO 一字不差", () => {
    cover(TAG);
    const parsed = zConfigBossIntroDoc.safeParse(shipped);
    expect(parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe("");
    const d = parsed.success ? parsed.data : DEFAULT_BOSS_INTRO;
    expect(d.enabled).toBe(DEFAULT_BOSS_INTRO.enabled);
    expect(d.introHoldSec, "owner 明說五秒").toBe(5);
    expect(d.fadeSec).toBe(DEFAULT_BOSS_INTRO.fadeSec);
    expect(d.descriptionMaxChars).toBe(DEFAULT_BOSS_INTRO.descriptionMaxChars);
    expect(d.maxTips).toBe(DEFAULT_BOSS_INTRO.maxTips);
    expect(d.maxWeaknesses).toBe(DEFAULT_BOSS_INTRO.maxWeaknesses);
  });

  it("★ 每一位英雄的 quote 都是空的 —— 名言資料還不存在（GH#139/#142），沒有人編過", () => {
    cover(TAG);
    const d = zConfigBossIntroDoc.parse(shipped);
    for (const [id, e] of Object.entries(d.champions)) {
      expect((e.quote ?? "").trim(), `${id} 的名言是編出來的？出處呢`).toBe("");
    }
  });

  it("喪標麥可有真的攻略要點與弱點，而且寫下了推導依據", () => {
    cover(TAG);
    const d = zConfigBossIntroDoc.parse(shipped);
    const z = d.champions[CHAMP];
    expect(z, "喪標麥可沒有出貨文案").toBeTruthy();
    expect((z!.tips ?? []).length).toBeGreaterThan(0);
    expect((z!.weaknesses ?? []).length).toBeGreaterThan(0);
    expect(z!.authoringNote ?? "", "弱點沒有推導依據就是憑感覺寫的").toContain("armor");
  });

  it("讀壞文件退回出貨預設，而不是 undefined 欄位（無限停留的提示）", () => {
    cover(TAG);
    expect(bossIntroFromDoc({ id: "boss-intro", schema: "config.boss-intro@1" })).toEqual(
      DEFAULT_BOSS_INTRO,
    );
    expect(bossIntroFromDoc(undefined).introHoldSec).toBe(5);
    expect(bossIntroFromDoc({ ...DEFAULT_BOSS_INTRO, introHoldSec: "5" }).introHoldSec).toBe(5);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⑥ SEAM —— 元件真的在 HudRoot 的渲染樹裡（這個 repo 犯過八次）
 * ═══════════════════════════════════════════════════════════════════════════ */

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

const SHIPPED_DOC = JSON.parse(
  readFileSync(join(REPO, "content/config/boss-intro.json"), "utf8"),
) as { champions: Record<string, { tips?: string[]; weaknesses?: string[] }> };

describe("seam：<HudRoot /> 真的把這幾行字畫出來", () => {
  beforeEach(() => {
    // 出貨的那一份 config + 出貨的那一份英雄文件，灌進真的 registry。
    Configs.register(SHIPPED_DOC as never);
    Champions.register(CHAMP as never, {
      id: CHAMP,
      name: DEFS[CHAMP].name,
      description: DEFS[CHAMP].description,
    } as never);
  });

  it("bossIntroRules() 讀得到剛註冊的那一份（不是常數）", () => {
    cover(TAG);
    expect(bossIntroRules().champions[CHAMP], "registry 沒有接上").toBeTruthy();
    expect(BOSS_INTRO_DOC_ID).toBe("boss-intro");
  });

  it("★ 王剛出場 → HudRoot 的可見文字裡有弱點那一行", () => {
    cover(TAG);
    inCombat();
    recordMobBossEvent(
      {
        type: MOB_BOSS_SPAWN_EVENT,
        tick: 900,
        data: { id: 77, zone: 0, x: 0, z: 0, maxHp: 12000, summoner: 102, summonerSeatId: 2, kills: 100, championId: CHAMP },
      },
      // ⚠️ **不是 0**。`comboNowMs()` 在 node 底下是 process 開機以來的毫秒數，
      // 這個檔光是載入就超過 5 秒 —— 用 0 當事件時間，提示在被 render 之前就已經
      // 過期了，而測試會以「元件沒掛進渲染樹」的形態失敗。這一行就是那個真實
      // 時鐘：事件發生在「現在」。
      comboNowMs(),
    );
    // `atMs` 由 recordMobBossEvent 寫成 0，元件用 comboNowMs() 讀現在 —— 在 node
    // 測試環境裡那是一個很小的數字，仍在 5 秒的停留窗內。
    const text = visibleText(renderToStaticMarkup(createElement(HudRoot)));
    const weak = SHIPPED_DOC.champions[CHAMP]!.weaknesses![0]!;
    expect(text, "出場提示沒有出現在畫面上（元件沒掛進渲染樹？）").toContain(weak);
    expect(text).toContain(BOSS_INTRO_WEAK_HEAD);
    expect(text).toContain(BOSS_INTRO_TIPS_HEAD);
    expect(text).toContain(DEFS[CHAMP].name);
  });

  it("★ 事件沒有帶身分 → 一個字都不畫（對照組，讓上一條可證偽）", () => {
    cover(TAG);
    inCombat();
    recordMobBossEvent(
      {
        type: MOB_BOSS_SPAWN_EVENT,
        tick: 900,
        data: { id: 78, zone: 0, x: 0, z: 0, maxHp: 12000, summoner: 102, summonerSeatId: 2, kills: 100 },
      },
      // ⚠️ **不是 0**。`comboNowMs()` 在 node 底下是 process 開機以來的毫秒數，
      // 這個檔光是載入就超過 5 秒 —— 用 0 當事件時間，提示在被 render 之前就已經
      // 過期了，而測試會以「元件沒掛進渲染樹」的形態失敗。這一行就是那個真實
      // 時鐘：事件發生在「現在」。
      comboNowMs(),
    );
    const text = visibleText(renderToStaticMarkup(createElement(HudRoot)));
    expect(text).not.toContain(BOSS_INTRO_WEAK_HEAD);
  });

  it("分紅結算那一則不會再介紹一次", () => {
    cover(TAG);
    inCombat();
    recordMobBossEvent(
      {
        type: MOB_BOSS_SLAIN_EVENT,
        tick: 1800,
        data: { id: 77, killerSeatId: 5, totalGold: 3000, totalXp: 1200, totalLevels: 0, lastHitMultiplier: 2, lastHitMode: "bonus", shares: [] },
      },
      // ⚠️ **不是 0**。`comboNowMs()` 在 node 底下是 process 開機以來的毫秒數，
      // 這個檔光是載入就超過 5 秒 —— 用 0 當事件時間，提示在被 render 之前就已經
      // 過期了，而測試會以「元件沒掛進渲染樹」的形態失敗。這一行就是那個真實
      // 時鐘：事件發生在「現在」。
      comboNowMs(),
    );
    const text = visibleText(renderToStaticMarkup(createElement(HudRoot)));
    expect(text).not.toContain(BOSS_INTRO_WEAK_HEAD);
  });

  it("★ 面板不吃點擊 —— 提示不是模態", () => {
    cover(TAG);
    inCombat();
    recordMobBossEvent(
      {
        type: MOB_BOSS_SPAWN_EVENT,
        tick: 900,
        data: { id: 79, zone: 0, x: 0, z: 0, maxHp: 12000, summoner: 102, summonerSeatId: 2, kills: 100, championId: CHAMP },
      },
      // ⚠️ **不是 0**。`comboNowMs()` 在 node 底下是 process 開機以來的毫秒數，
      // 這個檔光是載入就超過 5 秒 —— 用 0 當事件時間，提示在被 render 之前就已經
      // 過期了，而測試會以「元件沒掛進渲染樹」的形態失敗。這一行就是那個真實
      // 時鐘：事件發生在「現在」。
      comboNowMs(),
    );
    const html = renderToStaticMarkup(createElement(HudRoot));
    const at = html.indexOf('data-boss-intro="panel"');
    expect(at, "面板根本沒被畫出來").toBeGreaterThan(0);
    // 讀那個節點自己的 style，而不是整頁 grep 一個 pointer-events:none。
    const style = html.slice(Math.max(0, at - 1200), at + 200);
    expect(style.replace(/\s/g, "")).toContain("pointer-events:none");
  });
});
