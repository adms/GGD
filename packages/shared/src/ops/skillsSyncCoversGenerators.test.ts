/**
 * skillsSyncCoversGenerators.test.ts —— ⭐ **聚合指令自己不可以過期。**
 *
 * owner 2026-08-20：
 *
 * > 「每一次更動技能相關機制或內容，要整理所有相關技能 —— 包含球體綁定位置、
 * >  特效 pitch/scale/color/透明度、特效音效綁定、五級距、說明↔實際實作 JSON ——
 * >  都請整理更新到 **JSON** 並讓 **script 動態更新**所有相關文件與 codex 編輯器契約文件、
 * >  後台設定參數與介面更新等，**避免資訊不同步造成的錯誤**」
 *
 * ⇒ `pnpm skills:sync` / `pnpm skills:check` 就是那條指令。
 *
 * ⚠️ 但**聚合指令本身是一個新的單點失效**：這個 repo 已經有 **14 支**新鮮度守衛，
 * 有人加第 15 支而忘了接進 `skills:check`，那支就悄悄地不在「一次跑完」的範圍內 ——
 * 而且**沒有任何東西會紅**（正是元規則說的「判準 0/4 全破」的形狀）。
 *
 * ⇒ 這一條把它關起來：**package.json 裡每一支 `*:check` 都必須**
 * 要嘛在 `skills:check` 裡，要嘛在下面的豁免表裡**帶著理由**。
 * 加一支新的產生器而不做選擇 → 紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * 豁免 = 「這支的產出**不可能**因為技能／特效／級距／卡面說明的改動而變」。
 * ⛔ 理由要具體到能被反駁；⛔ 不接受「跟技能無關」這種同義反覆。
 */
/**
 * **純守衛**：這幾支 `*:check` 沒有產物，所以「重生成」對它們沒有意義。
 * ⚠️ 與上面的 `EXEMPT` 不同 —— 那些是「不會因為技能改動而過期」，
 * 這些是「**過期**這個概念對它們不成立」。兩種都要寫得出理由。
 */
const NO_ARTIFACT: Record<string, string> = {
  roster: "英雄上下架的純守衛 —— 它驗一致性,⛔ 沒有任何檔案是它寫的",
  models:
    "GH#540 殘留屍體的**反向閘**：帶 gore geoset 卻沒宣告 `hiddenPrimitives` 的就紅。" +
    "⛔ 刻意沒有 build —— 填哪幾個圖元要人看過那顆模型再決定,而**藏錯比屍體更嚴重**" +
    "(藏掉一塊身體 = 英雄缺一角,而且畫面上不會有任何錯誤)。" +
    "⭐ 自動填的那一版會把「幾何很像屍體」直接當成「就是屍體」—— 那正是這條閘的反面。",
};

/**
 * ⭐⭐ 2026-08-23 —— 上面那條閘**自己有一個洞**:它列舉的是 `*:check` **腳本名**。
 *
 * ⇒ 一支**連腳本都沒有**的產生器對它是**不存在的**。量到的實例:
 * `tools/ability-templates/` 三支 python 產出 `docs/ability-templates.{csv,md}`
 * （模板總類表,owner 點名要更新的那一份），`grep '"[a-z]+:[a-z]+".*template' package.json`
 * → **0 筆**。⇒ 它從 2026-07-25 起漂了一個月:654 份技能剩 413 份,而產物停在舊的那一天,
 * ⛔ 沒有任何東西會紅。
 *
 * ⇒ 下面這一條從**產物**那一端問同一個問題:
 * 「有沒有一支 tools/ 底下的程式在寫 git 追蹤的 `docs/` 或 `content/` 檔,
 *   而它的目錄**完全不在**聚合指令的視野裡?」
 *
 * ⚠️ ⛔ 不可以誤報 —— 一條會誤報的閘會被人放寬。所以偵測是**保守**的:
 *   · 路徑字面值要**真的**對得上一個 git 追蹤的檔或目錄（⛔ 不是任何看起來像路徑的字串）
 *   · 同一行要有**寫入**呼叫,或這一行把路徑綁到一個名字而那個名字出現在寫入呼叫裡
 *   · python 的 `open()` 要真的帶 `"w"`/`"a"` 模式（⛔ 否則 `DictReader(open(…))` 會被誤判）
 *   · 一次性的報告落點（`docs/_reports/` · `docs/_daily/` · 任何 `_temp_`）不算產物
 * 2026-08-23 實測:21 個產生器目錄、11 個沒被涵蓋,逐支分類後 6 支進豁免、2 支補了腳本。
 */
const GENERATOR_NO_CHECK: Record<string, string> = {
  "bgm-gen": "產物是**渲染出來的音樂**與它的 MANIFEST —— 輸入是取樣器與曲式,技能改動不會動到任何一個位元組",
  "icon-gen": "產物是**圖示點陣圖**（本機擴散模型跑出來的 PNG）。它的可審查那一半是提示詞常數,而那一半已經有 `iconstyle:check`",
  "item-csv": "owner 的 CSV **往返編輯**流程（export → 他填三欄 → import）。⛔ `items.csv` 不在 repo 裡,沒有一份會過期的產物",
  "champion-csv": "同 `item-csv` —— `champions.csv` 是 owner 的編輯載體,⛔ 不是 repo 裡的產物",
  "augment-csv": "同 `item-csv` —— 增益卡的 CSV 往返,⛔ 沒有一份被 commit 的產物會過期",
  "voice-gen": "`index-lines.mjs` 索引的是**已經錄好的語音檔** —— MANIFEST 隨音檔增減而變,⛔ 不隨技能數值或說明變",
  "legendary-status": "一份**當時做到哪**的進度報告,⛔ 逐位元組比對對它不成立（它本來就該停在寫下的那一天）",
  "ttk-sim": "產物是**實驗報告**（`docs/_ttk-retune.md` / `_ttk-experiment-153.md`）—— 它記的是那一次掃描的結果,重跑本來就會不一樣",
  "deploy-timing":
    "⭐ 產物是**計時帳本**（`docs/_data/deploy-timings.json`）—— 它記的是「這一次跑了幾秒」，" +
    "⛔ 逐位元組比對對它不成立（同一份程式碼重跑本來就會是不同的秒數）。" +
    "它與 `ttk-sim` 同一類：**量測紀錄**，⛔ 不是從內容推導出來的產物。" +
    "⚠️ 它真正該有的閘是「**不可以有第二份帳本**」，而那一條住 `shipGateScript.test.ts`" +
    "（`ship.mjs` 必須 import 這一支的 `appendStage`，⛔ 不可以自己寫檔）——" +
    "我第一版真的開了第二份同名不同義的，那條守衛就是為此而立。",
  "vfx-census": "⭐ 它**自己的檔頭**逐字寫著「⛔ 這不是新鮮度閘，⛔ 沒有 `--check`：它是一份會隨內容成長的普查」—— 理由已經被寫下並且可以被反駁",
  // ⚠️ ⛔ 這一列**不是**豁免,是一個**量到的洞** —— 留在這裡是為了它有名字,⛔ 不是為了它沒事。
  "hero-archetypes":
    "⛔ **真的洞（待補 `--check`）**:`archetypes:build` 在 `skills:sync` 裡、寫 `docs/hero-archetypes.json` 與 " +
    "`docs/英雄定位與屬性總表.md`,而 `build.ts` **沒有 `--check` 模式** ⇒ 產物過期不會紅。" +
    "補它要改 `tools/hero-archetypes/build.ts`（2026-08-23 P4 lane 的檔案柵欄外）。",
};

const EXEMPT: Record<string, string> = {
  "voxel:check": "體素**角色身體**產生器 —— 讀的是英雄外觀，不讀 abilities/vfx/級距",
  "voxel:build:check": "同上，只是驗產物",
  "scenery:check": "競技場**道具散佈** —— 讀 arena 幾何，不讀技能",
  "todo:check": "掃原始碼裡的 TODO 註解，與內容無關",
  "docs:status:test": "這是那支產生器**自己的單元測試**，不是新鮮度閘",
  "iconstyle:check": "圖示的**美術指導**快照 —— 讀 icon-gen 的提示詞常數，不讀 abilities/vfx/級距",
  "legacyindex:check": "掃 legacy 資料夾裡**有哪些檔** —— 檔案搬家才會變，技能改動不會",
  "scenerycc0:check": "把 CC0 資產的 bbox 最低點推到 y=0 —— 讀 GLB 位元組，不讀技能",
  "map:check": "競技場**幾何**產生器 —— 讀地圖模板與圖論規則，不讀 abilities/vfx/級距",
  "budget:check": "模型多邊形**預算**閘 —— 它不是新鮮度閘（超標才紅，不是過期才紅）",
  // ⭐ GH#621 —— `ship:check` 是**聚合指令自己**（它跑 content:build + skills:sync
  // + skills:check + typecheck + 每一包 vitest）。把它放進 `skills:check` 會變成
  // ⛔ **無窮遞迴**（skills:check → ship:check → skills:check）。
  // 它自己的閘是 `shipGateScript.test.ts`（驗「每一包 vitest 都在裡面」等三個關係）。
  "ship:check": "**出貨聚合指令本身** —— 它*跑* skills:check，放進去會遞迴；它自己的閘是 shipGateScript.test.ts",
};

/**
 * ⭐ #467 —— **root 以外的 package.json 也要掃**。
 *
 * ⚠️ 這一支在 2026-08-20 之前只讀 root，於是一支藏在子專案裡的 `*:check`
 * （`tools/anime-arena-map` 的 `map:check`）對這條閘是**不存在的** —— 而
 * 「產生器對聚合指令不可見」正是 `tools/w3x-import` 那兩支能互相打架三個月的機制。
 * ⛔ 一個只看得到一半的閘，紅不起來的那一半才是它要防的東西。
 *
 * ⚠️ 鍵名相同時以 root 為準（`caps:check` 兩邊都有，聚合指令引用的是 root 那一支）。
 */
function scripts(): Record<string, string> {
  const read = (p: string) => (JSON.parse(readFileSync(p, "utf8")).scripts ?? {}) as Record<string, string>;
  const paths = pkgJsonPaths();
  const all: Record<string, string> = {};
  for (const p of paths.filter((p) => p !== "package.json")) Object.assign(all, read(join(REPO, p)));
  return { ...all, ...read(join(REPO, "package.json")) };
}

const ls = (args: string[]) =>
  execFileSync("git", ["ls-files", ...args], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter((p) => p && !p.includes("node_modules"));
const pkgJsonPaths = () => ls(["package.json", "**/package.json"]);

/**
 * 每個腳本名住在**哪幾份** package.json。
 * ⚠️ 一定要是多對一:`voxel:check` 在 root 與 `tools/voxel-gen/package.json` **各有一份**
 * （root 那一支只是 `pnpm --filter` 轉發）。只留最後一份的話,`tools/voxel-gen/` 就變成
 * 「零腳本」而被誤報 —— 而誤報會讓人去放寬這條閘。
 */
function scriptHomes(): Record<string, string[]> {
  const homes: Record<string, string[]> = {};
  for (const p of pkgJsonPaths()) {
    for (const k of Object.keys(JSON.parse(readFileSync(join(REPO, p), "utf8")).scripts ?? {})) {
      homes[k] = [...(homes[k] ?? []), p];
    }
  }
  return homes;
}

/** `tools/<dir>` → 它寫出去的 git 追蹤產物（保守偵測，見 {@link GENERATOR_NO_CHECK} 的檔頭）。 */
function generatorDirs(): Map<string, string[]> {
  const tracked = ls(["docs", "content"]);
  const trackedFiles = new Set(tracked);
  const known = new Set(tracked);
  for (const f of tracked) {
    const seg = f.split("/");
    for (let i = 1; i < seg.length; i++) known.add(seg.slice(0, i).join("/"));
  }
  const WRITE =
    /open\([^)]*["'][wa]\+?b?["']|write_text\(|write_bytes\(|writeFileSync|DictWriter|writeFile\(|mkdirSync|makedirs\(/;
  const LIT = /["'`]([A-Za-z0-9_./*+-]*)["'`]/g;
  /**
   * 一行裡所有**串得起來**的 docs//content/ 路徑。
   * ⚠️ 一定要串:出貨的產生器有兩種寫法，而只認第一種的偵測**看不到第二種** ——
   *   `ROOT / "docs/x.csv"`            ← 一個字面值
   *   `ROOT / "docs" / "x.csv"`        ← 三個字面值（`join(REPO, "docs", "x.csv")` 同理）
   * 2026-08-23 實測:只認第一種時，這支閘對它自己剛剛接上的 `tools/ability-templates/gen.py`
   * 是**瞎的**（突變沒紅）。⛔ 一個只看得到一半的閘，紅不起來的那一半才是它要防的東西。
   */
  const pathsOn = (line: string, known: ReadonlySet<string>): string[] => {
    const lits = [...line.matchAll(LIT)].map((m) => m[1]!.replace(/^(\.\.\/)+/, ""));
    const found: string[] = [];
    for (let i = 0; i < lits.length; i++) {
      if (!/^(docs|content)(\/|$)/.test(lits[i]!)) continue;
      let acc = lits[i]!;
      for (let j = i; j < lits.length; j++) {
        if (j > i) acc += `/${lits[j]}`;
        if (known.has(acc)) found.push(acc);
      }
    }
    return found;
  };
  const out = new Map<string, string[]>();
  for (const f of ls(["tools"])) {
    if (!/\.(py|ts|tsx|mjs)$/.test(f) || f.includes("/out/") || /\.test\./.test(f)) continue;
    const text = readFileSync(join(REPO, f), "utf8");
    if (!WRITE.test(text)) continue;
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      for (const p of pathsOn(line, known)) {
        // ⛔ 一次性的報告落點不是產物（CLAUDE.md 的 `_temp_` 命名慣例就是為了這個）
        if (/_temp_|^docs\/(_reports|_daily)\//.test(p)) continue;
        // ⭐ 指名一份**追蹤中的檔** + 這支檔案有寫入呼叫 ⇒ 它是那份產物的產生器。
        //    ⚠️ 這一格是必要的:出貨的產生器多半把落點寫成一個模組級常數,再在別的地方
        //    透過**別的名字**（迴圈變數、dict 的鍵）寫出去 —— 逐行追名字追不到它。
        let writes = trackedFiles.has(p);
        if (!writes) writes = WRITE.test(line);
        if (!writes) {
          const bind = line.match(/^\s*(?:export\s+)?(?:const|let|var)?\s*([A-Za-z_]\w*)\s*[:=]/);
          if (bind) {
            const use = new RegExp(
              `(?:open|writeFileSync|writeFile|mkdirSync)\\(\\s*${bind[1]}\\b|${bind[1]}\\.(?:write_text|open|write)\\(`,
            );
            writes = lines.some((l, j) => j !== i && use.test(l));
          }
        }
        if (writes) {
          const dir = f.split("/")[1]!;
          out.set(dir, [...(out.get(dir) ?? []), `${f} → ${p}`]);
        }
      }
    }
  }
  return out;
}

describe("skills:sync / skills:check 涵蓋所有產生器", () => {
  it("每一支 *:check 不是被 skills:check 跑到,就是帶著理由被豁免", () => {
    cover("skills-sync-covers");
    const s = scripts();
    const aggregate = s["skills:check"] ?? "";
    expect(aggregate, "skills:check 不見了").toBeTruthy();

    const missing = Object.keys(s)
      .filter((k) => k.endsWith(":check") && k !== "skills:check")
      .filter((k) => !aggregate.includes(k) && !(k in EXEMPT));

    expect(
      missing,
      `這幾支產生器沒有被 skills:check 跑到,也沒有豁免理由:\n  ${missing.join("\n  ")}\n` +
        `→ 把它加進 package.json 的 skills:check,或在 EXEMPT 裡寫下為什麼它不會過期。`,
    ).toEqual([]);
  });

  it("skills:sync 對每一個被 skills:check 驗的東西都有重生成的辦法", () => {
    const s = scripts();
    // ⭐ 只驗「有沒有對應的重生成路徑」,⛔ 不驗指令字串長什麼樣(那會變成第二個住處)
    const aggregate = s["skills:check"] ?? "";
    const checked = Object.keys(s).filter(
      // ⚠️ 一定要先篩 `:check` —— `skills:check` 的字串裡含有 "docs:readme:check",
      // 而 "docs:readme" 是它的**子字串**,少了這一道 `docs:readme` 自己會被當成一支 check。
      (k) => k.endsWith(":check") && k !== "skills:check" && aggregate.includes(k),
    );
    const unbuildable = checked.filter((k) => {
      const base = k.slice(0, -":check".length);
      // ⭐ 純守衛(沒有產物,所以沒有「重生成」這回事)。⛔ 這裡是**帶理由的表**,
      //    ⛔ 不是一串 `if (base === "…")` —— 一個沒有理由的例外過幾個月就沒有人敢動它。
      if (base in NO_ARTIFACT) return false;
      /**
       * ⭐ `:write` 是第三種合法的「重生成辦法」，⛔ 而它與 `:build` 的差別是**語意的**：
       *
       * | | |
       * |---|---|
       * | `:build` / `:export` | **重生成** —— 同樣的輸入必得同樣的輸出 ⇒ 進得了 `skills:sync` |
       * | `:write` | **提案** —— 它替人做一個判斷 ⇒ ⛔ **不可以**進 `skills:sync` |
       *
       * ⚠️ 前例 `beam:write`：它從幾何推「哪一軸是長軸」，而 `imported.tectonicfury`
       * 的 bbox 與偏心**指向不同的軸** ⇒ 那一支它刻意不提案並要求人去看。
       * 把它丟進 `skills:sync` 等於讓產生器替內容做設計決定。
       *
       * ⇒ 這條閘要的是「**紅了跑什麼**」，而 `pnpm beam:write` 就是答案 ——
       * ⛔ 它只是不能自動跑。
       */
      return !(base in s || `${base}:build` in s || `${base}:export` in s || `${base}:write` in s);
    });
    expect(
      unbuildable,
      `這幾支驗得到卻**重生成不了** —— 閘紅了沒有人知道要跑什麼:\n  ${unbuildable.join("\n  ")}`,
    ).toEqual([]);
  });

  // ⭐⭐ 上面兩條看的是**腳本名**;這一條從**產物**那一端看,補的是「連腳本都沒有的產生器」那個洞。
  it("每一支寫 docs/ 或 content/ 產物的產生器,目錄都在聚合指令的視野裡", () => {
    const s = scripts();
    const homes = scriptHomes();
    const aggregate = s["skills:check"] ?? "";
    const gens = generatorDirs();
    expect(gens.size, "產生器掃描回空的 —— 偵測壞了,⛔ 不是真的沒有產生器").toBeGreaterThan(10);

    const blind = [...gens.keys()].sort().filter((dir) => {
      if (dir in GENERATOR_NO_CHECK) return false;
      const refs = Object.entries(s)
        .filter(([k, v]) => v.includes(`tools/${dir}/`) || (homes[k] ?? []).includes(`tools/${dir}/package.json`))
        .map(([k]) => k);
      // ⭐ 「在視野裡」= 有一支 `*:check` 被 skills:check 跑到,或那一支已經帶著理由被豁免。
      return !refs.some((k) => k.endsWith(":check") && (aggregate.includes(k) || k in EXEMPT));
    });

    expect(
      blind,
      `這幾個目錄在寫 git 追蹤的產物,卻**沒有任何 `+"`*:check`"+` 在聚合指令裡看得到它們:\n` +
        blind.map((d) => `  tools/${d}/  ← ${gens.get(d)![0]}`).join("\n") +
        `\n→ 給它一支 *:build/*:check 並接進 package.json 的 skills:sync / skills:check,` +
        `\n  或在 GENERATOR_NO_CHECK 裡寫下**為什麼它的產物不會過期**（要能被反駁）。`,
    ).toEqual([]);
  });
});
