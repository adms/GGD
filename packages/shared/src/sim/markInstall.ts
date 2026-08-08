/**
 * 進場安裝 —— 把**技能文件宣告的**具名標記真的發到英雄身上。
 *
 * 沒有這一支的話，`ability.marks` 就是七種失敗形態的第 ②：算出來了（schema 收了、
 * `installMark` 寫好了、免死攔截也接上了）但**從沒送到**任何一個實體身上，
 * 於是十二道試煉在真的遊戲裡一層都不存在，而所有測試都是綠的。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 三個地方都要看，因為一位英雄的技能住在三處
 *
 *   · `def.abilities.Q/W/E/R` —— 內嵌的四格（`registerChampion` 已經把 standalone
 *     那一份解析進來了，所以讀這裡就是讀權威版，見 registry 的 shadowing 註解）
 *   · `def.passiveAbility`    —— 天生技，**獨立文件**，只給 id
 *   · `def.exAbility`         —— EX，同樣只給 id
 *
 * 漏掉第二個的代價是可量的：第一個使用者【十二道試煉】正是一支 standalone
 * `PASSIVE` 文件，只掃 `abilities` 的實作會安靜地什麼都不做。
 *
 * ② 安裝順序是**固定的**，而且刻意跟畫面上的技能列同序（#192：天生技 / Q / W /
 *    E / R / EX）。順序在這裡是語意的一部分 —— 見下面的重複政策。
 *
 * ③ ⚠️ **不看 rank**。W/E/R 進場時 rank 0（還沒學），EX 也是，但標記照樣發下去。
 *    理由：標記是「這個角色天生帶著的計數器」（十二道試煉、風王結界、縮地），
 *    owner 的文案是「**初始**擁有十二層」，不是「學會之後才有」。
 *    ⛔ 這是一個**決策點**。哪天要「學會才發」，正確的做法是在 `MarkSpec` 上多一格
 *    （schema 那一側的欄位），不是在這裡長一個 `if (rank > 0)` —— 那會把選擇權
 *    從後台搬回程式碼裡。
 *
 * ④ 純度：不抽 rng、不看時鐘、迭代順序完全由上面那張固定表決定（不吃 Map 插入序）。
 */
import type { ChampionId, EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { AbilityDef, ChampionDef } from "./content/defs";
import type { MarkId, MarkSpec } from "./marks";
import { Abilities, Champions } from "./content/registry";
import { installMark } from "./marks";

/**
 * `AbilityDef` 目前沒有 `marks` 這一格 —— 它是 `zAbilityDoc` 上的新欄位，而
 * `registerAll` 是把**文件本身**當成 `AbilityDef` 註冊的（結構式），所以執行期
 * 這個鍵確實在物件上。這裡用一個窄檢視把它讀出來，而不是去改 `defs.ts`：
 * 型別哪天補上去了，這個交集依然成立（同名同型），不會變成謊話。
 */
type MarkBearing = { readonly marks?: readonly MarkSpec[] };

const CORE_SLOTS = ["Q", "W", "E", "R"] as const;

/** 天生技 / Q / W / E / R / EX —— 固定順序，缺席的略過。 */
function abilitiesInInstallOrder(def: ChampionDef): AbilityDef[] {
  const out: AbilityDef[] = [];
  const byId = (id: string | undefined): void => {
    const a = id === undefined ? undefined : Abilities.tryGet(id as never);
    if (a !== undefined) out.push(a);
  };
  byId(def.passiveAbility);
  for (const slot of CORE_SLOTS) {
    const a = def.abilities[slot] as AbilityDef | undefined;
    if (a !== undefined) out.push(a);
  }
  byId(def.exAbility);
  return out;
}

/**
 * 把這位英雄所有技能宣告的標記裝上去。回傳**被跳過的重複 markId**。
 *
 * ⚠️ 重複政策：**先到先贏，後者不覆蓋前者**。
 *
 * 為什麼不是「後者覆蓋」：`installMark` 是整筆重建 —— 它把 `count` 設回 `initial`
 * 並且**把 `spent` 歸零**。所以「後者覆蓋」在同一位英雄的兩支技能宣告同一個
 * markId 時，會安靜地把第一支的層數與已累積的永久加成一起洗掉，而畫面上跟正常
 * 完全一樣（失敗形態②）。先到先贏至少是**穩定**的：順序由上面那張固定表決定，
 * 不是由 Map 插入序決定，所以兩個 replica 得到同一個結果。
 *
 * 而且它不是靜默的：每跳過一筆就發一個 `markInstallConflict` 事件，並且回傳給
 * 呼叫端。內容作者把同一個標記寫在兩支技能上，多半是打錯字，事件流看得到。
 * ⛔ 這裡刻意**不 throw** —— 一份重複的技能文件不可以讓一整場比賽開不起來
 * （同 `MatchRecorder` 那條 fail-open 的理由），但也不可以沒有人說得出它發生過。
 */
export function installMarksForChampion(
  world: SimWorld,
  id: EntityId,
  championId: ChampionId,
): readonly MarkId[] {
  const def = Champions.tryGet(championId);
  if (def === undefined) return [];
  const conflicts: MarkId[] = [];
  for (const ability of abilitiesInInstallOrder(def)) {
    const specs = (ability as AbilityDef & MarkBearing).marks;
    if (specs === undefined) continue;
    for (const spec of specs) {
      if (world.marks.get(id)?.has(spec.markId) === true) {
        conflicts.push(spec.markId);
        world.emit("markInstallConflict", { id, markId: spec.markId, abilityId: ability.id });
        continue;
      }
      installMark(world, id, spec);
    }
  }
  return conflicts;
}
