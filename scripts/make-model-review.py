"""Build a local review index and contact sheets from actual Blender renders."""
from pathlib import Path
import html
import json
import hashlib
from PIL import Image,ImageDraw,ImageFont,ImageStat

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/refinement'
plan=json.loads((ROOT/'art/garden-plan.json').read_text(encoding='utf-8'))
capture=json.loads((ROOT/'output/qa/refinement-views.json').read_text(encoding='utf-8'))
views=capture['views']
with open(ROOT/'art/scenes/daguanyuan.blend','rb') as source:
    current_hash=hashlib.file_digest(source,'sha256').hexdigest()
if not capture.get('uniformSource') or {v.get('sourceSha256') for v in views}!={current_hash}:
    raise RuntimeError('检查图尚未全部同步到当前主模型，请先完成统一近景渲染。')
names={s['id']:s['name'] for s in plan['landmarks']}
empty_frames=[]
for view in views:
    with Image.open(ROOT/view['file']) as frame:
        statistics=ImageStat.Stat(frame.convert('RGB').resize((160,120)))
    if sum(statistics.mean)<3 or max(statistics.stddev)<.5:empty_frames.append(view['id'])
if empty_frames:raise RuntimeError('检查图存在空白或黑帧：'+', '.join(empty_frames))
ordered=sorted(views,key=lambda v:(list(names).index(v['landmark']),v['id']!=v['landmark'],v['id']))
font=ImageFont.truetype('C:/Windows/Fonts/simkai.ttf',24)
sheets=[]
for page in range(0,len(ordered),4):
    count=min(4,len(ordered)-page)
    canvas=Image.new('RGB',(1440 if count>1 else 720,558*((count+1)//2)),'#eee9dc');draw=ImageDraw.Draw(canvas)
    for i,view in enumerate(ordered[page:page+4]):
        x,y=(i%2)*720,(i//2)*558
        with Image.open(ROOT/view['file']) as source:
            source.thumbnail((704,507),Image.Resampling.LANCZOS)
            canvas.paste(source,(x+8,y+8))
        draw.text((x+16,y+522),names[view['landmark']]+' · '+view['id'],font=font,fill='#263b32')
    name=f'review-{page//4+1:02}.jpg';canvas.save(OUT/name,quality=91)
    sheets.append('output/refinement/'+name)

cards=[]
for view in ordered:
    file=html.escape(Path(view['file']).name);title=html.escape(names[view['landmark']]+' · '+view['id'])
    cards.append(f'<figure><a href="{file}" target="_blank"><img loading="lazy" src="{file}" alt="{title}"></a><figcaption><b>{title}</b><span>镜头 {view["lens"]}mm · 曝光 {view.get("exposure",-.35):.2f} EV</span></figcaption></figure>')
comparisons=[]
for name in ['xiaoxiang-entry','yihong-cage','qinfang-eaves','hengwu-rock']:
    comparisons.append(f'<div class="pair"><figure><img loading="lazy" src="before-{name}.png" alt="修改前"><figcaption>修改前 · {name}</figcaption></figure><figure><img loading="lazy" src="{name}.png" alt="当前模型"><figcaption>当前模型 · {name}</figcaption></figure></div>')
document='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>花落知多少 · 模型近景检查</title><style>
*{box-sizing:border-box}body{margin:0;background:#eee9dc;color:#293b32;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1500px;margin:auto;padding:48px 24px}h1{font-family:serif;font-size:36px;letter-spacing:.12em}header p{max-width:850px}nav{display:flex;gap:24px;margin:24px 0}a{color:#365b49}.grid,.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;background:#f8f5ed;border:1px solid #d3d7c9}img{display:block;width:100%;height:auto}figcaption{padding:12px 16px;font-size:14px}figcaption span{display:block;color:#667263;font-size:12px}.pair{margin:16px 0}h2{margin-top:48px}footer{margin:36px 0;color:#667263}@media(max-width:700px){main{padding:24px 12px}.grid,.pair{grid-template-columns:1fr}h1{font-size:26px}}
</style><main><header><p>《红楼梦》数字园境 / 模型检查册</p><h1>花落知多少</h1><p>本页展示保存于 Blender 主场景的真实渲染，按单体与细部逐项查看。相机没有隐藏山石、树木或相邻建筑；室内采用注明的曝光补偿。精确坐标、比例与未写明的构件细节属于艺术补足。</p><nav><a href="#compare">前后对照</a><a href="#models">单体与细部</a><a href="http://127.0.0.1:5416/">本地游园</a></nav></header><section id="compare"><h2>前后对照</h2>'''+''.join(comparisons)+'''</section><section id="models"><h2>单体与细部</h2><div class="grid">'''+''.join(cards)+'''</div></section><footer>制作与验证方法见项目 doc/01-子文档/14-单体精修与近景检查.md。这里是固定机位检查记录，不代表全部角度均无遮挡或传统营造测绘复原。</footer></main></html>'''
(OUT/'index.html').write_text(document,encoding='utf-8')
report={'passed':True,'landmarks':len({v['landmark'] for v in views}),'views':len(views),'uniformSource':capture.get('uniformSource',False),'sourceSha256':sorted({v.get('sourceSha256','unrecorded') for v in views}),'sheets':sheets,'index':'output/refinement/index.html'}
(ROOT/'output/qa/model-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
