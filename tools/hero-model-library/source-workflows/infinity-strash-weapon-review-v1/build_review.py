#!/usr/bin/env python3
"""Build the source-pinned Infinity Strash Popp/Dai weapon review page.

The page is deliberately review-only.  It preserves Popp's already applied
Kagayaki choice and exports, at most, a Dai weapon choice for a later checked
integration step.  Independent Dai sword props remain visible but ineligible
until attachment fit is proven.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
LIBRARY = ROOT / "materials/hero-model-library"
POPP_REVIEW = LIBRARY / "infinity-strash/popp-integration-review.json"
POPP_RECEIPT = LIBRARY / "priority-evidence/infinity-strash-popp-review-decision/receipt.json"
DAI_CHAMPION = ROOT / "content/champions/godie-nbbc.json"
DAI_VALIDATION = LIBRARY / "priority-evidence/infinity-strash-texture-backdrop-decimation-v1/validation.json"
PROP_ACCEPTANCE = LIBRARY / "priority-evidence/dai-rigid-props/6a139bfad7bd211c669d3c41262ec6c7d482563496e7d4bcd22274d47209f20b/acceptance.json"
OUTPUT_JSON = LIBRARY / "infinity-strash/weapon-review.json"
OUTPUT_HTML = ROOT / "apps/client/public/infinity-strash-weapon-review.html"
OUTPUT_ASSETS = ROOT / "apps/client/public/review-assets/infinity-strash-weapons"

DAI_SPECS = (
    {
        "candidateId": "dai-pn010-02-backdrop-decimated-v1",
        "validationId": "dai-pn010-02",
        "form": "PN010/02",
        "weapon": "原作 PN010/02 裝備",
        "sourceModelKey": "community.body.bdf77de4789523c132c4e620f49ead67d70fd8374a9ed561",
        "contactSheetDirectory": LIBRARY / "priority-evidence/infinity-strash-texture-backdrop-decimation-v1/dai-pn010-02",
    },
    {
        "candidateId": "dai-pn010-05-daino-tsurugi-backdrop-decimated-v1",
        "validationId": "dai-pn010-05-daino-tsurugi",
        "form": "PN010/05",
        "weapon": "達伊之劍",
        "sourceModelKey": "community.body.5eb4e1322b17cd53b2a791af6c6728af26101c88e3b94f81",
        "contactSheetDirectory": LIBRARY / "priority-evidence/infinity-strash-texture-backdrop-decimation-v1/dai-pn010-05-daino-tsurugi",
    },
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def evidence(path: Path) -> dict[str, Any]:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def public_copy(source: Path, name: str) -> dict[str, Any]:
    source_record = (
        evidence(source)
        if source.is_relative_to(ROOT)
        else {
            "absoluteSourcePath": str(source),
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        }
    )
    return {
        **source_record,
        "publicPath": f"review-assets/infinity-strash-weapons/{name}",
    }


def find_version(champion: dict[str, Any], source_model_key: str) -> dict[str, Any]:
    rows = [row for row in champion.get("modelVersions", []) if row.get("sourceModelKey") == source_model_key]
    if len(rows) != 1:
        raise ValueError(f"expected one Dai model version for {source_model_key}, got {len(rows)}")
    return rows[0]


def build_contract() -> dict[str, Any]:
    popp = read_json(POPP_REVIEW)
    popp_receipt = read_json(POPP_RECEIPT)
    if popp.get("schema") != "ggd.popp-integration-review@1":
        raise ValueError("unexpected Popp review schema")
    if popp_receipt.get("schema") != "ggd.popp-integration-review-decision-receipt@1":
        raise ValueError("Popp decision receipt is missing")
    selected_popp = popp_receipt["ownerDecision"]["weaponCandidateId"]
    if popp["weaponReview"]["selectedCandidateId"] != selected_popp:
        raise ValueError("Popp review no longer agrees with the applied owner decision")
    if selected_popp != "infinity-strash-popp-pn020-02-kagayaki-native-v1":
        raise ValueError("the approved Popp Kagayaki choice must be preserved")

    popp_candidates = []
    for row in popp["weaponReview"]["candidates"]:
        source_sheet = ROOT / row["validation"]["reviewContactSheet"]["gitPath"]
        if sha256(source_sheet) != row["validation"]["reviewContactSheet"]["sha256"]:
            raise ValueError(f"Popp contact sheet changed: {row['candidateId']}")
        popp_candidates.append({
            "candidateId": row["candidateId"],
            "label": row["label"],
            "staff": row["staff"],
            "modelKey": row["sourceModelKey"],
            "registeredModelKey": row["registeredModelKey"],
            "binary": row["glb"],
            "nativeAnimationCount": row["nativeAnimationCount"],
            "reviewContactSheet": {
                **public_copy(source_sheet, f"popp-{row['staff'].lower()}.png"),
                "states": ["idle", "run", "attack", "cast", "hurt", "death"],
                "rowAspectRatio": "808 / 268",
                "source": "actual Babylon WebGL glTF playback",
            },
            "selectedByOwner": row["candidateId"] == selected_popp,
            "selectionLockedByReceipt": True,
        })

    champion = read_json(DAI_CHAMPION)
    validation = read_json(DAI_VALIDATION)
    if validation.get("summary", {}).get("allFormalAdoptionEligible") is not True:
        raise ValueError("Dai formal candidate validation is not accepted")
    validation_rows = {row["candidateId"]: row for row in validation["records"]}
    dai_candidates = []
    active_candidate_id = None
    for spec in DAI_SPECS:
        version = find_version(champion, spec["sourceModelKey"])
        model_doc_path = ROOT / "content/models" / f"{spec['sourceModelKey']}.json"
        model_doc = read_json(model_doc_path)
        glb_path = ROOT / "content" / model_doc["glbPath"]
        row = validation_rows[spec["validationId"]]
        if row["candidate"]["sha256"] != sha256(glb_path):
            raise ValueError(f"Dai binary changed: {spec['candidateId']}")
        if row["formalHeroAdoptionEligible"] is not True or row["khronos"]["errors"] != 0 or row["ggdUploadErrors"] != 0:
            raise ValueError(f"Dai candidate no longer passes formal gates: {spec['candidateId']}")
        if set(model_doc["clipMap"]) != {"idle", "run", "attack", "cast", "hurt", "death"}:
            raise ValueError(f"Dai clip map is incomplete: {spec['candidateId']}")
        if model_doc["clipMap"]["death"] != "GGD_native_down":
            raise ValueError(f"Dai death provenance changed: {spec['candidateId']}")
        if version["modelKey"] == champion["modelKey"]:
            active_candidate_id = spec["candidateId"]
        dai_candidates.append({
            "candidateId": spec["candidateId"],
            "form": spec["form"],
            "weapon": spec["weapon"],
            "label": version["label"],
            "sourceModelKey": spec["sourceModelKey"],
            "registeredModelKey": version["modelKey"],
            "binary": evidence(glb_path),
            "modelDocument": evidence(model_doc_path),
            "clipMap": model_doc["clipMap"],
            "nativeAnimationCount": row["animationProvenance"]["nativeClipCount"],
            "triangles": row["metrics"]["triangles"],
            "meshes": row["metrics"]["meshes"],
            "formalHeroAdoptionEligible": True,
            "reviewContactSheet": {
                "states": ["idle", "run", "attack", "cast", "hurt", "death"],
                "overviewImage": public_copy(
                    spec["contactSheetDirectory"] / "all-states-contact-sheet.png",
                    f"{spec['validationId']}.png",
                ),
                "stateImages": {
                    state: public_copy(
                        spec["contactSheetDirectory"] / f"{state}-contact-sheet.png",
                        f"{spec['validationId']}-{state}.png",
                    )
                    for state in ("idle", "run", "attack", "cast", "hurt", "death")
                },
                "rowAspectRatio": "1200 / 840",
                "source": "actual Babylon WebGL glTF source/candidate comparison; 0/50/100 percent per state",
            },
            "isCurrentRuntimeSelection": version["modelKey"] == champion["modelKey"],
            "ownerSelection": None,
        })
    if active_candidate_id is None:
        raise ValueError("current Dai runtime model is not one of the review candidates")

    prop_acceptance = read_json(PROP_ACCEPTANCE)
    if prop_acceptance.get("schema") != "ggd-weapon-component-acceptance@1":
        raise ValueError("unexpected Dai prop acceptance schema")
    proof_by_sha = {row["sha256"]: Path(row["absolutePath"]) for row in prop_acceptance["proofs"]}
    props = []
    for component in prop_acceptance["components"]:
        if component["accepted"] is not True or component["scope"] != "independent-weapon-prop":
            raise ValueError(f"Dai prop is not accepted as an independent component: {component['id']}")
        if "handheld" in component["id"]:
            wanted = ("e1aee010ff83cfed150ff24be3cc1668e8f99f432a9aca8c324fe2ac11f65f5e", "handheld-face-a.png")
        else:
            wanted = ("f83ac85eb7088c7a6b109c6b0cb4df4956faa7b30d0cc1b0a19e51c25d050011", "back-face-a.png")
        proof_path = proof_by_sha.get(wanted[0])
        if proof_path is None or not proof_path.is_file() or sha256(proof_path) != wanted[0]:
            raise ValueError(f"Dai prop proof is unavailable: {component['id']}")
        props.append({
            **component,
            "reviewImage": public_copy(proof_path, wanted[1]),
            "heroAttachmentFitVerified": False,
            "selectableAsHeroWeapon": False,
            "status": "accepted-independent-component-awaiting-character-fit",
        })

    contract: dict[str, Any] = {
        "schema": "ggd.infinity-strash-weapon-review@1",
        "workZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
        "sourceInputs": [evidence(POPP_REVIEW), evidence(POPP_RECEIPT), evidence(DAI_CHAMPION), evidence(DAI_VALIDATION), evidence(PROP_ACCEPTANCE)],
        "popp": {
            "heroId": "b2-popp",
            "nativeCharacterId": "PN020",
            "selectionStatus": "owner-selection-applied-and-locked",
            "selectedCandidateId": selected_popp,
            "candidates": popp_candidates,
            "deathPresentation": {
                "candidateId": popp_receipt["deathPresentation"]["candidateId"],
                "motion": popp_receipt["deathPresentation"]["motion"],
                "motionProvenance": popp_receipt["deathPresentation"]["motionProvenance"],
                "distinctNativeDeathClip": False,
                "status": "owner-approved-existing-runtime-bound",
                "presentation": popp_receipt["deathPresentation"]["presentation"],
                "runtimeEvidence": popp_receipt["deathPresentation"]["runtimeEvidence"],
            },
        },
        "dai": {
            "heroId": champion["id"],
            "nativeCharacterId": "PN010",
            "currentRuntimeCandidateId": active_candidate_id,
            "currentSelectionMode": champion.get("modelSelectionMode"),
            "ownerSelectedCandidateId": None,
            "automaticDefaultChangeAllowed": False,
            "selectionRule": "exactly one complete model candidate per owner decision; no generated default",
            "candidates": dai_candidates,
            "independentProps": props,
            "deathPresentation": {
                "candidateId": "dai-native-down-rise-fade-v1",
                "motion": "GGD_native_down",
                "motionProvenance": "native PN010 down pose shared by hurt/death",
                "distinctNativeDeathClip": False,
                "presentation": "existing global ChampionView corpse dissolve",
                "status": "available-policy-approved-substitution; model choice still pending owner review",
            },
        },
        "runtimeMutationAllowed": False,
        "audioOrVoiceBindingChanged": False,
        "productionDeploymentVerified": False,
    }
    fingerprint_input = json.dumps(contract, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    contract["sourceFingerprint"] = hashlib.sha256(fingerprint_input).hexdigest()
    return contract


def safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def build_html(contract: dict[str, Any]) -> str:
    data = safe_json(contract)
    fingerprint = html.escape(contract["sourceFingerprint"])
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Infinity Strash 武器與死亡演出審查</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--ok:#8bd49c;--warn:#ffc66d}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}header{{position:sticky;top:0;z-index:5;padding:14px 18px;background:#08131eee;border-bottom:1px solid var(--line)}}main{{max-width:1450px;margin:auto;padding:18px}}h1{{font-size:20px;margin:0}}h2{{margin-top:28px}}.dim{{color:var(--dim)}}.warn,.ok{{padding:10px 12px;border-radius:8px;margin:10px 0}}.warn{{border:1px solid #8d692e;background:#2c2414;color:#ffe2a6}}.ok{{border:1px solid #457d55;background:#10291a;color:#c9f6d2}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}}.card{{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px}}.card.selected{{border-color:var(--ok);box-shadow:0 0 0 1px var(--ok)}}.sheet{{width:100%;aspect-ratio:var(--row-ratio);border:1px solid var(--line);border-radius:8px;background-repeat:no-repeat;background-size:100% 600%;background-color:#101820}}.sheet[data-state=idle]{{background-position:0 0}}.sheet[data-state=run]{{background-position:0 20%}}.sheet[data-state=attack]{{background-position:0 40%}}.sheet[data-state=cast]{{background-position:0 60%}}.sheet[data-state=hurt]{{background-position:0 80%}}.sheet[data-state=death]{{background-position:0 100%}}.buttons{{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}}button,.pick{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 9px;border-radius:7px;cursor:pointer}}button.active{{border-color:var(--accent);background:#16435b}}button:disabled,input:disabled{{cursor:not-allowed;opacity:.7}}code{{font-size:11px;word-break:break-all}}.prop{{width:100%;aspect-ratio:16/9;object-fit:contain;background:#05080c;border:1px solid var(--line);border-radius:8px}}textarea{{width:100%;min-height:64px;background:#09121b;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:8px}}
</style></head><body><header><h1>Infinity Strash 武器與死亡演出審查</h1><div class="dim">資料指紋 <code>{fingerprint}</code> · 只匯出裁決，不修改 runtime</div></header><main>
<div class="ok"><b>何布／波普：</b>Kagayaki 已由使用者核准並套用，這頁鎖定該決定；Magikaru 與 Mahouno 繼續保留為後台選項。</div>
<h2>一、何布／波普 PN020 三支法杖</h2><div id="popp" class="grid"></div>
<h2>二、小呆／達伊 PN010 完整模型武器選擇</h2><div class="warn">目前 runtime 的自動候選只作現況提示，不會預填為使用者裁決。請在兩個完整、已驗收模型中只選一個；匯出仍不會直接修改角色設定。</div><div id="dai" class="grid"></div>
<h2>三、小呆獨立劍道具</h2><div class="warn">下列兩件只驗收為獨立道具，尚未完成角色掛點、比例與動作配適，因此不能和完整模型候選一起選為預設。</div><div id="props" class="grid"></div>
<h2>四、死亡演出來源</h2><div id="death" class="grid"></div>
<h2>五、匯出小呆武器裁決</h2><p id="status" class="dim"></p><textarea id="note" placeholder="選擇理由或需要調整的地方"></textarea><div class="buttons"><button id="export" disabled>下載 infinity-strash-weapon-review-decision.json</button><button id="clear">清除小呆草稿</button></div>
</main><script id="contract" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('contract').textContent),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));const key='ggd.infinity-strash-weapon-review:'+D.sourceFingerprint;let draft=JSON.parse(localStorage.getItem(key)||'{{"daiWeaponCandidateId":null,"note":""}}');
function sheetCard(c,group,locked=false){{const card=document.createElement('article');card.className='card'+(c.selectedByOwner?' selected':'');const s=c.reviewContactSheet,first=s.stateImages?.idle?.publicPath||s.publicPath;card.innerHTML=`<h3>${{esc(c.staff||c.weapon)}}</h3><p>${{esc(c.label)}}</p><div class="sheet" data-state="idle" style="--row-ratio:${{s.rowAspectRatio}};background-image:url('${{esc(first)}}');${{s.stateImages?'background-size:100% 100%;background-position:0 0':''}}"></div><div class="buttons">${{s.states.map((x,i)=>`<button class="${{i===0?'active':''}}" data-state="${{x}}">${{x}}</button>`).join('')}}${{s.overviewImage?`<a class="pick" href="${{esc(s.overviewImage.publicPath)}}" target="_blank" rel="noopener">完整六態對照圖</a>`:''}}</div><label class="pick"><input type="radio" name="${{group}}" value="${{esc(c.candidateId)}}" ${{c.selectedByOwner?'checked':''}} ${{locked?'disabled':''}}> ${{locked?(c.selectedByOwner?'已核准並鎖定':'保留候選'):'選為小呆預設完整模型'}}</label><p class="dim">${{c.nativeAnimationCount}} 段原生動作 · <code>${{esc(c.binary.sha256)}}</code>${{c.isCurrentRuntimeSelection?'<br><b>目前 runtime 自動候選（不是使用者裁決）</b>':''}}</p>`;card.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{{const frame=card.querySelector('.sheet');frame.dataset.state=b.dataset.state;if(s.stateImages){{frame.style.backgroundImage=`url('${{s.stateImages[b.dataset.state].publicPath}}')`;frame.style.backgroundPosition='0 0'}}card.querySelectorAll('[data-state]').forEach(x=>x.classList.toggle('active',x===b))}});return card}}
for(const c of D.popp.candidates)document.getElementById('popp').append(sheetCard(c,'popp',true));for(const c of D.dai.candidates)document.getElementById('dai').append(sheetCard(c,'dai'));
for(const c of D.dai.independentProps){{const x=document.createElement('article');x.className='card';x.innerHTML=`<h3>${{esc(c.id)}}</h3><img class="prop" src="${{esc(c.reviewImage.publicPath)}}" alt="${{esc(c.id)}} WebGL 證據"><p>已驗收獨立元件；角色配適：<b>尚未驗證</b></p><code>${{esc(c.sha256)}}</code>`;document.getElementById('props').append(x)}}
for(const [name,x] of [['何布／波普',D.popp.deathPresentation],['小呆／達伊',D.dai.deathPresentation]]){{const e=document.createElement('article');e.className='card';e.innerHTML=`<h3>${{name}}</h3><p><code>${{esc(x.motion)}}</code> · ${{esc(x.motionProvenance)}}</p><p>${{esc(x.presentation)}}</p><p class="dim">獨立原生 death clip：否<br>狀態：${{esc(x.status)}}</p>`;document.getElementById('death').append(e)}}
const radios=[...document.querySelectorAll('input[name=dai]')],note=document.getElementById('note'),status=document.getElementById('status'),exp=document.getElementById('export');note.value=draft.note||'';function render(){{radios.forEach(r=>r.checked=r.value===draft.daiWeaponCandidateId);document.querySelectorAll('#dai .card').forEach((c,i)=>c.classList.toggle('selected',radios[i].checked));exp.disabled=!draft.daiWeaponCandidateId;status.textContent=draft.daiWeaponCandidateId?'已選 1/1；可匯出供 checked integration 套用。':'尚未選擇；頁面不會自行替你決定。'}}function save(){{draft.note=note.value;localStorage.setItem(key,JSON.stringify(draft));render()}}radios.forEach(r=>r.onchange=()=>{{draft.daiWeaponCandidateId=r.value;save()}});note.oninput=save;document.getElementById('clear').onclick=()=>{{draft={{daiWeaponCandidateId:null,note:''}};note.value='';localStorage.removeItem(key);render()}};exp.onclick=()=>{{if(!draft.daiWeaponCandidateId)return;const out={{schema:'ggd.infinity-strash-weapon-review-decision@1',sourceFingerprint:D.sourceFingerprint,poppWeaponCandidateId:D.popp.selectedCandidateId,daiWeaponCandidateId:draft.daiWeaponCandidateId,note:draft.note,runtimeMutationAllowed:false}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\\n'],{{type:'application/json'}}));a.download='infinity-strash-weapon-review-decision.json';a.click();URL.revokeObjectURL(a.href)}};render();window.__infinityStrashWeaponReview={{contract:D,getDraft:()=>JSON.parse(JSON.stringify(draft))}};
</script></body></html>'''


def outputs() -> tuple[dict[str, Any], str]:
    contract = build_contract()
    return contract, build_html(contract)


def sync_assets(contract: dict[str, Any], check: bool) -> list[str]:
    stale = []
    rows = [c["reviewContactSheet"] for c in contract["popp"]["candidates"]]
    rows += [image for c in contract["dai"]["candidates"] for image in c["reviewContactSheet"]["stateImages"].values()]
    rows += [c["reviewContactSheet"]["overviewImage"] for c in contract["dai"]["candidates"]]
    rows += [c["reviewImage"] for c in contract["dai"]["independentProps"]]
    for row in rows:
        source = Path(row.get("absoluteSourcePath") or ROOT / row["gitPath"])
        target = ROOT / "apps/client/public" / row["publicPath"]
        if check:
            if not target.is_file() or sha256(target) != row["sha256"]:
                stale.append(target.relative_to(ROOT).as_posix())
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    return stale


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract, page = outputs()
    json_text = json.dumps(contract, ensure_ascii=False, indent=2) + "\n"
    stale = sync_assets(contract, args.check)
    if args.check:
        for path, expected in ((OUTPUT_JSON, json_text), (OUTPUT_HTML, page)):
            if not path.is_file() or path.read_text(encoding="utf-8") != expected:
                stale.append(path.relative_to(ROOT).as_posix())
        if stale:
            raise SystemExit("stale generated Infinity Strash weapon review: " + ", ".join(stale))
        print(f"OK Infinity Strash weapon review: {len(contract['popp']['candidates'])} Popp, {len(contract['dai']['candidates'])} Dai, {len(contract['dai']['independentProps'])} blocked props")
        return 0
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json_text, encoding="utf-8")
    OUTPUT_HTML.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT_JSON.relative_to(ROOT)}")
    print(f"wrote {OUTPUT_HTML.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
