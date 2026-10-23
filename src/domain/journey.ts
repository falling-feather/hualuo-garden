import type {MemoryId} from './narrative.ts';
import type {ViewCheckpoint}from'./view.ts';

export type EncounterId=Exclude<MemoryId,'ending'>;
export type PaintingSubject='water'|'path';
export interface JourneyActions {
  painting:{subject:PaintingSubject;image:string;view?:ViewCheckpoint}|null;
  table:number;
  beside:boolean;
  cup:'waiting'|'carrying'|'wrapped';
}
export interface NarrativeProgress {
  seen:EncounterId[];
  ended:boolean;
  actions:JourneyActions;
  bookmarks:Partial<Record<MemoryId,number>>;
}
export const ENCOUNTERS:readonly EncounterId[]=['painting','banquet','tea'];
export const emptyActions=():JourneyActions=>({painting:null,table:0,beside:false,cup:'waiting'});
export function actionComplete(id:EncounterId,actions:JourneyActions){
  return id==='painting'?actions.painting!==null:id==='banquet'?actions.table>=1&&actions.beside:actions.cup==='wrapped';
}
export function completedEncounters(progress:Pick<NarrativeProgress,'seen'|'actions'>){
  return ENCOUNTERS.filter(id=>progress.seen.includes(id)&&actionComplete(id,progress.actions));
}
export function experienceText(id:EncounterId,actions:JourneyActions,afterSnow=false){
  if(id==='painting')return actions.painting
    ?`你留下了${actions.painting.subject==='water'?'亭台水光':'来时曲径'}，想让园外的人也看见。${afterSnow?'雪盖住了眼前的景，画笺保留你亲自选过的一角。':'这一景已经放入拾忆册。'}`
    :'在沁芳水边选一角园景，留给园外的人。';
  if(id==='banquet')return actions.beside
    ?`你把小桌挪近席边，并换到她这一边看过同一席饭。${afterSnow?'满堂笑声已远，小桌的距离仍被记住。':'照拂与戏弄在同一张饭桌上相遇。'}`
    :'把小桌挪近，再从刘姥姥这一边看一次席面。';
  return actions.cup==='wrapped'
    ?`你把茶杯带过了门槛，包好留给园外的人。${afterSnow?'雪后杯盏仍在，珍玩与度日的两种价值都没有被抹去。':'杯子的价值随着处境发生了变化。'}`
    :actions.cup==='carrying'?'茶杯还在手中。走到山门外的包袱旁，把它包好。':'接过这只被搁到外头的杯子，替这段记忆走到山门外。';
}
