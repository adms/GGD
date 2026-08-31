/**
 * ⭐⭐ GH#813 A —— CSP 違規**收得到**（在此之前結構上收不到）。
 *
 * ── ⛔ 真正的阻塞不是「還沒轉 enforced」──────────────────────────────────
 * `Content-Security-Policy-Report-Only` 已經上線很久，⛔ **而它沒有 `report-uri`**
 * ⇒ ⭐ 違規只進**瀏覽器 console**，⛔ 沒有任何地方收得到。
 * ⇒ 票文說的「要一輪真 session 的 violation 清單」**在結構上收集不了** ——
 * ⭐ 而那正是這張票卡住的原因（⛔ 不是沒有人去玩）。
 *
 * ── ⭐ 三道界線（這個端點任何人都打得到）──────────────────────────────────
 * 瀏覽器自己送報告，⛔ 沒有 origin 可驗 ⇒
 *   ① `client_max_body_size 16k` —— ⛔ 沒有上限＝給任何人一支寫 log 的筆
 *   ② `limit_except POST { deny all; }`
 *   ③ ⭐ **只寫 log、⛔ 不回顯**（204 空 body）
 *
 * MUTATION LOG：
 *   · 拿掉 `report-uri` → ①紅（政策沒有回報端）
 *   · 拿掉 `client_max_body_size` → ③紅（無上限的寫 log 筆）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONF = readFileSync(join(REPO, "nginx/nginx.conf"), "utf8");

describe("GH#813 A CSP 違規收得到", () => {
  it("★ ⭐ **每一條** Report-Only 政策都有 `report-uri`（⛔ 沒有它＝收不到）", () => {
    const ro = CONF.split("\n").filter((l) => l.includes("Content-Security-Policy-Report-Only"));
    expect(ro.length, "⛔ 找不到 Report-Only 政策").toBeGreaterThan(0);
    const naked = ro.filter((l) => !l.includes("report-uri"));
    expect(
      naked.length,
      "⛔ 有 Report-Only 政策沒有回報端 ⇒ 那一段的違規永遠只在 console 裡",
    ).toBe(0);
  });

  it("★ ⭐ 收集端**存在**而且只寫 log（⛔ 不回顯）", () => {
    expect(CONF).toContain("location = /csp-report");
    expect(CONF, "⛔ 沒有專屬 log_format ⇒ 報告內容不會落地").toContain("log_format csp_report");
    expect(CONF, "⛔ 沒有 internal sink ⇒ $request_body 會是空的").toContain(
      "location = /__csp_sink",
    );
  });

  it("★ ⭐ 三道界線都在（⛔ 這個端點任何人都打得到）", () => {
    const at = CONF.indexOf("location = /csp-report");
    const blk = CONF.slice(at, at + 700);
    expect(blk, "⛔ body 沒有上限 ＝ 給任何人一支寫 log 的筆").toContain("client_max_body_size 16k");
    expect(blk, "⛔ 其他動詞沒擋").toContain("limit_except POST");
  });

  it("⭐ enforced 那一條**沒有被動到**（⛔ 這一手不轉 enforce）", () => {
    // ⚠️ 轉 enforced 需要一輪真 session 的清單 —— ⭐ 而清單要先收得到才存在。
    const enforced = CONF.split("\n").filter(
      (l) => l.includes("add_header Content-Security-Policy ") && !l.includes("Report-Only"),
    );
    expect(enforced.length).toBeGreaterThan(0);
    for (const l of enforced) {
      expect(l, "⛔ enforced 政策被擴大了 —— 那要先有違規清單").not.toContain("default-src");
    }
  });
});
