/**
 * ⭐⭐ **取代語意真的會壓制,而且只壓制該壓的那一格**（Codex 阻塞清單 C）。
 *
 * ⚠️ Codex 逐字的取代規則有兩半,這一支兩半都釘:
 * · ⭐ 同一個 `trigger:channel` 上,專屬 script **取代**預設演出
 * · ⛔ 不同 channel **可以共存** —— 接管施法者的動作,
 *   ⛔ 不可以把受擊者的反應一起吃掉
 */
import { describe, it, expect } from "vitest";
import { ChannelTakeover, DEFAULT_TAKEOVER_MS } from "./channelTakeover";
import { PRESENTATION_CHANNELS } from "@ggd/shared/content/abilityPresentation";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

describe("演出通道接管（replacementPolicy）", () => {
  it("⭐⭐ **兩個方向都量** —— 有接管時壓制,沒接管時照播", () => {
    const t = new ChannelTakeover();
    // ⛔ 已知**沒有**的那一邊 —— 一把只驗過單邊的尺不算自證過
    expect(t.heldBy(1, "caster.action", 0), "⛔ 沒人接管卻說被接管了").toBe(false);
    t.claim(1, "caster.action", 300);
    expect(t.heldBy(1, "caster.action", 0), "⭐ 接管了卻沒壓制").toBe(true);
  });

  it("⭐ 逐實體 × 逐通道 —— ⛔ 不是全域旗標", () => {
    const t = new ChannelTakeover();
    t.claim(1, "caster.action", 300);
    // ⛔ 別的通道不受影響（Codex 逐字：不同 channel 可以共存）
    expect(t.heldBy(1, "target.reaction", 0)).toBe(false);
    // ⛔ 別的人不受影響
    expect(t.heldBy(2, "caster.action", 0)).toBe(false);
  });

  it("⭐ 接管**一定會到期** —— ⛔ 沒有到期＝那個人再也不會有反應", () => {
    const t = new ChannelTakeover();
    t.claim(1, "caster.action", 300);
    expect(t.heldBy(1, "caster.action", 299)).toBe(true);
    expect(t.heldBy(1, "caster.action", 300), "⛔ 到期那一刻還壓著").toBe(false);
    expect(DEFAULT_TAKEOVER_MS).toBeGreaterThan(0);
  });

  it("⭐ 重疊取較晚的到期（⛔ 短的不該砍掉長的）＋ 退場會清乾淨", () => {
    const t = new ChannelTakeover();
    t.claim(1, "caster.action", 500);
    t.claim(1, "caster.action", 100); // ⛔ 這一段不可以把上面那段砍短
    expect(t.heldBy(1, "caster.action", 400)).toBe(true);
    t.clear(1);
    expect(t.heldBy(1, "caster.action", 0), "⛔ 退場沒清 ⇒ id 重用時繼承別人的接管").toBe(false);
  });

  it("⭐ schema 真的寫得出來,而且**只收封閉詞彙**（⛔ 打錯字要被擋）", () => {
    const doc = (replaces: string) => ({
      schema: "vfx-script@1",
      id: "vfxscript.t",
      abilityId: "godie-e002.q",
      segments: [{ kind: "anim", on: "castEffect", pulse: "cast", replaces }],
    });
    for (const ch of PRESENTATION_CHANNELS)
      expect(zVfxScriptDoc.safeParse(doc(ch)).success, `⛔ schema 收不下 ${ch}`).toBe(true);
    expect(
      zVfxScriptDoc.safeParse(doc("caster.actoin")).success,
      "⛔ 打錯字的通道名被收下了 ⇒ 它會靜默壓制一個不存在的東西",
    ).toBe(false);
  });
});
