# SSBU Ultimate 本機完整 fighter／形態清冊

這份清冊把 Worldblender 模型庫、Ultimate14 社群 MOD 及 Windows `NSandNS2` 容器分層計數，不把「容器存在」寫成「已擷取」。

- 先前的 **16** 是 Ultimate14 MOD 內有 NUANMB 路徑的 fighter ID 數，不是 Ultimate 完整角色數。
- Worldblender 快照有 94 個 `fighter/<id>` 頂層群；排除 `common` 與 `element` 後是 **92 個 fighter／形態 ID**。這是本機來源 ID 數，不是任天堂官方可選 roster 數。
- 89 個 ID 有身體／Trainer avatar Blender 候選，3 個沒有（本快照為三個 Mii 職業）；共 698 個主要配色／形態候選。
- 整庫 28,681 個 LFS 檔／16,148,574,001 bytes：1,793 `.blend`、26,885 PNG。本次全數點名與大小核對：缺檔 0、大小不符 0。
- Ultimate14 有 16 個動作 fighter／435 條 alias／175 個唯一 Transform payload；現有 4 個已驗收獨立動作元件，另有 3 個 fighter effect 檔和 56 個音訊 bank alias。7 個唯一 bank 已解碼為 19 個 WAV，但語言、說話者與事件均未審。
- `NSandNS2` 只有 3 筆 Windows metadata，payload 實讀 0 bytes，未解包。

| native ID | 身體／avatar | 貼圖 | 骨架證據 | Ultimate14 身體動作 | VFX | 音訊 bank | 已解碼 WAV | 已驗收靜態元件 | 已驗收動作元件 | 後台可選 |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| `bayonetta` | 8 | 378 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `brave` | 8 | 277 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `buddy` | 8 | 322 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `captain` | 8 | 154 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `chrom` | 8 | 195 | validated-in-standardized-component | 9 | 0 | 0 | 0 | 1 | 1 | 0 |
| `cloud` | 8 | 279 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `common` | 0 | 1 | no-body-candidate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `daisy` | 8 | 307 | validated-in-standardized-component | 13 | 0 | 0 | 0 | 1 | 0 | 0 |
| `dedede` | 8 | 286 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `demon` | 8 | 254 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `diddy` | 8 | 301 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `dolly` | 8 | 408 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `donkey` | 8 | 151 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `duckhunt` | 8 | 271 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `edge` | 8 | 298 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `eflame` | 8 | 339 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `element` | 0 | 26 | no-body-candidate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `elight` | 8 | 315 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `falco` | 8 | 245 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `fox` | 8 | 269 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `gamewatch` | 16 | 496 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ganon` | 8 | 195 | validated-in-standardized-component | 10 | 0 | 0 | 0 | 1 | 0 | 0 |
| `gaogaen` | 8 | 201 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `gekkouga` | 8 | 255 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ike` | 8 | 300 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `inkling` | 8 | 456 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `jack` | 8 | 355 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `kamui` | 8 | 408 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ken` | 8 | 168 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `kirby` | 8 | 2388 | validated-in-standardized-component | 3 | 0 | 0 | 0 | 1 | 0 | 0 |
| `koopa` | 8 | 121 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `koopag` | 1 | 9 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `koopajr` | 1 | 486 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `krool` | 8 | 367 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `link` | 8 | 241 | validated-in-standardized-component | 61 | 0 | 8 | 2 | 1 | 0 | 0 |
| `littlemac` | 8 | 231 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `lucario` | 8 | 103 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `lucas` | 8 | 227 | embedded-in-blend-uninspected | 7 | 0 | 8 | 5 | 0 | 0 | 0 |
| `lucina` | 8 | 243 | validated-in-standardized-component | 41 | 0 | 8 | 4 | 1 | 1 | 0 |
| `luigi` | 8 | 177 | embedded-in-blend-uninspected | 0 | 0 | 8 | 1 | 0 | 0 | 0 |
| `mario` | 8 | 179 | validated-in-standardized-component | 40 | 0 | 0 | 0 | 1 | 1 | 0 |
| `mariod` | 8 | 252 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `marth` | 8 | 266 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `master` | 8 | 353 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `metaknight` | 8 | 232 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `mewtwo` | 8 | 127 | validated-in-standardized-component | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `miifighter` | 0 | 3 | no-body-candidate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `miigunner` | 0 | 19 | no-body-candidate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `miiswordsman` | 0 | 3 | no-body-candidate | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `murabito` | 8 | 688 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `nana` | 4 | 152 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ness` | 8 | 238 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `packun` | 8 | 141 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pacman` | 8 | 183 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `palutena` | 8 | 271 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `peach` | 8 | 523 | validated-in-standardized-component | 1 | 0 | 0 | 0 | 1 | 0 | 0 |
| `pfushigisou` | 8 | 211 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pichu` | 8 | 171 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pickel` | 8 | 287 | validated-in-standardized-component | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `pikachu` | 8 | 189 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pikmin` | 8 | 318 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pit` | 8 | 343 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pitb` | 8 | 404 | embedded-in-blend-uninspected | 14 | 0 | 0 | 0 | 0 | 0 | 0 |
| `plizardon` | 8 | 139 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `popo` | 4 | 167 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ptrainer` | 8 | 143 | validated-in-standardized-component | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `purin` | 8 | 331 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `pzenigame` | 8 | 136 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `reflet` | 8 | 284 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `richter` | 8 | 287 | embedded-in-blend-uninspected | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ridley` | 8 | 84 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `robot` | 8 | 376 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `rockman` | 8 | 325 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `rosetta` | 8 | 284 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `roy` | 8 | 243 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `ryu` | 8 | 171 | validated-in-standardized-component | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `samus` | 8 | 292 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `samusd` | 8 | 192 | embedded-in-blend-uninspected | 60 | 2 | 8 | 2 | 0 | 0 | 0 |
| `sheik` | 8 | 193 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `shizue` | 8 | 466 | embedded-in-blend-uninspected | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| `shulk` | 8 | 262 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `simon` | 8 | 294 | embedded-in-blend-uninspected | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| `snake` | 8 | 262 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `sonic` | 8 | 349 | validated-in-standardized-component | 10 | 0 | 8 | 1 | 1 | 1 | 0 |
| `szerosuit` | 8 | 275 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `tantan` | 8 | 539 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `toonlink` | 8 | 391 | validated-in-standardized-component | 3 | 1 | 8 | 4 | 1 | 0 | 0 |
| `trail` | 8 | 245 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `wario` | 8 | 191 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `wiifit` | 8 | 176 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `wolf` | 8 | 257 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `yoshi` | 8 | 173 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `younglink` | 8 | 240 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `zelda` | 8 | 200 | embedded-in-blend-uninspected | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## NSandNS2 blocker

The Windows share is not mounted in this run. Only metadata was available: payload bytes read 0, header/member inventory 0, title/update/DLC composition unverified, extracted 0 and converted 0.

## 限制

- The 92 count is a local fighter/form ID count and includes non-selectable forms such as koopag; it must not be presented as Nintendo's official selectable roster total.
- The Worldblender repository provides Blender model/texture candidates, not a full original-game motion, VFX or audio dump.
- Ultimate14 is a community MOD patch. Its 16 motion fighters, three fighter effect files and 56 sound-bank aliases do not cover the full roster.
- The 19 decoded WAV files retain source labels only; language, speaker and gameplay event are unreviewed and runtime binding remains zero.
- Uninspected Blender files are model candidates only; their embedded skeleton/material quality and GGD budget status remain pending until converted and validated.
- No new hero ID, backend dropdown registration or deployment is created by this inventory.
