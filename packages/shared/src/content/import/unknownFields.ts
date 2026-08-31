/**
 * ⭐⭐ **importer 沒看懂的欄位**（GH#327 ① · 計畫 §3.3）。
 *
 * ── 票文說「schema 預設方向反了」，⭐ 而它漏了一個真理由 ─────────────────
 * `packageSchema.ts` 的檔頭逐字寫著為什麼是 `.passthrough()`：
 * 「`packageDigest` 是對**原始 JSON** 的 projection 取 hash，parse 後把未知欄位
 *   吃掉會讓下游重算 digest 時對不上」。
 * ⇒ ⛔ 把那 **19 個** `.passthrough()` 翻成 `.strict()` 會**弄壞 digest**。
 *
 * ⭐ 而計畫 §3.3 自己就調和了：「`.passthrough()` 可用於保留未知 bytes 供重新輸出，
 * ⛔ 但**絕不代表 importer 已理解或接受其語意**」。
 * ⇒ ⭐ 缺的**不是** strict，是**「我沒看懂這幾格」這條訊號**。
 *
 * ── ⭐ 這支怎麼知道「宣告了哪些欄位」 ────────────────────────────────────
 * 從 **Zod schema 自己**讀（`.shape`），⛔ 不是一張手寫的欄位表 ——
 * 手寫的表在下一次加欄位時就過期，⚠️ 而過期的樣子是**誤報**
 * （一個剛加的合法欄位被報成「沒看懂」）⇒ 操作者學會忽略這個警告 ⇒ 它就死了。
 */
import type { z } from "zod";

/** 一處未知欄位。`path` 是 JSON pointer 風格（`/base/kind`）。 */
export interface UnknownFieldHit {
  readonly path: string;
  readonly fields: readonly string[];
}

/**
 * ⭐ **版本化的擴充命名空間** —— 放在這裡的東西是**明示的**，⛔ 不報警告。
 * 計畫 §3.3：「只允許版本化 `extensions` namespace，且每個 extension 必須宣告
 * capability／schema；未知 extension fail closed」。
 * ⚠️ ⭐ 這一層只負責「不重複報它」；**fail-closed 那一半**是 capability 檢查的事。
 */
const EXTENSION_KEY = "extensions";

/** 讀得出 `.shape` 的節點（object / passthrough 都有）。 */
type ShapeCarrier = { readonly shape?: Record<string, unknown> };
/** ZodOptional / ZodNullable / ZodDefault 這一族。 */
type Wrapped = { readonly _def?: { readonly innerType?: unknown; readonly schema?: unknown } };

/** ⭐ 剝掉 optional/nullable/default 的外衣，拿到裡面那個型別。 */
function unwrap(node: unknown): unknown {
  let cur = node;
  for (let i = 0; i < 8; i++) {
    const d = (cur as Wrapped)._def;
    const next = d?.innerType ?? d?.schema;
    if (next === undefined) return cur;
    cur = next;
  }
  return cur;
}

/**
 * ⭐ 逐層比對「這份資料的 key」與「schema 宣告的 key」。
 *
 * ⚠️ ⭐ 它**只走 schema 認得的路**：一個未知欄位底下的子樹**不再往下走**
 * （報一次就夠，⛔ 不是把它整棵樹都列出來 —— 那會讓一個打錯字的欄位
 * 產生上百條警告，而那與沒有警告一樣沒用）。
 */
export function unknownFields(
  schema: z.ZodTypeAny,
  value: unknown,
  path = "",
  depth = 0,
): UnknownFieldHit[] {
  if (depth > 12 || value === null || typeof value !== "object") return [];
  const node = unwrap(schema);

  if (Array.isArray(value)) {
    const inner = (node as { _def?: { type?: unknown } })._def?.type;
    if (inner === undefined) return [];
    return value.flatMap((v, i) =>
      unknownFields(inner as z.ZodTypeAny, v, `${path}/${i}`, depth + 1),
    );
  }

  const shape = (node as ShapeCarrier).shape;
  if (shape === undefined) return [];
  const declared = new Set(Object.keys(shape));
  const out: UnknownFieldHit[] = [];
  const extra = Object.keys(value as Record<string, unknown>).filter(
    // ⭐ `extensions` 是明示的通道 ⇒ ⛔ 不報它（fail-closed 由 capability 那一層管）
    (k) => !declared.has(k) && k !== EXTENSION_KEY,
  );
  if (extra.length > 0) out.push({ path: path === "" ? "/" : path, fields: extra.sort() });
  for (const k of Object.keys(value as Record<string, unknown>)) {
    if (!declared.has(k)) continue; // ⛔ 未知欄位的子樹不再往下（見上面的理由）
    out.push(
      ...unknownFields(
        shape[k] as z.ZodTypeAny,
        (value as Record<string, unknown>)[k],
        `${path}/${k}`,
        depth + 1,
      ),
    );
  }
  return out;
}
