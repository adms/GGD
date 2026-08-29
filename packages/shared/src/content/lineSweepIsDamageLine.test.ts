/**
 * 📏 JASS「直線分段掃擊」家族 = `damageLine`，⛔ 不是一顆投射體。
 *
 * ⭐ 為什麼是 `damageLine` 而**不是** GH#401 票文寫的 `delayed`+`advance`：
 * `JASS_BEHAVIOR.json` 這五支的 `timing` 逐字都是「instant 單幀」、`movement`
 * 逐字都是「無 (傷害為單幀直線帶)」/「傷害線瞬間鋪滿」——⛔ 沒有一支會隨時間推進。
 * 迴圈體是 `GetUnitsInRangeOfLocMatching` + `ForGroupBJ`（⛔ 零 `CreateNUnitsAtLoc`、
 * 零 `AddSpecialEffect`）＝ CLAUDE.md 讀 JASS 規矩⑥ 的**傷害班表**，
 * 而那一列指的住處就是 `damageLine`。視覺是**一具**放大的光束 dummy
 * （h007/h00X/h01Y，`SetUnitScalePercent`），⛔ 不是 N 具排開的小光束。
 * ⇒ 把它接成 `delayed`+`advance` 會是「用現有參數湊一個看起來像的」（第〇·六禁止的第三條路）。
 *
 * ⚠️ 這條閘**兩個方向都走**（第二守則 ⑫）：
 *  ① 已接線的四支 —— 必須有 `damageLine`，且**兩個住處**（standalone ↔ champion 內嵌）一致
 *  ② 還掛在 `tpl-line-sweep` 上的 —— 必須列在 `STILL_ON_TEMPLATE` 裡帶著理由
 *     （⛔ 否則一支被靜靜退回單發投射近似，看起來跟做完了一模一樣）
 *
 * ⭐⭐ 而**傷害班表換成 `damageLine`，⛔ 不代表那道波可以一起刪掉** ——
 * 那是兩個軸（CLAUDE.md：⛔ 不要把「傷害判定的視覺」與「本體」混為一談）。
 * 出貨前例就在 exemplar 自己身上：`godie-e002.e` / `godie-e00l.e`（20-03）與
 * `godie-e00r.r`（59-04）換掉投射體之後，都留下 `spawnVfx{該投射體文件的 vfxKey}`，
 * `abilityNoOpEffects.test.ts` 的 GH#375 註記逐字：「⋯現在是 `spawnVfx`，指的是
 * **同一份彈道文件的 vfxKey**，所以**元素照樣飛出去**、碰撞體沒了」。
 * ⇒ ③ 第三個方向：換掉投射體的每一支，都要把那顆投射體的波帶過來。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * 幾何的每一格都引用得到出處（⛔ 沒有一個數字是編的）：
 * · exemplar `godie-e002.e`（20-03 約束與勝利之劍 A0D5，6段×200u / AoE 400）
 *   出貨 length 14 / width 2.0 —— 這是**已經在跑**的那一份，⛔ 不是我挑的。
 * · 09-04 龜派氣功 A03S 的 JASS 幾何與 A0D5 **逐格同型**（同 6×200u / AoE 400，
 *   census notes 逐字「與 Excalibur 同型」）⇒ 抄 exemplar。
 * · 90-04 陽光烈焰 A0R4 是 10×100u (=1000u) / AoE 280 ⇒ 用 exemplar 自己的比例尺：
 *   14 × 1000/1200 = 11.67、2.0 × 280/400 = 1.4。
 */
const CONVERTED: Record<string, { champ: string; slot: string; length: number; width: number }> = {
  "godie-o00x.r": { champ: "godie-o00x", slot: "R", length: 14, width: 2.0 },
  "godie-ogrh.r": { champ: "godie-ogrh", slot: "R", length: 14, width: 2.0 },
  "godie-h02r.r": { champ: "godie-h02r", slot: "R", length: 11.67, width: 1.4 },
  "godie-hgam.r": { champ: "godie-hgam", slot: "R", length: 11.67, width: 1.4 },
};

/** 還掛在模板上的。⭐ 這張表只能變短；每一列要寫**為什麼還沒接**。 */
const STILL_ON_TEMPLATE: Record<string, string> = {
  "godie-n00b.q":
    "57-01 空氣砲 —— ⛔ JASS_BEHAVIOR 裡**沒有 57-01 這一列**（哆啦A夢只有 57-00/03/04/002），" +
    "⇒ 它的 `tpl-line-sweep` 是一次**沒有出處的分類**。接線之前要先查它到底是不是直線掃擊。",
};

/**
 * 被 `damageLine` 取代掉的那顆投射體 —— ⭐ 它的 `vfxKey` **就是玩家看見的那道波**。
 * ⛔ 這裡刻意只記投射體的 id，波的身分**只有一個住處**（那份 `projectile@1` 文件），
 * ⛔ 不抄字面值 —— GH#425 哪天替 wave 家族換一份拖尾，這條閘自動跟著走。
 */
const WAS_PROJECTILE: Record<string, string> = {
  "godie-o00x.r": "imported.wave.ki",
  "godie-ogrh.r": "imported.wave.ki",
  "godie-h02r.r": "imported.wave",
  "godie-hgam.r": "imported.wave",
};

type Effect = { kind: string; [k: string]: unknown };
type Doc = { effects?: Effect[]; template?: { ref?: string } };

const ability = (id: string): Doc =>
  JSON.parse(readFileSync(join(REPO, "content/abilities", `${id}.json`), "utf8")) as Doc;

const projectileVfx = (id: string): string =>
  (JSON.parse(readFileSync(join(REPO, "content/projectiles", `${id}.json`), "utf8")) as { vfxKey: string })
    .vfxKey;

const embedded = (champ: string, slot: string): Doc =>
  (JSON.parse(readFileSync(join(REPO, "content/champions", `${champ}.json`), "utf8")) as {
    abilities: Record<string, Doc>;
  }).abilities[slot]!;

describe("直線分段掃擊 = damageLine (line-sweep-is-damage-line)", () => {
  it("⭐ 四支已接線的：傷害走 damageLine，⛔ 沒有殘留的單發投射近似", () => {
    for (const [id, want] of Object.entries(CONVERTED)) {
      const fx = ability(id).effects ?? [];
      const line = fx.find((e) => e.kind === "damageLine");
      expect(line, `${id}: 沒有 damageLine —— 卡面說「一直線」而 JSON 打不出線`).toBeDefined();
      expect([line!.length, line!.width], `${id} 的線幾何漂了`).toEqual([want.length, want.width]);
      // ⛔ 原作這一族**沒有一支是投射體**（census: movement「無」）——
      //    留著它就是把同一條傷害線畫成第二份視覺 + 一顆會被地形擋住的彈體。
      expect(
        fx.filter((e) => e.kind === "spawnProjectile").length,
        `${id}: 還留著 spawnProjectile —— 那是「逐段折算為單發投射」的殘骸`,
      ).toBe(0);
    }
  });

  it("⭐ 兩個住處要一致 —— champion 內嵌鏡像逐位元等於 standalone 的 effects", () => {
    for (const [id, want] of Object.entries(CONVERTED)) {
      const a = JSON.stringify(ability(id).effects);
      const c = JSON.stringify(embedded(want.champ, want.slot).effects);
      expect(c, `${id}: champion ${want.champ}.${want.slot} 的內嵌版與 standalone 不一致`).toBe(a);
    }
  });

  it("⭐ 投射體換成 damageLine 之後，那道**波仍然看得見**（⛔ 傷害與視覺是兩個軸）", () => {
    // ⚠️ 只驗 standalone —— 上一條已經逐位元釘死內嵌鏡像，⛔ 不必再寫第二遍。
    for (const [id, proj] of Object.entries(WAS_PROJECTILE)) {
      const want = projectileVfx(proj);
      expect(
        (ability(id).effects ?? []).some((e) => e.kind === "spawnVfx" && e.vfxId === want),
        `${id}: 把 ${proj} 換成 damageLine 卻沒有把它的 ${want} 帶過來 ⇒ 玩家再也看不到那道波`,
      ).toBe(true);
    }
    // ⭐ 這條規矩的**出處**：exemplar 自己就是這樣做的。它一旦不再這樣，上面那四支的理由就沒了。
    expect(
      (ability("godie-e002.e").effects ?? []).some(
        (e) => e.kind === "spawnVfx" && e.vfxId === projectileVfx("imported.wave"),
      ),
      "exemplar godie-e002.e 自己不再帶波了 —— 這條規矩的出處消失了（第三守則：先驗那個宣稱）",
    ).toBe(true);
  });

  it("⛔ 反方向：還掛在 tpl-line-sweep 上的每一支都要在表裡帶理由", () => {
    const ids = Object.keys(CONVERTED).filter((id) => ability(id).template?.ref === "tpl-line-sweep");
    expect(ids.join(", "), "這幾支宣稱接線完成，卻還綁著 tpl-line-sweep（展開會蓋掉 effects）").toBe("");
    for (const id of Object.keys(STILL_ON_TEMPLATE)) {
      expect(ability(id).template?.ref, `${id} 已經不在模板上了 —— 把它從 STILL_ON_TEMPLATE 刪掉`).toBe(
        "tpl-line-sweep",
      );
    }
  });
});
