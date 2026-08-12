/**
 * ability@1 · 多層特效模板的 schema 守衛 (#205).
 *
 * ⚠️ 這個檔案刻意**不**寫「schema 收得下這個形狀」這種斷言 —— 那是屬性,不是
 * 行為,而且對正確與壞掉的實作都會過。這裡守的是三件會讓玩家受害的事:
 *
 *   1. **出貨的每一份 doc**(`content/abilities/` 裡當下有幾份就是幾份,⛔ 不抄
 *      一個會過期的支數)必須繼續 parse 得過,而且 parse 出來的東西還是
 *      「一層、零覆寫」。
 *   2. 每一層的界限**真的是**鑄技工坊那張表的界限(靠 `.pick()` 共用同一個
 *      Zod 物件,所以這裡驗的是「共用真的成立」,不是抄了一遍)。
 *   3. `.strict()` 真的擋得住打錯的欄位名 —— 六條綁定 lane 會照檔頭的 JSON 寫,
 *      一個 typo 靜靜不生效比紅燈糟得多。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zAbilityDoc } from "./ability";
import { zVfxAbilityFamilyBinding } from "./vfx";
import {
  ABILITY_VFX_LAYER_HARD_CAP,
  ABILITY_VFX_LAYER_OVERRIDE_FIELDS,
  DEFAULT_MAX_ABILITY_VFX_LAYERS,
  clampMaxAbilityVfxLayers,
  isLegacySingleVfx,
  resolveAbilityVfxLayers,
  zAbilityVfxLayer,
} from "./abilityVfx";

const CONTENT = fileURLToPath(new URL("../../../../../content/abilities/", import.meta.url));
const CHAMPIONS = fileURLToPath(new URL("../../../../../content/champions/", import.meta.url));

/**
 * 現在**營運母體**裡有幾位英雄 —— 下面兩條空集合守衛的下界。
 *
 * ⚠️ 這兩條原本釘的是 `> 600`,那是 2026-08-13 營運母體縮編(119 → 78 位英雄,
 * 41 位連同 236 支技能搬進讀不到的 `content/_legacy/`)之前的出貨支數,
 * 也就是 CLAUDE.md 說的「抄一份出貨值當第四個住處」。
 *
 * 換成這個下界的理由是**結構性**的:每一位出貨英雄至少帶一支技能文件,
 * 所以「技能份數 ≥ 英雄人數」在任何一次上下架之後都仍然成立,而它要是不成立,
 * 就真的是掃描器讀錯目錄 / 內容樹壞了 —— 那正是這兩條要擋的東西
 * (空集合什麼都證明不了)。
 */
const SHIPPING_CHAMPIONS = readdirSync(CHAMPIONS).filter(
  (n) => n.endsWith(".json") && !n.startsWith("_"),
).length;

/**
 * 出貨的技能文件。
 *
 * ⚠️ **不是 JSON 的檔案會被跳過並且回報**,不是靜靜吞掉:工作區裡可能有正在
 * 合併、帶著 `<<<<<<<` 衝突標記的檔案,那不是這條測試該報的錯。但「跳過」必須
 * 是有界的 —— 下面 `skipped` 有上限斷言,所以不可能因為半個 content 樹壞掉而
 * 讓這條掃描變成掃 0 份還全綠(空集合什麼都證明不了)。
 */
function shippedAbilityDocs(): {
  docs: { id: string; doc: Record<string, unknown> }[];
  skipped: string[];
} {
  const docs: { id: string; doc: Record<string, unknown> }[] = [];
  const skipped: string[] = [];
  for (const f of readdirSync(CONTENT).filter((n) => n.endsWith(".json") && !n.startsWith("_"))) {
    const text = readFileSync(CONTENT + f, "utf8");
    if (text.includes("\n<<<<<<< ")) {
      skipped.push(f);
      continue;
    }
    try {
      docs.push({ id: f.replace(/\.json$/, ""), doc: JSON.parse(text) as Record<string, unknown> });
    } catch {
      skipped.push(f);
    }
  }
  return { docs, skipped };
}

describe("向後相容:出貨的技能文件一份都不用改", () => {
  const { docs, skipped } = shippedAbilityDocs();

  it("出貨的每一份 ability doc 仍然 parse 得過（新欄位是純附加）", () => {
    const bad: string[] = [];
    for (const { id, doc } of docs) {
      if (!zAbilityDoc.safeParse(doc).success) bad.push(id);
    }
    expect(bad, `這些出貨文件在加了 vfxLayers 之後 parse 不過：${bad.slice(0, 10).join(", ")}`).toEqual(
      [],
    );
    // 這條測試如果掃到 0 份文件就毫無意義（空集合什麼都證明不了）
    expect(
      docs.length,
      `掃到的技能文件比出貨英雄還少（${docs.length} < ${SHIPPING_CHAMPIONS}）—— 讀錯目錄或內容樹壞了`,
    ).toBeGreaterThanOrEqual(SHIPPING_CHAMPIONS);
    // 跳過的必須是零星的合併殘留，不是「半個 content 樹讀不到所以全綠」
    expect(skipped.length, `跳過太多檔案：${skipped.join(", ")}`).toBeLessThan(5);
  });

  it("出貨的文件全部都是 legacy 單值形態 —— 它們解析出恰好一層、零覆寫", () => {
    const withKey = docs.filter(
      (d) => typeof d.doc["vfxKey"] === "string" && d.doc["vfxLayers"] === undefined,
    );
    expect(
      withKey.length,
      "帶 vfxKey 的出貨文件比出貨英雄還少 —— 這條會變成在掃一個空集合",
    ).toBeGreaterThanOrEqual(SHIPPING_CHAMPIONS);
    for (const { id, doc } of withKey) {
      expect(isLegacySingleVfx(doc as never), id).toBe(true);
      const layers = resolveAbilityVfxLayers(doc as never);
      expect(layers, id).toEqual([
        { vfxKey: doc["vfxKey"], attachTo: "caster", delayMs: 0, overrides: undefined },
      ]);
    }
  });

  it("`vfxLayers` 一出現就不再是 legacy —— 讀取端會走新分支", () => {
    expect(isLegacySingleVfx({ vfxKey: "a", vfxLayers: [{ vfxKey: "a" }] })).toBe(false);
  });
});

describe("每一層的界限就是鑄技工坊那張表的界限（同一個 Zod，不是抄的）", () => {
  it("覆寫欄位是 zVfxAbilityFamilyBinding 的子集，名字一個都沒改", () => {
    const forge = Object.keys(zVfxAbilityFamilyBinding.shape);
    for (const f of ABILITY_VFX_LAYER_OVERRIDE_FIELDS) {
      expect(forge, `層的覆寫欄位 ${f} 在鑄技工坊那張表上不存在`).toContain(f);
    }
  });

  it("anchor 刻意不在層上（pooled cast path 沒有 bone parenting，開了會被吃掉）", () => {
    expect(ABILITY_VFX_LAYER_OVERRIDE_FIELDS).not.toContain("anchor");
    // 而且 schema 要真的擋下來，不是只有註解說不支援
    expect(
      zAbilityVfxLayer.safeParse({ vfxKey: "fx.a", anchor: "chest" }).success,
      "層接受了 anchor —— 那個值不會有任何畫面效果",
    ).toBe(false);
  });

  /**
   * 每一格驗四個點(min / min−ε / max / max+ε),和 `vfxForge.test.ts` 對後台
   * 那張表的做法一樣。界限如果被誰改寬了,這裡會紅。
   */
  const NUMERIC: Record<string, { min: number; max: number }> = {
    w3xScale: { min: 0.05, max: 20 },
    flyHeight: { min: -2000, max: 2000 },
    alpha: { min: 0.05, max: 1 },
    timeScale: { min: 0.2, max: 4 },
  };
  for (const [field, b] of Object.entries(NUMERIC)) {
    it(`${field} 的上下界是 [${b.min}, ${b.max}]，兩邊都擋`, () => {
      const ok = (v: number): boolean =>
        zAbilityVfxLayer.safeParse({ vfxKey: "fx.a", [field]: v }).success;
      expect(ok(b.min)).toBe(true);
      expect(ok(b.max)).toBe(true);
      expect(ok(b.min - 1e-6), `${field} 收下了低於下界的值`).toBe(false);
      expect(ok(b.max + 1e-6), `${field} 收下了高於上界的值 —— 這就是 #277 的形狀`).toBe(false);
    });
  }

  it("tint 是三個 0–255 整數，越界擋得住", () => {
    const ok = (t: unknown): boolean =>
      zAbilityVfxLayer.safeParse({ vfxKey: "fx.a", tint: t }).success;
    expect(ok([0, 128, 255])).toBe(true);
    expect(ok([0, 0, 256])).toBe(false);
    expect(ok([-1, 0, 0])).toBe(false);
    expect(ok([1.5, 0, 0])).toBe(false);
    expect(ok([1, 2])).toBe(false);
  });

  it("delayMs 有上界（8 s），不是只有下界", () => {
    const ok = (v: number): boolean =>
      zAbilityVfxLayer.safeParse({ vfxKey: "fx.a", delayMs: v }).success;
    expect(ok(0)).toBe(true);
    expect(ok(8000)).toBe(true);
    expect(ok(-1)).toBe(false);
    expect(ok(8001)).toBe(false);
  });
});

describe("strict：打錯的欄位名會紅，不會靜靜不生效", () => {
  it("拼錯 vfxKey 的層被拒", () => {
    expect(zAbilityVfxLayer.safeParse({ vfxkey: "fx.a" }).success).toBe(false);
  });
  it("拼錯覆寫欄位名的層被拒（scale ≠ w3xScale）", () => {
    expect(zAbilityVfxLayer.safeParse({ vfxKey: "fx.a", scale: 2 }).success).toBe(false);
  });
  it("attachTo 只收執行期真的會照做的兩個值", () => {
    const ok = (v: string): boolean =>
      zAbilityVfxLayer.safeParse({ vfxKey: "fx.a", attachTo: v }).success;
    expect(ok("caster")).toBe(true);
    expect(ok("point")).toBe(true);
    // 「命中時」在 sim 那側還沒有事件可綁 —— 開了就是寫了不會發生的設定
    expect(ok("hit")).toBe(false);
    expect(ok("target")).toBe(false);
  });
  it("整份 ability doc 上，超過硬上限的層數被拒", () => {
    const base = JSON.parse(
      readFileSync(CONTENT + "godie-n003.q.json", "utf8"),
    ) as Record<string, unknown>;
    const mk = (n: number): unknown => ({
      ...base,
      vfxLayers: Array.from({ length: n }, () => ({ vfxKey: "fx.prim.ice.shockwave" })),
    });
    expect(zAbilityDoc.safeParse(mk(ABILITY_VFX_LAYER_HARD_CAP)).success).toBe(true);
    expect(zAbilityDoc.safeParse(mk(ABILITY_VFX_LAYER_HARD_CAP + 1)).success).toBe(false);
    // 空陣列也被拒：「有這個欄位但零層」是一種說不通的狀態
    expect(zAbilityDoc.safeParse({ ...base, vfxLayers: [] }).success).toBe(false);
  });
});

/**
 * ⛔ 檔頭那段可貼上的 JSON **必須是真的能用的**。
 *
 * B1–B6 六條綁定 lane 會照抄它;抄到一個不存在的 vfx id,六份內容一起壞,而且
 * 壞法是「施法時什麼都沒有」——最難發現的那一種。第一版我就寫錯了兩個
 * (`fx.w3x.frostnova.a` / `fx.prim.ice.nova-lg`,兩個都不存在),所以這條測試
 * 不是防未來,是釘一個真的發生過的錯。
 *
 * 它剖的是**註解本身**,不是另一份手抄的副本 —— 抄一份就等於讓範例和守衛各走
 * 各的(第三守則:註解會說謊,去驗證)。
 */
describe("檔頭那段可貼上的範例是真的能用的", () => {
  const SRC = readFileSync(fileURLToPath(new URL("./abilityVfx.ts", import.meta.url)), "utf8");
  const VFX_DIR = fileURLToPath(new URL("../../../../../content/vfx/", import.meta.url));

  /** 從 `* ```json … * ``` ` 區塊把 JSON 剖出來（去掉每行的 ` * ` 前綴）。 */
  function exampleJson(): Record<string, unknown> {
    const m = /```json\n([\s\S]*?)\n \* ```/.exec(SRC);
    expect(m, "檔頭的 ```json 範例區塊不見了").not.toBeNull();
    const body = m![1]!
      .split("\n")
      .map((l) => l.replace(/^ \* ?/, ""))
      .join("\n");
    return JSON.parse(body) as Record<string, unknown>;
  }

  it("範例過得了真的 zAbilityDoc（不是只是長得像 JSON）", () => {
    const ex = exampleJson();
    // 範例是示範用的骨架，補上 schema 必填的行為欄位再解 —— 補的是 schema
    // 本來就要求的東西，不是為了讓它過而放寬任何規則。
    const base = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../../../content/abilities/godie-n003.r.json", import.meta.url)), "utf8"),
    ) as Record<string, unknown>;
    const parsed = zAbilityDoc.safeParse({ ...base, ...ex });
    expect(
      parsed.success,
      `檔頭範例過不了 zAbilityDoc：${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`,
    ).toBe(true);
  });

  it("範例裡每一個 vfxKey 在 content/vfx/ 真的有檔案", () => {
    const ex = exampleJson();
    const keys = [
      ex["vfxKey"] as string,
      ...((ex["vfxLayers"] as { vfxKey: string }[]).map((l) => l.vfxKey)),
    ];
    expect(keys.length).toBeGreaterThan(3); // 主 key + 至少三層，否則範例沒在示範疊層
    const missing = keys.filter((k) => !existsSync(VFX_DIR + k + ".json"));
    expect(missing, `檔頭範例指到不存在的 vfx 文件：${missing.join(", ")}`).toEqual([]);
  });

  it("範例真的示範了「多層 + 每層各自覆寫 + 延遲」，不是三層一模一樣", () => {
    const layers = exampleJson()["vfxLayers"] as Record<string, unknown>[];
    expect(layers.length).toBeGreaterThanOrEqual(3);
    expect(layers.some((l) => typeof l["delayMs"] === "number" && (l["delayMs"] as number) > 0)).toBe(true);
    expect(layers.some((l) => l["w3xScale"] !== undefined || l["timeScale"] !== undefined)).toBe(true);
    expect(layers.some((l) => l["attachTo"] === "point")).toBe(true);
    // 而且每一層都真的過得了層的 schema
    for (const l of layers) expect(zAbilityVfxLayer.safeParse(l).success, JSON.stringify(l)).toBe(true);
  });
});

describe("後台上限的夾法", () => {
  it("undefined / NaN → 出貨預設，不是 0 層", () => {
    expect(clampMaxAbilityVfxLayers(undefined)).toBe(DEFAULT_MAX_ABILITY_VFX_LAYERS);
    expect(clampMaxAbilityVfxLayers(Number.NaN)).toBe(DEFAULT_MAX_ABILITY_VFX_LAYERS);
  });
  it("兩邊都夾", () => {
    expect(clampMaxAbilityVfxLayers(0)).toBe(1);
    expect(clampMaxAbilityVfxLayers(-5)).toBe(1);
    expect(clampMaxAbilityVfxLayers(99)).toBe(ABILITY_VFX_LAYER_HARD_CAP);
  });
});
