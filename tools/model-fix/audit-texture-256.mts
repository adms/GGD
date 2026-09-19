/**
 * 🖼 出貨樹裡**每一顆** `.glb` 的貼圖最長邊，逐顆量 —— GH#1199 的量尺。
 *
 * owner（逐字，2026-09-10）：
 * > 「貼圖降低到 256² 貼圖 這個應該變成上架前 後台＆編輯器的內建 script 吧 避免上架到過大的貼圖」
 * > 「**場景也是阿** 不應該有貼圖超過 256」
 *
 * ⭐ 這支只**量**，⛔ 一個位元組都不寫。修是 `register-normalized-version.mts --reason texture-256` 的事。
 *
 * ── 為什麼需要它（#1199 的票文前提與今天的實際不符）───────────────────────────
 * 票文寫「凍結副本裡還有 30 張 512，⭐ **而那正是英雄卡在載的那一份**」。
 * ⛔ 今天量到的**不是**這樣（2026-09-19，`--json` 的輸出）：
 *   · 190 位英雄的作用中身體**沒有一顆**超過 256（182 顆 = 256、6 顆 = 16、1 顆 = 128、1 顆無貼圖）
 *   · ⭐ 其中 **114 位**的作用中身體**正是** `versions/` 底下的凍結副本 —— ⇒ 那條路是通的而且是乾淨的
 *   · 全樹 1154 顆裡 409 顆超標，⛔ 而 151 顆是**下拉舊版本**（rollback 用）、185 顆**沒有人引用**
 * ⇒ ⭐ 所以「超過 256 的檔案數」這個數字**回答不了**票要問的事。
 *    要問的是「**玩家載得到的**那些裡面，有幾顆超標」——⭐ 那是一個**可達性**問題。
 *    今天的答案是 **73 顆**：`scenery-cc0` 32 · `props` 22 · `hex` 18 · `ou99_487191`（呂布皮膚）1。
 *    ⭐ 也就是說剩下的**幾乎全是「場景」** —— 正是 owner 那句「場景也是阿」點名的東西。
 *
 * ── 分母怎麼算（⭐ 四條路都要走，⛔ 少走一條就會得到一個好看而錯的數字）──────────
 * 本檔第一版只走了①②，於是把 hex／props／guardians 那 44 顆**場景**判成「沒有人引用」——
 * ⭐ 而 owner 那句「場景也是阿」點名的正是它們。⇒ 這就是 CLAUDE.md
 * 「我掃的是哪一條路？還有別條嗎？**分母是誰**？」那一條，⛔ 而它在寫這支工具時真的發生了。
 *
 *  ① 英雄**作用中**身體   `champion.modelKey` → `models/<key>.json` → `glbPath`
 *  ② 皮膚                 `skin.modelKey` → 同上（⭐ `zRef("models")` 全 repo 只有三處，這是第二處）
 *  ③ ⭐ **直接路徑字串**   `content/**.json` 裡任何 `assets/models/**.glb`（地圖與競技場是這樣寫的，
 *                          ⛔ 不透過 model key ⇒ 只走 key 的掃描對場景**結構上失明**）
 *  ④ ⭐ **LOD 變體**       `_lod.json` 把可達的 base 再展開成 `-mid` / `-small`（那是另外兩顆檔）
 *
 * ⚠️ `champion.modelVersions[]` 裡**非**作用中的那些是**下拉舊版本**：留著是為了 rollback
 *    （`freeze()` 的不可變性 ⇒ ⛔ 不可以原地改）。它們玩家載不到 ⇒ 另外一欄，⛔ 不混進可達數。
 *
 * ── 量尺自己要先自證（CLAUDE.md：一把只驗過單邊的尺，不算自證過）──────────────
 * ⭐ `--calibrate` 兩個方向都跑：已知**超標**的量得到、已知**合規**的不誤報。
 * ⚠️ 讀不到尺寸的一律計入 `unknown` 並讓 `--check` 轉紅，⛔ 不是當成 0（那會靜默通過）——
 *    ⭐ 前一版把 webp 讀成 0，於是 `menu/dragon2*.glb` 三顆「合格」了。
 * ⚠️ `assets-offdisk.json` 宣告的檔位元組在 S3、本機沒有 ⇒ 列進 `offdisk`，⛔ 不當成合格。
 *
 *   node --import tsx tools/model-fix/audit-texture-256.mts              # 摘要
 *   node --import tsx tools/model-fix/audit-texture-256.mts --json       # 完整逐顆
 *   node --import tsx tools/model-fix/audit-texture-256.mts --markdown   # 報告用表格
 *   node --import tsx tools/model-fix/audit-texture-256.mts --calibrate  # 量尺自證（兩個方向）
 *   node --import tsx tools/model-fix/audit-texture-256.mts --check [--scope reachable|all]
 *
 * ⚠️ `--scope all` 今天**紅 409 顆**，而其中 185 顆沒有任何人引用、151 顆是 rollback 歷史 ——
 *    ⭐ 一條沒有人能讓它變綠的閘等於沒有閘（CLAUDE.md 形態⑨）。⇒ 預設 `reachable`。
 *    ⛔ 而這**不是**把 `versions/` 排除在外（票的 Non-goals）：作用中的凍結副本**算在可達裡** ——
 *    今天 190 位英雄裡有 **114 位**的作用中身體正是 `versions/` 底下的檔，它們逐顆都被量過。
 *    ⭐ 被排除的只有「**沒有任何人載得到**」的那些，⛔ 而那是一個可以被反駁的判準（改 `--scope all` 就看得到）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve("content");
const MODELS_DIR = join(ROOT, "assets", "models");
const LIMIT = 256;

// ── 貼圖尺寸：從影像表頭讀 ────────────────────────────────────────────────────
// ⛔ 不用 inspectModelUpload：它先跑嚴格 glTF 驗證，驗不過就擲例外 ⇒ 量不到 ≠ 沒有超標。
type Size = { w: number; h: number; fmt: string };
const UNKNOWN: Size = { w: -1, h: -1, fmt: "unknown" };

function imageSize(b: Uint8Array, at: number): Size {
  const u8 = (i: number) => b[at + i]!;
  const be32 = (i: number) => (u8(i) << 24 | u8(i + 1) << 16 | u8(i + 2) << 8 | u8(i + 3)) >>> 0;
  const le16 = (i: number) => u8(i) | u8(i + 1) << 8;
  const le24 = (i: number) => u8(i) | u8(i + 1) << 8 | u8(i + 2) << 16;
  const le32 = (i: number) => (u8(i) | u8(i + 1) << 8 | u8(i + 2) << 16 | u8(i + 3) << 24) >>> 0;

  if (u8(0) === 0x89 && u8(1) === 0x50) return { w: be32(16), h: be32(20), fmt: "png" };

  if (u8(0) === 0xff && u8(1) === 0xd8) {                                   // JPEG：找 SOF
    for (let i = at + 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: b[i + 5]! << 8 | b[i + 6]!, w: b[i + 7]! << 8 | b[i + 8]!, fmt: "jpeg" };
      }
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
      i += 2 + (b[i + 2]! << 8 | b[i + 3]!);
    }
    return { ...UNKNOWN, fmt: "jpeg?" };
  }

  // ⭐ WebP —— 三種子格式；前一版沒有這一段,於是三顆選單模型「合格」了
  if (u8(0) === 0x52 && u8(1) === 0x49 && u8(8) === 0x57 && u8(9) === 0x45) {
    const tag = String.fromCharCode(u8(12), u8(13), u8(14), u8(15));
    if (tag === "VP8X") return { w: le24(24) + 1, h: le24(27) + 1, fmt: "webp/VP8X" };
    if (tag === "VP8 ") return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff, fmt: "webp/VP8" };
    if (tag === "VP8L") { const n = le32(21); return { w: (n & 0x3fff) + 1, h: (n >> 14 & 0x3fff) + 1, fmt: "webp/VP8L" }; }
    return { ...UNKNOWN, fmt: "webp?" };
  }

  if (u8(0) === 0xab && u8(1) === 0x4b && u8(2) === 0x54 && u8(3) === 0x58) { // KTX2
    return { w: le32(20), h: le32(24), fmt: "ktx2" };
  }
  return UNKNOWN;
}

export interface GlbTextures { file: string; max: number; textures: (Size & { i: number; name?: string })[]; unknown: number; error?: string }

export function glbTextures(file: string): GlbTextures {
  const bytes = new Uint8Array(readFileSync(file));
  const empty = { file, max: -1, textures: [], unknown: 0 };
  if (bytes.length < 20) return { ...empty, error: "檔案太短" };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return { ...empty, error: "不是 GLB" };
  let json: { images?: { bufferView?: number; name?: string; mimeType?: string }[]; bufferViews?: { byteOffset?: number }[] };
  let binStart: number;
  try {
    const jsonLength = dv.getUint32(12, true);
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    binStart = 20 + jsonLength + 8;
  } catch (error) { return { ...empty, error: `JSON 區塊讀不開：${error instanceof Error ? error.message : error}` }; }

  const textures = (json.images ?? []).map((image, i) => {
    if (image.bufferView === undefined) return { i, name: image.name, ...UNKNOWN, fmt: "外部 uri" };   // ⭐ 位元組不在這顆裡
    const bv = json.bufferViews?.[image.bufferView];
    if (!bv) return { i, name: image.name, ...UNKNOWN, fmt: "bufferView 缺席" };
    return { i, name: image.name, ...imageSize(bytes, binStart + (bv.byteOffset ?? 0)) };
  });
  return {
    file, textures,
    max: Math.max(0, ...textures.flatMap((t) => [t.w, t.h])),
    unknown: textures.filter((t) => t.w < 0).length,
  };
}

// ── 可達性：四條路 ───────────────────────────────────────────────────────────
const rel = (file: string) => file.slice(ROOT.length + 1);          // content/ 之下的相對路徑
const walkGlb = (dir: string, out: string[] = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkGlb(p, out); else if (e.name.endsWith(".glb")) out.push(p);
  }
  return out;
};
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const docsIn = (dir: string) => existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => join(dir, f)) : [];
const glbOfKey = (key: string): string | null => {
  const p = join(ROOT, "models", `${key}.json`);
  if (!existsSync(p)) return null;
  const glbPath = readJson(p).glbPath;
  return typeof glbPath === "string" ? glbPath : null;
};

export interface Reach { reachable: Map<string, string[]>; retained: Map<string, string[]>; }

export function reachability(): Reach {
  const reachable = new Map<string, string[]>(), retained = new Map<string, string[]>();
  // ⚠️ 去重：一張地圖擺 40 顆同樣的石頭 ⇒ 理由欄會出現 40 次同一個檔名,把真正的訊息淹掉
  const push = (m: Map<string, string[]>, glb: string | null, why: string) => {
    if (!glb) return; const k = glb.replace(/^content\//, "");
    if (!m.has(k)) m.set(k, []);
    if (!m.get(k)!.includes(why)) m.get(k)!.push(why);
  };

  for (const file of docsIn(join(ROOT, "champions"))) {                       // ① 英雄作用中 + 下拉舊版本
    const id = file.split("/").pop()!.slice(0, -5), ch = readJson(file);
    push(reachable, glbOfKey(ch.modelKey), `英雄作用中 ${id}`);
    for (const v of ch.modelVersions ?? []) {
      if (v.modelKey !== ch.modelKey) push(retained, glbOfKey(v.modelKey), `${id} 下拉「${v.label ?? "?"}」`);
    }
  }
  for (const file of docsIn(join(ROOT, "skins"))) {                           // ② 皮膚
    const s = readJson(file);
    if (s.modelKey) push(reachable, glbOfKey(s.modelKey), `皮膚 ${file.split("/").pop()!.slice(0, -5)}`);
  }
  // ③ ⭐ 直接路徑字串 —— ⛔ 只掃**消費端**，⚠️ 這一格是這支工具最容易寫錯的地方
  //
  // 全 content/ 底下寫得出 `assets/models/**.glb` 的有四類，⭐ 而只有一類是「有人在用它」：
  //  · `maps/`(7) `arenas/`(13)          ⇒ ⭐ **消費端**：這張地圖要擺這顆模型
  //  · `models/`(1067)                    ⇒ ⛔ **定義**：宣告這顆模型在哪,⛔ 不是有人用它
  //                                          （英雄／皮膚是透過 model **key** 指到它的 ⇒ 走①②）
  //  · `assets-manifest.json` / `bundle.json` / `assets-offdisk.json` / `model-budget/*.json`
  //                                       ⇒ ⛔ **清冊**：列出每一顆
  //  · `_lod.json`                        ⇒ 另外走④
  //
  // ⚠️ 把後三類算進來 ⇒ 1154 顆裡 1070 顆「可達」(清冊列了全部) ⇒ ⭐ 這個數字看起來很像真的,
  //    而它只是「檔案存在」的同義詞。⛔ 一個把全部都算成可達的分母,回答不了任何問題。
  for (const dir of ["maps", "arenas"]) {
    for (const p of docsIn(join(ROOT, dir))) {
      for (const m of readFileSync(p, "utf8").matchAll(/"(assets\/models\/[^"]+\.glb)"/g)) {
        push(reachable, m[1]!, `擺在 ${rel(p)}`);
      }
    }
  }
  // ④ ⭐ LOD 變體：可達的 base 展開成 -mid / -small
  const lodFile = join(MODELS_DIR, "_lod.json");
  if (existsSync(lodFile)) {
    const lod = readJson(lodFile);
    for (const [base, entry] of Object.entries(lod.models ?? {}) as [string, Record<string, { path?: string }>][]) {
      const why = reachable.get(base);
      if (!why) continue;
      for (const tier of lod.tiers ?? []) {
        if (entry[tier]?.path) push(reachable, entry[tier]!.path!, `${base} 的 ${tier} LOD`);
      }
    }
  }
  for (const k of reachable.keys()) retained.delete(k);                        // 可達優先
  return { reachable, retained };
}

// ── 報告 ────────────────────────────────────────────────────────────────────
type Verdict = "可達" | "下拉舊版本" | "沒有人引用";
export interface Row extends GlbTextures { path: string; verdict: Verdict; why: string[]; over: boolean }

export function audit(): { rows: Row[]; offdisk: string[] } {
  const { reachable, retained } = reachability();
  const rows: Row[] = walkGlb(MODELS_DIR).map((file) => {
    const path = rel(file), t = glbTextures(file);
    const verdict: Verdict = reachable.has(path) ? "可達" : retained.has(path) ? "下拉舊版本" : "沒有人引用";
    return { ...t, path, verdict, why: reachable.get(path) ?? retained.get(path) ?? [], over: t.max > LIMIT || t.unknown > 0 || !!t.error };
  });
  const offdiskFile = join(ROOT, "assets-offdisk.json");
  const offdisk = existsSync(offdiskFile)
    ? Object.keys(readJson(offdiskFile).entries ?? {}).filter((k) => k.endsWith(".glb") && !existsSync(join(ROOT, k)))
    : [];
  return { rows, offdisk };
}

// ⭐ 量尺自證：兩個方向。已知超標的量得到、已知合規的不誤報。⛔ 只驗一邊的尺在它最需要說話時會沉默。
function calibrate(rows: Row[]): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  const big = rows.filter((r) => r.max > LIMIT && !r.error), small = rows.filter((r) => r.max > 0 && r.max <= LIMIT && !r.error);
  const okBig = big.length > 0, okSmall = small.length > 0;
  lines.push(`${okBig ? "✅" : "⛔"} 「量得到超標」：${big.length} 顆 > ${LIMIT}${big[0] ? `（例 ${big[0].path} = ${big[0].max}）` : ""}`);
  lines.push(`${okSmall ? "✅" : "⛔"} 「不誤報合規」：${small.length} 顆 ≤ ${LIMIT}${small[0] ? `（例 ${small[0].path} = ${small[0].max}）` : ""}`);
  const fmts = [...new Set(rows.flatMap((r) => r.textures.map((t) => t.fmt)))].sort();
  lines.push(`ℹ️ 讀到的影像格式：${fmts.join("、") || "（無）"}`);
  const blind = rows.filter((r) => r.unknown > 0);
  lines.push(`${blind.length ? "⚠️" : "✅"} 讀不到尺寸：${blind.length} 顆${blind.length ? `（${blind.slice(0, 3).map((r) => r.path).join("、")}…）` : ""}`);
  return { ok: okBig && okSmall, lines };
}

const argv = process.argv.slice(2);
const scope = argv.includes("--scope") ? argv[argv.indexOf("--scope") + 1] : "reachable";
const { rows, offdisk } = audit();
const bad = rows.filter((r) => r.over && (scope === "all" || r.verdict === "可達"));

if (argv.includes("--json")) {
  console.log(JSON.stringify({ limit: LIMIT, scope, offdisk, rows }, null, 1));
} else if (argv.includes("--markdown")) {
  const count = (v: Verdict, over: boolean) => rows.filter((r) => r.verdict === v && r.over === over).length;
  console.log(`| 分類 | 總數 | ⛔ > ${LIMIT} |\n|---|---:|---:|`);
  for (const v of ["可達", "下拉舊版本", "沒有人引用"] as Verdict[]) {
    console.log(`| ${v} | ${count(v, true) + count(v, false)} | ${count(v, true)} |`);
  }
  if (bad.length) {
    console.log(`\n| ⛔ 超標且**${scope === "all" ? "全部" : "玩家載得到"}** | 最長邊 | 超標張數 | 為什麼載得到 |\n|---|---:|---:|---|`);
    for (const r of bad) console.log(`| \`${r.path}\` | ${r.error ?? r.max} | ${r.textures.filter((t) => t.w > LIMIT || t.h > LIMIT).length} | ${r.why.join("；") || "—"} |`);
  }
  if (offdisk.length) console.log(`\n⚠️ 本機量不到（位元組在 S3，見 \`assets-offdisk.json\`）：${offdisk.length} 顆 —— ${offdisk.map((f) => `\`${f}\``).join("、")}`);
} else if (argv.includes("--calibrate")) {
  const { ok, lines } = calibrate(rows);
  console.log(lines.join("\n"));
  if (!ok) process.exitCode = 2;
} else {
  const n = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  console.log(`glb 總數 ${rows.length}　可達 ${n("可達")}　下拉舊版本 ${n("下拉舊版本")}　沒有人引用 ${n("沒有人引用")}`);
  console.log(`⛔ 超過 ${LIMIT}：全部 ${rows.filter((r) => r.over).length}　其中**玩家載得到** ${rows.filter((r) => r.over && r.verdict === "可達").length}`);
  for (const r of rows.filter((r) => r.over && r.verdict === "可達")) console.log(`   ⛔ ${r.path}　${r.error ?? `最長邊 ${r.max}`}　← ${r.why.join("；")}`);
  if (offdisk.length) console.log(`⚠️ 本機量不到（S3）：${offdisk.join("、")}`);
}

if (argv.includes("--check")) {
  if (bad.length) {
    console.error(`\n⛔ ${bad.length} 顆 .glb 貼圖超過 ${LIMIT}（scope=${scope}）：`);
    for (const r of bad) console.error(`   ${r.path}　${r.error ?? (r.unknown ? `${r.unknown} 張讀不到尺寸` : `最長邊 ${r.max}`)}　← ${r.why.join("；") || "沒有人引用"}`);
    process.exitCode = 1;
  } else if (offdisk.length) {
    console.error(`\n⚠️ 沒有超標,⛔ 但 ${offdisk.length} 顆在 S3 本機量不到：${offdisk.join("、")}`);
  } else {
    console.log(`\n✅ scope=${scope} 全部 ≤ ${LIMIT}`);
  }
}
