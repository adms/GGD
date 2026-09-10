import json,sys
from pathlib import Path
SEVEN = {"Karthus", "LeeSin", "Lux", "MissFortune", "Warwick", "Xerath", "Yasuo"}
FETCH = {"LeeSin", "Lux", "Warwick", "Yasuo"}
def load_scope(path):
    if sys.flags.optimize: raise ValueError("Run without -O: integrity assertions are required")
    d=json.loads(Path(path).read_text())
    if (d.get("scope") != "project-seven-only" or not d.get("enabled")
        or d.get("fullRosterPipelineEnabled") is not False
        or d.get("allowedLocale") != "ja_JP" or d.get("englishEnabled") is not False
        or set(d.get("allowedDownloadNames",[])) != FETCH
        or set(d.get("allowedFreezeNames",[])) != SEVEN
        or {x["nativeId"] for x in d["heroes"]} != SEVEN
        or d.get("releaseId") != "7CAC3C60C863BF12"):
        raise ValueError("Only the fixed seven project heroes and Japanese release are authorized")
    return d
