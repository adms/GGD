/**
 * owner 對 **GH#433 十四支範圍離群**的逐支裁決，有沒有真的落到**註冊表**上。
 *
 * owner 2026-08-19（逐字，一則訊息裡九支）：
 * > 37-00 鬼眼 → 極大 · 12-002 仙氣發勁 → 極小 · 13-02 龍頭戲畫·牙突 → 極小 ·
 * > 44-01 死神之眼 → 極大 · 79-02 月牙斬 → 小 · 53-03 破法對咒 → 大 ·
 * > 74-01 獄門 → 中 · 48-03 鮮血神殿 → 大 · 14-02 式神炸裂 → 中
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這一條擋的是一個**會安靜發生**的回滾，⛔ 不是「數值有沒有調對」
 *
 * 這九支的級別**不住同一個地方**：五支在 `content/abilities/*.json`，四支在
 * `tools/skill-remake/heroes/*.py`（產生器擁有，改 JSON 會被下一次重生成蓋掉）。
 * 而產生器這條路在 2026-08-21 之前有一個洞：`rangeTier` **不在 `common.py` 的
 * `SPEC_OWNED`**，於是 A-6 的 denylist 每次都把舊 JSON 的 `rangeTier` 原樣救回來，
 * `tierize()` 再照它把 `range` 寫回去（級別贏）⇒ **`A(...)` 的 `rng` 整個失效**。
 * 實測：79-02 的 `rng` 從 2.0 改成 4.5、重生成，`godie-h01n.w.json` 逐位元不變。
 * ⛔ 那是失敗形態②的教科書樣本 —— 產生器、JSON、測試三層一起自洽地錯。
 *
 * ⇒ 把 `rangeTier` 從 `SPEC_OWNED` 拿掉（或把哪一支的級別改回去），這條會紅。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這裡**沒有一個出貨數字**（第零守則：不要過度測試數值）
 *
 * 斷言只有兩句：①級別名 = owner 說的那個字；②解析出來的幾何 = **出貨級距表**
 * 對那一格的值。第二句從 `Configs` 讀 `config.range-tiers@1` / `config.aoe-tiers@1`
 * 推導 ⇒ owner 哪天把「中」從 6 改成 7，這條**自動跟著動**，⛔ 不必改測試。
 *
 * ⚠️ 讀的是 `ContentLoader` + `registerAll` 之後的**登錄表**，⛔ 不是磁碟 JSON：
 * 14-02 式神炸裂的圈住在模板參數（單位 wc3u），磁碟上根本看不出它多大。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { aoeTiersFromDoc } from "./aoeTiers";
import { rangeTiersFromDoc } from "./rangeTiers";
import type { SkillTierName } from "./skillTiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** owner 2026-08-19 的九個裁決。`axis` = 他在講哪一個圈：施法距離還是範圍。 */
const RULINGS: readonly { id: string; label: string; axis: "range" | "radius"; tier: SkillTierName }[] = [
  { id: "godie-ubal.passive", label: "37-00 鬼眼", axis: "range", tier: "極大" },
  { id: "godie-e007.ex", label: "12-002 仙氣發勁（e007）", axis: "range", tier: "極小" },
  { id: "godie-ewar.ex", label: "12-002 仙氣發勁（ewar）", axis: "range", tier: "極小" },
  { id: "godie-efur.w", label: "13-02 龍頭戲畫。牙突", axis: "range", tier: "極小" },
  { id: "godie-emns.q", label: "44-01 死神之眼", axis: "range", tier: "極大" },
  { id: "godie-h01n.w", label: "79-02 月牙斬擊", axis: "range", tier: "小" },
  { id: "godie-o00l.e", label: "53-03 破法對咒", axis: "radius", tier: "大" },
  { id: "godie-u00j.q", label: "74-01 獄門", axis: "radius", tier: "中" },
  { id: "godie-hvsh.e", label: "48-03 鮮血神殿", axis: "radius", tier: "大" },
  { id: "godie-etyr.e", label: "14-02 式神炸裂", axis: "radius", tier: "中" },
];

let table: Record<"range" | "radius", Readonly<Record<SkillTierName, number>>>;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  table = {
    range: rangeTiersFromDoc(Configs.get("range-tiers")).range,
    radius: aoeTiersFromDoc(Configs.get("aoe-tiers")).radius,
  };
});

describe("GH#433 —— owner 的九支範圍裁決有沒有落到登錄表上", () => {
  it("級別名 = owner 說的那個字，而幾何 = 出貨級距表對那一格的值", () => {
    const wrong: string[] = [];
    for (const r of RULINGS) {
      const def = Abilities.get(r.id as never) as unknown as Record<string, unknown> | undefined;
      if (def === undefined) {
        wrong.push(`${r.label}（${r.id}）⛔ 根本沒註冊`);
        continue;
      }
      const gotTier = def[`${r.axis}Tier`];
      const gotValue = def[r.axis];
      const want = table[r.axis][r.tier];
      if (gotTier !== r.tier || gotValue !== want) {
        wrong.push(
          `${r.label}（${r.id}）${r.axis}：裁決是「${r.tier}」＝ ${want}，` +
            `登錄表是「${String(gotTier)}」＝ ${String(gotValue)}`,
        );
      }
    }
    expect(
      wrong,
      "owner 2026-08-19 逐支裁決過這幾支，而登錄表跟他說的不一樣：\n  " +
        wrong.join("\n  ") +
        "\n⛔ 不要改這張表 —— 四支的級別住在 `tools/skill-remake/heroes/*.py`" +
        "（改 JSON 會被 `batch1.py` 蓋掉），其餘在 `content/abilities/`。" +
        "\n⚠️ 如果是 `common.py` 的 `SPEC_OWNED` 少了 `rangeTier`，" +
        "那 `A(...)` 的 `rng` 對全部 90 支都是失效的（見檔頭）。",
    ).toEqual([]);
  });
});

/**
 * ⭐ 上面那一條驗**結果**，這一條驗**接縫還活著**。
 *
 * ⚠️ 兩者不是同一件事：`rangeTier` 從 `SPEC_OWNED` 拿掉之後，出貨 JSON 的級別
 * 會被 A-6 原樣救回來 ⇒ **上面那條仍然全綠**，而 hero 檔從此改不動任何東西。
 * ⛔ 那正是這一批花掉最多時間的東西：一個看起來完全正常的死接縫。
 *
 * 做法：把 hero 檔的 `rng` **在記憶體裡**換成另一格，看產生器的輸出跟不跟。
 * ⛔ 不寫任何檔（`build()` 是純函式，只讀磁碟）。
 */
describe("產生器的 `rng` 接縫是活的（common.py SPEC_OWNED）", () => {
  it("改 hero 檔的施法距離級別，重生成的 JSON 要跟著動", () => {
    const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const out = execFileSync(
      "python3",
      [
        "-c",
        [
          "import sys; sys.path.insert(0, '.')",
          "import batch1, common",
          "want = common.TIER_RANGE['中']",
          "got = {}",
          "for e in common.T:",
          "    if e['num'] != '79-02': continue",
          "    e2 = dict(e); e2['rng'] = want",
          "    r = common.build(e2)",
          "    d = r[-1] if isinstance(r, tuple) else r",
          "    got = {'tier': d.get('rangeTier'), 'range': d.get('range'), 'want': want}",
          "print(got)",
        ].join("\n"),
      ],
      { cwd: join(REPO, "tools/skill-remake"), encoding: "utf8" },
    );
    expect(
      out.trim(),
      "把 hero 檔的 `rng` 換一格，產生器卻吐出原樣 —— `A(...)` 的施法距離參數是死的。\n" +
        "⛔ 修法是把 `rangeTier` 放回 `tools/skill-remake/common.py` 的 `SPEC_OWNED`，\n" +
        "⛔ 不是在 hero 檔裡另外寫一格繞過去（下一支照樣踩）。",
    ).toMatch(/'tier': '中'/);
  });
});
