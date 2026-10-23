"""Project-authored surfaces. Photographic bark/turf are kept by fetch-surfaces.mjs."""
from pathlib import Path
import json
import math
import hashlib
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "art" / "textures"
OUT.mkdir(exist_ok=True)
catalog=ROOT/'art/surface-sources.json'
if not catalog.exists():raise RuntimeError('Run node scripts/fetch-surfaces.mjs to install the documented CC0 surfaces')
for surface in json.loads(catalog.read_text(encoding='utf-8')):
    for image in surface['maps']:
        source=ROOT/'art'/image['file']
        if not source.exists() or hashlib.sha256(source.read_bytes()).hexdigest()!=image['sha256']:
            raise RuntimeError('Missing or changed photographic surface: '+str(source)+'; run node scripts/fetch-surfaces.mjs')
N = 768
rng = np.random.default_rng(1723)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)

def noise(scale, sigma):
    values = rng.normal(128, scale, (N, N)).clip(0, 255).astype(np.uint8)
    return np.asarray(Image.fromarray(values).filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float32)/255

def save_surface(name, rgb, height, roughness, strength=2):
    Image.fromarray(np.clip(rgb,0,255).astype(np.uint8)).save(OUT/f"{name}-color.jpg", quality=94, subsampling=0)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*strength
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*strength
    normals=np.stack([-dx,dy,np.ones_like(dx)],axis=-1)
    normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
    Image.fromarray(((normals*.5+.5)*255).astype(np.uint8)).save(OUT/f"{name}-normal.png")
    Image.fromarray(np.clip(roughness*255,0,255).astype(np.uint8)).save(OUT/f"{name}-roughness.jpg",quality=95)

fine=noise(38,.4)-.5
cloud=noise(70,19)-.5
plaster=.74+fine*.18+cloud*.8
plaster_rgb=np.stack([plaster*245,plaster*242,plaster*230],axis=-1)
save_surface("plaster",plaster_rgb,plaster,.89+fine*.1,3.3)

wave=xx+8*np.sin(yy*.017)+4*np.sin(yy*.039+xx*.006)
grain=np.sin(wave*.20)+.35*np.sin(wave*.62)+.2*np.sin(wave*1.5)
wood=.73+grain*.023+fine*.065+cloud*.35
# A neutral timber map takes its species/finish colour from the material.
# Colouring both texture and material brown previously doubled the orange cast.
wood_rgb=np.stack([wood*245,wood*240,wood*230],axis=-1)
save_surface("wood",wood_rgb,wood,.8+grain*.018+fine*.10,1.4)

tile=.66+noise(65,8)*.2+fine*.28+cloud*.25
save_surface("tile",np.stack([tile*183,tile*197,tile*198],axis=-1),tile,.72+fine*.2,2.1)

stone=.72+fine*.24+cloud*.55
vein=np.abs(np.sin(xx*.018+yy*.015+noise(90,18)*15))
stone-=np.maximum(0,.07-vein)*.8
save_surface("stone",np.stack([stone*222,stone*222,stone*208],axis=-1),stone,.86+fine*.15,3.2)

brick=.72+fine*.25+cloud*.5
row=(yy//96).astype(int)
mortar=(yy%96<5)|((xx+(row%2)*96)%192<5)
brick[mortar]=.42
save_surface("brick",np.stack([brick*192,brick*200,brick*198],axis=-1),brick,.85+fine*.2,1.3)

earth=.61+fine*.3+cloud*.75
save_surface("earth",np.stack([earth*181,earth*169,earth*137],axis=-1),earth,.95+fine*.04,2.6)

paper=.88+fine*.06+noise(70,3)*.1
save_surface("paper",np.stack([paper*255,paper*249,paper*225],axis=-1),paper,.93+fine*.05,1)

# Anisotropic silk/cotton weave; fabric no longer shares paper grain.
warp=np.sin(xx*math.pi*.5);weft=np.sin(yy*math.pi*.5)
weave=.88+.025*warp+.02*weft+.008*warp*weft+fine*.025
save_surface("cloth",np.stack([weave*250,weave*249,weave*245],axis=-1),weave,.86+warp*.035+weft*.025,1.3)

# UVs run across the lamina (U) and along its petiole-to-tip axis (V).
u=xx/(N-1);v=yy/(N-1)
midrib=np.exp(-((u-.5)/.018)**2)
vein_phase=(v-abs(u-.5)*.46)*38
secondary=np.maximum(0,np.cos(vein_phase*math.tau))**20
lamina=.89+.065*np.sin(v*math.pi)-.045*abs(u-.5)+midrib*.035+secondary*.013+fine*.022
save_surface("leaf",np.stack([lamina*250,lamina*253,lamina*244],axis=-1),lamina,.79+fine*.07,1.2)

fibres=xx+1.2*np.sin(yy*.037)+.6*np.sin(yy*.071+xx*.11)
strand=.055*np.sin(fibres*1.8)+.025*np.sin(fibres*3.1)
fissures=np.maximum(0,np.cos(fibres*.69+np.sin(yy*.011))-.82)*.18
straw=.83+strand-fissures+fine*.045+cloud*.16
save_surface("thatch",np.stack([straw*249,straw*244,straw*230],axis=-1),straw,.93+fine*.035+strand*.14,2.0)
print(json.dumps({"proceduralSurfaces":10,"maps":30,"size":N,"directory":str(OUT)},ensure_ascii=False))
