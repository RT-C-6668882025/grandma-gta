import json,struct,sys
for f in sys.argv[1:]:
  b=open(f,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; g=json.loads(b[20:20+L])
  mn=[1e9]*3; mx=[-1e9]*3
  for m in g['meshes']:
    for p in m['primitives']:
      a=g['accessors'][p['attributes']['POSITION']]
      mn=[min(x,y) for x,y in zip(mn,a['min'])]; mx=[max(x,y) for x,y in zip(mx,a['max'])]
  anims=[a.get('name') for a in g.get('animations',[])]
  sk=len(g.get('skins',[]))
  print(f.split('/')[-1], 'size', [round(x-y,2) for x,y in zip(mx,mn)], 'min',[round(x,2) for x in mn], 'skins',sk, anims[:6], round(len(b)/1e6,1),'MB')
