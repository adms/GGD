# 31｜SUN樂：社群上傳內容與套用設定

英雄檔：`projects/31.hero-project.json`  
工作流資料：`recipes/31.upload-recipe.json`

作品：《香格里拉・開拓異境》  
角色實體：サンラク／陽務樂郎。  
定位：精準回避、反擊、短期強化。  
來源錨點：作者公開小說中的實際招式。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"大","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：鳥頭面具待製、青色滑步線、反擊橙色火花、螺旋短刃切線。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

## PASSIVE｜〔糞作獵人的讀招〕

**目標上傳描述**：成功以位移避開有效攻擊後，獲得一層讀招，上限三層。單純空按移動不增加。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需真正閃避事件的三層讀招，空按不增加。

**特效**：`fx.prim.wind.pulse-sm`，tint [64,181,230]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

## Q｜Spiral Edge

**目標上傳描述**：短劍螺旋刺擊；對剛被自己反擊的目標有有限追加效果。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：需螺旋刃動畫與反擊後目標追加條件。

**特效**：`fx.prim.wind.slash`，tint [64,181,230]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

## W｜Slide Move

**目標上傳描述**：滑步位移，提供很短的精準迴避窗口。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 40,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：模板低跳不是精準迴避；需傷害來臨時間窗口。

**特效**：`fx.prim.wind.arc`，tint [64,181,230]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

## E｜Repel Counter

**目標上傳描述**：短窗口迎擊攻擊，成功時擊退攻擊者，並提供一次 Q 接續機會。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-31-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-31-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：護盾不是 Repel Counter；需格擋成功、擊退與 Q 窗口。

**特效**：`fx.prim.wind.pulse`，tint [64,181,230]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

## R｜Accel

**目標上傳描述**：短期提高移速與近戰輸出能力，保留原本技能冷卻。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速、as +20%。

**微調／補強要求**：Accel 基礎移速／攻速增益；持續 3 秒且保留冷卻。

**特效**：`fx.prim.wind.pulse`，tint [64,181,230]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

## EX｜〔攻略完成〕

**目標上傳描述**：消耗三層讀招，對近期交鋒目標進行一次有方向的高傷害短劍終結。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：需消耗三層讀招並限定近期交鋒目標。

**特效**：`fx.prim.wind.slash`，tint [64,181,230]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

## 整體審查

精準迴避、格擋、反擊及擊退必須是不同事件；測試未受攻擊空按、範圍技、多段技與反擊窗口結束瞬間。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

## 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M07，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。

