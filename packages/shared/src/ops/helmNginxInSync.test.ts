/**
 * ⭐⭐ helm 的 `nginx.conf` 副本必須與**來源**逐位元組相同。
 *
 * ── ⛔ 2026-09-01 量到：它已經漂了 ──────────────────────────────────────────
 * `nginx/nginx.conf` 的檔頭逐字寫著
 * 「ALSO shipped as a Helm ConfigMap（deploy/helm/ggd/files/nginx.conf —
 *  **keep the copy in sync**; this file is the source of truth）」
 * ⭐ 而那句話是**散文** ⇒ ⛔ 沒有任何東西在驗。
 *
 * 實際漂掉的：GH#813 **E**（access_log 遮掉 query 裡的 token）——
 * ⇒ ⭐ **k8s 上跑的那一份仍然把每一次 WebSocket 連線的 token 逐字寫進 log**，
 * ⛔ 而 docker 那一份已經修好了。⚠️ 一個修好的安全洞，在另一個部署路徑上原封不動。
 *
 * ── ⭐ 這正是「兩個名詞的關係」那一族 ──────────────────────────────────────
 * 兩份檔案各自都合法、各自都 `nginx -t` 過、各自都有守衛 ——
 * ⛔ 而**沒有人問它們一不一樣**。
 *
 * MUTATION LOG：改動任一份的任一個位元組 → ①紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SRC = "nginx/nginx.conf";
const COPY = "deploy/helm/ggd/files/nginx.conf";

describe("helm 的 nginx 副本與來源同步", () => {
  it("★ ⭐ 兩份**逐位元組相同**（⛔ 一份修好的安全洞不可以只修一邊）", () => {
    const a = readFileSync(join(REPO, SRC), "utf8");
    const b = readFileSync(join(REPO, COPY), "utf8");
    if (a !== b) {
      const la = a.split("\n");
      const lb = b.split("\n");
      const at = la.findIndex((l, i) => l !== lb[i]);
      expect.fail(
        [
          `⛔ ${SRC} 與 ${COPY} 不一樣（第一處差異在第 ${at + 1} 行）：`,
          `  來源: ${la[at]?.slice(0, 110) ?? "(檔案較短)"}`,
          `  副本: ${lb[at]?.slice(0, 110) ?? "(檔案較短)"}`,
          "",
          "⭐ 修法：cp nginx/nginx.conf deploy/helm/ggd/files/nginx.conf",
          "⛔ 反方向不對 —— 來源是 nginx/nginx.conf（那個檔的檔頭逐字這樣寫）。",
        ].join("\n"),
      );
    }
    expect(a).toBe(b);
  });
});
