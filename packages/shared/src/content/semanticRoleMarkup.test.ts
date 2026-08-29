/**
 * GH#757 —— 「語意色彩」`descriptionRoles` **為什麼是 `superseded` 而不是欠債**，
 * 寫成一條會紅的閘。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 背景：一條有渲染、沒有輸入的鏈
 * ─────────────────────────────────────────────────────────────────────────────
 * `ability@1.descriptionRoles` 是 task #114 的產物：把 w3x 的 `|cAARRGGBB…|r`
 * 內嵌色碼還原成 `[c=role]…[/c]` 語意標記，讓卡面上的「傷害/冷卻/魔力」各自有
 * 一個正規化的顏色。渲染那一半整條都活著（`abilityText.ts` 的 `classifyRole` /
 * `ROLE_COLOR` / `parseRoleMarkup` → Tooltip / Codex 四個消費端），而**輸入端從
 * 來沒有存在過**：2026-08-29 實查 421 份 ability + 71 份 champion doc 採用數
 * **0/492**，產出函式 `tools/w3x-import/w3xlib/wts.py::to_role_markup`
 * **零呼叫者**。
 *
 * ⭐ 兩條出路（拆／餵）之中選了**拆**，而理由**不是**「沒人排到」——
 * 是量到的：**今天餵它會當場毀掉 338 張卡**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這條閘在驗的**關係**（⛔ 不是一個名詞）
 * ─────────────────────────────────────────────────────────────────────────────
 * 技能說明今天是**推導**出來的：`content` 裡寫的是佔位符（`{{cd}}` / `{{dmg}}` /
 * `{{mp}}` …，出貨 421 份技能裡 **338 份**帶著它們），載入時由
 * `registries.ts::withProse` 代入。⚠️ 而 `withProse` 只代進 **`description` 一格**。
 *
 * 客戶端讀卡面的唯一入口 `abilityText.ts::docDescription` 則**優先回傳
 * `descriptionRoles`**（:48-51）。⇒ 兩件事湊起來：
 *
 *     一份填了 `descriptionRoles` 的文件 ⇒ 卡面上直接印出 `{{cd}}` / `{{dmg}}`。
 *
 * 這正是第〇·四守則的那個病：**同一句話的第二個住處，而寫入端只寫第一個**。
 * ⇒ 所以 `descriptionRoles` 的零採用是**正確的狀態**，「採用它」才是缺陷 ——
 * 這逐字就是 `fieldAdoption.test.ts` 的 `superseded` 定義。
 *
 * ⭐ **取代它的是什麼**（知識另存，⛔ 不是無聲消失）：語意角色**沒有被放棄**，
 * 它換了一個住處 —— `{{dmg}}` 就是 `[c=damage]`、`{{cd}}` 就是 `[c=duration]`、
 * `{{mp}}` 就是 `[c=mana]`。差別在於佔位符住在**唯一**的住處（`description`）
 * 並在載入時算繪，而 `descriptionRoles` 是同一句話的第二份字串。
 * ⇒ 真的想要色彩的那一天，正解是**從佔位符推導顏色**（零內容改動、零第二住處），
 * ⛔ 不是把 492 份文件各塞一份副本。
 *
 * ⭐ **退役的知識存在哪裡**：`docs/legacy/_semantic-role-markup-superseded.md`
 * —— 角色詞彙、hex→role 的分類規則（含閾值與覆寫表）、`[c=role]…[/c]` 的文法、
 * 以及那七個正規化色碼，全部逐字抄在那裡。⚠️ 這一行不是註腳：本檔與
 * `fieldAdoption.test.ts` 的兩列 `superseded` 都宣稱「知識另存了」，
 * 而那份文件就是那個宣稱的**出處**。⛔ 引用不到出處的宣稱是我編的（第一守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 它**能被反駁**的條件（只有一個），以及反駁的那一天會發生什麼
 * ─────────────────────────────────────────────────────────────────────────────
 * 有人讓載入期的算繪也涵蓋 `descriptionRoles` ⇒ 餵就變安全了 ⇒ ⭐ **下面第二條
 * 斷言當場紅**，並指名 `fieldAdoption.test.ts` 的那兩列要重新評估。
 * ⛔ 這不是「要記得回來看」，是一條會紅的測試。
 *
 * ⚠️ 反方向（有人讓客戶端**不再優先**讀 `descriptionRoles`）只會讓這個欄位變成
 * 純死重 —— 仍然是 `superseded`，所以那一半不需要閘。
 *
 * ⚠️ **誠實的邊界**：這條閘住在 `packages/shared`，驗得到的是「算繪只涵蓋
 * `description`」這一半；`docDescription` 的偏好那一半住在 `apps/client`，
 * 這裡引用不到（上一段說明了為什麼那一半不需要閘）。
 *
 * ⚠️ **兩個方向都要驗**：只斷言「`descriptionRoles` 沒被算繪」的尺是瞎的 ——
 * 一個什麼都不算繪的 `withProse`（或一份根本沒有佔位符的夾具）量起來一模一樣。
 * 所以第一條斷言是**校準**：先證明算繪真的跑了。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import type { ContentStore } from "./store";
import { registerAll } from "./registries";
import { Abilities, Champions } from "../sim/content/registry";
import type { AbilityId, ChampionId } from "../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** 把每一個佔位符包進角色標記 —— 逐字是「餵」會產出的形狀。 */
const roleify = (s: string): string => s.replace(/(\{\{[a-z]+\}\})/g, "[c=duration]$1[/c]");

const hasPlaceholder = (s: unknown): boolean => typeof s === "string" && s.includes("{{");

type Doc = Record<string, unknown>;

let store: ContentStore;
/** 被動手腳的那兩份的 id/slot，訊息裡要指名。 */
let abilityId: AbilityId;
let championId: ChampionId;
let slot: string;

beforeAll(async () => {
  store = (await new ContentLoader(shippedContentSource(CONTENT_DIR)).load()).store;

  // ⭐ 拿**真的出貨文件**動手腳，⛔ 不自己造夾具（失敗形態⑤：被測的不是出貨的那個）。
  const ability = store.all<Doc>("abilities").find((d) => hasPlaceholder(d["description"]))!;
  abilityId = ability["id"] as AbilityId;
  store.add("abilities", abilityId, {
    ...ability,
    descriptionRoles: roleify(ability["description"] as string),
  });

  // 鏡像那一半：champion-embedded 走的是 `expandEmbedded`，同一個 `withProse` 接縫。
  const champion = store
    .all<Doc>("champions")
    .find((c) =>
      Object.values((c["abilities"] ?? {}) as Record<string, Doc>).some((a) =>
        hasPlaceholder(a?.["description"]),
      ),
    )!;
  championId = champion["id"] as ChampionId;
  const slots = champion["abilities"] as Record<string, Doc>;
  slot = Object.keys(slots).find((k) => hasPlaceholder(slots[k]?.["description"]))!;
  store.add("champions", championId, {
    ...champion,
    abilities: {
      ...slots,
      [slot]: { ...slots[slot], descriptionRoles: roleify(slots[slot]!["description"] as string) },
    },
  });

  registerAll(store);
}, 60_000);

describe("GH#757 descriptionRoles is superseded — feeding it would print raw placeholders", () => {
  it("CALIBRATION: the load-time renderer really does render `description`", () => {
    // 沒有這一條,下面那一條對「一個什麼都不算繪的載入路徑」也會過。
    const standalone = Abilities.get(abilityId) as unknown as Doc;
    const embedded = (Champions.get(championId) as unknown as Doc)["abilities"] as Record<
      string,
      Doc
    >;
    expect(
      [standalone["description"], embedded[slot]!["description"]].map(hasPlaceholder),
      `${abilityId} / ${championId}.${slot}: withProse 沒有把佔位符代進 description —— ` +
        `這台量尺量不到任何東西,下面那一條的結論作廢`,
    ).toEqual([false, false]);
  });

  it("the SECOND HOME is left unrendered — so adopting it ships `{{cd}}` onto the card", () => {
    const standalone = Abilities.get(abilityId) as unknown as Doc;
    const embedded = (Champions.get(championId) as unknown as Doc)["abilities"] as Record<
      string,
      Doc
    >;
    const stillRaw = [standalone["descriptionRoles"], embedded[slot]!["descriptionRoles"]].map(
      hasPlaceholder,
    );

    expect(
      stillRaw,
      [
        "",
        "⭐ 載入期的算繪現在**也涵蓋** `descriptionRoles` 了。",
        "",
        "GH#757 把 `field:abilities.descriptionRoles` 與",
        "`field:champions.abilities.*.descriptionRoles` 判成 `superseded`,而那個判決的",
        "**唯一前提**就是這一條:算繪只寫 `description` 一格 ⇒ 填第二個住處會讓卡面印出",
        "`{{cd}}`。前提沒了 ⇒ 「餵」重新變成一條可以走的路。",
        "",
        "⇒ 去 `fieldAdoption.test.ts` 重新評估那兩列(改判、或連同這條閘一起刪),",
        "⛔ 不要把這條斷言放寬。",
        "",
      ].join("\n"),
    ).toEqual([true, true]);
  });
});
