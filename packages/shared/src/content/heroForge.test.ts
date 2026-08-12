/**
 * 新英雄轉生設計的兩條承重線。
 *
 * ⛔ 這一檔**不驗任何出貨數字**（60 / 5.7 / 1.6 / 12 都不在斷言裡）——
 * 它們是後台可調的起點，抄進來就是第四個住處（第零守則⑦：純數值 0 行）。
 *
 * 驗的是兩個**機制**：
 *   ① 出身 → 三圍 → 出身 的**往返自洽**。這是整個反向流程的地基：
 *      不自洽的話會生出「標著坦克、三圍算起來是鬥士」的卡，而下游每一處
 *      讀推導的地方都會不同意它，**沒有任何一處會報錯**（失敗形態②）。
 *   ② 路線推薦的標籤**真的存在**於 `skill-tag-manifest.json`。
 *      打錯一個字的後果是那條路線推薦不出任何技能，而畫面上看起來只是「沒有結果」。
 *
 * 突變紀錄（跑過）：`heroForge.ts` 的 `MIXED_MIX` 次項 0.92 → 0.5
 *   → 「十個出身往返都回到自己」那條紅（三個混血格全部掉成純血）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { ORIGINS } from "./statNormalization";
import { forgeChampion, ROUTE_TAGS, ORIGIN_ATTACK_TYPE, normalizedPreview, archetypeForOrigin } from "./heroForge";
import { DEFAULT_ORIGIN_ROUTES } from "./originRoutes";

describe("出身 → 三圍 → 出身 的往返自洽", () => {
  it("⭐ 十個出身生出來的三圍，餵回推導都回到自己", () => {
    cover("hero-forge");
    const drift: string[] = [];
    for (const origin of ORIGINS) {
      const r = forgeChampion({
        id: `probe.${origin}`,
        name: origin,
        description: "往返探針",
        origin,
        attackType: ORIGIN_ATTACK_TYPE[origin] ?? "melee",
      });
      if (r.originRoundTrip !== origin) drift.push(`${origin} → ${r.originRoundTrip}`);
    }
    expect(drift, "出身配方不自洽（生出來的三圍會被判成別的格子）").toEqual([]);
  });

  it("往返自洽的警告真的會發出來 —— 不是永遠沉默", () => {
    cover("hero-forge");
    // ⚠️ 沒有這一條，上面那條在「warnings 永遠是空陣列」的實作下也會過。
    //   ⭐ 純血的出身選了相反的攻擊型態 → 出身一定會被重新判定。
    const r = forgeChampion({
      id: "probe.mismatch",
      name: "錯配",
      description: "把坦克（近戰）填成遠程",
      origin: "坦克",
      attackType: "ranged",
    });
    expect(r.warnings.some((w) => w.field === "attackType")).toBe(true);
    expect(r.originRoundTrip).not.toBe("坦克");
    // ⛔ 而且它仍然是 warn，不是擋下來（owner：「只是個警告標記，並不會擋」）。
    expect(r.warnings.every((w) => w.level === "warn")).toBe(true);
  });

  it("⭐ 草稿不自己填 ms / mr / armor —— 那三項是正規化的工作", () => {
    cover("hero-forge");
    const r = forgeChampion({ id: "probe.z", name: "Z", description: "d", origin: "法師" });
    for (const k of ["ms", "mr", "armor"] as const) expect(r.draft.baseStats[k]).toBe(0);
    // 而畫面預覽拿得到「它們將會被填成什麼」，且與定位表一致。
    const pv = normalizedPreview(archetypeForOrigin("法師"));
    expect(pv.mr).toBeGreaterThan(pv.armor); // 法師：魔抗大、裝甲小
  });
});

describe("路線 → 技能標籤（owner 選的方案 b）", () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, "../../../../skill-tag-manifest.json"), "utf-8"),
  ) as { tags: { tag: string }[] };
  const known = new Set(manifest.tags.map((t) => t.tag));

  it("⭐ 每一個推薦標籤都真的在 manifest 裡 —— 打錯字就紅", () => {
    cover("hero-forge");
    expect(known.size, "manifest 讀空了，下面整段會變成真空").toBeGreaterThan(50);
    const bad: string[] = [];
    for (const [route, tags] of Object.entries(ROUTE_TAGS)) {
      for (const t of tags) if (!known.has(t)) bad.push(`${route} → ${t}`);
    }
    expect(bad, "推薦了不存在的標籤（那條路線會推薦不出任何技能，而畫面上只是「沒有結果」）").toEqual([]);
  });

  it("每一條出貨路線都有推薦標籤 —— 沒有一條是空的", () => {
    cover("hero-forge");
    const missing: string[] = [];
    for (const origin of ORIGINS) {
      for (const r of DEFAULT_ORIGIN_ROUTES[origin].routes) {
        if ((ROUTE_TAGS[r.name] ?? []).length === 0) missing.push(`${origin}·${r.name}`);
      }
    }
    expect(missing, "這些路線選了也推薦不出東西").toEqual([]);
  });
});
