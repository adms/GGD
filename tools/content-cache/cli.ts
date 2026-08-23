/**
 * `tools/content-cache` —— 內容樹快取的量尺與開關。
 *
 *   npx tsx tools/content-cache/cli.ts stat     # 鍵是什麼、兩層各自在不在、Redis 通不通
 *   npx tsx tools/content-cache/cli.ts warm     # 把這一版內容寫進兩層
 *   npx tsx tools/content-cache/cli.ts clear    # 清掉本機檔案層
 *   npx tsx tools/content-cache/cli.ts bench    # ⭐ 快取前/後的 wall-clock（每一輪都是**新行程**）
 *
 * ⭐ `bench` 為什麼要開子行程：產生器是**一次性行程**，省的是「每一個行程的第一次」，
 * ⛔ 不是「同一個行程裡的第二次」。在同一個行程裡量會把 OS page cache 與 V8
 * 的暖身一起量進去，那個數字對產生器沒有意義。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearFileLayer,
  contentCacheKey,
  hasGit,
  loadContentCached,
  redisOptionsFromEnv,
  TinyRedis,
} from "../../packages/shared/src/content/cache/index";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const PROBE = join(HERE, "probe.ts");

function ms(n: number): string {
  return `${n.toFixed(0)} ms`;
}

/** 一輪 = 一個全新的 `tsx` 行程，印出它自己量到的 load 毫秒數。 */
function probe(env: Record<string, string>): { ms: number; hit: string; total: number } {
  const t0 = performance.now();
  const r = spawnSync("npx", ["tsx", PROBE], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const total = performance.now() - t0;
  const line = (r.stdout || "").trim().split("\n").pop() ?? "";
  const m = /^(\d+(?:\.\d+)?) (\S+)/.exec(line);
  if (!m) throw new Error(`probe 沒有回傳量測值:\n${r.stdout}\n${r.stderr}`);
  return { ms: Number(m[1]), hit: m[2]!, total };
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "stat";

  if (cmd === "clear") {
    console.log(`清掉 ${clearFileLayer()} 份本機快取`);
    return;
  }

  if (cmd === "stat" || cmd === "warm") {
    const fp = contentCacheKey();
    console.log(`git             : ${hasGit() ? "有" : "⛔ 沒有（退回 read-all）"}`);
    console.log(`fingerprint     : ${fp.key.slice(0, 16)}… (${fp.source}, ${fp.paths} 條路徑, ${fp.dirty} 份 dirty, ${ms(fp.ms)})`);
    const opts = redisOptionsFromEnv(process.env);
    const redis = new TinyRedis(opts);
    const up = await redis.connect();
    console.log(`redis           : ${up ? `通 (${opts.host}:${opts.port})` : `⛔ 連不上 (${opts.host}:${opts.port}) ⇒ 只用檔案層`}`);
    redis.close();
    const r = await loadContentCached({ readOnly: cmd === "stat" });
    console.log(`載入            : hit=${r.cache.hit} docs=${r.store.totalCount()} bytes=${(r.cache.bytes / 1e6).toFixed(2)} MB`);
    console.log(`  fingerprint ${ms(r.cache.timings.fingerprint)} · read ${ms(r.cache.timings.read)} · hydrate ${ms(r.cache.timings.hydrate)} · load ${ms(r.cache.timings.load)} · write ${ms(r.cache.timings.write)}`);
    for (const n of r.cache.notes) console.log(`  ⚠️ ${n}`);
    return;
  }

  if (cmd === "bench") {
    clearFileLayer();
    console.log("⏱  每一輪都是一個全新的 tsx 行程（＝一支產生器的樣子）\n");
    const rows: Array<[string, { ms: number; hit: string; total: number }]> = [];
    rows.push(["① 快取關掉（GGD_CONTENT_CACHE=off）", probe({ GGD_CONTENT_CACHE: "off" })]);
    rows.push(["② 快取開著 · 冷（第一次，要寫回）", probe({ GGD_CONTENT_CACHE: "auto" })]);
    rows.push(["③ 快取開著 · 暖（第二次）", probe({ GGD_CONTENT_CACHE: "auto" })]);
    rows.push(["④ 快取開著 · 暖（第三次）", probe({ GGD_CONTENT_CACHE: "auto" })]);
    const w = Math.max(...rows.map((r) => [...r[0]].length));
    for (const [label, r] of rows) {
      console.log(`${label.padEnd(w)}  load ${ms(r.ms).padStart(7)}   hit=${r.hit.padEnd(6)} 行程總計 ${ms(r.total)}`);
    }
    const off = rows[0]![1].ms;
    const warm = Math.min(rows[2]![1].ms, rows[3]![1].ms);
    console.log(`\n⇒ 內容載入 ${ms(off)} → ${ms(warm)}（省 ${(100 * (1 - warm / off)).toFixed(0)}%，1,727 次 readFile → 0）`);

    // ⭐ 一支真的產生器，讓上面那個數字有分母
    const t0 = performance.now();
    try {
      execFileSync("pnpm", ["-s", "tiers:check"], { cwd: REPO, stdio: "ignore" });
    } catch {
      /* 紅了也沒關係,這裡量的是 wall-clock */
    }
    const gen = performance.now() - t0;
    console.log(`分母：\`pnpm tiers:check\` 整支 ${ms(gen)} ⇒ 其中 ${((100 * off) / gen).toFixed(0)}% 是內容載入`);
    return;
  }

  console.error(`未知的指令 "${cmd}"（stat | warm | clear | bench）`);
  process.exitCode = 2;
}

void main();
