# LOL 七角色原生事件聽審佇列

固定來源為 ja_JP release 的七名指定英雄 base／skin0。原生事件圖與 754 個 WAV 的本機位元組、大小及 SHA-256 已重新驗證；戰鬥候選已逐項核准 311 檔，其餘 443 檔仍未核准。未製作逐字稿。

事件類別與 Q／W／E／R 只作候選提示。`Joke` 保留為 `emote`，`Death` 保留為 `death`；產生器不會把事件改標成受傷，也不會把缺少事件證據的片段硬塞進技能槽。

- 不同 WAV：754 檔
- 總長：2636.88 秒
- 本機位元組：725,636,616 bytes
- 待聽審／未核准：443 檔
- 已核准進 runtime：311 檔

- 可由單一原生事件類別建立用途候選：566 檔
- 戰鬥用途候選（Q/W/E/R、攻擊、死亡）：311 檔

| 角色 | WAV | 戰鬥候選 | Q | W | E | R | 原生事件未提供的技能候選 | 待聽審 |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| Karthus | 135 | 52 | 0 | 7 | 7 | 9 | Q | 83 |
| LeeSin | 151 | 64 | 8 | 8 | 8 | 5 | 無 | 87 |
| Lux | 104 | 48 | 7 | 6 | 6 | 6 | 無 | 56 |
| MissFortune | 35 | 21 | 4 | 4 | 0 | 3 | E | 14 |
| Warwick | 159 | 59 | 3 | 7 | 4 | 11 | 無 | 100 |
| Xerath | 79 | 26 | 4 | 4 | 4 | 4 | 無 | 53 |
| Yasuo | 91 | 41 | 8 | 3 | 4 | 3 | 無 | 50 |

逐檔機器入口：`listening-review-queue.json`；可播放入口：`listening-review.html`。人工決定只寫入 `listening-review-decisions.json`，再重跑產生器；不要直接修改生成的佇列。每筆保留絕對 WAV 路徑、SHA-256、WEM ID、原生事件名稱、候選類別與候選技能槽。

重建：

```sh
python3 materials/hero-model-library/lol-project-seven/tools/build_listening_review_queue.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"
```

啟動本機聽審頁：

```sh
python3 materials/hero-model-library/lol-project-seven/tools/serve_listening_review.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"
```

瀏覽器開啟 `http://127.0.0.1:8765/`。伺服器只監聽 loopback，只供應佇列內 WAV；每次核准都驗證目標等於原生事件候選。審查頁本身只寫決策，runtime 註冊需另跑下列套用工具。

此佇列產生器只讀既有音訊，不轉碼、不覆寫來源；核准後由 `tools/apply_approved_battle_runtime.py` 產生 runtime MP3、來源註冊與驗證收據。
