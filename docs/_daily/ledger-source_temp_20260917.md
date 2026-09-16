# 逐則對票 · owner 原話全文 2026-09-17

> ⭐ `docs/_daily/2026-09-17.md` 的表格那一格是**截斷**過的,全文在這裡。
> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。
> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。

## 00:13 · 1ce782de

我要全部上線

## 00:14 · 743896da

金色魔王 一樣用莉娜音效
碧翠絲、拉姆、犬夜叉、金色魔王、Steve／Alex、小當家、Zero

這些角色有上架嗎?

## 01:09 · 2c41aa29

給我全角色上線名單 以及對應資源檢核表

## 01:22 · 78fb7b1e

已取得素材新角	Steve／Alex	acquired-minecraft	體素替身
已取得素材新角	碧翠絲	acquired-beatrice	體素替身
出自哪裡 為何沒有模型

## 01:31 · b3905f09

請以 PR #1267 為唯一整合入口：
https://github.com/adms/GGD/pull/1267

#1152 已由 #1267 的乾淨素材庫取代，不要再合併 #1152。請確認 PR head 至少包含 commit：

2a556425520a8fc2e10eee74ea9084fe2748afac

合併方式：

1. 同步最新 main，處理 #1267 衝突時以 Main 的程式與生成來源為基底，再套用 Codex 的素材成品、來源設定、索引、收據及自動化工具；不要手工拼接生成的 MD／JSON。
2. 允許 Main 從下列位置唯讀還原 314 份材料：
   s3://ggd-390630837668-ap-east-2-an/legacy/pr1152-preparation-split-v1/
   使用 AWS_PROFILE=vibe-coding、AWS_REGION=ap-east-2，依 manifest 逐檔核對 SHA-256。只讀取與還原，不刪除、不覆蓋其他工作流資料。
3. 還原素材後執行：
   python3 tools/hero-model-library/sync_voice_gap_source_mappings.py --workspace ..
4. 驗證中央語音查詢：
   python3 tools/hero-model-library/query_voice.py lol-sett --files --json
   python3 tools/hero-model-library/query_voice.py acquired-dio --files --json
   python3 tools/hero-model-library/query_voice.py acquired-pokemon-trainer --files --json
5. 預期結果：
   - LoL 第二批 11 名皆能查到官方 ja_JP 來源，共 6,636 段。
   - voice-index summary 顯示 missingOrSizeChanged=0。
   - DIO、寶可夢訓練家及其他已對應角色能依 hero ID 查到來源實檔。
   - 未逐段聽審的音訊保持 runtimeApproved=false，不要自動綁定技能。
6. Steve／Alex 與碧翠絲的狀態請按以下文字合併，不要把「體素替身」當成素材取得狀態：

   acquired-minecraft／Steve／Alex：
   已取得並轉換 SSBU 原作 Steve、Alex 兩顆模型，各 828 面；目前 0 動作，待程序化／借用動作、model@1 與後台註冊。可先合併為獨立成品元件，但尚未完成遊戲內切換。

   acquired-beatrice／碧翠絲：
   已取得並轉換 Re:Zero 角色模型、骨架及貼圖；目前 20,932 面、0 動作。依最新政策須減面至 8,000 以下，再補程序化／借用動作、model@1 與後台註冊。可先合併為儲備成品元件，不能設為預設模型。

7. 合併後請重跑專案既有的內容、索引及格式檢查。只有 Main 正式服務部署並實際確認後台可選、模型可切換，才能把狀態改成「已上架」；PR 合併、S3 還原或本機驗證都不等於正式站已部署。

Main 只需審查、解衝突及合併；後續 Steve／Alex 動作補齊、碧翠絲減面與動作補齊仍由 Codex 工作流處理。

## 01:37 · ea97710f

GGD 全角色上線名單・資源檢核表 請更新後做成 md

## 01:39 · a9ffe4f8

英雄	作品	id	目前狀態
鋼彈	鋼彈SEED	godie-hlgr	已下架（content/_legacy）
劍心拔刀齋	神劍闖江湖	godie-eevi	還沒有角色檔
黑化Saber英靈亞瑟王	Fate/hollow ataraxia	godie-e00q	已下架（content/_legacy）
異形殺戮之牙	異形	godie-usyl	已下架（content/_legacy）
瘋狂假面變態正義	瘋狂假面	godie-nbst	已下架（content/_legacy）
胖虎地獄歌神	小叮噹（哆啦A夢）	godie-nman	已下架（content/_legacy）
貞子七夜怪談	七夜怪談	godie-e00t	已下架（content/_legacy）
阿強一號破銅爛鐵	GGD 原始地圖	godie-h021	已下架（content/_legacy）

一樣也列出來 更新在 md  我記得已經都有對應模型動作跟語音了

## 01:40 · 0788ead7

請 commit + push 我要讓別的工作流幫忙找到缺的素材
