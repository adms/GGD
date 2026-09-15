"""Overlay accepted MBA pilot components onto existing source identities."""
from __future__ import annotations
import hashlib
from pathlib import Path

SOURCE_ID="magical-battle-arena-complete-form-1.60-plus"

def apply_mba_pilot_overlay(data, repo):
    repo=Path(repo);report_path=repo/"materials/hero-model-library/priority-evidence/mba-unused-model-pilot-v1/report.json"
    if not report_path.is_file(): return data
    import json
    report=json.loads(report_path.read_text())
    if report.get("schema")!="ggd-mba-unused-model-pilot@1": raise ValueError("MBA pilot report schema drift")
    rows={row.get("sourceCharacterId",row["id"]):row for row in data["characters"]}
    for candidate in report["candidates"]:
        row=rows.get(candidate["sourceCharacterId"])
        if row is None: raise ValueError("MBA pilot identity missing from backlog: "+candidate["sourceCharacterId"])
        target=repo/candidate["gitPath"]
        if not target.is_file() or target.stat().st_size!=candidate["bytes"] or hashlib.sha256(target.read_bytes()).hexdigest()!=candidate["sha256"]:
            raise ValueError("MBA pilot Git model differs: "+candidate["id"])
        model={"id":candidate["id"],"library":"mba","sourceId":SOURCE_ID,"path":str(target.resolve()),"absolutePath":str(target.resolve()),"gitPath":candidate["gitPath"],"bytes":candidate["bytes"],"sha256":candidate["sha256"],"format":"glTF Binary","readiness":candidate["readiness"],"converted":True,"componentReady":True,"resourceRole":candidate["resourceRole"],"nativeAnimationCount":candidate["metrics"]["nativeClips"],"proceduralAnimationCount":0,"runtimeSelectable":False,"runtimeDropdownRegistered":False,"defaultEligible":False,"existsLocal":True,"localSizeMatches":True,"validationEvidence":candidate["conversionEvidence"],"visualEvidence":candidate["webglProofEvidence"],"missing":candidate["missing"]}
        matches=[i for i,c in enumerate(row["modelCandidates"]) if c.get("id")==model["id"]]
        if len(matches)>1: raise ValueError("duplicate MBA pilot backlog component")
        if matches: row["modelCandidates"][matches[0]]=model
        else: row["modelCandidates"].append(model)
    report_input={"path":report_path.relative_to(repo).as_posix(),"sha256":hashlib.sha256(report_path.read_bytes()).hexdigest()}
    inputs=data.setdefault("inputs",[])
    inputs[:]=[row for row in inputs if row.get("path")!=report_input["path"]]
    inputs.append(report_input)
    boundary="MBA pilot components passed policy and static visual review only; motion semantics, hero design, dropdown registration and deployment remain pending."
    boundaries=data.setdefault("boundaries",[])
    boundaries[:]=[row for row in boundaries if row!=boundary]
    boundaries.append(boundary)
    return data
