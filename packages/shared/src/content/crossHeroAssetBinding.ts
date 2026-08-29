/**
 * crossHeroAssetBinding — GH#627：**A 英雄的資產綁到 B 英雄身上** ⇒ 紅，
 * ⭐ 而**變身態借用本體的資產** ⇒ 綠。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 「兩個名詞的**關係**」題，⛔ 不是「這個資產屬於誰」
 * ─────────────────────────────────────────────────────────────────────────────
 *     綁定的一端  = 這個值出現在**誰的位置上**   （`bindingHero`）
 *     綁定的另一端 = 這個值**命名了誰**          （`assetHero`）
 *     判準        = 兩端在**同一個家族**裡嗎？   （`heroFamilies`）
 *
 * ⚠️ 一條粗暴的「id 前綴要一致」會把**每一個變身態判紅** —— 變身態本來就共用
 * 本體的資產（`voiceFormSharing.ts` 逐字：owner 2026-07-26「變身前/後共用就好」，
 * 一對 base⇄alternate **是同一個人**）。⇒ 那條閘第一天就會被關掉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ 上一版（`f671cc237`）守的**不是這張票要的那個面** —— 逐欄位量到的
 * ─────────────────────────────────────────────────────────────────────────────
 * 票的 AC 逐字要的是「跨對引用**模型/語音/音效** ⇒ 紅並指名」。把上一版的規則
 * 重跑一次、對**它真的檢查過的 1,259 個參照**做欄位直方圖：
 *
 *     775  圖示（`abilities.icon` 420 ＋ 各槽 icon ＋ `champions.icon`）
 *     ...  其餘全是 ability-id 交叉引用（`exAbility` / `passiveAbility` /
 *          `counterpartId` / `skins.championId` …）
 *       0  ⛔ **語音**
 *       0  ⛔ **音效／特效綁定**
 *
 * ⇒ 它是一條**圖示 ＋ ability-id** 守衛。兩個結構性的原因，兩個都在這裡修掉：
 *
 * **① 綁定端只認「文件 id」** ⇒ `content/config/` 的 **91 份文件 100% 被跳過**，
 *    而票點名的三份全在裡面（`champion-voices.json` · `ability-vfx-bindings.json`
 *    · `audio-map.json`）。⭐ 那些文件的綁定端**住在文件裡面**：
 *      · 一個**本身就是英雄 id 的 map key**（`victory-taunts.roundWin.<英雄>`、
 *        `champion-voices.champions.<英雄>`）
 *      · 一個**同層的 id 欄位**（`taunts[].id`、`ability-vfx-bindings.bindings[].abilityId`）
 *    ⚠️ ⭐ 而那正是「**複製貼上時忘了改 id**」（票的原話）唯一會發生的地方 ——
 *    重複形狀的條目：複製一筆、改了 `id`、忘了改 `out`。
 *
 * **② 資產端取「basename 的第一個 dot 段」** ⇒ 漏掉 `<英雄>-<n>.mp3` 這一族。
 *    量到：`taunts.json` 的 **204 筆** `out` 長成 `.../round/godie-e001-1.mp3`，
 *    第一個 dot 段是 `godie-e001-1`（⛔ 不是英雄 id）⇒ **一筆都沒被檢查過**。
 *    ⭐ 改成「basename **開頭**是一個英雄 id，且後面是非英數或結束」。
 *    ⚠️ 「開頭」是承重的：`champ.sela` / `imported.heropikachu` / `fx.*` 靠它留在
 *    共用池（`sela` 在 `champ.` **後面**）。實測 roster **零組**英雄 id 互為邊界前綴。
 *
 * ⭐ 修完之後量到的覆蓋（同一棵樹）：**1,259 → 1,827** 個參照，其中
 *     **語音 479**（`taunts[].out` 204 ＋ `champ-names.ja-JP[].out` 71 ＋
 *                   `victory-taunts.roundWin.<英雄>.lines[].file` 204）
 *     **音效/特效綁定 57**（`ability-vfx-bindings.bindings[].abilityId`）
 * ⛔ 兩者在上一版都是 **0**。而**跨家族違規今天是 0 筆** ⇒ ⛔ 不會一上線就紅一片
 * （票的 Known risks 逐字要求先全量跑過再開紅）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 家族**從出貨的變身態關係推導**，⛔ 不是手寫一張表
 * ─────────────────────────────────────────────────────────────────────────────
 * 唯一的輸入是 `champion@1.transform.counterpartId`（出貨內容自己記的連結）。
 * ⇒ #623 退場一對，家族自動變少、守衛自動變嚴，⛔ 不必改測試（票的 AC）。
 *
 * ⚠️ **這個事實有第二個住處**：`championForms.ts` 的 `CHAMPION_FORM_PAIRS`
 * （手寫 26 對）。⭐ 兩份**已經有一條既有的閘在對帳** ——
 * `championForms.test.ts` 的 `transform-forms-docs` 逐對斷言
 * `base.transform.counterpartId === pair.alternateId` 且 alternate 指回來。
 * ⇒ 從內容推導**不會**造出一份沒人看守的第二份；⛔ 反過來抄那張手寫表才會
 * （票的 Implementation constraints 逐字禁止手寫表：「SIM_CAPABILITIES 前科」）。
 *
 * ⚠️ ⭐ 而**先驗那把鑰匙**（第〇·六守則 / GH#635：key 漂掉之後照 key 同步會毀資料）：
 * `heroFamilies()` 同時回傳 `keyIssues` —— 指向不存在的英雄、或對方不指回來的單向連結。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這一支**不**管什麼（誠實的邊界，⛔ 不是待辦）
 * ─────────────────────────────────────────────────────────────────────────────
 * · `champions[].modelKey` 的跨家族共用**刻意不紅**。量到的理由：`champ.sela`(9 位)
 *   / `champ.thorne`(4) / `champ.skin.barbarian`(3) 是**替身網格池**，而那 16 位的
 *   `_standin-overrides.json.mapModel` **彼此都不同**（AncientProtector /
 *   StormPandarenBrewmaster / EredarWarlock …）⇒ 共用就是設計本身。
 *   ⚠️ 而 `imported.heropikachu`（皮卡丘 ＋ 拳四郎，跨家族）是 **owner 裁決過刻意的**
 *   （#600 關票：「⛔ 拳四郎那一格是刻意的」）。⇒ 讓 modelKey 跨家族紅 = 一上線 4 筆誤報。
 *   ⭐ 模型這一面由「**資產名字裡有英雄**」那條涵蓋（`skins.championId` 5 筆、
 *   `projectiles`、`vfx-scripts` 10 筆）。
 * · 「通用音效池裡混了角色專屬語音」是**另一個方向**，已經有主人：
 *   `tools/sfx-bind/crossCharacterSfx.test.ts`（GH#568）。⛔ 不在這裡重做。
 */

/** 一筆「這個綁定的兩端不同家族」的違規。 */
export interface CrossHeroMisbinding {
  readonly collection: string;
  readonly docId: string;
  /** 文件裡的欄位路徑，例：`.bindings[].vfxKeys[]`。 */
  readonly fieldPath: string;
  readonly value: string;
  /** 這個值**命名**的英雄（資產端）。 */
  readonly assetHero: string;
  /** 這個值**出現在誰的位置上**（綁定端）。 */
  readonly bindingHero: string;
}

/** 變身態 join key 自己的問題 —— ⛔ key 驗不過就不要相信家族。 */
export interface HeroFamilyKeyIssue {
  readonly championId: string;
  readonly counterpartId: string;
  readonly reason: "counterpart-not-on-roster" | "counterpart-does-not-point-back";
}

export interface HeroFamilies {
  /** `championId → familyKey`。同一個家族的成員拿到同一把鍵。 */
  readonly familyOf: ReadonlyMap<string, string>;
  readonly keyIssues: readonly HeroFamilyKeyIssue[];
}

export interface ScannableDoc {
  readonly collection: string;
  readonly docId: string;
  readonly doc: unknown;
}

/** 出貨英雄文件裡這一支需要的那一格（⛔ 只讀，⛔ 不是完整型別）。 */
export interface ChampionTransformView {
  readonly id: string;
  readonly transform?: { readonly counterpartId?: string } | undefined;
}

/** 一個綁定值必須長得像識別碼／資產路徑 —— ⛔ 散文不算綁定。 */
const IDENTIFIER = /^[A-Za-z0-9._/-]+$/;

/**
 * 同層可以**指定這個子樹屬於誰**的欄位。⭐ 這就是修 ① 的那一半：
 * `taunts[].id` / `ability-vfx-bindings.bindings[].abilityId` 讓「重複形狀的條目」
 * 各自有自己的綁定端，⛔ 而不是整份文件共用一個（或像上一版那樣整份跳過）。
 */
const OWNER_FIELDS = ["championId", "abilityId", "id"] as const;

/**
 * ⛔⛔ `transform.counterpartId` **是家族關係的宣告本身**（`heroFamilies()` 唯一的
 * 輸入），⛔ 不是一筆「綁定」。拿它去問「兩端同不同家族」是**把輸出餵回輸入**。
 *
 * ⚠️ ⭐ 這一格在退場機制接上之前是**靠運氣綠的**（失敗形態⑩「守衛是靠某個前提才綠的」）：
 * 一對互指的變身態必然同家族 ⇒ 它永遠通過。而 #623 一退場，家族就不再合併 ⇒
 * **40 筆宣告會全部變成「違規」**（實測 12 筆，退場那 6 位的兩個方向）——
 * ⛔ 那不是誤配，那是這條規則在檢查自己的前提。
 *
 * ⚠️ 量到它只住一個地方：`.transform.counterpartId` × 40，schema 是
 * `zRef<ChampionId>("champions")`（`schema/champion.ts:66`）。
 */
const DECLARATION_FIELDS: ReadonlySet<string> = new Set(["counterpartId"]);

/**
 * 從**出貨的**變身態關係推導英雄家族（union-find），並順手驗那把 join key。
 * ⛔ 不讀任何手寫的配對表：唯一的輸入是 `champion@1.transform.counterpartId`。
 *
 * ⭐ `retired` ＝ `content/config/roster.json` 的 `retiredChampions`（#623 的退場機制），
 * 也是**出貨內容自己宣告**的。⚠️ ⭐ 這一格是票的 AC 第三句「#623 退場後變身對變少，
 * 守衛自動變嚴」**唯一**成立的地方 —— 量到的：#623 退場**不搬檔、也不拿掉
 * `counterpartId`**（`roster.json` 的 note 逐字說那五格「必須留在 content/champions/」，
 * 因為 `championForms.test.ts` 逐對釘死它）。⇒ ⛔ 只讀 `counterpartId` 的話，退場
 * **一對都不會少**，那句 AC 就是假的。實測：計入 retired ⇒ 51 個家族；排除 ⇒ **57 個**。
 *
 * ⚠️ 退場的連結**仍然要驗 key**（互指、在不在名冊上）—— 退場的是「可不可以借用」，
 * ⛔ 不是「這條連結可以壞掉」。
 */
export function heroFamilies(
  champions: readonly ChampionTransformView[],
  retired: ReadonlySet<string> = new Set(),
): HeroFamilies {
  const parent = new Map<string, string>();
  for (const c of champions) parent.set(c.id, c.id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const byId = new Map(champions.map((c) => [c.id, c]));
  const keyIssues: HeroFamilyKeyIssue[] = [];
  for (const c of champions) {
    const counterpartId = c.transform?.counterpartId;
    if (counterpartId === undefined) continue;
    if (!parent.has(counterpartId)) {
      keyIssues.push({ championId: c.id, counterpartId, reason: "counterpart-not-on-roster" });
      continue;
    }
    if (byId.get(counterpartId)?.transform?.counterpartId !== c.id) {
      keyIssues.push({
        championId: c.id,
        counterpartId,
        reason: "counterpart-does-not-point-back",
      });
    }
    // ⭐ 退場的變身態**不再是合法的借用對象** ⇒ ⛔ 不合併家族（＝守衛自動變嚴）。
    if (retired.has(c.id) || retired.has(counterpartId)) continue;
    const a = find(c.id);
    const b = find(counterpartId);
    if (a !== b) parent.set(a, b);
  }

  const familyOf = new Map<string, string>();
  for (const c of champions) familyOf.set(c.id, find(c.id));
  return { familyOf, keyIssues };
}

/** `id` 出現在 `s` 的 `at` 這個位置時，兩側都不是英數（＝一個真的詞）。 */
function atWordBoundary(s: string, id: string, at: number): boolean {
  const before = at === 0 ? "" : (s[at - 1] ?? "");
  const after = s[at + id.length] ?? "";
  return !/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after);
}

/**
 * 資產端：這個值**命名**了哪位英雄？⛔ 沒有就回 `undefined`（＝共用池，不在守備範圍）。
 *
 * ⭐ basename 的**開頭**正好是一個英雄 id，且後面是非英數或字串結束：
 *
 *     godie-hjai.q.webp                 → godie-hjai   ⇒ 專屬
 *     .../round/godie-e001-1.mp3        → godie-e001   ⇒ 專屬（⛔ 上一版漏掉這 204 筆）
 *     champ.sela / imported.heropikachu → undefined    ⇒ 共用池 ✅
 *
 * ⚠️ 取**最長**的候選：⛔ 避免短 id 搶走長 id（實測 roster 今天零組互為邊界前綴，
 * ⭐ 但那是**今天的內容**，⛔ 不是一條不變量 —— 所以規則本身要撐得住）。
 */
export function assetHeroOwner(value: string, roster: ReadonlySet<string>): string | undefined {
  if (!IDENTIFIER.test(value)) return undefined;
  const basename = value.slice(value.lastIndexOf("/") + 1);
  let best: string | undefined;
  for (const id of roster) {
    if (!basename.startsWith(id)) continue;
    if (!atWordBoundary(basename, id, 0)) continue;
    if (best === undefined || id.length > best.length) best = id;
  }
  return best;
}

/**
 * 綁定端：這個 id 字串屬於哪位英雄？⭐ 刻意比資產端**寬鬆** —— 任何位置的詞邊界
 * 都算，因為 `skin.<英雄>.<名字>` / `taunt-round-<英雄>-1` 把英雄放在中間。
 */
export function bindingHeroOwner(docId: string, roster: ReadonlySet<string>): string | undefined {
  let best: string | undefined;
  for (const id of roster) {
    const at = docId.indexOf(id);
    if (at < 0 || !atWordBoundary(docId, id, at)) continue;
    if (best === undefined || id.length > best.length) best = id;
  }
  return best;
}

/**
 * 掃出每一筆「這個綁定的兩端不是同一個英雄家族」。
 *
 * ⭐ 綁定端是**沿路收窄**的：文件 id → 本身是英雄 id 的 map key → 同層的 owner 欄位。
 * ⛔ 收集**全部**再回傳（一次 `expect` 只報第一筆是這個 repo 踩過的形狀）。
 */
export function findCrossHeroMisbindings(
  docs: readonly ScannableDoc[],
  roster: ReadonlySet<string>,
  familyOf: ReadonlyMap<string, string>,
): CrossHeroMisbinding[] {
  const out: CrossHeroMisbinding[] = [];

  const walk = (
    node: unknown,
    fieldPath: string,
    collection: string,
    docId: string,
    bindingHero: string | undefined,
    /** 綁定端來自**文件 id 或英雄 map key** ⇒ 同層的 id 欄位只能同意它，⛔ 不能改寫它。 */
    declared: boolean,
    ownerField: string | undefined,
  ): void => {
    const push = (p: string, value: string, assetHero: string, bindingHero2: string): void => {
      if (familyOf.get(assetHero) === familyOf.get(bindingHero2)) return;
      out.push({ collection, docId, fieldPath: p, value, assetHero, bindingHero: bindingHero2 });
    };

    if (Array.isArray(node)) {
      for (const v of node)
        walk(v, `${fieldPath}[]`, collection, docId, bindingHero, declared, undefined);
      return;
    }
    if (node !== null && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      // ⭐ 同層的 owner 欄位（修 ①：重複形狀的條目各有各的主人）。
      let owner = bindingHero;
      let from: string | undefined;
      for (const f of OWNER_FIELDS) {
        const v = obj[f];
        if (typeof v !== "string") continue;
        const h = bindingHeroOwner(v, roster);
        if (h === undefined) continue;
        from = f;
        // ⭐ 已經有更強的宣告時，同層 id **與它打架就是違規本身** ——
        // 那正是「複製一筆、改了 map key、忘了改裡面的 id」。⛔ 不可以讓它改寫上層。
        if (declared && owner !== undefined) push(`${fieldPath}.${f}`, v, h, owner);
        else owner = h;
        break;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (DECLARATION_FIELDS.has(k)) continue;
        // ⭐ 本身就是英雄 id 的 map key ＝ 最強的綁定端宣告（`roundWin.<英雄>`）。
        const isHeroKey = roster.has(k);
        const child = isHeroKey ? k : owner;
        const childDeclared = isHeroKey || (declared && child === bindingHero);
        walk(v, `${fieldPath}.${k}`, collection, docId, child, childDeclared, k === from ? k : undefined);
      }
      return;
    }
    if (typeof node !== "string") return;
    // ⛔ 剛剛用來**宣告擁有權**的那一格不是「一個綁定」（它是綁定端本身）。
    if (ownerField !== undefined || bindingHero === undefined) return;
    const assetHero = assetHeroOwner(node, roster);
    if (assetHero === undefined) return;
    push(fieldPath, node, assetHero, bindingHero);
  };

  for (const { collection, docId, doc } of docs) {
    const root = bindingHeroOwner(docId, roster);
    walk(doc, "", collection, docId, root, root !== undefined, undefined);
  }
  return out;
}
