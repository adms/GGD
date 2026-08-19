/**
 * GH#480 —— `config.new-hero-checks@1` 的**三個住處**真的接起來了嗎。
 *
 * ⛔ 體驗層，一條承重的線做突變就好（CLAUDE.md 第零守則③⑦）：
 * 拿掉 `heroTemplate.buildHeroDocs` 裡的 `filled(...)` → 第一條紅。
 *
 * ⚠️ 這裡**不釘任何出貨數字**（第二守則）：冷卻是 32.5 還是 40 是 owner 每週在改的
 * 東西，而它已經有三個住處 + drift 測試在守。這三條問的都是**機制**：
 * 代入有沒有發生、開關到不到得了、那份 JSON 上不上得了線。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zConfigDoc } from "@ggd/shared/content";
import { DEFAULT_NEW_HERO_CHECKS } from "@ggd/shared/content/newHeroChecks";
import { blankHeroForm, buildHeroDocs, heroDocWarnings, type NewHeroContext } from "./heroTemplate";

const SHIPPED = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../content/config/new-hero-checks.json", import.meta.url)), "utf8"),
) as unknown;

/** 一份**最小**語料：門檻設 1，所以每一格都算得出中位數。 */
const ctx = (over: Partial<NewHeroContext> = {}): NewHeroContext => ({
  corpus: [
    { slot: "Q", castType: "targeted", cooldown: 20, manaCost: 50, range: 8, effects: [{ kind: "damage", amount: { perRank: [120] } }] },
  ],
  checks: { ...DEFAULT_NEW_HERO_CHECKS, minSample: 1 },
  errors: [],
  ...over,
});

const form = () => ({
  ...blankHeroForm(),
  id: "godie-t480b",
  name: "測試",
  modelKey: "blocky-hero",
  q: { name: "Q", castType: "targeted" as const, maxRank: 1, cooldown: 0, manaCost: 0, range: 0 },
});

describe("新英雄檢查警示：三個住處", () => {
  it("⭐ 六欄由語料**代入**，而且內嵌那份與獨立那份一致（鏡像規則）", () => {
    const docs = buildHeroDocs(form(), ctx());
    const q = docs.find((d) => d.id.endsWith(".q"))!.doc as Record<string, unknown>;
    expect((q["cooldown"] as number[])[0]).toBeGreaterThan(0);
    expect((q["manaCost"] as number[])[0]).toBeGreaterThan(0);
    expect(q["range"]).toBeGreaterThan(0);
    expect((q["effects"] as unknown[]).length).toBeGreaterThan(0);
    expect(String(q["description"] ?? "")).not.toBe("");
    // ⚠️ sim 讀的是**內嵌**那一份 —— 代入發生在 embeddedForm() 之後的話，
    //   獨立文件有值而內嵌那份是空的，兩份都過 schema、兩份都不會有東西紅。
    const champion = docs.find((d) => d.collection === "champions")!.doc as Record<string, unknown>;
    const embedded = (champion["abilities"] as Record<string, Record<string, unknown>>)["Q"]!;
    expect(embedded["cooldown"]).toEqual(q["cooldown"]);
    expect(embedded["description"]).toEqual(q["description"]);
    // ⛔ 語料讀不到就一格都不代入（⛔ 不拿沒有出處的保守值頂替）。
    const bare = buildHeroDocs(form(), ctx({ corpus: [] })).find((d) => d.id.endsWith(".q"))!.doc;
    expect((bare["cooldown"] as number[])[0]).toBe(0);
  });

  it("⭐ 後台關掉的規則真的不會跳 —— 這一格證明那份 JSON 不是「存了不生效」", () => {
    // 語料空 ⇒ 六欄留白 ⇒ `empty-column` 會亮（出貨設定：六條全開）。
    const docs = buildHeroDocs(form(), ctx({ corpus: [] }));
    expect(heroDocWarnings(docs).some((w) => w.rule === "empty-column")).toBe(true);
    const off = heroDocWarnings(docs, {
      ...DEFAULT_NEW_HERO_CHECKS,
      rules: { ...DEFAULT_NEW_HERO_CHECKS.rules, "empty-column": false },
    });
    expect(off.some((w) => w.rule === "empty-column")).toBe(false);
  });

  it("⛔ 出貨那份被 `zConfigDoc` 判別聯集收下 —— 漏掉這一格就是 2026-08-02 的骨架英雄", () => {
    expect(zConfigDoc.safeParse(SHIPPED).success).toBe(true);
    // 反向對照：聯集不認得的 tag 必須被拒（少了它，上面那條對「union 收下任何東西」
    // 的實作也會過 —— 失敗形態④）。
    expect(zConfigDoc.safeParse({ ...(SHIPPED as object), schema: "config.no-such@1" }).success).toBe(false);
  });
});
