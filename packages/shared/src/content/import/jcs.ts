/**
 * RFC 8785（JSON Canonicalization Scheme）—— Editor package 握手層的地基。
 *
 * 為什麼這支要單獨存在（不能用隔壁的 `content/hash.ts`）：
 *   `hash.ts` 用 `safe-stable-stringify` 排 key，然後只取 **12 hex**。那是給
 *   內容定址 / cache-busting 用的，不是跨專案的 wire contract：
 *     · 12 hex 不是 SHA-256 —— 規格 §1 的 `contentSha256` 是完整 64 hex。
 *     · `safe-stable-stringify` 的排序、undefined / 循環參照處理都是它自己的規則，
 *       不是 RFC 8785 的規則。對面（editor）不會跑同一個 npm 套件。
 *   規格 §13「同 package 在 editor 與 game importer 得到相同 digests」是一個
 *   **配對性質**（見 CLAUDE.md 的 pairwise postcondition）—— 兩邊各自「排了 key」
 *   不代表排出同一個順序。所以這裡照 RFC 8785 逐條實作，不借用既有工具。
 *
 * RFC 8785 的三條核心規則，以及本實作怎麼滿足它們：
 *
 *   ① 物件 key 依 **UTF-16 code unit** 遞增排序（§3.2.3）。
 *      ⚠️ 不是 code point、不是 UTF-8 byte、更不是 localeCompare。
 *      JavaScript 的 `<`／`Array.prototype.sort()` 預設就是 UTF-16 code unit 比較，
 *      所以這裡刻意使用裸比較。RFC 的示例正是用 U+1F602（😂，代理對首碼 0xD83D）
 *      排在 U+FB33（דּ）**前面**來示範這一點 —— code point 排序會給出相反答案。
 *      守衛：`jcs.test.ts` 的 RFC 8785 §3.2.3 官方向量。
 *
 *   ② 數字用 ECMAScript `Number::toString`（§3.2.2.2），所以 `60.0` → `60`、
 *      `-0` → `0`、`1e30` → `1e+30`。ES 的 `JSON.stringify(number)` 對 finite
 *      number 就是這個演算法，因此直接委派給它 —— 自己重寫 double→shortest-string
 *      只會多一份會錯的實作。
 *      ⛔ NaN／Infinity 一律拒絕（規格 §4.4 / plan §4.4：只接受 finite JSON numbers）。
 *
 *   ③ 字串跟隨 ES `QuoteJSONString`（§3.2.2.2）：只 escape
 *      `"` `\` `\b` `\f` `\n` `\r` `\t` 與 < 0x20 的控制碼（小寫 \u00xx）；
 *      U+007F、U+0080 等一律**原樣輸出**。同樣直接委派給 `JSON.stringify`。
 *
 * ⛔ 這支不可以「順手改進」。它的正確性定義在對面專案的實作裡，不在我們的品味裡。
 */
import { sha256Hex } from "../sha256";

/** 模組層級共用 —— 每次比較都 new 一個 encoder 會讓大 manifest 的排序變成 O(n log n) 次配置。 */
const UTF8 = new TextEncoder();

/** `contentSha256` / `packageDigest` 的前綴。規格 §2.1.1.1 的 manifest 範例：`"sha256:078be7…"`。 */
export const SHA256_PREFIX = "sha256:";

/** JSON 可表達的值。canonicalize 只接受這些；其餘（undefined／函式／Date／Map…）一律拒絕。 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** RFC 8785 canonical form。回傳的是字串；bytes 一律以 UTF-8 詮釋。 */
export function canonicalizeJcs(value: unknown, path = "$"): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      // 規格 §4.4：只接受 finite JSON numbers。靜默夾成 0／null 會讓兩邊的 digest
      // 無聲地分岔，而錯誤訊息會指向內容 —— 所以這裡 fail loud 並指名路徑。
      if (!Number.isFinite(value)) {
        throw new Error(`JCS: ${path} 不是 finite number（${String(value)}）；規格禁止 NaN／Infinity`);
      }
      return JSON.stringify(value); // ES Number::toString —— RFC 8785 §3.2.2.2 規定的那一個
    case "string":
      return JSON.stringify(value); // ES QuoteJSONString —— RFC 8785 §3.2.2.2 規定的那一個
    case "object":
      break;
    default:
      throw new Error(`JCS: ${path} 是 ${typeof value}，不是 JSON 值`);
  }

  if (Array.isArray(value)) {
    // ⚠️ 陣列**不排序**。順序是 JSON 的語意，排掉就是竄改內容。
    return `[${value.map((el, i) => canonicalizeJcs(el, `${path}[${i}]`)).join(",")}]`;
  }

  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) {
    // Date／Map／Set／class instance 都會落在這裡。它們的 JSON 形狀取決於 toJSON／
    // 內部欄位，兩邊實作不會一致 —— 拒絕，不要猜。
    throw new Error(`JCS: ${path} 不是 plain JSON object（${Object.prototype.toString.call(value)}）`);
  }

  // `Object.entries` 拿的是 own enumerable pairs —— `JSON.parse` 產生的 own "__proto__"
  // 也在裡面，且值是真的 own value（不是 Object.prototype 上的 accessor）。
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, v] of entries) {
    if (v === undefined) {
      // 規格要求 bootstrap 的 `base.activationDigest` 「必須明示 null」——
      // 靜默丟掉 undefined key 會讓「忘了填」跟「明示 null」得到不同 digest 卻沒人發現。
      throw new Error(`JCS: ${path}.${key} 是 undefined；JSON 沒有這個值，請明示 null 或移除該 key`);
    }
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); // ← ① UTF-16 code unit

  const body = entries
    .map(([key, v]) => `${JSON.stringify(key)}:${canonicalizeJcs(v, `${path}.${key}`)}`)
    .join(",");
  return `{${body}}`;
}

/** JCS canonical form 的 UTF-8 byte 長度 —— manifest `entries[].contentSize` 用的就是這個。 */
export function jcsByteLength(value: unknown): number {
  return UTF8.encode(canonicalizeJcs(value)).length;
}

/** 規格 §1 的 `contentSha256`：對 JCS canonical UTF-8 bytes 取 SHA-256，回 `sha256:<64 小寫 hex>`。 */
export function contentSha256(doc: unknown): string {
  return SHA256_PREFIX + sha256Hex(canonicalizeJcs(doc));
}

/**
 * UTF-8 byte order 比較。
 *
 * ⚠️ 這**不是** ① 的那個比較。規格 §10 步驟 ② 明寫 manifest 陣列依
 * 「POSIX path／id **byte order**」排序，而 JCS 的 key 依 UTF-16 code unit 排序。
 * 兩者只在「星光平面字元 vs U+E000..U+FFFF」上分岔，但那正是最難查的那一種分岔，
 * 所以兩邊各自明寫，不共用。
 */
export function compareUtf8Bytes(a: string, b: string): number {
  const x = UTF8.encode(a);
  const y = UTF8.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}
