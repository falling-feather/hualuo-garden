import type {Vec3,Landmark} from './types.ts';
import {ENCOUNTERS,emptyActions,completedEncounters} from './journey.ts';
import type {JourneyActions,NarrativeProgress,PaintingSubject,EncounterId} from './journey.ts';
import {placePoint} from './journey-places.ts';
import {isViewCheckpoint}from'./view.ts';
import type {ViewCheckpoint}from'./view.ts';

export type MemoryId='painting'|'banquet'|'tea'|'ending';
export interface MemoryPage {title:string;quote:string;reading:string;reflection:string}
export interface Memory {id:MemoryId;landmark:string;title:string;object:string;local:Vec3;arrival?:{eye:Vec3;look:Vec3};chapter:string;source:string;pages:MemoryPage[]}
export const MEMORIES:readonly Memory[]=[
  {id:'painting',landmark:'qinfang',title:'画中游',object:'临水的画笺',local:[-4,0,.75],chapter:'第四十回 · 史太君两宴大观园',source:'https://zh.wikisource.org/wiki/紅樓夢/第040回',pages:[
    {title:'比画儿还强十倍',quote:'谁知我今儿进这园一瞧，竟比那画儿还强十倍。',reading:'贾母在沁芳亭歇坐，问刘姥姥园子好不好。刘姥姥想起乡下过年买来贴的画，眼前的园子竟成了可以走进去的画。',reflection:'此刻不妨从她的目光里看园子：我们习以为常的富丽，对另一个人可能是一生难遇的世界。'},
    {title:'带一幅园子回家',quote:'怎么得有人也照着这个园子画一张，我带了家去，给他们见见。',reading:'贾母指着惜春，说这位小孙女会画。刘姥姥的愿望不只是占有眼前的好景，她还想让家里人也看见。',reflection:'图画让远处的人进入这场相遇。你留住的第一段记忆，是一种想与别人分享的惊喜。'},
    {title:'画外还有生活',quote:'等明儿叫他画一张如何？',reading:'园子暂时安静下来，亭中的一席话仍留在水边。继续走吧，席间还有另一种热闹。',reflection:'场景演绎：合笺后保留水边的画卷与暖色记忆。你可以自由选择接下来去哪里。'},
  ]},
  {id:'banquet',landmark:'qiushuang',title:'一席笑声',object:'席边的象牙箸',local:[0,-1.8,.18],chapter:'第四十回 · 史太君两宴大观园',source:'https://zh.wikisource.org/wiki/紅樓夢/第040回',pages:[
    {title:'挨近我坐',quote:'把那一张小楠木桌子抬过来，让刘亲家近我这边坐着。',reading:'早饭摆在秋爽斋的晓翠堂。贾母邀刘姥姥近坐，凤姐、鸳鸯却预先商量，要借一双沉重的筷子逗她取笑。',reflection:'照拂和戏弄同时存在于一张饭桌。先记住这一刻的亲近，再听笑声怎样响起来。'},
    {title:'满堂的笑，谁的日常',quote:'一两银子，也没听见响声儿就没了。',reading:'刘姥姥好不容易夹起鸽子蛋，蛋又滑落。众人笑得停不下来；她说起这一两银子，听见的却是另一种生活的分量。',reflection:'你可以跟着席间的人笑，也可以停一下：同一件小事，对席上的人意味着什么，对席外的人又意味着什么？'},
    {title:'她知道，也愿意成全',quote:'咱们哄着老太太开个心儿，可有什么恼的！',reading:'饭后，鸳鸯向她赔不是。刘姥姥说自己早明白了。她并非不懂这场玩笑，而是在处境中选择了自己的应对。',reflection:'场景演绎：席间的杯盏留在园中。热闹值得记住，热闹中的体谅与不对等，也一起留下。'},
  ]},
  {id:'tea',landmark:'longcui',title:'一盏茶的距离',object:'山门内的茶盏',local:[0,-3.3,.1],chapter:'第四十一回 · 栊翠庵茶品梅花雪',source:'https://zh.wikisource.org/wiki/紅樓夢/第041回',pages:[
    {title:'同一盏茶',quote:'好是好，就是淡些，再熬浓些更好了。',reading:'在栊翠庵，贾母将喝过半盏的茶递给刘姥姥。她一口喝尽，直说自己的口味。精致的品茶习惯与乡间的解渴经验，就在这一盏里相逢。',reflection:'好茶的意义并不只由器物决定。不同的生活，赋予它不同的尺度。'},
    {title:'门槛出现了',quote:'将那成窑的茶杯别收了，搁在外头去罢。',reading:'妙玉另邀宝钗、黛玉进耳房吃茶。看到刘姥姥用过的杯子，她嫌脏，要将它搁在外头。刚才的欢聚，在一个杯盏上显出边界。',reflection:'这不是对人物的一句判词。清洁、身份、趣味与自我保护交织在一起，我们才看见这座园子的复杂。'},
    {title:'杯子走出园门',quote:'不如就给那贫婆子罢，他卖了也可以度日。',reading:'宝玉建议把杯子送给刘姥姥，并交代丫头在她回家时带上。对不同的人，同一件珍玩既可能是雅趣，也可能是度日的依靠。',reflection:'场景演绎：茶盏暂留案头。记住它的两种价值，再往园子的远处走一走。'},
  ]},
  {id:'ending',landmark:'daguanlou',title:'雪中回望',object:'远处的空白画笺',local:[-25,16,2.4],arrival:{eye:[-27,18.5,4.2],look:[-25,16,3.62]},chapter:'第五回 · 《飞鸟各投林》',source:'https://zh.wikisource.org/wiki/紅樓夢/第005回',pages:[
    {title:'刚才的热闹，已经成了往事',quote:'好一似食尽鸟投林，落了片白茫茫大地真干净。',reading:'这句曲词出现在第五回，是对人物命运的预示。这里借雪作一次舞台化回望：不是重演某回中的实景，而是让刚才走过的繁盛成为记忆。',reflection:'雪将覆盖你见过的席面与花木。点击下一页，再决定是否翻过这一段时光。'},
    {title:'园子还在，人声已远',quote:'有恩的，死里逃生。',reading:'《飞鸟各投林》写尽离散，也留下“有恩”的一线。繁华会散，方才的体谅、相遇与人的尊严，并不因此没有重量。',reflection:'点“让雪落下”，此番游览便进入雪后。你仍可自由走回那张饭桌、那盏茶前，或者明确选择重新游园。'},
  ]},
];
export const memoryById=(id:MemoryId)=>MEMORIES.find(memory=>memory.id===id)!;
export function memoryPosition(memory:Memory,landmark:Pick<Landmark,'position'|'rotation'>):Vec3{
 return placePoint(memory.local,landmark);
}
export function canReachMemory(eye:Vec3,anchor:Vec3,lineOfSight:boolean) {
  return lineOfSight&&Math.hypot(eye[0]-anchor[0],eye[1]-anchor[1])<=3.8&&Math.abs(eye[2]-1.65-anchor[2])<=1.1;
}
export function validPaintingImage(image:unknown):image is string{return typeof image==='string'&&image.length<65000&&/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image);}
export function isNarrativeProgress(value:unknown):value is NarrativeProgress{
  if(!value||typeof value!=='object')return false;
  const p=value as NarrativeProgress;
  if(!Array.isArray(p.seen)||p.seen.length>3||new Set(p.seen).size!==p.seen.length||p.seen.some(id=>!ENCOUNTERS.includes(id))||typeof p.ended!=='boolean')return false;
  const a=p.actions;if(!a||typeof a!=='object'||!Number.isFinite(a.table)||a.table<0||a.table>1||typeof a.beside!=='boolean'||a.beside&&a.table<1||!['waiting','carrying','wrapped'].includes(a.cup))return false;
  if(a.painting!==null&&(!a.painting||!['water','path'].includes(a.painting.subject)||!validPaintingImage(a.painting.image)))return false;
  if(a.painting?.view!==undefined&&(!isViewCheckpoint(a.painting.view)||a.painting.view.landmark!==memoryById('painting').landmark))return false;
  if(a.painting&&!p.seen.includes('painting')||a.table>0&&!p.seen.includes('banquet')||a.cup!=='waiting'&&!p.seen.includes('tea'))return false;
  if(p.ended&&completedEncounters(p).length!==3)return false;
  if(!p.bookmarks||typeof p.bookmarks!=='object'||Array.isArray(p.bookmarks))return false;
  for(const [id,page]of Object.entries(p.bookmarks)){
    const memory=MEMORIES.find(m=>m.id===id);
    if(!memory||!Number.isInteger(page)||page<0||page>=memory.pages.length||id==='ending'&&completedEncounters(p).length!==3)return false;
  }
  return true;
}
export class NarrativeSession {
  #seen=new Set<EncounterId>();#current:MemoryId|null=null;#page=0;#ended=false;
  #actions:JourneyActions=emptyActions();#bookmarks:NarrativeProgress['bookmarks']={};
  constructor(progress?:NarrativeProgress){if(progress){if(!isNarrativeProgress(progress))throw new Error('游园记录不完整');this.#seen=new Set(progress.seen);this.#ended=progress.ended;this.#actions=structuredClone(progress.actions);this.#bookmarks={...progress.bookmarks};}}
  get canEnd(){return this.snapshot().completed.length===ENCOUNTERS.length;}
  progress():NarrativeProgress{return {seen:[...this.#seen],ended:this.#ended,actions:structuredClone(this.#actions),bookmarks:{...this.#bookmarks}};}
  snapshot(){const p=this.progress();return {...p,current:this.#current,page:this.#page,completed:completedEncounters(p)};}
  open(id:MemoryId){if(!MEMORIES.some(m=>m.id===id))throw new RangeError('未知记忆');if(id==='ending'&&!this.canEnd)throw new Error('先完成三处记忆与行动，再作回望');this.#current=id;this.#page=(id==='ending'?this.#ended:this.#seen.has(id))?0:this.#bookmarks[id]??0;}
  next(){if(!this.#current)return;this.#page=Math.min(this.#page+1,memoryById(this.#current).pages.length-1);this.#bookmarks[this.#current]=this.#page;}
  previous(){this.#page=Math.max(0,this.#page-1);if(this.#current)this.#bookmarks[this.#current]=this.#page;}
  finish(){if(!this.#current)return;const id=this.#current;if(this.#page!==memoryById(id).pages.length-1)throw new Error('请先读完这一段');if(id==='ending')this.#ended=true;else this.#seen.add(id);delete this.#bookmarks[id];this.close();}
  close(){this.#current=null;this.#page=0;}
  #requireAction(id:EncounterId){if(this.#ended)throw new Error('雪后仍可回访，重新游园才能改写经历');if(!this.#seen.has(id))throw new Error('先与这段原文相遇，再走进这一幕');}
  keepPainting(subject:PaintingSubject,image:string,view?:ViewCheckpoint){this.#requireAction('painting');if(!['water','path'].includes(subject)||!validPaintingImage(image)||view!==undefined&&(!isViewCheckpoint(view)||view.landmark!==memoryById('painting').landmark))throw new Error('画笺图像或取景无效');this.#actions.painting={subject,image,...(view?{view:structuredClone(view)}:{})};}
  moveTable(progress:number){this.#requireAction('banquet');if(!Number.isFinite(progress)||progress<0||progress>1)throw new Error('小桌距离无效');if(this.#actions.beside&&progress!==1)throw new Error('这段经历已留住，重新游园才会改变');this.#actions.table=progress;}
  sitBeside(){this.#requireAction('banquet');if(this.#actions.table<1)throw new Error('先把小桌挪近席边');this.#actions.beside=true;}
  takeCup(){this.#requireAction('tea');if(this.#actions.cup==='waiting')this.#actions.cup='carrying';}
  wrapCup(){this.#requireAction('tea');if(this.#actions.cup!=='carrying')throw new Error('先接过茶杯，再送到门外');this.#actions.cup='wrapped';}
  reset(){this.#seen.clear();this.#current=null;this.#page=0;this.#ended=false;this.#actions=emptyActions();this.#bookmarks={};}
}
