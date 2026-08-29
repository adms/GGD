/**
 * 📐 90支技能重製對照（dataset: skill90）—— owner 規格 ↔ 出貨 JSON，實時比對。
 *
 * 來源（第〇·四守則：值只有一個住處，這裡**零重算**、零手抄）：
 *   · 規格側：`tools/skill-remake/`（batch1.py 的 `T` 表 —— owner 逐字規格 +
 *     結構化欄位）。⛔ 不 parse `docs/英雄技能第一批重製-90支.md`（那是 md 產物）。
 *     spawn python3 就地 import batch1 並跑 `build(e)` —— 與 `emit_spec_md.py`
 *     同一個讀法：只 import、不呼叫 main()，**一個檔案都不寫**。
 *   · 出貨側：`content/abilities/<id>.json` 的**現值**（工作區）。
 *
 * drift 規則與 `batch1.py --check` 同一條：逐 top-level key 深比對，
 * ⛔ `castTimeSec` 不比（它由後處理器 deriveCastTimes.ts 蓋上去，比了每次乾跑都紅）。
 * 深比對是 key 排序後的 canonical stringify —— dict 等值但 key 順序不同不算 drift
 * （與 --check 的 python dict `!=` 語意一致）。
 */
import { execFile } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * ⚠️ **對照表那兩欄仍然是唯讀的，而且理由沒有變**（GH#821 的原始豁免，逐字留著）：
 * 規格側的家是 `tools/skill-remake/` 的 `A(...)` 表（**python**，共用寫入端只吃
 * JSON pointer ⇒ 結構上寫不到）；出貨側那 90 份是 `skillremake:json` 的產物
 * （實測 `bash scripts/genguard.sh content/abilities/godie-e002.q.json` → exit 1，
 * 指名 skillremake:json）⇒ 寫入端每一次都會 409。
 * ⛔ 所以這一頁**不**在那 90 份上長 ✏️ —— 一排存不進去的按鈕比唯讀更糟
 * （壞掉跟正常長得一模一樣）。
 */
const DRIFT_SIDES_READONLY_WHY =
  "對照表的兩欄仍唯讀：規格側住 tools/skill-remake/*.py（共用寫入端只吃 JSON），" +
  "出貨側那 90 份是 skillremake:json 的產物（genguard 409）。⛔ 兩側都不是資料儲存的家。";

/**
 * ⭐ GH#832 寫入宣告 —— 走共用寫入端 POST /__live/skill90/save。
 *
 * **這是對上面那句豁免的反駁，而它是量到的**：豁免自己寫著「反駁法：指出一格
 * target 過得了 genguard **且**不在 batch1.py 的權威範圍」。
 * 冷卻／施法距離**五級距表**正是那一格 ——
 *   ① genguard ✓（`content/config/{cooldown,range}-tiers.json` 沒有產生器擁有者）
 *   ② ⛔ 不在 batch1.py 的權威範圍：`tierize.py::Grids` 只是**讀**它們；
 *      技能文件裡存的是**級別名**（`cooldownTier` / `rangeTier`），秒數與距離
 *      在載入時才由 `resolveCooldownTier` / `resolveRangeTier` 查表（第〇·四守則）
 *   ③ 而它真的是這一頁那兩欄的家 —— 90 支裡有幾支從這兩張表解析，
 *      `build()` 每次**現算**（`tiers.cooldown.skills` / `tiers.range.skills`）。
 *      ⛔ 這裡刻意不寫那兩個數字：一句被散文守著的統計會活過它的保存期限
 * ⇒ 改一格，這一頁上落在那一格的每一支技能同時跟著變。
 *
 * ⛔ **耗魔級距刻意不開**：`MANA_TIER_MAX` 是 `Math.floor(medianFinalMana(...))`
 * ——一個**算出來的**上界，這裡宣告任何數字都會是第二個住處而且會無聲過期
 * （＝ ex-roots `offerCount max:6` 那個缺陷的形狀）。要開它得先讓上界讀得到。
 *
 * ⚠️ 誠實聲明（與 ex-roots 同一條）：後台設定頁存的是 `data/` 的**耐久覆蓋層**，
 * 而覆蓋層會蓋掉 `content/config/*.json`。線上存過一次之後，這裡改檔案不會生效。
 */
const TIER_BOUNDS = {
  cooldown: {
    path: "content/config/cooldown-tiers.json",
    src: "packages/shared/src/content/cooldownTiers.ts",
    min: { name: "COOLDOWN_TIER_MIN", value: 1 },
    max: { name: "COOLDOWN_TIER_MAX", value: 600 },
  },
  range: {
    path: "content/config/range-tiers.json",
    src: "packages/shared/src/content/rangeTiers.ts",
    min: { name: "RANGE_TIER_MIN", value: 0.5 },
    max: { name: "RANGE_TIER_MAX", value: 24 },
  },
};

/** 出貨 schema 的常數檔裡那一行 —— 讀不到就回 null（呼叫端要**大聲**失敗，⛔ 不放行）。 */
function shippedBound(repoRoot, axis, which) {
  const b = TIER_BOUNDS[axis];
  try {
    const src = readFileSync(join(repoRoot, b.src), "utf8");
    const m = new RegExp(`export const ${b[which].name} = (-?[0-9]+(?:\\.[0-9]+)?);`).exec(src);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * 兩條驗證，兩條都是**關係**（⛔ 不是「這個數字合不合法」，那一層宣告式規格已經做了）：
 *   ① 這裡宣告的上下界要**等於出貨 schema 的常數** —— 對不上就不給存並指名兩邊。
 *      ⚠️ 這一條專治 ex-roots 那個缺陷：後台存得下、內容驗證拒收。
 *   ② 存進去之後那一列五格仍要**單調不減** —— 梯子倒過來的話，填了大一級的技能
 *      會拿到比小一級還便宜的值，而卡片、schema、測試全部正常。
 */
function tierCheck(axis) {
  const b = TIER_BOUNDS[axis];
  return (repoRoot, { path, pointer, value }) => {
    for (const which of ["min", "max"]) {
      const real = shippedBound(repoRoot, axis, which);
      if (real === null)
        return `讀不到 ${b[which].name}（${b.src}）—— 上下界無從比對，這一格先不給存。⚠️ 常數若改成運算式，這裡要改成讀得到它的寫法。`;
      if (real !== b[which].value)
        return `上下界對不上出貨 schema：datasets/skill90.mjs 宣告 ${which}=${b[which].value}，而 ${b[which].name}=${real}（${b.src}）—— 先把宣告改成**窄的那個**再存。`;
    }
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
    } catch (err) {
      return `讀不到 ${path}：${String(err)}`;
    }
    const segs = pointer.split("/").filter((s) => s !== "");
    let row = doc;
    for (const s of segs.slice(0, -1)) row = row === null || row === undefined ? row : row[s];
    if (row === null || typeof row !== "object") return `${pointer} 的上一層不是物件（${path}）`;
    const names = Object.keys(row);
    const next = names.map((n) => (n === segs[segs.length - 1] ? Number(value) : Number(row[n])));
    for (let i = 1; i < next.length; i += 1)
      if (next[i] < next[i - 1])
        return `存了之後級距不再單調遞增：${names.map((n, j) => `${n}=${next[j]}`).join(" → ")}。⛔ 梯子倒過來 = 填大一級的技能拿到比小一級便宜的值，而卡片與測試全綠。`;
    return null;
  };
}

export const write = {
  kind: "source",
  rules: [
    {
      paths: [TIER_BOUNDS.cooldown.path],
      pointers: ["/seconds/*/*"],
      value: { type: "number", min: TIER_BOUNDS.cooldown.min.value, max: TIER_BOUNDS.cooldown.max.value },
      why: "冷卻五級距的一格**卡面秒**（config.cooldown-tiers@1；填 cooldownTier 的技能從這裡解析）",
      check: tierCheck("cooldown"),
    },
    {
      paths: [TIER_BOUNDS.range.path],
      pointers: ["/range/*"],
      value: { type: "number", min: TIER_BOUNDS.range.min.value, max: TIER_BOUNDS.range.max.value },
      why: "施法距離五級距的一格（config.range-tiers@1；填 rangeTier 的技能從這裡解析）",
      check: tierCheck("range"),
    },
  ],
};

/** 這個 dataset 讀哪些檔 —— 誠實列（漏列＝變回靜態內容）。
 *  build() 實際讀的面：
 *   · tools/skill-remake/ 的每一支 .py（含 heroes/ 分片）
 *   · content/abilities/*.json（產生器讀 prev 沿用欄位；本 dataset 讀出貨現值）
 *   · content/champions/*.json（common.py 讀 transform 連結）
 *   · content/ability-templates/*.json（tpl preset 展開）
 *   · content/projectiles/*.json（cosmetic_projectile → vfxKey）
 *   · .git/HEAD + .git/index（slot_suffix 讀 **git HEAD** 的出貨槽位 —— commit /
 *     stage 會動這兩個檔的 mtime，是「git 狀態變了」最便宜的代理值）
 *  目錄本身的 mtime 抓不到「檔案內容原地改」，所以這裡逐檔展開。 */
export function deps(repoRoot) {
  const files = [];
  const dir = (rel, filter) => {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) return files.push(rel); // absent 也是一種狀態
    files.push(rel); // 目錄 mtime：抓新增/刪除
    for (const f of readdirSync(abs)) if (filter(f)) files.push(`${rel}/${f}`);
  };
  dir("tools/skill-remake", (f) => f.endsWith(".py"));
  dir("tools/skill-remake/heroes", (f) => f.endsWith(".py"));
  dir("content/abilities", (f) => f.endsWith(".json"));
  dir("content/champions", (f) => f.endsWith(".json"));
  dir("content/ability-templates", (f) => f.endsWith(".json"));
  dir("content/projectiles", (f) => f.endsWith(".json"));
  // ⭐ GH#832 —— 可編輯的那兩張級距表。⚠️ **漏列它們＝存完看不到新值**：
  //   checksum 快取的 key 只認 deps 的 bytes，沒進 deps 的檔改了也還是 hit
  //   ⇒ ✏️ 存成功、頁面重抓、畫面上還是舊數字（LiveEditCell 的契約逐字寫著
  //   「驗的是**重讀後的值**」）。這兩行是這一批最承重的接線。
  files.push(TIER_BOUNDS.cooldown.path, TIER_BOUNDS.range.path);
  files.push(".git/HEAD", ".git/index");
  return files;
}

/** key 排序後的 canonical stringify —— 讓「dict 等值但 key 順序不同」不算 drift。 */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v !== null && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

const PY_DUMP = `
import importlib.util, json, os, sys
root = sys.argv[1]
here = os.path.join(root, "tools", "skill-remake")
spec = importlib.util.spec_from_file_location("batch1", os.path.join(here, "batch1.py"))
b = importlib.util.module_from_spec(spec)
sys.modules["batch1"] = b
spec.loader.exec_module(b)   # 只 import：A(...) 填表、load_heroes() 跑閘，不寫檔
rows = []
for e in b.T:
    cid, slot, d = b.build(e)
    rows.append({
        "num": e["num"], "name": e["name"], "cid": cid, "slot": slot, "id": d["id"],
        "spec": {k: e[k] for k in ("cast", "cd", "mp", "rng", "maxRank", "radiusTier", "desc") if k in e},
        "gen": d,
    })
json.dump({"rows": rows, "hero": b.HERO}, sys.stdout, ensure_ascii=False)
`;

function runPython(repoRoot) {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      ["-c", PY_DUMP, repoRoot],
      { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`python3 dump 失敗：${err.message}\n${stderr.slice(0, 2000)}`));
        // stdout 理論上只有最後一行 JSON；防禦性取最後一個非空行
        const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error(`python3 輸出不是 JSON（前 500 字）：${stdout.slice(0, 500)}`));
        }
      },
    );
  });
}

/**
 * ⭐ 可編輯的那兩張級距表 —— **值、級別名、形狀全部從那兩份 JSON 讀**，
 * ⛔ 這裡一個字面值都沒有（表加一格/改一個級別名，這一頁自己跟著長）。
 * `bounds` 是**現讀**出貨 schema 的常數（⛔ 不是宣告值的複製品）——
 * 對不上時 `mismatch` 會是真的，頁面照樣畫得出來而且看得見它不一致。
 */
function tierGrids(repoRoot, tierUsers) {
  const grid = (axis, table, extra) => {
    const b = TIER_BOUNDS[axis];
    let doc = null;
    let error = null;
    try {
      doc = JSON.parse(readFileSync(join(repoRoot, b.path), "utf8"));
    } catch (err) {
      error = String(err);
    }
    const min = shippedBound(repoRoot, axis, "min");
    const max = shippedBound(repoRoot, axis, "max");
    return {
      path: b.path,
      schema: doc?.schema ?? null,
      enabled: doc?.enabled ?? null,
      error,
      table: doc?.[table] ?? null,
      skills: tierUsers[axis],
      bounds: { min, max, declaredMin: b.min.value, declaredMax: b.max.value, src: b.src },
      mismatch: min !== b.min.value || max !== b.max.value,
      ...extra(doc),
    };
  };
  return {
    cooldown: grid("cooldown", "seconds", (d) => ({ autoShape: d?.autoShape ?? null })),
    range: grid("range", "range", () => ({})),
  };
}

/** GET /__live/skill90 */
export async function build(repoRoot) {
  const { rows, hero } = await runPython(repoRoot);
  const IGNORE = new Set(["castTimeSec"]); // 與 batch1.py --check 同一條豁免
  const out = [];
  let driftSkills = 0;
  let missingShipped = 0;
  /** 這 90 支裡有幾支的冷卻／距離**真的**從級距表解析（現算，⛔ 不是散文裡的數字）。 */
  const tierUsers = { cooldown: 0, range: 0 };
  for (const r of rows) {
    const shippedPath = join(repoRoot, "content", "abilities", `${r.id}.json`);
    let shipped = null;
    if (existsSync(shippedPath)) {
      try {
        shipped = JSON.parse(readFileSync(shippedPath, "utf8"));
      } catch (err) {
        shipped = null;
        r.shippedError = `出貨檔解析失敗：${String(err)}`;
      }
    }
    const drift = [];
    if (shipped === null) {
      missingShipped += 1;
      drift.push({ key: "(整份)", gen: "產生器有這一支", shipped: r.shippedError ?? "content/abilities 裡沒有這個檔" });
    } else {
      if (typeof shipped.cooldownTier === "string") tierUsers.cooldown += 1;
      if (typeof shipped.rangeTier === "string") tierUsers.range += 1;
      const keys = new Set([...Object.keys(r.gen), ...Object.keys(shipped)]);
      for (const k of [...keys].sort()) {
        if (IGNORE.has(k)) continue;
        const inGen = k in r.gen;
        const inShipped = k in shipped;
        if (!inGen || !inShipped || canon(r.gen[k]) !== canon(shipped[k])) {
          drift.push({
            key: k,
            gen: inGen ? r.gen[k] : "（產生器沒有這一格）",
            shipped: inShipped ? shipped[k] : "（出貨檔沒有這一格）",
          });
        }
      }
    }
    if (drift.length > 0) driftSkills += 1;
    out.push({
      num: r.num,
      id: r.id,
      name: r.name,
      cid: r.cid,
      slot: r.slot,
      spec: r.spec,
      shipped, // 出貨現值（整份，頁面 pretty-print）
      drift, // 產生器輸出 vs 出貨現值，逐 top-level key
      effectKinds: shipped
        ? [...new Set((shipped.effects ?? []).filter((x) => x && typeof x === "object").map((x) => x.kind))]
        : [],
    });
  }
  const heroes = Object.entries(hero)
    .map(([num, cid]) => ({
      num,
      cid,
      count: out.filter((s) => s.cid === cid).length,
      driftCount: out.filter((s) => s.cid === cid && s.drift.length > 0).length,
    }))
    .sort((a, b) => Number(a.num) - Number(b.num));
  return {
    total: out.length,
    driftSkills,
    missingShipped,
    heroes,
    skills: out,
    tiers: tierGrids(repoRoot, tierUsers),
    readonlySides: DRIFT_SIDES_READONLY_WHY,
    note:
      "drift = 產生器（tools/skill-remake，owner 規格的翻譯）輸出 vs content/abilities 出貨現值，" +
      "castTimeSec 不比（deriveCastTimes 後處理）。有 drift ≠ 一定是錯 —— 但它代表下一次 " +
      "skills:sync 會把出貨檔改回產生器的樣子（GH#319 的 --check 同一條規則）。",
  };
}
