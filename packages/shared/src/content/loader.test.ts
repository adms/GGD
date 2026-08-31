/**
 * content-05 (content-loader-register): FsContentSource loads the generated
 * content/ tree, parses every doc, checks refs, and registers everything into
 * the sim + content registries — reproducing the TS-literal skeleton exactly.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../sim/content/registry";
import { SELA, THORNE } from "../sim/content/skeleton";
import { DEFAULT_STAT_NORMALIZATION } from "./statNormalization";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import type { LoadResult } from "./loader";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

describe("ContentLoader + FsContentSource (content-05)", () => {
  let result: LoadResult;

  beforeAll(async () => {
    // this test file owns the registries (vitest isolates test files)
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
    registerAll(result.store);
  });

  it("loads and registers every collection from the JSON store", () => {
    cover("content-loader-register");
    expect(result.manifest.contentVersion).toMatch(/^cv_[0-9a-f]{12}$/);

    // sim registries — register/get API unchanged. The store also carries
    // imported WC3 content (godie-*/imported.* docs, tools/w3x-import), so
    // assert the skeleton set is present rather than an exact roster.
    expect(Champions.ids()).toEqual(expect.arrayContaining(["sela", "thorne"]));
    expect(Abilities.ids().length).toBeGreaterThanOrEqual(8);
    expect(Items.ids().length).toBeGreaterThanOrEqual(4);
    // augment pool: task #149 expanded it to 21 (silver 6 / gold 8 / prismatic 7)
    // and task #157 re-enabled the per-round 3-choose-1 draft. The PRISMATIC
    // tier then went 7 -> 16 for the team-health model: `arena-rules` offers
    // prismatic on round 5 and EVERY round after, and a 10-13 round match draws
    // 7-9 prismatic cards per champion from a pool that picks without
    // replacement, so 7 cards could not fill three real choices to the end (339
    // of 1941 offers measured under-filled). See draft.test.ts. The original
    // skeleton 3 remain within the pool. EX is still a per-hero ability
    // (champion.exAbility + slot "EX"), NOT an augment. See ex-skills.test.ts.
    // #188 added the 17th prismatic (`limit-breaker`, 攻速 ×2 + 上限解鎖 10.0),
    // so the closed pool is 31: silver 6 / gold 8 / prismatic 17.
    expect(Augments.ids()).toEqual(expect.arrayContaining(["bloodlust", "chill-touch", "aegis-surge"]));
    // ⚠️ 同 ex-skills.test.ts（GH#333）：這一條要守的是「每個集合都真的註冊進來」，
    // ⛔ 不是「剛好幾張」。上面那行 `arrayContaining` 才是骨架集合的守衛。
    expect(Augments.ids().length).toBeGreaterThanOrEqual(31);
    expect(Projectiles.ids().length).toBeGreaterThanOrEqual(2);
    // ⚠️ 2026-08-18（#356）：這一行本來讀 `round-reward`，而那張表已經退場搬進
    //    `content/_legacy/loot-tables/`（見 retiredLootTables.test.ts）。這一條要守的
    //    是「loot-tables 這個集合真的被註冊進來了」，⛔ 不是某一張表叫什麼名字 ——
    //    所以改成從登錄表推導：至少有一張，而且沒有一張是空的（空表 = 靜默不發卡）。
    expect(LootTables.ids().length).toBeGreaterThan(0);
    for (const id of LootTables.ids()) {
      expect(LootTables.get(id).entries.length, `loot-table ${id} 是空的`).toBeGreaterThan(0);
    }

    // content registries (new collections)
    expect(Arenas.get("arena.skeleton").zones).toHaveLength(2);
    // GH#312：`ConfigDoc` 現在是**整個 union**（以前它只是 match 那一份的
    // infer，那讓每一個 `.schema` 比對變成永遠 false 的死比對）。所以這裡要
    // 用 discriminant 收窄 —— 順便把 schema tag 一起釘住，比原本更強。
    const matchCfg = Configs.get("config.match");
    if (matchCfg.schema !== "config@1") throw new Error(`config.match 的 schema 變成 ${matchCfg.schema}`);
    expect(matchCfg.tick.tickHz).toBe(30);
    expect(Models.get("champ.sela").glbPath).toBe("assets/models/champions/blocky-mage.glb");
    expect(VfxDefs.ids().length).toBeGreaterThanOrEqual(2);
    // `moon-combo` is #247's 者、皆、陣 combo window (war3map.j:34438) — the
    // first BUFF-polarity status doc the tree has ever carried.
    // 2026-07-31 skill batch added three more, and the list is EXACT on purpose
    // (an `arrayContaining` here would let a status doc go missing unnoticed):
    //   berserk    59-00 初號機暴走 —— 方向盤被拔掉的 10 秒 (sim/berserk.ts)
    //   curse      失手率 (WC3 `Acrs`) —— 攻擊方 fumble, NOT defender evasion
    //   fang-stun  13-02/13-002 揍敵客牙突的暈眩
    //   nen-banked 13-002 EX 燒掉的法力存款(spendMana.bankAs → damage.bankedBonus)
    // 2026-08-01 傳說武器批次再加兩個:
    //   light-wand-banked 光魔杖 godie-i027「消耗自己現存 MP 5%並造成傷害」的存款標記
    //                     (同樣是 spendMana.bankAs → damage.bankedBonus,第二個客戶)
    //   ingredient        殺豬刀 godie-i06g「7%機率將敵人變成食材,無法動作」的暈眩標記
    //                     —— 「食材」目前只是這個 statusId 的名字,模型還是原本那一具
    //                     (換模型要一格 ENTITY_FLAG,而 BIT BUDGET 只剩一格,見
    //                      protocol/schema.ts;推導寫在該道具的 authoringNote)
    expect(StatusEffects.ids().sort()).toEqual([
      // ── 2026-08-08 技能重製：90 支文案點名、但先前沒有身分文件的狀態 ──────
      // ⭐ 它們的 `tags` 是**類別條件**（`condition.status` 的 tag 分支）的查詢基礎。
      // ⛔ 2026-08-08 owner 否決了初版的「同類共用一個 tag」（破防兩支共用 `shred`、
      // 失手類共用 `miss`、不可控共用 `uncontrollable`）：
      //   「[狀態 tag]**應該要做成開放架構，tag 盡可能多不要共用**」
      // 共用把「這是什麼」與「它屬於哪一類」壓進同一格，於是想精確查【破魔】的人
      // 只查得到「所有破防」。現在每一份帶**專屬 tag ＋ 所有適用的類別 tag**，
      // 詞彙表在 `docs/_status-effect-tag-vocabulary.md`（給外部編輯器專案）。
      // 「暈眩」在出貨內容裡是**五份不同文件**，那正是 exact id 條件擋住熊貓五支的原因。
      // ⛔ status 文件只是**身分**（名字／極性／分類）；魔抗減半多少、每秒燒多少
      // 住在施加它的那支技能的 `applyStatus` 上。
      // ⭐ 2026-08-22（#53）：orkn.w「灌腸」的具名狀態 —— 30-002 EX 的 condition
      //    需要它才成立（在此之前那個條件**永遠不會為真**，第一·五守則）。
      // ⭐ GH#843（owner 2026-08-28）—— 08-04 阿邦快速劍X 的「二連技」印記：
      //    A 式直線命中留下它，B 式半秒後對**帶著它又在圈裡**的人打十倍。
      //    它是純標記（⛔ 無副作用），存在的意義就是讓兩段之間有一個交集。
      "aban-x-mark",
      "alcohol-enema",
      "armor-break",
      // ⭐ 2026-08-13 內容批：79-04 卍解掛的具名狀態，讓 79-02/79-03 的
      //    「(卍解狀態下…)」有一顆條件葉問得到 —— 條件系統沒有「形態」葉。
      "bankai",
      "berserk",
      "blind",
      "burn",
      "burnstun",
      // ⭐ GH#448（owner 2026-08-19）—— 30-00 攝影機的「標記→順移」錨點：
      //    指定敵方英雄留下它，下一次**不指定任何人**施展就順移到他身邊。
      //    純標記（⛔ 不痛不慢），它只是一條回去的路。
      "camera-mark",
      // ⭐ 2026-08-18 [EX∅ 根源]：親熱天堂的【魅惑】—— 一份牽引＋交不出操作的
      //    控制狀態（機制是 `knockback{from:"pull", uncontrollable:true}`，這裡只是身分）。
      "charmed",
      "confusion",
      "curse",
      // ⭐ GH#489 —— 59-01 吞噬改成**被動自動發生**之後，「兩餐之間隔多久」沒有
      //    技能鈕可以轉圈，所以那個冷卻就是這一格：`devour.onDevour` 掛在自己身上，
      //    而那條觸發器的 `condition` 問「它還在不在」。它自己不改任何數值。
      "devour-cooldown",
      "fang-stun",
      // 【恐懼】(2026-08-08) —— 89-002 俄羅斯輪盤 / 52-02 / 52-04 / 52-002。
      // 與【暴走】同一條路（`applyStatus` 的一個布林），但方向相反：暴走是
      // 自我增益帶 downside 所以**不算 CC**，恐懼是敵人施加的純減益所以**算**。
      "fear",
      // ⭐ 2026-08-17（GH#333）—— 聖杯願望 `grail-c-20`「投影魔術・強化投影」
      //    施法後掛在自己身上的待命標記（下一次普攻追加一枚投影彈）。
      //    ⛔ 它自己不改任何數值：效果整個住在標記的 `onBasicAttack` 觸發器上。
      "grail-strengthened-projection",
      // ⭐ 2026-08-18 [EX∅ 根源] 六份新身分（機制全部住在施加它的那張卡上）。
      "grief-seed-charge",
      // A6（#278）—— 【重創】與【禁療】。禁療**不是第二個機制**：它就是三格倍率
      // 都填 0 的一份文件，所以它與重創共用 `sim/grievousWounds.ts` 的同一支
      // `woundMult`，也一樣被淨化拔得掉。
      "grievous-wounds",
      "ingredient",
      "light-wand-banked",
      "magic-break",
      "millennium-plot-armor",
      "moon-combo",
      "nen-banked",
      "no-heal",
      // 【麻痺】(2026-08-08) —— 52-03 無銘斧劍「附加 [麻痺] 效果,持續0.6秒」。
      // ⛔ 先前沒建,理由是「到底是暈眩還是定身」查不出來。那個理由**不成立**:
      // 那是**機制**問題,而機制住在施加它的技能的 `applyStatus`(`stun` / `root`
      // 兩個旗標);status 文件只是**身分**。既有文件早就立下這條分層 ——
      // `omnislash-perform` 的 description 明寫「無敵由同一支技能的 invulnerable
      // 效果負責,不在這個標記上」。所以兩份都建,description 誠實寫出
      // 「它擋住什麼由施加它的技能決定」,⛔ 不宣稱它是哪一種。
      "numbness",
      // ⭐ 2026-08-22（#53）：八刀一閃的連段窗口 —— 30-002 EX 那句「連段」
      //    在此之前**逐位元組等於不存在**（第一·五守則）。
      "octuple-slash-window",
      //   omnislash-lock    01-04 超究武神霸斬 (GH#250) 打在**目標**身上的硬控:
      //                     war3map.j `Trig_SuperFF7_Actions` 對目標
      //                     PauseUnitBJ(true) + 反覆 IssueImmediateOrderBJ("stop")
      //   omnislash-perform 同一支技能打在**施法者自己**身上的演出鎖(同段的
      //                     PauseUnitBJ(true, udg_FF7_CloudUnit))。分成兩個 id
      //                     而不是共用一個,是因為 HUD 讀的是這份文件的 name/
      //                     polarity —— 一個是被鎖住(debuff),一個是自己在演武
      //                     (buff),共用會讓其中一邊的字在畫面上是錯的。
      "omnislash-lock",
      "omnislash-perform",
      // 【癱瘓】(2026-08-08) —— 89-02 憤怒的菊花「造成 [癱瘓] 及 [詛咒]」。
      // 同【麻痺】,見上面那一段。
      "paralysis",
      "rage",
      "red-comet",
      "root",
      // ⭐ 2026-08-18（#356）：`slowLabelMatchesMultiplier` 這條守衛要求
      //    `applyStatus` 的名字等於它真的做的減速，於是內容側把 20/35/50/60 這四段
      //    真的存在的倍率補上身分文件。⛔ 它們不是新機制 —— 減速多少仍然住在施加它
      //    的那支技能/道具的 `moveSpeedMult` 上，這四份只是**身分**。
      "slow20",
      "slow25",
      "slow30",
      "slow35",
      "slow40",
      "slow50",
      "slow60",
      "stun",
      // 2026-08-08 52-00【十二道試煉】重製：免死觸發時對 [周圍] 敵人的
      //   trial-stun  擊退 + 0.5 秒暈眩的 debuff（`marks[].lethal.aoeEffects`）
      // ⚠️ 這份清單刻意是**精確**的（見上面那段）：`applyStatus.statusId` 的參照
      // 在 `refs.ts` 是 **soft**（只發 warning），所以「文件在但沒被註冊」這一種
      // 只有這裡數得出來。新增一份 status 文件就補一行，這是它的維護成本。
      "trial-stun",
      // ⭐ 2026-08-13 內容批：60-03「每三下」的計數器（次數不是時鐘，
      //    ⛔ 用內部冷卻冒充會在攻速改變時走鐘）。⚠️ 字母序在 trial-stun **之後**
      //    （tria < trif）。
      "triforce-courage",
      // ⭐ 2026-08-18 [EX∅ 根源]：歐爾麥特的頭髮／魂之寶石。
      "united-states-of-smash",
      "witch-form",
    ]);
  });

  /**
   * `castTimeSec` is the ONE field where content/ and the TS skeleton are
   * ALLOWED to disagree, so it is stripped before the structural comparison.
   *
   * Why they diverge: the owner's telegraph rule assigns every ability a cast
   * time derived from `castTimeFormula.ts` (damage / CC / AoE / slot, clipped
   * by the ability's own cooldown and effect duration), and that pass rewrites
   * content/ only — `sim/content/skeleton.ts` is a hand-written fixture whose
   * job is to prove the loader, not to carry balance data. Pinned explicitly
   * below so the divergence stays deliberate rather than becoming drift.
   */
  /**
   * 拿掉**註冊時才決定**的欄位，因為它們照定義不會等於磁碟上的字面值。
   *
   * · `castTimeSec` —— 由 `deriveCastTime()` 推導（2026-08-02 起）
   * · `ms` / `mr`  —— 由角色定位推導（`config.stat-normalization@1`，2026-08-12 起）
   *
   * ⚠️ 這不是把測試改綠 —— 這一條測試的標題本來就寫著 "bar castTimeSec"，
   * 也就是說「有些欄位是註冊時算出來的」這個豁免**早就存在**，
   * ms/mr 只是加入同一份名單。它守的仍然是「其餘每一格都逐位元對得起來」。
   */
  // ⚠️ 正規化在**註冊時**改寫的那幾項要排除 —— 不然這條測試釘的是
  //    「正規化沒有生效」，方向剛好相反。
  //
  // 🔴 這份名單以前是手寫的 `["castTimeSec","ms","mr","armor","growth"]`，
  //    而 2026-08-16 `range` 進 `appliesTo` 的那一刻它就過期了（第四個住處）。
  //    ⇒ 現在**從 `appliesTo` × `channel` 推導**：走 `growth` 通道的由整個
  //    `growth` 被剝掉涵蓋，只有走 `baseStats` 的需要逐格剝。
  //
  // ⛔ 而且只剝 `baseStats` 底下那幾格，⛔ 不是按鍵名整份剝 ——
  //    `range` 同時是**技能**的欄位名（`ability@1.range`），整份剝會把技能射程
  //    一起從比對裡拿掉，那是在削弱這條測試而不是修它。
  const NORMALIZED_BASE_KEYS = DEFAULT_STAT_NORMALIZATION.appliesTo.filter(
    (k) => DEFAULT_STAT_NORMALIZATION.channel[k] === "baseStats",
  );
  // ⭐ `buildPriority` 是第三個被授權的分歧（2026-08-18 / #356）。
  //    `sim/content/skeleton.ts` 是一份**自給自足**的離線夾具：它自己宣告
  //    ember-rod / ironhide-vest / serrated-edge / swift-boots 四件道具與一張
  //    round-reward 表，兩位骨架英雄的 buildPriority 指的就是它自己那四件。
  //    出貨樹把那四件退場搬進 `content/_legacy/items/`，所以 `content/champions/*.json`
  //    的 buildPriority 必須清空 —— 否則就是一個 dangling ref，載入器會擋。
  //    ⛔ 反過來把骨架的那兩行也清掉是錯的：骨架是內容全毀時的 fail-open 註冊表，
  //    它指的四件在它自己的宇宙裡都還在。⇒ 兩邊都對，只是不再相等。
  const stripCastTime = (v: unknown): Record<string, unknown> => {
    const out = JSON.parse(
      JSON.stringify(v, (k, val: unknown) =>
        k === "castTimeSec" || k === "growth" || k === "buildPriority" ? undefined : val,
      ),
    ) as Record<string, unknown>;
    const base = out["baseStats"] as Record<string, unknown> | undefined;
    if (base) for (const k of NORMALIZED_BASE_KEYS) delete base[k];
    return out;
  };

  it("the JSON round-trip reproduces the TS literals exactly (bar castTimeSec / ms / mr)", () => {
    // registered defs came from JSON; they must match the sim's literals
    expect(stripCastTime(Champions.get(SELA.id))).toMatchObject(stripCastTime(SELA));
    expect(stripCastTime(Champions.get(THORNE.id))).toMatchObject(stripCastTime(THORNE));
    expect(stripCastTime(Abilities.get(SELA.abilities.Q.id))).toMatchObject(
      stripCastTime(SELA.abilities.Q),
    );
    expect(Arenas.get(SKELETON_ARENA.id)).toMatchObject(JSON.parse(JSON.stringify(SKELETON_ARENA)));
  });

  it("castTimeSec 是唯一被授權的分歧：內容走公式，TS 骨架保留手寫值", () => {
    // ⚠️ 這裡以前釘著 0.7 / 0.6 兩個字面秒數 —— 那是 **retired 的 0.3–0.9 政策**
    //    算出來的（owner 2026-08-13：「這是你自己講的吧 我沒講過這樣的話」）。
    //    現在驗的是**機制**：出貨內容 ≠ TS 骨架的手寫值，而且是公式重推的。
    //    ⛔ 不要再把秒數抄進來：那是 owner 每週在調的東西（第二守則）。
    const r = Abilities.get(SELA.abilities.R.id).castTimeSec;
    expect(r).toBeDefined();
    expect(r).not.toBe(SELA.abilities.R.castTimeSec); // 重推過，不是原封帶走
    // TS 骨架自己**不**跟著動（它是離線夾具，內容才是出貨的那一份）。
    expect(SELA.abilities.Q.castTimeSec).toBeUndefined();
    expect(typeof SELA.abilities.R.castTimeSec).toBe("number");
    expect(typeof THORNE.abilities.R.castTimeSec).toBe("number");
  });

  it("has zero hard-ref errors and reports soft warnings explicitly", () => {
    // the generated tree is fully closed: no dangles at all
    expect(result.warnings).toEqual([]);
  });
});
