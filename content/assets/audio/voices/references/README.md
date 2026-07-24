# 參考音收件口 — reference clip dropbox

擁有者說：「我稍後給你代表性的其他聲音檔給你參考」。這裡就是丟檔的地方。

## 為什麼需要這個

現在 113 位角色的語音只有 **Otoya ×72 / Kyoko ×41** 兩種聲源。一場 12 人最多只聽得到兩種音色，
戰鬥時音訊層等於噪音，聽不出是誰放了哪招。參考音的目的**不是擬真，是分離度**。

## 丟檔規則

1. 檔名就是英雄 id：`godie-e001.wav`（或 .mp3 / .m4a，都收）
2. 一位角色一個檔就夠；多個變體用 `godie-e001.2.wav` 這樣接後綴
3. **長度 5–15 秒**最理想。太短抓不到音色，太長沒有幫助
4. 內容**不必是日文、不必講台詞**——要的是那個人的**音色與情緒張力**。
   一段吼叫、一段笑、一段冷冷的自語，都比平淡唸稿有用
5. 背景音樂/雜訊越少越好，但不用完美——不要為了乾淨而放棄有個性的那段

## 驗收標準（已改寫，2026-07-24）

- ❌ **不看咬字清不清楚**。KOF 式空耳是要的效果，不是缺陷
- ✅ **情感表達要到位**（音高範圍／動態／語速變化）
- ✅ **跨角色要分得開**——兩個角色各自像自己還不夠，彼此必須不像

## 引擎

**CosyVoice 3** 生成日文（唯一真的支援日文的：`tokenizer.py:19 "ja": "japanese"`）。
情緒用 `inference_instruct2(tts_text, instruct_text, prompt_wav)` 下自然語言指令取得。
IndexTTS-2 **不能**用來生日文——它沒有日文前端，詞表是 `pinyin.vocab`，會把漢字唸成中文音。

## 開放名單 48 位（缺哪個丟哪個）

| # | id | 角色 | 性別 | 目前聲源 | 出處 | 已收到 |
|---|---|---|---|---|---|---|
| 1 | `godie-e001` | 龍宮禮奈 | female | Kyoko | 龍宮禮奈 / 寒蟬鳴泣之時 (Higurashi) | ☐ |
| 2 | `godie-e002` | Saber | female | Kyoko | Saber (阿爾托莉亞) / Fate/stay night | ☐ |
| 3 | `godie-e007` | 天地志狼 | male | Otoya (Enhanced) | 天地志狼 / 龍狼傳 (Ryūrōden) | ☐ |
| 4 | `godie-e008` | 夏娜 | female | Kyoko | 夏娜 / 灼眼的夏娜 (Shakugan no Shana) | ☐ |
| 5 | `godie-e00k` | 安云 | female | Kyoko | 安云(Azumi) / あずみ | ☐ |
| 6 | `godie-e00r` | 初號機 | neutral | Kyoko | EVA初號機 / 新世紀福音戰士 (Evangelion) | ☐ |
| 7 | `godie-e00w` | 櫻綻剎那 | female | Kyoko | 櫻綻剎那 / 魔法老師 (Negima) | ☐ |
| 8 | `godie-edem` | 宇智波佐助 | male | Otoya (Enhanced) | 宇智波佐助 / 火影忍者 (Naruto) | ☐ |
| 9 | `godie-emfr` | 涅吉 | male | Otoya (Enhanced) | 涅吉·史普林菲爾德 / 魔法老師 (Negima) | ☐ |
| 10 | `godie-emns` | 夜神月 | male | Otoya (Enhanced) | 夜神月 / 死亡筆記本 (Death Note) | ☐ |
| 11 | `godie-etyr` | 木乃香 | female | Kyoko | 近衛木乃香 / 魔法老師 (Negima) | ☐ |
| 12 | `godie-h00l` | 林克 | male | Otoya (Enhanced) | Link / 薩爾達傳說 (Zelda) | ☐ |
| 13 | `godie-h01n` | 黑崎一護 | male | Otoya (Enhanced) | 黑崎一護 / 死神 (BLEACH) | ☐ |
| 14 | `godie-h01u` | 呂布奉先 | male | Otoya (Enhanced) | 呂布奉先 / 真三國無雙 (Dynasty Warriors) | ☐ |
| 15 | `godie-h020` | 莉娜因巴斯 | female | Kyoko | 莉娜·因巴斯 / 秀逗魔導士 (Slayers) | ☐ |
| 16 | `godie-h02k` | 熊貓 | neutral | Kyoko | 熊貓 / GGD原創(去死團) | ☐ |
| 17 | `godie-h02r` | 妙蛙花 | neutral | Kyoko | 妙蛙花 / 寶可夢 (Pokémon) | ☐ |
| 18 | `godie-h02u` | 草泥馬 | neutral | Kyoko | 草泥馬 / 中國網路迷因 | ☐ |
| 19 | `godie-hapm` | Berserker | male | Otoya (Enhanced) | Berserker (海克力斯) / Fate/stay night | ☐ |
| 20 | `godie-hart` | 克勞德 | male | Otoya (Enhanced) | Cloud Strife / 太空戰士7 (FFVII) | ☐ |
| 21 | `godie-hpal` | 藤井八雲 | male | Otoya (Enhanced) | 藤井八雲 / 三隻眼 (3×3 Eyes) | ☐ |
| 22 | `godie-hpb1` | 蒼月潮 | male | Otoya (Enhanced) | 蒼月潮 / 潮與虎/魔力小馬 (Ushio to Tora) | ☐ |
| 23 | `godie-huth` | 魔人普烏 | male | Otoya (Enhanced) | 魔人普烏 / 七龍珠 (Dragon Ball) | ☐ |
| 24 | `godie-hvsh` | Rider | female | Kyoko | Rider (梅杜莎) / Fate/stay night | ☐ |
| 25 | `godie-hvwd` | 桔梗 | female | Kyoko | 桔梗 / 犬夜叉 (InuYasha) | ☐ |
| 26 | `godie-n003` | 依文潔琳 | female | Kyoko | 依文潔琳 / 魔法老師 (Negima) | ☐ |
| 27 | `godie-n00b` | 哆拉A夢 | female | Kyoko | 哆啦A夢 / Doraemon | ☐ |
| 28 | `godie-n00p` | 南野秀一 | male | Otoya (Enhanced) | 妖狐藏馬(南野秀一) / 幽遊白書 (YuYu Hakusho) | ☐ |
| 29 | `godie-n01c` | 勇者小呆 | male | Otoya (Enhanced) | 達伊(Dai) / 達伊大冒險 (DQ: Dai) | ☐ |
| 30 | `godie-nplh` | 麻倉葉 | male | Otoya (Enhanced) | 麻倉葉 / 通靈童子 (Shaman King) | ☐ |
| 31 | `godie-o00k` | 皮卡娘 | female | Kyoko | 皮卡丘擬人 / SATO×PICA (同人) | ☐ |
| 32 | `godie-o00l` | 傑洛士 | male | Otoya (Enhanced) | 傑洛士(Xellos) / 秀逗魔導士 (Slayers) | ☐ |
| 33 | `godie-o00x` | 悟空 | male | Otoya (Enhanced) | 孫悟空 / 七龍珠 (Dragon Ball) | ☐ |
| 34 | `godie-o02p` | 初音 | female | Kyoko | Hatsune Miku / Vocaloid | ☐ |
| 35 | `godie-ofar` | 皮卡丘 | neutral | Kyoko | Pikachu / 寶可夢 (Pokémon) | ☐ |
| 36 | `godie-ogld` | 黑人牙膏 | male | Otoya (Enhanced) | 黑人牙膏(Darlie) / 品牌迷因 | ☐ |
| 37 | `godie-orkn` | 臭作 | male | Otoya (Enhanced) | 臭作 / 臭作 (成人遊戲) | ☐ |
| 38 | `godie-osam` | 殺生丸 | male | Otoya (Enhanced) | 殺生丸 / 犬夜叉 (InuYasha) | ☐ |
| 39 | `godie-u00h` | 鬼畜狂刀KYO | male | Otoya (Enhanced) | 鬼眼之狂 / SAMURAI DEEPER KYO | ☐ |
| 40 | `godie-u00j` | 賽菲洛斯 | male | Otoya (Enhanced) | Sephiroth / 最終幻想7 (FFVII) | ☐ |
| 41 | `godie-u00k` | 死之王 | male | Otoya (Enhanced) | 死之王 / GGD原創(去死團逆襲) | ☐ |
| 42 | `godie-u00l` | 拳四郎 | male | Otoya (Enhanced) | 拳四郎 / 北斗神拳 (Fist of the North Star | ☐ |
| 43 | `godie-u00n` | 蒙其.D.魯夫 | male | Otoya (Enhanced) | 蒙其·D·魯夫 / 航海王 (One Piece) | ☐ |
| 44 | `godie-u00v` | 基廉列克 | male | Otoya (Enhanced) | Kirenenko / 監獄兔 (Usavich) | ☐ |
| 45 | `godie-u010` | 飛影 | male | Otoya (Enhanced) | 飛影 / 幽遊白書 (YuYu Hakusho) | ☐ |
| 46 | `godie-u01u` | 索隆 | male | Otoya (Enhanced) | 羅羅諾亞·索隆 / 航海王 (One Piece) | ☐ |
| 47 | `godie-ubal` | 巴恩大魔王 | male | Otoya (Enhanced) | 巴恩(Vearn) / 達伊大冒險 (DQ: Dai) | ☐ |
| 48 | `godie-udea` | 飛鼠先生 | male | Otoya (Enhanced) | 飛鼠先生 / GGD原創(去死團) | ☐ |
