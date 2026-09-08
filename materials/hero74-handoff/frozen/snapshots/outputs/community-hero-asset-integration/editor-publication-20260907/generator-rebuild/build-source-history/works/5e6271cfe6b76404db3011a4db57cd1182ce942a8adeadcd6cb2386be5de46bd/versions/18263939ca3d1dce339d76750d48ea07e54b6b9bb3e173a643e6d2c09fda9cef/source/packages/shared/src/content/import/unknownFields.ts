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
import { diagnostic, type ImportDiagnostic } from "./diagnostics";

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

/**
 * ⭐⭐ **組合入口** —— parse ＋「我沒看懂哪幾格」一次做完。
 *
 * ── 為什麼要有這一支（⛔ 不是「兩個函式各自叫」）──────────────────────────
 * ⚠️ 一個「先 `safeParse`、再記得叫 `unknownFields`」的介面，
 * ⭐ **第二步一定會有人漏掉** —— 而漏掉的樣子是**靜默通過**，
 * ⛔ 與正常長得一模一樣（CLAUDE.md 失敗形態⑧的形狀）。
 *
 * ⇒ ⭐ 把它做成**一次呼叫**：接線的人拿不到「只 parse 沒掃描」的結果。
 *
 * ⚠️ ⭐ 它**不會**因為未知欄位而失敗（`ok` 仍是 parse 的結果）——
 * 規格 §10 的用語是「至少包含」，⇒ 未來版本多帶欄位是**合法**的。
 * 未知欄位走 `diagnostics`（warning），由操作者用 `acceptedWarnings[]` 明示接受。
 */
export function parseWithUnknownFieldReport<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
): {
  readonly ok: boolean;
  readonly value: z.infer<T> | null;
  readonly diagnostics: readonly ImportDiagnostic[];
} {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // ⛔⛔ 這一行在 2026-09-01 之前是 `diagnostics: []` —— ⭐ **被拒的那條路一個字都不說**。
    //
    // ⚠️ 而它的症狀特別惡劣：呼叫端拿到 `ok:false` ＋ **空的診斷** ⇒ 它只能說
    //   「不合法」，⛔ 說不出**是哪一格**。⭐ 而這個模組存在的全部理由就是
    //   「多餘欄位**說得出名字**」（GH#327）—— ⇒ 型別錯的那一半卻是啞的。
    //
    // ⭐ 2026-09-01 抓到它的是 GH#908 的投稿守衛：一份 `gameId: 123` 的包被拒了，
    //   而斷言「拒了卻說不出原因」紅。⇒ ⭐ 玩家投稿是**不可信輸入** ——
    //   一句說不出原因的拒絕，對投稿者等於「壞了但我不告訴你哪裡」。
    //
    // ⛔ 只取前幾條：一份結構全錯的包會產生上百個 issue，⭐ 而前幾條就指得到現場。
    return {
      ok: false,
      value: null,
      diagnostics: parsed.error.issues.slice(0, 8).map((i) =>
        diagnostic(
          "PACKAGE_SCHEMA_INVALID",
          { path: i.path.join(".") || "(root)", detail: i.message },
          { path: i.path.join(".") || "(root)" },
        ),
      ),
    };
  }
  // ⭐ 掃的是**原始輸入**，⛔ 不是 parse 的產物 —— Zod 的 `.passthrough()` 會保留
  //   未知 key，⚠️ 但一個 `.strict()` 的子節點會在這裡就把它丟掉，
  //   ⇒ 掃產物會**漏報**那一種。
  const hits = unknownFields(schema, raw);
  return {
    ok: true,
    value: parsed.data as z.infer<T>,
    diagnostics: hits.map((h) =>
      diagnostic(
        "UNKNOWN_FIELDS_NOT_UNDERSTOOD",
        { path: h.path, fields: h.fields.join(", ") },
        { path: h.path, details: { fields: [...h.fields] } },
      ),
    ),
  };
}
