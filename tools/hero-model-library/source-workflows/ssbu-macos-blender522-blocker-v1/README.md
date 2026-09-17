# SSBU Samus macOS Blender 5.2.1 阻塞收據

這是可重跑的工具失敗收據，不是轉換器或模型候選。它固定 Worldblender 的 Samus c00 原檔、共享轉換器、Blender 版本與崩潰檔雜湊；只有在背景模式沒有輸出 `body.glb` 且崩潰檔明示 Metal/GPU 初始化失敗時，才會記錄 `blocked-tool-init-crash`。

```sh
python3 tools/hero-model-library/source-workflows/ssbu-macos-blender522-blocker-v1/record_blocker.py \
  --workspace '/absolute/path/to/ABxVFX_EDIT' \
  --blender /Applications/Blender.app/Contents/MacOS/Blender \
  --crash-report /absolute/path/to/blender.crash.txt --write
python3 tools/hero-model-library/source-workflows/ssbu-macos-blender522-blocker-v1/record_blocker.py \
  --workspace '/absolute/path/to/ABxVFX_EDIT' --check
```

成功的替代 Blender 執行環境必須改走一般 Worldblender c00 轉換、兩次位元組一致重建、Khronos／GGD 預算與三視圖審查流程，不能把這份收據改稱已轉換或可切換。
