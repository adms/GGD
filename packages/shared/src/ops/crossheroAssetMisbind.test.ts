/**
 * 🎭 GH#627 —— **A 英雄的資產綁到 B 英雄身上** ⇒ 紅，⭐ 而**變身態借用本體** ⇒ 綠。
 *
 * ⭐ 探針全部是**出貨形狀**：拿真的出貨文件 clone 一份、只動一格（⛔ 不是自己捏一份
 * 夾具 —— 失敗形態⑤「被測的不是出貨的那個」）。⭐ **兩個方向寫在同一條** `it()` 裡，
 * 因為不變量是一個**關係**：同一格換成同家族 ⇒ 綠、換成別的家族 ⇒ 紅。三個面各一條：
 *
 *   ① 語音 · 扁平陣列   `audio-manifests/taunts.json[].out`          綁定端＝同層 `id`
 *   ② 語音 · 英雄 map   `config/victory-taunts.json.roundWin.<英雄>`  綁定端＝**map key**
 *   ③ 音效/特效綁定     `config/ability-vfx-bindings.json.bindings[]`  綁定端＝`abilityId`
 *
 * ⛔⛔ **上一版（`f671cc237`）這三個面全部檢查 0 個參照**：它的綁定端只認「文件 id」，
 * 於是 `content/config/` 的 91 份 100% 被跳過；而 `taunts[].out` 的 basename
 * （`godie-e001-1.mp3`）第一個 dot 段不是英雄 id 所以也漏掉。逐欄位量過它守的是
 * **圖示 775 ＋ ability-id**，⛔ 而票的 AC 逐字要「模型/語音/音效」。量法寫在
 * `content/crossHeroAssetBinding.ts` 的檔頭。
 *
 * 突變紀錄（2026-08-30 實跑，**五條各自隔離**、還原後 sha256 逐位元組相同；
 * ⭐ 每一條都**只**打中預期的那幾條 ⇒ 那些行確實在夾具下被執行到，⛔ 不是連帶紅）：
 *   A. `assetHeroOwner` 的 `basename.startsWith(id)` → 上一版的「第一個 dot 段」
 *      ⇒ **只有①紅** ⇒ 那一行正是讓 204 筆 `taunts[].out` 可見的線。
 *   B. `walk` 的 `declared` 分支（同層 id ⛔ 不得改寫上層宣告）→ 無條件 `owner = h`
 *      ⇒ **只有②紅** ⇒ map-key 優先序那幾行真的被②走到。
 *   C. `push` 的家族比對 → 裸 id 相等（拿掉家族關係）
 *      ⇒ **①②③一起紅** ⇒ 家族關係承重：沒有它，**每一個變身態都會被判紅**
 *        ＝這條閘第一天就會被關掉（＝票文說的「被放寬的閘等於沒有閘」）。
 *   D. `heroFamilies` 拿掉 `retired` 那一行（＝退場態仍然合併家族）
 *      ⇒ **只有 #623 那條紅** ⇒ AC 第三句真的被驗到，⛔ 不是寫在註解裡。
 *   E. `walk` 拿掉 `DECLARATION_FIELDS` 跳過（＝把 `counterpartId` 當成一筆綁定）
 *      ⇒ **只有出貨斷言紅**（12 筆，退場那 6 位的兩個方向）
 *      ⇒ 證明「宣告 ≠ 綁定」那一行是**現在**就承重的，⛔ 不是預防性的。
 */
import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findCrossHeroMisbindings, heroFamilies,
  type ChampionTransformView, type CrossHeroMisbinding, type ScannableDoc,
} from "../content/crossHeroAssetBinding";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const load = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

const champions = globSync(join(REPO, "content/champions/*.json"))
  .filter((p) => !basename(p).startsWith("_"))
  .map((p) => load(p) as ChampionTransformView);
const roster = new Set(champions.map((c) => c.id));
/** #623 的退場名單 —— ⭐ 出貨內容自己宣告的，⛔ 不是這裡手寫的。 */
const retired = new Set((load(join(REPO, "content/config/roster.json")) as { retiredChampions: string[] }).retiredChampions);
const { familyOf, keyIssues } = heroFamilies(champions, retired);

const docs: ScannableDoc[] = globSync(join(REPO, "content/*/*.json"))
  .filter((p) => !basename(p).startsWith("_") && !p.includes("/content/assets/"))
  .map((p) => {
    const doc = load(p) as { id?: unknown };
    const docId = typeof doc.id === "string" ? doc.id : basename(p, ".json");
    return { collection: basename(dirname(p)), docId, doc };
  });

const scan = (d: readonly ScannableDoc[]): CrossHeroMisbinding[] => findCrossHeroMisbindings(d, roster, familyOf);

/**
 * `godie-e002` ⇄ `godie-e00l` 是一對出貨變身態，且**三份探針文件裡都有它**；
 * `godie-e001` 是別的家族。⛔ 三個都不是寫死的斷言 —— 家族由 `heroFamilies()` 從出貨
 * `transform.counterpartId` 現算，⇒ #623 退場後守衛自動變嚴而**不必改測試**（票的 AC）。
 */
const SELF = "godie-e002";
const KIN = "godie-e00l";
const ALIEN = "godie-e001";

/** `[面, 文件 id, ⭐ 期望被指名的**那一格**, 種一筆綁定]`。 */
const PROBES: readonly (readonly [string, string, string, (d: unknown, h: string) => void])[] = [
  [
    "語音 · 扁平陣列（綁定端＝同層 id）", "taunts", "[].out",
    (d, h) => {
      const rows = d as { id: string; out: string }[];
      rows[rows.findIndex((r) => r.id.includes(SELF))]!.out = `../assets/audio/round/${h}-1.mp3`;
    },
  ],
  [
    "語音 · 英雄 map key（同層 id ⛔ 不得改寫 map key）", "victory-taunts", `.roundWin.${SELF}.lines[].id`,
    (d, h) => {
      const rw = (d as { roundWin: Record<string, { lines: { id: string }[] }> }).roundWin;
      rw[SELF]!.lines[0]!.id = `taunt-round-${h}-1`;
    },
  ],
  [
    "音效/特效綁定（綁定端＝abilityId）", "ability-vfx-bindings", ".bindings[].vfxKeys[]",
    (d, h) => {
      const b = (d as { bindings: { abilityId: string; vfxKeys: string[] }[] }).bindings;
      b[b.findIndex((x) => x.abilityId.startsWith(SELF))]!.vfxKeys[0] = `${h}.q.beam`;
    },
  ],
];

describe("跨英雄資產誤配 (GH#627)", () => {
  it("出貨態：變身 join key 自洽，且零筆跨家族綁定", () => {
    expect(keyIssues).toEqual([]);
    expect(docs.length).toBeGreaterThan(1000);
    expect(scan(docs)).toEqual([]);
  });

  it("#623 退場一對 ⇒ 借用它自動變成跨家族（⛔ 不必改測試）", () => {
    // ⭐ 同一對：無視退場名單時同家族、照退場名單時**不再**同家族 ＝「自動變嚴」。
    const ignoring623 = heroFamilies(champions).familyOf;
    const form = champions.find((c) => retired.has(c.id) && c.transform?.counterpartId);
    const base = form?.transform?.counterpartId;
    if (!form || !base) throw new Error("no retired form ships today");
    expect(ignoring623.get(form.id)).toBe(ignoring623.get(base));
    expect(familyOf.get(form.id)).not.toBe(familyOf.get(base));
  });

  for (const [face, docId, at, plant] of PROBES) {
    it(`${face}：跨對 ⇒ 紅並指名兩端 · 同對（變身態借用）⇒ 綠`, () => {
      const src = docs.find((d) => d.docId === docId);
      if (!src) throw new Error(`fixture doc missing: ${docId}`);
      const planted = (hero: string): CrossHeroMisbinding[] => {
        const d = structuredClone(src);
        plant(d.doc, hero);
        return scan([d]);
      };
      const seen = planted(ALIEN).map((h) => `${h.fieldPath} ${h.bindingHero}←${h.assetHero}`);
      expect(seen).toEqual([`${at} ${SELF}←${ALIEN}`]);
      expect(planted(KIN)).toEqual([]);
    });
  }
});
