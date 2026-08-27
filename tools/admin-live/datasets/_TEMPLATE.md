# dataset 模組契約（tools/admin-live/datasets/<name>.mjs）

```js
/** 這個 dataset 讀哪些檔/目錄 —— mtime 全沒動就回快取（「實時」＝與磁碟現況一致）。 */
export const deps = ["content/abilities", "tools/w3x-import/out/vfx-census/MODEL_USAGE.json"];

/** GET /__live/<name> —— 每次（deps 有動時）當場算。回傳可 JSON 序列化的物件。 */
export async function build(repoRoot) { ... }

/** （可選）POST /__live/<name> —— 帶 body 的計算。 */
export async function compute(repoRoot, body) { ... }

/**
 * ⭐ GH#821（owner:「全部都要即時動態資料讀取**及儲存**（by JSON），不是唯讀」）——
 * **二選一，缺一覆蓋率閘（liveWriteCoverage.test.ts）會紅並指名這一頁**：
 */
// A) 可寫：POST /__live/<name>/save 由共用寫入端處理（middleware.mjs 的 handleSave）
export const write = {
  kind: "source", // "source"＝寫手編來源檔（線上 403，去本機做）| "overlay"＝線上也可寫
  rules: [{
    paths: ["content/config/foo.json"],       // glob（* 不跨 /）
    pointers: ["/bar", "/list/*/weight"],     // JSON pointer 樣式（* 命中一段）
    value: { type: "number", min: 0, max: 9 },// 宣告式規格（⛔ 不是 zod —— tools/ 解析不到 bare import）
    why: "這一格是什麼",
    check(repoRoot, { path, pointer, value }) { return null; }, // （可選）跨檔驗證，回錯誤字串
  }],
};
// B) 唯讀豁免：一個**能被反駁**的理由（⛔ 不是「還沒接」）
export const readonlyWhy = "全頁是 X 產物的 join 推導值，沒有一格是資料的家；反駁法：…";
```

規矩：
- ⛔ build()/compute() 不可以寫任何檔。**唯一**的寫入路徑是共用寫入端（它逐次 spawn
  `bash scripts/genguard.sh` —— 產生器產物 409 指名擁有者；⛔ 直接寫產物等於沒寫）。
- ⛔ 不可以 import apps/** 的程式（這裡是 node 環境，不是 vite）。
- deps 要誠實：漏列一個 = 那個檔動了頁面卻不更新 —— 那就變回「靜態內容」。
