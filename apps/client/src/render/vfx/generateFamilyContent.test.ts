/**
 * ⭐【vfx 家族產生器不可以刪掉它不擁有的欄位】（GH#378 → GH#427）
 *
 * ⚠️ **這條在 2026-08-20 之前只比對頂層鍵，而缺陷已經在下一層發生第二次**（GH#427）：
 * `families` 與 `abilities` 是產生器擁有的**頂層**鍵，所以整張逐列表被換掉的時候
 * 這條守衛是綠的 —— 它看不進 `families[<id>].soundLaunch` / `abilities[<id>].pitchDeg`。
 * 量到的（v0.20.6，沙箱跑一次）：**53 列整列消失、122 列掉欄位、21 個家族掉音效與
 * groundDecal**。現在它逐列逐格走到底。
 *
 * 量到的（v0.20.6）：跑一次
 *   `pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts`
 * 會把 `content/config/vfx-families.json` 的**六格整格刪掉** ——
 * `maxAbilityVfxLayers` · `oneShotMaxLifeSec` · `castHeightSource` ·
 * `projectileArtFromDoc` · `projectileRadiusGain` · `projectileFlyHeightY`。
 *
 * ⛔ 而**沒有任何既有守衛會紅**：這六格全是 Zod 的 optional，刪掉之後預設值補回去，
 * `content:build` 綠、後台頁照樣畫得出來，只有**操作者存過的值**靜靜回到出貨預設
 * （CLAUDE.md 失敗形態②：後台存了，場上讀不到）。
 *
 * ⭐ 這條驗的是**行為**：真的把那支腳本跑在沙箱樹上，再逐格比對檔案，
 * ⛔ 不是掃 `grep existing` 之類的原始碼字串（失敗形態⑥ —— 把 import 留著、
 * 把合併拿掉，掃描照樣綠）。
 *
 * ⭐ 「哪幾格是產生器的」由 `shippedFamilyConfig({})` **推導**，⛔ 沒有手抄清單：
 * 之後有人加一格新的後台旋鈕（lane R 正在加），它自動被這條守衛保護。
 *
 * ⭐⭐ GH#835（2026-08-29）—— 這一份裡的**兩條閘曾經意見相反**，而根因不是任何一條
 * 閘錯了，是它們共用的那個「產生器擁有哪幾格」是**抽樣**來的
 * （`ownedRowFields(abilityArtRows())` = 這一輪產出的欄位聯集）。
 * 現在兩條都讀 `ownedAbilityFields()`（從 `ABILITY_MIRROR` 的**投影**推導）——
 * 一個住處，⛔ 不可能有兩個答案。第三條 `it()` 就是守這件事的：
 * 把**整類**證據抽掉，那一格必須仍然被收回。
 *
 * ⚠️ 順帶記下量到的事實（票文的假前提）：`tint`/`flyHeight`/`anchor`/`w3xScale`
 * **全部是證據**（`deriveW3xFamilyArt()` 從 `MODEL_USAGE.json` 推導），
 * ⛔ 沒有一格是「活得比證據久的人工旋鈕」。
 *
 * 突變紀錄：
 *   · （2026-08-18）把 `{ ...existing, ...owned }` 改回 `owned` → 第一條紅，並指名
 *     六格 `maxAbilityVfxLayers …` 被吃掉 ✅
 *   · （2026-08-29）把 `ownedAbilityFields()` 改回 `ownedRowFields(abilityArtRows())`
 *     → 第三條紅，並指名那一格過期值留在出貨檔上 ✅
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  abilityArtRows,
  ownedAbilityFields,
  ownedFamilyFields,
  shippedFamilyConfig,
} from "./generateFamilyContent";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../../..");
const SCRIPT = join(HERE, "generateFamilyContent.ts");
const SHIPPED = join(REPO, "content/config/vfx-families.json");
const ABILITY_ART = join(REPO, "content/config/vfx-ability-art.json");

type Row = Record<string, unknown>;
type Doc = Row & { families: Record<string, Row>; abilities: Record<string, Row> };

describe("vfx 家族產生器（GH#378 / GH#427）", () => {
  it("🔴 真的跑一次：產生器不擁有的每一格逐位保留（含 families / abilities 逐列逐格）", () => {
    // ⛔ 一律在沙箱裡跑 —— 對出貨的 content/ 跑產生器會動到別人正在編輯的樹。
    const sandbox = mkdtempSync(join(tmpdir(), "ggd-vfxfam-"));
    try {
      mkdirSync(join(sandbox, "config"), { recursive: true });
      cpSync(SHIPPED, join(sandbox, "config/vfx-families.json"));
      // GH#384 —— 258 筆家族證據住在這一份；產生器少了它會拒絕跑（刻意的：
      // 空的綁定會讓它把 78 份 fx.fam 文件全部當成孤兒掃掉）。
      cpSync(ABILITY_ART, join(sandbox, "config/vfx-ability-art.json"));

      const before = JSON.parse(readFileSync(SHIPPED, "utf8")) as Doc;
      // ⭐ 三層的所有權全部**推導**自產生器自己的產出，⛔ 沒有一張手抄清單：
      //    頂層 = `shippedFamilyConfig({})` 的鍵，逐列那兩層 = 產生器算得出來的那幾格。
      //    之後有人加一格新的後台旋鈕，它自動被這條守衛保護。
      const ownedTop = new Set(Object.keys(shippedFamilyConfig({})));
      const ownedFam = ownedFamilyFields();
      const ownedAb = ownedAbilityFields();
      // ⚠️ 帶著取值函式而不是一個點分字串 —— 技能 id 自己就含點（`godie-e002.q`），
      //    `split(".")` 會把它切成兩層然後永遠取到 undefined（＝這條守衛永遠紅）。
      const unowned: { label: string; pick: (d: Doc) => unknown }[] = [];
      const walk = (label: string, row: Row, at: (d: Doc) => Row | undefined, owned: ReadonlySet<string>): void => {
        for (const k of Object.keys(row)) {
          if (!owned.has(k)) unowned.push({ label: `${label}${k}`, pick: (d) => at(d)?.[k] });
        }
      };
      walk("", before, (d) => d, ownedTop);
      for (const [id, row] of Object.entries(before.families)) {
        walk(`families.${id}.`, row, (d) => d.families?.[id], ownedFam);
      }
      for (const [id, row] of Object.entries(before.abilities)) {
        walk(`abilities.${id}.`, row, (d) => d.abilities?.[id], ownedAb);
      }
      // 夾具前提：出貨檔一格「產生器不擁有的欄位」都沒有的話，下面那條在測空氣。
      expect(unowned.length, "vfx-families.json 沒有任何非產生欄位 —— 這條守衛在測空氣").toBeGreaterThan(0);

      execFileSync("npx", ["tsx", SCRIPT], {
        cwd: REPO,
        env: { ...process.env, GGD_CONTENT_DIR: sandbox },
        encoding: "utf8",
        stdio: "pipe",
      });

      const after = JSON.parse(readFileSync(join(sandbox, "config/vfx-families.json"), "utf8")) as Doc;
      // 整列消失也算在內 —— `pick` 走到那一列的時候拿到 undefined。
      const lost = unowned
        .filter((u) => JSON.stringify(u.pick(after)) !== JSON.stringify(u.pick(before)))
        .map((u) => u.label);
      expect(
        lost,
        "⛔ 這幾格被產生器吃掉了 —— 它們是後台調得到的旋鈕，" +
          "刪掉之後 Zod 用預設補回去，玩家那一場靜靜地變回出貨值。" +
          "修 `shippedFamilyConfig()` 的合併，⛔ 不要改這條測試。",
      ).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 120_000);

  it("🔴 出貨的 abilities 鏡像逐格等於證據那一份 —— 兩個住處不准漂開（GH#427 末節）", () => {
    // ⚠️ GH#384 之後同一份證據住在兩個地方：`vfx-ability-art.json` 的
    // `bindings.<id>.family`（**主**）與 `vfx-families.json` 的 `abilities.<id>`
    // 那五格（**鏡像**，後台 UI 在讀）。鏡像是這支產生器寫的，⛔ 但沒有任何東西
    // 在量它有沒有跟著主的那份走：改了 `vfx-ability-art.json` 卻忘了重跑產生器，
    // 出貨的鏡像就變成一份**過期而看起來完全正常**的資料（失敗形態②）。
    //
    // ⭐ 期望值由 `abilityArtRows()` **推導**（產生器自己那一支函式，讀的是磁碟上
    // 那份證據），⛔ 沒有第二張手抄的對照表 —— 之後鏡像多一格或少一格，這條自動跟上。
    const shipped = (JSON.parse(readFileSync(SHIPPED, "utf8")) as Doc).abilities;
    const expected = abilityArtRows();
    // ⭐ GH#835 —— 反方向的分母是**投影**（`ownedAbilityFields()`），⛔ 不是
    //   `ownedRowFields(expected)`（這一輪的產出聯集）。上面那條保留閘讀的是同一支
    //   函式 ⇒ 兩條閘不可能對「哪幾格歸產生器」給出兩個答案。
    const mirrored = ownedAbilityFields();
    const drift: string[] = [];
    for (const [id, want] of Object.entries(expected)) {
      const got = shipped[id];
      if (!got) {
        drift.push(`abilities.${id} — 整列不在出貨檔裡`);
        continue;
      }
      for (const [k, v] of Object.entries(want)) {
        if (JSON.stringify(got[k]) !== JSON.stringify(v)) {
          drift.push(`abilities.${id}.${k} — 出貨 ${JSON.stringify(got[k])} ≠ 證據 ${JSON.stringify(v)}`);
        }
      }
    }
    // 反方向：鏡像格留在出貨檔上、而證據已經不再點名它 ⇒ 一格過期的值。
    for (const [id, row] of Object.entries(shipped)) {
      for (const k of Object.keys(row)) {
        if (mirrored.has(k) && !(k in (expected[id] ?? {}))) drift.push(`abilities.${id}.${k} — 證據已經不再有這一格`);
      }
    }
    expect(
      drift,
      "`content/config/vfx-families.json` 的 abilities 鏡像與 `content/config/vfx-ability-art.json` " +
        "的證據漂開了。⛔ 不要手改任何一邊：跑\n" +
        "  pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts\n" +
        "然後 `git add content/`：\n  " + drift.slice(0, 20).join("\n  "),
    ).toEqual([]);
  });

  it("🔴 一整類證據歸零時，那一格**仍然**歸產生器管（GH#835 —— 所有權⛔不是抽樣）", () => {
    // ⭐ 上面兩條閘共用一個「產生器擁有哪幾格」的集合。它在 2026-08-29 之前是
    //   **這一輪產出的欄位聯集** —— 一個代理值：某一類證據歸零的那一刻，那一格
    //   同時①掉出保留閘的管轄（過期值被永遠當成「別人的旋鈕」留著）②掉出鏡像閘
    //   反方向的分母（沒有人再比對它）⇒ **兩條閘對同一類一起失明，而全綠**。
    //   ⛔ 數字（哪一格、幾列）不寫進斷言 —— 每次重跑普查都會變（就是本票的成因）。
    const evidence = abilityArtRows();
    const count = new Map<string, number>();
    for (const row of Object.values(evidence)) {
      for (const k of Object.keys(row)) if (k !== "family") count.set(k, (count.get(k) ?? 0) + 1);
    }
    const thinnest = [...count].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]?.[0];
    expect(thinnest, "證據裡除了 family 一格可選欄位都沒有 —— 這條守衛在測空氣").toBeTruthy();

    const before = JSON.parse(readFileSync(SHIPPED, "utf8")) as Doc;
    const victim = Object.keys(evidence).find((id) => thinnest! in evidence[id]! && before.abilities?.[id]);
    expect(victim, `沒有一列同時在證據與鏡像上帶著 ${thinnest} —— 這條守衛在測空氣`).toBeTruthy();

    const sandbox = mkdtempSync(join(tmpdir(), "ggd-vfxfam-thin-"));
    try {
      mkdirSync(join(sandbox, "config"), { recursive: true });
      cpSync(SHIPPED, join(sandbox, "config/vfx-families.json"));
      // 把**整類**證據抽掉（⛔ 不是抽掉一列）：那一格從此在產出裡出現零次。
      // ⚠️ 直接 write（⛔ 不 cpSync）—— 出貨產物是 444，複製過去照樣鎖著。
      const art = JSON.parse(readFileSync(ABILITY_ART, "utf8")) as {
        bindings: Record<string, { family?: Record<string, unknown> }>;
      };
      for (const row of Object.values(art.bindings)) if (row.family) delete row.family[thinnest!];
      writeFileSync(join(sandbox, "config/vfx-ability-art.json"), JSON.stringify(art, null, 2));

      execFileSync("npx", ["tsx", SCRIPT], {
        cwd: REPO,
        env: { ...process.env, GGD_CONTENT_DIR: sandbox },
        encoding: "utf8",
        stdio: "pipe",
      });

      const after = JSON.parse(readFileSync(join(sandbox, "config/vfx-families.json"), "utf8")) as Doc;
      expect(
        after.abilities?.[victim!]?.[thinnest!],
        `⛔ 證據整類消失之後 abilities.${victim}.${thinnest} 還留在出貨檔上 —— ` +
          "那是一格沒有出處的過期值，而**兩條閘都不會再看它**。" +
          "所有權要從 `ABILITY_MIRROR` 的投影推導，⛔ 不是從這一輪的產出聯集。",
      ).toBeUndefined();
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 120_000);
});
