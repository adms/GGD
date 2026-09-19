/**
 * ⭐⭐ GH#1161 —— **全自動英雄鑄造的「玩法收據」契約**
 *
 * 它回答的一題：**這份自動產生的英雄，真的被選到、真的進了一場對局、六格真的在
 * runtime 跑過嗎？** ⛔ 不是「它編譯得過」、⛔ 不是「封裝准入通過」、
 * ⛔ 也不是「`runHeroKitScenario` 在一個自己 new 出來的 SimWorld 裡跑得動」。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 這個檔為什麼存在：**「gameplay: passed」在此之前沒有住處，於是誰都能填**
 * ---------------------------------------------------------------------------
 * 第一批 publication proof 證明的是**服務匯入**；第二批 author review 自己逐字
 * 寫著 `completeLiveHero: false`；behavior report 也逐字寫著它不是正式遊戲匯入。
 * ⇒ 研究端若把它們當成 gameplay pass，那是**假陽性**；若一律排除，12B 全自動
 * 鑄造的 E2E 目標就永遠收不了。兩邊都錯，因為缺的是**中間那份收據**。
 *
 * ⭐ 所以這份 schema 做了一件刻意的事：**它沒有 `passed` 欄位。**
 *   · 收據只裝**觀測**（選到誰、進了哪一場、六格各自發生什麼、場景逐項結果）。
 *   · 判定是 {@link acceptHeroLiveGameReceipt} **當場從觀測推導**的。
 *   · `.strict()` ⇒ 研究端硬塞一格 `gameplay: "passed"` 會被判 `receipt-invalid`。
 * ⇒ 第〇·四守則：一個事實只有一個住處。⛔ 判定不烘進檔案，所以它不會過期，
 *   也沒有人能繞過推導直接宣告成功。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 每一條檢查都是**兩個名詞的關係**，⛔ 不是單一名詞在不在
 * ---------------------------------------------------------------------------
 * CLAUDE.md 記過 2026-08-02 的事故：四項後置條件各驗一個名詞全部綠燈，而壞掉的
 * 是「這個映像**能不能**解析這份內容」那個**配對**性質。這裡每一條都照那個教訓寫：
 *
 *   | 問的關係                       | 攔下的假陽性                         |
 *   |--------------------------------|--------------------------------------|
 *   | 要的英雄 ↔ 真的選到的英雄       | 匯入成功但選到基底英雄               |
 *   | 要的版本 ↔ 真的解析到的版本     | 選到同一隻的舊版本                   |
 *   | 封裝宣告的槽位 ↔ runtime 裝的   | Q 格裝的是別支技能而畫面看起來正常   |
 *   | 固定場景清單 ↔ 收據跑過的場景   | 只跑簡單的那幾個、難的靜靜沒跑       |
 *   | 宣告的證據雜湊 ↔ 實際證據位元組 | 收據指向一份後來被改過的紀錄         |
 *
 * ⛔ **四個指紋不自己再比一次** —— 用 {@link heroTargetMismatch}（社群開房路徑
 * 已經在用的同一支），mode 取 `strict`：一份玩法收據宣稱的是「**這台引擎**跑過」，
 * 四欄有一欄不同就是另一台。⭐ 它回傳的是**哪一欄**不合，⛔ 不是 boolean。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 這個檔**不做**什麼（誠實的邊界）
 * ---------------------------------------------------------------------------
 * · ⛔ 它不跑遊戲。它是**契約與閘**；真的把英雄選進 MatchController 的那一半
 *   必須住在 `apps/game-server`（`packages/shared` 依賴不到 MatchController）。
 * · ⛔ 它證明不了「觀測本身是誠實的」。`installed: true`、`events.abilityCast`
 *   是 harness 量出來的；harness 的義務逐字寫在 {@link zHeroLiveGameSlot} 上，
 *   由 harness 自己的守衛驗。⭐ 這裡能保證的是：**觀測一旦不足，就不可能 pass**。
 * · ⛔ 它不看畫面、不看數值平衡、不改任何英雄內容。
 */
import { z } from "zod";
import { zId } from "../schema/common";
import { contentSha256, SHA256_PREFIX } from "../import/jcs";
import { sha256Bytes } from "../sha256";
import { heroTargetMismatch, zCommunityTarget, type CommunityTarget } from "../communityRoom";
import { HERO_SLOTS, type HeroSlot } from "./constants";

export const HERO_LIVE_GAME_RECEIPT_SCHEMA = "ggd-hero-live-game-receipt@1" as const;
export const HERO_LIVE_GAME_SCENARIOS_SCHEMA = "ggd-hero-live-game-scenarios@1" as const;

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const iso = z.string().datetime();

/**
 * 場景清單 —— **候選生成之前就固定**，並以它的雜湊綁進收據。
 * ⚠️ 三組各至少一項是 GH#1161 的驗收條件；`timing` 與 `cross-slot` 算**同一組**
 * （票文逐字寫「時序／跨槽」）。⛔ 少一組就不是一份合格的清單，這裡直接擋。
 */
export const zHeroLiveGameScenarioManifest = z
  .object({
    schema: z.literal(HERO_LIVE_GAME_SCENARIOS_SCHEMA),
    items: z
      .array(
        z
          .object({
            id: zId,
            kind: z.enum(["ally-enemy", "resource", "timing", "cross-slot"]),
            requirementZh: z.string().min(1).max(400),
          })
          .strict(),
      )
      .min(3)
      .max(64),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const ids = manifest.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "場景 id 重複。" });
    const kinds = new Set(manifest.items.map((item) => item.kind));
    for (const group of [["ally-enemy"], ["resource"], ["timing", "cross-slot"]] as const) {
      if (!group.some((kind) => kinds.has(kind))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `場景清單缺少「${group.join("／")}」這一組 fixture。` });
    }
  });
export type HeroLiveGameScenarioManifest = z.infer<typeof zHeroLiveGameScenarioManifest>;

/** 逐事件型別的次數。⭐ harness 只能計入**施法者是本場英雄、abilityId 相符**的事件。 */
const zSlotEvents = z.record(z.string().min(1).max(64), z.number().int().nonnegative().max(1_000_000));

/**
 * ⭐ 兩種槽**形狀不同**，⛔ 不是同一個 optional 欄位的兩種填法：
 * · 被動不可施放，所以它要證明的是**安裝**（票文逐字）。
 * · 五個主動要證明的是**進了 runtime** —— ⛔ 不是「按鍵存在」。
 * ⇒ 把被動那種比較好滿足的形狀塞進 Q，`kind` 的 literal 會擋下來。
 */
const zPassiveSlot = z.object({ kind: z.literal("passive"), abilityId: zId, installed: z.boolean(), events: zSlotEvents }).strict();
const zActiveSlot = z.object({ kind: z.literal("active"), abilityId: zId, events: zSlotEvents }).strict();
export const zHeroLiveGameSlot = z.union([zPassiveSlot, zActiveSlot]);

export const zHeroLiveGameReceipt = z
  .object({
    schema: z.literal(HERO_LIVE_GAME_RECEIPT_SCHEMA),
    /** 餵進去的那份位元組。`sourceSha256` 是輸入檔本身，`packageDigest` 是封裝。 */
    input: z.object({ projectId: zId, sourceSha256: digest, packageDigest: digest }).strict(),
    target: zCommunityTarget,
    scenarioManifestSha256: digest,
    /** ⭐ 要的 ↔ 真的拿到的。任何一邊 `null` ＝ 那一步沒走到，⛔ 不是「沒記錄」。 */
    selection: z
      .object({ requestedHeroId: zId, requestedVersionId: digest, selectedHeroId: zId.nullable(), selectedVersionId: digest.nullable() })
      .strict(),
    /** `null` ＝ 對局根本沒建起來。收據照樣產出，⛔ 但推導必然不通過。 */
    match: z
      .object({ matchId: z.string().min(1).max(128), seed: z.number().int().nonnegative(), arenaId: zId, seatId: z.number().int().min(0).max(11), teamId: z.number().int().min(0).max(3) })
      .strict()
      .nullable(),
    slots: z.object({ PASSIVE: zPassiveSlot, Q: zActiveSlot, W: zActiveSlot, E: zActiveSlot, R: zActiveSlot, EX: zActiveSlot }).strict(),
    scenarios: z.array(z.object({ id: zId, verdict: z.enum(["pass", "fail", "not-run"]), observedZh: z.string().min(1).max(400) }).strict()).max(64),
    /** ⚠️ 這是**被觀測的隔離子服務**的生命週期，⛔ 不是本收據的判定。 */
    process: z.object({ startedAt: iso, finishedAt: iso.nullable(), exitCode: z.number().int().min(0).max(255).nullable(), joined: z.boolean() }).strict(),
    evidence: z.array(z.object({ id: zId, sha256: digest }).strict()).min(1).max(64),
  })
  .strict();
export type HeroLiveGameReceipt = z.infer<typeof zHeroLiveGameReceipt>;

/**
 * 重放鑰匙 —— 同一次結果的兩份收據要得到**同一把**。
 * ⚠️ 刻意剔掉三個欄位：`match.matchId` 與 `process.startedAt/finishedAt`。
 * 它們每一次都不同 ⇒ 留著會讓逐位元組比對**永遠不相等**，而一條永遠不相等的
 * 比對只能被放寬成模糊比對，那等於沒有比對（CLAUDE.md：產生器刻意不寫日期）。
 * ⛔ 其餘一律進鑰匙 —— 包含 `observedZh`：它是 harness 量出來的，不是評語。
 */
export function heroLiveGameReplayKey(receipt: HeroLiveGameReceipt): string {
  return contentSha256({
    input: receipt.input,
    target: receipt.target,
    scenarioManifestSha256: receipt.scenarioManifestSha256,
    selection: receipt.selection,
    match: receipt.match && { seed: receipt.match.seed, arenaId: receipt.match.arenaId, seatId: receipt.match.seatId, teamId: receipt.match.teamId },
    slots: receipt.slots,
    scenarios: receipt.scenarios,
    process: { exitCode: receipt.process.exitCode, joined: receipt.process.joined },
    evidence: receipt.evidence,
  });
}

export const HERO_LIVE_GAME_FAILURE_CODES = [
  "receipt-invalid",
  "hero-mismatch",
  "version-mismatch",
  "package-mismatch",
  "target-drift",
  "slot-binding-drift",
  "slot-not-installed",
  "slot-not-cast",
  "match-missing",
  "service-unjoined",
  "scenario-manifest-drift",
  "scenario-missing",
  "scenario-failed",
  "evidence-missing",
  "evidence-drift",
  "evidence-extra",
] as const;
export type HeroLiveGameFailureCode = (typeof HERO_LIVE_GAME_FAILURE_CODES)[number];

export interface HeroLiveGameFailure {
  readonly code: HeroLiveGameFailureCode;
  readonly detailZh: string;
}
export interface HeroLiveGameVerdict {
  readonly passed: boolean;
  readonly failures: readonly HeroLiveGameFailure[];
}

/** 閘要的東西 —— ⭐ 全部是**它自己知道的**，⛔ 一格都不從收據裡讀回來當期望值。 */
export interface HeroLiveGameDemand {
  readonly projectId: string;
  readonly heroId: string;
  readonly versionId: string;
  readonly packageDigest: string;
  readonly target: CommunityTarget;
  readonly manifest: HeroLiveGameScenarioManifest;
  readonly slotAbilityIds: Readonly<Record<HeroSlot, string>>;
  /** 宣告過的每一份證據都要**真的拿得出位元組**；多一份少一份都是不完整。 */
  readonly evidence: ReadonlyMap<string, Uint8Array>;
}

/**
 * ⭐ 唯一的判定住處。fail-closed：**列不出一條通過的理由就是不通過**，
 * 而且每一條失敗都指名是哪一格 —— ⛔ 「不相容」而說不出哪一欄，等於沒說。
 */
export function acceptHeroLiveGameReceipt(raw: unknown, demand: HeroLiveGameDemand): HeroLiveGameVerdict {
  const parsed = zHeroLiveGameReceipt.safeParse(raw);
  if (!parsed.success) {
    return { passed: false, failures: [{ code: "receipt-invalid", detailZh: parsed.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`).join("；") }] };
  }
  const receipt = parsed.data;
  const failures: HeroLiveGameFailure[] = [];
  const fail = (code: HeroLiveGameFailureCode, detailZh: string) => failures.push({ code, detailZh });

  if (receipt.input.projectId !== demand.projectId) fail("hero-mismatch", `輸入作品是 ${receipt.input.projectId}，要驗收的是 ${demand.projectId}。`);
  if (receipt.input.packageDigest !== demand.packageDigest) fail("package-mismatch", `封裝雜湊不是要驗收的那一份（收據 ${receipt.input.packageDigest}）。`);
  if (receipt.selection.requestedHeroId !== demand.heroId) fail("hero-mismatch", `收據要求的英雄是 ${receipt.selection.requestedHeroId}，不是 ${demand.heroId}。`);
  if (receipt.selection.selectedHeroId !== receipt.selection.requestedHeroId) fail("hero-mismatch", `真正選到的是 ${receipt.selection.selectedHeroId ?? "（沒有選到）"}。`);
  if (receipt.selection.requestedVersionId !== demand.versionId) fail("version-mismatch", `收據要求的版本是 ${receipt.selection.requestedVersionId}，不是 ${demand.versionId}。`);
  if (receipt.selection.selectedVersionId !== receipt.selection.requestedVersionId) fail("version-mismatch", `真正解析到的版本是 ${receipt.selection.selectedVersionId ?? "（沒有解析到）"}。`);

  const column = heroTargetMismatch("strict", receipt.target, demand.target);
  if (column) fail("target-drift", `收據跑在另一組出貨指紋上：${column} 不同。`);

  if (contentSha256(demand.manifest) !== receipt.scenarioManifestSha256) fail("scenario-manifest-drift", "收據綁的場景清單不是這一份。");
  const observed = new Map(receipt.scenarios.map((item) => [item.id, item]));
  for (const item of demand.manifest.items) {
    const result = observed.get(item.id);
    if (!result) fail("scenario-missing", `場景 ${item.id} 沒有跑：${item.requirementZh}`);
    else if (result.verdict !== "pass") fail("scenario-failed", `場景 ${item.id} ${result.verdict === "fail" ? "失敗" : "沒有執行"}：${result.observedZh}`);
  }
  const declared = new Set(demand.manifest.items.map((item) => item.id));
  for (const result of receipt.scenarios) if (!declared.has(result.id)) fail("scenario-manifest-drift", `收據多跑了清單以外的場景 ${result.id}。`);

  for (const slot of HERO_SLOTS) {
    const record = receipt.slots[slot];
    if (record.abilityId !== demand.slotAbilityIds[slot]) fail("slot-binding-drift", `${slot} 裝的是 ${record.abilityId}，封裝宣告的是 ${demand.slotAbilityIds[slot]}。`);
    if (record.kind === "passive") {
      if (!record.installed) fail("slot-not-installed", `${slot} 被動沒有安裝到 runtime。`);
    } else if ((record.events.abilityCast ?? 0) < 1 || (record.events.castRejected ?? 0) > 0) {
      fail("slot-not-cast", `${slot} 沒有在真的對局裡施放成功（abilityCast=${record.events.abilityCast ?? 0}、castRejected=${record.events.castRejected ?? 0}）。`);
    }
  }

  if (!receipt.match) fail("match-missing", "封裝進得去，但對局沒有建立起來 —— 這不是 gameplay pass。");
  if (!receipt.process.joined || receipt.process.exitCode !== 0 || receipt.process.finishedAt === null) {
    fail("service-unjoined", `隔離服務沒有乾淨收尾（joined=${receipt.process.joined}、exitCode=${receipt.process.exitCode ?? "（沒有）"}）。`);
  }

  for (const item of receipt.evidence) {
    const bytes = demand.evidence.get(item.id);
    if (!bytes) fail("evidence-missing", `收據宣告了證據 ${item.id}，而驗收時拿不到它。`);
    else if (SHA256_PREFIX + sha256Bytes(bytes) !== item.sha256) fail("evidence-drift", `證據 ${item.id} 的位元組與收據記的雜湊不同。`);
  }
  const claimed = new Set(receipt.evidence.map((item) => item.id));
  for (const id of demand.evidence.keys()) if (!claimed.has(id)) fail("evidence-extra", `驗收時多出一份收據沒有宣告的證據 ${id}。`);

  return { passed: failures.length === 0, failures };
}
