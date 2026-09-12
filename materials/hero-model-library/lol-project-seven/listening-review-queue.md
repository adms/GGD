# LOL 七角色原生事件聽審佇列

固定來源為 ja_JP release 的七名指定英雄 base／skin0。原生事件圖與 754 個 WAV 的本機位元組、大小及 SHA-256 已重新驗證；逐段說話者、實際語言、台詞、增益與 GGD 技能語義仍需聽審。

事件類別與 Q／W／E／R 只作候選提示。`Joke` 保留為 `emote`，`Death` 保留為 `death`；產生器不會把事件改標成受傷，也不會把缺少事件證據的片段硬塞進技能槽。

- 不同 WAV：754 檔
- 總長：2636.88 秒
- 本機位元組：725,636,616 bytes
- 待聽審：754 檔
- 已核准進 runtime：0 檔

| 角色 | WAV | Q | W | E | R | 原生事件未提供的技能候選 | 待聽審 |
|---|---:|---:|---:|---:|---:|---|---:|
| Karthus | 135 | 0 | 7 | 7 | 9 | Q | 135 |
| LeeSin | 151 | 8 | 8 | 8 | 5 | 無 | 151 |
| Lux | 104 | 7 | 6 | 6 | 6 | 無 | 104 |
| MissFortune | 35 | 4 | 4 | 0 | 3 | E | 35 |
| Warwick | 159 | 3 | 7 | 4 | 11 | 無 | 159 |
| Xerath | 79 | 4 | 4 | 4 | 4 | 無 | 79 |
| Yasuo | 91 | 8 | 3 | 4 | 3 | 無 | 91 |

逐檔機器入口：`listening-review-queue.json`。人工決定只寫入 `listening-review-decisions.json`，再重跑產生器；不要直接修改生成的佇列。每筆保留絕對 WAV 路徑、SHA-256、WEM ID、原生事件名稱、候選類別與候選技能槽。

重建：

```sh
python3 materials/hero-model-library/lol-project-seven/tools/build_listening_review_queue.py \
  --asset-workspace "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"
```

產生器只讀既有音訊，不轉碼、不覆寫來源，也不啟用 `content/config/champion-voices.json`。
