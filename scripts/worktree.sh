#!/usr/bin/env bash
# 🌲 一條 lane 一棵 worktree —— 薄殼，真正的邏輯在 tools/parallel-gates/worktree.mjs
# （住那裡是因為 `suitesForPaths` 會把被改到的 tools/ 目錄連同它自己的測試一起排進
#  ship 閘 ⇒ helper 壞掉時守衛真的會跑；scripts/ 走的是 fail-closed 全包那條路。）
#
#   bash scripts/worktree.sh new  <lane>   # 開樹 + node_modules，印出 cd 路徑
#   bash scripts/worktree.sh land <lane>   # 驗過再 merge 回 main
#   bash scripts/worktree.sh rm   <lane>   # 收工移除
exec node "$(dirname "$0")/../tools/parallel-gates/worktree.mjs" "$@"
