/**
 * 💾 GH#1023 承重守衛 —— ⭐ 斷言跨越一次「重載」，⛔ 不是「有沒有呼叫 put()」
 * （票文 [思考策略]：失敗形態⑧，寫了但重載讀不回來時「有 autosave」照樣成立）。
 * ⭐ 量尺兩個方向都跑（第一守則：只驗過單邊的尺不算自證過）。
 * MUTATION LOG（2026-09-06）：拿掉 `autosave.ts` 的 `await store.put(key, record);`
 * → 第 1 條紅（`['none','none']`）＋第 3 條紅；Edit 改回 → 綠。
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getIn, setIn } from "../store";
import { AutosaveBanner } from "./AutosaveBanner";
import { createAutosave, DEFAULT_EDITOR_AUTOSAVE, installUnloadGuard } from "./autosave";
import { createMemoryDraftStore } from "./draftStore";
import { layerCounts } from "./model";

const CHAMPION = { id: "godie-h001", schema: "champion@1", archetype: "bruiser" };
const ABILITY = {
  id: "godie-h001.q", schema: "ability@1", cooldownTier: "中",
  effects: [{ kind: "damage", damageTier: "大", pitch: 1 }],
};
const CHAMPION_TWEAK = setIn(CHAMPION, "archetype", "mage");

describe("編輯器草稿 autosave (GH#1023)", () => {
  it("四層各改一格 → 關掉分頁 → 重開 ⇒ 四格都回來，而且畫面說它是草稿", async () => {
    const disk = new Map<string, unknown>();
    const before = createAutosave(createMemoryDraftStore(disk), DEFAULT_EDITOR_AUTOSAVE, () => 17e11);
    let ability = setIn(ABILITY, "cooldownTier", "長");        // 技能
    ability = setIn(ability, "effects.0.damageTier", "極大");   // 機制
    ability = setIn(ability, "effects.0.pitch", 1.4);          // 特效
    await before.save("champions", CHAMPION.id, CHAMPION, CHAMPION_TWEAK); // 英雄
    await before.save("abilities", ABILITY.id, ABILITY, ability);

    // ⭐ 關掉分頁：引擎與它的記憶體整個丟掉，只留下「磁碟」那一張表。
    const after = createAutosave(createMemoryDraftStore(disk));
    const champOut = await after.restore("champions", CHAMPION.id, CHAMPION);
    // ⭐ 驗收⑤：模板改過了（多一格 manaCostTier），而那一格**沒有**被覆寫。
    const abilityOut = await after.restore("abilities", ABILITY.id, { ...ABILITY, manaCostTier: "高" });
    expect([champOut.kind, abilityOut.kind]).toEqual(["restored", "restored"]);
    if (champOut.kind !== "restored" || abilityOut.kind !== "restored") return;

    expect(getIn(champOut.doc, "archetype")).toBe("mage");
    expect(getIn(abilityOut.doc, "cooldownTier")).toBe("長");
    expect(getIn(abilityOut.doc, "effects.0.damageTier")).toBe("極大");
    expect(getIn(abilityOut.doc, "effects.0.pitch")).toBe(1.4);
    expect(getIn(abilityOut.doc, "manaCostTier"), "存微調值就該跟著模板走").toBe("高");
    expect(layerCounts([champOut.record, abilityOut.record]))
      .toEqual({ champion: 1, ability: 1, mechanic: 1, vfx: 1 });

    const html = renderToStaticMarkup(
      <AutosaveBanner restored={abilityOut.record} blocked={null} savedAt={null}
        settings={DEFAULT_EDITOR_AUTOSAVE} onSettings={() => {}} onDiscard={() => {}} />,
    );
    expect(html).toContain("這是草稿");
    expect(html).toContain("還沒有投稿");
  });

  it("量尺的另一個方向：editor.autosave 關掉 ⇒ 既不存也不接回", async () => {
    const disk = new Map<string, unknown>();
    const off = createAutosave(createMemoryDraftStore(disk), { enabled: false, intervalMs: 1500 });
    expect((await off.save("champions", CHAMPION.id, CHAMPION, CHAMPION_TWEAK)).kind).toBe("off");
    expect(disk.size).toBe(0);
    expect((await off.restore("champions", CHAMPION.id, CHAMPION)).kind).toBe("off");
  });

  it("還沒投稿就關頁 ⇒ 攔一次；存不起來 ⇒ 說得出話（⛔ 不是靜默）", async () => {
    const on = new Map<string, (e: { preventDefault(): void; returnValue?: unknown }) => void>();
    let dirty = false;
    installUnloadGuard({ addEventListener: (t, l) => void on.set(t, l), removeEventListener: () => {} }, () => dirty);
    const fire = () => {
      const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
      on.get("beforeunload")?.(event);
      return event;
    };
    expect(fire().preventDefault).not.toHaveBeenCalled();
    dirty = true;
    expect(fire().preventDefault).toHaveBeenCalled();

    const dead = { ...createMemoryDraftStore(), put: () => Promise.reject(new Error("無痕視窗")) };
    const outcome = await createAutosave(dead).save("champions", CHAMPION.id, CHAMPION, CHAMPION_TWEAK);
    expect(outcome.kind === "blocked" && outcome.message).toContain("無痕視窗");
  });
});
