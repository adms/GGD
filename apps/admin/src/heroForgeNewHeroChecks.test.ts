/**
 * GH#480 —— 創建新英雄的**生成代入**與**檢查警示**這兩條線真的接上了。
 *
 * ⛔ 體驗層，一條承重的線做突變就好（CLAUDE.md 第零守則③⑦）：
 * 拿掉 `pageWarnings` 裡的 `draftWarnings(...)` 那一行 → 第二條紅。
 */
import { describe, it, expect } from "vitest";
import {
  blankHeroForgeForm,
  emptyCatalog,
  heroForgeDocs,
  heroForgeResult,
  pageWarnings,
  type AbilityCard,
  type HeroForgeCatalog,
} from "./heroForgePage";

const form = () => ({
  ...blankHeroForgeForm(),
  id: "godie-t480",
  name: "測試",
  description: "測試英雄",
  modelKey: "blocky-hero",
  route: "鐵壁",
});

/** 一支說明**把冷卻寫進台詞**的技能 —— 引擎一格都不讀（第〇·六守則②）。 */
const DIALOGUE_CARD: AbilityCard = {
  id: "src.q",
  name: "台詞技",
  slot: "Q",
  description: "",
  doc: {
    id: "src.q",
    schema: "ability@1",
    name: "台詞技",
    slot: "Q",
    castType: "targeted",
    maxRank: 1,
    cooldown: [10],
    manaCost: [50],
    range: 5,
    description: "指定單一敵人，造成 100 點傷害。「這一擊冷卻 30 秒，你躲不掉」",
    effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [100] } }],
  },
};

const withCard = (card: AbilityCard): HeroForgeCatalog => ({ ...emptyCatalog(), abilities: [card] });

describe("創建新英雄：六欄", () => {
  it("沒挑技能的那一格,六欄由中位數**代入**,⛔ 不再是 0/空", () => {
    const f = form();
    const cat = emptyCatalog();
    const docs = heroForgeDocs(f, heroForgeResult(f, cat), cat);
    const q = docs.find((d) => d.id.endsWith(".q"))?.doc as Record<string, unknown>;
    const cd = (q["cooldown"] as number[])[0]!;
    expect(cd).toBeGreaterThan(0);
    expect((q["manaCost"] as number[])[0]).toBeGreaterThan(0);
    // ⚠️ 佔位技是 `self`,所以【施展距離】本來就該是 0 —— 那是「不適用」不是「沒填」。
    expect(q["range"]).toBe(0);
    // 【傷害】也是六欄之一 —— 剛出生的技能至少會做一件事。
    expect((q["effects"] as unknown[]).length).toBeGreaterThan(0);
    // ⭐【說明】是從**同一組數字**生出來的,所以它與 JSON 依構造一致。
    expect(String(q["description"] ?? "")).toContain(`冷卻 ${cd} 秒`);
  });

  it("⭐ 寫進「」的機制數字會被警示（接線:這一條紅代表整組警示沒接上）", () => {
    const f = { ...form(), picks: { ...blankHeroForgeForm().picks, Q: "src.q" } };
    const cat = withCard(DIALOGUE_CARD);
    const msgs = pageWarnings(f, heroForgeResult(f, cat), cat).map((w) => w.message);
    expect(msgs.some((m) => m.includes("冷卻 30 秒") && m.includes("台詞不是效果"))).toBe(true);
  });
});
