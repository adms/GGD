/**
 * 💾 GH#821 —— 「14 頁對照表**改得動**」的覆蓋率閘。
 * owner 2026-08-27（逐字）：「我說過**全部都要即時動態資料讀取及儲存（by JSON）,
 * 不是唯讀**，你這樣怎麼算驗收呢」
 *
 * 母體從 `LIVE_ROUTES`（apps/admin/src/ui/live/index.tsx）**推導** —— ⛔ 不手寫 14 頁清單，
 * 加第 15 頁時這裡自動把它抓進來。逐頁走到它 fetch 的 dataset（tools/admin-live/datasets/
 * <name>.mjs），要嘛 `export const write`（kind + rules，共用寫入端吃它）、要嘛
 * `export const readonlyWhy`（能被反駁的理由）。兩者都沒有 ⇒ 紅並**指名該頁**。
 * 突變驗證：拿掉 ex-roots 的 write ⇒ 紅，訊息點名 liveExRoots（見 commit message）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LIVE_DIR = join(ROOT, "apps/admin/src/ui/live");

interface Ds {
  write?: { kind?: string; rules?: { paths?: string[]; pointers?: string[]; value?: { type?: string } }[] };
  readonlyWhy?: string;
}

/** LIVE_ROUTES 的每一列 → { page, label, 元件檔名 }（regex 讀 tsx —— 不 import React 樹）。 */
function routes(): { page: string; label: string; file: string }[] {
  const src = readFileSync(join(LIVE_DIR, "index.tsx"), "utf8");
  const imp = new Map<string, string>();
  for (const m of src.matchAll(/import \{ (\w+) \} from "\.\/(\w+)"/g)) imp.set(m[1], m[2]);
  const rows = [...src.matchAll(/page: "(\w+)", label: "([^"]+)".*Component: (\w+)/g)].map((m) => {
    const file = imp.get(m[3]);
    if (file === undefined) throw new Error(`LIVE_ROUTES 的 ${m[1]} 引用了沒 import 的元件 ${m[3]}`);
    return { page: m[1], label: m[2], file };
  });
  if (rows.length === 0) throw new Error("index.tsx 裡讀不到任何 LIVE_ROUTES 列 —— 閘的母體空了");
  return rows;
}

describe("liveWriteCoverage（GH#821 覆蓋率閘）", () => {
  it("每一頁：dataset 宣告 write，或帶能被反駁的 readonlyWhy —— 缺了指名該頁", async () => {
    const bad: string[] = [];
    for (const r of routes()) {
      const page = readFileSync(join(LIVE_DIR, `${r.file}.tsx`), "utf8");
      const names = [...new Set([...page.matchAll(/\/__live\/([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]))];
      if (names.length === 0) {
        bad.push(`${r.page}（${r.label}）：頁面沒有 fetch 任何 /__live dataset —— 它是靜態內容？`);
        continue;
      }
      for (const n of names) {
        const mod = (await import(pathToFileURL(join(ROOT, "tools/admin-live/datasets", `${n}.mjs`)).href)) as Ds;
        const w = mod.write;
        if (w !== undefined) {
          if (w.kind !== "source" && w.kind !== "overlay")
            bad.push(`${r.page}（${r.label}）→ ${n}：write.kind 要是 source|overlay（現在是 ${String(w.kind)}）—— kind 是承重的，寫產物等於沒寫`);
          const rules = w.rules ?? [];
          if (rules.length === 0 || rules.some((x) => !(x.paths?.length && x.pointers?.length && x.value?.type)))
            bad.push(`${r.page}（${r.label}）→ ${n}：write.rules 每一條要有 paths + pointers + value.type`);
        } else if (typeof mod.readonlyWhy !== "string" || mod.readonlyWhy.trim().length < 10) {
          bad.push(`${r.page}（${r.label}）→ ${n}：既沒有 write 也沒有 readonlyWhy —— owner 說「不是唯讀」，二選一`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
