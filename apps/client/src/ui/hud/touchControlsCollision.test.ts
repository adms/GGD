/**
 * ⭐ GH#765 —— TouchControls 的攻擊鈕 × HUD slot 的**真矩形交集**。
 *
 * ⚠️ 這條守衛跟著**已經發生過的缺陷**走（⛔ 不是跟著一張元件清單走）：
 * `028aa3bf` 的訊息逐字量到「觸控 **844x390 裝備欄壓在攻擊鈕上重疊 88x38**
 * 且 z 序贏 + pointerEvents auto，所以它吃掉那塊的觸控」，
 * 並自陳第二個盲點是「**TouchControls 完全不在 hudLayout 的世界裡**」。
 * ⇒ 在此之前 `grep -rn "touchControlsRect" apps/ packages/` = **0 命中**。
 *
 * ⭐ 形狀抄 `panels/prepClockDraftCollision.test.ts`（已證明有效）：真矩形交集
 * ＋ 一條 **REGRESSION 反證**。⛔ 反證不是裝飾 —— 一把沒有先量到已知的壞的尺，
 * 它綠了不代表任何事（天譴那次的 d 洞）。
 *
 * ⛔ 它只關掉**幾何**那一半：`pointerEvents` / z 序不是矩形，不重疊
 * ⛔ 不等於觸控不會被吃掉。
 *
 * ⚠️⚠️ 這條守衛一上就抓到 3 個真重疊，而 844×390 那一個逐位元等於 `028aa3bf` 的
 * **88×38** —— 也就是那個缺陷在 2026-08-27 之前**從來沒有被修掉**：
 * `touchCorner: "top-right"` 只是把裝備欄換一個角落，而 390 高的螢幕上那一疊
 * 往下長，照樣落在攻擊鈕上。
 *
 * ⭐⭐ **GH#800 修掉了它**（2026-08-27）：`equipment` 的 `touchOrder` 5 → **0**，
 * 也就是那一疊裡**最寬**（150px，右對齊後與攻擊鈕的水平交集是滿的 88）的那一個
 * 排到最上面 y 10..58。⇒ `KNOWN` 現在是**空的**，而 `touchControlsRect.ts` 的
 * 量法**一個字都沒改**（⛔ 修尺不是修缺陷 —— 與 #759 逐字禁止的作弊法同型）。
 *
 * ⚠️ 但 `KNOWN` 空了 **⛔ 不等於觸控叢集乾淨了** —— 見下面的 `CLUSTER_RESIDUAL`：
 * 右欄整疊 300px 而叢集的上緣在 y≈94 ⇒ 算術上一定還有殘量。**#800 因此不關。**
 *
 * ── 突變（2026-08-27）：`hudLayout.ts` 的 `equipment.touchOrder` 從 0 改回 5
 *    → `CLUSTER_RESIDUAL` 紅並指名 `844x390/equipment×attack = 88×38`。改回來即綠。
 */
import { describe, it, expect } from "vitest";
import { HUD_SLOTS, hudSlotRect, type HudRect, type HudSlotId, type HudViewport } from "./hudLayout";
import { touchControlsRect } from "./touchControlsRect";
import { shouldShowRotateOverlay } from "../../input/mobileDetect";

/** ⭐ 844×390 是 `028aa3bf` 量到的那一組，⛔ 不可以為了讓未來的排版變綠而刪掉。 */
const VIEWPORTS: readonly (HudViewport & { note: string })[] = [
  { width: 844, height: 390, note: "028aa3bf 量到 88×38 的那一組" },
  { width: 852, height: 393, note: "iPhone 15 landscape" },
  { width: 780, height: 360, note: "#151 breakpoint" },
  { width: 375, height: 667, note: "phone portrait" },
];

/** 交集矩形（沒有交集回 null）—— 反證要報「重疊多大」，⛔ 不是「有沒有」。 */
function intersection(a: HudRect, b: HudRect): HudRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

describe("GH#765 觸控攻擊鈕 × 裝備欄 —— 真矩形，⛔ 不是 `displaced === \"hide\"`", () => {
  /**
   * ⭐ 今天量到的重疊，一列一個。**只能變短。**
   * `844x390/attack` 那一列逐位元等於 `028aa3bf` 的訊息裡寫的「**重疊 88x38**」
   * —— 這同時就是這把尺的**自證**：它量得到那個已知的壞（⛔ 否則它綠了不代表任何事）。
   */
  const KNOWN = new Map<string, string>([
    // ⭐⭐ GH#800 —— **空的，而且是真的空的**：`equipment` 的 `touchOrder` 從 5
    // 換到 **0**（top-right 那一疊的最上面，y 10..58），四個 viewport 上
    // 攻擊鈕 × 裝備欄的交集全部歸零。⛔ 量法一個字都沒改（`touchControlsRect.ts`
    // 在這次的 diff 裡是零改動）—— 動的是 `hudLayout.ts` 的排序。
    // ⚠️ 它空了**不代表觸控叢集乾淨了** —— 見下面的 `CLUSTER_RESIDUAL`。
  ]);

  /** 這一次量到的全部重疊（key → 「w×h」）。 */
  function measured(): Map<string, string> {
    const out = new Map<string, string>();
    for (const vp of VIEWPORTS) {
      const eq = hudSlotRect("equipment", vp, true);
      for (const { id, rect } of touchControlsRect(vp).buttons) {
        const hit = intersection(rect, eq);
        if (hit) out.set(`${vp.width}x${vp.height}/${id}`, `${hit.w}×${hit.h}`);
      }
    }
    return out;
  }

  it("⛔ 沒有**新的**（或變大的）重疊", () => {
    const now = measured();
    const problems: string[] = [];
    for (const [k, v] of now) {
      const known = KNOWN.get(k);
      if (known === undefined) problems.push(`新的重疊 ${k} = ${v}`);
      else if (known !== v) problems.push(`${k} 從 ${known} 變成 ${v}`);
    }
    expect(problems).toEqual([]);
  });

  it("⭐ 帳本只能變短：修好一列就把它刪掉（⛔ 留著＝下一輪讀到一個假的缺陷）", () => {
    const now = measured();
    const stale = [...KNOWN.keys()].filter((k) => !now.has(k));
    expect(stale, "這幾列已經不重疊了 —— 刪掉它們，⛔ 不要留著").toEqual([]);
  });

  /**
   * ⭐⭐ GH#800 的**誠實那一半**：`KNOWN` 空了只證明「攻擊鈕 × 裝備欄」歸零，
   * ⛔ 不證明觸控叢集不再被 chrome 蓋住。這一本量的是 **top-right 整疊 × 逐顆按鈕**。
   *
   * ⚠️ 它**一上就不是空的**，而那正是重點：右欄真正空著的只有 y 10..94
   * （`recall` 的上緣），而那一疊有 300px ⇒ 算術上放不下六個控制項。
   * 歸零＝手機上少一顆控制項 = owner 看得到的取捨（第一守則：一格後台開關，
   * 三個住處）⇒ ⛔ 不是只准動 `apps/client` 的 lane 做得完的。**#800 因此不關。**
   *
   * ⭐ 它同時是這把尺的**自證**：一本量得到真重疊的帳，比一條「什麼都沒量到」
   * 的綠燈可信（天譴那次的 d 洞）。⛔ 只能變短。
   */
  /**
   * ⭐⭐ 2026-08-29 —— **分母從一張手挑的名單換成「每一個 slot」**，而那一換
   * 當場多出三列：`gold-level×attack = 88×86`（三個橫向 viewport 全中）。
   *
   * ⚠️ 在此之前這裡寫的是
   * `["leave","scoreboard","audio-toggle","settings","cheats","equipment"]`
   * —— 也就是**只量 top-right 那一疊**。⛔ 而 `gold-level` 在觸控下**留在
   * bottom-right**（`touchWidth:120` / `touchHeight:116`，⛔ 沒有 `touchCorner`），
   * 也就是攻擊鈕正下方那一格 ⇒ 它**結構上進不了這本帳**。
   * ⭐ 兩本帳（`KNOWN` 只掃 `equipment`、這一本只掃六個手挑的）**都**看不見它，
   * 於是它比票上那個 88×38 大一倍，而**沒有任何東西紅過**（失敗形態⑫：
   * 只驗被宣告的那一頭；以及「這一欄的分母是什麼」）。
   *
   * ⭐ 現在分母是 `HUD_SLOTS` 本身 —— ⛔ 沒有手挑名單可以再漏掉下一個。
   *
   * ⚠️ viewport 的分母同樣是**推導**的：直立觸控整片蓋著 `RotateOverlay`
   * （`hudBottomCluster.test.ts` 有那個豁免的完整自證），所以這裡讀**出貨的
   * 那支 predicate**，⛔ 不是一張寫死的清單。
   */
  const CLUSTER_RESIDUAL = new Map<string, string>([
    // ⭐⭐ 攻擊鈕（88×88）被右下角的金錢/等級/頭像面板蓋掉 **88×86 = 97.7%**。
    // `HUD_Z.slot`(25) > TouchControls 根節點的 `zIndex:20`，而兩者同在 `#hud-root`
    // （z-index:10，**開一個 stacking context**）⇒ 面板**畫在攻擊鈕上面**，
    // 底色 `PANEL_BG = rgba(12,16,26,0.88)` ⇒ 88% 不透明。
    // ⚠️ ⛔ 它**不吃觸控**：`pointer-events` 是可繼承屬性，`#hud-root` 宣告了
    // `none` 而 `hudSlotStyle()`／`GoldLevel` 兩邊都沒有覆寫 ⇒ 按得到、看不到。
    // ⇒ 搬它是**版面決策**（換角落／收起／縮小），照票的 Implementation
    // constraints 要一格三住處後台開關 ⇒ ⛔ 不是只准動 `apps/client/**` 的
    // lane 做得完的。**記在這裡，⛔ 不偷偷搬。**
    ["844x390/gold-level×attack", "88×86"],
    ["852x393/gold-level×attack", "88×86"],
    ["780x360/gold-level×attack", "88×86"],
    ["844x390/scoreboard×recall", "44×16"],
    ["844x390/audio-toggle×R", "55×7"],
    ["844x390/audio-toggle×recall", "44×20"],
    ["844x390/settings×attack", "14×38"],
    ["844x390/cheats×R", "45×43"],
    ["852x393/scoreboard×recall", "44×13"],
    ["852x393/audio-toggle×R", "55×4"],
    ["852x393/audio-toggle×recall", "44×23"],
    ["852x393/settings×attack", "14×35"],
    ["852x393/cheats×R", "45×44"],
    ["780x360/leave×attack", "50×16"],
    ["780x360/scoreboard×recall", "44×42"],
    ["780x360/audio-toggle×R", "55×37"],
    ["780x360/settings×attack", "14×44"],
    ["780x360/cheats×R", "45×13"],
  ]);

  /** 玩家真的到得了 HUD 的 viewport（⛔ 直立整片蓋著 RotateOverlay）。 */
  const reachable = VIEWPORTS.filter(
    (vp) => !shouldShowRotateOverlay({ touch: true, width: vp.width, height: vp.height }),
  );

  it("⭐ **每一個** HUD slot × 觸控叢集：⛔ 沒有新的，而帳本仍然逐列為真", () => {
    // 非空洞：兩個分母都要真的有東西，否則這條守衛是空的
    expect(reachable.length, "每個 viewport 都被豁免了").toBeGreaterThan(0);
    expect(reachable.length, "沒有 viewport 走到豁免那條路").toBeLessThan(VIEWPORTS.length);
    const now = new Map<string, string>();
    for (const vp of reachable) {
      for (const spec of HUD_SLOTS) {
        // `HUD_SLOTS` 的靜態型別是 `HudSlotSpec[]`（`id: string`）—— 這一個
        // cast 是型別加寬的代價,⛔ 不是在繞過什麼:分母**就是**這張登記表本身。
        const sr = hudSlotRect(spec.id as HudSlotId, vp, true);
        for (const { id, rect } of touchControlsRect(vp).buttons) {
          const hit = intersection(rect, sr);
          if (hit) now.set(`${vp.width}x${vp.height}/${spec.id}×${id}`, `${hit.w}×${hit.h}`);
        }
      }
    }
    const problems: string[] = [];
    for (const [k, v] of now) {
      const known = CLUSTER_RESIDUAL.get(k);
      if (known === undefined) problems.push(`新的重疊 ${k} = ${v}`);
      else if (known !== v) problems.push(`${k} 從 ${known} 變成 ${v}`);
    }
    for (const k of CLUSTER_RESIDUAL.keys())
      if (!now.has(k)) problems.push(`${k} 已經不重疊了 —— 從帳本刪掉`);
    expect(problems).toEqual([]);
  });

  it("⭐ 非空洞：375×667 直立完全不重疊 —— 證明這把尺不是「一律回重疊」", () => {
    const vp = VIEWPORTS.find((v) => v.width === 375)!;
    const eq = hudSlotRect("equipment", vp, true);
    expect(touchControlsRect(vp).buttons.filter((b) => intersection(b.rect, eq))).toEqual([]);
  });
});
