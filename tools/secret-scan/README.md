# secret-scan —— public repo 的憑證閘

> owner 2026-09-11：「以後可以定期呼叫這個script檢查就好」

`github.com/adms/GGD` 是 **public** 的。這支問一件事：
**有沒有金鑰／登入憑證／不該公開的資料進到 repo 裡？**

```bash
bash scripts/secret-scan.sh              # 追蹤中的檔案（~60 秒）＝ pnpm secrets:check
bash scripts/secret-scan.sh --staged     # pre-commit：只看 staged
bash scripts/secret-scan.sh --history    # 所有 blob,含已刪除的（~6 分鐘）
bash scripts/secret-scan.sh --commits    # ⭐ commit 訊息（⛔ 它不是 blob）
bash scripts/secret-scan.sh --gh         # ⭐ GitHub issue／PR／每一則留言
bash scripts/secret-scan.sh --infra      # 換一個分母：登入方法／基礎設施
bash scripts/secret-scan.sh --calibrate  # 只問「這把尺還準嗎」（<1 秒）
```

離開碼：`0` 乾淨 · `1` 有發現 · `3` ⭐ **校準失敗（尺瞎了,結論作廢）**

## ⭐ 每個模式的**分母不一樣**，⛔ 不可互相代替

owner 2026-09-11：「你其實連 **PR commit 票** 等資訊都要掃描有沒有敏感訊息」

| 模式 | 回答 | 量到的規模 |
|---|---|---|
| `--worktree`（預設） | 「**現在** push 出去會洩漏什麼」 | 34,664 檔 |
| `--staged` | 「**這一個 commit** 會帶什麼上去」 | — |
| `--history` | 「**歷史上曾經**洩漏過什麼」——⭐ 刪掉的檔案仍在 blob 裡 | 78,453 blob |
| ⭐ `--commits` | 「**commit 訊息**裡有什麼」——⛔ 它不是 blob,前四個模式**一個都看不到它** | 3,393 則 |
| ⭐ `--gh` | 「**issue／PR／留言**裡有什麼」——⭐ 它跟 repo 一樣公開,而且**根本不在 git 裡** | 4,606 筆 |

⛔ worktree 乾淨**不代表**歷史乾淨,⛔ 也**完全不代表**票與留言乾淨。真的洩漏過 ⇒ ⭐ **先去該服務撤銷／輪換那把金鑰**，
⛔ 「把 commit 刪掉」不等於讓它失效（它早就被 GitHub 的事件流與各家爬蟲抓走了）。

## ⚠️⚠️ 為什麼它每次都先校準自己

CLAUDE.md 第一守則：「**一把只驗過單邊的尺，不算自證過**」。
⭐ 一支**掃不到東西**的掃描器與一支**壞掉**的掃描器，輸出**一模一樣**（都是 `✅ 零發現`）。
⇒ 每次掃描之前先驗**三個方向**，任一失敗就 `exit 3`：

| 方向 | 問什麼 |
|---|---|
| ① | 每一條規則抓得到**自己的檢體**（`rules.tsv` 的 specimen）—— ⛔ 抓不到 = 它在真的洩漏面前也會沉默 |
| ② | 一份**乾淨對照檔**零誤報 —— ⛔ 誤報會把噪音淹過真訊號 |
| ③ | ⛔ 沒有任何檢體被 `known-public.tsv` 吃掉 —— 那等於把整條規則靜默關掉 |

⭐ **這不是潔癖，是量到的**。2026-09-11 建這支的當天，校準與 fail-loud **抓到自己四個洞**：

| 洞 | 症狀 | 如果沒抓到 |
|---|---|---|
| 4 條規則的檢體對不上自己 | 校準 ① 紅 | 那 4 條**永遠不會命中** |
| `--batch-check` 少了 `=` | git 報錯到 stderr，`git()` 只回 stdout | 歷史模式量到 **0 個 blob** 而印「✅ 零發現」 |
| `git grep` 把 `-----BEGIN…` 當**選項** | 同上，靜默回空 | ⭐ **私鑰那兩條（最高風險）一直是死的** |
| cat-file 管道每 256 筆才 flush | 一問一答協定 ⇒ 雙邊死鎖 | 0% CPU 卡 10 分鐘 |

⇒ 前三個的共同症狀都是 **`✅ 零發現`**。⛔ 一份沒有自證過的掃描報告不值得讀。

## 三張表（⭐ 規則住表裡，⛔ 不烘進腳本）

| 檔 | 是什麼 | 加一列要寫什麼 |
|---|---|---|
| `rules.tsv` | 規則：`id / kind / regex(ERE) / 檢體 / 說明` | ⭐ **檢體必填** —— 沒有檢體的規則校準不了 |
| `allowlist.tsv` | **路徑**層豁免：`rule_id / 路徑樣式 / 理由` | ⭐ 一個**能被反駁**的理由（≥12 字，腳本會擋） |
| `known-public.tsv` | **值**層豁免：`字面值 / 出處` | ⭐ 說得出「它公開在哪」（例：AWS 官方文件範例 key） |
| ⛔ `hosts.local.tsv` | **我們自己主機的位址**（⭐ **不進 git**） | 從 `.example` 複製再填;沒有它就**大聲說**主機那一族沒在驗 |

⚠️⚠️ ⭐ **我們自己的 IP ⛔ 不可以寫進 `rules.tsv`** —— 那份檔在 git 裡,
等於**為了偵測洩漏而再洩漏一次**。⭐ 這個錯這支工具自己犯過（第一版三條規則就寫著三個真 IP）。

⛔ 誤報不要放寬規則、⛔ 不要註解掉 —— 補一列豁免並寫下理由。
⭐ 理由要寫**反駁法**（「哪一天 X 成立，這一列就要刪」），否則它會永久住在表裡。

## pre-commit

```bash
bash scripts/enable-git-hooks.sh     # 每台機器一次（`pnpm install` 也會自動掛）
```

`.githooks/pre-commit` 跑 `--staged`（幾秒）。⛔ git **不會**自動採用 `.githooks/` ——
它預設只看不進版控的 `.git/hooks/`,所以要那一行（或 `pnpm install` 的 `prepare`）。
一次性跳過 `GGD_SKIP_SECRET_SCAN=1`，用了要在 commit 訊息裡說為什麼。

## 🚪 部署主機的位址住哪

⭐ `scripts/hosts.local.sh`（⛔ **不進 git**，從 `.example` 複製）。
每一支部署腳本 `source scripts/_hosts.sh`，用 `ggd_host <VAR> <說明>` 取值 ——
⛔ 沒設就**乾淨地死並說要做什麼**，⛔ 不是靜默退回一個寫死的預設。
環境變數仍然優先 ⇒ 一次性覆寫與 rollback 照舊。
棘輪 `packages/shared/src/ops/noHardcodedDeployHosts.test.ts` 擋下一個寫死的 `user@ip`。

⚠️⚠️ ⭐ **這只擋得住「下一個」。** 已經公開的位址在 git 歷史、commit 訊息與 issue 裡，
⛔ 改工作樹**拿不回來** —— 真要處理是**輪換金鑰／收斂 ssh 曝險**，⛔ 不是編輯檔案。

## 守衛

`packages/shared/src/ops/secretScan.test.ts` —— ⭐ 它**不重跑全掃描**（那要 60 秒，
而且它問的是「今天乾不乾淨」這個**會變**的事實）。它守的是上一層：**這把尺還準嗎** ——
①校準過得了 ②真的植一把假金鑰進去會被抓到並回非零。

`secrets:check` 刻意**不進** `skills:check`（豁免理由寫在
`skillsSyncCoversGenerators.test.ts` 的 `EXEMPT`）：那一支是**技能改動的新鮮度**閘，
而一把金鑰跟技能改不改動無關。
