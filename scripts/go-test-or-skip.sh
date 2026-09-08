#!/usr/bin/env bash
# 🐹 GH#653 —— `go test ./...`（apps/platform）進出貨閘。
#
# 為什麼存在：#633 的 AttrDefaults 漂了兩格，而逐值對帳 `keysync_test.go`
# **早就紅著** —— ship:check 只跑 vitest，Go 的紅**沒有人看見**。
#
# ⚠️ 沒有 Go 工具鏈時**明確說出來**再 exit 0 —— ⛔ 不是靜靜跳過。
#   一個安靜的跳過與「全綠」長得一模一樣（CLAUDE.md：fail-open 沒錯，靜默才是缺陷）。
set -o pipefail
cd "$(dirname "$0")/.."
if ! command -v go >/dev/null 2>&1; then
  echo "⚠️ go-test:跳過 —— 這台機器沒有 Go 工具鏈（Go 的對帳在這裡沒有被驗，⛔ 不是綠）。"
  exit 0
fi
# ⭐⭐ GH#1122 —— `-count=1` 是**必要的**,⛔ 不是保險。
#   2026-09-09 量到:本機 `go test` 命中快取回 ok,⭐ 而 CI（乾淨環境）同一個測試 FAIL。
#   ⚠️ 那個測試檔的**檔頭自己記著這個陷阱**,而我還是被騙了一輪。
#   ⇒ 一條會讀快取的閘,在它最需要說話的時候是沉默的。
exec go -C apps/platform test -count=1 ./...
