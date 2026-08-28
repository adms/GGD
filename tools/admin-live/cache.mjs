/**
 * 💾 /__live 的 **checksum 快取層**（GH#822~834 收尾時 owner 點名的新需求）。
 *
 * owner 2026-08-28（逐字）：
 * > 「#822~834 記得要修成可以視覺化編輯，並且**善用redis cache在原資料沒更新
 * >  (md5+checksum)的時候讀取cache就好不用每次都重算**」
 *
 * 形狀：dataset 宣告（或推導）它的**來源檔清單**（deps）→ 對每一份來源算 **md5
 * （檔案 bytes）** → 合成一個 cache key → 命中就回 cache，未命中才跑 build() 並存。
 *
 * ⭐ 為什麼是 md5 而不是 mtime（舊制）：
 *   · macOS 上**目錄的 mtime 不因「就地改一個既有檔」而動** —— 舊制對目錄型 deps
 *     （content/loot-tables 那一族）在外部編輯（git pull、另一個編輯器）時會回**過期**快取。
 *   · mtime 會因 touch / checkout 而動 —— 內容沒變也白算一遍。
 *   checksum 兩個方向都對：**bytes 變了必 miss，bytes 沒變必 hit**（守衛
 *   packages/shared/src/ops/liveChecksumCache.test.ts 兩個方向都量 —— 單邊校準的尺不算）。
 *
 * ⭐ 儲存後端**可插拔**：
 *   · 有 `REDIS_URL` ⇒ redis（⛔ 不新增 npm 依賴 —— 用 node:net 手寫最小 RESP，
 *     只需要 AUTH/SELECT/GET/SET 四個動詞；host 上 game-server 本來就有 redis）
 *   · 沒有 ⇒ 檔案快取（預設 /private/tmp/ggd-live-cache/，linux 退到 os.tmpdir()）
 *   · 後端壞了（連不上）⇒ **fail-open 但要有聲音**：console.warn 一次 ＋
 *     回應 header 的 store 欄標 `-unreachable`，⛔ 不是靜默當作沒有快取。
 *
 * ⭐ 誠實原則：命中/未命中寫在回應 header
 *   `X-Live-Cache: hit|miss|off key=<前8碼> store=memory|file|redis`
 *   —— 靜默的快取跟算錯一樣難查。開關：`GGD_LIVE_CACHE=0` 全關（header 標 off）。
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** md5 memo：同一路徑 (size, mtimeMs) 沒動就不重讀 bytes —— 快取層自己不可以比重算還貴。 */
const md5Memo = new Map();

export function md5OfFile(abs) {
  const st = statSync(abs);
  const hit = md5Memo.get(abs);
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.md5;
  const md5 = createHash("md5").update(readFileSync(abs)).digest("hex");
  md5Memo.set(abs, { size: st.size, mtimeMs: st.mtimeMs, md5 });
  return md5;
}

/** 遞迴列出目錄底下全部檔案（排序 —— key 要決定性），跳過 dotfiles。 */
function* walkFiles(abs) {
  const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = join(abs, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else if (e.isFile()) yield p;
  }
}

/**
 * deps（檔案或目錄的 repo 相對路徑）→ 一把 md5 合成 key。
 * 目錄展開成**逐檔** md5（⛔ 不是目錄 mtime —— 那正是舊制的洞）；
 * 缺席的 dep 以 `absent` 進 key（缺席→出現也要 miss）。
 * extraFiles 收絕對路徑（dataset 模組自己 —— 程式變了結果就可能變）。
 */
export function sourcesChecksum(repoRoot, deps, extraFiles = []) {
  const h = createHash("md5");
  let files = 0;
  const feed = (abs) => {
    try {
      const st = statSync(abs);
      if (st.isDirectory()) {
        for (const f of walkFiles(abs)) {
          h.update(`${f}\n${md5OfFile(f)}\n`);
          files += 1;
        }
      } else {
        h.update(`${abs}\n${md5OfFile(abs)}\n`);
        files += 1;
      }
    } catch {
      h.update(`${abs}\nabsent\n`);
    }
  };
  for (const d of deps ?? []) feed(join(repoRoot, d));
  for (const f of extraFiles) feed(f);
  return { key: h.digest("hex"), files };
}

/** 開關：GGD_LIVE_CACHE=0 全關。每次請求讀（⛔ 不是 module load 時鎖死）。 */
export function cacheEnabled(env = process.env) {
  return env.GGD_LIVE_CACHE !== "0";
}

/* ───────── 檔案後端 ───────── */

export function createFileStore(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    label: "file",
    async get(key) {
      try {
        return readFileSync(join(dir, `${key}.json`), "utf8");
      } catch {
        return null;
      }
    },
    async set(key, text) {
      const p = join(dir, `${key}.json`);
      const tmp = `${p}.tmp-${process.pid}`;
      writeFileSync(tmp, text);
      renameSync(tmp, p); // 原子換名 —— 半寫的快取檔比沒有快取更糟
    },
  };
}

/* ───────── redis 後端（最小 RESP，⛔ 不新增 npm 依賴） ───────── */

function encodeCmd(args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const b = Buffer.from(String(a));
    parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

/** RESP 增量解析：回 [value, nextOffset]，資料還不完整回 null。錯誤回覆解析成 Error 值。 */
function tryParse(buf, offset) {
  if (offset >= buf.length) return null;
  const nl = buf.indexOf("\r\n", offset);
  if (nl < 0) return null;
  const type = String.fromCharCode(buf[offset]);
  const head = buf.toString("utf8", offset + 1, nl);
  if (type === "+") return [head, nl + 2];
  if (type === "-") return [new Error(head), nl + 2];
  if (type === ":") return [Number(head), nl + 2];
  if (type === "$") {
    const len = Number(head);
    if (len === -1) return [null, nl + 2];
    const end = nl + 2 + len;
    if (buf.length < end + 2) return null;
    return [buf.toString("utf8", nl + 2, end), end + 2];
  }
  if (type === "*") {
    const n = Number(head);
    let off = nl + 2;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const r = tryParse(buf, off);
      if (r === null) return null;
      arr.push(r[0]);
      off = r[1];
    }
    return [arr, off];
  }
  return [new Error(`RESP 未支援的型別 ${type}`), nl + 2];
}

const REDIS_TTL_SEC = 7 * 24 * 3600; // key 是內容 hash，舊 key 永遠不會再被讀 —— TTL 只是清垃圾

export function createRedisStore(urlStr) {
  const u = new URL(urlStr); // redis://[user][:pass]@host[:port][/db]
  const host = u.hostname || "127.0.0.1";
  const port = Number(u.port || 6379);
  const pre = [];
  if (u.password) pre.push(u.username ? ["AUTH", u.username, u.password] : ["AUTH", u.password]);
  const db = u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : null;
  if (db !== null && Number.isFinite(db)) pre.push(["SELECT", String(db)]);

  async function run(cmds) {
    const net = await import("node:net");
    const all = [...pre, ...cmds];
    return await new Promise((resolve, reject) => {
      const sock = net.connect({ host, port });
      const chunks = [];
      let settled = false;
      const fail = (e) => {
        if (!settled) {
          settled = true;
          sock.destroy();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };
      sock.setTimeout(3000, () => fail(new Error(`redis ${host}:${port} timeout`)));
      sock.on("error", fail);
      sock.on("connect", () => {
        for (const c of all) sock.write(encodeCmd(c));
      });
      sock.on("data", (c) => {
        chunks.push(c);
        const buf = Buffer.concat(chunks);
        const out = [];
        let off = 0;
        for (let i = 0; i < all.length; i++) {
          const r = tryParse(buf, off);
          if (r === null) return; // 還沒收完
          out.push(r[0]);
          off = r[1];
        }
        if (!settled) {
          settled = true;
          sock.end();
          const err = out.find((v) => v instanceof Error);
          if (err) reject(err);
          else resolve(out.slice(pre.length));
        }
      });
    });
  }

  return {
    label: "redis",
    async get(key) {
      const [v] = await run([["GET", `ggd-live:${key}`]]);
      return typeof v === "string" ? v : null;
    },
    async set(key, text) {
      await run([["SET", `ggd-live:${key}`, text, "EX", String(REDIS_TTL_SEC)]]);
    },
  };
}

/** 預設檔案快取目錄：darwin 用 /private/tmp（任務指定），其餘平台退到 os.tmpdir()。 */
export function defaultCacheDir(env = process.env) {
  if (env.GGD_LIVE_CACHE_DIR) return env.GGD_LIVE_CACHE_DIR;
  return existsSync("/private/tmp") ? "/private/tmp/ggd-live-cache" : join(tmpdir(), "ggd-live-cache");
}

/** 後端選擇：REDIS_URL ⇒ redis；否則檔案。解析失敗 fail-open 到檔案，但**要有聲音**。 */
export function createCacheStore(env = process.env) {
  if (env.REDIS_URL) {
    try {
      return createRedisStore(env.REDIS_URL);
    } catch (err) {
      console.warn(`[admin-live] REDIS_URL 解析失敗（${String(err)}）→ 退回檔案快取`);
    }
  }
  return createFileStore(defaultCacheDir(env));
}
