#!/usr/bin/env bash
# ⚠️ **已改名為 BMPNDD**（owner 2026-08-30：「好 那我升級為 備份戰情版.md + …」）
# ⭐ 留一層轉接，⛔ 不是刪掉 —— 舊名字在對話與文件裡還活著。
echo "ℹ️ MPNDD 已升級為 **BMPNDD**（多了第一步：備份戰情版）⇒ 轉給 bmpndd.sh" >&2
exec bash "$(dirname "$0")/bmpndd.sh" "$@"
