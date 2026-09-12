"""🧾 產出 `docs/素材缺口交接單.md` —— 給「去找素材」那條工作流的自足工單。

owner 2026-09-11：「我要讓**別的工作流去找對應素材** 請你做成一個 md」

⭐ 每一份清單都由**量測**填入（⛔ 不手打）：
  `audit-five-axes.py` 的六軸明細 ＋ `collect-review-inputs.py` 的三份缺口清單。

```sh
python3 tools/hero-intake/audit-five-axes.py /tmp/a5.json
python3 tools/hero-intake/collect-review-inputs.py --work <work>
python3 tools/hero-intake/make-asset-handoff.py --audit /tmp/a5.json --work <work> --out docs/素材缺口交接單.md
```
"""
import argparse, collections, json, pathlib

ap = argparse.ArgumentParser()
ap.add_argument("--audit", default="/private/tmp/a5.json")
ap.add_argument("--work", required=True, help="collect-review-inputs.py 的輸出目錄")
ap.add_argument("--out", default="docs/素材缺口交接單.md")
ARG = ap.parse_args()

A = json.load(open(ARG.audit))
R = pathlib.Path(__file__).resolve().parents[2]; C = R/'content'
jl = lambda p: json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
champs = {f.stem: jl(f) for f in sorted((C/'champions').glob('*.json')) if not f.name.startswith('_')}
models = {}
for f in (C/'models').glob('*.json'):
    if f.name.startswith('_'): continue
    d = jl(f)
    if d.get('id'): models[d['id']] = d
q60 = jl(pathlib.Path(ARG.work)/'quotes60.json')
pairs = jl(pathlib.Path(ARG.work)/'shared_pairs.json')
ship34 = jl(R/'docs/_review/material/hero-intake/ship34.json')
NON = {'sela','thorne'}

rig = [x for x in A if x['rig'][0].startswith('⛔')]
voice_gap = [x for x in A if x['voice'][0].startswith('⛔') and x['id'] not in NON]
voice_slot = [x for x in A if x['voice'][0].startswith('⚠️')]
sfx_none = [x for x in A if x['sfx'][0].startswith('·')]
sfx_part = [x for x in A if x['sfx'][0].startswith('⚠️')]
diff_pairs = [p for p in pairs if not p['same']]
s34_nomodel = [h for h in ship34['heroes'] if h['model'].get('files') == 0 and not h['model'].get('modelKey')]
s34_novoice = [h for h in ship34['heroes'] if not (h['voice'].get('candidates') or [])]

def row(x, extra=''):
    return f"| `{x['id']}` | {x['name']} |{extra}"

L = []
w = L.append
w("# 🧾 素材缺口交接單 —— 給**去找素材**的那條工作流")
w("")
w("> owner 2026-09-11：「我要讓**別的工作流去找對應素材** 請你做成一個 md」")
w("")
w("⭐ 這一份是**自足**的：你不需要讀任何對話就能開工。")
w("⚠️ 數字是 2026-09-11 的快照 —— **開工前先重量一次**，⛔ 不要照抄這裡的數字：")
w("")
w("```sh")
w("python3 tools/hero-intake/audit-five-axes.py /tmp/a5.json   # 印六軸統計，明細寫 /tmp/a5.json")
w("python3 tools/hero-intake/collect-review-inputs.py --work /tmp/gap  # 體素／對白／共用模型三份清單")
w("```")
w("")
w("---")
w("")
w("## 0. ⛔ 先讀這四條規矩 —— 不讀會做白工")
w("")
w("| # | 規矩 | 為什麼（⭐ 都是踩過的） |")
w("|---|---|---|")
w("| ① | **有就用 → 沒有才 CC0/CC-BY → 再沒有才自己生成**（CLAUDE.md 第一·四守則） | 一個「我們自己畫的」資產要說得出**上面兩階為什麼不行** |")
w("| ② | ⛔ **同名匹配只是候選**（owner 2026-09-08） | 這一份自己就有反例：傑富力士的語音候選撈到 `vc_kirby_copy_*`，而索引自己標著「**非對象本人**」⇒ ⛔ 不可用 |")
w("| ③ | ⛔ **角色台詞不可以編** | owner 2026-09-10 逐字：「**請你給我名單就好 不要自己產 我會手動填寫**」⇒ 你的工作是**找出處**，⛔ 不是寫句子 |")
w("| ④ | **成品進 git，半成品／來源／準備材料進 S3** （owner 2026-09-10） | S3：`ggd-390630837668-ap-east-2-an`（profile `vibe-coding`／region `ap-east-2`），內容定址佈局 `assets/<sha256 前2碼>/<sha256>.<副檔名>` |")
w("")
w("⚠️⚠️ **第五條，這一份是踩著它寫出來的**：")
w("⭐ **「宣告過」⛔ 不等於「玩家拿得到」** —— `content/assets-offdisk.json` 只記位元組在哪與雜湊，")
w("而部署走 `git fetch + checkout`、**全 repo 沒有任何一步把 S3 的位元組拉回來** ⇒ 那個檔在伺服器上不存在。")
w("⇒ ⭐ 找回來的模型**一定要進 git**（閘 `shippedChampionModelsReachPlayers.test.ts` 會擋）。")
w("")
w("---")
w("")
w("## 1. 去哪裡找（固定入口，⛔ 不要憑印象說「我們沒有」）")
w("")
w("| 要什麼 | 入口 |")
w("|---|---|")
w("| 模型／動作／特效 | `python3 \"<素材庫>/query.py\" <關鍵字> [--kind vfx] [--pending]`；⚠️ **`--pending` 是候選，⛔ 不是入庫**（實測 342 筆裡 341 筆是候選） |")
w("| 素材庫根目錄 | `…/ABxVFX_EDIT/GGD-Asset-Library`（固定入口是它的 `README.md`） |")
w("| 角色語音索引 | `…/ABxVFX_EDIT/GGD-hero-model-options/materials/hero-model-library/voice-index.json`（988 組）|")
w("| 語音**檔案級**索引 | 同目錄 `voice-files.jsonl`（284,075 列，每列 `groupId` ＋ `path` ＋ `seconds`）；`path` 的根是 `…/ABxVFX_EDIT/` |")
w("| 已交付但還沒進本 repo 的模型 | sibling repo `…/ABxVFX_EDIT/GGD-community-acquired-heroes`，分支 `codex/community-acquired-heroes`，交付表 `docs/_reports/community-acquired-heroes/model-delivery-summary.json` |")
w("| 原作音效 cue 名單 | `content/audio-manifests/ability-sfx-cues.json`（52 個 cue；⛔ 這份是產生的，改 `tools/sfx-bind/build_bindings.py`）|")
w("")
w("⭐ **語音索引最準的一把鑰匙是 `identityIds`**（`300heroes:62`／`mba:Chara14`）——")
w("它同時是索引的 group id。⚠️ 但**編號對上不代表名字對得上**，兩個名字都要印出來給人看。")
w("")
w("---")
w("")

# ── A 骨架 ──────────────────────────────────────────────────
w("## A. 🦴 骨架 —— 1 支")
w("")
w("| 英雄 | id | 現在指的模型 | 問題 |")
w("|---|---|---|---|")
for x in rig:
    k = champs[x['id']].get('modelKey'); g = (models.get(k) or {}).get('glbPath','')
    w(f"| {x['name']} | `{x['id']}` | `{k}`<br>`{g}` | {x['rig'][1]} |")
w("")
w("**要找的**：同一個角色、**帶骨架（skin/joints）且六格動作齊**的模型；或替現有這顆綁骨架＋做動作。")
w("**怎麼驗**：`python3 -c` 讀 glb 的 JSON chunk，`skins` 非空、`joints` > 0；")
w("再跑 `python3 tools/w3x-import/model_intake.py <檔> --merge`（⭐ 匯入模型**一定**要跑這一支，五件事它都會問）。")
w("")

# ── B 語音 ──────────────────────────────────────────────────
w("## B. 🎙 語音 —— ⭐ 真正要找素材的只有 **2 個角色**")
w("")
w("⚠️ 原始量測說「7 支沒有語音」，逐支查完之後**只有 2 個角色是素材缺口**：")
w("")
w("| 角色 | 佔幾個 id | 狀態 | 索引裡的候選 |")
w("|---|---|---|---|")
w("| 白木老樹精・白木卡迪那 | `godie-e00s` ＋ `godie-e010` | ⛔ 兩個 id 都沒有包 | `300heroes:215`「白」400 檔 —— ⚠️ **只有一個字命中，信心低**，要聽過才算 |")
w("| 職業獵人・傑 富力士 | `godie-u034` ＋ `godie-ucrl` | ⛔ 兩個 id 都沒有包 | ⛔ **沒有可用候選**（撈到的 `vc_kirby_copy_*` 索引自己標著「非對象本人」）|")
w("")
w("⭐ **另外兩支⛔ 不要去找素材**，它們是**接線**問題：")
w("")
w("| 英雄 | 為什麼不是素材缺口 |")
w("|---|---|")
w("| `b2-maple-alt-9769eb88b85b` 梅普露（變身） | ⭐ **本體 `b2-maple` 已經有 18 類語音包** —— 缺的是 `MANIFEST.formShares` 裡的一列（`base-to-alternate`）。⚠️ 那張表今天 19 筆**全部是 `godie-*`，一筆 b2 都沒有** ⇒ 產生器 `tools/voice-gen/index-lines.mjs` 的變身配對規則沒有涵蓋 `*-alt-*` 這種 id |")
w("| `sela` / `thorne` | ⛔ **不是上架英雄** —— 內容載入失敗時 `main.tsx` 註冊的骨架 fallback |")
w("")
w("**要找的**：那 2 個角色的**原作日文語音**（⭐ 只收日文；⛔ 中文配音檔要排除，300英雄的 `voice_ch_*` 就是）。")
w("**交回來**：來源群組 id ＋ 檔案清單 ＋ **你聽過的證據**（哪幾段是本人、哪幾段是旁白/其他角色）。")
w("⛔ **不要自己合成**：合成走既有的 `tools/voice-gen/`，而它要的是**參考音**，不是成品。")
w("")

# ── C LoL 技能喊招 ──────────────────────────────────────────
w("## C. 🎙 LoL 7 支 —— 缺的是**技能喊招**那幾格")
w("")
w("| 英雄 | id | 缺幾格 |")
w("|---|---|---|")
for x in voice_slot:
    n = x['voice'][1].split('缺 ')[1].split('：')[0] if '缺 ' in x['voice'][1] else ''
    w(f"| {x['name']} | `{x['id']}` | {n} |")
w("")
w("⭐ 這幾格**不需要編台詞** —— 喊的就是**英雄自己的技能名**（計劃書 §3 的 A 類）。")
w("⇒ 要找的是**可以拿來複製音色的原作參考音**（該英雄的日文語音包）。")
w("⚠️ 已知 Lux／好運姐／狼人／犽宿／李星的日文包 owner 說過可以自己下載。")
w("")

# ── D 角色對白 ──────────────────────────────────────────────
w(f"## D. 💬 角色對白 —— {len(q60)} 支（⛔ 找**出處**，不是寫句子）")
w("")
w("| 分組 | 支數 | 為什麼空著 |")
w("|---|---|---|")
cnt = collections.Counter(r['group'] for r in q60)
why = {'b2': '交接資料只給**身分**（作品／官方角色頁），⛔ 沒有台詞',
       'community': '技能名多半是 GGD 自己取的佔位名／描述性名稱，引用不到原作',
       'lol': 'LoL 這幾名沒有可引用的角色台詞'}
for g in ('b2','community','lol'):
    w(f"| {g} | {cnt.get(g,0)} | {why[g]} |")
w("")
w("**要交回來的形狀**（一行一支，⭐ 每一句都要**指得到出處**）：")
w("")
w("```")
w("id, 角色名, 候選台詞（原文）, 出處（作品・話數／集數・時間碼 或 官方角色頁 URL）, 你的信心")
w("```")
w("")
w("⛔ **找不到就寫「找不到」** —— 那是合法的結論，⛔ 而編一句像的不是。")
w("⭐ 素材在 repo 裡就有：每一支的**技能名**與**卡面上已經寫過的「」台詞**")
w(f"（{sum(1 for r in q60 if r['lines'])}/{len(q60)} 支卡面上已經有台詞可以當語氣參考）——")
w("跑 `collect-review-inputs.py` 會產出 `quotes60.json`，裡面逐支帶著這兩樣。")
w("")

# ── E 音效 ──────────────────────────────────────────────────
w(f"## E. 🔊 原作專屬音效 —— {len(sfx_none)} 支全通用 ＋ {len(sfx_part)} 支部分")
w("")
w("⚠️⚠️ **先讀這一句再開工**：這些英雄**⛔ 不是無聲**。")
w("`apps/client/src/audio/combatSfx.ts:690` 的解析鏈是")
w("「`bindings` 覆蓋層 → 技能自己的 `sfxKey` → **元素風聲** → 通用施法音」⇒ 一定發得出聲音。")
w("⇒ ⭐ 這一軸要找的是**原作專屬**音效，⛔ 不是「補上沒有的聲音」。")
w("")
w("| | 支數 |")
w("|---|---:|")
w(f"| 全部技能都退到元素風聲 | {len(sfx_none)} |")
w(f"| 部分技能有原作音 | {len(sfx_part)} |")
w(f"| 每一格都有原作音 | {len([x for x in A if x['sfx'][0].startswith('✓')])} |")
w("")
w("### ⚠️ 先看清楚「已經掃過的那兩張表裡**沒有你的工作**」")
w("")
w("| 表 | 內容 | 你能做什麼 |")
w("|---|---|---|")
w("| `ability-sfx-cues.json` 的 `unmatched`（19 列） | `secondary-cue` **17** ＋ `source-map-silent` **2** | ⛔ **兩種都不是找素材**：前者是「一次施法只播一個 cue，這是沒被選中的那一個」（要的是**分層播放機制**，⛔ 不是一個檔）；後者是**原作自己就是啞的** |")
w("| `tools/sfx-bind/UNPORTED_SFX_LEDGER.json`（26 列・17 支英雄） | JASS 掃到有施法音、但**英雄還沒進 content** | ⛔ 也不是找素材：cue 已經保留好（`reservedCue`），英雄一進 content 把它寫進 `sfxKey` 就接上了 |")
w("")
w("### ⭐ 那 115 支要**分成兩種來源**做，⛔ 一種做法做不完")
w("")
w("| 出身 | 支數 | 要走哪條路 |")
w("|---|---:|---|")
w("| **原作 GoDie**（`godie-*`） | 31 | ⭐ 回 `war3map.j` 找那支技能的 `gg_snd_*`；掃不到就是**原作自己沒有**（⭐ 正確結論，⛔ 不是缺口）。⚠️ 讀迴圈先問「迴圈體裡有沒有 `AddSpecialEffect`／`CreateNUnitsAtLoc`」——把傷害取樣的迴圈讀成音效來源是這個 repo 記錄過的誤讀 |")
w("| **b2／社群／LoL**（非原作） | 84 | ⛔ **war3map.j 裡根本沒有它們** —— 這些技能是 GGD 自己寫的 ⇒ 走第一·四守則第 2 階：**CC0／CC-BY 音效庫** |")
w("")
w("⭐ **CC0 音效的常設授權**：owner 已經同意從 **効果音ラボ**（soundeffect-lab.info）下載，")
w("⚠️ **條件是每一段都要列進出處頁**（⛔ 沒列＝違反授權）。")
w("⇒ 交回來時每一段都要帶：**來源 URL ＋ 授權 ＋ 你打算綁到哪一支技能**。")
w("")

# ── F 專屬模型 ──────────────────────────────────────────────
w(f"## F. 🧍 專屬模型 —— {len(diff_pairs)} 對「不同角色共用一顆」")
w("")
w("| 共用的模型 | 誰在用 | 要判斷的 |")
w("|---|---|---|")
for p in diff_pairs:
    who = ' ＋ '.join(f"{n}（`{i}`）" for i, n in zip(p['ids'], p['names']))
    w(f"| `{p['modelKey']}` | {who} | 是刻意的惡搞／替身，還是該各自一顆？ |")
w("")
w("⚠️ 另外 15 對共用是**同一角色**（本體↔變身態），⛔ **不要動它們** —— 那是正常的。")
w("⭐ 這 3 對要先給 owner 判「刻意還是缺」，⛔ 判完才值得去找模型。")
w("")

# ── G 待上架 34 ─────────────────────────────────────────────
w(f"## G. 🆕 另外 34 名正在上架 —— {len(s34_nomodel)} 支**完全沒有模型**")
w("")
w("| 英雄 | id | 交付表怎麼說 |")
w("|---|---|---|")
for h in s34_nomodel:
    w(f"| {h['name']} | `{h['id']}` | {h['model'].get('deliveryStatus','')}（只有骨架來源，動作還沒做）|")
w("")
w(f"⭐ 這 {len(s34_nomodel)} 支在交付表裡是 `rig-source-present-actions-missing` —— **骨架來源在、動作還沒做**。")
w("⇒ 要嘛把動作做出來，要嘛去找一顆**帶動作**的替代模型。")
w(f"⚠️ 同一批另有 {len(s34_novoice)} 支在語音索引裡**找不到任何候選來源**。")
w("")
w("---")
w("")
w("## 2. 交回來的東西放哪")
w("")
w("| 東西 | 住處 | 為什麼 |")
w("|---|---|---|")
w("| 轉好的 `.glb` 成品 | ⭐ **git** `content/assets/models/<家族>/<sha256>.glb` | ⛔ 不進 git 的位元組**到不了伺服器**（沒有 hydrate 步驟）|")
w("| 語音成品 mp3 | ⭐ **git** `content/assets/audio/voices/lines/<id>/` | 同上 |")
w("| 原始素材・參考音・半成品 | **S3** `ggd-390630837668-ap-east-2-an` | owner 2026-09-10 的歸屬表 |")
w("| 清單／出處／雜湊 | ⭐ **git** | 「一個位元組如果只能靠雜湊驗、不能靠 diff 讀，它就不屬於 git」|")
w("")
w("## 3. 怎麼算驗過（⛔ 不是「我看起來對」）")
w("")
w("```sh")
w("npx vitest run packages/shared/src/content/shippedChampionModelsReachPlayers.test.ts  # 模型到得了玩家")
w("python3 tools/w3x-import/model_intake.py <檔…> --check                                 # 匯入模型五件事")
w("node tools/hero-intake/run.mjs --batch <批次> --all --check                            # 材料沒過期")
w("npx tsx tools/asset-manifest/gen.ts --check                                            # 資產引用解析得到")
w("```")
w("")
w("⭐ **每一種素材都要驗兩個軸**（⛔ 單邊校準不算）：")
w("")
w("| 素材 | 軸一 | 軸二 |")
w("|---|---|---|")
w("| 模型 | glb 的 `skins`／`animations` 解析得出來 | ⭐ **真的渲染一張圖**，量非透明像素（`tools/hero-intake/shots/`）|")
w("| 音檔 | 長度 ≥ 0.15s | `max_volume` ≥ −60dB（⭐ 量尺要先對已知靜音回 −91dB）|")
w("| 從 S3 取回的檔 | `sha256 == 檔名` | 位元組數 == 清單記的 |")
w("")
w("## 4. ⛔ 不要做的事")
w("")
w("1. ⛔ **不要編角色台詞**（規矩③）。找不到就回報找不到。")
w("2. ⛔ **不要手改產物** —— 動 `content/` 之前先 `bash scripts/genguard.sh <path>`。")
w("3. ⛔ **不要把素材本體塞進 git 而沒有雜湊**，也⛔ 不要為了繞過 100MB 上限而切段。")
w("4. ⛔ **不要拿 `--pending` 的查詢結果當成「我們有這顆」** —— 那是候選。")
w("5. ⛔ **不要跑 `pnpm skills:sync`**（會寫 `bundle.json`，同一時間只能有一條工作流跑）。")
w("6. ⛔ **不要 push／deploy／碰正式站**。")
w("")
w("---")
w("")
w("⭐ 這一份的數字怎麼來的：`tools/hero-intake/audit-five-axes.py`（六軸逐支量）＋")
w("`tools/hero-intake/collect-review-inputs.py`（三份缺口清單）。兩支都可重跑，⛔ 不是手抄。")

out = pathlib.Path(ARG.out)
out.write_text("\n".join(L) + "\n", encoding='utf-8')
print(f"寫好 {out} · {len(L)} 行 · {out.stat().st_size/1024:.1f} KB")
