#!/usr/bin/env -S npx tsx
/**
 * 🔬 **欄位級擁有權的量測器**（GH#827 / GH#815 的更細一層）。
 *
 * ── 它回答什麼 ────────────────────────────────────────────────────────────
 * `sync-io.json` 的粒度是**檔**：`content/config/vfx-families.json` 整份掛在
 * `vfxfam:build` 名下 ⇒ genguard 對整份回 AUTHOR、隔離區把整份 chmod 444。
 * ⛔ 而那不是真的 —— 那支產生器**逐格保留**一整族欄位（`sound*` / `groundDecal` /
 * 後台旋鈕…），⇒ 那幾欄**沒有任何合法寫入端**：產生器不寫它們、手改被 genguard 擋、
 * 後台被 444 擋。⭐ 那是**欄位級的孤兒**，而三個閘一起是綠的（「兩條對的守衛，組合是空的」）。
 *
 * ── ⭐ 它為什麼不是一張手抄的豁免表 ───────────────────────────────────────
 * CLAUDE.md 逐字：擁有者表是**量出來的**。⇒ 這一支**呼叫產生器自己**用來推導
 * 「我擁有哪幾格」的那組函式（`shippedFamilyConfig({})` / `ownedFamilyFields()` /
 * `ownedAbilityFields()`），
 * 產生器多算一格少算一格，這裡自動跟著走。`field-probes.json` 只登記**去哪裡問**。
 *
 * ⚠️ 產出**刻意只記「產生器擁有哪幾欄」** —— ⛔ 不記「出貨檔裡有哪幾欄」：
 * 後者會隨內容改動而變 ⇒ `--check` 會因為別人編一份內容而紅（＝ 時鐘欄位那個病，
 * 而一條會亂紅的閘會被放寬，放寬過的閘等於沒有閘）。「今天實際有幾格孤兒」是
 * **當場算**的（`product-quarantine.sh --doctor` ④）。
 *
 * ```bash
 * node_modules/.bin/tsx tools/parallel-gates/field-io.mts           # 重新量測並寫檔
 * node_modules/.bin/tsx tools/parallel-gates/field-io.mts --check   # 唯讀；過期回非零
 * ```
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const PROBES = join(HERE, "field-probes.json");
const OUT = join(HERE, "field-io.json");

type Probe = {
  path: string;
  fileOwner: string;
  recipe: string;
  module: string;
  why: string;
  fieldAuthors: Record<string, string>;
};

/**
 * ⭐ 一個 recipe = 一族產生器（第零守則⑨：N 個同型＝K 個模板）。
 * ⛔ 刻意**不**用 eval 一段設定字串 —— 那會把「怎麼問」也變成資料，而它的錯只有
 * 執行到才看得見。每一支 recipe 都要指名它呼叫了產生器的哪幾個 export。
 */
const RECIPES: Record<string, (m: Record<string, unknown>) => Record<string, string[]>> = {
  // vfxfam:build —— 與 `generateFamilyContent.test.ts:82-83` 呼叫**同一組**函式。
  "vfx-families": (m) => {
    const shipped = m.shippedFamilyConfig as (e: Record<string, unknown>) => Record<string, unknown>;
    // ⭐⭐ GH#835（2026-08-29）：所有權從**產出**推導改成從**投影**推導，兩支
    //   零參數的 export 取代了舊的 `ownedRowFields(rows)`。⛔ 這裡沒跟著改 ⇒ recipe
    //   在**每一次正確的 checkout 上**擲「產生器少了 export」＝ 一個永遠不會綠的閘
    //   （CLAUDE.md 第二守則⑨）。⭐ 更新引用時要走完它原本要走的那條路 —— 見下面
    //   `abilities[*]` 那一段：舊的碎片化前提也跟著消失了。
    const ownedFamilyFields = m.ownedFamilyFields as () => ReadonlySet<string>;
    const ownedAbilityFields = m.ownedAbilityFields as () => ReadonlySet<string>;
    for (const [n, f] of Object.entries({ shipped, ownedFamilyFields, ownedAbilityFields })) {
      if (typeof f !== "function") throw new Error(`產生器少了 export ${n} —— recipe 對不上它了`);
    }
    // ⭐⭐ **校準：已知有的要量得到**（CLAUDE.md：單邊校準的尺會在最需要說話時沉默）。
    //   一個空的 owned 集合會讓消費端說「這一節每一欄都自由」—— ⛔ 那是**危險的那個方向**
    //   （放行一個該擋的）。⇒ 量到空的一律當成**量壞了**，⛔ 不是當成事實。
    // ⭐ `abilities[*]` 現在量得到了：舊版的 owned 是 `ownedRowFields(abilityArtRows())`
    //   ＝**這一輪產出的欄位聯集**，於是 `abilityArtRows()` 回 0 列時 owned = ∅ ⇒ 量尺瞎掉
    //   ⇒ 當時的正解是「量不到就不宣稱」。⭐ 而 GH#835 把分母換成 `ABILITY_MIRROR` 的鍵
    //   （一張**與資料多寡無關**的投影表）⇒ 那個前提沒有了，⛔ 不必再留白。
    const out: Record<string, string[]> = {
      $top: Object.keys(shipped({})).sort(),
      "families[*]": [...ownedFamilyFields()].sort(),
      "abilities[*]": [...ownedAbilityFields()].sort(),
    };
    for (const [k, v] of Object.entries(out)) {
      if (v.length === 0) throw new Error(`⛔ ${k} 量到 0 個產生器擁有的欄位 —— 這把尺壞了,⛔ 不是「它什麼都不擁有」`);
    }
    return out;
  },
};

async function measure(): Promise<string> {
  const cfg = JSON.parse(readFileSync(PROBES, "utf8")) as { probes: Probe[] };
  const files = [];
  for (const p of cfg.probes) {
    const recipe = RECIPES[p.recipe];
    if (!recipe) throw new Error(`⛔ 沒有叫 '${p.recipe}' 的 recipe —— 有的: ${Object.keys(RECIPES).join(" · ")}`);
    const mod = (await import(pathToFileURL(join(REPO, p.module)).href)) as Record<string, unknown>;
    files.push({ path: p.path, fileOwner: p.fileOwner, recipe: p.recipe, module: p.module, owned: recipe(mod) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return `${JSON.stringify(
    {
      note:
        "⭐ 量出來的（field-io.mts 呼叫產生器自己的推導函式）—— ⛔ 不要手改。" +
        "重量測: node_modules/.bin/tsx tools/parallel-gates/field-io.mts",
      files,
    },
    null,
    2,
  )}\n`;
}

const want = await measure();
if (process.argv.includes("--check")) {
  let have = "";
  try {
    have = readFileSync(OUT, "utf8");
  } catch {
    /* 不存在 ⇒ 下面逐位元組比對會紅並指名 */
  }
  if (have !== want) {
    process.stderr.write(
      "⛔ tools/parallel-gates/field-io.json 過期 —— 產生器擁有的欄位變了。\n" +
        "   ⇒ node_modules/.bin/tsx tools/parallel-gates/field-io.mts   然後 git add 它。\n" +
        "   ⚠️ 順便看一眼 field-probes.json 的 fieldAuthors：新出現的『產生器不擁有』欄位\n" +
        "      如果沒有人認領，`product-quarantine.sh --doctor` ④ 會把它算成欄位級孤兒。\n",
    );
    process.exit(1);
  }
  process.stdout.write("✓ field-io.json 是最新的\n");
} else {
  writeFileSync(OUT, want, "utf8");
  process.stdout.write(`⭐ 寫了 ${OUT}\n`);
}
