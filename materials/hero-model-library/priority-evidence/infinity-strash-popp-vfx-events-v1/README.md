# 波普原作 VFX 與事件引用查核

> 這是原始套件與候選音訊的查核收據。`runtimeSelectable=false`，沒有自動綁定技能。

- VFX 引用：17；直接套件對已取得：17；GGD 轉換完成：0。
- VFX 第一層依賴：229 次引用／138 個唯一 package。
- VFX 非腳本 package 遞迴閉包：發現 309；取得 309；缺失 0；閉包完整：true。
- VFX 重建支援素材：309 個 package 全數嘗試；203 個有輸出，匯出 789 檔／122299241 bytes（{'.hdr': 12, '.tga': 777}）。
- VFX 支援素材目錄：789/789 可完整解碼；依 SHA-256 分為 87 個獨立位元組素材，702 個重複 occurrence 的 package／來源關係仍完整保留。
- VFX 閉包 S3 legacy 歸檔：s3://ggd-390630837668-ap-east-2-an/legacy/game-intakes/infinity-strash-popp-vfx-dependency-closure-v1/fff8096491ae81106ae13de3a5ec237cdfd9b838e4df629809fbd697ccd83de5.tar.gz；完整下載讀回與逐成員 SHA-256：通過。
- VFX 重建支援素材 S3 legacy 歸檔：s3://ggd-390630837668-ap-east-2-an/legacy/conversions/infinity-strash-popp-vfx-dependency-export-v1/07e30bbeb2b3f12da5f4a1ecb54b7a49a72f2432c9c5224fb801537270556fcb.tar.gz；完整下載讀回與逐成員 SHA-256：通過。
- 原先失敗的 StaticMesh：33/33 已恢復為 33 個 GLB，Khronos 0 error / 0 warning；尚未轉換 0。
- StaticMesh 恢復成果 S3 legacy 歸檔：s3://ggd-390630837668-ap-east-2-an/legacy/conversions/infinity-strash-popp-vfx-staticmesh-recovery-v1/d6ff7156fea1d831abcf85e58ec367bc6d7c98a599e838dd2da1c95bb79d4141.tar.gz；完整下載讀回與逐成員 SHA-256：通過。
- 重建候選配方：14 個 Niagara system、3 個支援根、14 份靜態候選配方；87/87 unique image 與 33/33 mesh 已連回來源。
- 事件引用：41；原始套件對已取得：41。
- 可播放逐項審查候選：36；使用者已核准：0。
- 41 筆 PN020 直接事件以外另有 19 筆相依引用；其中 10 筆通用魔法音效事件尚未抽出與對媒體。
- 本輪 Windows 分享：not-used-by-this-build-local-byte-verified-pak-mirror-is-the-input。本機 PAK 鏡像與解包實檔仍可用。

## VFX

| 引用 | 種類 | 直接套件 | 相依數 | 轉換狀態 |
|---|---|---:|---:|---|
| `/Game/Strash/VFX/NPS/Common/Spel/Hyadaruko/NPS_Hyadaruko_Core` | niagara-system | 2 | 19 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Hyadaruko/NPS_Hyadaruko_Hit` | niagara-system | 2 | 26 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Io/NPS_Io_Bullet_00` | niagara-system | 2 | 15 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Io/NPS_Io_Explosive_00` | niagara-system | 2 | 19 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Iora/NPS_Iora_Explosive_00` | niagara-system | 2 | 32 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Mera/NPS_Mera_FireTrail_00` | niagara-system | 2 | 2 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_FireTrail_00` | niagara-system | 2 | 2 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_Landing_2` | niagara-system | 2 | 16 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_Muzzle` | niagara-system | 2 | 9 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Merami/NPS_Merami_core` | niagara-system | 2 | 13 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Common/Spel/Raidein/NPS_Raidein_Charge_Core` | niagara-system | 2 | 4 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Enemy_Boss/EN650/ionazun/NPS_Ionazun_Explosive_00` | niagara-system | 2 | 32 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Player/PN030/Special01/NPS_PN030_Special01_Landing` | niagara-system | 2 | 26 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/NPS/Player/PN030/Special01/NPS_PN030_Special01_Muzzle` | niagara-system | 2 | 14 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/Post/Curve/CV_Black00` | curve-float-support-component | 2 | 0 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/Post/Curve/CV_Black01` | curve-float-support-component | 2 | 0 | dependency-closure-acquired-conversion-blocked |
| `/Game/Strash/VFX/Post/MPC_VFXPost` | material-parameter-collection-support-component | 2 | 0 | dependency-closure-acquired-conversion-blocked |

## 事件與音訊

| 引用 | 種類 | 候選數 | 狀態 |
|---|---|---:|---|
| `/Game/Developers/_old_Cinematics/Player/PN020/LS_PN020_00_B_Skl01/LS_PN020_00_B_Skl01_Master` | level-sequence | 0 | raw-reference-acquired-event-timing-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Atk01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Atk02` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Atk03` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Charge` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Charge2` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Dodge01_B` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Dodge01_F` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Entry01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_ExtraAtk01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Guard01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Guard01_Blink` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_ItemUse` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Kugutsu` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Mistake01_Idle_01_Lp` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Paralyze` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Skl01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_SpellTest_Begirama` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_SpellTest_Frizz` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_SpellTest_Frizzle` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_SpellTest_Kafrizzle` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Spl01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Spl10` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Victory01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_B_Victory01_Idle_01_Lp` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_00_EX_ExitQuest01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AM_PN020_1003_01` | anim-montage | 0 | raw-montage-acquired-montage-sections-not-decoded |
| `/Game/Strash/Chara/Player/PN020/Animations/AS_PN020_00_B_Spl02` | anim-sequence | 0 | raw-sequence-acquired-animation-and-notify-timing-not-exported-in-this-lane |
| `/Game/Strash/Chara/Player/PN020/SK_PN020_Skeleton` | skeleton | 0 | raw-reference-acquired-event-timing-not-decoded |
| `/Game/Strash/Cinematics/Player/PN020/LS_PN020_00_B_Special01/LS_PN020_00_B_Special01_Master` | level-sequence | 0 | raw-reference-acquired-event-timing-not-decoded |
| `/Game/Strash/Cinematics/Player/PN020/LS_PN020_00_B_Special02/LS_PN020_00_B_Special02_Master` | level-sequence | 0 | raw-reference-acquired-event-timing-not-decoded |
| `/Game/Strash/Cinematics/Player/PN020/LS_PN020_00_B_Special03_01/LS_PN020_00_B_Special03_01Master` | level-sequence | 0 | raw-reference-acquired-event-timing-not-decoded |
| `/Game/WwiseAudio/Events/PL_Work_Unit/PN020_EFX/Play_SE_PN020_Charge` | wwise-play-event | 2 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/PL_Work_Unit/PN020_EFX/Play_SE_PN020_Charge2` | wwise-play-event | 2 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/PL_Work_Unit/PN020_EFX/Stop_SE_PN020_Charge` | wwise-stop-event | 0 | control-event-acquired-no-audio-payload-expected |
| `/Game/WwiseAudio/Events/PL_Work_Unit/PN020_Motion/Play_SE_PN020_Foot_Run` | wwise-play-event | 5 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/PL_Work_Unit/PN020_Motion/Play_SE_PN020_Foot_Walk` | wwise-play-event | 3 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/Voice_Work_Unit/VO_PN020/Play_VO_ING_PN020_Skill_BEGIRAMA` | wwise-play-event | 6 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/Voice_Work_Unit/VO_PN020/Play_VO_ING_PN020_Skill_GIRA` | wwise-play-event | 6 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/Voice_Work_Unit/VO_PN020/Play_VO_ING_PN020_Skill_IO` | wwise-play-event | 6 | decoded-audio-candidates-ready-listening-approval-required |
| `/Game/WwiseAudio/Events/Voice_Work_Unit/VO_PN020/Play_VO_ING_PN020_Skill_IORA` | wwise-play-event | 6 | decoded-audio-candidates-ready-listening-approval-required |

## 仍缺

- 17 個根引用精確分為 14 個 NiagaraSystem、2 個 CurveFloat 與 1 個 Material Parameter Collection；貼圖／HDR 與 33 個靜態網格都已連回候選配方。Niagara 程式及原作播放時序仍未轉成 GGD VFX。
- 2 個 CurveFloat 與 1 個 MaterialParameterCollection 是支援元件，不能單獨冒稱完整特效。
- 事件到 GGD 技能時點尚未完成；全部音效／語音候選需逐項聽審後才能綁定。
- 依賴索引另含 10 個通用魔法音效事件；它們不在指定的 41 個 PN020 直接事件內，本批未將名稱當成已取得音檔。
