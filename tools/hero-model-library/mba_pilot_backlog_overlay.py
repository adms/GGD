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
    current_path=repo/"materials/asset-library/current-resources.json"
    current=json.loads(current_path.read_text()) if current_path.is_file() else {}
    archived={}
    stack=[current]
    while stack:
        value=stack.pop()
        if isinstance(value,dict):
            if value.get("id") and value.get("s3Uri"): archived[value["id"]]=value
            stack.extend(value.values())
        elif isinstance(value,list): stack.extend(value)
    if report.get("schema")!="ggd-mba-unused-model-pilot@1": raise ValueError("MBA pilot report schema drift")
    rows={row.get("sourceCharacterId",row["id"]):row for row in data["characters"]}
    for candidate in report["candidates"]:
        row=rows.get(candidate["sourceCharacterId"])
        if row is None: raise ValueError("MBA pilot identity missing from backlog: "+candidate["sourceCharacterId"])
        target=repo/candidate["gitPath"]
        if target.is_file():
            if target.stat().st_size!=candidate["bytes"] or hashlib.sha256(target.read_bytes()).hexdigest()!=candidate["sha256"]:
                raise ValueError("MBA pilot Git model differs: "+candidate["id"])
            location={"path":str(target.resolve()),"absolutePath":str(target.resolve()),"gitPath":candidate["gitPath"],"existsLocal":True,"localSizeMatches":True,"storageClass":"git"}
        else:
            receipt=archived.get(candidate["id"])
            if not receipt or receipt.get("bytes")!=candidate["bytes"] or receipt.get("sha256")!=candidate["sha256"] or receipt.get("gitTracked") is not False:
                raise ValueError("MBA pilot model is absent without a matching S3 split receipt: "+candidate["id"])
            location={"path":receipt["s3Uri"],"absolutePath":str(target.resolve()),"gitPath":candidate["gitPath"],"existsLocal":False,"localSizeMatches":False,"storageClass":receipt["storageClass"],"s3Uri":receipt["s3Uri"],"s3ArchiveMember":receipt["s3ArchiveMember"],"restorePath":receipt["restorePath"],"readbackVerified":True}
        model={"id":candidate["id"],"library":"mba","sourceId":SOURCE_ID,**location,"bytes":candidate["bytes"],"sha256":candidate["sha256"],"format":"glTF Binary","readiness":candidate["readiness"],"converted":True,"componentReady":True,"resourceRole":candidate["resourceRole"],"nativeAnimationCount":candidate["metrics"]["nativeClips"],"proceduralAnimationCount":0,"runtimeSelectable":False,"runtimeDropdownRegistered":False,"defaultEligible":False,"validationEvidence":candidate["conversionEvidence"],"visualEvidence":candidate["webglProofEvidence"],"missing":candidate["missing"]}
        matches=[i for i,c in enumerate(row["modelCandidates"]) if c.get("id")==model["id"]]
        if len(matches)>1: raise ValueError("duplicate MBA pilot backlog component")
        if matches: row["modelCandidates"][matches[0]]=model
        else: row["modelCandidates"].append(model)
    report_input={"path":report_path.relative_to(repo).as_posix(),"sha256":hashlib.sha256(report_path.read_bytes()).hexdigest()}
    inputs=data.setdefault("inputs",[])
    inputs[:]=[row for row in inputs if row.get("path")!=report_input["path"]]
    inputs.append(report_input)
    if current_path.is_file():
        current_input={"path":current_path.relative_to(repo).as_posix(),"sha256":hashlib.sha256(current_path.read_bytes()).hexdigest()}
        inputs[:]=[row for row in inputs if row.get("path")!=current_input["path"]]
        inputs.append(current_input)
    boundary="MBA pilot components passed policy and static visual review only; motion semantics, hero design, dropdown registration and deployment remain pending."
    boundaries=data.setdefault("boundaries",[])
    boundaries[:]=[row for row in boundaries if row!=boundary]
    boundaries.append(boundary)
    return data
