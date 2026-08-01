/**
 * hudBoundaryCoverage.test.ts — 「新面板會不會忘了被包 / 忘了取名」的 drift 守衛。
 *
 * ⚠️ **這一支是原始碼掃描，它只證明「接線沒斷」，證明不了行為。**
 * 行為那一半由 `hudBoundaryGroup.test.ts` 在 jsdom 裡真的掛 React 樹來守
 * （那支才是這次缺陷的守衛）。兩支缺一不可，理由是這個 repo 的前科：
 * `hudSurfacePaint.test.ts` 檔頭記著一次「原始碼還在、掃描全綠、缺陷完整重現」。
 *
 * 那為什麼還要這一支？因為 `HudBoundaryGroup` 是**自動**包的 —— 新元件寫進 JSX
 * 就會被包住，不會漏。但它的**標籤**不是自動的（出貨 bundle 裡函式名被 esbuild
 * 改掉了，只能靠一張手寫的表）。漏一個標籤不會讓任何行為測試變紅：那一格照樣
 * 被 boundary 保護、照樣畫得出標記，只是標記上寫著「未命名面板」。
 * 那正是「做了但玩家拿不到」的第二形態 —— 出事時螢幕上那行字說不出是哪裡壞了。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";

const TAG = "client-hud-boundary-coverage";

const read = (rel: string): string => readFileSync(join(__dirname, rel), "utf8");

/** 把註解剝掉 —— 這個 repo 的長註解裡什麼元件名都有。 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** `<HudBoundaryGroup …> … </HudBoundaryGroup>` 之間那一段。 */
function groupBody(src: string, where: string): string {
  const open = src.indexOf("<HudBoundaryGroup");
  const close = src.indexOf("</HudBoundaryGroup>");
  expect(open, `${where} 裡找不到 <HudBoundaryGroup> —— 每個成員各自一層的保護不見了`).toBeGreaterThan(
    -1,
  );
  expect(close, `${where} 裡找不到 </HudBoundaryGroup>`).toBeGreaterThan(open);
  return src.slice(open, close);
}

/**
 * 這一段裡出現的所有大寫開頭 JSX 標籤。
 */
function jsxTags(body: string): Set<string> {
  const out = new Set<string>();
  const re = /<([A-Z]\w*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]!);
  out.delete("HudBoundaryGroup");
  return out;
}

/**
 * **不是**直接子元素的元件 —— 它們被當成 prop 或包在別人裡面傳進去，
 * 所以拿不到自己的 boundary，也就不需要自己的標籤。
 *
 * ⚠️ 這是一份**要說出理由**的豁免名單，不是「掃不過就往裡面丟」的垃圾桶。
 * 每一筆都寫清楚它為什麼不是直接子元素；寫不出理由的，該做的是把它變成
 * 直接子元素，而不是加進這裡。
 */
const NOT_DIRECT_CHILDREN: Record<string, string> = {
  // <BottomCluster resources={<ResourceBars />} abilities={… <AbilityBar />} />
  // —— 兩個都是 BottomCluster 的 prop，boundary 落在 BottomCluster 上。
  ResourceBars: "BottomCluster 的 resources prop",
  AbilityBar: "BottomCluster 的 abilities prop",
  // 離開鈕是 <div data-hud-slot="leave"> 裡面的一顆按鈕；boundary 落在那個 div 上
  // （標籤走 data-hud-slot，見 HudBoundaryGroup.hudBoundaryLabel）。
  Btn: "leave 槽位那個 div 的子節點",
};

describe("HUD boundary 標籤覆蓋率", () => {
  for (const [file, where] of [
    ["HudRoot.tsx", "HudRoot"],
    ["platform/AppRoot.tsx", "MatchOverlay"],
  ] as const) {
    it(`★ ${where} 的每一個直接子元件都有中文標籤`, () => {
      cover(TAG);
      const src = stripComments(read(file));
      const body = groupBody(src, where);
      const tags = jsxTags(body);
      expect(tags.size, `${where} 掃不到任何元件 —— 掃描壞了，不是真的沒有`).toBeGreaterThan(3);

      const missing: string[] = [];
      for (const tag of tags) {
        if (tag in NOT_DIRECT_CHILDREN) continue;
        // 標籤表的形狀是 `[Xxx, "中文"]`
        if (!new RegExp(`\\[\\s*${tag}\\s*,\\s*"`).test(src)) missing.push(tag);
      }
      expect(
        missing,
        `${where} 有元件沒有登記中文標籤：${missing.join(", ")}。\n` +
          "它壞掉時螢幕上會寫「未命名面板 顯示不出來」，玩家看不出是哪裡壞了 —— " +
          "⚠️ 不能用 `type.name` 代替：出貨 bundle 裡這些函式名已經被 esbuild 改掉了。\n" +
          "去該檔案的標籤表補一筆 `[元件, \"玩家看得懂的位置名\"]`。",
      ).toEqual([]);
    });
  }

  it("★ 標籤寫的是位置名，不是元件名", () => {
    cover(TAG);
    // 一個直接把元件名當標籤用的表，等於沒有標籤（玩家看不懂 MerchantShop）。
    const src = stripComments(read("HudRoot.tsx"));
    const pairs = [...src.matchAll(/\[\s*(\w+)\s*,\s*"([^"]+)"\]/g)];
    expect(pairs.length, "HudRoot 的標籤表掃不到 —— 掃描壞了").toBeGreaterThan(20);
    const echoed = pairs.filter(([, comp, label]) => comp === label);
    expect(echoed.map(([, c]) => c), "標籤直接複述元件名").toEqual([]);
    // 而且要是中文 —— 這行字是給正在打的家人看的。
    const nonHan = pairs.filter(([, , label]) => !/[一-鿿]/.test(label!));
    expect(nonHan.map(([, c]) => c), "標籤裡沒有中文").toEqual([]);
  });
});
