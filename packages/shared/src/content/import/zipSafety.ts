/**
 * ZIP transport safety —— `ggd-editor-package@1` 進門前的**純檢查**（Lane 3 / G1）。
 *
 * 契約：`GGD_EDITOR_PACKAGE_SPEC.md` §8（ZIP 結構與規則）、
 * `main_load_editor_plan.md` §4.3（Transport safety 逐條）、§11 第 1 步
 * 「驗 content type、大小、ZIP path safety、duplicate/case collision、hash」。
 *
 * ---------------------------------------------------------------------------
 * 這支函式**不解壓、不寫磁碟、不執行任何東西**
 * ---------------------------------------------------------------------------
 * 輸入只有 central-directory 的 metadata（`ZipEntryMeta[]`），輸出是通過與否 +
 * 一串**指名攻擊種類**的診斷。這樣設計的理由：一旦你已經把 bytes 寫到磁碟上，
 * zip-slip 就已經發生了 —— 檢查必須在**任何 I/O 之前**用 central directory 做完。
 * 所以這裡刻意不依賴任何 zip 函式庫（本 monorepo 也沒有），由呼叫端負責讀出
 * metadata 再餵進來；platform 的搬遷 ZIP route 是 Go 的另一條路，規格 §15 明令
 * **不共用**，這裡也沒有任何耦合。
 *
 * ⚠️ 診斷碼必須說出「是哪一種攻擊」。只回 `false` 的守門員在事故當下毫無用處 ——
 * 被拒的 package 送不進來，而 owner 只會看到「匯入失敗」。
 *
 * ---------------------------------------------------------------------------
 * 為什麼每一個上限都是一格欄位（第一守則）
 * ---------------------------------------------------------------------------
 * 這些數字沒有一個是「正確答案」，它們全部是**風險與便利的取捨**，而取捨會被
 * owner 推翻（`hpMult` 100→20、攻速上限 2.5→4→10 都是前例）。所以它們住在
 * 一張表 `ZIP_LIMITS` 裡，`checkZipSafety` 收 `Partial<ZipLimits>` override，
 * 未來後台那一格直接餵進來即可，不必改程式。
 *
 * ⚠️ 而 override 本身也要有**上界不只下界**（CLAUDE.md 第一守則）——
 * 一個打錯的 `maxTotalUncompressedBytes: 1e15` 等於把 zip bomb 的門直接拆掉，
 * 所以 `ZIP_LIMIT_BOUNDS` 會把每一格夾回可接受區間。
 */

/** ZIP central directory 的單筆 entry metadata。呼叫端讀出來，這裡只做純檢查。 */
export interface ZipEntryMeta {
  /** central directory 裡的**原始**檔名，未正規化（正規化本身就是攻擊面）。 */
  path: string;
  /** 解壓後 bytes（central directory 宣告值）。 */
  uncompressedSize: number;
  /** ZIP 內佔用 bytes。 */
  compressedSize: number;
  /** 是否為目錄 entry（通常是尾端 `/`）。 */
  isDirectory?: boolean;
  /**
   * external attributes 的高 16 bits（unix mode）。有給就從這裡推導
   * symlink（`S_IFLNK`）與 device/fifo/socket；沒給就只能靠下面兩個明旗標。
   */
  unixMode?: number;
  /** 呼叫端已知這是 symlink（沒有 unixMode 時的明旗標）。 */
  isSymlink?: boolean;
  /** general purpose bit 11：檔名宣告為 UTF-8。 */
  utf8NameFlag?: boolean;
}

/** 一筆診斷。`code` 是機器讀的攻擊種類，`message` 是給人看的繁中說明。 */
export interface ZipSafetyDiagnostic {
  code: ZipSafetyCode;
  /** 觸發的 entry 路徑；整包層級的診斷是空字串。 */
  path: string;
  message: string;
  /** 數量類診斷才有：被違反的上限與實際值。 */
  limit?: number;
  actual?: number;
}

export interface ZipSafetyResult {
  ok: boolean;
  diagnostics: ZipSafetyDiagnostic[];
  /** 通過檢查時的統計，方便呼叫端記進 operation report。 */
  entryCount: number;
  totalUncompressedBytes: number;
  totalCompressedBytes: number;
}

export type ZipSafetyCode =
  | 'ZIP_EMPTY'
  | 'ZIP_MANIFEST_MISSING'
  | 'ZIP_SLIP'
  | 'ZIP_ABSOLUTE_PATH'
  | 'ZIP_NON_POSIX_PATH'
  | 'ZIP_SYMLINK'
  | 'ZIP_DEVICE_ENTRY'
  | 'ZIP_DUPLICATE_ENTRY'
  | 'ZIP_CASE_COLLISION'
  | 'ZIP_PATH_NOT_ALLOWED'
  | 'ZIP_FORBIDDEN_ARTIFACT'
  | 'ZIP_NON_UTF8_NAME'
  | 'ZIP_PATH_TOO_LONG'
  | 'ZIP_PATH_TOO_DEEP'
  | 'ZIP_ENTRY_COUNT_EXCEEDED'
  | 'ZIP_ENTRY_TOO_LARGE'
  | 'ZIP_TOTAL_TOO_LARGE'
  | 'ZIP_ARCHIVE_TOO_LARGE'
  | 'ZIP_COMPRESSION_RATIO_EXCEEDED';

/* ------------------------------------------------------------------------ */
/* 一份表，兩個消費端（比照 sim/effects/knockbackLimits.ts）                  */
/* ------------------------------------------------------------------------ */

export interface ZipLimits {
  /** entry 總數上限。擋的是「一百萬個空檔」——解壓迴圈本身就是 DoS，跟大小無關。 */
  maxEntryCount: number;
  /** 單一 entry 解壓後 bytes 上限。擋的是「一份 JSON 展開成 2GB」。 */
  maxEntryUncompressedBytes: number;
  /** 全部 entry 解壓後 bytes 總和上限。擋的是「一萬個各 1MB」繞過單檔上限。 */
  maxTotalUncompressedBytes: number;
  /** ZIP 檔本身（壓縮後）bytes 上限。擋的是上傳頻寬與暫存空間，最外層那道。 */
  maxArchiveCompressedBytes: number;
  /** 單一 entry 的壓縮比上限（解壓後 / 壓縮後）。擋的是經典 zip bomb。 */
  maxCompressionRatio: number;
  /**
   * 小於這個 bytes 的 entry **不查壓縮比**。理由：一份 2KB 的 JSON 壓成 200 bytes
   * 是 10×，完全正常；壓縮比只在檔案夠大時才是 bomb 的訊號。沒有這一格，
   * 正常的 package 會被自己的守衛擋在門外。
   */
  ratioCheckMinUncompressedBytes: number;
  /** 單一路徑字元數上限。擋的是路徑長度本身當攻擊（某些檔案系統會爆）。 */
  maxPathLength: number;
  /** 路徑層數上限。§8 最深是 `compiled/distribution/<collection>/<id>.json` = 4。 */
  maxPathDepth: number;
}

/**
 * 出貨值。每一格的理由寫在 `ZipLimits` 的欄位註解（「它擋的是什麼」），
 * 這裡只記**為什麼是這個數字**。
 *
 * 基準：§8 的 package 全部是 JSON 文件，V1 明令不含 binary assets。GGD 出貨的
 * `content/` 整棵樹（1,900+ 份文件）打包起來也遠小於下面的總量上限，所以這些
 * 數字對「合法的最大 package」留了很大的頭，只擋明顯異常的東西。
 */
export const ZIP_LIMITS: ZipLimits = {
  maxEntryCount: 20_000,
  maxEntryUncompressedBytes: 8 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxArchiveCompressedBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
  ratioCheckMinUncompressedBytes: 64 * 1024,
  maxPathLength: 255,
  maxPathDepth: 6,
};

/**
 * 每一格 override 的可接受區間 —— **上界不只下界**。
 * 後台把 `maxTotalUncompressedBytes` 打成 1e15 時，這裡把它夾回來；
 * 一個被拆掉的守衛跟沒有守衛是同一件事，而它不會有任何症狀。
 */
export const ZIP_LIMIT_BOUNDS: Readonly<Record<keyof ZipLimits, { min: number; max: number }>> = {
  maxEntryCount: { min: 1, max: 200_000 },
  maxEntryUncompressedBytes: { min: 1024, max: 64 * 1024 * 1024 },
  maxTotalUncompressedBytes: { min: 1024, max: 1024 * 1024 * 1024 },
  maxArchiveCompressedBytes: { min: 1024, max: 512 * 1024 * 1024 },
  maxCompressionRatio: { min: 2, max: 5_000 },
  ratioCheckMinUncompressedBytes: { min: 0, max: 8 * 1024 * 1024 },
  maxPathLength: { min: 16, max: 1024 },
  maxPathDepth: { min: 1, max: 16 },
};

/**
 * §8 允許的路徑前綴。其餘一律 `ZIP_PATH_NOT_ALLOWED`。
 *
 * ⭐⭐ GH#966 —— `assets` 是**第五個**，而它與前四個**不同**：前四個底下只收 `.json`，
 * ⭐ 它底下只收 {@link ZIP_ALLOWED_ASSET_EXTENSIONS} 的圖片。
 *
 * ⚠️ ⭐ **這一格在 2026-09-04 之前是這個功能的死路，而票文以為它已經通了**：
 * 票文寫著「S4 路徑穿越已覆蓋 ⇒ `zPackagePath` 的正則已經允許這個形狀」——
 * ⭐ 那半句是對的（正則確實允許），⛔ 而 `checkZipSafety` 在**更早**的一層
 * 以 `ZIP_PATH_NOT_ALLOWED` 把整包擋掉了。
 * ⇒ ⭐ 兩個名詞（正則、傳輸層）**各自都對**，⛔ 而它們的**關係**是斷的
 *   —— CLAUDE.md 記過的「配對式後置條件」同型。
 */
export const ZIP_ALLOWED_ROOTS: readonly string[] = [
  'authoring',
  'compiled',
  'validation',
  'reports',
  'assets',
];

/** §8：`manifest.json` 是唯一允許的根層檔案，而且必須存在。 */
export const ZIP_MANIFEST_PATH = 'manifest.json';

/** 文件那四個前綴底下只收 JSON。 */
export const ZIP_ALLOWED_EXTENSION = '.json';

/**
 * ⭐⭐ GH#966 —— `assets/` 底下允許的**圖片**副檔名（owner：編輯器「自動縮圖轉檔
 * 放入一起打包」）。
 *
 * ⚠️ ⭐ 副檔名**只是宣稱** —— 真相由 magic bytes 決定（`sniffImageHeader()`）。
 * ⛔ 這一層擋的是「你連宣稱都不該這樣宣稱」，⛔ 不是「這真的是一張 PNG」。
 * ⇒ ⭐ 兩層都要有：這一層讓 `.exe` 連進門都不行，那一層讓「改名成 .png 的 .exe」進不去。
 */
export const ZIP_ALLOWED_ASSET_EXTENSIONS: readonly string[] = ['.png', '.webp', '.jpg', '.jpeg'];

/** 二進位資產的前綴（⭐ 它底下**不收** `.json`）。 */
export const ZIP_ASSET_ROOT = 'assets';

/**
 * §8「不含 executable、schema implementation、secret、cache、log、絕對路徑或
 * binary assets」。這些其實也過不了副檔名關，但**指名**比「路徑不被允許」
 * 有用太多 —— 匯入失敗時 owner 要知道 editor 那邊把什麼東西塞進來了。
 */
export const ZIP_FORBIDDEN_NAME_PATTERNS: readonly RegExp[] = [
  /\.(exe|dll|so|dylib|bat|cmd|sh|ps1|py|js|mjs|cjs|ts|wasm)$/i, // executable / schema implementation
  /(^|\/)\.env(\.|$)|(^|\/)(id_rsa|\.npmrc|\.netrc)(\/|$)/i, // secret
  /(^|\/)(node_modules|\.git|\.cache|__pycache__|\.pnpm-store)(\/|$)/i, // cache
  /\.(log|tmp|swp)$/i, // log / temp
  /(^|\/)(\.DS_Store|Thumbs\.db)$/i, // OS junk
  /(^|\/)__MACOSX(\/|$)/, // macOS resource-fork sidecar
];

/** 把 override 夾進 `ZIP_LIMIT_BOUNDS`，非有限數一律退回出貨值。 */
export function resolveZipLimits(overrides?: Partial<ZipLimits>): ZipLimits {
  const out = { ...ZIP_LIMITS };
  for (const key of Object.keys(ZIP_LIMITS) as (keyof ZipLimits)[]) {
    const raw = overrides?.[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const bound = ZIP_LIMIT_BOUNDS[key];
    out[key] = Math.min(bound.max, Math.max(bound.min, raw));
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* 檢查                                                                       */
/* ------------------------------------------------------------------------ */

/** 控制字元（含 NUL 截斷）與 U+FFFD —— 後者是解碼失敗留下的痕跡。 */
const CONTROL_OR_REPLACEMENT = /[\u0000-\u001f\u007f\ufffd]/;

/**
 * 純檢查 —— 不解壓、不寫磁碟、不執行任何東西。
 * 回傳的 `diagnostics` **列出所有問題**（不是第一個就停），因為 editor 那邊
 * 一次修完比來回六趟便宜。
 */
export function checkZipSafety(
  entries: readonly ZipEntryMeta[],
  overrides?: Partial<ZipLimits>,
): ZipSafetyResult {
  const limits = resolveZipLimits(overrides);
  const diagnostics: ZipSafetyDiagnostic[] = [];
  const add = (d: ZipSafetyDiagnostic) => diagnostics.push(d);

  let totalUncompressed = 0;
  let totalCompressed = 0;
  const seenExact = new Set<string>();
  const seenFolded = new Map<string, string>();
  let sawManifest = false;

  if (entries.length === 0) {
    add({ code: 'ZIP_EMPTY', path: '', message: 'ZIP 沒有任何 entry。' });
  }
  if (entries.length > limits.maxEntryCount) {
    add({
      code: 'ZIP_ENTRY_COUNT_EXCEEDED',
      path: '',
      message: `entry 數 ${entries.length} 超過上限 ${limits.maxEntryCount}。`,
      limit: limits.maxEntryCount,
      actual: entries.length,
    });
  }

  for (const entry of entries) {
    const raw = entry.path ?? '';
    const isDir = entry.isDirectory === true || raw.endsWith('/');

    // ---- 檔名編碼：非 UTF-8 或含控制字元／U+FFFD（mojibake 的證據）-------
    if (CONTROL_OR_REPLACEMENT.test(raw) || (entry.utf8NameFlag === false && /[^\x20-\x7e]/.test(raw))) {
      add({ code: 'ZIP_NON_UTF8_NAME', path: raw, message: '檔名不是合法 UTF-8（或含控制字元）。' });
      continue; // 名字都讀不準，後面的路徑判斷沒有意義
    }

    // ---- 檔案型別：symlink / device ------------------------------------
    // unixMode 高位是 S_IFMT：0xa000 = link、0x2000/0x6000 = char/block device、
    // 0x1000 = fifo、0xc000 = socket。regular(0x8000) 與 dir(0x4000) 之外一律拒。
    const fmt = typeof entry.unixMode === 'number' ? entry.unixMode & 0xf000 : undefined;
    if (entry.isSymlink === true || fmt === 0xa000) {
      add({ code: 'ZIP_SYMLINK', path: raw, message: 'symlink entry：解壓後可指向 ZIP 外的檔案。' });
      continue;
    }
    if (fmt !== undefined && fmt !== 0x8000 && fmt !== 0x4000) {
      add({ code: 'ZIP_DEVICE_ENTRY', path: raw, message: 'device／fifo／socket entry 不是內容文件。' });
      continue;
    }

    // ---- 路徑形狀：絕對路徑 / 非 POSIX 分隔 / zip-slip ------------------
    if (raw.startsWith('/') || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) {
      add({ code: 'ZIP_ABSOLUTE_PATH', path: raw, message: '絕對路徑（含 Windows 磁碟機與 UNC）不允許。' });
      continue;
    }
    if (raw.includes('\\')) {
      add({ code: 'ZIP_NON_POSIX_PATH', path: raw, message: 'ZIP 路徑必須用 POSIX `/` 分隔。' });
      continue;
    }
    const segments = raw.split('/').filter((s) => s.length > 0);
    if (segments.some((s) => s === '..' || s === '.')) {
      add({ code: 'ZIP_SLIP', path: raw, message: '路徑含 `..`／`.`，解壓時可逃出目標目錄（zip-slip）。' });
      continue;
    }
    if (raw.length > limits.maxPathLength) {
      add({
        code: 'ZIP_PATH_TOO_LONG',
        path: raw,
        message: `路徑長度 ${raw.length} 超過上限 ${limits.maxPathLength}。`,
        limit: limits.maxPathLength,
        actual: raw.length,
      });
      continue;
    }
    if (segments.length > limits.maxPathDepth) {
      add({
        code: 'ZIP_PATH_TOO_DEEP',
        path: raw,
        message: `路徑層數 ${segments.length} 超過上限 ${limits.maxPathDepth}。`,
        limit: limits.maxPathDepth,
        actual: segments.length,
      });
      continue;
    }

    const normalized = segments.join('/');

    // ---- duplicate / case collision ------------------------------------
    // ⚠️ 自己比 case-folded：macOS（大小寫不敏感）與 Linux（敏感）對同一份 ZIP
    // 會解出不同的檔案集合，靠檔案系統判斷等於讓平台決定內容 —— 這正是
    // 「開發機綠、線上紅」的來源。NFC 正規化是因為 macOS 產的 ZIP 常帶 NFD。
    if (seenExact.has(normalized)) {
      add({ code: 'ZIP_DUPLICATE_ENTRY', path: raw, message: '同一個路徑出現兩次。' });
      continue;
    }
    seenExact.add(normalized);
    const folded = normalized.normalize('NFC').toLowerCase();
    const prior = seenFolded.get(folded);
    if (prior !== undefined) {
      add({
        code: 'ZIP_CASE_COLLISION',
        path: raw,
        message: `與 \`${prior}\` 只差大小寫／Unicode 正規化，在不同作業系統會解出不同結果。`,
      });
      continue;
    }
    seenFolded.set(folded, normalized);

    // ---- 明確禁止的產物（executable / secret / cache / log）-------------
    if (ZIP_FORBIDDEN_NAME_PATTERNS.some((re) => re.test(normalized))) {
      add({
        code: 'ZIP_FORBIDDEN_ARTIFACT',
        path: raw,
        message: 'executable／secret／cache／log 等非內容產物不得放進 package。',
      });
      continue;
    }

    // ---- allowlist（§8 的那幾個前綴，其餘一律拒）------------------------
    if (isDir) {
      if (!ZIP_ALLOWED_ROOTS.includes(segments[0] ?? '')) {
        add({ code: 'ZIP_PATH_NOT_ALLOWED', path: raw, message: '目錄不在 §8 允許的前綴內。' });
      }
      continue; // 目錄不計大小
    }
    const root = segments[0] ?? '';
    // ⭐ 每個前綴有**自己的**副檔名白名單：文件那四個收 `.json`，`assets/` 收圖片。
    //   ⛔ 一份共用的清單會讓 `authoring/x.png` 也通過（那是內容樹，⛔ 不是素材）。
    const allowedExts =
      root === ZIP_ASSET_ROOT ? ZIP_ALLOWED_ASSET_EXTENSIONS : [ZIP_ALLOWED_EXTENSION];
    if (normalized === ZIP_MANIFEST_PATH) {
      sawManifest = true;
    } else if (
      !ZIP_ALLOWED_ROOTS.includes(root) ||
      segments.length < 2 ||
      !allowedExts.some((ext) => normalized.toLowerCase().endsWith(ext))
    ) {
      add({
        code: 'ZIP_PATH_NOT_ALLOWED',
        path: raw,
        message:
          `只允許 \`${ZIP_MANIFEST_PATH}\`、` +
          `${ZIP_ALLOWED_ROOTS.filter((r) => r !== ZIP_ASSET_ROOT).map((r) => `\`${r}/\``).join('／')} 下的 \`${ZIP_ALLOWED_EXTENSION}\`、` +
          `以及 \`${ZIP_ASSET_ROOT}/\` 下的 ${ZIP_ALLOWED_ASSET_EXTENSIONS.map((e) => `\`${e}\``).join('／')}。`,
      });
      continue;
    }

    // ---- zip bomb：單檔大小 / 壓縮比 / 累計 ------------------------------
    const un = Math.max(0, entry.uncompressedSize || 0);
    const comp = Math.max(0, entry.compressedSize || 0);
    totalUncompressed += un;
    totalCompressed += comp;

    if (un > limits.maxEntryUncompressedBytes) {
      add({
        code: 'ZIP_ENTRY_TOO_LARGE',
        path: raw,
        message: `解壓後 ${un} bytes 超過單檔上限 ${limits.maxEntryUncompressedBytes}。`,
        limit: limits.maxEntryUncompressedBytes,
        actual: un,
      });
    }
    if (un >= limits.ratioCheckMinUncompressedBytes) {
      const ratio = un / Math.max(1, comp);
      if (ratio > limits.maxCompressionRatio) {
        add({
          code: 'ZIP_COMPRESSION_RATIO_EXCEEDED',
          path: raw,
          message: `壓縮比 ${ratio.toFixed(1)}× 超過上限 ${limits.maxCompressionRatio}×（zip bomb）。`,
          limit: limits.maxCompressionRatio,
          actual: ratio,
        });
      }
    }
  }

  if (totalUncompressed > limits.maxTotalUncompressedBytes) {
    add({
      code: 'ZIP_TOTAL_TOO_LARGE',
      path: '',
      message: `解壓後總量 ${totalUncompressed} bytes 超過上限 ${limits.maxTotalUncompressedBytes}。`,
      limit: limits.maxTotalUncompressedBytes,
      actual: totalUncompressed,
    });
  }
  if (totalCompressed > limits.maxArchiveCompressedBytes) {
    add({
      code: 'ZIP_ARCHIVE_TOO_LARGE',
      path: '',
      message: `ZIP 本身 ${totalCompressed} bytes 超過上限 ${limits.maxArchiveCompressedBytes}。`,
      limit: limits.maxArchiveCompressedBytes,
      actual: totalCompressed,
    });
  }
  if (!sawManifest && entries.length > 0) {
    add({ code: 'ZIP_MANIFEST_MISSING', path: '', message: `根層缺少 \`${ZIP_MANIFEST_PATH}\`。` });
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    entryCount: entries.length,
    totalUncompressedBytes: totalUncompressed,
    totalCompressedBytes: totalCompressed,
  };
}
