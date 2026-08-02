/**
 * itemCardText 的行為守衛 —— 斷言的是**畫面上會被切成什麼**,不是「函式有回傳」。
 *
 * 每一組輸入都是從那 49 支傳說武器的 description 逐字抄下來的真實片段
 * (檔案在 `content/items/`,池子在 `content/loot-tables/legendary-weapons.json`),
 * 所以這裡不會出現「測試通過但出貨的文案是另一種形狀」(失敗形態 ⑤)。
 */
import { describe, it, expect } from "vitest";
import {
  itemCardCategories,
  itemCardPlainText,
  parseItemCard,
  tokenizeCardLine,
  tokenizeValues,
} from "./itemCardText";
import { DEFAULT_ITEM_CARD } from "./schema/config";

/** 只留 token 的 (kind, text),讓斷言讀起來就是「畫面上這一行被切成什麼」。 */
const shape = (line: string) =>
  tokenizeCardLine(line).map((t) => (t.kind === "tag" ? [t.kind, t.text, t.category] : [t.kind, t.text]));

describe("數值 token 的辨識 (itemCardText.tokenizeValues)", () => {
  it("把 stat 行切成「名稱 + 數值」兩塊,不把名稱吞進數值", () => {
    expect(tokenizeValues("攻擊力+87")).toEqual([
      { kind: "text", text: "攻擊力" },
      { kind: "num", text: "+87" },
    ]);
    expect(tokenizeValues("防禦+13")).toEqual([
      { kind: "text", text: "防禦" },
      { kind: "num", text: "+13" },
    ]);
  });

  it("百分比、乘號、負號都算數值的一部分", () => {
    expect(tokenizeValues("攻擊速度+30%")).toEqual([
      { kind: "text", text: "攻擊速度" },
      { kind: "num", text: "+30%" },
    ]);
    // 黃金聖鬥衣 godie-i00s
    expect(tokenizeValues("總移動速度*1.2")).toEqual([
      { kind: "text", text: "總移動速度" },
      { kind: "num", text: "*1.2" },
    ]);
    // 天堂之劍 godie-i01n
    expect(tokenizeValues("總生命-50%")).toEqual([
      { kind: "text", text: "總生命" },
      { kind: "num", text: "-50%" },
    ]);
  });

  it("數值在句子開頭時,後面的字仍是文字", () => {
    // 雷神之鎚 godie-i01i
    expect(tokenizeValues("7%機率產生")).toEqual([
      { kind: "num", text: "7%" },
      { kind: "text", text: "機率產生" },
    ]);
  });

  it("時間單位跟著數字走 —— 「冷卻1秒」的 1秒 是一塊", () => {
    // 炎神弩 godie-i06i
    expect(tokenizeValues("冷卻1秒")).toEqual([
      { kind: "text", text: "冷卻" },
      { kind: "num", text: "1秒" },
    ]);
    // 貫雷槍 godie-i01g
    expect(tokenizeValues("持續 0.6秒")).toEqual([
      { kind: "text", text: "持續 " },
      { kind: "num", text: "0.6秒" },
    ]);
  });

  it("區間是一個 token,不是兩個數字夾一個減號", () => {
    // 炎神弩 godie-i06i:「攻擊額外造成 10-1000 傷害」
    expect(tokenizeValues("造成 10-1000 傷害")).toEqual([
      { kind: "text", text: "造成 " },
      { kind: "num", text: "10-1000" },
      { kind: "text", text: " 傷害" },
    ]);
    expect(tokenizeValues("(0~10)")).toEqual([
      { kind: "text", text: "(" },
      { kind: "num", text: "0~10" },
      { kind: "text", text: ")" },
    ]);
  });

  it("「距離」「傷害」這種名詞不會被吞進數值(否則整句話都變成一個黃色 token)", () => {
    // 近擊的巨人鎧 bulwark-charge-greaves
    expect(tokenizeValues("向前衝刺 4.5 距離")).toEqual([
      { kind: "text", text: "向前衝刺 " },
      { kind: "num", text: "4.5" },
      { kind: "text", text: " 距離" },
    ]);
  });

  it("原稿在符號後、單位前留的空白算數值的一部分(`AP + 87`、`冷卻 8 秒`)", () => {
    // 天地崩裂魔杖 godie-i03h / 近擊的巨人鎧 bulwark-charge-greaves
    expect(tokenizeValues("AP + 87")).toEqual([
      { kind: "text", text: "AP " },
      { kind: "num", text: "+ 87" },
    ]);
    expect(tokenizeValues("（冷卻 8 秒）")).toEqual([
      { kind: "text", text: "（冷卻 " },
      { kind: "num", text: "8 秒" },
      { kind: "text", text: "）" },
    ]);
  });

  it("完全沒有數字的一行原封不動回一個 text token", () => {
    expect(tokenizeValues("永久隱身")).toEqual([{ kind: "text", text: "永久隱身" }]);
    expect(tokenizeValues("")).toEqual([]);
  });
});

describe("標記 chip 的辨識與歸類 (itemCardText.tokenizeCardLine)", () => {
  it("行首的 [標記] 變成帶分類的 chip,其餘照數值規則切", () => {
    // 丈八蛇矛 godie-i000
    expect(shape("[擴散] 擴散傷害87%")).toEqual([
      ["tag", "擴散", "active"],
      ["text", " 擴散傷害"],
      ["num", "87%"],
    ]);
  });

  it("owner 點名的 [焚身] 真的在表上,而且歸在負面/控場", () => {
    // 死之王的神盾 godie-i061
    expect(shape("[焚身] 每秒造成周圍範圍燃燒 10% AP 傷害")).toEqual([
      ["tag", "焚身", "debuff"],
      ["text", " 每秒造成周圍範圍燃燒 "],
      ["num", "10%"],
      ["text", " AP 傷害"],
    ]);
  });

  it("同一行可以有兩個標記(雷神之鎚就是),兩個都畫成 chip", () => {
    const t = shape(
      "[On-Hit] 7%機率產生造成 100% AP 雷電範圍傷害 (On-Hit)，[緩慢] 並使範圍內部隊移動速度下降50%，持續1秒",
    );
    expect(t.filter((x) => x[0] === "tag")).toEqual([
      ["tag", "On-Hit", "active"],
      ["tag", "緩慢", "debuff"],
    ]);
    // 括號裡那個沒有方括號的 "(On-Hit)" 是原文的一部分,必須留在文字裡 ——
    // 它不是標記,把它也 chip 化就是在改 owner 的排版意圖。
    expect(t.some((x) => x[0] === "text" && String(x[1]).includes("(On-Hit)"))).toBe(true);
  });

  it("owner 原稿的兩種寫法 [On-Hit] / [OnHit] 都認得 —— 因為原稿不准改", () => {
    // 雅典娜的驚嘆號 godie-i006 是全 49 支裡唯一寫 [OnHit] 的
    expect(shape("[OnHit] 每次攻擊造成造成額外 33% AP傷害(On-Hit)")[0]).toEqual([
      "tag",
      "OnHit",
      "active",
    ]);
  });

  it("方括號裡其實是內嵌數值的那一個,畫成數值不是 chip", () => {
    // 虛哭神去 godie-i007
    const t = shape("[On-Hit] 每次攻擊造成造成額外 [自身已損失的生命百分比數值(0~100)] (On-Hit)");
    expect(t).toContainEqual(["num", "自身已損失的生命百分比數值(0~100)"]);
    expect(t.filter((x) => x[0] === "tag")).toEqual([["tag", "On-Hit", "active"]]);
  });

  it("表上沒有的新標記落到預設分類,卡片照常畫出來(不 throw、不吃掉那段字)", () => {
    const t = shape("[某個明天才會存在的標記] 效果說明+5");
    expect(t[0]).toEqual(["tag", "某個明天才會存在的標記", DEFAULT_ITEM_CARD.unknownCategory]);
    expect(t).toContainEqual(["num", "+5"]);
  });

  it("四個分類真的都會出現在 49 支上(表不是只有一種顏色在用)", () => {
    const cats = new Set(
      [
        "[伸長] 近戰攻擊距離+4",
        "[衝刺] 施放技能時向前衝刺 4.5 距離",
        "[隱身] 永久隱身",
        "[暈眩] 8%的機率增加 140點傷害並暈眩0.1秒",
      ].flatMap((l) => tokenizeCardLine(l).flatMap((t) => (t.kind === "tag" ? [t.category] : []))),
    );
    expect([...cats].sort()).toEqual(["debuff", "passive", "stat"].concat("active").sort());
  });
});

describe("分段規則 (itemCardText.parseItemCard)", () => {
  // 至尊魔戒 godie-i004 —— 稀有度 + 效能 + 解說 的標準三段
  const RING = "任務\n效能\n魔力+1000\n[隱身] 永久隱身 (不會被主動索敵)，但攻擊會現身，無動作 3秒後再次隱身。\n\n解說\n馭眾王之戒，戴上者能夠跟黑暗之王索崙產生連結進而提昇能力。";

  it("稀有度、效能行、解說各自分開 —— 效能行**保持成多行**,不是接成一句", () => {
    const card = parseItemCard(RING);
    expect(card.rarity).toBe("任務");
    expect(card.efficacy).toHaveLength(2);
    expect(card.loreHeading).toBe("解說");
    expect(card.lore).toHaveLength(1);
    // owner 的抱怨就是這個:五行效能被 ` · ` 接成一整條。這一條釘住「不接」。
    expect(itemCardPlainText(card)).toContain("\n");
    expect(itemCardPlainText(card)).not.toContain(" · ");
  });

  it("黃金聖鬥衣的五行效能仍然是五列(最容易被接成一坨的那一支)", () => {
    // godie-i00s
    const card = parseItemCard(
      "夢幻\n效能\n[格擋] 50%機率抵擋 100% AP傷害\n生命+1200\n魔力+1200\n攻擊速度+120%\n總移動速度*1.2\n\n解說\n傳說從神話時代就與黃道十二宮並存的黃金聖衣，能將攻擊和移動速度大幅提升。",
    );
    expect(card.efficacy).toHaveLength(5);
  });

  it("`效能：` 的全形冒號與 `歷史` 這個代替 `解說` 的標題都認得", () => {
    // 狂暴軒轅劍 godie-i02e —— 全 49 支裡唯一同時踩到這兩個的
    const card = parseItemCard(
      "傳說\n效能：\n攻擊速度+200%\n[暈眩] 10%的機率普攻造成暈眩 0.1秒\n\n歷史\n傳說中的上古十大神器之ㄧ，被封為最強力量。",
    );
    expect(card.rarity).toBe("傳說");
    expect(card.loreHeading).toBe("歷史");
    expect(card.lore).toHaveLength(1);
    // 兩行效能,不是三行 ——「效能：」被吃掉了才對
    expect(card.efficacy).toHaveLength(2);
  });

  it("沒寫 `效能` 標題的文件,內文仍然進效果區", () => {
    // 死之王的意志 godie-i060 —— 稀有度之後直接是機制行
    const card = parseItemCard(
      "傳說\n[斬殺] 可直接斬殺生命低於 3%的敵方單位\n[緩慢] 周圍敵方 總移動速度 減半\n\n解說\n傳說死之王曾經是一位喜歡搞笑的學生。",
    );
    expect(card.rarity).toBe("傳說");
    expect(card.efficacy).toHaveLength(2);
    expect(card.lore).toHaveLength(1);
  });

  it("稀有度判形狀不查字典 —— `作者威能超神器` 也認得", () => {
    // 消失的密室 godie-i02d;白名單式的判斷(itemStats.RARITY_WORDS)漏掉了它
    const card = parseItemCard("作者威能超神器\n效能\n防禦+100\n\n解說\n傳說等級的內褲。");
    expect(card.rarity).toBe("作者威能超神器");
    expect(card.efficacy).toHaveLength(1);
  });

  it("空 / null 的 description 回一張空卡,不 throw", () => {
    expect(parseItemCard(null)).toEqual({ rarity: null, efficacy: [], loreHeading: null, lore: [] });
    expect(parseItemCard("")).toEqual({ rarity: null, efficacy: [], loreHeading: null, lore: [] });
  });

  it("卡片用到的分類依固定順序回報(四個介面看到的圖例順序一致)", () => {
    const card = parseItemCard(
      "傳說\n效能\n[暈眩] 暈眩0.1秒\n[伸長] 近戰攻擊距離+4\n[隱身] 永久隱身\n",
    );
    expect(itemCardCategories(card)).toEqual(["stat", "passive", "debuff"]);
  });
});
