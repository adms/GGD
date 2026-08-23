# 聖杯願望三選一 —— 全部 60 張（完整 JSON）

> ⛔ **這份文件是產生的。** 由 `pnpm docs:readme` 從 `content/augments/grail-*.json`
> 直接讀出來重新排版，所以它與遊戲裡跑的那一份**不可能不一樣**。要改內容改 JSON
> （或 owner 的 CSV → `tools/grail-wishes/build_wishes.py`），⛔ 不要改這裡。
>
> 設計母規則：[`docs/聖杯願望三選一-設計規則.md`](../聖杯願望三選一-設計規則.md)。
> 每個效果的參數與上下界：[`docs/技能標記機制與效果規則.md`](../技能標記機制與效果規則.md)。

contentVersion `cv_cec903c51bf9`

---

## 目錄

- **C級願望**（20 張）—— [固有技能・對魔力 C](#grail-c-01)、[固有技能・心眼（偽）C](#grail-c-02)、[魔術・反射術式 C](#grail-c-03)、[魔術・魔力回收 C](#grail-c-04)、[魔術・魔力裝甲 C](#grail-c-05)、[固有技能・高速詠唱 C](#grail-c-06)、[固有技能・魔力放出 C](#grail-c-07)、[概念武裝・起源彈 C](#grail-c-08)、[概念武裝・破界之槍 C](#grail-c-09)、[固有技能・魂喰 C](#grail-c-10)、[固有技能・逆境再起 C](#grail-c-11)、[魔術・詠唱結界 C](#grail-c-12)、[固有技能・王殺 C](#grail-c-13)、[魔術・地脈接續 C](#grail-c-14)、[職階技能・單獨行動 C](#grail-c-15)、[投影魔術・追尾彈 C](#grail-c-16)、[固有技能・直感 C](#grail-c-17)、[固有技能・魔力放出（炎）C](#grail-c-18)、[魔術・星之雨 C](#grail-c-19)、[投影魔術・強化投影 C](#grail-c-20)
- **A級願望**（20 張）—— [固有技能・心眼（真）A](#grail-a-01)、[魔術・反射術式 A](#grail-a-02)、[固有技能・戰鬥續行 A](#grail-a-03)、[固有技能・高速神言 A](#grail-a-04)、[固有技能・獵殺本能 A](#grail-a-05)、[職階技能・單獨行動 A](#grail-a-06)、[魔術・靈基修復 A](#grail-a-07)、[魔術・殘響詠唱 A](#grail-a-08)、[靈基轉換・虛數體 A](#grail-a-09)、[魔術刻印・閉鎖回路 A](#grail-a-10)、[魔術・魔力裝甲 A](#grail-a-11)、[魔術・術式反轉 A](#grail-a-12)、[固有技能・怪力 A](#grail-a-13)、[固有技能・縮地 A](#grail-a-14)、[固有技能・不屈之魂 A](#grail-a-15)、[魔術・心象防壁 A](#grail-a-16)、[固有技能・無窮之武練 A](#grail-a-17)、[魔術刻印・灼熱回路 A](#grail-a-18)、[固有技能・自己改造 A](#grail-a-19)、[固有技能・千里眼 A](#grail-a-20)
- **EX級願望**（20 張）—— [聖杯權能・真理改寫 EX](#grail-ex-01)、[固有結界・時間神殿 EX](#grail-ex-02)、[聖杯權能・勝利輪迴 EX](#grail-ex-03)、[令咒・三重詠唱 EX](#grail-ex-04)、[寶具・二重真名解放 EX](#grail-ex-05)、[職階技能・騎乘 EX](#grail-ex-06)、[固有技能・戰鬥續行 EX](#grail-ex-07)、[固有技能・無我境地 EX](#grail-ex-08)、[聖杯權能・終末宣告 EX](#grail-ex-09)、[契約・反魂 EX](#grail-ex-10)、[靈基再臨 EX](#grail-ex-11)、[固有結界・魔力海 EX](#grail-ex-12)、[寶具・死棘之槍 EX](#grail-ex-13)、[概念武裝・起源彈 EX](#grail-ex-14)、[魔術禮裝・寶石劍 EX](#grail-ex-15)、[秘劍・燕返 EX](#grail-ex-16)、[靈基換裝・零距離決戰 EX](#grail-ex-17)、[魔術刻印・生命爐心 EX](#grail-ex-18)、[固有技能・魔力爐心（無限）EX](#grail-ex-19)、[固有技能・魔力放出（雷）EX](#grail-ex-20)

---

## C級願望（後台 `silver`）

定位：小幅干涉一條規則。

### 固有技能・對魔力 C

<a id="grail-c-01"></a>

| | |
|---|---|
| **id** | `grail-c-01` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `control` `dispel` `defense` |
| **觸發事件** | 被掛上狀態時 · CD 25s |
| **效果機制** | `dispel` |
| **條件葉** | `status` |
| **靈基適性條件** | — |

> [負面狀態][淨化] 被掛上負面狀態時，立即移除最新一個負面狀態。25秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-01",
  "schema": "augment@1",
  "name": "固有技能・對魔力 C",
  "description": "[負面狀態][淨化] 被掛上負面狀態時，立即移除最新一個負面狀態。25秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "control",
    "dispel",
    "defense"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-c-01.webp",
  "hooks": [
    {
      "on": "onStatusApplied",
      "effects": [
        {
          "kind": "dispel",
          "shape": "single",
          "pools": {
            "status": true,
            "shields": false,
            "dot": true,
            "buffs": true
          },
          "polarity": "debuff",
          "order": "newest"
        }
      ],
      "target": "self",
      "internalCooldown": 25,
      "condition": {
        "kind": "status",
        "subject": "self",
        "tag": "debuff"
      }
    }
  ]
}
```

</details>

---

### 固有技能・心眼（偽）C

<a id="grail-c-02"></a>

| | |
|---|---|
| **id** | `grail-c-02` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `evasion` `knockback` `counter` |
| **觸發事件** | 迴避成功時 · CD 8s；反彈成功時 · CD 8s |
| **效果機制** | `knockback` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有迴避／反彈 |

> [迴避][反彈][擊退] 成功迴避或反彈敵方攻擊時，將攻擊者小幅擊退。8秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-02",
  "schema": "augment@1",
  "name": "固有技能・心眼（偽）C",
  "description": "[迴避][反彈][擊退] 成功迴避或反彈敵方攻擊時，將攻擊者小幅擊退。8秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "evasion",
    "knockback",
    "counter"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-02.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "evasion",
      "reflect"
    ]
  },
  "hooks": [
    {
      "on": "onEvade",
      "effects": [
        {
          "kind": "knockback",
          "distanceTier": "極小",
          "from": "caster",
          "applyTo": "target",
          "distance": 2,
          "speed": 16
        }
      ],
      "target": "event",
      "internalCooldown": 8
    },
    {
      "on": "onReflectSuccess",
      "effects": [
        {
          "kind": "knockback",
          "distanceTier": "極小",
          "from": "caster",
          "applyTo": "target",
          "distance": 2,
          "speed": 16
        }
      ],
      "target": "event",
      "internalCooldown": 8
    }
  ]
}
```

</details>

---

### 魔術・反射術式 C

<a id="grail-c-03"></a>

| | |
|---|---|
| **id** | `grail-c-03` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `reflect` `mana` `sustain` |
| **觸發事件** | 反彈成功時 · CD 5s；迴避成功時 · CD 5s |
| **效果機制** | `restore` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有迴避／反彈 |

> [反彈][迴避][回魔] 成功反彈或迴避時，回復6%最大魔力。5秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-03",
  "schema": "augment@1",
  "name": "魔術・反射術式 C",
  "description": "[反彈][迴避][回魔] 成功反彈或迴避時，回復6%最大魔力。5秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "reflect",
    "mana",
    "sustain"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-03.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "evasion",
      "reflect"
    ]
  },
  "hooks": [
    {
      "on": "onReflectSuccess",
      "effects": [
        {
          "kind": "restore",
          "manaPct": 0.06,
          "applyTo": "self"
        }
      ],
      "target": "self",
      "internalCooldown": 5
    },
    {
      "on": "onEvade",
      "effects": [
        {
          "kind": "restore",
          "manaPct": 0.06,
          "applyTo": "self"
        }
      ],
      "target": "self",
      "internalCooldown": 5
    }
  ]
}
```

</details>

---

### 魔術・魔力回收 C

<a id="grail-c-04"></a>

| | |
|---|---|
| **id** | `grail-c-04` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `damage-taken` `mana` `conversion` |
| **觸發事件** | 受到傷害時 · CD 1s |
| **效果機制** | `eventValueConversion` |
| **條件葉** | — |
| **靈基適性條件** | 需要魔力 |

> [受傷][傷害轉魔力] 實際失去生命時，將該次生命損失的15%轉化為魔力。1秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-04",
  "schema": "augment@1",
  "name": "魔術・魔力回收 C",
  "description": "[受傷][傷害轉魔力] 實際失去生命時，將該次生命損失的15%轉化為魔力。1秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "damage-taken",
    "mana",
    "conversion"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-04.webp",
  "eligibility": {
    "requiresMana": true
  },
  "hooks": [
    {
      "on": "onDamageTaken",
      "effects": [
        {
          "kind": "eventValueConversion",
          "shape": "single",
          "source": "incomingDamage",
          "basis": "hpLost",
          "ratio": 0.15,
          "to": "mana",
          "who": "self"
        }
      ],
      "target": "self",
      "internalCooldown": 1
    }
  ]
}
```

</details>

---

### 魔術・魔力裝甲 C

<a id="grail-c-05"></a>

| | |
|---|---|
| **id** | `grail-c-05` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `mana` `health` `stat-conversion` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | 需要魔力 |

> [最大魔力][最大生命] 最大魔力的20%同時視為額外最大生命。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-05",
  "schema": "augment@1",
  "name": "魔術・魔力裝甲 C",
  "description": "[最大魔力][最大生命] 最大魔力的20%同時視為額外最大生命。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "mana",
    "health",
    "stat-conversion"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-05.webp",
  "eligibility": {
    "requiresMana": true
  },
  "modifiers": [
    {
      "stat": "maxHealth",
      "op": "percentOf",
      "value": 0.2,
      "from": "maxMana"
    }
  ]
}
```

</details>

---

### 固有技能・高速詠唱 C

<a id="grail-c-06"></a>

| | |
|---|---|
| **id** | `grail-c-06` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `attack-speed` `cdr` `stat-conversion` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [攻速][CDR] 每1.0攻速同時提供5%冷卻縮減，最多20%。原攻速不會消失。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-06",
  "schema": "augment@1",
  "name": "固有技能・高速詠唱 C",
  "description": "[攻速][CDR] 每1.0攻速同時提供5%冷卻縮減，最多20%。原攻速不會消失。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "attack-speed",
    "cdr",
    "stat-conversion"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-06.webp",
  "modifiers": [
    {
      "stat": "cdr",
      "op": "percentOf",
      "value": 0.05,
      "from": "as"
    }
  ]
}
```

</details>

---

### 固有技能・魔力放出 C

<a id="grail-c-07"></a>

| | |
|---|---|
| **id** | `grail-c-07` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `basic-attack` `damage-type` `magic` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [普攻][傷害轉換] 所有普通攻擊改為魔法傷害，原傷害數值不變。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-07",
  "schema": "augment@1",
  "name": "固有技能・魔力放出 C",
  "description": "[普攻][傷害轉換] 所有普通攻擊改為魔法傷害，原傷害數值不變。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "basic-attack",
    "damage-type",
    "magic"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-07.webp",
  "damageTypeOverride": {
    "scope": "basic",
    "becomes": "magic",
    "applyAt": "afterGates",
    "impactType": "original"
  }
}
```

</details>

---

### 概念武裝・起源彈 C

<a id="grail-c-08"></a>

| | |
|---|---|
| **id** | `grail-c-08` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-hit` `dispel` `anti-buff` |
| **觸發事件** | 技能命中時 · CD 12s |
| **效果機制** | `dispel` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害 |

> [技能命中][驅散] 技能命中敵方英雄時，移除其最新一個可驅散增益。12秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-08",
  "schema": "augment@1",
  "name": "概念武裝・起源彈 C",
  "description": "[技能命中][驅散] 技能命中敵方英雄時，移除其最新一個可驅散增益。12秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ability-hit",
    "dispel",
    "anti-buff"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-08.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "dispel",
          "shape": "single",
          "pools": {
            "status": false,
            "shields": false,
            "dot": false,
            "buffs": true
          },
          "polarity": "buff",
          "order": "newest"
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 12
    }
  ]
}
```

</details>

---

### 概念武裝・破界之槍 C

<a id="grail-c-09"></a>

| | |
|---|---|
| **id** | `grail-c-09` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-hit` `shield-break` `anti-shield` |
| **觸發事件** | 技能命中時 · CD 12s |
| **效果機制** | `shieldBreak` |
| **條件葉** | — |
| **靈基適性條件** | 需要敵方有護盾 |

> [技能命中][破盾] 技能命中敵方英雄時，移除其一層護盾。12秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-09",
  "schema": "augment@1",
  "name": "概念武裝・破界之槍 C",
  "description": "[技能命中][破盾] 技能命中敵方英雄時，移除其一層護盾。12秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ability-hit",
    "shield-break",
    "anti-shield"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-09.webp",
  "eligibility": {
    "requiresEnemyMechanic": [
      "shield"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "shieldBreak",
          "shape": "single",
          "count": 1,
          "order": "newest"
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 12
    }
  ]
}
```

</details>

---

### 固有技能・魂喰 C

<a id="grail-c-10"></a>

| | |
|---|---|
| **id** | `grail-c-10` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `kill` `scaling` `attributes` |
| **觸發事件** | 擊殺時 |
| **效果機制** | `grantAttribute` |
| **條件葉** | — |
| **靈基適性條件** | 需要有小怪 |

> [擊殺][成長] 每累積擊殺5個單位，永久獲得1力量、1敏捷、1智慧；各最多20點。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-10",
  "schema": "augment@1",
  "name": "固有技能・魂喰 C",
  "description": "[擊殺][成長] 每累積擊殺5個單位，永久獲得1力量、1敏捷、1智慧；各最多20點。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "kill",
    "scaling",
    "attributes"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-10.webp",
  "eligibility": {
    "requiresModeFeature": [
      "mobs"
    ]
  },
  "hooks": [
    {
      "on": "onKill",
      "effects": [
        {
          "kind": "grantAttribute",
          "attr": "str",
          "mode": "flat",
          "amount": 1,
          "everyNth": 5,
          "store": "source",
          "maxSourceTotal": 20
        },
        {
          "kind": "grantAttribute",
          "attr": "agi",
          "mode": "flat",
          "amount": 1,
          "everyNth": 5,
          "store": "source",
          "maxSourceTotal": 20
        },
        {
          "kind": "grantAttribute",
          "attr": "int",
          "mode": "flat",
          "amount": 1,
          "everyNth": 5,
          "store": "source",
          "maxSourceTotal": 20
        }
      ],
      "target": "self",
      "victim": "any"
    }
  ]
}
```

</details>

---

### 固有技能・逆境再起 C

<a id="grail-c-11"></a>

| | |
|---|---|
| **id** | `grail-c-11` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `stun` `cooldown-reset` `defense` |
| **觸發事件** | 被掛上狀態時 · CD 25s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | `status` |
| **靈基適性條件** | — |

> [負面狀態][技能重置] 被掛上負面狀態時，立即完成Q／W／E冷卻。25秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-11",
  "schema": "augment@1",
  "name": "固有技能・逆境再起 C",
  "description": "[負面狀態][技能重置] 被掛上負面狀態時，立即完成Q／W／E冷卻。25秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "stun",
    "cooldown-reset",
    "defense"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-c-11.webp",
  "hooks": [
    {
      "on": "onStatusApplied",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        }
      ],
      "target": "self",
      "internalCooldown": 25,
      "condition": {
        "kind": "status",
        "subject": "self",
        "tag": "debuff"
      }
    }
  ]
}
```

</details>

---

### 魔術・詠唱結界 C

<a id="grail-c-12"></a>

| | |
|---|---|
| **id** | `grail-c-12` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `ability-cast` `control-immunity` `defense` |
| **觸發事件** | 施法時 · CD 8s |
| **效果機制** | `invulnerable` |
| **條件葉** | — |
| **靈基適性條件** | 需要 Q／W／E／R 任一 |

> [施法][控制免疫] 施放Q／W／E／R後，獲得0.4秒控制免疫。8秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-12",
  "schema": "augment@1",
  "name": "魔術・詠唱結界 C",
  "description": "[施法][控制免疫] 施放Q／W／E／R後，獲得0.4秒控制免疫。8秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ability-cast",
    "control-immunity",
    "defense"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-c-12.webp",
  "eligibility": {
    "requiresAnyAbilitySlot": [
      "Q",
      "W",
      "E",
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "invulnerable",
          "durationSec": 0.4,
          "applyTo": "self",
          "blocksDamage": "none",
          "blocksTrueDamage": false,
          "blocksControl": true
        }
      ],
      "target": "self",
      "internalCooldown": 8
    }
  ]
}
```

</details>

---

### 固有技能・王殺 C

<a id="grail-c-13"></a>

| | |
|---|---|
| **id** | `grail-c-13` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `boss` `objective` `cooldown-reset` |
| **觸發事件** | 殭屍王出現時 |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | 需要有殭屍王 |

> [Boss][寶具重置] 殭屍王出現時，立即完成R冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-13",
  "schema": "augment@1",
  "name": "固有技能・王殺 C",
  "description": "[Boss][寶具重置] 殭屍王出現時，立即完成R冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "boss",
    "objective",
    "cooldown-reset"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-13.webp",
  "eligibility": {
    "requiresModeFeature": [
      "boss"
    ]
  },
  "hooks": [
    {
      "on": "onBossSpawn",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 魔術・地脈接續 C

<a id="grail-c-14"></a>

| | |
|---|---|
| **id** | `grail-c-14` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `neutral-object` `objective` `cooldown-reset` |
| **觸發事件** | 擊殺時 · CD 15s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | 需要有中立物件 |

> [中立物件][技能重置] 擊毀可觸發擊殺事件的中立單位或中立物件後，完成Q／W／E冷卻。15秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-14",
  "schema": "augment@1",
  "name": "魔術・地脈接續 C",
  "description": "[中立物件][技能重置] 擊毀可觸發擊殺事件的中立單位或中立物件後，完成Q／W／E冷卻。15秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "neutral-object",
    "objective",
    "cooldown-reset"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-14.webp",
  "eligibility": {
    "requiresModeFeature": [
      "neutralObjects"
    ]
  },
  "hooks": [
    {
      "on": "onKill",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        }
      ],
      "target": "self",
      "victim": "mob",
      "internalCooldown": 15
    }
  ]
}
```

</details>

---

### 職階技能・單獨行動 C

<a id="grail-c-15"></a>

| | |
|---|---|
| **id** | `grail-c-15` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ally-death` `mana-regen` `clutch` |
| **觸發事件** | 隊友陣亡時 |
| **效果機制** | `applyBuff` |
| **條件葉** | — |
| **靈基適性條件** | 需要有隊友 |

> [隊友死亡][回魔] 隊友死亡後，魔力回復效果變為2倍，持續15秒。不可疊加，只刷新時間。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-15",
  "schema": "augment@1",
  "name": "職階技能・單獨行動 C",
  "description": "[隊友死亡][回魔] 隊友死亡後，魔力回復效果變為2倍，持續15秒。不可疊加，只刷新時間。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ally-death",
    "mana-regen",
    "clutch"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-15.webp",
  "eligibility": {
    "requiresModeFeature": [
      "team"
    ]
  },
  "hooks": [
    {
      "on": "onAllyDeath",
      "effects": [
        {
          "kind": "applyBuff",
          "modifiers": [
            {
              "stat": "manaRegen",
              "op": "pctMult",
              "value": 1.0
            }
          ],
          "duration": 15,
          "applyTo": "self",
          "exclusiveGroup": "grail-single-action-c",
          "exclusiveOnExisting": "replace",
          "dispellable": false,
          "polarity": "buff"
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 投影魔術・追尾彈 C

<a id="grail-c-16"></a>

| | |
|---|---|
| **id** | `grail-c-16` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-hit` `projectile` `magic` |
| **觸發事件** | 技能命中時 · CD 6s |
| **效果機制** | `damage` `spawnProjectile` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害 |

> [技能命中][彈體] 技能命中敵方英雄時，追加一枚追尾魔彈，造成60＋15% AP魔法傷害。6秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-16",
  "schema": "augment@1",
  "name": "投影魔術・追尾彈 C",
  "description": "[技能命中][彈體] 技能命中敵方英雄時，追加一枚追尾魔彈，造成60＋15% AP魔法傷害。6秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ability-hit",
    "projectile",
    "magic"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-16.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "spawnProjectile",
          "projectileId": "grail.tracking-bolt",
          "onHit": [
            {
              "kind": "damage",
              "damageType": "magic",
              "amount": {
                "flat": 60,
                "ratios": [
                  {
                    "stat": "ap",
                    "coeff": 0.15
                  }
                ]
              },
              "applyTo": "target"
            }
          ]
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 6
    }
  ]
}
```

</details>

---

### 固有技能・直感 C

<a id="grail-c-17"></a>

| | |
|---|---|
| **id** | `grail-c-17` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `damage-taken` `crit` `shield` |
| **觸發事件** | 受到傷害時 · CD 10s |
| **效果機制** | `shield` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [受到暴擊][護盾] 被敵方英雄暴擊時，獲得相當於8%最大生命的護盾，持續3秒。10秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-17",
  "schema": "augment@1",
  "name": "固有技能・直感 C",
  "description": "[受到暴擊][護盾] 被敵方英雄暴擊時，獲得相當於8%最大生命的護盾，持續3秒。10秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "damage-taken",
    "crit",
    "shield"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-c-17.webp",
  "hooks": [
    {
      "on": "onDamageTaken",
      "effects": [
        {
          "kind": "shield",
          "amount": {
            "ratios": [
              {
                "stat": "maxHealth",
                "coeff": 0.08
              }
            ]
          },
          "duration": 3,
          "absorbs": "all"
        }
      ],
      "target": "self",
      "victim": "enemyChampion",
      "damageCrit": "crit",
      "internalCooldown": 10
    }
  ]
}
```

</details>

---

### 固有技能・魔力放出（炎）C

<a id="grail-c-18"></a>

| | |
|---|---|
| **id** | `grail-c-18` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-hit` `burn` `elemental` |
| **觸發事件** | 技能命中時 · CD 8s |
| **效果機制** | `applyStatus` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害 |

> [技能命中][燃燒] 技能命中敵方英雄時，使其燃燒3秒。8秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-18",
  "schema": "augment@1",
  "name": "固有技能・魔力放出（炎）C",
  "description": "[技能命中][燃燒] 技能命中敵方英雄時，使其燃燒3秒。8秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ability-hit",
    "burn",
    "elemental"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-18.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "applyStatus",
          "statusId": "burn",
          "duration": 3,
          "applyTo": "target",
          "refresh": "extend",
          "dispellable": true
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 8
    }
  ]
}
```

</details>

---

### 魔術・星之雨 C

<a id="grail-c-19"></a>

| | |
|---|---|
| **id** | `grail-c-19` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `interval` `random-area` `aoe` |
| **觸發事件** | 週期（每 N 秒） · CD 15s |
| **效果機制** | `damageArea` `randomArea` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [週期][隨機區域] 每15秒在自身附近降下2道星光，每道造成80＋15% AP範圍魔法傷害。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-19",
  "schema": "augment@1",
  "name": "魔術・星之雨 C",
  "description": "[週期][隨機區域] 每15秒在自身附近降下2道星光，每道造成80＋15% AP範圍魔法傷害。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "interval",
    "random-area",
    "aoe"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-c-19.webp",
  "hooks": [
    {
      "on": "onInterval",
      "effects": [
        {
          "kind": "randomArea",
          "who": "self",
          "count": [
            2
          ],
          "intervalSec": 0.25,
          "scatterRadius": 8,
          "firstAtCast": true,
          "stopOnCasterDeath": true,
          "effects": [
            {
              "kind": "damageArea",
              "damageType": "magic",
              "amount": {
                "flat": 80,
                "ratios": [
                  {
                    "stat": "ap",
                    "coeff": 0.15
                  }
                ]
              },
              "radius": 2.5,
              "radiusTier": "小",
              "includeOrigin": true
            }
          ]
        }
      ],
      "target": "self",
      "internalCooldown": 15
    }
  ]
}
```

</details>

---

### 投影魔術・強化投影 C

<a id="grail-c-20"></a>

| | |
|---|---|
| **id** | `grail-c-20` |
| **階級** | C級願望（後台 `silver`） |
| **權重** | 100 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-cast` `basic-attack` `projectile` |
| **觸發事件** | 施法時 · CD 8s |
| **效果機制** | `applyBuff` `damage` `spawnProjectile` |
| **條件葉** | — |
| **靈基適性條件** | 需要 Q／W／E／R 任一 |

> [施法][下一次普攻] 施法後5秒內，下一次普攻追加一枚投影彈，造成40＋20% AP魔法傷害。8秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-c-20",
  "schema": "augment@1",
  "name": "投影魔術・強化投影 C",
  "description": "[施法][下一次普攻] 施法後5秒內，下一次普攻追加一枚投影彈，造成40＋20% AP魔法傷害。8秒冷卻。",
  "tier": "silver",
  "weight": 100,
  "tags": [
    "grail-wish",
    "ability-cast",
    "basic-attack",
    "projectile"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-c-20.webp",
  "eligibility": {
    "requiresAnyAbilitySlot": [
      "Q",
      "W",
      "E",
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "applyBuff",
          "modifiers": [],
          "duration": 5,
          "applyTo": "self",
          "statusId": "grail-strengthened-projection",
          "exclusiveGroup": "grail-strengthened-projection",
          "exclusiveOnExisting": "replace",
          "dispellable": false,
          "polarity": "buff",
          "hooks": [
            {
              "on": "onBasicAttack",
              "effects": [
                {
                  "kind": "spawnProjectile",
                  "projectileId": "grail.projection-bolt",
                  "onHit": [
                    {
                      "kind": "damage",
                      "damageType": "magic",
                      "amount": {
                        "flat": 40,
                        "ratios": [
                          {
                            "stat": "ap",
                            "coeff": 0.2
                          }
                        ]
                      },
                      "applyTo": "target"
                    }
                  ]
                }
              ],
              "target": "event",
              "maxTriggers": 1,
              "onConsumed": "detachSource"
            }
          ]
        }
      ],
      "target": "self",
      "internalCooldown": 8
    }
  ]
}
```

</details>

---

## A級願望（後台 `gold`）

定位：建立可利用的玩法循環。

### 固有技能・心眼（真）A

<a id="grail-a-01"></a>

| | |
|---|---|
| **id** | `grail-a-01` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `evasion` `counter` `physical` |
| **觸發事件** | 迴避成功時 · CD 6s；反彈成功時 · CD 6s |
| **效果機制** | `damage` `knockback` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有迴避／反彈 |

> [迴避][反彈][彈反] 成功迴避或反彈後，立即對攻擊者造成一次100% AD物理傷害並小幅擊退。6秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-01",
  "schema": "augment@1",
  "name": "固有技能・心眼（真）A",
  "description": "[迴避][反彈][彈反] 成功迴避或反彈後，立即對攻擊者造成一次100% AD物理傷害並小幅擊退。6秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "evasion",
    "counter",
    "physical"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-01.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "evasion",
      "reflect"
    ]
  },
  "hooks": [
    {
      "on": "onEvade",
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "ratios": [
              {
                "stat": "ad",
                "coeff": 1.0
              }
            ]
          },
          "applyTo": "target"
        },
        {
          "kind": "knockback",
          "distanceTier": "極小",
          "from": "caster",
          "applyTo": "target",
          "distance": 2,
          "speed": 16
        }
      ],
      "target": "event",
      "internalCooldown": 6
    },
    {
      "on": "onReflectSuccess",
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "ratios": [
              {
                "stat": "ad",
                "coeff": 1.0
              }
            ]
          },
          "applyTo": "target"
        },
        {
          "kind": "knockback",
          "distanceTier": "極小",
          "from": "caster",
          "applyTo": "target",
          "distance": 2,
          "speed": 16
        }
      ],
      "target": "event",
      "internalCooldown": 6
    }
  ]
}
```

</details>

---

### 魔術・反射術式 A

<a id="grail-a-02"></a>

| | |
|---|---|
| **id** | `grail-a-02` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `reflect` `heal` `counter` |
| **觸發事件** | 反彈成功時 · CD 8s；迴避成功時 · CD 8s |
| **效果機制** | `eventValueConversion` `restore` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有迴避／反彈 |

> [反彈][迴避][回復] 成功反彈時回復等同反彈傷害50%的生命；成功迴避時回復6%最大生命。8秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-02",
  "schema": "augment@1",
  "name": "魔術・反射術式 A",
  "description": "[反彈][迴避][回復] 成功反彈時回復等同反彈傷害50%的生命；成功迴避時回復6%最大生命。8秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "reflect",
    "heal",
    "counter"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-02.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "evasion",
      "reflect"
    ]
  },
  "hooks": [
    {
      "on": "onReflectSuccess",
      "effects": [
        {
          "kind": "eventValueConversion",
          "shape": "single",
          "source": "incomingDamage",
          "basis": "hpLost",
          "ratio": 0.5,
          "to": "health",
          "who": "self"
        }
      ],
      "target": "self",
      "internalCooldown": 8
    },
    {
      "on": "onEvade",
      "effects": [
        {
          "kind": "restore",
          "healthPct": 0.06,
          "applyTo": "self"
        }
      ],
      "target": "self",
      "internalCooldown": 8
    }
  ]
}
```

</details>

---

### 固有技能・戰鬥續行 A

<a id="grail-a-03"></a>

| | |
|---|---|
| **id** | `grail-a-03` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `lethal` `block` `survival` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [致命傷害][格擋] 每60秒一次，完全格擋一發原本會使你死亡的傷害。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-03",
  "schema": "augment@1",
  "name": "固有技能・戰鬥續行 A",
  "description": "[致命傷害][格擋] 每60秒一次，完全格擋一發原本會使你死亡的傷害。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "lethal",
    "block",
    "survival"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-a-03.webp",
  "block": {
    "damageTypes": [
      "physical",
      "magic"
    ],
    "chance": 1.0,
    "fraction": 1.0,
    "lethalOnly": true,
    "lethalBasis": "hpAndShields",
    "internalCooldown": 60
  }
}
```

</details>

---

### 固有技能・高速神言 A

<a id="grail-a-04"></a>

| | |
|---|---|
| **id** | `grail-a-04` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ap` `cdr` `stat-conversion` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [AP][CDR] 每100 AP同時提供5%冷卻縮減，最多30%。AP不會消失。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-04",
  "schema": "augment@1",
  "name": "固有技能・高速神言 A",
  "description": "[AP][CDR] 每100 AP同時提供5%冷卻縮減，最多30%。AP不會消失。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ap",
    "cdr",
    "stat-conversion"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-04.webp",
  "modifiers": [
    {
      "stat": "cdr",
      "op": "percentOf",
      "value": 0.0005,
      "from": "ap"
    }
  ]
}
```

</details>

---

### 固有技能・獵殺本能 A

<a id="grail-a-05"></a>

| | |
|---|---|
| **id** | `grail-a-05` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `kill` `cooldown-reset` `snowball` |
| **觸發事件** | 擊殺時 · CD 45s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [英雄擊殺][技能重置] 擊殺敵方英雄時，完成Q／W／E／R冷卻。45秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-05",
  "schema": "augment@1",
  "name": "固有技能・獵殺本能 A",
  "description": "[英雄擊殺][技能重置] 擊殺敵方英雄時，完成Q／W／E／R冷卻。45秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "kill",
    "cooldown-reset",
    "snowball"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-05.webp",
  "hooks": [
    {
      "on": "onKill",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        }
      ],
      "target": "self",
      "victim": "enemyChampion",
      "internalCooldown": 45
    }
  ]
}
```

</details>

---

### 職階技能・單獨行動 A

<a id="grail-a-06"></a>

| | |
|---|---|
| **id** | `grail-a-06` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ally-death` `clutch` `cleanse` |
| **觸發事件** | 隊友陣亡時 · CD 30s |
| **效果機制** | `dispel` `invulnerable` `restore` |
| **條件葉** | — |
| **靈基適性條件** | 需要有隊友 |

> [隊友死亡][回魔][淨化] 隊友死亡時，回復25%最大魔力、淨化所有負面狀態並獲得0.75秒無敵。30秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-06",
  "schema": "augment@1",
  "name": "職階技能・單獨行動 A",
  "description": "[隊友死亡][回魔][淨化] 隊友死亡時，回復25%最大魔力、淨化所有負面狀態並獲得0.75秒無敵。30秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ally-death",
    "clutch",
    "cleanse"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-06.webp",
  "eligibility": {
    "requiresModeFeature": [
      "team"
    ]
  },
  "hooks": [
    {
      "on": "onAllyDeath",
      "effects": [
        {
          "kind": "restore",
          "manaPct": 0.25,
          "applyTo": "self"
        },
        {
          "kind": "dispel",
          "shape": "single",
          "pools": {
            "status": true,
            "shields": false,
            "dot": true,
            "buffs": true
          },
          "polarity": "debuff",
          "order": "newest"
        },
        {
          "kind": "invulnerable",
          "durationSec": 0.75,
          "applyTo": "self",
          "blocksDamage": "all",
          "blocksTrueDamage": true,
          "blocksControl": true
        }
      ],
      "target": "self",
      "internalCooldown": 30
    }
  ]
}
```

</details>

---

### 魔術・靈基修復 A

<a id="grail-a-07"></a>

| | |
|---|---|
| **id** | `grail-a-07` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `revive` `cooldown-reset` `invulnerable` |
| **觸發事件** | 被復活時 |
| **效果機制** | `invulnerable` `modifyCooldown` `restore` |
| **條件葉** | — |
| **靈基適性條件** | 需要有復活圈 |

> [復活][技能重置] 被復活時，完成Q／W／E／R冷卻、回滿魔力並獲得1秒無敵。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-07",
  "schema": "augment@1",
  "name": "魔術・靈基修復 A",
  "description": "[復活][技能重置] 被復活時，完成Q／W／E／R冷卻、回滿魔力並獲得1秒無敵。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "revive",
    "cooldown-reset",
    "invulnerable"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-a-07.webp",
  "eligibility": {
    "requiresModeFeature": [
      "revive"
    ]
  },
  "hooks": [
    {
      "on": "onRevive",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        },
        {
          "kind": "restore",
          "manaPct": 1.0,
          "applyTo": "self"
        },
        {
          "kind": "invulnerable",
          "durationSec": 1.0,
          "applyTo": "self",
          "blocksDamage": "all",
          "blocksTrueDamage": true,
          "blocksControl": true
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 魔術・殘響詠唱 A

<a id="grail-a-08"></a>

| | |
|---|---|
| **id** | `grail-a-08` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-cast` `proxy-cast` `echo` |
| **觸發事件** | 施法時 · CD 24s |
| **效果機制** | `delayed` `proxyCast` |
| **條件葉** | — |
| **靈基適性條件** | 需要 QWER |

> [技能再演] 施放Q／W／E／R後，1.2秒後自動再施放一次相同技能，不再次消耗魔力。各技能格24秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-08",
  "schema": "augment@1",
  "name": "魔術・殘響詠唱 A",
  "description": "[技能再演] 施放Q／W／E／R後，1.2秒後自動再施放一次相同技能，不再次消耗魔力。各技能格24秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ability-cast",
    "proxy-cast",
    "echo"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-08.webp",
  "eligibility": {
    "requiresAbilitySlots": [
      "Q",
      "W",
      "E",
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "delayed",
          "shape": "single",
          "delaySec": 1.2,
          "count": 1,
          "intervalSec": 1,
          "effects": [
            {
              "kind": "proxyCast",
              "shape": "single",
              "slot": "Q",
              "payCosts": "none",
              "respectCooldown": false,
              "requireLearned": true,
              "rankMode": "casterRank",
              "targetMode": "reresolve",
              "maxDepth": 1,
              "emitCastEvents": false
            }
          ]
        }
      ],
      "target": "self",
      "abilitySlot": "Q",
      "internalCooldown": 24,
      "internalCooldownScope": "perAbilitySlot"
    },
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "delayed",
          "shape": "single",
          "delaySec": 1.2,
          "count": 1,
          "intervalSec": 1,
          "effects": [
            {
              "kind": "proxyCast",
              "shape": "single",
              "slot": "W",
              "payCosts": "none",
              "respectCooldown": false,
              "requireLearned": true,
              "rankMode": "casterRank",
              "targetMode": "reresolve",
              "maxDepth": 1,
              "emitCastEvents": false
            }
          ]
        }
      ],
      "target": "self",
      "abilitySlot": "W",
      "internalCooldown": 24,
      "internalCooldownScope": "perAbilitySlot"
    },
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "delayed",
          "shape": "single",
          "delaySec": 1.2,
          "count": 1,
          "intervalSec": 1,
          "effects": [
            {
              "kind": "proxyCast",
              "shape": "single",
              "slot": "E",
              "payCosts": "none",
              "respectCooldown": false,
              "requireLearned": true,
              "rankMode": "casterRank",
              "targetMode": "reresolve",
              "maxDepth": 1,
              "emitCastEvents": false
            }
          ]
        }
      ],
      "target": "self",
      "abilitySlot": "E",
      "internalCooldown": 24,
      "internalCooldownScope": "perAbilitySlot"
    },
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "delayed",
          "shape": "single",
          "delaySec": 1.2,
          "count": 1,
          "intervalSec": 1,
          "effects": [
            {
              "kind": "proxyCast",
              "shape": "single",
              "slot": "R",
              "payCosts": "none",
              "respectCooldown": false,
              "requireLearned": true,
              "rankMode": "casterRank",
              "targetMode": "reresolve",
              "maxDepth": 1,
              "emitCastEvents": false
            }
          ]
        }
      ],
      "target": "self",
      "abilitySlot": "R",
      "internalCooldown": 24,
      "internalCooldownScope": "perAbilitySlot"
    }
  ]
}
```

</details>

---

### 靈基轉換・虛數體 A

<a id="grail-a-09"></a>

| | |
|---|---|
| **id** | `grail-a-09` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `tradeoff` `evasion` `defense-sacrifice` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [防禦捨棄][迴避] 護甲與魔抗固定為0，迴避率固定為35%。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-09",
  "schema": "augment@1",
  "name": "靈基轉換・虛數體 A",
  "description": "[防禦捨棄][迴避] 護甲與魔抗固定為0，迴避率固定為35%。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "tradeoff",
    "evasion",
    "defense-sacrifice"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-09.webp",
  "modifiers": [
    {
      "stat": "armor",
      "op": "override",
      "value": 0
    },
    {
      "stat": "mr",
      "op": "override",
      "value": 0
    },
    {
      "stat": "evasion",
      "op": "override",
      "value": 0.35
    }
  ]
}
```

</details>

---

### 魔術刻印・閉鎖回路 A

<a id="grail-a-10"></a>

| | |
|---|---|
| **id** | `grail-a-10` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `tradeoff` `mana` `damage-dealt` |
| **觸發事件** | 造成傷害時 · CD 1s |
| **效果機制** | `restore` |
| **條件葉** | — |
| **靈基適性條件** | 需要魔力 |

> [回魔捨棄][傷害回魔] 魔力回復固定為0；每次對敵人造成傷害時，回復3%最大魔力。1秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-10",
  "schema": "augment@1",
  "name": "魔術刻印・閉鎖回路 A",
  "description": "[回魔捨棄][傷害回魔] 魔力回復固定為0；每次對敵人造成傷害時，回復3%最大魔力。1秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "tradeoff",
    "mana",
    "damage-dealt"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-10.webp",
  "eligibility": {
    "requiresMana": true
  },
  "modifiers": [
    {
      "stat": "manaRegen",
      "op": "override",
      "value": 0
    }
  ],
  "hooks": [
    {
      "on": "onDamageDealt",
      "effects": [
        {
          "kind": "restore",
          "manaPct": 0.03,
          "applyTo": "self"
        }
      ],
      "target": "self",
      "victim": "enemy",
      "internalCooldown": 1
    }
  ]
}
```

</details>

---

### 魔術・魔力裝甲 A

<a id="grail-a-11"></a>

| | |
|---|---|
| **id** | `grail-a-11` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `mana` `health` `stat-conversion` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | 需要魔力 |

> [最大魔力][最大生命] 最大魔力的50%同時視為額外最大生命。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-11",
  "schema": "augment@1",
  "name": "魔術・魔力裝甲 A",
  "description": "[最大魔力][最大生命] 最大魔力的50%同時視為額外最大生命。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "mana",
    "health",
    "stat-conversion"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-11.webp",
  "eligibility": {
    "requiresMana": true
  },
  "modifiers": [
    {
      "stat": "maxHealth",
      "op": "percentOf",
      "value": 0.5,
      "from": "maxMana"
    }
  ]
}
```

</details>

---

### 魔術・術式反轉 A

<a id="grail-a-12"></a>

| | |
|---|---|
| **id** | `grail-a-12` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ability` `damage-type` `physical` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [技能傷害][物理化] 所有技能傷害改為物理傷害；原本AP、AD或其他傷害係數不變。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-12",
  "schema": "augment@1",
  "name": "魔術・術式反轉 A",
  "description": "[技能傷害][物理化] 所有技能傷害改為物理傷害；原本AP、AD或其他傷害係數不變。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ability",
    "damage-type",
    "physical"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-12.webp",
  "damageTypeOverride": {
    "scope": "ability",
    "becomes": "physical",
    "applyAt": "afterGates",
    "impactType": "original"
  }
}
```

</details>

---

### 固有技能・怪力 A

<a id="grail-a-13"></a>

| | |
|---|---|
| **id** | `grail-a-13` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `tradeoff` `basic-attack` `max-health` |
| **觸發事件** | 普攻時 |
| **效果機制** | `damage` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [AD捨棄][生命普攻] 攻擊力固定為0；每次普通攻擊額外造成自身最大生命5%的物理傷害。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-13",
  "schema": "augment@1",
  "name": "固有技能・怪力 A",
  "description": "[AD捨棄][生命普攻] 攻擊力固定為0；每次普通攻擊額外造成自身最大生命5%的物理傷害。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "tradeoff",
    "basic-attack",
    "max-health"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-13.webp",
  "modifiers": [
    {
      "stat": "ad",
      "op": "override",
      "value": 0
    }
  ],
  "hooks": [
    {
      "on": "onBasicAttack",
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "ratios": [
              {
                "stat": "maxHealth",
                "coeff": 0.05
              }
            ]
          },
          "applyTo": "target"
        }
      ],
      "target": "event",
      "victim": "enemy"
    }
  ]
}
```

</details>

---

### 固有技能・縮地 A

<a id="grail-a-14"></a>

| | |
|---|---|
| **id** | `grail-a-14` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `evasion` `blink` `engage` |
| **觸發事件** | 迴避成功時 · CD 10s |
| **效果機制** | `blink` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有迴避／反彈 |

> [迴避][瞬移] 成功迴避敵方英雄攻擊時，瞬移至該攻擊者身旁。10秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-14",
  "schema": "augment@1",
  "name": "固有技能・縮地 A",
  "description": "[迴避][瞬移] 成功迴避敵方英雄攻擊時，瞬移至該攻擊者身旁。10秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "evasion",
    "blink",
    "engage"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-14.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "evasion",
      "reflect"
    ]
  },
  "hooks": [
    {
      "on": "onEvade",
      "effects": [
        {
          "kind": "blink",
          "shape": "single",
          "to": "targetUnit",
          "applyTo": "self",
          "stopShortUnits": 1
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 10
    }
  ]
}
```

</details>

---

### 固有技能・不屈之魂 A

<a id="grail-a-15"></a>

| | |
|---|---|
| **id** | `grail-a-15` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `stun` `dispel` `invulnerable` |
| **觸發事件** | 被掛上狀態時 · CD 20s |
| **效果機制** | `dispel` `invulnerable` |
| **條件葉** | `status` |
| **靈基適性條件** | — |

> [負面狀態][淨化][無敵] 被掛上負面狀態時，淨化所有負面狀態並獲得0.75秒無敵。20秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-15",
  "schema": "augment@1",
  "name": "固有技能・不屈之魂 A",
  "description": "[負面狀態][淨化][無敵] 被掛上負面狀態時，淨化所有負面狀態並獲得0.75秒無敵。20秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "stun",
    "dispel",
    "invulnerable"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-a-15.webp",
  "hooks": [
    {
      "on": "onStatusApplied",
      "effects": [
        {
          "kind": "dispel",
          "shape": "single",
          "pools": {
            "status": true,
            "shields": false,
            "dot": true,
            "buffs": true
          },
          "polarity": "debuff",
          "order": "newest"
        },
        {
          "kind": "invulnerable",
          "durationSec": 0.75,
          "applyTo": "self",
          "blocksDamage": "all",
          "blocksTrueDamage": true,
          "blocksControl": true
        }
      ],
      "target": "self",
      "internalCooldown": 20,
      "condition": {
        "kind": "status",
        "subject": "self",
        "tag": "debuff"
      }
    }
  ]
}
```

</details>

---

### 魔術・心象防壁 A

<a id="grail-a-16"></a>

| | |
|---|---|
| **id** | `grail-a-16` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ap` `ability-cast` `shield` |
| **觸發事件** | 施法時 · CD 4s |
| **效果機制** | `shield` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [AP][護盾] 施放Q／W／E／R時，獲得相當於50% AP的護盾，持續3秒。4秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-16",
  "schema": "augment@1",
  "name": "魔術・心象防壁 A",
  "description": "[AP][護盾] 施放Q／W／E／R時，獲得相當於50% AP的護盾，持續3秒。4秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ap",
    "ability-cast",
    "shield"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-16.webp",
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "shield",
          "amount": {
            "ratios": [
              {
                "stat": "ap",
                "coeff": 0.5
              }
            ]
          },
          "duration": 3,
          "absorbs": "all"
        }
      ],
      "target": "self",
      "internalCooldown": 4
    }
  ]
}
```

</details>

---

### 固有技能・無窮之武練 A

<a id="grail-a-17"></a>

| | |
|---|---|
| **id** | `grail-a-17` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `basic-attack` `cooldown-reset` `hybrid` |
| **觸發事件** | 普攻時 · CD 8s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | 偏好技能傷害 |

> [普攻][技能重置] 普攻命中敵方英雄時，完成Q／W／E冷卻。8秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-17",
  "schema": "augment@1",
  "name": "固有技能・無窮之武練 A",
  "description": "[普攻][技能重置] 普攻命中敵方英雄時，完成Q／W／E冷卻。8秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "basic-attack",
    "cooldown-reset",
    "hybrid"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-17.webp",
  "eligibility": {
    "prefersSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onBasicAttack",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        }
      ],
      "target": "self",
      "victim": "enemyChampion",
      "internalCooldown": 8
    }
  ]
}
```

</details>

---

### 魔術刻印・灼熱回路 A

<a id="grail-a-18"></a>

| | |
|---|---|
| **id** | `grail-a-18` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `burn` `damage-dealt` `cooldown-reset` |
| **觸發事件** | 造成傷害時 · CD 10s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | `status` |
| **靈基適性條件** | 需要自己有燃燒 |

> [燃燒][技能重置] 對帶有燃燒狀態的敵方英雄造成傷害時，完成Q／W／E冷卻。10秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-18",
  "schema": "augment@1",
  "name": "魔術刻印・灼熱回路 A",
  "description": "[燃燒][技能重置] 對帶有燃燒狀態的敵方英雄造成傷害時，完成Q／W／E冷卻。10秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "burn",
    "damage-dealt",
    "cooldown-reset"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-a-18.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "burn"
    ]
  },
  "hooks": [
    {
      "on": "onDamageDealt",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        }
      ],
      "target": "self",
      "victim": "enemyChampion",
      "internalCooldown": 10,
      "condition": {
        "kind": "status",
        "subject": "target",
        "tag": "burn"
      }
    }
  ]
}
```

</details>

---

### 固有技能・自己改造 A

<a id="grail-a-19"></a>

| | |
|---|---|
| **id** | `grail-a-19` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ability-hit` `scaling` `ap` |
| **觸發事件** | 技能命中時 |
| **效果機制** | `applyBuff` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害 |

> [技能命中][永久成長] 每次技能命中敵方英雄，永久獲得1 AP，最多60 AP。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-19",
  "schema": "augment@1",
  "name": "固有技能・自己改造 A",
  "description": "[技能命中][永久成長] 每次技能命中敵方英雄，永久獲得1 AP，最多60 AP。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ability-hit",
    "scaling",
    "ap"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-19.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "applyBuff",
          "modifiers": [
            {
              "stat": "ap",
              "op": "flat",
              "value": 1
            }
          ],
          "permanent": true,
          "applyTo": "self",
          "stackKey": "grail-self-modification-a",
          "maxStacks": 60,
          "stackVisual": true,
          "dispellable": false,
          "polarity": "buff"
        }
      ],
      "target": "self",
      "victim": "enemyChampion"
    }
  ]
}
```

</details>

---

### 固有技能・千里眼 A

<a id="grail-a-20"></a>

| | |
|---|---|
| **id** | `grail-a-20` |
| **階級** | A級願望（後台 `gold`） |
| **權重** | 60 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ability-hit` `distance` `magic` |
| **觸發事件** | 技能命中時 · CD 4s |
| **效果機制** | `damage` |
| **條件葉** | — |
| **靈基適性條件** | 偏好技能傷害 |

> [技能命中][距離增幅] 技能命中英雄時追加一次魔法傷害；實際命中距離越遠，追加傷害越高。4秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-a-20",
  "schema": "augment@1",
  "name": "固有技能・千里眼 A",
  "description": "[技能命中][距離增幅] 技能命中英雄時追加一次魔法傷害；實際命中距離越遠，追加傷害越高。4秒冷卻。",
  "tier": "gold",
  "weight": 60,
  "tags": [
    "grail-wish",
    "ability-hit",
    "distance",
    "magic"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-a-20.webp",
  "eligibility": {
    "prefersSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "flat": 60,
            "ratios": [
              {
                "stat": "ap",
                "coeff": 0.2
              }
            ]
          },
          "applyTo": "target",
          "distanceScale": {
            "atRange": 12,
            "near": 0.5,
            "far": 1.5
          }
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 4
    }
  ]
}
```

</details>

---

## EX級願望（後台 `prismatic`）

定位：直接改寫正常遊戲規則。

### 聖杯權能・真理改寫 EX

<a id="grail-ex-01"></a>

| | |
|---|---|
| **id** | `grail-ex-01` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ability` `true-damage` `rule-rewrite` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害 |

> [技能傷害][真實傷害] 所有技能傷害改為真實傷害，並在免疫與迴避判定前完成轉換。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-01",
  "schema": "augment@1",
  "name": "聖杯權能・真理改寫 EX",
  "description": "[技能傷害][真實傷害] 所有技能傷害改為真實傷害，並在免疫與迴避判定前完成轉換。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "ability",
    "true-damage",
    "rule-rewrite"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-01.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ]
  },
  "damageTypeOverride": {
    "scope": "ability",
    "becomes": "true",
    "applyAt": "beforeGates",
    "impactType": "original"
  }
}
```

</details>

---

### 固有結界・時間神殿 EX

<a id="grail-ex-02"></a>

| | |
|---|---|
| **id** | `grail-ex-02` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `interval` `cooldown-reset` `reality-marble` |
| **觸發事件** | 週期（每 N 秒） · CD 20s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [時間][技能重置] 每20秒完成Q／W／E／R冷卻。EX不受影響。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-02",
  "schema": "augment@1",
  "name": "固有結界・時間神殿 EX",
  "description": "[時間][技能重置] 每20秒完成Q／W／E／R冷卻。EX不受影響。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "interval",
    "cooldown-reset",
    "reality-marble"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-ex-02.webp",
  "hooks": [
    {
      "on": "onInterval",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        }
      ],
      "target": "self",
      "internalCooldown": 20
    }
  ]
}
```

</details>

---

### 聖杯權能・勝利輪迴 EX

<a id="grail-ex-03"></a>

| | |
|---|---|
| **id** | `grail-ex-03` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `kill` `full-reset` `clutch` |
| **觸發事件** | 擊殺時 · CD 60s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [英雄擊殺][完全重置] 擊殺敵方英雄時，完成Q／W／E／R／EX全部冷卻。60秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-03",
  "schema": "augment@1",
  "name": "聖杯權能・勝利輪迴 EX",
  "description": "[英雄擊殺][完全重置] 擊殺敵方英雄時，完成Q／W／E／R／EX全部冷卻。60秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "kill",
    "full-reset",
    "clutch"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-03.webp",
  "hooks": [
    {
      "on": "onKill",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "EX",
          "mode": "reset"
        }
      ],
      "target": "self",
      "victim": "enemyChampion",
      "internalCooldown": 60
    }
  ]
}
```

</details>

---

### 令咒・三重詠唱 EX

<a id="grail-ex-04"></a>

| | |
|---|---|
| **id** | `grail-ex-04` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `r-cast` `proxy-cast` `command-spell` |
| **觸發事件** | 施法時 · CD 45s |
| **效果機制** | `proxyCast` |
| **條件葉** | — |
| **靈基適性條件** | 需要 QWER |

> [R施放][技能代放] 主動施放R時，同時免費施放Q、W、E。45秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-04",
  "schema": "augment@1",
  "name": "令咒・三重詠唱 EX",
  "description": "[R施放][技能代放] 主動施放R時，同時免費施放Q、W、E。45秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "r-cast",
    "proxy-cast",
    "command-spell"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-04.webp",
  "eligibility": {
    "requiresAbilitySlots": [
      "Q",
      "W",
      "E",
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "Q",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        },
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "W",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        },
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "E",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        }
      ],
      "target": "self",
      "abilitySlot": "R",
      "internalCooldown": 45
    }
  ]
}
```

</details>

---

### 寶具・二重真名解放 EX

<a id="grail-ex-05"></a>

| | |
|---|---|
| **id** | `grail-ex-05` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `r-cast` `proxy-cast` `noble-phantasm` |
| **觸發事件** | 施法時 · CD 60s |
| **效果機制** | `delayed` `proxyCast` |
| **條件葉** | — |
| **靈基適性條件** | 需要 R |

> [R施放][寶具再演] 施放R後，1.25秒後自動再施放一次R，不再次消耗魔力。60秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-05",
  "schema": "augment@1",
  "name": "寶具・二重真名解放 EX",
  "description": "[R施放][寶具再演] 施放R後，1.25秒後自動再施放一次R，不再次消耗魔力。60秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "r-cast",
    "proxy-cast",
    "noble-phantasm"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-05.webp",
  "eligibility": {
    "requiresAbilitySlots": [
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "delayed",
          "shape": "single",
          "delaySec": 1.25,
          "count": 1,
          "intervalSec": 1,
          "effects": [
            {
              "kind": "proxyCast",
              "shape": "single",
              "slot": "R",
              "payCosts": "none",
              "respectCooldown": false,
              "requireLearned": true,
              "rankMode": "casterRank",
              "targetMode": "reresolve",
              "maxDepth": 1,
              "emitCastEvents": false
            }
          ]
        }
      ],
      "target": "self",
      "abilitySlot": "R",
      "internalCooldown": 60
    }
  ]
}
```

</details>

---

### 職階技能・騎乘 EX

<a id="grail-ex-06"></a>

| | |
|---|---|
| **id** | `grail-ex-06` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `flight` `terrain` `class-skill` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | 排除已有飛行 |

> [飛行][地形無視] 永久進入飛行狀態，無視單位與一般障礙物碰撞，但不能離開競技場邊界。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-06",
  "schema": "augment@1",
  "name": "職階技能・騎乘 EX",
  "description": "[飛行][地形無視] 永久進入飛行狀態，無視單位與一般障礙物碰撞，但不能離開競技場邊界。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "flight",
    "terrain",
    "class-skill"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-06.webp",
  "eligibility": {
    "excludeSelfMechanic": [
      "flight"
    ]
  },
  "flight": {
    "hoverHeight": 1.5,
    "ignoreUnits": true,
    "ignoreObstacles": true,
    "stayInsideBoundary": true
  }
}
```

</details>

---

### 固有技能・戰鬥續行 EX

<a id="grail-ex-07"></a>

| | |
|---|---|
| **id** | `grail-ex-07` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `lethal` `block` `survival` |
| **觸發事件** | 常駐（屬性） |
| **效果機制** | — |
| **條件葉** | — |
| **靈基適性條件** | — |

> [致命傷害][完全格擋] 每20秒可以完全格擋一次致命傷害，包含真實傷害。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-07",
  "schema": "augment@1",
  "name": "固有技能・戰鬥續行 EX",
  "description": "[致命傷害][完全格擋] 每20秒可以完全格擋一次致命傷害，包含真實傷害。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "lethal",
    "block",
    "survival"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-ex-07.webp",
  "block": {
    "damageTypes": [
      "physical",
      "magic",
      "true"
    ],
    "chance": 1.0,
    "fraction": 1.0,
    "lethalOnly": true,
    "lethalBasis": "hpAndShields",
    "internalCooldown": 20
  }
}
```

</details>

---

### 固有技能・無我境地 EX

<a id="grail-ex-08"></a>

| | |
|---|---|
| **id** | `grail-ex-08` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `evasion` `proxy-cast` `counter` |
| **觸發事件** | 迴避成功時 · CD 12s；反彈成功時 · CD 12s |
| **效果機制** | `proxyCast` `weightedBranch` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有迴避／反彈；需要 QWE |

> [迴避][反彈][技能代放] 成功迴避或反彈敵方英雄攻擊時，從Q／W／E中隨機免費施放一個技能攻擊該敵人。12秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-08",
  "schema": "augment@1",
  "name": "固有技能・無我境地 EX",
  "description": "[迴避][反彈][技能代放] 成功迴避或反彈敵方英雄攻擊時，從Q／W／E中隨機免費施放一個技能攻擊該敵人。12秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "evasion",
    "proxy-cast",
    "counter"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-08.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "evasion",
      "reflect"
    ],
    "requiresAbilitySlots": [
      "Q",
      "W",
      "E"
    ]
  },
  "hooks": [
    {
      "on": "onEvade",
      "effects": [
        {
          "kind": "weightedBranch",
          "shape": "single",
          "branches": [
            {
              "weight": 1,
              "effects": [
                {
                  "kind": "proxyCast",
                  "shape": "single",
                  "slot": "Q",
                  "payCosts": "none",
                  "respectCooldown": false,
                  "requireLearned": true,
                  "rankMode": "casterRank",
                  "targetMode": "inherit",
                  "maxDepth": 1,
                  "emitCastEvents": false
                }
              ]
            },
            {
              "weight": 1,
              "effects": [
                {
                  "kind": "proxyCast",
                  "shape": "single",
                  "slot": "W",
                  "payCosts": "none",
                  "respectCooldown": false,
                  "requireLearned": true,
                  "rankMode": "casterRank",
                  "targetMode": "inherit",
                  "maxDepth": 1,
                  "emitCastEvents": false
                }
              ]
            },
            {
              "weight": 1,
              "effects": [
                {
                  "kind": "proxyCast",
                  "shape": "single",
                  "slot": "E",
                  "payCosts": "none",
                  "respectCooldown": false,
                  "requireLearned": true,
                  "rankMode": "casterRank",
                  "targetMode": "inherit",
                  "maxDepth": 1,
                  "emitCastEvents": false
                }
              ]
            }
          ]
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 12
    },
    {
      "on": "onReflectSuccess",
      "effects": [
        {
          "kind": "weightedBranch",
          "shape": "single",
          "branches": [
            {
              "weight": 1,
              "effects": [
                {
                  "kind": "proxyCast",
                  "shape": "single",
                  "slot": "Q",
                  "payCosts": "none",
                  "respectCooldown": false,
                  "requireLearned": true,
                  "rankMode": "casterRank",
                  "targetMode": "inherit",
                  "maxDepth": 1,
                  "emitCastEvents": false
                }
              ]
            },
            {
              "weight": 1,
              "effects": [
                {
                  "kind": "proxyCast",
                  "shape": "single",
                  "slot": "W",
                  "payCosts": "none",
                  "respectCooldown": false,
                  "requireLearned": true,
                  "rankMode": "casterRank",
                  "targetMode": "inherit",
                  "maxDepth": 1,
                  "emitCastEvents": false
                }
              ]
            },
            {
              "weight": 1,
              "effects": [
                {
                  "kind": "proxyCast",
                  "shape": "single",
                  "slot": "E",
                  "payCosts": "none",
                  "respectCooldown": false,
                  "requireLearned": true,
                  "rankMode": "casterRank",
                  "targetMode": "inherit",
                  "maxDepth": 1,
                  "emitCastEvents": false
                }
              ]
            }
          ]
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "internalCooldown": 12
    }
  ]
}
```

</details>

---

### 聖杯權能・終末宣告 EX

<a id="grail-ex-09"></a>

| | |
|---|---|
| **id** | `grail-ex-09` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `fire-ring` `random-area` `clutch` |
| **觸發事件** | 火圈點燃時 |
| **效果機制** | `damageArea` `invulnerable` `randomArea` |
| **條件葉** | — |
| **靈基適性條件** | 需要有火圈 |

> [火圈][隨機轟炸] 火圈開始燃燒時，獲得1秒無敵，並在5秒內於自身附近降下10道終末星光。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-09",
  "schema": "augment@1",
  "name": "聖杯權能・終末宣告 EX",
  "description": "[火圈][隨機轟炸] 火圈開始燃燒時，獲得1秒無敵，並在5秒內於自身附近降下10道終末星光。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "fire-ring",
    "random-area",
    "clutch"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-09.webp",
  "eligibility": {
    "requiresModeFeature": [
      "fireRing"
    ]
  },
  "hooks": [
    {
      "on": "onFireRingIgnite",
      "effects": [
        {
          "kind": "invulnerable",
          "durationSec": 1.0,
          "applyTo": "self",
          "blocksDamage": "all",
          "blocksTrueDamage": true,
          "blocksControl": true
        },
        {
          "kind": "randomArea",
          "who": "self",
          "count": [
            10
          ],
          "intervalSec": 0.5,
          "scatterRadius": 8,
          "firstAtCast": true,
          "stopOnCasterDeath": true,
          "effects": [
            {
              "kind": "damageArea",
              "damageType": "magic",
              "amount": {
                "flat": 100,
                "ratios": [
                  {
                    "stat": "ap",
                    "coeff": 0.2
                  }
                ]
              },
              "radius": 2.5,
              "radiusTier": "小",
              "includeOrigin": true
            }
          ]
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 契約・反魂 EX

<a id="grail-ex-10"></a>

| | |
|---|---|
| **id** | `grail-ex-10` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ally-death` `revive` `contract` |
| **觸發事件** | 隊友陣亡時 · CD 60s |
| **效果機制** | `revive` |
| **條件葉** | — |
| **靈基適性條件** | 需要有隊友 |

> [隊友死亡][復活] 隊友死亡時，使該隊友以20%生命復活。60秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-10",
  "schema": "augment@1",
  "name": "契約・反魂 EX",
  "description": "[隊友死亡][復活] 隊友死亡時，使該隊友以20%生命復活。60秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "ally-death",
    "revive",
    "contract"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-10.webp",
  "eligibility": {
    "requiresModeFeature": [
      "team"
    ]
  },
  "hooks": [
    {
      "on": "onAllyDeath",
      "effects": [
        {
          "kind": "revive",
          "hpPct": 0.2,
          "manaPct": 0,
          "side": "ally",
          "teamCharge": "ignore"
        }
      ],
      "target": "event",
      "internalCooldown": 60
    }
  ]
}
```

</details>

---

### 靈基再臨 EX

<a id="grail-ex-11"></a>

| | |
|---|---|
| **id** | `grail-ex-11` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 泛用 —— 泛用防守、控制反制或技能循環 |
| **標籤** | `grail-wish` `revive` `full-reset` `invulnerable` |
| **觸發事件** | 被復活時 |
| **效果機制** | `invulnerable` `modifyCooldown` `restore` |
| **條件葉** | — |
| **靈基適性條件** | 需要有復活圈 |

> [復活][完全重置] 自身被復活時，完成Q／W／E／R／EX冷卻、回滿魔力並獲得1.5秒無敵。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-11",
  "schema": "augment@1",
  "name": "靈基再臨 EX",
  "description": "[復活][完全重置] 自身被復活時，完成Q／W／E／R／EX冷卻、回滿魔力並獲得1.5秒無敵。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "revive",
    "full-reset",
    "invulnerable"
  ],
  "selectionSlot": "generic",
  "icon": "assets/icons/augments/grail-ex-11.webp",
  "eligibility": {
    "requiresModeFeature": [
      "revive"
    ]
  },
  "hooks": [
    {
      "on": "onRevive",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "EX",
          "mode": "reset"
        },
        {
          "kind": "restore",
          "manaPct": 1.0,
          "applyTo": "self"
        },
        {
          "kind": "invulnerable",
          "durationSec": 1.5,
          "applyTo": "self",
          "blocksDamage": "all",
          "blocksTrueDamage": true,
          "blocksControl": true
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 固有結界・魔力海 EX

<a id="grail-ex-12"></a>

| | |
|---|---|
| **id** | `grail-ex-12` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `mana` `health` `reality-marble` |
| **觸發事件** | 受到傷害時 |
| **效果機制** | `eventValueConversion` |
| **條件葉** | — |
| **靈基適性條件** | 需要魔力 |

> [最大魔力][最大生命][受傷回魔] 最大魔力的100%同時視為額外最大生命；生命損失的50%轉化為魔力。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-12",
  "schema": "augment@1",
  "name": "固有結界・魔力海 EX",
  "description": "[最大魔力][最大生命][受傷回魔] 最大魔力的100%同時視為額外最大生命；生命損失的50%轉化為魔力。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "mana",
    "health",
    "reality-marble"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-12.webp",
  "eligibility": {
    "requiresMana": true
  },
  "modifiers": [
    {
      "stat": "maxHealth",
      "op": "percentOf",
      "value": 1.0,
      "from": "maxMana"
    }
  ],
  "hooks": [
    {
      "on": "onDamageTaken",
      "effects": [
        {
          "kind": "eventValueConversion",
          "shape": "single",
          "source": "incomingDamage",
          "basis": "hpLost",
          "ratio": 0.5,
          "to": "mana",
          "who": "self"
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 寶具・死棘之槍 EX

<a id="grail-ex-13"></a>

| | |
|---|---|
| **id** | `grail-ex-13` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `r-hit` `execute` `noble-phantasm` |
| **觸發事件** | 技能命中時 · CD 30s |
| **效果機制** | `devour` |
| **條件葉** | `stat` |
| **靈基適性條件** | 需要自己有技能傷害；需要 R |

> [R命中][處決] R命中最大生命10%以下的敵方英雄時，直接處決目標，無視護盾。30秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-13",
  "schema": "augment@1",
  "name": "寶具・死棘之槍 EX",
  "description": "[R命中][處決] R命中最大生命10%以下的敵方英雄時，直接處決目標，無視護盾。30秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "r-hit",
    "execute",
    "noble-phantasm"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-13.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ],
    "requiresAbilitySlots": [
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "devour",
          "shape": "single",
          "thresholdPctOfMax": [
            0.1
          ],
          "healPct": 0,
          "victim": "champion",
          "throughShields": true
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "abilitySlot": "R",
      "internalCooldown": 30,
      "condition": {
        "kind": "stat",
        "subject": "target",
        "stat": "hp",
        "mode": "percent",
        "op": "<=",
        "value": 0.1
      }
    }
  ]
}
```

</details>

---

### 概念武裝・起源彈 EX

<a id="grail-ex-14"></a>

| | |
|---|---|
| **id** | `grail-ex-14` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `r-hit` `dispel` `shield-break` |
| **觸發事件** | 技能命中時 · CD 30s |
| **效果機制** | `dispel` `shieldBreak` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害；需要 R |

> [R命中][驅散][破盾] R命中敵方英雄時，移除其全部可驅散增益與全部護盾。30秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-14",
  "schema": "augment@1",
  "name": "概念武裝・起源彈 EX",
  "description": "[R命中][驅散][破盾] R命中敵方英雄時，移除其全部可驅散增益與全部護盾。30秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "r-hit",
    "dispel",
    "shield-break"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-14.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ],
    "requiresAbilitySlots": [
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "dispel",
          "shape": "single",
          "pools": {
            "status": false,
            "shields": false,
            "dot": false,
            "buffs": true
          },
          "polarity": "buff",
          "order": "newest"
        },
        {
          "kind": "shieldBreak",
          "shape": "single",
          "count": 20,
          "order": "newest"
        }
      ],
      "target": "event",
      "victim": "enemyChampion",
      "abilitySlot": "R",
      "internalCooldown": 30
    }
  ]
}
```

</details>

---

### 魔術禮裝・寶石劍 EX

<a id="grail-ex-15"></a>

| | |
|---|---|
| **id** | `grail-ex-15` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `ability-cast` `proxy-cast` `magic-craft` |
| **觸發事件** | 施法時 · 25% |
| **效果機制** | `proxyCast` |
| **條件葉** | — |
| **靈基適性條件** | 需要 QWER |

> [技能施放][機率再演] 每次施放Q／W／E／R時，有25%機率立即免費再施放一次相同技能。再演不會再次觸發本願望。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-15",
  "schema": "augment@1",
  "name": "魔術禮裝・寶石劍 EX",
  "description": "[技能施放][機率再演] 每次施放Q／W／E／R時，有25%機率立即免費再施放一次相同技能。再演不會再次觸發本願望。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "ability-cast",
    "proxy-cast",
    "magic-craft"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-15.webp",
  "eligibility": {
    "requiresAbilitySlots": [
      "Q",
      "W",
      "E",
      "R"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "Q",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        }
      ],
      "target": "self",
      "abilitySlot": "Q",
      "chance": 0.25,
      "internalCooldownScope": "perAbilitySlot"
    },
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "W",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        }
      ],
      "target": "self",
      "abilitySlot": "W",
      "chance": 0.25,
      "internalCooldownScope": "perAbilitySlot"
    },
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "E",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        }
      ],
      "target": "self",
      "abilitySlot": "E",
      "chance": 0.25,
      "internalCooldownScope": "perAbilitySlot"
    },
    {
      "on": "onAbilityCast",
      "effects": [
        {
          "kind": "proxyCast",
          "shape": "single",
          "slot": "R",
          "payCosts": "none",
          "respectCooldown": false,
          "requireLearned": true,
          "rankMode": "casterRank",
          "targetMode": "reresolve",
          "maxDepth": 1,
          "emitCastEvents": false
        }
      ],
      "target": "self",
      "abilitySlot": "R",
      "chance": 0.25,
      "internalCooldownScope": "perAbilitySlot"
    }
  ]
}
```

</details>

---

### 秘劍・燕返 EX

<a id="grail-ex-16"></a>

| | |
|---|---|
| **id** | `grail-ex-16` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 連動 —— 與現有英雄／裝備／願望產生連動 |
| **標籤** | `grail-wish` `basic-attack` `multi-hit` `secret-sword` |
| **觸發事件** | 普攻時 · 30% |
| **效果機制** | `damage` `delayed` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [普攻][多重投影] 每次普通攻擊有30%機率產生兩次額外攻擊投影，每次造成100% AD物理傷害，但不觸發其他On-hit。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-16",
  "schema": "augment@1",
  "name": "秘劍・燕返 EX",
  "description": "[普攻][多重投影] 每次普通攻擊有30%機率產生兩次額外攻擊投影，每次造成100% AD物理傷害，但不觸發其他On-hit。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "basic-attack",
    "multi-hit",
    "secret-sword"
  ],
  "selectionSlot": "synergy",
  "icon": "assets/icons/augments/grail-ex-16.webp",
  "hooks": [
    {
      "on": "onBasicAttack",
      "effects": [
        {
          "kind": "delayed",
          "shape": "single",
          "delaySec": 0.1,
          "count": 2,
          "intervalSec": 0.1,
          "targetMode": "frozen",
          "dropDeadTargets": true,
          "stopOnCasterDeath": false,
          "effects": [
            {
              "kind": "damage",
              "damageType": "physical",
              "amount": {
                "ratios": [
                  {
                    "stat": "ad",
                    "coeff": 1.0
                  }
                ]
              },
              "applyTo": "target"
            }
          ]
        }
      ],
      "target": "event",
      "victim": "enemy",
      "chance": 0.3
    }
  ]
}
```

</details>

---

### 靈基換裝・零距離決戰 EX

<a id="grail-ex-17"></a>

| | |
|---|---|
| **id** | `grail-ex-17` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ranged-only` `range-sacrifice` `cooldown-reset` |
| **觸發事件** | 普攻時 · CD 6s |
| **效果機制** | `modifyCooldown` |
| **條件葉** | — |
| **靈基適性條件** | 僅遠程 |

> [射程捨棄][技能重置] 僅遠程英雄可選。普攻距離固定為近戰・中1.6；普攻命中英雄時完成Q／W／E／R冷卻。6秒冷卻。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-17",
  "schema": "augment@1",
  "name": "靈基換裝・零距離決戰 EX",
  "description": "[射程捨棄][技能重置] 僅遠程英雄可選。普攻距離固定為近戰・中1.6；普攻命中英雄時完成Q／W／E／R冷卻。6秒冷卻。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "ranged-only",
    "range-sacrifice",
    "cooldown-reset"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-17.webp",
  "eligibility": {
    "onlyAttackType": "ranged"
  },
  "modifiers": [
    {
      "stat": "range",
      "op": "override",
      "value": 1.6
    }
  ],
  "hooks": [
    {
      "on": "onBasicAttack",
      "effects": [
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "Q",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "W",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "E",
          "mode": "reset"
        },
        {
          "kind": "modifyCooldown",
          "shape": "single",
          "who": "self",
          "slot": "R",
          "mode": "reset"
        }
      ],
      "target": "self",
      "victim": "enemyChampion",
      "internalCooldown": 6
    }
  ]
}
```

</details>

---

### 魔術刻印・生命爐心 EX

<a id="grail-ex-18"></a>

| | |
|---|---|
| **id** | `grail-ex-18` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `health` `mana` `magic-crest` |
| **觸發事件** | 受到傷害時 |
| **效果機制** | `eventValueConversion` |
| **條件葉** | — |
| **靈基適性條件** | 需要魔力 |

> [最大生命][最大魔力][受傷回魔] 最大生命的100%同時視為額外最大魔力；生命損失的25%轉化為魔力。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-18",
  "schema": "augment@1",
  "name": "魔術刻印・生命爐心 EX",
  "description": "[最大生命][最大魔力][受傷回魔] 最大生命的100%同時視為額外最大魔力；生命損失的25%轉化為魔力。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "health",
    "mana",
    "magic-crest"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-18.webp",
  "eligibility": {
    "requiresMana": true
  },
  "modifiers": [
    {
      "stat": "maxMana",
      "op": "percentOf",
      "value": 1.0,
      "from": "maxHealth"
    }
  ],
  "hooks": [
    {
      "on": "onDamageTaken",
      "effects": [
        {
          "kind": "eventValueConversion",
          "shape": "single",
          "source": "incomingDamage",
          "basis": "hpLost",
          "ratio": 0.25,
          "to": "mana",
          "who": "self"
        }
      ],
      "target": "self"
    }
  ]
}
```

</details>

---

### 固有技能・魔力爐心（無限）EX

<a id="grail-ex-19"></a>

| | |
|---|---|
| **id** | `grail-ex-19` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `ability-hit` `infinite-scaling` `ap` |
| **觸發事件** | 技能命中時 |
| **效果機制** | `applyBuff` |
| **條件葉** | — |
| **靈基適性條件** | 需要自己有技能傷害 |

> [技能命中][無限成長] 每次技能命中敵方英雄，永久獲得1 AP，沒有成長上限。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-19",
  "schema": "augment@1",
  "name": "固有技能・魔力爐心（無限）EX",
  "description": "[技能命中][無限成長] 每次技能命中敵方英雄，永久獲得1 AP，沒有成長上限。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "ability-hit",
    "infinite-scaling",
    "ap"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-19.webp",
  "eligibility": {
    "requiresSelfMechanic": [
      "abilityDamage"
    ]
  },
  "hooks": [
    {
      "on": "onAbilityHit",
      "effects": [
        {
          "kind": "applyBuff",
          "modifiers": [
            {
              "stat": "ap",
              "op": "flat",
              "value": 1
            }
          ],
          "permanent": true,
          "applyTo": "self",
          "stackKey": "grail-infinite-mana-core-ex",
          "stackVisual": true,
          "dispellable": false,
          "polarity": "buff"
        }
      ],
      "target": "self",
      "victim": "enemyChampion"
    }
  ]
}
```

</details>

---

### 固有技能・魔力放出（雷）EX

<a id="grail-ex-20"></a>

| | |
|---|---|
| **id** | `grail-ex-20` |
| **階級** | EX級願望（後台 `prismatic`） |
| **權重** | 25 |
| **顯現位置** | 轉向 —— 改變戰術方向的特殊願望 |
| **標籤** | `grail-wish` `attack-speed` `basic-attack` `lightning` |
| **觸發事件** | 普攻時 |
| **效果機制** | `damage` |
| **條件葉** | — |
| **靈基適性條件** | — |

> [攻速][普攻傷害] 每次普通攻擊追加等同「60 × 當前攻速」的魔法傷害。攻速同時決定攻擊頻率與單次威力。

<details><summary>完整 JSON</summary>

```json
{
  "id": "grail-ex-20",
  "schema": "augment@1",
  "name": "固有技能・魔力放出（雷）EX",
  "description": "[攻速][普攻傷害] 每次普通攻擊追加等同「60 × 當前攻速」的魔法傷害。攻速同時決定攻擊頻率與單次威力。",
  "tier": "prismatic",
  "weight": 25,
  "tags": [
    "grail-wish",
    "attack-speed",
    "basic-attack",
    "lightning"
  ],
  "selectionSlot": "pivot",
  "icon": "assets/icons/augments/grail-ex-20.webp",
  "hooks": [
    {
      "on": "onBasicAttack",
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "ratios": [
              {
                "stat": "as",
                "coeff": 60.0
              }
            ]
          },
          "applyTo": "target"
        }
      ],
      "target": "event",
      "victim": "enemy"
    }
  ]
}
```

</details>

---

## ⚠️ 舊增益卡 —— 31 張（預設**不進卡池**）

設計規則 §8「⛔ 禁止所有純屬性增益」把它們排除在預設卡池外。⛔ 一份 JSON 都沒有刪 —— 後台「傳說武器三選一」頁把〈舊增益卡〉切成「兩批一起發」就整批回來。

| id | 名稱 | 階級 | 效果 |
|---|---|---|---|
| `arcane-haste` | 奧術急速 | A級願望 | 施放技能後，攻擊速度與移動速度 +15%，持續 2.5 秒。 |
| `berserkers-fury` | 狂戰之怒 | A級願望 | 攻擊速度 +35%，攻擊力 +15%。 |
| `bone-splitter` | 碎骨 | A級願望 | 每次普攻額外造成 25(+10% 攻擊力) 真實傷害。 |
| `chill-touch` | Chill Touch | A級願望 | Your Q also slows enemies by 25% for 1.5s. |
| `frost-shatter` | 霜寒爆裂 | A級願望 | 技能命中使敵人減速 40%，持續 2 秒。 |
| `guardian-ward` | 守護結界 | A級願望 | 受到傷害時，獲得相當於 6% 最大生命的護盾，持續 3 秒（4 秒冷卻）。 |
| `soul-reaver` | 噬魂 | A級願望 | 擊殺敵人時，回復 15% 最大生命。 |
| `spell-blade` | 咒刃 | A級願望 | 技能命中時，額外造成 30(+25% 法術強度 +15% 攻擊力) 法術傷害（每秒最多觸發一次）。 |
| `aegis-surge` | Aegis Surge | EX級願望 | On ability cast, gain a shield for 8% max HP (3s cooldown). |
| `arcane-overload` | 奧能超載 | EX級願望 | 技能命中時，額外造成 60(+50% 法術強度) 法術傷害（每秒最多觸發一次）。 |
| `blood-tyrant` | 血之暴君 | EX級願望 | 攻擊力 +30%，吸血 +25%，暴擊率 +15%。 |
| `bloodlet-ward` | 放血結界 | EX級願望 | 普攻命中時追加 40 (+15% 攻擊力) 真實傷害（1 秒冷卻）。 |
| `conqueror` | 征服者 | EX級願望 | 擊殺敵人後 8 秒內，攻擊力與法術強度 +35%、攻擊速度 +25%。 |
| `executioner-edge` | 處決者之刃 | EX級願望 | 暴擊率 +30%，暴擊傷害 +50%。 |
| `immortal-bulwark` | 不朽壁壘 | EX級願望 | 最大生命 +30%，護甲 +40，魔法抗性 +40。 |
| `last-stand` | 背水一戰 | EX級願望 | 擊殺敵人時，獲得 10 秒的 +30 護甲與 +30 魔法抗性。 |
| `limit-breaker` | 破限超頻 | EX級願望 | 攻擊速度 ×2，並將攻擊速度上限由 4.0 解鎖至 10.0。 |
| `momentum-core` | 動能核心 | EX級願望 | 施放技能後獲得 6 秒的 +25% 攻擊速度與 +15% 移動速度（4 秒冷卻）。 |
| `overdrive-engine` | 超載引擎 | EX級願望 | 冷卻縮減 +20%，攻擊速度 +50%，移動速度 +15%。 |
| `phantom-step` | 幻影步 | EX級願望 | 迴避 +25%，移動速度 +20%，攻擊速度 +25%。 |
| `second-wind` | 二度風息 | EX級願望 | 受到傷害時，回復 6% 最大生命與 6% 最大魔力（8 秒冷卻）。 |
| `siege-breaker` | 攻城槌 | EX級願望 | 攻擊力 +45%，攻擊距離 +2，但攻擊速度 −15%。 |
| `storm-arrow` | 風暴之矢 | EX級願望 | 普攻時朝面向射出一道穿透風刃，對沿途每個敵人造成 40(+30% 法術強度) 法術傷害（0.5 秒冷卻）。 |
| `titan-heart` | 泰坦之心 | EX級願望 | 最大生命 +40%，生命回復 +15/秒，但移動速度 −8%。 |
| `void-hunger` | 虛空飢渴 | EX級願望 | 法術強度 +35%，冷卻縮減 +15%，最大魔力 +25%。 |
| `arcane-focus` | 奧術專注 | C級願望 | 法術強度 +40，冷卻縮減 +8%。 |
| `bloodlust` | Bloodlust | C級願望 | +15% Attack Damage and +8% Lifesteal. |
| `hunters-instinct` | 獵手直覺 | C級願望 | 暴擊率 +20%，攻擊力 +10%。 |
| `iron-bulwark` | 鐵壁護甲 | C級願望 | 最大生命 +18%，護甲 +20。 |
| `swift-strikes` | 疾風連擊 | C級願望 | 攻擊速度 +25%，移動速度 +8%。 |
| `vital-surge` | 生命湧動 | C級願望 | 最大生命 +12%，每秒生命回復 +25。 |

