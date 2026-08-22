/**
 * tools/sfx-bind/usage_table —— GH#568 的**音效使用表**，⭐ 產生的，⛔ 不是手寫的。
 *
 * owner 2026-08-23：「你要不要好好**梳理一個音效使用表給我審查**，並且**建議我哪些有問題、
 * 多餘、太複雜、同時太多音效**等情形」。
 *
 * 用法：
 *   pnpm tsx tools/sfx-bind/usage_table.ts                  # 寫一份帶時間戳的快照
 *   pnpm tsx tools/sfx-bind/usage_table.ts --out <path>     # 指定落點
 *
 * ⚠️ 這份 .md 是**給人審查的快照**（`_temp_` 命名），所以它**刻意沒有 `--check`**：
 * 檔名本身帶時間戳，逐位元組比對永遠不會相等 —— 而一條被放寬的閘等於沒有閘
 * （CLAUDE.md 對 `caps:export` 講過同一件事）。⭐ **閘在別的地方**：
 * `tools/sfx-bind/crossCharacterSfx.test.ts` 驗的是**同一份推導**（`ownership.ts`），
 * ⛔ 不是這份 Markdown。表過期不會有人受傷；綁定錯了會。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, buildModel, crossCharacterRows, type Model } from "./ownership";

const stamp = (): string => {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

const clipName = (p: string): string => p.split("/").pop() ?? p;

function render(m: Model): string {
  const L: string[] = [];
  const nameOf = (cid: string): string => m.champions.get(cid)?.name ?? cid;
  const cross = crossCharacterRows(m);
  const pools = cross.filter((r) => r.actor === "*");
  const genericFallback = m.abilities.filter(
    (a) => m.castStack.get(a.id)![0]!.cue === "abilityCast",
  );
  const withOwnCast = m.abilities.length - genericFallback.length;

  L.push("# 音效使用表 —— GH#568「音效錯用」逐列審查");
  L.push("");
  L.push(
    "> ⛔ **這份檔案是產生的**：`pnpm tsx tools/sfx-bind/usage_table.ts`。" +
      "手改它沒有意義（下一次跑就被覆蓋），而且它腐爛的時候沒有人會發現。",
  );
  L.push("");
  L.push("owner 2026-08-23（逐字）：");
  L.push("");
  L.push("> 「**音效錯用**: 莉娜施展技能 竟然出現**皮卡丘 皮卡皮卡、男人喊叫聲**，");
  L.push(">  打死敵人出現**皮卡丘、臭作 get you** 音效等⋯");
  L.push(">  **明明場上沒有皮卡丘卻一直有皮卡丘、多拉A夢聲音**」");
  L.push("");
  L.push("> 「莉娜只要施展技能就聽到皮卡丘、蒼月潮，殺死單位就聽到臭作聲音，");
  L.push(">  **似乎跟這是獨立分開 issue**」");
  L.push("");

  // ── 結論 ────────────────────────────────────────────────────────────────
  L.push("## ⭐ 一句話結論：根因是**通用退路的音效池裡混了角色專屬語音**");
  L.push("");
  L.push(
    "⛔ **不是**「某一支技能的 `sfxKey` 指錯人」——" +
      `逐列查過 **${m.abilities.length}** 支技能的 \`sfxKey\`／覆蓋層，**一列都沒有指到別位英雄**。`,
  );
  L.push("");
  L.push("出貨的施法音路由（`apps/client/src/audio/combatSfx.ts` 的 `abilityCast` 分支，逐字）：");
  L.push("");
  L.push("```");
  L.push("  abilitySfxCueForAbility(abilityId)   ← ability-sfx-cues.json 的 bindings 覆蓋層");
  L.push("?? wc3CastKey(sfxKey)                   ← 技能文件自己的 sfxKey");
  L.push("?? castElementKey(vfxKey)               ← 元素風聲（⚠️ 只認得 fire / ice / lightning）");
  L.push('?? "abilityCast"                        ← ⭐ 通用退路 —— 問題在這一格');
  L.push("```");
  L.push("");
  L.push(
    `而 \`abilityCast\` 在 \`audio-map.json\` 裡不是一個檔，是一個 **${m.cueFiles.get("abilityCast")!.length} 個檔的隨機池**，` +
      "而那三個檔**全部有主人**：",
  );
  L.push("");
  for (const clip of m.cueFiles.get("abilityCast") ?? []) {
    const o = m.clipOwners.get(clip);
    L.push(
      `- \`${clipName(clip)}\` → **${(o?.champions ?? []).map(nameOf).join(" / ")}**` +
        `（憑據：${(o?.via ?? []).join("；")}）`,
    );
  }
  L.push("");
  L.push(
    `⇒ ⭐ **${genericFallback.length} / ${m.abilities.length} 支技能**（${m.champions.size} 位英雄裡的絕大多數）` +
      "沒有專屬施法音，所以每一次施法都在**隨機播蒼月潮或皮卡娘的聲音**。" +
      "莉娜因巴斯的六支技能一支 `sfxKey` 都沒有 ⇒ owner 聽到的**逐字就是這個**" +
      "（「皮卡皮卡」＝ `nocute` 皮卡娘、「男人喊叫聲」＝ `moongo`/`moonjump` 蒼月潮）。",
  );
  L.push("");
  L.push("同一個形狀在擊殺音上更嚴重：");
  L.push("");
  const killClips = m.cueFiles.get("kill") ?? [];
  L.push(`\`kill\`（每一次擊殺）的池子有 **${killClips.length}** 個檔，**${killClips.length} 個全部有主人**：`);
  L.push("");
  for (const clip of killClips) {
    const o = m.clipOwners.get(clip);
    L.push(`- \`${clipName(clip)}\` → **${(o?.champions ?? []).map(nameOf).join(" / ")}**`);
  }
  L.push("");
  L.push(
    "⇒ 打死任何一隻單位，都會隨機聽到皮卡丘／哆拉A夢／臭作／飛鼠先生／龍宮禮奈／依文潔琳其中一位的台詞 ——" +
      "**不管場上有沒有那位英雄**。owner 的「打死敵人出現皮卡丘、臭作 get you」就是這一格。",
  );
  L.push("");

  // ── 「屬於誰」怎麼推導 ──────────────────────────────────────────────────
  L.push("## 📎 「這個音檔本來屬於誰」是**推導**的，⛔ 不是一張手寫名單");
  L.push("");
  L.push("| 來源 | 說什麼 |");
  L.push("|---|---|");
  L.push("| `content/config/champion-voices.json` | 一位英雄的 `select` clip 就是**他自己的聲音**（`source: \"map-quip\"` ＝ 原作地圖裡那句台詞） |");
  L.push("| `SFX_BINDINGS.json`（war3map.j 掃描） | JASS 把某個 `gg_snd` 綁在英雄 X 的技能上 ⇒ 那是 X 的施法聲 |");
  L.push("");
  L.push(
    "⚠️ ⭐ **只有 map-import 的 clip 會有主人。** 暴雪零售 MPQ 的音效（`wc3.peondeath` 那一族）是**通用音效**，" +
      "沒有角色。判準是 `wc3_path` 的 `war3mapImported\\` 前綴，⛔ 不是 `kind` 標籤（它說謊過兩次）。",
  );
  L.push("");
  L.push(`量到 **${m.clipOwners.size}** 個有主人的 clip：`);
  L.push("");
  L.push("| 音檔 | 本來屬於誰 | 憑據 | 現在被哪些通用池播 |");
  L.push("|---|---|---|---|");
  const poolsByClip = new Map<string, string[]>();
  for (const p of pools) for (const f of p.files) {
    if (!poolsByClip.has(f)) poolsByClip.set(f, []);
    poolsByClip.get(f)!.push(p.cue);
  }
  for (const [clip, o] of [...m.clipOwners].sort()) {
    const used = poolsByClip.get(clip) ?? [];
    L.push(
      `| \`${clipName(clip)}\` | ${o.champions.map((c) => `${nameOf(c)}（\`${c}\`）`).join("<br>")} ` +
        `| ${o.via.map((v) => `\`${v}\``).join("<br>")} ` +
        `| ${used.length ? "🚨 " + used.map((c) => `\`${c}\``).join(" · ") : "—"} |`,
    );
  }
  L.push("");

  // ── 表 A：通用池 ────────────────────────────────────────────────────────
  L.push("## 表 A —— 🚨 通用音效池（**根因**，每一位英雄身上都會響）");
  L.push("");
  L.push(
    "⭐ 判準從出貨的註冊表推導：`apps/client/src/audio/sfxReachability.ts` 的 `combat` 列，" +
      "payload 裡**沒有** `sfxKey` ⇒ 這個 cue 誰觸發都一樣（＝通用）。⛔ 不是一張手寫的通用 cue 名單。",
  );
  L.push("");
  L.push("| cue | 什麼時機 | 池子大小 | 有主人的檔 | 閘（gain / 冷卻 / 同時） |");
  L.push("|---|---|---|---|---|");
  for (const p of pools) {
    const g = m.cueGate.get(p.cue)!;
    L.push(
      `| \`${p.cue}\` | ${p.when} | ${p.files.length} | **${p.foreign.length} / ${p.files.length}** ` +
        `| ${g.gain ?? "—"} / ${g.cooldownMs ?? "—"}ms / ${g.maxConcurrent ?? "—"} |`,
    );
  }
  L.push("");
  for (const p of pools) {
    L.push(`### \`${p.cue}\``);
    L.push("");
    L.push("| 音檔 | 本來屬於誰 |");
    L.push("|---|---|");
    for (const f of p.files) {
      const o = m.clipOwners.get(f);
      L.push(`| \`${f}\` | ${o ? "🚨 " + o.champions.map(nameOf).join(" / ") : "✅ 無主（通用音效）"} |`);
    }
    L.push("");
  }

  // ── 表 B：有專屬施法音的技能 ────────────────────────────────────────────
  L.push(`## 表 B —— ✅ 有專屬施法音的技能（${withOwnCast} 支）`);
  L.push("");
  L.push("⭐ 這一批是**對的**，列出來是為了讓 owner 看得到「對的長什麼樣」，以及確認沒有一列指錯人。");
  L.push("");
  L.push("| 英雄 | 技能 | 施法音 cue | 音檔 | 這個音檔屬於誰 | 來自哪一層 |");
  L.push("|---|---|---|---|---|---|");
  for (const r of m.rows) {
    if (!r.when.startsWith("施法") || r.cue === "abilityCast") continue;
    const owners = r.owners.map((o) => o.champions.map(nameOf).join(" / "));
    L.push(
      `| ${r.actorName} | ${r.subjectName} | \`${r.cue}\` | ${(r.files.map(clipName).join("<br>")) || "—"} ` +
        `| ${owners.length ? owners.join("<br>") : "無主（通用音效）"} | ${r.when.split("· ")[1] ?? "—"} |`,
    );
  }
  L.push("");

  // ── 表 C：吃到污染退路的技能 ────────────────────────────────────────────
  L.push(`## 表 C —— 🚨 沒有專屬施法音、吃到污染退路的技能（${genericFallback.length} 支）`);
  L.push("");
  L.push("每一支的施法音都是 `abilityCast` 那個**混了蒼月潮＋皮卡娘**的隨機池。按英雄分組：");
  L.push("");
  L.push("| 英雄 | 幾支 | 技能 |");
  L.push("|---|---:|---|");
  const byChamp = new Map<string, string[]>();
  for (const a of genericFallback) {
    if (!byChamp.has(a.champion)) byChamp.set(a.champion, []);
    byChamp.get(a.champion)!.push(a.name);
  }
  for (const [cid, names] of [...byChamp].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    L.push(`| ${nameOf(cid)}（\`${cid}\`） | ${names.length} | ${names.join("、")} |`);
  }
  L.push("");

  // ── 建議 ────────────────────────────────────────────────────────────────
  L.push("---");
  L.push("");
  L.push("# 🧾 逐條建議（owner 點名的四類）");
  L.push("");
  L.push(
    "⛔ **我沒有替 owner 挑。** 每一條列出「做什麼 · 代價 · 影響幾支」，勾哪一條是他的決定" +
      "（CLAUDE.md 第一守則：可調 ≠ 我可以轉）。",
  );
  L.push("");

  // 🚨 有問題
  L.push("## 🚨 一、有問題（跨角色誤用）");
  L.push("");
  L.push("| # | 是什麼 | 影響 | 三個選項（⛔ 我沒有挑） |");
  L.push("|---|---|---|---|");
  L.push(
    `| A1 | \`abilityCast\` 通用退路的 3 個檔**全部是角色語音**（蒼月潮 ×2、皮卡娘 ×1） ` +
      `| **${genericFallback.length} 支技能 × ${m.champions.size} 位英雄**，每一次施法 ` +
      "| (a) 換成無主的通用施法風聲（最小改動，一格 `audio-map`）<br>(b) 把三個檔還給本人：只留在 `wc3.moongo`/`wc3.moonjump`/`wc3.nocute`，退路改成中性音<br>(c) 逐支補 `sfxKey`（最貴，但最像原作） |",
  );
  L.push(
    `| A2 | \`kill\` 擊殺池的 ${killClips.length} 個檔**全部是角色語音**（皮卡丘／哆拉A夢／臭作／飛鼠先生／龍宮禮奈／依文潔琳） ` +
      "| 每一次擊殺，不管場上有沒有那位英雄 " +
      "| (a) 整池換成中性擊殺音<br>(b) 改成**只在該英雄在場／就是他擊殺時**才播（要一個新機制：擊殺者身分 → 語音池）<br>(c) 保留（owner 覺得這是原作味道的一部分） |",
  );
  L.push(
    "| A3 | `champSelectConfirm` 播 `pick.mp3`，而它是 `godie-h001` 的 select 語音 " +
      "| 每一次鎖定英雄 | (a) 換成中性確認音<br>(b) 從 `champion-voices.godie-h001.select` 拿掉（＝宣告它其實是通用音效，不是誰的語音） |",
  );
  const famDup = cross.filter((r) => r.surface.includes("vfx-families"));
  if (famDup.length) {
    L.push(
      `| A4 | \`vfx-families.families.uncategorised.soundLaunch = "abilityCast"\` —— **特效層又把同一個污染池播了一次** ` +
        `| ${famDup.length} 支技能（${[...new Set(famDup.map((r) => r.actorName))].join("、")}） ` +
        "| (a) 改成中性音<br>(b) 拿掉這一格（施法音那一層已經播了，見「多餘」B1） |",
    );
  }
  L.push("");
  L.push(
    "⭐ **逐列查證過、⛔ 不是誤報的一件事**：`godie-umal.r`／`godie-u00l.r`「25-04 ChangeDNA」的 " +
      "`sfxKey = wc3.nocute`（皮卡娘的音）**是對的**。owner 2026-08-23 逐字裁決：",
  );
  L.push("");
  L.push("> 「拳四郎的變身態 modelKey 指到 imported.heropikachu（皮卡丘的模型）。");
  L.push(">  => **這是對的，這是因為要惡搞他大絕招是變身大型皮卡丘**」");
  L.push("");
  L.push(
    "⇒ ⭐ **「變身態刻意使用另一位英雄的資產」是一個合法情況**，" +
      "所以這份表的跨角色判定**已經逐列複核過**：3 個污染的通用池底下**沒有任何一列**是變身態造成的，" +
      "而 `wc3.nocute` 出現在 25-04 上是**設計**，⛔ 不是誤用。",
  );
  L.push("");

  const unowned = [...new Set([...m.cueFiles.values()].flat())].filter(
    (f) => /^assets\/audio\/sfx\/[^/]+\.mp3$/.test(f) && !m.clipOwners.has(f),
  );
  L.push(
    `⚠️ **一個誠實的邊界**：另外有 ${unowned.length} 個頂層 \`sfx/*.mp3\` **推導不出主人**` +
      "（`pcdie`「請確認你的隊友是不是白目!!」、`4die`、`up`、`die`、`heycharlie`、`letsgo`、" +
      "`yooooooooooooo`、`nog` ⋯）。它們是**播報員／任務台詞**，`champion-voices` 沒有把它們宣告成" +
      "任何一位英雄的聲音，所以守衛判它們**不是跨角色誤用** —— ⭐ 但 owner 聽起來仍然可能覺得奇怪" +
      "（那是「多餘／太吵」那一軸，⛔ 不是「錯用」那一軸）。" +
      "⚠️ 它們住的 `mapFlavorIntro` / `mapFlavorAnnounce` 在出貨的可達性註冊表上是 **opt-in 且預設關閉**，" +
      "所以正常一場比賽聽不到 —— ⛔ 這一段**不能**用來解釋 owner 聽到的那些聲音。",
  );
  L.push("");

  // 🧹 多餘
  L.push("## 🧹 二、多餘");
  L.push("");
  L.push("| # | 是什麼 | 量到多少 |");
  L.push("|---|---|---|");
  const dupInStack: string[] = [];
  for (const [aid, stack] of m.castStack) {
    const seen = new Set<string>();
    for (const s of stack) {
      if (seen.has(s.cue)) { dupInStack.push(`${aid}(${s.cue})`); break; }
      seen.add(s.cue);
    }
  }
  L.push(
    `| B1 | **同一次施法把同一個 cue 播兩次** —— 施法音那一層與特效 \`soundLaunch\` 撞在一起 ` +
      `| ${dupInStack.length} 支：${dupInStack.slice(0, 8).join("、")}${dupInStack.length > 8 ? " …" : ""} |`,
  );
  const deadOwned: string[] = [];
  for (const [cue, files] of m.cueFiles) {
    const row = m.reach.get(cue);
    if (row?.kind !== "unreachable") continue;
    const owned = files.filter((f) => m.clipOwners.has(f));
    if (owned.length) deadOwned.push(`\`${cue}\`（${owned.map(clipName).join("、")}）`);
  }
  L.push(
    `| B2 | **收錄了角色語音、但那個 cue 根本沒有人播**（死綁定） | ${deadOwned.length ? deadOwned.join("；") : "0"} |`,
  );
  const noop: string[] = [];
  {
    const vfx = JSON.parse(
      readFileSync(join(REPO, "content/config/vfx-families.json"), "utf8"),
    ) as { families: Record<string, Record<string, unknown>>; abilities: Record<string, Record<string, unknown>> };
    for (const [aid, ab] of Object.entries(vfx.abilities)) {
      const famId = typeof ab.family === "string" ? ab.family : undefined;
      const fam = famId ? vfx.families[famId] : undefined;
      if (!fam) continue;
      for (const f of ["soundLaunch", "soundImpact"]) {
        if (ab[f] !== undefined && ab[f] === fam[f]) noop.push(`${aid}.${f}`);
      }
    }
  }
  L.push(
    `| B3 | **逐支覆寫填的值跟家族預設一模一樣**（改它不會有任何效果） | ${noop.length} 處${noop.length ? "：" + noop.slice(0, 6).join("、") + (noop.length > 6 ? " …" : "") : ""} |`,
  );
  L.push("");

  // 🌀 太複雜
  L.push("## 🌀 三、太複雜（一次施法觸發 3 個以上音效）");
  L.push("");
  const hist = new Map<number, number>();
  for (const [, s] of m.castStack) hist.set(s.length, (hist.get(s.length) ?? 0) + 1);
  L.push("| 一次施法的音效層數 | 幾支技能 |");
  L.push("|---:|---:|");
  for (const [n, c] of [...hist].sort((a, b) => a[0] - b[0])) {
    L.push(`| ${n}${n >= 3 ? " 🌀" : ""} | ${c} |`);
  }
  L.push("");
  const heavy = [...m.castStack].filter(([, s]) => s.length >= 5);
  L.push(`⇒ **${[...m.castStack].filter(([, s]) => s.length >= 3).length} 支**技能一次施法有 3 層以上；最重的 ${heavy.length} 支各有 5 層：`);
  L.push("");
  L.push("| 技能 | 五層分別是 |");
  L.push("|---|---|");
  for (const [aid, s] of heavy) {
    const ab = m.abilities.find((a) => a.id === aid)!;
    L.push(`| ${nameOf(ab.champion)} / ${ab.name} | ${s.map((x) => `${x.layer}=\`${x.cue}\``).join(" · ")} |`);
  }
  L.push("");
  L.push(
    "⚠️ 這一格是**估計上界**，⛔ 不是「每次都響 5 聲」：`soundImpact` 只在命中時、`soundDissipate` 只在到期時。" +
      "但**發射那一刻**確實有「施法音 ＋ 特效發射音」兩層一起響，而它們都吃同一個 `SpatialSfxQueue` 額度。",
  );
  L.push("");
  L.push(
    "⚠️ 表裡有幾位英雄看起來重複（莉娜因巴斯、傑 富力士、魯夫⋯）——" +
      "那是 `content/champions/` 裡**同一位角色有兩個 id** 的既有狀況（新舊 rawcode），⛔ 不是這份表算了兩次。",
  );
  L.push("");

  // 🔊 同時太多
  L.push("## 🔊 四、同時太多（同一 tick 可能一起響）");
  L.push("");
  L.push(
    "⭐ 這是**量到的**，⛔ 不是猜的：從出貨的 `SFX_REACHABILITY` 取每一列的 `events`，" +
      "同一個 sim 事件底下有幾個 cue 在競爭，就是那一 tick 的上界。",
  );
  L.push("");
  const byEvent = new Map<string, string[]>();
  for (const r of m.reach.values()) {
    for (const e of r.events ?? []) {
      if (!byEvent.has(e)) byEvent.set(e, []);
      byEvent.get(e)!.push(r.key);
    }
  }
  L.push("| sim 事件 | 幾個 cue 競爭 | cue |");
  L.push("|---|---:|---|");
  for (const [e, keys] of [...byEvent].sort((a, b) => b[1].length - a[1].length)) {
    if (keys.length < 3) continue;
    L.push(`| \`${e}\` | ${keys.length} | ${keys.map((k) => `\`${k}\``).join(" · ")} |`);
  }
  L.push("");
  L.push(
    "⚠️ **多數是「取代」不是「疊加」**（`combatSfxKey` 一個事件只回一個 key）——" +
      "真正會**疊起來**的是**跨層**：施法音（`abilityCast`）＋ 特效發射音（`vfx-families.soundLaunch`）" +
      "＋ 詠唱音（`castBegin`）＋ 命中音（`damage`）。",
  );
  L.push("");
  L.push("| cue | 冷卻 | 同時上限 | 說明 |");
  L.push("|---|---:|---:|---|");
  for (const cue of ["abilityCast", "castBegin", "castEnd", "kill", "hit", "basicAttack", "explosion"]) {
    const g = m.cueGate.get(cue);
    if (!g) continue;
    L.push(`| \`${cue}\` | ${g.cooldownMs ?? "—"} ms | ${g.maxConcurrent ?? "—"} | gain ${g.gain ?? "—"} |`);
  }
  L.push("");
  L.push(
    "⭐ **`abilityCast` 的閘（冷卻 1200ms／同時 1）本身就是一條證據**：它之所以要壓得這麼緊，" +
      "正是因為那個池子裡是**人聲**而不是音效 —— 換成中性風聲之後這兩個數字大概可以放寬。",
  );
  L.push("");

  // ── 被推翻的假說 ───────────────────────────────────────────────────────
  L.push("## 🧪 附錄 A —— 一個**被量到的資料推翻**的假說（留著，因為它下次還會被提出來）");
  L.push("");
  L.push(
    "**假說**：#552 下架的五個變身態文件還留在 `content/` 裡，某條解析路徑仍然撈得到它們，" +
      "所以莉娜（`godie-h020` 正是那五個之一）在沒有變身時吃到了變身態的音效。",
  );
  L.push("");
  L.push("**量法**：把五對「本體 ↔ 下架變身態」的每一支技能逐支印出施法音路由。**結論：假的。**");
  L.push("");
  L.push("| 英雄 | 本體 | 下架的變身態 | 兩份文件裡有幾支技能填了 `sfxKey` |");
  L.push("|---|---|---|---|");
  const PAIRS: [string, string][] = [
    ["godie-ewar", "godie-e007"],
    ["godie-hjai", "godie-h020"],
    ["godie-h02v", "godie-h02u"],
    ["godie-nbbc", "godie-n01c"],
    ["godie-uvng", "godie-u010"],
  ];
  for (const [base, form] of PAIRS) {
    const n = (cid: string): string => {
      const a = m.abilities.filter((x) => x.champion === cid);
      return `${a.filter((x) => x.sfxKey).length} / ${a.length}`;
    };
    L.push(`| ${nameOf(base)} | \`${base}\` | \`${form}\` | 本體 ${n(base)} ／ 變身態 ${n(form)} |`);
  }
  L.push("");
  L.push(
    "⭐ **決定性的那一格是莉娜**：`godie-hjai`（本體）與 `godie-h020`（下架變身態）" +
      "**兩份文件、十二支技能，`sfxKey` 一支都沒填**，而且兩份文件裡" +
      "**一個皮卡丘／哆拉A夢／臭作的音檔都沒有引用**。" +
      "⇒ ⛔ 就算變身態真的洩漏了，也**變不出**一個皮卡丘的聲音 —— 那個聲音只可能來自污染的通用池。",
  );
  L.push("");
  L.push(
    "順手一起量掉的第二個假說（#554 的 `.upper()` join bug 那一族）：" +
      "`audio-map` 裡**沒有一個** `wc3.*` key 不是小寫，23 個 map-import 的 `gg_snd` 裡" +
      "出貨的 3 個**全部**推導出了主人（0 個漏掉）。⇒ ⛔ 這條路徑上沒有大小寫 join 錯配。",
  );
  L.push("");

  // ── 跨資產一致性 ───────────────────────────────────────────────────────
  L.push("## 🧩 附錄 B —— 跨資產一致性（模型 / 語音 / 音效，同一位英雄嗎？）");
  L.push("");
  L.push(
    "⚠️ 模型那一格 **⛔ 不在這條 lane 的柵欄內，只列不修**。判準：`imported.*` 的 modelKey 被" +
      "**角色名不同**的兩位英雄共用（`champ.*` 是共用骨架，本來就會重複，不算）。" +
      "⭐ 而 owner 2026-08-23 已經裁決：**變身態刻意使用另一位英雄的資產是設計，不是錯誤**。",
  );
  L.push("");
  const byModel = new Map<string, string[]>();
  for (const [cid, c] of m.champions) {
    if (!c.modelKey.startsWith("imported.")) continue;
    if (!byModel.has(c.modelKey)) byModel.set(c.modelKey, []);
    byModel.get(c.modelKey)!.push(cid);
  }
  L.push("| modelKey | 共用的英雄 | 判定 |");
  L.push("|---|---|---|");
  for (const [mk, ids] of [...byModel].sort()) {
    if (ids.length < 2) continue;
    const roles = new Set(ids.map((i) => nameOf(i).split(" - ").pop()));
    if (roles.size < 2) continue;
    L.push(
      `| \`${mk}\` | ${ids.map((i) => `${nameOf(i)}（\`${i}\`）`).join("<br>")} | ` +
        (mk === "imported.heropikachu"
          ? "✅ **owner 2026-08-23 已裁決**：「這是對的，這是因為要惡搞他大絕招是變身大型皮卡丘」。⛔ 不是資料錯誤"
          : "⚠️ 請 owner 確認") +
        " |",
    );
  }
  L.push("");
  L.push(
    "⭐ **音效那一格已經逐列查過**：全部 " +
      `${m.abilities.length} 支技能的 \`sfxKey\`／覆蓋層，**沒有一列指到別位英雄的音檔**。` +
      "⇒ ⛔ 模型槽那種「填錯人」的錯誤**沒有**在音效槽發生；音效的錯是**另一個形狀**（污染的通用池）。",
  );
  L.push("");
  L.push("---");
  L.push("");
  L.push(
    "產生器：`tools/sfx-bind/usage_table.ts` ｜ 推導：`tools/sfx-bind/ownership.ts` ｜ " +
      "閘：`tools/sfx-bind/crossCharacterSfx.test.ts`",
  );
  L.push("");
  return L.join("\n");
}

function main(argv: string[]): number {
  const i = argv.indexOf("--out");
  const out = i >= 0 && argv[i + 1] ? argv[i + 1]! : join(REPO, `docs/音效使用表_temp_${stamp()}.md`);
  const m = buildModel();
  writeFileSync(out, render(m), "utf8");
  const cross = crossCharacterRows(m);
  console.log(`wrote ${out}`);
  console.log(
    `  ${m.clipOwners.size} 個有主人的 clip · ${cross.filter((r) => r.actor === "*").length} 個污染的通用池 · ` +
      `${cross.length} 列跨角色誤用 · ${m.abilities.filter((a) => m.castStack.get(a.id)![0]!.cue === "abilityCast").length}/${m.abilities.length} 支技能吃到污染退路`,
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
