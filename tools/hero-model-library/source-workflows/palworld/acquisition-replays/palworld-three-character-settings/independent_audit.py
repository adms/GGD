"""Independent DIV-span/raw-label audit of frozen PalDB HTML versus parsed facts.
Does not import the production parser or use its Node tree implementation.
"""
from pathlib import Path
from html.parser import HTMLParser
from html import unescape
from urllib.parse import unquote,urljoin
import json,re,hashlib,math,tempfile,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def txt(s):return re.sub(r'\s+',' ',unescape(re.sub(r'<[^>]*>',' ',s))).strip()
def attrs(s):return dict((k,unescape(v)) for k,v in re.findall(r'([\w-]+)="([^"]*)"',s))
class Spans(HTMLParser):
 def __init__(self,raw):
  super().__init__(convert_charrefs=False);self.raw=raw;self.rows=[];self.stack=[];self.lines=[0]
  for m in re.finditer('\n',raw):self.lines.append(m.end())
  self.feed(raw);assert not self.stack
 def source_pos(self):
  l,c=self.getpos();return self.lines[l-1]+c
 def handle_starttag(self,tag,aa):
  if tag!='div':return
  r={'start':self.source_pos(),'content':self.source_pos()+len(self.get_starttag_text()),'attrs':dict(aa),'parent':self.stack[-1] if self.stack else None};self.rows.append(r);self.stack.append(len(self.rows)-1)
 def handle_endtag(self,tag):
  if tag=='div':
   assert self.stack;self.rows[self.stack.pop()]['end']=self.source_pos()+len('</div>')

def section_fields(raw,sp,scope):
 result={};proof=[]
 for h in re.finditer(r'<h5\b[^>]*>(.*?)</h5>',raw,re.S):
  name=txt(h.group(1))
  if name not in ['Stats','Movement','Others'] or not scope[0]<=h.start()<scope[1]:continue
  parent=min((r for r in sp.rows if r['start']<h.start()<r['end']),key=lambda r:r['end']-r['start'])
  fields={}
  for i,row in enumerate(sp.rows):
   if not parent['start']<row['start']<parent['end'] or 'border-bottom' not in row['attrs'].get('class','').split():continue
   children=[r for r in sp.rows if r['parent']==i]
   assert len(children)>=2
   key=txt(raw[children[0]['content']:children[0]['end']-6]);value=txt(raw[children[-1]['content']:children[-1]['end']-6]);original=value
   if re.fullmatch(r'-?\d+(?:\.\d+)?',value):value=float(value) if '.' in value else int(value)
   assert key not in fields;fields[key]=value
   proof.append({'section':name,'field':key,'value':value,'sourceText':original,'line':raw[:row['start']].count('\n')+1})
  result[name]=fields
 return result,proof

acq=json.loads((ROOT/'acquisition.json').read_text());parsed=json.loads((ROOT/'parsed-character-settings.json').read_text());reports=[]
assert len(parsed['forms'])==5
for item,f in zip(acq['sources'],parsed['forms']):
 p=Path(item['localPath']);raw=p.read_text();assert p.stat().st_size==item['bytes'] and sha(p)==item['sha256'];sp=Spans(raw)
 tabs=[r for r in sp.rows if 'tab-pane' in r['attrs'].get('class','').split()];active=[r for r in tabs if 'active' in r['attrs'].get('class','').split()]
 assert len(active)<=1;scope=(active[0]['start'],active[0]['end']) if active else (0,len(raw));part=raw[scope[0]:scope[1]]
 fields,evidence=section_fields(raw,sp,scope);assert fields==f['factualFields'], ('Fields differ',item['character'],fields,f['factualFields'])
 cards=[r for r in sp.rows if scope[0]<=r['start']<scope[1] and 'activeSkill' in r['attrs'].get('class','').split()];skills=[]
 for r in cards:
  s=raw[r['content']:r['end']];link=next((m for m in re.finditer(r'<a\b([^>]*)>(.*?)</a>',s,re.S) if 'Waza%2F' in attrs(m.group(1)).get('data-hover','')),None);assert link is not None
  aa=attrs(link.group(1));level=re.search(r'Lv\.\s*(\d+)',txt(s));power=re.search(r'威力:\s*(\d+)',txt(s));cd=re.search(r'<img\b[^>]*data-bs-title="CoolTime"[^>]*>\s*:\s*<span\b[^>]*>([\d.]+)</span>',s,re.S);ranges=[unescape(v) for v in re.findall(r'data-bs-title="([^"]*Attack Range[^"]*)"',s)];assert level and power and cd and len(ranges)==1
  skills.append({'code':unquote(aa['data-hover']).split('::')[-1],'name':txt(link.group(2)),'learnedLevel':int(level[1]),'power':int(power[1]),'cooldownSeconds':float(cd[1]),'sourceRangeLabel':ranges[0],'sourceUrl':urljoin(item['url'],aa['href'])})
 assert skills==f['activeSkills'],('Skill fields differ',item['character'])
 partner=None
 for h in re.finditer(r'<h5\b[^>]*>(.*?)</h5>',raw,re.S):
  label=txt(h[1])
  if scope[0]<=h.start()<scope[1] and label.startswith('Partner Skill'):
   box=min((r for r in sp.rows if r['start']<h.start()<r['end']),key=lambda r:r['end']-r['start']);s=raw[h.end():box['end']];table=re.search(r'<table\b[^>]*>(.*?)</table>',s,re.S);tiers=[]
   if table:
    for row in re.split(r'<tr\b[^>]*>',table[1]):
     cells=re.split(r'<t[dh]\b[^>]*>',row)[1:]
     if len(cells)<2 or not txt(cells[0]).isdigit():continue
     values={}
     for d in re.finditer(r'<div\b[^>]*>(.*?)</div>',cells[1],re.S):
      pair=txt(d[1]).split()
      if len(pair)==2 and re.fullmatch(r'[A-Za-z][A-Za-z_0-9]*',pair[0]) and re.fullmatch(r'-?\d+(?:\.\d+)?',pair[1]):values[pair[0]]=float(pair[1])
     if values:tiers.append({'level':int(txt(cells[0])),'values':values})
   partner={'name':label.split(':',1)[1].strip(),'tiers':tiers}
 assert partner==f['partnerSkill'],('Partner differs',item['character'],partner,f['partnerSkill'])
 expected=10 if item['character']=='Jetragon' else 8 if item['character']=='Cattiva' or f['form']!='normal' else 0;assert len(skills)==expected
 if item['character'] in ['Jetragon','Cattiva']:assert [x['level'] for x in partner['tiers']]==[1,2,3,4,5]
 else:assert partner['tiers']==[]
 assert f['reportedGameVersion']=='v1.0.4' and 'v1.0.4' in raw
 reports.append({'character':item['character'],'form':f['form'],'sourceSha256':sha(p),'activeSkillCount':len(skills),'activeSkillsAllFieldsMatch':True,'partnerName':partner['name'],'partnerTierCount':len(partner['tiers']),'partnerTierValues':partner['tiers'],'selectedTab':active[0]['attrs'].get('id') if active else None,'excludedTabs':[r['attrs'].get('id') for r in tabs if r not in active],'fieldCounts':{k:len(v) for k,v in fields.items()},'allFieldsMatch':True,'numericFieldsChecked':sum(isinstance(x['value'],(int,float)) for x in evidence),'fieldEvidence':evidence})
assert reports[1]['selectedTab']=='搗蛋貓' and reports[1]['excludedTabs']==['搗蛋貓cache-1']
assert not parsed['originalGameDataTablesAcquired'] and not parsed['ggdHeroImplementation']
with tempfile.TemporaryDirectory(prefix='ggd-paldb-reproduce-') as td:
 reproduced=Path(td)/'parsed.json'
 subprocess.run([sys.executable,str(ROOT/'tools/parse_character_settings.py'),'--source-root',str(ROOT),'--output',str(reproduced)],check=True,capture_output=True,text=True)
 reproduced_bytes=reproduced.read_bytes()
report={'schema':'ggd.paldb.independent-settings-audit@1','pass':True,'method':'Independent stdlib DIV source-span tokenizer + raw heading/row/link labels; not production parser Node tree','parserSha256':sha(ROOT/'tools/parse_character_settings.py'),'parsedSha256':sha(ROOT/'parsed-character-settings.json'),'reproducedSha256':hashlib.sha256(reproduced_bytes).hexdigest(),'reproductionByteIdentical':(ROOT/'parsed-character-settings.json').read_bytes()==reproduced_bytes,'sourcePages':5,'characterCount':3,'formCount':5,'activeSkillRows':sum(x['activeSkillCount'] for x in reports),'partnerTierRows':sum(x['partnerTierCount'] for x in reports),'numericFieldsChecked':sum(x['numericFieldsChecked'] for x in reports),'forms':reports,'limits':['PalDB community HTML snapshots claim v1.0.4; not original game DataTables.','Astralym normal empty learnset does not imply boss has no attacks; both boss forms retained with eight skills each.','Astralym has no populated partner tiers in these source pages; only Jetragon and Cattiva have five levels.','Source movement -1 retained as sentinel, not a usable runtime speed.','No hero definition or GGD ability implementation created.']}
assert report['reproductionByteIdentical'];(ROOT/'independent-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['forms']},ensure_ascii=False,indent=2))
