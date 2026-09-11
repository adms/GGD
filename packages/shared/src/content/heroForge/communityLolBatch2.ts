import type { CommunityHeroExample } from "./communityExamples";
import { withCommunityLolBatch2Presentation } from "./communityLolBatch2Presentation";

/** Fourth-batch authoring candidates. These are not publication-ready kits. #1185 / #1187 */
export const COMMUNITY_LOL_BATCH2_EXAMPLES = ([
  {
    "id": "sett",
    "name": "賽特",
    "inspiration": "賽特",
    "origin": "鬥士",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。受擊蓄勢、短手摔投鬥士",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/sett/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：右拳攻速細分與按實際受傷量連續換算，簡化為交替追加及三層桶；不是反傷。",
      "Q：移速不限定朝敵人方向；無普攻重置。",
      "W：依施法者面向揮拳，保留中心真傷與兩側物傷；受擊蓄勢仍以三層桶及兩檔護盾/傷害表示，未按實際承傷量連續換算。",
      "E：未判斷左右同時有人；不憑空給必定暈眩。",
      "R：抓抱期間跟隨施法者，以現有地面位移表達帶行，終點結算範圍傷害；沒有垂直拋物線，傷害不按被抱者額外生命換算。",
      "EX：笑點是治療換取停拳，不改 QWER。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "恆毅之泉",
        "purpose": "左右拳交替；低血量時週期回血；承傷累積最多三層供 W 使用。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onBasicAttack",
              "effects": [
                {
                  "kind": "consumeStatus",
                  "shape": "single",
                  "subject": "self",
                  "statusId": "$hero.right",
                  "appliedBy": "self",
                  "count": 1,
                  "onConsumed": [
                    {
                      "kind": "damage",
                      "damageType": "physical",
                      "amount": {
                        "damageTier": "極小"
                      }
                    }
                  ],
                  "onMissing": [
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.right",
                      "duration": 4,
                      "sourceScope": "caster",
                      "applyTo": "self"
                    }
                  ]
                }
              ]
            },
            {
              "on": "onInterval",
              "effects": [
                {
                  "kind": "heal",
                  "amount": {
                    "flat": 20,
                    "ratios": []
                  },
                  "applyTo": "self"
                }
              ],
              "target": "self",
              "internalCooldown": 2,
              "condition": {
                "kind": "stat",
                "subject": "self",
                "stat": "hp",
                "mode": "percent",
                "op": "<",
                "value": 0.5
              }
            },
            {
              "on": "onDamageTaken",
              "effects": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.grit",
                  "duration": 4,
                  "sourceScope": "caster",
                  "applyTo": "self",
                  "stacks": 1
                }
              ],
              "target": "self",
              "victim": "enemy",
              "internalCooldown": 0.5,
              "condition": {
                "not": {
                  "kind": "status",
                  "subject": "self",
                  "statusId": "$hero.grit",
                  "appliedBy": "self",
                  "minStacks": 3
                }
              }
            }
          ]
        }
      },
      "Q": {
        "name": "懾人猛拳",
        "purpose": "提速並強化接下來兩次普攻。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 4,
              "modifiers": [
                {
                  "stat": "ms",
                  "op": "pctAdd",
                  "msBonusTier": "極小"
                }
              ],
              "statusId": "$hero.q",
              "stackKey": "$hero.q",
              "maxStacks": 1,
              "hooks": [
                {
                  "on": "onBasicAttack",
                  "effects": [
                    {
                      "kind": "damage",
                      "damageType": "physical",
                      "amount": {
                        "damageTier": "極小"
                      },
                      "resourcePct": {
                        "subject": "target",
                        "resource": "health",
                        "basis": "max",
                        "perRank": [
                          0.02
                        ]
                      }
                    }
                  ],
                  "maxTriggers": 2,
                  "onConsumed": "detachSource"
                }
              ]
            }
          ]
        }
      },
      "W": {
        "name": "獸魂轟拳",
        "purpose": "朝面向揮拳並取得護盾；中心真傷、兩側物傷，同一敵人只受一種傷害。消耗已有恆毅，三層時提高護盾與傷害。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.6,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "consumeStatus",
              "shape": "single",
              "subject": "self",
              "statusId": "$hero.grit",
              "appliedBy": "self",
              "count": 3,
              "onConsumed": [
                {
                  "kind": "shield",
                  "amount": {
                    "flat": 180,
                    "ratios": []
                  },
                  "duration": 3,
                  "stackKey": "$hero.w",
                  "onExisting": "keepLarger",
                  "absorbs": "all"
                },
                {
                  "kind": "damageLine",
                  "amount": {
                    "damageTier": "中"
                  },
                  "length": 5,
                  "aim": "facing",
                  "fromCaster": true,
                  "includeOrigin": true,
                  "damageType": "true",
                  "width": 1.2,
                  "onHitTargets": [
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.w-center",
                      "duration": 0.1,
                      "sourceScope": "caster"
                    }
                  ]
                },
                {
                  "kind": "damageLine",
                  "amount": {
                    "damageTier": "中"
                  },
                  "length": 5,
                  "aim": "facing",
                  "fromCaster": true,
                  "includeOrigin": true,
                  "damageType": "physical",
                  "width": 2,
                  "victimCondition": {
                    "not": {
                      "kind": "status",
                      "subject": "target",
                      "statusId": "$hero.w-center",
                      "appliedBy": "self"
                    }
                  }
                }
              ],
              "onMissing": [
                {
                  "kind": "consumeStatus",
                  "shape": "single",
                  "subject": "self",
                  "statusId": "$hero.grit",
                  "appliedBy": "self",
                  "count": "all",
                  "onConsumed": [
                    {
                      "kind": "shield",
                      "amount": {
                        "flat": 80,
                        "ratios": []
                      },
                      "duration": 3,
                      "stackKey": "$hero.w",
                      "onExisting": "keepLarger",
                      "absorbs": "all"
                    },
                    {
                      "kind": "damageLine",
                      "amount": {
                        "damageTier": "小"
                      },
                      "length": 5,
                      "aim": "facing",
                      "fromCaster": true,
                      "includeOrigin": true,
                      "damageType": "true",
                      "width": 1.2,
                      "onHitTargets": [
                        {
                          "kind": "applyStatus",
                          "statusId": "$hero.w-center",
                          "duration": 0.1,
                          "sourceScope": "caster"
                        }
                      ]
                    },
                    {
                      "kind": "damageLine",
                      "amount": {
                        "damageTier": "小"
                      },
                      "length": 5,
                      "aim": "facing",
                      "fromCaster": true,
                      "includeOrigin": true,
                      "damageType": "physical",
                      "width": 2,
                      "victimCondition": {
                        "not": {
                          "kind": "status",
                          "subject": "target",
                          "statusId": "$hero.w-center",
                          "appliedBy": "self"
                        }
                      }
                    }
                  ],
                  "onMissing": [
                    {
                      "kind": "shield",
                      "amount": {
                        "flat": 80,
                        "ratios": []
                      },
                      "duration": 3,
                      "stackKey": "$hero.w",
                      "onExisting": "keepLarger",
                      "absorbs": "all"
                    },
                    {
                      "kind": "damageLine",
                      "amount": {
                        "damageTier": "小"
                      },
                      "length": 5,
                      "aim": "facing",
                      "fromCaster": true,
                      "includeOrigin": true,
                      "damageType": "true",
                      "width": 1.2,
                      "onHitTargets": [
                        {
                          "kind": "applyStatus",
                          "statusId": "$hero.w-center",
                          "duration": 0.1,
                          "sourceScope": "caster"
                        }
                      ]
                    },
                    {
                      "kind": "damageLine",
                      "amount": {
                        "damageTier": "小"
                      },
                      "length": 5,
                      "aim": "facing",
                      "fromCaster": true,
                      "includeOrigin": true,
                      "damageType": "physical",
                      "width": 2,
                      "victimCondition": {
                        "not": {
                          "kind": "status",
                          "subject": "target",
                          "statusId": "$hero.w-center",
                          "appliedBy": "self"
                        }
                      }
                    }
                  ]
                }
              ]
            }
          ]
        },
        "cooldown": "大"
      },
      "E": {
        "name": "碎顱猛擊",
        "purpose": "將身旁敵人拉近並減速，接 Q/W。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageArea",
              "damageType": "physical",
              "amount": {
                "damageTier": "極小"
              },
              "radius": 2.5,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "knockback",
                  "distance": 1.5,
                  "speed": 12,
                  "from": "pull",
                  "subtractGap": false,
                  "launchHeight": 0
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.e-slow",
                  "duration": 1,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.65
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "嘆為觀止",
        "purpose": "抱住單一敵人，朝目標方向帶行，移動結束後傷害並緩速周圍敵人。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "targeted",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "carry",
              "shape": "single",
              "durationSec": 0.55,
              "untargetable": {
                "autoAcquire": true,
                "mobAggro": true,
                "manualTarget": true,
                "abilityAoe": false
              },
              "onCarrierDeath": "release"
            },
            {
              "kind": "dash",
              "mode": "toPoint",
              "speed": 8,
              "maxDistance": 4,
              "onEnd": [
                {
                  "kind": "damageArea",
                  "damageType": "physical",
                  "amount": {
                    "damageTier": "中"
                  },
                  "radius": 2.5,
                  "includeOrigin": true,
                  "onHitTargets": [
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.r-slow",
                      "duration": 1.5,
                      "sourceScope": "caster",
                      "moveSpeedMult": 0.6
                    }
                  ]
                }
              ]
            }
          ]
        },
        "range": "極小",
        "cooldown": "大"
      },
      "EX": {
        "name": "媽媽來電",
        "purpose": "回復生命，但接電話時一秒不能普攻。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "heal",
              "amount": {
                "flat": 160,
                "ratios": []
              },
              "applyTo": "self"
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.phone",
              "duration": 1,
              "sourceScope": "caster",
              "applyTo": "self",
              "disarmed": true
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.ceee63ad759e049903f88f10fa95671f562c06de48e790b7"
  },
  {
    "id": "fiddlesticks",
    "name": "稻草人",
    "inspiration": "稻草人",
    "origin": "法師",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。恐懼接近、近身汲取與進場風暴",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/fiddlesticks/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：重大簡化：不是飾品、守衛、放置假身或未被看見判定；替身仍有既有自動攻擊。",
      "Q：不額外給未被看見時群體恐懼。",
      "W：重大簡化：不是引導中斷系統；回血暫為每波每命中者固定量，末段斬殺未加入。",
      "E：弧形與中央命中改為窄直帶，整條帶吃沉默。",
      "R：使用極大級前搖，死亡、暈眩或擊倒可在釋放前中斷；落地後啟動跟身群鴉，沒有草叢未視認額外恐懼。",
      "EX：只會既有代理普攻，不是三具複製 QWER 的分身。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "無害稻草人",
        "purpose": "回合開始生成一具短命低傷替身。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onRoundStart",
              "effects": [
                {
                  "kind": "summon",
                  "body": "self",
                  "count": 1,
                  "durationSec": 8,
                  "damageMult": 0.01,
                  "hpMult": 0.15,
                  "formation": "ring",
                  "spread": 1.5,
                  "maxAlive": 1,
                  "onOwnerDeath": "despawn"
                }
              ],
              "target": "self"
            }
          ]
        }
      },
      "Q": {
        "name": "恐懼",
        "purpose": "指定敵人傷害並恐懼。",
        "ref": "tpl-single-strike",
        "params": {
          "damage": {
            "damageTier": "極小"
          },
          "damageType": "magic",
          "castTimeSec": 0.2,
          "status": {
            "statusId": "$hero.fear",
            "duration": 1,
            "feared": true
          }
        }
      },
      "W": {
        "name": "豐收之魘",
        "purpose": "站定兩秒，周圍敵人每半秒受傷，每次脈衝自身回血。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.1,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyStatus",
              "statusId": "$hero.drain-root",
              "duration": 2,
              "sourceScope": "caster",
              "applyTo": "self",
              "root": true
            },
            {
              "kind": "delayed",
              "shape": "circle",
              "delaySec": 0.1,
              "count": 4,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "極小"
                  }
                },
                {
                  "kind": "heal",
                  "amount": {
                    "flat": 20,
                    "ratios": []
                  },
                  "applyTo": "self"
                }
              ],
              "stopOnCasterDeath": true,
              "radius": 2.5,
              "side": "enemies",
              "targetMode": "reresolve",
              "anchor": "caster"
            }
          ]
        }
      },
      "E": {
        "name": "駭懼收割",
        "purpose": "前方窄帶斬擊、減速並短暫沉默。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "小"
              },
              "length": 5,
              "width": 1.5,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.reap",
                  "duration": 1,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.7,
                  "silenced": true
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "群鴉風暴",
        "purpose": "長起手躍至落點，著地後開啟跟身三秒群鴉傷害。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 1,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "leap",
              "applyTo": "self",
              "mode": "toPoint",
              "apexHeight": 0,
              "durationSec": 0.1,
              "onLand": [
                {
                  "kind": "delayed",
                  "shape": "circle",
                  "delaySec": 0.1,
                  "count": 6,
                  "intervalSec": 0.5,
                  "effects": [
                    {
                      "kind": "damage",
                      "damageType": "magic",
                      "amount": {
                        "damageTier": "極小"
                      }
                    }
                  ],
                  "stopOnCasterDeath": true,
                  "radius": 2.5,
                  "side": "enemies",
                  "targetMode": "reresolve",
                  "anchor": "caster"
                }
              ]
            }
          ]
        },
        "range": "大",
        "cooldown": "極大",
        "cast": "極大"
      },
      "EX": {
        "name": "尖叫外包",
        "purpose": "召喚三具四秒低血低傷替身，分散對手注意力。",
        "ref": "tpl-summon-agent",
        "params": {
          "body": "self",
          "count": 3,
          "durationSec": 4,
          "hpMult": 0.1,
          "damageMult": 0.15,
          "formation": "ring",
          "spread": 2,
          "maxAlive": 3,
          "onOwnerDeath": "despawn",
          "cleanse": "none",
          "castTimeSec": 0.2
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.36ba05ae68e89ed2f913ebb6618d63f36e6bc546d8095c99"
  },
  {
    "id": "ornn",
    "name": "鄂爾",
    "inspiration": "鄂爾",
    "origin": "坦克",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。焦化接重擊與直線開戰坦克",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/ornn/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：重大簡化：不支援原地商店與傑作装備；只保留防禦工匠與焦化辨識。",
      "Q：重大簡化：沒有生成地形柱；不能描述可堵路或供 E 撞柱。",
      "W：多段前進吐息簡化為一次寬短線；不加不存在的不可阻擋。",
      "E：重大簡化：不偵測撞牆增幅或擊飛；不能冒充 Q→E 柱擊。",
      "R：PENDING MAIN：需要跨施放保存同一代理物、碰撞事件、方向重定與二段payload；不等同再射一隻羊。 原單段params只為技術候選，不授權作最終替代。",
      "EX：沒有任何裝備升級；保固就是這三秒的盾。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "活火爐",
        "purpose": "增加雙抗，普攻可消耗自身施加的焦化追加傷害及短擊退。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onRoundStart",
              "effects": [
                {
                  "kind": "applyBuff",
                  "applyTo": "self",
                  "modifiers": [
                    {
                      "stat": "armor",
                      "op": "pctAdd",
                      "value": 0.1
                    },
                    {
                      "stat": "mr",
                      "op": "pctAdd",
                      "value": 0.1
                    }
                  ],
                  "statusId": "$hero.forge-stats",
                  "stackKey": "$hero.forge-stats",
                  "maxStacks": 1,
                  "permanent": true
                }
              ],
              "target": "self"
            },
            {
              "on": "onBasicAttack",
              "effects": [
                {
                  "kind": "consumeStatus",
                  "shape": "single",
                  "subject": "target",
                  "statusId": "$hero.brittle",
                  "appliedBy": "self",
                  "count": 1,
                  "onConsumed": [
                    {
                      "kind": "damage",
                      "damageType": "magic",
                      "amount": {
                        "damageTier": "極小"
                      }
                    },
                    {
                      "kind": "knockback",
                      "distance": 0.5,
                      "speed": 12,
                      "from": "caster",
                      "subtractGap": false,
                      "launchHeight": 0
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      "Q": {
        "name": "火山脈動",
        "purpose": "前方裂地造成傷害並緩速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "physical",
              "amount": {
                "damageTier": "小"
              },
              "length": 6,
              "width": 1.4,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.q-slow",
                  "duration": 1.5,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.7
                }
              ]
            }
          ]
        }
      },
      "W": {
        "name": "熾焰吹息",
        "purpose": "向前吐火，命中施加三秒焦化。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.5,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "小"
              },
              "length": 4,
              "width": 2,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.brittle",
                  "duration": 3,
                  "sourceScope": "caster"
                }
              ]
            }
          ]
        }
      },
      "E": {
        "name": "熔岩俯衝",
        "purpose": "向前衝撞、傷害並推移敵人。",
        "ref": "tpl-charge-push",
        "params": {
          "dashDistance": 400,
          "dashDurationSec": 0.35,
          "radius": 150,
          "damage": {
            "damageTier": "小"
          },
          "damageType": "physical",
          "pushDistance": 100,
          "pushSpeed": 650,
          "pushFrom": "facing",
          "pushLaunchHeight": 0,
          "castTimeSec": 0.2
        }
      },
      "R": {
        "name": "鑄火者的呼喚",
        "purpose": "長起手後沿直線衝擊，施加緩速及焦化。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 1,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "中"
              },
              "length": 10,
              "width": 2,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.r-slow",
                  "duration": 1.5,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.6
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.brittle",
                  "duration": 3,
                  "sourceScope": "caster"
                }
              ]
            }
          ]
        },
        "range": "大",
        "cooldown": "極大"
      },
      "EX": {
        "name": "終身保固三秒",
        "purpose": "指定一位隊友給予短期大護盾；工匠站定吟唱。",
        "ref": "tpl-ally-shield",
        "params": {
          "target": "ally",
          "amount": {
            "flat": 220
          },
          "duration": 3,
          "absorbs": "all",
          "castTimeSec": 0.8
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.23b232debb6e8e2f8e9992680758ac840fa58f61fc18b4aa"
  },
  {
    "id": "chogath",
    "name": "科加斯",
    "inspiration": "科加斯",
    "origin": "坦克",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。擊殺補給、前排控制與低血吞噬",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/chogath/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：回復用固定GGD數值，不隨LoL等級原公式。",
      "Q：原地擊飛含0.2單位的小推移。",
      "W：錐形改成短寬直帶，保留方向與沉默用途。",
      "E：不改用無條件額外普攻被動；確實只有三次額度。",
      "R：20%處決線替代原作固定傷害致死判斷；onDevour在排致死傷時觸發，免死者可存活而仍給成長。最多六層+240生命，無體型成長。",
      "EX：不増大模型、不新增飽食資源。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "肉食者",
        "purpose": "擊殺敵方單位回復生命與魔力。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onKill",
              "effects": [
                {
                  "kind": "heal",
                  "amount": {
                    "flat": 50,
                    "ratios": []
                  },
                  "applyTo": "self"
                },
                {
                  "kind": "restore",
                  "manaPct": 0.03,
                  "applyTo": "self"
                }
              ],
              "target": "self",
              "victim": "enemy",
              "internalCooldown": 0.2
            }
          ]
        }
      },
      "Q": {
        "name": "破裂",
        "purpose": "落點預警後地刺傷害、短擊飛與緩速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "delayed",
              "shape": "circle",
              "delaySec": 0.5,
              "count": 1,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "小"
                  }
                },
                {
                  "kind": "knockback",
                  "distance": 0.2,
                  "speed": 12,
                  "from": "caster",
                  "subtractGap": false,
                  "launchHeight": 1
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.rupture-slow",
                  "duration": 1.5,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.65
                }
              ],
              "stopOnCasterDeath": true,
              "radius": 2,
              "side": "enemies",
              "targetMode": "reresolve"
            }
          ]
        }
      },
      "W": {
        "name": "野性尖嘯",
        "purpose": "前方短寬帶造成魔法傷害並沉默。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "小"
              },
              "length": 4,
              "width": 3,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.scream",
                  "duration": 1,
                  "sourceScope": "caster",
                  "silenced": true
                }
              ]
            }
          ]
        }
      },
      "E": {
        "name": "恐懼尖刺",
        "purpose": "接下來三次普攻向前噴刺，傷害及緩速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 6,
              "modifiers": [],
              "statusId": "$hero.spikes",
              "stackKey": "$hero.spikes",
              "maxStacks": 1,
              "hooks": [
                {
                  "on": "onBasicAttack",
                  "effects": [
                    {
                      "kind": "damageLine",
                      "damageType": "magic",
                      "amount": {
                        "damageTier": "極小"
                      },
                      "length": 4,
                      "width": 1.2,
                      "aim": "facing",
                      "fromCaster": true,
                      "includeOrigin": true,
                      "onHitTargets": [
                        {
                          "kind": "applyStatus",
                          "statusId": "$hero.spike-slow",
                          "duration": 1,
                          "sourceScope": "caster",
                          "moveSpeedMult": 0.75
                        }
                      ]
                    }
                  ],
                  "maxTriggers": 3,
                  "onConsumed": "detachSource"
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "饗宴",
        "purpose": "近距真傷；處決線內吞噬並獲得有上限的最大生命成長。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "targeted",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damage",
              "damageType": "true",
              "amount": {
                "damageTier": "中"
              },
              "condition": {
                "not": {
                  "kind": "stat",
                  "subject": "target",
                  "stat": "hp",
                  "mode": "percent",
                  "op": "<=",
                  "value": 0.2
                }
              }
            },
            {
              "kind": "devour",
              "shape": "single",
              "thresholdPctOfMax": [
                0.2
              ],
              "victim": "any",
              "healPct": 0,
              "throughShields": true,
              "onDevour": [
                {
                  "kind": "applyBuff",
                  "applyTo": "self",
                  "permanent": true,
                  "permanentScope": "match",
                  "modifiers": [
                    {
                      "stat": "maxHealth",
                      "op": "flat",
                      "value": 40
                    }
                  ],
                  "stackKey": "$hero.feast-growth",
                  "maxStacks": 6
                }
              ]
            }
          ]
        },
        "range": "極小",
        "cooldown": "大"
      },
      "EX": {
        "name": "吃太飽走不動",
        "purpose": "大口回復自身生命，但兩秒移速降至六成。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "heal",
              "amount": {
                "flat": 220,
                "ratios": []
              },
              "applyTo": "self"
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.full",
              "duration": 2,
              "sourceScope": "caster",
              "applyTo": "self",
              "moveSpeedMult": 0.6
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.b603c017d0f77565784aeb490fd0525ecac875ac62ab2ed9"
  },
  {
    "id": "ashe",
    "name": "艾希",
    "inspiration": "艾希",
    "origin": "射手",
    "attackType": "ranged",
    "summary": "設計草案，尚未完成上架驗收。普攻黏人、四層專注與遠距先手",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/ashe/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：暴擊轉為更強緩速未重寫共通暴擊規則。",
      "Q：強化一發仍是一次普攻，沒有五箭重新觸發on-hit。",
      "W：錐形多箭簡化為一次短寬直帶；同敵只計一發。",
      "R：用既有非穿透 imported.bolt 代理冰箭；固定1.2秒暈眩，非全圖，也未只碰英雄。",
      "EX：保鮮箱只提供盾與鎖足，沒有無敵。",
      "E：本地圖全圖可見，依 Owner 指示改為飛鷹送件的延遲區域繳械；不提供額外視野，不造成傷害。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "冰霜射擊",
        "purpose": "普攻減速；攻擊已帶自身霜痕的目標追加傷害，並累积最多四層專注。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onBasicAttack",
              "effects": [
                {
                  "kind": "damage",
                  "damageType": "physical",
                  "amount": {
                    "damageTier": "極小"
                  },
                  "condition": {
                    "kind": "status",
                    "subject": "target",
                    "statusId": "$hero.frost",
                    "appliedBy": "self"
                  }
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.frost",
                  "duration": 2,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.8
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.focus",
                  "duration": 4,
                  "sourceScope": "caster",
                  "applyTo": "self",
                  "stacks": 1,
                  "condition": {
                    "not": {
                      "kind": "status",
                      "subject": "self",
                      "statusId": "$hero.focus",
                      "appliedBy": "self",
                      "minStacks": 4
                    }
                  }
                }
              ]
            }
          ]
        }
      },
      "Q": {
        "name": "專注射擊",
        "purpose": "消耗四層專注，四秒加攻速並每次普攻追加小額傷害。",
        "ref": "tpl-spend-resource",
        "params": {
          "statusId": "$hero.focus",
          "minStacks": 4,
          "castType": "self",
          "castTimeSec": 0,
          "missingText": "先普攻累積四層專注",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 4,
              "modifiers": [
                {
                  "stat": "as",
                  "op": "pctAdd",
                  "value": 0.4
                }
              ],
              "statusId": "$hero.focus-active",
              "stackKey": "$hero.focus-active",
              "maxStacks": 1,
              "hooks": [
                {
                  "on": "onBasicAttack",
                  "effects": [
                    {
                      "kind": "damage",
                      "damageType": "physical",
                      "amount": {
                        "damageTier": "極小"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      "W": {
        "name": "萬箭齊發",
        "purpose": "朝面向射出短寬箭幕，傷害並施加霜痕緩速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "physical",
              "amount": {
                "damageTier": "小"
              },
              "length": 7,
              "width": 3,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.frost",
                  "duration": 2,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.8
                }
              ]
            }
          ]
        }
      },
      "E": {
        "name": "鷹擊長空：強制簽收",
        "purpose": "指定區域出現送件預警，0.7 秒後使仍在區域內的敵人繳械 0.8 秒，不能普攻但仍可移動與施法。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 0.1,
          "radius": 2,
          "side": "enemies",
          "effects": [
            {
              "kind": "delayed",
              "shape": "circle",
              "radius": 2,
              "side": "enemies",
              "delaySec": 0.7,
              "targetMode": "reresolve",
              "effects": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.delivery-signature",
                  "duration": 0.8,
                  "sourceScope": "caster",
                  "applyTo": "target",
                  "disarmed": true
                }
              ]
            }
          ]
        },
        "range": "大",
        "cooldown": "中",
        "cast": "小"
      },
      "R": {
        "name": "魔法水晶箭",
        "purpose": "發射會碰撞的直線冰箭，主目標暈眩，周圍緩速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.5,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "spawnProjectile",
              "projectileId": "imported.bolt",
              "onHit": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "中"
                  }
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.arrow-stun",
                  "duration": 1.2,
                  "sourceScope": "caster",
                  "stun": true
                },
                {
                  "kind": "damageArea",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "極小"
                  },
                  "radius": 2,
                  "includeOrigin": true,
                  "onHitTargets": [
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.arrow-slow",
                      "duration": 1.5,
                      "sourceScope": "caster",
                      "moveSpeedMult": 0.65
                    }
                  ]
                }
              ]
            }
          ]
        },
        "range": "大",
        "cooldown": "大"
      },
      "EX": {
        "name": "冷凍保存",
        "purpose": "兩秒護盾保鮮；前0.6秒自己鎖足。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "shield",
              "amount": {
                "flat": 180,
                "ratios": []
              },
              "duration": 2,
              "stackKey": "$hero.freezer",
              "onExisting": "keepLarger",
              "absorbs": "all"
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.freezer-root",
              "duration": 0.6,
              "sourceScope": "caster",
              "applyTo": "self",
              "root": true
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.0fba948f704d352fb81c2afda4d8dd206de61e2733e8aa70"
  },
  {
    "id": "blitzcrank",
    "name": "布里姿",
    "inspiration": "布里姿",
    "origin": "坦克",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。拉人、過熱衝刺與打斷連招",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/blitzcrank/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：按最大魔力而非即時魔力；致死一擊能否先觸發須依現有onDamageTaken時序驗證。",
      "Q：既有投射物代理手臂；拉回受共通落點/牆規則限制。",
      "W：保持加速後自緩速代價，無第二段按鍵。",
      "E：追加GGD傷害級距，不承諾原作雙倍普攻公式。",
      "R：R學習後普攻延遲電擊暫未接；保留主動破盾沉默。",
      "EX：只消耗自己的Q收據，不影響別人的抓取狀態。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "法力屏障",
        "purpose": "低於30%生命受擊時取得魔力比例護盾。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onDamageTaken",
              "effects": [
                {
                  "kind": "shield",
                  "amount": {
                    "flat": 0,
                    "ratios": [
                      {
                        "stat": "maxMana",
                        "coeff": 0.2
                      }
                    ]
                  },
                  "duration": 3,
                  "stackKey": "$hero.mana-barrier",
                  "onExisting": "keepLarger",
                  "absorbs": "all"
                }
              ],
              "target": "self",
              "internalCooldown": 20,
              "condition": {
                "kind": "stat",
                "subject": "self",
                "stat": "hp",
                "mode": "percent",
                "op": "<",
                "value": 0.3
              }
            }
          ]
        }
      },
      "Q": {
        "name": "火箭抓取",
        "purpose": "直線手臂命中第一位敵人，造成傷害並拉回。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "spawnProjectile",
              "projectileId": "imported.bolt",
              "onHit": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "小"
                  }
                },
                {
                  "kind": "leap",
                  "applyTo": "target",
                  "mode": "inPlace",
                  "dragToCaster": true,
                  "apexHeight": 0,
                  "durationSec": 0.15
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.grabbed",
                  "duration": 2,
                  "sourceScope": "caster"
                }
              ]
            }
          ]
        },
        "range": "大",
        "cooldown": "中"
      },
      "W": {
        "name": "過載運轉",
        "purpose": "三秒移速與攻速提升，結束後一秒自緩速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
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
                  "value": 0.25
                }
              ],
              "statusId": "$hero.overdrive",
              "stackKey": "$hero.overdrive",
              "maxStacks": 1
            },
            {
              "kind": "delayed",
              "shape": "single",
              "delaySec": 3,
              "count": 1,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.overheat",
                  "duration": 1,
                  "sourceScope": "caster",
                  "applyTo": "self",
                  "moveSpeedMult": 0.7
                }
              ],
              "stopOnCasterDeath": true
            }
          ]
        }
      },
      "E": {
        "name": "充能一擊",
        "purpose": "下一次普攻追加物理傷害並擊飛。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 5,
              "modifiers": [],
              "statusId": "$hero.fist",
              "stackKey": "$hero.fist",
              "maxStacks": 1,
              "hooks": [
                {
                  "on": "onBasicAttack",
                  "effects": [
                    {
                      "kind": "damage",
                      "damageType": "physical",
                      "amount": {
                        "damageTier": "小"
                      }
                    },
                    {
                      "kind": "knockback",
                      "distance": 0.2,
                      "speed": 12,
                      "from": "caster",
                      "subtractGap": false,
                      "launchHeight": 1
                    }
                  ],
                  "maxTriggers": 1,
                  "onConsumed": "detachSource"
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "靜電力場",
        "purpose": "移除身旁敵人护盾，傷害並短暫沉默。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "shieldBreak",
              "shape": "circle",
              "radius": 3,
              "side": "enemies"
            },
            {
              "kind": "damageArea",
              "damageType": "magic",
              "amount": {
                "damageTier": "中"
              },
              "radius": 3,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.static-silence",
                  "duration": 0.7,
                  "sourceScope": "caster",
                  "silenced": true
                }
              ]
            }
          ]
        },
        "cooldown": "大"
      },
      "EX": {
        "name": "七天鑑賞期",
        "purpose": "把剛才自己 Q 抓到的目標退回去；沒抓過不能退貨。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "targeted",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "consumeStatus",
              "shape": "single",
              "subject": "target",
              "statusId": "$hero.grabbed",
              "appliedBy": "self",
              "count": 1,
              "onConsumed": [
                {
                  "kind": "damage",
                  "damageType": "physical",
                  "amount": {
                    "damageTier": "極小"
                  }
                },
                {
                  "kind": "knockback",
                  "distance": 4,
                  "speed": 12,
                  "from": "caster",
                  "subtractGap": false,
                  "launchHeight": 0
                }
              ],
              "onMissing": [
                {
                  "kind": "floatingText",
                  "shape": "single",
                  "text": "查無訂單",
                  "applyTo": "self"
                }
              ]
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.ab29dff238c2e771e10e894702acc029d60c69c1efbbdfcc"
  },
  {
    "id": "ahri",
    "name": "阿璃",
    "inspiration": "阿璃",
    "origin": "法師",
    "attackType": "ranged",
    "summary": "設計草案，尚未完成上架驗收。方向法球、魅惑接輸出與短衝換位",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/ahri/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：計數60秒窗口；英雄取擊殺而非助攻參與。",
      "Q：已確認缺少往返彈道：第二段仍從施法者當下位置/面向重新判定，不能當作返航追身的球；列為來源核心缺口。",
      "W：每波重新選一人，沒有三顆獨立導引飛彈；仍保留近身自動攻擊用途。",
      "E：重大簡化：沒有charmed軸，故不是持續強制走向她，也不保證打斷所有位移。",
      "R：PENDING MAIN：需要一個有剩餘次數、窗口期限與重施放冷卻的狀態，不等同自動三段。 原單段params只為技術候選，不授權作最終替代。",
      "EX：單純離場工具，沒有刷新R。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "銷魂",
        "purpose": "擊殺九個小兵/野怪回復；擊殺英雄額外回復。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onKill",
              "effects": [
                {
                  "kind": "consumeStatus",
                  "shape": "single",
                  "subject": "self",
                  "statusId": "$hero.essence",
                  "appliedBy": "self",
                  "count": 8,
                  "onConsumed": [
                    {
                      "kind": "heal",
                      "amount": {
                        "flat": 120,
                        "ratios": []
                      },
                      "applyTo": "self"
                    }
                  ],
                  "onMissing": [
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.essence",
                      "duration": 60,
                      "sourceScope": "caster",
                      "applyTo": "self",
                      "stacks": 1
                    }
                  ]
                }
              ],
              "target": "self",
              "victim": "mob"
            },
            {
              "on": "onKill",
              "effects": [
                {
                  "kind": "heal",
                  "amount": {
                    "flat": 180,
                    "ratios": []
                  },
                  "applyTo": "self"
                }
              ],
              "target": "self",
              "victim": "enemyChampion"
            }
          ]
        }
      },
      "Q": {
        "name": "幻玉",
        "purpose": "向前第一段魔法傷害，短延遲第二段真實傷害。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "極小"
              },
              "length": 7,
              "width": 1.4,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true
            },
            {
              "kind": "delayed",
              "shape": "single",
              "delaySec": 0.6,
              "count": 1,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "damageLine",
                  "damageType": "true",
                  "amount": {
                    "damageTier": "極小"
                  },
                  "length": 7,
                  "width": 1.4,
                  "aim": "facing",
                  "fromCaster": true,
                  "includeOrigin": true
                }
              ],
              "stopOnCasterDeath": true
            }
          ]
        }
      },
      "W": {
        "name": "魅火",
        "purpose": "自身短加速，三次打擊周圍敵人。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 2,
              "modifiers": [
                {
                  "stat": "ms",
                  "op": "pctAdd",
                  "msBonusTier": "極小"
                }
              ],
              "statusId": "$hero.foxfire-speed",
              "stackKey": "$hero.foxfire-speed",
              "maxStacks": 1
            },
            {
              "kind": "delayed",
              "shape": "circle",
              "delaySec": 0.1,
              "count": 3,
              "intervalSec": 0.15,
              "effects": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "極小"
                  }
                }
              ],
              "stopOnCasterDeath": true,
              "radius": 2.5,
              "side": "enemies",
              "maxTargets": 1,
              "targetMode": "reresolve",
              "anchor": "caster"
            }
          ]
        }
      },
      "E": {
        "name": "傾城",
        "purpose": "直線吻彈命中後減速、繳械，並短距朝阿璃拉近。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "spawnProjectile",
              "projectileId": "imported.bolt",
              "onHit": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "極小"
                  }
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.charm",
                  "duration": 1,
                  "sourceScope": "caster",
                  "disarmed": true,
                  "moveSpeedMult": 0.5
                },
                {
                  "kind": "knockback",
                  "distance": 1.5,
                  "speed": 12,
                  "from": "pull",
                  "subtractGap": false,
                  "launchHeight": 0
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "飛仙",
        "purpose": "向落點快速短衝，抵達後傷害周圍敵人。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "leap",
              "applyTo": "self",
              "mode": "toPoint",
              "apexHeight": 0,
              "durationSec": 0.15,
              "landRadius": 2,
              "onLand": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "小"
                  }
                }
              ]
            }
          ]
        },
        "range": "小",
        "cooldown": "中"
      },
      "EX": {
        "name": "已讀不回",
        "purpose": "短瞬移逃離，但兩秒不能普攻。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "blink",
              "to": "point",
              "shape": "single"
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.no-reply",
              "duration": 2,
              "sourceScope": "caster",
              "applyTo": "self",
              "disarmed": true
            }
          ]
        },
        "range": "小",
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.fc8ae8460374f5a9df00338cf93c74323c00bbbfc8bfedcc"
  },
  {
    "id": "thresh",
    "name": "瑟雷西",
    "inspiration": "瑟雷西",
    "origin": "軟輔",
    "attackType": "ranged",
    "summary": "設計草案，尚未完成上架驗收。鉤鎖控距、燈籠救援與區域封鎖",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/thresh/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：重大簡化：沒有地面魂物件或附近死亡拾魂；是自身擊殺給屬性，最多20層。",
      "Q：PENDING MAIN：需要命中解鎖、目標綁定、失效/死亡處理與自願追入；不等同必中突進或自動追入。 原單段params只為技術候選，不授權作最終替代。",
      "W：重大簡化：施法者指定隊友，沒有隊友點燈選擇；本候選不附盾，不能描述有護盾。",
      "E：前後反向選擇用轉身面向代替；蓄力普攻部分暫省略。",
      "R：重大簡化：沒有五面牆、穿牆破壞或單牆觸發；只是一圈施放時控制。",
      "EX：不召喚不可通行的燈籠物件。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "靈魂饗宴",
        "purpose": "擊殺敵人獲得有上限的護甲與魔攻成長。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onKill",
              "effects": [
                {
                  "kind": "applyBuff",
                  "applyTo": "self",
                  "permanent": true,
                  "permanentScope": "match",
                  "modifiers": [
                    {
                      "stat": "armor",
                      "op": "flat",
                      "value": 1
                    },
                    {
                      "stat": "ap",
                      "op": "flat",
                      "value": 1
                    }
                  ],
                  "stackKey": "$hero.souls",
                  "maxStacks": 20
                }
              ],
              "target": "self",
              "victim": "enemy"
            }
          ]
        }
      },
      "Q": {
        "name": "死亡宣告",
        "purpose": "直線鉤命中後傷害、鎖足並短拉近。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "spawnProjectile",
              "projectileId": "imported.bolt",
              "onHit": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "小"
                  }
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.hook",
                  "duration": 1.2,
                  "sourceScope": "caster",
                  "root": true
                },
                {
                  "kind": "knockback",
                  "distance": 1.5,
                  "speed": 12,
                  "from": "pull",
                  "subtractGap": false,
                  "launchHeight": 0
                }
              ]
            }
          ]
        },
        "range": "大"
      },
      "W": {
        "name": "鬼影燈籠",
        "purpose": "指定一位隊友直接拉到自己腳邊。",
        "ref": "tpl-teleport",
        "params": {
          "destination": "rallyToCaster",
          "travelSec": 0.2,
          "arriveRadius": 150,
          "castTimeSec": 0.2
        },
        "cooldown": "大"
      },
      "E": {
        "name": "懾魂掃蕩",
        "purpose": "向面向掃鏈，傷害並把命中者沿揮擊方向推移。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "小"
              },
              "length": 4,
              "width": 2.5,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "knockback",
                  "distance": 1.5,
                  "speed": 12,
                  "from": "facing",
                  "subtractGap": false,
                  "launchHeight": 0
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.flay-slow",
                  "duration": 1,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.7
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "惡靈領域",
        "purpose": "自身周圍一次重緩速與傷害，阻擋追近。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageArea",
              "damageType": "magic",
              "amount": {
                "damageTier": "中"
              },
              "radius": 3,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.box",
                  "duration": 2,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.3
                }
              ]
            }
          ]
        },
        "cooldown": "大"
      },
      "EX": {
        "name": "本燈拒載",
        "purpose": "把貼身敵人向外推，給隊友清出上車位置。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageArea",
              "damageType": "magic",
              "amount": {
                "damageTier": "極小"
              },
              "radius": 2,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "knockback",
                  "distance": 2,
                  "speed": 12,
                  "from": "caster",
                  "subtractGap": false,
                  "launchHeight": 0
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.rejected",
                  "duration": 1,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.6
                }
              ]
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.91bb53c74fdca5cd643260d0f197733f14068f4a79a3e488"
  },
  {
    "id": "velkoz",
    "name": "威寇茲",
    "inspiration": "威寇茲",
    "origin": "法師",
    "attackType": "ranged",
    "summary": "設計草案，尚未完成上架驗收。三次命中拆解與直線追打砲台",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/velkoz/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：標記按施法者分離；每0.1秒最多觸發一次，全域節流非每敵獨立；衍生傷害不可遞迴疊自己。",
      "Q：重大簡化：沒有再按分裂、左右90度支彈；保留直線消耗。",
      "W：已確認 delayed.point 不被 damageLine 當作幾何起點；第二段仍讀施法者當下位置/面向，缺固定裂痕及兩次充能，列為來源核心缺口。",
      "E：近遠受害者都同一小推移；沒有額外專用判斷。",
      "R：重大簡化：非可轉向可中斷的正式channel；不能宣稱沉默/移動會取消已排程射線。",
      "EX：會失去該目標R真傷資格，真有交換代價。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "結構毀滅",
        "purpose": "技能命中同敵人第三次時消耗兩層舊標記，追加真傷並標記研究完成。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onAbilityHit",
              "effects": [
                {
                  "kind": "consumeStatus",
                  "shape": "single",
                  "subject": "target",
                  "statusId": "$hero.deconstruction",
                  "appliedBy": "self",
                  "count": 2,
                  "onConsumed": [
                    {
                      "kind": "damage",
                      "damageType": "true",
                      "amount": {
                        "damageTier": "小"
                      }
                    },
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.researched",
                      "duration": 6,
                      "sourceScope": "caster"
                    }
                  ],
                  "onMissing": [
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.deconstruction",
                      "duration": 5,
                      "sourceScope": "caster",
                      "stacks": 1
                    }
                  ]
                }
              ],
              "internalCooldown": 0.1
            }
          ]
        }
      },
      "Q": {
        "name": "分裂電漿",
        "purpose": "直線電漿命中造成傷害及緩速。",
        "ref": "tpl-projectile-strike",
        "params": {
          "projectileId": "imported.bolt.void",
          "damage": {
            "damageTier": "小"
          },
          "damageType": "magic",
          "castTimeSec": 0.2,
          "status": {
            "statusId": "$hero.plasma",
            "duration": 1.5,
            "moveSpeedMult": 0.7
          }
        }
      },
      "W": {
        "name": "虛空裂痕",
        "purpose": "直線裂痕先小爆，延遲後再爆。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "skillshot",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageLine",
              "damageType": "magic",
              "amount": {
                "damageTier": "極小"
              },
              "length": 7,
              "width": 1.5,
              "aim": "facing",
              "fromCaster": true,
              "includeOrigin": true
            },
            {
              "kind": "delayed",
              "shape": "single",
              "delaySec": 0.6,
              "count": 1,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "damageLine",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "小"
                  },
                  "length": 7,
                  "width": 1.5,
                  "aim": "facing",
                  "fromCaster": true,
                  "includeOrigin": true
                }
              ],
              "stopOnCasterDeath": true
            }
          ]
        }
      },
      "E": {
        "name": "反物質瓦解",
        "purpose": "落點爆破、短击飛並向外小推。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "delayed",
              "shape": "circle",
              "delaySec": 0.5,
              "count": 1,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "小"
                  }
                },
                {
                  "kind": "knockback",
                  "distance": 0.6,
                  "speed": 12,
                  "from": "caster",
                  "subtractGap": false,
                  "launchHeight": 1
                }
              ],
              "stopOnCasterDeath": true,
              "radius": 2,
              "side": "enemies",
              "targetMode": "reresolve"
            }
          ]
        }
      },
      "R": {
        "name": "生化射線",
        "purpose": "站定2.5秒，前方射線五次判定；研究完成目標吃真傷。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.3,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyStatus",
              "statusId": "$hero.ray-root",
              "duration": 2.5,
              "sourceScope": "caster",
              "applyTo": "self",
              "root": true
            },
            {
              "kind": "delayed",
              "shape": "single",
              "delaySec": 0.1,
              "count": 5,
              "intervalSec": 0.5,
              "effects": [
                {
                  "kind": "damageLine",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "極小"
                  },
                  "length": 9,
                  "width": 1.3,
                  "aim": "facing",
                  "fromCaster": true,
                  "includeOrigin": true,
                  "victimCondition": {
                    "not": {
                      "kind": "status",
                      "subject": "target",
                      "statusId": "$hero.researched",
                      "appliedBy": "self"
                    }
                  }
                },
                {
                  "kind": "damageLine",
                  "damageType": "true",
                  "amount": {
                    "damageTier": "極小"
                  },
                  "length": 9,
                  "width": 1.3,
                  "aim": "facing",
                  "fromCaster": true,
                  "includeOrigin": true,
                  "victimCondition": {
                    "kind": "status",
                    "subject": "target",
                    "statusId": "$hero.researched",
                    "appliedBy": "self"
                  }
                }
              ],
              "stopOnCasterDeath": true
            }
          ]
        },
        "cooldown": "極大"
      },
      "EX": {
        "name": "論文退回重寫",
        "purpose": "只對自己研究完成的敵人清除研究標记，換回自己魔力並緩速對方。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "targeted",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "consumeStatus",
              "shape": "single",
              "subject": "target",
              "statusId": "$hero.researched",
              "appliedBy": "self",
              "count": "all",
              "onConsumed": [
                {
                  "kind": "restore",
                  "manaPct": 0.15,
                  "applyTo": "self"
                },
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.review",
                  "duration": 2,
                  "sourceScope": "caster",
                  "moveSpeedMult": 0.65
                }
              ],
              "onMissing": [
                {
                  "kind": "floatingText",
                  "shape": "single",
                  "text": "資料不足，請補實驗",
                  "applyTo": "self"
                }
              ]
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.d0d30f1ed7d6244e5f1bc646047a2d86d87a68bc5673f399"
  },
  {
    "id": "malphite",
    "name": "墨菲特",
    "inspiration": "墨菲特",
    "origin": "坦克",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。岩盾換血、減攻速與落點擊飛坦克",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/malphite/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：需驗證護盾完全吸收的命中是否仍重設受擊計時；未驗前不宣称正典回盾完整。",
      "Q：固定加減速，不按目標原速逐量偷取。",
      "W：首下普攻重置與護盾期間三倍護甲未加入。",
      "E：本草案先用傷害級距，不另抄護甲換算數字。",
      "R：共通牆前落點規則仍在；未額外授予無敵/全程不可阻擋。",
      "EX：不是牆體，不擋路、不改碰撞。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "花崗岩護盾",
        "purpose": "六秒未受傷後回充最大生命10%護盾。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onDamageTaken",
              "effects": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.recent-damage",
                  "duration": 6,
                  "sourceScope": "caster",
                  "applyTo": "self"
                }
              ],
              "target": "self"
            },
            {
              "on": "onInterval",
              "effects": [
                {
                  "kind": "shield",
                  "amount": {
                    "flat": 0,
                    "ratios": [
                      {
                        "stat": "maxHealth",
                        "coeff": 0.1
                      }
                    ]
                  },
                  "duration": 7,
                  "stackKey": "$hero.granite",
                  "onExisting": "keepLarger",
                  "absorbs": "all"
                }
              ],
              "target": "self",
              "internalCooldown": 1,
              "condition": {
                "not": {
                  "kind": "status",
                  "subject": "self",
                  "statusId": "$hero.recent-damage",
                  "appliedBy": "self"
                }
              }
            }
          ]
        }
      },
      "Q": {
        "name": "地震碎片",
        "purpose": "指定敵人受傷減速，自己獲得短加速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "targeted",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damage",
              "damageType": "magic",
              "amount": {
                "damageTier": "小"
              }
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.shard-slow",
              "duration": 3,
              "sourceScope": "caster",
              "moveSpeedMult": 0.75
            },
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 3,
              "modifiers": [
                {
                  "stat": "ms",
                  "op": "pctAdd",
                  "msBonusTier": "極小"
                }
              ],
              "statusId": "$hero.shard-speed",
              "stackKey": "$hero.shard-speed",
              "maxStacks": 1
            }
          ]
        }
      },
      "W": {
        "name": "震雷之擊",
        "purpose": "四秒強化普攻，附帶前方震波。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 4,
              "modifiers": [
                {
                  "stat": "armor",
                  "op": "pctAdd",
                  "value": 0.1
                }
              ],
              "statusId": "$hero.thunder",
              "stackKey": "$hero.thunder",
              "maxStacks": 1,
              "hooks": [
                {
                  "on": "onBasicAttack",
                  "effects": [
                    {
                      "kind": "damageLine",
                      "damageType": "physical",
                      "amount": {
                        "damageTier": "極小"
                      },
                      "length": 3,
                      "width": 2,
                      "aim": "facing",
                      "fromCaster": true,
                      "includeOrigin": true
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      "E": {
        "name": "大地震顫",
        "purpose": "周圍魔法震擊並降低攻速。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damageArea",
              "damageType": "magic",
              "amount": {
                "damageTier": "小"
              },
              "radius": 2.5,
              "includeOrigin": true,
              "onHitTargets": [
                {
                  "kind": "applyBuff",
                  "duration": 2,
                  "modifiers": [
                    {
                      "stat": "as",
                      "op": "pctAdd",
                      "value": -0.25
                    }
                  ],
                  "statusId": "$hero.slam-as",
                  "stackKey": "$hero.slam-as",
                  "maxStacks": 1,
                  "sourceScope": "caster",
                  "dispellable": true,
                  "polarity": "debuff"
                }
              ]
            }
          ]
        }
      },
      "R": {
        "name": "勢不可擋",
        "purpose": "高速衝到指定落點，著地傷害並擊飛周邊。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "ground",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "leap",
              "applyTo": "self",
              "mode": "toPoint",
              "apexHeight": 0,
              "durationSec": 0.2,
              "landRadius": 2.5,
              "onLand": [
                {
                  "kind": "damage",
                  "damageType": "magic",
                  "amount": {
                    "damageTier": "中"
                  }
                },
                {
                  "kind": "knockback",
                  "distance": 0.2,
                  "speed": 12,
                  "from": "caster",
                  "subtractGap": false,
                  "launchHeight": 1.2
                }
              ]
            }
          ]
        },
        "range": "大",
        "cooldown": "大"
      },
      "EX": {
        "name": "此處禁止停車",
        "purpose": "原地三秒提高雙抗，但自己也不能移動。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 3,
              "modifiers": [
                {
                  "stat": "armor",
                  "op": "pctAdd",
                  "value": 0.35
                },
                {
                  "stat": "mr",
                  "op": "pctAdd",
                  "value": 0.35
                }
              ],
              "statusId": "$hero.parking",
              "stackKey": "$hero.parking",
              "maxStacks": 1
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.parking-root",
              "duration": 3,
              "sourceScope": "caster",
              "applyTo": "self",
              "root": true
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.bf5d1c1350a97aa76cd9edcf9e9f2d1cf1452626f91c489e"
  },
  {
    "id": "garen",
    "name": "蓋倫",
    "inspiration": "蓋倫",
    "origin": "鬥士",
    "attackType": "melee",
    "summary": "設計草案，尚未完成上架驗收。脫戰續航、沉默旋轉與低血收尾",
    "sourceUrl": "https://www.leagueoflegends.com/zh-tw/champions/garen/",
    "adaptations": [
      "保留原版 QWER；以下候選只供編譯與設計比對，尚未完成的關鍵機制待 Main 接入。",
      "PASSIVE：敵人/兵種重置差異先統一為受傷；不是戰鬥中固定秒回。",
      "Q：已確認現有 dispel 無慢速篩選，不能只解除既有減速；statusImmunity 只拒絕新掛載，列為來源核心缺口；不擴張成全淨化。",
      "W：重要簡化：暫未接韌性、後段減傷和擊殺永久雙抗。",
      "E：damageTier 是整段預算，由模板分攤，不能文案寫每波中級傷害。",
      "R：不做必殺保證；護盾/免死仍按現有傷害規則。",
      "EX：笑點只在EX的休息交換；不改QER熟悉連招。"
    ],
    "moves": {
      "PASSIVE": {
        "name": "堅韌",
        "purpose": "八秒未受傷後每秒回復少量最大生命。",
        "ref": "tpl-event-passive",
        "params": {
          "hooks": [
            {
              "on": "onDamageTaken",
              "effects": [
                {
                  "kind": "applyStatus",
                  "statusId": "$hero.recent-damage",
                  "duration": 8,
                  "sourceScope": "caster",
                  "applyTo": "self"
                }
              ],
              "target": "self"
            },
            {
              "on": "onInterval",
              "effects": [
                {
                  "kind": "heal",
                  "amount": {
                    "flat": 0,
                    "ratios": [
                      {
                        "stat": "maxHealth",
                        "coeff": 0.01
                      }
                    ]
                  },
                  "applyTo": "self"
                }
              ],
              "target": "self",
              "internalCooldown": 1,
              "condition": {
                "not": {
                  "kind": "status",
                  "subject": "self",
                  "statusId": "$hero.recent-damage",
                  "appliedBy": "self"
                }
              }
            }
          ]
        }
      },
      "Q": {
        "name": "致命打擊",
        "purpose": "自己加速，下一次普攻追加傷害並沉默。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "applyBuff",
              "applyTo": "self",
              "duration": 4,
              "modifiers": [
                {
                  "stat": "ms",
                  "op": "pctAdd",
                  "msBonusTier": "極小"
                }
              ],
              "statusId": "$hero.decisive",
              "stackKey": "$hero.decisive",
              "maxStacks": 1,
              "hooks": [
                {
                  "on": "onBasicAttack",
                  "effects": [
                    {
                      "kind": "damage",
                      "damageType": "physical",
                      "amount": {
                        "damageTier": "小"
                      }
                    },
                    {
                      "kind": "applyStatus",
                      "statusId": "$hero.silence",
                      "duration": 1,
                      "sourceScope": "caster",
                      "silenced": true
                    }
                  ],
                  "maxTriggers": 1,
                  "onConsumed": "detachSource"
                }
              ]
            }
          ]
        }
      },
      "W": {
        "name": "勇氣",
        "purpose": "短暂護盾抵禦爆發。",
        "ref": "tpl-ally-shield",
        "params": {
          "target": "self",
          "amount": {
            "flat": 140
          },
          "duration": 2,
          "absorbs": "all",
          "castTimeSec": 0
        }
      },
      "E": {
        "name": "審判",
        "purpose": "跟隨自身旋轉三秒、週期傷害周圍敵人。",
        "ref": "tpl-periodic-field",
        "params": {
          "intervalSec": 0.5,
          "durationSec": 3,
          "radiusTier": "小",
          "anchor": "caster",
          "applyTo": "enemies",
          "damageTier": "中",
          "damageType": "physical",
          "castTimeSec": 0.2
        }
      },
      "R": {
        "name": "蒂瑪西亞制裁",
        "purpose": "近距真實傷害，附加目標已損生命比例傷害。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "targeted",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "damage",
              "damageType": "true",
              "amount": {
                "damageTier": "中"
              },
              "resourcePct": {
                "subject": "target",
                "resource": "health",
                "basis": "missing",
                "perRank": [
                  0.15
                ]
              }
            }
          ]
        },
        "range": "極小",
        "cooldown": "大"
      },
      "EX": {
        "name": "蒂瑪西亞先休息",
        "purpose": "大聲喊完口號後原地休息，一秒鎖足換生命回復。",
        "ref": "tpl-effect-sequence",
        "params": {
          "castType": "self",
          "castTimeSec": 0.2,
          "radius": 2.5,
          "side": "enemies",
          "effects": [
            {
              "kind": "heal",
              "amount": {
                "flat": 180,
                "ratios": []
              },
              "applyTo": "self"
            },
            {
              "kind": "applyStatus",
              "statusId": "$hero.rest",
              "duration": 1,
              "sourceScope": "caster",
              "applyTo": "self",
              "root": true
            }
          ]
        },
        "cooldown": "大"
      }
    },
    "modelKey": "community.body.1154f4db6e021c2671f95dfba066eb3da601efbc5779ab13"
  }
] satisfies readonly CommunityHeroExample[]).map(withCommunityLolBatch2Presentation);

/** Source-critical mechanics are pending; the editor must not offer these as completed presets. */
export const COMMUNITY_LOL_BATCH2_RELEASE_READY = false;
