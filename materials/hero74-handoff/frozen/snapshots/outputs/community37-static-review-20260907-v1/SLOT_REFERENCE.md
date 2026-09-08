# 37 名／222 槽靜態對照

此檔為來源投影及有限規則檢查，非 222 槽完整遊戲驗收或標準答案。未列旗標不表示正確。原作外部來源未重新查證。

## 01 武藤遊戲 / PASSIVE 〔決鬥者的布局〕

- 原設計：召喚物命中與陷阱成功觸發，各累積布局；每次施法最多增加一層，上限三層，供 EX 消耗。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需補召喚／陷阱成功事件去重、三層布局及 EX 扣除。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/01.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 01 武藤遊戲 / Q 黑魔導

- 原設計：召喚一名可受擊的黑魔導；再次下令可更換攻擊目標，同種召喚物最多一名。
- 現有摘要：召喚 1 名 sela 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。
- 待補說明：黑魔導專屬造型與再次下令換目標未提供；代理採 sela。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/01.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "summon",
      "championId": "sela",
      "count": 1,
      "durationSec": 6,
      "formation": "ring",
      "spread": 1.5,
      "maxAlive": 1,
      "onOwnerDeath": "despawn",
      "hpMult": 0.3,
      "damageMult": 0.25
    }
  ],
  "passive": [],
  "marks": []
}
```

## 01 武藤遊戲 / W 黑魔導女孩

- 原設計：召喚一名可受擊的黑魔導女孩；與黑魔導共同攻擊同一目標時，觸發有內置冷卻的協同追加傷害。
- 現有摘要：召喚 1 名 sela 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。
- 待補說明：黑魔導女孩造型、與黑魔導協同事件未提供；目前同模板上限須驗證跨槽隔離。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/01.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "summon",
      "championId": "sela",
      "count": 1,
      "durationSec": 6,
      "formation": "ring",
      "spread": 1.5,
      "maxAlive": 1,
      "onOwnerDeath": "despawn",
      "hpMult": 0.3,
      "damageMult": 0.25
    }
  ],
  "passive": [],
  "marks": []
}
```

## 01 武藤遊戲 / E 神聖彗星・反射力量

- 原設計：設置一個可辨識的陷阱；範圍內首次敵方普攻觸發時，抵消該次攻擊並反擊來源，隨後消失。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-01-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：目標設計是一次觸發陷阱與反射；目前只有自身護盾，不能驗收陷阱。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/01.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-01-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 01 武藤遊戲 / R 歐西里斯的天空龍

- 原設計：以天空龍投影演出有預警的區域雷擊；此招是一次性施法投影，不增加常駐召喚物。
- 現有摘要：指定落點半徑 300 wc3u 的一次大級範圍傷害。
- 待補說明：天空龍投影是待製資產；預覽以雷電區域脈衝表達。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/01.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "大",
        "ratios": [],
        "flat": 1500,
        "perRank": [
          0,
          1125,
          2250
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 01 武藤遊戲 / EX 黑・魔・導

- 原設計：消耗布局，由存活的黑魔導射出強化直線魔法；缺少黑魔導時顯示使用條件。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需由存活黑魔導發射並消耗布局；目前是英雄本體施法。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/01.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 02 八神庵 / PASSIVE 〔八神之炎〕

- 原設計：不同主動技能連續命中同一敵人，累積最多三層紫炎；下一次終結技消耗層數增傷。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需技能命中三層紫炎與終結技消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/02.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 02 八神庵 / Q 百八式・闇拂

- 原設計：沿地面前進的紫炎投射物，遇到有效碰撞結算。
- 現有摘要：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。
- 待補說明：推進波並非遇第一個單位即停的投射物。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：UNDISCLOSED_TERMINAL_DAMAGE
- 來源：GGD社群英雄上傳內容_37名/recipes/02.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 1.83,
      "side": "enemies",
      "delaySec": 0.12,
      "count": 4,
      "intervalSec": 0.12,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "finalEffects": [
        {
          "kind": "damageArea",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          },
          "radius": 8.25
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 02 八神庵 / W 百式・鬼燒

- 原設計：原地上升火焰打擊，提供短暫迎擊窗口與有限擊退。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：固定落點跳擊；需原地迎擊與受擊窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/02.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.72,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 02 八神庵 / E 百二十七式・葵花

- 原設計：三段接續技；每段須在指定窗口再次輸入，逾時、受控或第三段完成後結束。
- 現有摘要：3 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：目前一次施法完成三段；需三次輸入窗口及中斷狀態機。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/02.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.54
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.54,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 02 八神庵 / R 禁千二百十一式・八稚女

- 原設計：突進命中後進入有限連擊，最後一擊引爆紫炎層數。
- 現有摘要：8 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：缺命中突進接續與紫炎引爆。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/02.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 3,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 1.44
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 1.44,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              375,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 02 八神庵 / EX 裏三百十六式・豺華

- 原設計：可獨立使用；在八稚女完成後的短窗口內使用，改為接續追擊並消耗自己的冷卻。
- 現有摘要：3 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：獨立三段追擊；需接八稚女成功事件的使用窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/02.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200
      },
      "intervalSec": 0.18,
      "durationSec": 0.54
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.54,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 03 不知火舞 / PASSIVE 〔不知火流身法〕

- 原設計：完成位移後獲得一次短效普攻強化；刷新不疊加。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需位移完成後一次普攻增益，刷新不疊加。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/03.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 03 不知火舞 / Q 花蝶扇

- 原設計：投出扇子，對沿途合法目標造成傷害。
- 現有摘要：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。
- 待補說明：扇子模型及逐彈碰撞需補，模板是分段傷害波。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：UNDISCLOSED_TERMINAL_DAMAGE
- 來源：GGD社群英雄上傳內容_37名/recipes/03.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 1.83,
      "side": "enemies",
      "delaySec": 0.12,
      "count": 4,
      "intervalSec": 0.12,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "finalEffects": [
        {
          "kind": "damageArea",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          },
          "radius": 8.25
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 03 不知火舞 / W 龍炎舞

- 原設計：向前揮出近身火焰弧，適合迎擊貼身敵人。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：目前為窄直線，需前方近身弧形判定。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/03.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 03 不知火舞 / E 必殺忍蜂

- 原設計：直線突進撞擊；遇牆或到達最大距離停止。
- 現有摘要：向指定方向突進 300 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：核對 Owner 原文與模擬／畫面後才可驗收。
- 原始狀態：base-mapping-needs-behavior-test
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/03.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 5.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 03 不知火舞 / R 超必殺忍蜂

- 原設計：有明顯起手的強化突進連擊，末段小範圍爆發。
- 現有摘要：4 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：缺突進命中後才接連擊條件。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/03.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 3,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.72
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.72,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              375,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 03 不知火舞 / EX 陽炎之舞

- 原設計：短時間產生跟隨施法的火焰殘像；追加傷害有次數上限，殘像不獨立尋敵。
- 現有摘要：自身取得 3 秒增益：ad +15%。
- 待補說明：目前為自身 3 秒 +15% AD；需限次跟隨施法殘像及去重。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/03.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 04 空條承太郎 / PASSIVE 〔白金之星・精密動作〕

- 原設計：近距離命中累積精密層數；滿層後強化下一次 Q 的末擊。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需精密層數與 Q 末擊消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/04.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 04 空條承太郎 / Q 歐拉連打

- 原設計：白金之星在前方進行多段拳擊，每段重新確認距離與目標。
- 現有摘要：6 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：需逐段距離重新檢查、替身掛點及雙模型動作。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/04.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 1.08
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 1.08,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 04 空條承太郎 / W 流星指刺

- 原設計：中短距離直線刺擊，用於追擊離開普攻範圍的敵人。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需單條流星指刺與單目標去重。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/04.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 04 空條承太郎 / E 〔替身護衛〕

- 原設計：白金之星進入短暫防禦姿態，減免一次正面攻擊並推開近身敵人。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-04-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：需正面一次格擋與推開近敵，不能以一般護盾驗收。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/04.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-04-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 04 空條承太郎 / R 白金之星・世界

- 原設計：建立短暫局部時停區域。暫停範圍內敵方單位的動作與指定計時器，以及敵方投射物運動。對決倒數及時停自身的結束計時繼續。承太郎在期間造成的命中記入有限佇列，時停結束後依序結算。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.8,"applyTo":"target","stun":true}]。
- 待補說明：此槽僅單體 0.8 秒暈眩作模板預覽；局部時停、投射物暫停、計時器分類及命中佇列尚未提供。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/04.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          375,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "stun",
      "duration": 0.8,
      "applyTo": "target",
      "stun": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 04 空條承太郎 / EX 〔歐拉終結拳〕

- 原設計：有起手動作的重拳；時停期間使用時，加入同一套待結算命中佇列。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：目前立即结算；需與時停共用待結算佇列。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/04.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 05 洛克人 / PASSIVE 〔武器能源管理〕

- 原設計：特殊武器共用有限能源；能源隨時間恢復，切換武器不補滿。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需共用武器能源、恢復與切換保留；預覽沿用 GGD 魔力。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/05.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 05 洛克人 / Q 洛克砲

- 原設計：按住蓄力、放開射擊；依蓄力階段決定彈體與傷害。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：目前固定起手；需按住／放開與分段蓄力。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/05.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 05 洛克人 / W Metal Blade

- 原設計：投出金屬刀刃，可選擇射擊方向，消耗武器能源。
- 現有摘要：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。
- 待補說明：Metal Blade 的方向與刀刃模型待補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：UNDISCLOSED_TERMINAL_DAMAGE
- 來源：GGD社群英雄上傳內容_37名/recipes/05.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 1.83,
      "side": "enemies",
      "delaySec": 0.12,
      "count": 4,
      "intervalSec": 0.12,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "finalEffects": [
        {
          "kind": "damageArea",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          },
          "radius": 8.25
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 05 洛克人 / E Leaf Shield

- 原設計：形成有限耐久的葉片護盾；再次使用可將剩餘葉片射出。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-05-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：缺再次輸入射出剩餘葉片及護盾剩餘量換算。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/05.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-05-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 05 洛克人 / R 〔全武裝齊射〕

- 原設計：按固定次序發射砲彈、刀刃與葉片，整套共享總傷害預算。
- 現有摘要：在指定區域依序落下 6 發；每發間隔 0.35 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：彈種固定時序及整套共享總預算需補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/05.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.35,
      "durationSec": 1.75,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 05 洛克人 / EX 〔特殊武器切換〕

- 原設計：讓 Q 在洛克砲與已核准的特殊武器版本間切換；保留各自冷卻與共用能源。
- 現有摘要：自身取得 3 秒增益：as +20%。
- 待補說明：僅自身攻速增益；需 Q 技能版本切換、圖示與共用冷卻。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/05.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 06 卡比 / PASSIVE 〔圓滾滾的韌性〕

- 原設計：脫離戰鬥後逐步恢復少量生命；受擊即中斷。
- 現有摘要：本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。
- 待補說明：免死只是驗收底稿；需脫戰漸進回血且受擊中斷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/06.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": [],
  "marks": [
    {
      "markId": "community-review-06-20260907.last-chance",
      "initial": 1,
      "max": 1,
      "durationSec": -1,
      "resetOn": "match",
      "perStackLost": [],
      "lethal": {
        "consume": 1,
        "surviveHpPct": 0.01,
        "damageTypes": [
          "physical",
          "magic",
          "true"
        ],
        "internalCooldown": 1,
        "selfEffects": [
          {
            "kind": "invulnerable",
            "durationSec": 0.5,
            "applyTo": "self",
            "blocksControl": true
          },
          {
            "kind": "restore",
            "healthPct": 0.15
          }
        ],
        "aoeEffects": [],
        "aoeRadius": 0
      }
    }
  ]
}
```

## 06 卡比 / Q 吸入

- 原設計：錐形牽引；短暫含住一個合法目標或可吸收物件，期間移動受限。
- 現有摘要：拖拉指定目標後向前投擲 120 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。
- 待補說明：不是錐形吸入與含住；需吞入持有狀態、單目標釋放。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/06.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "target",
      "mode": "toPoint",
      "apexHeight": 0.005,
      "durationSec": 0.45,
      "throwDistance": 2.2,
      "dragToCaster": true,
      "landRadius": 2,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [
              {
                "stat": "ap",
                "coeff": 0.4082
              }
            ],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 06 卡比 / W 吐出

- 原設計：含住目標時將其安全釋放並射出星彈；空腹時只能使用較弱的普通星彈。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：目前固定星光線；需持有物判斷與安全吐出。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/06.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 06 卡比 / E 石頭

- 原設計：變為石頭，短暫大幅減傷且無法移動；結束後恢復原狀。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":160,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-06-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：需石頭形態、禁移動與禁施法，護盾不足以代表變石。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/06.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 160,
        "ratios": [],
        "perRank": [
          0,
          80,
          160,
          240
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-06-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 06 卡比 / R 超級巨劍

- 原設計：有預警的大範圍揮砍，提供卡比本體的固定終結能力。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：巨劍造型待補；目前四段直線物理波。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/06.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 06 卡比 / EX 複製能力

- 原設計：從最近成功吸入的英雄取得一個核准的 Q 技能版本，替換自己的 Q，限時或用盡次數後還原。首批白名單：八神庵闇拂、不知火舞花蝶扇、御坂美琴電擊之槍。其他目標明確顯示不可複製。
- 現有摘要：指定單一敵人造成小級魔法傷害。
- 待補說明：固定魔法攻擊供預覽；需三技能白名單、暫存副本、死亡還原。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/06.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 07 西索 / PASSIVE 〔魔術師的節奏〕

- 原設計：以不同技能命中同一目標，強化下一次撲克牌攻擊；最多保存一次。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需不同技能序列及下一次牌擊消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/07.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 07 西索 / Q 〔撲克牌連射〕

- 原設計：扇形投出三張牌，同一目標的額外命中採遞減傷害。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.12 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：三發為落點散射；需扇形牌彈與同目標遞減。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/07.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.12,
      "durationSec": 0.24,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 07 西索 / W 伸縮自在的愛

- 原設計：將念線附著於一個敵人或合法場景錨點；超距、死亡或期限到達時斷線。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"root","duration":0.7,"applyTo":"target","root":true}]。
- 待補說明：只有短暫鎖足；需有端點的彈性連線及斷線規則。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/07.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "root",
      "duration": 0.7,
      "applyTo": "target",
      "root": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 07 西索 / E 〔收線〕

- 原設計：附著敵人時牽引敵人；附著錨點時拉動自己。兩種行為都受碰撞與最大位移限制。
- 現有摘要：拖拉指定目標後向前投擲 120 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。
- 待補說明：僅敵人抓投；需錨點拉動自己與敵人牽引的分支。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/07.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "target",
      "mode": "toPoint",
      "apexHeight": 0.005,
      "durationSec": 0.45,
      "throwDistance": 2.2,
      "dragToCaster": true,
      "landRadius": 2,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [
              {
                "stat": "ap",
                "coeff": 0.4082
              }
            ],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 07 西索 / R 〔彈性殺陣〕

- 原設計：短暫建立最多兩條額外念線，結束時向中心牽引一次。
- 現有摘要：指定落點半徑 300 wc3u 的一次小級範圍傷害。
- 待補說明：目前單次區域傷害；需最多兩條额外念線及一次中心牽引。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/07.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          375,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 07 西索 / EX 輕薄的假象

- 原設計：在地面製作一個假的陷阱外觀，或改變自身表面外觀。偽裝不改變真實陣營、碰撞與伺服器身分。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：僅短效移速；需假陷阱／表面偽裝及敵我顯示隔離。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/07.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 08 米卡莎 / PASSIVE 〔阿卡曼戰鬥直覺〕

- 原設計：成功避開攻擊後，下一次刀刃命中獲得有限增傷；有觸發間隔。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需有效閃避事件、內置冷卻與下一刀增傷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/08.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 08 米卡莎 / Q 〔雙刃斬擊〕

- 原設計：近身雙段斬擊，消耗刀刃耐久。
- 現有摘要：2 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：缺刀刃耐久。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/08.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.36
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.36,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 08 米卡莎 / W 立體機動裝置

- 原設計：射出鉤索連接合法錨點，消耗氣體沿路徑移動。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：需合法場景錨點、鉤索路径、氣體消耗；不是自由跳躍。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/08.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 1,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 08 米卡莎 / E 〔補給與換刃〕

- 原設計：短暫停留更換刀刃並補充部分氣體；受到控制會中斷。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"restore","manaPct":0.15,"applyTo":"self"}]。
- 待補說明：需換刃及氣體資源／控制中斷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/08.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "restore",
      "manaPct": 0.15,
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 08 米卡莎 / R 雷槍

- 原設計：發射兩支可辨識的雷槍，命中或落地後延遲爆炸。
- 現有摘要：在指定區域依序落下 2 發；每發間隔 0.4 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：兩發落點爆炸；需雷槍投射物、黏附與延遲引爆。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/08.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.4,
      "durationSec": 0.4,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 08 米卡莎 / EX 〔立體機動・迴旋斬〕

- 原設計：選定錨點與敵人後，沿限定弧線移動斬擊；路線失效時安全停止。
- 現有摘要：向指定方向突進 400 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：目前直線；需錨點弧線與路徑失效停止。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/08.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 7.33,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 09 赫蘿 / PASSIVE 〔賢狼的眼光〕

- 原設計：參與有效助攻獲得交易籌碼，上限三枚；同一擊殺事件只結算一次。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需助攻一次性籌碼，上限三枚。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/09.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 09 赫蘿 / Q 〔狼牙警告〕

- 原設計：短距離狼影撲咬，造成傷害與短暫緩速。
- 現有摘要：指定單一敵人造成小級物理傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1,"applyTo":"target","moveSpeedMult":0.7}]。
- 待補說明：狼影造型待補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/09.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "slow30",
      "duration": 1,
      "applyTo": "target",
      "moveSpeedMult": 0.7
    }
  ],
  "passive": [],
  "marks": []
}
```

## 09 赫蘿 / W 〔行商議價〕

- 原設計：消耗一枚籌碼，取得少量當局戰鬥金幣；每回合最多三次。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"restore","manaPct":0.1,"applyTo":"self"}]。
- 待補說明：預覽只回復 10% 魔力；需籌碼消耗與每回合三次戰鬥金幣交易。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/09.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "restore",
      "manaPct": 0.1,
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 09 赫蘿 / E 〔麥穗庇護〕

- 原設計：為指定友軍提供小額護盾及短效移速。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-09-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：目前自身；需指定友軍盾與加速。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/09.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-09-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 09 赫蘿 / R 賢狼真身

- 原設計：變為有限體型的大狼，強化普攻與 Q，暫時失去 W 的交易功能。
- 現有摘要：自身取得 4 秒增益：ad +15%、極小級移速。
- 待補說明：目前 4 秒 AD／移速；需狼形態、碰撞調整、Q 替換及 W 禁用。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/09.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 4
    }
  ],
  "passive": [],
  "marks": []
}
```

## 09 赫蘿 / EX 〔豐收的約定〕

- 原設計：消耗剩餘籌碼，按消耗量強化附近友軍的護盾；不另外產生金幣。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":150,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-09-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：目前自身固定盾；需扣除剩餘籌碼並擴展附近友軍。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/09.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 150,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-09-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 10 魯路修 / PASSIVE 〔戰局推演〕

- 原設計：友軍命中自己的戰術標記時累積指揮層數，同一技能多段命中只計一次。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需友軍命中戰術標記與施法去重指揮層數。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/10.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 10 魯路修 / Q 〔戰術射擊〕

- 原設計：中距離單發射擊，對帶標記目標造成額外傷害。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：缺戰術標記額外傷害。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/10.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 10 魯路修 / W 〔集中火力〕

- 原設計：標記一個可見敵人，讓下一次友軍有效命中獲得追加效果。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。
- 待補說明：固定緩速；需標記與下一次友軍命中消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/10.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "slow30",
      "duration": 1.5,
      "applyTo": "target",
      "moveSpeedMult": 0.7
    }
  ],
  "passive": [],
  "marks": []
}
```

## 10 魯路修 / E 〔撤退指令〕

- 原設計：為附近友軍提供朝安全方向移動時的短效加速。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：目前只加速自身；需朝安全方向移動的友軍條件。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/10.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 10 魯路修 / R 絕對遵守的 Geass

- 原設計：在視線成立後，命令一名敵人沿合法路徑朝指定位置移動，持續約 1 秒。每名目標每回合只能成功受此命令一次；控制免疫或視線失敗時不記為成功。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.8,"applyTo":"target","stun":true}]。
- 待補說明：單體 0.8 秒暈眩不能代替 Geass；需視線、強制合法移動與每目標每回合成功一次。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/10.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          375,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "stun",
      "duration": 0.8,
      "applyTo": "target",
      "stun": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 10 魯路修 / EX 〔Checkmate〕

- 原設計：消耗指揮層數，對已標記區域發動有預警的戰術打擊。
- 現有摘要：指定落點半徑 300 wc3u 的一次中級範圍傷害。
- 待補說明：缺指揮層數消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/10.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "中",
        "ratios": [],
        "flat": 1000
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 11 利姆路 / PASSIVE 大賢者

- 原設計：分析最近承受的技能類型，提供該類型的短效有限減傷；同時只保存一種分析結果。
- 現有摘要：受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。
- 待補說明：需最近受擊類型分析及同時只留一種減傷結果。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/11.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onDamageTaken",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 4,
            "chance": 1,
            "target": "event"
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 11 利姆路 / Q 水刃

- 原設計：直線水刃，可穿過有限數量目標。
- 現有摘要：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。
- 待補說明：需穿透人數上限及單彈命中去重。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：UNDISCLOSED_TERMINAL_DAMAGE
- 來源：GGD社群英雄上傳內容_37名/recipes/11.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 1.83,
      "side": "enemies",
      "delaySec": 0.12,
      "count": 4,
      "intervalSec": 0.12,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "finalEffects": [
        {
          "kind": "damageArea",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          },
          "radius": 8.25
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 11 利姆路 / W 捕食者

- 原設計：短窗口吸收一個白名單敵方投射物，取消其後續命中並保存分析樣本。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-11-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：護盾不會吸收或刪除敵彈；需白名單投射物與樣本持有。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/11.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-11-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 11 利姆路 / E 擬態

- 原設計：在人形與史萊姆形態間切換，改變普攻及移動表現，保留生命、資源與冷卻。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：需人形／史萊姆形態、普攻替換與生命冷卻保留。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/11.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 11 利姆路 / R 黑炎

- 原設計：在指定區域產生有限脈衝的黑炎，結束後清理全部區域效果。
- 現有摘要：指定落點維持 3 秒的小級半徑傷害區，每秒一跳極小級傷害。
- 待補說明：固定 3 秒黑炎可作基本區域驗收；黑炎色覆寫。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/11.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 4.5,
      "radiusTier": "小",
      "side": "enemies",
      "delaySec": 1,
      "count": 3,
      "intervalSec": 1,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "mult": 0.3333333333333333,
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 11 利姆路 / EX 〔解析完成・能力再現〕

- 原設計：消耗 W 的樣本，以自己的屬性施放一次核准的技能副本；使用後清空樣本。
- 現有摘要：指定單一敵人造成小級魔法傷害。
- 待補說明：固定攻擊不是能力副本；需樣本版本、消耗與禁止遞迴。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/11.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 12 衛宮士郎 / PASSIVE 〔武器解析〕

- 原設計：近戰交鋒累積解析層數，降低下一次投影的資源消耗；有最低消耗限制。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需近戰解析層與投影最低資源消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/12.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 12 衛宮士郎 / Q 干將・莫邪

- 原設計：投影雙劍進行近身交叉斬擊。
- 現有摘要：2 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：雙劍掛點與交叉斬動畫待製。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/12.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.36
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.36,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 12 衛宮士郎 / W 〔投影・飛劍〕

- 原設計：將有限數量的投影劍射向指定方向。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.15 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：目前定點三發落劍；需按方向投影飛劍。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/12.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.15,
      "durationSec": 0.3,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 12 衛宮士郎 / E 〔強化・踏步〕

- 原設計：短距離移動並強化下一次近戰命中。
- 現有摘要：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：缺下一次近戰強化。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/12.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 4.58,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 12 衛宮士郎 / R 無限劍製

- 原設計：展開有期限的劍域，強化 W 並在固定節奏追加投影劍；領域不改寫地圖邊界。
- 現有摘要：指定落點維持 3 秒的小級半徑傷害區，每秒一跳極小級傷害。
- 待補說明：目前領域傷害；需領域内 W 強化、投影劍生成與退出還原。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/12.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 4.5,
      "radiusTier": "小",
      "side": "enemies",
      "delaySec": 1,
      "count": 3,
      "intervalSec": 1,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "mult": 0.3333333333333333,
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 12 衛宮士郎 / EX 〔投影・迎擊〕

- 原設計：投影武器攔截一次正面攻擊，成功後開啟一次反擊。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-12-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：需一次正面迎擊成功後反擊窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/12.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-12-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 13 朝田詩乃 / PASSIVE 〔狙擊專注〕

- 原設計：保持穩定姿勢累積瞄準，移動或受擊降低；效果有上限。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需静止瞄準層與移動受傷衰退。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/13.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 13 朝田詩乃 / Q 〔Hecate II・精準射擊〕

- 原設計：短蓄力直線射擊，依瞄準層數提高傷害。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：固定起手分段線；需蓄力、射線掩體與瞄準層增傷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/13.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 13 朝田詩乃 / W 〔觀測射界〕

- 原設計：顯示有效射線與遮蔽物，短暫標記一名已可見敵人。
- 現有摘要：自身取得 3 秒增益：as +20%。
- 待補說明：目前攻速增益；需射界 UI、合法可見敵人的觀測標記。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/13.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 13 朝田詩乃 / E 〔戰術翻滾〕

- 原設計：短距離翻滾，打斷自己的瞄準並重新定位。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：翻滾應為貼地移動且清空瞄準，目前是低弧跳躍。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/13.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.28,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 13 朝田詩乃 / R 〔Hecate II・決定性一槍〕

- 原設計：較長瞄準後射出高傷害子彈，敵人可見射線預警。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需單發高傷害射線、較長瞄準與移動取消。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/13.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 13 朝田詩乃 / EX 〔副武器應急射擊〕

- 原設計：近距離快速射擊，附帶小幅後退；給狙擊手有限自保能力。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：缺小幅後退位移。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/13.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 14 殺老師 / PASSIVE 〔教師的觀察〕

- 原設計：同一敵人反覆以相同招式攻擊時，短暫提高對該招的有限防禦；不同技能可打破適應。
- 現有摘要：受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。
- 待補說明：需按敵人技能 ID 適應，不是所有受擊反擊。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/14.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onDamageTaken",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 4,
            "chance": 1,
            "target": "event"
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 14 殺老師 / Q 〔觸手批改〕

- 原設計：前方多段觸手打擊，整招共享觸發次數上限。
- 現有摘要：4 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：觸手多掛點與整招觸發上限待補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/14.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.72
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.72,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 14 殺老師 / W 〔高速授課〕

- 原設計：沿指定路線快速移動，到達終點時給附近友軍短效加速。
- 現有摘要：向指定方向突進 450 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：缺到達終點後的友軍加速。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/14.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 8.25,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 14 殺老師 / E 〔觸手再生〕

- 原設計：消耗資源分段恢復生命，受控制時停止。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。
- 待補說明：目前立即回血；需分段再生與受控中止。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/14.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "heal",
      "amount": {
        "flat": 100,
        "ratios": [],
        "perRank": [
          0,
          50,
          100,
          150
        ]
      },
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 14 殺老師 / R 完全防禦形態

- 原設計：進入短暫球體防禦，期間無法移動及施法；結束後有明顯恢復動作。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":180,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-14-20260907.r.guard","onExisting":"keepLarger"}]。
- 待補說明：需球體變形、禁移動禁施法與限時防禦；目前只有盾。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/14.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 180,
        "ratios": [],
        "perRank": [
          0,
          135,
          270
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-14-20260907.r.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 14 殺老師 / EX 〔分身式教學〕

- 原設計：以高速殘像演出三處依序打擊，實際由同一本體按時序結算。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.2 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：三個落點固定脈衝；需本體依序定位及殘像對齊。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/14.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200
      },
      "intervalSec": 0.2,
      "durationSec": 0.4,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 15 比利海靈頓 / PASSIVE 〔兄貴的氣勢〕

- 原設計：成功抓取或保護友軍累積氣勢，上限三層。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需抓取成功／有效保護事件的氣勢資源。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/15.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 15 比利海靈頓 / Q 〔正面擒抱〕

- 原設計：抓取一名近身敵人，雙方短暫進入配對動作；抓取總時間有上限。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：核對 Owner 原文與模擬／畫面後才可驗收。
- 原始狀態：base-mapping-needs-behavior-test
- 本次靜態旗標：BILLY_MAPPING_OR_REFINEMENT_WRONG
- 來源：GGD社群英雄上傳內容_37名/recipes/15.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 15 比利海靈頓 / W 〔肌肉防線〕

- 原設計：消耗氣勢提高短期防禦，無氣勢時仍有較弱效果。
- 現有摘要：拖拉指定目標後向前投擲 200 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。
- 待補說明：雙人摔角動作、抓取免疫與同步挂點須驗收。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：BILLY_MAPPING_OR_REFINEMENT_WRONG
- 來源：GGD社群英雄上傳內容_37名/recipes/15.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "target",
      "mode": "toPoint",
      "apexHeight": 0.005,
      "durationSec": 0.45,
      "throwDistance": 3.67,
      "dragToCaster": true,
      "landRadius": 2,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [
              {
                "stat": "ap",
                "coeff": 0.4082
              }
            ],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 15 比利海靈頓 / E 〔肩膀衝撞〕

- 原設計：向前衝撞，命中第一名敵人後停止。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-15-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：需保護指定友軍與氣勢；目前自身。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：BILLY_MAPPING_OR_REFINEMENT_WRONG
- 來源：GGD社群英雄上傳內容_37名/recipes/15.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-15-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 15 比利海靈頓 / R 〔兄貴背摔〕

- 原設計：對抓取中的目標進行背摔；未抓取時先做可被閃避的近身捕捉。
- 現有摘要：拖拉指定目標後向前投擲 400 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。
- 待補說明：目前單次投擲；需大摔技雙人動作同步與有限區域衝擊。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/15.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "target",
      "mode": "toPoint",
      "apexHeight": 0.005,
      "durationSec": 0.45,
      "throwDistance": 7.33,
      "dragToCaster": true,
      "landRadius": 2,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [
              {
                "stat": "ap",
                "coeff": 1.4577
              }
            ],
            "flat": 500,
            "perRank": [
              0,
              375,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 15 比利海靈頓 / EX 〔兄弟站起來〕

- 原設計：為附近友軍提供護盾與短效韌性，以振奮及健美姿勢演出。
- 現有摘要：自身取得 3 秒增益：as +20%；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":100,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-15-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：需氣勢消耗及附近隊友；目前自身攻速與盾。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：BILLY_MAPPING_OR_REFINEMENT_WRONG
- 來源：GGD社群英雄上傳內容_37名/recipes/15.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 100,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-15-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 16 魔法少女☆伊莉雅 / PASSIVE 〔紅寶石的支援〕

- 原設計：不同魔法技能連續施放後，強化下一次防禦或攻擊，不能由同一次多段命中快速疊滿。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需不同魔法施放序列及一次强化消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/16.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 16 魔法少女☆伊莉雅 / Q 〔魔力砲擊〕

- 原設計：由紅寶石之星發射直線魔力彈。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：魔杖彈体待製；目前分段光路。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/16.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 16 魔法少女☆伊莉雅 / W 〔魔力防壁〕

- 原設計：展開有限耐久的正面護盾。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-16-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：目前全方向自身盾；需正面防壁。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/16.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-16-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 16 魔法少女☆伊莉雅 / E 〔魔法少女飛行〕

- 原設計：短距離浮空移動，仍受對決邊界與落點合法性限制。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：有限落點跳躍，不是持續飛行。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/16.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 1,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 16 魔法少女☆伊莉雅 / R 夢幻召喚・Saber

- 原設計：限時取得 Saber 武裝，替換普攻與 Q；結束後還原，生命與冷卻持續。
- 現有摘要：自身取得 4 秒增益：ad +15%、as +20%。
- 待補說明：目前 AD／攻速；需 Saber 武裝、普攻与 Q 替換與還原。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/16.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 4
    }
  ],
  "passive": [],
  "marks": []
}
```

## 16 魔法少女☆伊莉雅 / EX 限定展開・Excalibur

- 原設計：展開寶具進行一次有起手的直線光束攻擊。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：限定展開為一次光束，可作基礎驗收；需寶具武器掛點。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/16.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 17 安茲·烏爾·恭 / PASSIVE 〔情緒抑制〕

- 原設計：受到控制後獲得短效控制抗性，具有內置冷卻。
- 現有摘要：受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。
- 待補說明：需受控後控制抗性及冷卻；目前受傷反擊。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/17.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onDamageTaken",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 4,
            "chance": 1,
            "target": "event"
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 17 安茲·烏爾·恭 / Q 心臟掌握

- 原設計：對單一目標造成魔法傷害；低生命時追加有限傷害，仍經正常致死與保命流程。
- 現有摘要：指定單一敵人造成小級魔法傷害。
- 待補說明：缺低生命有限追加與處決流程專測。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/17.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 17 安茲·烏爾·恭 / W 死亡騎士

- 原設計：召喚一名可受擊的死亡騎士，負責近身牽制。
- 現有摘要：召喚 1 名 thorne 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。
- 待補說明：死亡騎士造型待製，代理採 thorne。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/17.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "summon",
      "championId": "thorne",
      "count": 1,
      "durationSec": 6,
      "formation": "ring",
      "spread": 1.5,
      "maxAlive": 1,
      "onOwnerDeath": "despawn",
      "hpMult": 0.3,
      "damageMult": 0.25
    }
  ],
  "passive": [],
  "marks": []
}
```

## 17 安茲·烏爾·恭 / E 高階傳送

- 原設計：移動到合法落點，保留可辨識的起點與終點演出。
- 現有摘要：傳送到指定落點，抵達後小範圍極小級傷害。
- 待補說明：原設計只有傳送，模板帶抵達傷害，需審查這項改編。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/17.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.15,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 17 安茲·烏爾·恭 / R 墜落天空

- 原設計：長起手的區域超位魔法，具有明顯預警與中斷機會。
- 現有摘要：指定落點半徑 300 wc3u 的一次大級範圍傷害。
- 待補說明：需長吟唱途中真正可中斷與落點預警。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/17.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "大",
        "ratios": [],
        "flat": 1500,
        "perRank": [
          0,
          1125,
          2250
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 17 安茲·烏爾·恭 / EX 死亡是所有生命的終點

- 原設計：對範圍內敵人施加倒數詛咒。到期後，低於生命門檻者進入標準處決結算，其餘受到有限傷害。可依 GGD 規則以離開有效條件、淨化或保命能力反制。
- 現有摘要：指定落點半徑 300 wc3u 的一次中級範圍傷害。
- 待補說明：目前立即範圍傷害；需倒數詛咒、標準處決、淨化與保命優先序。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/17.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "中",
        "ratios": [],
        "flat": 1000
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 18 吉爾伽美什 / PASSIVE 〔王的財庫〕

- 原設計：技能按次累積財庫能量，供 EX 消耗；命中段數不等於獲得次數。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需每次施法一次財庫能量與 EX 消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/18.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 18 吉爾伽美什 / Q 王之財寶

- 原設計：開啟三個門，依序發射武器。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.18 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：目前三發落點打擊；需三門武器投射物及門的掛點。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/18.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.36,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 18 吉爾伽美什 / W 天之鎖

- 原設計：射出鎖鏈，命中後短暫束縛；目標超出有效距離時解除。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"root","duration":0.7,"applyTo":"target","root":true}]。
- 待補說明：鎖足可作基礎控制；需超距解鎖、鎖鏈端點。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/18.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "root",
      "duration": 0.7,
      "applyTo": "target",
      "root": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 18 吉爾伽美什 / E 〔黃金甲冑〕

- 原設計：提供短效護盾，降低正面承受的爆發。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-18-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：目前全方向盾；缺正面條件。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/18.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-18-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 18 吉爾伽美什 / R 天地乖離開闢之星

- 原設計：以 Ea 進行明顯蓄力後的扇形／直線範圍攻擊。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：Ea 造型、蓄力層與單一總傷害預算需補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/18.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 18 吉爾伽美什 / EX 〔王之財寶・齊射〕

- 原設計：消耗財庫能量，分波發射最多十二件武器；各波有固定間隔。
- 現有摘要：在指定區域依序落下 12 發；每發間隔 0.12 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：12 發已有限；需扣財庫能量及武器多樣外觀。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/18.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200
      },
      "intervalSec": 0.12,
      "durationSec": 1.32,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 19 桐谷和人 / PASSIVE 二刀流

- 原設計：交替命中累積連擊節奏，停止交鋒後衰退；提供有限攻速加成。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需左右手交替命中、節奏衰退與攻速。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/19.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 19 桐谷和人 / Q 〔雙劍交叉斬〕

- 原設計：左右手各進行一次近戰判定。
- 現有摘要：2 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：需左右手掛點對應。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/19.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.36
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.36,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 19 桐谷和人 / W 〔劍技招架〕

- 原設計：短窗口迎擊正面攻擊，成功後強化下一次近戰。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-19-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：需迎擊窗口與成功後下一刀加成。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/19.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-19-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 19 桐谷和人 / E Sonic Leap

- 原設計：短距離躍進斬擊，碰撞或落點失效時安全停止。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：需對目標的躍進斬、牆體與落點失效處理。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/19.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.64,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 19 桐谷和人 / R Starburst Stream

- 原設計：十六次依序發生的斬擊機會；每次重新檢查目標範圍，整招共享傷害預算。
- 現有摘要：16 段連擊，間隔 0.1 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：16 段已可配置；須證明每段重查距離、中斷後不再命中及總預算。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/19.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 3,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.1,
      "durationSec": 1.6
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 1.6,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              375,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 19 桐谷和人 / EX The Eclipse

- 原設計：更長起手的二十七連擊終結技；具有更高的暴露時間與中斷風險。
- 現有摘要：20 段連擊，間隔 0.1 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：模板 hitCount 上限 20，不能冒稱 27 連擊；需有序 27 段的共用模板擴充，不採兩個並行連擊拼接。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/19.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200
      },
      "intervalSec": 0.1,
      "durationSec": 2
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 2,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 20 御坂美琴 / PASSIVE 〔電荷累積〕

- 原設計：不同技能命中累積電荷，上限三層；下一次強化技消耗。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需三層電荷及下一次強化技消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/20.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 20 御坂美琴 / Q 電擊之槍

- 原設計：直線電擊，主要作為穩定消耗。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需單道電擊與貫穿去重。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/20.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 20 御坂美琴 / W 〔連鎖放電〕

- 原設計：在附近不同敵人間跳躍，同一施法不重複命中同一目標。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"chainLightning","shape":"single","amount":{"damageTier":"極小","ratios":[]},"damageType":"magic","jumps":3,"jumpRange":3,"decay":0.8,"revisit":false,"maxTotalJumps":3,"jumpIntervalSec":0.12}]。
- 待補說明：模板主命中加鏈起點會對起點追加；需原設計整招同目標只命中一次。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/20.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "chainLightning",
      "shape": "single",
      "amount": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "damageType": "magic",
      "jumps": 3,
      "jumpRange": 3,
      "decay": 0.8,
      "jumpIntervalSec": 0.12,
      "revisit": false,
      "maxTotalJumps": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 20 御坂美琴 / E 〔鐵砂防壁〕

- 原設計：用鐵砂建立短效護盾，破盾時散開為純視覺碎粒。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-20-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：鐵砂碎粒及破盾事件待補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/20.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-20-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 20 御坂美琴 / R 超電磁砲

- 原設計：彈出硬幣後發射有預警的高傷害直線攻擊。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：目前四段線；需硬幣彈出、單發射線與整體傷害上限。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/20.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 20 御坂美琴 / EX 〔電磁過載〕

- 原設計：消耗電荷，強化下一次 Q 的範圍或 W 的跳躍數；使用時明示強化結果。
- 現有摘要：自身取得 3 秒增益：ap +15%。
- 待補說明：僅 AP 增益；需電荷扣除與 Q／W 指定版本強化。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/20.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ap",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 21 鹿目圓 / PASSIVE 〔希望的連結〕

- 原設計：有效保護友軍時累積希望，上限三層；溢出治療與無效護盾不提供資源。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需有效治療／吸收量計算希望，溢出不計。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/21.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 21 鹿目圓 / Q 〔光之箭〕

- 原設計：發射直線魔法箭。
- 現有摘要：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。
- 待補說明：需魔法箭投射物。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：UNDISCLOSED_TERMINAL_DAMAGE
- 來源：GGD社群英雄上傳內容_37名/recipes/21.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 1.83,
      "side": "enemies",
      "delaySec": 0.12,
      "count": 4,
      "intervalSec": 0.12,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "finalEffects": [
        {
          "kind": "damageArea",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          },
          "radius": 8.25
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 21 鹿目圓 / W 〔希望之弓〕

- 原設計：為指定友軍提供護盾；消耗一層希望可加強。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-21-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：目前自身；需指定友軍及希望消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/21.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-21-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 21 鹿目圓 / E 〔淨化之願〕

- 原設計：解除一項可淨化的負面狀態，並提供短效移速。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：目前自身加速；需一項可淨化狀態移除。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/21.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 21 鹿目圓 / R 〔願望箭雨〕

- 原設計：對指定區域發射有限波次的箭雨。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.35 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：有限三波箭雨已對應；箭形資產待製。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/21.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "magic",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.35,
      "durationSec": 0.7,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 21 鹿目圓 / EX 圓環之理

- 原設計：對一名友軍施加短期保命印記。首次受到致死傷害時消耗印記，保留少量生命並短暫保護。同一目標每回合限一次。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":160,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-21-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：護盾不是友軍致死攔截；需限時保命印記與每目標每回合一次。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/21.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 160,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-21-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 22 菜月昴 / PASSIVE 〔記住這次失敗〕

- 原設計：完成一次死亡回歸後，短暫標記造成致死傷害的敵人；只顯示當前合法可見資訊。
- 現有摘要：本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。
- 待補說明：本場免死不是死亡回歸；需與 R／EX 共用存檔並合法顯示致死來源。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/22.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": [],
  "marks": [
    {
      "markId": "community-review-22-20260907.last-chance",
      "initial": 1,
      "max": 1,
      "durationSec": -1,
      "resetOn": "match",
      "perStackLost": [],
      "lethal": {
        "consume": 1,
        "surviveHpPct": 0.01,
        "damageTypes": [
          "physical",
          "magic",
          "true"
        ],
        "internalCooldown": 1,
        "selfEffects": [
          {
            "kind": "invulnerable",
            "durationSec": 0.5,
            "applyTo": "self",
            "blocksControl": true
          },
          {
            "kind": "restore",
            "healthPct": 0.15
          }
        ],
        "aoeEffects": [],
        "aoeRadius": 0
      }
    }
  ]
}
```

## 22 菜月昴 / Q Shamac

- 原設計：製造短暫黑霧干擾，效果限定於 GGD 核准的視覺／命中干擾範圍。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。
- 待補說明：固定緩速不代表黑霧感官／命中干擾。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/22.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "slow30",
      "duration": 1.5,
      "applyTo": "target",
      "moveSpeedMult": 0.7
    }
  ],
  "passive": [],
  "marks": []
}
```

## 22 菜月昴 / W 〔鞭繩牽制〕

- 原設計：中短距離鞭擊，命中後小幅牽引。
- 現有摘要：拖拉指定目標後向前投擲 100 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。
- 待補說明：抓投是模板預覽；需鞭擊後小幅牽引，不應拋飛目標。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/22.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "target",
      "mode": "toPoint",
      "apexHeight": 0.005,
      "durationSec": 0.45,
      "throwDistance": 1.83,
      "dragToCaster": true,
      "landRadius": 2,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [
              {
                "stat": "ap",
                "coeff": 0.4082
              }
            ],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 22 菜月昴 / E 〔重新振作〕

- 原設計：提供自己與附近一名友軍小額護盾，協助重新進入戰鬥。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-22-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：需自己及附近一名友軍。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/22.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-22-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 22 菜月昴 / R 死亡回歸

- 原設計：施放時保存自己的位置與生命，存檔有效五秒。期間首次致死傷害被攔截，返回合法存檔位置，恢復到存檔生命但不超過既定上限。每回合最多成功一次。其他角色、世界時間、傷害紀錄、金幣、經驗與冷卻均繼續。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。
- 待補說明：目前立即恢復 100 生命；需五秒位置生命快照、致死回溯與合法落點。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/22.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "heal",
      "amount": {
        "flat": 100,
        "ratios": [],
        "perRank": [
          0,
          75,
          150
        ]
      },
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 22 菜月昴 / EX 〔重新選擇〕

- 原設計：R 存檔有效且自己仍存活時，主動消耗同一存檔，回復位置與受上限限制的生命。使用後該存檔不再攔截致死傷害。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":80,"ratios":[]},"applyTo":"self"}]。
- 待補說明：目前立即恢復 80 生命；需主動消耗 R 同一快照且不得重置冷卻。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/22.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "heal",
      "amount": {
        "flat": 80,
        "ratios": []
      },
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 23 坂田銀時 / PASSIVE 〔糖分補給〕

- 原設計：脫戰後累積一份補給，供 W 消耗；最多保存一份。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需脫戰保存一份補給給 W。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/23.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 23 坂田銀時 / Q 〔洞爺湖・橫斬〕

- 原設計：木刀橫掃前方。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需木刀近身弧形判定。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/23.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 23 坂田銀時 / W 〔草莓牛奶休息時間〕

- 原設計：短暫飲用補給恢復生命，受擊或移動會中斷。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。
- 待補說明：需喝草莓牛奶動作、移動／受擊中斷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/23.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "heal",
      "amount": {
        "flat": 100,
        "ratios": [],
        "perRank": [
          0,
          50,
          100,
          150
        ]
      },
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 23 坂田銀時 / E 〔萬事屋式反擊〕

- 原設計：短時間招架，成功後可接一次木刀反擊。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-23-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：需招架成功後一次反擊窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/23.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-23-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 23 坂田銀時 / R 〔白夜叉〕

- 原設計：限時強化近戰動作與追擊能力，不提供永久變形。
- 現有摘要：自身取得 4 秒增益：ad +15%、極小級移速。
- 待補說明：短期 AD＋移速對應基础强化；白夜叉動作待製。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/23.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 4
    }
  ],
  "passive": [],
  "marks": []
}
```

## 23 坂田銀時 / EX 〔吐槽也是武器〕

- 原設計：近身重擊打斷一個可中斷的施法，以吐槽文字及誇張表情演出。
- 現有摘要：指定單一敵人造成小級物理傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.5,"applyTo":"target","stun":true}]。
- 待補說明：0.5 秒暈眩可測基本打斷；須限定可中斷施法與吐槽文字對齊。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/23.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "stun",
      "duration": 0.5,
      "applyTo": "target",
      "stun": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 24 奇犽 / PASSIVE 〔電力儲備〕

- 原設計：技能消耗電力；停止攻擊一段時間後逐步充電，設上限。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需電力上限／脫戰充電；目前用標準魔力。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/24.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 24 奇犽 / Q 落雷

- 原設計：指定小區域的延遲電擊。
- 現有摘要：指定落點半徑 300 wc3u 的一次小級範圍傷害。
- 待補說明：短起手落點電擊對應基礎版。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/24.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 24 奇犽 / W 肢曲

- 原設計：短距離側移並留下殘像；只有有效迴避才觸發後續反擊資源。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：需貼地肢曲殘像與有效閃避事件。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/24.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.2,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 24 奇犽 / E 電光石火

- 原設計：持續消耗電力提高移動速度，關閉或電力耗盡時停止。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：目前固定 3 秒加速；需開關及持續扣電。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/24.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 24 奇犽 / R 神速・疾風迅雷

- 原設計：短期開啟自動反應：符合距離與攻擊條件時進行有限次反擊，每次消耗電力且有觸發間隔。
- 現有摘要：自身取得 3 秒增益：as +20%、極小級移速。
- 待補說明：目前攻速／移速；需受攻擊條件自動反應、限次扣電及循環防止。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/24.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        },
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 24 奇犽 / EX 〔充電釋放〕

- 原設計：消耗剩餘電力進行近身爆發，之後進入低電力狀態。
- 現有摘要：指定落點半徑 300 wc3u 的一次中級範圍傷害。
- 待補說明：固定傷害；需消耗剩餘電力與低電力狀態。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/24.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "中",
        "ratios": [],
        "flat": 1000
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 25 一拳超人 / PASSIVE 〔興趣使然的英雄〕

- 原設計：一段時間未攻擊後，下一次普通拳獲得有限強化。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需未攻擊時間與下一拳一次消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/25.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 25 一拳超人 / Q 普通拳

- 原設計：短距離單次重拳。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：普通拳仍走標準傷害。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/25.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 25 一拳超人 / W 連續普通拳

- 原設計：多段拳擊，整招使用固定傷害預算。
- 現有摘要：5 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：需要整招總傷害預算；目前每段各自級距。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/25.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 3,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.8999999999999999
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.8999999999999999,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              250,
              500,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 25 一拳超人 / E 〔趕上特賣〕

- 原設計：直線快速移動，碰撞後停止。
- 現有摘要：向指定方向突進 450 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：碰撞安全需場景驗收。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/25.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 8.25,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 25 一拳超人 / R 認真系列・認真一拳

- 原設計：長起手後的高傷害衝擊波，具有明顯方向與閃避窗口。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：四段衝擊波不等於單拳總結算；需高單擊預算與較長起手。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/25.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 25 一拳超人 / EX 認真系列・認真反覆橫跳

- 原設計：短期快速左右移動並產生殘像，提供有限迴避機會。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：目前移速增益；需左右連續側移與有限次有效迴避。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/25.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 26 名偵探柯南 / PASSIVE 〔線索整理〕

- 原設計：對已觀察敵人收集最多三條線索，每種有效戰鬥事件只計一次。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需觀察線索、事件類型去重與三層上限。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/26.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 26 名偵探柯南 / Q 足球射擊

- 原設計：以腳力增強鞋踢出足球，依射線與碰撞命中。
- 現有摘要：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。
- 待補說明：需足球單彈碰撞與腳踢動作。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：UNDISCLOSED_TERMINAL_DAMAGE
- 來源：GGD社群英雄上傳內容_37名/recipes/26.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 1.83,
      "side": "enemies",
      "delaySec": 0.12,
      "count": 4,
      "intervalSec": 0.12,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "finalEffects": [
        {
          "kind": "damageArea",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          },
          "radius": 8.25
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 26 名偵探柯南 / W 手錶型麻醉槍

- 原設計：單發針造成短暫睡眠；目標受到後續傷害時提前醒來。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.7,"applyTo":"target","stun":true}]。
- 待補說明：0.7 秒暈眩只是底稿；需受傷可喚醒的睡眠及針彈碰撞。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/26.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "stun",
      "duration": 0.7,
      "applyTo": "target",
      "stun": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 26 名偵探柯南 / E 渦輪引擎滑板

- 原設計：短期提高移動能力，急轉、碰撞與停止均有清楚狀態。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：僅 3 秒移速；需滑板加減速、急轉與碰撞狀態。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/26.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 26 名偵探柯南 / R 〔真相只有一個〕

- 原設計：消耗目標線索，揭示其當前位置並施加短效弱點標記；不揭露對決外或未授權資訊。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":2,"applyTo":"target","moveSpeedMult":0.7}]。
- 待補說明：目前緩速；需消耗線索、弱點標記及合法位置揭示。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/26.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          375,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "slow30",
      "duration": 2,
      "applyTo": "target",
      "moveSpeedMult": 0.7
    }
  ],
  "passive": [],
  "marks": []
}
```

## 26 名偵探柯南 / EX 伸縮吊帶

- 原設計：連接合法目標或錨點，完成一次有限拉動；超距與碰撞時中止。
- 現有摘要：拖拉指定目標後向前投擲 120 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。
- 待補說明：需吊帶錨點分支與有限拉動，不應預設摔投。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/26.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "target",
      "mode": "toPoint",
      "apexHeight": 0.005,
      "durationSec": 0.45,
      "throwDistance": 2.2,
      "dragToCaster": true,
      "landRadius": 2,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [
              {
                "stat": "ap",
                "coeff": 2.6938
              }
            ],
            "flat": 500
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 27 庫洛魔法使 / PASSIVE 〔卡牌連結〕

- 原設計：依序使用不同卡牌累積連結，上限三層，強化下一次護盾。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需不同牌序列三層與護盾消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/27.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 27 庫洛魔法使 / Q 風牌

- 原設計：以風束攻擊並推動目標。
- 現有摘要：指定單一敵人造成小級魔法傷害。
- 待補說明：風束推動缺 knockback；目前單體魔法。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/27.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 27 庫洛魔法使 / W 盾牌

- 原設計：為自己或指定友軍提供護盾。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-27-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：目前自身；需友軍選取。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/27.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-27-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 27 庫洛魔法使 / E 翔牌

- 原設計：短期飛行位移，具有合法落點與高度限制。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：有限落點飛躍可預覽；翔牌武器姿態待補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/27.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 8,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.88,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 27 庫洛魔法使 / R 劍牌

- 原設計：短期將法杖化為劍，替換普攻並強化近戰。
- 現有摘要：自身取得 4 秒增益：ad +15%、as +20%。
- 待補說明：AD／攻速强化不等於劍牌；需普攻替換、武器及還原。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/27.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 8,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 4
    }
  ],
  "passive": [],
  "marks": []
}
```

## 27 庫洛魔法使 / EX 〔換牌：風與樹〕

- 原設計：將 Q 在風牌推動與樹牌束縛之間切換；兩者共享 Q 的冷卻與資源。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"root","duration":0.7,"applyTo":"target","root":true}]。
- 待補說明：目前固定樹牌鎖足；需風／樹 Q 版本切換，共享冷卻。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/27.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "root",
      "duration": 0.7,
      "applyTo": "target",
      "root": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 28 艾莉絲·伯雷亞斯·格雷拉特 / PASSIVE 〔劍神流・先發制人〕

- 原設計：對剛進入交鋒的目標，首次近戰命中獲得有限強化；同一目標有冷卻。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需對剛交鋒目標的首次命中及每目標冷卻。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/28.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 28 艾莉絲·伯雷亞斯·格雷拉特 / Q 〔猛進斬〕

- 原設計：向前踏步斬擊。
- 現有摘要：向指定方向突進 180 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：短踏步可以預覽；需武器斬擊時點。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/28.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 3.3,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 28 艾莉絲·伯雷亞斯·格雷拉特 / W 〔鬥氣護身〕

- 原設計：短時間提高承傷能力，無法無限疊加。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-28-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：有限承傷對應基礎版。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/28.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-28-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 28 艾莉絲·伯雷亞斯·格雷拉特 / E 〔逼近步〕

- 原設計：短距離接近，保留可被攔截的路徑。
- 現有摘要：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：此模板附帶傷害推移，需審查逼近步是否保留這項改編。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/28.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 4.58,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 28 艾莉絲·伯雷亞斯·格雷拉特 / R 光之太刀

- 原設計：有明確起手的高速直線斬擊，命中後停在合法位置。
- 現有摘要：向指定方向突進 450 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：需較長起手、高速單段斬及命中停點。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/28.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 8.25,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 28 艾莉絲·伯雷亞斯·格雷拉特 / EX 〔狂劍追擊〕

- 原設計：對剛被自己擊中的近身目標進行一次額外追擊，超距時不能使用。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：需剛被自身命中的目標條件與追擊窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/28.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 29 芙莉蓮 / PASSIVE 魔力抑制

- 原設計：降低敵方魔力感知類技能取得的強度資訊；不等同隱形，也不隱藏基本敵我識別。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需魔力感知的資訊層抑制，不可用隱形或傷害被動冒充。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/29.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 29 芙莉蓮 / Q 一般攻擊魔法・Zoltraak

- 原設計：直線魔法射擊。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：Zoltraak 原型；需單束碰撞去重。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/29.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 29 芙莉蓮 / W 防禦魔法

- 原設計：展開方向明確的防壁，消耗資源抵擋有限傷害。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-29-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：目前無方向盾；需六角防壁方向、耐久與持續消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/29.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-29-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 29 芙莉蓮 / E 飛行魔法

- 原設計：短距離浮空移動。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：短期浮空可用落點跳躍預覽，不提供持續飛行。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/29.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 1,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "magic",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 29 芙莉蓮 / R 〔葬送連射〕

- 原設計：依序射出多方向魔法束，每束有獨立射線及整招總傷害上限。
- 現有摘要：在指定區域依序落下 6 發；每發間隔 0.35 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：目前定點六波；需各方向獨立射線及總傷害上限。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/29.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "magic",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.35,
      "durationSec": 1.75,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 29 芙莉蓮 / EX 變出花田的魔法

- 原設計：生成短期花田；GGD 改編效果為友軍首次進入時解除恐懼並取得小額護盾。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-29-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：目前自身盾；需花田區域、友軍首次進入解除恐懼及一次護盾。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/29.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-29-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 30 尼古貓貓 / PASSIVE 〔拖延症〕

- 原設計：停止移動後逐步累積拖延，上限三層；受擊時清空，施法可消耗強化。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需靜止三層拖延、受擊清除與施法消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/30.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 30 尼古貓貓 / Q 〔菸灰缸飛過去〕

- 原設計：投擲道具，落地造成一次小範圍傷害。
- 現有摘要：指定落點半徑 300 wc3u 的一次小級範圍傷害。
- 待補說明：菸灰缸道具拋物線未綁；落地一次傷害可測。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/30.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 30 尼古貓貓 / W 〔煙霧瀰漫〕

- 原設計：形成有期限的小型煙霧區，提供明示的命中干擾；不自動賦予完整隱形。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。
- 待補說明：單體緩速不是煙霧區命中干擾；需區域及明示效果。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/30.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "slow30",
      "duration": 1.5,
      "applyTo": "target",
      "moveSpeedMult": 0.7
    }
  ],
  "passive": [],
  "marks": []
}
```

## 30 尼古貓貓 / E 〔先溜再說〕

- 原設計：短距離狼狽撤退，留下純視覺雜物殘影。
- 現有摘要：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：撤退应無碰撞輸出，模板帶推移傷害，須審查改編。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/30.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 4.58,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 30 尼古貓貓 / R 〔房間大崩壞〕

- 原設計：在指定區域分三波掉落卡通雜物，具有清楚落點預警。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.5 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：三波落點可測；卡通雜物模型與逐波預警待補。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/30.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.5,
      "durationSec": 1,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 30 尼古貓貓 / EX 〔今天真的不想動〕

- 原設計：消耗拖延層數，原地取得護盾；移動後提前結束。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":160,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-30-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：需拖延消耗與移動取消盾。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/30.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 160,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-30-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 31 SUN樂 / PASSIVE 〔糞作獵人的讀招〕

- 原設計：成功以位移避開有效攻擊後，獲得一層讀招，上限三層。單純空按移動不增加。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需真正閃避事件的三層讀招，空按不增加。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/31.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 31 SUN樂 / Q Spiral Edge

- 原設計：短劍螺旋刺擊；對剛被自己反擊的目標有有限追加效果。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：需螺旋刃動畫與反擊後目標追加條件。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/31.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 31 SUN樂 / W Slide Move

- 原設計：滑步位移，提供很短的精準迴避窗口。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：模板低跳不是精準迴避；需傷害來臨時間窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/31.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.16,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 31 SUN樂 / E Repel Counter

- 原設計：短窗口迎擊攻擊，成功時擊退攻擊者，並提供一次 Q 接續機會。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-31-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：護盾不是 Repel Counter；需格擋成功、擊退與 Q 窗口。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/31.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-31-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 31 SUN樂 / R Accel

- 原設計：短期提高移速與近戰輸出能力，保留原本技能冷卻。
- 現有摘要：自身取得 3 秒增益：極小級移速、as +20%。
- 待補說明：Accel 基礎移速／攻速增益；持續 3 秒且保留冷卻。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/31.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 31 SUN樂 / EX 〔攻略完成〕

- 原設計：消耗三層讀招，對近期交鋒目標進行一次有方向的高傷害短劍終結。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：需消耗三層讀招並限定近期交鋒目標。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/31.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 32 阿薩謝爾 / PASSIVE 淫奔

- 原設計：轉譯為「負面能量」資源。對敵人造成有效技能傷害時累積，最多三層，每次施法最多一層。自傷、反傷及持續傷害的每跳不重複增加。
- 現有摘要：普攻追加極小級魔法傷害，內置冷卻 3 秒。
- 待補說明：需每次有效施法一次負面能量，上限三；自傷反傷與每跳不得增加。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/32.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "magic",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 32 阿薩謝爾 / Q 肩パンチ

- 原設計：近距離肩膀拳，造成小幅擊退。演出重點是一本正經地使出很普通的一拳，保留喜劇落差。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：肩膀拳需小幅擊退与一本正經起手，当前只是單擊。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/32.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 32 阿薩謝爾 / W 流精群（ホワイトレイン）

- 原設計：指定區域落下三波白色魔力雨。每波對同一目標最多命中一次；以白色光點、漫畫速度線及誇張表情演出。
- 現有摘要：在指定區域依序落下 3 發；每發間隔 0.45 秒、半徑 150 wc3u、極小級傷害，可多次命中。
- 待補說明：三波白色雨可作時序預覽；每波同目標一次與白點落下造型須驗收。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/32.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "magic",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          100,
          200,
          300
        ]
      },
      "intervalSec": 0.45,
      "durationSec": 0.9,
      "tickOnApply": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 32 阿薩謝爾 / E 闇ぱんち

- 原設計：短暫叫出闇人格的影子進入反擊窗口。受到第一個符合條件的近身攻擊後，影子向攻擊者出拳並消失。「闇人格向敵人反擊」為 GGD 改編，不改寫原作招式使用者。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-32-20260907.e.guard","onExisting":"keepLarger"}]。
- 待補說明：護盾不代表闇人格反擊；需第一個近身受擊成功事件及一次出拳。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/32.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-32-20260907.e.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 32 阿薩謝爾 / R THE END OF SON

- 原設計：舉起負面能量球，蓄力後投出。命中造成傷害，並施加四秒「萎靡」：降低目標輸出。成功放出時，阿薩謝爾承受有生命底線的少量反噬。施法被中斷時按 GGD 中斷規則處理，不產生完整命中效果。
- 現有摘要：指定單一敵人造成小級魔法傷害。
- 待補說明：需四秒萎靡的輸出降低，以及不致死反噬；目前只有可預覽的單體魔法命中。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/32.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          375,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 32 阿薩謝爾 / EX THE END OF SON〔終章〕

- 原設計：消耗三層負面能量，施放較集中的強化詛咒。未處於「萎靡」的目標受到傷害及較強、較短的輸出降低。已處於「萎靡」的目標移除原詛咒，改獲短暫的有限輸出增益，作為重複詛咒的反效果。因此 R→EX 可以實際觸發「本來想補刀，結果把對手弄強」的惡搞失誤。
- 現有摘要：指定單一敵人造成小級魔法傷害。
- 待補說明：需三層消耗及已萎靡目標反轉增益。R→EX 把敵人變強是必要驗收，不得刪成普通強化傷害。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/32.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 33 近衛刀太 / PASSIVE 〔不死者再生〕

- 原設計：受到傷害後延遲恢復部分損失生命；再次受擊延後恢復，且有每段時間上限。
- 現有摘要：本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。
- 待補說明：本場被動免死只是基底；需受傷延後再生与 R 短期再起资格，不能無條件常駐代替。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/33.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": [],
  "marks": [
    {
      "markId": "community-review-33-20260907.last-chance",
      "initial": 1,
      "max": 1,
      "durationSec": -1,
      "resetOn": "match",
      "perStackLost": [],
      "lethal": {
        "consume": 1,
        "surviveHpPct": 0.01,
        "damageTypes": [
          "physical",
          "magic",
          "true"
        ],
        "internalCooldown": 1,
        "selfEffects": [
          {
            "kind": "invulnerable",
            "durationSec": 0.5,
            "applyTo": "self",
            "blocksControl": true
          },
          {
            "kind": "restore",
            "healthPct": 0.15
          }
        ],
        "aoeEffects": [],
        "aoeRadius": 0
      }
    }
  ]
}
```

## 33 近衛刀太 / Q 〔重力劍・橫掃〕

- 原設計：使用重力劍進行扇形斬擊。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需重力劍扇形判定。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/33.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 33 近衛刀太 / W 〔重量切換〕

- 原設計：在輕劍與重劍模式間切換：輕模式較快、重模式傷害較高且動作較慢。
- 現有摘要：自身取得 3 秒增益：ad +15%。
- 待補說明：固定 AD 增益；需輕／重模式、攻速與動作時長同步。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/33.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 33 近衛刀太 / E 〔踏地突進〕

- 原設計：短距離接近並揮劍。
- 現有摘要：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：近身突進可作基礎驗收。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/33.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 4.58,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 33 近衛刀太 / R 〔不死者的再起〕

- 原設計：短時間準備再起；首次致死傷害被攔截，經明顯恢復動作後回復有限生命。每回合一次。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。
- 待補說明：目前立即回復；需主動再起窗口、首次致死截取與每回合一次。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/33.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "heal",
      "amount": {
        "flat": 100,
        "ratios": [],
        "perRank": [
          0,
          75,
          150
        ]
      },
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 33 近衛刀太 / EX 〔重力劍・壓潰〕

- 原設計：固定為重劍模式的蓄力重擊，完成後短暫降低移速。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需固定重劍模式蓄力与完成後緩速。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/33.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 34 高速婆婆 / PASSIVE 〔追上你了〕

- 原設計：持續追逐同一可見目標時累積速度，轉換目標、失去視線或停止追逐後衰退。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需同一可見目標追逐速度與轉目標衰退。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/34.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 34 高速婆婆 / Q 〔疾走爪擊〕

- 原設計：短距離突進爪擊。
- 現有摘要：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：爪擊模型待製。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/34.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 4.58,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 34 高速婆婆 / W 〔急轉彎〕

- 原設計：快速改變方向，降低當前加速層數以換取操作能力。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：需急轉向與消耗加速層，不能單純低跳。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/34.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.12,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 34 高速婆婆 / E 〔妖怪的咒印〕

- 原設計：標記一個可見敵人，使自己朝其移動時獲得有限加速。
- 現有摘要：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。
- 待補說明：緩速只是底稿；需追獵目標標記與朝向加速。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/34.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "magic",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    },
    {
      "kind": "applyStatus",
      "statusId": "slow30",
      "duration": 1.5,
      "applyTo": "target",
      "moveSpeedMult": 0.7
    }
  ],
  "passive": [],
  "marks": []
}
```

## 34 高速婆婆 / R 〔全速追獵〕

- 原設計：短期提升速度上限與轉向能力，期間仍須通過碰撞檢查。
- 現有摘要：自身取得 3 秒增益：極小級移速。
- 待補說明：3 秒移速增益；需上限与轉向能力独立参数。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/34.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 3,
  "cooldown": [
    45,
    45,
    45
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 34 高速婆婆 / EX 〔百公里衝撞〕

- 原設計：蓄勢後沿長直線衝撞，命中第一名英雄或障礙物時停止。
- 現有摘要：向指定方向突進 500 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：需命中第一英雄或牆即停止，不能穿越後繼續連撞。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/34.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 1,
  "cooldown": [
    90
  ],
  "manaCost": [
    576
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 9.17,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 35 炭治郎 / PASSIVE 〔嗅覺・破綻辨識〕

- 原設計：成功閃過敵人攻擊後，短暫顯示該敵人的近身破綻；下一次刀技命中消耗。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需有效閃避後近身破綻標記與下一刀消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/35.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 35 炭治郎 / Q 水之呼吸・水面斬

- 原設計：前方橫斬，適合穩定輸出。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需水面斬前方橫弧，目前四段直線。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/35.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 35 炭治郎 / W 水之呼吸・水車

- 原設計：旋轉斬擊並進行短距離位移。
- 現有摘要：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。
- 待補說明：需水車旋轉斬与武器動作。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/35.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0.88,
      "durationSec": 0.5,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 35 炭治郎 / E 〔呼吸調整〕

- 原設計：短暫調息恢復呼吸資源，移動或受擊會降低恢復效率。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"restore","manaPct":0.15,"applyTo":"self"}]。
- 待補說明：標準魔力回復 15%；需呼吸資源、調息中移動受傷降效率。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/35.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "restore",
      "manaPct": 0.15,
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 35 炭治郎 / R 火之神神樂・圓舞

- 原設計：明顯蓄勢後的高傷害斬擊，消耗較多呼吸資源。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需火之神單次高傷斬與呼吸高消耗。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/35.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 35 炭治郎 / EX 〔呼吸切換〕

- 原設計：讓 Q 在水面斬與火之神神樂的強化斬版本間切換。共用 Q 冷卻；火之神版本消耗較高並增加自身負擔。
- 現有摘要：自身取得 3 秒增益：ad +15%。
- 待補說明：固定 AD 增益不是切換；需水／火 Q 版本、共用冷卻与負擔。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/35.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 36 鬼畜王蘭斯 / PASSIVE 〔自信過剩〕

- 原設計：參與擊殺獲得當回合戰意，上限五層，提升有限近戰能力。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需擊殺／助攻一次戰意，上限五層、回合重置。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/36.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 36 鬼畜王蘭斯 / Q 〔蠻力斬擊〕

- 原設計：大開大合的正面斬擊。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需正面蠻力弧形斬。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/36.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 36 鬼畜王蘭斯 / W 〔本大爺還沒認真〕

- 原設計：短暫蓄勢取得護盾，下一次主動攻擊消耗護盾換取有限增傷。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-36-20260907.w.guard","onExisting":"keepLarger"}]。
- 待補說明：需下一次主動攻擊消耗剩餘盾換取有限增傷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/36.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": [],
        "perRank": [
          0,
          60,
          120,
          180
        ]
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-36-20260907.w.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 36 鬼畜王蘭斯 / E 〔霸王突進〕

- 原設計：直線衝鋒，命中後停止。
- 現有摘要：向指定方向突進 350 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：需命中第一人後停止。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/36.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 6.42,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 36 鬼畜王蘭斯 / R Rance Attack／蘭斯攻擊

- 原設計：蓄力後的大範圍重斬，保留喊招與誇張爆發。
- 現有摘要：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。
- 待補說明：需大範圍重斬、長起手與總傷害預算。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：CURRENT_TEXT_CONTRADICTS_DEDUP
- 來源：GGD社群英雄上傳內容_37名/recipes/36.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "skillshot",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 6,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "delayed",
      "shape": "circle",
      "radius": 2.75,
      "side": "enemies",
      "delaySec": 0.05,
      "count": 4,
      "intervalSec": 0.05,
      "effects": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              150,
              300
            ]
          }
        }
      ],
      "targetMode": "reresolve",
      "advance": {
        "stepDist": 1.83,
        "dir": "facing"
      },
      "hitOncePerTarget": true
    }
  ],
  "passive": [],
  "marks": []
}
```

## 36 鬼畜王蘭斯 / EX 〔跟著本大爺衝〕

- 原設計：消耗戰意，為附近友軍提供短效移速與一次普攻強化。
- 現有摘要：自身取得 3 秒增益：極小級移速、as +20%。
- 待補說明：目前自身加速攻速；需戰意消耗及附近友軍一次普攻增益。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/36.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小",
          "value": 0.1
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "duration": 3
    }
  ],
  "passive": [],
  "marks": []
}
```

## 37 吉伊卡哇 / PASSIVE 〔雖然害怕還是努力〕

- 原設計：附近友軍交戰時累積勇氣，上限三層；以時間間隔累積，避免多段傷害快速疊滿。
- 現有摘要：普攻追加極小級物理傷害，內置冷卻 3 秒。
- 待補說明：需附近友軍交战依時間累積勇氣，上限三層。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：PASSIVE_PLACEHOLDER_NOT_OWNER_MECHANIC
- 來源：GGD社群英雄上傳內容_37名/recipes/37.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    0
  ],
  "manaCost": [
    0
  ],
  "range": 0,
  "damageAndMechanics": [],
  "passive": {
    "ranks": [
      {
        "hooks": [
          {
            "on": "onBasicAttack",
            "effects": [
              {
                "kind": "damage",
                "damageType": "physical",
                "amount": {
                  "damageTier": "極小",
                  "ratios": [],
                  "flat": 200
                }
              }
            ],
            "internalCooldown": 3,
            "condition": {
              "kind": "chance",
              "p": 1
            }
          }
        ]
      }
    ]
  },
  "marks": []
}
```

## 37 吉伊卡哇 / Q 〔討伐叉刺擊〕

- 原設計：短距離刺擊，武器判定與外觀一致。
- 現有摘要：指定單一敵人造成小級物理傷害。
- 待補說明：討伐叉造型與近身命中對齊待製。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/37.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "damage",
      "damageType": "physical",
      "amount": {
        "damageTier": "小",
        "ratios": [],
        "flat": 500,
        "perRank": [
          0,
          250,
          500,
          750
        ]
      }
    }
  ],
  "passive": [],
  "marks": []
}
```

## 37 吉伊卡哇 / W 〔哇啊啊撤退〕

- 原設計：朝指定方向短距離逃跑，消耗一層勇氣可取得小護盾。
- 現有摘要：向指定方向突進 220 wc3u，造成極小級碰撞範圍傷害與推移。
- 待補說明：需無傷害撤退並可扣勇氣換小盾；目前衝撞模板不等價。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/37.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "ground",
  "maxRank": 4,
  "cooldown": [
    45,
    45,
    45,
    45
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 4.5,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "toPoint",
      "apexHeight": 0,
      "durationSec": 0.3,
      "throwDistance": 4.03,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "極小",
            "ratios": [],
            "flat": 200,
            "perRank": [
              0,
              100,
              200,
              300
            ]
          }
        },
        {
          "kind": "knockback",
          "distance": 3.67,
          "speed": 15.99,
          "from": "facing",
          "launchHeight": 0
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 37 吉伊卡哇 / E 〔點心時間〕

- 原設計：短暫停留恢復少量生命，受擊中斷。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":70,"ratios":[]},"applyTo":"self"}]。
- 待補說明：需停留吃點心及受擊中斷。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/37.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 4,
  "cooldown": [
    15,
    15,
    15,
    15
  ],
  "manaCost": [
    144,
    144,
    144,
    144
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "heal",
      "amount": {
        "flat": 70,
        "ratios": [],
        "perRank": [
          0,
          35,
          70,
          105
        ]
      },
      "applyTo": "self"
    }
  ],
  "passive": [],
  "marks": []
}
```

## 37 吉伊卡哇 / R 〔鼓起勇氣討伐〕

- 原設計：消耗勇氣發動數次叉擊，層數決定有限的強化幅度。
- 現有摘要：3 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。
- 待補說明：固定三段；需勇氣消耗与有限強化幅度。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：DOT_PLUS_SEPARATE_FINISHER_NOT_ORDERED_MELEE
- 來源：GGD社群英雄上傳內容_37名/recipes/37.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "targeted",
  "maxRank": 3,
  "cooldown": [
    90,
    90,
    90
  ],
  "manaCost": [
    576,
    576,
    576
  ],
  "range": 3,
  "castTimeSec": 0.5,
  "damageAndMechanics": [
    {
      "kind": "dot",
      "damageType": "physical",
      "amountPerTick": {
        "damageTier": "極小",
        "ratios": [],
        "flat": 200,
        "perRank": [
          0,
          150,
          300
        ]
      },
      "intervalSec": 0.18,
      "durationSec": 0.54
    },
    {
      "kind": "leap",
      "applyTo": "self",
      "mode": "inPlace",
      "apexHeight": 0,
      "durationSec": 0.54,
      "landRadius": 2.75,
      "onLand": [
        {
          "kind": "damage",
          "damageType": "physical",
          "amount": {
            "damageTier": "小",
            "ratios": [],
            "flat": 500,
            "perRank": [
              0,
              375,
              750
            ]
          }
        }
      ]
    }
  ],
  "passive": [],
  "marks": []
}
```

## 37 吉伊卡哇 / EX 〔一起加油〕

- 原設計：為附近友軍提供護盾與短效抗恐懼，自己也獲得相同效果。
- 現有摘要：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-37-20260907.ex.guard","onExisting":"keepLarger"}]。
- 待補說明：目前自身；需附近友軍盾與短效抗恐懼。
- 原始狀態：adaptation-requires-review
- 本次靜態旗標：無上述有限規則旗標；不等於通過
- 來源：GGD社群英雄上傳內容_37名/recipes/37.upload-recipe.json

編譯後資料（與所附 runtime JSON 對照，不是重新編譯）：

```json
{
  "castType": "self",
  "maxRank": 1,
  "cooldown": [
    45
  ],
  "manaCost": [
    576
  ],
  "range": 6,
  "castTimeSec": 0.1,
  "damageAndMechanics": [
    {
      "kind": "applyBuff",
      "modifiers": [],
      "duration": 3
    },
    {
      "kind": "shield",
      "amount": {
        "flat": 120,
        "ratios": []
      },
      "duration": 3,
      "absorbs": "all",
      "stackKey": "community-review-37-20260907.ex.guard",
      "onExisting": "keepLarger"
    }
  ],
  "passive": [],
  "marks": []
}
```
