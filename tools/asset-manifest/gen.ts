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
import { referencedAssetPaths } from "../../packages/shared/src/content/assetReferences";
import { BUILTIN_VFX_TEXTURES } from "../../packages/shared/src/content/builtinVfxTextures";

const ROOT = resolve(__dirname, "../..");
const CONTENT = join(ROOT, "content");
const OUT = join(CONTENT, "assets-manifest.json");

/** ⭐ 只有這些副檔名算「二進位資產」。⛔ `.hash`／`.method` 是工具的邊車檔。 */
import { BINARY_ASSET_TYPES as BINARY_EXT } from "../../packages/shared/src/content/assetReferences";

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
  referencedAssetPaths(doc, out);
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

/**
 * ⭐⭐ **不在 git 裡的資產** —— owner 2026-09-08 逐字：
 *
 * > 「資源庫 我覺得**不要進 git** 但可以**存到 S3** ggd-390630837668-ap-east-2-an」
 * > 「原始模型、動畫、這批大型解析 JSON ⇒ S3 ／ 解析轉換程式、英雄與技能設定 JSON、
 * >   版本清單、**SHA-256**、文件 ⇒ Git」
 *
 * ⇒ ⭐ 這一份就是他說的「進 git 的 SHA-256」：`{ path: { bytes, sha256 } }`。
 *   ⛔ 位元組住 S3，⭐ 而**驗得起來的那半**住 git。
 *
 * ⚠️ ⭐ 它**不是**一張放行清單：
 *   · 沒有宣告的缺席資產 ⇒ ⛔ 照舊 fail-loud（一個打錯的路徑仍然要紅）
 *   · 路徑是**內容定址**（檔名 = 64 個 hex）時，`sha256` **必須等於檔名** ——
 *     ⭐ 一句自我矛盾的宣告會被當場擋下，⛔ 而不是被寫進出貨清單。
 */
// ⭐ 路徑可注入 —— ⛔ 只為了讓守衛跑得起來（它要驗**這一支**的行為，
//   ⛔ 而不可以動到出貨的那一份宣告）。出貨時它就是預設那一份。
const OFFDISK = process.env.GGD_ASSETS_OFFDISK
  ? resolve(process.env.GGD_ASSETS_OFFDISK)
  : join(CONTENT, "assets-offdisk.json");
const CONTENT_ADDRESSED = /^([0-9a-f]{64})\.[a-z0-9]+$/;

function loadOffDisk(): Map<string, { bytes: number; sha256: string }> {
  const out = new Map<string, { bytes: number; sha256: string }>();
  let raw: string;
  try {
    raw = readFileSync(OFFDISK, "utf8");
  } catch {
    return out; // ⭐ 沒有這份宣告是合法的（＝全部資產都在磁碟上）
  }
  const doc = JSON.parse(raw) as { entries?: Record<string, { bytes: number; sha256: string }> };
  for (const [path, d] of Object.entries(doc.entries ?? {})) {
    if (typeof d?.bytes !== "number" || !/^[0-9a-f]{64}$/.test(d?.sha256 ?? "")) {
      throw new Error(`⛔ assets-offdisk.json 的 "${path}" 缺 bytes 或 sha256 不是 64 個 hex`);
    }
    const m = CONTENT_ADDRESSED.exec(basename(path));
    if (m && m[1] !== d.sha256) {
      throw new Error(
        `⛔ assets-offdisk.json 的 "${path}" **自我矛盾**：檔名說 ${m[1]}，欄位說 ${d.sha256}。\n` +
          `   ⭐ 內容定址的路徑，檔名就是它的 sha —— 兩者不合表示這份宣告是編的。`,
      );
    }
    out.set(path, { bytes: d.bytes, sha256: d.sha256 });
  }
  return out;
}

function build(): { manifest: unknown; missing: string[] } {
  const refs = new Set<string>();
  /** ⭐ 反向索引：資產路徑 → 引用它的文件 id。 */
  const byAsset = new Map<string, Set<string>>();
  for (const path of Object.values(BUILTIN_VFX_TEXTURES)) {
    refs.add(path);
    byAsset.set(path, new Set(["builtin-vfx"]));
  }
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
  const offDisk = loadOffDisk();
  const entries: Entry[] = [];
  const missing: string[] = [];
  for (const rel of [...refs].sort()) {
    const abs = join(CONTENT, rel);
    let bytes: number;
    let sha256: string;
    try {
      const buf = readFileSync(abs);
      bytes = buf.byteLength;
      sha256 = createHash("sha256").update(buf).digest("hex");
    } catch {
      // ⭐⭐ **不在磁碟上 ⇒ 去問宣告**（owner 2026-09-08：「資源庫 不要進 git 但可以存到 S3」）。
      //
      // ⛔ 在此之前這裡一律 `missing.push(rel)` ⇒ ⭐ **PR 越守規矩，這條閘越紅**：
      //   素材照裁決住 S3 ⇒ CI 的磁碟上沒有它 ⇒ 96 個「被引用的資產不存在」。
      // ⚠️ 而閘本身沒有錯 —— 它問的是**一個名詞**（檔案在不在），
      //   ⭐ 而該問的是**關係**：這個引用**解析得到一顆有 sha 的資產**嗎。
      const d = offDisk.get(rel);
      if (!d) {
        missing.push(rel);
        continue;
      }
      bytes = d.bytes;
      sha256 = d.sha256;
    }
    entries.push({
      path: rel,
      bytes,
      sha256,
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
        "⭐ 被 content/**/*.json 或共用 VFX 材質引用到的**每一顆**二進位資產。⛔ 產物 —— 改 " +
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
