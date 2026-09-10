from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json,base64,hashlib,time,re
root=Path(__file__).resolve().parent.parent
allowed=set(["warwick","karthus","lux","yasuo","missfortune","leesin","xerath"])
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  path=self.path.split("?")[0]
  if path in ["/","/index.html","/app.js"]: file=root/"viewer"/("app.js" if path=="/app.js" else "index.html");kind="text/javascript" if path=="/app.js" else "text/html; charset=utf-8"
  elif path.startswith("/models/") and path.removeprefix("/models/").removesuffix(".glb") in allowed and path.endswith(".glb"): file=root/"converted"/Path(path).name;kind="model/gltf-binary"
  else:self.send_error(404);return
  if not file.is_file():self.send_error(404);return
  data=file.read_bytes();self.send_response(200);self.send_header("Content-Type",kind);self.send_header("Content-Length",str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  length=int(self.headers.get("Content-Length","0"))
  if self.path!="/capture" or self.headers.get("Origin")!="http://127.0.0.1:5198" or not 0<length<10000000:self.send_error(403);return
  try:
   d=json.loads(self.rfile.read(length));assert d["model"] in allowed;assert re.fullmatch(r"[a-zA-Z0-9_+.-]+",d["clip"])
   b=base64.b64decode(d.pop("dataUrl").removeprefix("data:image/png;base64,"),validate=True);assert b.startswith(b"\x89PNG\r\n\x1a\n")
   out=root/"captures";out.mkdir(exist_ok=True);stem=str(time.time_ns())+"-"+d["model"]+"-"+d["clip"]
   (out/(stem+".png")).write_bytes(b);d.update(image=stem+".png",sha256=hashlib.sha256(b).hexdigest());(out/(stem+".json")).write_text(json.dumps(d,indent=2));self.send_response(201);self.end_headers();self.wfile.write(b"saved")
  except Exception:self.send_error(422)
ThreadingHTTPServer(("127.0.0.1",5198),Handler).serve_forever()
