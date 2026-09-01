/**
 * ⭐⭐ **匯入的狀態機與原子啟用**（規格 §3）。
 *
 * ── ⛔ 為什麼 apply 不可以是「逐檔寫進去」 ──────────────────────────────────
 * 規格逐字禁止：「⛔ 禁止使用逐文件 PUT 拼成假 atomic apply」。
 * ⚠️ ⭐ 理由是可以量的：一次 40 份文件的匯入，寫到第 17 份時行程被 kill
 * ⇒ 出貨樹處在**兩個版本的中間**，⛔ 而它看起來完全正常（每一份都是合法 JSON）。
 * ⇒ ⭐ 真正的原子性只有一個做法：**先把整棵新樹寫在旁邊，再換一個指標**。
 *   `rename(2)` 在同一個檔案系統上是原子的 —— ⭐ 那是這整支檔案的支點。
 *
 * ── ⭐ 五個落點，各自一個寫入端 ────────────────────────────────────────────
 *
 * | 目錄 | 誰寫 | 性質 |
 * |---|---|---|
 * | `candidates/<digest>/` | apply 的第一步 | ⭐ **immutable** —— 同一個 digest 只寫一次 |
 * | `staging/<operationId>/` | apply 的 PREPARED 階段 | 整棵新樹，fsync 過 |
 * | `operations/<id>.json` | 狀態機 | ⭐ **冪等**：同一個 id 重送回同一份結果 |
 * | `active.json` | ⭐ **只有 rename 寫它** | ACTIVE 指標 |
 * | `history/` | 每次啟用 append 一筆 | rollback 的來源 |
 *
 * ── ⛔ fsync 不是形式 ──────────────────────────────────────────────────────
 * 寫完不 fsync ⇒ 資料在 page cache 裡，⚠️ 而 `rename` **會**先落地
 * ⇒ ⭐ 斷電之後得到「指標指向新版、而新版的內容是空的」——
 * ⛔ 那比沒有原子性更糟：它看起來成功了。
 * ⇒ 順序是 **寫檔 → fsync 檔 → fsync 目錄 → rename → fsync 父目錄**。
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const OPERATION_SCHEMA = "ggd-content-import-operation@1" as const;
export const ACTIVE_SCHEMA = "ggd-content-import-active@1" as const;

/** ⭐ 狀態機。⛔ 終態（`activated`/`rejected`/`rolled-back`）**不可再變**。 */
export type OperationStatus =
  | "received"
  | "validated"
  | "prepared"
  | "activated"
  | "rejected"
  | "rolled-back";

const TERMINAL: ReadonlySet<OperationStatus> = new Set([
  "activated",
  "rejected",
  "rolled-back",
]);

export interface OperationRecord {
  readonly schema: typeof OPERATION_SCHEMA;
  readonly operationId: string;
  readonly status: OperationStatus;
  readonly packageDigest: string | null;
  readonly previousActivationDigest: string | null;
  readonly activationDigest: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly actor: string;
  readonly diagnostics: readonly unknown[];
  readonly changedDocuments: readonly {
    collection: string;
    id: string;
    path: string;
  }[];
}

export interface ActivePointer {
  readonly schema: typeof ACTIVE_SCHEMA;
  readonly activationDigest: string;
  readonly packageDigest: string | null;
  readonly operationId: string | null;
  /** ⭐ staging 那棵樹的目錄名 —— ⛔ 指標本身**不含**內容。 */
  readonly tree: string | null;
  readonly activatedAt: string;
  readonly previousActivationDigest: string | null;
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** ⭐ 寫檔 ＋ fsync 檔 ＋ fsync 目錄 —— ⛔ 三步缺一，斷電就得到半份。 */
function writeDurable(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "w");
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDir(dirname(path));
}

function fsyncDir(dir: string): void {
  // ⚠️ macOS 上開目錄要 O_RDONLY；失敗**不吞** —— 一個吞掉的 fsync 失敗
  //   等於沒有 fsync，⭐ 而它會在斷電那一天才被發現。
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** ⭐ 原子換指標：寫 tmp → fsync → rename → fsync 父目錄。 */
function atomicReplace(path: string, data: string): void {
  const tmp = path + ".tmp-" + String(process.pid);
  writeDurable(tmp, data);
  renameSync(tmp, path);
  fsyncDir(dirname(path));
}

export interface ImportStoreOptions {
  readonly dir: string;
  readonly now?: () => Date;
}

/**
 * ⭐ 這一支**只管狀態與原子性**，⛔ 不管內容合不合法
 * （那是 `validatePackage` 的事，而它是純函式）。
 */
export class ImportStore {
  private readonly dir: string;
  private readonly now: () => Date;

  constructor(opts: ImportStoreOptions) {
    this.dir = resolve(opts.dir);
    this.now = opts.now ?? (() => new Date());
    mkdirSync(join(this.dir, "candidates"), { recursive: true });
    mkdirSync(join(this.dir, "operations"), { recursive: true });
    mkdirSync(join(this.dir, "staging"), { recursive: true });
    mkdirSync(join(this.dir, "history"), { recursive: true });
  }

  /**
   * ⭐ 存一份候選包。**同一個 digest 只寫一次** ——
   * ⛔ 第二次送**不同的位元組**卻用同一個 digest ⇒ 擲例外（那是一次掉包）。
   */
  putCandidate(packageDigest: string, raw: string): { stored: boolean } {
    const path = join(
      this.dir,
      "candidates",
      safeName(packageDigest),
      "package.json",
    );
    if (existsSync(path)) {
      const have = readFileSync(path, "utf8");
      if (sha256(have) !== sha256(raw)) {
        throw new Error(
          "⛔⛔ candidate " +
            packageDigest +
            " 已經存在，而這一次的位元組不同 —— " +
            "⭐ 候選是 immutable 的：同一個 digest 必須永遠指向同一份內容。",
        );
      }
      return { stored: false };
    }
    writeDurable(path, raw);
    return { stored: true };
  }

  getCandidate(packageDigest: string): string | null {
    const path = join(
      this.dir,
      "candidates",
      safeName(packageDigest),
      "package.json",
    );
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  getOperation(operationId: string): OperationRecord | null {
    const path = join(this.dir, "operations", safeName(operationId) + ".json");
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as OperationRecord)
      : null;
  }

  /**
   * ⭐ 開一個操作，或**回傳既有的那一個**（冪等）。
   * ⛔ 已經到終態的操作不可以被重開 —— 回它自己。
   */
  beginOperation(operationId: string, actor: string): OperationRecord {
    const existing = this.getOperation(operationId);
    if (existing !== null) return existing;
    const rec: OperationRecord = {
      schema: OPERATION_SCHEMA,
      operationId,
      status: "received",
      packageDigest: null,
      previousActivationDigest: this.active()?.activationDigest ?? null,
      activationDigest: null,
      startedAt: this.now().toISOString(),
      finishedAt: null,
      actor,
      diagnostics: [],
      changedDocuments: [],
    };
    this.writeOperation(rec);
    return rec;
  }

  /** ⛔ 終態不可再變 —— 想改就是狀態機壞了，擲例外。 */
  updateOperation(
    operationId: string,
    patch: Partial<OperationRecord>,
  ): OperationRecord {
    const cur = this.getOperation(operationId);
    if (cur === null) throw new Error("unknown operation " + operationId);
    if (TERMINAL.has(cur.status)) {
      if (patch.status !== undefined && patch.status !== cur.status) {
        throw new Error(
          "⛔ 操作 " +
            operationId +
            " 已經是終態 " +
            cur.status +
            "，不可以改成 " +
            String(patch.status) +
            " —— ⭐ 冪等的意思是「重送回同一個答案」，⛔ 不是「重跑一次」。",
        );
      }
      return cur;
    }
    const next: OperationRecord = {
      ...cur,
      ...patch,
      finishedAt:
        patch.status !== undefined && TERMINAL.has(patch.status)
          ? this.now().toISOString()
          : cur.finishedAt,
    };
    this.writeOperation(next);
    return next;
  }

  private writeOperation(rec: OperationRecord): void {
    atomicReplace(
      join(this.dir, "operations", safeName(rec.operationId) + ".json"),
      stable(rec),
    );
  }

  /**
   * ⭐ 把整棵新樹寫到 `staging/<operationId>/`，每一份 fsync 過，
   * 然後**逐份讀回來比對位元組**（object verification）。
   *
   * ⚠️ ⛔ 讀回來比對不是多餘的：`writeFileSync` 成功**不代表**位元組正確
   * （檔案系統滿、硬體錯誤、掛載選項）—— ⭐ 而 apply 的下一步就是換指標，
   * ⛔ 換過去之後才發現內容壞了，就已經是線上事故。
   */
  prepare(
    operationId: string,
    files: ReadonlyMap<string, string>,
  ): { tree: string; bytes: number } {
    const tree = join(this.dir, "staging", safeName(operationId));
    rmSync(tree, { recursive: true, force: true });
    let bytes = 0;
    for (const [rel, data] of [...files].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      if (rel.includes("..") || rel.startsWith("/")) {
        throw new Error("⛔ staging 路徑不安全：" + rel);
      }
      writeDurable(join(tree, rel), data);
      bytes += Buffer.byteLength(data);
    }
    // ⭐ 讀回來逐份比對（⛔ 不是「寫完就算」）。
    for (const [rel, data] of files) {
      const got = readFileSync(join(tree, rel), "utf8");
      if (got !== data) {
        throw new Error(
          "⛔⛔ staging 讀回來與寫進去的**不同**：" +
            rel +
            " —— ⭐ 這一棵樹不可以被啟用。",
        );
      }
    }
    fsyncDir(tree);
    return { tree: safeName(operationId), bytes };
  }

  /** ⭐ 一棵 staging 樹的 activationDigest（內容決定，⛔ 不吃時鐘）。 */
  treeDigest(operationId: string): string {
    const tree = join(this.dir, "staging", safeName(operationId));
    const parts: string[] = [];
    const walk = (d: string, prefix: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
        a.name < b.name ? -1 : 1,
      )) {
        const rel = prefix === "" ? e.name : prefix + "/" + e.name;
        if (e.isDirectory()) walk(join(d, e.name), rel);
        else parts.push(rel + " " + sha256(readFileSync(join(d, e.name))));
      }
    };
    if (existsSync(tree)) walk(tree, "");
    return "sha256:" + sha256(parts.join("|"));
  }

  active(): ActivePointer | null {
    const path = join(this.dir, "active.json");
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as ActivePointer)
      : null;
  }

  /**
   * ⭐⭐ **Base CAS ＋ 原子換指標 ＋ 健康回讀**。
   *
   * @param expected 呼叫端**以為**現在是哪一版。⛔ 對不上 ⇒ 擲例外，一個位元組都不動。
   *   ⚠️ `undefined` 表示「不比對」，⭐ 只有還沒有 ACTIVE 時才合法。
   */
  activate(
    next: Omit<
      ActivePointer,
      "schema" | "activatedAt" | "previousActivationDigest"
    >,
    expected: string | null | undefined,
  ): ActivePointer {
    const cur = this.active();
    if (expected !== undefined) {
      const nowDigest = cur?.activationDigest ?? null;
      if (expected !== nowDigest) {
        throw new Error(
          "⛔⛔ Base CAS 失敗：你以為現在是 " +
            String(expected ?? "(無)") +
            "，實際是 " +
            String(nowDigest ?? "(無)") +
            " —— ⭐ 有人在你 validate 之後啟用過別的東西。⛔ 一個位元組都沒有動。",
        );
      }
    } else if (cur !== null) {
      throw new Error(
        "⛔ 已經有 ACTIVE 了，而這次啟用沒有帶 expectedActivationDigest —— " +
          "⭐ 覆蓋一個你沒看過的版本正是 CAS 要擋的事。",
      );
    }
    const pointer: ActivePointer = {
      schema: ACTIVE_SCHEMA,
      ...next,
      activatedAt: this.now().toISOString(),
      previousActivationDigest: cur?.activationDigest ?? null,
    };
    const body = stable(pointer);
    atomicReplace(join(this.dir, "active.json"), body);
    // ⭐ **健康回讀** —— ⛔ rename 成功不代表讀得回來（掛載、權限、fs 損壞）。
    const back = this.active();
    if (back === null || stable(back) !== body) {
      throw new Error(
        "⛔⛔ ACTIVE 指標換過去之後**讀不回同一份** —— ⭐ 這是線上事故，不是警告。",
      );
    }
    const seq = readdirSync(join(this.dir, "history")).length;
    writeDurable(
      join(
        this.dir,
        "history",
        String(seq).padStart(6, "0") +
          "-" +
          safeName(pointer.operationId ?? "none") +
          ".json",
      ),
      body,
    );
    return back;
  }

  /** ⭐ rollback 是**有條件**的：只能從你以為的那一版回捲。 */
  rollback(expected: string): ActivePointer {
    const cur = this.active();
    if (cur === null) throw new Error("⛔ 沒有 ACTIVE 可以回捲");
    if (cur.activationDigest !== expected) {
      throw new Error(
        "⛔ 回捲的前提對不上：你以為現在是 " +
          expected +
          "，實際是 " +
          cur.activationDigest,
      );
    }
    if (cur.previousActivationDigest === null) {
      throw new Error("⛔ 這是第一次啟用，沒有上一版可以回捲");
    }
    const prev = this.historyOf(cur.previousActivationDigest);
    if (prev === null) {
      throw new Error(
        "⛔ 找不到 " +
          cur.previousActivationDigest +
          " 的 history 紀錄 —— ⭐ 回捲需要它的 tree",
      );
    }
    const pointer: ActivePointer = {
      ...prev,
      activatedAt: this.now().toISOString(),
      previousActivationDigest: cur.activationDigest,
    };
    const body = stable(pointer);
    atomicReplace(join(this.dir, "active.json"), body);
    const back = this.active();
    if (back === null || stable(back) !== body) {
      throw new Error("⛔⛔ 回捲之後 ACTIVE 讀不回同一份");
    }
    return back;
  }

  private historyOf(activationDigest: string): ActivePointer | null {
    for (const f of readdirSync(join(this.dir, "history")).sort().reverse()) {
      const p = JSON.parse(
        readFileSync(join(this.dir, "history", f), "utf8"),
      ) as ActivePointer;
      if (p.activationDigest === activationDigest) return p;
    }
    return null;
  }

  /** ⭐ 出貨樹的位置（ACTIVE 指到的那一棵）。 */
  activeTreePath(): string | null {
    const a = this.active();
    return a?.tree == null ? null : join(this.dir, "staging", a.tree);
  }
}

/** ⛔ 任何會變成檔名的東西都要先過這一關。 */
function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
}

/** 穩定序列化（⛔ 不吃 key 順序）。 */
function stable(v: unknown): string {
  return JSON.stringify(v, Object.keys(v as object).sort());
}
