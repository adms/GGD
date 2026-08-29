/**
 * AnimeArenaMapGenerator —— CLI（GH#324 Phase 2）。
 *
 * ⭐ 這支只做 **I/O 與回報**。所有的邏輯（模板／編譯／圖論／驗證）都在
 * `@ggd/shared/map/*`，因為那些要被後台的報告頁與測試共用 ——
 * 邏輯住在 CLI 裡就只有 CLI 用得到（`tools/voxel-gen` 走過同一條路，task #229）。
 *
 * ## 用法
 *
 * ```
 *   pnpm --dir tools/anime-arena-map map:gen    產生 content/arenas/arena.*.json（會覆寫）
 *   pnpm --dir tools/anime-arena-map map:check  只比對，不寫檔；有差異就非零離開
 *   （⛔ 這兩支只住在本子套件的 package.json —— 在 repo root 打 `pnpm map:gen` 是 ERR_PNPM_NO_SCRIPT）
 * ```
 *
 * ## ⛔ 產出的檔禁止手改
 *
 * 每一份產出的開頭都有 `_generated` 橫幅指名這件事。守衛 `gen.test.ts` 真的
 * spawn 這支腳本並**讀離開碼** —— ⛔ 不是 `expect(...).not.toThrow("訊息")`
 * （vitest 的 `toThrow(string)` 是子字串比對，腳本真的非零離開時它照樣綠，
 * `legacyIndexFresh.test.ts` 就這樣出貨過）。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zMapDoc } from "@ggd/shared/content/schema/map";
import { DEFAULT_MAP_SPEC, resolveMapSpec } from "@ggd/shared/content/schema/mapSpecDoc";
import { compileMap } from "@ggd/shared/map/compile";
import { DEFAULT_STAGE1_RADIUS } from "@ggd/shared/sim/fireRing";
import { formatReport } from "@ggd/shared/map/validate";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MAPS = join(REPO, "content", "maps");
const ARENAS = join(REPO, "content", "arenas");
const REPORT = join(REPO, "docs", "_map-report.md");
const REPORT_DOC = join(REPO, "content", "config", "map-report.json");

const CHECK = process.argv.includes("--check");

/** 出貨的規格；讀不到就用 DEFAULT（⛔ 不抄字面值）。 */
function loadSpec(): typeof DEFAULT_MAP_SPEC {
  const p = join(REPO, "content", "config", "map-spec.json");
  if (!existsSync(p)) return DEFAULT_MAP_SPEC;
  return resolveMapSpec(JSON.parse(readFileSync(p, "utf8")) as Record<string, never>);
}

/**
 * 火圈「停止縮圈」停下來的半徑 —— **出生點的路徑預算量的就是走到它要多遠**（GH#364）。
 *
 * ⛔ 不抄 4：它住在 `config.match.json`，讀不到才退回 sim 自己的 `DEFAULT_STAGE1_RADIUS`。
 * ⚠️ 守衛 `arenaSpawnLegality.test.ts` 讀的是**同一格**，兩邊因此不可能各自漂移。
 */
function loadPocketRadius(): number {
  const p = join(REPO, "content", "config", "config.match.json");
  if (!existsSync(p)) return DEFAULT_STAGE1_RADIUS;
  const doc = JSON.parse(readFileSync(p, "utf8")) as {
    match?: { fireRing?: { stage1Radius?: number } };
  };
  return doc.match?.fireRing?.stage1Radius ?? DEFAULT_STAGE1_RADIUS;
}

/**
 * 穩定序列化。⚠️ 鍵序**跟著物件的插入序**，⛔ 不排序 ——
 * `zArenaDoc.parse()` 之後的鍵序才是出貨檔的鍵序，兩邊要一致，
 * 否則乾淨的重跑會變成一個純鍵序的 diff（fx-19 那次踩過）。
 */
const stable = (o: unknown): string => `${JSON.stringify(o, null, 2)}\n`;

function main(): void {
  if (!existsSync(MAPS)) {
    console.error(`⛔ 找不到 ${MAPS}`);
    process.exit(2);
  }
  const spec = loadSpec();
  const pocketRadius = loadPocketRadius();
  const files = readdirSync(MAPS)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

  if (files.length === 0) {
    console.log("（content/maps/ 是空的 —— 沒有地圖要產生）");
    return;
  }

  let drift = 0;
  let rejected = 0;
  const reportLines: string[] = [];
  const reportRows: unknown[] = [];

  for (const f of files) {
    const raw: unknown = JSON.parse(readFileSync(join(MAPS, f), "utf8"));
    const parsed = zMapDoc.safeParse(raw);
    if (!parsed.success) {
      console.error(`⛔ ${f} 不是合法的 map@1：`);
      for (const issue of parsed.error.issues) {
        console.error(`   · ${issue.path.join(".")}: ${issue.message}`);
      }
      rejected++;
      continue;
    }

    const { arena, report } = compileMap(parsed.data, spec, undefined, pocketRadius);
    const text0 = formatReport(report);
    console.log(text0);
    console.log("");
    reportLines.push(`## ${f}\n\n\`\`\`\n${text0}\n\`\`\`\n`);
    reportRows.push({
      mapId: report.mapId,
      template: report.template,
      cols: report.grid.cols,
      rows: report.grid.rows,
      tileSize: report.grid.tileSize,
      worldW: report.worldSize.w,
      worldD: report.worldSize.d,
      regions: report.regions,
      walkableTiles: report.walkableTiles,
      disconnectedAreas: report.disconnectedAreas,
      deadEnds: report.deadEnds,
      loops: report.loops,
      chokepoints: report.chokepoints,
      shortcuts: report.shortcuts,
      interactions: report.interactions,
      avgShortestPath: report.avgShortestPath,
      longestShortestPath: report.longestShortestPath,
      estimatedTraversalSec: report.estimatedTraversalSec,
      duelZones: report.duelZones,
      unreachableObjects: report.unreachableObjects,
      invalidSpawns: report.invalidSpawns,
      issues: report.issues,
      ok: report.ok,
    });

    if (!report.ok) {
      console.error(`⛔ ${f} 未通過驗證 —— **拒絕輸出**。`);
      console.error(
        "   ⚠️ 連通性／出生點／互動點可達／對戰分區數是**正確性**，" +
          "⛔ 與後台的 severity 設定無關，調不掉。",
      );
      rejected++;
      continue;
    }

    // ⚠️ 檔名 stem **就是** doc id（`arena.castle.json` 的 id 是 `arena.castle`），
    // 所以這裡⛔不再加一次前綴 —— 加了會產出 arena.arena.xxx.json。
    const out = join(ARENAS, `${arena.id}.json`);
    const text = stable(arena);
    const prev = existsSync(out) ? readFileSync(out, "utf8") : null;

    if (CHECK) {
      if (prev !== text) {
        console.error(`⛔ ${out} 與產生器現在的輸出不一致。`);
        console.error("   要改地圖請改 content/maps/*.json 然後跑：pnpm --dir tools/anime-arena-map map:gen");
        drift++;
      }
      continue;
    }

    if (prev !== text) {
      writeFileSync(out, text);
      console.log(`✓ 寫入 ${out}`);
    } else {
      console.log(`= ${out}（無變化）`);
    }
  }

  if (rejected > 0) {
    console.error(`\n⛔ ${rejected} 張地圖被拒絕。`);
    process.exit(1);
  }
  if (CHECK) {
    const want = stable({
      id: "map-report",
      schema: "config.map-report@1",
      note: "⚙️ 這份是 `pnpm map:gen` 產生的，⛔ 不要手改。要改地圖請改 content/maps/*.json。",
      maps: reportRows,
    });
    const have = existsSync(REPORT_DOC) ? readFileSync(REPORT_DOC, "utf8") : null;
    if (have !== want) {
      console.error(`⛔ ${REPORT_DOC} 與產生器現在的輸出不一致。`);
      drift++;
    }
  }
  if (CHECK && drift > 0) {
    console.error(`\n⛔ ${drift} 份產出與來源不同步。`);
    process.exit(1);
  }
  if (!CHECK) {
    // ⭐ 報告寫成檔並進版控：owner 常設「視覺化一律留歷史紀錄」。
    // ⚠️ 這一份**沒有時間戳** —— 有的話乾淨的重跑會變成 diff，而那會逼人
    //    把 `--check` 放寬成模糊比對，⛔ 放寬的閘不是閘。
    writeFileSync(
      REPORT,
      "# 地圖驗證報告\n\n" +
        "> ⚙️ **這份是 `pnpm map:gen` 產生的，⛔ 不要手改。**\n" +
        "> 要改地圖請改 `content/maps/*.json`。\n\n" +
        reportLines.join("\n"),
    );
    // ⭐ 同一份報告也寫成 config 文件 —— 後台用既有管道就讀得到，
    //    而且 `map:check` 保證它永遠等於產生器現在會算出來的東西。
    writeFileSync(
      REPORT_DOC,
      stable({
        id: "map-report",
        schema: "config.map-report@1",
        note: "⚙️ 這份是 `pnpm --dir tools/anime-arena-map map:gen` 產生的，⛔ 不要手改。要改地圖請改 content/maps/*.json。",
        maps: reportRows,
      }),
    );
    console.log(`✓ 報告寫入 ${REPORT} 與 ${REPORT_DOC}`);
    console.log("\n⚠️ 記得跑 `pnpm content:build` 並把產物一起 commit。");
  }
}

main();
