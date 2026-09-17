#!/usr/bin/env bash
# 啟用 repo 內建的 git hooks（每台機器跑一次）。
# ⚠️ git ⛔ 不會自動採用 .githooks/ —— 它預設只看 .git/hooks/,而那個目錄不進版本控管。
set -euo pipefail
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
echo "✓ core.hooksPath = .githooks"
echo "  目前掛著：$(ls .githooks | tr '\n' ' ')"
echo "  ⛔ 停用：git config --unset core.hooksPath"
