/**
 * ⭐ 完整英雄版本裡「只記雜湊、不複製位元組」的素材（GH#1178）。
 *
 * ⚠️ 為什麼要有這一支（2026-09-15 量到，⛔ 不是推測）：PR #1152 合併之後，快照要複製的去重位元組
 * 從 416.7 MiB 長到 **851.3 MiB**（模型 GLB 就佔 777.4 MiB）⇒ 撞上 512 MiB 上限，本機 content-api
 * 的**每一次存檔都回 503**；硬把上限拉開則每次存檔 24.9 秒、RSS +1.43 GB。
 *
 * > owner 2026-09-10（逐字，`catalogVersions.ts` 的上限出處）：「如果這是我本機端的話 **2x 就好**」
 * ⇒ ⛔ 上限不動。改的是「什麼東西需要被複製」。
 *
 * ⭐ 判準（三個都成立才只記雜湊 —— ⛔ 不是「檔名長得像 sha」就信）：
 *   ① 檔名本體就是 64 位 hex，而**實際位元組**的 sha256 等於它
 *   ② 它在 **git HEAD** 裡是一般檔案（100644），而 HEAD 記的**大小**等於工作樹的大小
 *   ③ HEAD 的 **blob 雜湊**等於工作樹位元組算出來的 blob 雜湊
 *   ⇒ 這份位元組在 git 裡有第二個不可變的住處；它被刪掉，git 仍拿得回來。
 *   任一條不成立 ⇒ 照舊複製位元組（未 commit 的新模型、內容與檔名不符的檔都走這條）。
 *
 * ⭐ 雜湊按 path + size + mtime + ctime + inode 快取 —— ⛔ 否則每次存檔仍要讀 713.8 MiB。
 *
 * 回頭開關（只有作者／維運會轉 ⇒ 環境變數，⛔ 不進後台）：`GGD_CATALOG_SNAPSHOT_MODE=full` ⇒ 回到全量複製。
 * ⛔⛔ 2026-09-15 更正 0da79d14a 這一句原本的「512 MiB 上限照舊會擋，那是預期」—— 說得太輕：
 *   **在目前的內容量下切回 full，每一次存檔都會 503**（去重位元組 851.3 MiB > owner 的 512 MiB 上限，
 *   而上限 ⛔ 不動）。⇒ 這格開關 ⛔ 不是「安全的回頭」，是**回到修之前的壞狀態**；
 *   只在①內容量降回上限以下 ②要排查「只記雜湊」這條路本身時才用。撞上時訊息會指名它（`capHint`）。
 *
 * ⚠️ 只記雜湊的**代價**（與全量快照相比的語意變化，⛔ 不是沒有）：這種版本**沒有自己的一份位元組**。
 *   存下之後工作樹裡同雜湊的檔被刪掉 ⇒ 回復回 409、一個檔都不寫（`readAddressedAsset`）。
 *   ⛔ 切 `full` 救不回**已經存下**的版本（它存下時就只有雜湊）。救法是從 git 把那份 blob 放回原路徑再回復一次：
 *   在 content 目錄 `git cat-file -e <gitBlob>`（確認還在）→ `git cat-file blob <gitBlob> > <path>` → 重按回復。
 *   `gitBlob` 是存檔當下 HEAD 的 blob 雜湊（判準③驗過），所以只要那個 commit 還在歷史裡就拿得回來。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

export const CATALOG_SNAPSHOT_MODE_ENV = "GGD_CATALOG_SNAPSHOT_MODE";
export type CatalogSnapshotMode = "content-addressed" | "full";

/** ⛔ 打錯字不靜默退回預設 —— 直接擋下並指名變數。 */
export function catalogSnapshotMode(env: Record<string, string | undefined> = process.env): CatalogSnapshotMode {
  const raw = env[CATALOG_SNAPSHOT_MODE_ENV]?.trim();
  if (!raw || raw === "content-addressed") return "content-addressed";
  if (raw === "full") return "full";
  throw new Error(`${CATALOG_SNAPSHOT_MODE_ENV} 只接受 content-addressed／full，收到「${raw}」。`);
}

/** 快照清單裡的一筆：`sha256` 與 `manifest.files` 同格式（`sha256:<hex>`）。 */
export interface AddressedAssetFact { path: string; bytes: number; sha256: string; gitBlob: string }

/** 與 `@ggd/shared/content/sha256` 的 `sha256Bytes` 同一個答案；這裡是 Node 專用，量到快 8 倍（60 → 485 MiB/s）。 */
export const sha256Hex = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

const ADDRESSED_NAME = /\/([a-f0-9]{64})\.[a-z0-9]+$/;
const digests = new Map<string, { key: string; sha256: string; gitBlob: string }>();
let digestReads = 0;
/** 測試用：到目前為止真的讀檔算雜湊的次數（快取命中不算）。 */
export const addressedDigestReads = () => digestReads;

/**
 * ⭐ 「這個檔有沒有被動過」的**唯一**判準住處（⛔ 不要在別處再寫一份）——
 * `catalogVersions.ts` 的保存期間防競態也用它（GH#1178）。
 *
 * ⚠️ 為什麼 `ctimeNs` 是關鍵：使用者空間**沒有** API 可以把 ctime 設回去，
 * 任何一次寫入都會被核心改掉 ⇒ ⛔ 一般的寫入端偽造不了這個指紋。
 * （`size`＋`mtimeNs` 自己可以被 `utimes` 還原，`ino`／`dev` 擋的是換檔／換掛載點。）
 */
export const statKey = (file: string) => {
  const s = statSync(file, { bigint: true });
  return `${s.size}:${s.mtimeNs}:${s.ctimeNs}:${s.ino}:${s.dev}`;
};

/** 同一次掃描的上下文：HEAD 的 blob 表（只收檔名是 64 hex 的）＋ 用過的 stat 指紋（防競態）。 */
export function addressedAssetScanner(root: string, mode: CatalogSnapshotMode) {
  const tracked = new Map<string, { size: number; oid: string }>();
  const used = new Map<string, string>();
  let gitReadable = true;
  if (mode === "content-addressed") {
    let listing = "";
    try { listing = execFileSync("git", ["-C", root, "ls-tree", "-r", "-l", "-z", "HEAD", "--", "assets"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); }
    catch { listing = ""; gitReadable = false; } // 不在 git 裡 ⇒ 沒有第二個住處 ⇒ 全部照舊複製（撞上限時 capHint 說出來）
    for (const row of listing.split("\0")) {
      const tab = row.indexOf("\t"), [fileMode, type, oid, size] = row.slice(0, tab).split(/\s+/);
      const path = row.slice(tab + 1);
      if (fileMode === "100644" && type === "blob" && oid && ADDRESSED_NAME.test(path)) tracked.set(path, { size: Number(size), oid });
    }
  }
  return {
    /** 符合三個判準 ⇒ 回雜湊事實；否則 null（呼叫端照舊複製位元組）。 */
    fact(path: string): AddressedAssetFact | null {
      const blob = tracked.get(path), name = ADDRESSED_NAME.exec(path)?.[1];
      if (!blob || !name) return null;
      const file = resolve(root, path);
      if (!existsSync(file) || !realpathSync(file).startsWith(root + sep)) return null;
      const key = statKey(file);
      if (Number(key.split(":")[0]) !== blob.size) return null;
      let hit = digests.get(file);
      if (hit?.key !== key) {
        const data = readFileSync(file); digestReads += 1;
        const oidAlgo = blob.oid.length === 64 ? "sha256" : "sha1";
        hit = { key, sha256: createHash("sha256").update(data).digest("hex"), gitBlob: createHash(oidAlgo).update(`blob ${data.length}\0`).update(data).digest("hex") };
        if (statKey(file) !== key) throw new Error(`保存期間內容已更新，請重新取得版本：${path}`);
        digests.set(file, hit);
      }
      if (hit.sha256 !== name || hit.gitBlob !== blob.oid) return null;
      used.set(file, key);
      return { path, bytes: blob.size, sha256: `sha256:${name}`, gitBlob: blob.oid };
    },
    /**
     * 撞上 512 MiB／20,000 份上限時附在訊息後面 —— ⛔ 讓「為什麼變成全量複製」說得出來，而不是一句沒頭沒尾的 503。
     * （有人切了 `full`、或容器沒有 git／看不到 `.git`：兩種都會回到修之前的全量複製。）
     */
    capHint(): string {
      if (mode === "full") return `（⚠️ 目前 ${CATALOG_SNAPSHOT_MODE_ENV}=full：全量複製在目前內容量下必然超過上限 ⇒ 每次存檔都會 503；拿掉這個環境變數回到只記雜湊）`;
      return gitReadable ? "" : "（⚠️ 讀不到 git HEAD（沒有 git 或看不到 .git）：內容定址素材沒有第二個住處，只能全部複製）";
    },
    /** 最後一輪防競態：只記雜湊的檔在保存期間被動過 ⇒ 丟錯（⛔ 不重讀位元組）。 */
    verifyUnchanged() {
      for (const [file, key] of used) if (!existsSync(file) || statKey(file) !== key) throw new Error(`保存期間內容已更新，請重新取得版本：${file}`);
    },
  };
}

/**
 * ⭐ 回復／準備實例時把「只記雜湊」的素材換回位元組。
 * 先找原路徑，再找目前快照裡其他同雜湊的素材；位元組的大小與 sha256 都要對上。
 * ⛔ 找不到就**明確失敗並指名那個檔** —— 絕不回傳空位元組或佔位。
 */
export function readAddressedAsset(rootPath: string, want: AddressedAssetFact, current: Iterable<AddressedAssetFact> = []): Uint8Array {
  const root = realpathSync(rootPath);
  for (const path of new Set([want.path, ...[...current].filter((fact) => fact.sha256 === want.sha256).map((fact) => fact.path)])) {
    if (!/^assets\/[a-zA-Z0-9._/-]+$/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) continue;
    const file = resolve(root, path);
    if (!existsSync(file) || !realpathSync(file).startsWith(root + sep) || statSync(file).size !== want.bytes) continue;
    const data = new Uint8Array(readFileSync(file));
    if (`sha256:${createHash("sha256").update(data).digest("hex")}` === want.sha256) return data;
  }
  throw Object.assign(new Error(`此版本的素材只記了雜湊（${want.sha256}），工作樹找不到同雜湊的檔案，未寫入任何資料：${want.path}。`
    + `救法：在 content 目錄執行 git cat-file -e ${want.gitBlob}（確認 git 還有它）→ git cat-file blob ${want.gitBlob} > ${want.path} → 再回復一次。`
    + `⛔ 切 ${CATALOG_SNAPSHOT_MODE_ENV}=full 救不回這個版本（它存下時就只記了雜湊）。`), { statusCode: 409 });
}
