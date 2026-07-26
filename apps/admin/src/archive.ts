/**
 * 資料搬遷 (task #243) — the pure half of the platform-archive console page.
 *
 * Types, formatting and copy live here rather than in the .tsx so they can be
 * unit-tested without a DOM. The page is the most dangerous surface in the
 * back office, so the sentences it shows are treated as product, not decoration:
 * they are constants with tests, not string literals sprinkled through JSX.
 *
 * THE ONE THING TO KEEP IN MIND WHILE EDITING THIS FILE: an exported archive is
 * every family member's password hash plus every unredeemed invite code. The
 * warnings below are the only thing standing between the owner and mailing that
 * file to himself.
 */

/** Opt-in scope groups, mirroring internal/platformarchive/scope.go. */
export type ArchiveGroup = "core" | "matches" | "history" | "audit" | "replays";

export interface GroupPreview {
  group: ArchiveGroup;
  zh: string;
  entries: number;
  bytes: number;
  note?: string;
}

export interface PreviewResp {
  groups: GroupPreview[];
}

export interface ArchiveManifest {
  kind: string;
  archiveVersion: number;
  exportedAt: string;
  source: {
    dataDir: string;
    host: string;
    contentVersion: string;
    platformVersion: string;
    tool: string;
  };
  scope: { selected: string[]; excluded: { name: string; reason: string }[] };
  collections: {
    name: string;
    kind: string;
    group: string;
    zh?: string;
    entries: number;
    bytes: number;
    sha256: string;
  }[];
  totals: { entries: number; uncompressedBytes: number };
  checksum: string;
}

export interface StageInfo {
  id: string;
  path: string;
  bytes: number;
  uploadedAt: string;
  expiresAt: string;
}

export interface StageResp {
  stage: StageInfo;
  manifest: ArchiveManifest;
  warnings?: string[] | null;
}

export interface PlanItem {
  id: string;
  result: string;
  detail?: string;
}

export interface CollectionPlan {
  collection: string;
  zh: string;
  group: string;
  policy: string;
  added: number;
  unchanged: number;
  written: number;
  skipped: number;
  blocked: number;
  items?: PlanItem[] | null;
}

export interface IdentityCollision {
  collection: string;
  key: string;
  targetAccountId: string;
  archiveAccountId: string;
  resolved: boolean;
}

export interface PlanResp {
  collections: CollectionPlan[];
  collisions?: IdentityCollision[] | null;
  notes?: string[] | null;
  warnings?: string[] | null;
  writes: number;
  blocked: boolean;
  targetPopulated: boolean;
  digest: string;
}

export interface BackupInfo {
  /** The UTC second the backup was taken — its identity, and the only handle the delete route accepts. */
  stamp: string;
  path: string;
  createdAt: string;
  bytes: number;
  entries: number;
  groups?: string[] | null;
  /** What this backup was taken BEFORE, in the operator's language. */
  reason?: string;
  empty: boolean;
}

/** The server's live retention policy, mirrored from platformarchive.Retention(). */
export interface BackupRetentionPolicy {
  ttlDays: number;
  minKeep: number;
}

export interface ApplyResp {
  plan: PlanResp;
  backup?: BackupInfo | null;
  written: number;
  added: number;
  notes?: string[] | null;
  warnings?: string[] | null;
}

export interface StatusResp {
  stage: StageInfo | null;
  backups: BackupInfo[];
  backupBytes: number;
  backupRetention: BackupRetentionPolicy;
  freeBytes: number;
  freeKnown: boolean;
  replayDir: string;
  stageTtlHours: number;
}

/** The upload ceiling, mirrored from platformarchive.MaxUploadBytes. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

/** The value that resolves an identity collision in the archive's favour. */
export const RESOLVE_ADOPT_ARCHIVE = "adopt-archive";

/**
 * THE HEADER WARNING. Permanent, red, and above everything else on the page.
 *
 * It says three things the owner cannot be expected to infer:
 *   1. what is actually inside the file (hashes + live invite codes);
 *   2. how to move it (scp / USB, never email / chat / cloud);
 *   3. that the ZIP's FILE LIST is plaintext — `unzip -l` alone reveals every
 *      username and email, because login resolution uses them as file names.
 *      That is not fixable in engineering; it can only be disclosed.
 */
export const HEADER_WARNING = [
  "這是整個後台最危險的一頁。",
  "匯出的 ZIP 內含每一位家人的密碼雜湊、可以直接拿去註冊的邀請碼，以及管理員權限。任何人拿到這個檔案，等同拿到整個平台。",
  "請用 scp 或隨身碟傳，不要用 email、不要用聊天軟體、不要放雲端硬碟。新主機匯入完成後，立刻把兩邊的檔案刪掉。",
  "另外：ZIP 的檔案清單是明文的。就算一個檔都不解開，光看列表就能看到全家人的使用者名稱和 email —— 因為登入解析就是拿它們當檔名。",
] as const;

/**
 * What is deliberately NOT in the archive. Rendered as a table so "it is not in
 * there" can never be mistaken for "I forgot" — the same discipline the Go
 * exporter applies to its own report.
 *
 * The blizzard-overlay line is the one that prevents a support call: a fresh
 * host looks EMPTY of art, and that is correct.
 */
export const NOT_INCLUDED: readonly { name: string; why: string }[] = [
  { name: "AI 供應商 API 金鑰", why: "明文密鑰。請在新主機的「AI 生成設定」重新輸入。" },
  { name: "Slack 通知 webhook", why: "同樣是密鑰，請在「系統」重新輸入。" },
  {
    name: "素材包 blizzard-overlay（84 MB）",
    why: "不是平台資料，跟著部署映像走。新主機一開始看起來很空是正常的。",
  },
  { name: "結算日誌 journal", why: "帶過去會在新主機重播一次舊的結算。" },
  { name: "擁有者宣告權杖", why: "持有即可宣告新部署的擁有權，永遠不隨檔案移動。" },
];

/**
 * The #179 SECURITY DELTA, stated out loud.
 *
 * The operator-state bundle deliberately refused accounts and invites. This
 * archive REVERSES both, because a migration that leaves the accounts behind is
 * not a migration. That reversal is the entire security difference between the
 * two features and it must be visible in the UI, never silently inherited.
 */
export const SECURITY_DELTA =
  "與 #179 的營運設定包不同：這一包「刻意」帶走帳號與邀請碼。不帶就不叫搬遷 —— " +
  "但這也是它遠比那一包危險的原因。AI 金鑰與 Slack webhook 則維持不帶。";

/** The virgin-host instruction, permanently visible on the import tab. */
export const FRESH_HOST_HELP = [
  "全新主機上還沒有任何帳號，也就沒有人能登入這個後台。",
  "所以第一次匯入請在新主機上用指令跑，不要先註冊帳號（先註冊會製造身分衝突）：",
  "make family-archive-apply ARCHIVE=ggd-platform-archive-….zip",
  "跑完重啟平台，直接用舊主機的帳號密碼登入即可。這一頁的按鈕是給「目標主機已經有正確的管理員」和「重跑一次」用的。",
] as const;

/** Human byte size. Deliberately coarse — this is for a judgement call. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Sum the bytes of the selected groups (core is always selected). */
export function selectedBytes(preview: PreviewResp | null, selected: ReadonlySet<ArchiveGroup>): number {
  if (preview === null) return 0;
  return preview.groups.reduce(
    (acc, g) => (g.group === "core" || selected.has(g.group) ? acc + g.bytes : acc),
    0,
  );
}

/**
 * Whether the export button may be pressed, and why not when it may not.
 *
 * The 512 MB ceiling is not arbitrary: it is the number the platform's body cap
 * and the nginx location both use. Rather than letting the operator discover it
 * as a 413 after a ten-minute upload, the button goes dead and names the fix
 * (deselect the replays and move them with scp).
 */
export function exportBlocker(
  preview: PreviewResp | null,
  selected: ReadonlySet<ArchiveGroup>,
): string | null {
  const total = selectedBytes(preview, selected);
  if (total > MAX_UPLOAD_BYTES) {
    return `目前選取約 ${formatBytes(total)}，超過單次 ${formatBytes(MAX_UPLOAD_BYTES)} 的上限。請取消勾選「對戰回放」，改用 scp -r data/replays/ 直接搬。`;
  }
  return null;
}

/** Roll a plan up into the four numbers the summary line shows. */
export function planTotals(plan: PlanResp): {
  added: number;
  written: number;
  unchanged: number;
  skipped: number;
  blocked: number;
} {
  return plan.collections.reduce(
    (acc, c) => ({
      added: acc.added + c.added,
      written: acc.written + c.written,
      unchanged: acc.unchanged + c.unchanged,
      skipped: acc.skipped + c.skipped,
      blocked: acc.blocked + c.blocked,
    }),
    { added: 0, written: 0, unchanged: 0, skipped: 0, blocked: 0 },
  );
}

/** Unresolved identity collisions — the case that blocks an import by default. */
export function unresolvedCollisions(plan: PlanResp): IdentityCollision[] {
  return (plan.collisions ?? []).filter((c) => !c.resolved);
}

/**
 * The consequence sentence for adopt-archive. It states the OUTCOME rather than
 * the mechanism, because the operator has to be able to predict what happens to
 * the account they are currently signed in as.
 */
export function adoptConsequence(collisions: readonly IdentityCollision[]): string {
  const keys = collisions.map((c) => c.key).join("、");
  return (
    `勾選後：${keys} 之後會解析到封存裡的帳號。被擠掉的帳號不會被刪除，` +
    "只是不再能用這個名稱登入 —— 你會需要用舊主機的帳號密碼重新登入本後台。"
  );
}

/**
 * THE BACKUP WARNING (task #243, blocker 3).
 *
 * Every import silently writes a full snapshot of this host to
 * data/_migration/backups/ before it touches anything. That snapshot is not a
 * log or a diff — it is the SAME format as the export, which means it contains
 * every account document and therefore every argon2id password hash on the
 * deploy. Until this panel existed, nothing in the product said so and nothing
 * ever removed one.
 *
 * The owner's standing position is that he wants to understand what the system
 * is doing rather than have it hidden, so an automatic sweep alone was never an
 * acceptable answer. These sentences plus the delete button are the other half.
 */
export const BACKUP_WARNING = [
  "每次匯入前，系統會先把這台主機「現有的」資料整包備份起來，放在 data/_migration/backups/。",
  "那一包跟匯出檔一樣危險：裡面有全部帳號文件與 argon2id 密碼雜湊。它不會被匯出帶走，但它就躺在這台主機的磁碟上。",
  "備份是匯入唯一的還原點，所以自動清理刻意保守。真的要把憑證從磁碟上移掉，請在下面按「刪除」——那是刻意要你自己動手的。",
] as const;

/**
 * The retention policy as a sentence, built from the numbers the SERVER sent.
 *
 * Deliberately not hard-coded on this side: if the policy in
 * platformarchive/backup.go changes, this line changes with it instead of
 * quietly becoming a lie about what the sweep does.
 */
export function retentionLine(policy: BackupRetentionPolicy | null | undefined): string {
  if (!policy || policy.minKeep < 1 || policy.ttlDays < 1) {
    return "備份保留政策未知 —— 請把這一頁的狀態回報出來，不要自己手動刪 data/_migration/。";
  }
  return (
    `自動清理：超過 ${policy.ttlDays} 天的備份會被移除，但永遠至少保留最新的 ${policy.minKeep} 包。` +
    "在同一次匯入裡連續重試產生的備份不會被清掉 —— 最舊的那一包才是「動手之前」的狀態，" +
    "而自動清理永遠不會刪掉你唯一的還原點。"
  );
}

/** One line summarising the pile, so nobody has to add up a column of sizes. */
export function backupSummary(list: readonly BackupInfo[], totalBytes: number): string {
  if (list.length === 0) return "目前沒有備份。";
  return `${list.length} 包 · 合計 ${formatBytes(totalBytes)} · 全部含密碼雜湊`;
}

/**
 * The confirmation sentence for deleting one backup. It changes when it is the
 * LAST one, because that is the press that leaves the host with no undo — and
 * the automatic sweep is specifically forbidden from ever doing it.
 */
export function deleteBackupConfirm(b: BackupInfo, remaining: number): string {
  const head = `即將永久刪除 ${new Date(b.createdAt).toLocaleString()} 的備份（${formatBytes(b.bytes)}）。`;
  if (remaining <= 1) {
    return (
      head +
      "這是這台主機上「最後一包」備份。刪掉之後，上一次匯入就沒有任何還原點了。" +
      "如果你只是想清掉憑證，這是對的；如果你還可能要回滾，請先把它 scp 到別的地方。"
    );
  }
  return head + "這個動作無法復原。";
}

/** A stable, sortable download name mirroring the server's Content-Disposition. */
export function suggestedFileName(host: string, at: Date): string {
  const safe = (host || "ggd").replaceAll(/[^A-Za-z0-9_-]/g, "-");
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  const stamp =
    `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}` +
    `-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}Z`;
  return `ggd-platform-archive-${safe}-${stamp}.zip`;
}
