# M6 / GH#625 — 一條 lane 一棵 worktree（併行 index 打架的根因修復）

## 交出什麼

| 檔 | 是什麼 |
|---|---|
| `tools/parallel-gates/worktree.mjs` | helper 本體（`new` / `list` / `land` / `rm` / `doctor` / `gc`） |
| `tools/parallel-gates/worktree.d.mts` | 型別（守衛與 helper 共用同一支實作） |
| `tools/parallel-gates/worktree.test.ts` | 守衛，4 條，1.6s |
| `scripts/worktree.sh` | 薄殼入口 |
| `scripts/preserve-before-overwrite.py` | ⛔ **hook 修了兩個在 worktree 裡的靜默失效**（見下） |

## 怎麼用（三行）

```bash
bash scripts/worktree.sh new  <lane>   # 開樹 + node_modules，印出 cd 路徑
bash scripts/worktree.sh land <lane>   # 驗過再 merge 回 main（主樹跑）
bash scripts/worktree.sh rm   <lane>   # 收工移除（--force 連未合併的一起）
```

其他：`list` 看全部 lane · `doctor` 體檢 · `gc` 掃掉已合併且乾淨的 lane。

## ⭐ 根因真的被解掉了（量到的，⛔ 不是推論）

兩棵 lane 樹，lane B 打一個**裸的 `git commit`**（2026-08-22 送上 332 個檔的那一個）：

```
lane A: git add LANE_A_FILE.txt      # staged，然後走開
lane B: git add LANE_B_FILE.txt ; git commit      # ⛔ 沒有 pathspec
⇒ lane B 的 commit 內容：LANE_B_FILE.txt          # ⭐ 只有自己的
⇒ lane A 的 staged 檔：   A  LANE_A_FILE.txt      # ⭐ 原封不動
```

機制：`git rev-parse --git-dir` 在 lane 裡回 `.git/worktrees/<name>` ⇒ **各自的 index**。
⇒ 那個「別人把我的送上車」的視窗**結構上不存在**，⛔ 不是「要記得帶 pathspec」。

## ⛔⛔ 最重要的發現：hook 在 worktree 裡**整個是啞的**

實測**同一份**產生器產物（`docs/技能標記機制與效果規則.md`）：

| 位置 | 修之前 |
|---|---|
| 主樹 | `EXIT=2`（擋下）✅ |
| worktree | **`EXIT=0`（放行）** ⛔ |

根因：`preserve-before-overwrite.py` 把 `REPO` 寫死成主樹，於是 lane 檔的相對路徑算成
`.claude/worktrees/lane-x/docs/…`，對不到 `sync-io.json` 的 `docs/…`。
⭐ **這正是失敗形態⑧**：hook 有掛、有跑、exit 0，而它什麼都沒保護 ——
而它的殺傷力**隨著這張票放大**（#625 就是要把每一條 lane 都搬進 worktree）。

同一個根因的第二半：`git status` 在主樹跑，而 `.claude/worktrees/` 在 `.git/info/exclude` 裡
⇒ 每一個 lane 檔都被判成「未追蹤」⇒ 明明 git 有副本卻照樣備份（legacy 會爆）。
修完之後帳本記的是 `SKIP(git 有)`。

⇒ 修法：`tree_root(p)` 由**檔案系統**推導（往上找 `.git`；worktree 的 `.git` 是**檔案**不是目錄），
⛔ 不呼叫 git（這支 hook 每一次 Write/Edit/Bash 前都跑）。

## ⛔ node_modules：那個「聰明」的做法會讓 lane 測到**別棵樹**

直覺是 symlink 主樹的 `node_modules` 省時間。⛔ **不可以。**
量到：`apps/client/node_modules/@ggd/shared -> ../../../../packages/shared` 是**相對** symlink，
而 node 走 **realpath** ⇒ 一旦指向主樹，lane 改了自己的 `packages/shared`，
測試卻**全綠**，因為它量的是主樹（失敗形態⑤）。

⭐ **誠實的做法反而最快**：`pnpm install --offline` 在新樹裡**實測 3.4 秒**
（全部從 pnpm 全域 store hardlink，磁碟增量 ≈ 0；全 repo 量過**沒有任何** postinstall/prepare）。
⇒ ⛔ 不 symlink。`doctor` 直接驗 **realpath 有沒有逃出這棵樹**。

⚠️ 這個坑**已經有人踩過**：主樹裡至今留著四條自我指向的死 symlink ——
`apps/client/node_modules/node_modules -> /Users/Takuro/GGD/apps/client/node_modules`
（另三處在 `node_modules/`、`packages/shared/`、`apps/game-server/`）。
`ln -s TARGET DIR` 在 DIR 已存在時會把 link 建到 **DIR 裡面**。
⛔ 我沒有動它們（在柵欄外、且 `node_modules` 不進版控）—— 記在這裡，開票可以清掉。

## 🔒 全域鎖

`content:build` / `skills:sync` / `spec:build` / `ship:check` 寫全域產物。
在 lane 樹裡跑更糟：產物落在**那棵樹**，主樹看不到，merge 回去之後主樹 `--check` 說 stale
而「誰寫的」已經查不出來。
⇒ hook 在**指令送出之前**擋下並指名去主樹跑（逃生口 `GGD_LANE_LOCK_OFF=1`）。
⭐ 這是**閘不是判準** —— lane 的 prompt 早就寫了「禁止跑」，而散文治不了。

## 守衛與突變

`tools/parallel-gates/worktree.test.ts`（4 條 / 1.6s）。
住 `tools/parallel-gates/` 是因為 `suitesForPaths` 會把被改到的 `tools/` 目錄
**連同它自己的測試**排進 ship 閘；`scripts/` 走的是 fail-closed 全包那條路。

**突變（一批一條，挑最承重的）**：`_generator_owner` 的 `root = tree_root(p)` → `root = REPO`
⇒ 🔴 `expected +0 to be 2` —— 正好是那個靜默放行的形狀。已復原（用 `Edit`，⛔ 不是 `git checkout`）。

## 順帶

`git worktree prune` 清掉 **2 筆失聯登錄**（`/private/tmp/ggd-fix`、`ggd-remake`，目錄早就不在）。
52 → 50，⛔ 沒有任何一棵真的 worktree 被移除。

## 剩什麼（⛔ 沒有推到「下一版」，是這一批刻意不做的）

- **48 棵三週沒動的舊 worktree 沒有被清掉** —— 它們沒有 `.ggd-lane.json` 標記，
  所以 `gc` **刻意不碰**（保守：那是別人的工作樹，不是我的）。要清要主 session 逐棵確認。
- `land` 的 merge 本身只在「無交集」路徑上驗過（拒絕那一半驗了）；
  真的 merge 進 main 沒有在這一批做 —— 主樹當下有 40+ 個別的 lane 的髒檔。
