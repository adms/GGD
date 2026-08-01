/**
 * 飄字的第二個通道 —— 外框 (combat-text-outline).
 *
 * owner 2026-08-01 先裁定飄字的**色相 = 傷害屬性**(紅物理/紫魔法/白真實/綠治療),
 * 代價是「我打人」與「我被打」在同一種屬性下變成同一個顏色。接著他核准了補償:
 * 逐字「加第二個通道，不動色相 => ok」。
 *
 * 這一份守的就是那個通道,而且守在**渲染器真的寫上去的那個字串**上 ——
 * `WorldAnchorLayer` 做的是 `node.style.cssText = combatTextCss(st, gradient)`,
 * 所以斷言讀 `combatTextCss()` 的輸出,不是 style 物件的某個欄位(失敗形態 ⑦:
 * 「`style.band.color` 是 #5A0000」是一個屬性,不是「畫面上外框變了」)。
 *
 * 四條要求,逐條對應下面四個 describe:
 *   ① 同一個傷害類型、不同 relation → **色相相同、外框不同**(這就是這個設計)
 *   ② 不同傷害類型、同一 relation → **色相不同**(裁決沒有被這個功能弄壞)
 *   ③ `combatTextStyleKey()` 對上面兩組都給出**不同的鍵**(pooled node 那條)
 *   ④ 總開關關掉 → 兩者外框相同,而且是**逐位元**回到這個功能出現之前的字串
 *
 * ⚠️ 還有一條不在要求裡但必須守:#164「傷害數字看起來是黑色」。那個 bug 的
 * 結構是「填色沒了,只剩黑框」,而這個功能動的正是框。所以每一個 describe 都
 * 會順便確認**硬黑框八個方向一個都沒少**,以及填色永遠是一個真的顏色。
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_DAMAGE_COLORS, type ConfigDamageColorsDoc } from "@ggd/shared/content";
import { applyDamageColorsDoc } from "../render/damagePalette";
import {
  COMBAT_TEXT_CATEGORIES,
  combatTextCss,
  combatTextStyle,
  combatTextStyleKey,
  type CombatTextCategory,
  type CombatTextMods,
} from "./combatText";

const TAG = "combat-text-outline";

type School = NonNullable<CombatTextMods["dmgType"]>;
const SCHOOLS: School[] = ["physical", "magic", "true"];

const mods = (dmgType?: School): CombatTextMods => ({
  crit: false,
  killingBlow: false,
  dmgType,
});

/** Exactly the string `WorldAnchorLayer` assigns to `node.style.cssText`. */
const cssFor = (cat: CombatTextCategory, school?: School): string =>
  combatTextCss(combatTextStyle(cat, mods(school)), false);

/** The `color:` declaration — 色相 (owner's ruling lives here). */
const fillOf = (css: string): string => /(?:^|;)color:(#[0-9a-f]{6})/i.exec(css)![1]!.toLowerCase();

/** The whole `text-shadow` value — 外框 + 光暈 live here. */
const shadowOf = (css: string): string => /text-shadow:([^;]+);/i.exec(css)![1]!;

/** Just the HARD (zero-blur) layers, i.e. the ring and the band. */
const hardLayers = (css: string): string[] =>
  shadowOf(css)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => / 0 #[0-9a-f]{3,6}$/i.test(s));

/** How many hard layers are drawn in a given colour. */
const layersInColour = (css: string, hex: string): number =>
  hardLayers(css).filter((l) => l.toLowerCase().endsWith(` 0 ${hex.toLowerCase()}`)).length;

const withOutline = (patch: Partial<ConfigDamageColorsDoc["outline"]>): void =>
  applyDamageColorsDoc({
    ...DEFAULT_DAMAGE_COLORS,
    outline: { ...DEFAULT_DAMAGE_COLORS.outline, ...patch },
  });

const SHIPPED_INCOMING = DEFAULT_DAMAGE_COLORS.outline.incoming; // #5A0000
const RING = "#000";

afterEach(() => {
  applyDamageColorsDoc(null); // back to the shipped doc
});

// ---------------------------------------------------------------------------
describe("① 同一個傷害類型、不同 relation → 色相相同、外框不同 (combat-text-outline)", () => {
  it("造成 vs 受到:填色一字不差,外框不一樣", () => {
    cover(TAG);
    for (const school of SCHOOLS) {
      const dealt = cssFor("dealt", school);
      const taken = cssFor("taken", school);

      // 色相沒有被動 —— 這是 owner 的裁決,這個功能不准碰
      expect(fillOf(taken), `${school}: 外框通道動到了色相`).toBe(fillOf(dealt));
      expect(fillOf(taken)).toBe(DEFAULT_DAMAGE_COLORS.text[school].toLowerCase());

      // …而外框不一樣,而且不一樣的地方就是那個深紅
      expect(shadowOf(taken), `${school}: 受到與造成的外框相同`).not.toBe(shadowOf(dealt));
      expect(layersInColour(taken, SHIPPED_INCOMING), `${school}: 受到傷害沒有深紅外框`).toBe(8);
      expect(layersInColour(dealt, SHIPPED_INCOMING), `${school}: 造成傷害多了深紅外框`).toBe(0);
    }
  });

  it("深紅外圈畫在黑框**後面**、比黑框大 —— 黑框一格都沒少 (#164)", () => {
    cover(TAG);
    const st = combatTextStyle("taken", mods("physical"));
    const css = cssFor("taken", "physical");
    const layers = hardLayers(css);

    // 8 圈黑 + 8 圈深紅,黑的全部排在前面(text-shadow 前面的畫在上面)
    expect(layers).toHaveLength(16);
    expect(layers.slice(0, 8).every((l) => l.endsWith(` 0 ${RING}`))).toBe(true);
    expect(layers.slice(8).every((l) => l.toLowerCase().endsWith(` 0 ${SHIPPED_INCOMING.toLowerCase()}`))).toBe(true);

    // 黑框仍然在原來的半徑上 —— 它是 #164 之後的辨識度地板,不可以被推開
    expect(css).toContain(`${st.outlinePx}px 0px 0 ${RING}`);
    expect(css).toContain(`0px -${st.outlinePx}px 0 ${RING}`);
    // 外圈嚴格在黑框外面(出貨 1.9 倍),否則它一個畫素都看不到
    const bandPx = st.outlinePx * DEFAULT_DAMAGE_COLORS.outline.widthMult;
    expect(bandPx).toBeGreaterThan(st.outlinePx);
    expect(css.toLowerCase()).toContain(`${bandPx}px 0px 0 ${SHIPPED_INCOMING.toLowerCase()}`);
  });

  it("`incoming` 收的是三個「朝我來的」,不是只有掉血 —— 而且切到 `taken` 只剩掉血", () => {
    cover(TAG);
    // 出貨 mode = incoming:掉血、被盾吃掉、閃掉,三個都換框
    for (const cat of ["taken", "guard", "dodge"] as CombatTextCategory[]) {
      expect(layersInColour(cssFor(cat), SHIPPED_INCOMING), `${cat} 沒有換框`).toBe(8);
    }
    // 別人的血、以及對我有好處的事,都不算「我被打」
    for (const cat of ["dealt", "allyTaken", "heal", "mana", "whiff", "other"] as CombatTextCategory[]) {
      expect(layersInColour(cssFor(cat), SHIPPED_INCOMING), `${cat} 不該換框`).toBe(0);
    }
    // 這是一格下拉選單,不是寫死的:切到 `taken` 之後 GUARD 與閃避回到黑框
    withOutline({ mode: "taken" });
    expect(layersInColour(cssFor("taken"), SHIPPED_INCOMING)).toBe(8);
    expect(layersInColour(cssFor("guard"), SHIPPED_INCOMING)).toBe(0);
    expect(layersInColour(cssFor("dodge"), SHIPPED_INCOMING)).toBe(0);
  });

  it("兩個顏色與粗細都是操作者的,不是常數", () => {
    cover(TAG);
    // 換 incoming 的顏色 → 出現在渲染器寫上去的字串裡
    withOutline({ incoming: "#123456" });
    expect(layersInColour(cssFor("taken"), "#123456")).toBe(8);
    expect(layersInColour(cssFor("taken"), SHIPPED_INCOMING)).toBe(0);

    // 換 outgoing 的顏色 → 「我打人」那一組也真的拿得到外框(出貨黑=不畫,不是不能畫)
    withOutline({ outgoing: "#0A1E4D" });
    expect(layersInColour(cssFor("dealt"), "#0A1E4D")).toBe(8);

    // 換粗細 → 半徑跟著變
    withOutline({ widthMult: 2.6 });
    const px = combatTextStyle("taken").outlinePx * 2.6;
    expect(cssFor("taken").toLowerCase()).toContain(
      `${px}px 0px 0 ${SHIPPED_INCOMING.toLowerCase()}`,
    );
  });
});

// ---------------------------------------------------------------------------
describe("② 不同傷害類型、同一 relation → 色相不同 (combat-text-outline)", () => {
  it("三種傷害屬性在同一個 relation 下是三個填色,而外框完全一樣", () => {
    cover(TAG);
    for (const cat of ["taken", "dealt"] as CombatTextCategory[]) {
      const fills = new Set(SCHOOLS.map((s) => fillOf(cssFor(cat, s))));
      expect(fills.size, `${cat}: 三種屬性沒有三個顏色 —— owner 的裁決被弄壞了`).toBe(3);

      // …而外框在三者之間**一模一樣**:外框講的是「誰的血」,不是「哪一種傷害」。
      // 兩個通道各講一件事,這就是不用色相解決 relation 的理由。
      const shadows = new Set(SCHOOLS.map((s) => shadowOf(cssFor(cat, s))));
      expect(shadows.size, `${cat}: 外框跟著傷害屬性變了 —— 兩個通道在講同一件事`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
describe("③ pooled node 的快取鍵跟得上外框 (combat-text-outline)", () => {
  it("同一個屬性、不同 relation → 不同的鍵;不同屬性、同一 relation → 不同的鍵", () => {
    cover(TAG);
    for (const school of SCHOOLS) {
      expect(combatTextStyleKey("taken", mods(school))).not.toBe(
        combatTextStyleKey("dealt", mods(school)),
      );
    }
    for (const cat of ["taken", "dealt"] as CombatTextCategory[]) {
      const keys = new Set(SCHOOLS.map((s) => combatTextStyleKey(cat, mods(s))));
      expect(keys.size, `${cat}: 三種屬性共用一格 pooled style`).toBe(3);
    }
  });

  /**
   * 這一條才是新維度真正的危險,而且是檔頭那件事故的形狀:`category` 本來就在鍵
   * 裡,所以「taken vs dealt 不同鍵」即使外框完全沒進鍵也會過(失敗形態 ④)。
   * 會咬到的是**外框自己變了而鍵沒變**:操作者改一格設定,活著的 pooled node 就
   * 會用舊外框畫新數字,一輩子。
   */
  it("外框設定變了,鍵一定跟著變 —— 三個欄位一格都不能漏", () => {
    cover(TAG);
    const shipped = combatTextStyleKey("taken", mods("physical"));

    withOutline({ mode: "off" });
    expect(combatTextStyleKey("taken", mods("physical")), "mode 不在鍵裡").not.toBe(shipped);

    withOutline({ incoming: "#123456" });
    expect(combatTextStyleKey("taken", mods("physical")), "外框顏色不在鍵裡").not.toBe(shipped);

    withOutline({ widthMult: 2.6 });
    expect(combatTextStyleKey("taken", mods("physical")), "外框粗細不在鍵裡").not.toBe(shipped);
  });

  it("同一個鍵 ⇒ 同一份 CSS(掃過每一種模式 × 每一個類別 × 每一種屬性)", () => {
    cover(TAG);
    const seen = new Map<string, string>();
    for (const mode of ["off", "taken", "incoming"] as const) {
      for (const incoming of [SHIPPED_INCOMING, "#123456"]) {
        for (const widthMult of [1.9, 2.6]) {
          withOutline({ mode, incoming, widthMult });
          for (const cat of COMBAT_TEXT_CATEGORIES) {
            for (const school of [...SCHOOLS, undefined]) {
              for (const crit of [false, true]) {
                const m = { crit, killingBlow: false, dmgType: school };
                const key = combatTextStyleKey(cat, m);
                const css = combatTextCss(combatTextStyle(cat, m), false);
                const prev = seen.get(key);
                if (prev !== undefined) {
                  expect(css, `鍵 "${key}" 對到兩份不同的 CSS`).toBe(prev);
                } else {
                  seen.set(key, css);
                }
              }
            }
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe("④ 總開關關掉 = 逐位元回到這個功能出現之前 (combat-text-outline)", () => {
  it("mode: off → 沒有任何一個類別多畫一圈,硬框剛好八個方向、全黑", () => {
    cover(TAG);
    withOutline({ mode: "off" });
    for (const cat of COMBAT_TEXT_CATEGORIES) {
      const css = cssFor(cat, "physical");
      const layers = hardLayers(css);
      // 這個功能出現之前:`OUTLINE_DIRS.map(...)`,八層,每一層都是 `0 #000`
      expect(layers, `${cat}: 硬框層數不是 8`).toHaveLength(8);
      expect(layers.every((l) => l.endsWith(` 0 ${RING}`)), `${cat}: 硬框裡有非黑色`).toBe(true);
    }
  });

  it("mode: off → 「我打人」與「我被打」的外框變回同一個", () => {
    cover(TAG);
    withOutline({ mode: "off" });
    for (const school of SCHOOLS) {
      // 這兩個類別的 outlinePx 都是 2(30px 與 24px 都 ≥ 24),所以「同一個外框」
      // 是可以逐字比的 —— 光暈半徑本來就不同(7 vs 5),那不是這個功能的東西。
      expect(hardLayers(cssFor("taken", school))).toEqual(hardLayers(cssFor("dealt", school)));
      // 而色相仍然分不出「誰的血」—— 這正是這個功能存在的理由,測試把它寫下來
      expect(fillOf(cssFor("taken", school))).toBe(fillOf(cssFor("dealt", school)));
    }
  });

  it("`outgoing` 填黑就等於關掉那一半 —— 出貨值就是黑,所以「我打人」逐位元沒變", () => {
    cover(TAG);
    // 出貨 mode=incoming、outgoing=#000000。把 mode 關掉之後,「我打人」那一組的
    // CSS 必須和開著的時候一模一樣:與黑框同色的外圈不會被畫出來。
    const on = COMBAT_TEXT_CATEGORIES.map((c) => cssFor(c, "physical"));
    withOutline({ mode: "off" });
    const off = COMBAT_TEXT_CATEGORIES.map((c) => cssFor(c, "physical"));
    for (let i = 0; i < COMBAT_TEXT_CATEGORIES.length; i++) {
      const cat = COMBAT_TEXT_CATEGORIES[i]!;
      const incoming = ["taken", "guard", "dodge"].includes(cat);
      if (incoming) expect(on[i], `${cat} 應該有換框`).not.toBe(off[i]);
      else expect(on[i], `${cat} 不該因為這個功能而改變`).toBe(off[i]);
    }
  });
});

// ---------------------------------------------------------------------------
describe("#164 的地板沒有被這個功能挖走 (combat-text-outline)", () => {
  it("每一個類別、每一種模式:填色是真的顏色,黑框八個方向一個都沒少", () => {
    cover(TAG);
    for (const mode of ["off", "taken", "incoming"] as const) {
      withOutline({ mode });
      for (const cat of COMBAT_TEXT_CATEGORIES) {
        for (const school of SCHOOLS) {
          const css = cssFor(cat, school);
          const st = combatTextStyle(cat, mods(school));
          expect(css, `${cat}/${mode}: 填色不是一個顏色`).toMatch(/(^|;)color:#[0-9a-f]{6}/i);
          expect(css, `${cat}/${mode}: 出現了透明填色(#164 的形狀)`).not.toMatch(
            /text-fill-color\s*:\s*transparent/i,
          );
          // 八個方向的黑框,半徑就是 style 的 outlinePx
          expect(layersInColour(css, RING), `${cat}/${mode}: 黑框不是八層`).toBe(8);
          expect(css).toContain(`${st.outlinePx}px 0px 0 ${RING}`);
        }
      }
    }
  });
});
