# J-Stars owner archive 名單與優先順序

此工作流把 `J-Stars Victory VS+` 的 39 名可操作角色與 13 名支援角色，和現有 GGD 英雄、已驗證的原生 ID 樣本及素材策略合併成單一計畫。它只在有本機證據時填入原生角色 ID，不以網路名單推測檔案對應。

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-v1/build_plan.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-v1/build_plan.py --check
```

預設 owner archive 入口：

```text
../GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917/J-Stars Victory Vs+.7z
```

名單依據：

- [VIZ](https://www.viz.com/blog/posts/j-stars-victory-vs)：39 名可操作角色、13 名支援角色。
- [PlayStation](https://blog.playstation.com/archive/2015/06/26/anime-brawler-j-stars-victory-vs-hits-ps4-ps3-ps-vita-today)：`J-Stars Victory VS+` 發售與平台來源。
- [52 名完整角色表](https://en.wikipedia.org/wiki/J-Stars_Victory_VS)：逐角色交叉核對；檔案 ID、素材類型與可用性仍必須由 archive inventory 證明。

產出：

- `materials/hero-model-library/source-inventories/jstars-owner-archive-v1/plan.json`
- `materials/hero-model-library/source-inventories/jstars-owner-archive-v1/J-STARS全角色素材更新計畫.md`
- `materials/hero-model-library/近四日新增模型動作特效清單.md` 的 `generated:jstars-owner-archive-v1` 區段
