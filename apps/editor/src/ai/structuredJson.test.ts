/**
 * GH#1108 承重守衛：跨模型 JSON 包裝正規化。承重點＝「**完成狀態沒確認就不得
 * 流入下一階段**」。突變：拿掉 normalizeAiJson 開頭那道 completion 閘 ⇒ 第二個
 * it 變紅（截斷但剛好合法的 JSON 被放行）。
 */
import { describe, it, expect, vi } from "vitest";
import { aiFillJson } from "./client";
import {
  AI_JSON_UNWRAP_RULES_VERSION,
  aiCompletionFromFinishReason,
  normalizeAiJson,
  type AiJsonOutcome,
} from "./structuredJson";

/** 字串裡刻意放反引號、圍欄、花括號、跳脫引號 —— 都不可以被改。 */
const DOC = '{"id":"a","note":"tick ` fence ``` {brace} \\"quote\\""}';
const done = (final: string, reasoning?: string): AiJsonOutcome =>
  normalizeAiJson({ completion: "complete", final, reasoning });
const ok = (r: AiJsonOutcome) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.detail}`);
  return r;
};
const why = (r: AiJsonOutcome) => (r.ok ? "PASSED" : r.reason);

describe("AI JSON 輸出包裝正規化 (GH#1108)", () => {
  it("bare 與單一外層區塊得到同一個候選，字串內符號原封不動，且冪等", () => {
    const bare = ok(done(DOC));
    const fenced = ok(done(`\r\n  \`\`\`json\r\n${DOC}\r\n\`\`\`  \r\n`));
    const untagged = ok(done(`\`\`\`\n${DOC}\n\`\`\``));
    expect([fenced.value, untagged.value]).toEqual([bare.value, bare.value]);
    // 原文切片，⛔ 不是重新序列化 ⇒ 反引號／跳脫字元逐位元保留
    expect(fenced.json).toBe(DOC);
    expect((bare.value as { note: string }).note).toBe('tick ` fence ``` {brace} "quote"');
    // 診斷分得出「原生有效」與「去包裝後有效」
    expect([bare.normalizationApplied, fenced.normalizationApplied]).toEqual([false, true]);
    expect(bare.rulesVersion).toBe(AI_JSON_UNWRAP_RULES_VERSION);
    // 冪等：把剝好的再餵一次，結果一樣
    expect(ok(done(fenced.json)).json).toBe(fenced.json);
  });

  it("⭐ 承重：完成狀態沒確認就不放行，即使文字已是合法 JSON", () => {
    for (const completion of ["truncated", "cancelled", "timeout", "streaming", "unknown"] as const) {
      expect(why(normalizeAiJson({ completion, final: DOC }))).toBe("NOT_COMPLETE");
    }
    // 空 final ⛔ 不以 reasoning 填補
    expect(why(done("   ", DOC))).toBe("EMPTY_FINAL");
    // finish 字彙：認不得的一律 unknown，⛔ 不猜
    expect(aiCompletionFromFinishReason("stop")).toBe("complete");
    expect(aiCompletionFromFinishReason("length")).toBe("truncated");
    expect([aiCompletionFromFinishReason(undefined), aiCompletionFromFinishReason("all_done")])
      .toEqual(["unknown", "unknown"]);
  });

  it("只去包裝⛔不修內容：多區塊／未閉合／前後解說／壞 JSON 全部擋下", () => {
    expect(why(done(`\`\`\`json\n${DOC}\n\`\`\`\n\`\`\`json\n{"b":2}\n\`\`\``))).toBe("MULTIPLE_BLOCKS");
    expect(why(done(`\`\`\`json\n{"a":1`))).toBe("UNCLOSED_FENCE");
    expect(why(done(`這是你要的：\n\`\`\`json\n${DOC}\n\`\`\``))).toBe("EXTRA_PROSE");
    expect(why(done(`\`\`\`json\n${DOC}\n\`\`\`\n希望有幫助！`))).toBe("EXTRA_PROSE");
    expect(why(done('{"a":1,}'))).toBe("INVALID_JSON");
    expect(why(done(`\`\`\`ts\n${DOC}\n\`\`\``))).toBe("UNSUPPORTED_FENCE_LANGUAGE");
  });

  it("編輯器入口 aiFillJson 走同一套規則（⛔ 不是一支沒人呼叫的純函式）", async () => {
    const reply = (body: unknown) =>
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body } as unknown as Response);
    const req = { prompt: "p", field: "f", context: "{}" };

    const good = await aiFillJson(req, {
      fetchFn: reply({ text: `\`\`\`json\n${DOC}\n\`\`\``, finish_reason: "stop", stub: false }),
      token: null,
    });
    expect(ok(good.outcome).normalizationApplied).toBe(true);

    // 截斷的回覆不得產生可套用候選
    const cut = reply({ text: DOC, finish_reason: "length", stub: false });
    expect(why((await aiFillJson(req, { fetchFn: cut, token: null })).outcome)).toBe("NOT_COMPLETE");
  });
});
