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
  /**
   * The COMPLETE per-document verdict list — every entry, including the boring
   * "added" and "unchanged" ones. It is complete because the server EXECUTES it:
   * the commit performs exactly these verdicts and nothing else. An earlier
   * version sent only the interesting entries and let the commit guess the rest,
   * which re-wrote every document on a re-import while the dry run promised
   * zero writes. Filter it here for display (notableItems); never ask the server
   * to shorten it.
   */
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
  /** Documents the commit will write. ApplyResp.written comes out equal to it. */
  writes: number;
  /** The rest of the account, so "0 writes" can be read as a fact, not a gap. */
  unchanged: number;
  skipped: number;
  blockedEntries: number;
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

/** One document, named by collection + id. Mirrors platformarchive.DocRef. */
export interface DocRef {
  collection: string;
  id: string;
}

export interface ApplyResp {
  plan: PlanResp;
  backup?: BackupInfo | null;
  written: number;
  added: number;
  unchanged: number;
  skipped: number;
  /**
   * Every document this import CREATED — the residue a restore cannot remove.
   *
   * Always present: `[]` is the receipt saying "this import created nothing",
   * which is the answer for a no-op re-import and the one the first cut of
   * this feature could not give (it named every byte-identical document on the
   * host, admin included, as an addition).
   */
  addedDocs: DocRef[];
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

/**
 * THE SENTENCE THE PAGE EXISTS TO BE ABLE TO SAY.
 *
 * The dry run is not an estimate and not a preview: the server resolves the
 * approved plan back onto the archive and performs exactly the verdicts it
 * showed, entry by entry. The 409 on a changed digest is what makes that true
 * across the gap between pressing 試算 and pressing 確認.
 *
 * It is stated out loud because the operator is being asked to approve a write
 * to every family account on the strength of a table of numbers. If the numbers
 * were "roughly what will happen", reading them would be pointless.
 */
export const PLAN_IS_THE_CONTRACT =
  "上面的試算就是契約：實際寫入的文件與這裡列出的完全一致，一筆不多、一筆不少。" +
  "如果目標主機在你按下確認之前有任何變動，匯入會直接拒絕並要你重新試算 —— 絕不會憑一份過期的試算動手。";

/**
 * Step 3's headline, derived from the plan rather than hard-coded, so the
 * zero-write case reads as a fact instead of as a suspiciously empty promise.
 *
 * "即將寫入 0 個文件" next to a red 開始匯入 button is exactly the moment the old
 * bug bit: the operator read it, pressed confirm, and 169 documents were
 * rewritten. The wording now names what will happen to the OTHER entries too.
 */
export function commitPromise(plan: PlanResp): string {
  const t = planTotals(plan);
  if (plan.writes === 0) {
    return (
      `這次不會寫入任何文件。封存裡的 ${t.unchanged} 筆和這台主機上的現況相同` +
      (t.skipped > 0 ? `，另有 ${t.skipped} 筆會保留目標主機的版本` : "") +
      "。按下確認只會產生一份備份，資料不會有任何改動。"
    );
  }
  return (
    `即將寫入 ${plan.writes} 個文件（新增 ${t.added}、覆蓋 ${t.written}）` +
    (t.unchanged > 0 ? `，${t.unchanged} 筆相同不動` : "") +
    (t.skipped > 0 ? `，${t.skipped} 筆略過保留目標版本` : "") +
    "。"
  );
}

/** The same account, after the fact. */
export function importOutcome(res: ApplyResp): string {
  return (
    `✅ 匯入完成。寫入 ${res.written} 筆（新增 ${res.added}）、` +
    `相同不動 ${res.unchanged} 筆、略過 ${res.skipped} 筆。` +
    `試算當時承諾寫入 ${res.plan.writes} 筆。`
  );
}

/**
 * Whether the commit did exactly what the dry run promised. The page shows this
 * rather than assuming it: the assertion is cheap, and a mismatch is the one
 * thing about this feature that must never be discovered later from a diff.
 */
export function outcomeMatchesPlan(res: ApplyResp): boolean {
  return (
    res.written === res.plan.writes &&
    res.unchanged === res.plan.unchanged &&
    res.skipped === res.plan.skipped
  );
}

/**
 * The entries an operator needs to READ. `items` is complete by contract, and a
 * full listing of 169 unremarkable documents would bury the two that matter, so
 * the table shows these by default and keeps the rest behind a toggle.
 */
export function notableItems(c: CollectionPlan): PlanItem[] {
  return (c.items ?? []).filter((it) => it.result !== "added" && it.result !== "unchanged");
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

// ---------------------------------------------------------------------------
// THE RECOVERY STORY. Mirrors internal/platformarchive/restore.go WORD FOR
// WORD; archiveRestore.test.ts fails if the two ever drift. Four surfaces (the
// runbook, the CLI, this page and the backup sidecar) must not be able to make
// four slightly different promises about the one paragraph an operator reads
// straight after breaking their own platform.
// ---------------------------------------------------------------------------

/**
 * THE RESTORE COMMAND, and it must carry BOTH flags.
 *
 * See platformarchive.RestoreCommand for the argument. Short version: if the
 * bad import was itself an adopt-archive one, it repointed usernames at its own
 * accounts, so the backup's refs now look like a fresh collision. Without the
 * flag the restore is REFUSED and writes nothing — the operator, already locked
 * out of the account they were signed in as, gets a wall of red at the exact
 * moment they can least afford one. With no collisions the flag is a no-op, so
 * one command covers every case instead of a decision tree.
 */
export function restoreCommand(zipPath: string): string {
  return (
    "docker compose … exec -T platform /platformarchive apply " +
    "-in - -data /data -content /srv/content " +
    `-allow-overwrite -resolve-collisions=adopt-archive < ${zipPath}`
  );
}

/** What re-applying a backup genuinely DOES undo. */
export const RESTORE_RECOVERS: readonly string[] = [
  "被這次匯入蓋掉的文件，會變回匯入前那一版。",
  "被改指到別人身上的使用者名稱／email，會指回原本的帳號 —— 也就是你自己的後台登入會回來。",
  "密碼也一起回來：帳號文件是整份換回去的，所以你原本的密碼照樣能用。",
] as const;

/**
 * What re-applying a backup does NOT undo.
 *
 * Owner decision (2026-07-26): the feature stays NON-DELETING. A restore that
 * reconciled the target by deleting documents would be the only operation here
 * capable of destroying 35 real family accounts, run once, by one frightened
 * non-DBA, who cannot meaningfully audit a "delete 214 documents?" prompt. The
 * residue it would clean up is handled instead by controls that already exist,
 * are reversible and are audited: 婉拒 an account, 撤銷 an invite code — both
 * verified end to end against an IMPORTED account and an IMPORTED code in
 * apps/platform/internal/server/archive_recovery_runbook_test.go.
 */
export const RESTORE_LIMITS: readonly string[] = [
  "它不會刪東西。這次匯入「新增」的帳號、邀請碼、水晶紀錄，還原完都還在 —— 新帳號甚至還能用它自己的密碼登入。",
  "但你不用猜是哪些：匯入完成那一頁會逐筆列出新增了什麼，同一份清單也寫在備份旁邊的 .json 裡（import.addedDocs）。這次如果沒有新增，那份清單就是空的，代表還原之後就真的乾淨了。",
  "照著清單處理：多出來的帳號，到後台「玩家」頁按「婉拒」，他就登不進來了（按錯了再按一次「放行」就好）；多出來的邀請碼，到「邀請碼」頁按「撤銷」。兩個都會留下稽核紀錄。",
  "清單裡如果有已經被用掉的邀請碼，撤銷不了，也不必撤銷 —— 它早就沒有效力了，要處理的是它帶進來的那個帳號。",
  "備份之後才發生的事會一起被蓋掉：有人打了幾場、改了密碼、後台改了設定，全部回到備份當時。所以要還原就趁早。",
  "稽核紀錄、個人戰績履歷、內容覆蓋層歷程是只增不改的，還原不動它們 —— 壞匯入的那一行會永遠留在稽核裡，這是刻意的。",
  "備份只涵蓋這次匯入會碰到的資料組。沒被碰到的資料組本來就沒被動過，所以不在備份裡也不影響。",
  "還原本身也是一次匯入，所以它自己也會先備份一次 —— 連「還原還原錯了」都有退路。",
] as const;

/**
 * The one sentence shown BEFORE the operator commits, next to 「不會刪除任何東西」.
 *
 * That reassurance has a flip side and the page used to show only the
 * flattering half: never deleting is exactly why a rollback cannot be complete.
 */
export const UNDO_PREVIEW_WARNING =
  "萬一匯錯了：還原備份可以把「被覆蓋」的東西換回來，但「換不掉新增」的東西 —— " +
  "因為這個功能不刪任何文件。匯入後這一頁會逐筆列出新增了哪些，那些要自己處理。";

/** How many added-document names the result panel lists before collapsing. */
export const ADDED_DOCS_PREVIEW = 40;

/**
 * The line the result panel leads with. The ZERO case is a sentence of its own
 * and is deliberately reassuring: "nothing was added" is a real answer, and the
 * refuted branch could not give it — it reported every byte-identical document
 * on the host as an addition, so a no-op re-import produced a named instruction
 * to 婉拒 the operator's own family.
 */
export function addedDocsSummary(docs: readonly DocRef[]): string {
  if (docs.length === 0) {
    return "這次沒有新增任何文件，所以沒有殘留要你處理 —— 還原這包備份就能完整回到匯入前。";
  }
  return (
    `這次新增了 ${docs.length} 筆文件，還原不會把它們移除。` +
    "逐筆清單如下，同一份也寫在備份旁邊的 .json（import.addedDocs）："
  );
}

/**
 * Group the added documents for display, biggest group first. Accounts and
 * invite codes are what an operator actually has to act on, and they are the
 * ones that must not be buried under 60 ranking snapshots.
 */
export function groupAddedDocs(docs: readonly DocRef[]): { collection: string; ids: string[] }[] {
  const byCol = new Map<string, string[]>();
  for (const d of docs) {
    const list = byCol.get(d.collection);
    if (list === undefined) byCol.set(d.collection, [d.id]);
    else list.push(d.id);
  }
  return [...byCol.entries()]
    .map(([collection, ids]) => ({ collection, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || a.collection.localeCompare(b.collection));
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
