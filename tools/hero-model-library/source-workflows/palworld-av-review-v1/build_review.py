#!/usr/bin/env python3
"""Build the evidence-backed Palworld audio and motion review queue."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INDEX = ROOT / "materials/hero-model-library/palworld/帕魯三角色素材索引.json"
RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/palworld-hero-integration/receipt.json"
RECIPES = ROOT / "packages/shared/src/content/heroForge/communityAcquiredFirst.ts"
OUTPUT_DIR = ROOT / "materials/hero-model-library/palworld/review"
OUTPUT_JSON = OUTPUT_DIR / "palworld-av-review.json"
OUTPUT_SCHEMA = OUTPUT_DIR / "palworld-av-review-decision.schema.json"
OUTPUT_HTML = ROOT / "apps/client/public/palworld-av-review.html"

CHARACTER_CONFIG = {
    "jetragon": {
        "heroId": "acquired-jetragon",
        "skillGroups": ("FarSkill", "JumpBeam"),
        "slotSuggestions": {
            "attack": (["acquired-jetragon.q"], "通用遠程出手候選；動作沒有 Q 事件證據。"),
            "cast": (["acquired-jetragon.r"], "JumpBeam 名稱與光束／轟炸意象相近；時間與技能事件尚未驗證。"),
        },
    },
    "astralym": {
        "heroId": "acquired-astralym",
        "skillGroups": ("FarSkill", "HaloBeam", "HaloCutter", "LaserGliding", "Paldium", "Supernova"),
        "slotSuggestions": {
            "cast": (["acquired-astralym.q"], "HaloBeam 可作星光類施法候選；沒有原始事件對照。"),
        },
    },
    "cattiva": {
        "heroId": "acquired-cattiva",
        "skillGroups": ("FarSkill", "NekoPunch"),
        "slotSuggestions": {
            "attack": (["acquired-cattiva.q"], "NekoPunch 與貓拳技能名稱直接對應；命中幀仍待播放審查。"),
        },
    },
}

CRY_EVENT_SUGGESTIONS = {
    "Normal": ["spawn-or-idle"],
    "Joy": ["victory"],
    "Anger": ["generic-attack-or-cast"],
    "Sorrow": ["low-health-or-retreat"],
    "Pain": ["hurt"],
    "Death": ["death"],
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_evidence(path: Path, *, absolute: bool = False) -> dict:
    return {
        "path": str(path.resolve()) if absolute else path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def glb_document(path: Path) -> dict:
    raw = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<III", raw, 0)
    assert magic == 0x46546C67 and version == 2 and total_length == len(raw), path
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    assert chunk_type == 0x4E4F534A, path
    return json.loads(raw[20 : 20 + chunk_length].rstrip(b" \0"))


def animation_rows(path: Path) -> list[dict]:
    doc = glb_document(path)
    accessors = doc.get("accessors", [])
    rows = []
    for index, animation in enumerate(doc.get("animations", [])):
        maxima = []
        for sampler in animation.get("samplers", []):
            accessor_index = sampler.get("input")
            if isinstance(accessor_index, int) and accessor_index < len(accessors):
                maximum = accessors[accessor_index].get("max")
                if isinstance(maximum, list) and maximum and isinstance(maximum[0], (int, float)):
                    maxima.append(float(maximum[0]))
        rows.append({
            "index": index,
            "name": animation.get("name") or f"animation-{index}",
            "durationSeconds": round(max(maxima), 6) if maxima else None,
        })
    return rows


def recipe_skill_names(source: str, hero_id: str) -> dict[str, str]:
    start = source.index(f'id: "{hero_id}"')
    next_start = source.find('\n  {\n    id: "', start + 1)
    block = source[start : next_start if next_start >= 0 else len(source)]
    result = {}
    for slot in ("PASSIVE", "Q", "W", "E", "R", "EX"):
        match = re.search(rf"\b{slot}:\s*(?:passive|seq)\(\"([^\"]+)\"", block)
        assert match, f"Missing {hero_id}.{slot} recipe name"
        result[slot] = match.group(1)
    return result


def source_component(character: dict) -> dict:
    candidates = [row for row in character["modelCandidates"] if row.get("animationClipCount", 0) > 2]
    assert candidates, f"No animated source component for {character['id']}"
    return max(candidates, key=lambda row: (row.get("animationClipCount", 0), row.get("componentReady") is True))


def build_contract() -> dict:
    index = read_json(INDEX)
    receipt = read_json(RECEIPT)
    recipe_source = RECIPES.read_text(encoding="utf-8")
    integrations = {row["heroId"]: row for row in receipt["integrations"]}
    characters = []
    audio_candidates = []
    motion_candidates = []
    source_skill_count = 0

    assert index["distinctCryCount"] == 18
    for character in index["characters"]:
        config = CHARACTER_CONFIG[character["id"]]
        hero_id = config["heroId"]
        integration = integrations[hero_id]
        assert integration["productionDeploymentVerified"] is False
        assert integration["ggdHeroAuthoringComplete"] is True
        assert integration["heroForgePackageVerified"] is True
        assert integration["localHeroForgeModelSelectable"] is True
        assert integration["sourceFidelity"]["sourceFaithfulAudiovisualComplete"] is False
        assert character["standaloneVfxAcquired"] is False
        assert character["skillSpecificSfxAcquired"] is False

        model_doc_path = ROOT / integration["modelDocument"]["gitPath"]
        model_doc = read_json(model_doc_path)
        model_glb_path = ROOT / "content" / model_doc["glbPath"]
        assert sha256(model_doc_path) == integration["modelDocument"]["sha256"]
        assert sha256(model_glb_path) == integration["modelGlb"]["sha256"]
        current_animations = {row["name"]: row for row in animation_rows(model_glb_path)}
        inverse_clip_map: dict[str, list[str]] = {}
        for semantic, native in model_doc["clipMap"].items():
            inverse_clip_map.setdefault(native, []).append(semantic)

        for semantic, native in model_doc["clipMap"].items():
            assert native in current_animations
            suggestion = config["slotSuggestions"].get(semantic, ([], "只能確定模型語意狀態，沒有原始技能事件對照。"))
            motion_candidates.append({
                "candidateId": f"palworld-{character['id']}-motion-{semantic}",
                "characterId": character["id"],
                "heroId": hero_id,
                "semanticState": semantic,
                "nativeClip": native,
                "nativeClipDurationSeconds": current_animations[native]["durationSeconds"],
                "sharedBySemanticStates": inverse_clip_map[native],
                "modelKey": model_doc["id"],
                "modelDocument": file_evidence(model_doc_path),
                "modelGlb": file_evidence(model_glb_path),
                "currentlyReferencedByModelDocument": True,
                "suggestedSkillSlots": suggestion[0],
                "suggestionRationaleZh": suggestion[1],
                "reviewStatus": "unreviewed",
                "approvedSkillSlots": [],
                "runtimeSelectable": False,
                "changesRuntimeBinding": False,
            })

        for audio in character["audioFiles"]:
            source_label = audio.get("event") or audio.get("label")
            assert source_label in CRY_EVENT_SUGGESTIONS
            local_path = Path(audio["absolutePath"])
            assert local_path.is_file()
            assert local_path.stat().st_size == audio["bytes"]
            assert sha256(local_path) == audio["sha256"]
            candidate_id = f"palworld-{character['id']}-cry-{source_label.lower()}"
            audio_candidates.append({
                "candidateId": candidate_id,
                "characterId": character["id"],
                "heroId": hero_id,
                "sourceLabel": source_label,
                "sourceLabelProvenance": "GameVault Paldex emotion label; no original Wwise event mapping acquired",
                "category": "nonverbal-creature-cry",
                "language": "not-applicable-nonverbal",
                "speakerVerified": False,
                "sourceSkillBindingCandidates": [],
                "suggestedGenericEvents": CRY_EVENT_SUGGESTIONS[source_label],
                "suggestionsRequireListeningApproval": True,
                "file": file_evidence(local_path, absolute=True),
                "sourceUrl": audio["sourceUrl"],
                "reviewStatus": "unreviewed",
                "approvedEvents": [],
                "runtimeSelectable": False,
            })

        component = source_component(character)
        component_path = Path(component["absolutePath"])
        assert sha256(component_path) == component["sha256"]
        all_source_animations = animation_rows(component_path)
        prefixes = config["skillGroups"]
        skill_animations = [row for row in all_source_animations if row["name"].startswith(prefixes)]
        groups = []
        for prefix in prefixes:
            members = [row for row in skill_animations if row["name"].startswith(prefix)]
            if members:
                groups.append({
                    "prefix": prefix,
                    "clips": members,
                    "presentInCurrentOptimizedModel": [row["name"] for row in members if row["name"] in current_animations],
                    "reviewStatus": "unreviewed",
                    "runtimeSelectable": False,
                })

        source_forms = []
        for form in character["settingsForms"]:
            skills = [{
                "code": row["code"],
                "name": row["name"],
                "learnedLevel": row["learnedLevel"],
                "power": row["power"],
                "cooldownSeconds": row["cooldownSeconds"],
                "sourceUrl": row["sourceUrl"],
                "vfxAssetAcquired": False,
                "sfxAssetAcquired": False,
            } for row in form["activeSkills"]]
            source_skill_count += len(skills)
            source_forms.append({"form": form["form"], "skills": skills})

        characters.append({
            "characterId": character["id"],
            "nameZh": character["name"],
            "englishName": character["englishName"],
            "nativeCharacterCode": character["sourceCode"],
            "heroId": hero_id,
            "ggdSkills": recipe_skill_names(recipe_source, hero_id),
            "sourceSkillForms": source_forms,
            "animatedSourceComponent": {
                "id": component["id"],
                "file": file_evidence(component_path, absolute=True),
                "gitPath": component.get("gitPath"),
                "clipCount": len(all_source_animations),
                "runtimeSelectable": False,
                "sourceSkillMotionGroups": groups,
            },
            "currentOptimizedModel": {
                "modelKey": model_doc["id"],
                "modelGlb": file_evidence(model_glb_path),
                "semanticStates": model_doc["clipMap"],
                "uniqueNativeClipCount": len(current_animations),
                "registeredInLocalHeroForgeDropdown": True,
                "localHeroForgeModelSelectable": True,
                "productionRuntimeSelectableVerified": False,
                "formalModelAdoption": integration["formalModelAdoption"],
            },
            "sourceBlockers": [
                "No original Palworld Unreal package or DataTable was acquired for this character.",
                "No original Wwise soundbank, event-to-file map, or skill-specific SFX was acquired.",
                "No standalone original skill VFX asset was acquired or converted.",
                "GameVault cries have emotion labels only; they do not prove a skill event, language, or human speaker.",
            ],
            "ggdHeroAuthoringComplete": True,
            "sourceFaithfulAudiovisualComplete": False,
            "reviewCandidatesHaveRuntimeAuthority": False,
            "productionDeploymentVerified": False,
        })

    assert len(characters) == 3
    assert len(audio_candidates) == 18
    assert len(motion_candidates) == 18
    assert source_skill_count == 34
    assert all(row["runtimeSelectable"] is False for row in audio_candidates + motion_candidates)
    assert all(row["reviewStatus"] == "unreviewed" for row in audio_candidates + motion_candidates)

    source_facts = {
        "indexSha256": sha256(INDEX),
        "receiptSha256": sha256(RECEIPT),
        "recipesSha256": sha256(RECIPES),
        "audio": [(row["candidateId"], row["file"]["sha256"]) for row in audio_candidates],
        "motions": [(row["candidateId"], row["modelGlb"]["sha256"], row["nativeClip"]) for row in motion_candidates],
    }
    fingerprint = hashlib.sha256(json.dumps(source_facts, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "schema": "ggd.palworld-av-review@1",
        "sourceFingerprint": fingerprint,
        "sourceInputs": [file_evidence(INDEX), file_evidence(RECEIPT), file_evidence(RECIPES)],
        "summary": {
            "characterCount": 3,
            "ggdHeroAuthoringCompleteCount": 3,
            "localHeroForgeModelSelectableHeroCount": 3,
            "sourceFaithfulAudiovisualCompleteHeroCount": 0,
            "productionDeploymentVerifiedHeroCount": 0,
            "audioCandidateCount": 18,
            "motionSemanticCandidateCount": 18,
            "sourceSkillRecordCount": source_skill_count,
            "approvedCandidateCount": 0,
            "runtimeSelectableCandidateCount": 0,
            "standaloneVfxCandidateCount": 0,
            "skillSpecificSfxCandidateCount": 0,
        },
        "policy": {
            "completeHeroMeaning": "The three complete local GGD Hero Forge authoring packages are separate from original Palworld audiovisual fidelity and production deployment.",
            "currentHeroForgeModelsAlreadyRegistered": True,
            "ownerApprovalRequiredBeforeBinding": True,
            "creatureCriesAreNotSpokenLanguage": True,
            "sourceLabelsDoNotProveSkillEvents": True,
            "reviewDoesNotChangeCurrentRuntimeBindings": True,
            "reviewCandidatesHaveNoRuntimeAuthority": True,
        },
        "characters": characters,
        "audioCandidates": audio_candidates,
        "motionCandidates": motion_candidates,
        "globalSourceBlockers": [
            {
                "kind": "original-vfx",
                "status": "not-acquired",
                "requiredEvidence": "original Unreal asset paths plus converted visual acceptance evidence",
            },
            {
                "kind": "skill-specific-sfx",
                "status": "not-acquired",
                "requiredEvidence": "original Wwise bank/event map plus decoded file hashes and listening approval",
            },
        ],
        "decisionSchema": "materials/hero-model-library/palworld/review/palworld-av-review-decision.schema.json",
    }


def decision_schema(contract: dict) -> dict:
    def decision(candidate: dict, bindings: list[str]) -> dict:
        return {
            "type": "object",
            "additionalProperties": False,
            "required": ["candidateId", "decision", "approvedBindings", "note"],
            "properties": {
                "candidateId": {"const": candidate["candidateId"]},
                "decision": {"enum": ["approve", "reject", "needs-follow-up"]},
                "approvedBindings": {
                    "type": "array",
                    "items": {"enum": bindings},
                    "uniqueItems": True,
                },
                "note": {"type": "string"},
            },
            "allOf": [{
                "if": {"properties": {"decision": {"const": "approve"}}},
                "then": {"properties": {"approvedBindings": {"minItems": 1}}},
                "else": {"properties": {"approvedBindings": {"maxItems": 0}}},
            }],
        }

    audio_decisions = [decision(row, row["suggestedGenericEvents"]) for row in contract["audioCandidates"]]
    motion_decisions = [decision(
        row,
        row["suggestedSkillSlots"] or ["generic-" + row["semanticState"]],
    ) for row in contract["motionCandidates"]]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://ggd.local/schema/palworld-av-review-decision.schema.json",
        "title": "GGD Palworld audio and motion review decision",
        "type": "object",
        "additionalProperties": False,
        "required": ["schema", "sourceFingerprint", "reviewedAt", "reviewer", "audioDecisions", "motionDecisions"],
        "properties": {
            "schema": {"const": "ggd.palworld-av-review-decision@1"},
            "sourceFingerprint": {"const": contract["sourceFingerprint"]},
            "reviewedAt": {"type": "string", "format": "date-time"},
            "reviewer": {"type": "string", "minLength": 1},
            "audioDecisions": {
                "type": "array", "maxItems": len(audio_decisions),
                "items": {"oneOf": audio_decisions},
                "allOf": [{
                    "contains": {"properties": {"candidateId": {"const": row["candidateId"]}}, "required": ["candidateId"]},
                    "minContains": 0, "maxContains": 1,
                } for row in contract["audioCandidates"]],
            },
            "motionDecisions": {
                "type": "array", "maxItems": len(motion_decisions),
                "items": {"oneOf": motion_decisions},
                "allOf": [{
                    "contains": {"properties": {"candidateId": {"const": row["candidateId"]}}, "required": ["candidateId"]},
                    "minContains": 0, "maxContains": 1,
                } for row in contract["motionCandidates"]],
            },
            "note": {"type": "string"},
        },
    }


def build_html(contract: dict) -> str:
    encoded = html.escape(json.dumps(contract, ensure_ascii=False, separators=(",", ":")), quote=False)
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>帕魯三英雄音訊與動作審查</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--ok:#8bd49c}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}
header{{position:sticky;top:0;z-index:4;padding:13px 18px;background:#08131eee;border-bottom:1px solid var(--line)}}main{{max-width:1250px;margin:auto;padding:18px}}
h1{{font-size:20px;margin:0}}h2{{margin-top:30px}}h3{{margin:2px 0 8px}}.meta,.dim{{color:var(--dim)}}.warn{{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}}.card{{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px}}.card.approve{{border-color:var(--ok)}}.card.reject{{border-color:#d66}}
audio{{width:100%}}iframe{{width:100%;height:360px;border:1px solid var(--line);border-radius:8px;background:#05080c}}button,select,input,textarea{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 9px;border-radius:7px}}button{{cursor:pointer}}button:hover{{border-color:var(--accent)}}code{{font-size:11px;word-break:break-all}}.buttons{{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}}table{{width:100%;border-collapse:collapse}}th,td{{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}}textarea{{width:100%;min-height:70px}}
</style></head><body><header><h1>帕魯三英雄音訊與動作審查</h1><div class="meta">資料指紋 <code>{contract['sourceFingerprint']}</code> · 核准 0 項 · runtimeSelectable 0 項</div></header>
<main><div class="warn">叫聲是非語言生物聲，不標成日文或人類對白。GameVault 的 Normal／Joy／Anger／Sorrow／Pain／Death 只是來源標籤，沒有 Wwise 技能事件對照。這個頁面只產生審查決定，不改執行階段綁定。</div>
<h2>一、18 段叫聲逐項聽審</h2><div id="audio" class="grid"></div>
<h2>二、現行六狀態動作播放審查</h2><p class="dim">每位有 6 個 GGD 語意狀態，但死亡與受傷共用 Damage，所以每位只有 5 段唯一動作。播放要透過本專案 Vite 開發伺服器。</p><div id="motion"></div>
<h2>三、原始技能資料與動作群組</h2><div id="skills"></div>
<h2>四、VFX／技能 SFX 來源缺口</h2><div id="blockers" class="grid"></div>
<h2>五、匯出裁決</h2><p class="dim">只匯出已填的項目；核准項目必須至少選一個綁定。未匯入、未驗證前不會變更遊戲。</p><input id="reviewer" placeholder="審查者" value="owner"><textarea id="globalNote" placeholder="整批備註"></textarea><div class="buttons"><button id="export">下載裁決 JSON</button><button id="clear">清除本機草稿</button></div></main>
<script id="contract" type="application/json">{encoded}</script>
<script>
const c=JSON.parse(document.getElementById('contract').textContent);const key='ggd-palworld-av-review:'+c.sourceFingerprint;
let draft=JSON.parse(localStorage.getItem(key)||'{{"audio":{{}},"motion":{{}},"notes":{{}}}}');
const esc=s=>String(s??'').replace(/[&<>\"]/g,x=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[x]));
function persist(){{localStorage.setItem(key,JSON.stringify(draft))}}
function decision(card,id,bindings){{const saved=draft[card]?.[id]||{{decision:'',approvedBindings:[],note:''}};return `<select data-kind="${{card}}" data-id="${{id}}"><option value="">未審</option><option value="approve" ${{saved.decision==='approve'?'selected':''}}>核准</option><option value="reject" ${{saved.decision==='reject'?'selected':''}}>不核准</option><option value="needs-follow-up" ${{saved.decision==='needs-follow-up'?'selected':''}}>需追查</option></select><div class="buttons">${{bindings.map(b=>`<label><input type="checkbox" data-bind-kind="${{card}}" data-bind-id="${{id}}" value="${{esc(b)}}" ${{saved.approvedBindings?.includes(b)?'checked':''}}> ${{esc(b)}}</label>`).join('')}}</div><input data-note-kind="${{card}}" data-note-id="${{id}}" value="${{esc(saved.note)}}" placeholder="這一項備註">`}}
document.getElementById('audio').innerHTML=c.audioCandidates.map(a=>`<article class="card" data-card="audio:${{a.candidateId}}"><h3>${{esc(a.characterId)}} · ${{esc(a.sourceLabel)}}</h3><audio controls preload="none" src="http://127.0.0.1:8766/audio/${{encodeURIComponent(a.candidateId)}}"></audio><p>可審候選：${{a.suggestedGenericEvents.map(esc).join('、')}}<br><span class="dim">只由來源情緒標籤推出，不是技能事件證據。</span></p><code>${{a.file.sha256}}</code>${{decision('audio',a.candidateId,a.suggestedGenericEvents)}}</article>`).join('');
const motionsByChar=Object.groupBy?Object.groupBy(c.motionCandidates,m=>m.characterId):c.motionCandidates.reduce((o,m)=>((o[m.characterId]??=[]).push(m),o),{{}});
document.getElementById('motion').innerHTML=c.characters.map(ch=>{{const rows=motionsByChar[ch.characterId];return `<section class="card"><h3>${{esc(ch.nameZh)}}／${{esc(ch.englishName)}}</h3><iframe id="frame-${{ch.characterId}}" title="${{esc(ch.nameZh)}} 動作"></iframe><div class="buttons">${{rows.map(m=>`<button data-play="${{ch.characterId}}" data-model="${{m.modelKey}}" data-state="${{m.semanticState}}">${{m.semanticState}} → ${{m.nativeClip}}</button>`).join('')}}</div><table><tr><th>狀態／原生動作</th><th>技能候選</th><th>裁決</th></tr>${{rows.map(m=>`<tr><td>${{m.semanticState}} → <code>${{m.nativeClip}}</code>${{m.sharedBySemanticStates.length>1?'<br><span class="dim">與 '+m.sharedBySemanticStates.join('、')+'共用</span>':''}}</td><td>${{m.suggestedSkillSlots.length?m.suggestedSkillSlots.join('、'):'無精確技能建議'}}<br><span class="dim">${{esc(m.suggestionRationaleZh)}}</span></td><td>${{decision('motion',m.candidateId,m.suggestedSkillSlots.length?m.suggestedSkillSlots:['generic-'+m.semanticState])}}</td></tr>`).join('')}}</table></section>`}}).join('');
document.getElementById('skills').innerHTML=c.characters.map(ch=>`<section class="card"><h3>${{esc(ch.nameZh)}}：來源動作 ${{ch.animatedSourceComponent.clipCount}} 段</h3><p>技能相關動作群：${{ch.animatedSourceComponent.sourceSkillMotionGroups.map(g=>`<code>${{g.prefix}}*</code> (${{g.clips.length}})`).join('、')}}</p><details><summary>展開原始資料的技能列表</summary>${{ch.sourceSkillForms.map(f=>`<h4>${{esc(f.form)}} (${{f.skills.length}})</h4><table><tr><th>Code</th><th>名稱</th><th>威力／CD</th><th>VFX/SFX</th></tr>${{f.skills.map(s=>`<tr><td><code>${{esc(s.code)}}</code></td><td>${{esc(s.name)}}</td><td>${{s.power}} / ${{s.cooldownSeconds}}s</td><td>皆未取得</td></tr>`).join('')}}</table>`).join('')}}</details></section>`).join('');
document.getElementById('blockers').innerHTML=c.globalSourceBlockers.map(b=>`<article class="card"><h3>${{esc(b.kind)}}</h3><p>${{esc(b.status)}}</p><p class="dim">解除需要：${{esc(b.requiredEvidence)}}</p></article>`).join('');
document.addEventListener('click',e=>{{const b=e.target.closest('[data-play]');if(b){{document.getElementById('frame-'+b.dataset.play).src=`/champion-model-audition.html?model=${{encodeURIComponent(b.dataset.model)}}&clip=${{encodeURIComponent(b.dataset.state)}}&cam=combat&step=1200`;}}}});
document.addEventListener('change',e=>{{if(e.target.matches('select[data-kind]')){{const t=e.target;draft[t.dataset.kind]??={{}};draft[t.dataset.kind][t.dataset.id]??={{approvedBindings:[],note:''}};draft[t.dataset.kind][t.dataset.id].decision=t.value;persist()}}if(e.target.matches('input[data-bind-kind]')){{const t=e.target;draft[t.dataset.bindKind]??={{}};const d=draft[t.dataset.bindKind][t.dataset.bindId]??={{decision:'',approvedBindings:[],note:''}};d.approvedBindings=[...document.querySelectorAll(`input[data-bind-kind="${{t.dataset.bindKind}}"][data-bind-id="${{t.dataset.bindId}}"]:checked`)].map(x=>x.value);draft[t.dataset.bindKind][t.dataset.bindId]=d;persist()}}}});
document.addEventListener('input',e=>{{if(e.target.matches('input[data-note-kind]')){{const t=e.target;draft[t.dataset.noteKind]??={{}};const d=draft[t.dataset.noteKind][t.dataset.noteId]??={{decision:'',approvedBindings:[],note:''}};d.note=t.value;draft[t.dataset.noteKind][t.dataset.noteId]=d;persist()}}}});
document.getElementById('export').onclick=()=>{{const rows=k=>Object.entries(draft[k]||{{}}).filter(([,d])=>d.decision).map(([candidateId,d])=>({{candidateId,decision:d.decision,approvedBindings:d.decision==='approve'?(d.approvedBindings||[]):[],note:d.note||''}}));const data={{schema:'ggd.palworld-av-review-decision@1',sourceFingerprint:c.sourceFingerprint,reviewedAt:new Date().toISOString(),reviewer:document.getElementById('reviewer').value.trim()||'owner',audioDecisions:rows('audio'),motionDecisions:rows('motion'),note:document.getElementById('globalNote').value}};const invalid=[...data.audioDecisions,...data.motionDecisions].find(d=>d.decision==='approve'&&!d.approvedBindings.length);if(invalid)return alert('核准項目必須選擇綁定：'+invalid.candidateId);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\\n'],{{type:'application/json'}}));a.download='palworld-av-review-decision-'+Date.now()+'.json';a.click();URL.revokeObjectURL(a.href)}};
document.getElementById('clear').onclick=()=>{{localStorage.removeItem(key);location.reload()}};
</script></body></html>'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract = build_contract()
    products = {
        OUTPUT_JSON: json.dumps(contract, ensure_ascii=False, indent=2) + "\n",
        OUTPUT_SCHEMA: json.dumps(decision_schema(contract), ensure_ascii=False, indent=2) + "\n",
        OUTPUT_HTML: build_html(contract),
    }
    if args.check:
        for path, expected in products.items():
            assert path.read_text(encoding="utf-8") == expected, f"Stale generated review file: {path}"
    else:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        for path, value in products.items():
            path.write_text(value, encoding="utf-8")
    print(json.dumps(contract["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
