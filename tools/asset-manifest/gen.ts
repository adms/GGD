/**
 * ⭐⭐ **完整資產清單**（P1-1）—— 讓遠端 GLB／貼圖**驗得起來**。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * `ggd-editor-target-profile@1` 的 `assetManifestDigest` 是 **null**，而理由逐字寫著
 * 「尚無版本化的 asset manifest」。⇒ 外部編輯器拿得到 `model@1.glbPath`，
 * ⛔ 而**沒有任何方法驗證那顆 GLB 是不是它預期的那一顆** —— 它只能相信路徑。
 *
 * ⇒ ⭐ 這一支產生 `content/assets-manifest.json`：每一顆被引用到的二進位一列
 * `{ path, bytes, sha256, contentType }`，⭐ **deterministic**（路徑排序、無時鐘）。
 *
 * ── ⭐ 涵蓋範圍是**推導**出來的，⛔ 不是一張手寫的副檔名清單 ────────────────
 * 掃 `content/**\/*.json` 裡**每一個**指向 `assets/…` 的字串值。
 * ⚠️ 量到的欄位（2026-09-02）：`vfx.texture` 653 · `abilities.icon` 421
 * · `config.file` 404 · `champions.icon` 355 · `models.glbPath` 151 · `items.icon` 142…
 * ⇒ ⭐ 一張手寫的「models/vfx/projectiles/skins」清單會漏掉 `config.files`
 *   那 246 筆（音效表）與圖示那一族 —— 而它們同樣是外部編輯器引用得到的東西。
 *
 * ── ⚠️ 為什麼**只收被引用到的**，⛔ 不是整棵 `content/assets/` ────────────────
 * `content/assets/` 底下有 **12,554** 個檔（含 5,767 個 mp3 與一堆 `.hash`／`.method`
 * 邊車檔）。⭐ 清單的用途是「驗證引用得到的東西」——
 * ⛔ 把沒有人引用的檔算進來，只會讓 digest 對一次無關的資產改動變紅。
 * ⭐ 可反駁：若哪天要驗「有沒有多餘的資產」，那是**另一份**普查，⛔ 不是這一份。
 *
 *   pnpm assets:manifest        # 重新產生
 *   pnpm assets:manifest:check  # 逐位元組比對（唯讀）
 */
// ggd:writes content/assets-manifest.json
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, basename} from "node:path";

const ROOT = resolve(__dirname, "../..");
const CONTENT = join(ROOT, "content");
const OUT = join(CONTENT, "assets-manifest.json");

/** ⭐ 只有這些副檔名算「二進位資產」。⛔ `.hash`／`.method` 是工具的邊車檔。 */
const BINARY_EXT: Readonly<Record<string, string>> = Object.freeze({
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ktx2": "image/ktx2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".bin": "application/octet-stream",
});

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      // ⛔ 不進 assets/ 自己 —— 我們要的是**誰引用了它**，⛔ 不是它有什麼。
      if (e === "assets" || e === "_legacy") continue;
      jsonFiles(p, out);
    } else if (p.endsWith(".json")) out.push(p);
  }
  return out;
}

/** ⭐ 一份文件裡**每一個**指向 assets/ 的字串值（⛔ 不看欄位名 —— 欄位名會變）。 */
function referenced(doc: unknown, out: Set<string>): void {
  if (Array.isArray(doc)) for (const d of doc) referenced(d, out);
  else if (doc && typeof doc === "object") for (const v of Object.values(doc)) referenced(v, out);
  else if (typeof doc === "string" && doc.startsWith("assets/") && BINARY_EXT[extname(doc).toLowerCase()]) {
    out.add(doc);
  }
}

/**
 * ⭐ 一顆資產的**種類** —— 從路徑推導（⛔ 不是一張手寫的對照表）。
 *
 * ⚠️ ⭐ 交接文件要「每筆可另外帶 logical asset key／**kind**」——
 * ⭐ 而編輯器要它是為了**分類與篩選**（「給我所有貼圖」），
 * ⛔ 不是為了知道副檔名（那已經在 `contentType` 了）。
 *
 * ⚠️ ⭐ 判準是**它住在哪個目錄**，⛔ 不是它長什麼樣：
 * 同一顆 `.png` 在 `assets/textures/` 是貼圖、在 `assets/icons/` 是圖示，
 * ⇒ 對編輯器來說它們是**兩種東西**。
 * ⛔ 認不出來的一律 `"other"`（⭐ 一個誠實的分類，⛔ 不是猜一個）。
 */
function assetKind(rel: string): string {
  const seg = rel.split("/")[1] ?? "";
  const known = [
    "models",
    "textures",
    "icons",
    "audio",
    "vfx",
    "projectiles",
    "skins",
    "fonts",
  ];
  return known.includes(seg) ? seg : "other";
}

interface Entry {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
  /** ⭐ 種類（`models` / `textures` / …；認不出來 ⇒ `"other"`）。 */
  kind: string;
  /**
   * ⭐ **誰引用它** —— 出貨文件的 id（升冪、去重）。
   *
   * ⚠️ ⭐ 交接文件要的 `dependencies` 的**反方向** ——
   * 而反方向才是編輯器真正需要的：它手上有一顆資產，要問的是
   * 「**動它會影響誰**」，⛔ 不是「它需要什麼」（一顆 GLB 什麼都不需要）。
   *
   * ⚠️ ⭐ **有界**：一顆共用的貼圖可能被上百份文件引用
   * ⇒ 只列前 {@link MAX_REFS} 個，其餘進 `moreRefs`（⛔ 不是靜默截斷）。
   */
  refs: string[];
  moreRefs?: number;
}

/** 一顆資產最多列幾個引用者（⭐ 回應大小的柵欄，⛔ 不是玩法決策）。 */
const MAX_REFS = 12;

function build(): { manifest: unknown; missing: string[] } {
  const refs = new Set<string>();
  /** ⭐ 反向索引：資產路徑 → 引用它的文件 id。 */
  const byAsset = new Map<string, Set<string>>();
  for (const f of jsonFiles(CONTENT)) {
    // ⛔ 跳過自己（否則第二次跑會把上一次的路徑當成引用）。
    if (f === OUT) continue;
    try {
      const doc = JSON.parse(readFileSync(f, "utf8")) as { id?: unknown };
      const mine = new Set<string>();
      referenced(doc, mine);
      // ⭐ 文件的 `id`（沒有就用檔名）—— ⛔ 不用完整路徑：那對編輯器沒有意義。
      const who = typeof doc.id === "string" && doc.id !== "" ? doc.id : basename(f, ".json");
      for (const r of mine) {
        refs.add(r);
        (byAsset.get(r) ?? byAsset.set(r, new Set()).get(r)!).add(who);
      }
    } catch {
      /* 壞掉的 JSON 由 content:build 的 Zod 管，⛔ 不是這裡 */
    }
  }
  const entries: Entry[] = [];
  const missing: string[] = [];
  for (const rel of [...refs].sort()) {
    const abs = join(CONTENT, rel);
    let buf: Buffer;
    try {
      buf = readFileSync(abs);
    } catch {
      missing.push(rel);
      continue;
    }
    entries.push({
      path: rel,
      bytes: buf.byteLength,
      sha256: createHash("sha256").update(buf).digest("hex"),
      contentType: BINARY_EXT[extname(rel).toLowerCase()]!,
      kind: assetKind(rel),
      ...(() => {
        // ⭐ 排序是**契約的一部分**：`byAsset` 是 Set（⛔ 沒有順序）
        //   ⇒ 不排的話每次重生成的位元組都不同，而 `--check` 會永遠紅。
        const all = [...(byAsset.get(rel) ?? [])].sort();
        return all.length > MAX_REFS
          ? { refs: all.slice(0, MAX_REFS), moreRefs: all.length - MAX_REFS }
          : { refs: all };
      })(),
    });
  }
  const totalBytes = entries.reduce((n, e) => n + e.bytes, 0);
  return {
    manifest: {
      schema: "ggd-assets-manifest@1",
      note:
        "⭐ 被 content/**/*.json 引用到的**每一顆**二進位資產。⛔ 產物 —— 改 " +
        "`tools/asset-manifest/gen.ts`，⛔ 不要手改。⚠️ 只收**被引用到的**：" +
        "content/assets/ 底下有一萬多個檔，而清單的用途是驗證引用得到的東西。",
      counts: { entries: entries.length, totalBytes },
      entries,
    },
    missing,
  };
}

const { manifest, missing } = build();
if (missing.length > 0) {
  // ⛔ fail-loud：引用得到而檔案不在 ⇒ 外部編輯器會拿到一個驗不了的路徑。
  console.error(`⛔ ${missing.length} 個被引用的資產**不存在**：\n  ${missing.slice(0, 10).join("\n  ")}`);
  process.exit(2);
}
const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let cur = "";
  try {
    cur = readFileSync(OUT, "utf8");
  } catch {
    /* 不存在 ⇒ 下面報 stale */
  }
  if (cur !== json) {
    console.error("⛔ content/assets-manifest.json 過期了 —— 跑 `pnpm assets:manifest` 然後 git add");
    process.exit(1);
  }
  console.log("assets:manifest:check OK");
} else {
  writeFileSync(OUT, json);
  const c = (manifest as { counts: { entries: number; totalBytes: number } }).counts;
  console.log(`✅ ${relative(ROOT, OUT)} —— ${c.entries} 顆 · ${(c.totalBytes / 1048576).toFixed(1)} MB`);
}
