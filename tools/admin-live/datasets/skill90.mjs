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
 * GH#821 豁免（能被反駁）：這一頁是 drift 稽核 —— 規格側的家是 tools/skill-remake/
 * batch1.py 的 T 表（**程式**，改它要跑 refresh_docs.py＋genrun）；出貨側那 91 份是
 * skillremake:json 的產物（genguard AUTHOR）。兩側都不是「資料儲存」寫得到的地方；
 * 從這裡寫任一側都會被下一次 sync 打回來或造成兩側靜默分岔。
 * 反駁法：指出一格 target 過得了 genguard 且不在 batch1.py 的權威範圍。
 */
export const readonlyWhy =
  "drift 稽核頁：規格側住 batch1.py（程式）、出貨側是 skillremake:json 產物 —— 兩側都不是資料儲存的家。";

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

/** GET /__live/skill90 */
export async function build(repoRoot) {
  const { rows, hero } = await runPython(repoRoot);
  const IGNORE = new Set(["castTimeSec"]); // 與 batch1.py --check 同一條豁免
  const out = [];
  let driftSkills = 0;
  let missingShipped = 0;
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
    note:
      "drift = 產生器（tools/skill-remake，owner 規格的翻譯）輸出 vs content/abilities 出貨現值，" +
      "castTimeSec 不比（deriveCastTimes 後處理）。有 drift ≠ 一定是錯 —— 但它代表下一次 " +
      "skills:sync 會把出貨檔改回產生器的樣子（GH#319 的 --check 同一條規則）。",
  };
}
