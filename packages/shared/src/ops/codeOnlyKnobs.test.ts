/**
 * ⭐⭐ 「⛔ **沒有只能改程式才碰得到的角落**」—— main 第一件責任的**量尺**。
 *
 * owner 的大目標逐字：「開放讓玩家自己設計 英雄、技能、特效⋯**所有功能都要可
 * JSON 操作設定**」。⇒ ⭐ 那句話需要一個**數字**，⛔ 否則它永遠只是一句話。
 *
 * ── ⭐ 這條問什麼 ──────────────────────────────────────────────────────
 * 掃 `sim/` 與 `client/game/` 的模組層常數，逐個問：
 * 「**這個值今天在後台碰得到嗎？**」（`content/config/*.json` 的欄位名 ∪
 *  Zod config schema 的欄位 ∪ admin 表單的 `path`）
 *
 * ── ⚠️ 量尺自己被灌大過**兩次**（⭐ 誠實記下，⛔ 這是它最重要的一段）────────
 * · 第一版 **296** —— ⛔ 把 `DEFAULT_*`（Zod 預設，第一守則的住處②）全算進去
 * · 第二版 **149** —— ⛔ 尾段比對忘了轉小寫 ⇒ `situationalAiming` 明明碰得到卻被算成碰不到
 * · ⭐ 修好之後 **132**
 * ⇒ ⭐ 我是**逐個去驗其中三個**才發現的（`situationalAiming` / `followThroughTicks`
 *   在 config 裡查得到）。⛔ 一個沒有被抽驗過的統計，讀起來跟真的一模一樣。
 *
 * ── ⭐ 豁免是**規則**，⛔ 不是一張 132 列的名單（同 `damageTiers` 的判例）─────
 * | 類 | 為什麼不必可調 |
 * |---|---|
 * | 誤打守衛 | `kindLimits.ts` 的檔頭**自陳**：「每一格都是**誤打守衛**（50 打成 500 那一類），⛔ **不是平衡政策**」 |
 * | 上下界柵欄 | 同上：`MAX_`／`MIN_` 是防呆的天花板，⛔ 不是玩法決策 |
 * | 數值容差 | `EPS` / `TOLERANCE` —— 浮點比較的實作細節 |
 * | 協定/位元 | `_BITS` / `_MASK` / `_VERSION` —— ⛔ 改了會 desync，那**不該**可調 |
 *
 * ⇒ ⭐ 剩下的「待判」才是真正的候選 —— 每一個都是一個
 *   （2026-09-01 的軌跡：**70 → 53**〔補第五類豁免：只當 fallback 用的常數〕
 *    → **40** → **25** 〔第六類豁免：10 格逐格點名，每一格帶一個能被反駁的理由〕
 *    → **21** 〔移動與接敵 5 格 ＋ 商店與頂點路線 4 格真的搬進設定〕
 *    **→ 40**〔`combat/damage.ts` 7 個 ＋ `combat/hitFeel.ts` 6 個真的搬進
 *    `config.combat-feel@1` 的 `impactFeel`〕）—— 每一個都是一個
 *   「owner 想改的時候要改程式」的角落。
 *
 * ── ⛔ 這條**不**要求把 70 個全部搬進後台 ────────────────────────────────
 * 那是一批工作，⛔ 不是一條測試。⭐ 它要求的是**棘輪只能往下**：
 * 新寫一個寫死的決策 ⇒ 紅。⇒ 這個角落**只會變少**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 在 `sim/manaFloor.ts` 加一個 `const NEW_HARDCODED_DECISION = 7;` → 🔴（母體 +1）
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/** ⭐ 棘輪：只能變小。2026-09-01 量到的真值（⛔ 不是第一版的 296，也不是第二版的 149）。 */
const RATCHET = 81;
/** ⭐ 其中「⛔ 待判」的 —— 真正的候選。同樣只能變小。 */
const UNDECIDED_RATCHET = 21;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

/** ⭐ 後台碰得到的欄位名 —— 三個來源的聯集（⛔ 不是猜路徑）。 */
function reachableNames(): Set<string> {
  const out = new Set<string>();
  const add = (s: string): void => void out.add(s.toLowerCase());
  const walkJson = (n: unknown): void => {
    if (Array.isArray(n)) n.forEach(walkJson);
    else if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) { add(k); walkJson(v); }
    }
  };
  const cfgDir = join(ROOT, "content/config");
  for (const f of readdirSync(cfgDir)) {
    if (!f.endsWith(".json")) continue;
    try { walkJson(JSON.parse(readFileSync(join(cfgDir, f), "utf8"))); } catch { /* 壞檔由別條閘管 */ }
  }
  for (const f of walkFiles(join(ROOT, "packages/shared/src/content/schema/config"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*z\./gm)) add(m[1]!);
  }
  for (const f of walkFiles(join(ROOT, "apps/admin/src"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/path:\s*"([^"]+)"/g)) {
      for (const seg of m[1]!.split(".")) add(seg);
    }
  }
  return out;
}

/**
 * ⭐⭐ 第六類豁免 —— **逐格點名，而每一格帶著一個能被反駁的理由**。
 *
 * ⚠️ 前五類是**規則**（誤打守衛 · 上下界 · 容差 · 協定 · 只當 fallback），
 * ⛔ 而這一族沒有共同的形狀 —— 它們只有共同的**結論**：「做成一格設定是**錯的**」。
 * ⇒ 規則寫不出來的時候，CLAUDE.md 給的出口是「進豁免表並寫下**為什麼**
 *   —— 一個能被反駁的理由，⛔ 不是『還沒收』」。
 *
 * ⚠️ ⭐ 而這張表**不可以腐爛**：底下的守衛逐列驗「這個名字今天還在那個檔裡」，
 * ⛔ 名字改了或常數刪了就紅（一張過期的豁免表會**默默地**把新的角落也放掉）。
 */
const EXEMPT_BY_NAME: Readonly<Record<string, { file: string; why: string }>> = Object.freeze({
  // ── 哨兵值：`-1` 的意思是「永遠不到期」，⛔ 不是一個可以調的期限 ──────────
  MARK_DURATION_PERMANENT: {
    file: "packages/shared/src/sim/markLimits.ts",
    why: "⭐ **作者面的哨兵值** —— 內容層寫 `-1` 表示「永久」。⛔ 它不是一個期限，是一個**代碼**；把它做成設定 = 讓 owner 可以把「永久」的意思改成 7 秒。⭐ 可反駁：若哪天永久標記需要一個真的上限，那是**新增一格上限**，⛔ 不是改這個代碼。",
  },
  MARK_NEVER_EXPIRES: {
    file: "packages/shared/src/sim/markLimits.ts",
    why: "⭐ 同上的**執行期**那一半。它刻意是**整數** `-1` 而不是 `Infinity` —— 檔頭逐字記著理由：`Infinity` 在 JSON 往返後變成 `null`（#278 的殭屍波踩過）。⇒ 改它的型別或值會讓序列化靜默壞掉。",
  },
  FORM_NEVER_EXPIRES: {
    file: "packages/shared/src/sim/systems/ChampionFormSystem.ts",
    why: "⭐ 同族哨兵（變身態）。檔頭逐字：「A negative tick can never be reached by `world.tick >= expiresTick` from tick 0」⇒ 它的**負數性質**就是機制本身。",
  },
  DEFERRED_RESOLVE_PASS: {
    file: "packages/shared/src/sim/effects/deferredTrigger.ts",
    why: "⭐ 同族哨兵。檔頭逐字：「⛔ 不是『未知』也不是『0』：0 會宣稱反彈落在第 1 輪，那是一個 off-by-one 的謊」。",
  },
  // ── 不變式：它不是一個選項 ────────────────────────────────────────────
  MANA_FLOOR: {
    file: "packages/shared/src/sim/manaFloor.ts",
    why: "⭐ 它自己的註解逐字寫著：「⛔ 不是一格可調的欄位 —— 『魔力可以是負的』不是一個設計選項」。",
  },
  // ── ⭐ 客戶端預測共用它，而客戶端**沒有 config 通道** ──────────────────
  //    ⚠️ 這一族最危險：做成可調 ⇒ 伺服器與預測用不同的數字 ⇒ 一個**不會報錯**的 desync。
  AIM_HOLD_TICKS: {
    file: "packages/shared/src/sim/aimHold.ts",
    why: "⭐ 檔頭逐字：「權威長期不同意，每一次 reconcile 都在打架 —— 那比寫死更糟。要讓它可調，先做『client 收得到 config』這件事」。⭐ 可反駁：等那件事做完。",
  },
  TURN_FACTOR: {
    file: "packages/shared/src/sim/systems/MovementSystem.ts",
    why: "⭐ `turnToward()` 被 `apps/client/src/predict/LocalPrediction.ts:619` 直接呼叫（吃這個預設）⇒ 同 `AIM_HOLD_TICKS`：伺服器讀設定而客戶端讀常數 = 兩邊用不同的轉身速度。",
  },
  TURN_SNAP_DOT: {
    file: "packages/shared/src/sim/systems/MovementSystem.ts",
    why: "⭐ 同上（它住在 `turnToward()` 裡面）。⚠️ 而且它是**浮點比較的門檻**：調到 1 就永遠吸附不了。",
  },
  // ── ⭐ 量出來的效能預算，⛔ 不是手感 ──────────────────────────────────
  LOOKAHEAD_HOPS: {
    file: "packages/shared/src/sim/navRoute.ts",
    why: "⭐ 檔頭逐字量過：「8 跳 → 每次查詢 ~113 µs，而 30 隻殭屍 × 30 Hz 就吃掉整整 10% 的一顆核心」。⛔ 調大它是把 CPU 換成一點點平滑 —— 那不是設定，是**回歸**。⭐ 可反駁：若視線測試哪天變便宜了。",
  },
  // ── ⭐ 物理判定，⛔ 不是手感 ────────────────────────────────────────
  MOVE_ORDER_STREAM_GAP_TICKS: {
    file: "packages/shared/src/sim/systems/OrderSystem.ts",
    why: "⭐ 檔頭逐字：「⛔ 不做成後台欄位：它是『同一根搖桿』的物理判定，不是 owner 會調的手感」——它在分辨**點擊**與**拖曳**，調錯會讓點擊被讀成連續流。",
  },
});

const PREFIX = /^(DEFAULT|MAX|MIN|SHIPPED)_/;
const DECL = /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]{3,})\s*(?::\s*[^=]+)?=\s*(-?\d+(?:\.\d+)?|true|false)\s*;/gm;

function classify(file: string, name: string): string {
  if (file.endsWith("kindLimits.ts")) return "誤打守衛";
  if (/_(MAX|MIN)_|^(MAX|MIN)_|_(MAX|MIN)$/.test(name)) return "上下界柵欄";
  if (name.includes("EPS") || name.includes("TOLERANCE")) return "數值容差";
  if (/_(BITS?|MASK|FLAG|VERSION|SCHEMA)/.test(name)) return "協定/位元";
  return "待判";
}

function census(): { file: string; name: string; cat: string }[] {
  const known = reachableNames();
  const out: { file: string; name: string; cat: string }[] = [];
  for (const root of ["packages/shared/src/sim", "apps/client/src/game"]) {
    for (const f of walkFiles(join(ROOT, root))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(DECL)) {
        const name = m[1]!;
        const parts = name.replace(PREFIX, "").toLowerCase().split("_");
        // ⭐ 尾段逐段比對，⭐ **全部小寫**（⛔ 忘了這一步就會把母體灌大 17 個）
        let reachable = false;
        for (let i = 0; i < parts.length; i++) if (known.has(parts.slice(i).join(""))) { reachable = true; break; }
        if (reachable) continue;
        const rel = relative(ROOT, f);
        // ⭐ 第五類豁免：**這個常數只當 fallback 用** ⇒ 值的住處是 JSON，⛔ 常數只是它的預設。
        //   例：`sm.autoTargetable ?? DEFAULT_SUMMON_AUTO_TARGETABLE`
        //       `refOf(refs.kda, KDA_REF)`（`config.match@1` 的 `rating.kda`）
        //   ⚠️ 三個都**逐個讀過原始碼**驗過（⛔ 不是相信正則）—— 見測試③的反向控制組。
        if (new RegExp(`(\\?\\?\\s*${name}\\b|\\brefOf\\([^)]*,\\s*${name}\\s*\\))`).test(src)) continue;
        // ⭐ 第六類：逐格點名的豁免（每一格帶著能被反駁的理由，見 `EXEMPT_BY_NAME`）。
        if (EXEMPT_BY_NAME[name]?.file === rel) continue;
        out.push({ file: rel, name, cat: classify(rel, name) });
      }
    }
  }
  return out;
}

describe("⭐ 沒有只能改程式才碰得到的角落（棘輪）", () => {
  const rows = census();

  it("★ ① 母體**只能變小** —— ⛔ 新寫一個寫死的決策就紅", () => {
    expect(
      rows.length,
      `⛔ 從 ${RATCHET} 變成 ${rows.length}。⭐ 新增的那幾個：\n` +
        rows.slice(RATCHET).map((r) => `  · ${r.file}:${r.name}`).join("\n") +
        `\n⭐ 修法是把它搬進三個住處（\`content/config\` ＋ Zod \`DEFAULT_*\` ＋ admin 欄位），` +
        `\n⛔ 或（⭐ 若它是誤打守衛／上下界／容差／協定）讓名字帶上那一類的記號。` +
        `\n⚠️ 母體變小了 ⇒ 把 RATCHET 改成新的數字（棘輪只准往下）。`,
    ).toBeLessThanOrEqual(RATCHET);
  });

  it("★ ② ⭐ **待判**的那一堆才是真正的角落 —— 同樣只能變小", () => {
    const undecided = rows.filter((r) => r.cat === "待判");
    expect(
      undecided.length,
      `⛔ 從 ${UNDECIDED_RATCHET} 變成 ${undecided.length} —— ⭐ 每一個都是一個` +
        `「owner 想改的時候要改程式」的角落（大目標：**所有功能都要可 JSON 操作設定**）。`,
    ).toBeLessThanOrEqual(UNDECIDED_RATCHET);
  });

  it("⭐ ③ **量尺自證 · 兩個方向** —— ⛔ 只驗過單邊的尺不算自證過", () => {
    // ⚠️ 這條是被踩出來的：量尺第二版把 `situationalAiming` 算成碰不到（尾段忘了轉小寫），
    //   ⭐ 而我是**逐個抽驗**才發現的。⇒ 把那次抽驗釘成一條測試。
    //
    // ⭐⭐ 2026-09-01 補上**反方向**（CLAUDE.md：「一把只驗過單邊的尺，不算自證過」）：
    //   那一天量尺又被抓到一次 —— `KDA_REF` 明明是 `config.match@1` 的 `rating.kda`
    //   （`MatchController.ts` 真的傳了 `ratingRefs`），⛔ 而量尺說它是角落。
    //   ⇒ 補了第五類豁免（只當 fallback 用）。
    //   ⚠️ ⭐ 而**放寬一條規則的當下，正是它最可能開始說謊的時刻** ——
    //     所以下面同時釘住「已知**真的**碰不到的那幾個仍然被算進來」。
    // ⚠️ ⭐ 2026-09-01 第二次換過反向控制組：`MANA_FLOOR` 與 `LOOKAHEAD_HOPS`
    //   **從母體裡消失了**，⭐ 而這一次是①（它們進了第六類豁免，各帶一個理由）——
    //   ⛔ 不是②。這條測試逼我逐個說出是哪一種，⭐ 而那正是它存在的理由。
    //   （量過的反例：把比對放寬成「任意連續片段」⇒ 母體 129 → **39**，
    //     因為 `MANA_FLOOR` 的 `floor` 在七份不相干的設定檔裡都是欄位名。
    //     ⭐ 那個方向的錯**看起來像進度**，⛔ 而它是量尺在說謊。）
    const names = new Set(rows.map((r) => r.name));

    for (const reachable of [
      "DEFAULT_KING_SITUATIONAL_AIMING", // content/config/arena-rules.json
      "DEFAULT_MOB_BASE_LEVEL", // 同上
      "KDA_REF", // config.match@1 的 rating.kda（逐行讀過 MatchController.ts:3687）
      "DEFAULT_SUMMON_AUTO_TARGETABLE", // `sm.autoTargetable ?? …`
      "DEFAULT_MOB_RING_DIAMETER", // `cfg.mob.groundRingDiameter ?? …`
    ]) {
      expect(
        names.has(reachable),
        `⛔⛔ \`${reachable}\` 在 JSON 裡改得到，而量尺說它碰不到\n` +
          `⇒ ⭐ 量尺**灌大了**，而一個灌大的統計讀起來跟真的一模一樣。`,
      ).toBe(false);
    }

    // ⭐ 反向控制組 —— ⛔ 這幾個今天**真的**只有改程式碰得到（動手前逐個 grep 過
    //   `content/config/*.json` 與 admin 的 `path:`，⛔ 兩邊都零命中）。
    //   ⇒ 它們哪天不見了，要嘛是**真的搬進設定了**（好事，把它從這張名單移走），
    //     要嘛是**量尺又開始說謊**（壞事）——⭐ 而這條測試逼你去分辨是哪一種。
    for (const codeOnly of [
      // ⭐ 2026-09-01 第三次換：`CAPSTONE_ROUND_GATE` **真的搬進 JSON 了**
      //   （`config.match@1` 的 `economy.capstoneRoundGate`）⇒ 這是①，⛔ 不是②。
      //   ⚠️ 而這條測試逼我逐個說出是哪一種 —— ⭐ 那正是它存在的理由。
      "EDGE_SPAWN_RINGS",
      "CHAOS_REROLL_TICKS",
      "SLOT_STRIDE",
    ]) {
      expect(
        names.has(codeOnly),
        `⛔⛔ \`${codeOnly}\` 從母體裡**消失**了。兩種可能，⭐ 而你要說得出是哪一種：\n` +
          `  ① 它真的搬進 JSON 了 ⇒ 🎉 把它從這張反向名單移走，並把棘輪調小\n` +
          `  ② ⛔ 量尺被放寬過頭 ⇒ 它現在把「碰不到」讀成「碰得到」\n` +
          `⚠️ 前科：比對放寬成「任意連續片段」時母體從 129 掉到 39，⭐ 而那看起來像進度。`,
      ).toBe(true);
    }
  });

  /**
   * ⭐⭐ **豁免表不可以腐爛** —— ⛔ 一張過期的豁免表會**默默地**把新的角落也放掉。
   *
   * ⚠️ 這是 CLAUDE.md 記過的形狀：「一個被散文守著的數字活過了它的保存期限，
   * 而**沒有任何東西變紅**」。⇒ 逐列驗「這個名字今天還在那個檔裡」。
   *
   * MUTATION LOG（落地前跑過）：
   *   · 表裡多加一列不存在的 `FOO_BAR` → 🔴（指名它與它宣稱的檔）
   */
  it("⭐ ④ 豁免表逐列還活著 —— ⛔ 名字改了/常數刪了就紅", () => {
    const dead: string[] = [];
    for (const [name, { file, why }] of Object.entries(EXEMPT_BY_NAME)) {
      let src = "";
      try { src = readFileSync(join(ROOT, file), "utf8"); } catch { /* 下面報 */ }
      if (!new RegExp(`\\bconst ${name}\\b`).test(src)) dead.push(`${file}:${name}`);
      expect(why.length, `${name} 的理由太短 —— ⛔ 豁免要帶一個**能被反駁**的理由`).toBeGreaterThan(30);
    }
    expect(
      dead,
      `⛔⛔ 豁免表上這幾列**已經不存在**了：\n${dead.map((d) => `  · ${d}`).join("\n")}\n` +
        `⇒ 要嘛那個常數搬走了（⭐ 把這一列刪掉），要嘛它改名了（⭐ 改這一列）。\n` +
        `⚠️ 留著它 = 一張過期的豁免表，而它會**默默地**放掉一個同名的新角落。`,
    ).toEqual([]);
  });
});
