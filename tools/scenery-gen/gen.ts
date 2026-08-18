/**
 * scenery-gen — bake the scenery .glb files (GH#362 的資產缺口).
 *
 *   pnpm scenery:gen      write content/assets/models/scenery/*.glb
 *   pnpm scenery:check    verify the shipped files match the generator, byte for byte
 *
 * ── 這個檔案是 CLI，⛔ 不是產生器 ─────────────────────────────────────────
 * 每一個頂點的來源是 `pieces.ts` 的參數表；把參數變成位元組的是 `parts.ts` 的
 * `bake()`，那一支對 15 件物件是**同一支**。這裡只剩檔案 I/O 與一行預算報告。
 *
 * 形狀逐字照 `tools/voxel-gen/gen.ts`（owner directive #226 / #229）。
 *
 * NOTHING HERE IS DOWNLOADED. 見 README 第一節。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bake, SCENERY_HEIGHT_CAP, TRI_BUDGET, type BakeResult } from "./parts";
import { PIECES } from "./pieces";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
export const OUT_DIR = path.join(REPO_ROOT, "content/assets/models/scenery");

/** The path an arena doc's `decor[].model` must carry to reach this piece. */
export const decorPath = (key: string): string => `assets/models/scenery/${key}.glb`;
export const outPath = (key: string): string => path.join(REPO_ROOT, "content", decorPath(key));

/** Every piece, baked. Pure — the test calls this and compares to disk. */
export function bakeAll(): BakeResult[] {
  return PIECES.map((p) => bake(p));
}

function main(): void {
  const check = process.argv.includes("--check");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = bakeAll();
  let bad = 0;
  let total = 0;
  let tris = 0;
  for (const { piece, bytes, stats } of rows) {
    const file = outPath(piece.key);
    total += bytes.length;
    tris += stats.triangles;
    if (check) {
      const same = fs.existsSync(file) && Buffer.from(bytes).equals(fs.readFileSync(file));
      if (!same) {
        bad++;
        console.error(`STALE  ${path.relative(REPO_ROOT, file)}`);
      }
    } else {
      fs.writeFileSync(file, bytes);
    }
    const [, , , maxX, maxY, maxZ] = stats.bbox;
    console.log(
      `${check ? "check" : "wrote"}  ${piece.key.padEnd(15)} ${piece.label.padEnd(5)} ` +
        `${String(stats.triangles).padStart(3)} tris  ${String(stats.bytes).padStart(5)} B  ` +
        `h ${maxY.toFixed(2)}u  ${(maxX * 2).toFixed(2)}×${(maxZ * 2).toFixed(2)}u  ` +
        `${stats.sha256.slice(0, 12)}`,
    );
  }
  console.log(
    `total ${tris} tris, ${total} B across ${rows.length} files; ` +
      `budget ${TRI_BUDGET} tris/piece, height cap ${SCENERY_HEIGHT_CAP}u`,
  );
  if (check && bad > 0) {
    console.error(`\n${bad} file(s) differ from the generator — run \`pnpm scenery:gen\`.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
