# JUMP FORCE 原生 `chrNNNN` 身份與素材候選索引

> 本頁由 `build_jumpforce_identity_map.py` 產生。身份對應只接受中央來源清單中的明名路徑或固定 PAK authority；編號相鄰與檔名猜測不算身份證據。

224 個 token 中，高信度角色家族身份 63 個，仍未解 161 個；比前一版 34 個多解出 29 個。

高信度只表示 `JForce_<角色名>` 與同一路徑 `chrNNNN_ActVoice/ActSE` 的來源交叉一致。它不核准服裝／形態、不證明每個 EventVoice 的說話者，也不建立技能、模型或音訊 runtime 綁定。

## 高信度身份

| 原生 ID | 角色來源標籤 | 模型 | 貼圖 | 骨架 | 動作 | VFX | 音訊 | 範圍 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `chr0000` | Goku | 13 | 28 | 1 | 0 | 91 | 547 | character-family; exact costume/form remains unresolved |
| `chr0010` | Vegeta | 17 | 32 | 1 | 0 | 87 | 267 | character-family; exact costume/form remains unresolved |
| `chr0020` | Trunks | 20 | 33 | 1 | 0 | 49 | 329 | character-family; exact costume/form remains unresolved |
| `chr0030` | Frieza | 15 | 22 | 1 | 0 | 64 | 400 | character-family; exact costume/form remains unresolved |
| `chr0040` | Piccolo | 15 | 31 | 1 | 0 | 44 | 294 | character-family; exact costume/form remains unresolved |
| `chr0050` | Cell | 9 | 25 | 1 | 0 | 68 | 240 | character-family; exact costume/form remains unresolved |
| `chr0060` | Luffy | 26 | 34 | 1 | 0 | 26 | 503 | character-family; exact costume/form remains unresolved |
| `chr0070` | Zoro | 19 | 41 | 1 | 0 | 37 | 346 | character-family; exact costume/form remains unresolved |
| `chr0080` | Sanji | 17 | 34 | 1 | 0 | 17 | 407 | character-family; exact costume/form remains unresolved |
| `chr0090` | Blackbeard | 15 | 33 | 1 | 0 | 33 | 249 | character-family; exact costume/form remains unresolved |
| `chr0100` | Hancock | 13 | 25 | 1 | 0 | 17 | 293 | character-family; exact costume/form remains unresolved |
| `chr0110` | Sabo | 11 | 40 | 1 | 0 | 27 | 239 | character-family; exact costume/form remains unresolved |
| `chr0120` | Naruto | 15 | 28 | 1 | 0 | 53 | 469 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr0130` | Sasuke | 16 | 41 | 1 | 0 | 28 | 355 | character-family; exact costume/form remains unresolved |
| `chr0140` | Kaguya | 18 | 27 | 1 | 0 | 39 | 229 | character-family; exact costume/form remains unresolved |
| `chr0150` | Gaara | 21 | 37 | 1 | 0 | 20 | 274 | character-family; exact costume/form remains unresolved |
| `chr0160` | Kakashi | 33 | 39 | 1 | 0 | 20 | 237 | character-family; exact costume/form remains unresolved |
| `chr0170` | Boruto | 19 | 34 | 1 | 0 | 21 | 218 | character-family; exact costume/form remains unresolved |
| `chr0180` | Seiya | 17 | 31 | 1 | 0 | 87 | 222 | character-family; exact costume/form remains unresolved |
| `chr0190` | Shiryū | 17 | 38 | 1 | 0 | 80 | 219 | character-family; exact costume/form remains unresolved |
| `chr0220` | Ryo Saeba | 54 | 39 | 1 | 0 | 16 | 315 | character-family; exact costume/form remains unresolved |
| `chr0230` | Kenshiro | 29 | 23 | 1 | 0 | 49 | 220 | character-family; exact costume/form remains unresolved |
| `chr0240` | Ichigo | 23 | 50 | 1 | 0 | 40 | 262 | character-family; exact costume/form remains unresolved |
| `chr0250` | Renji | 21 | 36 | 1 | 0 | 24 | 281 | character-family; exact costume/form remains unresolved |
| `chr0260` | Aizen | 11 | 25 | 1 | 0 | 17 | 254 | character-family; exact costume/form remains unresolved |
| `chr0270` | Rukia | 30 | 35 | 1 | 0 | 29 | 234 | character-family; exact costume/form remains unresolved |
| `chr0300` | Gon | 10 | 30 | 1 | 0 | 22 | 255 | character-family; exact costume/form remains unresolved |
| `chr0310` | Killua | 35 | 26 | 1 | 0 | 15 | 245 | character-family; exact costume/form remains unresolved |
| `chr0320` | Kurapika | 31 | 31 | 1 | 0 | 14 | 272 | character-family; exact costume/form remains unresolved |
| `chr0330` | Hisoka | 26 | 26 | 1 | 0 | 16 | 235 | character-family; exact costume/form remains unresolved |
| `chr0340` | Jotaro | 7 | 29 | 1 | 0 | 12 | 236 | character-family; exact costume/form remains unresolved |
| `chr0350` | DIO | 14 | 30 | 1 | 0 | 12 | 246 | character-family; exact costume/form remains unresolved |
| `chr0360` | Yusuke | 11 | 27 | 1 | 0 | 7 | 242 | character-family; exact costume/form remains unresolved |
| `chr0370` | Toguro | 10 | 28 | 1 | 0 | 15 | 226 | character-family; exact costume/form remains unresolved |
| `chr0380` | Kenshin | 18 | 34 | 1 | 0 | 29 | 221 | character-family; exact costume/form remains unresolved |
| `chr0390` | Shishio | 13 | 34 | 1 | 0 | 12 | 224 | character-family; exact costume/form remains unresolved |
| `chr0400` | Yugi | 9 | 28 | 1 | 0 | 36 | 236 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr0410` | Deku | 11 | 23 | 1 | 0 | 43 | 232 | character-family; exact costume/form remains unresolved |
| `chr0420` | Asta | 17 | 44 | 1 | 0 | 48 | 237 | character-family; exact costume/form remains unresolved |
| `chr0430` | Dai | 21 | 36 | 1 | 0 | 6 | 264 | character-family; exact costume/form remains unresolved |
| `chr0450` | Kane | 11 | 35 | 1 | 0 | 13 | 399 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr0460` | Galena | 9 | 32 | 1 | 0 | 15 | 344 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr0470` | Prometheus | 6 | 15 | 1 | 0 | 6 | 368 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr0480` | Kaiba | 11 | 32 | 1 | 0 | 25 | 256 | character-family; exact costume/form remains unresolved |
| `chr1000` | Hitsugaya | 19 | 40 | 1 | 0 | 31 | 435 | character-family; exact costume/form remains unresolved |
| `chr1010` | Biscuit | 12 | 24 | 1 | 0 | 38 | 224 | character-family; exact costume/form remains unresolved |
| `chr1020` | All Might | 11 | 29 | 1 | 0 | 25 | 235 | character-family; exact costume/form remains unresolved |
| `chr1030` | Majin Buu | 24 | 29 | 1 | 0 | 37 | 227 | character-family; exact costume/form remains unresolved |
| `chr1040` | Bakugo | 8 | 26 | 1 | 0 | 20 | 227 | character-family; exact costume/form remains unresolved |
| `chr1050` | Madara | 15 | 43 | 1 | 0 | 20 | 234 | character-family; exact costume/form remains unresolved |
| `chr1060` | Grimmjow | 11 | 30 | 1 | 0 | 13 | 238 | character-family; exact costume/form remains unresolved |
| `chr1070` | Law | 15 | 44 | 1 | 0 | 12 | 239 | character-family; exact costume/form remains unresolved |
| `chr1080` | Kane | 11 | 34 | 1 | 0 | 13 | 213 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr1090` | Galena | 9 | 32 | 1 | 0 | 15 | 225 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr1100` | Prometheus | 6 | 15 | 1 | 0 | 6 | 233 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr1140` | Todoroki | 10 | 24 | 1 | 0 | 15 | 244 | character-family; exact costume/form remains unresolved |
| `chr1150` | Meruem | 12 | 28 | 1 | 0 | 16 | 239 | character-family; exact costume/form remains unresolved |
| `chr1160` | Hiei | 29 | 28 | 1 | 0 | 25 | 242 | character-family; exact costume/form remains unresolved |
| `chr1170` | Yoruichi | 16 | 32 | 1 | 0 | 23 | 235 | character-family; exact costume/form remains unresolved |
| `chr1180` | Giorno | 12 | 30 | 1 | 0 | 12 | 236 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr2121` | Naruto | 3 | 12 | 1 | 0 | 0 | 5 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr2401` | Yugi | 6 | 16 | 1 | 0 | 0 | 12 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |
| `chr3180` | Giorno | 4 | 12 | 1 | 0 | 0 | 9 | character-family-only; multiple native tokens share this source label, exact form/role unresolved |

## 未解 token

未解 token 與逐類候選、路徑抽樣及原因完整保存在 `identity-map.json → tokens`。這些列的 `characterName=null`，不會因素材量多而自動升級身份。

## 階段界線

本索引中的素材數是目前 patch-order 路徑裡的 `.uasset` 候選數；現在一律為 `path-indexed-not-extracted` 或 `not-identified-in-current-path-index`。轉換、驗收、註冊、後台可切換與正式部署均未由本工作流完成。
