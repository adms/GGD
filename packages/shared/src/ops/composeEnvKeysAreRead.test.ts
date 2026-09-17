/**
 * ⭐⭐【compose 設的每一個 env key，那個服務要**真的讀得到**】(GH#1235)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 抓到的：一個 bind mount **等於沒作用**，而每一邊都合法
 * ═══════════════════════════════════════════════════════════════════════════
 *   docker/compose.yaml:343          CONTENT_DIR: /srv/content
 *   apps/content-api/src/index.ts:25 process.env.GGD_CONTENT_DIR ?? join(here, "…/content")
 *
 * ⇒ ⭐ content-api 安靜地退回**映像裡的相對路徑** —— YAML 合法、程式的預設值合法
 * ⇒ ⛔ **壞掉跟正常長得一模一樣**（fail-open 的靜默）。
 *
 * ⚠️ 這是 compose 三個 legacy alias 的**第三個**：`HTTP_ADDR`、`GAME_INTERNAL_URL`
 * 都各自被人工發現過一次 ⇒ ⭐ 判準（「改 compose 時記得對一下程式」）**已經失效兩次**，
 * ⛔ 第三次要靠閘。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️⚠️ 這條閘的量尺**自己騙過我三次** —— 寫下來，因為下一個人會再踩
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① `grep CONTENT_DIR` ⇒ ⛔ 被 `GGD_CONTENT_DIR` **子字串**滿足 ⇒ 漏掉正主
 *  ② 只認 `process.env.X` / `os.Getenv("X")` ⇒ ⛔ 漏掉 Go 的 `getenvInt("X", …)`
 *     與 TS 的解構 `env.X` ⇒ 誤報 **61** 個
 *  ③ 詞界比對 ⇒ ⛔ 被**同名區域變數**（`const CONTENT_DIR = …`）滿足 ⇒ 又漏掉正主
 * ⇒ ⭐ 今天的形狀：**詞界 ＋ 排除測試檔 ＋ 排除同名宣告**，量到 6 個（5 個進豁免）。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** 服務 → 它的原始碼住哪（⛔ 只看自己的，否則別的服務讀到就算它讀到了）。 */
const SERVICE_SOURCES: Record<string, readonly string[]> = {
  "content-api": ["apps/content-api"],
  game: ["apps/game-server", "packages/shared/src"],
  platform: ["apps/platform"],
  "hero-import": ["apps/content-api"],
  review: ["tools/review"],
};

/**
 * ⭐ 刻意保留、⛔ 沒有人讀的 key —— 每一列**帶一個能被反駁的理由**。
 * ⛔ 「還沒收」不是理由。
 */
const EXEMPT: Record<string, string> = {
  APP_ENV:
    "⭐ 它**有人讀**，只是讀的人不住任何一個 app 目錄：`tools/testrunner/internal/config/config.go:167` " +
    "拿它當**正式環境拒絕啟動**的安全閘（`APP_ENV=production` ⇒ 拒跑）。" +
    "反駁法：哪天 testrunner 不再讀它，這一列就要刪掉，compose 那幾行也跟著拿掉。",
  HTTP_ADDR:
    "⭐ legacy alias，**無害**：platform 的預設值與 `PLATFORM_ADDR` 同值 ⇒ 設不設結果一樣。" +
    "反駁法：哪天兩者的預設值不再相同，它就會變成一個安靜的錯誤 ⇒ 這一列要刪掉並改名。",
  GAME_INTERNAL_URL:
    "⭐ legacy alias，正主是 `GAME_SERVER_ADDR`（已在同一份 compose 裡設好）⇒ 多設的這一行不影響行為。" +
    "反駁法：哪天有人**只**設這一個而不設 `GAME_SERVER_ADDR`，它就是一個安靜的失效 ⇒ 刪掉這一列。",
};

interface Row { file: string; line: number; service: string; key: string }

function composeFiles(): string[] {
  return readdirSync(join(ROOT, "docker"))
    .filter((f) => /^compose.*\.yaml$/.test(f))
    .map((f) => join("docker", f))
    .sort();
}

/** ⛔ 刻意不引 YAML 解析器：這幾份的縮排是固定的，而多一個相依就多一個會壞的東西。 */
function envRows(rel: string): Row[] {
  const out: Row[] = [];
  let service: string | null = null, inEnv = false;
  readFileSync(join(ROOT, rel), "utf8").split("\n").forEach((line, i) => {
    const svc = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (svc) { service = svc[1]!; inEnv = false; return; }
    if (/^ {4}environment:\s*$/.test(line)) { inEnv = true; return; }
    if (!inEnv) return;
    const kv = /^ {6}([A-Z][A-Z0-9_]*):/.exec(line);
    if (kv) { if (service) out.push({ file: rel, line: i + 1, service, key: kv[1]! }); return; }
    if (line.trim() && !line.startsWith("      ")) inEnv = false;
  });
  return out;
}

/** ⭐ 這個服務的原始碼裡，有沒有**真的一行**提到這個 key。 */
function isRead(key: string, dirs: readonly string[]): boolean {
  for (const dir of dirs) {
    let stdout = "";
    try {
      stdout = execFileSync("grep", ["-rnE", `(^|[^A-Za-z0-9_])${key}([^A-Za-z0-9_]|$)`, dir],
        { cwd: ROOT, encoding: "utf8" });
    } catch { continue; }               // grep 找不到 ⇒ 非零，⛔ 不是錯誤
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const path = line.slice(0, line.indexOf(":"));
      if (path.includes(".test.") || path.includes("_test.go")) continue;   // ⛔ 測試檔不算
      const body = line.slice(line.indexOf(":", line.indexOf(":") + 1) + 1);
      if (new RegExp(`(const|let|var)\\s+${key}\\s*=`).test(body)) continue; // ⛔ 同名區域變數不算
      return true;
    }
  }
  return false;
}

describe("compose 的 env key 與程式的關係（GH#1235）", () => {
  const rows = composeFiles().flatMap(envRows).filter((r) => r.service in SERVICE_SOURCES);
  const unread = rows.filter((r) => !isRead(r.key, SERVICE_SOURCES[r.service]!));

  it("⭐ 量尺自證：真的解析到 key，⛔ 而且**不是**全部都讀得到（否則這條閘沒在問事）", () => {
    expect(rows.length, "⛔ 一個 env key 都沒解析到 —— 縮排變了？偵測壞了").toBeGreaterThan(50);
    expect(new Set(rows.map((r) => r.service)).size, "⛔ 只認得一個服務 ⇒ 解析錯了").toBeGreaterThan(1);
    // ⭐ 已知**讀得到**的那一半也要量得到 —— ⛔ 一把只驗過單邊的尺不算自證過。
    expect(isRead("GGD_CONTENT_DIR", ["apps/content-api"]), "⛔ 連正主都說讀不到 ⇒ 偵測壞了").toBe(true);
    expect(isRead("GGD_NOT_A_REAL_KEY_XYZ", ["apps/content-api"]), "⛔ 不存在的 key 說讀得到 ⇒ 偵測太寬").toBe(false);
  });

  it("⛔ compose 設了而那個服務讀不到的 key，要嘛修、要嘛進豁免表", () => {
    const orphans = unread.filter((r) => !(r.key in EXEMPT))
      .map((r) => `${r.file}:${r.line} [${r.service}] ${r.key}`);
    expect(
      orphans,
      "⛔⛔ 這幾個 env key **設了但沒有人讀** —— ⭐ 那一格（含它掛的 bind mount）等於沒作用，\n" +
        "而 YAML 合法、程式的預設值也合法 ⇒ ⛔ 壞掉跟正常長得一模一樣。\n" +
        "⇒ ⭐ 修的方向是**改 compose 跟上程式**，⛔ 不是讓程式多接受一個名字（那是多一個住處）。\n" +
        "⇒ 真的要保留 ⇒ 進 `EXEMPT` 並寫一個**能被反駁的理由**（⛔「還沒收」不算）。",
    ).toEqual([]);
  });

  it("⭐ 豁免表不可以養殭屍：每一列都要真的還有一個讀不到的 key 對應它", () => {
    const live = new Set(unread.map((r) => r.key));
    const stale = Object.keys(EXEMPT).filter((k) => !live.has(k));
    expect(
      stale,
      "⭐ 這幾列豁免已經沒有對應的 key 了（修好了、或那一行被拿掉了）⇒ **刪掉它們**。\n" +
        "⛔ 一張與世界脫節的豁免表，會讓上面那條閘開始放行真的缺口。",
    ).toEqual([]);
  });
});
