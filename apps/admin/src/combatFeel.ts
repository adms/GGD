/**
 * 戰鬥手感 (`config.combat-feel@1`) —— 後台頁的純邏輯。
 *
 * ── 這一份在它之前是「零後台入口」 ─────────────────────────────────────────
 * `content/config/combat-feel.json` 裝著四張子表，全部都是 owner 口中的
 * **決策點**：擊退法則、「打就站定」、面向鎖、「卡住就自動接敵」。開發時每一格
 * 都做成了可調，但**沒有任何一格有後台入口** —— 改一個數字等於改 content、
 * rebuild、重啟容器（client 與 server 是 build 時烘進映像的，只有 `content/`
 * 是 live bind-mount，但線上那份是唯讀掛載）。`autoEngage.enabled` 正是
 * 「玩家撞牆時要不要讓系統接手」這個 owner 還沒裁決的決策：開關做好了，他改不到。
 *
 * ── 欄位清單是**推導**的，不是抄的 ────────────────────────────────────────
 * `COMBAT_FEEL_FIELDS = deriveFields(zConfigCombatFeelDoc)`。這份 schema 此刻
 * 正被 GH#216 那條 lane 改（`respectLiveSteering` / `ccPausesStall` 是今晚才長
 * 出來的），抄一份清單就是保證漂走。lane 再加一格 → 這裡自動多一格 →
 * `COMBAT_FEEL_LABELS` 少一條 → `combatFeel.test.ts` 紅。
 *
 * ── 讀值一律走 SIM 自己的讀取器 ───────────────────────────────────────────
 * 畫面顯示的是 `combatFeelFromDoc(doc)` 的結果，不是文件裡的原始數字。這一條是
 * 「後台自我一致地說謊」的解藥：`normalizeAutoEngageRules` 會**靜默夾限**，所以
 * 一份存著 `seekRadius: 4800` 的文件，sim 讀到的是 200。照著原始 JSON 畫的頁面
 * 會理直氣壯地顯示 4800，操作者重整之後看到自己填的數字，而遊戲裡從來不是那樣。
 *
 * ⚠️ 存檔**不是下一場生效**。`MatchController` 的 `combatFeel` 預設參數讀的是
 * `Configs.tryGet(COMBAT_FEEL_DOC_ID)`，而 `Configs` 是 game-server **開機時**
 * 由 `loadContent()` 拉 overlay 灌進去的；`MatchRoom` 沒有覆寫這個參數，也沒有
 * 任何路徑會在開賽時重抓 overlay（#278 只替 `baseBonus` 做了 TTL 快取）。
 * 所以要**重啟 shard**。這句話必須出現在畫面上。
 */
import { zConfigCombatFeelDoc } from "@ggd/shared/content/schema/config";
import {
  COMBAT_FEEL_DOC_ID,
  COMBAT_FEEL_SCHEMA,
  DEFAULT_COMBAT_FEEL,
  combatFeelFromDoc,
  type CombatFeelRules,
} from "@ggd/shared/sim/combatFeel";
import {
  boundsFor,
  deriveFields,
  getAtPath,
  setAtPath,
  validateNumeric,
  type DerivedField,
  type FieldBounds,
} from "./configFields";

export { COMBAT_FEEL_DOC_ID, COMBAT_FEEL_SCHEMA, combatFeelFromDoc };
export type { CombatFeelRules };

/** 覆蓋層的 collection（和 屬性上限 / 基礎加成 同一條寫入路徑）。 */
export const COMBAT_FEEL_COLLECTION = "config";

/** 從 Zod 推導出來的欄位清單 —— 這一頁唯一的欄位真相來源。 */
export const COMBAT_FEEL_DERIVED = deriveFields(zConfigCombatFeelDoc);
export const COMBAT_FEEL_FIELDS: readonly DerivedField[] = COMBAT_FEEL_DERIVED.fields;

/**
 * schema 沒宣告上界時，後台自己補的上界（#277）。
 *
 * 目前是**空的**，而且那是一件好事：`config.combat-feel@1` 的每一個數字欄位在
 * Zod 就已經兩邊都有界（`minPct` 0..1、`stallTicks` 1..600、`seekRadius` 0..200
 * …）。`fieldBounds` 對任何缺上界的欄位會直接 throw，所以隔壁 lane 哪天加了一格
 * 只有下界的數字，這裡會炸 —— 不是靜靜地放行。
 */
export const COMBAT_FEEL_CONSOLE_MAX: Readonly<Record<string, number>> = Object.freeze({});

/** 一格的生效上下界。 */
export function fieldBounds(field: DerivedField): FieldBounds | null {
  return boundsFor(field, COMBAT_FEEL_CONSOLE_MAX);
}

// -------------------------------------------------------------- 標籤 --------

export interface FeelGroup {
  /** 文件裡的區塊名 */
  key: string;
  title: string;
  /** 這張子表整體在管什麼（不是複述區塊名） */
  intro: string;
}

/**
 * 四張子表的顯示順序。`groupsCoverAllFields` 這條測試要求**每一個推導出來的
 * 欄位**都落在其中一個群組裡 —— 一個沒被分組的欄位會從畫面上消失，而畫面上
 * 少一格是這整頁最難用眼睛發現的失敗。
 */
export const COMBAT_FEEL_GROUPS: readonly FeelGroup[] = [
  {
    key: "knockback",
    title: "擊退",
    intro:
      "被打的人往後飛多遠。距離由「這一擊打掉對方多少比例的最大生命」決定，" +
      "再**減掉攻守雙方當下的距離** —— 所以擊退是近戰的工具，遠程隔著射程推不動人。",
  },
  {
    key: "standstill",
    title: "打就站定",
    intro: "要出手就得站定：走動中不得起手，前搖中走動作廢。關掉就回到「邊走邊打」的風箏世界。",
  },
  {
    key: "facing",
    title: "面向鎖",
    intro:
      "出手前後角色的臉朝哪。窗口太短會看到角色揮到一半被走位帶走，太長會轉不動身。" +
      "（瞄準沿用窗口 `aimHoldTicks` 刻意**不在**這裡：客戶端預測沒有 config 通道，" +
      "做成可調會讓預測與伺服器用不同的窗口。）",
  },
  {
    key: "autoEngage",
    title: "卡住就自動接敵",
    intro:
      "玩家的走位指令到不了目的地（撞牆、卡柱子、點到場外）時，系統要不要接手替他轉向去打架。" +
      "⚠️ **走得動的走位一個 tick 都不受影響** —— 這裡沒有任何一格會去搶一條正在前進的走位。" +
      "（2026-07-31 起「站著不動的人也吃這個索敵半徑」是一個例外的入口：它管的是**手上完全沒有指令**的人，" +
      "出貨關著，開了才會讓站著的人自己走過去打。）",
  },
];

/** 布林格 = 一個決策點。畫面要說得出出貨值是哪一邊、以及為什麼。 */
export interface DecisionMeta {
  /** 出貨預設（從 `DEFAULT_COMBAT_FEEL` 讀出來，不是打字打進去的） */
  onLabel: string;
  offLabel: string;
  /** owner 為什麼選那一邊 / 選錯那一邊會發生什麼 */
  why: string;
}

export interface FeelLabel {
  zh: string;
  /** 它**影響什麼**，不是複述欄位名 */
  note: string;
  decision?: DecisionMeta;
}

/**
 * 每一格的中文名 + 「它影響什麼」。
 *
 * ⚠️ 這張表和 `COMBAT_FEEL_FIELDS` 必須**雙向**吻合：少一條 = 畫面上有一格沒有
 * 說明（操作者只看得到一個英文 path），多一條 = 有人刪了 schema 的欄位而這裡還
 * 留著一段描述那個欄位的謊話。兩個方向都由測試守。
 */
export const COMBAT_FEEL_LABELS: Readonly<Record<string, FeelLabel>> = Object.freeze({
  "knockback.minPct": {
    zh: "擊退門檻（佔最大生命）",
    note:
      "這一擊要打掉受傷者多少比例的**最大生命**才推得動他。調小 = 連小傷害都會把人推開；" +
      "調大 = 只有重擊推得動。0.05 表示 6,000 血的殭屍王要單擊 300 傷害才會被推，也就是王基本上站得住。",
  },
  "knockback.maxBodies": {
    zh: "滿血一擊推幾個身位",
    note:
      "一擊直接打掉 100% 生命時推多遠（身位），較小的傷害按比例縮。" +
      "⚠️ 最後還會**減掉攻守雙方當下的距離**，所以貼身的近戰推得動、隔 8.2 射程的遠程推不動 —— 調這一格不會把風箏還給遠程。",
  },
  "knockback.bodyUnit": {
    zh: "一個身位＝幾個距離單位",
    note:
      "把上面的「身位」換算成 GGD 距離單位（角色碰撞半徑 0.6、競技場半徑 24）。" +
      "調大 = 每一格身位都變遠，等於整體擊退變強。",
  },
  "knockback.authoredWins": {
    zh: "技能授權的位移贏過傷害擊退",
    note:
      "技能自己寫的擊退／擊飛／衝刺還沒走完時，同一 tick 落地的傷害要不要把那具身體搶走。" +
      "⚠️ 關掉的那一側是這條缺陷被修之前的行為：模擬器先跑技能效果、最後才結算傷害，" +
      "所以「又打又推」的技能會被**自己的傷害**把自己的擊退蓋掉 —— 實測授權 12 個距離單位、實際只推了 1.5。" +
      "而出貨內容裡描述已經承諾要擊退的 11 支技能全部都造成傷害，等於整根原語失效。",
    decision: {
      onLabel: "開 · 技能寫的距離與方向一路走完",
      offLabel: "關 · 傷害無條件蓋掉（缺陷修好前的行為）",
      why:
        "技能作者寫下的距離與方向是設計，傷害擊退是全場共用的環境規則；讓環境規則洗掉設計，" +
        "等於那支技能的擊退從來沒有存在過。而且 GH#193 的法則沒有被繞過 —— 技能可以用 impactPower " +
        "把自己的擊退送進同一條「傷害佔生命百分比」算式，吃的是上面那三格的即時值。",
    },
  },
  "knockback.longerDamageWins": {
    zh: "傷害推得更遠時可以接管",
    note:
      "只在上一格開著時才有作用：這一擊算出來的擊退比技能剩下的那段還長時，讓傷害接管。" +
      "⚠️ 開著會讓**拉近**系（鉤索、吸附）的技能在傷害夠大時把目標往**反方向**推出去 —— " +
      "那不是被調弱，是那支技能當場失效。想要「重擊就是要打飛」的手感再開。",
    decision: {
      onLabel: "開 · 取距離較大的那一個",
      offLabel: "關 · 技能授權的距離與方向說了算",
      why:
        "出貨關著，因為擊退的**方向**和距離一樣是設計的一部分，而傷害擊退永遠是「推開」。" +
        "以距離取大值會在傷害夠重時把拉近翻成推開，這是一個沒有人要求過、而且完全靜默的機制。",
    },
  },
  "standstill.enabled": {
    zh: "打就站定",
    note:
      "開著時：走動中不得起手，前搖中走動作廢，所以要輸出就得停下來。" +
      "⚠️ 關掉會讓所有人回到「邊走邊打」，風箏流整個回來 —— 近戰的普攻命中率就是被這條規則救回來的。",
    decision: {
      onLabel: "開 · 要打就得站定",
      offLabel: "關 · 邊走邊打（規則出現前的行為）",
      why: "owner 在 GH#193 要求的行為。關掉那一側只是給他反悔用的，不是平起平坐的選項。",
    },
  },
  "standstill.walkEps": {
    zh: "「算在動」的速度門檻",
    note:
      "每秒位移低於這個值就算站著。它同時是「正在朝目標靠近」的門檻 —— 靠近速度高過它就算在接近，" +
      "仍然可以出手（近戰接近戰、被擊退後歸位都靠這個例外）。調太大 = 誰都算站著，這條規則等於關掉。",
  },
  "standstill.applyToMobs": {
    zh: "小怪／殭屍王也套用",
    note:
      "小怪與殭屍王要不要同樣受「打就站定」約束。⚠️ 關掉會出現「殭屍能邊走邊打、玩家不能」，" +
      "而玩家看到的只會是「殭屍怎麼一直打得到我」。",
    decision: {
      onLabel: "開 · 小怪與王一起受約束",
      offLabel: "關 · 只約束英雄",
      why: "owner 明確要求殭屍王也套用。英雄與小怪走的是完全不同的攻擊路徑，兩邊各寫一次必然分岔，所以共用同一支判斷。",
    },
  },
  "facing.followThroughTicks": {
    zh: "出手後的收招餘韻（tick）",
    note:
      "揮完之後角色的臉維持不被走位帶走幾個 tick（30 tick = 1 秒）。" +
      "出貨 3（100ms）是為了蓋過客戶端那段 70ms 的轉頭平滑；調到 0 會看到角色揮到一半就轉走。",
  },
  "facing.instantCastTicks": {
    zh: "瞬發技的最低面向鎖（tick）",
    note:
      "瞬發技沒有前搖可以借來鎖面向，所以直接給一個最低鎖定長度。" +
      "出貨 6（200ms），和角色自己轉完 90° 同一個量級；太長會轉不動身，太短則瞬發技看起來沒有朝目標。",
  },
  "autoEngage.enabled": {
    zh: "卡住就自動接敵",
    note:
      "玩家走位卡住超過下面的「卡住判定」tick 數時，系統要不要接手替他轉向去打架。" +
      "⚠️ 關掉之後 #274 的災難會完全回來：右鍵點進柱子的角色實測速度 0.00 連續 2,240 個 tick（75 秒），" +
      "最近的敵人在 16.25 單位外，整場 0 次索敵、0 次出手。",
    decision: {
      onLabel: "開 · 卡住時系統接手",
      offLabel: "關 · 移動指令期間絕不接手",
      why:
        "owner 還沒裁決這一格 —— 它就是「玩家撞牆時要不要讓系統接管方向盤」那個問題本身。" +
        "出貨開著，因為關著的那一側量到的是「整回合打不到任何東西」；但接管本身也會拿走走位權，所以這一格留給他自己按。",
    },
  },
  "autoEngage.stallTicks": {
    zh: "卡住判定（tick）",
    note:
      "連續幾個 tick 走不動才算卡住（30 tick = 1 秒）。太小會把單發硬直誤判成卡住；" +
      "⚠️ 但**不要**用調大這一格來代替下面的「硬控不算卡住」—— 調到 120 會讓真的卡在柱子上的玩家等四秒才被救。",
  },
  "autoEngage.stallSpeed": {
    zh: "「走不動」的速度門檻",
    note:
      "每秒位移低於這個值就算這一 tick 沒走出去。和上面「打就站定」的門檻是同一個量 —— " +
      "兩個數字各自漂移就是下一個 bug 的形狀，調一個時請一起看另一個。",
  },
  "autoEngage.seekRadius": {
    zh: "卡住後的索敵半徑",
    note:
      "走位卡住之後才放大的索敵半徑（距離單位）。⚠️ 這**不是**平常的自動攻擊範圍：**走得動的玩家一格都不受影響**，" +
      "調大它不會讓正在走路的人自動衝過去。競技場半徑 24，所以 48 蓋得住場內任兩點；查詢仍然只在自己那座競技場內。" +
      "（下面的「站著不動的人也吃這個索敵半徑」開著時，這個數字**同時**是站著不動那條路徑用的半徑。）",
  },
  "autoEngage.idleSeeks": {
    zh: "站著不動的人也吃這個索敵半徑",
    note:
      "上面那個放大的半徑目前**只給走位卡住的人**。一個手上什麼指令都沒有、完全站著不動的玩家吃的是近戰地板 6，" +
      "所以「卡在柱子上」比「站著不動」更容易索到敵人。實測（真的對局、出貨 Saber）：整場 2,410 個 tick 裡，" +
      "最近的敵方英雄**從來沒有靠近到 14.95 單位以內** —— 那個座位整場 0 次索敵、0 次揮擊。" +
      "⚠️ 這一格需要上面的總開關「卡住就自動接敵」也開著才有作用。",
    decision: {
      onLabel: "開 · 站著不動也會自己走過去打（等同全員預設 A 移動）",
      offLabel: "關 · 站著不動只打走到面前 6 單位內的東西（出貨、今天的行為）",
      why:
        "出貨關著，因為這是**手感的平衡決策，不是缺陷修正** —— 開著會讓「什麼都不按」的玩家自己跑去打架，" +
        "新手不按鍵也打得到人；但代價是他一放手，方向盤就不在他手上（追擊會改寫走位目的地），" +
        "而且角色可能自己走出火圈。owner 已經為了走位權推翻過一次接管行為（86.6% 那一次），所以這一側留給他自己按。",
    },
  },
  "autoEngage.respectLiveSteering": {
    zh: "新的移動指令當場拿回走位權",
    note:
      "開著時：玩家每送出一條新的移動指令，走位權當場還給他。搖桿／虛擬搖桿每一拍都送一條，" +
      "所以推著搖桿的人永遠不會被接管；滑鼠右鍵一次只送一條，點進柱子之後才會觸發接敵。" +
      "⚠️ 關掉 = 上鎖之後不放手，實測會搶走 **86.6% 的走位 tick**。",
    decision: {
      onLabel: "開 · 玩家一動就還給他",
      offLabel: "關 · 接手後不放手",
      why: "出貨開著。關著那一側是量到 86.6% 走位 tick 被搶走的那個行為，留著只是讓 owner 可以回頭。",
    },
  },
  "autoEngage.ccPausesStall": {
    zh: "硬控的 tick 不算卡住",
    note:
      "開著時：被定身／昏迷／擊倒／施法鎖／hitstop 的 tick 不算「走位卡住」，計數凍結在原地（不累積也不歸零）。" +
      "⚠️ 關掉的話，出貨內容裡 **47 支持續 ≥ 1 秒的硬控**（最長 4 秒 = 120 tick，是判定窗口的四倍）" +
      "每一支都會被誤判成卡住 —— 玩家被定住，走位權被追擊搶走，解控之後角色往反方向跑。",
    decision: {
      onLabel: "開 · 被控的 tick 不算證據",
      offLabel: "關 · 硬控照樣累積成卡住（2026-07-30 之前的行為）",
      why: "出貨開著。關著那一側只是給 owner 反悔用的，不是平起平坐的選項 —— 被控已經夠慘，解控後角色還往反方向跑更糟。",
    },
  },
});

/** 這一格的中文標籤；沒有登記時退回 path（測試會先紅，所以正常情況看不到）。 */
export function labelFor(path: string): FeelLabel {
  return COMBAT_FEEL_LABELS[path] ?? { zh: path, note: "（這一格還沒有說明 —— 請補進 COMBAT_FEEL_LABELS）" };
}

/** 每個群組的欄位，照 schema 的宣告順序。 */
export function fieldsOfGroup(groupKey: string): DerivedField[] {
  return COMBAT_FEEL_FIELDS.filter((f) => f.path.startsWith(`${groupKey}.`));
}

// -------------------------------------------------------------- 值 ----------

/** 畫面上的一格值一律是**字串**（布林用 "true"/"false"）—— 半打好的 "1." 要能存在。 */
export type FeelValues = Record<string, string>;

function show(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/**
 * 把一份**已經被 sim 讀過**的規則攤平成畫面上的字串。
 *
 * ⚠️ 一定要餵 `combatFeelFromDoc` 的輸出，不要餵原始 JSON。原始 JSON 會讓畫面
 * 顯示一個 sim 永遠不會使用的數字（見檔頭）。
 */
export function valuesFromRules(rules: CombatFeelRules): FeelValues {
  const out: FeelValues = {};
  for (const f of COMBAT_FEEL_FIELDS) out[f.path] = show(getAtPath(rules, f.path));
  return out;
}

/** 出貨預設攤平版 —— 「重設」的目標，也是還沒讀到文件時的第一畫面。 */
export function shippedValues(): FeelValues {
  return valuesFromRules(DEFAULT_COMBAT_FEEL);
}

/** 一格的錯誤訊息（null = 合法）。布林只接受 "true"/"false"。 */
export function validateFeelField(path: string, raw: string): string | null {
  const field = COMBAT_FEEL_FIELDS.find((f) => f.path === path);
  if (!field) return `未知的欄位 ${path}`;
  if (field.kind === "boolean") {
    return raw === "true" || raw === "false" ? null : "只能是開或關";
  }
  const bounds = fieldBounds(field);
  if (!bounds) return null;
  // 這一頁**不允許**任何一格留白：四張子表永遠整份寫出去（見 `feelDocFrom`）。
  return validateNumeric(raw, bounds, field.kind, false);
}

/** 每一格的錯誤，只收有錯的。 */
export function validateFeelValues(values: FeelValues): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of COMBAT_FEEL_FIELDS) {
    const err = validateFeelField(f.path, values[f.path] ?? "");
    if (err) errs[f.path] = err;
  }
  return errs;
}

/**
 * 要 PUT 的文件 —— **永遠是完整的四張子表**，不是只有被改過的那幾格。
 *
 * ⚠️ 這不是省事。`combatFeelFromDoc` 對缺席的區塊回退到**出貨預設**，所以一份
 * 只寫了 `autoEngage` 的文件會在 owner 哪天調整 `content/config/combat-feel.json`
 * 的擊退值時，安靜地把玩家拉回舊的擊退手感 —— 覆蓋層贏過內容檔，而畫面上完全
 * 看不出來。這是 `statCaps.ts`「存檔一定寫整張表」學到的同一課。
 */
export function feelDocFrom(values: FeelValues): Record<string, unknown> {
  const doc: Record<string, unknown> = { id: COMBAT_FEEL_DOC_ID, schema: COMBAT_FEEL_SCHEMA };
  for (const f of COMBAT_FEEL_FIELDS) {
    const raw = (values[f.path] ?? "").trim();
    if (f.kind === "boolean") {
      setAtPath(doc, f.path, raw === "true");
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) continue; // validate 已經擋在前面；這裡只是不寫 NaN
    setAtPath(doc, f.path, n);
  }
  return doc;
}

/**
 * 這一頁的摘要行 —— 只講**決策點**現在是開還是關，因為那才是 owner 會來看的東西。
 */
export function decisionSummary(values: FeelValues): string {
  const parts: string[] = [];
  for (const f of COMBAT_FEEL_FIELDS) {
    if (f.kind !== "boolean") continue;
    const label = labelFor(f.path);
    parts.push(`${label.zh}：${values[f.path] === "true" ? "開" : "關"}`);
  }
  return parts.join(" · ");
}
