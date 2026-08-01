/**
 * 殭屍王長血條 (#247, owner 2026-08-01 「殭屍王 要像其他遊戲 BOSS 一樣亮長血條」).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一組守衛對著哪幾種失敗形態
 * ─────────────────────────────────────────────────────────────────────────────
 * ①③ 「算出來但畫在畫面外／可以刪掉還全綠」 —— 純模型算出 spec 之後,`BossHealthBarView`
 *     還可以把它整個丟掉。所以有一半的案例是把元件 `renderToStaticMarkup` 出來,
 *     把**真實血量數字**與**填充寬度**從 DOM 讀回來。刪掉 `bossHpText(...)` 那一行,
 *     或把 `width` 改成常數,這裡會紅。
 * ② 「算出來但從沒送到客戶端」 —— 這一條的資料鏈是 config → mobVisualJson → 客戶端。
 *     `parseMobVisualJson` 的來回在這裡被走一遍(不是猜),所以後台把 `healthBar`
 *     關掉真的會讓畫面上什麼都沒有。
 * ⑦ 「掃屬性代替掃行為」 —— 不是斷言「spec 有 anchor 欄位」,而是斷言 top 與
 *     bottom 兩種設定**畫出來的 y 真的不一樣**,而且 bottom 那一種真的在下半。
 * #107 —— 兩種 anchor 在四種守衛視窗下,對每一個常駐 HUD 槽位的碰撞集合都必須是空的。
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mobVisualJson,
  parseMobVisualJson,
  DEFAULT_BOSS_HEALTH_BAR,
  DEFAULT_BOSS_HEALTH_BAR_ANCHOR,
  DEFAULT_BOSS_HEALTH_BAR_REVEAL,
  mobRulesFromConfig,
} from "@ggd/shared/sim/mobs";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import type { MobBossMarker } from "../../frameBus";
import {
  BOSS_BAR_H,
  BOSS_BAR_MIN_W,
  BOSS_BAR_TITLE,
  bossHealthBarCollisions,
  bossHealthBarRect,
  bossHealthBarSpec,
  bossHealthBarVisible,
  bossHpText,
  bossInSight,
} from "./bossHealthBarModel";
import { BossHealthBarView } from "./BossHealthBar";
import { mobBossRect, BOSS_BANNER_H, BOSS_BANNER_MIN_H } from "./mobBossModel";
import { killComboRect } from "./killComboModel";

/** The shipped king's real numbers: `heroHpMult 20 × 8,847 + 100,000`. */
const KING: MobBossMarker = {
  entityId: 900,
  zone: 1,
  worldX: 0,
  worldZ: 0,
  hpPct: 0.5,
  hp: 138_472,
  maxHp: 276_944,
};

const DESKTOP = { width: 1600, height: 900 };
/** The four guard viewports the rest of the HUD suite uses. */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1024, height: 768 },
  { width: 812, height: 375 },
];

const PLACE = { touch: false, legendUp: false, couchPlayers: 1 } as const;

function spec(over: Partial<Parameters<typeof bossHealthBarSpec>[2]> = {}, marker = KING) {
  return bossHealthBarSpec(marker, DESKTOP, {
    ...PLACE,
    anchor: "top",
    enabled: true,
    reveal: "summon",
    localZone: 1,
    camera: null,
    ...over,
  });
}

describe("殭屍王長血條 (mob-boss-healthbar)", () => {
  /* ── ② 後台的三格真的走到客戶端 ───────────────────────────────────────── */

  it("三格設定真的騎在 mobVisualJson 上,而且解出來就是出貨值", () => {
    // 出貨 arena 的 rules → 序列化 → 解析。整條鏈都是真的函式,不是手寫字串。
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, 3, 1);
    const table = parseMobVisualJson(mobVisualJson(rules));
    expect(table.bossHealthBar).toBe(true);
    expect(table.bossHealthBarAnchor).toBe("top");
    expect(table.bossHealthBarReveal).toBe("summon");
    // 而且出貨文件真的填了它們(不是靠 fallback 巧合對上)
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.healthBar).toBe(true);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.healthBarAnchor).toBe("top");
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.healthBarReveal).toBe("summon");

    // ⚠️ 上面三條**單獨**是不夠的:一個把三格寫死成出貨值的序列化器也會全過
    // (實測過)。所以再走一次「操作員把它們改掉」的路徑 —— 三格都不是出貨值,
    // 而且必須原封不動地穿過 mobVisualJson 到達客戶端。
    const flipped = mobRulesFromConfig(
      {
        ...DEFAULT_MOB_WAVES_CONFIG,
        boss: {
          ...DEFAULT_MOB_WAVES_CONFIG.boss!,
          healthBar: false,
          healthBarAnchor: "bottom",
          healthBarReveal: "sighted",
        },
      },
      3,
      1,
    );
    const flippedTable = parseMobVisualJson(mobVisualJson(flipped));
    expect(flippedTable.bossHealthBar, "後台關掉血條沒有送到客戶端").toBe(false);
    expect(flippedTable.bossHealthBarAnchor).toBe("bottom");
    expect(flippedTable.bossHealthBarReveal).toBe("sighted");
  });

  it("一台跑在舊 shard 前面的客戶端拿到出貨值,不是關掉的功能", () => {
    // 舊 shard 送的是只有 tintStrength 的表 —— 逐欄位降級,不是整張表退回。
    const table = parseMobVisualJson(JSON.stringify({ tintStrength: 0.4 }));
    expect(table.tintStrength).toBe(0.4);
    expect(table.bossHealthBar).toBe(DEFAULT_BOSS_HEALTH_BAR);
    expect(table.bossHealthBarAnchor).toBe(DEFAULT_BOSS_HEALTH_BAR_ANCHOR);
    expect(table.bossHealthBarReveal).toBe(DEFAULT_BOSS_HEALTH_BAR_REVEAL);
    // 垃圾值也一樣降級(不是丟出去,也不是接受)
    const junk = parseMobVisualJson(JSON.stringify({ bossHealthBarAnchor: "sideways" }));
    expect(junk.bossHealthBarAnchor).toBe(DEFAULT_BOSS_HEALTH_BAR_ANCHOR);
  });

  it("後台把它關掉 = 畫面上真的沒有東西", () => {
    expect(spec({ enabled: false })).toBeNull();
    expect(spec({ enabled: true })).not.toBeNull();
  });

  /* ── 誰看得到 ─────────────────────────────────────────────────────────── */

  it("別的戰場的王不畫,而且 zone 不明時也不畫(跟橫幅刻意相反)", () => {
    const base = { enabled: true, reveal: "summon" as const, camera: null };
    expect(bossHealthBarVisible(KING, { ...base, localZone: 1 })).toBe(true);
    expect(bossHealthBarVisible(KING, { ...base, localZone: 2 })).toBe(false);
    // −1 = 「不知道」。橫幅在這裡 fail open;常駐血條不行 —— 一條永遠掛著、
    // 講一場你不在的仗的血條比沒有更糟。
    expect(bossHealthBarVisible(KING, { ...base, localZone: -1 })).toBe(false);
    expect(bossHealthBarVisible({ ...KING, zone: -1 }, { ...base, localZone: 1 })).toBe(false);
    expect(bossHealthBarVisible(null, { ...base, localZone: 1 })).toBe(false);
  });

  it("「進視野」真的等到王走進來才亮,「召喚那一刻」不等", () => {
    const cam = { targetX: 0, targetZ: 0, dolly: 20 };
    const far = { ...KING, worldX: 0, worldZ: 40 };
    const near = { ...KING, worldX: 0, worldZ: 10 };
    const g = (m: MobBossMarker, reveal: "summon" | "sighted"): boolean =>
      bossHealthBarVisible(m, { enabled: true, reveal, localZone: 1, camera: cam });
    expect(g(far, "sighted"), "40 u 外的王不該亮").toBe(false);
    expect(g(near, "sighted"), "10 u 的王該亮").toBe(true);
    // 「召喚那一刻」完全不看鏡頭 —— 兩種模式的答案必須不同,否則這一格是裝飾
    expect(g(far, "summon")).toBe(true);
    // 鏡頭還沒註冊 ⇒ 當作看得到(這一格是「什麼時候亮」,不是權限)
    expect(bossInSight(far, null)).toBe(true);
  });

  /* ── ⑦ anchor 是行為,不是屬性 ─────────────────────────────────────────── */

  it("top 與 bottom 畫出來的 y 真的不同,而且 bottom 在下半", () => {
    const top = bossHealthBarRect(DESKTOP, { ...PLACE, anchor: "top" })!;
    const bottom = bossHealthBarRect(DESKTOP, { ...PLACE, anchor: "bottom" })!;
    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    expect(bottom.y).toBeGreaterThan(top.y);
    expect(top.y).toBeLessThan(DESKTOP.height / 2);
    expect(bottom.y).toBeGreaterThan(DESKTOP.height / 2);
    expect(top.h).toBe(BOSS_BAR_H);
    // 兩種都是水平置中的(一條偏一邊的首領條會被讀成 bug)
    expect(top.x + top.w / 2).toBeCloseTo(DESKTOP.width / 2, 0);
    expect(bottom.x + bottom.w / 2).toBeCloseTo(DESKTOP.width / 2, 0);
  });

  /* ── #107 安全區 ──────────────────────────────────────────────────────── */

  it("在每一個守衛視窗、兩種 anchor 下,都沒有蓋到任何常駐槽位", () => {
    for (const vp of VIEWPORTS) {
      for (const anchor of ["top", "bottom"] as const) {
        for (const touch of [false, true]) {
          expect(
            bossHealthBarCollisions(vp, { ...PLACE, touch, anchor }),
            `${vp.width}x${vp.height} ${anchor} touch=${touch}`,
          ).toEqual([]);
        }
      }
      // 太窄就畫不下 —— null 是正確答案,不是「還是畫在 0,0」
      const r = bossHealthBarRect(vp, { ...PLACE, anchor: "top" });
      if (r) expect(r.w).toBeGreaterThanOrEqual(BOSS_BAR_MIN_W);
    }
  });

  it("降臨橫幅與連殺計數器都真的讓位給它(兩種 anchor 各讓一邊)", () => {
    const banner = { ...PLACE, wantH: BOSS_BANNER_H, minH: BOSS_BANNER_MIN_H };
    const noBar = mobBossRect(DESKTOP, banner)!;
    const topBar = bossHealthBarRect(DESKTOP, { ...PLACE, anchor: "top" })!;
    const pushed = mobBossRect(DESKTOP, { ...banner, barRect: topBar })!;
    expect(pushed.y, "橫幅沒有被上方的長血條推下去").toBeGreaterThan(noBar.y);
    expect(pushed.y).toBeGreaterThanOrEqual(topBar.y + topBar.h);

    // 連殺計數器是**下錨**的,所以由 bottom 的血條把它頂上去
    const bottomBar = bossHealthBarRect(DESKTOP, { ...PLACE, anchor: "bottom" })!;
    const comboFree = killComboRect(DESKTOP, { ...PLACE })!;
    const comboPushed = killComboRect(DESKTOP, { ...PLACE, bossBarRect: bottomBar })!;
    expect(comboPushed.y + comboPushed.h, "連殺沒有被下方的長血條頂上去").toBeLessThanOrEqual(
      bottomBar.y,
    );
    expect(comboPushed.y).toBeLessThan(comboFree.y);
  });

  /* ── ①③ 真的畫出來,而且畫的是真實數字 ───────────────────────────────── */

  it("渲染出來的 DOM 帶著真實血量數字與正確的填充寬度", () => {
    const s = spec()!;
    const html = renderToStaticMarkup(React.createElement(BossHealthBarView, { spec: s }));
    expect(html).toContain(BOSS_BAR_TITLE);
    // 真實數字,千分位。`hpPct` 0.5 印成「50%」的實作在這裡是紅的。
    expect(html).toContain("138,472 / 276,944");
    // 填充寬度真的是那個比例 —— 一個寫死 100% 的填充條在這裡是紅的
    expect(html).toContain('data-boss-bar-pct="0.5000"');
    expect(html).toContain("width:50.00%");
    // 位置真的用了 spec 的矩形(不是 0,0)
    expect(html).toContain(`left:${s.rect.x}px`);
    expect(html).toContain(`top:${s.rect.y}px`);
    expect(html).toContain(`width:${s.rect.w}px`);
  });

  it("快死的王仍然印得出剩下的血,不是「0%」", () => {
    const dying = { ...KING, hp: 1100, maxHp: 276_944, hpPct: 1100 / 276_944 };
    const html = renderToStaticMarkup(
      React.createElement(BossHealthBarView, { spec: spec({}, dying)! }),
    );
    expect(html).toContain("1,100 / 276,944");
    expect(bossHpText(0, 0)).toBe("0 / 0");
  });

  it("spec 的 hpPct 是從 hp/maxHp 重算的,不是照抄 marker 的那一格", () => {
    // marker 上的 `hpPct` 故意錯 —— 一條同時顯示數字與填充的血條上,兩者不能不一致
    const lying = { ...KING, hp: 100, maxHp: 400, hpPct: 0.99 };
    expect(spec({}, lying)!.hpPct).toBeCloseTo(0.25, 9);
  });
});
