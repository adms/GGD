import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { SyncIoFacts } from "@ggd/shared/content/import/editorSource";

/** Undo a caught failure of the synchronous, local-only source editor. The
 * generator can normalize other heroes and rebuild indexes before it fails,
 * so editableMembers alone is not a sufficient recovery set. Durable version
 * history is still captured separately before this temporary checkpoint.
 * This is not process-crash recovery or a lock against external CLI writers. */
export function checkpointSourceRegeneration(repoRoot: string, sourcePath: string, step: string, io: SyncIoFacts) {
  const root = realpathSync(repoRoot);
  const declared = io.steps.find(entry => entry.name === step)?.writes;
  if (!declared) throw new Error("找不到產生器寫入範圍，未開始修改來源。");
  const confined = (path: string) => {
    if (path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("生成復原路徑不合法。");
    const full = resolve(root, path);
    if (!full.startsWith(root + sep)) throw new Error("生成復原路徑越界。");
    // Never traverse a symlink, including a dangling link introduced by a
    // failed generator. Recovery must not write into another tree.
    let current = root;
    for (const part of path.split("/")) {
      current = join(current, part);
      try { if (lstatSync(current).isSymbolicLink()) throw new Error("生成復原路徑含符號連結。"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    return full;
  };
  const outsideContent = [...new Set(declared.filter(path => !path.startsWith("content/")))];
  const enumerate = () => {
    const paths = new Set<string>([sourcePath]);
    const walk = (path: string) => {
      const full = confined(path);
      if (!existsSync(full)) return;
      const stat = lstatSync(full);
      if (stat.isDirectory()) for (const name of readdirSync(full).sort()) walk(path + "/" + name);
      else if (stat.isFile()) paths.add(path);
      else throw new Error("生成復原範圍含非一般檔案。");
    };
    walk("content");
    for (const path of outsideContent) {
      // sync-io globs have the same non-recursive '*' meaning as ownershipOf.
      if (!path.includes("*")) { confined(path); if (existsSync(resolve(root, path))) walk(path); continue; }
      const dir = dirname(path), pattern = path.slice(dir.length + 1);
      if (dir.includes("*")) throw new Error("生成復原不支援此目錄萬用字元，未開始修改來源。");
      const full = confined(dir);
      const matcher = new RegExp("^" + pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
      if (existsSync(full)) for (const name of readdirSync(full).sort()) if (matcher.test(name)) walk(dir + "/" + name);
    }
    return [...paths].sort();
  };
  const directory = mkdtempSync(join(tmpdir(), "ggd-source-recovery-"));
  const files = new Map<string, { backup: string; mode: number }>();
  const dispose = () => rmSync(directory, { recursive: true, force: true });
  try {
    let total = 0;
    for (const path of enumerate()) {
      const full = confined(path), stat = lstatSync(full);
      total += stat.size;
      if (!stat.isFile() || files.size >= 25000 || total > 1024 * 1024 * 1024) throw new Error("生成復原範圍超過 25,000 檔或 1 GiB，未開始修改來源。");
      const backup = join(directory, String(files.size));
      // APFS can clone bytes cheaply; unlike a hard link the backup remains
      // independent when a generator writes in place. Other disks copy normally.
      copyFileSync(full, backup, constants.COPYFILE_FICLONE);
      files.set(path, { backup, mode: stat.mode & 0o777 });
    }
    writeFileSync(join(directory, "recovery.json"), JSON.stringify({ schema: "ggd-local-source-recovery@1", repoRoot: root, sourcePath, step,
      files: [...files].map(([path, before]) => ({ path, backup: before.backup.slice(directory.length + 1), mode: before.mode })) }, null, 2) + "\n", { mode: 0o600 });
  } catch (error) { dispose(); throw error; }
  const unchanged = () => {
    const current = enumerate();
    return current.length === files.size && current.every(path => {
      const before = files.get(path);
      return before && readFileSync(confined(path)).equals(readFileSync(before.backup));
    });
  };
  return {
    directory, dispose, unchanged,
    restore() {
      const current = enumerate();
      // Validate every destination before restoring any bytes.
      for (const path of new Set([...current, ...files.keys()])) confined(path);
      let restored = 0, removed = 0;
      for (const path of current) if (!files.has(path)) { rmSync(confined(path)); removed++; }
      for (const [path, before] of files) {
        const full = confined(path);
        if (existsSync(full) && readFileSync(full).equals(readFileSync(before.backup))) {
          if ((lstatSync(full).mode & 0o777) !== before.mode) chmodSync(full, before.mode);
          continue;
        }
        mkdirSync(dirname(full), { recursive: true });
        // Rename also restores quarantined 0444 products without unlocking the
        // original tree. Keep backups intact until the whole recovery succeeds.
        const tempDir = mkdtempSync(join(dirname(full), ".ggd-recovery-")), temp = join(tempDir, "file");
        try {
          copyFileSync(before.backup, temp, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
          chmodSync(temp, before.mode); renameSync(temp, full);
        } finally { rmSync(tempDir, { recursive: true, force: true }); }
        restored++;
      }
      if (!unchanged()) throw new Error("生成復原後的位元組核對失敗。");
      return { restored, removed };
    },
  };
}
