#!/usr/bin/env node
/**
 * 🧾 **執行期對帳** —— GH#771 Scope③ / AC③：
 * 「任何 step 若在執行中寫了**不在自己 `writes` 裡**的檔 ⇒ 紅」。
 *
 * ── ⭐ 為什麼靜態那一半不夠 ──────────────────────────────────────────────
 * `syncIoDeclaresWrites.test.ts` 已經讓「**宣告 0 份產物**」當場紅。
 * ⛔ 但它問的是**名詞**（這一列是不是空的），問不出**關係**（宣告 ↔ 實際寫入）。
 * ⇒ 兩種洞對它是隱形的，而兩種都真的發生過：
 *
 * | 洞 | 長什麼樣 | 後果 |
 * |---|---|---|
 * | **宣告少了一份** | 戶籍寫 1 份，實際寫 3 份 | 那 2 份沒有被隔離區鎖過 ⇒ `genrun` 解不開它們 ⇒ **EACCES**（#771 的原始症狀） |
 * | **⭐ 根本沒有宣告** | 全戶籍沒有任何 step 認領它 | 任何通道都寫得進去、沒有任何鏈會重生成它 ⇒ 它 stale 很久而**沒有東西紅**（#771 追記量到的 `tts-gen` 三份） |
 *
 * ⭐ CLAUDE.md 失敗形態⑫逐字：「**兩頭都要走**，⛔ 一頭不算」——
 * 上面那條從「宣告」那一頭走，這一支從「**實際寫出的位元組**」那一頭走。
 *
 * ── ⛔ 它管不到什麼（誠實那一欄）──────────────────────────────────────────
 * · ⛔ **`skills:sync` 那一趟不對帳** —— 鏈是**並行**跑的（`sync.mjs`），
 *   同一個時間窗裡有 8–12 支在寫 ⇒ mtime 歸不了因。⭐ 硬要在那裡對帳只會得到
 *   一張互相汙染的名單，而**一條會誤報的閘會被人放寬**。
 *   ⇒ 這一支只在 `genrun.sh` 的**單獨跑**那條路上出手（`GGD_QUARANTINE_UNLOCKED` 未設時），
 *   而 `package.json` 的每一支 `*:build` 公開名**都是** `bash scripts/genrun.sh <step>`。
 * · ⛔ 不驗**內容對不對** —— 那是各家 `*:check` 的事。這一支只問「**誰寫了它**」。
 * · ⛔ **正規化器的就地改欄位不算越界** —— 它們讀既有檔、只覆寫其中幾格，⛔ 沒有產生那份檔，
 *   所以「undeclared」對它們是**預期的**（清單的唯一住處是 `normalizers.json`）。
 *   ⚠️ 代價誠實寫出來：一支登記過的正規化器，在**已經有戶籍**的路徑上寫什麼都不會被這一支叫。
 *   ⭐ 但零認領（🔴）那一堆**不受影響** —— 最強的訊號⛔ 不可以被正規化器身分吃掉。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────
 *   node tools/parallel-gates/reconcile.mjs snapshot --out <檔>
 *   node tools/parallel-gates/reconcile.mjs verify --step <名> --before <檔>
 *   共用旗標：--root <repo 根> · --io <sync-io.json>
 *   逃生口：GGD_RECONCILE_OFF=1（用了要在 commit 訊息裡說為什麼）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** 產物住的三個區 —— 與 `product-quarantine.sh` 認得的路徑同一個母體。 */
export const ZONES = ["content", "docs", "data"];

/**
 * ⛔ 不是產物、而且**確實會在產生器跑的時候動**的落點。
 * ⚠️ 每一列要寫得出「誰寫它、為什麼它不該有戶籍」—— ⛔ 不接受「它很吵」。
 * ⭐ 表只能變短。
 */
export const NOT_A_PRODUCT = {
  "docs/_reports/**": "一次性報告落點（CLAUDE.md 的 `_temp_` 命名慣例就是為了它）—— ⛔ 沒有產生器擁有它，也沒有「過期」這回事",
  "docs/_data/gate-timings.json": "`sync.mjs` **排程器自己**的計時帳本（同一份程式碼重跑本來就是不同的秒數）",
  "docs/_data/deploy-timings.json": "部署計時帳本 —— 與上一列同一類，理由逐字寫在 `skillsSyncCoversGenerators.test.ts` 的 `deploy-timing` 那一欄",
  "docs/legacy/_overwrites/**": "覆蓋前的**自動留底** —— 寫它的是 `scripts/preserve-before-overwrite.py`（PreToolUse hook），⛔ 不是產生器",
  "**/.DS_Store": "Finder 的殘渣",
};

/** glob → RegExp。`*`/`?` ⛔ 不跨 `/`（與 python `glob.glob` 逐字一致），`**` 跨。 */
export function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export const matchesGlob = (glob, path) => globToRe(glob).test(path);

/** `sync-io.json` → `Map<step, globs[]>`。 */
/**
 * ⭐⭐ 戶籍表的 writes **＋ 寫入端原始碼裡的 `// ggd:writes` 靜態宣告**。
 *
 * ⚠️ 這一段是 2026-09-01 補的。在此之前靜態宣告**只有 `merge-io.mjs` 收得到**，
 * 而那條路要求**重新量測整張表** —— ⭐ 而那件事今天量到是不安全的：
 * 把現有的表餵回 `merge-io` 再合一次，`castderive:build:raw` 的 **493 筆 reads
 * 會消失**（它同時 read 又 write 那 493 份，而過濾規則會把自寫的剔掉）
 * ⇒ `syncPlan` / `syncPrune` 當場紅（「一行客戶端改動要跑 40 支」）。
 * ⇒ ⭐ 所以宣告要在**這裡**也被讀到：一個新家族被寫出來時（`fx.fam.*.json`），
 *   對帳當場就認得它，⛔ 不必等下一次全量重量測。
 *
 * ⚠️ 兩個名字都問（`<step>` 與 `<step>:raw`）—— 理由與下面 `step` 那一段逐字相同：
 * 公開名包著 genrun，真正的產生器在 `:raw` 上，⛔ 只讀公開名只會撈到 genrun.sh。
 */
function staticDeclared(stepName) {
  let pkg;
  // ⚠️ `ROOT` 是 CLI 段的區域變數（在這一行下面很遠），⛔ 這裡看不到它 ⇒ 自己算一份。
  const root = new URL("../..", import.meta.url).pathname;
  try { pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); } catch { return []; }
  const cmd = `${pkg.scripts?.[stepName] ?? ""} ${pkg.scripts?.[stepName.replace(/:raw$/, "")] ?? ""} ${pkg.scripts?.[`${stepName}:raw`] ?? ""}`;
  const out = [];
  for (const rel of [...cmd.matchAll(/[\w./-]+\.(?:py|ts|mjs|js|sh)/g)].map((m) => m[0])) {
    let head;
    try { head = readFileSync(join(root, rel), "utf8").split("\n").slice(0, 120).join("\n"); } catch { continue; }
    // ⚠️ 捕到**行尾**，⛔ 不是 \S+ —— 這個 repo 有含空白的檔名（同 merge-io 的註解）。
    for (const m of head.matchAll(/ggd:writes\s+(.+)$/gm)) out.push(m[1].trim());
  }
  return out;
}

export function declaredWrites(io) {
  return new Map((io.steps ?? []).map((s) => [s.name, [...(s.writes ?? []), ...staticDeclared(s.name)]]));
}

/** 這條路徑被哪幾支 step 認領（⛔ 空陣列 = 沒有任何戶籍）。 */
export function ownersOf(path, io) {
  return [...declaredWrites(io)]
    .filter(([, globs]) => globs.some((g) => g === path || matchesGlob(g, path)))
    .map(([name]) => name);
}

/**
 * ⭐ **正規化器 ↔ 作者** —— 判準與 `genguard.sh:74` 逐字同一個，而清單的**唯一住處**是
 * `normalizers.json`（⛔ 這裡不可以有第二份 —— 那正是第〇·四守則在說的事）。
 *
 * 一支 step 對**某一條路徑**是正規化器 ⇔ 它在清單裡，且（沒有 `only`）或（`only` 比中它）。
 * ⚠️ 逐**檔**，⛔ 不是逐步驟：`apconv:build` 對 `content/abilities/*.json` 是正規化器
 * （只覆寫換算那幾格），對它自己整份 emit 的 `docs/_data/ap-conversion-applied.json` 是**作者**。
 */
export function normalizesPath(step, path, norms) {
  const n = (norms ?? []).find((x) => x.step === step);
  if (!n) return false;
  return !Array.isArray(n.only) || n.only.some((g) => matchesGlob(g, path));
}

/** 正規化器清單（讀不到 ⇒ 全部當作者 ⇒ 閘變嚴 —— ⛔ 但要**大聲**，與 `loadPending` 同一個形狀）。 */
export function loadNormalizers(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8")).normalizers ?? [];
  } catch (e) {
    console.error(`⚠️ 讀不到正規化器清單 ${path}（${String(e)}）—— 這一輪把「就地改欄位」也當成越界寫入。`);
    return [];
  }
}

const IGNORED = Object.keys(NOT_A_PRODUCT);
export const isIgnored = (path) => IGNORED.some((g) => matchesGlob(g, path));

/**
 * ⭐ 三個產物區**以外**還有戶籍的目錄 —— 從宣告推導，⛔ 不是手寫一張表。
 * 量到的（2026-08-29）：`.`（`README.md` · `寶具總表_EX三階.csv`）·
 * `packages/shared/src/{content,sim}`（兩份推導出來的 .ts）· `tools/{locust-census,sfx-bind,skill-lists}`。
 * ⚠️ 這幾個目錄**只掃一層**（⛔ 不遞迴）—— `.` 遞迴下去是整個 repo。
 */
export function extraDirs(io) {
  const dirs = new Set();
  for (const globs of declaredWrites(io).values()) {
    for (const g of globs) {
      if (ZONES.includes(g.split("/")[0])) continue;
      dirs.add(g.includes("/") ? g.slice(0, g.lastIndexOf("/")) : ".");
    }
  }
  return [...dirs].sort();
}

/**
 * `路徑 → mtime:size` 快照（⛔ 不讀內容 —— 11,678 個檔要毫秒級）。
 *
 * ⚠️ **它管不到的**（誠實）：三個產物區以外**沒有任何戶籍**的新檔 ——
 * 掃描不到那個目錄就看不見它。⭐ 那一族的閘是別的一條：
 * `skillsSyncCoversGenerators.test.ts` 的「寫 docs/ 或 content/ 產物的產生器」掃描。
 */
export function snapshot(root, io) {
  const out = {};
  const take = (abs) => {
    const rel = relative(root, abs);
    if (isIgnored(rel)) return;
    try {
      const st = statSync(abs);
      out[rel] = `${st.mtimeMs}:${st.size}`;
    } catch {
      /* 讀不到就當它不在 —— 下一趟看得到就是「新增」*/
    }
  };
  const walk = (dir, deep) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (deep) walk(abs, true);
      } else if (e.isFile()) take(abs);
    }
  };
  for (const z of ZONES) walk(join(root, z), true);
  for (const d of io ? extraDirs(io) : []) walk(join(root, d), false);
  return out;
}

/** 兩份快照之間**真的被寫過**的檔（新增或 mtime/size 變了）。 */
export function changedBetween(before, after) {
  return Object.keys(after)
    .filter((p) => before[p] !== after[p])
    .sort();
}

/**
 * ⭐ 對帳本體：把「真的被寫過的檔」分成**四**堆。
 * `foreign` 與 `unowned` 都是紅的 —— ⛔ 但它們**不是同一個病**，所以訊息要分開講。
 *
 * ⭐ 第四堆 `pending` 是**棘輪**（`reconcile-pending.json`）：今天就存在、⛔ 而修它需要
 * 重量測 sync-io（＝走 `skills:sync` 那一趟＝**全域鎖**，平行 lane 禁跑）的洞。
 * ⚠️ 它**不擋**（exit 0），⛔ 但它**大聲** —— CLAUDE.md 逐字：「fail-open 沒錯，靜默才是缺陷」；
 * ⭐ 而一條**紅著出貨**的閘會被忽略，被忽略的閘等於沒有閘。
 * ⛔ 棘輪只收 `unowned` 那一類，而且它會**自己到期**（守衛在 `syncIoRuntimeReconcile.test.ts`）。
 */
export function classify(changed, io, step, pending = [], norms = []) {
  const mine = declaredWrites(io).get(step) ?? [];
  const isMine = (p) => mine.some((g) => g === p || matchesGlob(g, p));
  const ratcheted = (p) => pending.some((r) => r.step === step && r.path === p);
  const foreign = [];
  const unowned = [];
  const known = [];
  const normalized = [];
  for (const p of changed) {
    if (isMine(p)) continue;
    const owners = ownersOf(p, io);
    // ⭐ 第五堆 `normalized`：**就地改欄位**的正規化器沒有「產生」這份檔，只覆寫其中幾格 ⇒
    //   它 undeclared 是**預期的**，⛔ 不是宣告缺漏。量到的（2026-08-29）：`apconv:build`
    //   戶籍只有 1 份，而它就地重算 **422 份** `content/abilities/*.json` ⇒ 少了這一堆，
    //   `pnpm apconv:build` 單獨跑會**紅在一次完全合法的執行上**，而閘一誤報就會被放寬
    //   （這支檔頭自己記著這條理由：「一條會誤報的閘會被人放寬」）。
    // ⚠️ 只放行**已經有戶籍**的路徑：零認領那一堆（🔴）是最強的訊號，⛔ 不可以被正規化器身分吃掉。
    if (owners.length && normalizesPath(step, p, norms)) {
      normalized.push(p);
      continue;
    }
    if (owners.length) foreign.push(p);
    else if (ratcheted(p)) known.push(p);
    else unowned.push(p);
  }
  return { foreign, unowned, pending: known, normalized, ok: !foreign.length && !unowned.length };
}

/** 棘輪的列（讀不到就當空 —— ⛔ 但要大聲，靜默地少一張表 = 閘變嚴而訊息不知所云）。 */
export function loadPending(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8")).pending ?? [];
  } catch (e) {
    console.error(`⚠️ 讀不到對帳棘輪 ${path}（${String(e)}）—— 這一輪把已知的洞也當成新的。`);
    return [];
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
  const ROOT = resolve(flag("--root", new URL("../..", import.meta.url).pathname));
  const IO_PATH = resolve(flag("--io", join(ROOT, "tools/parallel-gates/sync-io.json")));
  const mode = argv[0];
  const io = JSON.parse(readFileSync(IO_PATH, "utf8"));

  if (mode === "snapshot") {
    writeFileSync(resolve(flag("--out", "")), JSON.stringify(snapshot(ROOT, io)), "utf8");
    process.exit(0);
  }
  if (mode !== "verify") {
    console.error("用法: reconcile.mjs snapshot --out <檔> | verify --step <名> --before <檔>");
    process.exit(2);
  }

  // ⭐ GH#815 的 **wrapper 名字分離**：`package.json` 的公開名（`castderive:build`）包著真正的
  //   指令（`castderive:build:raw`），而 **sync-io 量到的是後者** ⇒ 只查公開名會「查無此步」
  //   而靜靜跳過。量到的（2026-08-29）：47 個 genrun 入口裡有 11 個查無此步，
  //   ⭐ 其中 `castderive:build` 是純粹的公開名↔raw 名落差 —— 而它宣告 **492 份**，
  //   是正規化器裡 footprint 最大的一支 ⇒ 在此之前它**整支從來沒有被對帳過**。
  //   ⇒ 兩個名字都問一次，取戶籍表上真的有的那一個。
  const asked = flag("--step", "");
  const step = [asked, flag("--run", ""), `${asked}:raw`].find(
    (n) => n && (io.steps ?? []).some((s) => s.name === n),
  );
  const NORMS = loadNormalizers(resolve(flag("--normalizers", join(ROOT, "tools/parallel-gates/normalizers.json"))));
  // ⭐ 名字不在戶籍表裡 ⇒ **出聲**，⛔ 不是靜默通過（`product-quarantine.sh` 的同一個判準）。
  if (!step) {
    console.error(`⚠️ 對帳跳過：'${asked}' 不在 sync-io 的 ${(io.steps ?? []).length} 步裡（⛔ 沒有戶籍可以對）。`);
    process.exit(0);
  }
  const res = classify(
    changedBetween(JSON.parse(readFileSync(resolve(flag("--before", "")), "utf8")), snapshot(ROOT, io)),
    io,
    step,
    loadPending(resolve(flag("--pending", join(ROOT, "tools/parallel-gates/reconcile-pending.json")))),
    NORMS,
  );
  const { foreign, unowned, ok } = res;

  const list = (xs) => xs.slice(0, 20).map((p) => `     · ${p}`).join("\n") + (xs.length > 20 ? `\n     …還有 ${xs.length - 20} 份` : "");
  /**
   * ⭐ 認領者要**逐一標明是作者還是正規化器** —— 少了這半句，一份「只被正規化器認領」的
   * 手編來源檔讀起來會跟「別人的產物」一模一樣（CLAUDE.md：一個被 glob 灌大的統計，
   * 讀起來跟真的一模一樣）。量到的：387 份只被正規化器認領 ⇒ 它們**沒有作者**。
   */
  const listOwned = (xs) =>
    xs
      .slice(0, 20)
      .map((p) => {
        const who = ownersOf(p, io).map((o) => (normalizesPath(o, p, NORMS) ? `${o}(正規化器)` : `${o}(作者)`));
        return `     · ${p}  ← ${who.join(", ")}`;
      })
      .join("\n") + (xs.length > 20 ? `\n     …還有 ${xs.length - 20} 份` : "");
  // ⚠️ 正規化器那一堆**不擋**，⛔ 但要印 —— 一個安靜的放行讀起來就是「它什麼都沒寫」。
  if (res.normalized.length)
    console.error(
      `\n🧾 對帳：\`${step}\` **就地改了** ${res.normalized.length} 份別人擁有的檔 ——\n` +
        `   它是這些路徑的**正規化器**（只覆寫其中幾格，⛔ 沒有產生它們）⇒ ⛔ 不擋。\n` +
        `   ⚠️ 這不是「宣告缺漏」：修法⛔ 不是把它們加進 writes（那會讓隔離區把手編來源鎖成 444）。\n`,
    );
  // ⚠️ 棘輪那一堆**不擋**，⛔ 但每一次都要印 —— 一個安靜的已知洞讀起來就是「沒有洞」。
  if (res.pending.length)
    console.error(
      `\n⚠️ 對帳：\`${step}\` 寫了 ${res.pending.length} 份**已知無主**的檔（棘輪 reconcile-pending.json，⛔ 這一輪不擋）:\n` +
        `${list(res.pending)}\n     ⇒ 修法：重量測 sync-io（全域鎖，⛔ 平行 lane 禁跑）之後把那幾列刪掉。\n`,
    );
  if (ok) process.exit(0);
  console.error(`\n⛔⛔ 執行期對帳失敗（GH#771）—— \`${step}\` 寫了**不在自己 writes 裡**的檔：\n`);
  if (unowned.length)
    console.error(
      `  🔴 ${unowned.length} 份**全戶籍都沒有人認領**（最嚴重）:\n${list(unowned)}\n` +
        `     ⇒ 它們**沒有被隔離區鎖過** ⇒ 任何通道都寫得進去、⛔ 沒有任何鏈會重生成它們\n` +
        `     ⇒ 它們會 stale 很久而**沒有東西紅**（#771 追記量到的 tts-gen 三份就是這個形狀）\n`,
    );
  if (foreign.length)
    console.error(
      `  🟠 ${foreign.length} 份**別人認領、⛔ 這一支沒宣告**:\n${listOwned(foreign)}\n` +
        `     ⇒ 認領者若有**作者** ⇒ 這一支在覆蓋別人的產物，或它該把這幾份加進自己的 writes\n` +
        `     ⇒ 認領者**全是正規化器** ⇒ 那幾份是**手編來源**（沒有作者）——\n` +
        `        ⛔ 不要把它們加進 writes（隔離區會把它們鎖成 444，＝ GH#707 擋掉三條 lane 的形狀）；\n` +
        `        ⭐ 要問的是「這一支對它們是不是也該登記成正規化器（normalizers.json）」\n`,
    );
  console.error(
    `  ⇒ 修的是**宣告**，⛔ 不是在寫入端補一把自解鎖的鑰匙（那是 #771 記著的「治症狀」）：\n` +
      `     ① 在寫入端的原始碼檔頭加 \`// ggd:writes <glob>\`（\`merge-io.mjs\` 會收割，單一住處）\n` +
      `     ② 或重量測 sync-io（trace.mjs 兩趟 → merge-io.mjs）\n` +
      `     ⛔ 不可以手寫 sync-io.json 的 steps —— 手寫的表會過期而且不會有東西紅。\n` +
      `  逃生口 GGD_RECONCILE_OFF=1（用了要在 commit 訊息裡說為什麼）。\n`,
  );
  process.exit(1);
}
