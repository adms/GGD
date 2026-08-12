/**
 * 新英雄轉生設計 —— 四條承重線（owner 2026-08-13）。⛔ 不驗任何出貨數字。
 * ①⭐推薦讀說明找機制，所以先剝「…」台詞（第〇·六守則②點名「編輯器的自動建議」）——
 * 壞掉是靜默的。②草稿被**真的** `zChampionDoc` 收下，跨槽位挑的技能被複製+換 id
 * （共用 id = 兩位英雄從此同一支技能，鏡射規則會挑錯人）。③警告只警告不擋。
 * ④頁面真的在用這份邏輯（掛載出貨元件、打字、讀草稿）。
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { zChampionDoc } from "@ggd/shared/content/schema/champion";
import { NAV } from "./ui/App";
import { pageRequiresSession } from "./store";
import { mount } from "./testkit/headlessUi";
import * as F from "./heroForgePage";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const TAG = "adminui-hero-forge";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const card = (id: string, description: string): F.AbilityCard =>
  ({ id, name: id, slot: "Q", description, doc: {} });

describe("新英雄轉生設計", () => {
  it("⭐ 台詞裡的機制字眼不算數 —— 剝掉「…」之後才拿去比對標籤", () => {
    cover(TAG);
    const cards = [card("talk", "造成傷害。「站著不要動，我要對你定身了」"), card("real", "造成傷害並定身 2 秒。")];
    const ranked = F.rankAbilities(cards, ["定身"], "Q");
    const hitsOf = (id: string): readonly string[] => ranked.find((r) => r.card.id === id)!.hits;
    expect(hitsOf("real"), "真的有定身的技能沒被命中").toEqual(["定身"]);
    expect(hitsOf("talk"), "台詞被當成機制了 —— 這支技能沒有定身").toEqual([]);
  });

  it("⭐ 草稿被真的 champion@1 schema 收下；跨槽位挑的技能被複製並改寫", () => {
    cover(TAG);
    const donor = JSON.parse(readFileSync(`${REPO}content/abilities/godie-e001.e.json`, "utf8")) as Record<string, unknown>;
    const id = donor["id"] as string;
    const catalog: F.HeroForgeCatalog = {
      ...F.emptyCatalog(),
      abilities: [{ id, name: "捐贈者", slot: "E", description: "", doc: donor }],
    };
    const blank = F.blankHeroForgeForm();
    const form = { ...blank, id: "probe-hero", name: "探針", modelKey: "champ.sela", picks: { ...blank.picks, Q: id } };
    const champ = F.heroForgeDocs(form, F.heroForgeResult(form, catalog), catalog).at(-1)!.doc;
    const q = (champ["abilities"] as Record<string, Record<string, unknown>>)["Q"]!;
    expect(q["id"], "內嵌的是捐贈者的 id —— 兩位英雄會共用同一支技能").toBe("probe-hero.q");
    const parsed = zChampionDoc.safeParse(champ);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("警告只警告不擋：全是 warn，而且什麼都沒填也生得出草稿", () => {
    cover(TAG);
    const form = F.blankHeroForgeForm();
    const cat = F.emptyCatalog();
    const warnings = F.pageWarnings(form, F.heroForgeResult(form, cat), cat);
    expect(warnings.length).toBeGreaterThan(3);
    expect(warnings.every((w) => w.level === "warn")).toBe(true);
    expect(F.heroForgeDocs(form, F.heroForgeResult(form, cat), cat).length).toBeGreaterThan(0);
  });

  it("頁面真的接上了：在 NAV/session 表裡，而且打字會走進這份邏輯", async () => {
    cover(TAG);
    expect(NAV.some((n) => n.page === "heroForge")).toBe(true);
    expect(pageRequiresSession("heroForge"), "它寫 putOverlayDoc，沒 session 會 401").toBe(true);
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no content server")));
    const { HeroForgePage } = await import("./ui/HeroForgePage");
    const h = mount(createElement(HeroForgePage));
    await h.flush();
    h.type("hero.name", "轉生測試");
    expect(String(h.field("hero.draftJson").props["value"])).toContain("轉生測試");
  });
});
