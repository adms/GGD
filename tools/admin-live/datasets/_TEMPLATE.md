# dataset 模組契約（tools/admin-live/datasets/<name>.mjs）

```js
/** 這個 dataset 讀哪些檔/目錄 —— mtime 全沒動就回快取（「實時」＝與磁碟現況一致）。 */
export const deps = ["content/abilities", "tools/w3x-import/out/vfx-census/MODEL_USAGE.json"];

/** GET /__live/<name> —— 每次（deps 有動時）當場算。回傳可 JSON 序列化的物件。 */
export async function build(repoRoot) { ... }

/** （可選）POST /__live/<name> —— 帶 body 的計算。 */
export async function compute(repoRoot, body) { ... }
```

規矩：
- ⛔ 不可以寫任何檔（唯讀計算）。要 spawn python 可以（例：跑一支 dump script 拿 JSON）。
- ⛔ 不可以 import apps/** 的程式（這裡是 node 環境，不是 vite）。
- deps 要誠實：漏列一個 = 那個檔動了頁面卻不更新 —— 那就變回「靜態內容」。
