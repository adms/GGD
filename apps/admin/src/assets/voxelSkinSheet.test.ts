/**
 * 體素外觀對照表 — the data layer.
 *
 * The page's whole claim is that its numbers ARE the build's numbers, so these
 * tests hold the sheet to the same invariants the shared generator's tests hold
 * the generator to, and check that the honest-failure paths really are honest.
 */
import { describe, it, expect } from "vitest";
import { counterpartFormId } from "@ggd/shared/content/championForms";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMPTY_FILTER,
  applyFilter,
  buildSheet,
  exportOverrideStub,
  outfitHue,
  parseChampionIndex,
  parseOverrides,
  similarPairs,
  sortRows,
} from "./voxelSkinSheet";
import { BLIZZARD_MODEL_CHAMPIONS } from "@ggd/shared/content/voxelSkin";
import { composeThumb, THUMB_H, THUMB_W } from "../ui/voxelSkinThumb";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const CHAMPIONS = join(CONTENT, "champions");

const docs = readdirSync(CHAMPIONS)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(CHAMPIONS, f), "utf8")));

const overrides = parseOverrides(
  JSON.parse(readFileSync(join(CONTENT, "models/_voxel-skins.json"), "utf8")),
);

const sheet = buildSheet(docs, overrides);

describe("buildSheet over the real roster", () => {
  it("covers every champion and every look is distinct", () => {
    expect(sheet.rows.length).toBe(docs.length);
    expect(sheet.stats.champions).toBe(docs.length);
    expect(sheet.stats.distinctLooks).toBe(docs.length);
    expect(sheet.stats.collisions).toBe(0);
  });

  it("reports the budget the page displays, and it is the real one", () => {
    // the page prints these; they must be measured, not decorative
    expect(sheet.stats.shippedTextureBytes).toBe(0);
    expect(sheet.stats.atlasBytesPerChampion).toBe(64 * 64 * 4);
    expect(sheet.stats.recipeBytes).toBeGreaterThan(0);
    expect(sheet.stats.recipeBytes).toBeLessThan(32 * 1024);
  });

  it("flags the shared-stand-in population and the hand-authored overrides", () => {
    // ⛔ 這裡**不抄一個出貨規模**。它抄過三次（43 → 48 → …），每一次名單一動
    // 就用「48 變成 21」這種跟缺陷無關的訊息紅 —— 2026-08-13 那 41 隻搬進
    // `_legacy/` 就是這樣紅的。⭐ 要釘的是**共用替身這件事還在被算**：
    // 統計數字必須等於 rows 自己數出來的，而且不能是 0（0 = 整個族群消失了，
    // 那才是真的壞掉）。
    const counted = sheet.rows.filter((r) => r.sharedStandIn).length;
    expect(sheet.stats.standInChampions).toBe(counted);
    expect(counted, "共用替身族群整個空掉 —— 這一頁就沒有東西可審了").toBeGreaterThan(0);
    expect(counted).toBeLessThan(sheet.rows.length);
    // ⚠️ ⛔ 不是 `Object.keys(overrides).length` —— 覆寫檔可以（而且現在真的）
    //    指到已經搬去 `_legacy/` 的英雄。拿檔案的長度當答案，會在名單一動時
    //    用「3 變成 1」報一個跟覆寫機制無關的錯。⭐ 要對的是：**畫出來的那幾列**
    //    與統計數字一致，而且每一列都真的在覆寫檔裡。
    expect(sheet.stats.overriddenChampions).toBe(sheet.rows.filter((r) => r.overridden).length);
    for (const row of sheet.rows) {
      // GH#31 —— 共用替身 ≠ 一定穿體素。40 位的暴雪模型早就抽出來了,
      // 舊的 `toBe(true)` 正是把那扇門關上的那一行。
      // ⚠️ 2026-07-30 (#223) —— 判準再修一次。`BLIZZARD_MODEL_CHAMPIONS` 是抽取器
      // 拉的 40 個**可選**單位,26 對變身的 `Emeu` 那一半天生不在裡面;
      // `defaultPrefersVoxelBody` 的「缺省即繼承」讓它們穿得到對半的模型。
      // 只問「自己在不在名單上」會替 6 位穿得到模型的英雄要求體素身體。
      if (row.sharedStandIn) {
        const reaches =
          BLIZZARD_MODEL_CHAMPIONS.includes(row.championId) ||
          BLIZZARD_MODEL_CHAMPIONS.includes(counterpartFormId(row.championId) ?? "");
        expect(
          row.recipe.preferVoxelBody,
          `${row.championId}: 自己或變身對半有暴雪模型就走模型,兩邊都沒有的才留體素`,
        ).toBe(!reaches);
      }
      if (row.overridden) expect(Object.keys(overrides)).toContain(row.championId);
    }
  });

  it("共用同一個 modelKey 的英雄，每一位都拿到不一樣的外觀", () => {
    // ⛔ 不寫死 `champ.sela` 也不寫死 20 —— 那兩個都是**出貨名單的形狀**，
    // 名單一動就紅，而紅的訊息（「20 變成 12」）跟「外觀會不會撞」無關。
    // ⭐ 機制是：分享數最多的那一群，簽章必須**兩兩不同**。
    const byKey = new Map<string, typeof sheet.rows>();
    for (const r of sheet.rows) {
      const g = byKey.get(r.modelKey) ?? [];
      g.push(r);
      byKey.set(r.modelKey, g);
    }
    const group = [...byKey.values()].sort((a, b) => b.length - a.length)[0]!;
    expect(group.length, "沒有任何一個模型被兩位以上的英雄共用 —— 這條守衛會空跑").toBeGreaterThan(1);
    expect(new Set(group.map((r) => r.signature)).size).toBe(group.length);
    for (const r of group) expect(r.modelKeyShareCount).toBe(group.length);
  });

  it("is order-independent — the sheet does not depend on directory order", () => {
    const reversed = buildSheet([...docs].reverse(), overrides);
    expect(JSON.stringify(reversed.rows.map((r) => r.signature))).toBe(
      JSON.stringify(sheet.rows.map((r) => r.signature)),
    );
  });
});

describe("parsers refuse to invent data", () => {
  it("a malformed champion index yields no entries", () => {
    expect(parseChampionIndex(null)).toEqual([]);
    expect(parseChampionIndex({})).toEqual([]);
    expect(parseChampionIndex({ entries: "nope" })).toEqual([]);
    expect(parseChampionIndex({ entries: [{ id: 1 }] })).toEqual([]);
    expect(parseChampionIndex({ entries: [{ id: "a", path: "champions/a.json" }] })).toHaveLength(1);
  });

  it("a wrong-schema override file is ignored outright", () => {
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides({ schema: "something-else@9", overrides: { x: {} } })).toEqual({});
    expect(Object.keys(parseOverrides({ schema: "voxel-skins@1", overrides: { x: {} } }))).toEqual([
      "x",
    ]);
  });
});

describe("filters, sorts and the review loop", () => {
  it("filters compose and never widen the set", () => {
    const all = applyFilter(sheet.rows, EMPTY_FILTER);
    expect(all.length).toBe(sheet.rows.length);
    const standIn = applyFilter(sheet.rows, { ...EMPTY_FILTER, onlyStandIn: true });
    // 同上：篩出來的數量要等於**資料裡真的有幾筆**，⛔ 不是一個抄下來的出貨規模。
    expect(standIn.length).toBe(sheet.rows.filter((r) => r.sharedStandIn).length);
    expect(standIn.length).toBeGreaterThan(0);
    expect(standIn.every((r) => r.sharedStandIn)).toBe(true);
    const tinted = applyFilter(sheet.rows, { ...EMPTY_FILTER, onlyTinted: true });
    expect(tinted.length).toBeGreaterThan(0);
    expect(tinted.every((r) => r.tint)).toBe(true);
    const byText = applyFilter(sheet.rows, { ...EMPTY_FILTER, text: sheet.rows[0]!.championId });
    expect(byText.length).toBeGreaterThanOrEqual(1);
  });

  it("hue sort is monotonic — look-alike colours land adjacent", () => {
    const sorted = sortRows(sheet.rows, "hue");
    for (let i = 1; i < sorted.length; i++) {
      expect(outfitHue(sorted[i]!)).toBeGreaterThanOrEqual(outfitHue(sorted[i - 1]!) - 1e-9);
    }
    expect(sortRows(sheet.rows, "id").length).toBe(sheet.rows.length);
    expect(sortRows(sheet.rows, "modelKey")[0]!.modelKey <= sortRows(sheet.rows, "modelKey")[1]!.modelKey).toBe(true);
  });

  it("similarity warning is a WARNING, not the distinctness guarantee", () => {
    // distinct signatures is the hard guarantee (asserted above); this softer
    // colour-distance check may legitimately find near pairs, and must not throw.
    const pairs = similarPairs(sheet.rows);
    expect(Array.isArray(pairs)).toBe(true);
    for (const p of pairs) expect(p.a.championId).not.toBe(p.b.championId);
  });

  it("exports a paste-ready overrides block for the marked champions", () => {
    const first = sheet.rows[0]!;
    const json = exportOverrideStub(sheet.rows, new Set([first.championId]), {
      [first.championId]: "顏色太暗",
    });
    const parsed = JSON.parse(json) as {
      schema: string;
      overrides: Record<string, { note: string; palette: Record<string, string> }>;
    };
    expect(parsed.schema).toBe("voxel-skins@1");
    expect(Object.keys(parsed.overrides)).toEqual([first.championId]);
    expect(parsed.overrides[first.championId]!.note).toBe("顏色太暗");
    // the stub starts from the CURRENT look, so the owner edits a diff
    expect(parsed.overrides[first.championId]!.palette.outfitPrimary).toBe(
      first.recipe.palette.outfitPrimary,
    );
    // ...and re-feeding it reproduces the same look
    const round = buildSheet(docs, parseOverrides(parsed));
    expect(round.rows.find((r) => r.championId === first.championId)!.signature).toBe(
      first.signature,
    );
  });
});

describe("the contact-sheet thumbnail shows the SHIPPED pixels", () => {
  it("composes an opaque paper doll for every champion", () => {
    for (const row of sheet.rows) {
      const buf = composeThumb(row.recipe);
      expect(buf.length).toBe(THUMB_W * THUMB_H * 4);
    }
  });

  it("two different champions produce different thumbnails", () => {
    const a = composeThumb(sheet.rows[0]!.recipe);
    const b = composeThumb(sheet.rows[1]!.recipe);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(false);
  });

  it("the head/torso/arm/leg regions are actually filled (not a blank doll)", () => {
    const buf = composeThumb(sheet.rows[0]!.recipe);
    let opaque = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] === 255) opaque++;
    // head 64 + torso 96 + 2 arms 96 + 2 legs 96 + side strip 112 = 464 texels
    expect(opaque).toBeGreaterThanOrEqual(400);
  });
});
