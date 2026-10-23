import * as THREE from 'three';
import {MEMORIES,NarrativeSession,canReachMemory,memoryById,memoryPosition} from '../domain/narrative.ts';
import type {MemoryId,Memory} from '../domain/narrative.ts';
import type {Vec3} from '../domain/types.ts';
import type {GardenViewer} from './viewer.ts';
import type {GardenSound} from './sound.ts';
import type {Interactions} from '../domain/interactions.ts';
import {createMemoryToken} from './memory-token.ts';
import artwork from '../../public/story/credits.json';
import {JourneyStage} from './journey-stage.ts';
import {actionComplete,experienceText} from '../domain/journey.ts';
import type {EncounterId} from '../domain/journey.ts';
import {GardenSaveStore,UnsafeViewError} from '../domain/save.ts';
import type {GardenSave,SaveRead} from '../domain/save.ts';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
type Marker={memory:Memory;anchor:Vec3;position:THREE.Vector3;token:ReturnType<typeof createMemoryToken>;button:HTMLButtonElement;visible:boolean;distance:number;reachable:boolean};

export class GardenNarrative extends EventTarget {
  #viewer:GardenViewer;#sound:GardenSound;#interactions:Interactions;#refreshInput:()=>void;#navigate:(id:string)=>Promise<void>;
  #session=new NarrativeSession();#markers:Marker[]=[];#started=false;#traveling=false;#lastCheck=-Infinity;#nearest:Marker|null=null;
  #stage:JourneyStage|null=null;#store:GardenSaveStore;#saved:SaveRead;#lastSave=0;#saveKey='';#restoring=false;
  #journalPage:MemoryId='painting';
  #completedCount=0;
  #revisitingPainting=false;
  #dialog=el<HTMLDialogElement>('memory-dialog');#journal=el<HTMLDialogElement>('journal-dialog');
  #projection=new THREE.Vector3();#eye:Vec3=[0,0,0];#motion=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(viewer:GardenViewer,interactions:Interactions,sound:GardenSound,refreshInput:()=>void,navigate:(id:string)=>Promise<void>){
    super();this.#viewer=viewer;this.#interactions=interactions;this.#sound=sound;this.#refreshInput=refreshInput;this.#navigate=navigate;
    let storage:Storage|null=null;try{storage=window.localStorage;}catch{/* The explicit unavailable status is handled by the save store. */}
    this.#store=new GardenSaveStore(storage);this.#saved=this.#store.load(viewer.manifest.landmarks.map(s=>s.id),viewer.manifest.bounds);
    if(this.#saved.kind==='valid')this.#session=new NarrativeSession(this.#saved.value.narrative);
    this.#completedCount=this.#session.snapshot().completed.length;
    el('new-journey').hidden=this.#saved.kind==='empty';
    el('resume-note').textContent=this.#saved.kind==='valid'?'上次的经历与位置已留在本机。可继续游园。':this.#saved.kind==='empty'?'':this.#saved.message;
    viewer.addEventListener('ready',()=>{this.#stage=new JourneyStage(viewer,this.#session,interactions,()=>this.#changed(),this.#refreshInput,()=>this.#started);});
    for(const memory of MEMORIES){
      const landmark=viewer.manifest.landmarks.find(item=>item.id===memory.landmark)!;
      const anchor=memoryPosition(memory,landmark);
      const position=new THREE.Vector3(anchor[0],anchor[2]+1.22,-anchor[1]);
      const token=createMemoryToken(memory.id);token.group.position.copy(position);viewer.scene.add(token.group);
      const button=document.createElement('button');button.className='memory-point';button.dataset.memory=memory.id;
      button.innerHTML='<i aria-hidden="true"></i><span></span>';button.querySelector('span')!.textContent=memory.title;
      button.setAttribute('aria-label','靠近后阅读：'+memory.title);button.hidden=true;
      button.addEventListener('click',()=>{if(this.#reachable(marker))this.#activate(memory.id);else this.#toast('再靠近一些，在光点旁按 E 或点击。');});
      el('memory-points').append(button);
      const marker:Marker={memory,anchor,position,token,button,visible:false,distance:Infinity,reachable:false};this.#markers.push(marker);
      interactions.register({id:'memory.'+memory.id,landmarkId:memory.landmark,label:memory.title,position:[...memory.local],kind:'object',onActivate:()=>{
        if(!this.#started||this.#traveling||this.#dialog.open||this.#journal.open||!this.#reachable(marker))throw new Error('请先在园中走近这段记忆');
        const progress=this.#session.snapshot();if(memory.id!=='ending'&&progress.seen.includes(memory.id)&&!progress.ended&&!actionComplete(memory.id,progress.actions)){this.#stage?.begin(memory.id).catch(error=>this.#report(error));return;}
        this.#session.open(memory.id);this.#renderPage();this.#dialog.showModal();this.#refreshInput();
      }});
    }
    el('journal-toggle').addEventListener('click',()=>this.openJournal());
    el('journal-close').addEventListener('click',()=>this.#journal.close());
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-journal-tab]'))button.addEventListener('click',()=>{this.#journalPage=button.dataset.journalTab as MemoryId;this.#renderJournal();});
    el('memory-close').addEventListener('click',()=>this.#dialog.close());
    el('memory-prev').addEventListener('click',()=>{this.#session.previous();this.#renderPage();this.#persist();});
    el('memory-next').addEventListener('click',()=>{
      const state=this.#session.snapshot();if(!state.current)return;
      const memory=memoryById(state.current);
      if(state.page<memory.pages.length-1){this.#session.next();this.#renderPage();this.#persist();return;}
      const ended=state.ended;this.#session.finish();this.#dialog.close();
      if(memory.id==='ending'&&!ended)this.#end();
      else if(!this.#session.snapshot().ended){
        if(memory.id!=='ending'&&!actionComplete(memory.id,this.#session.snapshot().actions))this.#stage?.begin(memory.id).catch(error=>this.#report(error));
        else this.#toast('已留住「'+memory.title+'」'+(this.#session.canEnd?' · 远处的空白画笺亮起了。':' · 继续自由游园。'));
      }
      this.#changed();
    });
    this.#dialog.addEventListener('close',()=>{this.#session.close();this.#persist();this.#refreshInput();this.#focusCanvas();});
    this.#journal.addEventListener('close',()=>{this.#refreshInput();this.#focusCanvas();});
    el('memory-journal').addEventListener('click',()=>this.openJournal());
    el('nearby-interact').addEventListener('click',()=>{if(this.#nearest?.reachable)this.#activate(this.#nearest.memory.id);});
    el('restart-garden').addEventListener('click',()=>this.reset());
    const closePainting=()=>{this.#revisitingPainting=false;el('painting-revisit').hidden=true;document.body.classList.remove('revisiting-painting');this.#focusCanvas();};
    el('painting-revisit-close').addEventListener('click',closePainting);el('painting-revisit-return').addEventListener('click',closePainting);
    el('credits-toggle').addEventListener('click',()=>{el<HTMLDialogElement>('credits-dialog').showModal();this.#refreshInput();});
    el('credits-close').addEventListener('click',()=>el<HTMLDialogElement>('credits-dialog').close());
    el('credits-dialog').addEventListener('close',()=>this.#refreshInput());
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-reading-tab]'))button.addEventListener('click',()=>{
      const reflection=button.dataset.readingTab==='reflection';el('memory-reading').hidden=reflection;el('reflection-panel').hidden=!reflection;
      for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-reading-tab]'))tab.setAttribute('aria-pressed',String(tab===button));
    });
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-experience]'))button.addEventListener('click',()=>{const state=this.#session.snapshot();el('memory-experience').textContent=experienceText(button.dataset.experience as EncounterId,state.actions,state.ended);for(const other of document.querySelectorAll<HTMLButtonElement>('[data-experience]'))other.setAttribute('aria-pressed',String(other===button));});
    el('journal-items').addEventListener('click',event=>{
      if((event.target as Element).closest('[data-revisit-painting]')){this.revisitPainting().catch(error=>this.#report(error));return;}
      const button=(event.target as Element).closest<HTMLButtonElement>('button[data-go]');
      if(button?.dataset.go)this.goTo(button.dataset.go as MemoryId).catch(error=>this.#report(error));
      const reread=(event.target as Element).closest<HTMLButtonElement>('button[data-reread]');
      if(reread?.dataset.reread){this.#journal.close();this.#session.open(reread.dataset.reread as MemoryId);this.#renderPage();this.#dialog.showModal();this.#refreshInput();}
    });
    window.addEventListener('keydown',event=>{
      if(event.repeat||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;
      if(event.code==='Escape'&&this.#stage?.active){this.#stage.close().catch(error=>this.#report(error));return;}
      if(event.code==='KeyE'&&this.#started&&!this.#traveling&&!document.querySelector('dialog[open],.panel:not([hidden])')&&this.#stage?.handleKey()){event.preventDefault();return;}
      if(event.code==='KeyE'&&this.#started&&!viewer.inputBlocked&&viewer.navigation==='walk'){
        event.preventDefault();this.#check();if(this.#nearest?.reachable)this.#activate(this.#nearest.memory.id);
      }
    });
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')){
      const direction=button.dataset.move as 'forward'|'backward'|'left'|'right';
      button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);viewer.setMoveIntent(direction,true);});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>viewer.setMoveIntent(direction,false));
    }
    viewer.addEventListener('frame',event=>this.#frame((event as CustomEvent<{time:number}>).detail.time));
    viewer.state.addEventListener('change',()=>this.#persist(false));
    window.addEventListener('beforeunload',()=>this.#persist());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.#persist();});
    el<HTMLAnchorElement>('artist-reference').href=artwork.artistReference.url;
    el('artist-reference').textContent=artwork.artistReference.label+' ↗';
    el('artwork-note').textContent=artwork.artistReference.note;
    this.#changed();
  }
  async start(){
    if(this.#started)return false;this.#started=true;this.#restoring=true;this.#stage?.synchronize();this.#restoreWorld();el('exploration').hidden=false;
    const saved=this.#saved.kind==='valid'?this.#saved.value:null;
    try{
      if(saved){
        this.#viewer.setQuality(saved.quality);el<HTMLSelectElement>('quality').value=saved.quality;
        if(saved.narrative.ended)this.#end(false);else{this.#viewer.state.setSeason(saved.environment.season);this.#viewer.state.setWeather(saved.environment.weather);this.#viewer.state.setTime(saved.environment.hour);}
        try{await this.#viewer.restoreView(saved.view);}catch(error){
          if(!(error instanceof UnsafeViewError))throw error;
          await this.#viewer.focus('gate','courtyard');this.#viewer.setNavigationMode('walk');this.#toast('原位置暂不可站立，已回到园门；经历完整保留。');
        }
        this.#stage?.resumeCarry();this.#toast(saved.narrative.ended?'已回到雪后。经历仍在，可走回旧地重读。':saved.narrative.actions.cup==='carrying'?'茶杯仍在手中。沿引线把它送到山门外。':'已接续上次游园。原文书签与经历都保留在拾忆册。');
      }else this.#toast('WASD 走动，拖动画面转身。读一段原文，再在园中做一件事。');
    }finally{this.#restoring=false;this.#changed();}
    return !!saved;
  }
  get hasSavedJourney(){return this.#saved.kind==='valid';}
  get traveling(){return this.#traveling;}
  get actionLocked(){return !!this.#stage?.locked;}
  get staging(){return !!this.#stage?.active;}
  snapshot(){return {...this.#session.snapshot(),canEnd:this.#session.canEnd,started:this.#started,traveling:this.#traveling,sound:this.#sound.status};}
  async revisitPainting(){
    const state=this.#session.snapshot(),painting=state.actions.painting;
    if(!this.#started||this.#traveling||this.#stage?.locked)throw new Error('请先回到园中，等待抵达后再重看');
    if(!state.ended||!painting?.view)throw new Error('旧画笺仍可看图；未记录取景位置时不能代替你重建位置');
    this.#traveling=true;this.#journal.close();this.#dialog.close();this.#viewer.setInputBlocked(true);
    try{
      await this.#viewer.restoreView(painting.view);
      el<HTMLImageElement>('painting-revisit-image').src=painting.image;
      this.#revisitingPainting=true;el('painting-revisit').hidden=false;document.body.classList.add('revisiting-painting');
      this.#toast('回到当时留景的地方。画中还是秋日，眼前已经是雪色。');
    }catch(error){
      if(error instanceof UnsafeViewError)this.#toast('原取景位置暂不可站立，画笺仍完整保留；可从拾忆册看原图。');else throw error;
    }finally{this.#traveling=false;this.#refreshInput();this.#changed();this.#focusCanvas();}
  }
  openJournal(){if(!this.#started||this.#traveling||this.#stage?.locked)return;const p=this.#session.snapshot();this.#journalPage=p.ended?'ending':p.actions.cup==='carrying'?'tea':MEMORIES.find(m=>m.id!=='ending'&&!p.completed.includes(m.id))?.id??'ending';this.#renderJournal();this.#journal.showModal();this.#refreshInput();}
  async goTo(id:MemoryId){
    const marker=this.#markers.find(item=>item.memory.id===id);if(!marker)throw new RangeError('未知记忆');
    if(!this.#started||this.#traveling||this.#stage?.locked)throw new Error('请先入园，或等待当前场面结束');
    if(id==='ending'&&!this.#session.canEnd)throw new Error('先完成三处原文与行动，再作回望');
    await this.#stage?.close();
    this.#traveling=true;this.#journal.close();this.#dialog.close();this.#toast('正在前往'+this.#viewer.manifest.landmarks.find(item=>item.id===marker.memory.landmark)!.name+'…');
    this.#viewer.setInputBlocked(true);
    try{
      const arrival=marker.memory.arrival;
      if(arrival)await this.#viewer.arrive(marker.memory.landmark,arrival.eye,arrival.look);else await this.#navigate(marker.memory.landmark);
      this.#viewer.setNavigationMode('walk');this.#toast('已抵达 · 走近光点，按 E 或点击展开记忆。');
    }
    finally{this.#traveling=false;this.#refreshInput();this.#lastCheck=-Infinity;this.#focusCanvas();this.#changed();}
  }
  reset(){
    if(this.#traveling||this.#stage?.locked)return;this.#stage?.close();this.#dialog.close();this.#journal.close();const error=this.#store.clear();if(error){this.#toast(error);return;}
    this.#saved={kind:'empty'};this.#session.reset();this.#restoreWorld();this.#changed();
    this.#revisitingPainting=false;el('painting-revisit').hidden=true;document.body.classList.remove('revisiting-painting');
    this.#toast('秋日重来。三处记忆已重新展开，你可以从任何一处开始。');
    this.dispatchEvent(new Event('reset'));
  }
  #restoreWorld(){
    const state=this.#viewer.state;state.setPlaying(false);state.setSeason('autumn');state.setWeather('clear');state.setTime(9.5);
    for(const landmark of this.#viewer.manifest.landmarks)state.setLandmarkState(landmark.id,{activity:1,bloom:1});
    this.#viewer.environment.setPresence(true);this.#sound.setPresence(true);document.body.classList.remove('snow-ending');
    el('ending-note').hidden=true;this.#setTimeControls(false);
  }
  #end(animate=true){
    const state=this.#viewer.state;state.setPlaying(false);state.setTime(15);state.setSeason('winter');state.setWeather('snow');
    for(const landmark of this.#viewer.manifest.landmarks)state.setLandmarkState(landmark.id,{activity:0,bloom:0});
    this.#viewer.environment.setPresence(false);this.#sound.setPresence(false);document.body.classList.add('snow-ending');
    this.#viewer.levelView();
    el('ending-note').hidden=false;this.#setTimeControls(true);
    if(animate)el('snow-veil').animate([{opacity:0},{opacity:.72,offset:.28},{opacity:0}],{duration:this.#motion.matches?1:2600,easing:'ease-out'});
    this.#toast('园子还在，人声已远。拾忆册中的画笺，能带你重返当时取景的地方。');
  }
  #setTimeControls(disabled:boolean){
    for(const item of el('time-panel').querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button[data-hour],button[data-season],button[data-weather]'))item.disabled=disabled;
    el('time-ending-note').hidden=!disabled;
  }
  #renderPage(){
    const state=this.#session.snapshot();if(!state.current)return;
    const memory=memoryById(state.current),page=memory.pages[state.page]!;
    el('memory-location').textContent=this.#viewer.manifest.landmarks.find(item=>item.id===memory.landmark)!.name+' · '+memory.title;
    el('memory-chapter').textContent='《红楼梦》'+memory.chapter;
    el('memory-title').textContent=page.title;el('memory-quote').textContent=page.quote;
    el('memory-reading').textContent=page.reading;el('memory-reflection').textContent=page.reflection;
    el('memory-reading').hidden=false;el('reflection-panel').hidden=true;
    for(const tab of document.querySelectorAll<HTMLButtonElement>('[data-reading-tab]'))tab.setAttribute('aria-pressed',String(tab.dataset.readingTab==='story'));
    el('experience-picker').hidden=memory.id!=='ending';
    el('memory-experience').textContent=experienceText(memory.id==='ending'?'painting':memory.id,state.actions,state.ended);
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-experience]'))button.setAttribute('aria-pressed',String(button.dataset.experience==='painting'));
    el('memory-pagination').textContent=String(state.page+1).padStart(2,'0')+' / '+String(memory.pages.length).padStart(2,'0');
    el<HTMLButtonElement>('memory-prev').disabled=state.page===0;
    el('memory-next').textContent=state.page<memory.pages.length-1?'继续翻页 →':memory.id==='ending'&&!state.ended?'让雪落下':memory.id!=='ending'&&!state.ended&&!actionComplete(memory.id,state.actions)?'走进这一幕 →':'合笺回望 →';
    el<HTMLAnchorElement>('memory-source').href=memory.source;
    const image=el<HTMLImageElement>('memory-image'),art=memory.id==='ending'?null:artwork.images[memory.id];
    el('memory-art').hidden=!art;el('memory-blank').hidden=!!art;
    if(art){
      const single=art.layout==='single';image.classList.toggle('single-image',single);
      image.src=art.url;image.alt=art.alt;image.style.width=single?'100%':'300%';image.style.left=single?'0%':(-100*art.panels[state.page]!)+'%';
      el('memory-art-credit').textContent=art.credit;
      const source=el<HTMLAnchorElement>('image-source');source.hidden=!art.source;source.href=art.source||'#';
    }
    el('memory-art-error').hidden=true;
    image.onerror=()=>{el('memory-art-error').hidden=false;};
    el('memory-content').scrollTop=0;
    const recap=el('memory-recap');recap.replaceChildren();
    if(memory.id==='ending'){
      const image=state.actions.painting?.image;if(image){const picture=document.createElement('img');picture.src=image;picture.alt='你在沁芳水边亲自留下的园景';recap.append(picture);}
      for(const id of state.completed){const note=document.createElement('p');note.textContent=id==='painting'?(state.actions.painting?.subject==='water'?'留下亭台水光':'留下来时曲径'):id==='banquet'?'挪近小桌，坐到席边':'茶杯越过门槛';recap.append(note);}
    }
  }
  #renderJournal(){
    const state=this.#session.snapshot(),list=el('journal-items');list.replaceChildren();
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-journal-tab]'))button.setAttribute('aria-pressed',String(button.dataset.journalTab===this.#journalPage));
    el('journal-progress').textContent=state.ended?'雪后，经历仍在':state.completed.length+' / 3 段经历 · 原文与行动相遇';
    for(const memory of MEMORIES){
      const seen=memory.id!=='ending'&&state.seen.includes(memory.id),locked=memory.id==='ending'&&!this.#session.canEnd,complete=memory.id!=='ending'&&actionComplete(memory.id,state.actions);
      const item=document.createElement('li'),name=document.createElement('strong'),description=document.createElement('p'),go=document.createElement('button');
      item.hidden=memory.id!==this.#journalPage;item.dataset.chapter=memory.id;
      name.textContent=memory.title+(complete?' · 已经历':seen?' · 原文已读':memory.id==='ending'&&state.ended?' · 已回望':'');
      description.textContent=locked?'三处原文与行动相遇后，再去园北回望':memory.id!=='ending'&&seen?experienceText(memory.id,state.actions,state.ended):this.#viewer.manifest.landmarks.find(spec=>spec.id===memory.landmark)!.name+' · '+memory.object;
      go.textContent=locked?'尚待相遇':'到这里 →';go.dataset.go=memory.id;go.disabled=locked||this.#traveling;
      item.append(name,description,go);
      if(memory.id==='painting'&&state.actions.painting){const picture=document.createElement('img');picture.className='journal-picture';picture.src=state.actions.painting.image;picture.alt='你在沁芳留下的实际园景';item.prepend(picture);}
      if(seen||(memory.id==='ending'&&state.ended)){const read=document.createElement('button');read.textContent='重读';read.dataset.reread=memory.id;read.className='journal-reread';item.append(read);}
      if(state.ended&&(memory.id==='painting'||memory.id==='ending')&&state.actions.painting){
        if(state.actions.painting.view){const revisit=document.createElement('button');revisit.textContent='重返取景处，看旧画与眼前';revisit.dataset.revisitPainting='true';revisit.className='journal-reread';item.append(revisit);}
        else{const note=document.createElement('p');note.className='journal-footnote';note.textContent='这张早先的画笺未记录位置，原图仍保留在册中。';item.append(note);}
      }
      list.append(item);
    }
  }
  #reachable(marker:Marker){
    if(marker.memory.id==='ending'&&!this.#session.canEnd)return false;
    const p=this.#viewer.camera.position;this.#eye=[p.x,-p.z,p.y];
    return canReachMemory(this.#eye,marker.anchor,this.#viewer.collision.lineOfSight(this.#eye,[marker.anchor[0],marker.anchor[1],marker.anchor[2]+1.22]));
  }
  #activate(id:MemoryId){this.#interactions.activate('memory.'+id).catch(error=>this.#report(error));}
  #report(error:unknown){this.#toast(error instanceof Error?error.message:String(error));}
  #check(){
    const viewer=this.#viewer,p=viewer.camera.position,state=this.#session.snapshot();this.#eye=[p.x,-p.z,p.y];this.#nearest=null;
    for(const marker of this.#markers){
      const available=state.ended?marker.memory.id!=='ending'&&state.completed.includes(marker.memory.id):(marker.memory.id!=='ending'||this.#session.canEnd);
      marker.distance=Math.hypot(this.#eye[0]-marker.anchor[0],this.#eye[1]-marker.anchor[1]);
      const sight=available&&marker.distance<65&&viewer.collision.lineOfSight(this.#eye,[marker.anchor[0],marker.anchor[1],marker.anchor[2]+1.22]);
      marker.visible=sight;marker.reachable=canReachMemory(this.#eye,marker.anchor,sight);
      marker.token.group.visible=this.#started&&available&&!this.#stage?.active&&!(marker.memory.id==='tea'&&state.actions.cup==='carrying');
      marker.token.gold.color.set(state.ended?'#c4d7d3':'#e8c985');
      marker.button.classList.toggle('reachable',marker.reachable);marker.button.classList.toggle('remembered',marker.memory.id!=='ending'&&state.completed.includes(marker.memory.id));
      if(available&&sight&&(!this.#nearest||marker.distance<this.#nearest.distance))this.#nearest=marker;
    }
    const closest=this.#nearest,walking=viewer.navigation==='walk';
    el('exploration').classList.toggle('near-memory',!!closest?.reachable&&walking);
    if(walking&&!this.#traveling){
      const nearest=closest?.reachable?closest.memory.landmark:viewer.manifest.landmarks.map(spec=>({spec,distance:Math.hypot(p.x-spec.position[0],-p.z-spec.position[1])})).filter(({spec,distance})=>distance<Math.max(...spec.size)*.65+4).sort((a,b)=>a.distance-b.distance)[0]?.spec.id??null;
      if(nearest!==viewer.state.snapshot().activeLandmark)viewer.state.focus(nearest);
    }
    el('nearby-interact').hidden=!closest?.reachable||!walking;
    el('exploration-hint').textContent=state.ended?'白茫茫之后，仍可走回你记住的地方。':closest?(closest.reachable?'按 E 或点击光点 · '+closest.memory.title:'前方有一段记忆 · '+closest.memory.title+' · 约'+Math.ceil(closest.distance)+'米'):'循着金色光点慢慢走，也可打开拾忆册寻路。';
  }
  #frame(time:number){
    if(!this.#started){for(const marker of this.#markers)marker.token.group.visible=false;return;}
    if(time-this.#lastCheck>.16){this.#check();this.#lastCheck=time;}
    if(this.#revisitingPainting){
      const view=this.#session.snapshot().actions.painting?.view;
      if(view){const now=this.#viewer.viewCheckpoint(),distance=Math.hypot(...now.eye.map((n,i)=>n-view.eye[i]!)),alignment=now.direction.reduce((sum,n,i)=>sum+n*view.direction[i]!,0);
        const atView=distance<.8&&alignment>.96;el('painting-revisit-title').textContent=atView?'回到我留景的地方':'带着旧画，再看此刻';
        el('painting-revisit-note').textContent=atView?'已回到你当时站的位置与朝向。画笺保留旧日的一角，眼前仍是可行走的雪后园景。':'画笺保留当时的一角。你仍可转身、走近，将它与眼前的雪景并看。';}
    }
    if(time-this.#lastSave>2){this.#lastSave=time;const v=this.#viewer.viewCheckpoint(),key=JSON.stringify([v.eye.map(n=>Math.round(n*5)),v.direction.map(n=>Math.round(n*20))]);if(key!==this.#saveKey){this.#saveKey=key;this.#persist(false);}}
    const viewer=this.#viewer,blocked=viewer.inputBlocked;
    for(const marker of this.#markers){
      marker.token.group.position.y=marker.position.y+(this.#motion.matches?0:Math.sin(time*1.6+marker.anchor[0])*.045);
      marker.token.group.rotation.y=Math.atan2(viewer.camera.position.x-marker.position.x,viewer.camera.position.z-marker.position.z);
      marker.token.gold.opacity=.42+(this.#motion.matches?0:Math.sin(time*1.6)*.16);
      this.#projection.copy(marker.position).project(viewer.camera);
      const shown=marker.visible&&!blocked&&this.#projection.z>-1&&this.#projection.z<1&&Math.abs(this.#projection.x)<.92&&Math.abs(this.#projection.y)<.88;
      marker.button.hidden=!shown;
      if(shown)marker.button.style.transform='translate('+((this.#projection.x+1)*innerWidth/2)+'px,'+((1-this.#projection.y)*innerHeight/2)+'px) translate(-50%,-50%)';
    }
  }
  #changed(){
    this.#stage?.synchronize();
    const state=this.snapshot();document.documentElement.dataset.memories=String(state.completed.length);document.documentElement.dataset.ending=String(state.ended);
    if(this.#started&&state.completed.length>this.#completedCount)this.#sound.remember();this.#completedCount=state.completed.length;
    el('memory-count').textContent=state.ended?'雪中回望':state.completed.length+' / 3';this.#lastCheck=-Infinity;this.#persist();
    this.dispatchEvent(new CustomEvent('change',{detail:state}));
  }
  #persist(force=true){
    if(!this.#started||this.#restoring||this.#traveling)return;
    const now=performance.now();if(!force&&now-this.#lastWrite<1200)return;this.#lastWrite=now;
    const state=this.#viewer.state.snapshot();
    const save:GardenSave={schema:1,narrative:this.#session.progress(),view:this.#stage?.safeView??this.#viewer.viewCheckpoint(),environment:{hour:state.hour,season:state.season,weather:state.weather},quality:this.#viewer.diagnostics().quality,savedAt:new Date().toISOString()};
    const error=this.#store.write(save);el('save-status').textContent=error??'已保存在本机浏览器 · 刷新可继续；重新游园才会清空。';
  }
  #lastWrite=0;
  #toast(text:string){el('story-status').textContent=text;}
  #focusCanvas(){if(!document.querySelector('dialog[open]'))el('garden').focus({preventScroll:true});}
}
