# 波普原作 VFX：GGD 重建候選 v1

本批把可確認身分的 12 個 Niagara 根，各轉成一份使用原作來源貼圖的 `vfx@1` 候選。它們會進既有 `asset-review.html` 逐項審查；目前沒有綁到技能。

- 14 個 Niagara 根中，12 個建立 GGD 候選；2 個 PN030 專屬根因角色邊界排除，沒有誤掛給 PN020。
- 每份候選都使用重新驗證 SHA 的來源 TGA，轉成瀏覽器可讀 PNG；尺寸上限直接讀正式 `HERO_TEXTURE_EDGE.limit`（本次 256px）。
- Niagara 時序與 mesh layer 尚未還原，因此這批不能稱為原作效果完整重現。
- 音效與語音仍由 36 項聽審佇列控制，本工具不建立任何音訊綁定。
- 正式站部署：未驗證。

## 重建

```sh
bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build_runtime_candidates.py
bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build_runtime_candidates.py --check
```

## 候選

| 原生根 | GGD VFX ID | 類型 | 狀態 |
|---|---|---|---|
| `/Game/Strash/VFX/NPS/Common/Spel/Hyadaruko/NPS_Hyadaruko_Core` | `fx.strash.popp.nps-hyadaruko-core.candidate` | ice / core | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Hyadaruko/NPS_Hyadaruko_Hit` | `fx.strash.popp.nps-hyadaruko-hit.candidate` | ice / hit | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Io/NPS_Io_Bullet_00` | `fx.strash.popp.nps-io-bullet-00.candidate` | explosion / projectile | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Io/NPS_Io_Explosive_00` | `fx.strash.popp.nps-io-explosive-00.candidate` | explosion / impact | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Iora/NPS_Iora_Explosive_00` | `fx.strash.popp.nps-iora-explosive-00.candidate` | explosion / impact | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Mera/NPS_Mera_FireTrail_00` | `fx.strash.popp.nps-mera-firetrail-00.candidate` | fire / firetrail | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_FireTrail_00` | `fx.strash.popp.nps-merami-firetrail-00.candidate` | fire / firetrail | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_Landing_2` | `fx.strash.popp.nps-merami-landing-2.candidate` | fire / landing | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_Muzzle` | `fx.strash.popp.nps-merami-muzzle.candidate` | fire / muzzle | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_core` | `fx.strash.popp.nps-merami-core.candidate` | fire / core | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Common/Spel/Raidein/NPS_Raidein_Charge_Core` | `fx.strash.popp.nps-raidein-charge-core.candidate` | lightning / charge | 已轉換候選、待視覺審查、未綁定 |
| `/Game/Strash/VFX/NPS/Enemy_Boss/EN650/ionazun/NPS_Ionazun_Explosive_00` | `fx.strash.popp.nps-ionazun-explosive-00.candidate` | explosion / impact | 已轉換候選、待視覺審查、未綁定 |

## 身分邊界排除

- `/Game/Strash/VFX/NPS/Player/PN030/Special01/NPS_PN030_Special01_Landing`：identity-boundary: PN030 character-special roots are not attributed to PN020 Popp
- `/Game/Strash/VFX/NPS/Player/PN030/Special01/NPS_PN030_Special01_Muzzle`：identity-boundary: PN030 character-special roots are not attributed to PN020 Popp
