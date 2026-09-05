# 退休的守衛 —— **被設計取代掉的斷言**住這裡

⚠️ 這裡的東西是**另存**不是刪除。CLAUDE.md 第〇·六守則逐字：

> ⭐「分開」不是「丟掉」。被取代的原作數值要**另存** ——
> **測試可以跟著設計走，⛔ 知識不可以無聲消失。**

⭐ **這個檔要回答的是一個很具體的問題**：
「今天沒有任何東西在守某個行為 —— 那個行為**曾經**被守著嗎？被誰？為什麼撤掉？」

⛔ 一條被刪掉的守衛如果只留在 `git log` 裡，下一輪讀到的是「這裡從來沒有守衛」，
而那與「這裡的守衛被一個設計決定拿掉了」是**兩件完全不同的事**。

⚠️ 每一列都要有 **① 它斷言什麼 ② 為什麼當初要它 ③ 為什麼今天不要它
④ 今天守這件事的是什麼（沒有 ⇒ 票號）**。⛔ 少第 ④ 欄就是把一個缺口寫成一句散文。

---

## 2026-09-05 · `VfxSystem.authoringOverride.test.ts` 的**兩條**「預設演出讓路」斷言

| | |
|---|---|
| **退休日** | 2026-09-05 |
| **退休原因** | Codex commit `35b231ef3`（`fix(vfx): repair shipped asset safety and script composition`）**刪掉了它們所斷言的那 71 行實作**，並在同一個 commit 裡新增一支**逐字禁止**那個實作的守衛 |
| **今天守這件事的** | ⛔ **沒有任何東西。** → **GH#1000** |

### ⛔ 為什麼一定要退休（⛔ 沒有任何寫法能同時滿足兩邊）

同一個資料夾裡兩支守衛**互斥**：

| 守衛 | 它要求什麼 |
|---|---|
| `vfxScriptOverride.test.ts`（新，`35b231ef3` 改寫） | `expect(src).not.toContain("this.scriptPlayer.hasScript(")` |
| `VfxSystem.authoringOverride.test.ts`（舊，這兩條） | 那一行**必須存在**，否則預設演出不會讓路 |

⭐ 裁決：**保留 Codex 的實作**（它是已經 merge 的設計），舊的兩條退休到這裡。

### ① 逐字保存下來的兩條斷言

```ts
  it("keeps the truthful telegraph but suppresses the default cast pillar for a scripted cast", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const draft: VfxScriptDoc = {
      id: "forge.scripted-charge",
      schema: "vfx-script@1",
      abilityId: "forge.scripted-charge",
      segments: [{ kind: "floatingText", on: "castStart", text: "CUSTOM", durationSec: 1 }],
    };
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      teamOf: () => 0,
      vfxScriptFor: (id) => id === draft.abilityId ? draft : undefined,
      allVfxScripts: () => [draft],
    });

    vfx.handleEvent({
      type: "castBegin",
      tick: 0,
      data: {
        caster: 1,
        slot: "R",
        abilityId: draft.abilityId,
        ticks: 30,
        castTimeSec: 1,
      },
    }, 0);

    const internals = vfx as unknown as {
      pillars: { activeCount: number };
    };
    expect(internals.pillars.activeCount).toBe(0);
    expect(scene.particleSystems.some((system) => system.name.includes("castpillar"))).toBe(false);
    vfx.dispose();
  });

  it("suppresses default projectile presentation when exact origin belongs to a script", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const draft: VfxScriptDoc = {
      id: "forge.scripted-projectile",
      schema: "vfx-script@1",
      abilityId: "forge.scripted-projectile",
      segments: [{ kind: "floatingText", on: "castStart", text: "CUSTOM", durationSec: 1 }],
    };
    const vfx = new VfxSystem(scene, {
      entityPos: () => ({ x: 0, z: 0 }),
      vfxScriptFor: (id) => id === draft.abilityId ? draft : undefined,
      allVfxScripts: () => [draft],
    });

    vfx.handleEvent({
      type: "projectileSpawn",
      tick: 0,
      data: {
        id: 9,
        owner: 1,
        projectileId: "shared.projectile",
        origin: `ability:${draft.abilityId}`,
      },
    }, 0);

    expect(vfx.feedbackFx.countFor("muzzle/physical/1/flash")).toBe(0);
    expect(vfx.feedbackFx.countFor("muzzle/physical/1/streaks")).toBe(0);
    vfx.dispose();
  });
```

⭐ ⛔ 這兩條**不是掃字串** —— 它們建真的 `NullEngine` 場景、餵真的 wire 事件、
讀 `pillars.activeCount` 與 `feedbackFx.countFor(...)` 這種**真的計數器**。
⇒ 退休的是**行為守衛**，⛔ 不是一條可有可無的斷言。

### ② 為什麼當初要它們（被刪掉的那段實作註解，逐字保存）

`VfxSystem.ts` 被 `35b231ef3` 刪掉的兩段：

```
// A script is the authored cast presentation.  Universal truth cues
// (telegraph/cast bar) and explicit ability effects still run, but the
// default binding/family art must yield or every authored layer is
// drawn twice.  This reads the player's live rollback switch so
// enabled:false restores the exact pre-script path.
const scriptedCast = abilityId !== undefined && this.scriptPlayer.hasScript(abilityId);
```

```
// The cast pillar is default presentation, not combat truth.  A
// vfx-script owns that presentation just like it owns the cast binding
// and inline spawnVfx/spawnModelFx effects; keeping this pillar made
// authored casts draw both looks at once.  On bright KI/arcane palettes
// the overlapping additive motes can wash the whole camera white.
// The geometry telegraph remains active because it communicates the
// real hit area rather than decorating the cast.
```

⭐ 注意第二段的最後一句 —— 它就是那條設計線：
**「真相」（telegraph／cast bar）留著，「裝飾」（光柱／家族美術）讓路。**
新設計把整條線拿掉了，⛔ 而它**沒有**在別的地方重新畫。

### ③ 為什麼新設計是對的（也逐字保存 Codex 留下的理由）

`35b231ef3` 在 `case "modelFxSpawn"` 換上的註解：

```
// `vfx-script@1.replaces` only owns an explicit actor presentation
// channel.  Merely having a script must not swallow ability-authored
// model effects: shipped scripts intentionally add only the pieces
// missing from ability JSON (for example Dragon Slave and Kamehameha).
```

⭐ 這個論點是**成立**的：「有 script」不等於「script 想接管全部」。
舊機制是一個**全有全無**的旗標，而正確的粒度是**逐通道宣告**（`replaces`）。

### ④ ⛔ 而替代品今天**沒有接到那幾條線上**（2026-09-05 量到）

| 量到的 | 值 |
|---|---:|
| `PRESENTATION_CHANNELS` 的格數 | **2**（`caster.action` · `target.reaction`） |
| `channelTakeover.heldBy(...)` 的消費端 | **2 處**：`apps/client/src/render/EntityViewRegistry.ts:532` · `apps/editor/src/vfx-forge/VfxForgeStage.ts:2143` —— ⭐ **兩處都只 gate `champion.pulse()`（身體動畫）** |
| 光柱 / 家族美術 / 地面焦痕 / 電弧 / 槍口 / 螢幕提示 / 浮動文字讀 `channelTakeover` | **0 處** |
| 出貨的 `content/vfx-scripts/*.json` 宣告 `replaces` 的 | ⛔ **0 / 10** |
| 那 10 支被 script 的技能，ability JSON 帶 `vfxKey`（⇒ `playCastVfx` 今天會照畫）的 | ⭐ **10 / 10** |

⇒ ⭐ **被刪掉的那段註解描述的後果（authored cast 兩套演出同時畫）今天沒有機制在防**，
而且它不是理論上的：**10 支出貨 script 全部命中**。

⚠️ ⭐ 這正是 CLAUDE.md 失敗形態⑪的形狀（**兩條對的守衛，組合是空的**）：
舊守衛沒了、新守衛只證明「舊實作不在」、`channelTakeover` 只管動畫 ——
⛔ **三者都是綠的，而那條線上沒有人站著。**

⇒ 追這件事的票：**GH#1000**。
