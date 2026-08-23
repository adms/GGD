/**
 * ⭐ **推導**用的 node/tsx I/O 探針 —— ⛔ 不是手寫的相依表。
 *
 * `trace.mjs` 用 `NODE_OPTIONS=--require <這個檔>` 掛進去,於是每一支 `tsx tools/...`
 * 開檔時都會留下一行。⚠️ `--require` 在 ESM 圖被實例化**之前**跑,所以
 * `import { readFileSync } from "node:fs"` 拿到的是**已經被換掉**的那一個。
 *
 * ⚠️ 只需要**讀**的那一半:寫入端由 mtime 差分量(⭐ 那條路徑連子行程都蓋得到)。
 */
const fs = require("node:fs");
const path = require("node:path");

const LOG = process.env.GGD_TRACE_LOG;
const ROOT = process.env.GGD_TRACE_ROOT;

if (LOG && ROOT) {
  const root = path.resolve(ROOT).replace(/\/+$/, "") + "/";
  const fd = fs.openSync(LOG, "a");
  const rawWrite = fs.writeSync.bind(fs); // ⚠️ 先綁住,⛔ 不要記錄自己的 log

  const rec = (kind, p) => {
    try {
      if (Buffer.isBuffer(p)) p = p.toString("utf8");
      if (p && typeof p === "object" && typeof p.href === "string") {
        p = require("node:url").fileURLToPath(p);
      }
      if (typeof p !== "string") return; // fd 之類的,⛔ 不記
      const abs = path.resolve(p);
      if (abs.startsWith(root)) rawWrite(fd, `${kind}\t${abs.slice(root.length)}\n`);
    } catch {
      /* 探針**永遠不可以**弄壞被量的那支程式 */
    }
  };

  const READS = [
    "readFileSync", "readdirSync", "existsSync", "statSync", "lstatSync",
    "realpathSync", "createReadStream", "openSync", "opendirSync", "accessSync",
    "readFile", "readdir", "stat", "access",
  ];

  const patch = (obj, names, kind) => {
    for (const n of names) {
      const orig = obj?.[n];
      if (typeof orig !== "function") continue;
      const wrapped = function (p, ...rest) {
        rec(kind, p);
        return orig.call(this, p, ...rest);
      };
      Object.defineProperty(wrapped, "name", { value: n });
      try {
        obj[n] = wrapped;
      } catch {
        /* frozen —— 跳過,mtime 差分仍然量得到寫入端 */
      }
    }
  };

  patch(fs, READS, "R");
  patch(fs.promises, ["readFile", "readdir", "stat", "lstat", "access", "realpath", "open"], "R");
}
