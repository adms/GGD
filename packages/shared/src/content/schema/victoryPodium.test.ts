/**
 * `config.victory-podium@1` 的出貨值守衛 —— 第三守則(註解會說謊,去驗證)。
 *
 * ⚠️ 這一支的存在理由是一個真的缺陷:`SHIPPED_VICTORY_PODIUM_JSON.note` 曾經寫著
 * 「roundWinLine 預設 taunt」,而**下一行 spread 進來的實值是 `both`**。那串字不是
 * 註解 —— 它會原封不動落進 `content/config/victory-podium.json`,再從那裡被後台
 * 當成欄位說明印給操作者看。操作者於是會照著一句假話去推論這一場會聽到什麼。
 *
 * 所以這裡驗的是**出貨文字與出貨值一致**,不是「有一個 note 欄位」。
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_VICTORY_PODIUM,
  SHIPPED_VICTORY_PODIUM_JSON,
  VICTORY_PODIUM_FIELDS,
  VICTORY_ROUND_WIN_LINES,
  zConfigVictoryPodiumDoc,
} from "./victoryPodium";

describe("victory-podium 的出貨值與它自己的說明文字", () => {
  it("note 裡宣告的 roundWinLine 預設,就是真的預設", () => {
    const note = SHIPPED_VICTORY_PODIUM_JSON.note ?? "";
    const claimed = /roundWinLine 預設 ([a-z]+)/.exec(note)?.[1];
    expect(claimed, `note 沒有宣告預設值:${note}`).toBeDefined();
    expect(VICTORY_ROUND_WIN_LINES).toContain(claimed as never);
    expect(claimed).toBe(DEFAULT_VICTORY_PODIUM.roundWinLine);
  });

  it("出貨的 JSON 就是出貨的預設(沒有第二份數值)", () => {
    const { id, schema, note, ...values } = SHIPPED_VICTORY_PODIUM_JSON;
    expect(id).toBe("victory-podium");
    expect(schema).toBe("config.victory-podium@1");
    expect(note && note.length).toBeGreaterThan(0);
    expect(values).toEqual(DEFAULT_VICTORY_PODIUM);
  });

  it("出貨的那一份過得了自己的嚴格 Zod(上下界一起驗)", () => {
    expect(() => zConfigVictoryPodiumDoc.parse(SHIPPED_VICTORY_PODIUM_JSON)).not.toThrow();
    // 上界不是裝飾:3 打成 30 要在這裡就被擋下來,不是在畫面上開 30 個 WebGL context。
    expect(() =>
      zConfigVictoryPodiumDoc.parse({ ...SHIPPED_VICTORY_PODIUM_JSON, podiumSize: 30 }),
    ).toThrow();
  });

  it("每一格都有後台欄位定義,而且說明講的是「它影響什麼」不是複述欄位名", () => {
    const keys = VICTORY_PODIUM_FIELDS.map((f) => f.key).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_VICTORY_PODIUM).sort());
    for (const f of VICTORY_PODIUM_FIELDS) {
      expect(f.help.length, f.key).toBeGreaterThan(20);
      expect(f.help, f.key).not.toBe(f.label);
    }
  });
});
