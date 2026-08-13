/**
 * 出貨的 content/vfx/godie-* 必須等於 extract_particles.py 現在的輸出 —— GH#110。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這一條在守什麼（以及為什麼既有的測試都守不到）
 *
 * 2026-07-24 (48f487c3) 修好了兩個抽取缺陷：`emitter.radius` 從 `width*scale`
 * 改成 `max(width,length)/2*scale`（舊的大 2 倍，而且把 PRE2 的 `Length` 整個
 * 丟掉），`burstCount` 拿掉了寫死的 0.3 折扣。**修好的是工具，資料沒有跟著重生**
 * —— 228 份出貨文件裡的 226 份帶著舊數字活了九天，而整套測試全綠，因為每一條
 * 碰到這些文件的測試讀的都是「磁碟上現在是什麼就是什麼」（失敗形態 ⑤：被測的
 * 不是出貨的那個）。
 *
 * `tools/w3x-import/test/emitter_radius_crosscheck.py` 也守不到：它證明的是
 * Python 與 `apps/client/src/render/vfx/w3xEmitter.ts` 兩條程式碼路徑算出同一個
 * 半徑 —— 兩邊一起對、資料一起錯，它照樣綠。全 repo 沒有任何測試 pin 住這些值。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 形狀取自 packages/shared/src/content/shippedBundleIsCurrent.test.ts
 *
 *   shippedBundleIsCurrent   「出貨的 bundle 等於從原始檔重建的嗎？」
 *   這一檔                    「出貨的 vfx 等於從原始 MDX 重抽的嗎？」
 *
 * 兩層，刻意不對稱：
 *
 *   層 A（一定跑，不需要 python3）
 *       比對 vfx-provenance.json：工具指紋 + 每份文件「產生當下的雜湊」。
 *       它抓得到「工具改了但資料沒重生」與「資料被手改了」，但它讀的是紀錄不是
 *       行為 —— 單獨存在的話就是失敗形態 ⑥。所以它永遠只是第二層。
 *
 *   層 B（有 python3 才跑）
 *       真的把 extract_particles.py 對著 out/GoDieEX22s/raw/*.mdx 重跑一次，
 *       逐欄位比對。這一層才是「比的是工具現在的輸出」，把
 *       `emission_disc_radius()` 改回舊讀法它就會紅。
 *
 * ⚠️ 層 B 跑的是 `--overwrite-tuned`。沒有它，抽取器會照 provenance 分類「保留」
 * 手調過的文件，於是被保留的那些在比對時**永遠相等** —— 守衛會親手把自己要找的
 * 東西藏起來。要比的是「工具今天算出什麼」，不是「一次真實的跑會在磁碟上留下
 * 什麼」。
 *
 * ⚠️ 失敗訊息刻意不寫 `expect(bigObject).toEqual(other)`：282 份文件的整包比對
 * 會傾印好幾 MB。一個沒人讀得完的失敗訊息，下一個人的處理方式就是刪掉這條測試
 * （shippedBundleIsCurrent 的檔頭記了同一課）。這裡只報「哪一份、哪個欄位、
 * 舊值→新值」，並且封頂在 MAX_REPORTED 行。
 *
 * 這一條紅了要做的事：
 *
 *     python3 tools/w3x-import/extract_particles.py && pnpm content:build
 *     git add content/ tools/w3x-import/out/
 *
 * 不要靠放寬比對來修它。需要活過重生的手調，屬於抽取器裡面（#37 的
 * `ribbon_trail_budget()` 就是這樣被收回去的），不屬於 54 份被編輯過的檔案。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const RAW = join(ROOT, "out", "GoDieEX22s", "raw");
const SIDECAR = join(ROOT, "out", "GoDieEX22s", "vfx-provenance.json");
const SHIPPED_VFX = join(ROOT, "..", "..", "content", "vfx");

/** Keep in sync with TOOL_SOURCE_FILES in extract_particles.py. */
const TOOL_SOURCES = ["extract_particles.py", join("w3xlib", "particles.py")];

/** How many drifted fields to print before truncating. See the header. */
const MAX_REPORTED = 25;

/**
 * 顯式的手調排除清單：doc id -> 理由。
 *
 * ⚠️ 這是這個檔案裡最容易被誤用的東西。**排除必須是一份寫出來的名單加理由**，
 * 不能是「不一樣就當作手調」—— 後者正是 GH#110 的腐爛機制本身：
 * `tuned = shipped != fresh` 分不出「有人手調過」與「工具修好了但資料沒重生」，
 * 兩種情況都「不一樣」，於是它把每一個案例都解讀成「保留」，親手把缺陷釘了九天。
 *
 * 現在是空的，而且這是刻意的結果不是巧合：#37 刀光殘影對 54 份 ribbon 的手調
 * 已經被反推成 `extract_particles.ribbon_trail_budget()`，所以一次乾淨的重跑
 * 就會重現它們。**一筆新的排除等於承認「有一段調整只存在於被編輯過的數字裡」**
 * —— 先試著把它寫進抽取器，寫不進去才寫在這裡，而且理由要寫「為什麼它沒辦法
 * 被重新推導出來」。
 *
 * 下面 STALE-EXEMPTION 那一條會確認每一筆排除**現在真的還不一樣**，所以一筆
 * 已經沒必要的排除不會靜靜留著變成永久的豁免權。
 */
const HAND_TUNED_EXEMPTIONS: Record<string, string> = {};

// ---------------------------------------------------------------------------
// environment
// ---------------------------------------------------------------------------

/** The checker imports only stdlib + w3xlib, so a bare python3 is enough. */
function findPython(): string[] | null {
  for (const c of [["python3"], ["/opt/homebrew/bin/python3"], ["/usr/bin/python3"]]) {
    try {
      execFileSync(c[0]!, [...c.slice(1), "-c", "import struct, json, hashlib"], { stdio: "pipe" });
      return c;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

const PY = findPython();
const rawCount = existsSync(RAW) ? readdirSync(RAW).filter((f) => /\.mdx$/i.test(f)).length : 0;

/**
 * The skip reason goes in the TEST NAME, not into a console.warn nobody reads.
 * A guard that quietly evaporates in CI is the same failure this file exists to
 * stop, one level up: 「靜默通過的守衛不是守衛」.
 *
 * Note the asymmetry, and it is deliberate:
 *   · raw/*.mdx are COMMITTED (356 files tracked under out/GoDieEX22s/raw), so
 *     their absence is a broken/partial checkout, not a normal CI condition →
 *     hard failure below, never a skip.
 *   · python3 may genuinely be absent on a machine → layer B skips, and layer A
 *     still runs, so there is no configuration in which BOTH layers vanish.
 */
const envNote =
  PY === null
    ? "python3 不在 → 只跑層 A（provenance），不跑真的抽取"
    : rawCount === 0
      ? "原始 MDX 不在 → 層 B 停跑（下面第一條會紅，不會靜默通過）"
      : `python3 在、raw MDX ${rawCount} 份 → 兩層都跑`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Same rule as extract_particles.tool_fingerprint(): sources in a fixed order. */
function toolFingerprint(): string {
  const h = createHash("sha256");
  for (const rel of TOOL_SOURCES) h.update(readFileSync(join(ROOT, rel)));
  return h.digest("hex").slice(0, 16);
}

/** godie-<stem>-p<i> / -r<i> are extracted; fx.* docs are authored by hand. */
function extractedDocIds(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^godie-.+-[pr]\d+\.json$/.test(f))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

type Flat = Map<string, string>;

/** JSON -> dotted leaf paths, so a diff can name the FIELD and not just the file. */
function flatten(value: unknown, prefix = "", out: Flat = new Map()): Flat {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out.set(prefix, JSON.stringify(value));
  }
  return out;
}

/**
 * ⭐ GH#323 —— 抽取器**不產生**、但出貨端刻意手加的鍵，不算漂移。
 *
 * `ambient` 是唯一一筆（2026-08-13 量到，`godie-gumdam-p0` / `p2`）。
 * ⛔ 它不是殘留：`isSwingTrailDoc()`（`apps/client/src/vfx/swingTrailMath.ts`）
 *    正是用 `ambient === true && mode === "continuous" && anchorBone !== undefined`
 *    認出「這是一條刀光殘影」。把它當漂移刪掉，鋼彈的刀光就**當場消失**
 *    —— 實測 `swingTrailMath.test.ts` 的 8 條 trail 掉成 7 條。
 *
 * ⚠️ 這與 `skillRemakeJsonFresh.test.ts` 排除 `castTimeSec` 是**同一個形狀**：
 *    一個欄位由產生器以外的人擁有，新鮮度閘就不該拿它當證據，
 *    否則它會在每一次乾淨重跑都紅，而永遠紅的守衛沒有人會看。
 * ⚠️ 這張表要保持很短。多一筆就是多一個「產生器不知道的事實」，
 *    加之前先問：這個鍵能不能改成由抽取器自己推導？
 */
const HAND_OWNED_KEYS = new Set(["ambient"]);

/** `id.field: shipped → tool` lines. Empty array means the docs agree. */
function fieldDrift(id: string, shipped: unknown, fresh: unknown): string[] {
  const a = flatten(shipped);
  const b = flatten(fresh);
  const lines: string[] = [];
  for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const av = a.get(key);
    const bv = b.get(key);
    if (av === bv) continue;
    // 手加的鍵：出貨有、工具沒有 ⇒ 不算漂移（見 HAND_OWNED_KEYS 的理由）。
    // ⚠️ 反方向仍然要紅：工具開始產生它、而出貨沒有，那是真的落後。
    if (bv === undefined && HAND_OWNED_KEYS.has(key.split(".").pop() ?? "")) continue;
    if (av === undefined) lines.push(`${id}.${key}: (出貨的沒有這個欄位) → ${bv}`);
    else if (bv === undefined) lines.push(`${id}.${key}: ${av} → (工具不再產生這個欄位)`);
    else lines.push(`${id}.${key}: ${av} → ${bv}`);
  }
  return lines;
}

function report(lines: string[], howToFix: string): string {
  const shown = lines.slice(0, MAX_REPORTED);
  const more = lines.length - shown.length;
  return (
    `${lines.length} 個欄位與 extract_particles.py 目前的輸出不一致` +
    `（格式：文件.欄位: 出貨值 → 工具現在算出來的值）：\n  · ` +
    shown.join("\n  · ") +
    (more > 0 ? `\n  · …另外還有 ${more} 個（只印前 ${MAX_REPORTED} 個）` : "") +
    `\n\n修法：\n    ${howToFix}\n`
  );
}

interface Sidecar {
  schema?: string;
  toolFingerprint?: string;
  options?: { density?: number; trailBudget?: boolean };
  docs?: Record<string, string>;
}

const FIX = "python3 tools/w3x-import/extract_particles.py && pnpm content:build";

// ---------------------------------------------------------------------------
// preconditions — always run, can never be skipped
// ---------------------------------------------------------------------------

describe(`content/vfx 漂移守衛 (GH#110) — 環境：${envNote}`, () => {
  it("★ 原始 MDX 在 repo 裡（它們是被 commit 的，缺了就是 checkout 壞了）", () => {
    expect(
      rawCount,
      `找不到原始 MDX：${RAW}\n` +
        `out/GoDieEX22s/raw/ 底下有 356 個被 git 追蹤的檔，其中 122 份是 .mdx，` +
        `所以它不見代表 checkout 不完整（sparse checkout / LFS 沒抓），不是正常狀況。\n` +
        `這裡刻意不 skip：一條會自己消失的守衛跟沒有守衛是同一件事。`,
    ).toBeGreaterThan(100);
  });

  it("★ provenance 側錄檔在，而且描述的就是這個工具", () => {
    expect(existsSync(SIDECAR), `找不到 ${SIDECAR}；跑一次 ${FIX}`).toBe(true);
    const sc = JSON.parse(readFileSync(SIDECAR, "utf8")) as Sidecar;
    expect(sc.schema).toBe("vfx-provenance@1");
    // 出貨的是「忠實抽取」：density 1.0（不打折）、#37 budget 開著。這兩個是決策，
    // 不是預設值 —— 用 --density=0.3 產生的一份 corpus 會整個對不上原始 MDX。
    expect(sc.options?.density, "出貨的 corpus 必須是 density=1.0 的忠實抽取").toBe(1);
    expect(sc.options?.trailBudget, "出貨的 ribbon 必須帶著 #37 刀光殘影 budget").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 層 A：provenance（不需要 python3）
// ---------------------------------------------------------------------------

describe("層 A · provenance：工具改了而資料沒重生，這裡就會紅", () => {
  const sc = (): Sidecar =>
    existsSync(SIDECAR) ? (JSON.parse(readFileSync(SIDECAR, "utf8")) as Sidecar) : {};

  it("★ 工具指紋等於 extract_particles.py + w3xlib/particles.py 的現況", () => {
    const now = toolFingerprint();
    expect(
      sc().toolFingerprint,
      `抽取器的原始碼變了，但 content/vfx 沒有重生（也沒有重新蓋章）。\n` +
        `  側錄檔記的指紋：${sc().toolFingerprint}\n  現在算出來的：  ${now}\n` +
        `  指紋涵蓋：${TOOL_SOURCES.join(", ")}\n\n修法：\n    ${FIX}\n` +
        `（這一層讀的是紀錄不是行為，所以它只是第二道網；真正比行為的是層 B。）`,
    ).toBe(now);
  });

  it("★ 側錄檔涵蓋每一份出貨的 godie-* 文件，不多不少", () => {
    const shipped = extractedDocIds(SHIPPED_VFX);
    const recorded = Object.keys(sc().docs ?? {}).sort();
    const missing = shipped.filter((id) => !recorded.includes(id));
    const extra = recorded.filter((id) => !shipped.includes(id));
    expect(
      { 出貨有但側錄檔沒有: missing, 側錄檔有但出貨沒有: extra },
      `content/vfx 與 vfx-provenance.json 對不上；跑 ${FIX}`,
    ).toEqual({ 出貨有但側錄檔沒有: [], 側錄檔有但出貨沒有: [] });
  });

  it("★ 每一份出貨文件的位元組都還是工具寫下去的那一份（沒有人手改過）", () => {
    const docs = sc().docs ?? {};
    const drifted: string[] = [];
    for (const id of extractedDocIds(SHIPPED_VFX)) {
      if (id in HAND_TUNED_EXEMPTIONS) continue;
      const recorded = docs[id];
      if (recorded === undefined) continue; // 上一條在管這件事
      const actual = sha256(readFileSync(join(SHIPPED_VFX, `${id}.json`), "utf8"));
      if (actual !== recorded) drifted.push(`${id}: ${recorded.slice(0, 12)} → ${actual.slice(0, 12)}`);
    }
    // 斷言讀的是「幾份」不是那個陣列本身：vitest 會把陣列整個 diff 出來，282 份
    // 全壞的時候那是好幾百行。名字放在訊息裡（封頂 MAX_REPORTED），數字放在斷言上。
    expect(
      drifted.length,
      `${drifted.length} 份文件的位元組不是抽取器寫下去的那一份 —— 有人直接改了檔案（或它們過期了）：\n` +
        `  · ${drifted.slice(0, MAX_REPORTED).join("\n  · ")}` +
        (drifted.length > MAX_REPORTED
          ? `\n  · …另外還有 ${drifted.length - MAX_REPORTED} 份（只印前 ${MAX_REPORTED} 份）`
          : "") +
        `\n\n層 B 會指出到底是哪個欄位。要保留的手調請寫進 HAND_TUNED_EXEMPTIONS（附理由），` +
        `或更好：把它折回 extract_particles.py，像 ribbon_trail_budget() 收下 #37 那樣。`,
    ).toBe(0);
  });

  it("★ 排除清單裡的每一筆都指向一份真的存在的出貨文件", () => {
    const shipped = new Set(extractedDocIds(SHIPPED_VFX));
    const dangling = Object.keys(HAND_TUNED_EXEMPTIONS).filter((id) => !shipped.has(id));
    expect(dangling, `HAND_TUNED_EXEMPTIONS 指到不存在的文件：${dangling.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 層 B：真的重跑抽取器（需要 python3）
// ---------------------------------------------------------------------------

describe.skipIf(PY === null || rawCount === 0)(
  "層 B · 出貨的 content/vfx 逐欄位等於 extract_particles.py 現在的輸出",
  () => {
    const stage = mkdtempSync(join(tmpdir(), "ggd-vfx-current-"));
    let staged = false;

    /**
     * `--overwrite-tuned` 是關鍵的一個旗標，不是順手加的：沒有它，抽取器會照
     * provenance 把「手調過」的文件保留（甚至在 --out-dir 底下把出貨那一份複製
     * 過來當預覽），於是那些文件在這裡永遠相等 —— 守衛會把自己要找的東西藏起來。
     */
    function restage(): void {
      if (staged) return;
      execFileSync(
        PY![0]!,
        [...PY!.slice(1), join(ROOT, "extract_particles.py"), `--out-dir=${stage}`, "--overwrite-tuned"],
        { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
      );
      staged = true;
    }
    afterAll(() => rmSync(stage, { recursive: true, force: true }));

    it("★ 沒有多、沒有少：兩邊的文件清單一樣", () => {
      restage();
      const fresh = extractedDocIds(join(stage, "vfx"));
      const shipped = extractedDocIds(SHIPPED_VFX);
      expect(fresh.length).toBeGreaterThanOrEqual(280);
      const missing = fresh.filter((id) => !shipped.includes(id));
      const orphan = shipped.filter((id) => !fresh.includes(id));
      expect(
        { 工具會產生但沒出貨: missing, 出貨了但工具不再產生: orphan },
        `content/vfx 的文件集合與抽取器的輸出對不上；跑 ${FIX}`,
      ).toEqual({ 工具會產生但沒出貨: [], 出貨了但工具不再產生: [] });
    }, 120_000);

    it("★ 每一個欄位都相等（radius / burstCount / widthAbove / lifespanSec / …）", () => {
      restage();
      const stagedVfx = join(stage, "vfx");
      const drift: string[] = [];
      for (const id of extractedDocIds(stagedVfx)) {
        if (id in HAND_TUNED_EXEMPTIONS) continue; // 顯式豁免，理由寫在清單上
        const shippedPath = join(SHIPPED_VFX, `${id}.json`);
        if (!existsSync(shippedPath)) continue; // 上一條在管這件事
        drift.push(
          ...fieldDrift(
            id,
            JSON.parse(readFileSync(shippedPath, "utf8")),
            JSON.parse(readFileSync(join(stagedVfx, `${id}.json`), "utf8")),
          ),
        );
      }
      // 同上：陣列進訊息（封頂），長度進斷言，失敗輸出才不會變成沒人讀的幾 MB。
      expect(
        drift.length,
        report(drift, `${FIX}\n    git add content/ tools/w3x-import/out/`),
      ).toBe(0);
    }, 120_000);

    /**
     * STALE-EXEMPTION：一筆排除只有在它真的還不一樣的時候才有意義。
     * 沒有這一條，一筆「當年為了某個手調」的排除會在手調被折回抽取器之後永遠
     * 留著，變成那份文件的終身豁免權 —— 之後它真的漂移了也沒人會知道。
     */
    /**
     * The classifier this whole guard leans on, exercised in BOTH directions
     * (stale -> overwrite, hand-tuned -> keep) on real files in a temp tree.
     * Shelled rather than re-implemented in TS for the same reason
     * particles_regen.test.ts shells its checker: a second implementation of
     * the rule can agree with itself while both drift from the extractor.
     */
    it("★ provenance_checks.py：過期與手調被判成相反的兩件事", () => {
      let out = "";
      let code = 0;
      try {
        out = execFileSync(PY![0]!, [...PY!.slice(1), join(HERE, "provenance_checks.py")], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string };
        code = err.status ?? 1;
        out = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
      }
      // Named assertions, so a checker that quietly stopped checking shows up
      // here instead of passing on a bare exit code.
      expect(out, out).toContain("PASS stale doc is overwritable");
      expect(out, out).toContain("PASS hand-tuned doc is kept");
      expect(out, out).toContain("PASS stale and hand-tuned get OPPOSITE verdicts");
      expect(out, out).toContain("PASS so a SECOND run still keeps it");
      expect(out, out).toContain("PASS --out-dir stages the KEPT doc");
      expect(code, out).toBe(0);
    }, 60_000);

    it("★ 排除清單裡沒有已經不需要的項目", () => {
      restage();
      const stagedVfx = join(stage, "vfx");
      const stale: string[] = [];
      for (const [id, why] of Object.entries(HAND_TUNED_EXEMPTIONS)) {
        const shippedPath = join(SHIPPED_VFX, `${id}.json`);
        const freshPath = join(stagedVfx, `${id}.json`);
        if (!existsSync(shippedPath) || !existsSync(freshPath)) continue;
        const lines = fieldDrift(
          id,
          JSON.parse(readFileSync(shippedPath, "utf8")),
          JSON.parse(readFileSync(freshPath, "utf8")),
        );
        if (lines.length === 0) stale.push(`${id}（理由寫的是：${why}）`);
      }
      expect(
        stale,
        `這些文件已經可以被抽取器完整重現了，排除沒有必要 —— 從 ` +
          `HAND_TUNED_EXEMPTIONS 拿掉，否則它們等於拿到終身豁免：\n  · ${stale.join("\n  · ")}`,
      ).toEqual([]);
    }, 120_000);
  },
);
