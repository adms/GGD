/**
 * 技能級距的四條守衛（GH#414）—— ⛔ 每一條都跑**真的**註冊表／真的梯子，
 * ⛔ 不掃原始碼字串（失敗形態⑥）。
 *
 * 突變紀錄（一批一條，挑最承重的那一條線）：
 *   · `skillTiers.ts` 的 `LADDER_FRACTIONS` 把 `1/3` 改成 `2/5`
 *     → 「梯子重現出貨的 12 個數字」紅（超大 從 8 變 9.6）
 *
 * ⛔ 這裡不釘任何出貨數值（第二守則：數字不住在測試裡）——
 *   四條全部從 `Arenas` / `Configs` / 梯子常數**推導**。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll, Arenas, Configs } from "./registries";
import { Abilities, Champions } from "../sim/content/registry";
import { aoeTiersFromDoc } from "./aoeTiers";
import { rangeTiersFromDoc, resolveRangeTier } from "./rangeTiers";
import { displacementTiersFromDoc, minBodyRadiusFromConfigs } from "./displacementTiers";
import { SKILL_TIER_NAMES, TRAVEL_SCALE, ladderWindow } from "./skillTiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

let zoneRadius = 0;
beforeAll(async () => {
  const loaded = await new ContentLoader(shippedContentSource(CONTENT)).load();
  registerAll(loaded.store);
  zoneRadius = Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius)));
  expect(zoneRadius, "夾具前提：讀不到 zone 就等於在測空集合").toBeGreaterThan(0);
});

const cfg = (tag: string) => (Configs.all() as unknown as { schema?: string }[]).find((c) => c.schema === tag);

describe("① 一條梯子產出四軸，而且錨真的是決鬥區半徑", () => {
  it("⭐ 出貨的四張級距表逐格等於梯子的視窗 —— 有人手改一格數字就會紅", () => {
    const aoe = aoeTiersFromDoc(cfg("config.aoe-tiers@1"));
    const rng = rangeTiersFromDoc(cfg("config.range-tiers@1"));
    const disp = displacementTiersFromDoc(
      cfg("config.displacement-tiers@1"),
      minBodyRadiusFromConfigs(Configs.all() as never),
    );
    // ⛔ 期望值從梯子**算**出來，⛔ 不抄 3/4.5/6/8/12。
    const upper = ladderWindow(zoneRadius, 1);
    const lower = ladderWindow(zoneRadius, 0);
    const travel = ladderWindow(zoneRadius, 1, TRAVEL_SCALE);
    expect(aoe.radius).toEqual(upper);
    expect(rng.range).toEqual(upper);
    for (const t of SKILL_TIER_NAMES) {
      expect(disp.travel[t].distance, `衝刺 ${t}`).toBeCloseTo(travel[t], 2);
      expect(disp.push[t].distance, `擊退 ${t}`).toBeCloseTo(lower[t], 2);
    }
  });

  it("⭐ 五級距名全專案只有一份 —— 四軸讀到的是同一個陣列", () => {
    expect(SKILL_TIER_NAMES).toHaveLength(5);
    const aoe = aoeTiersFromDoc(cfg("config.aoe-tiers@1"));
    const rng = rangeTiersFromDoc(cfg("config.range-tiers@1"));
    const disp = displacementTiersFromDoc(
      cfg("config.displacement-tiers@1"),
      minBodyRadiusFromConfigs(Configs.all() as never),
    );
    // 兩套詞彙合併之前，位移這一格會是 ["小","中","大","極大"] → 這條紅。
    for (const table of [aoe.radius, rng.range, disp.travel, disp.push]) {
      expect(Object.keys(table).sort()).toEqual([...SKILL_TIER_NAMES].sort());
    }
  });

  it("owner 的校準點：炸彈陣落「大」，龍破斬**高一級**落「超大」", () => {
    // ⚠️ 這一條釘的是**級距關係**（差一級），⛔ 不是那兩個半徑數字 ——
    //   數字是 owner 每週在改的東西，關係才是他講的規格。
    const aoe = aoeTiersFromDoc(cfg("config.aoe-tiers@1")).radius;
    const tierOf = (r: number) =>
      SKILL_TIER_NAMES.reduce((best, n) =>
        Math.abs(aoe[n] - r) < Math.abs(aoe[best] - r) ? n : best,
      SKILL_TIER_NAMES[0]);
    const radiusOf = (id: string) => (Abilities.get(id as never) as { radius?: number }).radius ?? 0;
    const bomb = tierOf(radiusOf("godie-hjai.w")); // 04-02 炸彈陣
    const dragon = tierOf(radiusOf("godie-h020.e")); // 04-03 龍破斬
    expect(SKILL_TIER_NAMES.indexOf(dragon)).toBe(SKILL_TIER_NAMES.indexOf(bomb) + 1);
  });
});

describe("② 同一支技能，兩份文件的數值必須一致", () => {
  it("⭐ standalone 與英雄卡內嵌的 range/radius 逐支比對（衍生，⛔ 不是名單）", () => {
    // 04-03 龍破斬曾經 `godie-h020.e` 是 8.25 而 `godie-hjai.e` 是 6.0 ——
    // 同一支技能兩個半徑，而 `content:build` 與全套測試都是綠的。
    // ⛔ 這裡比對的鍵是**技能編號**（CLAUDE.md：編號是 JASS 對照的 join key），
    //   ⛔ 不是 id —— 兩份文件本來就是不同的 id，比 id 永遠不會紅。
    const byNumber = new Map<string, { id: string; range?: number; radius?: number }[]>();
    const add = (d: { id: string; name?: string; range?: number; radius?: number }) => {
      const n = (d.name ?? "").match(/^(\d\d-\d{2,3})/)?.[1];
      if (!n) return;
      byNumber.set(n, [...(byNumber.get(n) ?? []), { id: d.id, range: d.range, radius: d.radius }]);
    };
    for (const a of Abilities.all()) add(a as never);
    for (const c of Champions.all())
      for (const ab of Object.values(c.abilities ?? {})) if (ab) add(ab as never);

    expect(byNumber.size, "夾具前提：一個編號都解析不到 = 在測空集合").toBeGreaterThan(100);

    // ⚠️ `0` 是「**沒有**這個量」，⛔ 不是「另一個值」——出貨真的有成對的技能
    //   一邊是 `castType:"self"`（range 0）另一邊是指定型（range 11），
    //   例如 92-03 狂草泥馬 / 09-03 超級賽亞人 / 79-02 斬擊。把 0 當成分歧會讓
    //   這條守衛從第一天就紅，而紅的原因與它要擋的東西無關（失敗形態④）。
    //   ⇒ 只比對**兩邊都有非零值**的情況。
    const disagree: string[] = [];
    for (const [n, docs] of [...byNumber].sort((a, b) => a[0].localeCompare(b[0]))) {
      for (const field of ["range", "radius"] as const) {
        const vals = new Set(
          docs.map((d) => d[field]).filter((v): v is number => typeof v === "number" && v > 0),
        );
        if (vals.size > 1) {
          const shown = docs.filter((d) => (d[field] ?? 0) > 0).map((d) => `${d.id}=${d[field]}`);
          disagree.push(`${n}.${field}: ${[...new Set(shown)].join(" vs ")}`);
        }
      }
    }
    expect(disagree, "同一支技能在兩份文件裡帶著不同的數字").toEqual([]);
  });
});

describe("③ content/ 裡不可以留下沒換算的 w3x 生值", () => {
  it("⭐ 註冊後沒有任何技能的 range/radius 大過決鬥區半徑的 2 倍", () => {
    // WC3 長度是 GGD 的 ~54.5 倍，所以一個忘了換算的值（300、450、900…）
    // 一定遠遠超過這條線。⚠️ 上界從 `Arenas` **推導**，⛔ 不抄 24。
    // ⚠️ 用 2× 而不是 1×：出貨真的有兩支「全場」技能（GH#310 記錄過，
    //   29.33 / 24），它們是刻意的，⛔ 這條守衛不是拿來重新判它們的。
    const limit = zoneRadius * 2;
    const bad: string[] = [];
    for (const a of Abilities.all()) {
      const d = a as { id: string; range?: number; radius?: number };
      for (const f of ["range", "radius"] as const) {
        const v = d[f];
        // ⚠️ `Infinity` **不是**一個沒換算的 w3x 生值 —— 它只可能來自技能文件上
        //    那一格明示的 `rangeUnlimited: true`（GH#602 殭屍王 [leap吸血]，
        //    owner 2026-08-23「無上限施法距離」），而那是一個**被宣告過的例外**，
        //    ⛔ 不是一個忘了乘 11/600 的數字。這條守衛抓的是後者。
        if (typeof v === "number" && Number.isFinite(v) && v > limit) {
          bad.push(`${d.id}.${f} = ${v} > ${limit}`);
        }
      }
    }
    expect(bad, "這幾個數字大到只可能是沒換算的 w3x 生值").toEqual([]);
  });
});

describe("④ 級距解析真的接到註冊表上（⛔ 不是掃字串）", () => {
  it("⭐ 出貨技能上的 radiusTier 在**註冊之後**已經變成表上的半徑", () => {
    // ⚠️ 這一條讀的是 `Abilities.all()`（跑完 `registerAll` 的那一份），
    //   ⛔ 不是磁碟上的 JSON、⛔ 不是直接呼叫 resolveRadiusTier ——
    //   那兩種寫法對「級距表沒接上註冊管線」都會是綠的（失敗形態⑤）。
    const aoe = aoeTiersFromDoc(cfg("config.aoe-tiers@1")).radius;
    const tiered = Abilities.all().filter(
      (a) => typeof (a as { radiusTier?: string }).radiusTier === "string",
    ) as unknown as { id: string; radiusTier: string; radius?: number }[];
    // ⚠️ 下限刻意低：`radiusTier` 在**技能頂層**只有十幾支，其餘一百多處住在
    //   `effects[]` 裡（`resolveRadiusTier` 走整棵樹）。這一條只顧頂層那一段，
    //   所以⛔ 不要把門檻抄成「內容裡出現幾次」—— 那個數字量的是另一件事。
    expect(tiered.length, "夾具前提：一支填級別的技能都沒有 = 在測空集合").toBeGreaterThan(10);
    const wrong = tiered
      .filter((a) => a.radius !== aoe[a.radiusTier as keyof typeof aoe])
      .map((a) => `${a.id}: ${a.radiusTier} → ${a.radius}，表上是 ${aoe[a.radiusTier as keyof typeof aoe]}`);
    expect(wrong, "級距沒有被翻成半徑 = 那張表對這幾支等於不存在").toEqual([]);
  });

  it("⭐ `rangeTier` 走的是同一個接縫 —— 解析器對每一級都給出表上的值", () => {
    // 出貨內容今天 0 支填 `rangeTier`（新機制），所以上面那條驗不到它。
    // ⚠️ 這裡驗解析器本身，而它被 `registries.ts` 的 `withTiers` 組進同一條鏈
    //   （拿掉那一行，上一條仍綠、這一條仍綠 —— 所以接線由 registriesTierSeam 那條顧）。
    const rng = rangeTiersFromDoc(cfg("config.range-tiers@1"));
    for (const t of SKILL_TIER_NAMES) {
      const out = resolveRangeTier({ id: "probe", rangeTier: t }, rng) as { range?: number };
      expect(out.range, `rangeTier=${t}`).toBe(rng.range[t]);
    }
  });

  it("⭐ 接線：`withTiers` 真的把 rangeTier 一起走了（⛔ 這條才擋得住漏接）", async () => {
    // 真的重跑一次 `registerAll`，但先把 `rangeTier` 種到一份技能文件上 ——
    // 那是唯一能證明「registries 有呼叫 resolveRangeTier」的做法。
    const loaded = await new ContentLoader(shippedContentSource(CONTENT)).load();
    const abilities = loaded.store.all<{ id: string; range?: number }>("abilities");
    const victim = abilities.find((a) => typeof a.range === "number" && a.range > 0);
    expect(victim, "夾具前提：找不到帶 range 的技能").toBeDefined();
    (victim as unknown as { rangeTier: string }).rangeTier = "小";
    registerAll(loaded.store);
    const rng = rangeTiersFromDoc(cfg("config.range-tiers@1"));
    expect(
      (Abilities.get(victim!.id as never) as { range?: number }).range,
      "registries.ts 的 withTiers 沒有把 resolveRangeTier 串進去",
    ).toBe(rng.range["小"]);
    // ⛔⛔ GH#979 —— **時鐘，⛔ 不是斷言**：這是本檔唯一一條 `await …load()` 的，
    //   而它正是 CI 上唯一超時的那一條（2026-09-04，vitest 5,000 ms 預設）。
    //   本機整支 0.85 秒。⛔ 不改任何斷言，只把機器速度這個變數拿掉。
  }, 60_000);
});
