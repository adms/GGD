/**
 * standin-roster (docs/todo/standin-roster.md): draft heroes promoted from
 * `tools/w3x-import/out/GoDieEX22s/drafts/champions/` into content/champions/ with
 * DEFAULT VOXEL BLOCK stand-in models (their WC3 models are Blizzard built-ins,
 * unavailable — explicit user directive). See drafts/PROMOTED.md for the mapping.
 *
 * Of the 25 promoted, 5 were pruned per the user's whitelist rule「盡量收，除非重複」
 * (keep everything except duplicates): godie-e010 / godie-o02n (exact-name twins of
 * godie-e00s / godie-o02o) and godie-h00w / godie-n01b / godie-o030 (exact-name
 * duplicates of live champions godie-harf / godie-nman / godie-orkn — transform
 * forms sharing the base hero's map number).
 *
 * TASK #249 UN-PRUNED ALL FIVE, in two steps.
 *
 * FIRST, `godie-o02n`: the prune had it backwards. The map's `Eme1`/`Emeu`
 * fields make O02N the BASE unit of 曹操孟德 and the SHIPPED godie-o02o his
 * 87-03 天下號令 transform, so the prune deleted the hero and kept the
 * transformation. It is promoted (21 kept / 4 pruned at that point).
 *
 * THEN THE OTHER FOUR, once the transform mechanic actually landed. "Leaving
 * them out costs nothing while the mechanic does not exist" was true and stopped
 * being true: `applyChampionForm` re-points `ChampionComp.championId` at the
 * counterpart and the snapshot resolves `Champions.get(championId).modelKey`
 * every tick, and that call THROWS on an unregistered id — so the four are now
 * a hard requirement of the feature, not a completeness nicety. They live in
 * {@link ALTERNATE_FORM_IDS} rather than STANDIN_IDS because the draft role
 * heuristic does not apply to them; see that constant. 25 promoted / 0 pruned.
 *
 * IMPORTANT: this suite reads the promoted docs by DIRECT file path (not via
 * FsContentSource/ContentLoader) because content/champions/_index.json is only
 * rebuilt by `content:build` in the main session. Direct reads + zChampionDoc.parse
 * + ref checks against the EXISTING _index.json files keep the suite green both
 * before and after the reindex.
 *
 * ── 2026-08-13 LEGACY 搬遷 ───────────────────────────────────────────────────
 * owner 把 41 位未上架英雄搬進 `content/_legacy/champions/`。**升級名單本身沒有
 * 改** —— 25 位當年真的從 drafts 升上來過,那是歷史,不會因為今天誰上不上架而變。
 * 改的是**母體**:下面的表現在是「這 25 位各自在哪一邊」,而所有「文件長得對不對」
 * 的斷言只跑**營運**那一半（引擎唯一會註冊的那些）。
 *
 * ⛔ 歸檔 ≠ 刪除。所以每一位仍然必須**恰好**出現在其中一個目錄裡:
 * 兩邊都沒有 = 真的掉了(那是缺陷);兩邊都有 = 搬遷搬了一半(也是缺陷)。
 * 這比原本的 `existsSync(live)` 更嚴,不是更鬆。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/champions/_index.json`
 *   · `content/champions/_index.json` 是 **skillremake:json · content:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh content:build`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     content/champions/_index.json 由 content:build 掃目錄重建 ⇒ 手改必被 shippedBundleIsCurrent
 *     判 stale;要增減成員就增減 content/champions/ 裡的**文件**,再 bash scripts/genrun.sh content:build。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import type { EffectDef } from "../sim/effects/effect";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
/** 2026-08-13 起,未上架英雄住這裡。引擎讀不到,但檔案還在。 */
const LEGACY_DIR = join(CONTENT_DIR, "_legacy/champions");

/** The 21 kept stand-ins (drafts/PROMOTED.md is the authoritative table). */
const STANDIN_IDS = [
  // ⭐ 2026-09-02（GH#933）—— `godie-e00r`（初號機）**畢業了**：
  // 它現在跑自己的 `w3x.stock.satyrtrickster`（從 War3x.mpq 抽出來轉的），
  // ⛔ 不再是體素替身 ⇒ 從這份升級名單移除。
  // ⚠️ 這是**縮短**（棘輪的正確方向）：一位英雄拿到自己的模型是進步。
  "godie-e00s",
  "godie-e00t",
  "godie-e00u",
  "godie-e00v",
  "godie-e015",
  "godie-h001",
  "godie-h021",
  "godie-h02k",
  "godie-h02n",
  "godie-h02s",
  "godie-h02y",
  "godie-h02z",
  "godie-n00b",
  "godie-n01l",
  "godie-o02n",
  "godie-o02o",
  "godie-u00b",
  "godie-u00k",
  "godie-u012",
  "godie-u01f",
] as const;

/**
 * Pruned duplicates — must NOT exist on disk (whitelist rule: 除非重複).
 *
 * `godie-o02n` was REMOVED from this list at task #249. The prune misread it:
 * the map's WC3 Metamorphosis fields (`Eme1`/`Emeu` on ability A0DB 87-03
 * 天下號令) make O02N 曹操孟德's BASE unit and O02O his TRANSFORMED body, so
 * "exact-name twin of godie-o02o" was the transform relationship, not a
 * duplicate — and dropping the base left the hero present in the game ONLY in
 * his transformed state. It is promoted now (see STANDIN_IDS).
 *
 * THE OTHER FOUR LEFT TOO, one step later in #249, and are now listed in
 * {@link ALTERNATE_FORM_IDS}. Nothing is pruned any more, so this list is empty.
 */
const PRUNED_IDS: readonly string[] = [];

/**
 * The four 變身 ALTERNATE bodies (#249). A separate cohort from STANDIN_IDS on
 * purpose — same `drafts/champions/` origin, DIFFERENT rules:
 *
 *   godie-h00w  26 洨者狀態   ← godie-harf 開天闢地‧洨者聖臨
 *   godie-o030  30 變態紳士   ← godie-orkn 變態紳士
 *   godie-n01b  40 萬解       ← godie-nman 萬解-貓王胖虎
 *   godie-e010  70 紮根       ← godie-e00s 紮根
 *
 * WHY THEY EXIST AT ALL. They are not "kept because we keep everything": the
 * transform primitive re-points `ChampionComp.championId` at the counterpart,
 * and `Registry.get()` THROWS on an unregistered id while the snapshot resolves
 * every champion's model through it EVERY TICK. A transform into a body with no
 * doc does not fail to render — it takes the room down 30 times a second.
 *
 * WHY THEY ARE NOT IN `STANDIN_IDS`. The "ranged ⇒ `champ.sela`" role heuristic
 * below is a DRAFT-PROMOTION rule, and an alternate body must not follow it: its
 * stand-in has to match the body the player transforms OUT OF, or the swap reads
 * as a different character rather than the same one changed. `godie-n01b` is the
 * live case — ranged, but it wears `champ.skin.rogue` because 憤怒的胖虎 IS
 * godie-nman (`champ.skin.rogue`) mid-transform. Folding it into STANDIN_IDS
 * would force the rig to disagree with its own base half.
 */
const ALTERNATE_FORM_IDS = [
  "godie-e010",
  "godie-h00w",
  "godie-n01b",
  "godie-o030",
] as const;

/** Alternate body → the base hero whose stand-in rig it must mirror. */
const ALTERNATE_BASE: Record<string, string> = {
  "godie-e010": "godie-e00s",
  "godie-h00w": "godie-harf",
  "godie-n01b": "godie-nman",
  "godie-o030": "godie-orkn",
};

/** The four KayKit voxel block model docs (pre-existing model@1 ids). */
const VOXEL_MODELS = ["champ.sela", "champ.thorne", "champ.skin.barbarian", "champ.skin.rogue"];

const livePath = (id: string): string => join(CONTENT_DIR, "champions", `${id}.json`);
const legacyPath = (id: string): string => join(LEGACY_DIR, `${id}.json`);

/** 營運名冊上嗎?(⚠️ 「不在」有兩種:歸檔了,或真的掉了 —— 別把它們混為一談) */
const isLive = (id: string): boolean => existsSync(livePath(id));
const isArchived = (id: string): boolean => existsSync(legacyPath(id));

function readDoc(id: string): unknown {
  return JSON.parse(readFileSync(livePath(id), "utf-8"));
}

/** 只留營運名冊上的那些 —— 引擎唯一會註冊、玩家唯一碰得到的母體。 */
const liveIds = <T extends string>(ids: readonly T[]): T[] => ids.filter(isLive);

function indexIds(collection: string): Set<string> {
  const idx = JSON.parse(
    readFileSync(join(CONTENT_DIR, collection, "_index.json"), "utf-8"),
  ) as { entries: Array<{ id: string }> };
  return new Set(idx.entries.map((e) => e.id));
}

function walkEffects(effects: EffectDef[], visit: (e: EffectDef) => void): void {
  for (const e of effects) {
    visit(e);
    if (e.kind === "spawnProjectile") walkEffects(e.onHit, visit);
  }
}

/** 升級名單裡**還在營運**的那些,已解析。文件層的斷言只跑這一半。 */
const parsedDocs = (): ChampionDoc[] =>
  liveIds(STANDIN_IDS).map((id) => zChampionDoc.parse(readDoc(id)));

describe("voxel stand-in roster (standin-roster)", () => {
  it("every promoted doc is in EXACTLY one of 營運/歸檔, and nothing is pruned (draft-promote-count)", () => {
    cover("draft-promote-count");
    // 名單本身不可以有重複條目(這一條跟名冊大小無關,是這份字面表的自檢)
    expect(new Set<string>(STANDIN_IDS).size).toBe(STANDIN_IDS.length);
    for (const id of STANDIN_IDS) {
      // ⛔ 這裡本來是 `existsSync(live) === true`。2026-08-13 把 14 位搬進 _legacy
      // 之後那個寫法會把「歸檔」讀成「不見了」。改成 XOR:恰好一邊有。
      // 兩邊都沒有 = 檔案真的掉了;兩邊都有 = 搬遷只搬了一半、留下一份會被引擎讀到
      // 的孤兒 —— 兩種都是缺陷,而且都會在這裡指名道姓地紅。
      expect(
        [isLive(id), isArchived(id)].filter(Boolean).length,
        `${id}: 應該恰好在 content/champions 或 content/_legacy/champions 其中一邊`,
      ).toBe(1);
    }
    // 而且營運那一半不是空的(否則下面每一條文件斷言都會空過)
    expect(liveIds(STANDIN_IDS).length).toBeGreaterThan(0);
    for (const id of PRUNED_IDS) {
      expect(isLive(id) || isArchived(id), `${id} pruned`).toBe(false);
      expect(existsSync(join(CONTENT_DIR, "abilities", `${id}.ex.json`)), `${id} ex orphan`).toBe(false);
    }
  });

  it("每一對 變身 半身都同進同出,而且營運的那幾對鏡射本體的 rig (standin-alternate-forms)", () => {
    cover("draft-promote-count");
    // The reason these bodies must exist at all: the transform re-points
    // `championId` at the counterpart and the snapshot's `Champions.get()`
    // THROWS on an id the registry never saw — 30 times a second.
    //
    // ⭐ 2026-08-13 之後這條變成**更強**的守衛,而不是更弱的。原本問的是「這四位在
    // 不在 content/champions」;現在問的是「本體與變身型態**在不在同一邊**」——
    // 那正是搬遷唯一能踩爆遊戲的方式:本體留在營運名冊、變身型態進了 _legacy,
    // 於是玩家一按 R,`Champions.get()` 就把整個房間帶下去。
    expect(new Set<string>(ALTERNATE_FORM_IDS).size).toBe(ALTERNATE_FORM_IDS.length);
    let livePairs = 0;
    for (const id of ALTERNATE_FORM_IDS) {
      const baseId = ALTERNATE_BASE[id]!;
      expect(isLive(id) || isArchived(id), `${id} 檔案不見了`).toBe(true);
      expect(isLive(baseId) || isArchived(baseId), `${baseId} 檔案不見了`).toBe(true);
      expect(
        isLive(id),
        `${id} 與本體 ${baseId} 被搬到不同邊 —— 變身時 Champions.get() 會 throw`,
      ).toBe(isLive(baseId));
      if (!isLive(id)) continue;
      livePairs++;
      const alt = zChampionDoc.parse(readDoc(id));
      const base = zChampionDoc.parse(readDoc(baseId));
      // the rig follows the BASE hero, never the ranged/melee heuristic — this
      // is exactly what keeps a transform reading as "same character, changed"
      expect(alt.modelKey, `${id} rig mirrors ${base.id}`).toBe(base.modelKey);
      // and the link the sim actually reads points back at this body
      expect(base.transform?.counterpartId, `${base.id} → ${id}`).toBe(id);
    }
    // 不是「四對都歸檔了所以整條空過」
    expect(livePairs).toBeGreaterThan(0);
  });

  it("營運名冊上沒有任何一條 變身 連結指向 _legacy (standin-transform-closed)", () => {
    cover("draft-promote-count");
    // 上面那條只看得到四對寫死的。這一條把**整個營運名冊**掃一遍 —— 搬遷之後真正
    // 該成立的不變式是「引擎讀得到的 counterpartId,引擎也一定註冊得到」。
    const dangling: string[] = [];
    for (const f of readdirSync(join(CONTENT_DIR, "champions"))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = zChampionDoc.parse(
        JSON.parse(readFileSync(join(CONTENT_DIR, "champions", f), "utf-8")),
      );
      const cp = doc.transform?.counterpartId;
      if (cp !== undefined && !isLive(cp)) {
        dangling.push(`${doc.id} → ${cp}${isArchived(cp) ? "(在 _legacy)" : "(檔案不存在)"}`);
      }
    }
    expect(dangling, "營運英雄的變身對象不在營運名冊上 —— 一變身就 Champions.get() throw").toEqual(
      [],
    );
  });

  it("every promoted doc is a valid champion@1 with matching id (standin-schema-valid)", () => {
    cover("standin-schema-valid");
    // ⭐ 這一條刻意**兩邊都跑**。歸檔的文件引擎讀不到,但它們是「哪天重新上架就搬
    // 回來」的東西 —— 一份在 _legacy 裡默默腐爛的 champion@1 會在重新上架的那天
    // 才爆,而那時候沒有人記得它是什麼。schema 驗證不花錢,兩邊一起驗。
    for (const id of STANDIN_IDS) {
      const raw = JSON.parse(readFileSync(isLive(id) ? livePath(id) : legacyPath(id), "utf-8"));
      const doc = zChampionDoc.parse(raw); // throws on drift
      expect(doc.id).toBe(id);
      expect(doc.schema).toBe("champion@1");
      // combined 名字+稱號 unified-name convention: non-empty, real map name
      expect(doc.name.length).toBeGreaterThan(0);
      for (const slot of ["Q", "W", "E", "R"] as const) {
        expect(doc.abilities[slot].slot).toBe(slot);
        expect(doc.abilities[slot].id).toBe(`${id}.${slot.toLowerCase()}`);
      }
    }
  });

  it("all hard refs resolve against the EXISTING indexes (standin-refs-closed)", () => {
    cover("standin-refs-closed");
    const models = indexIds("models");
    const items = indexIds("items");
    const projectiles = indexIds("projectiles");
    for (const doc of parsedDocs()) {
      expect(models.has(doc.modelKey), `${doc.id} modelKey ${doc.modelKey}`).toBe(true);
      for (const item of doc.buildPriority) {
        expect(items.has(item), `${doc.id} item ${item}`).toBe(true);
      }
      // exAbility (if any) must ref an EXISTING ability doc. Checked by direct
      // file existence (not _index.json) — the ex-docs for the promoted heroes
      // are regenerated by gen_ex_content.py and indexed on the next content:build.
      if (doc.exAbility !== undefined) {
        expect(
          existsSync(join(CONTENT_DIR, "abilities", `${doc.exAbility}.json`)),
          `${doc.id} exAbility ${doc.exAbility}`,
        ).toBe(true);
      }
      for (const slot of ["Q", "W", "E", "R"] as const) {
        walkEffects(doc.abilities[slot].effects, (e) => {
          if (e.kind === "spawnProjectile") {
            expect(projectiles.has(e.projectileId), `${doc.id} ${slot} proj`).toBe(true);
          }
        });
      }
    }
  });

  it("voxel models distributed by role heuristic, no mono-model roster (standin-model-dist)", () => {
    cover("standin-model-dist");
    const counts = new Map<string, number>();
    for (const doc of parsedDocs()) {
      expect(VOXEL_MODELS, `${doc.id} uses a voxel model`).toContain(doc.modelKey);
      counts.set(doc.modelKey, (counts.get(doc.modelKey) ?? 0) + 1);
      // ranged heroes always use the mage rig (only voxel attack clip that reads
      // ranged). ⭐ 這一條才是「role heuristic 真的跑過」的承重斷言,而且它與名冊
      // 大小無關 —— 搬遷前後都一樣硬。
      if (doc.attackType === "ranged") expect(doc.modelKey).toBe("champ.sela");
    }
    // 「不是清一色同一具」—— 這就是測試名字說的那件事,而且不需要任何出貨數字
    expect(counts.size, "整批升級英雄擠在同一具 rig 上 —— heuristic 沒跑").toBeGreaterThan(1);
    // ⚠️ 原本這裡還有兩條:「四具 rig 都有人用」與「單一 rig ≤ 12 位」。兩條都是
    // 對**當年 25 位升級英雄**那個母體講的。2026-08-13 之後這個 cohort 只剩 7 位,
    // 對 7 個樣本談分布是沒有意義的(champ.thorne 一位都沒有,而那不是缺陷)。
    // 「四具 rig 都還有人用」本身仍然是真的守衛,只是母體要換成**整個營運名冊** ——
    // 它搬去了 standinCensus.test.ts 的普查那一條(那裡讀得到全部 21 位借用者)。
  });

  it('every promoted doc is tagged "voxel-standin" for the later model swap (standin-tag)', () => {
    cover("standin-tag");
    for (const doc of parsedDocs()) {
      expect(doc.tags, doc.id).toContain("voxel-standin");
      // still carries the import lineage tags used by the rest of the roster
      expect(doc.tags).toContain("wc3-import");
      expect(doc.tags).toContain("godie");
    }
  });
});
