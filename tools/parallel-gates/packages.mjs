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

/** dir 底下有沒有 vitest 認得的測試檔（⛔ 不掃 node_modules／out／dist —— w3x-import 的傾印有十萬行）。 */
function hasTestFiles(dir, depth = 0) {
  if (depth > 3 || !existsSync(dir)) return false;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && /\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) return true;
    if (
      e.isDirectory() &&
      !["node_modules", "out", "dist", ".git"].includes(e.name) &&
      hasTestFiles(`${dir}/${e.name}`, depth + 1)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * ⭐⭐ **「這批路徑可能弄壞哪幾包 vitest」—— 依賴方向從 package.json 推導。**
 *
 * 七包全跑 237s,而依賴方向是**單向**的:apps/* 依賴 packages/shared,⛔ 反過來沒有。
 * ⇒ 只動 apps/client 時,其他包**結構上不可能**被它弄壞 —— 跑它們是純等待。
 *
 * ⛔ **這裡一行手寫的「誰依賴誰」都沒有**:依賴邊逐份讀 package.json 的
 * dependencies/devDependencies/peerDependencies,取**遞移閉包** ——
 * 手寫那張表在包搬家／加依賴的那一天就開始說謊,而且⛔ 不會有東西紅。
 *
 * ── fail-closed:四個入口全部往「全包」（`suites: null`）倒 ─────────────────
 *   · `content/` 動了            —— 每一個 runtime 都在載入時吃它,package.json 看不見這條邊
 *   · apps/／packages/ 底下對不到任何 package 的路徑
 *   · `tools/` 動了但掃不到 ops 守衛的宿主
 *   · 任何其他對不到規則的路徑（docs/·scripts/·根設定…）
 *
 * @param {string[]} paths git diff 的路徑集合（repo 相對）
 * @param {string} repo repo 根
 * @returns {{suites: string[]|null, extras: string[], why: string}}
 *   `suites: null` = 全包（fail-closed）。`extras` = 被改到、而且自己有測試檔的 tools/ 目錄。
 */
export function suitesForPaths(paths, repo) {
  const base = repo.endsWith("/") ? repo : `${repo}/`;
  const all = packagesWithVitest(repo);
  // 名字↔目錄與**直接**依賴邊,全部從 package.json 讀出來
  const byDir = new Map();
  for (const r of ["apps", "packages"]) {
    const root = `${base}${r}`;
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).sort()) {
      const p = `${root}/${name}/package.json`;
      if (!existsSync(p)) continue;
      const j = JSON.parse(readFileSync(p, "utf8"));
      const deps = new Set();
      for (const k of ["dependencies", "devDependencies", "peerDependencies"])
        for (const d of Object.keys(j[k] ?? {})) deps.add(d);
      byDir.set(`${r}/${name}`, { name: j.name, deps });
    }
  }
  const dirOfName = new Map([...byDir].map(([dir, v]) => [v.name, dir]));
  /** dir 是否（遞移地）依賴叫 targetName 的包 */
  const dependsOn = (dir, targetName, seen = new Set()) => {
    if (seen.has(dir)) return false;
    seen.add(dir);
    const v = byDir.get(dir);
    if (!v) return false;
    if (v.deps.has(targetName)) return true;
    for (const d of v.deps) {
      const dd = dirOfName.get(d);
      if (dd && dependsOn(dd, targetName, seen)) return true;
    }
    return false;
  };
  // ⭐ 「ops 守衛住在哪」也是推導的:有 `src/ops` 的那（幾）包,⛔ 不寫包名字面值
  const opsHosts = all.filter((d) => existsSync(`${base}${d}/src/ops`));

  const need = new Set();
  const extras = new Set();
  for (const p of paths) {
    if (p.startsWith("content/")) {
      // ⭐⭐ GH#809（2026-08-27）—— `suites: null` 是「全**包**」，⛔ 不是「全部測試」。
      //    `extras` 走的是 `tools/` 那一半，而這一行以前回 `[]`
      //    ⇒ **純 content 改動永遠跑不到任何 tools/ 的測試**。
      //    ⚠️ 而 #667 / #668 兩張票的觸發改動**都只碰 content/** ——
      //    也就是說：抓得到它們的那幾支守衛，在它們壞掉的那一刻**結構上跑不到**。
      // ⭐ 補法是**推導**的，⛔ 不是一張手寫的 tools 清單：
      //    `sync-io.json` 量過每一支產生器**讀了什麼** ⇒ 讀 content/ 的那幾支，
      //    它們自己的測試就該跟著 content 改動一起跑。
      const readers = new Set();
      try {
        const io = JSON.parse(readFileSync(`${base}tools/parallel-gates/sync-io.json`, "utf8"));
        // ⭐ 步驟名 → 它的 tool 目錄：從 `package.json` 的指令文字推導。
        //    ⛔ 不從 `writes` 推 —— 多數產生器寫的是 `content/` 或 `docs/`，
        //    它們自己的目錄根本不在 writes 裡（第一版就是這樣只抓到 1 支）。
        const scripts = JSON.parse(readFileSync(`${base}package.json`, "utf8")).scripts ?? {};
        for (const st of io.steps ?? []) {
          if (!(st.reads ?? []).some((r) => String(r).startsWith("content/"))) continue;
          // ⭐⭐ GH#815 之後 41 支入口被包成 `bash scripts/genrun.sh <step> <step>:raw`
          //    ⇒ 公開名的指令文字裡**一個 `tools/` 都沒有** ⇒ 這條推導會靜靜地回 0。
          //    ⚠️ 實測過：包裝上線的那一刻 `extras` 從 23 掉到 **0**，
          //    ⭐ 而 `contentChangeRunsContentReaders.test.ts` 立刻紅並指名它
          //    —— 那正是那條閘存在的理由（⛔ 不是「有沒有 extras 這個字」）。
          //    ⇒ 公開名指到 wrapper 時，改讀 `<step>:raw` 的指令文字。
          const raw = String(scripts[`${st.name}:raw`] ?? "");
          const direct = String(scripts[st.name] ?? "");
          const cmd = direct.includes("genrun.sh") && raw !== "" ? raw : direct;
          for (const t of cmd.matchAll(/(tools\/[^/\s]+)\//g)) {
            if (hasTestFiles(`${base}${t[1]}`)) readers.add(t[1]);
          }
        }
      } catch {
        // ⛔ 讀不到戶籍表 ⇒ 回全包（fail-closed），⛔ 不是靜靜少跑幾支
        return { suites: null, extras: [], why: `content/ 動了(${p})，而戶籍表讀不到 ⇒ 全包(fail-closed)` };
      }
      return {
        suites: null,
        extras: [...readers].sort(),
        why:
          `content/ 動了(${p}) ⇒ 每一個 runtime 都在載入時吃它 ⇒ 全包` +
          (readers.size ? `＋讀 content 的 tool 測試 ${[...readers].sort().join(",")}` : ""),
      };
    }
    const m = /^(apps|packages)\/([^/]+)\//.exec(p);
    if (m) {
      const dir = `${m[1]}/${m[2]}`;
      const v = byDir.get(dir);
      if (!v) return { suites: null, extras: [], why: `${p} 對不到任何 package ⇒ 全包(fail-closed)` };
      if (all.includes(dir)) need.add(dir);
      for (const s of all) if (dependsOn(s, v.name)) need.add(s); // ⭐ 遞移依賴它的每一包
      continue;
    }
    const t = /^tools\/([^/]+)\//.exec(p);
    if (t) {
      // ops 守衛（shipGateScript / hostDeployScript 那一族）驗的正是 tools/ 裡的腳本
      if (!opsHosts.length) return { suites: null, extras: [], why: "掃不到 src/ops 的宿主 ⇒ 全包(fail-closed)" };
      for (const h of opsHosts) need.add(h);
      const tdir = `tools/${t[1]}`;
      if (hasTestFiles(`${base}${tdir}`)) extras.add(tdir); // ＋該 tool 自己的測試
      continue;
    }
    return { suites: null, extras: [], why: `${p} 對不到任何規則(${p.split("/")[0]}) ⇒ 全包(fail-closed)` };
  }
  const suites = [...need].sort();
  return {
    suites,
    extras: [...extras].sort(),
    why: `${paths.length} 個路徑 ⇒ 依賴閉包裁到 ${suites.length}/${all.length} 包${extras.size ? `＋tool 測試 ${[...extras].join(",")}` : ""}`,
  };
}
