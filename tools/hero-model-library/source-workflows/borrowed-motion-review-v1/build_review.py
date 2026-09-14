#!/usr/bin/env python3
"""Build the owner-facing borrowed/retargeted motion review queue.

This tool only emits review artifacts. It never edits model documents, hero
configuration, model-version selections, or runtime bindings.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[4]
SOURCE = REPO / "materials/hero-model-library/motion-review/borrowed-motion-candidates.json"
QUEUE = REPO / "materials/hero-model-library/motion-review/borrowed-motion-review.json"
PAGE = REPO / "apps/client/public/borrowed-motion-review.html"
ANIM_STATES = {"idle", "run", "attack", "cast", "hurt", "death"}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def file_record(relative_path: str) -> dict[str, Any]:
    path = REPO / relative_path
    if not path.is_file():
        raise ValueError(f"missing evidence: {relative_path}")
    payload = path.read_bytes()
    return {
        "gitPath": relative_path,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def build_contract(source: dict[str, Any]) -> dict[str, Any]:
    require(source.get("schema") == "ggd.borrowed-motion-review-source@1", "unexpected source schema")
    policy = source.get("policy")
    require(isinstance(policy, dict), "policy must be an object")
    require(policy.get("defaultDecision") is None, "defaultDecision must remain null")
    require(policy.get("runtimeMutationAllowed") is False, "runtime mutation must remain disabled")
    require(policy.get("decisionValues") == ["approve", "reject"], "decisionValues must be approve/reject")

    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in source.get("candidates", []):
        cid = raw.get("id")
        require(isinstance(cid, str) and cid and cid not in seen, f"invalid or duplicate candidate id: {cid}")
        seen.add(cid)
        require(raw.get("motionKind") in policy["candidateKinds"], f"{cid}: unsupported motionKind")
        require(
            raw.get("deathSubstitutionMode") in policy["deathSubstitutionModes"],
            f"{cid}: unsupported death substitution",
        )
        require(raw.get("sameWorkBorrowed") is (raw.get("deathSubstitutionMode") == "same-work-borrowed"),
                f"{cid}: sameWorkBorrowed tag disagrees with deathSubstitutionMode")
        source_model = raw.get("source", {})
        target_model = raw.get("target", {})
        source_doc_record = file_record(source_model.get("modelDocument", ""))
        target_doc_record = file_record(target_model.get("modelDocument", ""))
        source_doc = json.loads((REPO / source_doc_record["gitPath"]).read_text())
        target_doc = json.loads((REPO / target_doc_record["gitPath"]).read_text())
        require(source_doc.get("id") == source_model.get("modelKey"), f"{cid}: source model id mismatch")
        require(target_doc.get("id") == target_model.get("modelKey"), f"{cid}: target model id mismatch")
        clip = raw.get("clip", {})
        require(clip.get("state") in ANIM_STATES, f"{cid}: invalid audition state")
        require(isinstance(clip.get("sourceKind"), str) and clip["sourceKind"],
                f"{cid}: clip sourceKind is required")
        require(isinstance(clip.get("loopIntent"), bool), f"{cid}: clip loopIntent must be boolean")
        require(
            target_doc.get("clipMap", {}).get(clip["state"]) == clip.get("embeddedName"),
            f"{cid}: target model clipMap does not resolve the declared embedded clip",
        )
        skeleton = raw.get("skeletonCompatibility", {})
        require(skeleton.get("status") in policy["skeletonCompatibilityStatuses"],
                f"{cid}: invalid skeleton compatibility status")
        require(skeleton["status"] in {"compatible-verified", "compatible-with-mapping-verified"},
                f"{cid}: incompatible or unverified skeleton cannot enter playable queue")
        if raw.get("motionKind") == "native":
            require(source_model.get("modelKey") == target_model.get("modelKey"),
                    f"{cid}: native motion must use the same source and target model")
        if raw.get("motionKind") == "retargeted":
            require(skeleton["status"] == "compatible-with-mapping-verified",
                    f"{cid}: retargeted motion requires a verified mapping")
        presentation = raw.get("presentation", {})
        require(presentation.get("mode") == raw.get("deathSubstitutionMode"),
                f"{cid}: presentation mode disagrees with deathSubstitutionMode")
        if presentation.get("mode") == "hurt-ascend-fade":
            require(clip.get("state") == "hurt", f"{cid}: hurt-ascend-fade must audition the hurt state")
            require(isinstance(presentation.get("durationMs"), int) and presentation["durationMs"] > 0,
                    f"{cid}: hurt-ascend-fade durationMs must be positive")
            require(isinstance(presentation.get("fadeStartRatio"), (int, float))
                    and 0 < presentation["fadeStartRatio"] < 1,
                    f"{cid}: hurt-ascend-fade fadeStartRatio must be between zero and one")
            require(isinstance(presentation.get("translateYPixels"), (int, float))
                    and presentation["translateYPixels"] < 0,
                    f"{cid}: hurt-ascend-fade translateYPixels must move upward")
            require(presentation.get("previewScope") == "whole-iframe compositing mockup",
                    f"{cid}: hurt-ascend-fade previewScope must remain explicit")
            require(presentation.get("runtimeWorldSpaceCalibrationRequired") is True,
                    f"{cid}: runtime calibration blocker must remain explicit")
        evidence = [file_record(path) for path in raw.get("validationEvidence", [])]
        require(bool(evidence), f"{cid}: validation evidence is required")
        require(bool(raw.get("blockers")), f"{cid}: blockers must be explicit")
        candidates.append({
            **raw,
            "source": {**source_model, "modelDocumentEvidence": source_doc_record},
            "target": {**target_model, "modelDocumentEvidence": target_doc_record},
            "validationEvidence": evidence,
            "review": {
                "decision": None,
                "reviewRequired": True,
                "runtimeBindingChanged": False,
                "heroConfigChanged": False,
                "productionDeployed": False,
            },
        })

    blocked: list[dict[str, Any]] = []
    for raw in source.get("blockedLeads", []):
        require(raw.get("playableReviewEligible") is False, f"{raw.get('id')}: blocked lead must be ineligible")
        require(bool(raw.get("blockers")), f"{raw.get('id')}: blocked lead needs blockers")
        evidence = [file_record(path) for path in raw.get("validationEvidence", [])]
        blocked.append({**raw, "validationEvidence": evidence, "decisionAvailable": False})

    source_record = file_record(SOURCE.relative_to(REPO).as_posix())
    digest_input = canonical_json({
        "source": source_record,
        "candidateEvidence": [row["validationEvidence"] for row in candidates],
        "blockedEvidence": [row["validationEvidence"] for row in blocked],
    }).encode()
    fingerprint = hashlib.sha256(digest_input).hexdigest()
    return {
        "schema": "ggd.borrowed-motion-review@1",
        "sourceFingerprint": fingerprint,
        "sourceInput": source_record,
        "policy": policy,
        "summary": {
            "playableCandidateCount": len(candidates),
            "blockedLeadCount": len(blocked),
            "approvedCount": 0,
            "rejectedCount": 0,
            "pendingDecisionCount": len(candidates),
            "runtimeBindingsChanged": 0,
        },
        "candidates": candidates,
        "blockedLeads": blocked,
    }


def safe_inline_json(value: Any) -> str:
    return canonical_json(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def build_html(contract: dict[str, Any]) -> str:
    data = safe_inline_json(contract)
    fingerprint = html.escape(contract["sourceFingerprint"])
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>借用與重定向動作逐項審查</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--ok:#8bd49c;--bad:#ff8b8b}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}
header{{position:sticky;top:0;z-index:5;padding:14px 18px;background:#08131eee;border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}}
h1{{font-size:19px;margin:0}}main{{max-width:1300px;margin:auto;padding:18px}}.dim{{color:var(--dim)}}.warn{{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,780px));gap:14px}}.card{{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px}}
.card.approve{{border-color:var(--ok)}}.card.reject{{border-color:var(--bad)}}.viewer{{position:relative;height:520px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#05080c}}
iframe{{width:100%;height:100%;border:0}}.viewer-status{{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;background:#071019e8;color:var(--dim)}}.viewer-status.error{{color:var(--bad);background:#210d10ee}}.viewer-status[hidden]{{display:none}}
.buttons{{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}}button,.button-link{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 10px;border-radius:7px;cursor:pointer;text-decoration:none}}button:hover,.button-link:hover{{border-color:var(--accent)}}
button[data-decision="approve"]{{color:var(--ok)}}button[data-decision="reject"]{{color:var(--bad)}}code{{font-size:11px;word-break:break-all}}dl{{display:grid;grid-template-columns:110px 1fr;gap:3px 8px}}dt{{color:var(--dim)}}dd{{margin:0}}textarea{{width:100%;min-height:54px;background:#09121b;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:8px}}
.tag{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 7px;margin:0 4px 4px 0}}.blocked{{opacity:.86}}li{{margin:5px 0}}
</style></head><body><header><h1>借用／重定向動作逐項審查</h1><div class="dim">資料指紋 <code>{fingerprint}</code> · 核准只產生審查收據，不改 runtime 或英雄設定</div></header>
<main><div class="warn">每個可播放候選都必須明確選「核准」或「不核准」。頁面沿用 <code>champion-model-audition.html</code>，播放的是已嵌入目標 GLB 的 clip；來源動畫本身不會被假裝成已重定向。框內與「全頁查看」都保留完整真實戰鬥鏡頭。死亡的升天淡出目前只是整個預覽框的合成示意，核准後仍需實作與遊戲內校準。</div>
<h2>可播放候選 <span id="count"></span></h2><div id="queue" class="grid"></div>
<h2>尚不可播放的線索</h2><div id="blocked" class="grid"></div>
<h2>匯出裁決</h2><p id="decisionStatus" class="dim"></p><div class="buttons"><button id="export">下載逐項裁決 JSON</button><button id="clear">清除本機草稿</button></div></main>
<script id="contract" type="application/json">{data}</script>
<script>
const D=JSON.parse(document.getElementById('contract').textContent);const storageKey='ggd.borrowed-motion-review:'+D.sourceFingerprint;
let draft=JSON.parse(localStorage.getItem(storageKey)||'{{"decisions":{{}}}}');if(!draft.decisions)draft={{decisions:{{}}}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
const audition=c=>'/champion-model-audition.html?hud=0&cam=combat&live=1&model='+encodeURIComponent(c.target.modelKey)+'&champion='+encodeURIComponent(c.target.heroId)+'&clip='+encodeURIComponent(c.clip.state);
function save(){{localStorage.setItem(storageKey,JSON.stringify(draft));renderStatus()}}function renderStatus(){{const n=D.candidates.filter(c=>draft.decisions[c.id]?.decision).length;document.getElementById('decisionStatus').textContent=`已裁決 ${{n}}/${{D.candidates.length}}；未逐項完成仍可匯出草稿，但不可當成 runtime 綁定授權。`;document.getElementById('count').textContent=`(${{D.candidates.length}})`}}
const queue=document.getElementById('queue');
for(const c of D.candidates){{const card=document.createElement('section');card.className='card';card.dataset.id=c.id;const url=audition(c);card.innerHTML=`<h3>${{esc(c.labelZh)}}</h3><div><span class="tag">${{esc(c.motionKind)}}</span><span class="tag">${{esc(c.deathSubstitutionMode)}}</span><span class="tag">骨架 ${{esc(c.skeletonCompatibility.status)}}</span></div><dl><dt>來源</dt><dd>${{esc(c.source.heroNameZh)}} · ${{esc(c.source.modelKey)}}</dd><dt>目標</dt><dd>${{esc(c.target.heroNameZh)}} · ${{esc(c.target.modelKey)}}</dd><dt>clip</dt><dd>${{esc(c.clip.state)}} → <code>${{esc(c.clip.embeddedName)}}</code></dd><dt>骨架方法</dt><dd>${{esc(c.skeletonCompatibility.method)}}；${{esc(c.skeletonCompatibility.mappingEvidence)}}</dd></dl><div class="viewer"><iframe loading="lazy" title="${{esc(c.labelZh)}}"></iframe><div class="viewer-status" role="status">載入模型與動作中…</div></div><div class="buttons"><button data-play>重新播放原始 clip</button>${{c.presentation.mode==='hurt-ascend-fade'?'<button data-presentation>播放升天淡出替代演出</button>':''}}<a class="button-link" data-fullscreen target="_blank" rel="noopener">全頁查看</a><button data-decision="approve">核准</button><button data-decision="reject">不核准</button></div><b>驗證證據</b><ul>${{c.validationEvidence.map(e=>`<li><code>${{esc(e.gitPath)}}</code><br><span class="dim">${{esc(e.sha256)}}</span></li>`).join('')}}</ul><b>仍有阻擋</b><ul>${{c.blockers.map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul><textarea placeholder="此候選的裁決理由或修改要求"></textarea>`;const viewer=card.querySelector('.viewer'),frame=card.querySelector('iframe'),status=card.querySelector('.viewer-status'),note=card.querySelector('textarea');card.querySelector('[data-fullscreen]').href=url;const old=draft.decisions[c.id];if(old){{card.classList.add(old.decision);note.value=old.note||''}}let generation=0,presentationAnimation=null;const loadAndWait=async(reload=false)=>{{const mine=++generation;presentationAnimation?.cancel();presentationAnimation=null;status.hidden=false;status.classList.remove('error');status.textContent='載入模型與動作中…';if(reload||frame.getAttribute('src')!==url)frame.src=url;for(let i=0;i<450;i++){{if(mine!==generation)return false;try{{const child=frame.contentWindow;if(child?.__settled===true){{const probe=child.__probe?.()||{{}};if(probe.error||!(Number(probe.triangles)>0)){{status.textContent='載入失敗：'+(probe.error||'畫面上沒有可見三角形');status.classList.add('error');return false}}status.hidden=true;return true}}}}catch{{}}await new Promise(resolve=>setTimeout(resolve,100))}}status.textContent='載入逾時；請重新播放或用全頁查看確認錯誤。';status.classList.add('error');return false}};card.querySelector('[data-play]').onclick=()=>void loadAndWait(true);const presentation=card.querySelector('[data-presentation]');if(presentation)presentation.onclick=async()=>{{if(!await loadAndWait(true))return;presentationAnimation=viewer.animate([{{opacity:1,transform:'translateY(0)',offset:0}},{{opacity:1,transform:'translateY(0)',offset:c.presentation.fadeStartRatio}},{{opacity:.08,transform:`translateY(${{c.presentation.translateYPixels}}px)`,offset:1}}],{{duration:c.presentation.durationMs,easing:'ease-in',fill:'forwards'}})}};card.querySelectorAll('[data-decision]').forEach(b=>b.onclick=()=>{{card.classList.remove('approve','reject');card.classList.add(b.dataset.decision);draft.decisions[c.id]={{decision:b.dataset.decision,note:note.value}};save()}});note.oninput=()=>{{if(draft.decisions[c.id]){{draft.decisions[c.id].note=note.value;save()}}}};queue.append(card);void loadAndWait(false)}}
const blocked=document.getElementById('blocked');for(const c of D.blockedLeads){{const card=document.createElement('section');card.className='card blocked';card.innerHTML=`<h3>${{esc(c.id)}}</h3><div><span class="tag">${{esc(c.motionKind)}}</span><span class="tag">不可進入裁決</span></div><dl><dt>來源</dt><dd>${{esc(c.sourceHero)}} · ${{esc(c.sourceModel)}}</dd><dt>目標</dt><dd>${{esc(c.targetHero)}} · ${{esc(c.targetModel)}}</dd><dt>clip</dt><dd>${{c.clips.map(esc).join('<br>')}}</dd><dt>骨架</dt><dd>${{esc(c.skeletonCompatibility)}}</dd></dl><b>阻擋</b><ul>${{c.blockers.map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul>`;blocked.append(card)}}
document.getElementById('export').onclick=()=>{{const rows=D.candidates.map(c=>({{candidateId:c.id,decision:draft.decisions[c.id]?.decision??null,note:draft.decisions[c.id]?.note??'',runtimeBindingAuthorized:false}}));const receipt={{schema:'ggd.borrowed-motion-review-decisions@1',sourceFingerprint:D.sourceFingerprint,complete:rows.every(x=>x.decision==='approve'||x.decision==='reject'),runtimeMutationAllowed:false,decisions:rows}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)+'\\n'],{{type:'application/json'}}));a.download='borrowed-motion-review-decisions.json';a.click();URL.revokeObjectURL(a.href)}};
document.getElementById('clear').onclick=()=>{{localStorage.removeItem(storageKey);location.reload()}};renderStatus();window.__borrowedMotionReview={{contract:D,getDraft:()=>JSON.parse(JSON.stringify(draft))}};
</script></body></html>
'''


def outputs() -> tuple[str, str]:
    source = json.loads(SOURCE.read_text())
    contract = build_contract(source)
    return canonical_json(contract), build_html(contract)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    queue_text, page_text = outputs()
    if args.check:
        stale = []
        for path, expected in ((QUEUE, queue_text), (PAGE, page_text)):
            if not path.is_file() or path.read_text() != expected:
                stale.append(path.relative_to(REPO).as_posix())
        if stale:
            raise SystemExit("stale generated files: " + ", ".join(stale))
        print(f"OK borrowed-motion review: {json.loads(queue_text)['summary']}")
        return 0
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    PAGE.parent.mkdir(parents=True, exist_ok=True)
    QUEUE.write_text(queue_text)
    PAGE.write_text(page_text)
    print(f"wrote {QUEUE.relative_to(REPO)}")
    print(f"wrote {PAGE.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
