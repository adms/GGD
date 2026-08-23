/**
 * 「哪些 package 有 vitest」—— ⭐ **掃出來的**,⛔ 不是手寫一張表。
 *
 * ⚠️ 這支檔是被守衛逼出來的：`ship.mjs` 第一版手寫了五包
 *（shared/client/game-server/admin/platform）,而 `shipGateScript.test.ts` 當場指出
 * **漏了 `apps/content-api`、`apps/editor`、`apps/test-dashboard`**
 * —— 那三包的紅燈在出貨前一次都不會出現。
 *
 * ⭐ 它單獨住一個檔的理由是**守衛要跑真的這一支**（失敗形態⑤：被測的不是出貨的那個）,
 * 而 `ship.mjs` 有 top-level await、import 進來就會開始跑閘。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";

/** @param {string} repo repo 根（結尾要有斜線或沒有都可以） */
export function packagesWithVitest(repo) {
  const base = repo.endsWith("/") ? repo : `${repo}/`;
  const out = [];
  for (const r of ["apps", "packages"]) {
    const dir = `${base}${r}`;
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const pkg = `${dir}/${name}/package.json`;
      if (!existsSync(pkg)) continue;
      const j = JSON.parse(readFileSync(pkg, "utf8"));
      if (typeof j.scripts?.test === "string" && j.scripts.test.includes("vitest")) {
        out.push(`${r}/${name}`);
      }
    }
  }
  return out;
}
