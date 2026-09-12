from pathlib import Path, PurePosixPath
import collections, hashlib, json, struct, subprocess, wave, zlib

ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-psp-first-batch/gamebanana-bgm-dnf')
PAK=ROOT/'extracted/FateCodesOSTDNF_P.pak'
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(ROOT))
blob=PAK.read_bytes();magic,version,indexOffset,indexSize,indexSha=struct.unpack_from('<IIQQ20s',blob,len(blob)-44)
assert magic==0x5a6f12e1 and version==4 and indexOffset+indexSize<=len(blob)-44
index=blob[indexOffset:indexOffset+indexSize];assert hashlib.sha1(index).digest()==indexSha
cursor=0
def get(fmt):
 global cursor
 size=struct.calcsize(fmt);assert cursor+size<=len(index);value=struct.unpack_from(fmt,index,cursor);cursor+=size;return value
def string():
 global cursor
 size,=get('<i');assert 0<size<10000 and cursor+size<=len(index);b=index[cursor:cursor+size];cursor+=size;assert b[-1:]==b'\0';return b[:-1].decode('utf-8')
mount=string();count,=get('<I');assert 0<count<10000
entries=[];paths=set()
for _ in range(count):
 name=string();p=PurePosixPath(name);assert not p.is_absolute() and '..' not in p.parts and '\\' not in name and name.casefold() not in paths;paths.add(name.casefold())
 offset,size,usize,compression,h=get('<QQQI20s');assert 0<usize<256_000_000 and size>0 and offset<indexOffset and compression in (0,1)
 blocks=[]
 if compression:
  n,=get('<I');assert 0<n<10000
  blocks=[get('<QQ') for _ in range(n)]
 encrypted,blocksize=get('<BI');assert encrypted==0,'encrypted PAK is not supported'
 assert blocksize<=256_000_000
 chunks=[]
 for start,end in blocks:
  assert offset<start<end<=indexOffset;chunks.append(blob[start:end])
 if compression:
  compressed=b''.join(chunks);assert len(compressed)==size and hashlib.sha1(compressed).digest()==h
  parts=[]
  for ch in chunks:
   decoder=zlib.decompressobj();part=decoder.decompress(ch,blocksize+1);assert len(part)<=blocksize and decoder.eof and not decoder.unconsumed_tail and not decoder.unused_data;parts.append(part)
  data=b''.join(parts)
 else:
  data=blob[offset+53:offset+53+size];assert hashlib.sha1(data).digest()==h
 assert len(data)==usize
 out=ROOT/'native-unreal'/name;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data)
 entries.append({'path':rel(out),'archiveMember':name,'compressedBytes':size,'bytes':usize,'sha256':sha(out),'entrySha1Verified':True,'compression':'zlib' if compression else 'none'})
assert cursor==len(index)
save(ROOT/'native-unreal/index.json',{'schema':'ggd.unreal-pak-extraction@1','source':rel(PAK),'sha256':sha(PAK),'pakVersion':version,'mountPointMetadataOnly':mount,'entryCount':count,'indexSha1Verified':True,'entries':entries,'formatReference':'https://github.com/panzi/u4pak#file-format','safety':'Only unencrypted version 4; bounds, paths, case collisions, compressed SHA1, zlib limits and output sizes checked. No mounted path or archive program executed.'})

audio=[]
for entry in entries:
 source=ROOT/entry['path'];data=source.read_bytes();start=0;sequence=0
 while True:
  offset=data.find(b'OggS',start)
  if offset<0:break
  pos=offset;serial=None;pages=0;streamSequence=0
  while True:
   assert data[pos:pos+4]==b'OggS' and data[pos+4]==0
   flags=data[pos+5];sid,seq=struct.unpack_from('<II',data,pos+14)
   if serial is None:serial=sid;assert flags&2
   assert sid==serial and seq==streamSequence
   n=data[pos+26];end=pos+27+n+sum(data[pos+27:pos+27+n]);assert end<=len(data)
   page=bytearray(data[pos:end]);expected=struct.unpack_from('<I',page,22)[0];page[22:26]=bytes(4);crc=0
   for byte in page:
    crc^=byte<<24
    for _ in range(8):crc=((crc<<1)^0x04c11db7 if crc&0x80000000 else crc<<1)&0xffffffff
   assert crc==expected,'OGG CRC mismatch'
   pos=end;pages+=1;streamSequence+=1
   if flags&4:break
  out=ROOT/'converted/music-ogg'/(source.stem+f'-{sequence}.ogg');out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(data[offset:pos])
  pcm=ROOT/'converted/music-pcm'/(out.stem+'.wav');pcm.parent.mkdir(parents=True,exist_ok=True)
  r=subprocess.run(['/usr/local/bin/ffmpeg','-v','error','-nostdin','-i',str(out),'-map_metadata','-1','-c:a','pcm_s16le','-y',str(pcm)],capture_output=True,text=True);assert r.returncode==0 and not r.stderr,r.stderr
  with wave.open(str(pcm),'rb') as w:fields={'seconds':w.getnframes()/w.getframerate(),'frames':w.getnframes(),'sampleRate':w.getframerate(),'channels':w.getnchannels(),'sampleWidthBytes':w.getsampwidth()}
  assert fields['frames']>0
  for p,fmt in [(out,'ogg-vorbis'),(pcm,'wav-pcm')]:audio.append({'path':rel(p),'bytes':p.stat().st_size,'sha256':sha(p),**fields,'format':fmt,'classification':'music-mod-source-labelled','sourceNativePath':entry['path'],'nativeByteOffset':offset,'nativeByteLength':pos-offset,'oggPages':pages,'oggCrc':'all-pages-pass','fullDecode':'pass','cueSemantics':'Original UE SoundCue/uasset files retained; no intro/loop stitching inferred.'})
  sequence+=1;start=pos
save(ROOT/'audioFileIndex.json',{'schema':'ggd.audio-file-index.intake@1','localRoot':str(ROOT),'sourceId':'gamebanana-fate-bgm-dnf-62195','sourceGame':'Fate/unlimited codes','sourcePlatform':'unknown','modTarget':'PC / DNF Duel','author':'Jon-Nobo','audioGroups':[{'id':'fate-bgm-mod','heroIds':[],'classification':'music','pathPrefixes':['converted/music-ogg/','converted/music-pcm/'],'voiceUse':False}],'files':audio,'uniqueStreams':len(audio)//2,'totalPcmSeconds':sum(a['seconds'] for a in audio if a['format']=='wav-pcm'),'voiceFiles':0,'synthesisReady':False})
save(ROOT/'candidate-manifest.json',{'schema':'ggd.model-candidates.intake@1','localRoot':str(ROOT),'candidates':[],'reason':'BGM-only MOD, no character models.'})
save(ROOT/'validation.json',{'sourceId':'gamebanana-fate-bgm-dnf-62195','acquisition':json.loads((ROOT/'acquisition.json').read_text()),'safeZipExtraction':'all path/link/size checks and ZIP CRC passed','pakVersion':version,'nativeFileCount':count,'nativeFormats':dict(collections.Counter(Path(e['path']).suffix for e in entries)),'indexSha1Verified':True,'entrySha1Verified':True,'encryption':False,'oggStreams':len(audio)//2,'audioValidation':'Every OGG page CRC, sequence, BOS/EOS checked; FFmpeg fully decoded each stream to PCM16 WAV.','voiceFiles':0,'modelCount':0,'animationCount':0,'vfxCount':0,'freezeStatus':'complete-frozen','limitations':['Music-only subset arranged for DNF Duel.','Original PSP versus PS2 source platform not established.','Original game SoundCue relationships cannot be inferred from cue names alone.']})
byPath={a['path']:a for a in audio};files=[]
for p in sorted(ROOT.rglob('*')):
 if p.is_file() and p.name!='files.sha256.json':
  row={'path':rel(p),'bytes':p.stat().st_size,'sha256':sha(p)}
  if row['path'] in byPath:row['seconds']=byPath[row['path']]['seconds']
  files.append(row)
save(ROOT/'files.sha256.json',{'schema':'ggd.source-files.intake@1','localRoot':str(ROOT),'files':files,'freezeStatus':'complete-frozen'})
print(json.dumps({'localRoot':str(ROOT),'audioFileIndex':str(ROOT/'audioFileIndex.json'),'audioIndexSha256':sha(ROOT/'audioFileIndex.json'),'fileManifest':str(ROOT/'files.sha256.json'),'fileManifestSha256':sha(ROOT/'files.sha256.json'),'nativeEntries':count,'uniqueMusicStreams':len(audio)//2,'seconds':sum(a['seconds'] for a in audio if a['format']=='wav-pcm')},ensure_ascii=False,indent=2))
