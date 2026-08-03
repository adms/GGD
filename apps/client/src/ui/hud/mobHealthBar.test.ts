/**
 * 特殊殭屍頭上真的**多了一條血條**，普通殭屍沒有 (owner 2026-08-03).
 *
 * ── 這條測試為什麼長這樣 ───────────────────────────────────────────────────
 *
 * ③ 會是：只驗 `mobBarVisible()` 回 true —— 把整個元件從渲染樹刪掉還是全綠。
 * ⑦ 會是：`expect(specs.length).toBe(1)` 就收工 —— 那是模型的一個**屬性**，
 *    不是「螢幕上多了一個東西」。
 * ⑤ 會是：測試自己寫一份「哪一隻算精英」的判斷 —— 出貨的那份判斷再怎麼錯都綠。
 *
 * 所以這裡的骨幹是：**出貨的** `mobBarAnchorFor`（`GameApp` 每幀呼叫的同一個
 * 函式，判準是伺服器投影寫的 `ENTITY_FLAG.MOB_ELITE`）→ 出貨的 `mobBarSpecs`
 * → 出貨的 `MobHealthBarsView`，最後 `renderToStaticMarkup` 把**節點與寬度字串**
 * 讀回來。中間任何一段斷掉都會紅。
 *
 * 區分性輸入：同一次渲染裡同時餵一般殭屍、特殊殭屍、殭屍王與一位英雄。
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { ENTITY_FLAG, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import type { AnchorPose } from "../../frameBus";
import { MobHealthBarsView } from "./mobHealthBar";
import {
  MOB_BODY_HEIGHT_U,
  SHIPPED_MOB_HEALTH_BAR,
  mobBarAnchorFor,
  mobBarAnchorY,
  mobBarSpecs,
  mobHealthBarConfigFrom,
  type MobBarRow,
} from "./mobHealthBarModel";

const POSE: AnchorPose = { sx: 400, sy: 300, visible: true };
const WORLD = { x: 1, z: 2 };

/** 快照上真的會出現的四種列。flags 用的是**協定的常數**，不是手寫的 32768。 */
const NORMAL_MOB: MobBarRow = { id: 11, kind: ENTITY_KIND.MOB, flags: 0, hp: 12, maxHp: 24, zone: 0 };
const SPECIAL_MOB: MobBarRow = {
  id: 12,
  kind: ENTITY_KIND.MOB,
  flags: ENTITY_FLAG.MOB_ELITE,
  hp: 3000,
  maxHp: 8000,
  zone: 0,
};
const BOSS_MOB: MobBarRow = {
  id: 13,
  kind: ENTITY_KIND.MOB,
  flags: ENTITY_FLAG.MOB_ELITE,
  hp: 100,
  maxHp: 400,
  zone: 0,
};
/** 一位英雄，flags 上**故意**帶著同一格：32768 只在 KIND_MOB 上有定義。 */
const CHAMPION: MobBarRow = {
  id: 14,
  kind: ENTITY_KIND.CHAMPION,
  flags: ENTITY_FLAG.MOB_ELITE,
  hp: 500,
  maxHp: 1000,
  zone: 0,
};

/** 出貨那條路：一列快照 → 錨點 → 規格 → markup。 */
function render(rows: readonly MobBarRow[], cfg = SHIPPED_MOB_HEALTH_BAR): string {
  const anchors = rows
    .map((r) => mobBarAnchorFor(r, POSE, WORLD))
    .filter((a): a is NonNullable<typeof a> => a !== null);
  return renderToStaticMarkup(
    React.createElement(MobHealthBarsView, { specs: mobBarSpecs(anchors, cfg) }),
  );
}

/** 這段 markup 裡有幾個血條節點、分別屬於誰。 */
function barIds(html: string): number[] {
  return [...html.matchAll(/data-mob-bar-entity="(\d+)"/g)].map((m) => Number(m[1]));
}

describe("特殊殭屍頭上的小血條真的畫出來了 (owner 2026-08-03)", () => {
  it("渲染樹上：特殊殭屍與殭屍王各多一個節點，一般殭屍與英雄一個都沒有", () => {
    cover("mob-special-visible");
    const html = render([NORMAL_MOB, SPECIAL_MOB, BOSS_MOB, CHAMPION]);
    // ⬇ 這一行就是 owner 那句話在螢幕上的樣子
    expect(barIds(html)).toEqual([SPECIAL_MOB.id, BOSS_MOB.id]);
    // …而且真的是「多了一個東西」，不是只換了一個屬性
    expect(html).toContain('data-mob-bar="root"');
    expect(html).toContain('data-mob-bar="fill"');
  });

  it("血量是**即時**的：填充寬度就是 hp/maxHp，讀最終 markup 而不是中間物件", () => {
    cover("mob-special-visible");
    // 3000/8000 = 37.5%
    expect(render([SPECIAL_MOB])).toContain("width:37.5%");
    // 同一隻掉到 800/8000 = 10%，畫面上必須跟著動（不然就是畫了一次就凍住）
    expect(render([{ ...SPECIAL_MOB, hp: 800 }])).toContain("width:10.0%");
    // 滿血 / 空血兩個端點都不能溢位
    expect(render([{ ...SPECIAL_MOB, hp: 99999 }])).toContain("width:100.0%");
    expect(render([{ ...SPECIAL_MOB, hp: -5 }])).toContain("width:0.0%");
  });

  it("四個後台欄位真的走到畫面上：寬、高、開關、門檻", () => {
    cover("mob-special-visible");
    const wide = render([SPECIAL_MOB], { ...SHIPPED_MOB_HEALTH_BAR, barWidth: 120, barHeight: 11 });
    expect(wide).toContain("width:120px");
    expect(wide).toContain("height:11px");
    // 出貨值本身也要真的是出貨值（不是「剛好跟上面那組一樣」）
    expect(render([SPECIAL_MOB])).toContain(`width:${SHIPPED_MOB_HEALTH_BAR.barWidth}px`);

    // 主開關關掉 = 一個節點都不畫
    expect(barIds(render([SPECIAL_MOB], { ...SHIPPED_MOB_HEALTH_BAR, showHealthBar: false }))).toEqual([]);

    // 門檻 0.5：37.5% 的那隻要畫，90% 的那隻不畫
    const gated = { ...SHIPPED_MOB_HEALTH_BAR, showThreshold: 0.5 };
    expect(barIds(render([SPECIAL_MOB], gated))).toEqual([SPECIAL_MOB.id]);
    expect(barIds(render([{ ...SPECIAL_MOB, hp: 7200 }], gated))).toEqual([]);
    // 出貨的 1.0 = 一直顯示，所以同一隻 90% 血在出貨設定下必須畫
    expect(barIds(render([{ ...SPECIAL_MOB, hp: 7200 }]))).toEqual([SPECIAL_MOB.id]);
  });

  it("`yOffset` 不是一個寫了沒人讀的欄位：它與體型倍率一起決定投影高度", () => {
    cover("mob-special-visible");
    // 王的體型倍率 5 比特殊殭屍的 2 高，血條必須跟著上去 —— 一個固定高度會讓
    // 王的血條掛在牠膝蓋上（失敗形態 ①）。
    expect(mobBarAnchorY(5, SHIPPED_MOB_HEALTH_BAR)).toBeGreaterThan(
      mobBarAnchorY(2, SHIPPED_MOB_HEALTH_BAR),
    );
    // 而 `yOffset` 真的加得進去：同一隻身體，欄位 +1 就是高 1 個單位。
    const base = mobBarAnchorY(2, SHIPPED_MOB_HEALTH_BAR);
    const lifted = mobBarAnchorY(2, { ...SHIPPED_MOB_HEALTH_BAR, yOffset: SHIPPED_MOB_HEALTH_BAR.yOffset + 1 });
    expect(lifted - base).toBeCloseTo(1, 9);
    // 出貨值的絕對數字（一般殭屍 sizeMult 0.68）
    expect(mobBarAnchorY(1, SHIPPED_MOB_HEALTH_BAR)).toBeCloseTo(
      MOB_BODY_HEIGHT_U + SHIPPED_MOB_HEALTH_BAR.yOffset,
      9,
    );
    // 壞掉的倍率（0 / NaN，例如快照還沒補齊那一幀）退回 1，不是退回 0：
    // 0 會把血條畫在腳底下。
    expect(mobBarAnchorY(0, SHIPPED_MOB_HEALTH_BAR)).toBeCloseTo(mobBarAnchorY(1, SHIPPED_MOB_HEALTH_BAR), 9);
    expect(mobBarAnchorY(Number.NaN, SHIPPED_MOB_HEALTH_BAR)).toBeCloseTo(
      mobBarAnchorY(1, SHIPPED_MOB_HEALTH_BAR),
      9,
    );
  });

  it("投影說看不到就不畫 —— 血條不會浮在畫面邊緣（失敗形態 ①）", () => {
    cover("mob-special-visible");
    const offscreen = mobBarAnchorFor(SPECIAL_MOB, { sx: 0, sy: 0, visible: false }, WORLD)!;
    expect(offscreen).not.toBeNull();
    expect(mobBarSpecs([offscreen], SHIPPED_MOB_HEALTH_BAR)).toEqual([]);
  });

  it("設定值逐欄位降級：舊 shard 沒送這幾格 → 拿到出貨值，不是一張歸零的表", () => {
    cover("mob-special-visible");
    // 一張只有 GH#192 那幾格的表（就是今天線上真的在送的那一張）
    expect(mobHealthBarConfigFrom({ tintStrength: 0.65 })).toEqual(SHIPPED_MOB_HEALTH_BAR);
    expect(mobHealthBarConfigFrom(null)).toEqual(SHIPPED_MOB_HEALTH_BAR);
    // 歸零是**錯**的降級：它會把功能靜默刪掉而且全綠（失敗形態 ③）
    expect(mobHealthBarConfigFrom({}).showHealthBar).toBe(true);
    // 而真的有送就要吃它
    expect(mobHealthBarConfigFrom({ mobHealthBarWidth: 50 }).barWidth).toBe(50);
    // 上下界兩邊都夾：500 打成 5000 不可以蓋掉半個畫面（#277 同型）
    expect(mobHealthBarConfigFrom({ mobHealthBarWidth: 5000 }).barWidth).toBe(200);
    expect(mobHealthBarConfigFrom({ mobHealthBarWidth: -3 }).barWidth).toBe(8);
    expect(mobHealthBarConfigFrom({ mobHealthBarShowThreshold: 9 }).showThreshold).toBe(1);
    expect(mobHealthBarConfigFrom({ mobHealthBarWidth: Number.NaN }).barWidth).toBe(
      SHIPPED_MOB_HEALTH_BAR.barWidth,
    );
  });
});
