import './style.css';
import './story.css';
import { GardenViewer } from './scene/viewer.ts';
import { GardenAPI } from './api.ts';
import { GardenSound } from './scene/sound.ts';
import { GardenNarrative } from './scene/narrative.ts';
import { GardenGuidance } from './scene/guidance.ts';
import { Interactions } from './domain/interactions.ts';
import type { Manifest, Landmark, Vec2 } from './domain/types.ts';
import type { StateSnapshot, Weather, Season } from './domain/state.ts';

function element<T extends HTMLElement>(id:string){const value=document.getElementById(id);if(!value)throw new Error('缺少界面元素：'+id);return value as T;}
function escapeHTML(text:string){return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
const canvas=element<HTMLCanvasElement>('garden');
const errorPanel=element('error');
function showError(error:unknown) {
  console.error(error);
  element('error-text').textContent=error instanceof Error?error.message:String(error);
  errorPanel.hidden=false;
}
element('retry').addEventListener('click',()=>location.reload());

async function boot() {
  const response=await fetch('/garden.manifest.json');
  if(!response.ok)throw new Error('园景清单载入失败，请确认本地服务已完整构建。');
  const manifest=await response.json() as Manifest;
  if(manifest.schema!==1||!Array.isArray(manifest.landmarks)||!Array.isArray(manifest.worldChunks)||!manifest.terrain)throw new Error('园景清单格式不匹配，请完成本轮资产构建。');
  const viewer=new GardenViewer(canvas,manifest);
  const sound=new GardenSound();
  const interactions=new Interactions();
  const mapPanel=element('map-panel'),timePanel=element('time-panel');
  let entered=false;
  let entering:Promise<boolean>|null=null;
  let lastActive:string|null=null;
  const reading=element<HTMLDialogElement>('reading-dialog');
  const about=element<HTMLDialogElement>('about-dialog');
  function syncInput(){
    const blocked=!!document.querySelector('dialog[open], .panel:not([hidden])')||!!narrative?.traveling||!!narrative?.actionLocked;
    viewer.setInputBlocked(blocked);document.body.classList.toggle('navigation-paused',blocked);
    for(const id of ['home','journal-toggle','map-toggle','time-toggle','walk-toggle']){
      const button=element<HTMLButtonElement>(id);button.disabled=!!narrative?.staging;
      if(button.disabled)button.title='暂回园中后可使用';else button.removeAttribute('title');
    }
  }
  const enterButton=element<HTMLButtonElement>('enter');
  const ready=viewer.load((done,total)=>{
    element('progress').style.width=(done/total*100)+'%';
    element('loading-text').textContent='正在展开园景 · '+done+' / '+total;
    document.documentElement.dataset.assets=String(done);
  });
  const narrative=new GardenNarrative(viewer,interactions,sound,syncInput,id=>selectLandmark(id,'courtyard'));
  const api=window.garden=new GardenAPI(viewer,interactions,ready,narrative);
  viewer.addEventListener('error',event=>showError((event as CustomEvent).detail));
  viewer.addEventListener('detail',event=>{
    const {id,ready}=(event as CustomEvent<{id:string;ready:boolean}>).detail;
    if(id===viewer.state.snapshot().activeLandmark)element('detail-loading').hidden=ready;
  });
  const openReading=(spec:Landmark)=>{
    element('reading-chapter').textContent='《红楼梦》 · '+spec.chapter;
    element('reading-name').textContent=spec.name;
    element('reading-quote').textContent=spec.quote;
    element('reading-description').textContent=spec.description;
    element('reading-evidence').innerHTML=spec.evidence.map(text=>'<span>'+escapeHTML(text)+'</span>').join('');
    reading.showModal();
    syncInput();
  };
  for(const spec of manifest.landmarks){
    interactions.register({id:spec.id+'.reading',landmarkId:spec.id,label:'读原文 · '+spec.name,
      position:spec.views.courtyard,kind:'reading',onActivate:()=>openReading(spec)});
  }
  element('landmark-list').innerHTML=manifest.landmarks.map(spec=>
    '<button data-landmark="'+escapeHTML(spec.id)+'" title="'+escapeHTML(spec.subtitle)+'"><span>'+String(spec.order).padStart(2,'0')+'</span>'+escapeHTML(spec.name)+'</button>').join('');
  const [x0,y0,x1,y1]=manifest.bounds;
  const xy=(x:number,y:number):Vec2=>[(x-x0)/(x1-x0)*1000,1000-(y-y0)/(y1-y0)*1000];
  const path=(points:number[][])=>points.map(([x,y])=>xy(x!,y!).join(',')).join(' ');
  element('mini-map').innerHTML='<svg viewBox="0 0 1000 1000" aria-label="本作园景位置图"><rect class="map-land" x="20" y="20" width="960" height="960" rx="60"/>'+
    '<polygon class="map-water" points="'+path(manifest.water.lake)+'"/>'+
    manifest.water.rivers.map(river=>'<polyline points="'+path(river.points)+'" fill="none" stroke="#91b7b3" stroke-width="'+river.width*5+'"/>').join('')+
    manifest.paths.map(points=>'<polyline class="map-path" points="'+path(points)+'"/>').join('')+
    '<polyline id="map-guide" fill="none" stroke="#c2974e" stroke-width="6" stroke-dasharray="9 7" opacity=".8"/>'+
    manifest.landmarks.map(spec=>{const [x,y]=xy(spec.position[0],spec.position[1]);return '<g class="map-pin" data-landmark="'+spec.id+'" transform="translate('+x+','+y+')"><title>'+escapeHTML(spec.name)+'</title><circle r="33" fill="transparent" opacity="0"/><circle r="22"/><text>'+spec.order+'</text></g>';}).join('')+'<circle id="map-current" r="12" fill="#f5f0df" stroke="#874e37" stroke-width="5" visibility="hidden"><title>你在这里</title></circle></svg>';
  new GardenGuidance(viewer,narrative,xy);

  function closePanel(panel:'map'|'time'){
    element(panel+'-panel').hidden=true;
    element(panel+'-toggle').setAttribute('aria-expanded','false');
    if(panel==='map')document.body.classList.remove('map-open');
    syncInput();
  }
  function togglePanel(panel:'map'|'time'){
    const target=element(panel+'-panel');
    if(!target.hidden){closePanel(panel);return;}
    if(innerWidth<800)closePanel(panel==='map'?'time':'map');
    target.hidden=false;
    element(panel+'-toggle').setAttribute('aria-expanded','true');
    if(panel==='map')document.body.classList.add('map-open');
    syncInput();
  }
  async function enter(){
    await ready;
    if(entering)return entering;
    if(entered)return false;
    entered=true;
    element('welcome').hidden=true;
    element('poster').classList.add('loaded');
    element('caption').hidden=false;
    element('footer').hidden=false;
    document.body.classList.add('entered');
    entering=narrative.start();return entering;
  }
  async function selectLandmark(id:string,view:'overview'|'courtyard'|'interior'='courtyard'){
    await ready;
    if(!entered)await enter();
    closePanel('map');
    const walking=viewer.navigation==='walk';
    await viewer.focus(id,view);
    if(walking&&view==='courtyard'&&viewer.state.snapshot().activeLandmark===id)viewer.setNavigationMode('walk');
  }
  element('enter').addEventListener('click',async()=>{try{const resumed=await enter();if(!resumed){await selectLandmark('gate','courtyard');if(viewer.state.snapshot().activeLandmark==='gate')viewer.setNavigationMode('walk');}canvas.focus();}catch(error){showError(error);}});
  element('new-journey').addEventListener('click',async()=>{narrative.reset();entering=null;await enter();await selectLandmark('gate','courtyard');viewer.setNavigationMode('walk');canvas.focus();});
  for(const name of ['map','time'] as const)element(name+'-toggle').addEventListener('click',()=>togglePanel(name));
  document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.addEventListener('click',()=>closePanel(button.dataset.close as 'map'|'time')));
  mapPanel.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLElement>('[data-landmark]');
    if(target?.dataset.landmark)selectLandmark(target.dataset.landmark).catch(showError);
  });
  for(const id of ['home','overview'])element(id).addEventListener('click',async()=>{await enter();closePanel('map');viewer.overview();});
  element('walk-toggle').addEventListener('click',async()=>{
    await enter();
    api.setNavigationMode(viewer.diagnostics().navigation==='walk'?'orbit':'walk');
    canvas.focus();
  });
  viewer.addEventListener('navigation',event=>{
    const walk=(event as CustomEvent).detail==='walk';
    element('walk-toggle').setAttribute('aria-pressed',String(walk));
    element('control-hint').textContent=walk?'拖动转身 · WASD 行走 · E 展开记忆 · Shift 快步 · Esc 环览':'拖动环览 · 滚轮靠近 · 漫步可自由行走';
  });
  element('read').addEventListener('click',()=>{
    const id=viewer.state.snapshot().activeLandmark;
    if(id)interactions.activate(id+'.reading').catch(showError);
  });
  element('building-overview').addEventListener('click',()=>{
    const id=viewer.state.snapshot().activeLandmark;if(id)selectLandmark(id,'overview').catch(showError);
  });
  element('interior').addEventListener('click',()=>{
    const id=viewer.state.snapshot().activeLandmark;if(id)selectLandmark(id,'interior').catch(showError);
  });
  for(const id of ['reading-close','return-garden'])element(id).addEventListener('click',()=>reading.close());
  element('about').addEventListener('click',()=>{about.showModal();syncInput();});
  element('about-close').addEventListener('click',()=>about.close());
  for(const dialog of [reading,about])dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  for(const dialog of [reading,about])dialog.addEventListener('close',()=>{syncInput();canvas.focus();});
  element<HTMLInputElement>('time-range').addEventListener('input',event=>api.setTime(Number((event.target as HTMLInputElement).value)));
  document.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach(button=>button.addEventListener('click',()=>api.setTime(Number(button.dataset.hour))));
  element<HTMLInputElement>('time-playing').addEventListener('change',event=>api.setTimeFlow((event.target as HTMLInputElement).checked));
  document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(button=>button.addEventListener('click',()=>{
    const weather=button.dataset.weather as Weather;
    api.setWeather(weather);
    if(weather==='snow')api.setSeason('winter');
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-season]').forEach(button=>button.addEventListener('click',()=>api.setSeason(button.dataset.season as Season)));
  element<HTMLSelectElement>('quality').addEventListener('change',event=>api.setQuality((event.target as HTMLSelectElement).value as 'fine'|'smooth'));
  element('sound-toggle').addEventListener('click',async()=>{
    const enabled=await sound.toggle();
    element('sound-toggle').setAttribute('aria-pressed',String(enabled));
    document.documentElement.dataset.sound=enabled?'on':'off';
  });
  function quiet(value:boolean){
    document.body.classList.toggle('quiet',value);
    element('restore-ui').hidden=!value;
  }
  element('hide-ui').addEventListener('click',()=>quiet(true));
  element('restore-ui').addEventListener('click',()=>quiet(false));
  window.addEventListener('keydown',event=>{
    if(event.target instanceof HTMLInputElement||document.querySelector('dialog[open]'))return;
    if(event.code==='KeyH')quiet(!document.body.classList.contains('quiet'));
    if(event.code==='Escape'){closePanel('map');closePanel('time');quiet(false);}
  });
  const branches=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  function update(state:StateSnapshot) {
    const minutes=Math.round(state.hour*60)%1440;
    element('clock').textContent=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
    element('traditional-time').textContent=branches[Math.floor((state.hour+1)/2)%12]+'时';
    if(document.activeElement!==element('time-range'))element<HTMLInputElement>('time-range').value=String(state.hour);
    element<HTMLInputElement>('time-playing').checked=state.playing;
    document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.weather===state.weather)));
    document.querySelectorAll<HTMLButtonElement>('[data-season]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.season===state.season)));
    sound.update(state);
    if(lastActive===state.activeLandmark)return;
    lastActive=state.activeLandmark;
    const item=manifest.landmarks.find(spec=>spec.id===state.activeLandmark);
    element('caption-name').textContent=item?.name??'大观园';
    element('caption-number').textContent=item?String(item.order).padStart(2,'0'):'大观';
    element('caption-subtitle').textContent=item?.subtitle??'芳园一日';
    element('caption-quote').textContent=item?.quote??'衔山抱水建来精，多少工夫筑始成。';
    element('read').hidden=!item;element('building-overview').hidden=!item;
    element('interior').hidden=!item||['rockery','grotto','sluice'].includes(item.kind);
    element('detail-loading').hidden=!item||viewer.assets.detailLoaded(item.id);
    document.querySelectorAll<HTMLElement>('[data-landmark]').forEach(button=>button.classList.toggle('active',button.dataset.landmark===state.activeLandmark));
    document.documentElement.dataset.landmark=state.activeLandmark??'overview';
  }
  viewer.state.addEventListener('change',event=>update((event as CustomEvent<StateSnapshot>).detail));
  update(viewer.state.snapshot());
  await ready;
  enterButton.disabled=false;
  enterButton.firstElementChild!.textContent=narrative.hasSavedJourney?'继续游园':'入园';
  element('loading-text').textContent='园景已就绪';
  document.documentElement.dataset.ready='true';
}
boot().catch(showError);
