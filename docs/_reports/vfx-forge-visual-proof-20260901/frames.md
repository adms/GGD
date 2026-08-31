# VFX Forge 八招視覺驗收 — 2026-09-01

- 驗證時間：2026-09-01 02:13（Asia/Taipei）
- 分支：`feat/vfx-forge-codex`（未推送）
- 模式：真 Sim trace → 出貨 `VfxSystem`、真 `CameraRig`、雙方 3D actor、1/60 秒 frame-step
- 驗收目標：`thorne`（避免把其他 imported hero 的缺貼圖誤判成技能缺陷）

## 契約與自證

- runtime capability fingerprint：`9d43feef`
- editor coverage fingerprint：`bbc5f1c27654`
- coverage：4,853 格；owner-only 39 格
- contentVersion：`cv_38480627d11d`
- framebuffer 雙向校準：一般 7 招 `control 739612`；隔離重載的理想鄉 EX `control 739600`
- focused tests：28/28；coverage freshness：2/2

## 判讀尺度

- `通過`：指定的動作分段、色系與收尾在關鍵影格中都可辨識。
- `部分通過`：機制分段已出現，但造型、角色動作可讀性或基礎資產仍不足，不能當最終美術核准。
- 本輪沒有把單元測試、schema parse 或「有發事件」當成視覺通過。

## 逐招結果

| # | 技能與原作參考 | 真實班表／檢查點 | 視覺結果 | Verdict |
|---:|---|---|---|---|
| 1 | 莉娜 04-03 龍破斬 · [YouTube](https://www.youtube.com/watch?v=cFz1d48fvN8) | 1.000s 吟唱完成；1.15／1.75s 投射移動；2.22s 爆炸 | 紅橘投射物確實向前移動，抵達後換成三向爆裂；爆炸仍偏幾何，缺火焰體積與餘燼 | **部分通過** |
| 2 | 莉娜 04-04 神滅斬 · [YouTube](https://www.youtube.com/watch?v=cFz1d48fvN8) | 1.000s 吟唱完成；1.12–1.58s dash／斬擊 | 施法者本體隱藏、替身高速到目標、紫色 dash 軌與交叉斬都有出現；角色位移的剪影仍不夠醒目 | **部分通過** |
| 3 | 克勞德 01-04 超究武神霸斬 · [YouTube](https://www.youtube.com/watch?v=9X6LCjFgAiA) | 1.0–4.5s 七段；2.10／2.55s 連斬；4.55s 收尾 | 每刀有黃藍交叉斬與雙方動畫脈衝，第七段出現黃色直立光柱與藍色收尾層 | **通過** |
| 4 | 小呆 08-04 阿邦快速劍X · [YouTube @157s](https://youtu.be/QE9RrCjt428?t=157) | 0.833s 吟唱完成；0.94s A；1.38／1.62s B | A 為藍色衝擊波；B 隱藏本體後由角色替身 dash，接黃色軌跡與橘色斬擊 | **通過** |
| 5 | 小呆 08-03 龍鬥氣砲咒文 | 0.833s 吟唱完成；0.94–1.72s | 寬藍色橫向砲有白色核心、起點光球及持續段，與傷害線方向一致 | **通過** |
| 6 | 悟空 09-04 龜派氣功 · [YouTube @68s](https://youtu.be/XkFlhrLaHeA?t=68) | 0.833s 吟唱完成；0.94–1.76s | 橘色寬砲、白色核心與起點光球都可辨識；沒有誤用向天光柱 | **通過** |
| 7 | Saber 20-002 理想鄉 EX · [YouTube 83–100s](https://youtu.be/KwAlIYfmV48?t=83) | 0.133–0.933s 反彈＋七段；0.18／0.54／0.98／1.42s | 防禦十字光、黃藍七斬與最後聖光砲皆出現；但 `imported.herosaber` 在 0s 就有棋盤／錯誤 primitive，角色動畫無法乾淨核准 | **部分通過（資產阻塞）** |
| 8 | Rider 48-04 騎英之手綱 · [YouTube @446s](https://youtu.be/KwAlIYfmV48?t=446) | 1.000s 吟唱完成；1.08–1.78s | Rider 替身沿 toTarget 高速移動，並有藍色寬砲與白色核心；dash 身體在砲光中仍稍難讀 | **部分通過** |

## 正式影格

### 1. 龍破斬

![龍破斬投射起點](proof_01_hjai_e_s1p15.png)
![龍破斬投射中段](proof_01_hjai_e_s1p75.png)
![龍破斬抵達爆炸](proof_01_hjai_e_s2p22.png)

### 2. 神滅斬

![神滅斬 dash 起點](proof_02_hjai_r_s1p12.png)
![神滅斬交叉斬](proof_02_hjai_r_s1p34.png)
![神滅斬收尾](proof_02_hjai_r_s1p58.png)

### 3. 超究武神霸斬

![超究武神霸斬黃藍連斬](proof_03_hart_r_s2p1.png)
![超究武神霸斬連段](proof_03_hart_r_s2p55.png)
![超究武神霸斬直立光束砲](proof_03_hart_r_s4p55.png)

### 4. 阿邦快速劍X

![阿邦快速劍 A 衝擊波](proof_04_nbbc_r_s0p94.png)
![阿邦快速劍 B dash](proof_04_nbbc_r_s1p38.png)
![阿邦快速劍 B 斬擊](proof_04_nbbc_r_s1p62.png)

### 5–6. 經典橫向氣功砲

![龍鬥氣砲咒文](proof_05_nbbc_e_s1p32.png)
![龜派氣功](proof_06_ogrh_r_s1p34.png)

### 7. 理想鄉 EX

![理想鄉基礎資產 0 秒](proof_07_e002_ex_s0.png)
![理想鄉反擊](proof_07_e002_ex_s0p18.png)
![理想鄉七斬](proof_07_e002_ex_s0p54.png)
![理想鄉收尾砲](proof_07_e002_ex_s1p42.png)

### 8. 騎英之手綱

![騎英之手綱起步](proof_08_hvsh_r_s1p08.png)
![騎英之手綱 dash](proof_08_hvsh_r_s1p38.png)
![騎英之手綱藍色橫向砲](proof_08_hvsh_r_s1p78.png)

## 後續票

1. 資產 QA：`imported.herosaber` 的 missing texture／錯誤 primitive；同族 imported hero 應批次掃描。
2. 龍破斬：補球形火焰膨脹、碎片與餘燼，替代目前三向幾何爆裂。
3. dash 技：加速度曲線、殘影密度與角色對比度需再調，避免被寬砲核心吃掉。
4. 視覺 proof runner 應在每次 seek 清除 DOM screen cue，避免前一個時間點的 wall-clock 動畫污染下一張決定性截圖。
