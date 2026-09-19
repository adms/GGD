/**
 * quoteGapDbPaths.mjs — 名言補檔聽審頁（quote-gap audition）**唯一**的資料庫路徑來源。
 *
 * GH#1288 —— owner 在「共 14 位・已選 14」按下「送出給 Claude」時，整批一個都沒存下來：
 *
 *   TypeError: db doc(): document paths have an even number of segments
 *   (collection/id pairs); "quotegap/export/all" has 3, which addresses a
 *   collection - add or drop one segment (data/users/<id> is itself a collection)
 *
 * ⭐ 根因不是打錯字，是**同一種路徑有兩個住處**：逐位存檔那一段自己接四段
 * （`quotegap/choices/heroes/<id>`，合法），送出那一段自己接三段（＝collection，非法）。
 * 兩段各自正確地做了自己的事，⛔ 而沒有任何東西比對過它們（CLAUDE.md 第〇·四守則）。
 *
 * ⇒ 這個檔就是那個唯一的住處：每一條路徑都走 `quoteGapDoc()`，而它只接得出
 *   `<root>/<area>/<kind>/<id>` **四段** —— ⭐ 三段的形狀從這裡**接不出來**。
 *
 * 規則（artifact db，錯誤訊息逐字說的）：段數**偶數**＝document，**奇數**＝collection。
 *
 * ⚠️ 相依性刻意為零（⛔ 沒有任何 `node:` 匯入）：聽審頁是瀏覽器裡的 artifact，
 *    之後的產生器要把這個檔**逐字內嵌**進頁面，⛔ 不是抄一份路徑字串過去 ——
 *    抄過去的那一份就是第二個住處，而這張票正是它造成的。
 *
 * db 的形狀取自 repo 裡已經在跑的同族頁面（`tools/hero-intake/build-review-page.py:373`
 * 的 `DB.doc(...).set(...)`），⛔ 不是我憑印象假設的 API。
 */

/** 名言補檔這一族的根集合。 */
export const QUOTE_GAP_ROOT = "quotegap";

/**
 * 驗一條 document 路徑；不合法就丟，⛔ 不回 null（靜默退回＝這張票的形狀）。
 * @param {string} path 斜線串起來的完整路徑
 * @returns {string} 同一條路徑（方便 `return assertDocPath(...)`）
 */
export function assertDocPath(path) {
  if (typeof path !== "string" || path === "") {
    throw new TypeError(`db 文件路徑必須是非空字串，收到 ${JSON.stringify(path)}`);
  }
  const segments = path.split("/");
  if (segments.some((s) => s === "")) {
    throw new TypeError(`db 文件路徑有空白段：「${path}」`);
  }
  if (segments.length % 2 !== 0) {
    throw new TypeError(
      `db 文件路徑要偶數段（collection/id 成對）：「${path}」有 ${segments.length} 段，` +
        `那是一個 collection ⇒ 加一段或減一段`,
    );
  }
  return path;
}

/**
 * 這一族唯一的組路徑函式：`quotegap/<area>/<kind>/<id>`（恆為四段＝document）。
 * @param {string} area 大類（choices / export…）
 * @param {string} kind 小類（heroes / batches…）
 * @param {string} id   文件 id
 */
export function quoteGapDoc(area, kind, id) {
  for (const [name, value] of [["area", area], ["kind", kind], ["id", id]]) {
    if (typeof value !== "string" || value === "" || value.includes("/")) {
      throw new TypeError(`${name} 必須是不含斜線的非空字串，收到 ${JSON.stringify(value)}`);
    }
  }
  return assertDocPath([QUOTE_GAP_ROOT, area, kind, id].join("/"));
}

/** 逐位選擇（「選了就存」那一顆）。⚠️ 逐字維持已經存過資料的形狀，⛔ 不要改。 */
export const quoteGapChoiceDocPath = (heroId) => quoteGapDoc("choices", "heroes", heroId);

/** 送出整批（「送出給 Claude」那一顆）。GH#1288 之前這裡是三段的 `quotegap/export/all`。 */
export const quoteGapExportDocPath = (exportId = "all") => quoteGapDoc("export", "batches", exportId);

/**
 * 寫入 → 讀回核對。**寫失敗就讓錯誤丟出去**，⛔ 不吞成「送出成功」（票的驗收條件）。
 * @param {{doc: (path: string) => {set: (body: unknown) => Promise<unknown>, get: () => Promise<unknown>}}} db
 * @param {string} path 只收 `quoteGapDoc()` 產的路徑
 * @param {unknown} body
 * @returns {Promise<{path: string, data: unknown}>} 讀回來的那一份
 */
export async function saveAndVerify(db, path, body) {
  assertDocPath(path);
  const ref = db.doc(path);
  await ref.set(body);
  const snap = await ref.get();
  // 讀回的形狀兩種都收：snapshot（`.data()`）與純物件。
  const data = snap && typeof snap.data === "function" ? snap.data() : (snap?.data ?? snap);
  if (data === null || data === undefined) {
    throw new Error(`讀回失敗：「${path}」寫入之後讀不到內容 —— ⛔ 不可以當成送出成功`);
  }
  return { path, data };
}
