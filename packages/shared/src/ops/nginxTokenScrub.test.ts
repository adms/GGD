/**
 * ⭐⭐ GH#813 E —— **WS handshake 的 token 逐次進 access_log**。
 *
 * ── 量到的 ───────────────────────────────────────────────────────────────
 * lobby 的 WebSocket handshake 是
 * `GET /api/v1/lobby/ws?token=<access>`（`ui/platform/LobbySocket.ts:22`）
 * ⇒ ⛔ 而 nginx 的預設 `combined` 格式帶 `$request`（method ＋ **完整 URI 含 query**）
 * ⇒ ⭐ **一份 access_log 就是一疊可以直接用的憑證**。
 *
 * ⚠️ GH#724 的 AC2 只關了 **REST** 那一半。
 *
 * ── ⭐ 修法是**遮蔽**，⛔ 不是 `access_log off` ──────────────────────────
 * 關掉 log 會把「誰連過、什麼時候、從哪裡」一起丟掉，而那是事故調查唯一的材料
 *（CLAUDE.md：fail-open 沒錯，**靜默**才是缺陷）。
 *
 * ── ⚠️ 這條守衛驗的是**三個連結**，⛔ 不是一個字串 ──────────────────────
 * ①`map` 定義 `$request_uri_scrubbed` ②`log_format scrubbed` **用**它
 * ③`access_log` **指名**那個 format —— ⭐ 斷任何一環，token 就回到 log 裡。
 *
 * ⚠️ ⭐ 而**遮蔽真的會發生**是 2026-08-31 用真的 nginx 跑出來的（⛔ 不在這裡跑：
 * CI 上不一定有 docker，⭐ 而一條「環境不對就跳過」的閘等於沒有閘）：
 *
 *     GET /api/v1/lobby/ws?token=REDACTED&room=abc     ⭐ token 沒了、room 還在
 *     GET /api/v1/thing?refresh_token=REDACTED&x=1     ⭐ 同上
 *
 * MUTATION LOG（落地前跑過）：
 *   · `access_log /dev/stdout scrubbed;` 的 `scrubbed` 拿掉 → 「指名那個 format」紅
 *   · `log_format` 裡的 `$request_uri_scrubbed` 換回 `$request` → 「用遮蔽過的」紅
 *   · `map` 那一段刪掉 → 「定義它」紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONF = readFileSync(resolve(__dirname, "../../../../nginx/nginx.conf"), "utf8");

describe("GH#813 E nginx access_log 的 token 遮蔽", () => {
  it("量尺先自證：讀得到設定且它真的有 access_log（⛔ 空的會讓下面空過）", () => {
    expect(CONF.length).toBeGreaterThan(1000);
    expect(CONF).toMatch(/^\s*access_log /m);
  });

  it("★ ⭐ 三個連結都在：`map` 定義 → `log_format` 用它 → `access_log` 指名它", () => {
    expect(CONF, "① ⛔ 沒有定義遮蔽變數").toMatch(
      /map \$request_uri \$request_uri_scrubbed \{/,
    );
    const lf = /log_format scrubbed ([\s\S]*?);/.exec(CONF);
    expect(lf, "② ⛔ 沒有 `log_format scrubbed`").not.toBeNull();
    expect(lf![1], "② ⛔ 那個 format 沒有用遮蔽過的變數").toContain("$request_uri_scrubbed");
    expect(lf![1], "② ⛔ 它同時帶著 `$request`（＝原始 query 又回來了）").not.toMatch(
      /\$request[^_]/,
    );
    expect(CONF, "③ ⛔ `access_log` 沒有指名那個 format ⇒ 走回預設 combined").toMatch(
      /access_log \/dev\/stdout scrubbed;/,
    );
  });

  it("⭐ 遮的是 `*token=`，⛔ 而其餘 query 參數留著（那是調查要看的）", () => {
    const m = /map \$request_uri \$request_uri_scrubbed \{([\s\S]*?)\n    \}/.exec(CONF);
    expect(m).not.toBeNull();
    const body = m![1]!;
    expect(body, "⛔ 沒有涵蓋 `refresh_token` / `access_token` 這一族").toContain("token)=");
    expect(body, "⛔ 沒有 default ⇒ 不符合的請求會 log 出空字串").toContain("default $request_uri;");
    expect(body).toContain("REDACTED");
  });

  it("⭐ ⛔ **不可以**改成 `access_log off`（那會把調查材料一起丟掉）", () => {
    expect(CONF, "⛔ 關掉 log 不是遮蔽").not.toMatch(/^\s*access_log off;/m);
  });
});
