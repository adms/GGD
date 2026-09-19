/**
 * GH#1108 — 跨模型「JSON 輸出包裝」正規化的**唯一住處**。
 *
 * 為什麼只有一份：不同模型會把同一個合法答案包成不同的樣子（```json 圍欄、
 * 無標籤圍欄、前後空白、CRLF）。如果每個入口各自寫一段「寬鬆 parser」，那些
 * parser 會各自漂 —— 而它們漂的方向是**越來越寬**，最後把截斷的內容也收下來。
 * 所以包裝規則集中在這裡並**帶版本**（AI_JSON_UNWRAP_RULES_VERSION），
 * 每個 provider 入口只負責判定完成狀態與 final channel，再交給這一層。
 *
 * ⛔ 這一層**只剝包裝，不修內容**：不補括號／引號／逗號、不補缺欄位、不改
 *    模板 ID、不推測語意、不重新序列化（回傳的是原文切片，所以 JSON 字串裡的
 *    反引號、跳脫字元、花括號、channel 標記一個位元組都不會變）。
 * ⛔ 嚴格驗證**沒有被放寬**：root type / schema / 允許 ID / 組合 / 能力 / 套用
 *    安全檢查全部留在下游，這一層不碰。格式通過 ⛔ 不等於內容正確。
 * ⛔ reasoning／思考內容**永遠不會**被拿來當答案，即使 final 是空的。
 */

/** 包裝規則的版本；診斷與回放要記錄它（規則改了，舊收據才看得出是哪一版）。 */
export const AI_JSON_UNWRAP_RULES_VERSION = "ggd-ai-json-unwrap@1";

/**
 * adapter 判定的完成狀態。⭐ `unknown` 一律阻擋 —— **未知完成狀態不可當成
 * 正常結束**，因為一段截斷的 JSON 可能剛好在合法的位置斷掉。
 */
export type AiCompletion =
  | "complete"
  | "truncated"
  | "cancelled"
  | "timeout"
  | "streaming"
  | "unknown";

export interface AiStructuredResponse {
  /** 由各 provider adapter 判定；⛔ 這一層不猜協定。 */
  completion: AiCompletion;
  /** final answer channel 的原文。 */
  final: string | null | undefined;
  /** 只為診斷保留；⛔ 永遠不拿來填補空的 final。 */
  reasoning?: string | null;
}

export type AiJsonBlockReason =
  | "NOT_COMPLETE"
  | "EMPTY_FINAL"
  | "UNSUPPORTED_FENCE_LANGUAGE"
  | "UNCLOSED_FENCE"
  | "MULTIPLE_BLOCKS"
  | "EXTRA_PROSE"
  | "INVALID_JSON";

export type AiJsonOutcome =
  | {
      ok: true;
      /** 解析出來的值；root type 與 schema 由**下游**驗。 */
      value: unknown;
      /** 交給下游的 JSON 原文切片（⛔ 不是重新序列化的結果）。 */
      json: string;
      /** true = 有剝掉一層外層圍欄；false = 原生 JSON。診斷要分列這兩種。 */
      normalizationApplied: boolean;
      rulesVersion: string;
    }
  | { ok: false; reason: AiJsonBlockReason; detail: string; rulesVersion: string };

/** 開頭的圍欄：必須在第 0 個字元，語言標籤只收空的或 `json`。 */
const FENCE_OPEN = /^(`{3,})[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n/;
/** 某一行**整行**只有圍欄（行首、可有前後空白）。 */
const FENCE_LINE = /(?:^|\r?\n)[ \t]*`{3,}[ \t]*(?:\r?\n|$)/;

function block(reason: AiJsonBlockReason, detail: string): AiJsonOutcome {
  return { ok: false, reason, detail, rulesVersion: AI_JSON_UNWRAP_RULES_VERSION };
}

function parse(text: string): { ok: true; value: unknown } | { ok: false; detail: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, detail: String((e as Error)?.message ?? e) };
  }
}

/**
 * 收尾圍欄的位置（body 裡最後一行整行圍欄的起點），沒有就回 null。
 * ⭐ 錨在**字串結尾**，所以它找的一定是最後一行 —— 這正是「一個完整的外層
 * 區塊」的語意，也讓 JSON 字串裡的反引號永遠不會被當成收尾（JSON 字串裡不能
 * 有裸換行，所以一段字串內容不可能自己佔滿一整行）。
 */
function closeIndex(body: string, minTicks: number): number | null {
  const m = new RegExp("(?:\\r?\\n|^)[ \\t]*`{" + minTicks + ",}[ \\t]*$").exec(body);
  return m ? m.index : null;
}

/**
 * 把一次「已完成」的模型回覆剝成可以交給既有 schema 的 JSON。
 * 接受：原生 JSON，或**剛好被一個完整外層 Markdown 區塊**包住的 JSON。
 * 拒絕：未完成、空 final、多區塊、未閉合圍欄、前後額外解說、壞 JSON。
 */
export function normalizeAiJson(res: AiStructuredResponse): AiJsonOutcome {
  if (res.completion !== "complete") {
    const why = res.completion === "unknown"
      ? "adapter 沒有回報可辨識的 finish 欄位，無法確認有沒有截斷"
      : `完成狀態是「${res.completion}」`;
    return block("NOT_COMPLETE", `${why}，不算正常結束 —— 即使文字看起來已經是合法 JSON。`);
  }
  const text = (typeof res.final === "string" ? res.final : "").replace(/^﻿/, "").trim();
  if (!text) {
    const hint = res.reasoning ? "（有 reasoning，但⛔ 不以思考內容填補）" : "";
    return block("EMPTY_FINAL", `final answer 是空的${hint}。`);
  }

  const native = parse(text);
  if (native.ok) {
    return {
      ok: true,
      value: native.value,
      json: text,
      normalizationApplied: false,
      rulesVersion: AI_JSON_UNWRAP_RULES_VERSION,
    };
  }

  const open = FENCE_OPEN.exec(text);
  if (!open) {
    return FENCE_LINE.test(text)
      ? block("EXTRA_PROSE", "區塊前面還有別的文字；只接受整段就是一個外層區塊。")
      : block("INVALID_JSON", `不是合法 JSON：${native.detail}`);
  }
  const lang = open[2] ?? "";
  if (lang && lang.toLowerCase() !== "json") {
    return block("UNSUPPORTED_FENCE_LANGUAGE", `圍欄語言標籤是「${lang}」，只收 json 或不加標籤。`);
  }

  const body = text.slice(open[0].length);
  const close = closeIndex(body, open[1]!.length);
  if (close === null) {
    return FENCE_LINE.test(body)
      ? block("EXTRA_PROSE", "區塊後面還有別的文字；只接受整段就是一個外層區塊。")
      : block("UNCLOSED_FENCE", "外層區塊沒有閉合，輸出可能是截斷的。");
  }

  const inner = body.slice(0, close).trim();
  const unwrapped = parse(inner);
  if (!unwrapped.ok) {
    return FENCE_LINE.test(inner)
      ? block("MULTIPLE_BLOCKS", "有一個以上的區塊；⛔ 不擷取第一段看似 JSON 的文字。")
      : block("INVALID_JSON", `剝掉外層區塊之後仍不是合法 JSON：${unwrapped.detail}`);
  }
  return {
    ok: true,
    value: unwrapped.value,
    json: inner,
    normalizationApplied: true,
    rulesVersion: AI_JSON_UNWRAP_RULES_VERSION,
  };
}

/**
 * 常見 provider 的 finish 字彙 → 我們的完成狀態。**認不得的一律 `unknown`**
 * （⇒ 被 normalizeAiJson 擋下），⛔ 不猜未知協定。
 */
const COMPLETION_BY_FINISH: Readonly<Record<string, AiCompletion>> = {
  stop: "complete", end_turn: "complete", complete: "complete", completed: "complete", eos: "complete",
  length: "truncated", max_tokens: "truncated", truncated: "truncated",
  cancelled: "cancelled", canceled: "cancelled", aborted: "cancelled",
  timeout: "timeout", timed_out: "timeout",
  streaming: "streaming", incomplete: "streaming", in_progress: "streaming",
};

/** 把 adapter 回報的 finish 欄位轉成完成狀態；沒有／認不得 ⇒ `unknown`。 */
export function aiCompletionFromFinishReason(raw: unknown): AiCompletion {
  if (typeof raw !== "string") return "unknown";
  return COMPLETION_BY_FINISH[raw.trim().toLowerCase().replace(/[- ]/g, "_")] ?? "unknown";
}
